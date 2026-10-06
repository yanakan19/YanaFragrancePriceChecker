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
  EXTERNAL_HISTORY_FILE_VERSION,
  priceHistoryLiteral,
  readCheckpointFile,
  writeCheckpointFile,
} from '../scripts/priceHistoryCheckpointFile.js';
import {
  CHECKPOINT_PATH, CHECKPOINT_VERSION, OUTPUT_PATH, fromCheckpoint, render, resumeFrom, ruleModules, type Checkpoint,
} from '../scripts/priceHistoryReplay.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const T1 = '2026-10-03T10:00:00+00:00';
const T2 = '2026-10-04T10:00:00+00:00';

function sample(): Checkpoint {
  return {
    version: CHECKPOINT_VERSION,
    rules: 'r',
    lastCommit: 'b'.repeat(40),
    commitsReplayed: 2,
    // Not sorted either: the generated file sorts the series, and the
    // replay's own order (which decides PRICE_HISTORY_GAP's) must survive.
    history: {
      'ean-2': [{ at: T1, priceGbp: 20, retailerId: 'escentual' }],
      'ean-1': [{ at: T1, priceGbp: 10, retailerId: 'boots' }, { at: T2, priceGbp: null, retailerId: null }],
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

describe('version 3: the checkpoint without its copy of the history', () => {
  const T3 = '2026-10-05T10:00:00+00:00';
  const commits = [{ sha: 'a'.repeat(40), at: T1 }, { sha: 'b'.repeat(40), at: T2 }, { sha: 'c'.repeat(40), at: T3 }];
  const atCheckpoint = commits.slice(0, 2);

  /** The state one commit after sample(): a point on a series, a new series. */
  function later(): Checkpoint {
    const next = sample();
    next.history['ean-1']!.push({ at: T3, priceGbp: 9, retailerId: 'boots' });
    next.history['ean-3'] = [{ at: T3, priceGbp: 30, retailerId: 'boots' }];
    return next;
  }

  function dir(): string {
    const d = mkdtempSync(join(tmpdir(), 'checkpoint-v3-'));
    cleanup.push(d);
    mkdirSync(join(d, 'data'));
    mkdirSync(join(d, 'demo'));
    return d;
  }

  it('leaves the history out, and reads it back from the generated file to exactly the same checkpoint', () => {
    const d = dir();
    const body = render(fromCheckpoint(sample()), atCheckpoint).body;
    writeFileSync(join(d, OUTPUT_PATH), body);
    writeCheckpointFile(d, sample(), T2, body);
    const onDisk = JSON.parse(readFileSync(join(d, CHECKPOINT_PATH), 'utf8')) as Record<string, unknown>;
    expect(onDisk.version).toBe(EXTERNAL_HISTORY_FILE_VERSION);
    expect(onDisk).not.toHaveProperty('history');
    expect(onDisk.historyIn).toBe(OUTPUT_PATH);
    expect(onDisk.historyOrder).toEqual(['ean-2', 'ean-1']);
    const read = readCheckpointFile(d, atCheckpoint)!;
    // Key order included: it decides the order of PRICE_HISTORY_GAP's keys.
    expect(JSON.stringify(read)).toBe(JSON.stringify(sample()));
    expect(render(fromCheckpoint(read), atCheckpoint).body).toBe(body);
    expect(resumeFrom(read, 'r', atCheckpoint).resume).toBe(true);
  });

  it('reads it back from a generated file rebuilt since, taking off the newer commits\' points and series', () => {
    const d = dir();
    writeCheckpointFile(d, sample(), T2, render(fromCheckpoint(sample()), atCheckpoint).body);
    writeFileSync(join(d, OUTPUT_PATH), render(fromCheckpoint(later()), commits).body);
    const read = readCheckpointFile(d, commits)!;
    expect(JSON.stringify(read)).toBe(JSON.stringify(sample()));
    const decision = resumeFrom(read, 'r', commits);
    expect(decision.resume && decision.from).toBe(2);
  });

  it('takes off a newer commit\'s points whichever way git wrote its time (Z or +00:00)', () => {
    const d = dir();
    writeCheckpointFile(d, sample(), T2, render(fromCheckpoint(sample()), atCheckpoint).body);
    const next = later();
    next.history['ean-1']!.at(-1)!.at = '2026-10-05T10:00:00Z';
    next.history['ean-3']![0]!.at = '2026-10-05T10:00:00Z';
    writeFileSync(join(d, OUTPUT_PATH), render(fromCheckpoint(next), commits).body);
    expect(JSON.stringify(readCheckpointFile(d, commits))).toBe(JSON.stringify(sample()));
  });

  it('refuses a generated file that does not give back its history, so the replay starts over instead of resuming wrong', () => {
    const d = dir();
    writeCheckpointFile(d, sample(), T2, render(fromCheckpoint(sample()), atCheckpoint).body);
    // Another rebuild's file: a different price at the checkpoint's own commit.
    const other = sample();
    other.history['ean-2'] = [{ at: T1, priceGbp: 19, retailerId: 'escentual' }];
    writeFileSync(join(d, OUTPUT_PATH), render(fromCheckpoint(other), atCheckpoint).body);
    expect(readCheckpointFile(d, atCheckpoint)).toBeNull();
    // An older file than the checkpoint: a series is missing.
    const older = sample();
    delete older.history['ean-1'];
    writeFileSync(join(d, OUTPUT_PATH), render(fromCheckpoint(older), atCheckpoint).body);
    expect(readCheckpointFile(d, atCheckpoint)).toBeNull();
    // No file, or a checkpoint commit the history does not have.
    writeFileSync(join(d, OUTPUT_PATH), render(fromCheckpoint(sample()), atCheckpoint).body);
    expect(readCheckpointFile(d, [commits[0]!])).toBeNull();
    rmSync(join(d, OUTPUT_PATH));
    expect(readCheckpointFile(d, atCheckpoint)).toBeNull();
  });

  it('keeps the history inline (version 2) when the generated file cannot give it back', () => {
    const d = dir();
    const fewer = sample();
    delete fewer.history['ean-2'];
    writeCheckpointFile(d, sample(), T2, render(fromCheckpoint(fewer), atCheckpoint).body);
    const onDisk = JSON.parse(readFileSync(join(d, CHECKPOINT_PATH), 'utf8')) as { version: number };
    expect(onDisk.version).toBe(COMPACT_FILE_VERSION);
    expect(JSON.stringify(readCheckpointFile(d))).toBe(JSON.stringify(sample()));
  });

  it('finds the history literal in the real generated file', () => {
    const literal = priceHistoryLiteral(readFileSync(join(REPO_ROOT, OUTPUT_PATH), 'utf8'))!;
    expect(literal.startsWith('{')).toBe(true);
    expect(literal.endsWith('}')).toBe(true);
    expect(() => JSON.parse(literal)).not.toThrow();
  });
});
