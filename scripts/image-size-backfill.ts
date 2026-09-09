/**
 * Fills in `width`/`height` on existing data/image-box-verdicts.json entries
 * from photos already sitting in .image-box-cache — no downloads, no
 * re-classification, no network at all.
 *
 * WHY THIS EXISTS. pickImage.ts's isTooSmallToSwapTo() prefers a photo's real
 * measured size and falls back to the per-retailer THUMBNAIL_IMAGE_RETAILERS
 * list only when none is recorded. Sizes were added to the sweep on
 * 2026-09-09, so every entry written before that carries none, and on
 * 2026-09-09 that was all 29,711 of them — the per-photo rule was correct and
 * completely dormant. Re-running the sweep to fill them in would re-download
 * and re-classify tens of thousands of photos for numbers already on this
 * disk: scripts/image-box-check.ts caches every byte it downloads, and 15,707
 * of those files are still there. Their headers are readable in a couple of
 * minutes.
 *
 *   npx tsx scripts/image-size-backfill.ts             # measure and write
 *   npx tsx scripts/image-size-backfill.ts --dry-run   # measure and report only
 *
 * WHAT IT WILL NOT DO, and these are the properties that make it safe to run
 * on a 5.2MB file that is committed to the repo:
 *
 *   - It only ever ADDS `width`/`height`. `verdict`, `score` and `checkedAt`
 *     are copied through untouched; nothing is re-judged. A backfilled entry
 *     still records the verdict of the run that actually looked at the photo.
 *   - A URL with no cached file is left exactly as it is — not touched, not
 *     rewritten, not marked. Its behaviour stays the pre-2026-09-09 fallback.
 *   - An entry that already carries a size is skipped without being re-read,
 *     which is what makes this re-runnable: a second run measures nothing and
 *     writes an identical file.
 *   - Output goes through the same sorted-key writer as the sweep itself, so
 *     the diff is one added pair of integers per entry and stays reviewable.
 *
 * The size is read with Pillow through scripts/image-size-read.py, in one
 * batch, deliberately: that is the same library and the same field the live
 * classifier reports, so a size backfilled here is indistinguishable from one
 * a sweep would have written.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageBoxCacheFilename } from '../src/catalogue/imageBoxCache.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verdictsPath = resolve(root, 'data/image-box-verdicts.json');
const cacheDir = resolve(root, '.image-box-cache');
const readerPath = resolve(root, 'scripts/image-size-read.py');

const dryRun = process.argv.includes('--dry-run');

/**
 * Mirrors scripts/image-box-check.ts's own VerdictEntry. Deliberately a
 * mirror rather than an import: that script runs `main()` at module scope, so
 * importing anything from it would start a sweep. The shared piece that
 * actually MUST NOT drift — how a cache filename is derived from a URL — is
 * imported from src/catalogue/imageBoxCache.ts by both.
 */
interface VerdictEntry {
  verdict: string;
  score: number;
  checkedAt: string;
  width?: number;
  height?: number;
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
 * Feeds every path to one long-lived python3 process and collects the sizes.
 *
 * stdin is written in one go and the result parsed line by line. Both streams
 * are handled together rather than sequentially because a large write to a
 * child's stdin will block once the pipe buffer fills if nobody is draining
 * its stdout.
 */
function measureAll(paths: string[]): Promise<Map<string, { width: number; height: number }>> {
  return new Promise((resolvePromise, rejectPromise) => {
    const sizes = new Map<string, { width: number; height: number }>();
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
      const [path, w, h] = line.split('\t');
      // "ERR" in the width column means the file could not be opened. Nothing
      // is recorded for it; the entry keeps the shape it already had.
      if (path === undefined || w === undefined || h === undefined || w === 'ERR') return;
      const width = Number.parseInt(w, 10);
      const height = Number.parseInt(h, 10);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        sizes.set(path, { width, height });
      }
    }

    child.on('error', rejectPromise);
    child.on('close', () => {
      takeLine(pending);
      resolvePromise(sizes);
    });

    child.stdin.end(paths.join('\n') + '\n');
  });
}

async function main(): Promise<void> {
  if (!existsSync(verdictsPath)) {
    console.error(`No verdict file at ${verdictsPath} — nothing to backfill.`);
    process.exitCode = 1;
    return;
  }

  const verdicts = JSON.parse(readFileSync(verdictsPath, 'utf8')) as Record<string, VerdictEntry>;
  const urls = Object.keys(verdicts);

  const alreadySized = urls.filter((u) => typeof verdicts[u]!.width === 'number');
  const needSize = urls.filter((u) => typeof verdicts[u]!.width !== 'number');

  // Path -> URL rather than the other way round: the child reports paths, and
  // two different URLs cannot collide on one path (the name is a sha1 of the
  // URL), so this stays one-to-one.
  const urlByPath = new Map<string, string>();
  for (const url of needSize) {
    const path = cachePathFor(url);
    if (existsSync(path)) urlByPath.set(path, url);
  }
  const uncached = needSize.length - urlByPath.size;

  console.log(
    `${urls.length} verdict entries: ${alreadySized.length} already sized, ` +
      `${needSize.length} without a size, of which ${urlByPath.size} have a cached file to measure ` +
      `and ${uncached} do not.`,
  );

  const sizes = await measureAll([...urlByPath.keys()]);

  let added = 0;
  for (const [path, size] of sizes) {
    const url = urlByPath.get(path);
    if (url === undefined) continue;
    const entry = verdicts[url]!;
    // Spread first so `width`/`height` land after `checkedAt`, matching the
    // key order scripts/image-box-check.ts writes for a freshly swept entry.
    verdicts[url] = { ...entry, width: size.width, height: size.height };
    added++;
  }

  const unreadable = urlByPath.size - added;
  const stillNone = urls.length - alreadySized.length - added;

  if (dryRun) {
    console.log(`--dry-run: would add a size to ${added} entries; nothing written.`);
  } else {
    saveVerdicts(verdicts);
    console.log(`Added width/height to ${added} entries.`);
  }
  console.log(
    `${unreadable} cached files could not be read as images (left untouched); ` +
      `${stillNone} entries still carry no size.`,
  );
}

void main();
