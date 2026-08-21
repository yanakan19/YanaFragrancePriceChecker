import { describe, expect, it } from 'vitest';
import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { NO_RESTRICTIONS } from '../src/catalogue/robots.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer } from '../src/types/retailer.js';

/**
 * Covers `requiredUrlPrefix`, added for niche-beauty-uk: a shop whose currency
 * depends on which address you ask (plain origin USD, `/en-gb` GBP, `/en-uk`
 * EUR — currency probe run 32254695358) and whose JSON-LD parser has no
 * `priceCurrency` check of its own, so the only thing standing between a
 * sitemap walk and publishing a foreign price as sterling is never fetching
 * an address outside the confirmed one in the first place.
 */

function page(price: number): string {
  return (
    `<html><head><script type="application/ld+json">` +
    `{"@type":"Product","name":"Test Fragrance EDP","sku":"sku-1",` +
    `"offers":{"price":${price},"priceCurrency":"GBP"}}` +
    `</script></head><body></body></html>`
  );
}

function retailer(over: Partial<Retailer> = {}): Retailer {
  return {
    id: 'example-shop',
    name: 'Example Shop',
    domain: 'example.co.uk',
    homepage: 'https://www.example.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-19',
      confidence: 'unverified',
    },
    catalogue: null,
    affiliate: {
      network: null, verified: false, status: 'not-applied', publisherId: null,
      deeplinkTemplate: null, querySuffixTemplate: null, signupUrl: null,
    },
    ...over,
  } as Retailer;
}

describe('crawlViaSitemap: requiredUrlPrefix', () => {
  it('never fetches an address outside the pinned prefix, even when robots.txt names one', async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url === 'https://www.example.co.uk/en-gb/sitemap.xml') {
        return {
          status: 200,
          ok: true,
          body:
            '<urlset>' +
            '<url><loc>https://www.example.co.uk/en-gb/products/fragrance-1</loc></url>' +
            // Off-prefix child sitemap named by the parent index itself —
            // must never be queued or fetched.
            '<url><loc>https://www.example.co.uk/sitemap_blog.xml</loc></url>' +
            '</urlset>',
        };
      }
      if (url === 'https://www.example.co.uk/en-gb/products/fragrance-1') {
        return { status: 200, ok: true, body: page(59.99) };
      }
      // Any other address — the off-prefix sitemap robots.txt names, the
      // off-prefix child, the unpinned conventional root — is a bug if hit.
      return { status: 200, ok: true, body: '<urlset></urlset>' };
    };

    const result = await crawlViaSitemap({
      retailer: retailer({
        catalogue: {
          searchUrlTemplate: 'https://www.example.co.uk/en-gb/search?q={q}',
          sections: [],
          firstPage: 1,
          maxPages: 5,
          minRequestGapMs: 0,
          requiredUrlPrefix: '/en-gb',
        },
      }),
      http,
      // robots.txt names the plain, unpinned sitemap — a real shape (the
      // niche-beauty-uk comment notes robots.txt does not itself scope to a
      // market), and it must still never be fetched once a prefix is pinned.
      robots: { ...NO_RESTRICTIONS, sitemaps: ['https://www.example.co.uk/sitemap.xml'] },
      maxPages: 5,
      gapMs: 0,
      headers: {},
    });

    expect(calls).not.toContain('https://www.example.co.uk/sitemap.xml');
    expect(calls).not.toContain('https://www.example.co.uk/sitemap_blog.xml');
    expect(calls).toContain('https://www.example.co.uk/en-gb/sitemap.xml');
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]!.priceGbp).toBe(59.99);
  });

  it('is a no-op when unset: the plain conventional root is used as before', async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url === 'https://www.example.co.uk/sitemap.xml') {
        return {
          status: 200,
          ok: true,
          body: '<urlset><url><loc>https://www.example.co.uk/products/fragrance-1</loc></url></urlset>',
        };
      }
      if (url === 'https://www.example.co.uk/products/fragrance-1') {
        return { status: 200, ok: true, body: page(42) };
      }
      return { status: 200, ok: true, body: '<urlset></urlset>' };
    };

    const result = await crawlViaSitemap({
      retailer: retailer({ catalogue: null }),
      http,
      robots: NO_RESTRICTIONS,
      maxPages: 5,
      gapMs: 0,
      headers: {},
    });

    expect(calls).toContain('https://www.example.co.uk/sitemap.xml');
    expect(result.listings).toHaveLength(1);
  });
});

describe('crawlViaSitemap: conventional root www. handling', () => {
  // Asda and Morrisons are configured with an already-subdomained
  // `retailer.domain` (`groceries.asda.com`, `groceries.morrisons.com`) —
  // see src/config/retailers.ts around line 5028. The conventional-root
  // builder used to unconditionally prepend `www.`, turning that into
  // `www.groceries.asda.com`, a host that does not exist (HTTP 403/0 —
  // see the same registry comment and today's real Morrisons probe log,
  // job 96495029195, showing `https://www.groceries.morrisons.com/sitemap.xml:
  // HTTP 403`). currency-probe.ts's `retailer.domain.replace(/^www\./, '')`
  // pattern never had this bug; sitemapCrawl.ts now matches it: strip an
  // existing leading `www.` before deciding whether to add one, so a bare
  // domain still gets `www.` (covered by the no-op test above) but a
  // domain that is already a subdomain is left alone.
  it('does not prepend www. onto a domain that is already a subdomain', async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url === 'https://groceries.example.com/sitemap.xml') {
        return {
          status: 200,
          ok: true,
          body: '<urlset><url><loc>https://groceries.example.com/products/fragrance-1</loc></url></urlset>',
        };
      }
      if (url === 'https://groceries.example.com/products/fragrance-1') {
        return { status: 200, ok: true, body: page(12.5) };
      }
      // The buggy host — must never be fetched.
      if (url === 'https://www.groceries.example.com/sitemap.xml') {
        return { status: 403, ok: false, body: '' };
      }
      return { status: 200, ok: true, body: '<urlset></urlset>' };
    };

    const result = await crawlViaSitemap({
      retailer: retailer({ domain: 'groceries.example.com', catalogue: null }),
      http,
      robots: NO_RESTRICTIONS,
      maxPages: 5,
      gapMs: 0,
      headers: {},
    });

    expect(calls).not.toContain('https://www.groceries.example.com/sitemap.xml');
    expect(calls).toContain('https://groceries.example.com/sitemap.xml');
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0]!.priceGbp).toBe(12.5);
  });

  it('still prepends www. onto a domain that already has it, without doubling it', async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url === 'https://www.example.co.uk/sitemap.xml') {
        return {
          status: 200,
          ok: true,
          body: '<urlset><url><loc>https://www.example.co.uk/products/fragrance-1</loc></url></urlset>',
        };
      }
      if (url === 'https://www.example.co.uk/products/fragrance-1') {
        return { status: 200, ok: true, body: page(30) };
      }
      return { status: 200, ok: true, body: '<urlset></urlset>' };
    };

    const result = await crawlViaSitemap({
      // A retailer.domain that (unusually) already includes the www.
      // prefix must not end up doubled into www.www.example.co.uk.
      retailer: retailer({ domain: 'www.example.co.uk', catalogue: null }),
      http,
      robots: NO_RESTRICTIONS,
      maxPages: 5,
      gapMs: 0,
      headers: {},
    });

    expect(calls).not.toContain('https://www.www.example.co.uk/sitemap.xml');
    expect(calls).toContain('https://www.example.co.uk/sitemap.xml');
    expect(result.listings).toHaveLength(1);
  });
});
