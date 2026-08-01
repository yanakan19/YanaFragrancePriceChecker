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

interface FixtureProduct {
  sku: string;
  name: string;
  brand: string;
  ean: string | null;
  price: number;
  inStock: boolean;
  /** Which generated day this product first appears on. */
  from: 1 | 2;
  /** Set when the product disappears on day two. */
  until?: 1;
  /** Retailer published reference price, when it is running a promotion. */
  was?: number;
  /** Hours from now until the promotion closes. */
  promoHours?: number;
}

/**
 * What each shop lists under fragrance. Deliberately overlapping, because the
 * same bottle appearing at six shops at six prices is the entire product.
 */
const CATALOGUE: Record<string, FixtureProduct[]> = {
  'notino-uk': [
    { sku: 'ntn-sauvage-100', name: 'Dior Sauvage Eau de Parfum 100ml', brand: 'Dior', ean: '3348901486958', price: 23.9, inStock: true, from: 1 },
    { sku: 'ntn-bleu-100', name: 'Chanel Bleu de Chanel Eau de Parfum 100ml', brand: 'Chanel', ean: '3145891073607', price: 99.99, inStock: true, from: 1 },
    { sku: 'ntn-aventus-100', name: 'Creed Aventus Eau de Parfum 100ml', brand: 'Creed', ean: '3508441001152', price: 284.0, inStock: true, from: 1 },
    { sku: 'ntn-khamrah-100', name: 'Lattafa Khamrah Eau de Parfum 100ml', brand: 'Lattafa', ean: '6291108736258', price: 21.9, inStock: true, from: 1 },
    { sku: 'ntn-acqua-75', name: 'Giorgio Armani Acqua di Gio Profumo Parfum 75ml', brand: 'Giorgio Armani', ean: '3614270282492', price: 69.9, inStock: true, from: 1 },
    // Added on day two.
    { sku: 'ntn-baccarat-70', name: 'Maison Francis Kurkdjian Baccarat Rouge 540 Eau de Parfum 70ml', brand: 'Maison Francis Kurkdjian', ean: '3700559608579', price: 219.0, inStock: true, from: 2 },
    { sku: 'ntn-eros-100', name: 'Versace Eros Eau de Toilette 100ml', brand: 'Versace', ean: '8011003809202', price: 44.9, inStock: true, from: 2 },
  ],
  boots: [
    { sku: '10255432', name: 'Dior Sauvage Eau de Parfum 100ml', brand: 'Dior', ean: '3348901486958', price: 24.99, inStock: true, from: 1 },
    { sku: '10255901', name: 'Chanel Bleu de Chanel Eau de Parfum 100ml', brand: 'Chanel', ean: '3145891073607', price: 105.0, inStock: true, from: 1 },
    { sku: '10261188', name: 'Paco Rabanne 1 Million Eau de Toilette 100ml', brand: 'Paco Rabanne', ean: '3349668528813', price: 62.0, inStock: true, from: 1 },
    { sku: '10277431', name: 'Yves Saint Laurent Libre Eau de Parfum 90ml', brand: 'Yves Saint Laurent', ean: '3614272648616', price: 78.0, inStock: true, from: 1, was: 92.0 },
    { sku: '10233190', name: 'Giorgio Armani Acqua di Gio Profumo Parfum 75ml', brand: 'Giorgio Armani', ean: '3614270282492', price: 82.0, inStock: true, from: 1 },
    // Added on day two.
    { sku: '10299874', name: 'Versace Eros Eau de Toilette 100ml', brand: 'Versace', ean: '8011003809202', price: 55.0, inStock: true, from: 2 },
  ],
  allbeauty: [
    { sku: 'ab-bleu-100', name: 'Chanel Bleu de Chanel Eau de Parfum 100ml', brand: 'Chanel', ean: '3145891073607', price: 91.75, inStock: true, from: 1, was: 99.0 },
    { sku: 'ab-aventus-100', name: 'Creed Aventus Eau de Parfum 100ml', brand: 'Creed', ean: '3508441001152', price: 295.5, inStock: true, from: 1 },
    { sku: 'ab-acqua-75', name: 'Giorgio Armani Acqua di Gio Profumo Parfum 75ml', brand: 'Giorgio Armani', ean: '3614270282492', price: 71.5, inStock: true, from: 1 },
    { sku: 'ab-khamrah-100', name: 'Lattafa Khamrah Eau de Parfum 100ml', brand: 'Lattafa', ean: '6291108736258', price: 23.45, inStock: true, from: 1 },
    // Sells through and leaves the catalogue on day two.
    { sku: 'ab-libre-90', name: 'Yves Saint Laurent Libre Eau de Parfum 90ml', brand: 'Yves Saint Laurent', ean: '3614272648616', price: 43.0, inStock: true, from: 1, until: 1 },
    // Added on day two.
    { sku: 'ab-baccarat-70', name: 'Maison Francis Kurkdjian Baccarat Rouge 540 Eau de Parfum 70ml', brand: 'Maison Francis Kurkdjian', ean: '3700559608579', price: 232.5, inStock: true, from: 2, was: 255.0 },
  ],
  'the-fragrance-shop': [
    { sku: 'tfs-bleu-100', name: 'Chanel Bleu de Chanel Eau de Parfum 100ml', brand: 'Chanel', ean: '3145891073607', price: 88.4, inStock: true, from: 1, was: 110.0, promoHours: 62 },
    { sku: 'tfs-khamrah-100', name: 'Lattafa Khamrah Eau de Parfum 100ml', brand: 'Lattafa', ean: '6291108736258', price: 24.99, inStock: true, from: 1 },
    { sku: 'tfs-eros-100', name: 'Versace Eros Eau de Toilette 100ml', brand: 'Versace', ean: '8011003809202', price: 42.5, inStock: true, from: 1, was: 78.0, promoHours: 19 },
    { sku: 'tfs-million-100', name: 'Paco Rabanne 1 Million Eau de Toilette 100ml', brand: 'Paco Rabanne', ean: '3349668528813', price: 55.0, inStock: false, from: 1 },
  ],
  superdrug: [
    { sku: 'sd-sauvage-100', name: 'Dior Sauvage Eau de Parfum 100ml', brand: 'Dior', ean: '3348901486958', price: 25.5, inStock: true, from: 1 },
    { sku: 'sd-million-100', name: 'Paco Rabanne 1 Million Eau de Toilette 100ml', brand: 'Paco Rabanne', ean: '3349668528813', price: 59.99, inStock: true, from: 1 },
    { sku: 'sd-libre-90', name: 'Yves Saint Laurent Libre Eau de Parfum 90ml', brand: 'Yves Saint Laurent', ean: '3614272648616', price: 23.75, inStock: true, from: 1 },
    // Added on day two.
    { sku: 'sd-eros-100', name: 'Versace Eros Eau de Toilette 100ml', brand: 'Versace', ean: '8011003809202', price: 49.99, inStock: true, from: 2 },
  ],
  selfridges: [
    { sku: 'sf-aventus-100', name: 'Creed Aventus Eau de Parfum 100ml', brand: 'Creed', ean: '3508441001152', price: 335.0, inStock: true, from: 1 },
    { sku: 'sf-baccarat-70', name: 'Maison Francis Kurkdjian Baccarat Rouge 540 Eau de Parfum 70ml', brand: 'Maison Francis Kurkdjian', ean: '3700559608579', price: 245.0, inStock: true, from: 1 },
    { sku: 'sf-woodsage-100', name: 'Jo Malone London Wood Sage & Sea Salt Cologne 100ml', brand: 'Jo Malone London', ean: '690251037339', price: 112.0, inStock: false, from: 1 },
  ],
};

/** Day one uses the plain shape most sites emit. */
function pageWithGraph(products: FixtureProduct[], domain: string): string {
  const graph = products.map((p) => ({
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    gtin13: p.ean,
    brand: { '@type': 'Brand', name: p.brand },
    image: [`https://${domain}/images/${p.sku}.jpg`],
    url: `https://${domain}/p/${p.sku}`,
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
function pageWithItemList(products: FixtureProduct[], domain: string): string {
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
        url: `https://${domain}/p/${p.sku}`,
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
    const products = CATALOGUE[retailer.id];
    if (!products || !retailer.catalogue) continue;

    const live = products.filter((p) => p.from <= day && !(p.until && p.until < day));
    const section = retailer.catalogue.sections[0]!;

    // Everything lands on the first page; page two is deliberately absent so
    // the crawl's "empty page ends pagination" rule is exercised for real.
    const url = section.urlTemplate.replace('{page}', String(retailer.catalogue.firstPage));
    const body =
      day === 1 ? pageWithGraph(live, retailer.domain) : pageWithItemList(live, retailer.domain);

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
