import { describe, expect, it } from 'vitest';
import { parseAwinFeed } from '../src/catalogue/awinFeed.js';

/**
 * The fixture rows below are entirely synthetic — invented product names and
 * ids for exercising the parser, never anything read off a real feed. This
 * project's one absolute rule is that price and listing data must trace back
 * to something a real shop actually published, and Fragrance Click UK's real
 * feed has not been obtained yet (see docs/AFFILIATE_SETUP.md). Nothing here
 * should be mistaken for real Fragrance Click UK inventory.
 */

const STANDARD_HEADER =
  'aw_deep_link,product_name,aw_product_id,merchant_product_id,merchant_image_url,' +
  'description,merchant_category,search_price,merchant_name,merchant_id,category_name,' +
  'category_id,currency,in_stock,stock_quantity,ean,delivery_cost,product_short_description';

function standardRow(over: Partial<Record<string, string>> = {}): string {
  const fields: Record<string, string> = {
    aw_deep_link: 'https://www.awin1.com/cread.php?awinmid=999999&p=test-fragrance-edp-100ml',
    product_name: 'Test Fragrance EDP 100ml',
    aw_product_id: 'AW1001',
    merchant_product_id: 'MP-1001',
    merchant_image_url: 'https://img.example.test/test-fragrance-100ml.jpg',
    description: 'A fresh, citrus scent, invented for testing only',
    merchant_category: 'Fragrance',
    search_price: '29.99',
    merchant_name: 'Test Merchant Ltd',
    merchant_id: '999999',
    category_name: 'Fragrance',
    category_id: '10',
    currency: 'GBP',
    in_stock: 'yes',
    stock_quantity: '42',
    ean: '5012345678901',
    delivery_cost: '2.99',
    product_short_description: 'Fresh, citrus, testing only',
    ...over,
  };
  return STANDARD_HEADER.split(',')
    .map((col) => csvField(fields[col] ?? ''))
    .join(',');
}

/** Quote a field only when it needs it, same as a real exporter would. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

describe('parseAwinFeed — header-driven column mapping', () => {
  it('maps every RawListing field off a standard-order header', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow()}\n`;
    const [l] = parseAwinFeed(csv);

    expect(l).toMatchObject({
      retailerSku: 'MP-1001',
      url: 'https://www.awin1.com/cread.php?awinmid=999999&p=test-fragrance-edp-100ml',
      rawTitle: 'Test Fragrance EDP 100ml',
      ean: '5012345678901',
      imageUrl: 'https://img.example.test/test-fragrance-100ml.jpg',
      priceGbp: 29.99,
      wasPriceGbp: null,
      promoEndsAt: null,
      inStock: true,
      sectionId: 'awin-feed',
    });
  });

  it('maps the same data correctly when columns arrive in a different order', () => {
    // Proves the parser reads by column name, not by position: same values,
    // header and row fields both reshuffled into a different order.
    const shuffledHeader =
      'search_price,ean,product_name,aw_deep_link,merchant_product_id,in_stock,' +
      'currency,merchant_image_url,aw_product_id,stock_quantity';
    const shuffledRow = [
      '18.50',
      '5098765432109',
      csvField('Test Fragrance No.2 EDT 50ml'),
      'https://www.awin1.com/cread.php?awinmid=999999&p=test-fragrance-no2-edt-50ml',
      'MP-2002',
      'true',
      'GBP',
      'https://img.example.test/test-fragrance-no2-50ml.jpg',
      'AW2002',
      '7',
    ].join(',');

    const csv = `${shuffledHeader}\n${shuffledRow}\n`;
    const [l] = parseAwinFeed(csv);

    expect(l).toMatchObject({
      retailerSku: 'MP-2002',
      url: 'https://www.awin1.com/cread.php?awinmid=999999&p=test-fragrance-no2-edt-50ml',
      rawTitle: 'Test Fragrance No.2 EDT 50ml',
      ean: '5098765432109',
      imageUrl: 'https://img.example.test/test-fragrance-no2-50ml.jpg',
      priceGbp: 18.5,
      inStock: true,
    });
  });

  it('falls back to aw_product_id when merchant_product_id is absent', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ merchant_product_id: '' })}\n`;
    expect(parseAwinFeed(csv)[0]?.retailerSku).toBe('AW1001');
  });

  it('falls back to aw_image_url when merchant_image_url is absent from the header', () => {
    const header = 'aw_deep_link,product_name,merchant_product_id,search_price,aw_image_url';
    const row = [
      'https://www.awin1.com/cread.php?awinmid=999999&p=test-fragrance-edp-100ml',
      csvField('Test Fragrance EDP 100ml'),
      'MP-1001',
      '29.99',
      'https://img.example.test/fallback-100ml.jpg',
    ].join(',');
    const csv = `${header}\n${row}\n`;
    expect(parseAwinFeed(csv)[0]?.imageUrl).toBe(
      'https://img.example.test/fallback-100ml.jpg',
    );
  });
});

describe('parseAwinFeed — price handling', () => {
  it('parses a plain decimal search_price', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ search_price: '45.00' })}\n`;
    expect(parseAwinFeed(csv)[0]?.priceGbp).toBe(45);
  });

  it('skips a row with an empty search_price', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ search_price: '' })}\n`;
    expect(parseAwinFeed(csv)).toHaveLength(0);
  });

  it('skips a row with a non-numeric search_price', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ search_price: 'POA' })}\n`;
    expect(parseAwinFeed(csv)).toHaveLength(0);
  });

  it('skips a row priced at zero', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ search_price: '0' })}\n`;
    expect(parseAwinFeed(csv)).toHaveLength(0);
  });

  it('keeps good rows when a malformed row sits between them', () => {
    const rows = [
      standardRow({ merchant_product_id: 'MP-1001', search_price: '29.99' }),
      standardRow({ merchant_product_id: 'MP-1002', product_name: 'Test Fragrance EDT 50ml', search_price: 'POA' }),
      standardRow({ merchant_product_id: 'MP-1003', product_name: 'Test Fragrance Parfum 30ml', search_price: '55.00' }),
    ];
    const csv = `${STANDARD_HEADER}\n${rows.join('\n')}\n`;
    const listings = parseAwinFeed(csv);
    expect(listings.map((l) => l.retailerSku)).toEqual(['MP-1001', 'MP-1003']);
  });

  it('skips a row priced in a currency other than GBP', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ currency: 'EUR', search_price: '29.99' })}\n`;
    expect(parseAwinFeed(csv)).toHaveLength(0);
  });
});

describe('parseAwinFeed — EAN passthrough', () => {
  it('passes a clean EAN through unchanged', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ ean: '5012345678901' })}\n`;
    expect(parseAwinFeed(csv)[0]?.ean).toBe('5012345678901');
  });

  it('strips formatting characters down to digits', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ ean: '5 012345 678901' })}\n`;
    expect(parseAwinFeed(csv)[0]?.ean).toBe('5012345678901');
  });

  it('is null when the feed carries no EAN for the row', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ ean: '' })}\n`;
    expect(parseAwinFeed(csv)[0]?.ean).toBeNull();
  });
});

describe('parseAwinFeed — required fields', () => {
  it('skips a row with no deep link', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ aw_deep_link: '' })}\n`;
    expect(parseAwinFeed(csv)).toHaveLength(0);
  });

  it('skips a row with no product name', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ product_name: '' })}\n`;
    expect(parseAwinFeed(csv)).toHaveLength(0);
  });
});

describe('parseAwinFeed — quoted CSV fields', () => {
  it('parses a field with an embedded comma without splitting it', () => {
    const csv =
      `${STANDARD_HEADER}\n` +
      `${standardRow({ description: 'Notes of bergamot, cedar, and musk — for testing only' })}\n`;
    const listings = parseAwinFeed(csv);
    // The embedded-comma field must not have shifted any later column.
    expect(listings).toHaveLength(1);
    expect(listings[0]?.priceGbp).toBe(29.99);
    expect(listings[0]?.ean).toBe('5012345678901');
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const csv =
      `${STANDARD_HEADER}\n` +
      `${standardRow({ product_name: 'Test "Signature" Fragrance EDP 100ml' })}\n`;
    expect(parseAwinFeed(csv)[0]?.rawTitle).toBe(
      'Test "Signature" Fragrance EDP 100ml',
    );
  });

  it('handles multiple quoted fields with commas on the same row', () => {
    const csv =
      `${STANDARD_HEADER}\n` +
      `${standardRow({
        product_name: 'Test Fragrance, Limited Edition, EDP 100ml',
        description: 'Top, heart, and base notes, all invented for this fixture',
      })}\n`;
    const listings = parseAwinFeed(csv);
    expect(listings).toHaveLength(1);
    expect(listings[0]?.rawTitle).toBe('Test Fragrance, Limited Edition, EDP 100ml');
    expect(listings[0]?.priceGbp).toBe(29.99);
  });
});

describe('parseAwinFeed — stock', () => {
  it('reads a true in_stock flag', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ in_stock: 'yes' })}\n`;
    expect(parseAwinFeed(csv)[0]?.inStock).toBe(true);
  });

  it('reads a false in_stock flag', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ in_stock: 'no' })}\n`;
    expect(parseAwinFeed(csv)[0]?.inStock).toBe(false);
  });

  it('falls back to stock_quantity when in_stock is absent', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ in_stock: '', stock_quantity: '3' })}\n`;
    expect(parseAwinFeed(csv)[0]?.inStock).toBe(true);
  });

  it('is null when neither in_stock nor stock_quantity is usable', () => {
    const csv = `${STANDARD_HEADER}\n${standardRow({ in_stock: '', stock_quantity: '' })}\n`;
    expect(parseAwinFeed(csv)[0]?.inStock).toBeNull();
  });
});

describe('parseAwinFeed — delimiter sniffing', () => {
  it('parses a tab-separated export the same way as a comma-separated one', () => {
    const header = 'aw_deep_link\tproduct_name\tmerchant_product_id\tsearch_price\tean';
    const row = [
      'https://www.awin1.com/cread.php?awinmid=999999&p=test-fragrance-edp-100ml',
      'Test Fragrance EDP 100ml',
      'MP-1001',
      '29.99',
      '5012345678901',
    ].join('\t');
    const csv = `${header}\n${row}\n`;
    const [l] = parseAwinFeed(csv);
    expect(l?.retailerSku).toBe('MP-1001');
    expect(l?.priceGbp).toBe(29.99);
    expect(l?.ean).toBe('5012345678901');
  });
});

describe('parseAwinFeed — empty input', () => {
  it('returns an empty array for an empty file', () => {
    expect(parseAwinFeed('')).toEqual([]);
  });

  it('returns an empty array for a header row with no data rows', () => {
    expect(parseAwinFeed(`${STANDARD_HEADER}\n`)).toEqual([]);
  });
});
