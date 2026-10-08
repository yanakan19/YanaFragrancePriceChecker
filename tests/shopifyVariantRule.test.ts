import { describe, expect, it } from 'vitest';
import { parseShopifyProducts } from '../src/catalogue/shopifyJson.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { ShopifyVariantRule } from '../src/types/retailer.js';

/**
 * Bloom Perfumery lists every size several times under an "Info" option and
 * files samples, packs and vouchers beside the bottles. These tests pin what
 * the variant rule keeps. The shapes are the ones read from the shop's own
 * /products.json on 2026-10-03; the prices are invented round numbers.
 */

const RULE: ShopifyVariantRule = {
  productTypes: ['Perfume'],
  requiredOptions: ['Concentration'],
  marketOption: { name: 'Info', keep: ['ol'] },
  sizeOption: { name: 'Package', minMl: 5 },
};

function variant(
  size: string,
  conc: string,
  info: string,
  price: string,
  sku: string,
  extra: Record<string, unknown> = {},
) {
  return {
    sku,
    title: `${size} / ${conc} / ${info}`,
    option1: size,
    option2: conc,
    option3: info,
    price,
    compare_at_price: null,
    available: true,
    ...extra,
  };
}

function product(over: Record<string, unknown>) {
  return {
    id: 1,
    title: 'Butterfly Nebula',
    handle: 'butterfly-nebula',
    vendor: 'Ylem',
    product_type: 'Perfume',
    images: [],
    body_html: '',
    options: [{ name: 'Package' }, { name: 'Concentration' }, { name: 'Info' }],
    variants: [],
    ...over,
  };
}

const parse = (products: unknown[], rule: ShopifyVariantRule | null = RULE) =>
  parseShopifyProducts(JSON.stringify({ products }), {
    origin: 'https://shop.example',
    sectionId: 'shopify-products-json',
    currency: 'GBP',
    ...(rule ? { variantRule: rule } : {}),
  });

describe('parseShopifyProducts with a variant rule', () => {
  const butterfly = product({
    variants: [
      variant('50 ml', 'Extrait de Parfum', 'ol', '190.00', 'B-50'),
      variant('1 ml', 'Extrait de Parfum', 'ol', '8.00', 'B-1'),
      // The tax free list: 190 / 1.2, with the UK price as its "was".
      variant('50 ml', 'Extrait de Parfum', 'tf', '158.33', 'B-50-TF', { compare_at_price: '190.00' }),
      variant('50 ml', 'Extrait de Parfum', 'sd', '182.00', 'B-50-SD'),
      variant('50 ml', 'Extrait de Parfum', 'tfsd', '151.67', 'B-50-TFSD'),
      variant('10 ml', 'Extrait de Parfum', 'ato', '0.00', 'B-10-ATOM'),
    ],
  });

  it('keeps the UK price list and nothing else, so the cheaper tax free line cannot win', () => {
    const rows = parse([butterfly]);
    expect(rows.map((r) => [r.retailerSku, r.priceGbp])).toEqual([['B-50', 190]]);
  });

  it('reads every variant when no rule is set, which is why the rule exists', () => {
    const rows = parse([butterfly], null);
    expect(rows.map((r) => r.priceGbp)).toContain(151.67);
  });

  it('drops the market code from the title', () => {
    const [row] = parse([butterfly]);
    expect(row!.rawTitle).toBe('Butterfly Nebula 50 ml Extrait de Parfum');
    expect(row!.rawTitle).not.toMatch(/\bol\b/);
  });

  it('keeps a real small bottle but not a sample, a vial, a roll on or a twin pack', () => {
    const rows = parse([
      product({
        variants: [
          variant('10 ml', 'EdP', 'ol', '36.00', 'S-10'),
          variant('7.5 ml', 'EdP', 'ol', '45.00', 'S-75'),
          variant('1 ml', 'EdP', 'ol', '4.00', 'S-1'),
          variant('0.7 ml', 'EdP', 'ol', '3.00', 'S-07'),
          variant('4.5 ml', 'Parfum', 'ol', '59.00', 'S-45'),
          variant('10 ml roll-on', 'EdP', 'ol', '32.00', 'S-RO'),
          variant('2×7.5 ml', 'EdP', 'ol', '116.00', 'S-TWIN'),
          variant('50  ml', 'EdP', 'ol', '95.00', 'S-50'),
        ],
      }),
    ]);
    expect(rows.map((r) => r.retailerSku)).toEqual(['S-10', 'S-75', 'S-50']);
    expect(rows.at(-1)!.rawTitle).toBe('Butterfly Nebula 50 ml EdP');
  });

  it('drops every product type that is not Perfume', () => {
    const rows = parse([
      product({ product_type: 'SamplePack', variants: [variant('9 x 1 ml', 'EdP', 'ol', '30.00', 'P-9')] }),
      product({ product_type: 'Raw material', variants: [variant('1 g', 'EdP', 'ol', '30.00', 'R-1')] }),
      product({ product_type: 'Body', variants: [variant('500 ml', 'body wash', 'ol', '30.00', 'W-500')] }),
    ]);
    expect(rows).toEqual([]);
  });

  it('drops a product filed as Perfume that has no concentration, such as a hand sanitizer', () => {
    const sanitizer = product({
      options: [{ name: 'Package' }, { name: 'Size' }, { name: 'Info' }],
      variants: [variant('500 ml', '1', 'ol', '25.00', 'H-500')],
    });
    expect(parse([sanitizer])).toEqual([]);
  });

  it('finds the Info option wherever the product puts it', () => {
    const odd = product({
      options: [{ name: 'Name' }, { name: 'Package' }, { name: 'Info' }],
      variants: [
        { sku: 'N-1', title: 'a / 50 ml / ol', option1: 'a', option2: '50 ml', option3: 'ol', price: '70.00', available: true },
        { sku: 'N-2', title: 'a / 50 ml / tf', option1: 'a', option2: '50 ml', option3: 'tf', price: '58.33', available: true },
      ],
    });
    const rule: ShopifyVariantRule = { ...RULE, requiredOptions: [] };
    expect(parse([odd], rule).map((r) => r.retailerSku)).toEqual(['N-1']);
  });

  it('never stores a price as pounds when the currency is not sterling', () => {
    const rows = parseShopifyProducts(JSON.stringify({ products: [butterfly] }), {
      origin: 'https://shop.example',
      sectionId: 's',
      currency: 'USD',
      variantRule: RULE,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.priceGbp).toBeNull();
    expect(rows[0]!.nativePrice).toEqual({ amount: 190, currency: 'USD' });
  });
});

describe('a rule that only filters product types (a department store, a niche shop)', () => {
  // Fenwick and Sainte Cellier keep a product type and nothing else. Their products
  // have no real options, so the one variant's option is Shopify's "Default Title",
  // or the "0" Fenwick puts in an unused Colour option, and neither is part of a bottle's name.
  const TYPES_ONLY: ShopifyVariantRule = { productTypes: ['Unisex Fragrance'] };
  const plain = (title: string, option: string, over: Record<string, unknown> = {}) =>
    product({
      title,
      handle: title.toLowerCase().replace(/\W+/g, '-'),
      product_type: 'Unisex Fragrance',
      options: [{ name: 'Title' }],
      variants: [{ sku: `SKU-${title}`, title: option, option1: option, price: '95.00', available: true }],
      ...over,
    });

  it('leaves "Default Title" and a "0" placeholder out of the title', () => {
    const rows = parse(
      [plain('Spellbound Eau De Parfum Spray', 'Default Title'), plain('Black Orchid Reserve', '0')],
      TYPES_ONLY,
    );
    expect(rows.map((r) => r.rawTitle)).toEqual(['Spellbound Eau De Parfum Spray', 'Black Orchid Reserve']);
  });

  it('still adds a real size, and still drops a product of another type', () => {
    const sized = plain('Hibiscus Mahajad Extrait De Parfum', '100ml', { options: [{ name: 'Size' }] });
    const candle = plain('Figue Candle', '0', { product_type: 'Home Fragrance' });
    const rows = parse([sized, candle], TYPES_ONLY);
    expect(rows.map((r) => r.rawTitle)).toEqual(['Hibiscus Mahajad Extrait De Parfum 100ml']);
  });
});

describe('excludeTitle and minVariantMl (a niche shop whose sizes read "30ml | 1oz")', () => {
  const RULE2: ShopifyVariantRule = {
    productTypes: ['EAU DE PARFUM'],
    excludeTitle: '\\bdiscovery\\b',
    minVariantMl: 5,
  };
  const scent = (title: string, sizes: [string, string][], type = 'EAU DE PARFUM') =>
    product({
      title,
      handle: title.toLowerCase().replace(/\W+/g, '-'),
      product_type: type,
      options: [{ name: 'Size' }],
      variants: sizes.map(([size, price], i) => ({
        sku: `${title}-${i}`, title: size, option1: size, price, available: true,
      })),
    });

  it('drops the 2ml sample variant and keeps the full size, whatever the shop spells after it', () => {
    const rows = parse(
      [scent('CUIR DE CHINE', [['Full Size 50ml | 1.7oz', '195.00'], ['2ml Spray Sample', '12.00'], ['2ml Glass Spray Samplel', '12.00']])],
      RULE2,
    );
    expect(rows.map((r) => r.rawTitle)).toEqual(['CUIR DE CHINE Full Size 50ml | 1.7oz']);
  });

  it('keeps a 9ml travel size and a variant that names no millilitre size at all', () => {
    const rows = parse([scent('AJEDREZ', [['9ml | .3oz', '40.00']]), scent('NO SIZE', [['Default Title', '30.00']])], RULE2);
    expect(rows.map((r) => r.rawTitle)).toEqual(['AJEDREZ 9ml | .3oz', 'NO SIZE']);
  });

  it('drops a discovery set by its title, in any case, and leaves a scent with the word inside another', () => {
    const rows = parse(
      [scent('MARISSA ZAPPAS Discovery Set', [['Default Title', '70.00']]), scent('DISCOVERY', [['30ml', '80.00']]), scent('UNDISCOVERED', [['30ml', '80.00']])],
      RULE2,
    );
    expect(rows.map((r) => r.rawTitle)).toEqual(['UNDISCOVERED 30ml']);
  });
});

describe('the Bloom Perfumery registry entry', () => {
  const bloom = RETAILERS.find((r) => r.id === 'bloom-perfumery')!;

  it('asks for UK retail variants only and identifies as the bot alone', () => {
    expect(bloom.shopifyStorefront).toBe(true);
    expect(bloom.shopifyVariantRule?.marketOption).toEqual({ name: 'Info', keep: ['ol'] });
    expect(bloom.shopifyVariantRule?.productTypes).toEqual(['Perfume']);
  });
});
