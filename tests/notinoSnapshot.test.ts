import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readSnapshotFile, encodeSnapshot, decodeSnapshot, type CatalogueSnapshot } from '../src/catalogue/store.js';
import { isTooOldToShow } from '../src/services/offerAge.js';

const FILE = resolve(__dirname, '../data/catalogue/notino-uk.json');

// PR 5 review (8 Oct 2026) thought 28 listings had lost `lastSeenAt`. They had
// not: the store writes the date most listings share once, as `seenAt`, and
// puts it back on read (src/catalogue/store.ts). These tests pin that, so a
// listing without a readable date can never reach the page (an unreadable date
// counts as "not too old").
describe('data/catalogue/notino-uk.json', () => {
  const snap = readSnapshotFile<CatalogueSnapshot>(FILE);

  it('gives every listing a readable lastSeenAt once read through the store', () => {
    expect(snap.listings.length).toBeGreaterThanOrEqual(104);
    for (const l of snap.listings) {
      expect(Number.isNaN(Date.parse(l.lastSeenAt)), `${l.retailerSku} lastSeenAt`).toBe(false);
    }
  });

  it('keeps the older crawl listings at the date of that crawl, and the saved page rows at their own day', () => {
    const old = snap.listings.filter((l) => l.sectionId !== 'saved-page');
    expect(old.length).toBeGreaterThanOrEqual(95);
    for (const l of old) expect(l.lastSeenAt >= '2026-08-27' && l.lastSeenAt < '2026-09-10', l.retailerSku).toBe(true);
    const saved = snap.listings.filter((l) => l.sectionId === 'saved-page');
    expect(saved.length).toBeGreaterThanOrEqual(9);
    for (const l of saved) expect(l.lastSeenAt.startsWith('2026-10-0')).toBe(true);
  });

  it('survives the round trip: encode then decode loses no lastSeenAt', () => {
    const back = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(snap))) as CatalogueSnapshot);
    expect(back.listings.map((l) => l.lastSeenAt)).toEqual(snap.listings.map((l) => l.lastSeenAt));
  });

  it('hides a listing from September (older than the show window)', () => {
    const old = snap.listings.find((l) => l.sectionId !== 'saved-page')!;
    expect(isTooOldToShow(old.lastSeenAt, new Date('2026-10-09T12:00:00Z'))).toBe(true);
  });
});
