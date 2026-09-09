import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { imageBoxCacheFilename } from '../src/catalogue/imageBoxCache.js';

/**
 * This mapping is the only thing scripts/image-box-check.ts (which WRITES the
 * cache) and scripts/image-size-backfill.ts (which READS it) share, and it
 * used to be a private function inside the first of those. If the two ever
 * disagreed by a character the failure would be silent — every lookup misses,
 * the cache looks empty, and the backfill reports that it found nothing to
 * measure — so it is pinned here rather than left to reviewer attention.
 */
describe('imageBoxCacheFilename', () => {
  it('is the sha1 of the whole URL plus the path extension', () => {
    const url = 'https://allbeauty.com/cdn/shop/files/3349.jpg?v=1788766552&width=1920';
    const hash = createHash('sha1').update(url).digest('hex');
    expect(imageBoxCacheFilename(url)).toBe(`${hash}.jpg`);
  });

  it('hashes the query string too, so two renditions of one photo are separate files', () => {
    // beautybase and allbeauty store `?width=` in the URL and the sweep
    // downloads exactly what is stored, so `…?width=1920` and `…?width=3000`
    // are genuinely different images and must not collide.
    const a = imageBoxCacheFilename('https://allbeauty.com/cdn/shop/files/3349.jpg?width=1920');
    const b = imageBoxCacheFilename('https://allbeauty.com/cdn/shop/files/3349.jpg?width=3000');
    expect(a).not.toBe(b);
  });

  it('keeps the real extension for each format the sweep downloads', () => {
    const cases: Record<string, string> = {
      'https://x.test/a.jpg': '.jpg',
      'https://x.test/a.jpeg': '.jpeg',
      'https://x.test/a.png': '.png',
      'https://x.test/a.webp': '.webp',
      'https://x.test/a.gif': '.gif',
      'https://x.test/a.avif': '.avif',
    };
    // Real proportions in the 15,707-file cache on 2026-09-09: 12,345 .jpg,
    // 2,803 .png, 553 .webp, 5 .avif, 1 .gif — every one of these occurs.
    for (const [url, ext] of Object.entries(cases)) {
      expect(imageBoxCacheFilename(url).endsWith(ext)).toBe(true);
    }
  });

  it('upper-cases an extension down to lower case', () => {
    expect(imageBoxCacheFilename('https://x.test/a.JPG').endsWith('.jpg')).toBe(true);
  });

  it('falls back to .jpg for an unrecognised or absent extension', () => {
    // A URL path can end in anything. The fallback is safe because every
    // reader of this cache sniffs the file's bytes, not its name.
    expect(imageBoxCacheFilename('https://x.test/image').endsWith('.jpg')).toBe(true);
    expect(imageBoxCacheFilename('https://x.test/image.aspx').endsWith('.jpg')).toBe(true);
    expect(imageBoxCacheFilename('https://x.test/photo?format=jpg').endsWith('.jpg')).toBe(true);
  });

  it('produces a filename with no path separators in it', () => {
    // It is joined onto the cache directory by the caller; anything that
    // could escape that directory would be a real hazard.
    const name = imageBoxCacheFilename('https://x.test/deep/nested/path/a.png');
    expect(name).toMatch(/^[0-9a-f]{40}\.png$/);
  });
});
