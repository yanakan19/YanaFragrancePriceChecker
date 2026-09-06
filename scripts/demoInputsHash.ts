/**
 * Fingerprints the source files that `npm run demo` reads to produce
 * `demo/index.html` and `demo/404.html`.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `demo/index.html` and `demo/404.html` are not source, they are a build
 * artefact — `scripts/build-demo.ts` inlines a bundle of every file
 * `tsconfig.demo.json` compiles (`src/**\/*.ts` and `demo/**\/*.ts`, minus the
 * three node-only catalogue files it excludes) plus `demo/template.html`
 * into one document. Nothing in this repository re-derives that document
 * from its inputs and checks the two agree, so a commit that edits
 * `demo/app.ts` (or any other bundled file) without also running
 * `npm run demo` ships silently: `git diff` shows the source change, the
 * suite is green, and the deployed page still shows yesterday's markup.
 * That happened twice on 2026-08-26 — the second time, four user-facing
 * sentences existed only in source for the rest of the day — and every test
 * passed both times, because nothing was comparing the built page against
 * the source it claims to represent.
 *
 * This module is the "what are the inputs, precisely" half of the fix. It is
 * used two ways:
 *
 *   - `scripts/build-demo.ts` calls it to stamp the hash of *this build's*
 *     inputs into the document it writes.
 *   - `tests/demoBuildFreshness.test.ts` calls it again, against the source
 *     tree as it stands right now, and fails if that does not match the
 *     hash stamped into the committed `demo/index.html`. A stale rebuild is
 *     exactly a mismatch between "what the file says it was built from" and
 *     "what is actually on disk".
 *
 * That test runs inside the default, non-watch `npx vitest run` — the same
 * command this repository already requires before every commit — rather
 * than as a separate CI-only gate. Hashing ~100 small text files takes low
 * single-digit milliseconds; it is not the same cost as the ~1-2 minute
 * `tsc` + `esbuild` rebuild `npm run demo` itself performs, and does not
 * need to be, because it never re-runs the build. It only re-reads the
 * inputs and re-hashes them, which is what makes it cheap enough to belong
 * in a command every agent already runs several times per task, rather than
 * a CI step that would only fire after the stale page had already been
 * pushed (and, on the crawl schedule, already served).
 *
 * ── Why hash the inputs and not the output ────────────────────────────────
 * Hashing the ~15 MB built document itself would work too, but only by
 * accident of whoever's machine produced it: esbuild's minifier is not
 * contractually byte-stable across runs (module concatenation order,
 * whitespace, temporary identifiers), so two honest rebuilds from identical
 * source could disagree and manufacture a false failure. The inputs — plain
 * source text, read and hashed with no build step in between — have no such
 * freedom: the same files on disk always hash the same way.
 *
 * ── What is deliberately NOT covered ───────────────────────────────────────
 * The toolchain itself (the TypeScript and esbuild versions, the esbuild
 * flags in `package.json`'s `demo` script). A dependency bump can change the
 * bundle's *output* without changing any *input* this hash reads, and this
 * mechanism will not catch that. That is a real, narrower gap than "nobody
 * checks anything" and is not the failure this was built to catch — both
 * 2026-08-26 incidents were a source edit with no rebuild, not a toolchain
 * change with no rebuild — so it is left alone rather than folded in here
 * and made to look like the same problem.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Files `scripts/build-demo.ts` reads directly and inlines, beyond whatever
 * `tsconfig.demo.json` compiles into the bundle. Just the one placeholder
 * document today — see that script's `/*__BUNDLE__*\/` substitution.
 */
const EXTRA_INPUTS = ['demo/template.html'];

/**
 * Bundled inputs deliberately left OUT of the fingerprint.
 *
 * demo/testCount.generated.ts is written by scripts/testCountReporter.ts as a
 * side effect of the very `vitest run` that checks this fingerprint. That
 * makes it circular: the verifier's own output is one of the verifier's
 * inputs, and the verdict then depends on which of the two ran first inside
 * the same process. Run #397 (2026-09-05, f5a3f44e) is what that costs. A
 * commit added twelve tests, ran `npm run demo` (stamping a page built while
 * the file still said 1734), then ran the suite — which passed, because the
 * freshness test read the file before the reporter rewrote it to 1746 at the
 * end of the run — and committed both. On the runner the file said 1746 from
 * the start, the fingerprint differed, and "Test before crawling" failed:
 * the same red that had just been fixed, from the opposite direction, one
 * push later.
 *
 * Leaving it out means the About page's test count can be one rebuild
 * behind — until the next `npm run demo`, which every scheduled harvest
 * performs. That is a cosmetic lag on a number nobody's price depends on.
 * A harvest blocked by it is not. The reporter says so, loudly, whenever it
 * changes the number, so a local rebuild is one prompt away rather than a
 * rule to remember.
 */
const HASH_EXCLUDED_INPUTS = new Set(['demo/testCount.generated.ts']);

/** The handful of fields this reads out of tsconfig.demo.json. */
interface DemoTsConfigShape {
  include: string[];
  exclude?: string[];
}

/**
 * tsconfig.demo.json carries `//` explanatory comments (see its own header),
 * which makes it JSONC, not JSON — `JSON.parse` rejects it outright. Every
 * comment in that file sits alone on its own line, so stripping any line
 * whose first non-blank character is `//` is exact for this file without
 * reaching for a full JSONC parser to read four fields.
 */
function readDemoTsConfig(root: string): DemoTsConfigShape {
  const raw = readFileSync(join(root, 'tsconfig.demo.json'), 'utf8');
  const withoutComments = raw.replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(withoutComments) as DemoTsConfigShape;
}

/** Every file with extension `ext` under `dir` (root-relative, forward-slash,
 *  e.g. `src/config/retailers.ts`), recursing into subdirectories only when
 *  `recursive` is set. */
function listFilesUnder(root: string, dir: string, ext: string, recursive: boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const relPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (recursive) found.push(...listFilesUnder(root, relPath, ext, recursive));
    } else if (entry.isFile() && relPath.endsWith(`.${ext}`)) {
      found.push(relPath);
    }
  }
  return found;
}

/** The two include shapes tsconfig.demo.json uses: `"<dir>/**\/*.ts"` (every
 *  TypeScript file under a tree) and `"<dir>/*.js"` (the plain-JavaScript
 *  Virtual Yanny engine in one directory, added 2026-09-06). Captures the
 *  directory, whether it recurses, and the extension. */
const INCLUDE_DIR_PATTERN = /^([\w./-]+?)\/(\*\*\/)?\*\.(ts|js)$/;

export interface DemoInputsHash {
  /** sha256, hex encoded, over every input file's path and content. */
  hash: string;
  /** Root-relative, sorted, for a readable diagnostic when hashes disagree. */
  files: string[];
}

/**
 * Recomputes the fingerprint of everything `npm run demo` currently reads.
 * `root` is the repository root (the directory containing `tsconfig.demo.json`).
 */
export function computeDemoInputsHash(root: string): DemoInputsHash {
  const config = readDemoTsConfig(root);

  const dirs: { dir: string; ext: string; recursive: boolean }[] = [];
  for (const pattern of config.include) {
    const match = INCLUDE_DIR_PATTERN.exec(pattern);
    // Loud and specific on purpose: a silent fallback here (e.g. "just skip
    // patterns we don't recognise") would quietly shrink what this hash
    // covers the next time someone reshapes tsconfig.demo.json's include
    // list, which is exactly the kind of unnoticed gap this file exists to
    // close elsewhere.
    if (!match) {
      throw new Error(
        `demoInputsHash: tsconfig.demo.json's include entry "${pattern}" is not the ` +
          '"<dir>/**/*.ts" or "<dir>/*.js" shape scripts/demoInputsHash.ts knows how to walk. Update the ' +
          'INCLUDE_DIR_PATTERN handling there to match, or files this pattern was meant to ' +
          'add will silently fall outside the freshness stamp.',
      );
    }
    dirs.push({ dir: match[1]!, ext: match[3]!, recursive: Boolean(match[2]) });
  }

  const excluded = new Set(config.exclude ?? []);
  const files = new Set<string>();
  for (const { dir, ext, recursive } of dirs) {
    for (const file of listFilesUnder(root, dir, ext, recursive)) {
      if (!excluded.has(file) && !HASH_EXCLUDED_INPUTS.has(file)) files.add(file);
    }
  }
  for (const extra of EXTRA_INPUTS) files.add(extra);

  const sortedFiles = [...files].sort();

  const digest = createHash('sha256');
  for (const file of sortedFiles) {
    // The path goes into the hash alongside the content: a file being added,
    // removed or renamed changes the input set even when every remaining
    // file's bytes are untouched, and that must move the hash too.
    digest.update(file);
    digest.update('\0');
    digest.update(readFileSync(join(root, file)));
    digest.update('\0');
  }

  return { hash: digest.digest('hex'), files: sortedFiles };
}

/**
 * The comment `scripts/build-demo.ts` writes into `demo/index.html` /
 * `demo/404.html`, and `tests/demoBuildFreshness.test.ts` reads back out.
 * Shared here so the two can never disagree about the format between them.
 */
export function demoBuildHashComment(hash: string): string {
  return (
    '<!-- demo-build-hash sha256:' +
    hash +
    ' — a fingerprint of the source this document was built from, ' +
    'written by scripts/build-demo.ts and checked by ' +
    'tests/demoBuildFreshness.test.ts. Do not hand-edit; run `npm run demo` instead. -->'
  );
}

/** Recovers the hash a previous `npm run demo` stamped into a built document, or `null`. */
export function readStampedHash(builtHtml: string): string | null {
  const match = /<!-- demo-build-hash sha256:([0-9a-f]{64})/.exec(builtHtml);
  return match ? match[1]! : null;
}
