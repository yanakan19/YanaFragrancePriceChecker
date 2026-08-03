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
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const bundle = readFileSync(resolve(root, 'dist-demo/bundle.js'), 'utf8');

if (!template.includes('/*__BUNDLE__*/')) {
  throw new Error('demo/template.html has no /*__BUNDLE__*/ placeholder to inject into');
}

// `</script>` inside the bundle would close the inline tag early.
const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>');
const body = template.replace('/*__BUNDLE__*/', safeBundle);

mkdirSync(resolve(root, 'dist-demo'), { recursive: true });
writeFileSync(resolve(root, 'dist-demo/artifact.html'), body);

// Installable on iOS (Safari Share → Add to Home Screen) and Android (Chrome
// menu → Install app / Add to Home Screen) — both read a standard web
// manifest; iOS additionally wants its own meta tags and a PNG touch icon
// since Safari has never supported SVG there. See demo/manifest.webmanifest,
// demo/sw.js and scripts/generate-icons.ts.
const standalone = `<!doctype html>
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
${body}
</html>
`;
writeFileSync(resolve(root, 'demo/index.html'), standalone);

console.log(`demo/index.html          ${(standalone.length / 1024).toFixed(1)} kB`);
console.log(`dist-demo/artifact.html  ${(body.length / 1024).toFixed(1)} kB`);
