import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';

/**
 * The built catalogue after src/catalogue/htmlEntities.ts: what Beauty Flash,
 * Gorgeous Shop and the other shops send HTML escaped reaches the page decoded.
 * The decoder itself is tested in tests/htmlEntities.test.ts.
 */
describe('the built catalogue', () => {
  const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

  it('shows no HTML entity in a brand, a product name or a shop title', () => {
    const found: string[] = [];
    for (const p of CATALOGUE) {
      const shopTitles = (CRAWLED[p.id] ?? []).map((o) => o.title ?? '');
      for (const text of [p.brand, p.name, p.giftSet?.title ?? '', ...(p.giftSet?.contents ?? []), ...shopTitles]) {
        if (ENTITY.test(text)) found.push(`${p.id}: ${text}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('holds each house a shop sent escaped as one brand', () => {
    const brands = new Set(CATALOGUE.map((p) => p.brand));
    for (const brand of ['Abercrombie & Fitch', 'Dolce & Gabbana', 'Tiffany & Co', 'Viktor & Rolf', 'Zadig & Voltaire']) {
      expect(brands.has(brand), brand).toBe(true);
      expect(brands.has(brand.replace('&', '&amp;')), brand).toBe(false);
    }
  });
});
