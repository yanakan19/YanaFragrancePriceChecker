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
 * ── Without its copy of the history (version 3, 2026-10-06) ─────────────────
 * The checkpoint's `history` was the same series as the PRICE_HISTORY the
 * rebuild writes into demo/priceHistory.generated.ts: 12.3 MB of the 15.9 MB
 * file, committed twice (docs/TRACKING-AND-STORAGE-STRATEGY.md, item 5).
 * Version 3 leaves it out and keeps instead the series' ids in the replay's
 * order (the generated file sorts them, and the order decides the order of
 * PRICE_HISTORY_GAP's keys) and the sha256 of the history it stood for.
 *
 * The generated file is usually a few commits ahead of the checkpoint (it is
 * rebuilt every time, the checkpoint only when well behind, below). A series
 * only ever grows at its end, one point per commit at that commit's time, so
 * the checkpoint's series are the generated file's with the points of the
 * commits since the checkpoint taken off the end, and the series that began
 * since left out. That is what the reader does, and it then hashes the result:
 * only an exact match is resumed. Anything else (a generated file from another
 * rebuild, a hand merge that took one file from each side, two commits with
 * the same time) is refused, and the replay starts from the first commit,
 * slow but right, exactly as for an unreadable checkpoint. The writer checks
 * the same way before it leaves the history out, and keeps it inline
 * (version 2) when the generated file could not give it back.
 *
 * Undo: `writeCheckpointFile` without the generated body writes version 2
 * again, and this reader reads every version.
 *
 * This file is deliberately outside the replay's rules fingerprint
 * (RULE_MODULE_ROOTS in priceHistoryReplay.ts): how the state is written down
 * cannot change a price point, and an edit here must not force a full replay.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeGenerated } from './generatedFiles.js';
import { historyFromGenerated } from './priceHistoryFile.js';
import {
  CHECKPOINT_PATH,
  CHECKPOINT_VERSION,
  OUTPUT_PATH,
  commitsTouchingCatalogue,
  type CatalogueCommit,
  type Checkpoint,
  type EverPriced,
  type PricePoint,
} from './priceHistoryReplay.js';

/** The on-disk version of the compact form. The in-memory Checkpoint stays CHECKPOINT_VERSION. */
export const COMPACT_FILE_VERSION = 2;
/** The compact form without `history`, which is read back from demo/priceHistory.generated.ts. */
export const EXTERNAL_HISTORY_FILE_VERSION = 3;

export interface ExternalHistoryCheckpointFile extends Omit<CompactCheckpointFile, 'version' | 'history'> {
  version: typeof EXTERNAL_HISTORY_FILE_VERSION;
  /** Where the series are read back from. */
  historyIn: typeof OUTPUT_PATH;
  /** The series' ids in the replay's order. New ids only ever join at the end. */
  historyOrder: string[];
  /** sha256 of the history as JSON, in that order: what the reader must give back exactly. */
  historySha256: string;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const historyHash = (history: Checkpoint['history']): string => sha256(JSON.stringify(history));

/**
 * The series `order` names, each with the points of the commits in `laterAts`
 * (commit times as milliseconds) taken off its end. Compared as times, not as
 * text: the same commit's time is written `2026-10-06T14:00:09Z` by the git on
 * GitHub's runners and `2026-10-06T14:00:09+00:00` by older ones, and both
 * forms sit in the history. Null when a series is missing or would be left
 * empty; null when one is missing or would be left empty (it
 * cannot then be the checkpoint's). The caller checks the result by its hash.
 */
export function historyAt(
  shipped: Readonly<Record<string, PricePoint[]>>,
  order: readonly string[],
  laterAts: ReadonlySet<number>,
): Checkpoint['history'] | null {
  const history: Checkpoint['history'] = {};
  for (const id of order) {
    const series = shipped[id];
    if (!series) return null;
    let end = series.length;
    while (end > 0 && laterAts.has(Date.parse(series[end - 1]!.at))) end--;
    if (end === 0) return null;
    history[id] = end === series.length ? series : series.slice(0, end);
  }
  return history;
}

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

/**
 * Version 3, when `generatedBody` (the demo/priceHistory.generated.ts written
 * from the same state) gives the history back exactly; null when it does not,
 * and the caller keeps the history inline.
 */
export function encodeCheckpointWithoutHistory(
  checkpoint: Checkpoint,
  generatedBody: string,
  lastAt?: string,
): ExternalHistoryCheckpointFile | null {
  const shipped = historyFromGenerated(generatedBody);
  if (shipped === null) return null;
  const order = Object.keys(checkpoint.history);
  const hash = historyHash(checkpoint.history);
  const back = historyAt(shipped, order, new Set());
  if (back === null || historyHash(back) !== hash) return null;
  const compact = encodeCheckpoint(checkpoint, lastAt);
  return {
    version: EXTERNAL_HISTORY_FILE_VERSION,
    rules: compact.rules,
    lastCommit: compact.lastCommit,
    commitsReplayed: compact.commitsReplayed,
    lastAt: compact.lastAt,
    historyIn: OUTPUT_PATH,
    historyOrder: order,
    historySha256: hash,
    everPriced: compact.everPriced,
  };
}

/**
 * A version 3 checkpoint with its series read back from the generated file
 * (see the header), or null, with a warning, when they do not hash to what
 * the checkpoint recorded. `commits` is every commit touching the catalogue.
 */
export function decodeExternalCheckpoint(
  root: string,
  file: ExternalHistoryCheckpointFile,
  commits: readonly CatalogueCommit[],
): Checkpoint | null {
  const refuse = (why: string): null => {
    console.log(`::warning::${CHECKPOINT_PATH} cannot be resumed: ${why}. Replaying from the first commit.`);
    return null;
  };
  const index = commits.findIndex((c) => c.sha === file.lastCommit);
  if (index < 0) return refuse(`its commit ${file.lastCommit.slice(0, 8)} is not among the commits touching the catalogue`);
  const path = join(root, file.historyIn);
  const shipped = existsSync(path) ? historyFromGenerated(readFileSync(path, 'utf8')) : null;
  if (shipped === null) return refuse(`${file.historyIn} is missing or not in the shape the rebuild writes`);
  const laterAts = new Set(commits.slice(index + 1).map((c) => Date.parse(c.at)));
  const history = historyAt(shipped, file.historyOrder, laterAts);
  if (history === null || historyHash(history) !== file.historySha256) {
    return refuse(`${file.historyIn} does not give back its price history (take both files from the same side of a merge, or rebuild)`);
  }
  const { historyIn: _in, historyOrder: _order, historySha256: _sha, version: _version, ...rest } = file;
  return decodeCheckpoint({ ...rest, version: COMPACT_FILE_VERSION, history });
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
 * to refuse with its reason. A version 3 file reads its series back from the
 * generated file, against `commits` (read from git when not given).
 */
export function readCheckpointFile(root: string, commits?: readonly CatalogueCommit[]): Checkpoint | null {
  const path = join(root, CHECKPOINT_PATH);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
    if (parsed.version === COMPACT_FILE_VERSION) return decodeCheckpoint(parsed as CompactCheckpointFile);
    if (parsed.version === EXTERNAL_HISTORY_FILE_VERSION) {
      return decodeExternalCheckpoint(root, parsed as ExternalHistoryCheckpointFile, commits ?? commitsTouchingCatalogue(root));
    }
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
//
// 10 commits or 6 hours until 2026-10-06, 24 and 24 since. Version 3 (above)
// made each rewrite smaller but the everPriced map still changes with every
// one: the eight rewrites of 5 October pack to 0.61 MB of growth, the same
// span rewritten twice to 0.32 MB. A rebuild then replays up to 24 commits
// instead of 10, about three seconds each.
export const CHECKPOINT_MAX_COMMITS_BEHIND = 24;
export const CHECKPOINT_MAX_HOURS_BEHIND = 24;

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

/**
 * Writes the checkpoint; returns its size in bytes. Given the body of the
 * demo/priceHistory.generated.ts rendered from the same state, version 3
 * (no copy of the history) when that body gives the history back exactly;
 * otherwise version 2 with the history inline.
 */
export function writeCheckpointFile(root: string, checkpoint: Checkpoint, lastAt?: string, generatedBody?: string): number {
  const external = generatedBody === undefined ? null : encodeCheckpointWithoutHistory(checkpoint, generatedBody, lastAt);
  const body = JSON.stringify(external ?? encodeCheckpoint(checkpoint, lastAt));
  writeGenerated(root, CHECKPOINT_PATH, body);
  return body.length;
}
