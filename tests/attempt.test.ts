import { describe, expect, it } from 'vitest';
import { runStrategy, type AttemptContext, type Http } from '../src/catalogue/attempt.js';
import { NO_RESTRICTIONS, UNREACHABLE_ROBOTS, parseRobots } from '../src/catalogue/robots.js';
import type { Retailer } from '../src/types/retailer.js';

/**
 * Covers the `browser-render` strategy added alongside apifyActor.ts. The
 * other strategies here (section-plain, proxied-fetch, ...) have no existing
 * test file of their own; this one exists because the gating logic —
 * robots.txt, "no actor configured", multi-section rendering — is new and
 * genuinely worth pinning down, the same reasoning tests/apifyActor.test.ts
 * and tests/apifyProxy.test.ts already apply to the transports underneath.
 */

function page(name: string, price: number): string {
  return (
    `<html><head><script type="application/ld+json">` +
    `{"@type":"Product","name":${JSON.stringify(name)},"sku":${JSON.stringify(name)},` +
    `"offers":{"price":${price},"priceCurrency":"GBP"}}` +
    `</script></head><body></body></html>`
  );
}

function retailer(over: Partial<Retailer> = {}): Retailer {
  return {
    id: 'harvey-nichols',
    name: 'Harvey Nichols',
    domain: 'harveynichols.com',
    homepage: 'https://www.harveynichols.com',
    tiers: ['niche'],
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 5.95,
      freeOverGbp: 300,
      estimatedDays: [3, 3],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.harveynichols.com/search/?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.harveynichols.com/beauty/fragrance/?page={page}', tier: 'niche' },
      ],
      firstPage: 1,
      maxPages: 50,
      minRequestGapMs: 2500,
    },
    affiliate: {
      network: null, verified: false, status: 'not-applied', publisherId: null,
      deeplinkTemplate: null, querySuffixTemplate: null, signupUrl: null, notes: '',
    },
    ...over,
  } as Retailer;
}

const noopHttp: Http = async () => ({ status: 0, body: '', ok: false });

const baseCtx = (over: Partial<AttemptContext> = {}): AttemptContext => ({
  retailer: retailer(),
  http: noopHttp,
  robots: NO_RESTRICTIONS,
  sampleQuery: 'Dior Sauvage Eau de Parfum 100ml',
  ...over,
});

describe('runStrategy: browser-render', () => {
  it('fails soft with a clear reason when no actor is configured', async () => {
    const attempt = await runStrategy('browser-render', baseCtx());
    expect(attempt.result.ok).toBe(false);
    expect(attempt.result.error).toContain('APIFY_TOKEN');
    expect(attempt.listings).toEqual([]);
  });

  it('reports "not configured" for a retailer with no catalogue sections', async () => {
    const ctx = baseCtx({
      retailer: retailer({ catalogue: null }),
      actorRender: async () => new Map(),
    });
    const attempt = await runStrategy('browser-render', ctx);
    expect(attempt.result.ok).toBe(false);
    expect(attempt.result.error).toContain('no catalogue sections configured');
  });

  it('renders the section URL and parses real listings out of the result', async () => {
    const url = 'https://www.harveynichols.com/beauty/fragrance/?page=1';
    const ctx = baseCtx({
      actorRender: async (urls) => {
        expect(urls).toEqual([url]);
        return new Map([[url, { status: 200, body: page('Fine Fragrance', 95), ok: true }]]);
      },
    });

    const attempt = await runStrategy('browser-render', ctx);
    expect(attempt.result.ok).toBe(true);
    expect(attempt.result.listings).toBe(1);
    expect(attempt.listings[0]?.rawTitle).toBe('Fine Fragrance');
    expect(attempt.listings[0]?.priceGbp).toBe(95);
    expect(attempt.discovered?.sectionUrls).toEqual([url]);
  });

  it('renders every configured section, not just the first', async () => {
    const urlA = 'https://shop.example/a/?page=1';
    const urlB = 'https://shop.example/b/?page=1';
    const ctx = baseCtx({
      retailer: retailer({
        catalogue: {
          searchUrlTemplate: 'https://shop.example/search?q={q}',
          sections: [
            { id: 'a', label: 'A', urlTemplate: 'https://shop.example/a/?page={page}', tier: 'designer' },
            { id: 'b', label: 'B', urlTemplate: 'https://shop.example/b/?page={page}', tier: 'designer' },
          ],
          firstPage: 1,
          maxPages: 50,
          minRequestGapMs: 1500,
        },
      }),
      actorRender: async (urls) => {
        const all: Array<[string, { status: number; body: string; ok: boolean }]> = [
          [urlA, { status: 200, body: page('Product A', 10), ok: true }],
          [urlB, { status: 200, body: page('Product B', 20), ok: true }],
        ];
        return new Map(all.filter(([u]) => urls.includes(u)));
      },
    });

    const attempt = await runStrategy('browser-render', ctx);
    expect(attempt.result.listings).toBe(2);
    expect(attempt.listings.map((l) => l.rawTitle).sort()).toEqual(['Product A', 'Product B']);
  });

  it('counts a real HTTP response with no parseable listing as a genuine zero, not an error', async () => {
    const url = 'https://www.harveynichols.com/beauty/fragrance/?page=1';
    const ctx = baseCtx({
      actorRender: async () => new Map([[url, { status: 200, body: '<html><body>empty</body></html>', ok: true }]]),
    });
    const attempt = await runStrategy('browser-render', ctx);
    expect(attempt.result.ok).toBe(false);
    expect(attempt.result.listings).toBe(0);
  });

  it('rules the strategy out when robots.txt disallows every section', async () => {
    const robots = parseRobots('User-agent: *\nDisallow: /beauty/fragrance/', 'pricesniffsbot');
    const ctx = baseCtx({ robots, actorRender: async () => new Map() });
    const attempt = await runStrategy('browser-render', ctx);
    expect(attempt.result.ruleOut).toBe('robots.txt disallows this path');
  });

  it('holds off without ruling out when robots.txt is merely unreachable', async () => {
    const ctx = baseCtx({ robots: UNREACHABLE_ROBOTS, actorRender: async () => new Map() });
    const attempt = await runStrategy('browser-render', ctx);
    expect(attempt.result.ok).toBe(false);
    expect(attempt.result.ruleOut).toBeUndefined();
    expect(attempt.result.error).toContain('unreachable');
  });
});

// Mirrors tests/sitemapCrawl.test.ts's coverage of the same `requiredUrlPrefix`
// guard, applied to this diagnostic strategy's own, separate sitemap walk —
// see that field's doc comment in src/types/retailer.ts for why a pinned
// shop's probe result must never quietly come from an off-prefix address.
describe('runStrategy: sitemap-discovery with requiredUrlPrefix', () => {
  it('never fetches an address outside the pinned prefix, even when robots.txt names one', async () => {
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      if (url === 'https://www.harveynichols.com/en-gb/sitemap.xml') {
        return {
          status: 200,
          ok: true,
          body:
            '<urlset>' +
            '<url><loc>https://www.harveynichols.com/en-gb/products/fragrance-1</loc></url>' +
            '<url><loc>https://www.harveynichols.com/sitemap_blog.xml</loc></url>' +
            '</urlset>',
        };
      }
      if (url === 'https://www.harveynichols.com/en-gb/products/fragrance-1') {
        return { status: 200, ok: true, body: page('Fragrance One', 59.99) };
      }
      return { status: 200, ok: true, body: '<urlset></urlset>' };
    };

    const ctx = baseCtx({
      retailer: retailer({
        catalogue: {
          searchUrlTemplate: 'https://www.harveynichols.com/en-gb/search/?q={q}',
          sections: [],
          firstPage: 1,
          maxPages: 5,
          minRequestGapMs: 0,
          requiredUrlPrefix: '/en-gb',
        },
      }),
      http,
      robots: { ...NO_RESTRICTIONS, sitemaps: ['https://www.harveynichols.com/sitemap.xml'] },
    });

    const attempt = await runStrategy('sitemap-discovery', ctx);

    expect(calls).not.toContain('https://www.harveynichols.com/sitemap.xml');
    expect(calls).not.toContain('https://www.harveynichols.com/sitemap_blog.xml');
    expect(calls).toContain('https://www.harveynichols.com/en-gb/sitemap.xml');
    expect(attempt.result.ok).toBe(true);
    expect(attempt.listings).toHaveLength(1);
  });
});
