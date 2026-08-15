import { describe, expect, it } from 'vitest';
import {
  probeMarkets,
  summariseMarketProbe,
  readJsonLdOffers,
  subfolderCandidates,
  requestShapeCandidates,
  ukMarketCandidates,
  candidateUrl,
  UK_MARKET_PREFIXES,
  type MarketCandidate,
  type MarketReading,
} from '../src/catalogue/marketProbe.js';
import { readStorefrontCurrency } from '../src/catalogue/shopCurrency.js';
import type { Http } from '../src/catalogue/attempt.js';

/**
 * What these hold shut.
 *
 * Six retailers sit in CURRENCY_UNCONFIRMED in src/config/retailers.ts, off
 * the site, each waiting on the same fact: what the shop charges in. The way
 * off that list is a measurement, and a measurement that can be fooled by a
 * currency dropdown is worse than none — it would read GBP off a page that
 * charges dollars and hand back the word "proven".
 *
 * So every test here is about one of two distinctions: a shop *offering* a
 * currency versus *quoting* one, and a shop having no sterling price list
 * versus us not having found the request that reaches it.
 */

function candidate(label: string, over: Partial<MarketCandidate> = {}): MarketCandidate {
  return {
    label,
    base: 'https://shop.example',
    query: '',
    headers: {},
    why: 'a test',
    ...over,
  };
}

function reading(c: MarketCandidate, meta: string | null, home: string | null): MarketReading {
  return {
    candidate: c,
    metaStatus: meta === null ? 404 : 200,
    homeStatus: home === null ? 404 : 200,
    currency: readStorefrontCurrency(meta, home),
  };
}

describe('the ways a UK price list might be asked for', () => {
  it('always tries the bare origin first, because a single-market UK shop is there', () => {
    expect(UK_MARKET_PREFIXES[0]).toBe('');
    expect(subfolderCandidates('https://shop.example')[0]!.label).toBe('origin');
  });

  it('tries Shopify Markets subfolder conventions after it', () => {
    expect(subfolderCandidates('https://shop.example').map((c) => c.label)).toEqual([
      'origin',
      '/en-gb',
      '/gb',
      '/uk',
      '/en-uk',
    ]);
  });

  // Escentual's shape: every subfolder 404s and the one domain answers in the
  // market it geolocates the caller into. A prefix-only probe can only ever
  // report "no sterling list" there, which is not what it found.
  it('also tries request shapes, for a storefront that has one domain and many markets', () => {
    const labels = requestShapeCandidates('https://shop.example').map((c) => c.label);
    expect(labels).toContain('?country=GB');
    expect(labels).toContain('cookie localization=GB');
    expect(labels).toContain('Accept-Language en-GB');
  });

  it('carries a candidate’s query and headers onto every URL it reads', () => {
    const c = candidate('?country=GB', { query: '?country=GB' });
    expect(candidateUrl(c, '/meta.json')).toBe('https://shop.example/meta.json?country=GB');
  });

  it('offers subfolders and request shapes together, subfolders first', () => {
    const all = ukMarketCandidates('https://shop.example');
    expect(all).toHaveLength(10);
    expect(all[0]!.label).toBe('origin');
    expect(all[5]!.label).toBe('?country=GB');
  });
});

describe('reading a probe', () => {
  it('proves sterling where the theme quotes GBP at no conversion', () => {
    const verdict = summariseMarketProbe([
      reading(candidate('origin'), '{"currency":"GBP"}', 'Shopify.currency = {"active":"GBP","rate":"1.0"};'),
    ]);
    expect(verdict.sterling?.label).toBe('origin');
    expect(verdict.reading).toContain('a sterling price list is served');
  });

  it('takes the first way of asking that proves sterling, not the last', () => {
    const verdict = summariseMarketProbe([
      reading(candidate('origin'), '{"currency":"GBP"}', 'Shopify.currency = {"active":"USD","rate":"1.38605"};'),
      reading(candidate('?country=GB'), null, 'Shopify.currency = {"active":"GBP","rate":"1.0"};'),
      reading(candidate('both cookies'), null, 'Shopify.currency = {"active":"GBP","rate":"1.0"};'),
    ]);
    expect(verdict.sterling?.label).toBe('?country=GB');
  });

  // The defect that made the old prefix probe unsafe. A multi-market
  // storefront lists every currency it offers in a selector on every market,
  // so "the page mentions GBP" is true of the dollar market too.
  it('is not fooled by a currency selector listing GBP on a dollar market', () => {
    const home =
      'Shopify.currency = {"active":"USD","rate":"1.38605"};' +
      '<select name="currency"><option value="GBP">£ GBP</option></select>' +
      '{"currency":"GBP"}';
    const verdict = summariseMarketProbe([reading(candidate('/en-gb'), null, home)]);
    expect(verdict.sterling).toBeNull();
    expect(verdict.currenciesSeen).toEqual(['USD']);
  });

  it('refuses a GBP quote that carries a conversion rate', () => {
    const verdict = summariseMarketProbe([
      reading(candidate('/uk'), '{"currency":"USD"}', 'Shopify.currency = {"active":"GBP","rate":"0.706"};'),
    ]);
    expect(verdict.sterling).toBeNull();
  });

  it('reads silence as unknown, never as sterling', () => {
    const verdict = summariseMarketProbe([reading(candidate('origin'), null, '<html>a shop</html>')]);
    expect(verdict.sterling).toBeNull();
    expect(verdict.currenciesSeen).toEqual([]);
    expect(verdict.reading).toContain('never as sterling');
  });

  // Escentual, exactly: settles GBP, quotes USD to a US runner. The shop has a
  // sterling price list; we did not reach it. Saying "this shop publishes no
  // GBP prices" there would be false, and saying "so divide by the rate" would
  // be the catastrophe.
  it('separates "no sterling list" from "we did not find the request that gets it"', () => {
    const verdict = summariseMarketProbe([
      reading(candidate('origin'), '{"currency":"GBP"}', 'Shopify.currency = {"active":"USD","rate":"1.38605"};'),
    ]);
    expect(verdict.sterling).toBeNull();
    expect(verdict.settles).toBe('GBP');
    expect(verdict.reading).toContain('SETTLES in GBP');
    expect(verdict.reading).toContain('must not be published as pounds');
  });

  it('says a foreign answer from a shop that settles abroad is about this machine', () => {
    const verdict = summariseMarketProbe([
      reading(candidate('origin'), '{"currency":"EUR"}', 'Shopify.currency = {"active":"EUR","rate":"1.0"};'),
    ]);
    expect(verdict.reading).toContain('settles nothing about the shop');
  });

  it('gives one log line per way of asking', () => {
    const verdict = summariseMarketProbe([
      reading(candidate('origin'), null, null),
      reading(candidate('/en-gb'), null, null),
    ]);
    expect(verdict.lines).toHaveLength(2);
    expect(verdict.lines[0]).toContain('origin');
    expect(verdict.lines[1]).toContain('/en-gb');
  });
});

describe('what a product page labels its own price', () => {
  it('reads price and currency out of a schema.org offer', () => {
    const html =
      '<script type="application/ld+json">' +
      '{"@type":"Product","offers":{"@type":"Offer","price":"57.00","priceCurrency":"USD"}}' +
      '</script>';
    expect(readJsonLdOffers(html)).toEqual([{ price: 57, currency: 'USD' }]);
  });

  it('reports every offer on a multi-variant page', () => {
    const html =
      '<script type="application/ld+json">{"offers":[' +
      '{"price":"40.25","priceCurrency":"GBP"},{"price":"57.00","priceCurrency":"GBP"}]}' +
      '</script>';
    expect(readJsonLdOffers(html).map((o) => o.currency)).toEqual(['GBP', 'GBP']);
  });

  it('reads an AggregateOffer lowPrice', () => {
    const html =
      '<script type="application/ld+json">' +
      '{"offers":{"@type":"AggregateOffer","lowPrice":"40.25","priceCurrency":"GBP"}}' +
      '</script>';
    expect(readJsonLdOffers(html)).toEqual([{ price: 40.25, currency: 'GBP' }]);
  });

  it('finds nothing in a page with no JSON-LD, rather than guessing', () => {
    expect(readJsonLdOffers('<html><p>£40.25</p></html>')).toEqual([]);
  });

  it('ignores a currency-shaped string outside a ld+json script', () => {
    expect(readJsonLdOffers('<script>var x = {"priceCurrency":"USD"};</script>')).toEqual([]);
  });
});

describe('probing a storefront', () => {
  function serving(pages: Record<string, string>): {
    http: Http;
    asked: Array<{ url: string; headers: Record<string, string> }>;
  } {
    const asked: Array<{ url: string; headers: Record<string, string> }> = [];
    const http: Http = async (url, headers) => {
      asked.push({ url, headers });
      const body = pages[url];
      return body === undefined
        ? { status: 404, body: '', ok: false }
        : { status: 200, body, ok: true };
    };
    return { http, asked };
  }

  it('reads meta.json and the homepage under every candidate', async () => {
    const { http, asked } = serving({});
    await probeMarkets(subfolderCandidates('https://shop.example').slice(0, 2), http, {});
    expect(asked.map((a) => a.url)).toEqual([
      'https://shop.example/meta.json',
      'https://shop.example/',
      'https://shop.example/en-gb/meta.json',
      'https://shop.example/en-gb/',
    ]);
  });

  it('sends a candidate’s headers with its requests', async () => {
    const { http, asked } = serving({});
    await probeMarkets(
      [candidate('cookie', { headers: { Cookie: 'localization=GB' } })],
      http,
      { 'User-Agent': 'test' },
    );
    expect(asked[0]!.headers).toEqual({ 'User-Agent': 'test', Cookie: 'localization=GB' });
  });

  it('skips an address robots.txt disallows rather than fetching it', async () => {
    const { http, asked } = serving({});
    await probeMarkets(subfolderCandidates('https://shop.example'), http, {}, {
      allow: (url) => !url.includes('/uk'),
    });
    expect(asked.every((a) => !a.url.includes('/uk'))).toBe(true);
  });

  it('carries each candidate’s own verdict back', async () => {
    const { http } = serving({
      'https://shop.example/': 'Shopify.currency = {"active":"USD","rate":"1.38605"};',
      'https://shop.example/en-gb/': 'Shopify.currency = {"active":"GBP","rate":"1.0"};',
    });
    const readings = await probeMarkets(
      subfolderCandidates('https://shop.example').slice(0, 2),
      http,
      {},
    );
    expect(readings[0]!.currency.presented).toBe('USD');
    expect(readings[0]!.currency.isSterling).toBe(false);
    expect(readings[1]!.currency.isSterling).toBe(true);
    expect(summariseMarketProbe(readings).sterling?.label).toBe('/en-gb');
  });

  it('waits between requests, so a probe cannot outrun the shop’s own limit', async () => {
    const { http } = serving({});
    const waits: number[] = [];
    await probeMarkets(subfolderCandidates('https://shop.example').slice(0, 2), http, {}, {
      gapMs: 1500,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(waits).toEqual([1500, 1500, 1500, 1500]);
  });
});
