/**
 * Finds a bigger picture for the products whose only photo is Perfume Click's
 * thumbnail, and records where it came from.
 *
 *   npm run photos:better                     # every product still on a thumbnail
 *   npm run photos:better -- --limit=50       # at most 50 listings this run
 *   npm run photos:better -- --dry-run        # fetch and report, write nothing
 *   npm run photos:better -- --slug=dolce_and_gabbana_the_one_rollerball_7p4ml
 *
 * The one source today is `perfume-click-page` (src/config/photoSources.ts): the
 * picture in the shop's own product page, read from the `merchantUrl` the Awin
 * feed carries (never the `awin1.com` tracking link, which would register a
 * click). See src/catalogue/perfumeClickPage.ts for what the page holds and why
 * it is taken.
 *
 * Which listings: a product whose shown photo is Perfume Click's (the host
 * bgstatic.net) or that has none while Perfume Click lists it, read from the
 * built catalogue (demo/catalogue.generated.ts) and the stored listings
 * (data/catalogue/perfume-click.json). A listing that already has a record for
 * the feed image it carries now is not fetched again; a listing that was tried
 * and refused is not tried again for 30 days.
 *
 * Manners: every request is PriceSniffsBot (src/catalogue/botIdentity.ts),
 * robots.txt of the shop and of its image host is read first and obeyed, and
 * requests are at least one second apart, one at a time. A page that is not
 * answered, or that robots.txt disallows, is skipped and is never worked around.
 * Nothing is downloaded beyond the first 64 KB of an image, enough to read its
 * size; no image is stored here.
 *
 * Writes data/better-photos.json (policy "incoming" in scripts/generated-files.txt)
 * every 20 listings, so a run that is stopped keeps what it found.
 */
import { existsSync, readFileSync } from 'node:fs';
import { decodeSnapshot } from '../src/catalogue/store.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { botHeaders } from '../src/catalogue/botIdentity.js';
import { BETTER_PHOTOS_ABOUT, betterPhotoKey, type BetterPhoto, type BetterPhotosFile } from '../src/catalogue/betterPhotos.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { readImageSize } from '../src/catalogue/imageHeader.js';
import { acceptPagePhoto, parsePageTitle, parseProductPageImage } from '../src/catalogue/perfumeClickPage.js';
import { isAllowed } from '../src/catalogue/robots.js';
import { loadRobotsResilient } from '../src/catalogue/robotsSource.js';
import { PHOTO_SOURCES } from '../src/config/photoSources.js';
import { writeGenerated } from './generatedFiles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'data/better-photos.json';
const SOURCE = 'perfume-click-page';
const RETRY_AFTER_DAYS = 30;
const MIN_GAP_MS = 1000;

interface Miss {
  reason: string;
  feedImage: string | null;
  checkedAt: string;
}
interface StoredFile extends BetterPhotosFile {
  /** Listings tried and refused, so a later run leaves them alone for a while. */
  misses: Record<string, Miss>;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dryRun = args.includes('--dry-run');
const limit = flag('limit') ? Number(flag('limit')) : Infinity;
const onlySlug = flag('slug');

if (!PHOTO_SOURCES[SOURCE].enabled) {
  console.log(`${SOURCE} is switched off in src/config/photoSources.ts; nothing to do.`);
  process.exit(0);
}

const path = resolve(root, FILE);
const loaded = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredFile>) : {};
const store: StoredFile = { about: BETTER_PHOTOS_ABOUT, photos: loaded.photos ?? {}, misses: loaded.misses ?? {} };

// ── which listings ──────────────────────────────────────────────────────────
interface Listing {
  retailerSku: string;
  url: string;
  merchantUrl: string | null;
  rawTitle: string;
  imageUrl: string | null;
  priceGbp: number | null;
  status: string;
}
const pcFile = decodeSnapshot(JSON.parse(readFileSync(resolve(root, 'data/catalogue/perfume-click.json'), 'utf8')));
const pcListings: Listing[] = Array.isArray(pcFile) ? pcFile : pcFile.listings;
const byKey = new Map<string, Listing>();
for (const l of pcListings) if (l.status === 'active') byKey.set(`${l.url}|${l.priceGbp}`, l);

const wanted = new Map<string, { listing: Listing; slug: string }>();
for (const p of CATALOGUE) {
  if (onlySlug && p.slug !== onlySlug) continue;
  const onThumbnail = p.image === null || new URL(p.image).host === 'bgstatic.net';
  if (!onThumbnail) continue;
  for (const o of CRAWLED[p.id] ?? []) {
    if (o.retailerId !== 'perfume-click') continue;
    const l = byKey.get(`${o.url}|${o.price}`);
    if (l && !wanted.has(l.retailerSku)) wanted.set(l.retailerSku, { listing: l, slug: p.slug });
  }
}

const now = new Date();
const todo = [...wanted.values()]
  .filter(({ listing: l }) => {
    const key = betterPhotoKey('perfume-click', l.retailerSku);
    const have = store.photos[key];
    if (have && (have.feedImage ?? null) === (l.imageUrl ?? null)) return false;
    const miss = store.misses[key];
    if (miss && (miss.feedImage ?? null) === (l.imageUrl ?? null)) {
      const days = (now.getTime() - new Date(miss.checkedAt).getTime()) / 86_400_000;
      if (days < RETRY_AFTER_DAYS) return false;
    }
    return true;
  })
  .sort((a, b) => a.slug.localeCompare(b.slug))
  .slice(0, limit);

console.log(`${wanted.size} listings on a Perfume Click thumbnail or none, ${todo.length} to read this run.`);

// ── manners ─────────────────────────────────────────────────────────────────
const http = createHttp({ timeoutMs: 25_000 });
let lastRequest = 0;
async function politely<T>(fn: () => Promise<T>): Promise<T> {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  return fn();
}

const robotsShop = await politely(() => loadRobotsResilient({ domain: 'perfume-click.co.uk', homepage: 'https://www.perfume-click.co.uk' }, http, botHeaders()));
const robotsImages = await politely(() => loadRobotsResilient({ domain: 'bgstatic.net', homepage: 'https://bgstatic.net' }, http, botHeaders()));

async function imageSize(url: string): Promise<{ width: number; height: number } | { error: string }> {
  if (!isAllowed(robotsImages, url)) return { error: 'robots-image-host' };
  try {
    const res = await politely(() => fetch(url, { headers: botHeaders({ accept: 'image/*', range: 'bytes=0-65535' }), redirect: 'follow' }));
    if (res.status !== 200 && res.status !== 206) return { error: `image-http-${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) return { error: 'image-not-an-image' };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const size = readImageSize(bytes.subarray(0, 65536));
    return size ?? { error: 'image-size-unreadable' };
  } catch (err) {
    return { error: `image-fetch-${String(err).slice(0, 60)}` };
  }
}

// ── the run ─────────────────────────────────────────────────────────────────
function save(): void {
  if (dryRun) return;
  const sortedPhotos = Object.fromEntries(Object.entries(store.photos).sort(([a], [b]) => a.localeCompare(b)));
  const sortedMisses = Object.fromEntries(Object.entries(store.misses).sort(([a], [b]) => a.localeCompare(b)));
  writeGenerated(root, FILE, JSON.stringify({ about: BETTER_PHOTOS_ABOUT, photos: sortedPhotos, misses: sortedMisses }, null, 1) + '\n');
}

const tally: Record<string, number> = {};
const count = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
let done = 0;
for (const { listing: l, slug } of todo) {
  const key = betterPhotoKey('perfume-click', l.retailerSku);
  const miss = (reason: string) => {
    count(reason);
    store.misses[key] = { reason, feedImage: l.imageUrl ?? null, checkedAt: now.toISOString() };
    delete store.photos[key];
  };
  if (!l.merchantUrl || !/^https:\/\/www\.perfume-click\.co\.uk\//.test(l.merchantUrl)) {
    miss('no-shop-page');
  } else if (!isAllowed(robotsShop, l.merchantUrl)) {
    miss('robots-shop');
  } else {
    const page = await politely(() => http(l.merchantUrl!, botHeaders()));
    if (!page.ok) {
      // A refusal or an error is the shop's answer or a failure of this run, and is
      // not worked around. It is also not recorded as a miss when the request never
      // completed, so the next run asks again.
      if (page.status === 0) count('page-unreachable');
      else miss(`page-http-${page.status}`);
    } else {
      const img = parseProductPageImage(page.body);
      if (!img) miss('no-product-image');
      else {
        const size = await imageSize(img);
        if ('error' in size) miss(size.error);
        else {
          const verdict = acceptPagePhoto({
            feedImage: l.imageUrl,
            feedTitle: l.rawTitle,
            pageImage: img,
            pageTitle: parsePageTitle(page.body),
            size,
          });
          if (!verdict.ok) miss(verdict.reason);
          else {
            const rec: BetterPhoto = {
              url: img,
              width: size.width,
              height: size.height,
              source: SOURCE,
              page: l.merchantUrl,
              feedImage: l.imageUrl ?? null,
              checkedAt: now.toISOString(),
            };
            store.photos[key] = rec;
            delete store.misses[key];
            count('found');
            if (done < 5 || slug.startsWith('dolce_and_gabbana_the_one')) console.log(`  ${slug}: ${img} ${size.width}x${size.height}`);
          }
        }
      }
    }
  }
  done++;
  if (done % 20 === 0) {
    save();
    console.log(`  ${done}/${todo.length} ${JSON.stringify(tally)}`);
  }
}
save();
console.log(`Done: ${done} read. ${JSON.stringify(tally)}${dryRun ? ' (dry run, nothing written)' : ''}`);
