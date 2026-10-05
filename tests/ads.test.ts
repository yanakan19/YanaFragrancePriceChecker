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
  GRID_AD_FIRST_MIN,
  GRID_AD_MAX_GAP,
  GRID_AD_MIN_GAP,
  WIDEST_ROW,
  adGap,
  adPositions,
  adPreviewOn,
  adPreviewRequested,
  adSlotHtml,
  adsOn,
  adsTxt,
  interleaveAds,
  isGridAd,
  nonPersonalisedFlag,
  placementOn,
  placementShown,
  publisherId,
  setAdPreview,
  verificationMeta,
  withAdPreview,
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

const BLANK: AdConfig = { client: '', slots: { home: '', grid: '', product: '' } };
/** A made up configuration for these tests only: never a real account. */
const TEST: AdConfig = {
  client: 'ca-pub-0000000000000000',
  slots: { home: '3333333333', grid: '1111111111', product: '2222222222' },
};
const PLACEMENTS: AdPlacement[] = ['home', 'grid', 'product'];

describe('ads switched off', () => {
  it('a blank publisher id renders, interleaves and publishes nothing', () => {
    expect(adsOn(BLANK)).toBe(false);
    for (const p of PLACEMENTS) expect(adSlotHtml(p, BLANK)).toBe('');
    const list = Array.from({ length: 100 }, (_, i) => i);
    expect(interleaveAds(list, '/search', BLANK)).toBe(list);
    expect(adsTxt(BLANK)).toBeNull();
    expect(verificationMeta(BLANK)).toBe('');
    expect(publisherId(BLANK)).toBeNull();
  });

  it('a publisher id without slot ids still shows no ad anywhere', () => {
    const idOnly: AdConfig = { client: TEST.client, slots: BLANK.slots };
    expect(adsOn(idOnly)).toBe(false);
    for (const p of PLACEMENTS) expect(adSlotHtml(p, idOnly)).toBe('');
    const list = Array.from({ length: 100 }, (_, i) => i);
    expect(interleaveAds(list, '/search', idOnly)).toBe(list);
  });

  it('a malformed id or slot never switches ads on', () => {
    expect(adsOn({ client: 'ca-pub-XXXXXXXXXXXXXXXX', slots: TEST.slots })).toBe(false);
    expect(adsOn({ client: 'pub-0000000000000000', slots: TEST.slots })).toBe(false);
    expect(placementOn('grid', { client: TEST.client, slots: { home: '', grid: 'abc', product: '' } })).toBe(false);
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
  const list = Array.from({ length: 200 }, (_, i) => `p${i}`);
  const out = interleaveAds(list, '/search', TEST);
  const productsBefore = out.flatMap((x, i) => (isGridAd(x) ? [out.slice(0, i).filter((y) => !isGridAd(y)).length] : []));

  it('puts an ad tile every 8 to 12 product tiles, never in the first row and never last', () => {
    expect(productsBefore.length).toBeGreaterThan(10);
    expect(productsBefore[0]).toBeGreaterThanOrEqual(GRID_AD_FIRST_MIN);
    const adAt = out.map((x, i) => (isGridAd(x) ? i : -1)).filter((i) => i >= 0);
    expect(Math.min(...adAt)).toBeGreaterThanOrEqual(WIDEST_ROW);
    for (let k = 1; k < productsBefore.length; k++) {
      const gap = productsBefore[k]! - productsBefore[k - 1]!;
      expect(gap).toBeGreaterThanOrEqual(GRID_AD_MIN_GAP);
      expect(gap).toBeLessThanOrEqual(GRID_AD_MAX_GAP);
    }
    expect(isGridAd(out[0])).toBe(false);
    expect(isGridAd(out[out.length - 1])).toBe(false);
  });

  it('never in the first row at any column count the grid offers', () => {
    expect(WIDEST_ROW).toBe(Math.max(...PER_ROW_CHOICES));
    const first = out.findIndex((x) => isGridAd(x));
    for (const perRow of [2, ...PER_ROW_CHOICES]) expect(Math.floor(first / perRow)).toBeGreaterThan(0);
    // At six across the first ad is after the second row.
    expect(Math.floor(first / 6)).toBeGreaterThanOrEqual(2);
  });

  it('never changes the order or the set of products', () => {
    expect(out.filter((x) => !isGridAd(x))).toEqual(list);
  });

  it('adds nothing to a list too short to reach past the first row', () => {
    const short = list.slice(0, GRID_AD_FIRST_MIN);
    expect(interleaveAds(short, '/search', TEST).some((x) => isGridAd(x))).toBe(false);
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
    expect(adSlotHtml('home', TEST)).toMatch(/^<div class="ps-ad ps-ad-home">/);
  });

  it('each placement is on only when its own slot id is filled in', () => {
    const onlyGrid: AdConfig = { client: TEST.client, slots: { home: '', grid: '1111111111', product: '' } };
    expect(adSlotHtml('home', onlyGrid)).toBe('');
    expect(adSlotHtml('product', onlyGrid)).toBe('');
    expect(adSlotHtml('grid', onlyGrid)).not.toBe('');
    const noGrid: AdConfig = { client: TEST.client, slots: { home: '3333333333', grid: '', product: '' } };
    const list2 = Array.from({ length: 100 }, (_, i) => i);
    expect(interleaveAds(list2, '/search', noGrid)).toBe(list2);
    expect(adSlotHtml('home', noGrid)).not.toBe('');
  });

  it('reserves a fixed space, so nothing moves when an ad arrives', () => {
    expect(AD_STYLES).toMatch(/\.ps-ad-tile \.ps-ad-ins \{ position: absolute; inset: 0;/);
    expect(AD_STYLES).toMatch(/\.ps-ad-block \.ps-ad-well \{ flex: none; height: 280px; \}/);
    expect(AD_STYLES).toMatch(/\.ps-ad-home \.ps-ad-well \{ flex: none; height: 100px; \}/);
    expect(AD_STYLES).toMatch(/\.ps-ad-home \.ps-ad-well \{ height: 90px; \}/);
  });

  it('the home banner is as wide as the six tile Most Stocked grid on a wide desktop', () => {
    expect(AD_STYLES).toContain('--pop-cols: 4; max-width: calc(var(--pop-cols) * 168px + (var(--pop-cols) - 1) * 12px)');
    expect(AD_STYLES).toMatch(/min-width: 1160px\) \{\s*:root\[data-layout="desktop"\] \.ps-ad-home \{ --pop-cols: 6; \}/);
    // The same numbers the Most Stocked section uses.
    const template = read('demo/template.html');
    expect(template).toContain('max-width: calc(var(--pop-cols) * 168px + (var(--pop-cols) - 1) * 12px);');
    expect(template).toMatch(/min-width: 1160px\) \{\s*:root\[data-layout="desktop"\] \.pop-section \{ --pop-cols: 6; \}/);
  });
});

describe('the random gap generator', () => {
  const seeds = ['/search', '/search?q=dior', '/brands/chanel', '/deals', '/retailers/boots', '/notes/vanilla', '/brands/zara'];

  it('draws each gap from 8 to 12, and the first from 16 to 20', () => {
    expect([GRID_AD_MIN_GAP, GRID_AD_MAX_GAP, GRID_AD_FIRST_MIN]).toEqual([8, 12, 16]);
    for (const seed of seeds) {
      expect(adGap(seed, 1)).toBeGreaterThanOrEqual(16);
      expect(adGap(seed, 1)).toBeLessThanOrEqual(20);
      for (let slot = 2; slot < 400; slot++) {
        const g = adGap(seed, slot);
        expect(g).toBeGreaterThanOrEqual(8);
        expect(g).toBeLessThanOrEqual(12);
      }
    }
  });

  it('uses every gap from 8 to 12 and averages about 10', () => {
    const gaps = Array.from({ length: 5000 }, (_, i) => adGap('/search', i + 2));
    expect(new Set(gaps)).toEqual(new Set([8, 9, 10, 11, 12]));
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    expect(mean).toBeGreaterThan(9.8);
    expect(mean).toBeLessThan(10.2);
  });

  it('is not a strict grid: the gaps within one list vary', () => {
    const gaps = Array.from({ length: 40 }, (_, i) => adGap('/search', i + 2));
    expect(new Set(gaps).size).toBeGreaterThanOrEqual(4);
  });

  it('gives the same positions for the same seed, however often it is asked', () => {
    for (const seed of seeds) {
      expect(adPositions(900, seed)).toEqual(adPositions(900, seed));
      expect(adGap(seed, 7)).toBe(adGap(seed, 7));
    }
  });

  it('gives a longer list the same positions plus more, so growing or windowing a list moves nothing', () => {
    for (const seed of seeds) {
      const short = adPositions(300, seed);
      const long = adPositions(3000, seed);
      expect(long.slice(0, short.length)).toEqual(short);
      expect(long.length).toBeGreaterThan(short.length);
    }
  });

  it('puts different lists in different places', () => {
    const sig = seeds.map((seed) => adPositions(400, seed).join(','));
    expect(new Set(sig).size).toBe(seeds.length);
    // Near seeds are told apart too.
    expect(adPositions(400, '/search?q=dior')).not.toEqual(adPositions(400, '/search?q=dior '));
    expect(adPositions(400, '/search?q=a')).not.toEqual(adPositions(400, '/search?q=b'));
  });

  it('keeps the first ad out of the first row and no ad last or at the very start', () => {
    for (const seed of seeds) {
      for (const total of [1, 5, 16, 17, 20, 21, 25, 40, 100, 777]) {
        const at = adPositions(total, seed);
        for (const n of at) {
          expect(n).toBeGreaterThanOrEqual(GRID_AD_FIRST_MIN);
          expect(n).toBeGreaterThanOrEqual(WIDEST_ROW + 1);
          expect(n).toBeLessThan(total);
        }
        const withAds = interleaveAds(Array.from({ length: total }, (_, i) => i), seed, TEST);
        expect(isGridAd(withAds[withAds.length - 1])).toBe(false);
        expect(isGridAd(withAds[0])).toBe(false);
      }
    }
    expect(adPositions(16, '/search')).toEqual([]);
  });

  it('gives a list every product in order, whatever the seed', () => {
    for (const seed of seeds) {
      const list = Array.from({ length: 150 }, (_, i) => i);
      expect(interleaveAds(list, seed, TEST).filter((x) => !isGridAd(x))).toEqual(list);
    }
  });
});

describe('the layout preview', () => {
  const PREVIEW: AdConfig = { ...BLANK, preview: true };

  it('is asked for by ?adpreview=1 and nothing else', () => {
    expect(adPreviewRequested('?adpreview=1')).toBe(true);
    expect(adPreviewRequested('?q=dior&adpreview=1')).toBe(true);
    expect(adPreviewRequested('')).toBe(false);
    expect(adPreviewRequested('?adpreview=0')).toBe(false);
    expect(adPreviewRequested('?adpreview=true')).toBe(false);
    expect(adPreviewRequested('?adpreview')).toBe(false);
  });

  it('draws every slot as a labelled dashed frame with its size, even with ads off and no slot ids', () => {
    expect(adsOn(PREVIEW)).toBe(false);
    for (const p of PLACEMENTS) {
      expect(placementShown(p, PREVIEW)).toBe(true);
      const html = adSlotHtml(p, PREVIEW);
      expect(html).toContain('<p class="ps-ad-label">Advertisement</p>');
      expect(html).toContain('ps-ad-preview');
      expect(html).toContain('data-ps-live');
    }
    expect(adSlotHtml('home', PREVIEW)).toContain('970 × 90');
    expect(adSlotHtml('home', PREVIEW)).toContain('320 × 100');
    expect(adSlotHtml('product', PREVIEW)).toContain('280 px');
    expect(adSlotHtml('grid', PREVIEW)).toContain('product tile');
    expect(AD_STYLES).toMatch(/border: 1px dashed/);
  });

  it('asks Google for nothing: no ad element, no slot id, no client id, no script address', () => {
    for (const cfg of [PREVIEW, { ...TEST, preview: true }]) {
      for (const p of PLACEMENTS) {
        const html = adSlotHtml(p, cfg);
        expect(html).not.toMatch(/<ins|adsbygoogle|data-ad-|googlesyndication|<script|<iframe|<img|https?:/);
      }
    }
  });

  it('puts the grid frames in a list at the same places an ad would go', () => {
    const list = Array.from({ length: 120 }, (_, i) => i);
    const off = interleaveAds(list, '/deals', BLANK);
    expect(off).toBe(list);
    const shown = interleaveAds(list, '/deals', PREVIEW);
    expect(shown.filter(isGridAd).length).toBe(adPositions(120, '/deals').length);
    expect(shown.filter(isGridAd).length).toBeGreaterThan(5);
    expect(shown.filter((x) => !isGridAd(x))).toEqual(list);
  });

  it('is off by default, held in memory only, and keeps itself on the address while it is on', () => {
    expect(adPreviewOn()).toBe(false);
    expect(withAdPreview('/search')).toBe('/search');
    expect(withAdPreview('/search?q=dior', false)).toBe('/search?q=dior');
    expect(withAdPreview('/search', true)).toBe('/search?adpreview=1');
    expect(withAdPreview('/search?q=dior', true)).toBe('/search?q=dior&adpreview=1');
    setAdPreview(true);
    try {
      expect(adPreviewOn()).toBe(true);
      expect(adSlotHtml('home')).toContain('ps-ad-preview');
      expect(withAdPreview('/')).toBe('/?adpreview=1');
    } finally {
      setAdPreview(false);
    }
    expect(adSlotHtml('home')).toBe('');
    // Nothing is written anywhere: neither module touches storage or cookies.
    for (const f of ['demo/ads.ts', 'demo/adsRuntime.ts']) {
      expect(read(f)).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    }
  });

  it('the runtime adds no script for it, and the preview markup has nothing for one to find', () => {
    const runtime = read('demo/adsRuntime.ts');
    // The preview branch returns before the ad script code is reached.
    const mount = runtime.slice(runtime.indexOf('export function mountAds'));
    expect(mount.indexOf('if (adPreviewOn())')).toBeGreaterThan(-1);
    expect(mount.indexOf('mountPreview();\n    return;')).toBeLessThan(mount.indexOf('requestScript();'));
    const preview = runtime.slice(runtime.indexOf('function mountPreview'), runtime.indexOf('/** Asks Google'));
    expect(preview).not.toMatch(/requestScript|adScriptUrl|createElement|fetch|XMLHttpRequest|sendBeacon/);
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
    expect(app.match(/adSlotHtml\(/g)).toHaveLength(3);
    // Every tile grid of products goes through it: fragranceList and Deals.
    const grids = app.match(/<ul class="tile-grid">\$\{chunked\([\s\S]*?\)\}<\/ul>/g) ?? [];
    expect(grids.length).toBe(2);
    for (const g of grids) expect(g).toContain('withGridAds(');
  });

  it('the home banner sits directly after the Most Stocked section, and nowhere else on the page', () => {
    const home = app.slice(app.indexOf('function homeView()'), app.indexOf('/* ── browse ──'));
    expect(home.match(/adSlotHtml\('home'\)/g)).toHaveLength(1);
    const popStart = home.indexOf('<section class="pop-section">');
    const popEnd = home.indexOf('</section>', popStart) + '</section>'.length;
    // Straight after the closing tag, so with ads off not one character is added.
    expect(home.slice(popEnd, popEnd + "${adSlotHtml('home')}".length)).toBe("${adSlotHtml('home')}");
    expect(home.indexOf("adSlotHtml('home')")).toBeLessThan(home.indexOf('class="bottom-split"'));
    expect(home.indexOf("adSlotHtml('home')")).toBeGreaterThan(home.indexOf('class="pop-rail"'));
  });

  it("grid ads are placed from the list's own address, so a list keeps its places", () => {
    expect(app).toContain('interleaveAds(list, adListSeed())');
    expect(app).toMatch(/function adListSeed\(\): string \{\n  return routeToPath\(currentRoute\(\)\);/);
  });

  it('the page is noindex while the preview is on, and the address keeps the parameter', () => {
    expect(app).toContain('applyHead(withPreviewNoindex(headFor(headInputForState()), adPreviewOn()));');
    expect(app).toContain('withAdPreview(routeToPath(currentRoute()))');
    expect(app).toContain('setAdPreview(adPreviewRequested(window.location.search));');
    // Switched on before the first render.
    expect(app.indexOf('setAdPreview(adPreviewRequested')).toBeLessThan(app.indexOf('installAds();\n  loadMode();'));
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
