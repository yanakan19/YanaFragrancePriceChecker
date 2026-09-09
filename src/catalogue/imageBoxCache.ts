import { createHash } from 'node:crypto';
import { extname } from 'node:path';

/**
 * How a downloaded product photo is named inside `.image-box-cache/`.
 *
 * Extracted from scripts/image-box-check.ts on 2026-09-09 so that a second
 * script can find the same file. There must be exactly one definition of this
 * mapping: two copies that drift by a character stop finding each other's
 * cached bytes, and the failure is silent — the cache simply looks empty and
 * every photo is re-downloaded, which is precisely the cost the cache exists
 * to avoid. It could not be imported from that script directly because
 * image-box-check.ts calls `main()` at module scope, so importing it would
 * start a sweep.
 *
 * The extension is kept (rather than hashing to a bare name) so the files are
 * readable by anything that dispatches on extension, Pillow included, and is
 * whitelisted rather than trusted: a URL path can end in anything at all, and
 * an unrecognised or absent extension falls back to `.jpg`, which is what the
 * overwhelming majority of these are. The consequence — a PNG saved under
 * `.jpg` because its URL did not say so — is harmless here: every reader of
 * this cache sniffs the file's own bytes rather than its name.
 *
 * `.image-box-cache/` itself is git-ignored. These are retailers' photographs
 * and are never committed.
 */
export function imageBoxCacheFilename(url: string): string {
  const hash = createHash('sha1').update(url).digest('hex');
  let ext = extname(new URL(url).pathname).toLowerCase();
  if (!/^\.(jpe?g|png|webp|gif|avif)$/.test(ext)) ext = '.jpg';
  return `${hash}${ext}`;
}
