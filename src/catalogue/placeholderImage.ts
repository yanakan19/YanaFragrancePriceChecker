/**
 * Image URLs that are not photographs of a product at all.
 *
 * WHY THIS EXISTS. A retailer feed is free to publish an `imageUrl` that
 * points at the feed platform's own "sorry, nothing here" graphic rather than
 * at the product. Nothing downstream can tell the difference — pickImage.ts
 * ranks and dates whatever URLs it is handed, image-box-check.ts happily
 * classifies the graphic, and the app renders it — so the only place the
 * distinction can be made is at the point the URL is read. That is what this
 * module is for: a placeholder is rejected as if the feed had published no
 * image at all, which it effectively did.
 *
 * A product left with NO photo is the right outcome here, and the app already
 * handles it: `CatalogueEntry.image` is `string | null` and demo/photo.ts
 * draws the site's own fallback for null. Showing nothing beats showing a
 * 70x70 grey camera icon that says "No image available".
 *
 * ── What is on the list, and how it got there (2026-09-09) ─────────────────
 * `https://images2.productserve.com/noimage.gif` — Awin's placeholder,
 * reaching this project through perfume-click's Awin product feed. Downloaded
 * and opened: a 70x70 GIF, 959 bytes, a grey camera outline over the words
 * "No image available". It is stored as the `imageUrl` of 1,237 of the 11,639
 * listings in data/catalogue/perfume-click.json, and before this module
 * existed it was the *displayed* product photo for 348 of the 12,871
 * catalogue products that have one — comfortably the most-repeated displayed
 * image on the site, and by a factor of 70: the next-most-repeated displayed
 * photo appears 5 times.
 *
 * ── What was checked and deliberately NOT added ────────────────────────────
 * The same 2026-09-09 pass counted every `imageUrl` across all of
 * data/catalogue/*.json (51,474 distinct URLs) on the reasoning that a real
 * product photo is near-unique, so a URL on dozens of listings is a
 * placeholder, a logo or a sprite. The top repeats after noimage.gif were
 * downloaded and looked at, and every one of them is a real photograph:
 *
 *   - 174x nicchia-luxury-uk `campioncino_generico.jpg` ("generic sample"):
 *     1600x1920, a real photo of the decant atomiser this shop actually ships
 *     for its sample listings. Generic across products, but a photograph of
 *     the article sold, not a "no image" graphic. It is also never displayed
 *     — 0 of the 12,871 displayed photos are it.
 *   - 48x/40x/39x… escentual `lancome_teint_idole_ultra_wear_foundation_105w`
 *     and siblings: 1080x1080 studio shots of a foundation bottle, shared
 *     across that product's shade variants. Exactly the legitimate shared
 *     photo this survey has to avoid condemning on count alone.
 *   - 35x avon `prod_1195762_1.jpg`: 1000x1000, an Avon Power Stay sachet.
 *     Again one photo across many shades.
 *
 * None of those three is displayed anywhere today, and none is a placeholder.
 * They are recorded here so a later pass does not re-download them to reach
 * the same conclusion.
 *
 * ── Matching is by exact URL, on purpose ───────────────────────────────────
 * Not by pattern. A filename containing "noimage" is weak evidence and
 * "placeholder"-shaped path matching would be exactly the kind of guess that
 * could blank a real photo. Every entry below has been fetched and viewed.
 *
 * The one caveat worth writing down: Awin numbers these hosts
 * (images1/images2/images3.productserve.com). Only `images2` appears in this
 * project's data today — 1,237 listings, 0 on any other productserve host —
 * so only `images2` is listed. If a merchant ever arrives on a differently
 * numbered host, the way to find it is the survey above: count `imageUrl`
 * values across data/catalogue/*.json and look at anything unusually
 * repeated.
 */
export const PLACEHOLDER_IMAGE_URLS: ReadonlySet<string> = new Set([
  'https://images2.productserve.com/noimage.gif',
]);

/**
 * True for a URL that is a known placeholder graphic rather than a photo.
 *
 * Null and empty are `false`, not `true`: "no URL" is already the absence
 * this function exists to convert placeholders into, and callers treat the
 * two identically. Comparison is case-folded and trimmed because a feed's
 * whitespace and host casing are not meaningful — nothing else about the URL
 * is normalised, since anything cleverer would be pattern matching, which
 * this list deliberately is not (see the header).
 */
export function isPlaceholderImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDER_IMAGE_URLS.has(url.trim().toLowerCase());
}

/**
 * The URL, or null if it is a placeholder — the form every caller actually
 * wants, since "this is not a photo" and "there is no photo" have the same
 * consequence everywhere downstream.
 */
export function rejectPlaceholderImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return isPlaceholderImageUrl(url) ? null : url;
}
