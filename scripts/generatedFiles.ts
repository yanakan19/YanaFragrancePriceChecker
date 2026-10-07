/**
 * The TypeScript reader for scripts/generated-files.txt, the one list of files
 * the pipeline writes and commits (see that file's header). The bash reader is
 * scripts/generated-files.sh; tests/generatedFiles.test.ts holds the two to
 * the same answers.
 *
 * Build scripts write their committed outputs through `writeGenerated`, which
 * refuses a path the manifest does not name. That is the point of it: a new
 * generated file cannot reach the branch without a line in the manifest, and
 * the line is what makes the conflict handler and the workflows' commit steps
 * know about it. Run #592 is what happens otherwise.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** See the header of scripts/generated-files.txt; "deploy" files are built but never committed. */
export type GeneratedPolicy = 'rebuild' | 'incoming' | 'manual' | 'deploy' | 'source';

export interface ManifestEntry {
  policy: GeneratedPolicy;
  /** Repository-relative pattern: a folder ends in `/`, `*` matches anything. */
  pattern: string;
  writtenBy: string;
}

const POLICIES: readonly GeneratedPolicy[] = ['rebuild', 'incoming', 'manual', 'deploy', 'source'];

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_PATH = resolve(REPO_ROOT, 'scripts/generated-files.txt');

export function parseManifest(text: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const [policy, pattern, ...rest] = line.split(/\s+/);
    if (!POLICIES.includes(policy as GeneratedPolicy) || !pattern) {
      throw new Error(`scripts/generated-files.txt line ${i + 1}: expected "<${POLICIES.join('|')}> <path> <writer>", got "${line}"`);
    }
    entries.push({ policy: policy as GeneratedPolicy, pattern, writtenBy: rest.join(' ') });
  });
  return entries;
}

let cached: ManifestEntry[] | null = null;
export function readManifest(): ManifestEntry[] {
  cached ??= parseManifest(readFileSync(MANIFEST_PATH, 'utf8'));
  return cached;
}

/** Same rules as `manifest_policy` in scripts/generated-files.sh. */
export function matchesPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('/')) return `${path}/`.startsWith(pattern);
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(path);
}

/** The policy of a repository-relative path, or null when the manifest does not name it. First match wins. */
export function policyOf(path: string, entries: readonly ManifestEntry[] = readManifest()): GeneratedPolicy | null {
  const posix = path.split(sep).join('/');
  return entries.find((e) => matchesPattern(posix, e.pattern))?.policy ?? null;
}

/** Throws unless the manifest names this repository-relative path. */
export function assertGenerated(relPath: string): void {
  const rel = relPath.split(sep).join('/');
  if (policyOf(rel) === null) {
    throw new Error(
      `Refusing to write ${rel}: it is not in scripts/generated-files.txt. Every file a build writes and ` +
        'the pipeline commits must be listed there, or a push conflict on it stops the crawl (run #592). ' +
        'Add a line for it in the same commit.',
    );
  }
}

/**
 * Writes a committed build output, refusing any path the manifest does not
 * name. `root` is the repository root the build runs in; `relPath` is the
 * output relative to it.
 */
export function writeGenerated(root: string, relPath: string, content: string | Uint8Array): void {
  const rel = relative(root, resolve(root, relPath)).split(sep).join('/');
  assertGenerated(rel);
  writeFileSync(resolve(root, rel), content);
}
