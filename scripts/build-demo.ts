/**
 * Builds the demo page.
 *
 * The point of this pipeline is that the demo runs the *real* modules: `src/`
 * is compiled and bundled unchanged, then inlined. There is no second
 * implementation of the pricing rules to fall out of sync.
 *
 *   tsc -p tsconfig.demo.json   →  dist-demo/**.js
 *   scripts/bundle-demo.ts      →  dist-demo/bundle.js + dist-demo/data.json
 *   this script                 →  demo/index.html, demo/404.html, demo/data.json
 *                                  + dist-demo/artifact.html, dist-demo/standalone.html
 *
 * See bundle-demo.ts for why the catalogue ships as JSON rather than as
 * JavaScript, and scripts/demoDataFile.ts for why the site's copy of that JSON
 * is a file of its own rather than a block inside the page.
 *
 * The outputs, all from the same template and bundle:
 *   - `demo/index.html`, `demo/404.html`  the site. A small loader in <head>
 *     fetches `demo/data.json` while the rest of the page parses, then runs
 *     the bundle. Code and data are one build: commit all three together.
 *   - `dist-demo/artifact.html`   body only, for the hosted artifact wrapper,
 *     with the data inline so it stays a single self-contained file.
 *   - `dist-demo/standalone.html`  a whole document with the data inline, for
 *     opening from disk. Browsers will not let a page opened from disk
 *     (file://) fetch the file beside it, so demo/index.html opened that way
 *     says so and points here.
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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDemoInputsHash, demoBuildHashComment } from './demoInputsHash.js';
import { dataFileContents, dataVersion, DATA_FILE } from './demoDataFile.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Computed from source, before the bundle is inlined below, so this reflects
// what actually fed the build about to happen — not the bundle's own output,
// which esbuild's minifier makes no promise to reproduce byte-for-byte
// across otherwise-identical runs (see demoInputsHash.ts's header for why
// that rules out hashing the output instead).
const inputsHash = computeDemoInputsHash(root);

const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const bundle = readFileSync(resolve(root, 'dist-demo/bundle.js'), 'utf8');
const data = readFileSync(resolve(root, 'dist-demo/data.json'), 'utf8');

const BUNDLE_TAG = '<script>/*__BUNDLE__*/</script>';
if (!template.includes(BUNDLE_TAG)) {
  throw new Error(`demo/template.html has no ${BUNDLE_TAG} placeholder to inject into`);
}

// Every "<" escaped, which JSON allows inside a string and which is the only
// way a value could close the block early or open an HTML comment in it.
const safeData = data.replace(/</g, '\\u003c');
const version = dataVersion(data);

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
const inlineBody = template.replace(
  BUNDLE_TAG,
  () => `<script type="application/json" id="ps-data">${safeData}</script>\n<script>${safeBundle}</script>`,
);
// The site's copy: the bundle is declared rather than run, and the loader in
// <head> calls it once the data is in. A function body is only pre-parsed
// until then, so declaring it costs the parse of the code alone. The newline
// before the closing brace keeps a trailing line comment from swallowing it.
const loadedBody = template.replace(BUNDLE_TAG, () => `<script>function __psBoot(){${safeBundle}\n}</script>`);

mkdirSync(resolve(root, 'dist-demo'), { recursive: true });
writeFileSync(resolve(root, 'dist-demo/artifact.html'), inlineBody);

// Runs in <head>, as early as possible, so the download overlaps everything
// else the browser has to do with the page. Three things it has to get right:
//
//   - Where the file is. Every deep link (/brands, /fragrance/ean-123) is
//     served 404.html at that path, so a relative "data.json" would point
//     into a directory that does not exist. The base is worked out the way
//     demo/router.ts's basePath() does it: the site root, or whatever comes
//     before /index.html.
//   - That it is this build's data. The version is in the URL, so every cache
//     between here and GitHub Pages keeps each build's data apart, and in the
//     file, so a page from one build never runs on another build's data (see
//     demoDataFile.ts). A page and file that disagree mean this page is the
//     stale one, which a reload fixes; it reloads once, then says so.
//   - When to run the bundle: once the data is parsed and the document has
//     finished parsing. demo/app.ts started at DOMContentLoaded when the
//     bundle was inline, so it starts against the same finished document now.
//     window.__psReady is set once it has, and window.__psBootError if it
//     could not, for scripts and tests that drive the page: the "load" event
//     does not wait for a fetch, so it no longer means the app is up.
//
// The data URL is written as one string so the version sits right after
// "data.json?v=", where readPageDataVersion() and demo/sw.js look for it.
const LOADER = `(function(){
var u="data.json?v=${version}",v=u.slice(-16),p=location.pathname,i=p.indexOf("/index.html");
var data=fetch((i<0?"/":p.slice(0,i+1))+u).then(function(r){
if(!r.ok)throw new Error("data.json: HTTP "+r.status);return r.json()
}).then(function(j){
if(!j||j.v!==v){var e=new Error("data.json is version "+(j&&j.v)+", this page needs "+v);e.stale=true;throw e}
return j.d});
data.catch(function(){});
var parsed=document.readyState==="loading"?new Promise(function(r){document.addEventListener("DOMContentLoaded",r)}):null;
Promise.all([data,parsed]).then(function(a){
window.__psLoadedData=a[0];
try{__psBoot()}catch(e){window.__psBootError=String(e);throw e}
window.__psReady=true
},function(e){
window.__psBootError=String(e&&e.message||e);
if(e&&e.stale){try{if(sessionStorage.getItem("ps-data-reload")!==v){sessionStorage.setItem("ps-data-reload",v);location.reload();return}}catch(_){}}
var msg=location.protocol==="file:"
?"This copy of PriceSniffs was opened from disk, where the browser will not let it read its price data. Open dist-demo/standalone.html instead, which carries its data inside it."
:e&&e.stale?"PriceSniffs has just been updated. Reload the page to see the latest prices."
:"PriceSniffs could not load its prices. Check your connection and reload the page.";
var view=document.getElementById("view"),note=document.createElement("p");
note.className="empty-note";note.textContent=msg;
if(view)view.replaceChildren(note);else document.body.appendChild(note)
})})();`;

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
const SITE_URL = 'https://pricesniffs.space';
const OG_DESCRIPTION = 'Compare real UK fragrance prices across every retailer that stocks them. No invented numbers.';

const documentFor = (body: string, loader: string) => `<!doctype html>
${demoBuildHashComment(inputsHash.hash)}
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${loader}<meta name="theme-color" content="#131013" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#FFFFFF" media="(prefers-color-scheme: light)" />
<link rel="manifest" href="manifest.webmanifest" />
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png" />
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="PriceSniffs" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="description" content="${OG_DESCRIPTION}" />
<link rel="canonical" href="${SITE_URL}/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="PriceSniffs" />
<meta property="og:title" content="PriceSniffs: compare fragrance prices across UK retailers" />
<meta property="og:description" content="${OG_DESCRIPTION}" />
<meta property="og:url" content="${SITE_URL}/" />
<meta property="og:image" content="${SITE_URL}/og-preview.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="PriceSniffs: compare fragrance prices across UK retailers" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="PriceSniffs: compare fragrance prices across UK retailers" />
<meta name="twitter:description" content="${OG_DESCRIPTION}" />
<meta name="twitter:image" content="${SITE_URL}/og-preview.png" />
${body}
</html>
`;
const site = documentFor(loadedBody, `<script>${LOADER}</script>\n`);
const standalone = documentFor(inlineBody, '');

// Data first, then the pages that load it. A build cut off between the two
// leaves a data file the committed pages do not ask for, which
// scripts/check-demo-freshness.ts and tests/demoBuildFreshness.test.ts both
// refuse, rather than a page asking for data that is not there yet.
const dataFile = dataFileContents(data);
writeFileSync(resolve(root, DATA_FILE), dataFile);
writeFileSync(resolve(root, 'demo/index.html'), site);
writeFileSync(resolve(root, 'dist-demo/standalone.html'), standalone);

// GitHub Pages serves 404.html for any path that is not a real file, which is
// every in-app route: /brands, /fragrance/ean-123 and so on exist only inside
// the router. Writing the identical document there means such a request gets
// the app itself, and the router reads location.pathname on boot and renders
// the right view. Byte-identical on purpose — no redirect hop, no query-string
// relay, and no flash of a different page, because there is no server-rendered
// content that could differ between the two entry points.
writeFileSync(resolve(root, 'demo/404.html'), site);

const kB = (text: string) => `${(Buffer.byteLength(text) / 1024).toFixed(1)} kB`;
console.log(`demo/index.html             ${kB(site)}`);
console.log(`demo/404.html               ${kB(site)} (deep-link fallback)`);
console.log(`demo/data.json              ${kB(dataFile)} (data version ${version})`);
console.log(`dist-demo/artifact.html     ${kB(inlineBody)}`);
console.log(`dist-demo/standalone.html   ${kB(standalone)} (opens from disk)`);
console.log(`build-hash                  sha256:${inputsHash.hash.slice(0, 12)}… (${inputsHash.files.length} input files)`);
