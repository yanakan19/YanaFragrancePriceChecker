import { describe, expect, it } from 'vitest';
import {
  probeMarkets,
  summariseMarketProbe,
  readJsonLdOffers,
  UK_MARKET_PREFIXES,
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
 * So every test here is about the difference between a shop *offering* a
 * currency and a shop *quoting* one.
 */

function reading(prefix: string, meta: string | null, home: string | null): MarketReading {
  return {
    prefix,
    base: `https://shop.example${prefix}`,
    metaStatus: meta === null ? 404 : 200,
    homeStatus: home === null ? 404 : 200,
    currency: readStorefrontCurrency(meta, home),
  };
}

describe('which addresses a UK price list might live at', () => {
  it('always tries the bare origin first, because a single-market UK shop is there', () => {
    expect(UK_MARKET_PREFIXES[0]).toBe('');
  });

  it('tries Shopify Markets subfolder conventions after it', () => {
    expect([...UK_MARKET_PREFIXES]).toEqual(['', '/en-gb', '/gb', '/uk', '/en-uk']);
  });
});

describe('reading a probe', () => {
  it('proves sterling where the theme quotes GBP at no conversion', () => {
    const verdict = summariseMarketProbe([
      reading('', '{"currency":"GBP"}', 'Shopify.currency = {"active":"GBP","rate":"1.0"};'),
    ]);
    expect(verdict.sterlingBase).toBe('https://shop.example');
    expect(verdict.reading).toContain('a sterling price list is published');
  });

  it('takes the first address that proves sterling, not the last', () => {
    const verdict = summariseMarketProbe([
      reading('', '{"currency":"USD"}', 'Shopify.currency = {"active":"USD","rate":"1.0"};'),
      reading('/en-gb', null, 'Shopify.currency = {"active":"GBP","rate":"1.0"};'),
      reading('/gb', null, 'Shopify.currency = {"active":"GBP","rate":"1.0"};'),
    ]);
    expect(verdict.sterlingBase).toBe('https://shop.example/en-gb');
  });

  // The defect that made the old probe unsafe. A multi-market storefront lists
  // every currency it offers in a selector on every market, so "the page
  // mentions GBP" is true of the dollar market too.
  it('is not fooled by a currency selector listing GBP on a dollar market', () => {
    const home =
      'Shopify.currency = {"active":"USD","rate":"1.4161"};' +
      '<select name="currency"><option value="GBP">£ GBP</option></select>' +
      '{"currency":"GBP"}';
    const verdict = summariseMarketProbe([reading('/en-gb', null, home)]);
    expect(verdict.sterlingBase).toBeNull();
    expect(verdict.currenciesSeen).toEqual(['USD']);
  });

  it('refuses a GBP quote that carries a conversion rate', () => {
    const verdict = summariseMarketProbe([
      reading('/uk', '{"currency":"USD"}', 'Shopify.currency = {"active":"GBP","rate":"0.706"};'),
    ]);
    expect(verdict.sterlingBase).toBeNull();
  });

  it('reads silence as unknown, never as sterling', () => {
    const verdict = summariseMarketProbe([reading('', null, '<html>a shop</html>')]);
    expect(verdict.sterlingBase).toBeNull();
    expect(verdict.currenciesSeen).toEqual([]);
    expect(verdict.reading).toContain('never as sterling');
  });

  // The distinction the whole exercise turns on: a Shopify market is chosen by
  // where the visitor is, so a CI runner's reading settles what *we* harvest
  // and settles nothing about what a shopper in Cardiff is charged.
  it('says plainly that a foreign answer is about this machine, not the shop', () => {
    const verdict = summariseMarketProbe([
      reading('', '{"currency":"GBP"}', 'Shopify.currency = {"active":"USD","rate":"1.4161"};'),
    ]);
    expect(verdict.sterlingBase).toBeNull();
    expect(verdict.reading).toContain('settles nothing about the shop');
  });

  it('gives one log line per address', () => {
    const verdict = summariseMarketProbe([
      reading('', null, null),
      reading('/en-gb', null, null),
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
  function serving(pages: Record<string, string>): { http: Http; asked: string[] } {
    const asked: string[] = [];
    const http: Http = async (url) => {
      asked.push(url);
      const body = pages[url];
      return body === undefined
        ? { status: 404, body: '', ok: false }
        : { status: 200, body, ok: true };
    };
    return { http, asked };
  }

  it('reads meta.json and the homepage at every address', async () => {
    const { http, asked } = serving({});
    await probeMarkets('https://shop.example', http, {}, { prefixes: ['', '/en-gb'] });
    expect(asked).toEqual([
      'https://shop.example/meta.json',
      'https://shop.example/',
      'https://shop.example/en-gb/meta.json',
      'https://shop.example/en-gb/',
    ]);
  });

  it('skips an address robots.txt disallows rather than fetching it', async () => {
    const { http, asked } = serving({});
    await probeMarkets('https://shop.example', http, {}, {
      prefixes: ['', '/uk'],
      allow: (url) => !url.includes('/uk'),
    });
    expect(asked.every((u) => !u.includes('/uk'))).toBe(true);
    expect(asked).toHaveLength(2);
  });

  it('carries each address’s own verdict back', async () => {
    const { http } = serving({
      'https://shop.example/': 'Shopify.currency = {"active":"USD","rate":"1.4161"};',
      'https://shop.example/en-gb/': 'Shopify.currency = {"active":"GBP","rate":"1.0"};',
    });
    const readings = await probeMarkets('https://shop.example', http, {}, {
      prefixes: ['', '/en-gb'],
    });
    expect(readings[0]!.currency.presented).toBe('USD');
    expect(readings[0]!.currency.isSterling).toBe(false);
    expect(readings[1]!.currency.isSterling).toBe(true);
    expect(summariseMarketProbe(readings).sterlingBase).toBe('https://shop.example/en-gb');
  });

  it('waits between requests, so a probe cannot outrun the shop’s own limit', async () => {
    const { http } = serving({});
    const waits: number[] = [];
    await probeMarkets('https://shop.example', http, {}, {
      prefixes: ['', '/gb'],
      gapMs: 1500,
      sleep: async (ms) => { waits.push(ms); },
    });
    expect(waits).toEqual([1500, 1500, 1500, 1500]);
  });
});
