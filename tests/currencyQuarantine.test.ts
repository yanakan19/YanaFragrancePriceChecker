import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findQuarantineViolations,
  assertNoQuarantinedGbpPrices,
} from '../src/catalogue/currencyQuarantine.js';
import { quarantinePrices } from '../src/catalogue/priceQuarantine.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { CURRENCY_UNCONFIRMED } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * The regression these exist for: on 2026-08-13 commit 86c4660 cleared 8,104
 * Escentual prices as a deliberate quarantine, and 5c32130 — a routine
 * scheduled harvest ninety minutes later — wrote all 8,104 straight back. The
 * quarantine was a fact about a file; the harvest read its instructions from
 * the registry; nothing connected the two.
 */

const QUARANTINED: ReadonlyMap<string, string> = new Map([
  ['escentual', 'Measured quoting a US runner USD at rate 1.38605 on 2026-08-15.'],
]);

function listing(url: string, priceGbp: number | null, over: Partial<StoredListing> = {}): StoredListing {
  return {
    url,
    rawTitle: 'Calvin Klein Obsession For Men Eau de Toilette 125ml',
    rawBrand: 'Calvin Klein',
    priceGbp,
    currency: 'GBP',
    wasPriceGbp: null,
    inStock: true,
    imageUrl: null,
    description: null,
    sectionId: 'shopify-products-json',
    retailerId: 'escentual',
    firstSeenAt: '2026-08-01T00:00:00.000Z',
    lastSeenAt: '2026-08-13T00:00:00.000Z',
    status: 'active',
    delistedAt: null,
    relistedAt: null,
    eligibleForNewBadge: false,
    variantId: null,
    ...over,
  } as StoredListing;
}

describe('findQuarantineViolations', () => {
  it('finds nothing for a retailer that is not quarantined', () => {
    expect(findQuarantineViolations('allbeauty', [listing('a', 57)], QUARANTINED)).toEqual([]);
  });

  it('finds an active sterling price on a quarantined retailer', () => {
    const found = findQuarantineViolations('escentual', [listing('a', 57)], QUARANTINED);
    expect(found).toEqual([{ url: 'a', field: 'priceGbp', amount: 57 }]);
  });

  it('finds a was-price left behind on a row with no current price', () => {
    const found = findQuarantineViolations(
      'escentual',
      [listing('a', null, { wasPriceGbp: 72 })],
      QUARANTINED,
    );
    expect(found).toEqual([{ url: 'a', field: 'wasPriceGbp', amount: 72 }]);
  });

  it('leaves a delisted row alone — its price is a record of the past', () => {
    const found = findQuarantineViolations(
      'escentual',
      [listing('a', 57, { status: 'delisted' })],
      QUARANTINED,
    );
    expect(found).toEqual([]);
  });

  it('accepts a properly quarantined snapshot, nativePrice and all', () => {
    const cleared = quarantinePrices([listing('a', 57), listing('b', 41)], 'USD');
    expect(findQuarantineViolations('escentual', cleared.listings, QUARANTINED)).toEqual([]);
    expect(cleared.listings[0]!.nativePrice).toEqual({ amount: 57, currency: 'USD' });
  });
});

describe('assertNoQuarantinedGbpPrices', () => {
  it('says nothing at all for a retailer nobody has questioned', () => {
    expect(() => assertNoQuarantinedGbpPrices('allbeauty', [listing('a', 57)], QUARANTINED)).not.toThrow();
  });

  it('throws, rather than dropping the row, when a sterling price is offered', () => {
    expect(() => assertNoQuarantinedGbpPrices('escentual', [listing('a', 57)], QUARANTINED)).toThrow(
      /Refusing to write 1 sterling price\(s\) for "escentual"/,
    );
  });

  it('names the reason on file so the message is actionable without a git log', () => {
    expect(() => assertNoQuarantinedGbpPrices('escentual', [listing('a', 57)], QUARANTINED)).toThrow(
      /1\.38605/,
    );
  });

  it('counts every offender and names only the first few', () => {
    const many = Array.from({ length: 8104 }, (_, i) => listing(`u${i}`, 57));
    expect(() => assertNoQuarantinedGbpPrices('escentual', many, QUARANTINED)).toThrow(
      /Refusing to write 8104 sterling price\(s\).*and 8101 more/s,
    );
  });

  it('passes once the same rows have been through quarantinePrices', () => {
    const many = Array.from({ length: 8104 }, (_, i) => listing(`u${i}`, 57));
    const cleared = quarantinePrices(many, 'USD');
    expect(cleared.cleared).toBe(8104);
    expect(() => assertNoQuarantinedGbpPrices('escentual', cleared.listings, QUARANTINED)).not.toThrow();
  });
});

describe('CatalogueStore.write — the lock the 13 Aug harvest walked past', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'quarantine-store-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function snapshot(retailerId: string, listings: StoredListing[]) {
    return { retailerId, updatedAt: '2026-08-13T12:04:39.000Z', source: 'live' as const, listings, runs: [] };
  }

  /**
   * The whole point. Every id in CURRENCY_UNCONFIRMED is enforced against the
   * live registry here, not against a stand-in, so adding a shop to that list
   * arms this without anyone remembering to.
   */
  it('refuses a harvest-shaped write of sterling prices for every currently quarantined id', () => {
    const store = new CatalogueStore(root);
    expect(CURRENCY_UNCONFIRMED.size).toBeGreaterThan(0);
    for (const id of CURRENCY_UNCONFIRMED.keys()) {
      expect(() => store.write(snapshot(id, [listing('https://x.test/a', 57, { retailerId: id })]))).toThrow(
        /CURRENCY_UNCONFIRMED/,
      );
      expect(existsSync(join(root, `${id}.json`))).toBe(false);
    }
  });

  it('leaves no half-written file or temp file behind when it refuses', () => {
    const store = new CatalogueStore(root);
    const id = [...CURRENCY_UNCONFIRMED.keys()][0] as string;
    expect(() => store.write(snapshot(id, [listing('https://x.test/a', 57, { retailerId: id })]))).toThrow();
    expect(existsSync(join(root, `${id}.json`))).toBe(false);
  });

  it('accepts the same snapshot once its prices are quarantined, keeping the listings', () => {
    const store = new CatalogueStore(root);
    const id = [...CURRENCY_UNCONFIRMED.keys()][0] as string;
    const rows = [listing('https://x.test/a', 57, { retailerId: id })];
    const cleared = quarantinePrices(rows, null);
    store.write(snapshot(id, cleared.listings));

    const written = JSON.parse(readFileSync(join(root, `${id}.json`), 'utf8')) as {
      listings: StoredListing[];
    };
    expect(written.listings).toHaveLength(1);
    expect(written.listings[0]!.priceGbp).toBeNull();
    expect(written.listings[0]!.nativePrice).toEqual({ amount: 57, currency: 'unknown' });
  });

  it('does not stand in the way of an ordinary retailer', () => {
    const store = new CatalogueStore(root);
    expect(CURRENCY_UNCONFIRMED.has('allbeauty')).toBe(false);
    store.write(snapshot('allbeauty', [listing('https://x.test/a', 57, { retailerId: 'allbeauty' })]));
    expect(existsSync(join(root, 'allbeauty.json'))).toBe(true);
  });
});

describe('the real snapshots on disk', () => {
  it('holds no sterling price for any currency-quarantined shop', async () => {
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const store = new CatalogueStore(resolve(repoRoot, 'data/catalogue'));

    for (const id of CURRENCY_UNCONFIRMED.keys()) {
      const snap = store.read(id);
      const violations = findQuarantineViolations(id, snap.listings);
      expect(
        violations.length,
        `data/catalogue/${id}.json publishes ${violations.length} sterling figure(s) for a shop ` +
          'whose currency is not established — run npm run quarantine:prices -- --shop=' + id,
      ).toBe(0);
    }
  });

  /**
   * Clearing today's snapshot cannot reach the past. build-price-history.ts
   * replays old catalogue commits, so the pre-quarantine files still hold the
   * figures the quarantine took down, and 4,961 of 16,437 published points
   * were a quarantined shop's until 2026-08-16. This asserts the published
   * artifact, not the script, because the artifact is what a reader sees.
   */
  it('plots no price-history point for a currency-quarantined shop', async () => {
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const history = readFileSync(resolve(repoRoot, 'demo/priceHistory.generated.ts'), 'utf8');

    // Sanity: the file really is the point series, not something that has moved.
    expect(history).toContain('"priceGbp":');

    for (const id of CURRENCY_UNCONFIRMED.keys()) {
      expect(
        history.includes(`"retailerId":"${id}"`),
        `demo/priceHistory.generated.ts plots points attributed to ${id}, whose currency is not ` +
          'established — rerun npm run catalogue:history',
      ).toBe(false);
    }
  });
});
