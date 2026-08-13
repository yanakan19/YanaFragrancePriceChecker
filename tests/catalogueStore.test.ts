import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore, type CatalogueSnapshot } from '../src/catalogue/store.js';
import type { StoredListing } from '../src/catalogue/types.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'catalogue-store-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const listing = (retailerId: string, url: string): StoredListing => ({
  retailerId,
  retailerSku: url,
  url,
  rawTitle: 'Product',
  rawBrand: 'Brand',
  ean: null,
  imageUrl: null,
  priceGbp: 10,
  wasPriceGbp: null,
  promoEndsAt: null,
  inStock: true,
  sectionId: 'fragrance',
  firstSeenAt: '2026-08-13T21:00:00.000Z',
  lastSeenAt: '2026-08-13T21:00:00.000Z',
  status: 'active',
  delistedAt: null,
  relistedAt: null,
  eligibleForNewBadge: true,
  variantId: null,
});

const snapshot = (retailerId: string, urls: string[]): CatalogueSnapshot => ({
  retailerId,
  updatedAt: '2026-08-13T21:00:00.000Z',
  source: 'live',
  listings: urls.map((url) => listing(retailerId, url)),
  runs: [],
});

describe('CatalogueStore.write', () => {
  it('round-trips a snapshot', () => {
    const store = new CatalogueStore(root);
    store.write(snapshot('boots', ['https://example.test/a']));
    expect(store.read('boots').listings).toHaveLength(1);
  });

  // The harvest is now capped by the workflow and killed mid-flight when it runs
  // out of budget, so "what is on disk when the process dies" is a routine case
  // rather than a disaster. A temp file left in data/catalogue would be picked
  // up by the commit step that follows and pushed to the branch.
  it('leaves no temp file beside the snapshot', () => {
    const store = new CatalogueStore(root);
    store.write(snapshot('boots', ['https://example.test/a']));
    expect(readdirSync(root)).toEqual(['boots.json']);
  });

  // The point of the rename: a reader either sees the old file or the new one.
  // Truncate-then-write would let a kill in between leave a prefix on disk, and
  // read() throws on a snapshot it cannot parse — so the next run would fail
  // outright on a file this run corrupted.
  it('replaces the previous snapshot whole', () => {
    const store = new CatalogueStore(root);
    store.write(snapshot('boots', ['https://example.test/a']));
    store.write(snapshot('boots', ['https://example.test/b', 'https://example.test/c']));

    const raw = readFileSync(join(root, 'boots.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(store.read('boots').listings.map((l) => l.url)).toEqual([
      'https://example.test/b',
      'https://example.test/c',
    ]);
  });

  it('still refuses to read a snapshot it cannot parse', () => {
    writeFileSync(join(root, 'boots.json'), '{"retailerId":"boots","listi');
    expect(() => new CatalogueStore(root).read('boots')).toThrow(/unreadable/);
  });
});
