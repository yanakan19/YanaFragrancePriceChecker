import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAZY_DATA_MODULES } from '../scripts/dataFiles.js';
import { createDormant, dormantEntry, prepareDormant, DORMANT_FILE } from '../demo/dormantStore.js';
import { headFor } from '../demo/head.js';
import { DORMANT_PRODUCTS } from '../demo/dormant.generated.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { DEALS } from '../demo/data.js';
import type { DormantEntry } from '../src/catalogue/dormantProducts.js';

/**
 * Products with no current prices keep a page, and nothing else about the site
 * learns of them.
 */
const sample: DormantEntry = {
  slug: 'lacoste_touch_of_pink_90ml',
  brand: 'Lacoste',
  name: 'Lacoste Touch of Pink',
  concentration: 'Eau de Toilette',
  sizeMl: 90,
  ean: null,
  image: null,
  older: [{ retailerId: 'superdrug', price: 22.5, fetchedAt: '2026-08-21T10:00:00.000Z', stock: 'inStock' }],
};

describe('the data file', () => {
  it('is a lazy file, so it is not in the first load', () => {
    expect(LAZY_DATA_MODULES[DORMANT_FILE]).toEqual(['DORMANT_PRODUCTS', 'ID_ALIASES', 'SLUG_ALIASES']);
  });

  it('accepts a file of the right shape and refuses any other', () => {
    expect(prepareDormant({ DORMANT_PRODUCTS: { a: sample }, ID_ALIASES: {}, SLUG_ALIASES: {} })).toEqual({ products: { a: sample }, aliases: {}, slugAliases: {} });
    for (const bad of [null, [], {}, { DORMANT_PRODUCTS: null }, { DORMANT_PRODUCTS: [] }, 'x', { DORMANT_PRODUCTS: {} }]) {
      expect(() => prepareDormant(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it('is fetched through the loader by name, once, and not remembered when it fails', async () => {
    const calls: string[] = [];
    let fail = true;
    const store = createDormant((name) => {
      calls.push(name);
      return fail ? Promise.reject(new Error('offline')) : Promise.resolve({ DORMANT_PRODUCTS: { a: sample }, ID_ALIASES: {}, SLUG_ALIASES: {} });
    });
    expect(store.current()).toBeNull();
    await expect(store.load()).rejects.toThrow('offline');
    expect(store.status()).toBe('failed');
    fail = false;
    await expect(store.load()).resolves.toEqual({ products: { a: sample }, aliases: {}, slugAliases: {} });
    await store.load();
    expect(calls).toEqual(['dormant', 'dormant']);
  });

  it('reads an entry by its own id only, never a name on the prototype', () => {
    expect(dormantEntry('constructor')).toBeUndefined();
    expect(dormantEntry('toString')).toBeUndefined();
  });
});

describe('the pages it keeps', () => {
  it('are kept off search engines, like a shop with nothing to show', () => {
    const route = { name: 'fragrance' as const, param: 'superdrug-114499', query: {} };
    expect(headFor({ route, leafName: 'Lacoste Touch of Pink 90ml', leafEmpty: true }).noindex).toBe(true);
    expect(headFor({ route, leafName: 'Lacoste Touch of Pink 90ml' }).noindex).toBe(false);
  });
});

describe('the built data', () => {
  const ids = Object.keys(DORMANT_PRODUCTS);

  it('holds only products the catalogue does not, so none is in a list, a count, a search or Most stocked', () => {
    const live = new Set(CATALOGUE.map((c) => c.id));
    for (const id of ids) expect(live.has(id), id).toBe(false);
  });

  it('has no current offer, so none is in a price list or a deal', () => {
    const dealIds = new Set(DEALS.map((d) => d.fragrance.id));
    for (const id of ids) {
      expect(CRAWLED[id] ?? [], id).toEqual([]);
      expect(dealIds.has(id), id).toBe(false);
    }
  });

  it('is not in the sitemap', () => {
    const sitemap = readFileSync(resolve(import.meta.dirname, '../demo/sitemap.xml'), 'utf8');
    for (const id of ids) expect(sitemap.includes(`/fragrance/${id}<`), id).toBe(false);
  });

  it('gives every page something to draw: a name, and at least one price a shop once confirmed', () => {
    for (const id of ids) {
      const e = DORMANT_PRODUCTS[id]!;
      expect(e.name.length, id).toBeGreaterThan(0);
      expect(e.older.length, id).toBeGreaterThan(0);
      for (const o of e.older) {
        expect(o.price, id).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(o.fetchedAt)), id).toBe(false);
      }
    }
  });
});
