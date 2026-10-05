import { brandAliasKey, nameCore } from './duplicateKey.js';
import { ML_SIZE_RE, sizeMl } from './fragranceId.js';
import { stripShopTitleLabel } from './productName.js';
import type { RawListing } from './types.js';

/**
 * A rough key for "another shop probably sells this exact bottle", used only to
 * decide which listings have their barcode read first (`readBarcodesFromProductJs`).
 *
 * It is the brand (through its aliases), the fragrance's own words (the name core
 * `scripts/find-duplicates.ts` uses, with strength words and filler taken out) and
 * the size in ml, from a raw listing's title and brand. It is deliberately loose
 * and decides nothing: a listing wrongly thought shared is read a little early, one
 * wrongly thought alone a little late, and the barcode that comes back is what
 * settles the match. Null when the listing gives no brand or no size to key on.
 */
export function siblingKey(l: Pick<RawListing, 'rawTitle' | 'rawBrand'>, retailerId = ''): string | null {
  const brand = l.rawBrand?.trim();
  if (!brand) return null;
  const size = sizeMl(l.rawTitle);
  if (size === null) return null;
  const title = stripShopTitleLabel(l.rawTitle, retailerId).title;
  const words = title.replace(new RegExp(ML_SIZE_RE.source, 'gi'), ' ').replace(/[()]/g, ' ');
  const core = nameCore(words, brand);
  if (!core) return null;
  return `${brandAliasKey(brand)}|${core}|${size}`;
}
