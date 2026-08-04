/**
 * Image link health check.
 *
 * Product photos are never downloaded or hosted by this project — every
 * listing links straight to the retailer's own image URL (see demo/photo.ts
 * for why). That means a photo can go dark without anything else here
 * noticing: the retailer reshuffles their CDN, deletes the product, or
 * changes the path, and the tile silently starts rendering a broken image.
 *
 * This script is a report, not a fetcher of prices or a mutator of the
 * catalogue: it HEADs every distinct imageUrl across data/catalogue/*.json
 * once, and writes what it found to data/image-link-report.json. Nothing
 * downstream reads that file automatically yet — wiring a broken link into
 * demo/photo.ts's "no image available" placeholder is a follow-up, not done
 * here, so this only ever reports, never changes what a user sees.
 *
 * One HEAD per distinct URL, not one per listing: several retailers reuse
 * one photo across sizes of the same fragrance, and the sitemap-not-per-
 * product-page cost discipline in docs/INGESTION.md applies here too —
 * there is no reason to fetch the same URL twice.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogueDir = resolve(root, 'data/catalogue');
const reportPath = resolve(root, 'data/image-link-report.json');

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
 * The checker sent no headers at all, which is not how any of these CDNs are
 * ever addressed in practice — a request with no User-Agent and no Accept is
 * exactly the shape a bot filter drops. That is a candidate explanation for the
 * cluster of `TypeError: fetch failed` results against Shopify-backed domains,
 * though it is not proven; the point of sending them is to stop the checker
 * itself being a variable in the answer.
 */
const IMAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
} as const;

const urlToRetailers = new Map<string, Set<string>>();

let skippedFixtures = 0;

for (const file of readdirSync(catalogueDir)) {
  if (!file.endsWith('.json')) continue;
  const data = JSON.parse(readFileSync(resolve(catalogueDir, file), 'utf8')) as CatalogueFile;

  // Fixture snapshots carry invented image URLs — boots.com/images/boo-sauvage.jpg
  // and friends, which have never existed. build-demo-catalogue.ts already
  // refuses to read fixtures, so none of these reaches a user, but this checker
  // was walking every file and counting all of them as broken links. That is
  // what made the report read 78 failures when only a minority were real, and
  // it buried the ones that matter under a wall of known-fake URLs.
  if (data.source !== 'live') {
    skippedFixtures += data.listings.filter((l) => l.imageUrl).length;
    continue;
  }

  for (const listing of data.listings) {
    if (!listing.imageUrl) continue;
    const set = urlToRetailers.get(listing.imageUrl) ?? new Set<string>();
    set.add(data.retailerId);
    urlToRetailers.set(listing.imageUrl, set);
  }
}

const urls = [...urlToRetailers.keys()];
console.log(
  `Checking ${urls.length} distinct image URLs across ` +
    `${new Set([...urlToRetailers.values()].flatMap((s) => [...s])).size} live retailers.` +
    (skippedFixtures > 0 ? ` Skipped ${skippedFixtures} fixture URLs.` : ''),
);

interface CheckResult {
  url: string;
  retailers: string[];
  ok: boolean;
  status: number | null;
  contentType: string | null;
  error: string | null;
}

async function checkOne(url: string): Promise<CheckResult> {
  const retailers = [...(urlToRetailers.get(url) ?? [])].sort();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let res = await fetch(url, {
      method: 'HEAD', redirect: 'follow', signal: controller.signal, headers: IMAGE_HEADERS,
    });
    // Some CDNs reject HEAD outright (405/403) but serve the same URL fine to
    // GET — a real 404/DNS failure fails both, so falling back here does not
    // hide a genuinely dead link, only avoids a false positive from a server
    // that just dislikes the HEAD verb.
    if (!res.ok && (res.status === 405 || res.status === 403)) {
      res = await fetch(url, {
        method: 'GET', redirect: 'follow', signal: controller.signal, headers: IMAGE_HEADERS,
      });
    }
    const contentType = res.headers.get('content-type');
    return {
      url, retailers, ok: res.ok && !!contentType?.startsWith('image/'),
      status: res.status, contentType, error: null,
    };
  } catch (err) {
    // `TypeError: fetch failed` on its own is useless for diagnosis — undici
    // puts the real reason (ECONNRESET, ENOTFOUND, TLS failure, socket hang up)
    // on `cause`. Without this the report cannot distinguish a dead domain from
    // a server that dropped us.
    const cause = (err as { cause?: unknown }).cause;
    const detail = cause ? ` (${String(cause).slice(0, 100)})` : '';
    return {
      url, retailers, ok: false, status: null, contentType: null,
      error: `${String(err).slice(0, 120)}${detail}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Bounded concurrency, not Promise.all on the whole list: a few thousand
// simultaneous connections to a handful of retailer CDNs is indistinguishable
// from hammering them, which is exactly the posture docs/INGESTION.md argues
// against.
const CONCURRENCY = 8;
async function checkAll(list: string[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      results[i] = await checkOne(list[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  return results;
}

const results = await checkAll(urls);
const broken = results.filter((r) => !r.ok);

const report = {
  checkedAt: new Date().toISOString(),
  totalChecked: results.length,
  brokenCount: broken.length,
  broken,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(`${broken.length} of ${results.length} image URLs did not resolve to a real image.`);
for (const b of broken.slice(0, 20)) {
  console.log(`  ${b.retailers.join(',').padEnd(20)} ${b.status ?? b.error} ${b.url}`);
}
if (broken.length > 20) console.log(`  ...and ${broken.length - 20} more, see ${reportPath}`);
