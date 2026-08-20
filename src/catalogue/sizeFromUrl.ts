import { ML_SIZE_RE, OZ_SIZE_RE } from './fragranceId.js';

/**
 * Recover a bottle size a shop states in its own product URL but omits from
 * the product title.
 *
 * ── The shop this exists for, measured ──────────────────────────────────────
 * Zimaya (`uk.zimayaperfumes.com`) harvests cleanly: run 261 (job 96314578076)
 * stored 84 real, in-stock, sterling-priced listings. Every one of them was
 * then rejected by `isFragrance`, because that function needs a size before it
 * will treat a listing as a comparable bottle and Zimaya titles its products
 * with the name alone — "Ghali Imperial", "Ode to Rose Royale", "Rabab Gems".
 * A shop with no size is a shop that cannot honestly be compared, and 84 of 84
 * had none *in the title*.
 *
 * They are not, however, absent from the shop's own data. 50 of those 84
 * carry the size in the product URL Zimaya itself publishes:
 *
 *     https://uk.zimayaperfumes.com/products/itqan-gold-edp-100ml
 *     https://uk.zimayaperfumes.com/products/al-kaser-100ml
 *     https://uk.zimayaperfumes.com/products/abadi-saga-pour-homme-edp-100ml
 *
 * That is the retailer stating the size, in a field we already hold, in a
 * place nothing was reading. Reading it is recovery, not inference: the
 * number is theirs and the listing links to the page it came from. The other
 * 34 stay unsized and stay out, which is the correct outcome — this recovers
 * a stated size, it never guesses one.
 *
 * ── Why it is this conservative ─────────────────────────────────────────────
 * A slug is a weaker source than a title, so it is only consulted where the
 * title is silent, and only when the slug is unambiguous:
 *
 *   - The title must state no size at all, in ml or oz. A title that says
 *     50ml against a URL that says 100ml is a variant-level disagreement and
 *     the title wins, always.
 *   - The slug must name exactly one size. "…-3x10ml-set" or a slug with two
 *     numbers in it is a set or an ambiguity, and neither is a single bottle.
 *   - The size must be plausible for a bottle: 1-1000ml. This is what keeps a
 *     product id that happens to end in digits followed by "ml" from being
 *     read as a size — and, more to the point, keeps a year or an SKU out.
 *
 * The recovered size is appended to the title rather than stored in a new
 * field, because every consumer in this codebase — `sizeMl`, `isFragrance`,
 * `productName.ts`, the matcher — reads the title, and a second source of
 * truth for size is exactly the drift this project's own `ML_SIZE_RE` comment
 * warns about. The patterns used here are imported from `fragranceId.ts` for
 * the same reason: one definition of what a size looks like, not two.
 */

/** A size token in a URL slug: "100ml", "3-4-oz", "50-ml". */
const SLUG_ML = /(?:^|[^0-9a-z])(\d{1,4}(?:[.-]\d)?)[ -]?ml(?![0-9a-z])/gi;

/** Smallest and largest plausible single-bottle size, in millilitres. */
const MIN_ML = 1;
const MAX_ML = 1000;

/** The last path segment of a URL, lowercased, or null if it will not parse. */
export function slugOf(url: string): string | null {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    const seg = path.slice(path.lastIndexOf('/') + 1);
    return seg ? decodeURIComponent(seg).toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * The single millilitre size a product URL states, or null when it states
 * none, more than one, or one that is not a plausible bottle.
 */
export function sizeMlFromUrl(url: string): number | null {
  const slug = slugOf(url);
  if (!slug) return null;

  const matches = [...slug.matchAll(SLUG_ML)];
  if (matches.length !== 1) return null;

  const ml = Math.round(Number.parseFloat(matches[0]![1]!.replace('-', '.')));
  if (!Number.isFinite(ml) || ml < MIN_ML || ml > MAX_ML) return null;
  return ml;
}

/**
 * The title as it should be stored: unchanged where it already states a size,
 * and with the size the shop's own URL states appended where it does not.
 */
export function titleWithSizeFromUrl(rawTitle: string, url: string): string {
  const title = rawTitle.trim();
  if (!title) return rawTitle;
  if (ML_SIZE_RE.test(title) || OZ_SIZE_RE.test(title)) return rawTitle;

  const ml = sizeMlFromUrl(url);
  if (ml === null) return rawTitle;
  return `${title} ${ml}ml`;
}
