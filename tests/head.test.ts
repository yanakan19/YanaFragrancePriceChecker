import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { headFor, SITE_URL, type HeadInput } from '../demo/head.js';
import { matchRoute, type RouteName } from '../demo/router.js';

const route = (name: RouteName, param = '', query: Record<string, string> = {}) => ({ name, param, query });
const tags = (input: HeadInput) => headFor(input);

/**
 * The whole reason this module exists. Until 2026-08-17 scripts/build-demo.ts
 * wrote `<link rel="canonical" href="https://pricesniffs.space/">` into the
 * one document every route is served from, so all 12,000-odd fragrance pages
 * told search engines to index the homepage instead of themselves.
 */
describe('canonical URLs', () => {
  it('points a leaf route at itself, never at the homepage', () => {
    const t = tags({ route: route('fragrance', 'ean-123'), leafName: 'Dior Sauvage' });
    expect(t.canonical).toBe(`${SITE_URL}/fragrance/ean-123`);
    expect(t.canonical).not.toBe(`${SITE_URL}/`);
  });

  it('gives every route a distinct canonical', () => {
    const names: RouteName[] = [
      'home', 'search', 'brands', 'brand', 'deals', 'retailers', 'retailer',
      'notes', 'note', 'fragrance', 'about', 'settings', 'account', 'legal',
      'design', 'notFound',
    ];
    const seen = new Map<string, RouteName>();
    for (const name of names) {
      const c = tags({ route: route(name, 'x') }).canonical;
      expect(c.startsWith(SITE_URL), `${name} canonical is not absolute`).toBe(true);
      const clash = seen.get(c);
      expect(clash, `${name} and ${clash} share the canonical ${c}`).toBeUndefined();
      seen.set(c, name);
    }
  });

  it('drops the query string, so a filtered view is not a separate page', () => {
    const plain = tags({ route: route('brands') }).canonical;
    const filtered = tags({ route: route('brands', '', { tier: 'niche', q: 'dior' }) }).canonical;
    expect(filtered).toBe(plain);
  });

  it('encodes a param that would otherwise break the URL', () => {
    expect(tags({ route: route('brand', 'jean paul gaultier') }).canonical)
      .toBe(`${SITE_URL}/brands/jean%20paul%20gaultier`);
  });
});

describe('titles', () => {
  it('stays within the length search engines render', () => {
    const cases: HeadInput[] = [
      { route: route('home'), productCount: 12662, retailerCount: 28 },
      { route: route('fragrance', 'x'), leafName: 'Maison Francis Kurkdjian Baccarat Rouge 540 Extrait de Parfum 200ml' },
      { route: route('brand', 'x'), leafName: 'Comme des Garçons Parfums Series 8 Sacred Incense' },
      { route: route('retailer', 'x'), leafName: 'The Fragrance Counter Incorporating Perfume Direct' },
      { route: route('note', 'x'), leafName: 'Lily-of-the-Valley and White Musk Accord' },
    ];
    for (const c of cases) {
      const t = tags(c);
      expect(t.title.length, `"${t.title}" is ${t.title.length} chars`).toBeLessThanOrEqual(60);
      expect(t.title.length).toBeGreaterThan(0);
    }
  });

  it('does not cut a word in half or leave dangling punctuation', () => {
    const t = tags({ route: route('fragrance', 'x'), leafName: 'Maison Francis Kurkdjian Baccarat Rouge 540 Extrait de Parfum' });
    expect(t.title).not.toMatch(/[\s,;:.\-–]$/);
  });

  it('gives each route its own title', () => {
    const a = tags({ route: route('brands') }).title;
    const b = tags({ route: route('retailers') }).title;
    const c = tags({ route: route('notes') }).title;
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('descriptions', () => {
  it('never exceeds the window, and is never empty', () => {
    const names: RouteName[] = [
      'home', 'search', 'brands', 'brand', 'deals', 'retailers', 'retailer',
      'notes', 'note', 'fragrance', 'about', 'settings', 'account', 'legal',
      'design', 'notFound',
    ];
    for (const name of names) {
      const t = tags({ route: route(name, 'x'), leafName: 'Dior', productCount: 12662, retailerCount: 28 });
      expect(t.description.length, `${name}: ${t.description.length} chars`).toBeLessThanOrEqual(160);
      expect(t.description.length, `${name} has an empty description`).toBeGreaterThan(30);
    }
  });

  it('uses the real figures it is given rather than a rounded claim', () => {
    const t = tags({ route: route('home'), productCount: 12662, retailerCount: 28 });
    expect(t.description).toContain('12,662');
    expect(t.description).toContain('28');
  });

  it('omits a price phrase entirely when no delivered price was passed', () => {
    const t = tags({ route: route('fragrance', 'x'), leafName: 'Dior Sauvage 100ml' });
    // Never a "from £..." that nobody supplied.
    expect(t.description).not.toMatch(/£/);
  });

  it('quotes the delivered price when one was established', () => {
    const t = tags({
      route: route('fragrance', 'x'),
      leafName: 'Dior Sauvage 100ml',
      leafDetail: 'from £62.95 delivered, across 4 shops',
    });
    expect(t.description).toContain('£62.95');
  });
});

describe('what may be indexed', () => {
  it('marks the routes that would waste or mislead a crawler', () => {
    for (const name of ['search', 'settings', 'account', 'design', 'notFound'] as RouteName[]) {
      expect(tags({ route: route(name) }).noindex, `${name} should be noindex`).toBe(true);
    }
  });

  it('leaves the pages the site is for indexable', () => {
    for (const name of ['home', 'brands', 'brand', 'deals', 'retailers', 'retailer', 'notes', 'note', 'fragrance', 'about', 'legal'] as RouteName[]) {
      expect(tags({ route: route(name, 'x') }).noindex, `${name} should be indexable`).toBe(false);
    }
  });
});

/**
 * The sitemap and head.ts have to agree. A URL listed in the sitemap while
 * carrying `noindex` is a contradiction search consoles report as an error,
 * and it is the kind of drift that only shows up in a dashboard weeks later.
 */
describe('sitemap agrees with head.ts', () => {
  const xml = readFileSync(new URL('../demo/sitemap.xml', import.meta.url), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);

  it('lists no URL that head.ts marks noindex', () => {
    for (const loc of locs) {
      const path = loc.slice(SITE_URL.length) || '/';
      const r = matchRoute(path);
      expect(
        tags({ route: r }).noindex,
        `${loc} is in the sitemap but head.ts marks route "${r.name}" noindex`,
      ).toBe(false);
    }
  });

  it('is well formed and absolute throughout', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    expect(locs.length).toBeGreaterThan(1000);
    for (const loc of locs.slice(0, 200)) expect(loc.startsWith('https://')).toBe(true);
  });

  it('has no duplicate URLs', () => {
    expect(new Set(locs).size).toBe(locs.length);
  });

  it('carries a real lastmod on every entry, not one stamped date', () => {
    const dates = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
    expect(dates.length).toBe(locs.length);
    for (const d of dates.slice(0, 200)) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // If every date were identical the field would be decoration.
    expect(new Set(dates).size).toBeGreaterThan(1);
  });

  it('is referenced by robots.txt', () => {
    const robots = readFileSync(new URL('../demo/robots.txt', import.meta.url), 'utf8');
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});

/**
 * A path that matches nothing must say so. It returned `home` until
 * 2026-08-17, which gave a reader with a dead link a working-looking homepage
 * and gave crawlers thousands of duplicate homepages at invented addresses.
 */
describe('unmatched paths', () => {
  it('resolves to notFound rather than home', () => {
    for (const path of ['/nonsense', '/fragrance', '/legal', '/not/a/route']) {
      expect(matchRoute(path).name, `${path} should not resolve to home`).toBe('notFound');
    }
  });

  // A leaf route ignores anything past its own segment, so /brands/dior/junk
  // renders the Dior page. That is left alone deliberately: it is lenient
  // rather than wrong, and the canonical collapses every such variant onto
  // the one real URL, which is exactly the job a canonical exists to do.
  // Asserted so the leniency stays paired with the thing that makes it safe.
  it('collapses trailing junk onto the real page via the canonical', () => {
    const r = matchRoute('/brands/dior/junk/more');
    expect(r.name).toBe('brand');
    expect(r.param).toBe('dior');
    expect(tags({ route: r }).canonical).toBe(`${SITE_URL}/brands/dior`);
  });

  it('still resolves the real routes', () => {
    expect(matchRoute('/').name).toBe('home');
    expect(matchRoute('/brands').name).toBe('brands');
    expect(matchRoute('/fragrance/ean-123').name).toBe('fragrance');
    expect(matchRoute('/legal/privacy').name).toBe('legal');
  });
});
