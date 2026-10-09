/**
 * Builds the page with `npm run demo` unless the one on disk is already built
 * from the source on disk. `npm test` runs this first (the `pretest` script).
 *
 *   npx tsx scripts/ensure-demo-built.ts
 *
 * Since 2026-10-04 the page (demo/index.html, demo/404.html), its data files
 * (demo/data/), demo/sitemap.xml and demo/ads.txt are not committed: they are
 * "deploy" in scripts/generated-files.txt, built by
 * .github/workflows/deploy-pages.yml before every deployment. A fresh checkout
 * therefore has no page, and a dozen tests read it (the page's data files, the
 * sitemap, the browser checks). This makes `npm test` build it when it is
 * missing or stale, and costs nothing when it is current (the check hashes the
 * page's source files, milliseconds). Running vitest directly on one of those
 * tests needs `npm run demo` first.
 *
 * "Current" is the same test the deploy and tests/demoBuildFreshness.test.ts
 * apply: the page's stamp matches the source (scripts/demoInputsHash.ts) and
 * every data file it names exists. A missing sitemap, or a file in demo/data
 * the page does not name, counts as stale too.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { referencedDataFiles } from './dataFiles.js';
import { computeDemoInputsHash, readStampedHash } from './demoInputsHash.js';
import { liveRegions } from '../src/config/regions.js';

/** The live regions' folders under demo/ (us, in). */
const REGION_FOLDERS = liveRegions().map((r) => r.pathPrefix).filter((p) => p !== '');

/** Why the page on disk needs a build, or null when it is current. */
export function staleReason(root: string): string | null {
  const page = join(root, 'demo/index.html');
  if (!existsSync(page)) return 'demo/index.html is not built (it is built at deploy time, not committed)';
  const html = readFileSync(page, 'utf8');
  const stamped = readStampedHash(html);
  if (stamped === null) return 'demo/index.html carries no build stamp';
  if (stamped !== computeDemoInputsHash(root).hash) return 'demo/index.html was built from different source';
  const named = referencedDataFiles(html);
  const missing = named.filter((p) => !existsSync(join(root, 'demo', p)));
  if (missing.length > 0) return `demo/index.html names data files that are missing: ${missing.join(', ')}`;
  // Untracked, demo/data is no longer cleaned by git when a checkout or merge
  // brings another build's page; the build deletes what its page does not
  // name, and tests/demoDataFiles.test.ts holds the folder to that.
  const extra = readdirSync(join(root, 'demo/data')).filter((f) => !named.includes(`data/${f}`));
  if (extra.length > 0) return `demo/data holds files the page does not name: ${extra.join(', ')}`;
  for (const other of ['demo/404.html', 'demo/sitemap.xml', 'demo/sitemap-gb.xml', 'demo/about.html']) {
    if (!existsSync(join(root, other))) return `${other} is not built`;
  }
  // The region pages (public beta): each live region's page, from the same build.
  for (const prefix of REGION_FOLDERS) {
    for (const file of [`demo/${prefix}/index.html`, `demo/${prefix}/about.html`, `demo/sitemap-${prefix}.xml`]) {
      if (!existsSync(join(root, file))) return `${file} is not built`;
    }
    if (readStampedHash(readFileSync(join(root, `demo/${prefix}/index.html`), 'utf8')) !== stamped) {
      return `demo/${prefix}/index.html was built from different source than demo/index.html`;
    }
  }
  // The page of each fixed address (scripts/build-route-pages.ts) is written
  // last; one from an older build than the page means that step did not run.
  if (readStampedHash(readFileSync(join(root, 'demo/about.html'), 'utf8')) !== stamped) {
    return 'demo/about.html was built from different source than demo/index.html';
  }
  return null;
}

function main(): void {
  const root = process.cwd();
  if (!existsSync(join(root, 'tsconfig.demo.json'))) return;
  const reason = staleReason(root);
  if (reason === null) {
    console.log('ensure-demo-built: the page is current; not rebuilding.');
    return;
  }
  console.log(`ensure-demo-built: ${reason}. Running \`npm run demo\` (about a minute).`);
  const result = spawnSync('npm', ['run', 'demo'], { cwd: root, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
