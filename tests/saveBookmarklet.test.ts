import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSavedPage, type ImportShop } from '../src/catalogue/importPages.js';
import { bookmarkletUrl } from '../scripts/catalogue-bookmarklet.js';

const source = readFileSync(resolve(__dirname, '../docs/save-page-bookmarklet.js'), 'utf8');
const SHOP: ImportShop = { id: 'notino-uk', name: 'Notino UK', domain: 'notino.co.uk', catalogue: { sections: [{ id: 'fragrance' }] } };

/** A Notino product page as a signed in shopper's browser holds it: product JSON-LD, plus their account in the app state. */
const LD = {
  '@context': 'https://schema.org', '@type': 'Product', name: 'Montale Arabians Tonka', sku: 'MNTARTU_AEDP10',
  description: 'Not </script> the end',
  offers: [
    { '@type': 'Offer', name: 'Montale Arabians Tonka 100 ml', price: 84.9, priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: '/montale/arabians-tonka-eau-de-parfum-unisex/p-16083959/' },
    { '@type': 'Offer', name: 'Montale Arabians Tonka 50 ml', price: 53.9, priceCurrency: 'GBP', availability: 'https://schema.org/InStock', url: '/montale/arabians-tonka-eau-de-parfum-unisex/p-16218647/' },
  ],
};
const PAGE_URL = 'https://www.notino.co.uk/montale/arabians-tonka-eau-de-parfum-unisex/';

/** Runs the bookmarklet (its source, or the code a bookmark holds) against a stand-in for the browser and returns what it downloaded. */
async function click(ldBlocks: string[], canonical: string | null, code = source) {
  const downloads: { name: string; blob: Blob }[] = [];
  const alerts: string[] = [];
  const document = {
    querySelectorAll: (sel: string) => (sel === 'script[type="application/ld+json"]' ? ldBlocks.map((textContent) => ({ textContent })) : []),
    querySelector: (sel: string) => (sel === 'link[rel="canonical"]' && canonical ? { href: canonical } : null),
    createElement: () => {
      const a = { href: '', download: '', click: () => downloads.push({ name: a.download, blob: blobs.get(a.href)! }), remove: () => {} };
      return a;
    },
    body: { appendChild: () => {} },
    // The rest of the page, which must never reach the file.
    documentElement: { outerHTML: '{"email":"shopper@example.com","xUserToken":"eyJhbGciOi.secret"}' },
  };
  const blobs = new Map<string, Blob>();
  const URLStub = { createObjectURL: (b: Blob) => { const k = `blob:${blobs.size}`; blobs.set(k, b); return k; } };
  const location = { href: `${PAGE_URL}?utm_source=x`, hostname: 'www.notino.co.uk', pathname: '/montale/arabians-tonka-eau-de-parfum-unisex/', search: '?utm_source=x' };
  new Function('document', 'location', 'URL', 'Blob', 'alert', code)(document, location, URLStub, Blob, (m: string) => alerts.push(m));
  return { downloads, alerts, text: downloads[0] ? await downloads[0].blob.text() : null };
}

describe('the Save for PriceSniffs bookmarklet', () => {
  it('saves only the product data, and the import reads every size from it', async () => {
    const { downloads, text } = await click([JSON.stringify(LD)], PAGE_URL);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe('notino-co-uk-montale-arabians-tonka-eau-de-parfum-unisex-utm-source-x.html');
    expect(text).not.toContain('shopper@example.com');
    expect(text).not.toContain('xUserToken');
    // A "</script>" inside the data cannot end the block early.
    expect(text!.match(/<\/script>/g)).toHaveLength(1);

    const out = parseSavedPage(text!, SHOP, '2026-01-01T00:00:00.000Z', new Date(Date.now() + 60_000));
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.capturedFrom).toBe('header');
    expect(out.page.canonicalUrl).toBe(PAGE_URL);
    expect(out.page.listings.map((l) => [l.retailerSku, l.priceGbp])).toEqual([['p-16083959', 84.9], ['p-16218647', 53.9]]);
  });

  it('saves nothing on a page with no product data, such as the "Just a moment..." check', async () => {
    const { downloads, alerts } = await click([], null);
    expect(downloads).toHaveLength(0);
    expect(alerts[0]).toContain('Just a moment');
  });

  it('prints as one short line a bookmark can hold, and that line saves the same file', async () => {
    const url = bookmarkletUrl(source);
    expect(url.startsWith('javascript:')).toBe(true);
    expect(url).not.toMatch(/\s/);
    expect(url.length).toBeLessThan(2000);
    const code = decodeURIComponent(url.slice('javascript:'.length));
    const fromBookmark = await click([JSON.stringify(LD)], PAGE_URL, code);
    const fromSource = await click([JSON.stringify(LD)], PAGE_URL);
    const strip = (t: string | null) => t!.replace(/<!-- saved: [^>]+-->/, '');
    expect(fromBookmark.downloads[0]!.name).toBe(fromSource.downloads[0]!.name);
    expect(strip(fromBookmark.text)).toBe(strip(fromSource.text));
  });
});
