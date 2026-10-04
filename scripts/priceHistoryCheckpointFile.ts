/**
 * How data/price-history-checkpoint.json is stored on disk, separate from what
 * it means (scripts/priceHistoryReplay.ts).
 *
 * ── Why (2026-10-04) ─────────────────────────────────────────────────────────
 * The checkpoint is committed with every rebuild, about fifteen times on a busy
 * day, and git stores each version as a delta against the last. It was the
 * fourth biggest cost in the repository's growth: 3.3 MB of a 57 MB day, about
 * 220 kB a commit for a 16 MB file. Almost all of that was one field.
 * `everPriced[id].last` is the time of the last commit in which the fragrance
 * carried a price, and for the ~41,000 of ~49,000 fragrances priced right now
 * it is simply the newest commit's time. So every replayed commit rewrote
 * 41,000 timestamps scattered through the file, and the delta had to carry
 * every one.
 *
 * The compact form writes `last` once, as `lastAt`, and each entry as
 * `[first]` when its `last` is that time, `[first, last]` otherwise. An entry
 * now changes only when its fragrance stops or starts being priced. What the
 * replay reads back is exactly the state it wrote: decode(encode(x)) is x,
 * key order included (tests/priceHistoryCheckpointFile.test.ts).
 *
 * ── Compatibility ────────────────────────────────────────────────────────────
 * The compact file says `"version": 2`. Code from before this module (an
 * older checkout of the crawl mid run) sees a version it does not write and
 * replays from the first commit: slow, never wrong. This module reads both
 * forms, so the first rebuild after it resumes from the plain checkpoint
 * already on the branch.
 *
 * This file is deliberately outside the replay's rules fingerprint
 * (RULE_MODULE_ROOTS in priceHistoryReplay.ts): how the state is written down
 * cannot change a price point, and an edit here must not force a full replay.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeGenerated } from './generatedFiles.js';
import { CHECKPOINT_PATH, CHECKPOINT_VERSION, type Checkpoint, type EverPriced } from './priceHistoryReplay.js';

/** The on-disk version of the compact form. The in-memory Checkpoint stays CHECKPOINT_VERSION. */
export const COMPACT_FILE_VERSION = 2;

export interface CompactCheckpointFile extends Omit<Checkpoint, 'version' | 'everPriced'> {
  version: typeof COMPACT_FILE_VERSION;
  /** The `last` every entry written as `[first]` carries: the newest replayed commit's time. */
  lastAt: string;
  everPriced: Record<string, [string] | [string, string]>;
}

/** The time most `last` values share. The newest commit's time when the replay has one. */
function commonLast(everPriced: Record<string, EverPriced>, lastAt: string | undefined): string {
  if (lastAt !== undefined) return lastAt;
  let newest = '';
  for (const e of Object.values(everPriced)) if (e.last > newest) newest = e.last;
  return newest;
}

export function encodeCheckpoint(checkpoint: Checkpoint, lastAt?: string): CompactCheckpointFile {
  if (checkpoint.version !== CHECKPOINT_VERSION) {
    throw new Error(`encodeCheckpoint knows checkpoint version ${CHECKPOINT_VERSION}, got ${checkpoint.version}`);
  }
  const shared = commonLast(checkpoint.everPriced, lastAt);
  const everPriced: CompactCheckpointFile['everPriced'] = {};
  for (const [id, { first, last }] of Object.entries(checkpoint.everPriced)) {
    everPriced[id] = last === shared ? [first] : [first, last];
  }
  return {
    version: COMPACT_FILE_VERSION,
    rules: checkpoint.rules,
    lastCommit: checkpoint.lastCommit,
    commitsReplayed: checkpoint.commitsReplayed,
    lastAt: shared,
    history: checkpoint.history,
    everPriced,
  };
}

export function decodeCheckpoint(file: CompactCheckpointFile): Checkpoint {
  const everPriced: Record<string, EverPriced> = {};
  for (const [id, entry] of Object.entries(file.everPriced)) {
    everPriced[id] = { first: entry[0], last: entry.length === 2 ? entry[1] : file.lastAt };
  }
  return {
    version: CHECKPOINT_VERSION,
    rules: file.rules,
    lastCommit: file.lastCommit,
    commitsReplayed: file.commitsReplayed,
    history: file.history,
    everPriced,
  };
}

/**
 * The checkpoint on disk, in either form, as the replay's Checkpoint; null when
 * there is none or it cannot be parsed (the same answer readCheckpoint in
 * priceHistoryReplay.ts gives, and for the same reason: a full replay is slow
 * but always right). Any other version is returned as it is, for resumeFrom
 * to refuse with its reason.
 */
export function readCheckpointFile(root: string): Checkpoint | null {
  const path = join(root, CHECKPOINT_PATH);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
    if (parsed.version === COMPACT_FILE_VERSION) return decodeCheckpoint(parsed as CompactCheckpointFile);
    return parsed as Checkpoint;
  } catch {
    return null;
  }
}

// ── How often it is rewritten ─────────────────────────────────────────────────
// The compact form alone took the day's checkpoint deltas from 2.92 MB to
// 2.45 MB (the 15 versions committed on 2026-10-04, re-encoded and packed the
// way git packs them): most of what changes is real price history. Committing
// it less often is what cuts that: the same day's versions, one in four, pack
// to 1.04 MB of deltas covering the same 14 steps. A checkpoint is only a
// resume point, and resuming from an older one gives the same bytes out (the
// fold property tests/priceHistoryReplay.test.ts holds), so the rebuild keeps
// the one on disk until it is this far behind, at the cost of replaying a few
// more commits (each reads only the snapshot files that changed).
export const CHECKPOINT_MAX_COMMITS_BEHIND = 10;
export const CHECKPOINT_MAX_HOURS_BEHIND = 6;

/**
 * Why the checkpoint should be rewritten after this replay, or null to leave
 * the one on disk alone. `resumedAfter` is how many of `commits` the checkpoint
 * the replay resumed from had already folded in, or null when the replay
 * started from the first commit (no checkpoint, an unreadable one, a rules
 * change, `--full`), which must always be written or every later rebuild would
 * replay from the start too. Decided from commit times, not the clock, so it is
 * the same answer on every machine.
 */
export function checkpointRewriteReason(resumedAfter: number | null, commits: readonly { at: string }[]): string | null {
  if (resumedAfter === null) return 'the replay started from the first commit';
  const behind = commits.length - resumedAfter;
  if (behind >= CHECKPOINT_MAX_COMMITS_BEHIND) return `${behind} commits behind (rewritten at ${CHECKPOINT_MAX_COMMITS_BEHIND})`;
  if (behind <= 0) return null;
  if (resumedAfter < 1) return 'the checkpoint had folded in no commit';
  const hours = (Date.parse(commits.at(-1)!.at) - Date.parse(commits[resumedAfter - 1]!.at)) / 3_600_000;
  if (hours >= CHECKPOINT_MAX_HOURS_BEHIND) return `${hours.toFixed(1)} hours behind (rewritten at ${CHECKPOINT_MAX_HOURS_BEHIND})`;
  return null;
}

/** Writes the compact form; returns its size in bytes. */
export function writeCheckpointFile(root: string, checkpoint: Checkpoint, lastAt?: string): number {
  const body = JSON.stringify(encodeCheckpoint(checkpoint, lastAt));
  writeGenerated(root, CHECKPOINT_PATH, body);
  return body.length;
}
