/**
 * Bundles the demo app, moving its large data literals out of the JavaScript
 * and into JSON that scripts/build-demo.ts ships beside the page.
 *
 *   tsc -p tsconfig.demo.json  →  dist-demo/**.js
 *   this script                →  dist-demo/bundle.js + dist-demo/data.json
 *   scripts/build-demo.ts      →  demo/index.html + demo/data.json
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
 * reads entry n of the page's data, parsed once. Everything
 * else in those modules — the chunk spreads that join a literal back together,
 * the helper functions they export — stays as it was. A literal that is not
 * valid JSON is left as code: slower, never wrong.
 *
 * The generated .ts files are untouched, so every test that imports them reads
 * exactly the data it did before.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { moveLiteralsToJson } from './dataLiterals.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blobs: unknown[] = [];
const report: string[] = [];

/** Every compiled *.generated.js under `dir`, absolute, sorted. */
function generatedModules(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...generatedModules(path));
    else if (entry.name.endsWith('.generated.js')) found.push(path);
  }
  return found.sort();
}

// Transformed up front, in a fixed order, rather than as esbuild loads each
// module. esbuild loads modules in parallel, so collecting the literals in
// onLoad numbered them in whatever order the loads happened to finish: three
// different data files from six builds of identical source (2026-10-01, once
// there were four generated modules). The page does not mind, since each build
// is consistent with itself, but demo/data.json and its version would change
// on every rebuild, a 24MB diff in git for prices that had not moved.
const transformed = new Map<string, string>();
const loaded = new Set<string>();
for (const file of generatedModules(resolve(root, 'dist-demo'))) {
  const { code, moved } = moveLiteralsToJson(readFileSync(file, 'utf8'), blobs);
  transformed.set(file, code);
  if (moved.length) report.push(`${file.split('/').pop()}: ${moved.length} literal(s) moved`);
}

const dataAsJson: Plugin = {
  name: 'data-as-json',
  setup(b) {
    b.onLoad({ filter: /\.generated\.js$/ }, (args) => {
      const code = transformed.get(args.path);
      if (code === undefined) throw new Error(`${args.path} was not among the generated modules found under dist-demo/`);
      loaded.add(args.path);
      return { contents: code, loader: 'js' };
    });
  },
};

// demo/index.html fetches the data from demo/data.json and hands it over as
// window.__psLoadedData before it runs the bundle. The self-contained pages
// (dist-demo/artifact.html and dist-demo/standalone.html) carry it inline
// instead, in the block build-demo.ts writes ahead of the bundle's <script>,
// parsed once on the first lookup. See build-demo.ts for both.
const PRELUDE =
  'var __psData=(function(){var d;return function(i){' +
  'if(!d)d=window.__psLoadedData||JSON.parse(document.getElementById("ps-data").textContent);return d[i]}})();';

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

// A generated module the app does not import still has its literals in the
// data, unused. Harmless, but worth knowing about.
for (const [file, code] of transformed) {
  if (!loaded.has(file) && code.includes('__psData(')) console.warn(`${file}: not imported by the app, but its data is in data.json`);
}

await writeFile(resolve(root, 'dist-demo/data.json'), JSON.stringify(blobs));
const sizes = await Promise.all(['bundle.js', 'data.json'].map(async (f) => (await readFile(resolve(root, 'dist-demo', f))).length));
for (const line of report) console.log(line);
console.log(`dist-demo/bundle.js  ${(sizes[0]! / 1024 / 1024).toFixed(1)} MB code`);
console.log(`dist-demo/data.json  ${(sizes[1]! / 1024 / 1024).toFixed(1)} MB data`);
