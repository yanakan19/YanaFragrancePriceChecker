/**
 * Bundles the demo app, moving its large data literals out of the JavaScript
 * and into JSON files scripts/build-demo.ts publishes beside the page.
 *
 *   tsc -p tsconfig.demo.json  →  dist-demo/**.js
 *   this script                →  dist-demo/bundle.js + dist-demo/data/<module>.json
 *                                 + dist-demo/data-files.json (which blob is where)
 *   scripts/build-demo.ts      →  demo/index.html + demo/data/<module>.<hash>.json
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
 * The JSON then sat inline in the page, in a <script type="application/json">
 * block, until the next measurement the same day: the HTML parser still had to
 * tokenise all ~23MB of it (about 2.6s at 4x), and because the document is
 * network-first, every visit downloaded it again. It now ships as one file per
 * generated module, each named for a hash of its own content, so the service
 * worker can keep them forever (demo/sw.js) and a visit only downloads the
 * files whose content actually changed.
 *
 * ── What it changes, and what it leaves alone ─────────────────────────────────
 * Only top-level `const`s in *.generated.js whose initializer is at least
 * MIN_BYTES long and is valid JSON. Each is replaced by `__psData(n)`, which
 * reads entry n of the blobs the page's loader fetched before the bundle ran
 * (see scripts/dataFiles.ts). Everything else in those modules — the chunk
 * spreads that join a literal back together, the helper functions they
 * export — stays as it was. A literal that is not valid JSON is left as code:
 * slower, never wrong.
 *
 * Numbering is global across modules, and each module's literals are numbered
 * contiguously, so a file is fully described by its module and the index of its
 * first blob. esbuild loads modules concurrently, so the numbers are assigned
 * after the build, in module name order, by rewriting placeholders in the
 * bundle: the same data always gives the same bundle and loader list.
 *
 * ── Lazy modules ─────────────────────────────────────────────────────────────
 * A module in LAZY_DATA_MODULES (scripts/dataFiles.ts) is not bundled at all:
 * the app imports only its types and fetches its data when it needs it (see
 * demo/priceHistoryStore.ts). This script writes that file from the compiled
 * module's own exports, as `{ EXPORT_NAME: value, … }`, and fails the build
 * if the bundle imports the module anyway, which would quietly put its data
 * back in front of the first paint.
 *
 * The generated .ts files are untouched, so every test that imports them reads
 * exactly the data it did before.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type Plugin } from 'esbuild';
import { inlineShopTimes, moveLiteralsToJson, numberBlobs, placeholder, type LoadedModule } from './dataLiterals.js';
import { BLOBS_GLOBAL, LAZY_DATA_MODULES, type DataManifest } from './dataFiles.js';
import { pruneContext, pruneMovedBlobs, removedSets, resolveSiteBuild } from './siteBuild.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report: string[] = [];

// The developer dashboard's switches for this build (scripts/siteBuild.ts):
// whether the visitor counter is on, and the brands and shops the owner
// removed, which are left out of the data files below. Off, with nothing
// removed, for every build but the deploy's.
const site = await resolveSiteBuild(root);
const removed = removedSets(site);
const prune = pruneContext();

// Blob indexes are not known while esbuild loads modules: it loads them
// concurrently, so the order they finish reading in is not stable (two builds
// of the same data once swapped deals and fragranceLinks). Each module's
// literals are numbered from 0 here, as placeholders, and the final indexes
// are assigned after the build in module name order.
const loaded: LoadedModule[] = [];

const dataAsJson: Plugin = {
  name: 'data-as-json',
  setup(b) {
    b.onLoad({ filter: /\.generated\.js$/ }, async (args) => {
      const file = args.path.split('/').pop()!;
      const name = file.replace(/\.generated\.js$/, '');
      if (Object.hasOwn(LAZY_DATA_MODULES, name)) {
        throw new Error(
          `${name}.generated is loaded on demand (LAZY_DATA_MODULES in scripts/dataFiles.ts) ` +
            'but the bundle imports it. Import its types only (`import type`), and read its data through demo/priceHistoryStore.ts.',
        );
      }
      // inlineShopTimes: CRAWLED as one literal again, so the page's data file
      // is what it was before the module stored each shop's time once
      // (scripts/dataLiterals.ts). Any other module comes back unchanged.
      const source = inlineShopTimes(await readFile(args.path, 'utf8'));
      const local: unknown[] = [];
      const { code, moved } = moveLiteralsToJson(source, local, undefined, (k) => placeholder(name, k));
      if (moved.length) loaded.push({ name, blobs: local, moved });
      return { contents: code, loader: 'js' };
    });
  },
};

// The loader build-demo.ts writes into the page's <head> fetches the data
// files and sets this global before it runs the bundle at all, so every
// lookup is a plain array read.
const PRELUDE = `var __psData=function(i){return ${BLOBS_GLOBAL}[i]};`;

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

// Final numbering: modules in name order, each one's literals contiguous
// (numberBlobs, scripts/dataLiterals.ts).
const bundlePath = resolve(root, 'dist-demo/bundle.js');
const result = numberBlobs(loaded, await readFile(bundlePath, 'utf8'), (m, start, all) =>
  pruneMovedBlobs(m.name, m.moved, all, start, removed, prune),
);
const { blobs, groups } = result;
for (const m of result.modules) report.push(`${m.name}.generated.js: ${m.moved.length} literal(s) moved`);
await writeFile(bundlePath, result.bundle);
await rm(resolve(root, 'dist-demo/data'), { recursive: true, force: true });
await rm(resolve(root, 'dist-demo/data.json'), { force: true });
await mkdir(resolve(root, 'dist-demo/data'), { recursive: true });
for (const g of groups) {
  await writeFile(resolve(root, `dist-demo/data/${g.name}.json`), JSON.stringify(blobs.slice(g.start, g.start + g.count)));
}
// Lazy modules: the compiled module's own data exports, by name.
const lazy = Object.keys(LAZY_DATA_MODULES);
for (const name of lazy) {
  const mod = (await import(pathToFileURL(resolve(root, `dist-demo/demo/${name}.generated.js`)).href)) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const key of LAZY_DATA_MODULES[name]!) {
    if (mod[key] === undefined || typeof mod[key] === 'function') throw new Error(`${name}.generated has no data export ${key}`);
    data[key] = mod[key];
  }
  await writeFile(resolve(root, `dist-demo/data/${name}.json`), JSON.stringify(data));
  report.push(`${name}.generated.js: loaded on demand, not bundled`);
}
const manifest: DataManifest = { groups, lazy };
await writeFile(resolve(root, 'dist-demo/data-files.json'), JSON.stringify(manifest, null, 2));

for (const line of report) console.log(line);
console.log(
  `site switches         counter ${site.stats ? 'on' : 'off'}, ${site.overrides.length} hidden or removed (${site.source})` +
    (prune.dropped.products || prune.dropped.offers
      ? `; left out ${prune.dropped.products} product(s) and ${prune.dropped.offers} price(s) of removed brands and shops`
      : ''),
);
const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`dist-demo/bundle.js  ${mb((await readFile(resolve(root, 'dist-demo/bundle.js'))).length)} code`);
for (const name of [...groups.map((g) => g.name), ...lazy]) {
  const size = (await readFile(resolve(root, `dist-demo/data/${name}.json`))).length;
  console.log(`dist-demo/data/${name}.json  ${mb(size)} data${lazy.includes(name) ? ' (on demand)' : ''}`);
}
