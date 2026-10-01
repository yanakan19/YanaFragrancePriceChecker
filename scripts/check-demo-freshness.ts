/**
 * Answers one question for scripts/commit-and-push.sh: does the demo/index.html
 * on disk match the source on disk right now?
 *
 *   npx tsx scripts/check-demo-freshness.ts     # exit 0 fresh, 2 stale, 3 unstamped,
 *                                               # 4 names data files that are missing
 *
 * This is tests/demoBuildFreshness.test.ts's check, made callable from bash
 * without the test runner, so the commit script can refuse to push a page it
 * can prove is stale — the exact failure that wedged the branch from run #388
 * to #395 (2026-09-04/05): a rebuild step timed out before `npm run demo`
 * ran, and the commit step pushed a new demo/catalogue.generated.ts beside the
 * old page anyway. The test then caught it, as designed, on every subsequent
 * run, and because that test gates every harvest, none could start.
 *
 * Runs against the current working directory, which is where commit-and-push.sh
 * stages from. A directory with no tsconfig.demo.json is not a copy of this
 * app, and a caller there has nothing to check: exit 0 with a note, so the
 * script stays usable on any repository the way its own header promises.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeDemoInputsHash, readStampedHash } from './demoInputsHash.js';
import { referencedDataFiles } from './dataFiles.js';

const root = process.cwd();

if (!existsSync(join(root, 'tsconfig.demo.json')) || !existsSync(join(root, 'demo/index.html'))) {
  console.log('check-demo-freshness: no tsconfig.demo.json or demo/index.html here; nothing to check.');
  process.exit(0);
}

const page = readFileSync(join(root, 'demo/index.html'), 'utf8');
const stamped = readStampedHash(page);
if (stamped === null) {
  console.error('check-demo-freshness: demo/index.html carries no demo-build-hash stamp; run `npm run demo`.');
  process.exit(3);
}

const current = computeDemoInputsHash(root).hash;
if (stamped !== current) {
  console.error(
    `check-demo-freshness: demo/index.html is STALE — built from sha256:${stamped.slice(0, 12)}…, ` +
      `source on disk is sha256:${current.slice(0, 12)}…. Run \`npm run demo\` before committing it.`,
  );
  process.exit(2);
}

// The page's prices live in demo/data (scripts/build-demo.ts). A page whose
// stamp matches but whose data files are gone would deploy as a site with no
// prices, so that is refused too.
const missing = referencedDataFiles(page).filter((path) => !existsSync(join(root, 'demo', path)));
if (missing.length > 0) {
  console.error(
    `check-demo-freshness: demo/index.html names data file(s) that do not exist: ${missing.join(', ')}. ` +
      'Run `npm run demo` and commit demo/data with the page.',
  );
  process.exit(4);
}

console.log(`check-demo-freshness: demo/index.html is fresh (sha256:${current.slice(0, 12)}…).`);
