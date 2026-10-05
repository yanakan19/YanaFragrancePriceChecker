import { ML_SIZE_RE, OZ_SIZE_RE, OZ_TO_ML } from './fragranceId.js';

/**
 * US ounce titles and the bottle's nominal millilitres.
 *
 * The Beauty Store UK (a US wholesaler's feed) writes sizes in fluid ounces
 * only: "Ysl Black Opium 3 Oz", "Y By Ysl 2 Oz For Men", "Ysl Libre 1 Oz For
 * Women". sizeMl converts exactly (3 oz is 88.7, shown 89ml), but no house
 * fills 89ml: the bottle is the 90ml, and every other shop sells it as that. So
 * the 89ml and 59ml products stood beside the 90ml and 60ml ones (237 of its
 * listings state an ounce size; 55 are 1 oz and read 30ml, 37 are 3 oz and read
 * 89ml, 16 are 2 oz and read 59ml).
 *
 * The US ounce sizes that stand for a nominal bottle (owner's list, 2026-10-05):
 * 1 oz is 30ml, 1.7 is 50, 2 is 60, 3 is 90, 3.3 and 3.4 are 100, 4.2 is 125,
 * 5 is 150, 6.7 is 200; and 2.5, which two shops write as 74ml and 75ml for the
 * 75ml bottle. A table is not evidence: it is only ever applied where the same
 * product is sold at that nominal size by a shop that states it in ml, or the
 * barcode is. See resolveOunceListing.
 */
const NOMINAL_ML_FOR_OZ: readonly (readonly [number, number])[] = [
  [1, 30],
  [1.7, 50],
  [2, 60],
  [2.5, 75],
  [3, 90],
  [3.3, 100],
  [3.4, 100],
  [4.2, 125],
  [5, 150],
  [6.7, 200],
];

/** The ounces a title states, when it states no millilitres (a title with both is the shop's own conversion). */
export function ouncesStated(title: string): number | null {
  if (ML_SIZE_RE.test(title)) return null;
  const m = title.match(OZ_SIZE_RE);
  return m ? Number.parseFloat(m[1]!) : null;
}

/** The nominal bottle size for a US ounce size, or null where the ounce size is not a standard one. */
export function nominalMlForOz(oz: number): number | null {
  for (const [key, ml] of NOMINAL_ML_FOR_OZ) if (Math.abs(oz - key) < 0.051) return ml;
  return null;
}

/** The exact conversion sizeMl makes, for telling a nominal size from it. */
export function convertedMl(oz: number): number {
  return Math.round(oz * OZ_TO_ML);
}

/** The name with a trailing "For Men" / "For Women" taken off, or null where it carries none. */
export function withoutAudienceLabel(name: string): string | null {
  const out = name.replace(/\s+for\s+(?:men|women)\s*$/i, '').trim();
  return out !== name && out.length > 0 ? out : null;
}

/** What the build knows of sizes the shops state in millilitres, keyed by product. */
export interface KnownSizes {
  /** Sizes in ml by `brandKey|name core` (see productNameKey in the build). */
  byName: ReadonlyMap<string, ReadonlySet<number>>;
  /** Sizes in ml by barcode. */
  byEan: ReadonlyMap<string, ReadonlySet<number>>;
}

export interface OunceResolution {
  sizeMl: number;
  /** The name, with a "For Men" / "For Women" label off where the stripped name is the product the evidence found. */
  name: string;
  evidence: 'barcode' | 'same product at that size';
}

/**
 * The nominal size and the label free name for an ounce listing, where the
 * evidence is there, or null (the conversion and the name stand).
 *
 * Evidence is either the listing's own barcode being sold at the nominal size by
 * a shop that states it in ml, or the same brand and name (with, or without, a
 * trailing "For Men" / "For Women") being sold at that size. Nothing else: a
 * size the brand does not sell (Kayali's 1.7 oz that is not a 50ml) keeps the
 * converted figure. A name that is itself a known product at the nominal size
 * keeps its label ("Obsession For Men" is a name, not a label).
 */
export function resolveOunceListing(args: {
  title: string;
  name: string;
  ean: string | null;
  nameKey: (name: string) => string;
  known: KnownSizes;
}): OunceResolution | null {
  const oz = ouncesStated(args.title);
  if (oz === null) return null;
  const nominal = nominalMlForOz(oz);
  if (nominal === null) return null;
  const bare = withoutAudienceLabel(args.name);
  const sellsNominal = (name: string) => args.known.byName.get(args.nameKey(name))?.has(nominal) === true;
  if (args.ean && args.known.byEan.get(args.ean)?.has(nominal)) {
    return { sizeMl: nominal, name: bare !== null && !sellsNominal(args.name) && sellsNominal(bare) ? bare : args.name, evidence: 'barcode' };
  }
  if (sellsNominal(args.name)) return { sizeMl: nominal, name: args.name, evidence: 'same product at that size' };
  if (bare !== null && sellsNominal(bare)) return { sizeMl: nominal, name: bare, evidence: 'same product at that size' };
  return null;
}
