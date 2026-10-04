/**
 * What a fragrance house's own page says its bottle is, for the houses whose
 * storefront is not one of our UK shops.
 *
 * The house pass in scripts/build-demo-catalogue.ts ("the house's own word on
 * the strength") reads the strength off the listings of a UK brand direct shop.
 * That reaches Kayali, Armaf, French Avenue and the like. It cannot reach a
 * house that sells to the UK only through resellers, because the house's own
 * page is in euros, is not an offer on this site and carries its strength in a
 * line of text, not in a title.
 *
 * ── Why this exists: Orto Parisi Cuoium 50ml ─────────────────────────────────
 * Two shops sell it, as two product pages with two prices.
 *
 *   Bloom Perfumery   "Cuoium 50 ml Extrait de Parfum"   155 pounds
 *   Nicchia Luxury    "Cuoium Parfum 50 ml"               135 pounds
 *
 * Neither publishes a barcode and neither is the house, so nothing in the
 * build could say who was right. Bloom writes "Extrait de Parfum" on every
 * Orto Parisi, Farmacia SS. Annunziata and Laboratorio Olfattivo bottle it
 * lists, 18 of them here, and Nicchia writes "Parfum" or the house's own word
 * on all 18. Orto Parisi's page says "Parfum 50 ml/1.7 fl.oz" and sells one
 * Cuoium at one size. So the strength is the house's, Parfum, and the two pages
 * are one bottle.
 *
 * ── The bar ──────────────────────────────────────────────────────────────────
 * The same bar CONCENTRATION_RESOLUTIONS holds (route A, productName.ts): the
 * house's own page, naming this bottle at this size, and one product there at
 * that size. An entry is only ever added after reading the house's own page (or,
 * for a house whose page is a bot wall to us, the text the crawl read from it
 * under our own user agent), and records where and when. A house that sells
 * both a Parfum and an Extrait of one name and size as two products gets no
 * entry for that name: there is no single strength to settle.
 *
 * A listed strength settles every product with the same house, name and size,
 * whatever label a reseller gave it, exactly as a UK brand direct listing does.
 * It does not touch a product at another size, nor one whose name differs by a
 * flanker word.
 */

export interface HouseStrengthEvidence {
  /** The brand as the catalogue spells it. */
  brand: string;
  /** The fragrance's name as the catalogue shows it. */
  name: string;
  /** The sizes the house page sells this one product in. */
  sizesMl: readonly number[];
  /** The strength the house states, in the display form concentration() returns. */
  concentration: string;
  /** The house's own page. */
  source: string;
  /** What the page says, quoted. */
  quote: string;
  /** The day the page (or the crawl's read of it) was seen. */
  readAt: string;
}

const OP_READ = '2026-10-04';
const orto = (name: string, handle: string): HouseStrengthEvidence => ({
  brand: 'Orto Parisi',
  name,
  sizesMl: [50],
  concentration: 'Parfum',
  source: `https://ortoparisi.com/products/${handle}`,
  // ortoparisi.com answers PriceSniffsBot with a "Verifying your connection"
  // wall (HTTP 429) when asked from a build machine by hand; the wall is not
  // worked around. The text below is what the crawl's own read of the page
  // stored in data/houses/orto-parisi.json on the day above.
  quote: 'description ends "Parfum 50 ml/1.7 fl.oz" (data/houses/orto-parisi.json, read by the house crawl)',
  readAt: OP_READ,
});

const fssa = (name: string, handle: string, sizesMl: number[]): HouseStrengthEvidence => ({
  brand: 'Farmacia SS. Annunziata',
  name,
  sizesMl,
  concentration: 'Parfum',
  source: `https://farmaciassannunziata1561.it/products/${handle}`,
  quote: 'one product page with the sizes as variants; product description "TIPOLOGIA: Parfum" (read from the shop\'s products.json as PriceSniffsBot; robots.txt allows it)',
  readAt: OP_READ,
});

export const HOUSE_STRENGTH_EVIDENCE: readonly HouseStrengthEvidence[] = [
  orto('Bergamask', 'bergamask'),
  orto('Boccanera', 'boccanera'),
  orto('Brutus', 'brutus'),
  orto('Cuoium', 'cuoium'),
  orto('Megamare', 'megamare'),
  orto('Risvelium', 'risvelium'),
  orto('Seminalis', 'seminalis'),
  orto('Stercus', 'stercus'),
  orto('Terroni', 'terroni'),
  orto('Viride', 'viride'),

  fssa('Oriental Casbah', 'profumo-oriental-casbah-100ml', [100]),
  fssa('Reunion Vanilla', 'profumo-reunion-vanilla-100ml', [10, 50, 100]),
  fssa("Via dell'Incenso", 'profumo-via-dell-incenso-100ml', [10, 50, 100]),

  {
    brand: 'Laboratorio Olfattivo',
    name: 'Oud in White',
    sizesMl: [100],
    // The house's own tier name is "Parfum Intense". The catalogue's strength
    // field has one value for it, Parfum (the word "Intense" after a Parfum is
    // the tier, see identityWords in productMatch.ts).
    concentration: 'Parfum',
    source: 'https://www.laboratorioolfattivo.com/en/product/oud-in-white/',
    quote: 'og:description "Parfum Intense 100 ml"; one product, one size',
    readAt: OP_READ,
  },
];
