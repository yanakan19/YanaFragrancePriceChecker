import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { importPages, parseSavedPage, mergePage, challengeReason, type ImportShop } from '../src/catalogue/importPages.js';
import { CatalogueStore } from '../src/catalogue/store.js';
import { parseListings } from '../src/catalogue/jsonld.js';

const REPO_ROOT = resolve(__dirname, '..');
const SHOP: ImportShop = {
  id: 'notino-uk', name: 'Notino UK', domain: 'notino.co.uk',
  catalogue: { sections: [{ id: 'fragrance' }] },
};
const NOW = new Date('2026-10-07T12:00:00Z');

/** Trimmed from the real data/render-capture/notino-uk/fragrance.html: same shape, three products. */
function listingPage(opts: { header?: string; price?: [number, number, number] } = {}): string {
  const [a, b, c] = opts.price ?? [51.3, 3.5, 144.5];
  const product = (name: string, slug: string, price: number, extra = '') => ({
    '@type': 'Product', name, image: `https://cdn.notinoimg.com/list_2k//x/${slug}.jpg`,
    description: 'eau de parfum for men 100 ml',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.4, reviewCount: 89 },
    offers: {
      '@type': 'Offer', priceCurrency: 'GBP', price, availability: 'InStock',
      url: `https://www.notino.co.uk/brand/${slug}/`, ...(extra ? { priceValidUntil: extra } : {}),
    },
  });
  const ld = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Fragrances', url: 'https://www.notino.co.uk/fragrance/',
    mainEntity: [
      product('Afnan Supremacy Collector&apos;s Edition', 'supremacy-eau-de-parfum', a),
      product('David Beckham Classic Homme', 'classic-homme-shower-gel', b),
      product('Xerjoff XJ 1861 Naxos', 'xj-1861-naxos-eau-de-parfum-unisex', c),
    ],
  };
  return `${opts.header ?? ''}<!doctype html><html><head><title>Fragrances</title>
<link rel="canonical" href="https://www.notino.co.uk/fragrance/">
<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>${'<p>padding</p>'.repeat(700)}</body></html>`;
}

const challenge = readFileSync(join(REPO_ROOT, 'data/render-capture/notino-uk/mens.html'), 'utf8');

describe('parseSavedPage', () => {
  it('reads a listing page: canonical URL, capture time from the header comment, listings and gaps', () => {
    const html = listingPage({ header: '<!-- saved: 2026-10-06T09:30:00Z -->\n<!-- url: https://www.notino.co.uk/fragrance/?f=2-1-55544 -->\n' });
    const out = parseSavedPage(html, SHOP, '2026-01-01T00:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.capturedAt).toBe('2026-10-06T09:30:00.000Z');
    expect(out.page.capturedFrom).toBe('header');
    expect(out.page.canonicalUrl).toBe('https://www.notino.co.uk/fragrance/');
    expect(out.page.listings).toHaveLength(3);
    const naxos = out.page.listings.find((l) => l.rawTitle === 'Xerjoff XJ 1861 Naxos');
    expect(naxos?.priceGbp).toBe(144.5);
    expect(naxos?.url).toBe('https://www.notino.co.uk/brand/xj-1861-naxos-eau-de-parfum-unisex/');
    expect(naxos?.retailerSku).toBe('xj-1861-naxos-eau-de-parfum-unisex');
    expect(naxos?.sectionId).toBe('fragrance');
    // A Notino listing page carries no brand, barcode or size on two of three products.
    expect(out.page.missing).toMatchObject({ price: 0, image: 0, brand: 3, barcode: 3, stock: 0 });
    expect(out.page.missing.size).toBe(0);
  });

  it('falls back to the file time, and to the header url when the page has no canonical', () => {
    const html = listingPage({ header: '<!-- url: https://www.notino.co.uk/dior/j-adore/ -->' }).replace(/<link rel="canonical"[^>]*>/, '').replace(/"url":"https:\/\/www.notino.co.uk\/fragrance\/",/, '');
    const out = parseSavedPage(html, SHOP, '2026-10-05T08:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.capturedFrom).toBe('mtime');
    expect(out.page.capturedAt).toBe('2026-10-05T08:00:00.000Z');
    expect(out.page.canonicalUrl).toBe('https://www.notino.co.uk/dior/j-adore/');
  });

  it('reads Chrome\'s own "saved from url" comment', () => {
    const html = listingPage({ header: '<!-- saved from url=(0043)https://www.notino.co.uk/fragrance/ -->' }).replace(/<link rel="canonical"[^>]*>/, '').replace(/"url":"https:\/\/www.notino.co.uk\/fragrance\/",/, '');
    const out = parseSavedPage(html, SHOP, '2026-10-05T08:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.canonicalUrl).toBe('https://www.notino.co.uk/fragrance/');
  });

  it('keeps a bad "saved" date as a note and uses the file time', () => {
    const out = parseSavedPage(listingPage({ header: '<!-- saved: last tuesday -->' }), SHOP, '2026-10-05T08:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.capturedFrom).toBe('mtime');
    expect(out.page.notes.join(' ')).toContain('not a date');
  });

  it('refuses a capture dated in the future and a page from another shop', () => {
    const future = parseSavedPage(listingPage({ header: '<!-- saved: 2027-01-01T00:00:00Z -->' }), SHOP, '2026-10-05T08:00:00.000Z', NOW);
    expect(future).toMatchObject({ ok: false });
    const other = parseSavedPage(listingPage().replace(/notino\.co\.uk\/fragrance\/">/, 'boots.com/fragrance/">'), SHOP, '2026-10-05T08:00:00.000Z', NOW);
    expect(other).toMatchObject({ ok: false });
    expect(other.ok ? '' : other.reason).toContain('wrong shop');
  });

  it('leaves out a listing whose address is not on the shop\'s domain', () => {
    const html = listingPage().replace('https://www.notino.co.uk/brand/classic-homme-shower-gel/', 'https://ads.example.com/classic');
    const out = parseSavedPage(html, SHOP, '2026-10-05T08:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.listings).toHaveLength(2);
    expect(out.page.offDomain).toBe(1);
  });

  it('refuses a real Cloudflare challenge page (Notino mens.html capture)', () => {
    const out = parseSavedPage(challenge, SHOP, '2026-10-05T08:00:00.000Z', NOW);
    expect(out.ok).toBe(false);
    expect(out.ok ? '' : out.reason).toContain('bot challenge');
  });

  it('refuses a tiny page with no products, but never a page that has products', () => {
    expect(challengeReason('<html><body>hi</body></html>', 0)).toContain('bot wall');
    expect(challengeReason(`<script>_cf_chl_opt = {}</script>`.padEnd(20_000, ' '), 5)).toBeNull();
  });

  it('reads the real Notino fragrance.html capture the same way parseListings does', () => {
    const html = readFileSync(join(REPO_ROOT, 'data/render-capture/notino-uk/fragrance.html'), 'utf8');
    const out = parseSavedPage(html, SHOP, '2026-08-27T00:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.listings).toHaveLength(27);
    expect(out.page.listings).toHaveLength(parseListings(html, { sectionId: 'fragrance', pageUrl: 'https://www.notino.co.uk/fragrance/' }).length);
    expect(out.page.canonicalUrl).toBe('https://www.notino.co.uk/fragrance/');
  });

  /** Trimmed from a Notino product page the owner saved on 2026-10-07: one offer per size, a discount code price listed twice. */
  function productPage(offers: Record<string, unknown>[]): string {
    const base = 'https://www.notino.co.uk/armani/emporio-stronger-with-you-intensely-eau-de-parfum-for-men/';
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product', '@id': base, name: 'Armani Emporio Stronger With You Intensely',
      sku: 'GIOSWIM_AEDP10', gtin13: '3614274347388', brand: { '@type': 'Brand', name: 'Armani' },
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.6, ratingCount: 75 },
      offers: offers.map((o) => ({ '@type': 'Offer', priceCurrency: 'GBP', itemCountry: 'GB', ...o })),
    };
    return `<!-- saved: 2026-10-07T00:00:00Z --><html><head><link rel="canonical" href="${base}"/></head><body>
<script type="application/ld+json">${JSON.stringify(ld)}</script>${'<p>padding</p>'.repeat(700)}</body></html>`;
  }
  const offer = (ml: number, id: number, price: number, extra: Record<string, unknown> = {}) => ({
    name: `Armani Emporio Stronger With You Intensely ${ml} ml`, sku: `GIOSWIM_${ml}`, price,
    availability: 'https://schema.org/InStock', url: `/armani/emporio-stronger-with-you-intensely-eau-de-parfum-for-men/p-${id}/`, ...extra,
  });

  it('reads every size of a saved product page, at the shelf price, not the discount code price', () => {
    const html = productPage([
      offer(100, 15802363, 65.36, { priceValidUntil: '2026-10-11T22:59:59+00:00', sku: 'GIOSWIM_AEDP10' }),
      offer(150, 16286591, 79.5),
      offer(100, 15802363, 76.9, { sku: 'GIOSWIM_AEDP10' }),
      offer(10, 16396178, 29.9, { availability: 'https://schema.org/OutOfStock' }),
    ]);
    const out = parseSavedPage(html, SHOP, '2026-01-01T00:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    const bySku = Object.fromEntries(out.page.listings.map((l) => [l.retailerSku, l]));
    expect(Object.keys(bySku).sort()).toEqual(['p-15802363', 'p-16286591', 'p-16396178']);
    expect(bySku['p-15802363']).toMatchObject({
      rawTitle: 'Armani Emporio Stronger With You Intensely 100 ml', priceGbp: 76.9, promoEndsAt: null, inStock: true,
      url: 'https://www.notino.co.uk/armani/emporio-stronger-with-you-intensely-eau-de-parfum-for-men/p-15802363/',
    });
    expect(bySku['p-16396178']).toMatchObject({ priceGbp: 29.9, inStock: false });
    // The page's gtin13 is the 150 ml's although its sku is the 100 ml's, so no size is given it.
    expect(out.page.listings.every((l) => l.ean === null)).toBe(true);
    expect(out.page.missing.size).toBe(0);
  });

  it('keeps the one listing it read before when two offers for one size cannot be told apart, and crawls are unchanged', () => {
    const twice = productPage([offer(100, 15802363, 65.36, { sku: 'GIOSWIM_AEDP10' }), offer(150, 16286591, 79.5), offer(100, 15802363, 76.9, { sku: 'GIOSWIM_AEDP10' })]);
    const out = parseSavedPage(twice, SHOP, '2026-01-01T00:00:00.000Z', NOW);
    if (!out.ok) throw new Error(out.reason);
    expect(out.page.listings).toHaveLength(1);

    const clean = productPage([offer(150, 16286591, 79.5), offer(100, 15802363, 76.9, { sku: 'GIOSWIM_AEDP10' })]);
    const pageUrl = 'https://www.notino.co.uk/armani/emporio-stronger-with-you-intensely-eau-de-parfum-for-men/';
    expect(parseListings(clean, { sectionId: 'fragrance', pageUrl })).toHaveLength(1);
    expect(parseListings(clean, { sectionId: 'fragrance', pageUrl, everyOffer: true })).toHaveLength(2);
  });
});

describe('mergePage', () => {
  const raw = (sku: string, price: number | null) => ({
    retailerSku: sku, url: `https://www.notino.co.uk/b/${sku}/`, rawTitle: sku, rawBrand: null, ean: null, imageUrl: null,
    priceGbp: price, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 'fragrance',
  });

  it('adds new listings, refreshes held ones, never delists, and drops unpriced', () => {
    const first = mergePage([], { capturedAt: '2026-10-01T00:00:00.000Z', listings: [raw('a', 10), raw('b', 20), raw('c', null)] }, 'notino-uk');
    expect(first.stats).toEqual({ added: 2, refreshed: 0, olderThanStored: 0, unpriced: 1 });
    const second = mergePage(first.listings, { capturedAt: '2026-10-03T00:00:00.000Z', listings: [raw('a', 12)] }, 'notino-uk');
    expect(second.stats.refreshed).toBe(1);
    const a = second.listings.find((l) => l.retailerSku === 'a')!;
    const b = second.listings.find((l) => l.retailerSku === 'b')!;
    expect(a).toMatchObject({ priceGbp: 12, firstSeenAt: '2026-10-01T00:00:00.000Z', lastSeenAt: '2026-10-03T00:00:00.000Z', status: 'active' });
    expect(b.status).toBe('active');
  });

  it('does not let an older capture overwrite a newer sighting', () => {
    const held = mergePage([], { capturedAt: '2026-10-05T00:00:00.000Z', listings: [raw('a', 10)] }, 'notino-uk').listings;
    const out = mergePage(held, { capturedAt: '2026-10-01T00:00:00.000Z', listings: [raw('a', 99)] }, 'notino-uk');
    expect(out.stats.olderThanStored).toBe(1);
    expect(out.listings[0]?.priceGbp).toBe(10);
  });
});

describe('importPages (files on disk into a snapshot)', () => {
  let dir: string;
  let pages: string;
  let cat: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'import-pages-'));
    pages = join(dir, 'pages');
    cat = join(dir, 'catalogue');
    mkdirSync(pages);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes listings, refuses the challenge file, applies the newest capture last, and delists nothing', () => {
    // A listing the snapshot holds that no saved page mentions must stay active.
    new CatalogueStore(cat).write({
      retailerId: 'notino-uk', updatedAt: '2026-09-09T00:00:00.000Z', source: 'live', runs: [],
      listings: [{
        retailerSku: 'old-one', url: 'https://www.notino.co.uk/b/old-one/', rawTitle: 'Old One', rawBrand: null, ean: null,
        imageUrl: null, priceGbp: 9, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 'fragrance',
        retailerId: 'notino-uk', firstSeenAt: '2026-08-01T00:00:00.000Z', lastSeenAt: '2026-09-09T00:00:00.000Z',
        status: 'active', delistedAt: null, relistedAt: null, eligibleForNewBadge: true, variantId: null,
      }],
    });
    // Named so that name order and capture order disagree: "a" is the newer capture.
    writeFileSync(join(pages, 'a.html'), listingPage({ header: '<!-- saved: 2026-10-06T10:00:00Z -->', price: [60, 4, 150] }));
    writeFileSync(join(pages, 'b.html'), listingPage({ header: '<!-- saved: 2026-10-02T10:00:00Z -->', price: [51.3, 3.5, 144.5] }));
    writeFileSync(join(pages, 'c.html'), challenge);
    writeFileSync(join(pages, 'notes.txt'), 'ignored');
    // No header: capture time is the file's modification time.
    writeFileSync(join(pages, 'd.html'), listingPage({ price: [1, 1, 1] }).replaceAll('xj-1861-naxos-eau-de-parfum-unisex', 'other'));
    utimesSync(join(pages, 'd.html'), new Date('2026-09-20T00:00:00Z'), new Date('2026-09-20T00:00:00Z'));

    const result = importPages({ shop: SHOP, dir: pages, catalogueDir: cat, now: NOW });
    expect(result.written).toBe(true);
    expect(result.files.map((f) => [f.file, f.status])).toEqual([
      ['a.html', 'imported'], ['b.html', 'imported'], ['c.html', 'refused'], ['d.html', 'imported'],
    ]);

    const snap = new CatalogueStore(cat).read('notino-uk');
    expect(snap.updatedAt).toBe('2026-10-06T10:00:00.000Z');
    const bySku = new Map(snap.listings.map((l) => [l.retailerSku, l]));
    expect(bySku.get('old-one')?.status).toBe('active');
    expect(bySku.get('supremacy-eau-de-parfum')).toMatchObject({
      priceGbp: 60, firstSeenAt: '2026-09-20T00:00:00.000Z', lastSeenAt: '2026-10-06T10:00:00.000Z',
      status: 'active', eligibleForNewBadge: true, retailerId: 'notino-uk', sectionId: 'fragrance',
    });
    // On the 2 Oct and 6 Oct pages: the newest capture's price wins.
    expect(bySku.get('xj-1861-naxos-eau-de-parfum-unisex')?.priceGbp).toBe(150);
    expect(bySku.get('other')?.priceGbp).toBe(1);
    expect(snap.listings).toHaveLength(5);
  });

  it('writes nothing for a dry run, and nothing when every file is refused', () => {
    writeFileSync(join(pages, 'a.html'), listingPage());
    const dry = importPages({ shop: SHOP, dir: pages, catalogueDir: cat, dryRun: true, now: NOW });
    expect(dry.written).toBe(false);
    expect(new CatalogueStore(cat).read('notino-uk').listings).toHaveLength(0);

    rmSync(join(pages, 'a.html'));
    writeFileSync(join(pages, 'c.html'), challenge);
    const none = importPages({ shop: SHOP, dir: pages, catalogueDir: cat, now: NOW });
    expect(none.written).toBe(false);
    expect(none.files[0]?.status).toBe('refused');
  });

  it('a first import to a shop with no snapshot is a baseline: nothing earns the NEW badge', () => {
    writeFileSync(join(pages, 'a.html'), listingPage());
    importPages({ shop: SHOP, dir: pages, catalogueDir: cat, now: NOW });
    const snap = new CatalogueStore(cat).read('notino-uk');
    expect(snap.source).toBe('live');
    expect(snap.listings).toHaveLength(3);
  });
});
