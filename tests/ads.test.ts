import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADSENSE_CLIENT,
  ADS_ON,
  ADS_SWITCHED_ON,
  AD_CONFIG,
  AD_SLOTS,
  AD_STYLES,
  GRID_AD_INTERVAL,
  WIDEST_ROW,
  adSlotHtml,
  adsOn,
  adsTxt,
  interleaveAds,
  isGridAd,
  nonPersonalisedFlag,
  placementOn,
  publisherId,
  verificationMeta,
  type AdConfig,
  type AdPlacement,
} from '../demo/ads.js';
import { installAds, mountAds } from '../demo/adsRuntime.js';
import { PER_ROW_CHOICES } from '../demo/tileDensity.js';

/**
 * Display ads (demo/ads.ts) ship switched off and turn on only when the
 * publisher id and an ad unit's slot id are both filled in. These tests hold
 * the switch honest: off means nothing rendered, styled, loaded or requested;
 * on means an ad in the agreed places only, labelled, and never first.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const BLANK: AdConfig = { client: '', slots: { grid: '', product: '' } };
/** A made up configuration for these tests only: never a real account. */
const TEST: AdConfig = { client: 'ca-pub-0000000000000000', slots: { grid: '1111111111', product: '2222222222' } };
const PLACEMENTS: AdPlacement[] = ['grid', 'product'];

describe('ads switched off', () => {
  it('a blank publisher id renders, interleaves and publishes nothing', () => {
    expect(adsOn(BLANK)).toBe(false);
    for (const p of PLACEMENTS) expect(adSlotHtml(p, BLANK)).toBe('');
    const list = Array.from({ length: 100 }, (_, i) => i);
    expect(interleaveAds(list, BLANK)).toBe(list);
    expect(adsTxt(BLANK)).toBeNull();
    expect(verificationMeta(BLANK)).toBe('');
    expect(publisherId(BLANK)).toBeNull();
  });

  it('a publisher id without slot ids still shows no ad anywhere', () => {
    const idOnly: AdConfig = { client: TEST.client, slots: BLANK.slots };
    expect(adsOn(idOnly)).toBe(false);
    for (const p of PLACEMENTS) expect(adSlotHtml(p, idOnly)).toBe('');
    const list = Array.from({ length: 100 }, (_, i) => i);
    expect(interleaveAds(list, idOnly)).toBe(list);
  });

  it('a malformed id or slot never switches ads on', () => {
    expect(adsOn({ client: 'ca-pub-XXXXXXXXXXXXXXXX', slots: TEST.slots })).toBe(false);
    expect(adsOn({ client: 'pub-0000000000000000', slots: TEST.slots })).toBe(false);
    expect(placementOn('grid', { client: TEST.client, slots: { grid: 'abc', product: '' } })).toBe(false);
  });

  it('the committed configuration is the owner\'s id, and ads run only once a slot id is filled in', () => {
    expect(ADSENSE_CLIENT).toBe('ca-pub-6298711915135064');
    expect(ADS_ON).toBe(Object.values(AD_SLOTS).some((s) => s !== ''));
    if (!ADS_ON) {
      // As shipped on 3 October 2026, before Google has approved the site.
      for (const p of PLACEMENTS) expect(adSlotHtml(p)).toBe('');
      expect(ADS_SWITCHED_ON).toBe('');
    } else {
      // The legal pages take their "Last updated" date from this.
      expect(ADS_SWITCHED_ON).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}$/);
    }
  });

  it('the runtime touches nothing while ads are off', () => {
    // There is no document in this test environment: any attempt to add a
    // style, a script or an observer would throw.
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(() => installAds()).not.toThrow();
    expect(() => mountAds()).not.toThrow();
  });

  it('the page template and app carry no ad markup, style or script of their own', () => {
    const template = read('demo/template.html');
    expect(template).not.toMatch(/adsbygoogle|googlesyndication|ps-ad/);
    expect(read('demo/app.ts')).not.toMatch(/googlesyndication|adsbygoogle/);
    // The ad styles exist only as a string installAds adds when ads are on.
    expect(template).not.toContain(AD_STYLES.trim().split('\n')[0]!);
  });
});

describe('ads switched on, with a test id', () => {
  const list = Array.from({ length: 60 }, (_, i) => `p${i}`);
  const out = interleaveAds(list, TEST);

  it('puts an ad tile after every 8th product tile, never in the first row and never last', () => {
    expect(GRID_AD_INTERVAL).toBe(8);
    const adAt = out.map((x, i) => (isGridAd(x) ? i : -1)).filter((i) => i >= 0);
    // Products before each ad. 8 is skipped: at 10 per row it is still the first row.
    const productsBefore = adAt.map((i) => out.slice(0, i).filter((x) => !isGridAd(x)).length);
    expect(productsBefore).toEqual([16, 24, 32, 40, 48, 56]);
    expect(productsBefore.every((n) => n % GRID_AD_INTERVAL === 0)).toBe(true);
    expect(Math.min(...adAt)).toBeGreaterThanOrEqual(WIDEST_ROW);
    expect(isGridAd(out[0])).toBe(false);
    expect(isGridAd(out[out.length - 1])).toBe(false);
  });

  it('never in the first row at any column count the grid offers', () => {
    expect(WIDEST_ROW).toBe(Math.max(...PER_ROW_CHOICES));
    const first = out.findIndex((x) => isGridAd(x));
    for (const perRow of [2, ...PER_ROW_CHOICES]) expect(Math.floor(first / perRow)).toBeGreaterThan(0);
  });

  it('never changes the order or the set of products', () => {
    expect(out.filter((x) => !isGridAd(x))).toEqual(list);
  });

  it('adds nothing to a list too short to reach past the first row', () => {
    const short = list.slice(0, 16);
    expect(interleaveAds(short, TEST).some((x) => isGridAd(x))).toBe(false);
  });

  it('labels every ad "Advertisement" and keeps it apart from offers and product tiles', () => {
    for (const p of PLACEMENTS) {
      const html = adSlotHtml(p, TEST);
      expect(html).toContain('<p class="ps-ad-label">Advertisement</p>');
      expect(html).toContain(`data-ad-client="${TEST.client}"`);
      expect(html).toContain(`data-ad-slot="${TEST.slots[p]}"`);
      // None of the classes that style a product tile, a price or an offer.
      const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1]!.split(/\s+/));
      for (const c of classes) expect(c).toMatch(/^(ps-ad[\w-]*|adsbygoogle)$/);
      expect(html).not.toMatch(/Cheapest|£/);
    }
    expect(adSlotHtml('grid', TEST)).toMatch(/^<li class="ps-ad ps-ad-tile">/);
    expect(adSlotHtml('product', TEST)).toMatch(/^<div class="ps-ad ps-ad-block">/);
  });

  it('reserves a fixed space, so nothing moves when an ad arrives', () => {
    expect(AD_STYLES).toMatch(/\.ps-ad-tile \.ps-ad-ins \{ position: absolute; inset: 0;/);
    expect(AD_STYLES).toMatch(/\.ps-ad-block \.ps-ad-well \{ flex: none; height: 280px; \}/);
  });
});

describe('consent', () => {
  it('asks for non personalised ads unless consent is clearly given', () => {
    expect(nonPersonalisedFlag(null)).toBe(1);
    expect(nonPersonalisedFlag({ eventStatus: 'cmpuishown', gdprApplies: true })).toBe(1);
    expect(nonPersonalisedFlag({ gdprApplies: true, purpose: { consents: { 1: true, 3: true } } })).toBe(1);
    expect(nonPersonalisedFlag({ gdprApplies: true, purpose: { consents: { 1: true, 3: true, 4: true } } })).toBe(0);
    expect(nonPersonalisedFlag({ gdprApplies: false })).toBe(0);
  });

  it('builds no consent banner of its own', () => {
    const runtime = read('demo/adsRuntime.ts');
    expect(runtime).not.toMatch(/innerHTML|insertAdjacentHTML|createElement\('(div|dialog|button)'/);
    expect(runtime).toContain("__tcfapi('addEventListener', 2");
  });
});

describe('ads.txt and the verification tag', () => {
  it('ads.txt names the configured account as Google\'s direct seller', () => {
    expect(adsTxt(TEST)).toBe('google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n');
    expect(adsTxt()).toBe('google.com, pub-6298711915135064, DIRECT, f08c47fec0942fa0\n');
  });

  it('the published demo/ads.txt matches the configuration', () => {
    const want = adsTxt(AD_CONFIG);
    const path = resolve(root, 'demo/ads.txt');
    if (want === null) expect(existsSync(path)).toBe(false);
    else expect(readFileSync(path, 'utf8')).toBe(want);
  });

  it('the build writes both from the configuration, not a typed id', () => {
    const build = read('scripts/build-demo.ts');
    expect(build).toContain('${verificationMeta()}');
    expect(build).toContain('adsTxt()');
    expect(build).not.toMatch(/ca-pub-\d|pub-\d{16}/);
  });

  it('every built page head carries the tag once', () => {
    for (const page of ['demo/index.html', 'demo/404.html']) {
      const html = read(page);
      expect(html.split(verificationMeta()).length - 1).toBe(1);
    }
  });
});

describe('placements in demo/app.ts', () => {
  const app = read('demo/app.ts');

  it('the product page ad sits under the whole offer list, below every section and the price boxes', () => {
    const detail = app.slice(app.indexOf('<div class="detail-grid">'), app.indexOf('/* ── explore: brands'));
    const ad = detail.indexOf("adSlotHtml('product')");
    expect(ad).toBeGreaterThan(0);
    for (const before of ['priceBoxRow(', '<ul class="offers">', 'Delivery Not Included', '>Sold Out<', 'priceHistorySection(', 'unavailableShopsLine(']) {
      const at = detail.lastIndexOf(before);
      expect(at, before).toBeGreaterThan(0);
      expect(at, before).toBeLessThan(ad);
    }
    // Inside the offers column, not the price rail.
    expect(ad).toBeGreaterThan(detail.indexOf('<div class="detail-offers">'));
  });

  it('grid ads come only through withGridAds, on every product tile grid', () => {
    expect(app.match(/adSlotHtml\('grid'\)/g)).toHaveLength(1);
    expect(app.match(/adSlotHtml\(/g)).toHaveLength(2);
    // Every tile grid of products goes through it: fragranceList and Deals.
    const grids = app.match(/<ul class="tile-grid">\$\{chunked\([\s\S]*?\)\}<\/ul>/g) ?? [];
    expect(grids.length).toBe(2);
    for (const g of grids) expect(g).toContain('withGridAds(');
  });

  it('every render and every appended chunk mounts new slots', () => {
    expect(app).toMatch(/mountChunkedList\(\);\n\n  \/\/ Ad slots[^\n]*\n  mountAds\(\);/);
    // An appended chunk is inserted, bookkeeping for the windowed list runs
    // (held.windowed), and then the new slots are mounted, all inside
    // appendNextChunk: mountAds() must follow the insert before the function ends.
    const append = app.slice(app.indexOf('function appendNextChunk'));
    const body = append.slice(0, append.indexOf('\n}\n'));
    const inserted = body.indexOf("el.insertAdjacentHTML('beforebegin', next.map((item) => held.render(item)).join(''));");
    expect(inserted).toBeGreaterThan(-1);
    expect(body.indexOf('mountAds();', inserted)).toBeGreaterThan(inserted);
  });
});
