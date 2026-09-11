/**
 * Fills in `sxf`/`syf`/`swf`/`shf` on existing data/image-box-verdicts.json
 * entries from photos already sitting in .image-box-cache — no downloads, no
 * re-judging of the verdict already recorded, no network at all.
 *
 * WHY THIS EXISTS. src/catalogue/bottleScale.ts's bottleScaleStyle() needs the
 * silhouette bounding box scripts/image-box-classify.py measures internally
 * but, until 2026-09-11, discarded. Every verdict entry written before that
 * date therefore carries none, which is precisely why bottleScaleStyle()
 * treats an absent box as "render exactly as today" rather than guessing at
 * one — see docs/IMAGE-SCALE-PLAN.md §4. Re-running the sweep to fill the box
 * in would re-download and re-classify tens of thousands of photos for a
 * number the cached file can already answer: scripts/image-box-check.ts
 * caches every byte it downloads, and 15,707 of those files are still on
 * disk. This mirrors scripts/image-size-backfill.ts's own shape and its own
 * three safety properties, one for one:
 *
 *   npx tsx scripts/silhouette-backfill.ts             # measure and write
 *   npx tsx scripts/silhouette-backfill.ts --dry-run   # measure and report only
 *
 * WHAT IT WILL NOT DO, and these are the properties that make it safe to run
 * on a file that is committed to the repo:
 *
 *   - It only ever ADDS sxf/syf/swf/shf. `verdict`, `score`, `checkedAt`,
 *     `width` and `height` are copied through untouched; nothing is
 *     re-judged. A backfilled entry still records the verdict of the run
 *     that actually looked at the photo — this only adds the position that
 *     run already computed and threw away.
 *   - A URL with no cached file is left exactly as it is — not touched, not
 *     rewritten, not marked. Its behaviour stays the pre-backfill fallback
 *     (no transform).
 *   - An entry that already carries all four fractions is skipped without
 *     being re-read, which is what makes this re-runnable: a second run
 *     measures nothing new and writes an identical file.
 *   - Output goes through the same sorted-key writer as the sweep itself, so
 *     the diff is one added set of four numbers per entry and stays
 *     reviewable.
 *
 * WHY THIS FILE IS NOT A THIRD COPY OF image-size-backfill.ts'S measureAll().
 * Reading a box is not reading a header: scripts/image-size-read.py opens a
 * file and reads Pillow's lazy `im.size` without decoding a single pixel,
 * while a silhouette box needs the SAME per-pixel threshold walk
 * scripts/image-box-classify.py's classify() already does — decoding and
 * downscaling the whole image, then scanning every remaining pixel. Measured
 * on this machine: about 66ms/file single-threaded, so 15,707 files in one
 * process is ~17 minutes — tolerable for a one-off sweep script but not for
 * a --dry-run someone runs twice while iterating. Unlike the byte-cheap size
 * read, this is worth the one deliberate addition over the pattern it
 * otherwise mirrors: splitting the file list across several long-lived
 * `silhouette-read.py` worker processes (`--workers`, default the number of
 * CPUs available), each handling its own shard over stdin exactly as
 * measureAll() does with one. Pure CPU-bound work, so OS processes (not
 * threads or async concurrency, which classify()'s pixel loop would not
 * actually parallelise inside one Python interpreter) are what buys the
 * speedup.
 */
import { availableParallelism } from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageBoxCacheFilename } from '../src/catalogue/imageBoxCache.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verdictsPath = resolve(root, 'data/image-box-verdicts.json');
const cacheDir = resolve(root, '.image-box-cache');
const readerPath = resolve(root, 'scripts/silhouette-read.py');

const dryRun = process.argv.includes('--dry-run');
function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const workers = Math.max(1, Number.parseInt(arg('workers') ?? String(availableParallelism()), 10));

/**
 * Mirrors scripts/image-box-check.ts's own VerdictEntry. Deliberately a
 * mirror rather than an import: that script runs `main()` at module scope, so
 * importing anything from it would start a sweep. The one piece that actually
 * MUST NOT drift between the two — how a cache filename is derived from a
 * URL — is imported from src/catalogue/imageBoxCache.ts by both, exactly as
 * scripts/image-size-backfill.ts already does.
 */
interface VerdictEntry {
  verdict: string;
  score: number;
  checkedAt: string;
  width?: number;
  height?: number;
  sxf?: number;
  syf?: number;
  swf?: number;
  shf?: number;
}

interface Box {
  sxf: number;
  syf: number;
  swf: number;
  shf: number;
}

function cachePathFor(url: string): string {
  return resolve(cacheDir, imageBoxCacheFilename(url));
}

/** The sweep's own writer, character for character — see saveVerdicts there. */
function saveVerdicts(verdicts: Record<string, VerdictEntry>): void {
  const sorted: Record<string, VerdictEntry> = {};
  for (const url of Object.keys(verdicts).sort()) sorted[url] = verdicts[url]!;
  writeFileSync(verdictsPath, JSON.stringify(sorted, null, 2) + '\n');
}

/**
 * Feeds one shard of paths to one long-lived python3 process and collects
 * the boxes. Both streams are drained together rather than sequentially for
 * the same reason scripts/image-size-backfill.ts's measureAll() does: a
 * large stdin write blocks once the pipe buffer fills if stdout is not being
 * read.
 */
function measureShard(paths: string[]): Promise<Map<string, Box>> {
  return new Promise((resolvePromise, rejectPromise) => {
    const boxes = new Map<string, Box>();
    if (paths.length === 0) {
      resolvePromise(boxes);
      return;
    }
    const child = spawn('python3', [readerPath], { stdio: ['pipe', 'pipe', 'inherit'] });

    let pending = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) takeLine(line);
    });

    function takeLine(line: string): void {
      if (line === '') return;
      const [path, sxf, syf, swf, shf] = line.split('\t');
      // "ERR" in the sxf column means no box could be measured for this
      // file. Nothing is recorded for it; the entry keeps the shape it
      // already had.
      if (path === undefined || sxf === undefined || sxf === 'ERR') return;
      if (syf === undefined || swf === undefined || shf === undefined) return;
      const box = { sxf: Number(sxf), syf: Number(syf), swf: Number(swf), shf: Number(shf) };
      if (Object.values(box).every((n) => Number.isFinite(n))) boxes.set(path, box);
    }

    child.on('error', rejectPromise);
    child.on('close', () => {
      takeLine(pending);
      resolvePromise(boxes);
    });

    child.stdin.end(paths.join('\n') + '\n');
  });
}

async function measureAll(paths: string[]): Promise<Map<string, Box>> {
  const shards: string[][] = Array.from({ length: workers }, () => []);
  paths.forEach((path, i) => shards[i % workers]!.push(path));
  const perShard = await Promise.all(shards.map((shard) => measureShard(shard)));
  const merged = new Map<string, Box>();
  for (const shard of perShard) for (const [path, box] of shard) merged.set(path, box);
  return merged;
}

async function main(): Promise<void> {
  if (!existsSync(verdictsPath)) {
    console.error(`No verdict file at ${verdictsPath} — nothing to backfill.`);
    process.exitCode = 1;
    return;
  }

  const verdicts = JSON.parse(readFileSync(verdictsPath, 'utf8')) as Record<string, VerdictEntry>;
  const urls = Object.keys(verdicts);

  const hasBox = (u: string): boolean => {
    const e = verdicts[u]!;
    return (
      typeof e.sxf === 'number' && typeof e.syf === 'number' && typeof e.swf === 'number' && typeof e.shf === 'number'
    );
  };
  const alreadyBoxed = urls.filter(hasBox);
  const needBox = urls.filter((u) => !hasBox(u));

  // Path -> URL rather than the other way round: two different URLs cannot
  // collide on one path (the name is a sha1 of the URL), so this stays
  // one-to-one, exactly as scripts/image-size-backfill.ts's own map does.
  const urlByPath = new Map<string, string>();
  for (const url of needBox) {
    const path = cachePathFor(url);
    if (existsSync(path)) urlByPath.set(path, url);
  }
  const uncached = needBox.length - urlByPath.size;

  console.log(
    `${urls.length} verdict entries: ${alreadyBoxed.length} already boxed, ` +
      `${needBox.length} without a box, of which ${urlByPath.size} have a cached file to measure ` +
      `and ${uncached} do not. Measuring with ${workers} worker(s).`,
  );

  const boxes = await measureAll([...urlByPath.keys()]);

  let added = 0;
  for (const [path, box] of boxes) {
    const url = urlByPath.get(path);
    if (url === undefined) continue;
    const entry = verdicts[url]!;
    // Spread first so sxf/syf/swf/shf land after width/height, matching the
    // key order scripts/image-box-check.ts writes for a freshly swept entry.
    verdicts[url] = { ...entry, ...box };
    added++;
  }

  const unmeasurable = urlByPath.size - added;
  const stillNone = urls.length - alreadyBoxed.length - added;

  if (dryRun) {
    console.log(`--dry-run: would add a box to ${added} entries; nothing written.`);
  } else {
    saveVerdicts(verdicts);
    console.log(`Added sxf/syf/swf/shf to ${added} entries.`);
  }
  console.log(
    `${unmeasurable} cached files had no silhouette to bound (left untouched); ` +
      `${stillNone} entries still carry no box.`,
  );
}

void main();
