import { describe, expect, it } from 'vitest';
import { answeredShopIds, freshnessTable, priceSourceOf } from '../src/catalogue/harvestFreshness.js';
import type { ShopHarvestOutcome } from '../src/catalogue/harvestReport.js';

/** The freshness table written after a sweep, and what it says about shops the sweep never asks. */
const outcome = (id: string, tier: ShopHarvestOutcome['tier'] = 'free', errors: string[] = []): ShopHarvestOutcome => ({
  retailerId: id, name: id, urlsDiscovered: 1, pagesFetched: 1, priced: 1, tier, renderer: null, errorCount: errors.length, errors, finishedAt: '2026-10-21T10:00:00.000Z',
});
const now = new Date('2026-10-21T12:00:00.000Z');
const listing = (hoursAgo: number) => ({ retailerId: 'x', status: 'active', priceGbp: 10, lastSeenAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString() });
const snap = (hoursAgo: number[]) => ({ source: 'live', listings: hoursAgo.map(listing) }) as never;

describe('which shops answered', () => {
  it('counts a shop that priced something and was not refused', () => {
    expect([...answeredShopIds([outcome('a'), outcome('b', 'none'), outcome('c', 'render'), outcome('d', 'free', ['https://d.test/x: HTTP 429'])])]).toEqual(['a']);
  });
});

describe('where a shop\'s prices come from', () => {
  it('names the feed and the import, and nothing for a swept shop', () => {
    expect(priceSourceOf('affiliate-feed')).toBe('feed');
    expect(priceSourceOf('owner-import')).toBe('import');
    expect(priceSourceOf('unknown')).toBeUndefined();
    expect(priceSourceOf(undefined)).toBeUndefined();
  });

  it('marks feed and import shops in the table by their source, whether or not the sweep got an answer, and leaves swept shops unmarked', () => {
    const table = freshnessTable(
      [outcome('swept')],
      [{ id: 'swept', adapter: 'unknown' }, { id: 'feed', adapter: 'affiliate-feed' }, { id: 'saved', adapter: 'owner-import' }, { id: 'nothing', adapter: 'unknown' }],
      (id) => (id === 'nothing' ? ({ source: 'fixtures', listings: [] } as never) : snap([1, 30, 60])),
      now,
    );
    expect(Object.keys(table).sort()).toEqual(['feed', 'saved', 'swept']);
    expect(table.swept).toMatchObject({ answered: true });
    expect('source' in table.swept!).toBe(false);
    expect(table.feed).toMatchObject({ answered: false, source: 'feed', shown: 3, over48h: 1 });
    expect(table.saved).toMatchObject({ source: 'import' });
  });
});
