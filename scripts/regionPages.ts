/**
 * The pure pieces of publishing the region pages (/us/ and /in/; public beta
 * since 9 October 2026, docs/INTERNATIONAL-PLAN.md "Public beta, 9 October
 * 2026: what shipped"), shared by scripts/build-demo.ts,
 * scripts/build-route-pages.ts, scripts/build-sitemap.ts and the tests.
 *
 * ── Where a region's page lives ─────────────────────────────────────────────
 *   demo/<r>/index.html     /us/ and /in/: the region's own page (its bundle,
 *                           its data files, its head)
 *   demo/<r>/404.html       the same document, for the deep links below
 *   demo/<r>/data/          its content hashed data files
 *   demo/<r>/<route>.html   a page of its own for each fixed address (/us/deals)
 *
 * ── Deep links ──────────────────────────────────────────────────────────────
 * GitHub Pages answers every address that is not a file with the one
 * demo/404.html at the root, the UK page. A product address under a region
 * (/us/creed_aventus_100ml) is such an address. So the UK document carries a
 * small script, first in its head (regionDispatchScript), that sees a live
 * region's prefix, keeps the UK page from fetching any of its data, and hands
 * the address to the region's own page (/us/?ps_path=...), whose first script
 * (regionRestoreScript) puts the address back before the app reads it: the
 * region's app then routes it as the UK app routes a UK deep link. (Writing
 * the region's document in place was tried first: a stopped document ignores
 * document.write, by the HTML standard.) It also sends /uk/<anything> to
 * /<anything> (plan section 2: no /uk/ prefix exists). A region's own
 * document never carries it, so it cannot loop.
 */
import type { RegionConfig } from '../src/config/regions.js';

/** The lazy data file holding what a page knows of the other regions (scripts/regionSite.ts RegionLinks). */
export const REGION_LINKS_FILE = 'regions';

/**
 * The first script of the UK document. `prefixes` are the live regions' (us,
 * in). Plain ES5 so it runs before anything else on any browser.
 */
export function regionDispatchScript(prefixes: readonly string[]): string {
  const alt = prefixes.filter((p) => /^[a-z]{2}$/.test(p)).join('|');
  return `(function () {
  var path = location.pathname;
  var uk = /^\\/uk(\\/.*)?$/.exec(path);
  if (uk) { location.replace((uk[1] || '/') + location.search + location.hash); return; }${alt ? `
  var m = /^\\/(${alt})(\\/.*)?$/.exec(path);
  if (!m || !m[2] || m[2] === '/') return;
  window.__psRegionDocument = m[1];
  // The UK page must not load its data on its way out: every fetch from here
  // on waits for ever, so the loader below starts nothing and the app never runs.
  window.fetch = function () { return new Promise(function () {}); };
  location.replace('/' + m[1] + '/?${REGION_PATH_PARAM}=' + encodeURIComponent(path + location.search + location.hash));` : ''}
})();`;
}

/** The query parameter the hand off carries the deep link's address in. */
export const REGION_PATH_PARAM = 'ps_path';

/**
 * The first script of a region's document: puts back the address of the deep
 * link the UK document handed over (regionDispatchScript), before the app reads
 * it, so the address bar and the router see /us/creed_aventus_100ml again. Only
 * an address inside the region is put back.
 */
export function regionRestoreScript(prefix: string): string {
  return `(function () {
  var m = /[?&]${REGION_PATH_PARAM}=([^&#]*)/.exec(location.search);
  if (!m) return;
  try {
    var to = decodeURIComponent(m[1]);
    if (to.indexOf('/${prefix}/') === 0) history.replaceState(null, '', to);
  } catch (e) {}
})();`;
}

/** A path inside a region's folder, relative to the site root: us/data/catalogue.<hash>.json. */
export function regionFilePath(region: RegionConfig, path: string): string {
  return region.pathPrefix === '' ? path : `${region.pathPrefix}/${path}`;
}

/**
 * The page template for a region: every root address in it (the footer's
 * links, written by demo/footerLinks.ts) moved inside the region, so a crawler
 * or a link opened in a new tab stays on the region's pages. The UK's
 * template comes back unchanged. Run on the template only, before the bundle
 * goes in: the bundle's own strings are code.
 */
export function regionTemplate(template: string, region: RegionConfig): string {
  if (region.pathPrefix === '') return template;
  const adj = region.shopsAdjective;
  const word = region.delivery.word;
  return template
    .replace(/(\shref=")\/(?!\/)/g, `$1/${region.pathPrefix}/`)
    // The words a reader without the script sees first (.static-intro), in the region's terms.
    .replace('Compare Fragrance Prices at UK Shops', `Compare Fragrance Prices at ${adj} Shops`)
    .replace(
      'from different UK shops side by side, with prices in pounds and delivery included where the shop states it',
      `from different ${adj} shops side by side, with prices in ${region.currencyName} and ${word} included where the shop states it`,
    )
    .replace(
      /Some shop links are affiliate links: if you buy after following one, the shop may pay us a commission, at no extra cost to you\. It never changes the order of results\./,
      `No ${adj} shop pays us anything today, and no shop can pay for a place in the results. ${region.beta ? `${adj} prices are in beta: fewer shops than the UK site for now.` : ''}`.trim(),
    );
}
