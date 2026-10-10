// The catalogue modules are built where they are read, not committed
// (2026-10-10; scripts/catalogueBuild.ts). These hold the pieces that make a
// replay give the crawl's bytes and never a product address the crawl has not
// recorded. The replay itself takes about 45 seconds and is run by
// `npm test`'s pre step (scripts/ensure-demo-built.ts), the deploy and the
// region crawls; the byte for byte comparison with a fresh build is recorded
// in docs/OWNER-STEPS.md 7d.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertMemoriesUnchanged,
  catalogueStaleReason,
  codeFingerprint,
  gitBlobId,
  inputsDiffer,
  inputsFingerprint,
  readRecord,
  recordText,
  stampLine,
  CATALOGUE_DATA_INPUTS,
  CATALOGUE_MEMORIES,
  CATALOGUE_MODULES,
  CATALOGUE_RECORD,
} from '../scripts/catalogueBuild.js';
import { policyOf, REPO_ROOT } from '../scripts/generatedFiles.js';

const read = (p: string) => readFileSync(join(REPO_ROOT, p), 'utf8');
const build = read('scripts/build-demo-catalogue.ts');

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'catalogue-build-'));
  cleanup.push(dir);
  return dir;
}

describe('what the catalogue is built from', () => {
  it('names every data file the build reads, and the build reads its data only through the input root', () => {
    const read = [...build.matchAll(/resolve\(dataRoot, '(data\/[^']+)'\)/g)].map((m) => m[1]!);
    expect(read.length).toBeGreaterThanOrEqual(8);
    for (const path of read) {
      const covered = CATALOGUE_DATA_INPUTS.some((i) => (i.endsWith('/') ? `${path}/`.startsWith(i) : path === i));
      expect(covered, `${path} is read by the build but not in CATALOGUE_DATA_INPUTS`).toBe(true);
    }
    expect(build).not.toMatch(/resolve\(root, 'data\//);
    expect(build).toContain("const dir = resolve(dataRoot, 'data/catalogue');");
  });

  it('never reads its own last output: which ids were pages comes from the committed address memory', () => {
    // A replay must not depend on what an earlier step left on disk.
    expect(build).not.toMatch(/readFileSync\([^)]*(catalogue|dormant)\.generated/);
    expect(build).not.toContain('previousCatalogueFile');
    expect(build).toContain('const wasPage = new Set<string>(Object.keys(previousSlugs));');
  });

  it('a replay runs on the record\'s clock, checks the memories before writing anything, and writes no committed file', () => {
    expect(build).toContain('const now = replayRecord ? new Date(replayRecord.builtAt) : new Date();');
    const guard = build.indexOf('if (replayRecord) assertMemoriesUnchanged(dataRoot, memoriesAfter);');
    const firstWrite = build.indexOf("writeGenerated(root, 'demo/catalogue.generated.ts'");
    expect(guard).toBeGreaterThan(0);
    expect(firstWrite).toBeGreaterThan(guard);
    expect(build).toMatch(/if \(!replayRecord\) \{\n {2}writeGenerated\(root, 'data\/id-aliases\.json', idAliasesText\);\n {2}writeGenerated\(root, 'data\/product-slugs\.json', productSlugsText\);\n {2}writeGenerated\(root, CATALOGUE_RECORD, recordText\(buildRecord\)\);/);
    expect(build).toContain('if (setMatchReport && !replayRecord) {');
  });
});

describe('the replay guard on product addresses', () => {
  it('passes memories identical to the committed ones and refuses any difference, naming the file', () => {
    const dir = scratch();
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, 'data/product-slugs.json'), '{"slugs":{"a":"x_50ml"}}\n');
    writeFileSync(join(dir, 'data/id-aliases.json'), '{"aliases":{}}\n');
    const same = { 'data/product-slugs.json': '{"slugs":{"a":"x_50ml"}}\n', 'data/id-aliases.json': '{"aliases":{}}\n' };
    expect(() => assertMemoriesUnchanged(dir, same)).not.toThrow();
    // A new address the crawl has not recorded.
    expect(() => assertMemoriesUnchanged(dir, { ...same, 'data/product-slugs.json': '{"slugs":{"a":"x_50ml","b":"y_100ml"}}\n' }))
      .toThrow(/refused: it would change data\/product-slugs\.json/);
    expect(() => assertMemoriesUnchanged(dir, { ...same, 'data/id-aliases.json': '{"aliases":{"c":"a"}}\n' }))
      .toThrow(/data\/id-aliases\.json/);
    rmSync(join(dir, 'data/id-aliases.json'));
    expect(() => assertMemoriesUnchanged(dir, same)).toThrow(/data\/id-aliases\.json/);
  });

  it('the committed record names the committed address memories, so a deploy publishes the addresses the crawl recorded', () => {
    const record = readRecord(REPO_ROOT)!;
    expect(record).not.toBeNull();
    for (const memory of CATALOGUE_MEMORIES) {
      expect(record.files[memory], memory).toBe(gitBlobId(readFileSync(join(REPO_ROOT, memory))));
    }
    for (const path of Object.keys(record.files)) {
      expect(CATALOGUE_DATA_INPUTS.some((i) => (i.endsWith('/') ? path.startsWith(i) : path === i)), path).toBe(true);
    }
    expect(Object.keys(record.files).filter((p) => p.startsWith('data/catalogue/')).length).toBeGreaterThan(20);
  });
});

describe('the record and the stamp', () => {
  it('gives each file the blob id git gives it', () => {
    for (const p of ['data/note-aliases.json', 'package.json']) {
      const fromGit = execFileSync('git', ['hash-object', p], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
      expect(gitBlobId(readFileSync(join(REPO_ROOT, p))), p).toBe(fromGit);
    }
    expect(gitBlobId('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });

  it('fingerprints inputs whatever their order, and lists what differs', () => {
    const a = { 'data/catalogue/x.json': '1'.repeat(40), 'data/note-aliases.json': '2'.repeat(40) };
    const b = { 'data/note-aliases.json': '2'.repeat(40), 'data/catalogue/x.json': '1'.repeat(40) };
    expect(inputsFingerprint(a)).toBe(inputsFingerprint(b));
    expect(inputsDiffer(a, b)).toEqual([]);
    expect(inputsDiffer(a, { ...b, 'data/catalogue/x.json': '3'.repeat(40), 'data/catalogue/y.json': '4'.repeat(40) }))
      .toEqual(['data/catalogue/x.json', 'data/catalogue/y.json']);
  });

  it('calls the modules stale until they carry the stamp of this record and this source', () => {
    const dir = scratch();
    expect(catalogueStaleReason(dir)).toMatch(/data\/catalogue-build\.json is missing/);
    mkdirSync(join(dir, 'data'));
    mkdirSync(join(dir, 'demo'));
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
    for (const f of ['scripts/build-demo-catalogue.ts', 'scripts/catalogueBuild.ts', 'scripts/dataLiterals.ts', 'scripts/generatedFiles.ts']) {
      writeFileSync(join(dir, f), f);
    }
    const record = { builtAt: '2026-10-10T04:00:00.000Z', files: { 'data/product-slugs.json': '5'.repeat(40) } };
    writeFileSync(join(dir, CATALOGUE_RECORD), recordText(record));
    expect(catalogueStaleReason(dir)).toMatch(/demo\/catalogue\.generated\.ts is not built/);
    const stamp = stampLine(record, codeFingerprint(dir));
    for (const m of CATALOGUE_MODULES) writeFileSync(join(dir, m), `${stamp}\n// body\n`);
    expect(catalogueStaleReason(dir)).toBeNull();
    // A source change marks them stale.
    writeFileSync(join(dir, 'src/a.ts'), 'export const a = 2;\n');
    expect(catalogueStaleReason(dir)).toMatch(/another build record or other source/);
    for (const m of CATALOGUE_MODULES) writeFileSync(join(dir, m), `${stampLine(record, codeFingerprint(dir))}\n`);
    expect(catalogueStaleReason(dir)).toBeNull();
    // So does a new record (a crawl's rebuild).
    writeFileSync(join(dir, CATALOGUE_RECORD), recordText({ ...record, builtAt: '2026-10-10T07:00:00.000Z' }));
    expect(catalogueStaleReason(dir)).toMatch(/another build record/);
  });
});

describe('where the modules are built', () => {
  it('are "deploy" files, gitignored and untracked, and the record is a committed rebuild file', () => {
    for (const m of CATALOGUE_MODULES) {
      expect(policyOf(m), m).toBe('deploy');
      expect(execFileSync('git', ['check-ignore', m], { cwd: REPO_ROOT, encoding: 'utf8' }).trim()).toBe(m);
      expect(execFileSync('git', ['ls-files', m], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(), `${m} is still tracked`).toBe('');
    }
    expect(policyOf(CATALOGUE_RECORD)).toBe('rebuild');
    for (const m of CATALOGUE_MEMORIES) expect(policyOf(m), m).toBe('rebuild');
  });

  it('every npm script that runs a script importing them builds them first', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const ensure = 'tsx scripts/ensure-catalogue-built.ts';
    expect(scripts['demo']!.startsWith(`${ensure} && `)).toBe(true);
    expect(scripts['catalogue:ensure']).toBe(ensure);
    expect(read('scripts/ensure-demo-built.ts')).toContain('ensureCatalogueBuilt(root);');
    for (const [name, command] of Object.entries(scripts)) {
      for (const m of command.matchAll(/tsx (scripts\/[\w.-]+\.ts)/g)) {
        const file = m[1]!;
        if (file === 'scripts/ensure-catalogue-built.ts' || file === 'scripts/build-demo-catalogue.ts') continue;
        if (!/demo\/(catalogue|dormant)\.generated\.js/.test(read(file))) continue;
        const at = command.indexOf(m[0]);
        expect(command.indexOf(ensure), `npm run ${name} runs ${file}, which imports the catalogue, without building it first`)
          .toBeGreaterThanOrEqual(0);
        expect(command.indexOf(ensure)).toBeLessThan(at);
      }
    }
  });

  it('the deploy, the region crawls and the photo measuring build them before they read them', () => {
    const deploy = read('.github/workflows/deploy-pages.yml');
    const ensureAt = deploy.indexOf('run: npx tsx scripts/ensure-catalogue-built.ts');
    expect(ensureAt).toBeGreaterThan(0);
    expect(ensureAt).toBeLessThan(deploy.indexOf('run: npm run demo'));
    for (const r of ['us', 'in']) {
      const wf = read(`.github/workflows/catalogue-${r}.yml`);
      const at = wf.indexOf('run: npx tsx scripts/ensure-catalogue-built.ts');
      expect(at, r).toBeGreaterThan(0);
      expect(at).toBeLessThan(wf.indexOf('scripts/region-harvest.ts'));
      expect(at).toBeLessThan(wf.indexOf('scripts/build-region-catalogue.ts'));
    }
    const images = read('.github/workflows/image-measure-daily.yml');
    expect(images.indexOf('run: npx tsx scripts/ensure-catalogue-built.ts')).toBeGreaterThan(0);
    expect(images.indexOf('run: npx tsx scripts/ensure-catalogue-built.ts')).toBeLessThan(images.indexOf('scripts/image-box-check.ts'));
    // The other workflows that read them do so through npm scripts held above.
    expect(read('.github/workflows/fragrance-links-daily.yml')).toContain('npm run links:resolve');
    expect(read('.github/workflows/price-alerts.yml')).toContain('npm run alerts:send');
  });
});
