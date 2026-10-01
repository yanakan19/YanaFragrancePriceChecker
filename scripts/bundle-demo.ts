/**
 * Bundles the demo app, moving its large data literals out of the JavaScript
 * and into a JSON block scripts/build-demo.ts writes into the same page.
 *
 *   tsc -p tsconfig.demo.json  →  dist-demo/**.js
 *   this script                →  dist-demo/bundle.js + dist-demo/data.json
 *   scripts/build-demo.ts      →  demo/index.html (data block, then bundle)
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * The catalogue, its offers, the price history and the deals are written into
 * the *.generated.ts modules as object literals, ~20MB of them. Measured on
 * 2026-10-01 with the CPU slowed 4x to approximate a mid-range phone, the page
 * took about 6 seconds to show anything, 2 of which were the browser compiling
 * those literals as JavaScript. The same data as JSON is read by JSON.parse,
 * which does far less work per byte than the JavaScript parser — the reason V8's
 * own guidance is to ship large data that way.
 *
 * ── What it changes, and what it leaves alone ─────────────────────────────────
 * Only top-level `const`s in *.generated.js whose initializer is at least
 * MIN_BYTES long and is valid JSON. Each is replaced by `__psData(n)`, which
 * reads entry n of the page's JSON block, parsed once on first use. Everything
 * else in those modules — the chunk spreads that join a literal back together,
 * the helper functions they export — stays as it was. A literal that is not
 * valid JSON is left as code: slower, never wrong.
 *
 * The generated .ts files are untouched, so every test that imports them reads
 * exactly the data it did before.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { moveLiteralsToJson } from './dataLiterals.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blobs: unknown[] = [];
const report: string[] = [];

const dataAsJson: Plugin = {
  name: 'data-as-json',
  setup(b) {
    b.onLoad({ filter: /\.generated\.js$/ }, async (args) => {
      const { code, moved } = moveLiteralsToJson(await readFile(args.path, 'utf8'), blobs);
      if (moved.length) report.push(`${args.path.split('/').pop()}: ${moved.length} literal(s) moved`);
      return { contents: code, loader: 'js' };
    });
  },
};

// Parsed once, on the first lookup, from the block build-demo.ts writes ahead
// of the bundle's own <script>.
const PRELUDE =
  'var __psData=(function(){var d;return function(i){' +
  'if(!d)d=JSON.parse(document.getElementById("ps-data").textContent);return d[i]}})();';

await build({
  entryPoints: [resolve(root, 'dist-demo/demo/app.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  outfile: resolve(root, 'dist-demo/bundle.js'),
  banner: { js: PRELUDE },
  plugins: [dataAsJson],
  logLevel: 'warning',
});

await writeFile(resolve(root, 'dist-demo/data.json'), JSON.stringify(blobs));
const sizes = await Promise.all(['bundle.js', 'data.json'].map(async (f) => (await readFile(resolve(root, 'dist-demo', f))).length));
for (const line of report) console.log(line);
console.log(`dist-demo/bundle.js  ${(sizes[0]! / 1024 / 1024).toFixed(1)} MB code`);
console.log(`dist-demo/data.json  ${(sizes[1]! / 1024 / 1024).toFixed(1)} MB data`);
