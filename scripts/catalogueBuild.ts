/**
 * What the catalogue module is built from, and the record that lets any
 * checkout build it again byte for byte (since 2026-10-10).
 *
 * `demo/catalogue.generated.ts` (45 MB) and `demo/dormant.generated.ts` were
 * committed by every crawl until 10 October 2026, and the catalogue alone was a
 * third of the repository's history. They are now "deploy" files in
 * scripts/generated-files.txt: gitignored, and built from committed inputs
 * wherever they are read (the deploy, `npm test`, `npm run demo`, the region
 * crawls, the scripts that read prices). The crawl commits what they are built
 * from instead:
 *
 *   the data inputs  CATALOGUE_DATA_INPUTS below: the shops' snapshots, the
 *                    houses' snapshots, the photo findings, the note rules and
 *                    the two address memories (data/product-slugs.json,
 *                    data/id-aliases.json), which the build both reads and
 *                    writes
 *   the build record CATALOGUE_RECORD, data/catalogue-build.json: the moment
 *                    the build took as "now" (the NEW badge, the hide rule
 *                    and the photo choice depend on it) and the git blob id
 *                    of every data input as the build left them
 *
 * Two ways to run scripts/build-demo-catalogue.ts:
 *
 *   fresh   `npm run catalogue:demo` (the crawl, `npm run rebuild`). The clock
 *           is the real one; the memories may grow; writes the catalogue, the
 *           memories, data/set-match-report.json and the record.
 *   replay  `--replay` (scripts/ensure-catalogue-built.ts does this). The clock
 *           is the record's, the data inputs must be exactly the blobs the
 *           record names, and the memories are read only: a build that would
 *           add or change one address fails instead (assertMemoriesUnchanged).
 *           Writes the two modules only. Same code, same inputs, same clock:
 *           the same bytes as the fresh build that wrote the record.
 *
 * When the branch's data inputs are not the ones the record names (the crawl
 * commits harvested prices before it rebuilds, and a run can stop between the
 * two; a rebase can put the record on top of another workflow's newer photo
 * findings), the replay reads the recorded blobs from git into a scratch
 * folder (scripts/ensure-catalogue-built.ts): the catalogue the crawl built,
 * never one a later crawl could disagree with.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The build record, committed by the crawl beside the memories. */
export const CATALOGUE_RECORD = 'data/catalogue-build.json';

/** The modules the catalogue build writes, built where they are read, never committed. */
export const CATALOGUE_MODULES = ['demo/catalogue.generated.ts', 'demo/dormant.generated.ts'] as const;

/** The address memories: read and written by the fresh build, read only in a replay. */
export const CATALOGUE_MEMORIES = ['data/id-aliases.json', 'data/product-slugs.json'] as const;

/**
 * Every data file the catalogue build reads (a folder ends in /). Measured by
 * tracing the build's file reads on 2026-10-10; tests/catalogueBuild.test.ts
 * holds this list to the paths the build script names.
 */
export const CATALOGUE_DATA_INPUTS = [
  'data/catalogue/',
  'data/houses/',
  'data/better-photos.json',
  'data/image-box-verdicts.json',
  'data/note-aliases.json',
  'data/note-not-a-note.json',
  ...CATALOGUE_MEMORIES,
] as const;

/**
 * Source files outside src/ the build runs. With every file under src/ they
 * make the code fingerprint in a module's stamp, so a source change marks the
 * built modules stale.
 */
export const CATALOGUE_CODE_FILES = [
  'scripts/build-demo-catalogue.ts',
  'scripts/catalogueBuild.ts',
  'scripts/dataLiterals.ts',
  'scripts/generatedFiles.ts',
] as const;

export interface CatalogueRecord {
  note?: string;
  /** The build's clock, ISO 8601. */
  builtAt: string;
  /**
   * Every data input as the build left it: repository path to git blob id
   * (the id `git hash-object` gives), so a replay can take each file from any
   * commit that holds it, even when a rebase has put the record on top of
   * newer inputs.
   */
  files: Record<string, string>;
}

/** The env var that points a replay at a folder holding the data inputs (an extracted older commit). */
export const INPUT_ROOT_ENV = 'CATALOGUE_INPUT_ROOT';

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** The git blob id of some bytes, as `git hash-object` computes it. */
export function gitBlobId(content: string | Uint8Array): string {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function filesUnder(root: string, rel: string): string[] {
  const full = join(root, rel);
  if (!existsSync(full)) return [];
  const out: string[] = [];
  for (const name of readdirSync(full).sort()) {
    const child = `${rel}${name}`;
    if (statSync(join(root, child)).isDirectory()) out.push(...filesUnder(root, `${child}/`));
    else out.push(child);
  }
  return out;
}

/** The data input files present under `root`, repository-relative, sorted. */
export function catalogueInputFiles(root: string): string[] {
  const files: string[] = [];
  for (const input of CATALOGUE_DATA_INPUTS) {
    if (input.endsWith('/')) files.push(...filesUnder(root, input));
    else if (existsSync(join(root, input))) files.push(input);
  }
  return files.sort();
}

/**
 * Every data input under `root` with its blob id. `override` supplies a file's
 * content in place of what is on disk (the fresh build records the memories it
 * is about to write).
 */
export function currentInputs(root: string, override: Record<string, string> = {}): Record<string, string> {
  const files = new Set([...catalogueInputFiles(root), ...Object.keys(override)]);
  const out: Record<string, string> = {};
  for (const file of [...files].sort()) {
    out[file] = gitBlobId(Object.prototype.hasOwnProperty.call(override, file) ? override[file]! : readFileSync(join(root, file)));
  }
  return out;
}

/** `sha256:<hex>` of a set of inputs: one value for the stamp and the logs. */
export function inputsFingerprint(files: Record<string, string>): string {
  const lines = Object.keys(files).sort().map((f) => `${f}\0${files[f]}\n`);
  return `sha256:${sha256(lines.join(''))}`;
}

/** The paths whose blob differs between two input sets (or is in one only). */
export function inputsDiffer(a: Record<string, string>, b: Record<string, string>): string[] {
  const all = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...all].filter((f) => a[f] !== b[f]).sort();
}

/** `sha256:<hex>` over the build's own code: every file under src/ and CATALOGUE_CODE_FILES. */
export function codeFingerprint(root: string): string {
  const files = [...filesUnder(root, 'src/').filter((f) => f.endsWith('.ts')), ...CATALOGUE_CODE_FILES].sort();
  const h = createHash('sha256');
  for (const file of files) h.update(`${file}\0${sha256(readFileSync(join(root, file)))}\n`);
  return `sha256:${h.digest('hex')}`;
}

export function readRecord(root: string): CatalogueRecord | null {
  const path = join(root, CATALOGUE_RECORD);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readFileSync(path, 'utf8')) as CatalogueRecord;
  const filesOk =
    record.files !== null &&
    typeof record.files === 'object' &&
    Object.values(record.files).every((v) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v));
  if (typeof record.builtAt !== 'string' || Number.isNaN(Date.parse(record.builtAt)) || !filesOk) {
    throw new Error(`${CATALOGUE_RECORD} is malformed: it needs builtAt (an ISO date) and files (path to git blob id)`);
  }
  return record;
}

export function recordText(record: CatalogueRecord): string {
  const note =
    'Written by npm run catalogue:demo. The catalogue modules are built from exactly these data inputs (git blob ids), ' +
    'with this clock, wherever they are read (scripts/catalogueBuild.ts); never edit by hand.';
  const files: Record<string, string> = {};
  for (const f of Object.keys(record.files).sort()) files[f] = record.files[f]!;
  return `${JSON.stringify({ note, builtAt: record.builtAt, files }, null, 1)}\n`;
}

/**
 * The first line of each built module: the record it was built from and the
 * code that built it. scripts/ensure-catalogue-built.ts compares it with what
 * the checkout's record and source would give.
 */
export function stampLine(record: Pick<CatalogueRecord, 'builtAt' | 'files'>, code: string): string {
  return `// catalogue-build: ${record.builtAt} ${inputsFingerprint(record.files)} code ${code}`;
}

export function readStamp(path: string): string | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const first = text.slice(0, Math.max(0, text.indexOf('\n')));
  return first.startsWith('// catalogue-build: ') ? first : null;
}

/** Why the modules under `root` are not the replay of its record and source, or null when they are. */
export function catalogueStaleReason(root: string): string | null {
  const record = readRecord(root);
  if (record === null) return `${CATALOGUE_RECORD} is missing`;
  const want = stampLine(record, codeFingerprint(root));
  for (const module of CATALOGUE_MODULES) {
    const stamp = readStamp(join(root, module));
    if (stamp === null) return `${module} is not built (it is built where it is read, not committed)`;
    if (stamp !== want) return `${module} was built from another build record or other source`;
  }
  return null;
}

/**
 * The replay's guard on addresses: the memories a replay computes must be the
 * ones on disk, byte for byte. A replay never writes them, so a difference
 * means this checkout's code or inputs would publish an address the crawl has
 * not recorded, which the next crawl could give differently. Throws, naming
 * the files.
 */
export function assertMemoriesUnchanged(inputRoot: string, computed: Record<string, string>): void {
  const changed = Object.entries(computed)
    .filter(([file, text]) => !existsSync(join(inputRoot, file)) || readFileSync(join(inputRoot, file), 'utf8') !== text)
    .map(([file]) => file);
  if (changed.length > 0) {
    throw new Error(
      `catalogue replay refused: it would change ${changed.join(' and ')}, which only the crawl's fresh build ` +
        '(npm run catalogue:demo) may write, append only. Published addresses must be the ones the crawl recorded. ' +
        'Run `npm run rebuild` and commit the memories and data/catalogue-build.json with the change that caused this ' +
        '(CLAUDE.md, generated files rule 3).',
    );
  }
}

/** The folder a build reads its data inputs from: CATALOGUE_INPUT_ROOT when set, else the repository. */
export function inputRoot(root: string): string {
  const env = process.env[INPUT_ROOT_ENV];
  return env ? resolve(env) : root;
}
