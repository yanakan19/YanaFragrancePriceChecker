import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { liveRegions, setActiveRegionForBuild } from '../src/config/regions.js';
import { SITE_URL } from '../demo/head.js';
import { regionLeaves, type RegionOffer, type RegionProduct, type RegionShop } from '../scripts/regionLeafPages.js';

const root = resolve(__dirname, '..');
const us = liveRegions().find((r) => r.id === 'US')!;

const catalogue: RegionProduct[] = [
  { id: 'a', slug: 'creed_aventus_100ml', brand: 'Creed', name: 'Aventus', sizeMl: 100, shops: 3 },
  { id: 'b', slug: 'creed_silver_mountain_water_100ml', brand: 'Creed', name: 'Silver Mountain Water', sizeMl: 100, shops: 1 },
  { id: 'c', slug: 'dior_sauvage_100ml', brand: 'Dior', name: 'Sauvage', sizeMl: 100, shops: 2 },
];
const offers: Record<string, RegionOffer[]> = {
  a: [{ retailerId: 'shop-x', price: 300, inStock: true }, { retailerId: 'shop-y', price: 280, inStock: true }],
  b: [{ retailerId: 'shop-x', price: 310, inStock: true }],
  c: [{ retailerId: 'shop-y', price: 99, inStock: false }],
};
const shops: RegionShop[] = [
  { id: 'shop-x', name: 'Shop X', homepage: 'https://x.example/', domain: 'x.example', enabled: true },
  { id: 'shop-y', name: 'Shop Y', homepage: 'https://y.example/', domain: 'y.example', enabled: true },
  { id: 'shop-z', name: 'Shop Z', homepage: 'https://z.example/', domain: 'z.example', enabled: true },
];

afterEach(() => setActiveRegionForBuild(null));

describe('region brand and shop pages', () => {
  it('each page carries its own region address, the region folder and one h1', () => {
    setActiveRegionForBuild(us);
    const leaves = regionLeaves(us, catalogue, offers, shops);
    expect(leaves.map((l) => l.path)).toEqual(['/us/retailers/shop-x', '/us/retailers/shop-y', '/us/brands/creed', '/us/brands/dior']);
    for (const l of leaves) {
      expect(l.tags.canonical).toBe(`${SITE_URL}${l.path}`);
      expect(l.file).toBe(`${l.path.slice(1)}.html`);
      expect(l.main.match(/<h1 /g)).toHaveLength(1);
    }
  });

  it('a shop with no listing gets no page, and a price is the cheapest in stock one in the region money', () => {
    setActiveRegionForBuild(us);
    const leaves = regionLeaves(us, catalogue, offers, shops);
    expect(leaves.some((l) => l.path.endsWith('shop-z'))).toBe(false);
    const creed = leaves.find((l) => l.path === '/us/brands/creed')!;
    expect(creed.main).toContain('$280');
    expect(creed.main).not.toContain('£');
    const shopY = leaves.find((l) => l.path === '/us/retailers/shop-y')!;
    expect(shopY.main).not.toContain('$99');
  });

  it('links only inside the region and never to a product that has no page', () => {
    setActiveRegionForBuild(us);
    for (const l of regionLeaves(us, catalogue, offers, shops)) {
      const hrefs = [...l.main.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!).filter((h) => !h.startsWith('http'));
      expect(hrefs.every((h) => h.startsWith('/us/')), l.path).toBe(true);
      expect(hrefs.some((h) => h.includes('aventus')), l.path).toBe(false);
    }
  });
});

describe.skipIf(!existsSync(resolve(root, 'demo/sitemap-us.xml')) || !existsSync(resolve(root, 'dist-demo/regions/us/leaf-pages.json')))('the built region sitemaps', () => {
  it('list a brand or shop page only when its file exists, and list every one written', () => {
    for (const r of liveRegions().filter((x) => x.pathPrefix !== '')) {
      const manifest = JSON.parse(readFileSync(resolve(root, 'dist-demo/regions', r.pathPrefix, 'leaf-pages.json'), 'utf8')) as { pages: { path: string; file: string }[] };
      const xml = readFileSync(resolve(root, `demo/sitemap-${r.pathPrefix}.xml`), 'utf8');
      const locs = new Set([...xml.matchAll(/<url><loc>([^<]+)<\/loc>/g)].map((m) => m[1]!));
      expect(manifest.pages.length, r.id).toBeGreaterThan(0);
      for (const p of manifest.pages) {
        expect(existsSync(resolve(root, 'demo', p.file)), p.file).toBe(true);
        expect(locs.has(`${SITE_URL}${p.path}`), p.path).toBe(true);
      }
      // The inline boot scripts are one shared file, as on the UK's pages.
      for (const p of manifest.pages.filter((_, i) => i % 53 === 0)) {
        const html = readFileSync(resolve(root, 'demo', p.file), 'utf8');
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]!).join('');
        expect(inline.length, p.path).toBeLessThan(1500);
        expect(html, p.path).toContain(`<script src="/${(manifest as unknown as { boot: string }).boot}"`);
      }
      for (const loc of locs) {
        if (!/\/(brands|retailers)\/[^/]+$/.test(loc)) continue;
        expect(existsSync(resolve(root, 'demo', `${loc.slice(SITE_URL.length + 1)}.html`)), loc).toBe(true);
      }
    }
  });
});
