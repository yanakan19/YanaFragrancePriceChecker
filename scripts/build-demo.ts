/**
 * Builds the demo page.
 *
 * The point of this pipeline is that the demo runs the *real* modules: `src/`
 * is compiled and bundled unchanged, then inlined. There is no second
 * implementation of the pricing rules to fall out of sync.
 *
 *   tsc -p tsconfig.demo.json   →  dist-demo/**.js
 *   scripts/bundle-demo.ts      →  dist-demo/bundle.js + dist-demo/data/*.json
 *   this script                 →  demo/index.html, demo/404.html,
 *                                  demo/data/<module>.<hash>.json
 *                                  + dist-demo/artifact.html
 *
 * The data is published as its own files, one per generated module, each
 * named for a hash of its content (scripts/dataFiles.ts), and fetched by a
 * small loader in <head> before the bundle runs: see bundle-demo.ts for why
 * the catalogue ships as JSON rather than as JavaScript, and why not inline.
 * demo/data/ belongs to this script: every file in it that this run did not
 * write is deleted, so yesterday's prices do not pile up in the repository.
 * Whoever commits demo/index.html must commit demo/data with it, deletions
 * included (`git add -A demo/data`); scripts/commit-and-push.sh does so.
 *
 * Two outputs, same body:
 *   - `demo/index.html`      the hosted page; it must be served over HTTP
 *                            (any static server, see scripts/a11y-audit.ts),
 *                            since a file:// page cannot fetch its data
 *   - `dist-demo/artifact.html`  body only, for the hosted artifact wrapper,
 *                            with the data inline so it stays one file
 *
 * Every run also stamps a fingerprint of its own inputs (see
 * scripts/demoInputsHash.ts) into the two committed documents.
 * tests/demoBuildFreshness.test.ts recomputes that fingerprint from the
 * source tree on every `vitest run` and fails if it disagrees with what is
 * stamped here — the check that this script itself was actually re-run
 * after `demo/app.ts`, `demo/template.html` or anything else it bundles last
 * changed. See that module's header for why: two commits shipped a stale
 * `demo/index.html` on 2026-08-26 with every test green, because nothing
 * compared the built page against the source it claims to represent.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDemoInputsHash, demoBuildHashComment } from './demoInputsHash.js';
import { writeGenerated } from './generatedFiles.js';
import {
  BLOBS_GLOBAL,
  LAZY_GLOBAL,
  READY_GLOBAL,
  bootScript,
  hashedDataPath,
  loaderScript,
  type DataFile,
  type DataManifest,
  type LazyDataFile,
} from './dataFiles.js';
import { adsTxt, verificationMeta } from '../demo/ads.js';
import { withFooterLinks } from '../demo/footerLinks.js';
import { readSiteBuild, siteHeadScript } from './siteBuild.js';
import {
  SITE_URL as HEAD_SITE_URL, SHARE_TITLE, SHARE_DESCRIPTION,
  OG_IMAGE_URL, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, OG_IMAGE_ALT,
} from '../demo/head.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Computed from source, before the bundle is inlined below, so this reflects
// what actually fed the build about to happen — not the bundle's own output,
// which esbuild's minifier makes no promise to reproduce byte-for-byte
// across otherwise-identical runs (see demoInputsHash.ts's header for why
// that rules out hashing the output instead).
const inputsHash = computeDemoInputsHash(root);

// The footer's links come from demo/footerLinks.ts, the one list, written in here.
const template = withFooterLinks(readFileSync(resolve(root, 'demo/template.html'), 'utf8'));
const bundle = readFileSync(resolve(root, 'dist-demo/bundle.js'), 'utf8');
const { groups, lazy } = JSON.parse(readFileSync(resolve(root, 'dist-demo/data-files.json'), 'utf8')) as DataManifest;

const BUNDLE_TAG = '<script>/*__BUNDLE__*/</script>';
if (!template.includes(BUNDLE_TAG)) {
  throw new Error(`demo/template.html has no ${BUNDLE_TAG} placeholder to inject into`);
}

// Publish each module's data under a name derived from its bytes, then clear
// out every file this run did not write: they are older builds' data, which
// nothing references any more (the service worker drops them from its own
// cache when it sees a page that no longer names them).
const dataDir = resolve(root, 'demo/data');
mkdirSync(dataDir, { recursive: true });
const dataFiles: DataFile[] = [];
const dataParts: string[] = [];
let expectedStart = 0;
for (const g of groups) {
  if (g.start !== expectedStart) throw new Error(`data-files.json leaves a gap before blob ${g.start}`);
  expectedStart = g.start + g.count;
  const content = readFileSync(resolve(root, `dist-demo/data/${g.name}.json`), 'utf8');
  const path = hashedDataPath(g.name, content);
  writeGenerated(root, `demo/${path}`, content);
  dataFiles.push({ path, start: g.start });
  dataParts.push(content.slice(1, -1));
}
// On-demand files (LAZY_DATA_MODULES in scripts/dataFiles.ts): published the
// same way, but the page only names them for the app to fetch later.
const lazyFiles: LazyDataFile[] = [];
const lazyInline: string[] = [];
for (const name of lazy) {
  const content = readFileSync(resolve(root, `dist-demo/data/${name}.json`), 'utf8');
  const path = hashedDataPath(name, content);
  writeGenerated(root, `demo/${path}`, content);
  lazyFiles.push({ name, path });
  lazyInline.push(`${JSON.stringify(name)}:${content}`);
}
const keep = new Set([...dataFiles, ...lazyFiles].map((f) => f.path.slice('data/'.length)));
const removed = readdirSync(dataDir).filter((f) => !keep.has(f));
for (const f of removed) rmSync(resolve(dataDir, f), { recursive: true, force: true });

// `</script>` inside the bundle would close the inline tag early.
const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>');
// A function replacer, not a string one: String.replace treats a string
// replacement's own `$&`, `$$`, `` $` ``, `$'` and `$<name>` as substitution
// patterns, and adding @supabase/supabase-js's minified code to the bundle
// was enough to make one of those turn up by coincidence inside otherwise
// ordinary library code — silently corrupting the inlined script into a
// syntax error no test in this repo could catch, since nothing here
// previously exercised a bundle large enough to hit one. A function
// replacer's return value is spliced in literally, with no such patterns
// recognised, which is what this always needed to be doing.
const body = template.replace(BUNDLE_TAG, () => `<script>${bootScript(safeBundle)}</script>`);

mkdirSync(resolve(root, 'dist-demo'), { recursive: true });
// The artifact wrapper hosts one file, so its copy carries the data inline,
// the way the page itself did before it was split out, on-demand data
// included (it is parsed when first asked for, as on the site). Every "<"
// escaped, which JSON allows inside a string and which is the only way a
// value could close the block early or open an HTML comment in it.
const inlineData = `[${dataParts.filter((p) => p.length > 0).join(',')}]`.replace(/</g, '\\u003c');
const inlineLazy = `{${lazyInline.join(',')}}`.replace(/</g, '\\u003c');
writeFileSync(
  resolve(root, 'dist-demo/artifact.html'),
  `<script type="application/json" id="ps-data">${inlineData}</script>\n` +
    `<script type="application/json" id="ps-lazy">${inlineLazy}</script>\n` +
    `<script>window.${BLOBS_GLOBAL}=JSON.parse(document.getElementById('ps-data').textContent);` +
    `window.${READY_GLOBAL}=Promise.resolve();` +
    `window.${LAZY_GLOBAL}=function(n){return Promise.resolve().then(function(){` +
    `var all=JSON.parse(document.getElementById('ps-lazy').textContent);` +
    `if(!Object.prototype.hasOwnProperty.call(all,n))throw new Error('no lazy data file named '+n);return all[n];});};</script>\n${body}`,
);

// Installable on iOS (Safari Share → Add to Home Screen) and Android (Chrome
// menu → Install app / Add to Home Screen) — both read a standard web
// manifest; iOS additionally wants its own meta tags and a PNG touch icon
// since Safari has never supported SVG there. See demo/manifest.webmanifest,
// demo/sw.js and scripts/generate-icons.ts.
// Every tag below is absolute, deliberately: Facebook's and Twitter's card
// scrapers resolve a relative og:image against their own fetch of the page,
// not against pricesniffs.space, and the classic silent failure here is a
// relative path that happens to work in a browser tab and produces nothing
// in a shared link. og-preview.png is generated straight from this homepage
// by scripts/generate-og-preview.ts, so it cannot drift from the real
// branding the way a hand-made image would.
const SITE_URL = HEAD_SITE_URL;

// The developer dashboard's switches (scripts/siteBuild.ts), right after the
// loader because it chains onto the loader's promise. Nothing at all while the
// counter is off and nothing is hidden, which is every build but the deploy's.
const siteScript = siteHeadScript(readSiteBuild(root));
const siteScriptTag = siteScript ? `<script>${siteScript}</script>\n` : '';
// The site wide default a shared link shows, and the home page's description:
// the owner's exact words (demo/head.ts).

const standalone = `<!doctype html>
${demoBuildHashComment(inputsHash.hash)}
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${verificationMeta()}
<meta name="theme-color" content="#131013" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)" />
<link rel="manifest" href="manifest.webmanifest" />
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png" />
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="PriceSniffs" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="description" content="${SHARE_DESCRIPTION}" />
<link rel="canonical" href="${SITE_URL}/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="PriceSniffs" />
<meta property="og:title" content="${SHARE_TITLE}" />
<meta property="og:description" content="${SHARE_DESCRIPTION}" />
<meta property="og:url" content="${SITE_URL}/" />
<meta property="og:image" content="${OG_IMAGE_URL}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />
<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />
<meta property="og:image:alt" content="${OG_IMAGE_ALT}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${SHARE_TITLE}" />
<meta name="twitter:description" content="${SHARE_DESCRIPTION}" />
<meta name="twitter:image" content="${OG_IMAGE_URL}" />
<meta name="twitter:image:alt" content="${OG_IMAGE_ALT}" />
<script>${loaderScript(dataFiles, lazyFiles)}</script>
${siteScriptTag}${body}
</html>
`;
writeGenerated(root, 'demo/index.html', standalone);

// GitHub Pages serves 404.html for any path that is not a real file, which is
// every in-app route: /brands, /fragrance/ean-123 and so on exist only inside
// the router. Writing the identical document there means such a request gets
// the app itself, and the router reads location.pathname on boot and renders
// the right view. Byte-identical on purpose — no redirect hop, no query-string
// relay, and no flash of a different page, because there is no server-rendered
// content that could differ between the two entry points.
writeGenerated(root, 'demo/404.html', standalone);

// /ads.txt, naming the AdSense account as the site's one authorised seller.
// Published from demo/ like robots.txt and CNAME (the Pages workflow uploads
// the whole folder, so demo/ads.txt is served at the site root). Written from
// ADSENSE_CLIENT in demo/ads.ts, and removed while that is blank, so the file
// never names an account the site does not have.
const adsTxtPath = resolve(root, 'demo/ads.txt');
const adsTxtBody = adsTxt();
if (adsTxtBody) writeGenerated(root, 'demo/ads.txt', adsTxtBody);
else if (existsSync(adsTxtPath)) rmSync(adsTxtPath);

console.log(`demo/index.html          ${(standalone.length / 1024).toFixed(1)} kB`);
console.log(`demo/404.html            ${(standalone.length / 1024).toFixed(1)} kB (deep-link fallback)`);
for (const f of [...dataFiles, ...lazyFiles]) {
  const onDemand = lazyFiles.includes(f as LazyDataFile) ? ' (on demand)' : '';
  console.log(`demo/${f.path.padEnd(38)} ${(readFileSync(resolve(root, 'demo', f.path)).length / 1024 / 1024).toFixed(1)} MB${onDemand}`);
}
if (removed.length) console.log(`demo/data                removed ${removed.length} superseded file(s)`);
console.log(`demo/ads.txt             ${adsTxtBody ? 'written' : 'none (no AdSense publisher id)'}`);
console.log(`dist-demo/artifact.html  ${(body.length / 1024).toFixed(1)} kB + inline data`);
console.log(`build-hash               sha256:${inputsHash.hash.slice(0, 12)}… (${inputsHash.files.length} input files)`);
