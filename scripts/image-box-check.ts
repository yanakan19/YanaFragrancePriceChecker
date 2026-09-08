/**
 * Visually checks retailer product photos for a box standing beside the
 * bottle, and records a verdict this project can actually act on.
 *
 * WHY THIS EXISTS. pickImage.ts's own header records real, hand-viewed
 * samples of beautybase (78% bottle-only) and mybeauty-boutique (57.7%)
 * — real majorities, not unanimous. The owner does not want the boxed
 * minority shown at all. Sampling proved the problem; this script is the
 * low-cost fix the owner authorised: look at every photo these shops can
 * actually supply, not just a sample, and let pickImage.ts demote the ones
 * that fail.
 *
 * WHAT IT DOES NOT DO. No paid API, no model call, nothing that costs money
 * per image — see docs/IMAGE-PIPELINE.md and this repo's own rules on that.
 * The classifier (scripts/image-box-classify.py) is a few dozen lines of
 * Pillow pixel access — Pillow is already on this machine (checked before
 * writing a line of this: no numpy, no scipy, nothing in package.json does
 * image decoding either) — measuring one thing: how much wider than tall a
 * photo's foreground silhouette is once its near-white background is
 * thresholded away. A bottle alone is reliably taller than it is wide; a
 * bottle beside its retail box is not. See that script's own header for the
 * exact thresholds and the validated confusion matrix.
 *
 *   npx tsx scripts/image-box-check.ts                    # all IMAGE_ALLOWED
 *   npx tsx scripts/image-box-check.ts --shop=beautybase   # one retailer
 *   npx tsx scripts/image-box-check.ts --limit=500         # cap this run
 *
 * ── Scope: every IMAGE_ALLOWED retailer except fragrance-click ────────────
 * fragrance-click was already sampled and viewed at 10/10 bottle-only (see
 * pickImage.ts) on a licensed feed that refreshes as one wholesale batch —
 * there is no reason to re-spend downloads confirming that finding photo by
 * photo. Every other retailer with an `imageBasis` (IMAGE_ALLOWED, mirrored
 * from build-demo-catalogue.ts) is fair game: mybeauty-boutique and
 * beautybase are the two the owner named, but the same risk applies to any
 * shop this project has never actually looked at photo-by-photo.
 *
 * ── Caching and resumability ───────────────────────────────────────────────
 * Downloaded bytes are cached under CACHE_DIR (git-ignored: these are
 * retailer photos, never committed) keyed by a hash of the URL, so a
 * re-run does not re-fetch anything it already has on disk. A URL already
 * present in the verdict file is skipped before it is ever queued for
 * download — re-running this script costs nothing against images it has
 * already classified, and --limit caps only the *new* work a single run
 * does, so a multi-thousand-image backlog is worked down over several runs
 * rather than one long one.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import type { ImageBoxVerdict } from '../src/catalogue/pickImage.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogueDir = resolve(root, 'data/catalogue');
const verdictsPath = resolve(root, 'data/image-box-verdicts.json');
const cacheDir = resolve(root, '.image-box-cache');
const classifierPath = resolve(root, 'scripts/image-box-classify.py');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const onlyShop = arg('shop');
const limit = Number.parseInt(arg('limit') ?? '2000', 10);
const concurrency = Number.parseInt(arg('concurrency') ?? '5', 10);

/**
 * The retailers whose photos can actually appear on the site, which is the
 * only reason to spend a download on one.
 *
 * Two groups, not one, and missing the second was a real gap. IMAGE_ALLOWED in
 * build-demo-catalogue.ts is the per-retailer licensing gate (`imageBasis`),
 * and this mirrored it exactly — but that build also unlocks a second group
 * per *offer*: a `singleBrandOnly` storefront showing its own house's product
 * publishes its own photograph, which retailers.ts's ImageBasis type already
 * names "own-storefront". 844 live offers are displayed on that basis, and
 * because none of those shops carries an `imageBasis` of its own, not one of
 * their photos was ever queued here. Royal Blend Nero was the case that found
 * it: after six listings merged into one row, the photo shown came from
 * french-avenue.co.uk and had never been looked at.
 *
 * A house's own storefront is not exempt from the question. Its photography is
 * usually the best on the product, but "usually" is what the whole sweep
 * exists to replace with a per-photo answer.
 */
const IMAGE_ALLOWED = new Set(
  RETAILERS.filter((r) => r.affiliate.imageBasis != null || r.singleBrandOnly).map((r) => r.id),
);

/**
 * Already sampled and viewed at 10/10 bottle-only on a licensed, wholesale-
 * refreshed feed (see pickImage.ts) — see the file header for why this one
 * retailer is exempt from the per-photo sweep the others get.
 */
const SKIP_RETAILERS = new Set(['fragrance-click']);

interface Listing {
  imageUrl?: string | null;
}
interface CatalogueFile {
  retailerId: string;
  source?: string;
  listings: Listing[];
}

interface VerdictEntry {
  verdict: ImageBoxVerdict;
  score: number;
  checkedAt: string;
}

/** Presented as a real browser would — mirrors scripts/image-link-check.ts. */
const IMAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
} as const;

function loadVerdicts(): Record<string, VerdictEntry> {
  if (!existsSync(verdictsPath)) return {};
  return JSON.parse(readFileSync(verdictsPath, 'utf8')) as Record<string, VerdictEntry>;
}

function saveVerdicts(verdicts: Record<string, VerdictEntry>): void {
  // Sorted keys: a deterministic diff on every commit, not a shuffled one
  // that depends on iteration order or which URLs a given run happened to
  // touch.
  const sorted: Record<string, VerdictEntry> = {};
  for (const url of Object.keys(verdicts).sort()) sorted[url] = verdicts[url]!;
  writeFileSync(verdictsPath, JSON.stringify(sorted, null, 2) + '\n');
}

function collectCandidateUrls(): Map<string, Set<string>> {
  const urlToRetailers = new Map<string, Set<string>>();
  for (const file of readdirSync(catalogueDir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(resolve(catalogueDir, file), 'utf8')) as CatalogueFile;
    if (data.source !== 'live') continue;
    if (!IMAGE_ALLOWED.has(data.retailerId)) continue;
    if (SKIP_RETAILERS.has(data.retailerId)) continue;
    if (onlyShop && data.retailerId !== onlyShop) continue;
    for (const listing of data.listings) {
      if (!listing.imageUrl) continue;
      const set = urlToRetailers.get(listing.imageUrl) ?? new Set<string>();
      set.add(data.retailerId);
      urlToRetailers.set(listing.imageUrl, set);
    }
  }
  return urlToRetailers;
}

function cachePathFor(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex');
  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!/^\.(jpe?g|png|webp|gif|avif)$/.test(ext)) ext = '.jpg';
  return resolve(cacheDir, `${hash}${ext}`);
}

async function download(url: string, dest: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: IMAGE_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return false;
    writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function classify(path: string): { verdict: ImageBoxVerdict; score: number } {
  try {
    const out = execFileSync('python3', [classifierPath, path], { encoding: 'utf8', timeout: 15_000 });
    const parsed = JSON.parse(out) as { verdict: ImageBoxVerdict; score: number };
    return { verdict: parsed.verdict, score: parsed.score };
  } catch {
    return { verdict: 'unsure', score: 0 };
  }
}

async function runPool<T>(items: T[], n: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      await work(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  const verdicts = loadVerdicts();
  const candidates = collectCandidateUrls();

  const toCheck = [...candidates.keys()].filter((url) => !(url in verdicts)).sort();
  const thisRun = toCheck.slice(0, limit);
  const remaining = Math.max(0, toCheck.length - thisRun.length);

  console.log(
    `${candidates.size} candidate photo URLs across ${
      [...new Set([...candidates.values()].flatMap((s) => [...s]))].length
    } retailers; ${toCheck.length} not yet verdicted; checking ${thisRun.length} this run.`,
  );

  let downloaded = 0;
  let failed = 0;
  const counts: Record<ImageBoxVerdict, number> = { boxed: 0, 'bottle-only': 0, unsure: 0 };

  await runPool(thisRun, concurrency, async (url) => {
    const dest = cachePathFor(url);
    if (!existsSync(dest)) {
      const ok = await download(url, dest);
      if (!ok) {
        failed++;
        return;
      }
      downloaded++;
    }
    const { verdict, score } = classify(dest);
    counts[verdict]++;
    verdicts[url] = { verdict, score, checkedAt: new Date().toISOString() };
  });

  saveVerdicts(verdicts);

  console.log(
    `Checked ${thisRun.length - failed} images (${downloaded} freshly downloaded, ${failed} failed to fetch): ` +
      `${counts.boxed} boxed, ${counts['bottle-only']} bottle-only, ${counts.unsure} unsure.`,
  );
  console.log(`${remaining} candidate URLs remain unchecked after this run.`);
}

main();
