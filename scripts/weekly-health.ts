/**
 * Weekly health summary (.github/workflows/weekly-health.yml).
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo npx tsx scripts/weekly-health.ts
 *
 * Writes a Markdown summary to the job summary ($GITHUB_STEP_SUMMARY, else
 * stdout), headed by a ranked list of the week's worst cases an agent can work
 * from: which shops answered the last harvest, were not reached, hit their time
 * budget or errored; each shop's share of shown listings over 24 and 48 hours
 * old; products with no photo (per shop, and the 20 most stocked without one);
 * which of the 200 most stocked products open the fallback Fragrantica search;
 * the deploy output's size against DEPLOY_BUDGET_BYTES (from the live site's
 * build-state.json, which the deploy writes); the slowest crawl run of the week
 * against the crawl job's limit; how each workflow did over the last 7 days
 * (runs, failures, median / 90th percentile / longest minutes); and whether the
 * Supabase project answers a read. It commits
 * nothing and sends nothing: no email. docs/FUTUREPROOFING-PLAN.md C1, A6, E1.
 *
 * The Supabase read uses the project URL and the anon key that already ship
 * inside every page (demo/supabase.ts, protected by Row Level Security); it
 * reads one row of `profiles`, which an anonymous caller gets as an empty list.
 * No secret is used. Its purpose is to keep a free project from pausing.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseReport, renderFindings, type SoftTestReport } from './softTestReport.js';

export type Fetch = typeof fetch;

export interface ShopRow {
  retailerId: string;
  priced: number;
  errorCount: number;
  errors: string[];
}
export interface FreshnessRow {
  shown: number;
  over24h?: number;
  over48h: number;
  answered: boolean;
  /** 'feed' or 'import' for a shop the sweep never asks (src/catalogue/harvestReport.ts ReportedFreshness). */
  source?: 'feed' | 'import';
}
export interface HarvestLite {
  finishedAt?: string;
  complete?: boolean;
  endedReason?: string;
  notReached?: string[];
  shops: ShopRow[];
  freshness: Record<string, FreshnessRow>;
  /** The sweep's parallel groups (src/catalogue/harvestGroups.ts), when it ran as groups. */
  groups?: { group: number; minutes: number | null; shops: number; stoppedOnBudget: string[] }[];
}
export interface ShopSummary {
  total: number;
  answered: number;
  silent: { id: string; shown: number }[];
  /** Shops read from a feed or an import: judged by the age of their listings, never by whether the sweep got an answer. */
  feeds: { id: string; source: 'feed' | 'import'; shown: number; over48h: number }[];
  timeBudget: string[];
  errored: { id: string; count: number; first: string }[];
  stale: { id: string; over48h: number; shown: number }[];
  notReached: string[];
}

const TIME_BUDGET = /exceeded this shop's time budget/i;
/** The live site, whose build-state.json the deploy writes (scripts/deploy-decision.mjs record). */
const SITE = 'https://pricesniffs.space';
/** The crawl's workflow name (.github/workflows/catalogue-daily.yml). */
export const CRAWL_WORKFLOW = 'Catalogue crawl';

/** The rule: what the last harvest report says about each shop. Pure. */
export function summariseShops(report: HarvestLite): ShopSummary {
  const fresh = report.freshness ?? {};
  const ids = new Set<string>([...Object.keys(fresh), ...report.shops.map((s) => s.retailerId)]);
  const notReached = new Set(report.notReached ?? []);
  const swept = [...ids].filter((id) => !fresh[id]?.source);
  // A shop the sweep ran out of time before asking was not silent, it was not asked (that is its own line).
  const silent = swept
    .filter((id) => fresh[id] && !fresh[id]!.answered && !notReached.has(id))
    .map((id) => ({ id, shown: fresh[id]!.shown }))
    .sort((a, b) => b.shown - a.shown);
  const feeds = [...ids]
    .filter((id) => fresh[id]?.source)
    .map((id) => ({ id, source: fresh[id]!.source!, shown: fresh[id]!.shown, over48h: fresh[id]!.over48h }))
    .sort((a, b) => b.shown - a.shown);
  const timeBudget = report.shops.filter((s) => s.errors.some((e) => TIME_BUDGET.test(e))).map((s) => s.retailerId);
  const errored = report.shops
    .filter((s) => s.errorCount > 0)
    .map((s) => ({ id: s.retailerId, count: s.errorCount, first: (s.errors.find((e) => !TIME_BUDGET.test(e)) ?? s.errors[0] ?? '').slice(0, 110) }))
    .sort((a, b) => b.count - a.count);
  const stale = [...ids]
    .filter((id) => fresh[id] && fresh[id]!.over48h > 0)
    .map((id) => ({ id, over48h: fresh[id]!.over48h, shown: fresh[id]!.shown }))
    .sort((a, b) => b.over48h - a.over48h);
  return {
    total: swept.length,
    answered: swept.filter((id) => fresh[id]?.answered).length,
    silent,
    feeds,
    timeBudget,
    errored,
    stale,
    notReached: report.notReached ?? [],
  };
}

/** One shop's shown listings by age, from the harvest report's freshness. */
export interface FreshShare {
  id: string;
  shown: number;
  over24h: number;
  over48h: number;
  /** Shares of `shown`, 0 to 1. */
  share24: number;
  share48: number;
}

/** Every shop with listings shown: what share of them are over 24 and over 48 hours old, the stalest first. Pure. */
export function summariseFreshness(report: Pick<HarvestLite, 'freshness'>): FreshShare[] {
  return Object.entries(report.freshness ?? {})
    .filter(([, f]) => f.shown > 0)
    .map(([id, f]) => {
      const over24h = Math.max(f.over24h ?? 0, f.over48h);
      return { id, shown: f.shown, over24h, over48h: f.over48h, share24: over24h / f.shown, share48: f.over48h / f.shown };
    })
    .sort((a, b) => b.share48 - a.share48 || b.share24 - a.share24 || b.shown - a.shown || a.id.localeCompare(b.id));
}

/** A product as the photo and link checks read it, in the site's most stocked order. */
export interface ProductLite {
  brand: string;
  name: string;
  /** The shops listing it. */
  shops: string[];
  hasPhoto: boolean;
  /** Whether its Fragrantica link is its own page (false: the fallback search link). */
  fragranticaDirect: boolean;
}

export interface PhotoSummary {
  products: number;
  withoutPhoto: number;
  /** Per shop: products it lists, and how many of them have no photo; most without first. */
  perShop: { id: string; listed: number; withoutPhoto: number }[];
  /** The most stocked products without a photo. */
  mostStocked: { brand: string; name: string; shops: number }[];
}

/** Products with no photo, per shop and the most stocked of them (one per brand and name). Pure. */
export function summarisePhotos(products: readonly ProductLite[], top = 20): PhotoSummary {
  const per = new Map<string, { listed: number; withoutPhoto: number }>();
  for (const p of products) {
    for (const id of new Set(p.shops)) {
      const row = per.get(id) ?? { listed: 0, withoutPhoto: 0 };
      row.listed += 1;
      if (!p.hasPhoto) row.withoutPhoto += 1;
      per.set(id, row);
    }
  }
  const without = products.filter((p) => !p.hasPhoto);
  return {
    products: products.length,
    withoutPhoto: without.length,
    perShop: [...per].map(([id, r]) => ({ id, ...r })).filter((r) => r.withoutPhoto > 0).sort((a, b) => b.withoutPhoto - a.withoutPhoto || a.id.localeCompare(b.id)),
    mostStocked: onePerScent(without)
      .map((p, i) => ({ p, i, shops: new Set(p.shops).size }))
      .sort((a, b) => b.shops - a.shops || a.i - b.i)
      .slice(0, top)
      .map(({ p, shops }) => ({ brand: p.brand, name: p.name, shops })),
  };
}

/** Of the `top` most stocked scents (the list comes in that order; one per brand and name), those whose Fragrantica link is the fallback search. Pure. */
export function summariseLinks(products: readonly ProductLite[], top = 200): { checked: number; fallback: { brand: string; name: string; shops: number }[] } {
  const head = onePerScent(products).slice(0, top);
  return {
    checked: head.length,
    fallback: head.filter((p) => !p.fragranticaDirect).map((p) => ({ brand: p.brand, name: p.name, shops: new Set(p.shops).size })),
  };
}

/** The deploy output's size as the last deploy recorded it (its build-state.json), against the budget. */
export interface DeploySize {
  bytes: number | null;
  budget: number;
  builtAt?: string;
}

/**
 * The crawl's time limit: the limits of the jobs it runs one after another added
 * (prepare, the sweep groups, crawl: since 22 Oct 2026 the sweep is its own job,
 * src/catalogue/harvestGroups.ts), or, for a workflow of one job, the largest job level `timeout-minutes`. Pure.
 */
export function crawlLimitFrom(workflowYaml: string): number | null {
  const of = (job: string): number | null => {
    const block = new RegExp(`^ {2}${job}:\\n([\\s\\S]*?)(?=^ {2}[A-Za-z0-9_-]+:\\n|(?![\\s\\S]))`, 'm').exec(workflowYaml)?.[1];
    const m = block ? /^ {4}timeout-minutes: *(\d+)/m.exec(block) : null;
    return m ? Number(m[1]) : null;
  };
  const chain = ['prepare', 'sweep', 'crawl'].map(of);
  if (chain.every((n): n is number => n !== null)) return chain.reduce((a, b) => a + b, 0);
  const limits = [...workflowYaml.matchAll(/^ {4}timeout-minutes: *(\d+)/gm)].map((m) => Number(m[1]));
  return limits.length ? Math.max(...limits) : null;
}

/** The longest completed run of one workflow, in minutes, cancelled ones included (a run cut off at its limit is one). Pure. */
export function slowestRun(runs: readonly RunLite[], workflow: string): { minutes: number; startedAt: string; conclusion: string | null } | null {
  let best: { minutes: number; startedAt: string; conclusion: string | null } | null = null;
  for (const r of runs) {
    if (r.workflow !== workflow || r.status !== 'completed' || r.conclusion === 'skipped') continue;
    const minutes = Math.max(0, (Date.parse(r.updatedAt) - Date.parse(r.startedAt)) / 60000);
    if (!best || minutes > best.minutes) best = { minutes, startedAt: r.startedAt, conclusion: r.conclusion };
  }
  return best;
}

export interface WorstCaseInput {
  shops: ShopSummary | null;
  freshness: FreshShare[] | null;
  photos: PhotoSummary | null;
  links: ReturnType<typeof summariseLinks> | null;
  deploy: DeploySize | null;
  crawl: { slowest: ReturnType<typeof slowestRun>; limit: number | null } | null;
  runs: WorkflowStat[] | null;
  /** data/soft-test-report.json: what the crawl's soft data checks found in its last run. */
  soft?: SoftTestReport | null;
}

const pct = (x: number): string => (x > 0 && x < 0.01 ? 'under 1%' : `${Math.round(x * 100)}%`);
/** In MB of 1,048,576 bytes, as the build prints the budget (scripts/leafPages.ts). */
const mb = (b: number): string => `${(b / 1048576).toFixed(1)} MB`;
const scentKey = (p: { brand: string; name: string }): string => `${p.brand.toLowerCase()}\u0000${p.name.toLowerCase()}`;
/** The first of each brand and name: one row per scent, whatever its sizes. */
function onePerScent<T extends { brand: string; name: string }>(list: readonly T[]): T[] {
  const seen = new Set<string>();
  return list.filter((p) => !seen.has(scentKey(p)) && Boolean(seen.add(scentKey(p))));
}

/**
 * The week's worst cases, worst first, one line each an agent can act on. A
 * shop that did not answer or was not reached outranks one that is only slow;
 * a deploy or a crawl near its limit outranks stale prices; photos and links
 * come last. Within a kind, the bigger the share or the count, the higher. Pure.
 */
export function worstCases(input: WorstCaseInput, max = 12): string[] {
  const out: { score: number; line: string }[] = [];
  const add = (score: number, line: string) => out.push({ score, line });
  const s = input.shops;
  if (s) {
    for (const x of s.silent) {
      if (x.shown > 0) add(100 + Math.min(9, x.shown / 1000), `Shop \`${x.id}\` did not answer the last harvest; ${x.shown} of its listings are shown from older reads.`);
      else add(45, `Shop \`${x.id}\` did not answer the last harvest (nothing of it is shown).`);
    }
    for (const x of s.feeds ?? []) {
      if (x.source === 'feed' && x.over48h > 0) add(90, `Feed shop \`${x.id}\` shows ${x.over48h} of ${x.shown} listings last confirmed over 48 hours ago: the feed sync is not keeping up.`);
    }
    if (s.notReached.length) add(95, `${s.notReached.length} ${s.notReached.length === 1 ? 'shop' : 'shops'} not reached in the last sweep: ${s.notReached.map((id) => `\`${id}\``).join(', ')}.`);
    if (s.timeBudget.length) add(85, `${s.timeBudget.length} ${s.timeBudget.length === 1 ? 'shop' : 'shops'} stopped on the time budget, part of the listings unread: ${s.timeBudget.map((id) => `\`${id}\``).join(', ')}.`);
  }
  const d = input.deploy;
  if (d && d.bytes !== null && d.bytes >= 0.85 * d.budget) {
    add(d.bytes >= 0.95 * d.budget ? 98 : 80, `The deploy output is ${mb(d.bytes)} of the ${mb(d.budget)} budget (${pct(d.bytes / d.budget)}): the next pages will not fit.`);
  }
  const c = input.crawl;
  if (c?.slowest && c.limit) {
    const share = c.slowest.minutes / c.limit;
    if (share >= 0.85) add(share >= 0.98 ? 97 : 82, `The slowest crawl run took ${Math.round(c.slowest.minutes)} of its ${c.limit} minutes (${pct(share)}, ${c.slowest.conclusion ?? 'unknown'}): shrink or split a stage.`);
  }
  for (const f of input.soft?.findings ?? []) add(55, `Soft data check \`${f.check}\` (${f.file}) found something in the last crawl: ${f.message.slice(0, 120)}`);
  for (const r of input.runs ?? []) if (r.failed > 0) add(60 + Math.min(19, r.failed), `Workflow "${r.workflow}" failed ${r.failed} of ${r.runs} runs this week.`);
  for (const f of input.freshness ?? []) {
    // A few old listings in a big shop (under 2%) are a straggler, not a stale shop: last.
    if (f.share48 >= 0.02) add(50 + 30 * f.share48, `Shop \`${f.id}\`: ${pct(f.share48)} of its ${f.shown} shown listings are over 48 hours old (${pct(f.share24)} over 24 hours).`);
    else if (f.over48h > 0) add(10, `Shop \`${f.id}\`: ${f.over48h} of its ${f.shown} shown listings are over 48 hours old.`);
    else if (f.share24 >= 0.5) add(35 + 10 * f.share24, `Shop \`${f.id}\`: ${pct(f.share24)} of its ${f.shown} shown listings are over 24 hours old.`);
  }
  for (const p of input.photos?.perShop ?? []) {
    const share = p.withoutPhoto / p.listed;
    if (share >= 0.1 && p.withoutPhoto >= 10) add(25 + 10 * share, `Shop \`${p.id}\`: ${p.withoutPhoto} of the ${p.listed} products it lists have no photo.`);
  }
  const l = input.links;
  if (l && l.fallback.length > 0) {
    add(20 + Math.min(9, l.fallback.length / 10), `${l.fallback.length} of the ${l.checked} most stocked products open a Fragrantica search, not their own page (first: ${l.fallback.slice(0, 3).map((x) => `${x.brand} ${x.name}`).join(', ')}).`);
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.line);
}

export interface RunLite {
  workflow: string;
  status: string;
  conclusion: string | null;
  startedAt: string;
  updatedAt: string;
}
export interface WorkflowStat {
  workflow: string;
  runs: number;
  failed: number;
  cancelled: number;
  medianMin: number;
  p90Min: number;
  maxMin: number;
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i]!;
}

/** Runs per workflow: counts and duration percentiles in minutes. Pure. */
export function summariseRuns(runs: RunLite[]): WorkflowStat[] {
  const by = new Map<string, RunLite[]>();
  for (const r of runs) {
    if (r.status !== 'completed') continue;
    by.set(r.workflow, [...(by.get(r.workflow) ?? []), r]);
  }
  const out: WorkflowStat[] = [];
  for (const [workflow, list] of by) {
    const mins = list
      .filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped')
      .map((r) => Math.max(0, (Date.parse(r.updatedAt) - Date.parse(r.startedAt)) / 60000))
      .sort((a, b) => a - b);
    out.push({
      workflow,
      runs: list.length,
      failed: list.filter((r) => r.conclusion && FAILED.has(r.conclusion)).length,
      cancelled: list.filter((r) => r.conclusion === 'cancelled').length,
      medianMin: Math.round(percentile(mins, 0.5)),
      p90Min: Math.round(percentile(mins, 0.9)),
      maxMin: Math.round(mins[mins.length - 1] ?? 0),
    });
  }
  return out.sort((a, b) => b.maxMin - a.maxMin);
}

export interface Ping {
  status: number | null;
}

/** One anonymous read of one row; any 2xx means the project is awake. */
export async function pingSupabase(url: string, key: string, doFetch: Fetch = fetch): Promise<Ping> {
  try {
    const res = await doFetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    return { status: res.status };
  } catch {
    return { status: null };
  }
}

/** The URL and anon key the pages ship with, read from the source text. */
export function supabaseConfigFrom(source: string): { url: string; key: string } | null {
  const url = /SUPABASE_URL: string = '([^']+)'/.exec(source)?.[1];
  const key = /SUPABASE_ANON_KEY: string =\s*'([^']+)'/.exec(source)?.[1];
  return url && key ? { url, key } : null;
}

const list = (xs: string[], max = 12) => (xs.length ? xs.slice(0, max).join(', ') + (xs.length > max ? `, and ${xs.length - max} more` : '') : 'none');

export interface RenderInput {
  shops: ShopSummary | null;
  harvest: HarvestLite | null;
  runs: WorkflowStat[] | null;
  ping: Ping | null;
  now: Date;
  freshness?: FreshShare[] | null;
  photos?: PhotoSummary | null;
  links?: ReturnType<typeof summariseLinks> | null;
  deploy?: DeploySize | null;
  crawl?: { slowest: ReturnType<typeof slowestRun>; limit: number | null } | null;
  soft?: SoftTestReport | null;
}

export function render(input: RenderInput): string {
  const L: string[] = [];
  L.push(`# Weekly health, ${input.now.toISOString().slice(0, 10)}`, '');
  L.push('Written to the job summary only. Nothing is committed or emailed. Plan: `docs/FUTUREPROOFING-PLAN.md`.', '');

  const worst = worstCases({
    shops: input.shops,
    freshness: input.freshness ?? null,
    photos: input.photos ?? null,
    links: input.links ?? null,
    deploy: input.deploy ?? null,
    crawl: input.crawl ?? null,
    runs: input.runs,
    soft: input.soft ?? null,
  });
  L.push('## Worst cases, worst first', '');
  if (worst.length === 0) L.push('Nothing over its line this week.', '');
  else L.push(...worst.map((w, i) => `${i + 1}. ${w}`), '');

  L.push('## Shops (last harvest report)', '');
  if (!input.shops || !input.harvest) {
    L.push('`data/harvest-report.json` could not be read.', '');
  } else {
    const s = input.shops;
    L.push(`Harvest finished ${input.harvest.finishedAt ?? 'unknown'}, ${input.harvest.complete ? 'complete' : 'NOT complete'} (${input.harvest.endedReason ?? 'no reason given'}).`);
    L.push(`${s.answered} of ${s.total} swept shops answered. Not reached this sweep: ${list(s.notReached)}.`, '');
    L.push('| Check | Shops |', '|---|---|');
    L.push(`| Did not answer (most listings first) | ${list(s.silent.map((x) => `${x.id} (${x.shown})`))} |`);
    L.push(`| Feed and import shops (judged by the age of their listings, not by an answer) | ${list(s.feeds.map((x) => `${x.id} (${x.source}, ${x.shown} shown, ${x.over48h} over 48 h)`))} |`);
    L.push(`| Stopped on their time budget | ${list(s.timeBudget)} |`);
    L.push(`| Listings over 48 hours old | ${list(s.stale.map((x) => `${x.id} (${x.over48h} of ${x.shown})`))} |`, '');
    if (s.errored.length) {
      L.push('| Shop with errors | Errors | First |', '|---|---|---|');
      for (const e of s.errored.slice(0, 20)) L.push(`| ${e.id} | ${e.count} | ${e.first.replace(/\|/g, '/')} |`);
      L.push('');
    }
  }

  L.push('## Price freshness per shop (share of shown listings)', '');
  if (!input.freshness) {
    L.push('No freshness in `data/harvest-report.json`.', '');
  } else {
    const stale = input.freshness.filter((f) => f.over24h > 0);
    L.push(`${input.freshness.length - stale.length} of ${input.freshness.length} shops show no listing over 24 hours old.`, '');
    if (stale.length) {
      L.push('| Shop | Shown | Over 24 h | Over 48 h |', '|---|---|---|---|');
      for (const f of stale.slice(0, 20)) L.push(`| ${f.id} | ${f.shown} | ${pct(f.share24)} (${f.over24h}) | ${pct(f.share48)} (${f.over48h}) |`);
      L.push('');
    }
  }

  L.push('## Photos', '');
  if (!input.photos) {
    L.push('The catalogue could not be read.', '');
  } else {
    const ph = input.photos;
    L.push(`${ph.withoutPhoto} of ${ph.products} products have no photo.`, '');
    if (ph.perShop.length) {
      L.push('| Shop | Products listed | Without a photo |', '|---|---|---|');
      for (const r of ph.perShop.slice(0, 15)) L.push(`| ${r.id} | ${r.listed} | ${r.withoutPhoto} (${pct(r.withoutPhoto / r.listed)}) |`);
      L.push('');
    }
    if (ph.mostStocked.length) L.push(`The most stocked without one: ${ph.mostStocked.map((x) => `${x.brand} ${x.name} (${x.shops} shops)`).join('; ')}.`, '');
  }

  L.push('## Fragrantica links', '');
  if (!input.links) L.push('The catalogue could not be read.', '');
  else if (input.links.fallback.length === 0) L.push(`All ${input.links.checked} most stocked products open their own Fragrantica page.`, '');
  else L.push(`${input.links.fallback.length} of the ${input.links.checked} most stocked products open the fallback Fragrantica search: ${input.links.fallback.slice(0, 25).map((x) => `${x.brand} ${x.name} (${x.shops})`).join('; ')}${input.links.fallback.length > 25 ? ', and more' : ''}.`, '');

  L.push('## Soft data checks (the crawl\'s data tests that report instead of failing)', '');
  if (!input.soft) L.push('`data/soft-test-report.json` could not be read.', '');
  else L.push(...renderFindings(input.soft), '');

  L.push('## Deploy size and crawl time', '');
  const d = input.deploy;
  if (!d || d.bytes === null) L.push(`Deploy output: not recorded by the last deploy (its \`build-state.json\` has no size yet); the budget is ${mb(d?.budget ?? 0)}.`);
  else L.push(`Deploy output: ${mb(d.bytes)} of the ${mb(d.budget)} budget (${pct(d.bytes / d.budget)})${d.builtAt ? `, deploy of ${d.builtAt}` : ''}.`);
  const c = input.crawl;
  if (!c || !c.slowest) L.push('Slowest crawl run: none this week, or the Actions API could not be read.', '');
  else L.push(`Slowest crawl run: ${Math.round(c.slowest.minutes)} minutes${c.limit ? ` of its ${c.limit} minute limit (${pct(c.slowest.minutes / c.limit)})` : ''}, started ${c.slowest.startedAt}, ${c.slowest.conclusion ?? 'unknown'}.`, '');
  const groups = input.harvest?.groups;
  if (groups?.length) {
    L.push(`Sweep groups in the last sweep: ${groups.map((g) => `group ${g.group} ${g.minutes ?? '?'} min for ${g.shops} shops${g.stoppedOnBudget.length ? ` (${g.stoppedOnBudget.length} stopped on their time budget)` : ''}`).join('; ')}. Rebalance with \`npx tsx scripts/harvest-groups.ts --write\` when one takes a quarter longer than the other.`, '');
  }

  L.push('## Workflows (last 7 days, completed runs)', '');
  if (!input.runs) {
    L.push('The Actions API could not be read.', '');
  } else {
    L.push('Minutes are from run start to last update, cancelled and skipped runs left out. The crawl runs as a chain of jobs (prepare, sweep groups side by side, crawl); act when a longest figure passes 100.', '');
    L.push('| Workflow | Runs | Failed | Cancelled | Median | 90th | Longest |', '|---|---|---|---|---|---|---|');
    for (const r of input.runs) L.push(`| ${r.workflow} | ${r.runs} | ${r.failed} | ${r.cancelled} | ${r.medianMin} | ${r.p90Min} | ${r.maxMin}${r.maxMin >= 100 ? ' (over 100)' : ''} |`);
    L.push('');
  }

  L.push('## Supabase', '');
  if (!input.ping) L.push('No project configured in `demo/supabase.ts`.', '');
  else if (input.ping.status !== null && input.ping.status >= 200 && input.ping.status < 300) L.push(`Read answered HTTP ${input.ping.status}: the project is awake.`, '');
  else L.push(`Read answered ${input.ping.status === null ? 'nothing' : `HTTP ${input.ping.status}`}: check the project in the Supabase dashboard (it may be paused; restore it there).`, '');
  return L.join('\n');
}

async function gh(path: string, token: string, doFetch: Fetch): Promise<any> {
  const res = await doFetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub API ${path.split('?')[0]} answered HTTP ${res.status}`);
  return res.json();
}

export async function fetchRuns(repo: string, token: string, now: Date, doFetch: Fetch = fetch): Promise<RunLite[]> {
  const from = new Date(now.getTime() - 7 * 86400e3).toISOString().slice(0, 10);
  const out: RunLite[] = [];
  for (let page = 1; page <= 25; page++) {
    const j = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}&status=completed&created=%3E%3D${from}&exclude_pull_requests=true`, token, doFetch);
    for (const r of j.workflow_runs ?? []) out.push({ workflow: r.name, status: r.status, conclusion: r.conclusion, startedAt: r.run_started_at ?? r.created_at, updatedAt: r.updated_at });
    if ((j.workflow_runs ?? []).length < 100) break;
  }
  return out;
}

async function main(env = process.env): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const now = new Date();
  let harvest: HarvestLite | null = null;
  try {
    harvest = JSON.parse(readFileSync(resolve(root, 'data/harvest-report.json'), 'utf8')) as HarvestLite;
  } catch {
    harvest = null;
  }
  let runs: WorkflowStat[] | null = null;
  let rawRuns: RunLite[] | null = null;
  try {
    rawRuns = await fetchRuns(env.GITHUB_REPOSITORY ?? '', env.GITHUB_TOKEN ?? '', now);
    runs = summariseRuns(rawRuns);
  } catch (e) {
    console.log(`::warning::weekly health: ${e instanceof Error ? e.message : String(e)}`);
  }
  let ping: Ping | null = null;
  try {
    const cfg = supabaseConfigFrom(readFileSync(resolve(root, 'demo/supabase.ts'), 'utf8'));
    ping = cfg ? await pingSupabase(cfg.url, cfg.key) : null;
  } catch {
    ping = null;
  }
  if (ping && (ping.status === null || ping.status >= 300)) console.log(`::warning::weekly health: the Supabase read answered ${ping.status ?? 'nothing'}`);
  // The catalogue (built by the step before, scripts/ensure-catalogue-built.ts): photos and links.
  let products: ProductLite[] | null = null;
  try {
    const { readCatalogueProducts } = await import('./weeklyHealthCatalogue.js');
    products = await readCatalogueProducts();
  } catch (e) {
    console.log(`::warning::weekly health: the catalogue could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  let deploy: DeploySize | null = null;
  try {
    const { DEPLOY_BUDGET_BYTES } = await import('./leafPages.js');
    deploy = { bytes: null, budget: DEPLOY_BUDGET_BYTES };
    const res = await fetch(`${SITE}/build-state.json`, { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const rec = (await res.json()) as { deployBytes?: number; builtAt?: string };
      deploy = { bytes: typeof rec.deployBytes === 'number' ? rec.deployBytes : null, budget: DEPLOY_BUDGET_BYTES, ...(rec.builtAt ? { builtAt: rec.builtAt } : {}) };
    }
  } catch (e) {
    console.log(`::warning::weekly health: the deploy record could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  let crawl: RenderInput['crawl'] = null;
  if (rawRuns) {
    let limit: number | null = null;
    try {
      limit = crawlLimitFrom(readFileSync(resolve(root, '.github/workflows/catalogue-daily.yml'), 'utf8'));
    } catch {
      limit = null;
    }
    crawl = { slowest: slowestRun(rawRuns, CRAWL_WORKFLOW), limit };
  }
  let soft: SoftTestReport | null = null;
  try {
    soft = parseReport(readFileSync(resolve(root, 'data/soft-test-report.json'), 'utf8'));
  } catch {
    soft = null;
  }
  const md = render({
    soft,
    shops: harvest ? summariseShops(harvest) : null,
    harvest,
    runs,
    ping,
    now,
    freshness: harvest ? summariseFreshness(harvest) : null,
    photos: products ? summarisePhotos(products) : null,
    links: products ? summariseLinks(products) : null,
    deploy,
    crawl,
  });
  console.log(md);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`Weekly health failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
