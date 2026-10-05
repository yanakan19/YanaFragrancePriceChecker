import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  changeSinceSaved,
  effectiveWishlistSort,
  sortWishlist,
  wishlistSortsFor,
  WISHLIST_SORTS,
} from '../src/services/accountMenu.js';

/**
 * A fake of the little of the Supabase client that demo/wishlist.ts uses, so
 * the quiet degrade before migration 0005 can be driven without a database.
 */
interface Fake {
  hasColumn: boolean;
  rows: Record<string, unknown>[];
  calls: string[];
}
const fake: Fake = { hasColumn: true, rows: [], calls: [] };

vi.mock('../demo/supabase.js', () => {
  const columnError = (via: 'read' | 'write') =>
    via === 'read'
      ? { code: '42703', message: 'column wishlists.saved_price_gbp does not exist' }
      : { code: 'PGRST204', message: "Could not find the 'saved_price_gbp' column of 'wishlists' in the schema cache" };
  return {
    supabase: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => ({
        select: (columns: string) => ({
          eq: () => ({
            order: async () => {
              fake.calls.push(`select ${columns}`);
              if (!fake.hasColumn && columns.includes('saved_price_gbp')) return { data: null, error: columnError('read') };
              return { data: fake.rows.map((r) => (fake.hasColumn ? r : { ...r, saved_price_gbp: undefined })), error: null };
            },
          }),
        }),
        insert: async (row: Record<string, unknown>) => {
          fake.calls.push(`insert ${JSON.stringify(row)}`);
          if (!fake.hasColumn && 'saved_price_gbp' in row) return { error: columnError('write') };
          if (fake.rows.some((r) => r.fragrance_id === row.fragrance_id)) return { error: { code: '23505', message: 'duplicate key' } };
          fake.rows.push(row);
          return { error: null };
        },
        upsert: async (row: Record<string, unknown>) => {
          fake.calls.push(`upsert ${JSON.stringify(row)}`);
          const at = fake.rows.findIndex((r) => r.fragrance_id === row.fragrance_id);
          if (at >= 0) fake.rows[at] = { ...fake.rows[at], ...row };
          else fake.rows.push(row);
          return { error: null };
        },
      }),
    }),
  };
});

const { addToWishlist, cleanSavedPrice, fetchWishlist, resetSavedPriceColumn, savedPriceAvailable } = await import('../demo/wishlist.js');

beforeEach(() => {
  fake.hasColumn = true;
  fake.rows = [];
  fake.calls = [];
  resetSavedPriceColumn();
});

describe('writing the saved price', () => {
  it('stores the cheapest delivered price on the day it was saved, with a new row', async () => {
    await addToWishlist('ean-1', null, 41.5);
    expect(fake.rows).toEqual([{ user_id: 'u1', fragrance_id: 'ean-1', target_price_gbp: null, saved_price_gbp: 41.5 }]);
  });

  it('never moves the price a row was first saved at', async () => {
    await addToWishlist('ean-1', null, 41.5);
    await addToWishlist('ean-1', 30, 20);
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]!.saved_price_gbp).toBe(41.5);
    expect(fake.rows[0]!.target_price_gbp).toBe(30);
  });

  it('leaves it out when there was no delivered price that day', async () => {
    await addToWishlist('ean-2', null, null);
    expect(fake.calls.some((c) => c.includes('saved_price_gbp'))).toBe(false);
    expect(fake.rows).toEqual([{ user_id: 'u1', fragrance_id: 'ean-2', target_price_gbp: null }]);
  });

  it('records a real price to the penny and nothing else', () => {
    expect(cleanSavedPrice(41.499)).toBe(41.5);
    for (const bad of [null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(cleanSavedPrice(bad as number | null)).toBeNull();
  });
});

describe('before the owner runs migration 0005', () => {
  beforeEach(() => {
    fake.hasColumn = false;
  });

  it('still saves, without the price, and says so quietly', async () => {
    const result = await addToWishlist('ean-1', null, 41.5);
    expect(result).toEqual({ ok: true });
    expect(fake.rows).toEqual([{ user_id: 'u1', fragrance_id: 'ean-1', target_price_gbp: null }]);
    expect(savedPriceAvailable()).toBe(false);
  });

  it('still reads the list, every row with no saved price', async () => {
    fake.rows = [{ fragrance_id: 'ean-1', target_price_gbp: null, added_at: '2026-10-01T00:00:00Z' }];
    const list = await fetchWishlist();
    expect(list).toEqual([{ fragranceId: 'ean-1', targetPriceGbp: null, addedAt: '2026-10-01T00:00:00Z', savedPriceGbp: null }]);
    expect(fake.calls).toEqual([
      'select fragrance_id, target_price_gbp, added_at, saved_price_gbp',
      'select fragrance_id, target_price_gbp, added_at',
    ]);
  });

  it('does not ask for the missing column again once it knows', async () => {
    fake.rows = [];
    await fetchWishlist();
    fake.calls = [];
    await fetchWishlist();
    expect(fake.calls).toEqual(['select fragrance_id, target_price_gbp, added_at']);
  });
});

describe('after it', () => {
  it('reads the saved price, null for an old row that has none', async () => {
    fake.rows = [
      { fragrance_id: 'new', target_price_gbp: null, added_at: '2026-10-05T00:00:00Z', saved_price_gbp: 52.99 },
      { fragrance_id: 'old', target_price_gbp: null, added_at: '2026-10-01T00:00:00Z', saved_price_gbp: null },
    ];
    const list = await fetchWishlist();
    expect(list.map((e) => e.savedPriceGbp)).toEqual([52.99, null]);
    expect(savedPriceAvailable()).toBe(true);
  });
});

describe('change since saved', () => {
  it('is today less the saved price, to the penny, negative for a drop', () => {
    expect(changeSinceSaved(60, 56)).toBe(-4);
    expect(changeSinceSaved(41.5, 44.99)).toBe(3.49);
    expect(changeSinceSaved(30, 30)).toBe(0);
  });

  it('is nothing at all without both prices: never worked out from today', () => {
    expect(changeSinceSaved(null, 56)).toBeNull();
    expect(changeSinceSaved(60, null)).toBeNull();
    expect(changeSinceSaved(null, null)).toBeNull();
  });
});

describe('the Biggest Drop sort', () => {
  const rows = [
    { name: 'Flat', addedAt: '2026-10-02T00:00:00Z', priceGbp: 50, changeGbp: 0 },
    { name: 'Small', addedAt: '2026-10-03T00:00:00Z', priceGbp: 50, changeGbp: -2 },
    { name: 'Big', addedAt: '2026-10-01T00:00:00Z', priceGbp: 50, changeGbp: -9.5 },
    { name: 'Dearer', addedAt: '2026-10-04T00:00:00Z', priceGbp: 50, changeGbp: 4 },
    { name: 'Old row', addedAt: '2026-09-01T00:00:00Z', priceGbp: 50, changeGbp: null },
  ];

  it('is offered only where some row has a change to rank', () => {
    expect(wishlistSortsFor(false).map((s) => s.label)).toEqual(['Newest to Oldest Saved', 'Lowest to Highest Price']);
    expect(wishlistSortsFor(true).map((s) => s.label)).toEqual(['Newest to Oldest Saved', 'Lowest to Highest Price', 'Biggest to Smallest Drop']);
    expect(WISHLIST_SORTS.map((s) => s.label)).toEqual(['Newest to Oldest Saved', 'Lowest to Highest Price']);
  });

  it('puts the largest fall first, then flat, then dearer, and a row with no change last', () => {
    expect(sortWishlist(rows, 'drop').map((r) => r.name)).toEqual(['Big', 'Small', 'Flat', 'Dearer', 'Old row']);
  });

  it('falls back to Newest to Oldest Saved when it is chosen but no longer on offer', () => {
    expect(effectiveWishlistSort('drop', false)).toBe('recent');
    expect(effectiveWishlistSort('drop', true)).toBe('drop');
    expect(effectiveWishlistSort('cheapest', false)).toBe('cheapest');
  });
});

describe('the migration', () => {
  const dir = resolve(import.meta.dirname, '../supabase/migrations');
  const file = readdirSync(dir).find((f) => f.includes('wishlist_saved_price'))!;
  const sql = readFileSync(resolve(dir, file), 'utf8');

  it('is the next number, adds a nullable column and is safe to run twice', () => {
    const numbers = readdirSync(dir).map((f) => Number(f.slice(0, 4)));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(file).toMatch(/^\d{4}_wishlist_saved_price\.sql$/);
    expect(sql).toMatch(/add column if not exists saved_price_gbp numeric\(10, 2\);/);
    expect(sql).not.toMatch(/saved_price_gbp[^;]*not null/i);
    expect(sql).toMatch(/drop constraint if exists wishlists_saved_price_nonneg/);
  });
});
