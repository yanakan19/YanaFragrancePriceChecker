/**
 * UK pictures on matching US and India products (owner instruction, 9 October
 * 2026; docs/INTERNATIONAL-PLAN.md "UK photos on matching region products").
 *
 * D24 (photos hot-linked from a shop's own page) is unanswered for the US and
 * Indian shops, so no US or Indian shop photo is shown. Where a region product
 * is the same bottle as a product the UK site sells, the UK listing's picture
 * is used instead: the UK site already shows it under D24's existing basis, so
 * this adds no new shop's photo. A US or Indian shop's own picture is never
 * read here (the region snapshots carry no image at all).
 *
 * "The same bottle" is exactly the region build's own two ideas of it, no
 * looser, and every match must also agree on what the tile shows:
 *
 *   1. By barcode: the region product's id is `ean-<digits>` and the UK has a
 *      product of that id (the match `productsMatchingUkByBarcode` counts).
 *   2. By name: identical house, name, strength and size once both names are
 *      put through `regionMatchName`, the strength stated on both, the UK
 *      product the only one with that key, and no two real barcodes that
 *      disagree (the UK's own rule: findDuplicateGroups never merges them).
 *
 * Either way both must be a plain bottle (never a gift set, an oil or an
 * attar), with the same size in ml and the same strength, so a gift set, a
 * tester-sized or different-size bottle never takes a plain bottle's picture.
 * When unsure, no match. Pure: no file is read or written here.
 *
 * The same match also lends a UK product's notes (`matchUkNotes`, owner
 * instruction of 9 Oct 2026): the US and Indian shops publish none, so a
 * matching region product shows the UK product's notes. One idea of "the same
 * bottle" for both, so a bottle never has the UK picture of one product and the
 * notes of another.
 */
import { brandKey } from './brandName.js';
import { normalizedEan } from './productMatch.js';
import { regionMatchName, type RegionProduct } from './regionCatalogue.js';

/** What the matching reads of a UK catalogue entry (a subset of `CatalogueEntry`). */
export interface UkPhotoSource {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
  ean: string | null;
  image: string | null;
  imageTransform?: string;
  /** The UK product's notes, already folded by the reviewed note aliases; lent to a matching region product (`matchUkNotes`). */
  notes?: { top: string[]; middle: string[]; base: string[]; source: { retailerId: string; url: string } | null } | null;
  giftSet?: unknown;
  oil?: unknown;
}

export interface UkPhoto {
  /** The UK product the picture is from. */
  ukId: string;
  by: 'barcode' | 'name';
  image: string;
  imageTransform?: string;
}

/** The notes a region product takes from its UK match, with where the UK page says they were read. */
export interface UkNotes {
  ukId: string;
  by: 'barcode' | 'name';
  top: string[];
  middle: string[];
  base: string[];
  source: { retailerId: string; url: string } | null;
}

const NOT_STATED = 'Not stated';

const concentrationOf = (c: string | null | undefined): string => c ?? NOT_STATED;

/** A UK entry that can lend its picture to a plain bottle: it has one, and is itself a plain bottle with a size. */
const lender = (u: UkPhotoSource): boolean => !u.giftSet && !u.oil && u.sizeMl !== null && u.sizeMl > 0;

/** Same kind, size and strength: the checks a barcode match must also pass. */
function sameBottle(p: Pick<RegionProduct, 'kind' | 'sizeMl' | 'concentration'>, u: UkPhotoSource): boolean {
  return p.kind === 'bottle' && lender(u) && p.sizeMl === u.sizeMl && concentrationOf(p.concentration) === u.concentration;
}

function barcodesDisagree(a: string | null, b: string | null): boolean {
  return !!a && !!b && normalizedEan(a) !== normalizedEan(b);
}

function nameKey(brand: string, name: string, concentration: string, sizeMl: number): string {
  return `${brandKey(brand)}|${regionMatchName(name).toLowerCase()}|${concentration.toLowerCase()}|${sizeMl}`;
}

/** The one match rule: region product id to the UK bottle it is, and by what. Nothing here reads a picture or notes. */
function matchUkBottles(products: readonly Pick<RegionProduct, 'id' | 'kind' | 'brand' | 'name' | 'concentration' | 'sizeMl' | 'ean'>[], uk: readonly UkPhotoSource[]): Map<string, { u: UkPhotoSource; by: UkPhoto['by'] }> {
  const byId = new Map(uk.map((u) => [u.id, u]));
  // Plain bottles with a stated strength, by identical normalised house, name, strength and size. More than one: ambiguous, never used.
  const byName = new Map<string, UkPhotoSource[]>();
  for (const u of uk) {
    if (!lender(u) || u.concentration === NOT_STATED || u.brand.trim() === '') continue;
    const k = nameKey(u.brand, u.name, u.concentration, u.sizeMl!);
    const list = byName.get(k);
    if (list) list.push(u);
    else byName.set(k, [u]);
  }

  const out = new Map<string, { u: UkPhotoSource; by: UkPhoto['by'] }>();
  for (const p of products) {
    if (p.kind !== 'bottle') continue;
    const sameId = byId.get(p.id);
    if (p.id.startsWith('ean-') && sameId) {
      // A barcode that points at a different kind, size or strength is not this bottle, and no name match is tried after it.
      if (sameBottle(p, sameId)) out.set(p.id, { u: sameId, by: 'barcode' });
      continue;
    }
    const concentration = concentrationOf(p.concentration);
    if (!p.sizeMl || concentration === NOT_STATED || p.brand.trim() === '') continue;
    const hits = byName.get(nameKey(p.brand, p.name, concentration, p.sizeMl));
    if (!hits || hits.length !== 1) continue;
    const u = hits[0]!;
    if (barcodesDisagree(p.ean, u.ean)) continue;
    out.set(p.id, { u, by: 'name' });
  }
  return out;
}

type MatchProduct = Pick<RegionProduct, 'id' | 'kind' | 'brand' | 'name' | 'concentration' | 'sizeMl' | 'ean'>;

/** Region product id to the UK picture it takes. Products with no match, or whose UK match has no picture, are absent. */
export function matchUkPhotos(products: readonly MatchProduct[], uk: readonly UkPhotoSource[]): Map<string, UkPhoto> {
  const out = new Map<string, UkPhoto>();
  for (const [id, { u, by }] of matchUkBottles(products, uk)) {
    if (u.image) out.set(id, { ukId: u.id, by, image: u.image, ...(u.imageTransform ? { imageTransform: u.imageTransform } : {}) });
  }
  return out;
}

/** Region product id to the UK notes it takes (same match as the picture). A match whose UK product shows no notes is absent. */
export function matchUkNotes(products: readonly MatchProduct[], uk: readonly UkPhotoSource[]): Map<string, UkNotes> {
  const out = new Map<string, UkNotes>();
  for (const [id, { u, by }] of matchUkBottles(products, uk)) {
    const n = u.notes;
    if (!n || n.top.length + n.middle.length + n.base.length === 0) continue;
    out.set(id, { ukId: u.id, by, top: [...n.top], middle: [...n.middle], base: [...n.base], source: n.source ? { ...n.source } : null });
  }
  return out;
}
