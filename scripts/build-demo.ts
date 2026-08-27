/**
 * Builds the demo page.
 *
 * The point of this pipeline is that the demo runs the *real* modules: `src/`
 * is compiled and bundled unchanged, then inlined. There is no second
 * implementation of the pricing rules to fall out of sync.
 *
 *   tsc -p tsconfig.demo.json   →  dist-demo/**.js
 *   esbuild dist-demo/demo/app.js --bundle  →  dist-demo/bundle.js
 *   this script                 →  demo/index.html + dist-demo/artifact.html
 *
 * Two outputs, same body:
 *   - `demo/index.html`      a standalone document you can open from disk
 *   - `dist-demo/artifact.html`  body only, for the hosted artifact wrapper
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Computed from source, before the bundle is inlined below, so this reflects
// what actually fed the build about to happen — not the bundle's own output,
// which esbuild's minifier makes no promise to reproduce byte-for-byte
// across otherwise-identical runs (see demoInputsHash.ts's header for why
// that rules out hashing the output instead).
const inputsHash = computeDemoInputsHash(root);

const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const bundle = readFileSync(resolve(root, 'dist-demo/bundle.js'), 'utf8');

if (!template.includes('/*__BUNDLE__*/')) {
  throw new Error('demo/template.html has no /*__BUNDLE__*/ placeholder to inject into');
}

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
const body = template.replace('/*__BUNDLE__*/', () => safeBundle);

mkdirSync(resolve(root, 'dist-demo'), { recursive: true });
writeFileSync(resolve(root, 'dist-demo/artifact.html'), body);

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

const standalone = `<!doctype html>
${demoBuildHashComment(inputsHash.hash)}
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
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
writeFileSync(resolve(root, 'demo/index.html'), standalone);

// GitHub Pages serves 404.html for any path that is not a real file, which is
// every in-app route: /brands, /fragrance/ean-123 and so on exist only inside
// the router. Writing the identical document there means such a request gets
// the app itself, and the router reads location.pathname on boot and renders
// the right view. Byte-identical on purpose — no redirect hop, no query-string
// relay, and no flash of a different page, because there is no server-rendered
// content that could differ between the two entry points.
writeFileSync(resolve(root, 'demo/404.html'), standalone);

console.log(`demo/index.html          ${(standalone.length / 1024).toFixed(1)} kB`);
console.log(`demo/404.html            ${(standalone.length / 1024).toFixed(1)} kB (deep-link fallback)`);
console.log(`dist-demo/artifact.html  ${(body.length / 1024).toFixed(1)} kB`);
console.log(`build-hash               sha256:${inputsHash.hash.slice(0, 12)}… (${inputsHash.files.length} input files)`);
