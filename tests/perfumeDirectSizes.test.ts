import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ownSizeTitle, parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { sizeMl } from '../src/catalogue/fragranceId.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { formatLabels } from '../src/catalogue/offerFormat.js';

/**
 * Perfume Direct titles a Shopify product with every size its page sells,
 * "(30ml, 50ml, 100ml)", and the parser appends the variant's own name. The
 * catalogue read the first number, so every row of a product read as its
 * smallest size. The sizes and prices below were read from the shop's own
 * product JSON (robots.txt first, as PriceSniffsBot) on 2026-10-04 and matched
 * the stored rows one for one on ten multi size products.
 */

const root = resolve(import.meta.dirname, '..');

describe('a title that lists every size reads the row\'s own', () => {
  it('replaces the list with the variant\'s size, in the brackets a single size product wears', () => {
    expect(ownSizeTitle("Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (30ml, 50ml, 100ml) 50ml")).toBe(
      "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (50ml) 50ml",
    );
  });

  it('keeps the words the variant adds after its size', () => {
    expect(ownSizeTitle("Penhaligon's Empressa Eau de Parfum Spray (10ml, 30ml, 100ml) 10ml Splash")).toBe(
      "Penhaligon's Empressa Eau de Parfum Spray (10ml) 10ml Splash",
    );
    expect(ownSizeTitle("Hugo Boss Femme Eau de Parfum Women's Perfume Spray (30ml, 50ml, 75ml) 30ml Old Bottle")).toBe(
      "Hugo Boss Femme Eau de Parfum Women's Perfume Spray (30ml) 30ml Old Bottle",
    );
  });

  it('takes the variant\'s size even when the shop\'s list leaves it out', () => {
    // Azzaro Chrome Legend: the title lists 75 and 125, the page sells 75, 100 and 125.
    expect(ownSizeTitle("Azzaro Chrome Legend Eau de Toilette Men's Aftershave Spray (75ml, 125ml) 100ml")).toBe(
      "Azzaro Chrome Legend Eau de Toilette Men's Aftershave Spray (100ml) 100ml",
    );
    expect(ownSizeTitle("Chloe L'eau de Parfum Intense Women's Perfume Spray (100ml) 50ml")).toBe(
      "Chloe L'eau de Parfum Intense Women's Perfume Spray (50ml) 50ml",
    );
  });

  it('reads the shop\'s own slips in a list', () => {
    expect(ownSizeTitle("Marc Jacobs Daisy Love Eau So Sweet Eau de Toilette Women's Perfume Spray (30m, 50ml, 100ml) 100ml")).toBe(
      "Marc Jacobs Daisy Love Eau So Sweet Eau de Toilette Women's Perfume Spray (100ml) 100ml",
    );
    expect(ownSizeTitle("Armani Si Passione Eau de Parfum Women's Perfume Spray (15ml 30ml, 50ml, 100ml, 150ml) 30ml")).toBe(
      "Armani Si Passione Eau de Parfum Women's Perfume Spray (30ml) 30ml",
    );
  });

  it('leaves alone a title it cannot read a size from, and every other bracket', () => {
    // No size after the list: the row names no size of its own.
    const bare = "Jimmy Choo Man Extreme Eau de Parfum Men's Aftershave Spray (30ml, 100ml)";
    expect(ownSizeTitle(bare)).toBe(bare);
    for (const t of [
      "Jennifer Lopez Live Luxe Eau de Parfum Women's Perfume Spray (100ml) 100ml",
      "Givenchy Irresistible Eau de Parfum Women's Perfume Gift Set (35ml + 12.5ml)",
      'Example Scent Eau de Parfum (Limited Edition) 50ml',
      'Example Scent Eau de Parfum 100ml',
    ]) {
      expect(ownSizeTitle(t), t).toBe(t);
    }
  });

  it('is the same on its own output', () => {
    const once = ownSizeTitle("Dior J'adore Eau de Parfum Women's Perfume Spray (30ml, 50ml, 75ml, 100ml) 75ml");
    expect(ownSizeTitle(once)).toBe(once);
  });

  it('makes each row read its own size where the catalogue read the first', () => {
    const sizes = [30, 50, 100];
    for (const n of sizes) {
      const title = `Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (30ml, 50ml, 100ml) ${n}ml`;
      expect(sizeMl(title), `before: ${title}`).toBe(30);
      expect(sizeMl(ownSizeTitle(title)), title).toBe(n);
    }
  });
});

describe('the Shopify parser', () => {
  // The variants of Bvlgari Splendida Patchouli Tentation, as the shop serves
  // them (title, price, sku), read 2026-10-04.
  const bvlgari = {
    id: 1,
    title: "Bvlgari Splendida Patchouli Tentation Eau de Parfum Women's Perfume Spray (30ml, 50ml, 100ml)",
    handle: 'bvlgari-splendida-patchouli-tentation-eau-de-parfum-womens-perfume-spray-100ml',
    vendor: 'Bvlgari',
    product_type: "Women's Perfume",
    images: [],
    body_html: '',
    options: [{ name: 'Size' }],
    variants: [
      { sku: '17447PD', title: '30ml', option1: '30ml', price: '46.99', compare_at_price: '58.00', available: false },
      { sku: '17448PD', title: '50ml', option1: '50ml', price: '59.99', compare_at_price: null, available: true },
      { sku: '17449PD', title: '100ml', option1: '100ml', price: '89.99', compare_at_price: null, available: true },
    ],
  };
  const parsed = parseShopifyProducts(JSON.stringify({ products: [bvlgari] }), {
    origin: 'https://www.perfumedirect.com',
    sectionId: 'shopify-products-json',
    currency: 'GBP',
  });

  it('gives each size its own listing, its own price and its own size', () => {
    expect(parsed.map((l) => [l.retailerSku, sizeMl(l.rawTitle), l.priceGbp])).toEqual([
      ['17447PD', 30, 46.99],
      ['17448PD', 50, 59.99],
      ['17449PD', 100, 89.99],
    ]);
  });

  it('keeps one page address for all of them, as the shop does', () => {
    expect(new Set(parsed.map((l) => l.url)).size).toBe(1);
  });

  it('leaves a single size product as it was', () => {
    const single = parseShopifyProducts(
      JSON.stringify({
        products: [
          {
            ...bvlgari,
            title: "Jennifer Lopez Live Luxe Eau de Parfum Women's Perfume Spray (100ml)",
            handle: 'jlo',
            variants: [{ sku: '1PD', title: '100ml', option1: '100ml', price: '19.99', compare_at_price: null, available: true }],
          },
        ],
      }),
      { origin: 'https://www.perfumedirect.com', sectionId: 'x', currency: 'GBP' },
    );
    expect(single[0]!.rawTitle).toBe("Jennifer Lopez Live Luxe Eau de Parfum Women's Perfume Spray (100ml) 100ml");
  });

  it('no longer leaves rows of different sizes for the Kayali style labelling to skip', () => {
    expect(formatLabels(parsed.map((l) => ({ rawTitle: l.rawTitle, sizeMl: sizeMl(l.rawTitle) })))).toEqual([null, null, null]);
  });
});

describe('the stored Perfume Direct rows', () => {
  // The size a stored title states for its own row: the last size in it, which
  // is the variant's, after the bracket of sizes the shop lists (a bracket that
  // may carry a pack name, "(30ml, 60ml, 90ml Refillable Talisman) 60ml", or
  // lack its closing bracket).
  const ownSizeOf = (title: string): number => {
    const all = [...title.matchAll(/(\d+(?:\.\d+)?)\s*ml\b/gi)];
    return Number.parseFloat(all[all.length - 1]![1]!);
  };
  const stored = JSON.parse(readFileSync(resolve(root, 'data/catalogue/perfume-direct.json'), 'utf8')) as {
    listings: { status: string; retailerSku: string; rawTitle: string; url: string; priceGbp: number | null }[];
  };
  const rows = stored.listings.filter((l) => l.status === 'active' && typeof l.priceGbp === 'number');
  // The shape the parser and the build repair: a bracket of sizes, then the variant's own.
  const sized = rows.filter((l) => ownSizeTitle(l.rawTitle) !== l.rawTitle || /\(\d+ml\)\s+\d+ml\b/.test(l.rawTitle));

  it('has the shape this fix is for, many times over', () => {
    expect(sized.length).toBeGreaterThan(1000);
  });

  it('reads, once repaired, the size each row states for itself', () => {
    for (const l of sized) {
      const own = ownSizeOf(l.rawTitle);
      expect(sizeMl(ownSizeTitle(l.rawTitle)), l.rawTitle).toBe(own);
    }
  });

  it('puts each of those rows on a product of its own size in the built catalogue', () => {
    const byId = new Map(CATALOGUE.map((c) => [c.id, c]));
    const holders = new Map<string, string[]>();
    for (const [pid, offers] of Object.entries(CRAWLED)) {
      for (const o of offers) {
        if (o.retailerId !== 'perfume-direct') continue;
        const k = `${o.url}|${o.price}`;
        (holders.get(k) ?? holders.set(k, []).get(k)!).push(pid);
      }
    }
    let checked = 0;
    for (const l of sized) {
      const pids = holders.get(`${l.url}|${l.priceGbp}`) ?? [];
      // Two sizes of one page at one price cannot be told apart by this check.
      if (pids.length !== 1) continue;
      const own = ownSizeOf(l.rawTitle);
      expect(byId.get(pids[0]!)!.sizeMl, `${l.rawTitle} (${l.priceGbp})`).toBe(own);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
