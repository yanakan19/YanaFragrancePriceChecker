/**
 * Reading a Perfume Click product page for its own picture of the product.
 *
 * Perfume Click's Awin feed carries `https://bgstatic.net/photos/<id>_ml.jpg`,
 * a thumbnail 41 to 195 pixels wide and 130 high (measured on 30 and again on
 * 8 files, 2026-10-05; the long edge of every one was 195 or less). The shop's
 * own product page shows a bigger file of the same photo:
 *
 *   <div id="prodImg" ...><img itemprop="image" src="https://bgstatic.net/photos/169946_xl_1.jpg"
 *       width="263" height="322" />
 *
 * 40 of 40 pages read on 2026-10-05 (every 40th product whose only photo was
 * Perfume Click's) named a `<id>_xl_1.jpg` file with the same `<id>` as the
 * feed's `_ml` file, 322 to 445 pixels on the long edge. That is the shop's own picture of its own
 * listing, on its own image host, so it is covered by the same D24 basis as the
 * feed's thumbnail.
 *
 * The earlier note on THUMBNAIL_IMAGE_RETAILERS (pickImage.ts), "there is no
 * larger perfume-click photo to fetch", tried `_xl`, `_l`, `_lg`, `_big`, `_large`,
 * `_zoom`, `_xxl` and `_2x` in place of `_ml`. None of them is the name used. The
 * address is only known by reading the page, which is what this module does.
 */

/** The picture in the product page's own image box, or null when the page has none. */
export function parseProductPageImage(html: string): string | null {
  const m = html.match(/<div[^>]*\bid="prodImg"[^>]*>\s*<img[^>]*\bsrc="([^"]+)"/i);
  if (!m) return null;
  const url = decodeEntities(m[1]!.trim());
  return /^https:\/\/bgstatic\.net\/photos\/\d+_[a-z0-9_]+\.(?:jpe?g|png|webp)$/i.test(url) ? url : null;
}

/** The product page's `<title>`, tags and entities removed. */
export function parsePageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]!.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : null;
}

/** The file number in a bgstatic photo address (`169946` in `.../photos/169946_xl_1.jpg`). */
export function photoId(url: string | null): string | null {
  const m = url?.match(/\/photos\/(\d+)_/);
  return m ? m[1]! : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function words(s: string): Set<string> {
  const cleaned = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return new Set(cleaned.split(' ').filter((w) => w !== ''));
}

/**
 * Whether the page is about the listing the feed row describes: the share of the
 * feed title's words that the page title also carries. The feed and the page
 * are the shop's own data for one product, so this is a check that the address
 * (`merchantUrl`) still belongs to the product, not a match between two shops.
 */
export function titleOverlap(feedTitle: string, pageTitle: string): number {
  const a = words(feedTitle);
  if (a.size === 0) return 0;
  const b = words(pageTitle);
  let hit = 0;
  for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}

/**
 * The rule for taking the page's picture in place of the feed's:
 *  - the page's image is on the shop's photo host and carries the same file number
 *    as the feed's picture (when the feed has one), so it is the same product record;
 *  - the page title shares at least 60% of the feed title's words;
 *  - the picture measures at least 250 pixels on its long edge (the feed's file is
 *    195 at most), so it is a real gain and not a swap of one thumbnail for another.
 */
export const MIN_BETTER_LONG_EDGE = 250;
export const MIN_TITLE_OVERLAP = 0.6;

export function acceptPagePhoto(args: {
  feedImage: string | null;
  feedTitle: string;
  pageImage: string;
  pageTitle: string | null;
  size: { width: number; height: number };
}): { ok: true } | { ok: false; reason: string } {
  const feedId = photoId(args.feedImage);
  if (args.feedImage !== null && feedId !== null && photoId(args.pageImage) !== feedId) {
    return { ok: false, reason: 'other-photo-number' };
  }
  if (args.pageTitle === null || titleOverlap(args.feedTitle, args.pageTitle) < MIN_TITLE_OVERLAP) {
    return { ok: false, reason: 'title-mismatch' };
  }
  const long = Math.max(args.size.width, args.size.height);
  if (long < MIN_BETTER_LONG_EDGE) return { ok: false, reason: 'too-small' };
  return { ok: true };
}
