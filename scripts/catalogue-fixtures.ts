/**
 * Builds saved retailer pages for the catalogue crawl to run against.
 *
 * The pages carry genuine schema.org/Product JSON-LD in the shapes UK retail
 * sites actually emit, including the awkward ones: a @graph wrapper, an
 * ItemList of products, offers as an array, prices as strings with a currency
 * symbol, and availability with and without the schema.org prefix. If the
 * parser copes with these it will cope with most real pages.
 *
 * Two days are generated so the NEW badge can be proved end to end. Day two
 * adds products that were absent on day one and drops one that sold through.
 *
 * Usage: npm run catalogue:fixtures
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { fixtureName } from '../src/catalogue/fetcher.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Stocked {
  /** Which shop, and what it charges. */
  at: string;
  price: number;
  inStock?: boolean;
  was?: number;
  promoHours?: number;
  /** Appears on day two rather than day one. */
  from2?: boolean;
  /** Present on day one and gone by day two. */
  gone2?: boolean;
}

interface FixtureProduct {
  key: string;
  name: string;
  brand: string;
  ean: string;
  stocked: Stocked[];
}

/**
 * What each shop lists under fragrance.
 *
 * Written product first rather than shop first, because the shape that matters
 * is how unevenly a bottle is stocked. A designer bestseller turns up almost
 * everywhere; a niche house is carried by three shops; a Middle Eastern brand by
 * two. Any sample where everything appears in every shop hides the case the
 * comparison exists to handle.
 */
const PRODUCTS: FixtureProduct[] = [
  { key: 'sauvage', name: 'Dior Sauvage Eau de Parfum 100ml', brand: 'Dior', ean: '3348901486958', stocked: [
    { at: 'boots', price: 24.99 }, { at: 'superdrug', price: 25.5 },
    { at: 'notino-uk', price: 23.9 }, { at: 'lookfantastic', price: 26.0 },
    { at: 'the-perfume-shop', price: 27.95 }, { at: 'the-fragrance-shop', price: 26.5 },
    { at: 'john-lewis', price: 22.5, inStock: false }, { at: 'justmylook', price: 25.15 },
    { at: 'allbeauty', price: 24.4 },
  ]},
  { key: 'bleu', name: 'Chanel Bleu de Chanel Eau de Parfum 100ml', brand: 'Chanel', ean: '3145891073607', stocked: [
    { at: 'the-fragrance-shop', price: 88.4, was: 110.0, promoHours: 62 },
    { at: 'allbeauty', price: 91.75, was: 99.0 }, { at: 'justmylook', price: 94.0 },
    { at: 'john-lewis', price: 108.0 }, { at: 'boots', price: 105.0 },
    { at: 'the-perfume-shop', price: 99.99 }, { at: 'selfridges', price: 112.0 },
    { at: 'beautybase', price: 96.5 },
  ]},
  { key: 'aventus', name: 'Creed Aventus Eau de Parfum 100ml', brand: 'Creed', ean: '3508441001152', stocked: [
    { at: 'selfridges', price: 335.0 }, { at: 'harvey-nichols', price: 330.0 },
    { at: 'beautybase', price: 289.0 }, { at: 'allbeauty', price: 295.5 },
    { at: 'notino-uk', price: 284.0 }, { at: 'justmylook', price: 279.0, inStock: false },
  ]},
  { key: 'baccarat', name: 'Maison Francis Kurkdjian Baccarat Rouge 540 Eau de Parfum 70ml', brand: 'Maison Francis Kurkdjian', ean: '3700559608579', stocked: [
    { at: 'selfridges', price: 245.0 }, { at: 'harvey-nichols', price: 240.0 },
    { at: 'notino-uk', price: 219.0, from2: true }, { at: 'beautybase', price: 228.0 },
    { at: 'allbeauty', price: 232.5, was: 255.0, from2: true },
  ]},
  { key: 'eros', name: 'Versace Eros Eau de Toilette 100ml', brand: 'Versace', ean: '8011003809202', stocked: [
    { at: 'the-fragrance-shop', price: 42.5, was: 78.0, promoHours: 19 },
    { at: 'notino-uk', price: 44.9, from2: true }, { at: 'justmylook', price: 47.25 },
    { at: 'superdrug', price: 49.99, from2: true }, { at: 'boots', price: 55.0, from2: true },
    { at: 'the-perfume-shop', price: 58.0 }, { at: 'allbeauty', price: 46.8 },
    { at: 'lookfantastic', price: 51.0 },
  ]},
  { key: 'million', name: 'Paco Rabanne 1 Million Eau de Toilette 100ml', brand: 'Paco Rabanne', ean: '3349668528813', stocked: [
    { at: 'superdrug', price: 59.99 }, { at: 'boots', price: 62.0 },
    { at: 'the-perfume-shop', price: 64.0 }, { at: 'lookfantastic', price: 57.5, was: 72.0 },
    { at: 'the-fragrance-shop', price: 55.0, inStock: false }, { at: 'john-lewis', price: 66.0 },
    { at: 'justmylook', price: 60.4 },
  ]},
  { key: 'acqua', name: 'Giorgio Armani Acqua di Gio Profumo Parfum 75ml', brand: 'Giorgio Armani', ean: '3614270282492', stocked: [
    { at: 'notino-uk', price: 69.9 }, { at: 'allbeauty', price: 71.5 },
    { at: 'lookfantastic', price: 74.0 }, { at: 'beautybase', price: 76.5 },
    { at: 'john-lewis', price: 78.0 }, { at: 'boots', price: 82.0 },
  ]},
  { key: 'libre', name: 'Yves Saint Laurent Libre Eau de Parfum 90ml', brand: 'Yves Saint Laurent', ean: '3614272648616', stocked: [
    { at: 'superdrug', price: 23.75 }, { at: 'lookfantastic', price: 24.4 },
    { at: 'beautybase', price: 43.0 }, { at: 'john-lewis', price: 46.5 },
    { at: 'boots', price: 78.0, was: 92.0 }, { at: 'the-perfume-shop', price: 82.0 },
    { at: 'allbeauty', price: 43.0, gone2: true },
  ]},
  { key: 'khamrah', name: 'Lattafa Khamrah Eau de Parfum 100ml', brand: 'Lattafa', ean: '6291108736258', stocked: [
    { at: 'notino-uk', price: 21.9 }, { at: 'the-fragrance-shop', price: 24.99, was: 32.0 },
    { at: 'allbeauty', price: 23.45 },
  ]},
  { key: 'woodsage', name: 'Jo Malone London Wood Sage & Sea Salt Cologne 100ml', brand: 'Jo Malone London', ean: '690251037339', stocked: [
    { at: 'selfridges', price: 112.0, inStock: false },
    { at: 'lookfantastic', price: 105.0, inStock: false },
    { at: 'beautybase', price: 99.0, inStock: false },
  ]},
  // ean was '3660549000330', which fails the GS1 check digit at every
  // length (13-digit body 366054900033 wants check digit 5, not 0) — a typo
  // in this file, not a real barcode; data/catalogue/selfridges.json carries
  // the identical typo only because that file is itself generated from these
  // fixtures (selfridges is fixtures-only, never live-harvested, so it is not
  // independent evidence of a real EAN). No live-harvested retailer in this
  // catalogue stocks Le Labo Santal 33 to check against, so the real-world
  // barcode cannot be established from anything in this repo. The last digit
  // is corrected to the value that actually satisfies the check (5) rather
  // than left invalid or replaced with a different invented number — this is
  // still a synthetic placeholder for a local test fixture, not a claim about
  // Le Labo's real EAN.
  { key: 'lelabo', name: 'Le Labo Santal 33 Eau de Parfum 50ml', brand: 'Le Labo', ean: '3660549000335', stocked: [
    { at: 'selfridges', price: 200.0 },
  ]},
  { key: 'oudwood', name: 'Tom Ford Oud Wood Eau de Parfum 50ml', brand: 'Tom Ford', ean: '888066008075', stocked: [
    { at: 'selfridges', price: 215.0 }, { at: 'harvey-nichols', price: 210.0 },
    { at: 'boots', price: 205.0 }, { at: 'john-lewis', price: 208.0 },
  ]},
  { key: 'lavieestbelle', name: 'Lancome La Vie Est Belle Eau de Parfum 100ml', brand: 'Lancome', ean: '3605532612836', stocked: [
    { at: 'boots', price: 82.0 }, { at: 'superdrug', price: 79.99 },
    { at: 'the-perfume-shop', price: 85.0 }, { at: 'lookfantastic', price: 77.5, was: 96.0 },
    { at: 'john-lewis', price: 88.0 }, { at: 'notino-uk', price: 74.5 },
    { at: 'allbeauty', price: 76.2 }, { at: 'justmylook', price: 78.9 },
  ]},
  { key: 'blackopium', name: 'Yves Saint Laurent Black Opium Eau de Parfum 90ml', brand: 'Yves Saint Laurent', ean: '3614272050334', stocked: [
    { at: 'boots', price: 96.0 }, { at: 'the-perfume-shop', price: 99.0 },
    { at: 'superdrug', price: 92.5 }, { at: 'lookfantastic', price: 89.0 },
    { at: 'john-lewis', price: 101.0 }, { at: 'notino-uk', price: 86.9 },
    { at: 'the-fragrance-shop', price: 88.0, from2: true },
  ]},
  { key: 'asad', name: 'Lattafa Asad Eau de Parfum 100ml', brand: 'Lattafa', ean: '6291108738900', stocked: [
    { at: 'notino-uk', price: 19.9 }, { at: 'the-fragrance-shop', price: 22.5 },
  ]},
  { key: 'sospetto', name: 'Xerjoff Erba Pura Eau de Parfum 100ml', brand: 'Xerjoff', ean: '8033488154332', stocked: [
    { at: 'beautybase', price: 218.0 }, { at: 'harvey-nichols', price: 235.0 },
    { at: 'selfridges', price: 240.0, inStock: false },
  ]},
];

/** Flattened per shop, which is how the crawl sees it. */
function forRetailer(retailerId: string, day: 1 | 2): FixtureRow[] {
  const rows: FixtureRow[] = [];
  for (const p of PRODUCTS) {
    for (const s of p.stocked) {
      if (s.at !== retailerId) continue;
      if (s.from2 && day === 1) continue;
      if (s.gone2 && day === 2) continue;
      rows.push({
        sku: `${retailerId.slice(0, 3)}-${p.key}`,
        name: p.name, brand: p.brand, ean: p.ean,
        price: s.price, inStock: s.inStock !== false,
        was: s.was, promoHours: s.promoHours,
      });
    }
  }
  return rows;
}

interface FixtureRow {
  sku: string; name: string; brand: string; ean: string;
  price: number; inStock: boolean; was?: number | undefined; promoHours?: number | undefined;
}

/** Day one uses the plain shape most sites emit. */
function pageWithGraph(products: FixtureRow[], search: string, domain: string): string {
  const graph = products.map((p) => ({
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    gtin13: p.ean,
    brand: { '@type': 'Brand', name: p.brand },
    image: [`https://${domain}/images/${p.sku}.jpg`],
    url: productUrl(search, p.name),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'GBP',
      price: p.price.toFixed(2),
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      ...(p.was
        ? {
            priceSpecification: {
              '@type': 'UnitPriceSpecification',
              priceType: 'https://schema.org/ListPrice',
              price: p.was.toFixed(2),
              priceCurrency: 'GBP',
            },
          }
        : {}),
      ...(p.promoHours ? { priceValidUntil: soon(p.promoHours) } : {}),
    },
  }));

  return html(JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2));
}

/** Day two uses an ItemList with string prices, to exercise the other shape. */
function pageWithItemList(products: FixtureRow[], search: string, domain: string): string {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': ['Product', 'IndividualProduct'],
        name: p.name,
        sku: p.sku,
        gtin13: p.ean,
        brand: p.brand,
        image: { '@type': 'ImageObject', url: `https://${domain}/images/${p.sku}.jpg` },
        url: productUrl(search, p.name),
        offers: [
          {
            '@type': 'Offer',
            priceCurrency: 'GBP',
            price: `£${p.price.toFixed(2)}`,
            availability: p.inStock ? 'InStock' : 'OutOfStock',
            ...(p.was ? { highPrice: `£${p.was.toFixed(2)}` } : {}),
            ...(p.promoHours ? { priceValidUntil: soon(p.promoHours) } : {}),
          },
        ],
      },
    })),
  };
  return html(JSON.stringify(payload, null, 2));
}

const soon = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/**
 * Links point at each shop's real search results for the exact product name.
 *
 * A guessed product URL is a 404 and makes the whole app look broken. A search
 * link lands the reader on the right shop looking at the right bottle, which is
 * what they wanted. Real crawls supply real product URLs and this is only the
 * fallback.
 */
function productUrl(searchTemplate: string, name: string): string {
  return searchTemplate.replace('{q}', encodeURIComponent(name));
}

function html(ld: string): string {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8" />
<title>Fragrance</title>
<script type="application/ld+json">
${ld}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}
</script>
</head><body><main>Listing page</main></body></html>
`;
}

function build(day: 1 | 2, outDir: string): number {
  rmSync(outDir, { recursive: true, force: true });
  let pages = 0;

  for (const retailer of RETAILERS) {
    if (!retailer.catalogue) continue;

    const live = forRetailer(retailer.id, day);
    if (live.length === 0) continue;
    const section = retailer.catalogue.sections[0]!;

    // Everything lands on the first page; page two is deliberately absent so
    // the crawl's "empty page ends pagination" rule is exercised for real.
    const url = section.urlTemplate.replace('{page}', String(retailer.catalogue.firstPage));
    const body =
      day === 1
        ? pageWithGraph(live, retailer.catalogue.searchUrlTemplate, retailer.domain)
        : pageWithItemList(live, retailer.catalogue.searchUrlTemplate, retailer.domain);

    const file = resolve(outDir, retailer.id, `${fixtureName(url)}.html`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    pages++;
  }
  return pages;
}

const day1 = build(1, resolve(root, 'fixtures/catalogue/day1'));
const day2 = build(2, resolve(root, 'fixtures/catalogue/day2'));
console.log(`fixtures written: day1 ${day1} pages, day2 ${day2} pages`);
