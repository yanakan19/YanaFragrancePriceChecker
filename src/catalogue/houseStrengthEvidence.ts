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

/**
 * ── The 2026-10-20 strength review (docs/STRENGTH-REVIEW-2026-10-20.md) ──────
 * Every fragrance shown in two or more strengths at one size, checked against
 * the brand's own site. The entries below are the ones where the brand makes
 * ONE strength and the other label is a shop's. The ones where the brand makes
 * several are in strengthReviewed.ts and stay split. Append only.
 *
 * The brand's site was read as PriceSniffsBot or through a search of the brand's
 * own domain on the day below (the quote says which); a house crawled into
 * data/houses/ is quoted from the crawl's own read of its page.
 */
const REVIEW_DAY = '2026-10-20';
const reviewed = (
  brand: string,
  names: readonly string[],
  sizesMl: readonly number[],
  concentration: string,
  source: string,
  quote: string,
): HouseStrengthEvidence[] =>
  names.map((name) => ({ brand, name, sizesMl, concentration, source, quote, readAt: REVIEW_DAY }));

const myk = (name: string, handle: string, sizesMl: number[]): HouseStrengthEvidence => ({
  brand: 'Mykonos',
  name,
  sizesMl,
  concentration: 'Extrait de Parfum',
  source: `https://officialmykonos.com/products/${handle}`,
  quote: `house page title "Mykonos - ${name} Extrait de Parfum ${sizesMl.join('ml & ')}ml" (data/houses/mykonos.json, read by the house crawl)`,
  readAt: REVIEW_DAY,
});

const REVIEWED_ONE_STRENGTH: readonly HouseStrengthEvidence[] = [
  ...reviewed('Clinique', ['Happy Heart'], [50, 100], 'Eau de Parfum', 'https://www.clinique.com/product/1584/57547/fragrance/gifts/fragrance-gifts-sets/clinique-happy-hearttm-eau-de-parfum-spray', 'page title "Clinique Happy Heart Eau de Parfum Spray"; no Parfum of it on clinique.com or clinique.co.uk'),
  ...reviewed('Clinique', ['Happy'], [30, 50, 100], 'Eau de Parfum', 'https://www.clinique.com/product/1579/5188/fragrance/clinique-happy/clinique-happy-eau-de-parfum-spray', 'page title "Clinique Happy Eau de Parfum - Women\'s Perfume"; the UK site calls the same spray "Perfume Spray"'),
  ...reviewed('Clinique', ['Aromatics Elixir'], [25, 45, 100], 'Eau de Parfum', 'https://www.clinique.com/product/1584/5390/fragrance/gifts/fragrance-gifts-sets/aromatics-elixir-eau-de-parfum-spray', 'page title "Aromatics Elixir Eau de Parfum Spray" (clinique.co.uk: "Eau de Perfume Spray"); one product, 100 ml listed'),
  ...reviewed('Zimaya', ['Sharaf The Club'], [100], 'Eau de Parfum', 'https://zimayaperfumes.com/products/sharaf-the-club-100ml', 'brand shop product sharaf-the-club-100ml tagged "EDP" (products.json read as PriceSniffsBot, robots.txt allows it); page title "Sharaf The Club EDP 100ml"'),
  ...reviewed('Zimaya', ['Sharaf Blend'], [100], 'Eau de Parfum', 'https://zimayaperfumes.com/products/sharaf-blend-100ml', 'brand shop product sharaf-blend-100ml tagged "EDP" (products.json read as PriceSniffsBot); the Sharaf series page says each is an EDP'),
  ...reviewed('Zimaya', ['Fatima'], [100], 'Eau de Parfum', 'https://zimayaperfumes.com/products/fatima-pink-100ml', 'brand shop product fatima-pink-100ml tagged "EDP" (products.json read as PriceSniffsBot); 92 of its 106 products are tagged EDP and none of this name is an Extrait'),
  ...reviewed('Zimaya', ['Amber Is Great'], [100], 'Eau de Parfum', 'https://zimayaperfumes.com/products/amber-is-great-100ml', 'brand shop product amber-is-great-100ml tagged "EDP" (products.json read as PriceSniffsBot)'),
  ...reviewed('Atelier des Ors', ['Blue Madeleine'], [100], 'Eau de Parfum', 'https://atelierdesors.com/products/blue-madeleine', 'brand shop product type "Eau de Parfum"; the shop lists no Extrait of this name (products.json read as PriceSniffsBot)'),
  ...reviewed('Atelier des Ors', ['Noir By Night'], [100], 'Eau de Parfum', 'https://atelierdesors.com/products/noir-by-night', 'brand shop product type "Eau de Parfum"; the shop lists no Extrait of this name (products.json read as PriceSniffsBot)'),
  myk('Inception', 'mykonos-inception-extrait-de-parfum-50ml', [50, 100]),
  myk('California Blue', 'mykonos-california-blue-extrait-de-parfum-50ml', [50, 100]),
  myk('Sorrento', 'mykonos-sorrento-extrait-de-parfum-50ml-100ml', [50, 100]),
  myk('Glitch', 'mykonos-x-setiawanade-glitch-extrait-de-parfum-50ml', [50, 100]),
  myk('Inferno', 'mykonos-inferno-extrait-de-parfum-100ml', [50, 100]),
  myk('Marbella', 'mykonos-marbella-extrait-de-parfum-100ml', [50, 100]),
  myk('Bonfire Vanilla', 'mykonos-bonfire-vanilla-extrait-de-parfum-50ml', [50]),
  myk('Imperium', 'mykonos-imperium-extrait-de-parfum-100ml', [100]),
  myk('Untamed', 'mykonos-untamed-extrait-de-parfum-100ml', [100]),
  ...reviewed('Versace', ['Eros Najim'], [100], 'Parfum', 'https://www.versace.com/us/en/men/accessories/fragrances-body-care/eros-collection/', 'collection page lists "Eros Najim Parfum 100 ml" and no Eau de Parfum of it'),
  ...reviewed('Rabanne', ['Lady Million Royal'], [30, 50, 80], 'Eau de Parfum', 'https://www.rabanne.com/ww/en/fragrance/p/lady-million-royal--000000000065190452', 'product page sold as Eau de Parfum; no Parfum of it on rabanne.com'),
  ...reviewed('Parfums de Marly', ['Layton Exclusif'], [75, 125], 'Parfum', 'https://us.parfums-de-marly.com/products/layton-exclusif', 'product title "Layton Exclusif Parfum (75ml, 125ml)"; the house lists no Eau de Parfum of it'),
  ...reviewed('Parfums de Marly', ['Pegasus Exclusif'], [75, 125], 'Parfum', 'https://us.parfums-de-marly.com/products/pegasus-exclusif', 'product title "Pegasus Exclusif Parfum (75ml, 125ml)"; the house lists no Eau de Parfum of it'),
  ...reviewed('Burberry', ['My Burberry Black'], [90], 'Parfum', 'https://us.burberry.com/my-burberry-black-parfum-90ml-p40115491', 'product page "My Burberry Black Parfum 90ml"; the only My Burberry Black on burberry.com'),
  ...reviewed('Cartier', ['Pasha de Cartier'], [50], 'Parfum', 'https://www.cartier.com/en-us/pasha-de-cartier-parfum.html', 'page "Pasha de Cartier Parfum"; the house lists no Eau de Parfum of it'),
  ...reviewed('Xerjoff', ['Alexandria II'], [50, 100], 'Parfum', 'https://www.xerjoff.com/products/alexandria-ll-parfum', 'product address and title "Alexandria II, Parfum 50ml"'),
  ...reviewed('Xerjoff', ['Cruz del Sur I'], [50, 100], 'Parfum', 'https://www.xerjoff.com/en-us/products/cruz-del-sur-l-parfum', 'product address "cruz-del-sur-l-parfum"; the house lists no Eau de Parfum of it'),
  ...reviewed('Xerjoff', ['Pikovaya Dama'], [50, 100], 'Parfum', 'https://xerjoff.com/USA/1717-stone-label/249-pikovaya-damaparfum-50ml.html', 'product "Pikovaya Dama Parfum 50ml" and "Parfum 100ml"'),
  ...reviewed('Jean Paul Gaultier', ['Scandal Absolu'], [30, 50, 80], 'Parfum', 'https://www.jeanpaulgaultier.com/ww/en/p/range-scandal/scandal-absolu-parfum-concentre-000000000065189841', 'product title "Scandal Absolu Parfum Concentre"; the house sells one Scandal Absolu'),
  ...reviewed('Kilian', ["Angels' Share Paradis"], [30, 50], 'Extrait de Parfum', 'https://www.bykilian.com/angels-share-paradis', 'page describes Paradis as "the ultimate interpretation of Angels\' Share in an intense extrait de parfum"'),
  ...reviewed('Initio Parfums Privés', ['LIFT ME UP'], [50, 90], 'Extrait de Parfum', 'https://us.initioparfums.com/products/lift-me-up', 'product sits in the house\'s "Extrait de Parfum" collection, 50 and 90 ml'),
  ...reviewed('BDK Parfums', ['Pas ce Soir Extrait'], [100], 'Extrait de Parfum', 'https://bdkparfums.com/products/pas-ce-soir-extrait', 'house page title "Pas ce Soir - Extrait de Parfum 100ML" (data/houses/bdk-parfums.json, read by the house crawl)'),
  ...reviewed('Goldfield & Banks', ['Silky Woods'], [100], 'Eau de Parfum', 'https://us.goldfieldandbanks.com/products/silky-woods', 'page title "Silky Woods Eau de Parfum"; the extrait of the name is the separate "Silky Woods Elixir"'),
  ...reviewed('Goldfield & Banks', ['Tales of Amber'], [100], 'Extrait de Parfum', 'https://us.goldfieldandbanks.com/products/tales-of-amber', 'page describes it as an extrait de parfum, 30 percent essences, 100 ml'),
  ...reviewed('Maison Crivelli', ['Patchouli Magnetik'], [50], 'Extrait de Parfum', 'https://maisoncrivelli.com/fr-fr/products/patchouli-magnetik', 'page title "Patchouli Magnetik extrait de parfum", 50 ml, 32 percent'),
];

export const HOUSE_STRENGTH_EVIDENCE: readonly HouseStrengthEvidence[] = [
  ...REVIEWED_ONE_STRENGTH,
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
