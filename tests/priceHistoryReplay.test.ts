import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_VERSION,
  commitsTouchingCatalogue,
  emptyCache,
  emptyState,
  fromCheckpoint,
  registryFacts,
  render,
  replay,
  replayCommit,
  replayCommitCached,
  resumeFrom,
  ruleModules,
  rulesFingerprint,
  toCheckpoint,
  type CatalogueCommit,
  type Checkpoint,
  type ReplayState,
} from '../scripts/priceHistoryReplay.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import { isAvailableListing } from '../src/catalogue/listingAvailability.js';
import type { StoredListing } from '../src/catalogue/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The replay reads real commits; a shallow clone has none to read. */
function isShallow(): boolean {
  return execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: root, encoding: 'utf8' }).trim() === 'true';
}

/** The state, serialised the way the checkpoint serialises it, for deep comparison. */
function snapshot(state: ReplayState) {
  return { history: Object.fromEntries(state.history), everPriced: Object.fromEntries(state.everPriced) };
}

// The earliest commits touching data/catalogue are small (twelve files, well
// under a megabyte between them), so replaying a few of them is a fraction of
// a second — cheap enough to run on every `npx vitest run`, which is where
// the freshness gate this replay feeds already lives.
const EARLY_COMMITS = 4;
const RESUME_AFTER = 2;

describe('price history replay resumes from a checkpoint without changing its answer', () => {
  it.skipIf(isShallow())('replaying k+1..n from the checkpoint after k equals replaying 1..n from nothing', () => {
    // This is the whole justification for the checkpoint (see
    // scripts/priceHistoryReplay.ts's header): the fold's state after commit k
    // is everything commit k+1 needs. If that ever stops being true — a rule
    // that starts reading something outside `state` — this is the test that
    // says so, against real history rather than a fixture shaped to pass.
    const commits = commitsTouchingCatalogue(root).slice(0, EARLY_COMMITS);
    expect(commits.length).toBe(EARLY_COMMITS);

    const straightThrough = replay(root, commits, emptyState());

    const partial = replay(root, commits.slice(0, RESUME_AFTER), emptyState());
    // Round-trip through JSON exactly as the on-disk checkpoint does, so a
    // Map/Object or undefined/null asymmetry in the serialisation is caught
    // here and not on a runner.
    const checkpoint = JSON.parse(
      JSON.stringify(toCheckpoint(partial, rulesFingerprint(root), commits.slice(0, RESUME_AFTER))),
    ) as Checkpoint;
    const decision = resumeFrom(checkpoint, rulesFingerprint(root), commits);
    expect(decision.resume).toBe(true);
    if (!decision.resume) return;
    expect(decision.from).toBe(RESUME_AFTER);
    const resumed = replay(root, commits.slice(decision.from), decision.state);

    expect(snapshot(resumed)).toEqual(snapshot(straightThrough));
    // And the shipped document is the same document, not merely the same state.
    expect(render(resumed, commits).body).toBe(render(straightThrough, commits).body);
  });

  it.skipIf(isShallow())('a checkpoint records the last commit it folded in', () => {
    const commits = commitsTouchingCatalogue(root).slice(0, RESUME_AFTER);
    const checkpoint = toCheckpoint(replay(root, commits, emptyState()), 'rules', commits);
    expect(checkpoint.lastCommit).toBe(commits.at(-1)!.sha);
    expect(checkpoint.commitsReplayed).toBe(RESUME_AFTER);
    expect(checkpoint.version).toBe(CHECKPOINT_VERSION);
    expect(snapshot(fromCheckpoint(checkpoint))).toEqual(snapshot(replay(root, commits, emptyState())));
  });
});

describe('when a checkpoint must not be resumed', () => {
  const commits = [
    { sha: 'a'.repeat(40), at: '2026-08-01T00:00:00Z' },
    { sha: 'b'.repeat(40), at: '2026-08-02T00:00:00Z' },
  ];
  const base: Checkpoint = {
    version: CHECKPOINT_VERSION,
    rules: 'current',
    lastCommit: 'a'.repeat(40),
    commitsReplayed: 1,
    history: {},
    everPriced: {},
  };

  it('resumes after the checkpoint commit when everything lines up', () => {
    const decision = resumeFrom(base, 'current', commits);
    expect(decision).toMatchObject({ resume: true, from: 1, commitsReplayed: 1 });
  });

  it('refuses, with a reason, when there is no checkpoint at all', () => {
    expect(resumeFrom(null, 'current', commits)).toMatchObject({ resume: false, reason: expect.stringContaining('no checkpoint') });
  });

  it('refuses when the replay rules have changed since it was written', () => {
    // The Riiffs fix of 2026-09-03 is the concrete case: it changed which
    // listings count as fragrances at all, which changes what every earlier
    // commit contributes. A checkpoint from before it is not merely old, it is
    // wrong under the new rules, and the only honest move is to start over.
    expect(resumeFrom({ ...base, rules: 'before-the-riiffs-fix' }, 'current', commits)).toMatchObject({
      resume: false,
      reason: expect.stringContaining('rules changed'),
    });
  });

  it('refuses when its commit is not in the history being replayed', () => {
    expect(resumeFrom({ ...base, lastCommit: 'c'.repeat(40) }, 'current', commits)).toMatchObject({
      resume: false,
      reason: expect.stringContaining('not among the commits'),
    });
  });

  it('refuses a checkpoint written by a different shape of this code', () => {
    expect(resumeFrom({ ...base, version: CHECKPOINT_VERSION + 1 }, 'current', commits)).toMatchObject({
      resume: false,
      reason: expect.stringContaining('version'),
    });
  });
});

describe('the rules fingerprint covers what decides a price point', () => {
  it('walks the replay logic through its own imports and leaves the registry file out', () => {
    const modules = ruleModules(root);
    // The four modules the replay imports for its decisions, plus whatever
    // they import: if fragranceId.ts starts leaning on a new helper tomorrow,
    // it is picked up here without anyone editing a list.
    for (const must of [
      'scripts/priceHistoryReplay.ts',
      'src/catalogue/fragranceId.ts',
      'src/catalogue/listingAvailability.ts',
      'src/catalogue/productMatch.ts',
      'src/catalogue/brandName.ts',
    ]) {
      expect(modules, `${must} should be in the fingerprint`).toContain(must);
    }
    // retailers.ts is edited most days for reasons that cannot move a price
    // point; it is read as two values instead (see registryFacts), so that a
    // delivery-terms edit does not force a ten-minute replay.
    expect(modules).not.toContain('src/config/retailers.ts');
    expect(modules).toEqual([...modules].sort());
  });

  it('is stable across calls and reads the registry as sorted values', () => {
    const fingerprint = rulesFingerprint(root);
    expect(fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(rulesFingerprint(root)).toBe(fingerprint);
    const facts = registryFacts();
    expect(facts.currencyUnconfirmed).toEqual([...facts.currencyUnconfirmed].sort());
    expect(facts.fragranceOnlyCatalogue).toEqual([...facts.fragranceOnlyCatalogue].sort());
    // The four shops that carry the flag today (Kayali joined 2026-10-03); a
    // fifth joining is exactly the kind of change that must invalidate every
    // existing checkpoint.
    expect(facts.fragranceOnlyCatalogue).toEqual(['escentric-molecules', 'kayali', 'riiffs', 'zimaya']);
  });
});

// Run #592 (2026-10-04) spent 41 minutes in two full replays. The replay now
// reads a file only when its blob changed since the previous commit, and
// computes each file's ids from its own untrustworthy-EAN set — which is only
// the same answer when no retailer's listings sit in two files of one commit.
// These hold the cached fold to the original, byte for byte.
describe('the cached replay gives the original replay\'s answer', () => {
  /** The original, uncached fold, commit by commit. */
  function referenceReplay(at: string, commits: readonly CatalogueCommit[]): ReplayState {
    const state = emptyState();
    for (const commit of commits) replayCommit(at, state, commit);
    return state;
  }

  it.skipIf(isShallow())('on the first commits of real history', () => {
    const commits = commitsTouchingCatalogue(root).slice(0, 6);
    const cached = replay(root, commits, emptyState());
    const reference = referenceReplay(root, commits);
    expect(snapshot(cached)).toEqual(snapshot(reference));
    expect(render(cached, commits).body).toBe(render(reference, commits).body);
  });

  // A scratch repository in the shape of data/catalogue, built from real
  // listings out of today's snapshots (never made up), so both paths of
  // replayCommitCached are exercised: reuse of an unchanged blob, and the
  // fall back to replayCommit when one retailer's listings sit in two files.
  it('reuses unchanged files, falls back when a retailer spans two files, and agrees with the original either way', () => {
    const pick = (file: string, n: number): StoredListing[] => {
      const snap = JSON.parse(readFileSync(join(root, 'data/catalogue', file), 'utf8')) as { listings: StoredListing[] };
      return snap.listings
        .filter(
          (l) =>
            l.status === 'active' &&
            isAvailableListing(l) &&
            isCatalogueListing(l) &&
            typeof l.priceGbp === 'number' &&
            l.priceGbp > 0,
        )
        .slice(0, n);
    };
    const a = pick('allbeauty.json', 6);
    const b = pick('escentual.json', 6);
    expect(a.length).toBe(6);
    expect(b.length).toBe(6);

    const dir = mkdtempSync(join(tmpdir(), 'price-history-replay-'));
    try {
      const run = (args: string[], env?: NodeJS.ProcessEnv) =>
        execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
      run(['init', '-q', '-b', 'main']);
      run(['config', 'user.email', 'test@test']);
      run(['config', 'user.name', 'test']);
      mkdirSync(join(dir, 'data/catalogue'), { recursive: true });
      const write = (file: string, listings: StoredListing[]) =>
        writeFileSync(
          join(dir, 'data/catalogue', file),
          JSON.stringify({ retailerId: listings[0]?.retailerId ?? 'x', source: 'live', listings }),
        );
      const commit = (message: string, date: string) => {
        run(['add', '-A']);
        run(['commit', '-q', '-m', message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
      };

      write('a.json', a.slice(0, 4));
      write('b.json', b.slice(0, 4));
      commit('one', '2026-09-01T00:00:00Z');
      // b.json unchanged, so its blob is reused. a.json drops a listing and
      // reprices another, so both a gap marker and a new point happen.
      write('a.json', [...a.slice(1, 3), { ...a[3]!, priceGbp: a[3]!.priceGbp! + 1 }]);
      commit('two', '2026-09-02T00:00:00Z');
      // One retailer's listings in two files: the per-file EAN sets are no
      // longer the commit-wide one, so this commit must take the old path.
      write('c.json', a.slice(4, 6));
      commit('three', '2026-09-03T00:00:00Z');
      rmSync(join(dir, 'data/catalogue/c.json'));
      write('b.json', b.slice(2, 6));
      commit('four', '2026-09-04T00:00:00Z');

      const commits = commitsTouchingCatalogue(dir);
      expect(commits.length).toBe(4);
      const state = emptyState();
      const cache = emptyCache();
      const outcomes = commits.map((c) => replayCommitCached(dir, state, c, cache));
      expect(outcomes).toEqual(['cached', 'cached', 'fallback', 'cached']);
      const reference = referenceReplay(dir, commits);
      expect(snapshot(state)).toEqual(snapshot(reference));
      expect(render(state, commits).body).toBe(render(reference, commits).body);
      // The fixture really moved prices, so the comparison above is not two
      // empty states agreeing.
      expect(reference.history.size).toBeGreaterThan(0);
      expect([...reference.history.values()].some((series) => series.some((p) => p.priceGbp === null))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
