import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { headFor, SITE_URL } from '../demo/head.js';
import { matchRoute, setProductSlugLookup } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The sitemap lists every product by its own address and names no old one, and
 * that address is the one the page gives as canonical. The sitemap is built at
 * deploy time (scripts/build-sitemap.ts, npm run demo); `npm test` builds it
 * first when it is missing.
 */
describe('the sitemap lists product addresses', () => {
  const xml = readFileSync(resolve(root, 'demo/sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

  beforeAll(() => setProductSlugLookup((id) => DEMO_FRAGRANCES.find((f) => f.id === id)?.slug ?? null));
  afterAll(() => setProductSlugLookup(() => null));

  it('has the address of every product in the catalogue, once', () => {
    const listed = new Set(locs);
    expect(DEMO_FRAGRANCES.length).toBeGreaterThan(1000);
    for (const f of DEMO_FRAGRANCES) expect(listed.has(`${SITE_URL}/${f.slug}`), f.slug).toBe(true);
    const productLocs = locs.filter((l) => matchRoute(l.slice(SITE_URL.length)).name === 'product');
    expect(productLocs.length).toBe(DEMO_FRAGRANCES.length);
    expect(new Set(productLocs).size).toBe(productLocs.length);
  });

  it('names no old /fragrance/<id> address', () => {
    expect(locs.filter((l) => l.includes('/fragrance/'))).toEqual([]);
  });

  it('lists only addresses the router opens as a product, a list or a leaf', () => {
    for (const loc of locs) {
      const route = matchRoute(loc.slice(SITE_URL.length) || '/');
      expect(route.name, loc).not.toBe('notFound');
    }
  });

  it('agrees with the canonical the page gives each product', () => {
    for (const f of DEMO_FRAGRANCES.slice(0, 300)) {
      const byId = headFor({ route: { name: 'fragrance', param: f.id, query: {} }, leafName: f.name });
      const bySlug = headFor({ route: { name: 'product', param: f.slug, query: {} }, leafName: f.name });
      expect(byId.canonical, f.id).toBe(`${SITE_URL}/${f.slug}`);
      expect(bySlug.canonical, f.id).toBe(byId.canonical);
      expect(byId.noindex, f.id).toBe(false);
    }
  });
});
