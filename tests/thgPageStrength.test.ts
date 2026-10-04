import { describe, expect, it } from 'vitest';
import { pageCopy, parseThgPageStrength, titleWithThgPageStrength } from '../src/catalogue/thgPageStrength.js';
import { crawlViaSitemap } from '../src/catalogue/sitemapCrawl.js';
import { parseRobots } from '../src/catalogue/robots.js';
import { isFragrance } from '../src/catalogue/fragranceId.js';
import { getRetailer } from '../src/config/retailers.js';
import type { Http } from '../src/catalogue/attempt.js';
import type { Retailer, SitemapRoute } from '../src/types/retailer.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Cult Beauty's product pages, as www.cultbeauty.co.uk served them to
 * PriceSniffsBot on 2026-10-04. Each fixture keeps the page's own structure
 * (a script holding `const variationData` for a page with several sizes or
 * `const defaultVariant` for one with a single size, whose `content` array has
 * the brand copy under `whyChoose` and `synopsis`) and the real sentences that
 * state, or do not state, the strength. The rest of a 500 KB page is left out.
 */
function html(copy: { whyChoose?: string; synopsis?: string[] }, layout: 'variationData' | 'defaultVariant' = 'variationData'): string {
  const content: unknown[] = [];
  if (copy.whyChoose !== undefined) {
    content.push({
      key: 'whyChoose',
      value: { __typename: 'ProductContentRichContentValue', richContentValue: { content: [{ type: 'HTML', content: copy.whyChoose }] } },
    });
  }
  if (copy.synopsis) {
    content.push({
      key: 'synopsis',
      value: {
        __typename: 'ProductContentRichContentListValue',
        richContentListValue: [{ content: copy.synopsis.map((c) => ({ type: 'HTML', content: c })) }],
      },
    });
  }
  content.push({ key: 'ingredients', value: { richContentValue: { content: [{ type: 'HTML', content: '<p>Alcohol Denat., Parfum (Fragrance), Aqua/Water/Eau, Linalool.</p>' }] } } });
  const variant = { sku: 1, title: 'x', choices: [{ optionKey: 'Size', key: '50ml', title: '50ml' }], content };
  const data = layout === 'variationData' ? [variant, variant] : variant;
  return `<html><body><script>(function(){const ${layout} = ${JSON.stringify(data)}; render(${layout});})();</script></body></html>`;
}

describe('parseThgPageStrength', () => {
  it('reads the template the brand copy uses: name, strength, size in brackets', () => {
    const page = html({
      whyChoose: '<p>Brighten your scent profile with the Alto Astral Eau de Parfum (50ml), a light yet inviting fragrance.</p>',
      synopsis: ['<p>Upgrade your scent collection with the Byredo Alto Astral Eau de Parfum (50ml), a sense-awakening fragrance.</p>'],
    });
    expect(parseThgPageStrength(page, 'BYREDO Alto Astral 100ml')).toEqual({ stated: 'Eau de Parfum (50ml)', strength: 'Eau de Parfum' });
  });

  it('reads a page with a single size (defaultVariant)', () => {
    const page = html(
      { synopsis: ["<p>Discothèque's Lola at Coat Check Eau de Parfum (50ml) is an insouciant blend of rose.</p>"] },
      'defaultVariant',
    );
    expect(parseThgPageStrength(page, 'Discothèque Lola at Coat Check 50ml')?.strength).toBe('Eau de Parfum');
  });

  it('does not need the brand in the copy, and straightens curly quotes', () => {
    const page = html({ whyChoose: '<p>Meet Ain’t That Sweet Eau de Parfum (50ml), a warm, creamy fragrance.</p>' });
    expect(parseThgPageStrength(page, "D.S. & Durga Ain't That Sweet 50ml")?.strength).toBe('Eau de Parfum');
    const eladaria = html({ synopsis: ['<p>Get lost in nature’s riches with the Eladaria Eau de Parfum (30ml), a dewy rose fragrance.</p>'] });
    expect(parseThgPageStrength(eladaria, 'Creed Eladaria 75ml')?.strength).toBe('Eau de Parfum');
  });

  it('allows "Spray" after the strength: it is the form, not a strength', () => {
    const page = html({ synopsis: ["<p>Where glamour meets darkness, TOM FORD's Black Orchid Eau de Parfum Spray (100ml) rewrites the rules of florals.</p>"] });
    expect(parseThgPageStrength(page, 'Tom Ford Black Orchid 150ml')?.strength).toBe('Eau de Parfum');
  });

  it('reads a strength after the bracketed size, and a bare name then strength', () => {
    const bracketFirst = html({ synopsis: ['<p>The Le Labo Eucalyptus 20 (50ml) eau de parfum is an ode to the notion of hope.</p>'] });
    expect(parseThgPageStrength(bracketFirst, 'Le Labo Eucalyptus 20 (15ml)')?.strength).toBe('Eau de Parfum');
    const bare = html({ synopsis: ['<p>Escentric Molecules M+ Molecule 01 + Mandarin Eau de Toilette is a game of two halves.</p>'] });
    expect(parseThgPageStrength(bare, 'Escentric Molecules M+ Molecule 01 + Mandarin')?.strength).toBe('Eau de Toilette');
  });

  it('keeps Intense, in whatever capitals', () => {
    const page = html({ synopsis: ['<p>Meet the Dirty Heaven Eau De Parfum Intense (15ml).</p>'] });
    expect(parseThgPageStrength(page, 'BORNTOSTANDOUT Dirty Heaven 15ml')?.strength).toBe('Eau de Parfum Intense');
  });

  it('states nothing when the page does not: every Creed page read says only "Meet the Wild Vetiver (50ml)"', () => {
    const page = html({
      whyChoose: '<p>Meet the Wild Vetiver (50ml), a captivating fragrance that unites notes of its namesake with citrus.</p>',
      synopsis: ["<p>Discover the captivating allure of The House of Creed's Wild Vetiver (50ml), a woody floral fragrance.</p>"],
    });
    expect(parseThgPageStrength(page, 'Creed Wild Vetiver 50ml')).toBeNull();
  });

  it('does not read prose that is not the template ("this playful Eau de Toilette")', () => {
    const page = html({ synopsis: ["<p>Kismet Olfactive's Wedding In Oaxaca (50ml): this playful Eau de Toilette brings a festive spirit.</p>"] });
    expect(parseThgPageStrength(page, 'Kismet Olfactive Wedding In Oaxaca 50ml')).toBeNull();
  });

  it("never reads another product's strength out of this product's page", () => {
    const page = html({
      synopsis: ['<p>Pair it with Vanilla 28 Eau de Parfum (50ml) for a gourmand trail. Wild Vetiver (50ml) is a woody floral.</p>'],
    });
    expect(parseThgPageStrength(page, 'Creed Wild Vetiver 50ml')).toBeNull();
  });

  it('states nothing when the copy gives two strengths for the product', () => {
    const page = html({
      whyChoose: '<p>Meet the Alto Astral Eau de Parfum (50ml).</p>',
      synopsis: ['<p>The Alto Astral Eau de Toilette (50ml) is lighter.</p>'],
    });
    expect(parseThgPageStrength(page, 'BYREDO Alto Astral 100ml')).toBeNull();
  });

  it('states nothing from a list of a set’s contents, an ingredients list or a page with no product data', () => {
    const contents = html({ synopsis: ['<p>Contents:</p><p>Vanilla 28 Eau de Parfum (50ml)</p><p>Juicy Apple 01 Eau de Parfum (50ml)</p>'] });
    expect(parseThgPageStrength(contents, 'KAYALI Warm Apple Pie a la Mode 50ml')).toBeNull();
    expect(parseThgPageStrength(html({}), 'Alto Astral 100ml')).toBeNull();
    expect(parseThgPageStrength('<html><body>Eau de Parfum (50ml)</body></html>', 'Alto Astral 100ml')).toBeNull();
    expect(pageCopy('<html></html>')).toEqual([]);
  });

  it('survives a page whose data is cut short', () => {
    expect(parseThgPageStrength('<script>const variationData = [{"content":[{"key":"synopsis"', 'Alto Astral 100ml')).toBeNull();
  });
});

describe('titleWithThgPageStrength', () => {
  const stating = html({ synopsis: ['<p>The Alto Astral Eau de Parfum (50ml) is a fragrance.</p>'] });
  const l = (rawTitle: string) => ({ rawTitle, description: null, rawBrand: null });

  it('puts the strength before the size, and a bracketed size keeps its bracket', () => {
    expect(titleWithThgPageStrength(l('BYREDO Alto Astral 100ml'), stating, 'cult-beauty-global')).toBe('BYREDO Alto Astral Eau de Parfum 100ml');
    const labo = html({ synopsis: ['<p>The Le Labo Eucalyptus 20 (50ml) eau de parfum is an ode.</p>'] });
    expect(titleWithThgPageStrength(l('Le Labo Eucalyptus 20 (15ml)'), labo, 'cult-beauty-global')).toBe('Le Labo Eucalyptus 20 Eau de Parfum (15ml)');
  });

  it('leaves a title that already names a strength alone', () => {
    expect(titleWithThgPageStrength(l('BYREDO Alto Astral Eau de Toilette 100ml'), stating, 'cult-beauty-global')).toBe('BYREDO Alto Astral Eau de Toilette 100ml');
  });

  it('never rewrites a duo, a kit or anything with two sizes', () => {
    const duo = html({ synopsis: ['<p>Featuring the Dirty Heaven Eau De Parfum (15ml) and Dirty Rice Eau De Parfum (15ml).</p>'] });
    for (const t of [
      'BORNTOSTANDOUT Dirty Duo: Dirty Heaven 15ml & Dirty Rice 15ml (Worth £158.00)',
      'KAYALI Fleur Majesty Duo - Fleur Majesty Rose Royale 50ml + 10ml',
      'Alto Astral Discovery Set 2 x 10ml',
    ]) {
      expect(titleWithThgPageStrength(l(t), duo, 'cult-beauty-global')).toBe(t);
    }
  });

  it('is what lets the strength rule show the product', () => {
    // A house with no entry in unstatedStrengthEvidence.ts: Byredo's own page now names Alto Astral's strength, so it shows without the page.
    const before = { rawTitle: 'Maison Exemple Alto Astral 100ml', retailerId: 'cult-beauty-global', priceGbp: 140, status: 'active' } as unknown as StoredListing;
    expect(isFragrance(before)).toBe(false);
    const after = { ...before, rawTitle: titleWithThgPageStrength(before, stating, 'cult-beauty-global') } as StoredListing;
    expect(isFragrance(after)).toBe(true);
  });
});

describe('the Cult Beauty route reads it from the page it already fetches', () => {
  it('is switched on for Cult Beauty and nowhere else yet', () => {
    expect(getRetailer('cult-beauty-global')?.sitemapRoute?.strengthFromPage).toBe(true);
  });

  const HOST = 'https://www.example.co.uk';
  const route: SitemapRoute = {
    roots: [`${HOST}/sitemapindex-product.xml`],
    follow: '/sitemap-product-\\d+\\.xml$',
    product: '^https://www\\.example\\.co\\.uk/p/[^/?#]+/\\d+/$',
    maxSitemaps: 2,
    requireGbp: true,
    strengthFromPage: true,
  };
  const retailer = {
    id: 'example-shop', name: 'Example Shop', domain: 'example.co.uk', homepage: HOST, tiers: ['designer'], enabled: false,
    adapter: 'unknown', currency: 'GBP', catalogue: null, sitemapRoute: route,
    shipping: { standardGbp: null, freeOverGbp: null, estimatedDays: [3, 5], verifiedAt: '2026-10-04', confidence: 'unverified' },
    affiliate: { network: null, verified: false, status: 'not-applied', publisherId: null, deeplinkTemplate: null, querySuffixTemplate: null, signupUrl: null },
  } as unknown as Retailer;

  const withLd = (body: string, name: string, sku: string) =>
    body.replace('<html>', `<html><head><script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name, sku, offers: { '@type': 'Offer', price: 140, priceCurrency: 'GBP' },
    })}</script>`);

  it('titles the listing with the strength, with no request beyond the page itself', async () => {
    const stating = withLd(html({ synopsis: ['<p>The Alto Astral Eau de Parfum (50ml) is a fragrance.</p>'] }), 'BYREDO Alto Astral 100ml', '501');
    const silent = withLd(html({ synopsis: ['<p>Meet the Wild Vetiver (50ml), a captivating fragrance.</p>'] }), 'Creed Wild Vetiver 100ml', '502');
    const site: Record<string, string> = {
      [`${HOST}/sitemapindex-product.xml`]: `<sitemapindex><sitemap><loc>${HOST}/sitemap-product-0.xml</loc></sitemap></sitemapindex>`,
      [`${HOST}/sitemap-product-0.xml`]: `<urlset><url><loc>${HOST}/p/alto-astral/501/</loc></url><url><loc>${HOST}/p/wild-vetiver/502/</loc></url></urlset>`,
      [`${HOST}/p/alto-astral/501/`]: stating,
      [`${HOST}/p/wild-vetiver/502/`]: silent,
    };
    const calls: string[] = [];
    const http: Http = async (url) => {
      calls.push(url);
      const body = site[url];
      return body ? { status: 200, ok: true, body } : { status: 404, ok: false, body: '' };
    };
    const result = await crawlViaSitemap({
      retailer, http, robots: parseRobots(''), maxPages: 10, gapMs: 0, headers: { 'user-agent': 'PriceSniffsBot' }, refreshShare: 0,
      sleep: async () => {},
    });
    const titles = Object.fromEntries(result.listings.map((x) => [x.retailerSku, x.rawTitle]));
    expect(titles).toEqual({ '501': 'BYREDO Alto Astral Eau de Parfum 100ml', '502': 'Creed Wild Vetiver 100ml' });
    expect(calls.filter((u) => u.includes('/p/'))).toHaveLength(2);
  });
});
