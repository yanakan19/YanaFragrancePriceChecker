import { describe, expect, it } from 'vitest';
import { HIDE_OFFER_AFTER_DAYS, isTooOldToShow } from '../src/services/offerAge.js';
import { shopFreshness } from '../src/catalogue/freshness.js';
import { getRetailer } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

const NOW = new Date('2026-10-09T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe('isTooOldToShow with an unreadable date', () => {
  it('shows a valid recent date and hides a valid old one, for either kind of shop', () => {
    for (const flag of [false, true]) {
      expect(isTooOldToShow(ago(1), NOW, flag)).toBe(false);
      expect(isTooOldToShow(ago(HIDE_OFFER_AFTER_DAYS + 1), NOW, flag)).toBe(true);
    }
  });

  it('hides an unreadable or missing date when the shop is import only', () => {
    expect(isTooOldToShow('not-a-date', NOW, true)).toBe(true);
    expect(isTooOldToShow('', NOW, true)).toBe(true);
    expect(isTooOldToShow(undefined as unknown as string, NOW, true)).toBe(true);
  });

  it('leaves every other shop unchanged: an unreadable date is not too old', () => {
    expect(isTooOldToShow('not-a-date', NOW)).toBe(false);
    expect(isTooOldToShow('not-a-date', NOW, false)).toBe(false);
    expect(isTooOldToShow(undefined as unknown as string, NOW)).toBe(false);
  });
});

describe('shopFreshness applies it by the shop adapter', () => {
  const listing = (retailerId: string, lastSeenAt: string | undefined): StoredListing =>
    ({ retailerId, status: 'active', priceGbp: 50, lastSeenAt } as unknown as StoredListing);

  it('Notino UK is an owner import shop', () => {
    expect(getRetailer('notino-uk')?.adapter).toBe('owner-import');
  });

  it('does not count a Notino listing with a broken date, and keeps counting other shops', () => {
    const other = "boots";
    expect(shopFreshness([listing('notino-uk', undefined), listing('notino-uk', 'junk')], NOW).shown).toBe(0);
    expect(shopFreshness([listing('notino-uk', ago(1))], NOW).shown).toBe(1);
    expect(shopFreshness([listing('notino-uk', ago(30))], NOW).shown).toBe(0);
    expect(shopFreshness([listing(other, 'junk')], NOW).shown).toBe(1);
  });
});

