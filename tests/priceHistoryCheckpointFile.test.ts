// The compact on-disk form of data/price-history-checkpoint.json
// (scripts/priceHistoryCheckpointFile.ts) must hand the replay back exactly
// the state it was given, or the price history built from it would drift
// from a full replay without anything failing.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHECKPOINT_MAX_COMMITS_BEHIND,
  CHECKPOINT_MAX_HOURS_BEHIND,
  checkpointRewriteReason,
  COMPACT_FILE_VERSION,
  decodeCheckpoint,
  encodeCheckpoint,
  readCheckpointFile,
  writeCheckpointFile,
} from '../scripts/priceHistoryCheckpointFile.js';
import { CHECKPOINT_PATH, CHECKPOINT_VERSION, resumeFrom, ruleModules, type Checkpoint } from '../scripts/priceHistoryReplay.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const T1 = '2026-10-03T10:00:00+00:00';
const T2 = '2026-10-04T10:00:00+00:00';

function sample(): Checkpoint {
  return {
    version: CHECKPOINT_VERSION,
    rules: 'r',
    lastCommit: 'b'.repeat(40),
    commitsReplayed: 2,
    history: {
      'ean-1': [{ at: T1, priceGbp: 10, retailerId: 'boots' }, { at: T2, priceGbp: null, retailerId: null }],
      'ean-2': [{ at: T1, priceGbp: 20, retailerId: 'escentual' }],
    },
    // Insertion order deliberately not sorted: the replay's Map order must survive.
    everPriced: {
      'ean-9': { first: T1, last: T2 },
      'ean-1': { first: T1, last: T1 },
      'ean-2': { first: T2, last: T2 },
    },
  };
}

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe('the compact checkpoint file', () => {
  it('writes the shared last time once and an entry as [first] when its last is that time', () => {
    const file = encodeCheckpoint(sample(), T2);
    expect(file.version).toBe(COMPACT_FILE_VERSION);
    expect(file.lastAt).toBe(T2);
    expect(file.everPriced).toEqual({ 'ean-9': [T1], 'ean-1': [T1, T1], 'ean-2': [T2] });
  });

  it('decodes to exactly the checkpoint it encoded, key order included', () => {
    const original = sample();
    const back = decodeCheckpoint(JSON.parse(JSON.stringify(encodeCheckpoint(original, T2))));
    expect(back).toEqual(original);
    expect(Object.keys(back.everPriced)).toEqual(Object.keys(original.everPriced));
    expect(JSON.stringify(back)).toBe(JSON.stringify(original));
  });

  it('finds the shared time itself when the replay has no commit to name', () => {
    const file = encodeCheckpoint(sample());
    expect(file.lastAt).toBe(T2);
    expect(decodeCheckpoint(file)).toEqual(sample());
  });

  it('reads both the compact and the plain form from disk, and is resumed by the replay', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checkpoint-file-'));
    cleanup.push(dir);
    mkdirSync(join(dir, 'data'));
    writeFileSync(join(dir, CHECKPOINT_PATH), JSON.stringify(sample()));
    expect(readCheckpointFile(dir)).toEqual(sample());

    writeCheckpointFile(dir, sample(), T2);
    const onDisk = JSON.parse(readFileSync(join(dir, CHECKPOINT_PATH), 'utf8')) as { version: number };
    expect(onDisk.version).toBe(COMPACT_FILE_VERSION);
    const read = readCheckpointFile(dir)!;
    expect(read).toEqual(sample());
    const decision = resumeFrom(read, 'r', [{ sha: 'a'.repeat(40), at: T1 }, { sha: 'b'.repeat(40), at: T2 }]);
    expect(decision.resume).toBe(true);
  });

  it('is refused, not misread, by code that knows only the plain form (it replays from the start instead)', () => {
    const decision = resumeFrom(encodeCheckpoint(sample(), T2) as unknown as Checkpoint, 'r', [{ sha: 'b'.repeat(40), at: T2 }]);
    expect(decision.resume).toBe(false);
    if (!decision.resume) expect(decision.reason).toContain(`version ${COMPACT_FILE_VERSION}`);
  });

  it('treats an unreadable file as no checkpoint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checkpoint-file-'));
    cleanup.push(dir);
    mkdirSync(join(dir, 'data'));
    expect(readCheckpointFile(dir)).toBeNull();
    writeFileSync(join(dir, CHECKPOINT_PATH), '<<<<<<< ours');
    expect(readCheckpointFile(dir)).toBeNull();
  });

  it('round-trips the real checkpoint on the branch', () => {
    const real = readCheckpointFile(REPO_ROOT);
    if (!real) return;
    const back = decodeCheckpoint(JSON.parse(JSON.stringify(encodeCheckpoint(real))));
    expect(JSON.stringify(back)).toBe(JSON.stringify(real));
  });

  it('is rewritten only when a replay started from scratch or the one on disk is well behind', () => {
    const commits = (hours: number[]) => hours.map((h) => ({ at: new Date(Date.UTC(2026, 9, 4) + h * 3_600_000).toISOString() }));
    // From the first commit: always written, or every later rebuild replays from the start too.
    expect(checkpointRewriteReason(null, commits([0, 1]))).toMatch(/first commit/);
    // Nothing new, or a little: left alone.
    expect(checkpointRewriteReason(2, commits([0, 1]))).toBeNull();
    expect(checkpointRewriteReason(1, commits([0, 1, 2]))).toBeNull();
    // Far enough behind by commits, or by time between the commits.
    const many = commits(Array.from({ length: CHECKPOINT_MAX_COMMITS_BEHIND + 1 }, (_, i) => i * 0.1));
    expect(checkpointRewriteReason(1, many)).toMatch(/commits behind/);
    expect(checkpointRewriteReason(1, commits([0, CHECKPOINT_MAX_HOURS_BEHIND]))).toMatch(/hours behind/);
    expect(checkpointRewriteReason(1, commits([0, CHECKPOINT_MAX_HOURS_BEHIND - 0.5]))).toBeNull();
  });

  it('sits outside the replay rules fingerprint, so editing it never forces a full replay', () => {
    expect(ruleModules(REPO_ROOT)).not.toContain('scripts/priceHistoryCheckpointFile.ts');
    expect(existsSync(join(REPO_ROOT, 'scripts/priceHistoryCheckpointFile.ts'))).toBe(true);
  });
});
