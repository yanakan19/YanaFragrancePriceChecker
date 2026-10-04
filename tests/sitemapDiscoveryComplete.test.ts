// A sitemap walk that read only part of a shop's list must not count as the
// whole of it: fetchedEveryDiscovered tells reconcile() that every stored
// listing missing from the walk is off sale, so a partial list read as whole
// delists everything in the part not read (the shape scripts/repair-mass-delist.ts
// was written to undo).
import { describe, expect, it } from 'vitest';
import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { NO_RESTRICTIONS } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer } from '../src/types/retailer.js';

const retailer = {
  id: 'shop', name: 'Shop', domain: 'shop.example', homepage: 'https://shop.example',
  catalogue: null,
} as unknown as Retailer;
const base = 'https://www.shop.example';

const urlset = (urls: string[]) => `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
const index = (maps: string[]) => `<sitemapindex>${maps.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join('')}</sitemapindex>`;
const productPage = (sku: string) =>
  `<html><head><script type="application/ld+json">{"@type":"Product","name":"Test Fragrance EDP 50ml","sku":"${sku}",` +
  `"offers":{"price":10,"priceCurrency":"GBP"}}</script></head><body></body></html>`;

function shop(childStatus: Record<string, number>, childCount = 2): Http {
  const children = Array.from({ length: childCount }, (_, i) => `${base}/sitemap-products-${i + 1}.xml`);
  return async (url) => {
    if (url === `${base}/sitemap.xml`) return { status: 200, ok: true, body: index(children) };
    const i = children.indexOf(url);
    if (i >= 0) {
      const status = childStatus[url] ?? 200;
      if (status !== 200) return { status, ok: false, body: '' };
      return { status: 200, ok: true, body: urlset([`${base}/products/perfume-${i + 1}`]) };
    }
    return { status: 200, ok: true, body: productPage(url.split('/').pop()!), finalUrl: url };
  };
}

const crawl = (http: Http) =>
  crawlViaSitemap({ retailer, http, robots: NO_RESTRICTIONS, headers: {}, gapMs: 0, maxPages: 50 });

describe('sitemap discovery completeness', () => {
  it('is complete when every child sitemap answered and every URL was fetched', async () => {
    const res = await crawl(shop({}));
    expect(res.urlsDiscovered).toBe(2);
    expect(res.fetchedEveryDiscovered).toBe(true);
  });

  it('is not complete when one child sitemap failed, though every URL it did find was fetched', async () => {
    const res = await crawl(shop({ [`${base}/sitemap-products-2.xml`]: 503 }));
    expect(res.urlsDiscovered).toBe(1);
    expect(res.pagesFetched).toBe(1);
    expect(res.fetchedEveryDiscovered).toBe(false);
  });

  it('is not complete when a child the index lists answers 404', async () => {
    const res = await crawl(shop({ [`${base}/sitemap-products-1.xml`]: 404 }));
    expect(res.fetchedEveryDiscovered).toBe(false);
  });

  it('is not complete when the walk stopped with sitemaps still queued (its twelve fetch budget)', async () => {
    const res = await crawl(shop({}, 20));
    expect(res.urlsDiscovered).toBe(11);
    expect(res.fetchedEveryDiscovered).toBe(false);
  });

  it('still completes when only the conventional /sitemap.xml is missing and robots.txt names the real one', async () => {
    const real = `${base}/sitemap_index.xml`;
    const http: Http = async (url) => {
      if (url === `${base}/sitemap.xml`) return { status: 404, ok: false, body: '' };
      if (url === real) return { status: 200, ok: true, body: urlset([`${base}/products/perfume-1`]) };
      return { status: 200, ok: true, body: productPage(url.split('/').pop()!), finalUrl: url };
    };
    const robots = { ...NO_RESTRICTIONS, sitemaps: [real] };
    const res = await crawlViaSitemap({ retailer, http, robots, headers: {}, gapMs: 0, maxPages: 50 });
    expect(res.urlsDiscovered).toBe(1);
    expect(res.fetchedEveryDiscovered).toBe(true);
  });
});
