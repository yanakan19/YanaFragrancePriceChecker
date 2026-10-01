/**
 * Monthly delivery-price re-check.
 *
 *   npm run delivery:recheck
 *   npm run delivery:recheck -- --shop=boots
 *   npm run delivery:recheck -- --issue=/tmp/issue.json   # also write the issue, if anything changed
 *
 * For every enabled shop with listings, fetch the one delivery page the
 * registry records for it (`shipping.source.url`, else the shop's entry in
 * UNQUOTED_DELIVERY_PAGES), read it with the same extractor shipping discovery
 * uses, and compare the standard charge and free-delivery threshold with
 * `src/config/retailers.ts`.
 *
 * Writes data/delivery-recheck-report.json and docs/DELIVERY-RECHECK.md. Never
 * writes the registry — see scripts/deliveryRecheck.ts for why, and for
 * what same / changed / blocked / unreadable each mean.
 *
 * Politeness: robots.txt is read for the page's own host and obeyed; exactly
 * one page request per shop; a 20s timeout per request; a pause between shops.
 * A 403, a captcha or a timeout is recorded as "blocked", never retried and
 * never a failure. The script exits 0 whatever the shops said.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RETAILERS } from '../src/config/retailers.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { BOT_HEADERS, BROWSER_HEADERS } from '../src/catalogue/attempt.js';
import { loadRobotsResilient } from '../src/catalogue/robotsSource.js';
import { isAllowed } from '../src/catalogue/robots.js';
import { readShippingTerms } from '../src/catalogue/shippingTerms.js';
import { urlLooksLikeDeliveryPage } from '../src/catalogue/shippingPageFinder.js';
import {
  recheckTargets,
  recheckShop,
  buildRecheckReport,
  renderRecheckMarkdown,
  renderIssueBody,
  issueTitle,
  type PageFetch,
  type RecheckRow,
  type RecheckTarget,
} from './deliveryRecheck.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');
const issuePath = arg('issue');

/** Pause between shops. Each shop is a different host, so this is courtesy, not a rate limit. */
const GAP_BETWEEN_SHOPS_MS = 1000;
/** Stop starting new shops after this long; anything left is reported, not dropped. */
const RUN_CEILING_MS = 15 * 60_000;

function listingCount(retailerId: string): number {
  const path = resolve(root, 'data/catalogue', `${retailerId}.json`);
  if (!existsSync(path)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { listings?: unknown[] };
    return Array.isArray(parsed.listings) ? parsed.listings.length : 0;
  } catch {
    return 0;
  }
}

const http = createHttp({ timeoutMs: 20_000 });
const pause = () => new Promise((r) => setTimeout(r, GAP_BETWEEN_SHOPS_MS));
const read = (html: string, url: string) =>
  readShippingTerms(html, { deliveryPage: urlLooksLikeDeliveryPage(url) });

async function fetchPage(target: RecheckTarget): Promise<PageFetch> {
  if (!target.url) return { kind: 'no-url' };
  let origin: URL;
  try {
    origin = new URL(target.url);
  } catch {
    return { kind: 'no-url' };
  }
  // robots.txt of the host the page is on — which is not always the shop's
  // homepage host (help centres on zendesk, groceries subdomains).
  const robots = await loadRobotsResilient(
    { domain: origin.hostname.replace(/^www\./, ''), homepage: origin.origin },
    http,
    BOT_HEADERS,
  );
  if (robots.unavailable) return { kind: 'robots-unreachable' };
  if (!isAllowed(robots, target.url)) return { kind: 'robots-disallowed' };
  const res = await http(target.url, BROWSER_HEADERS);
  return { kind: 'response', status: res.status, ok: res.ok, body: res.body, ...(res.error ? { error: res.error } : {}) };
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const targets = recheckTargets(RETAILERS, listingCount).filter((t) => !onlyShop || t.retailerId === onlyShop);

console.log(`\nDelivery re-check ${today}: ${targets.length} enabled shop(s) with listings\n`);

const startedAt = Date.now();
const rows: RecheckRow[] = [];
for (const target of targets) {
  if (Date.now() - startedAt > RUN_CEILING_MS) {
    rows.push(
      recheckShop(target, { kind: 'response', status: 0, ok: false, body: '', error: 'run time ceiling reached — not attempted' }, read, today),
    );
    continue;
  }
  let row: RecheckRow;
  try {
    row = recheckShop(target, await fetchPage(target), read, today);
  } catch (err) {
    // One shop's surprise must not cost the rest of the month's check.
    row = recheckShop(
      target,
      { kind: 'response', status: 0, ok: false, body: '', error: String(err).slice(0, 120) },
      read,
      today,
    );
  }
  rows.push(row);
  console.log(`  ${row.name.padEnd(26)} ${row.status.padEnd(10)} ${row.reason}${row.stale ? '  [stale]' : ''}`);
  await pause();
}

const report = buildRecheckReport(rows, now.toISOString());

const jsonPath = resolve(root, 'data/delivery-recheck-report.json');
const mdPath = resolve(root, 'docs/DELIVERY-RECHECK.md');
mkdirSync(dirname(jsonPath), { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(mdPath, renderRecheckMarkdown(report));

const s = report.summary;
console.log(
  `\n${s.same} same, ${s.changed} changed, ${s.blocked} blocked, ${s.unreadable} unreadable; ` +
    `${s.stale} with verifiedAt older than ${report.staleAfterDays} days.`,
);
console.log('Wrote data/delivery-recheck-report.json and docs/DELIVERY-RECHECK.md. The registry was not touched.');

if (issuePath) {
  const body = renderIssueBody(report);
  if (body) {
    writeFileSync(issuePath, `${JSON.stringify({ title: issueTitle(report), month: report.month, body }, null, 2)}\n`);
    console.log(`Changes found — issue text written to ${issuePath}.`);
  } else {
    console.log('No changes — no issue needed.');
  }
}
