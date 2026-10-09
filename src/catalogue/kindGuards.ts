/**
 * The points at which a set or an oil is kept from ever merging with a
 * bottle (docs/GIFT-SETS-AND-OILS-PLAN.md, section 4.1; the strength point, that an oil's matchKey carries
 * `Perfume Oil`, is held on productMatch.matchKey itself by tests/setsOilsGuardrails.test.ts), as functions that
 * return what they found, so a test can hold the real catalogue to them and
 * hold a deliberately broken fixture to them too, and the build can refuse to
 * write a catalogue that breaks one.
 *
 * Each returns a list of plain sentences, empty when the rule holds.
 */

import { isOilStrength } from './perfumeOil.js';

/** The fields every check needs, true of a build product and of a catalogue entry alike. */
export interface KindedProduct {
  id: string;
  ean: string | null;
  concentration: string;
  /** Present (not null, not undefined) only on a set. */
  giftSet?: unknown;
}

type Kind = 'bottle' | 'set' | 'oil';

function kindOf(p: KindedProduct): Kind {
  if (p.giftSet !== null && p.giftSet !== undefined) return 'set';
  return isOilStrength(p.concentration) ? 'oil' : 'bottle';
}

/**
 * 1. Namespace. Every set has a `set-` id and every `set-` id belongs to a set,
 * and no id is used twice. A set carrying its headline bottle's barcode is
 * therefore never the same product as that bottle.
 */
export function namespaceViolations(products: readonly KindedProduct[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const isSet = kindOf(p) === 'set';
    const setId = p.id.startsWith('set-');
    if (isSet && !setId) out.push(`${p.id} is a set without a set- id`);
    if (!isSet && setId) out.push(`${p.id} has a set- id and is not a set`);
    if (seen.has(p.id)) out.push(`${p.id} is used by two products`);
    seen.add(p.id);
  }
  return out;
}

/**
 * 2. Barcodes. No barcode appears on a set and on anything else, nor on an oil
 * and on a bottle. (Two sets, or two bottles, may share one: that is the same
 * product listed twice and is the matcher's business, not this rule's.)
 */
export function barcodeViolations(products: readonly KindedProduct[]): string[] {
  const kindsByBarcode = new Map<string, Map<Kind, string>>();
  for (const p of products) {
    if (!p.ean) continue;
    const kinds = kindsByBarcode.get(p.ean) ?? new Map<Kind, string>();
    if (!kinds.has(kindOf(p))) kinds.set(kindOf(p), p.id);
    kindsByBarcode.set(p.ean, kinds);
  }
  const out: string[] = [];
  for (const [ean, kinds] of kindsByBarcode) {
    if (kinds.size > 1) out.push(`barcode ${ean} is on ${[...kinds].map(([k, id]) => `${k} ${id}`).join(' and ')}`);
  }
  return out;
}

/**
 * Makes guard 2 hold by construction instead of by luck. Two shops can print
 * one barcode on what they disagree is a bottle, a set or an oil (Perfume Click
 * calls "Good Girl Gone Bad 50ml + Clutch Bag" a gift set, Scentsational sells
 * the same barcode as "Refillable Spray + Case"), and a shop added tomorrow can
 * do it again. Neither shop is a mistake the classifier can settle. The barcode
 * stays with the highest ranked kind present (a bottle, then an oil, then a
 * set): the ids of the products of any other kind that carry it are returned,
 * so the build can drop the barcode from them. Their ids are untouched (a set
 * keeps its `set-ean-` address) and nothing is merged.
 */
export function barcodeLosers(products: readonly KindedProduct[]): Set<string> {
  const rank: Record<Kind, number> = { bottle: 0, oil: 1, set: 2 };
  const best = new Map<string, number>();
  for (const p of products) {
    if (!p.ean) continue;
    best.set(p.ean, Math.min(best.get(p.ean) ?? 9, rank[kindOf(p)]));
  }
  const losers = new Set<string>();
  for (const p of products) {
    if (p.ean && rank[kindOf(p)] > best.get(p.ean)!) losers.add(p.id);
  }
  return losers;
}

/** What the listing check needs: a product and the shop rows that feed it. */
export interface OfferedProduct {
  id: string;
  offers: readonly { retailerId: string; listingSku: string }[];
}

/**
 * 3. Variants. No stored listing (a shop and its own SKU) feeds two products.
 * It is a rule about the listing, not about the page address: 25 Nicchia pages
 * legitimately carry a bottle variant and a set variant (two listings, two
 * products), and one affiliate click address is shared by many listings.
 */
export function listingViolations(products: readonly OfferedProduct[]): string[] {
  const owner = new Map<string, string>();
  const out: string[] = [];
  for (const p of products) {
    for (const o of p.offers) {
      const key = `${o.retailerId}::${o.listingSku}`;
      const prior = owner.get(key);
      if (prior !== undefined && prior !== p.id) out.push(`listing ${key} feeds both ${prior} and ${p.id}`);
      else owner.set(key, p.id);
    }
  }
  return out;
}
