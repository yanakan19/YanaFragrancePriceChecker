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

/**
 * The second batch of the strength review (docs/STRENGTH-REVIEW-2026-10-20.md, "Second batch"): about 100 UK
 * families, again settled by barcodes first and then by the brand's own site. The brand's shop was read as
 * PriceSniffsBot on the day below (robots.txt first, 2 s gaps, at most 4 requests a host; the quote says whether it
 * was the shop's products.json or a page found through a search of the brand's own domain). Append only.
 */
const REVIEW_DAY_2 = '2026-10-20';
const reviewed2 = (
  brand: string,
  names: readonly string[],
  sizesMl: readonly number[],
  concentration: string,
  source: string,
  quote: string,
): HouseStrengthEvidence[] =>
  names.map((name) => ({ brand, name, sizesMl, concentration, source, quote, readAt: REVIEW_DAY_2 }));

const EDP2 = 'Eau de Parfum';
const AAM_QUOTE = (title: string): string => `brand shop product title "${title}"; the shop lists no Extrait of this name (products.json read as PriceSniffsBot, robots.txt allowed)`;

const REVIEWED_SECOND_BATCH: readonly HouseStrengthEvidence[] = [
  ...reviewed2('Afnan', ['9pm Elixir'], [100], 'Extrait de Parfum', 'https://afnan.com/products/9-pm-elixir', 'brand shop variant "Extrait De Parfum / 100 ML / Unisex", product tagged "extrait" (products.json read as PriceSniffsBot)'),
  ...reviewed2('Afnan', ['9pm Night Out'], [100], 'Extrait de Parfum', 'https://afnan.com/products/9pm-night-out', 'brand shop variant "Extrait De Parfum / 100 ML / Unisex", product tagged "extrait" (products.json read as PriceSniffsBot)'),
  ...reviewed2('Ahmed Al Maghribi', ['Rose Noir'], [75], EDP2, 'https://www.ahmedalmaghribi.uk/products/rose-noir', AAM_QUOTE('Rose Noir EDP 75ml')),
  ...reviewed2('Ahmed Al Maghribi', ['Oud & Roses'], [60], EDP2, 'https://www.ahmedalmaghribi.uk/products/oud-roses', AAM_QUOTE('Oud & Roses EDP 60ml')),
  ...reviewed2('Ahmed Al Maghribi', ['Oud Lavender'], [75], EDP2, 'https://www.ahmedalmaghribi.uk/products/oud-lavender', AAM_QUOTE('Oud Lavender EDP 75ml')),
  ...reviewed2('Ahmed Al Maghribi', ['Laathani'], [80], EDP2, 'https://www.ahmedalmaghribi.uk/products/laathani', AAM_QUOTE('Laathani EDP 80ml')),
  ...reviewed2('Ahmed Al Maghribi', ['Black fume'], [100], EDP2, 'https://www.ahmedalmaghribi.uk/products/black-fume', AAM_QUOTE('Black Fumes EDP 100ml')),
  ...reviewed2('Ahmed Al Maghribi', ['Opaline Wave'], [100], EDP2, 'https://www.ahmedalmaghribi.uk/products/opaline-wave-edp-100ml', AAM_QUOTE('Opaline Wave EDP 100ml')),
  ...reviewed2('Laurent Mazzone', ["Vol D'Hirondelle"], [100], EDP2, 'https://www.lmparfums.com/products/vol-d-hirondelle', 'brand shop product "VOL D\'HIRONDELLE" (100ml and 15ml), product type "Eaux de parfum" (products.json read as PriceSniffsBot)'),
  ...reviewed2('Tauer', ["L'Air du Jardin Caché"], [50], EDP2, 'https://tauerperfumes.com/products/lair-du-jardin-cache-50-ml', 'product text "Eau de parfum, concentrated at 25% fragrance oil", 50 ml, the only size (products.json read as PriceSniffsBot)'),
  ...reviewed2('Xerjoff', ['Fars'], [50], 'Parfum', 'https://xerjoff.com/products/fars-parfum', 'product address "fars-parfum", title "Fars", 50 ml; the house lists no Eau de Parfum of it (products.json read as PriceSniffsBot)'),
  ...reviewed2('Xerjoff', ['XXY'], [50, 100], 'Parfum', 'https://xerjoff.com/products/xxy-parfum', 'product address "xxy-parfum", title "XXY", 50 and 100 ml; the house lists no Eau de Parfum of it (products.json read as PriceSniffsBot)'),
  ...reviewed2('Xerjoff', ['Tony Iommi Monkey Special'], [50, 100], 'Parfum', 'https://xerjoff.com/products/tony-iommi-monkey-parfum', 'product address "tony-iommi-monkey-parfum", title "Tony Iommi Monkey Special", 50 and 100 ml; the house lists no Eau de Parfum of it (products.json read as PriceSniffsBot)'),
  ...reviewed2('Xerjoff', ['Duran Duran NeoRio Orange'], [50], 'Parfum', 'https://xerjoff.com/products/duran-duran-neorio-parfum-orange-flacon', 'product address "duran-duran-neorio-parfum-orange-flacon", 50 ml, one product (products.json read as PriceSniffsBot)'),
  ...reviewed2('Xerjoff', ['Duran Duran NeoRio Pink'], [50], 'Parfum', 'https://xerjoff.com/products/duran-duran-neorio-parfum-pink-flacon', 'product address "duran-duran-neorio-parfum-pink-flacon", 50 ml, one product (products.json read as PriceSniffsBot)'),
  ...reviewed2('Amouage', ['Remain Essence'], [100], 'Parfum', 'https://amouage.com/products/remain', 'product type "ESSENCE" (Essence de Parfum, "30% pure perfume oils"); no Eau de Parfum of it on amouage.com (data/houses/amouage.json and the shop\'s products.json)'),
  ...reviewed2('Amouage', ['Lustre Essence'], [100], 'Parfum', 'https://amouage.com/products/new-lustre', 'one of The Amouage Essences, "30% pure perfume oils" (Essence de Parfum); no Eau de Parfum of it (data/houses/amouage.json)'),
  ...reviewed2('Amouage', ['Reasons Essence'], [100], 'Parfum', 'https://amouage.com/products/new-reasons', 'one of The Amouage Essences, "30% pure perfume oils" (Essence de Parfum); no Eau de Parfum of it (data/houses/amouage.json)'),
  ...reviewed2('Amouage', ['Love Delight'], [100], EDP2, 'https://amouage.com/products/100ml-love-delight', 'shop product type "EDP", "20% oil concentration", 100 ml; no Parfum of it (products.json of the Eaux de Parfum collection read as PriceSniffsBot)'),
  ...reviewed2('Israel Philip', ['Avignon'], [100], EDP2, 'https://www.israelphilipfragrances.com/products/avignon-pour-homme', 'product text "Avignon by Israel Philip Fragrances is a bold, oriental Eau de Parfum for men"; one 100 ml product (products.json read as PriceSniffsBot)'),
  ...reviewed2('Israel Philip', ["L'orient"], [100], EDP2, 'https://www.israelphilipfragrances.com/products/lorient-pour-femme', 'product text "L\'Orient by Israel Philip Fragrances is a fresh, tropical Eau de Parfum for women"; one 100 ml product (products.json read as PriceSniffsBot)'),
  ...reviewed2('French Avenue', ['Noble Cedar'], [100], 'Extrait de Parfum', 'https://uk.shopfrenchavenue.com/products/noble-cedar-exdp-100ml', 'brand shop title "Noble Cedar ExDP 100ml" (ExDP is French Avenue\'s extrait mark); the only Noble Cedar in data/catalogue/french-avenue.json'),
  ...reviewed2('French Avenue', ['X Aromatix Carnal Desire'], [100], 'Extrait de Parfum', 'https://uk.shopfrenchavenue.com/products/aromatix-carnal-desire-exdp-100ml', 'brand shop title "Aromatix Carnal Desire ExDP 100ml" (ExDP is French Avenue\'s extrait mark); the only one in data/catalogue/french-avenue.json'),
  ...reviewed2('Giorgio Armani', ['Emporio Armani Stronger With You Absolutely'], [50], 'Parfum', 'https://www.armanibeauty.co.uk/perfume/mens-perfumes/stronger-with-you/emporio-armani-stronger-with-you-absolutely-parfum/ww-00424-arm.html', 'page title "Emporio Armani Stronger With You Absolutely Parfum", 50 ml (found through a search of armanibeauty.co.uk)'),
  ...reviewed2('Bharara', ['Viking Rio'], [100], 'Parfum', 'https://www.bhararabeauty.com/products/bharara-viking-rio-3-4-parfum-spray', 'page title "Bharara Viking Rio Parfum Spray" (found through a search of bhararabeauty.com)'),
  ...reviewed2('Bharara', ['Viking Kashmir'], [100], 'Parfum', 'https://www.bhararabeauty.com/products/bharara-viking-kashmir-3-4-parfum-spray', 'page title "Bharara Viking Kashmir Parfum Spray", 30 percent oil (found through a search of bhararabeauty.com)'),
  ...reviewed2('Unbranded', ['Orebella Window2Soul'], [10, 50, 100], 'Parfum', 'https://orebella.com/products/window2soul', 'page title "WINDOW2SOUL PARFUM"; the house sells its five scents as "THE PARFUMS" (skin parfums, alcohol free) and none as an Eau de Parfum (found through a search of orebella.com)'),
  ...reviewed2('Unbranded', ['Orebella Nightcap'], [10, 50, 100], 'Parfum', 'https://orebella.com/collections/the-parfums', 'the house\'s collection "THE PARFUMS" holds Nightcap beside Window2Soul PARFUM; none is sold as an Eau de Parfum (found through a search of orebella.com)'),
  ...reviewed2('Unbranded', ['Orebella Blooming Fire'], [10, 50, 100], 'Parfum', 'https://orebella.com/collections/the-parfums', 'the house\'s collection "THE PARFUMS" holds Blooming Fire beside Window2Soul PARFUM; none is sold as an Eau de Parfum (found through a search of orebella.com)'),
  ...reviewed2('Unbranded', ['Orebella Salted Muse'], [10, 50, 100], 'Parfum', 'https://orebella.com/collections/the-parfums', 'the house\'s collection "THE PARFUMS" holds Salted Muse beside Window2Soul PARFUM; none is sold as an Eau de Parfum (found through a search of orebella.com)'),
  ...reviewed2('J.U.S', ['Bloomastral'], [100], EDP2, 'https://jusparfums.com/en-int/products/bloomastral', 'product page filed under "Eaux de Parfum", 100 ml (found through a search of jusparfums.com)'),
];

export const HOUSE_STRENGTH_EVIDENCE: readonly HouseStrengthEvidence[] = [
  ...REVIEWED_ONE_STRENGTH,
  ...REVIEWED_SECOND_BATCH,
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
