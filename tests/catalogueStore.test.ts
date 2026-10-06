import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CatalogueStore, commonSeenAt, decodeSnapshot, encodeSnapshot, readSnapshotFile, type CatalogueSnapshot, type StoredSnapshotFile,
} from '../src/catalogue/store.js';
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

// "Last seen" once per run on disk (2026-10-06, strategy item 6): the store
// writes the time most listings share once, and every reader still sees each
// listing's own lastSeenAt, in its place.
describe('last seen once per run', () => {
  const RUN = '2026-10-06T08:50:40.023Z';
  const OLDER = '2026-10-05T10:00:00.000Z';
  const mixed = (): CatalogueSnapshot => {
    const s = snapshot('boots', ['https://example.test/a', 'https://example.test/b', 'https://example.test/c']);
    s.listings[0]!.lastSeenAt = RUN;
    s.listings[1]!.lastSeenAt = OLDER;
    s.listings[2]!.lastSeenAt = RUN;
    return s;
  };

  it('writes the shared time once and only the listings that differ carry their own', () => {
    const store = new CatalogueStore(root);
    store.write(mixed());
    const raw = JSON.parse(readFileSync(join(root, 'boots.json'), 'utf8')) as StoredSnapshotFile;
    expect(raw.seenAt).toBe(RUN);
    expect(Object.keys(raw).slice(0, 4)).toEqual(['retailerId', 'updatedAt', 'seenAt', 'source']);
    expect(raw.listings.map((l) => l.lastSeenAt)).toEqual([undefined, OLDER, undefined]);
  });

  it('reads back exactly the snapshot it was given, key order included', () => {
    const store = new CatalogueStore(root);
    store.write(mixed());
    expect(JSON.stringify(store.read('boots'))).toBe(JSON.stringify(mixed()));
    expect(JSON.stringify(readSnapshotFile(join(root, 'boots.json')))).toBe(JSON.stringify(mixed()));
    expect(decodeSnapshot(encodeSnapshot(mixed()))).toEqual(mixed());
  });

  it('reads a file written before it unchanged', () => {
    writeFileSync(join(root, 'boots.json'), `${JSON.stringify(mixed(), null, 2)}\n`);
    expect(JSON.stringify(new CatalogueStore(root).read('boots'))).toBe(JSON.stringify(mixed()));
  });

  it('picks the commonest time, the later one on a tie, and leaves an empty shop alone', () => {
    expect(commonSeenAt([{ lastSeenAt: OLDER }, { lastSeenAt: RUN }, { lastSeenAt: OLDER }])).toBe(OLDER);
    expect(commonSeenAt([{ lastSeenAt: OLDER }, { lastSeenAt: RUN }])).toBe(RUN);
    expect(commonSeenAt([{ lastSeenAt: RUN }, { lastSeenAt: OLDER }])).toBe(RUN);
    const empty = snapshot('boots', []);
    expect(encodeSnapshot(empty)).toEqual(empty);
  });

  it('gives back every real snapshot on the branch exactly', () => {
    for (const dir of ['data/catalogue', 'data/houses']) {
      const full = join(__dirname, '..', dir);
      for (const f of readdirSync(full).filter((x) => x.endsWith('.json')).slice(0, 12)) {
        const decoded = readSnapshotFile(join(full, f));
        const again = decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(decoded))) as CatalogueSnapshot);
        expect(JSON.stringify(again), `${dir}/${f}`).toBe(JSON.stringify(decoded));
      }
    }
  });
});
