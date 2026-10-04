/**
 * Product addresses that were folded into another product.
 *
 * A product's id is the identity of the first listing the build met for it: an
 * EAN, or the shop and the shop's own SKU. When two products turn out to be
 * the same bottle (a brand merge, a house's own wording of a name, a pre-order
 * notice taken out of a title, a barcode one shop gained) one record absorbs
 * the other and the absorbed id leaves the catalogue. Its address, which a
 * shopper may have bookmarked and a search engine may have indexed, answered
 * Page Not Found.
 *
 * This module is the pure half of the fix: the build (scripts/build-demo-
 * catalogue.ts) works out, from the merge decisions it has just made, which
 * old id each surviving product now answers for, and settles them here with
 * what earlier builds recorded in data/id-aliases.json. The app reads the
 * result from the same lazy data file as the products with no current prices
 * (demo/dormantStore.ts), so the first load does not grow.
 *
 * Nothing in it is a hand list. An id is aliased only when
 *   - the build itself folded it into a live product (its merge decision), or
 *   - it names a listing that belongs to a live product by another name: the
 *     same shop's SKU where the product is now keyed on a barcode, or an
 *     earlier or later state of the same Shopify variant (see lineageKey), and
 *   - it was a page before this build (it was in the last catalogue, or in the
 *     history the seed was taken from), so an id nobody could have linked to is
 *     never published, and the data file stays the size of the real problem.
 */
import type { StoredListing } from './types.js';
import { trustworthyEan } from './productMatch.js';

/** Old id to the id of the product that now holds it. */
export type IdAliases = Record<string, string>;

/** What data/id-aliases.json holds. */
export interface IdAliasFile {
  aliases: IdAliases;
}

/** The longest chain of folds followed before an alias is judged a loop and dropped. */
const MAX_HOPS = 12;

/**
 * Every id a listing has answered to, other than the one its product carries:
 * the SKU form `<shop>-<sku>` (the id before any barcode was known, and again
 * if the barcode is later found untrustworthy), and the barcode form
 * `ean-<ean>` (where a shop gained a barcode). A barcode this shop has printed
 * on two different products is no identity and is left out, exactly as
 * fragranceId() leaves it out.
 */
export function listingIdForms(
  l: Pick<StoredListing, 'retailerId' | 'retailerSku' | 'ean'>,
  untrustworthy: ReadonlySet<string>,
): string[] {
  const forms = new Set<string>();
  forms.add(`${l.retailerId}-${l.retailerSku}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase());
  const ean = trustworthyEan(l as StoredListing, untrustworthy);
  if (ean) forms.add(`ean-${ean}`);
  return [...forms];
}

/**
 * The identity of a Shopify variant across the renames of its SKU, or null for
 * a shop whose SKUs are not Shopify's.
 *
 * Shopify listings are keyed `<variant id>-<option title>`. The option title is
 * the shop's to change: Emirates Oud's Hawas Boa was "16475975680349-Default
 * Title", then "...-PRE-ORDER: Estimated dispatch: 9th October", then "...-7th
 * October", three SKUs and so three ids for one bottle on one page. The leading
 * variant id is Shopify's own and never reused for another variant, so two
 * listings of one shop sharing it are one variant. Nine digits or more, because
 * a short leading number in another system's SKU ("12-ML") says nothing.
 */
export function lineageKey(l: Pick<StoredListing, 'retailerId' | 'retailerSku'>): string | null {
  const m = /^(\d{9,})-/.exec(l.retailerSku);
  return m ? `${l.retailerId}:${m[1]}` : null;
}

/** The ids a catalogue file held, read from its generated text (one `"id"` line per product). */
export function productIdsIn(generatedCatalogue: string): Set<string> {
  // Only the catalogue's own entries: the house products further down carry an
  // id too and are not pages.
  const start = generatedCatalogue.indexOf('const CATALOGUE_CHUNK_0');
  const end = generatedCatalogue.indexOf('export const CRAWLED');
  const text = start >= 0 && end > start ? generatedCatalogue.slice(start, end) : generatedCatalogue;
  const ids = new Set<string>();
  for (const m of text.matchAll(/^ {4}"id": "([^"]+)"/gm)) ids.add(m[1]!);
  return ids;
}

/** The ids of the products with no current prices a dormant file held, read from its generated text. */
export function dormantIdsIn(generatedDormant: string): Set<string> {
  const ids = new Set<string>();
  for (const m of generatedDormant.matchAll(/"([^"]+)":\{"brand":/g)) ids.add(m[1]!);
  return ids;
}

export interface SettleInput {
  /** What the last build recorded (data/id-aliases.json). */
  previous: Readonly<IdAliases>;
  /** Ids that were pages before this build: the last catalogue's, its dormant pages, and any seeded history. */
  wasPage: ReadonlySet<string>;
  /** This build's merge decisions: an id and the live product it belongs to. */
  successors: ReadonlyMap<string, string>;
  /** The ids of the catalogue this build wrote. */
  live: ReadonlySet<string>;
  /** The ids of the products with no current prices this build wrote. */
  dormant: ReadonlySet<string>;
}

export interface SettleResult {
  aliases: IdAliases;
  /** Aliases made by this build's own decisions. */
  fresh: number;
  /** Earlier aliases kept, with their target moved on where it had since been folded again. */
  carried: number;
  /** Earlier aliases dropped because their target is no longer any page. */
  dropped: number;
  /** Ids this build folded that were never a page, so are not published. */
  neverAPage: number;
}

/**
 * The aliases a build publishes: this build's decisions for ids that were
 * pages, plus every earlier alias still worth keeping, with chains followed to
 * the product that holds the id now.
 *
 * An id that is a page again (live, or a page with no current prices) is never
 * an alias: a page that exists is not redirected. An alias whose target is no
 * page at all is dropped, since it would only swap one Page Not Found for
 * another.
 */
export function settleIdAliases(input: SettleInput): SettleResult {
  const { previous, wasPage, successors, live, dormant } = input;
  const isPage = (id: string) => live.has(id) || dormant.has(id);
  const aliases = new Map<string, string>();
  let neverAPage = 0;

  for (const [id, survivor] of successors) {
    if (id === survivor || isPage(id) || !live.has(survivor)) continue;
    if (!wasPage.has(id)) {
      neverAPage++;
      continue;
    }
    aliases.set(id, survivor);
  }
  const fresh = aliases.size;

  /** Follows a target through this build's folds and the aliases made so far to the page that holds it now. */
  const settleTarget = (start: string): string | null => {
    let t = start;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (live.has(t)) return t;
      const next = successors.get(t) ?? aliases.get(t);
      if (next === undefined || next === t) return dormant.has(t) ? t : null;
      t = next;
    }
    return null;
  };

  let carried = 0;
  let dropped = 0;
  for (const [id, target] of Object.entries(previous)) {
    if (aliases.has(id)) continue;
    if (isPage(id)) continue; // a page again: not redirected, and not counted as dropped, it simply came back
    const settled = settleTarget(target);
    if (settled === null || settled === id) {
      dropped++;
      continue;
    }
    aliases.set(id, settled);
    carried++;
  }

  const sorted: IdAliases = {};
  for (const id of [...aliases.keys()].sort()) sorted[id] = aliases.get(id)!;
  return { aliases: sorted, fresh, carried, dropped, neverAPage };
}
