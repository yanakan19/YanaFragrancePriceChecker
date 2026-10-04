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
 * every data file it names exists. A missing sitemap counts as stale too.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { referencedDataFiles } from './dataFiles.js';
import { computeDemoInputsHash, readStampedHash } from './demoInputsHash.js';

/** Why the page on disk needs a build, or null when it is current. */
export function staleReason(root: string): string | null {
  const page = join(root, 'demo/index.html');
  if (!existsSync(page)) return 'demo/index.html is not built (it is built at deploy time, not committed)';
  const html = readFileSync(page, 'utf8');
  const stamped = readStampedHash(html);
  if (stamped === null) return 'demo/index.html carries no build stamp';
  if (stamped !== computeDemoInputsHash(root).hash) return 'demo/index.html was built from different source';
  const missing = referencedDataFiles(html).filter((p) => !existsSync(join(root, 'demo', p)));
  if (missing.length > 0) return `demo/index.html names data files that are missing: ${missing.join(', ')}`;
  for (const other of ['demo/404.html', 'demo/sitemap.xml']) {
    if (!existsSync(join(root, other))) return `${other} is not built`;
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
