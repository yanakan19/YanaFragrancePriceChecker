import type { Retailer } from '../src/types/retailer.js';
import type { ShippingReading } from '../src/catalogue/shippingTerms.js';
import { sanitiseQuote } from '../src/catalogue/shippingRegistryPatch.js';

/**
 * The monthly delivery re-check: has what a shop's own delivery page says
 * moved away from what `src/config/retailers.ts` records?
 *
 * ── How this differs from shipping discovery ─────────────────────────────────
 * scripts/shipping-discover.ts (and src/catalogue/shippingRegistryPatch.ts)
 * answer "may we *write* `confirmed` for this shop?", which has to be strict:
 * any ambiguity on the page blocks the write. This answers a different,
 * looser question once a month for every enabled shop with listings: "does the
 * page still carry the figures we hold?". The page reading itself is the same
 * code — `readShippingTerms` from shippingTerms.ts, fed by the same robots.txt
 * handling and the same HTTP client — only the verdict differs.
 *
 * ── What this never does ─────────────────────────────────────────────────────
 * It never edits the registry. A misread delivery charge would change every
 * delivered price for that shop, and the extractor is a set of regexes over
 * prose. "changed" means "a human should read this page", nothing more; the
 * workflow turns it into a GitHub issue for exactly that.
 *
 * ── The comparison, in one place ─────────────────────────────────────────────
 * Rather than requiring the page's single best-guess figure to equal the
 * registry's (which turns every page listing several services into noise),
 * this asks whether the recorded figure is *among* the figures the page
 * names. A page that lists £3.95 standard and £5.95 for Europe still carries
 * £3.95, so the UK rate has not moved. A page that names charges and none of
 * them is the recorded one is a change. A page that names no charge at all is
 * not a change — it is a page this tool could not read, which is a different
 * thing and reported as such.
 *
 * Kept free of network and filesystem access so all of it is unit-tested.
 * Lives in scripts/ rather than src/catalogue/ because nothing here belongs
 * in the browser bundle, and every file under src/ is an input to the
 * demo build's freshness hash (scripts/demoInputsHash.ts).
 */

export type RecheckStatus = 'same' | 'changed' | 'blocked' | 'unreadable';

/** A hand-verified figure this many days old is flagged in the report. */
export const VERIFIED_STALE_DAYS = 60;

/** What the registry holds for one shop, as the report shows it. */
export interface RecordedDelivery {
  standardGbp: number | null;
  freeOverGbp: number | null;
  standardRateNotPublished: boolean;
  verifiedAt: string;
  confidence: 'confirmed' | 'unverified';
}

export interface RecheckTarget {
  retailerId: string;
  name: string;
  /** The page to read, or null when the registry records none. */
  url: string | null;
  recorded: RecordedDelivery;
}

/** What one fetch of a shop's delivery page came back as. */
export type PageFetch =
  | { kind: 'no-url' }
  | { kind: 'robots-disallowed' }
  | { kind: 'robots-unreachable' }
  | { kind: 'response'; status: number; ok: boolean; body: string; error?: string };

export interface FoundDelivery {
  /** The standard charge read, or null when the page named none. */
  standardGbp: number | null;
  /** The free-delivery threshold read, or null when the page named none. */
  freeOverGbp: number | null;
  /** Every non-upgrade standard charge the page named. */
  standardCandidates: number[];
  /** Every non-upgrade free-delivery threshold the page named. */
  thresholdCandidates: number[];
  /** The page describes delivery as free with no spend condition. */
  freeUnconditional: boolean;
}

export interface RecheckRow {
  retailerId: string;
  name: string;
  url: string | null;
  recorded: RecordedDelivery;
  found: FoundDelivery | null;
  status: RecheckStatus;
  /** One line a human can act on. */
  reason: string;
  /** Up to three sentences the figures were read from. */
  evidence: string[];
  httpStatus: number | null;
  verifiedAgeDays: number | null;
  /** `verifiedAt` is older than VERIFIED_STALE_DAYS. Flag only, never a failure. */
  stale: boolean;
}

export interface RecheckReport {
  checkedAt: string;
  /** YYYY-MM, the month this check belongs to. */
  month: string;
  staleAfterDays: number;
  summary: Record<RecheckStatus, number> & { shops: number; stale: number };
  rows: RecheckRow[];
}

/** Amounts are compared to the penny; floats from a regex can carry noise. */
const PENNY = 0.005;
const sameAmount = (a: number, b: number) => Math.abs(a - b) < PENNY;
const includesAmount = (list: readonly number[], n: number) => list.some((x) => sameAmount(x, n));

/**
 * The delivery page of each enabled shop whose rule carries no `source`,
 * because the figure could not be quoted off the page itself — it refuses a
 * plain fetch, or was read through search-engine extracts. Each URL is the
 * one the shop's own registry comment in src/config/retailers.ts names as the
 * page re-checked by hand on 2026-10-01.
 *
 * Only an address, never evidence: nothing here confirms a figure. When a
 * shop gains a `shipping.source`, its `url` wins and the entry here is
 * ignored (and tests/deliveryRecheck.test.ts asks for it to be removed).
 */
export const UNQUOTED_DELIVERY_PAGES: Readonly<Record<string, string>> = {
  'notino-uk': 'https://www.notino.co.uk/shipping-info/',
  boots: 'https://www.boots.com/shopping/delivery-information',
  'the-fragrance-shop': 'https://www.thefragranceshop.co.uk/delivery',
  'the-perfume-shop': 'https://www.theperfumeshop.com/delivery-information',
  superdrug: 'https://www.superdrug.com/delInfo',
  selfridges: 'https://www.selfridges.com/GB/en/info/dispatch-delivery/uk-delivery/',
  'harvey-nichols': 'https://www.harveynichols.com/info/help/delivery-help/uk-delivery/',
  riiffs: 'https://uk.riiffsperfumes.com/policies/shipping-policy',
  'emirates-oud': 'https://emiratesoud.co.uk/policies/shipping-policy',
  zara: 'https://www.zara.com/uk/en/help-center/DeliveryMethods',
};

/** The page the re-check reads for a shop: its quoted source first. */
export function recheckUrl(
  retailer: Pick<Retailer, 'id' | 'shipping'>,
  pages: Readonly<Record<string, string>> = UNQUOTED_DELIVERY_PAGES,
): string | null {
  return retailer.shipping.source?.url ?? pages[retailer.id] ?? null;
}

/**
 * Every enabled shop with at least one listing, in registry order.
 *
 * A disabled shop, or one with nothing on the site, cannot put a wrong
 * delivered price in front of anyone, so it is not worth a request.
 */
export function recheckTargets(
  retailers: readonly Retailer[],
  listingCount: (retailerId: string) => number,
): RecheckTarget[] {
  return retailers
    .filter((r) => r.enabled && listingCount(r.id) > 0)
    .map((r) => ({
      retailerId: r.id,
      name: r.name,
      url: recheckUrl(r),
      recorded: {
        standardGbp: r.shipping.standardGbp,
        freeOverGbp: r.shipping.freeOverGbp,
        standardRateNotPublished: r.shipping.standardRateNotPublished === true,
        verifiedAt: r.shipping.verifiedAt,
        confidence: r.shipping.confidence,
      },
    }));
}

/** Whole days from `verifiedAt` to `today` (both ISO dates), or null if unparseable. */
export function ageInDays(verifiedAt: string, today: string): number | null {
  const from = Date.parse(`${verifiedAt.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

/** Status codes that mean "the shop would not let us read", not "no such page". */
const BLOCKING_STATUSES = new Set([401, 403, 407, 429, 451, 503]);

/**
 * Bot-challenge and captcha interstitials seen from this project's own runs:
 * Imperva/Incapsula ("Pardon Our Interruption", or an `_Incapsula_Resource`
 * iframe saying "Request unsuccessful" — Boots, 2026-10-01), SiteGround
 * (`sgcaptcha`, Riiffs), Cloudflare, DataDome, PerimeterX, Akamai ("Access
 * Denied").
 *
 * Only consulted when the page yielded no delivery terms at all — a real
 * delivery page can carry a reCAPTCHA script for its contact form, and that
 * must not turn a readable page into a "blocked" one.
 */
const CHALLENGE_MARKERS =
  /_incapsula_resource|request unsuccessful|sgcaptcha|captcha-delivery|px-captcha|cf-chl|challenge-platform|just a moment\.\.\.|attention required|pardon our interruption|access denied|are you a robot|verify you are human|datadome/i;

/** Why a response is a block rather than a page, or null when it is not. */
export function blockReason(status: number, body: string): string | null {
  if (status === 0) return 'no answer (timeout or connection refused)';
  if (BLOCKING_STATUSES.has(status)) return `HTTP ${status} — the shop refused the request`;
  const marker = CHALLENGE_MARKERS.exec(body);
  if (marker) return `HTTP ${status} with a bot challenge / captcha page ("${marker[0]}")`;
  return null;
}

/**
 * A threshold only counts as a free-delivery threshold here when its own
 * sentence says free. On a page whose URL names delivery the extractor admits
 * bare "over £30" sentences as thresholds (see ExtractOptions.deliveryPage),
 * which is right for confirming a figure and wrong for alarming a human: the
 * first live run read Morrisons' "£5 off your first 3 orders *min spend £30"
 * as a new free-delivery threshold.
 */
const SAYS_FREE = /\bfree\b|complimentary|no (?:delivery|shipping) charge/i;

/** "£7.50", "£ 7.50", "£80", "£80.00" — the ways a page writes a recorded amount. */
function amountPattern(n: number): RegExp {
  const whole = Number.isInteger(n);
  const body = whole ? `${n}(?:\\.00?)?` : n.toFixed(2).replace('.', '\\.');
  return new RegExp(`£\\s?${body}(?![\\d]|\\.\\d)`);
}

/**
 * Whether a delivery sentence on the page still carries `amount`.
 *
 * The guard against the extractor's commonest misread. Escentric Molecules'
 * page says "complimentary delivery on orders of £80 or more, and £7.50 on
 * orders under £80"; the extractor takes £80 as the charge. The recorded
 * £7.50 is right there in the same sentence, so the page has not changed —
 * the reading has. Only non-upgrade sentences count, so an express price that
 * happens to equal the old standard rate cannot mask a change.
 */
export function pageStillMentions(reading: ShippingReading, amount: number, freeOnly = false): boolean {
  const re = amountPattern(amount);
  return reading.claims.some((c) => !c.isUpgradeTier && (!freeOnly || SAYS_FREE.test(c.evidence)) && re.test(c.evidence));
}

/** The figures a page reading supports, independent of the registry. */
export function foundFrom(reading: ShippingReading): FoundDelivery {
  const distinct = (xs: number[]) =>
    xs.filter((x, i) => xs.findIndex((y) => sameAmount(x, y)) === i).sort((a, b) => a - b);
  const standardCandidates = distinct(
    reading.claims
      .filter((c) => c.kind === 'standard-cost' && !c.isUpgradeTier && c.amountGbp > 0)
      .map((c) => c.amountGbp),
  );
  const thresholdCandidates = distinct(
    reading.claims
      .filter((c) => c.kind === 'free-threshold' && !c.isUpgradeTier && SAYS_FREE.test(c.evidence))
      .map((c) => c.amountGbp),
  );
  return {
    standardGbp: reading.standardGbp,
    freeOverGbp: reading.freeOverGbp,
    standardCandidates,
    thresholdCandidates,
    freeUnconditional: reading.claims.some((c) => c.kind === 'free-unconditional' && !c.isUpgradeTier),
  };
}

type Part = 'same' | 'changed' | 'not-found';

const gbp = (n: number | null) => (n === null ? 'none' : n === 0 ? 'free' : `£${n.toFixed(2)}`);

/**
 * Compare what the page names with what the registry holds.
 *
 * Returns the status plus a `found` whose headline figures are the recorded
 * ones when the page carries them, so the report shows "£3.95 → £3.95" for a
 * page that also lists a European rate, not a misleading "£3.95 → £2.50".
 */
export function compareDelivery(
  recorded: RecordedDelivery,
  reading: ShippingReading,
): { status: RecheckStatus; reason: string; found: FoundDelivery } {
  const page = foundFrom(reading);
  const S = page.standardCandidates;
  const P = page.thresholdCandidates;
  const R = recorded.standardGbp;
  const T = recorded.freeOverGbp;

  if (reading.claims.length === 0) {
    return {
      status: 'unreadable',
      reason: 'page fetched but no delivery terms recognised (moved, or drawn by script)',
      found: page,
    };
  }

  // ── standard charge ──
  let standard: Part;
  let foundStandard: number | null;
  if (R === null) {
    // We hold no rate. A page that now names one is news; one that names none
    // is consistent with what we hold.
    standard = S.length > 0 ? 'changed' : 'same';
    foundStandard = S.length > 0 ? (page.standardGbp ?? S[0]!) : null;
  } else if (R === 0) {
    if (S.length > 0) {
      standard = 'changed';
      foundStandard = page.standardGbp ?? S[0]!;
    } else if (page.freeUnconditional) {
      standard = 'same';
      foundStandard = 0;
    } else {
      standard = 'not-found';
      foundStandard = null;
    }
  } else if (includesAmount(S, R) || pageStillMentions(reading, R)) {
    standard = 'same';
    foundStandard = R;
  } else if (S.length > 0) {
    standard = 'changed';
    foundStandard = page.standardGbp ?? S[0]!;
  } else {
    standard = 'not-found';
    foundStandard = null;
  }

  // ── free-delivery threshold ──
  let threshold: Part;
  let foundThreshold: number | null;
  if (R === 0 && standard === 'same') {
    // Always-free shop, and the page still says free: a threshold elsewhere on
    // the page (international, say) cannot make delivery cost more here.
    threshold = 'same';
    foundThreshold = T;
  } else if (T !== null && (includesAmount(P, T) || pageStillMentions(reading, T, true))) {
    threshold = 'same';
    foundThreshold = T;
  } else if (P.length === 0) {
    threshold = T === null ? 'same' : 'not-found';
    foundThreshold = null;
  } else {
    threshold = 'changed';
    foundThreshold = page.freeOverGbp !== null && includesAmount(P, page.freeOverGbp) ? page.freeOverGbp : P[0]!;
  }

  const found: FoundDelivery = { ...page, standardGbp: foundStandard, freeOverGbp: foundThreshold };

  const changes: string[] = [];
  if (standard === 'changed') {
    changes.push(
      `standard delivery: recorded ${gbp(R)}, page names ${S.map((n) => gbp(n)).join(' / ')}`,
    );
  }
  if (threshold === 'changed') {
    changes.push(`free over: recorded ${gbp(T)}, page names ${P.map((n) => gbp(n)).join(' / ')}`);
  }
  if (changes.length > 0) return { status: 'changed', reason: changes.join('; '), found };

  if (standard === 'not-found') {
    return {
      status: 'unreadable',
      reason:
        `page read but names no standard charge to compare with the recorded ${gbp(R)}` +
        (threshold === 'same' ? ` (free-over ${gbp(T)} still matches)` : ''),
      found,
    };
  }

  const stdWords = R === null ? 'no standard rate' : gbp(R);
  return {
    status: 'same',
    reason:
      threshold === 'not-found'
        ? `page still says ${stdWords}; free-over ${gbp(T)} not restated there`
        : `page still says ${stdWords}${T !== null && R !== 0 ? `, free over ${gbp(T)}` : ''}`,
    found,
  };
}

/** Pick the sentences worth quoting: the ones holding the figures that decided the row. */
function evidenceFor(reading: ShippingReading): string[] {
  const usable = reading.claims.filter((c) => !c.isUpgradeTier);
  const ordered = [
    ...usable.filter((c) => c.kind === 'standard-cost'),
    ...usable.filter((c) => c.kind !== 'standard-cost'),
  ];
  return [...new Set(ordered.map((c) => sanitiseQuote(c.evidence)))].slice(0, 3);
}

/**
 * Turn one shop's fetch into its report row.
 *
 * `read` is the extraction (readShippingTerms in production), passed in so a
 * test can feed a fixed reading without an HTML fixture when it wants to.
 */
export function recheckShop(
  target: RecheckTarget,
  fetched: PageFetch,
  read: (html: string, url: string) => ShippingReading,
  today: string,
): RecheckRow {
  const verifiedAgeDays = ageInDays(target.recorded.verifiedAt, today);
  const base = {
    retailerId: target.retailerId,
    name: target.name,
    url: target.url,
    recorded: target.recorded,
    verifiedAgeDays,
    stale: verifiedAgeDays !== null && verifiedAgeDays > VERIFIED_STALE_DAYS,
  };
  const row = (
    status: RecheckStatus,
    reason: string,
    extra: Partial<Pick<RecheckRow, 'found' | 'evidence' | 'httpStatus'>> = {},
  ): RecheckRow => ({ ...base, found: null, evidence: [], httpStatus: null, ...extra, status, reason });

  if (fetched.kind === 'no-url' || target.url === null) {
    return row(
      'unreadable',
      'no delivery page recorded (shipping.source, or UNQUOTED_DELIVERY_PAGES in scripts/deliveryRecheck.ts)',
    );
  }
  if (fetched.kind === 'robots-disallowed') return row('blocked', 'robots.txt disallows the delivery page — not fetched');
  if (fetched.kind === 'robots-unreachable') {
    return row('blocked', 'robots.txt could not be read (server error or no answer) — not fetched');
  }

  if (!fetched.ok) {
    // A missing page is a page that moved, whatever its error body looks like.
    if (fetched.status === 404 || fetched.status === 410) {
      return row('unreadable', `HTTP ${fetched.status} — the recorded page has moved or gone`, { httpStatus: fetched.status });
    }
    const blocked = blockReason(fetched.status, fetched.body);
    if (blocked) return row('blocked', blocked + (fetched.error ? ` (${fetched.error.slice(0, 80)})` : ''), { httpStatus: fetched.status || null });
    return row('unreadable', `HTTP ${fetched.status} — the recorded page may have moved`, { httpStatus: fetched.status });
  }

  const reading = read(fetched.body, target.url);
  if (reading.claims.length === 0) {
    const blocked = blockReason(fetched.status, fetched.body);
    if (blocked) return row('blocked', blocked, { httpStatus: fetched.status });
  }
  const verdict = compareDelivery(target.recorded, reading);
  return row(verdict.status, verdict.reason, {
    found: verdict.found,
    evidence: evidenceFor(reading),
    httpStatus: fetched.status,
  });
}

export function buildRecheckReport(rows: readonly RecheckRow[], checkedAt: string): RecheckReport {
  const count = (s: RecheckStatus) => rows.filter((r) => r.status === s).length;
  return {
    checkedAt,
    month: checkedAt.slice(0, 7),
    staleAfterDays: VERIFIED_STALE_DAYS,
    summary: {
      shops: rows.length,
      same: count('same'),
      changed: count('changed'),
      blocked: count('blocked'),
      unreadable: count('unreadable'),
      stale: rows.filter((r) => r.stale).length,
    },
    rows: [...rows],
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : month;
}

export function issueTitle(report: Pick<RecheckReport, 'month'>): string {
  return `Delivery prices changed: ${monthLabel(report.month)}`;
}

/** Markdown table cells cannot hold a pipe or a newline. */
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function recordedCell(r: RecordedDelivery): string {
  const std = r.standardGbp === null ? (r.standardRateNotPublished ? 'not published' : 'unknown') : gbp(r.standardGbp);
  return r.freeOverGbp === null ? std : `${std}, free over ${gbp(r.freeOverGbp)}`;
}

function foundCell(row: RecheckRow): string {
  if (!row.found) return '—';
  const std = row.found.standardGbp === null ? 'no rate named' : gbp(row.found.standardGbp);
  return row.found.freeOverGbp === null ? std : `${std}, free over ${gbp(row.found.freeOverGbp)}`;
}

function linkCell(row: RecheckRow): string {
  return row.url ? `[page](${row.url})` : '—';
}

/** docs/DELIVERY-RECHECK.md: the whole month at a glance. */
export function renderRecheckMarkdown(report: RecheckReport): string {
  const s = report.summary;
  const lines = [
    '# Delivery price re-check',
    '',
    `Generated by \`npm run delivery:recheck\` (.github/workflows/delivery-recheck.yml) on ${report.checkedAt.slice(0, 10)}. ` +
      'Do not edit by hand — the next run overwrites it. The registry (`src/config/retailers.ts`) is never edited by this check: ' +
      '"changed" means a human should read the page and update the figure.',
    '',
    `**${monthLabel(report.month)}:** ${s.shops} shops — ${s.same} same, ${s.changed} changed, ` +
      `${s.blocked} blocked, ${s.unreadable} unreadable. ${s.stale} not re-verified by hand in over ${report.staleAfterDays} days.`,
    '',
    '| Shop | Recorded | Found | Status | Note | Source |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.rows.map(
      (r) =>
        `| ${cell(r.name)} | ${cell(recordedCell(r.recorded))} | ${cell(foundCell(r))} | ` +
        `${r.status === 'changed' ? '**changed**' : r.status} | ${cell(r.reason)} | ${linkCell(r)} |`,
    ),
    '',
  ];
  const stale = report.rows.filter((r) => r.stale);
  lines.push(`## Not re-verified by hand in over ${report.staleAfterDays} days`, '');
  if (stale.length === 0) {
    lines.push('None.', '');
  } else {
    for (const r of stale) lines.push(`- ${r.name} — verifiedAt ${r.recorded.verifiedAt} (${r.verifiedAgeDays} days)`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * The GitHub issue body, or null when nothing changed (no issue is opened).
 *
 * Carries a hidden marker with the month, so the workflow can find this
 * month's issue again and update it rather than open a second one.
 */
export function renderIssueBody(report: RecheckReport): string | null {
  const changed = report.rows.filter((r) => r.status === 'changed');
  if (changed.length === 0) return null;
  const lines = [
    `<!-- delivery-recheck:${report.month} -->`,
    `The monthly delivery re-check on ${report.checkedAt.slice(0, 10)} found ${changed.length} shop(s) whose own ` +
      'delivery page no longer carries the figures recorded in `src/config/retailers.ts`.',
    '',
    'Nothing was changed automatically. For each one, open the page, read the standard delivery charge and the ' +
      'free-delivery threshold yourself, and update the shop\'s `shipping` block (figures, `verifiedAt`, `source`) by hand. ' +
      'If the page still agrees with the registry, the reading below was a misread and needs no action.',
    '',
    '| Shop | Recorded | Found | What differs | Source |',
    '| --- | --- | --- | --- | --- |',
    ...changed.map(
      (r) =>
        `| ${cell(r.name)} (\`${r.retailerId}\`) | ${cell(recordedCell(r.recorded))} | ${cell(foundCell(r))} | ` +
        `${cell(r.reason)} | ${r.url ? `[${cell(r.url)}](${r.url})` : '—'} |`,
    ),
    '',
  ];
  for (const r of changed) {
    if (r.evidence.length === 0) continue;
    lines.push(`**${r.name}** — what the page says:`, '');
    for (const e of r.evidence) lines.push(`> ${e}`, '');
  }
  const s = report.summary;
  lines.push(
    `Whole month: ${s.same} same, ${s.changed} changed, ${s.blocked} blocked, ${s.unreadable} unreadable — ` +
      'see `docs/DELIVERY-RECHECK.md` and `data/delivery-recheck-report.json`.',
    '',
  );
  return lines.join('\n');
}
