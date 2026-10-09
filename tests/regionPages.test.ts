// The US and Indian pages (/us/, /in/; public beta of 9 October 2026,
// docs/INTERNATIONAL-PLAN.md "Public beta, 9 October 2026: what shipped"):
// the built folder, the deep link hand off, the sitemaps and what the region
// data may and may not carry. They read the built site, so run `npm run demo`
// first (npm test does).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { referencedDataFiles } from '../scripts/dataFiles.js';
import { readStampedHash } from '../scripts/demoInputsHash.js';
import { REGION_PATH_PARAM, regionDispatchScript, regionFilePath, regionRestoreScript, regionTemplate } from '../scripts/regionPages.js';
import { regionPagesToWrite } from '../scripts/build-route-pages.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { liveRegions, regionById } from '../src/config/regions.js';
import { SITE_URL } from '../demo/head.js';

const demo = resolve(REPO_ROOT, 'demo');
const built = existsSync(join(demo, 'us/index.html')) && existsSync(join(demo, 'sitemap-gb.xml'));
const read = (rel: string): string => readFileSync(join(demo, rel), 'utf8');
const US = regionById('US')!;
const IN = regionById('IN')!;
const GB = regionById('GB')!;
const REGIONS = [US, IN];

/** Runs a head script against a stand-in address; answers where it sent the page and what it set. */
function runScript(script: string, href: string): { replaced: string | null; state: string | null; fetchStubbed: boolean; flag: unknown } {
  const url = new URL(href);
  let replaced: string | null = null;
  let state: string | null = null;
  const window: Record<string, unknown> = { fetch: () => 'real' };
  const location = {
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    replace: (to: string) => { replaced = to; },
  };
  const history = { replaceState: (_s: unknown, _t: string, to: string) => { state = to; } };
  runInNewContext(script, { window, location, history, decodeURIComponent, encodeURIComponent, Promise });
  return { replaced, state, fetchStubbed: (window.fetch as () => unknown)() !== 'real', flag: window.__psRegionDocument };
}

describe('the deep link hand off (scripts/regionPages.ts)', () => {
  const dispatch = regionDispatchScript(['us', 'in']);

  it('hands a US or Indian deep link to that region\'s page, starting none of the UK page\'s data', () => {
    const r = runScript(dispatch, 'https://pricesniffs.space/us/creed_aventus_100ml?x=1#top');
    expect(r.replaced).toBe(`/us/?${REGION_PATH_PARAM}=${encodeURIComponent('/us/creed_aventus_100ml?x=1#top')}`);
    expect(r.fetchStubbed, 'the UK loader fetches nothing').toBe(true);
    expect(r.flag).toBe('us');
    expect(runScript(dispatch, 'https://pricesniffs.space/in/brands/rasasi').replaced).toBe(`/in/?${REGION_PATH_PARAM}=${encodeURIComponent('/in/brands/rasasi')}`);
  });

  it('leaves every UK address and the regions\' own homes alone, and sends /uk/ to the root', () => {
    for (const href of ['/', '/deals', '/creed_aventus_100ml', '/usa', '/india/x', '/us/', '/in/']) {
      const r = runScript(dispatch, `https://pricesniffs.space${href}`);
      expect(r.replaced, href).toBeNull();
      expect(r.fetchStubbed, href).toBe(false);
    }
    expect(runScript(dispatch, 'https://pricesniffs.space/uk/deals?a=b').replaced).toBe('/deals?a=b');
    expect(runScript(dispatch, 'https://pricesniffs.space/uk').replaced).toBe('/');
    // With no live region but the UK, only the /uk/ rule is left.
    expect(runScript(regionDispatchScript([]), 'https://pricesniffs.space/us/creed_aventus_100ml').replaced).toBeNull();
  });

  it('puts the address back on the region\'s page, and only an address inside the region', () => {
    const restore = regionRestoreScript('us');
    const to = '/us/creed_aventus_100ml?x=1#top';
    expect(runScript(restore, `https://pricesniffs.space/us/?${REGION_PATH_PARAM}=${encodeURIComponent(to)}`).state).toBe(to);
    expect(runScript(restore, `https://pricesniffs.space/us/?${REGION_PATH_PARAM}=${encodeURIComponent('//evil.example/x')}`).state).toBeNull();
    expect(runScript(restore, `https://pricesniffs.space/us/?${REGION_PATH_PARAM}=${encodeURIComponent('/in/x_y_100ml')}`).state).toBeNull();
    expect(runScript(restore, 'https://pricesniffs.space/us/deals').state).toBeNull();
  });

  it('writes region paths and region templates, the UK\'s unchanged', () => {
    expect(regionFilePath(US, 'data/catalogue.0123456789abcdef.json')).toBe('us/data/catalogue.0123456789abcdef.json');
    expect(regionFilePath(GB, 'data/x.json')).toBe('data/x.json');
    const template = '<a href="/deals">Deals</a><a href="https://x.example/">x</a><h1 class="t-page" id="static-intro-title">Compare Fragrance Prices at UK Shops</h1>';
    expect(regionTemplate(template, GB)).toBe(template);
    const us = regionTemplate(template, US);
    expect(us).toContain('<a href="/us/deals">');
    expect(us).toContain('href="https://x.example/"');
    expect(us).toContain('Compare Fragrance Prices at US Shops');
    expect(regionTemplate(template, IN)).toContain('Compare Fragrance Prices at Indian Shops');
  });
});

describe.skipIf(!built)('the built region pages', () => {
  const uk = read('index.html');

  it('builds both regions: a page and its deep link copy each, from the same build as the UK page', () => {
    expect(liveRegions().map((r) => r.id)).toEqual(['GB', 'US', 'IN']);
    for (const r of REGIONS) {
      const page = read(`${r.pathPrefix}/index.html`);
      expect(read(`${r.pathPrefix}/404.html`), r.id).toBe(page);
      expect(readStampedHash(page), r.id).toBe(readStampedHash(uk));
      expect(page, r.id).toContain(`<html lang="${r.locale}">`);
      expect(page, r.id).toContain(`<link rel="canonical" href="${SITE_URL}/${r.pathPrefix}/" />`);
      expect(page, r.id).toContain(`<script>${regionRestoreScript(r.pathPrefix)}</script>`);
      expect(page, r.id).not.toContain('__psRegionDocument');
      // Its own data, in its own folder, every file there.
      const files = referencedDataFiles(page);
      expect(files.length, r.id).toBeGreaterThanOrEqual(5);
      for (const f of files) {
        expect(page, f).toContain(`"${r.pathPrefix}/${f}"`);
        expect(existsSync(join(demo, r.pathPrefix, f)), `${r.pathPrefix}/${f}`).toBe(true);
      }
      expect(page).toContain(`<link rel="manifest" href="/manifest.webmanifest" />`);
    }
  });

  it('keeps the UK page on its own data, plus the regions lookup, and hands region deep links on', () => {
    const files = referencedDataFiles(uk);
    expect(files.every((f) => existsSync(join(demo, f))), 'every UK data file is in demo/data').toBe(true);
    expect(uk).not.toMatch(/"(us|in)\/data\//);
    expect(files.some((f) => f.startsWith('data/regions.'))).toBe(true);
    expect(uk).toContain(`<script>${regionDispatchScript(['us', 'in'])}</script>`);
    expect(read('404.html')).toBe(uk);
  });

  it('writes a route page for each fixed address inside each region, with the region\'s tags', () => {
    const pages = regionPagesToWrite();
    for (const r of REGIONS) {
      const mine = pages.filter((p) => p.shell === `${r.pathPrefix}/index.html`);
      expect(mine.map((p) => p.path), r.id).toEqual(expect.arrayContaining([`/${r.pathPrefix}/deals`, `/${r.pathPrefix}/about/legal`, `/${r.pathPrefix}/brands`]));
      for (const p of mine) {
        const html = read(p.file);
        expect(html, p.file).toContain(`<link rel="canonical" href="${SITE_URL}${p.path}" />`);
        expect(html, p.file).toContain(`<html lang="${r.locale}">`);
      }
    }
    // hreflang on a page every country has, in its head, both ways.
    expect(read('deals.html')).toContain(`<link rel="alternate" hreflang="en-US" href="${SITE_URL}/us/deals" />`);
    expect(read('us/deals.html')).toContain(`<link rel="alternate" hreflang="en-GB" href="${SITE_URL}/deals" />`);
    expect(read('us/deals.html')).toContain(`<link rel="alternate" hreflang="x-default" href="${SITE_URL}/deals" />`);
    // The beta regions' empty Notes tab: noindex, and the UK's declares no alternates.
    expect(read('us/notes.html')).toContain('<meta name="robots" content="noindex, follow" />');
    expect(read('notes.html')).not.toContain('hreflang="en-US"');
  });

  it('shows no shop photo for a US or Indian product, and lists only that region\'s shops', () => {
    for (const r of REGIONS) {
      const catalogueFile = referencedDataFiles(read(`${r.pathPrefix}/index.html`)).find((f) => f.startsWith('data/catalogue.'))!;
      const blobs = JSON.parse(read(`${r.pathPrefix}/${catalogueFile}`)) as unknown[];
      const products = blobs.find((b): b is { id: string; image: unknown }[] => Array.isArray(b) && b.length > 100 && typeof (b[0] as { slug?: unknown })?.slug === 'string')!;
      expect(products.length, r.id).toBeGreaterThan(1000);
      expect(products.filter((p) => p.image !== null).length, `${r.id} products with a photo`).toBe(0);
      const crawled = blobs.find((b): b is Record<string, { imageUrl: unknown; retailerId: string }[]> => !!b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length > 1000)!;
      const offers = Object.values(crawled).flat();
      expect(offers.filter((o) => o.imageUrl !== null).length, `${r.id} offers with a photo`).toBe(0);
      const shops = new Set(offers.map((o) => o.retailerId));
      for (const ukShop of ['lookfantastic', 'boots', 'notino', 'escentual']) expect(shops.has(ukShop), `${ukShop} on the ${r.id} page`).toBe(false);
      // The page's own registry is the region's: no UK shop's domain in its code.
      const page = read(`${r.pathPrefix}/index.html`);
      expect(page, r.id).not.toContain('lookfantastic.com');
    }
  });
});

describe.skipIf(!built)('the sitemaps', () => {
  const index = read('sitemap.xml');
  const gb = read('sitemap-gb.xml');

  it('are an index of one sitemap per region, which robots.txt names', () => {
    const locs = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(index).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(locs).toEqual([`${SITE_URL}/sitemap-gb.xml`, `${SITE_URL}/sitemap-us.xml`, `${SITE_URL}/sitemap-in.xml`]);
    for (const f of ['sitemap-gb.xml', 'sitemap-us.xml', 'sitemap-in.xml']) expect(existsSync(join(demo, f)), f).toBe(true);
    expect(read('robots.txt')).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it('list each region\'s addresses inside its prefix, under the 50,000 limit', () => {
    for (const r of REGIONS) {
      const xml = read(`sitemap-${r.pathPrefix}.xml`);
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
      expect(locs.length, r.id).toBeGreaterThan(1000);
      expect(locs.length, r.id).toBeLessThanOrEqual(50_000);
      expect(locs.every((l) => l.startsWith(`${SITE_URL}/${r.pathPrefix}/`)), r.id).toBe(true);
      expect(locs, r.id).toContain(`${SITE_URL}/${r.pathPrefix}/`);
      expect(locs, r.id).not.toContain(`${SITE_URL}/${r.pathPrefix}/notes`);
    }
    expect([...gb.matchAll(/<loc>([^<]+)<\/loc>/g)].every((m) => !/^https:\/\/[^/]+\/(us|in)\//.test(m[1]!))).toBe(true);
  });

  it('carry hreflang alternates where a page exists in more than one region, x-default the UK page', () => {
    expect(gb).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    const home = /<url><loc>https:\/\/pricesniffs\.space\/<\/loc>.*?<\/url>/.exec(gb)![0];
    for (const h of ['en-GB', 'en-US', 'en-IN', 'x-default']) expect(home, h).toContain(`hreflang="${h}"`);
    // A product the US also sells, by its UK address: its US address beside it.
    const shared = /<url><loc>https:\/\/pricesniffs\.space\/([a-z0-9_]+)<\/loc>[^\n]*hreflang="en-US" href="https:\/\/pricesniffs\.space\/us\/([a-z0-9_]+)"/.exec(gb);
    expect(shared, 'a UK product with a US alternate').not.toBeNull();
    // A shop's page is its region's alone.
    const shop = /<url><loc>https:\/\/pricesniffs\.space\/retailers\/[^<]+<\/loc>[^\n]*<\/url>/.exec(gb)![0];
    expect(shop).not.toContain('hreflang');
  });
});
