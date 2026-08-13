import { describe, expect, it } from 'vitest';
import {
  applyShippingPatch,
  proposeShippingUpdate,
  sanitiseQuote,
  type PageEvidence,
} from '../src/catalogue/shippingRegistryPatch.js';
import { deliveryLinksFrom, urlLooksLikeDeliveryPage } from '../src/catalogue/shippingPageFinder.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { Retailer, ShippingRule } from '../src/types/retailer.js';

const TODAY = '2026-08-13';

function shop(shipping: Partial<ShippingRule>): Retailer {
  return {
    ...RETAILERS[0]!,
    id: 'test-shop',
    name: 'Test Shop',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 25,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      ...shipping,
    },
  };
}

function evidence(over: Partial<PageEvidence> = {}): PageEvidence {
  return {
    url: 'https://example.com/policies/shipping-policy',
    standardGbp: 3.95,
    freeOverGbp: 25,
    caveats: [],
    standardRateNotStated: false,
    quote: 'Standard UK delivery is £3.95, free on orders over £25.',
    ...over,
  };
}

describe('proposeShippingUpdate', () => {
  it('promotes a rule the page agrees with, and records where it was read', () => {
    const p = proposeShippingUpdate(shop({}), evidence(), TODAY);
    expect(p.action).toBe('confirm-rate');
    expect(p.write).toEqual({
      confidence: 'confirmed',
      verifiedAt: TODAY,
      source: {
        url: 'https://example.com/policies/shipping-policy',
        quote: 'Standard UK delivery is £3.95, free on orders over £25.',
        readAt: TODAY,
      },
    });
  });

  it('never writes a figure the registry does not already hold', () => {
    // The whole point of the tool's original design: a first figure is typed by
    // a human who read the sentence, because a wrong-low one wins a sort it
    // should have lost.
    const p = proposeShippingUpdate(shop({ standardGbp: null }), evidence(), TODAY);
    expect(p.action).toBe('propose-rate');
    expect(p.write).toBeNull();
    expect(p.detail).toContain('£3.95');
  });

  it('refuses to pick a side when the page and the registry disagree', () => {
    const p = proposeShippingUpdate(shop({ standardGbp: 4.95 }), evidence(), TODAY);
    expect(p.action).toBe('disagrees');
    expect(p.write).toBeNull();
  });

  it('will not confirm a rate whose threshold has moved', () => {
    const p = proposeShippingUpdate(shop({ freeOverGbp: 40 }), evidence(), TODAY);
    expect(p.action).toBe('disagrees');
    expect(p.detail).toMatch(/threshold/);
  });

  it('will not confirm half a rule when the page never mentions the threshold', () => {
    const p = proposeShippingUpdate(shop({}), evidence({ freeOverGbp: null }), TODAY);
    expect(p.action).toBe('no-action');
    expect(p.write).toBeNull();
  });

  it('records a shop that genuinely publishes no standard rate', () => {
    // Manchester Ouds' actual shape: free over £50, and a "nominal fee" below
    // it that the page never puts a number on.
    const p = proposeShippingUpdate(
      shop({ standardGbp: null, freeOverGbp: 50 }),
      evidence({
        standardGbp: null,
        freeOverGbp: 50,
        standardRateNotStated: true,
        quote: 'Standard shipping is free on orders over £50, while a nominal fee applies to orders below £50.',
      }),
      TODAY,
    );
    expect(p.action).toBe('confirm-absence');
    expect(p.write!.standardRateNotPublished).toBe(true);
    expect(p.write!.source.quote).toContain('nominal fee');
  });

  it('does not record an absence for a shop the registry gives a rate for', () => {
    const p = proposeShippingUpdate(shop({}), evidence({ standardGbp: null, standardRateNotStated: true }), TODAY);
    expect(p.action).toBe('disagrees');
  });

  it('writes nothing at all when the page is ambiguous', () => {
    const p = proposeShippingUpdate(shop({}), evidence({ caveats: ['page names 3 different delivery charges'] }), TODAY);
    expect(p.action).toBe('no-action');
    expect(p.write).toBeNull();
  });
});

describe('sanitiseQuote', () => {
  it('flattens whitespace and bounds the length', () => {
    expect(sanitiseQuote('  Standard\n  delivery   £3.95 ')).toBe('Standard delivery £3.95');
    expect(sanitiseQuote('x'.repeat(400)).length).toBe(180);
  });
});

describe('applyShippingPatch', () => {
  const REGISTRY = `export const RETAILERS: readonly Retailer[] = [
  {
    id: 'alpha',
    name: 'Alpha',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 25,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Hand written note that must survive.',
    },
  },
  {
    id: 'beta',
    name: 'Beta',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-02',
      confidence: 'unverified',
    },
  },
];
`;

  const write = {
    confidence: 'confirmed' as const,
    verifiedAt: '2026-08-13',
    source: {
      url: 'https://alpha.example/policies/shipping-policy',
      quote: "Standard delivery is £3.95 and it's free over £25.",
      readAt: '2026-08-13',
    },
  };

  it('promotes one block and leaves everything else byte for byte', () => {
    const out = applyShippingPatch(REGISTRY, 'alpha', write);
    expect(out).toContain("confidence: 'confirmed',");
    expect(out).toContain("verifiedAt: '2026-08-13',");
    expect(out).toContain("url: 'https://alpha.example/policies/shipping-policy',");
    // The apostrophe in the quoted sentence must not end the string early.
    expect(out).toContain("quote: 'Standard delivery is £3.95 and it\\'s free over £25.',");
    // Hand written prose is the most valuable thing in that file.
    expect(out).toContain("notes: 'Hand written note that must survive.',");
    // Beta is untouched, including its own dates.
    expect(out).toContain("verifiedAt: '2026-08-02',");
    expect(out.match(/confidence: 'confirmed'/g)).toHaveLength(1);
  });

  it('records an absence as a flag beside the source', () => {
    const out = applyShippingPatch(REGISTRY, 'beta', { ...write, standardRateNotPublished: true });
    expect(out).toContain('standardRateNotPublished: true,');
    expect(out).toContain("standardGbp: null,");
  });

  it('replaces an earlier source block rather than stacking a second', () => {
    const once = applyShippingPatch(REGISTRY, 'alpha', write);
    const twice = applyShippingPatch(once, 'alpha', {
      ...write,
      verifiedAt: '2026-09-01',
      source: { ...write.source, readAt: '2026-09-01' },
    });
    expect(twice.match(/source: \{/g)).toHaveLength(1);
    expect(twice).toContain("readAt: '2026-09-01',");
    expect(twice).not.toContain("readAt: '2026-08-13',");
  });

  it('throws rather than silently doing nothing when the shape is unexpected', () => {
    expect(() => applyShippingPatch(REGISTRY, 'gamma', write)).toThrow(/gamma/);
    expect(() => applyShippingPatch("shipping: { confidence: 'unverified', }", 'alpha', write)).toThrow();
  });

  it('produces a registry that still parses as the same data', async () => {
    // The strongest check available offline: patch the real registry file and
    // confirm the result is valid TypeScript that still holds every retailer.
    const { readFileSync, writeFileSync, rmSync } = await import('node:fs');
    const path = new URL('../src/config/retailers.ts', import.meta.url);
    const original = readFileSync(path, 'utf8');
    const target = RETAILERS.find((r) => r.shipping.confidence === 'unverified')!;
    const patched = applyShippingPatch(original, target.id, write);

    expect(patched).not.toBe(original);
    expect(patched.length).toBeGreaterThan(original.length);

    // Written beside the original rather than in a temp directory, because the
    // registry imports its neighbours by relative path and would not resolve
    // anywhere else. Removed in `finally` whatever happens.
    const file = new URL('../src/config/retailers.patch-check.ts', import.meta.url);
    try {
      writeFileSync(file, patched);
      const reloaded = await import(/* @vite-ignore */ `${file.href}?t=${Date.now()}`);
      expect(reloaded.RETAILERS).toHaveLength(RETAILERS.length);
      const changed = reloaded.RETAILERS.find((r: Retailer) => r.id === target.id)!;
      expect(changed.shipping.confidence).toBe('confirmed');
      expect(changed.shipping.source.url).toBe(write.source.url);
      expect(changed.shipping.standardGbp).toBe(target.shipping.standardGbp);
      expect(changed.shipping.notes).toBe(target.shipping.notes);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe('registry invariants the writer must never break', () => {
  it('only claims a shop publishes no rate where there is no rate and a source', () => {
    for (const r of RETAILERS) {
      if (!r.shipping.standardRateNotPublished) continue;
      expect(r.shipping.standardGbp, `${r.id} claims no published rate but holds one`).toBeNull();
      expect(r.shipping.source, `${r.id} claims no published rate with no source`).toBeTruthy();
    }
  });

  it('never records a source without the three things that make it one', () => {
    for (const r of RETAILERS) {
      const s = r.shipping.source;
      if (!s) continue;
      expect(s.url, `${r.id} source has no URL`).toMatch(/^https?:\/\//);
      expect(s.quote.length, `${r.id} source has no quoted sentence`).toBeGreaterThan(0);
      expect(s.readAt, `${r.id} source has no read date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('deliveryLinksFrom', () => {
  const origin = 'https://shop.example';

  it('finds the footer link a shop states its terms behind', () => {
    const html = `<footer>
      <a href="/pages/about-us">About us</a>
      <a href="/customer-services/delivery-information">Delivery Information</a>
      <a href="https://royalmail.com/track">Track your parcel</a>
    </footer>`;
    const links = deliveryLinksFrom(html, origin);
    expect(links.map((l) => l.url)).toEqual([
      'https://shop.example/customer-services/delivery-information',
    ]);
    expect(links[0]!.linkText).toBe('Delivery Information');
  });

  it('never leaves the shop', () => {
    const html = '<a href="https://elsewhere.example/delivery">Delivery</a>';
    expect(deliveryLinksFrom(html, origin)).toEqual([]);
  });

  it('skips a returns page that says nothing about delivery', () => {
    const html = `<a href="/pages/returns-policy">Returns</a>
                  <a href="/pages/delivery-and-returns">Delivery &amp; Returns</a>`;
    expect(deliveryLinksFrom(html, origin).map((l) => l.url)).toEqual([
      'https://shop.example/pages/delivery-and-returns',
    ]);
  });

  it('will not treat a product or cart page as a policy page', () => {
    const html = `<a href="/products/express-delivery-upgrade">Express delivery upgrade</a>
                  <a href="/cart?shipping=1">Shipping</a>`;
    expect(deliveryLinksFrom(html, origin)).toEqual([]);
  });

  it('ranks the obvious candidate first and caps the list', () => {
    const html = `
      <a href="/blog-post">Read about our shipping partners</a>
      <a href="/pages/shipping-policy">Shipping</a>
      <a href="/some/page">Everything you need to know about delivery and more besides</a>`;
    const links = deliveryLinksFrom(html, origin, 2);
    expect(links).toHaveLength(2);
    expect(links[0]!.url).toBe('https://shop.example/pages/shipping-policy');
  });

  it('recognises a delivery page from its address alone', () => {
    expect(urlLooksLikeDeliveryPage('https://a.example/policies/shipping-policy')).toBe(true);
    expect(urlLooksLikeDeliveryPage('https://a.example/pages/faq')).toBe(false);
  });
});
