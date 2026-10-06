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
import { isGiftSet, normalisedSetTitle } from './giftSet.js';

/** Old id to the id of the product that now holds it. */
export type IdAliases = Record<string, string>;

/** What data/id-aliases.json holds. */
export interface IdAliasFile {
  aliases: IdAliases;
}

/** The longest chain of folds followed before an alias is judged a loop and not published. */
const MAX_HOPS = 12;

/**
 * Every id a listing has answered to, other than the one its product carries:
 * the SKU form `<shop>-<sku>` (the id before any barcode was known, and again
 * if the barcode is later found untrustworthy), and the barcode form
 * `ean-<ean>` (where a shop gained a barcode), and for a gift set its title form
 * `set-<title>` and its barcode form `set-ean-<ean>`. A barcode this shop has printed
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
  // A gift set is keyed `set-ean-<ean>` where it has a barcode and `set-<title>`
  // where it has none (giftSetId), never by shop and SKU. A set that gains a
  // barcode (Perfume Direct's, read from its product files) changes id, and the
  // id it had until then is its title form, so that is the one that must answer
  // for it. Measured on 839 barcodes read: 100 set addresses went to Page Not
  // Found before this form was listed.
  const full = l as StoredListing;
  if (typeof full.rawTitle === 'string' && isGiftSet(full)) {
    const title = normalisedSetTitle(full.rawTitle);
    if (title) forms.add(`set-${title}`);
    if (ean) forms.add(`set-ean-${ean}`);
  }
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

/**
 * The ids a catalogue file held, read from its generated text. Reads both forms
 * the build has written: indented JSON up to 2026-10-06, where each product's
 * id is its own `    "id": "…"` line, and one product per line since
 * (oneEntryPerLine in scripts/dataLiterals.ts), where each product's line
 * starts `{"id":"…"`. A build reads the file the last build wrote, and
 * scripts/id-alias-seed.sh reads every version in the branch's history, so
 * both forms must keep reading.
 */
export function productIdsIn(generatedCatalogue: string): Set<string> {
  // Only the catalogue's own entries: the house products further down carry an
  // id too and are not pages.
  const start = generatedCatalogue.indexOf('const CATALOGUE_CHUNK_0');
  const end = generatedCatalogue.indexOf('export const CRAWLED');
  const text = start >= 0 && end > start ? generatedCatalogue.slice(start, end) : generatedCatalogue;
  const ids = new Set<string>();
  for (const m of text.matchAll(/^(?: {4}"id": |\{"id":)"([^"]+)"/gm)) ids.add(m[1]!);
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
  /**
   * The RECORD, what data/id-aliases.json holds: append only. Every key of
   * `previous` is here with the value it had; a build only adds keys. It is a
   * memory, not what the page serves, so a key may name a product that has
   * since been folded again (a chain), be a live page again, or lead nowhere.
   */
  aliases: IdAliases;
  /** What the page serves (ID_ALIASES): each id that is no page now, with the live page or page with no current prices it resolves to. */
  published: IdAliases;
  /** Keys this build added from its own decisions. */
  fresh: number;
  /** Earlier keys kept unchanged. */
  carried: number;
  /** Chain links added so an earlier key whose target had gone reaches the product its id was folded into. */
  healed: number;
  /** Recorded keys that are a page again: the page wins, the record stays so the id can be folded again. */
  pageAgain: number;
  /** Recorded keys that resolve to no page now (the product is gone everywhere): kept, not published, the page says Not Found. */
  unresolved: number;
  /** Ids this build folded that were never a page, so are not recorded. */
  neverAPage: number;
}

/**
 * Follows `start` through the record to the first page (live, or with no
 * current prices). A page wins over its own alias: an id that is a page again is
 * returned as itself. Null when the chain ends on a non-page or loops.
 */
export function resolveAlias(
  start: string,
  record: Readonly<IdAliases>,
  isPage: (id: string) => boolean,
): string | null {
  let t = start;
  const seen = new Set<string>();
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (isPage(t)) return t;
    if (seen.has(t)) return null;
    seen.add(t);
    const next = Object.prototype.hasOwnProperty.call(record, t) ? record[t] : undefined;
    if (next === undefined) return null;
    t = next;
  }
  return null;
}

/**
 * The record a build writes, and what the page serves from it.
 *
 * APPEND ONLY (CLAUDE.md, docs/PRODUCT-URLS.md): every key of `previous` stays,
 * with its value. Earlier builds dropped a key when its target stopped being a
 * page and re-pointed it when the target was folded again; 50 old addresses were
 * lost that way. Now:
 *   - a new decision adds a key; it never rewrites one. Where a decision names
 *     the survivor of an id the record already holds and the recorded target no
 *     longer leads to a page, the chain gets its missing link (the target's
 *     last known name, as a new key, points at the survivor) so the old key and
 *     the new truth are both kept;
 *   - an id that is a page again is served as that page, and stays recorded;
 *   - an id that leads to no page is recorded and not published.
 * The shipped map (`published`) is flat: one hop from an old id to its page.
 */
export function settleIdAliases(input: SettleInput): SettleResult {
  const { previous, wasPage, successors, live, dormant } = input;
  const isPage = (id: string) => live.has(id) || dormant.has(id);
  const aliases = new Map<string, string>(Object.entries(previous));
  let neverAPage = 0;
  let fresh = 0;
  let healed = 0;

  for (const [id, survivor] of successors) {
    if (id === survivor || isPage(id) || !live.has(survivor)) continue;
    if (aliases.has(id)) continue; // never change a recorded value; healing below
    if (!wasPage.has(id)) {
      neverAPage++;
      continue;
    }
    aliases.set(id, survivor);
    fresh++;
  }

  // Heal chains: a recorded id whose chain ends on something that is no page and
  // is not recorded either, while this build knows where the id (or a link of
  // its chain) went. The dead end gets a key of its own; nothing is rewritten.
  const asRecord = () => Object.fromEntries(aliases);
  for (const id of [...aliases.keys()].sort()) {
    if (isPage(id)) continue;
    let end = id;
    let known: string | undefined;
    const seen = new Set<string>();
    while (!seen.has(end)) {
      seen.add(end);
      if (!known && successors.has(end) && live.has(successors.get(end)!)) known = successors.get(end);
      if (isPage(end)) break;
      const next = aliases.get(end);
      if (next === undefined) break;
      end = next;
    }
    if (known && !isPage(end) && !aliases.has(end) && end !== known && !seen.has(known)) {
      aliases.set(end, known);
      healed++;
    }
  }

  const record = asRecord();
  const published: IdAliases = {};
  let unresolved = 0;
  let pageAgain = 0;
  let carried = 0;
  for (const id of [...aliases.keys()].sort()) {
    if (Object.prototype.hasOwnProperty.call(previous, id)) carried++;
    if (isPage(id)) {
      if (Object.prototype.hasOwnProperty.call(previous, id)) pageAgain++;
      continue;
    }
    let to = resolveAlias(id, record, isPage);
    // A recorded chain can close on itself: a product folded one way in one build
    // and the other way in a later one leaves A -> B and B -> A on file (Perfume
    // Direct's 50942PD and Lookfantastic's 15742061, when the barcode changed which
    // record survives). Neither key can be rewritten, so the record keeps both and
    // the shipped map uses this build's own decision for the id, which names the
    // page that holds it now.
    if (to === null || to === id) {
      const decided = successors.get(id);
      to = decided !== undefined && decided !== id && live.has(decided) ? decided : null;
    }
    if (to === null || to === id) {
      unresolved++;
      continue;
    }
    published[id] = to;
  }

  const sorted: IdAliases = {};
  for (const id of [...aliases.keys()].sort()) sorted[id] = aliases.get(id)!;
  assertAppendOnly(previous, sorted);
  return { aliases: sorted, published, fresh, carried, healed, pageAgain, unresolved, neverAPage };
}

/**
 * Throws if `next` lacks a key of `previous` or holds it with another value.
 * The build calls this through settleIdAliases, and tests call it on fixtures.
 */
export function assertAppendOnly(previous: Readonly<IdAliases>, next: Readonly<IdAliases>): void {
  const lost: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of Object.entries(previous)) {
    if (!Object.prototype.hasOwnProperty.call(next, k)) lost.push(k);
    else if (next[k] !== v) changed.push(k);
  }
  if (lost.length || changed.length) {
    throw new Error(
      `data/id-aliases.json is append only: ${lost.length} keys would be lost (${lost.slice(0, 3).join(', ')}), ` +
        `${changed.length} changed (${changed.slice(0, 3).join(', ')}). Fix the build; never write a smaller or rewritten set.`,
    );
  }
}
