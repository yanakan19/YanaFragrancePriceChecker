/**
 * Image link health check.
 *
 * Product photos are never downloaded or hosted by this project — every
 * listing links straight to the retailer's own image URL (see demo/photo.ts
 * for why). That means a photo can go dark without anything else here
 * noticing: the retailer reshuffles their CDN, deletes the product, or
 * changes the path, and the tile silently starts rendering a broken image.
 *
 *   npm run images:check                     # broken-link sweep (default)
 *   npm run images:check -- --referer-check   # Bug 2: referer-sensitivity sweep
 *   npm run images:check -- --shop=allbeauty  # either mode, one retailer only
 *
 * This script is a report, not a fetcher of prices or a mutator of the
 * catalogue: nothing downstream reads either report file automatically yet —
 * wiring a broken link into demo/photo.ts's "no image available" placeholder
 * is a follow-up, not done here, so this only ever reports, never changes
 * what a user sees.
 *
 * ── Scoped to images that actually reach a reader ─────────────────────────────
 * A retailer's photos are only ever rendered when its registry entry sets
 * `affiliate.imageBasis` (src/types/retailer.ts) — everything else falls back
 * to the "no image available" placeholder regardless of what its imageUrl
 * says (see IMAGE_ALLOWED in scripts/build-demo-catalogue.ts, mirrored here).
 * The first run of this checker walked every retailer's images regardless,
 * and two of the retailers with no imageBasis at all — escentual and
 * nicchia-luxury-uk — together accounted for 7,803 of its 20,317 "broken"
 * entries: effort and noise spent on photos no reader has ever seen and
 * never will, on the site as it stands today. Scoping to IMAGE_ALLOWED cuts
 * the distinct-URL count from 38,736 to 27,505 (29%) and removes those two
 * hosts from the report entirely.
 *
 * ── One HEAD per distinct URL, not one per listing ────────────────────────────
 * Several retailers reuse one photo across sizes of the same fragrance, and
 * the sitemap-not-per-product-page cost discipline in docs/INGESTION.md
 * applies here too — there is no reason to fetch the same URL twice.
 *
 * ── Bounded per host, not just bounded overall ────────────────────────────────
 * The first run's report was worthless in a specific, diagnosable way: all
 * 20,317 "broken" entries carried `status: null` and the byte-identical
 * message `TypeError: fetch failed (AggregateError)` — not one had a real
 * HTTP status. See src/catalogue/imageLinkCheck.ts's header for what that
 * message shape means (a connection that never completed, not a shop that
 * answered). And the failures were not spread evenly: they clustered almost
 * entirely on five hosts — perfume-click, mybeauty-boutique, escentual,
 * justmylook, nicchia-luxury-uk — which is the signature of *that host*
 * being hit too hard, not of dead links scattered across the catalogue.
 * The old script's concurrency was a single global cap of 8, and because
 * URLs are grouped by retailer file, the worker pool could and did put all 8
 * of its concurrent requests against the same host, back to back, for
 * however many thousand images that retailer had — with no retry and no
 * per-host limit to stop it. This version keeps a global cap but adds a
 * separate, lower per-host cap and a minimum gap between request starts to
 * the same host, and retries only the failures that are provably ours (see
 * isRetryableFailure) — never a real HTTP status, which is the shop's actual
 * answer and asking again cannot change it.
 *
 * This could not be run from the environment it was written in — every
 * outbound request 403s at that machine's proxy (docs/INGESTION.md) — so
 * none of the above is confirmed by a live run here. It is built to run in
 * CI, the way scripts/currency-probe.ts and scripts/brand-site-probe.ts
 * already do; only .github/workflows/catalogue-daily.yml's "Check image
 * links" step, which already runs this on every scheduled crawl, can
 * actually prove it.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import {
  classifyImageAttempt,
  classifyRefererSensitivity,
  isRetryableFailure,
  type ImageAttempt,
  type ImageVerdict,
  type RefererVerdict,
} from '../src/catalogue/imageLinkCheck.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogueDir = resolve(root, 'data/catalogue');
const reportPath = resolve(root, 'data/image-link-report.json');
const refererReportPath = resolve(root, 'data/image-referer-report.json');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const refererCheck = process.argv.includes('--referer-check');
const onlyShop = arg('shop');
const sampleSize = Number.parseInt(arg('sample') ?? '10', 10);

/**
 * Retailers whose product photos may actually be shown — mirrors
 * IMAGE_ALLOWED in scripts/build-demo-catalogue.ts. See the file header for
 * why checking outside this set is mostly wasted requests and pure noise.
 */
const IMAGE_ALLOWED = new Set(
  RETAILERS.filter((r) => r.affiliate.imageBasis != null).map((r) => r.id),
);

interface Listing {
  imageUrl?: string | null;
}
interface CatalogueFile {
  retailerId: string;
  /** 'live' or 'fixtures' — see CatalogueSnapshot. */
  source?: string;
  listings: Listing[];
}

/**
 * Presented as a real browser would.
 *
 * A request with no User-Agent and no Accept is exactly the shape a bot
 * filter drops, so these are sent on every attempt regardless of mode.
 */
const IMAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
} as const;

/** What this site's own <img> tags actually send — see demo/photo.ts. */
const PRICESNIFFS_REFERER = 'https://pricesniffs.space/';

const urlToRetailers = new Map<string, Set<string>>();

let skippedFixtures = 0;
let skippedInvisible = 0;

for (const file of readdirSync(catalogueDir)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(readFileSync(resolve(catalogueDir, file), 'utf8')) as CatalogueFile;

  // Fixture snapshots carry invented image URLs — boots.com/images/boo-sauvage.jpg
  // and friends, which have never existed. build-demo-catalogue.ts already
  // refuses to read fixtures, so none of these reaches a user.
  if (data.source !== 'live') {
    skippedFixtures += data.listings.filter((l) => l.imageUrl).length;
    continue;
  }

  // Not IMAGE_ALLOWED means every listing here renders the placeholder
  // regardless of imageUrl — see the file header for why checking these
  // anyway was most of the old report's noise.
  if (!IMAGE_ALLOWED.has(data.retailerId)) {
    skippedInvisible += data.listings.filter((l) => l.imageUrl).length;
    continue;
  }

  if (onlyShop && data.retailerId !== onlyShop) continue;

  for (const listing of data.listings) {
    if (!listing.imageUrl) continue;
    const set = urlToRetailers.get(listing.imageUrl) ?? new Set<string>();
    set.add(data.retailerId);
    urlToRetailers.set(listing.imageUrl, set);
  }
}

const urls = [...urlToRetailers.keys()];

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ── one raw request, no retry, no judgement ─────────────────────────────── */

async function fetchOnce(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ImageAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, headers });
    // Some CDNs reject HEAD outright (405/403) but serve the same URL fine to
    // GET — a real 404/DNS failure fails both, so falling back here does not
    // hide a genuinely dead link, only avoids a false positive from a server
    // that just dislikes the HEAD verb.
    if (!res.ok && (res.status === 405 || res.status === 403)) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
    }
    return { status: res.status, contentType: res.headers.get('content-type'), error: null };
  } catch (err) {
    // `TypeError: fetch failed` on its own is useless for diagnosis — undici
    // puts the real reason (ECONNRESET, ENOTFOUND, TLS failure, an
    // AggregateError from a failed dual-stack connect) on `cause`. Without
    // this the report cannot distinguish a dead domain from a dropped
    // socket, which is exactly the distinction the whole file exists to draw.
    const cause = (err as { cause?: unknown }).cause;
    const detail = cause ? ` (${String(cause).slice(0, 100)})` : '';
    return { status: null, contentType: null, error: `${String(err).slice(0, 120)}${detail}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Retry only what is provably ours to blame — see isRetryableFailure. */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ImageAttempt> {
  const backoffMs = [700, 2000];
  let attempt = await fetchOnce(url, headers, timeoutMs);
  for (const delay of backoffMs) {
    if (!isRetryableFailure(attempt)) return attempt;
    await sleep(delay);
    attempt = await fetchOnce(url, headers, timeoutMs);
  }
  return attempt;
}

/**
 * Global concurrency, and a separate lower cap per host plus a minimum gap
 * between request starts to the same host. See the file header: the old
 * script's failures clustered on five hosts because a global-only cap let
 * the whole worker pool land on one of them at once. This is not rate
 * limiting any one server across the whole sweep — it just stops this
 * process being the thing that looks like a burst to it.
 */
const GLOBAL_CONCURRENCY = 8;
const PER_HOST_CONCURRENCY = 3;
const HOST_MIN_GAP_MS = 120;

class HostGate {
  private inFlight = new Map<string, number>();
  private lastStart = new Map<string, number>();

  async acquire(host: string): Promise<void> {
    for (;;) {
      if ((this.inFlight.get(host) ?? 0) < PER_HOST_CONCURRENCY) break;
      await sleep(40);
    }
    const wait = (this.lastStart.get(host) ?? 0) + HOST_MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastStart.set(host, Date.now());
    this.inFlight.set(host, (this.inFlight.get(host) ?? 0) + 1);
  }

  release(host: string): void {
    this.inFlight.set(host, Math.max(0, (this.inFlight.get(host) ?? 1) - 1));
  }
}

async function runPool<T, R>(items: T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await work(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/* ── mode 1: broken-link sweep ────────────────────────────────────────────── */

interface CheckResult {
  url: string;
  retailers: string[];
  verdict: ImageVerdict;
  reason: string;
  status: number | null;
  contentType: string | null;
  error: string | null;
}

async function runBrokenLinkSweep(): Promise<void> {
  console.log(
    `Checking ${urls.length} distinct image URLs across ` +
      `${new Set([...urlToRetailers.values()].flatMap((s) => [...s])).size} retailers whose photos are shown.` +
      (skippedFixtures > 0 ? ` Skipped ${skippedFixtures} fixture URLs.` : '') +
      (skippedInvisible > 0 ? ` Skipped ${skippedInvisible} URLs from retailers with no imageBasis (never shown).` : ''),
  );

  const gate = new HostGate();
  const results = await runPool(urls, GLOBAL_CONCURRENCY, async (url): Promise<CheckResult> => {
    const retailers = [...(urlToRetailers.get(url) ?? [])].sort();
    const host = hostOf(url);
    await gate.acquire(host);
    let attempt: ImageAttempt;
    try {
      attempt = await fetchWithRetry(url, IMAGE_HEADERS, 15_000);
    } finally {
      gate.release(host);
    }
    const { verdict, reason } = classifyImageAttempt(attempt);
    return { url, retailers, verdict, reason, ...attempt };
  });

  const broken = results.filter((r) => r.verdict === 'broken');
  const unverified = results.filter((r) => r.verdict === 'unverified');

  const report = {
    checkedAt: new Date().toISOString(),
    totalChecked: results.length,
    // Only a real HTTP-confirmed failure counts as broken. A checker that
    // reports its own connection failures as the shop's is worse than none —
    // see the file header for the run that made this distinction necessary.
    brokenCount: broken.length,
    unverifiedCount: unverified.length,
    broken,
    unverified,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  console.log(
    `${broken.length} of ${results.length} image URLs are confirmed broken by a real HTTP response. ` +
      `${unverified.length} more never got an answer from the shop at all (our connection, not theirs) ` +
      'and are reported separately, never as broken.',
  );
  for (const b of broken.slice(0, 20)) {
    console.log(`  BROKEN     ${b.retailers.join(',').padEnd(20)} ${b.status} ${b.url}`);
  }
  if (broken.length > 20) console.log(`  ...and ${broken.length - 20} more, see ${reportPath}`);
  if (unverified.length > 0) {
    console.log(`  (${unverified.length} unverified — see data/image-link-report.json's "unverified" array)`);
  }
}

/* ── mode 2: referer-sensitivity sweep (Bug 2) ────────────────────────────── */

interface RefererResult {
  retailer: string;
  url: string;
  verdict: RefererVerdict;
  reason: string;
  withReferer: ImageAttempt;
  withoutReferer: ImageAttempt;
}

async function runRefererSweep(): Promise<void> {
  const byRetailer = new Map<string, string[]>();
  for (const [url, retailers] of urlToRetailers) {
    for (const retailer of retailers) {
      const bucket = byRetailer.get(retailer) ?? [];
      bucket.push(url);
      byRetailer.set(retailer, bucket);
    }
  }

  const sampled: { retailer: string; url: string }[] = [];
  for (const [retailer, list] of [...byRetailer].sort(([a], [b]) => a.localeCompare(b))) {
    // Every Nth URL rather than the first N, so a sample of a shop with many
    // photos isn't accidentally every image from a single range (e.g. one
    // collection page) that happens to behave alike.
    const step = Math.max(1, Math.floor(list.length / sampleSize));
    let picked = 0;
    for (let i = 0; i < list.length && picked < sampleSize; i += step) {
      sampled.push({ retailer, url: list[i]! });
      picked++;
    }
  }

  console.log(
    `Referer-sensitivity sweep: ${sampled.length} image URLs sampled across ${byRetailer.size} ` +
      `retailers whose photos are shown (up to ${sampleSize} each).`,
  );
  console.log(
    'Every product photo on this site is rendered with referrerpolicy="no-referrer" (demo/photo.ts), ' +
      "so a real reader's browser sends NO Referer header — ever. The finding that predicts a broken " +
      'tile today is "blocks-no-referer" below, not "blocks-pricesniffs-referer".',
  );

  const gate = new HostGate();
  const results = await runPool(sampled, GLOBAL_CONCURRENCY, async ({ retailer, url }): Promise<RefererResult> => {
    const host = hostOf(url);
    await gate.acquire(host);
    let withReferer: ImageAttempt;
    let withoutReferer: ImageAttempt;
    try {
      withReferer = await fetchWithRetry(url, { ...IMAGE_HEADERS, referer: PRICESNIFFS_REFERER }, 15_000);
      withoutReferer = await fetchWithRetry(url, IMAGE_HEADERS, 15_000);
    } finally {
      gate.release(host);
    }
    const { verdict, reason } = classifyRefererSensitivity({ withReferer, withoutReferer });
    return { retailer, url, verdict, reason, withReferer, withoutReferer };
  });

  const byRetailerVerdict = new Map<string, Map<RefererVerdict, number>>();
  for (const r of results) {
    const m = byRetailerVerdict.get(r.retailer) ?? new Map<RefererVerdict, number>();
    m.set(r.verdict, (m.get(r.verdict) ?? 0) + 1);
    byRetailerVerdict.set(r.retailer, m);
  }

  const perRetailer = [...byRetailerVerdict.entries()]
    .map(([retailer, counts]) => ({
      retailer,
      sampled: [...counts.values()].reduce((a, b) => a + b, 0),
      counts: Object.fromEntries(counts),
      blocksNoReferer: counts.get('blocks-no-referer') ?? 0,
    }))
    .sort((a, b) => b.blocksNoReferer - a.blocksNoReferer || a.retailer.localeCompare(b.retailer));

  const report = {
    checkedAt: new Date().toISOString(),
    note:
      'referrerpolicy="no-referrer" is set on every product <img> in demo/photo.ts, so ' +
      '"blocksNoReferer" is the finding that predicts a broken tile for a real reader today; ' +
      '"blocks-pricesniffs-referer" currently has no effect on what readers see.',
    sampledUrls: results.length,
    perRetailer,
    results,
  };
  writeFileSync(refererReportPath, JSON.stringify(report, null, 2) + '\n');

  console.log('──────── referer sensitivity by retailer ────────');
  for (const r of perRetailer) {
    const flag = r.blocksNoReferer > 0 ? '  <-- blocks the request a real reader sends' : '';
    console.log(`  ${r.retailer.padEnd(24)} sampled ${r.sampled}  ${JSON.stringify(r.counts)}${flag}`);
  }
  console.log('');

  const atRisk = perRetailer.filter((r) => r.blocksNoReferer > 0);
  if (atRisk.length === 0) {
    console.log('No sampled retailer blocked a refererless request while serving the pricesniffs-referer one.');
  } else {
    console.log(
      `${atRisk.length} retailer(s) served an image with a pricesniffs.space referer but refused the ` +
        `same request with none: ${atRisk.map((r) => r.retailer).join(', ')}. ` +
        'That refererless request is what this site actually sends, so these retailers are showing ' +
        'readers a broken tile today. Nothing has been changed — reconsidering imageBasis for a ' +
        'retailer in src/config/retailers.ts is the owner\'s call, not this script\'s.'
    );
  }
}

if (urls.length === 0) {
  console.error(
    onlyShop
      ? `no live, image-eligible listings found for retailer "${onlyShop}"`
      : 'no live, image-eligible listings found — nothing to check',
  );
  process.exit(1);
}

if (refererCheck) {
  await runRefererSweep();
} else {
  await runBrokenLinkSweep();
}
