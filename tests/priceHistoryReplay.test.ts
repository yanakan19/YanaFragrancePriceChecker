import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_VERSION,
  commitsTouchingCatalogue,
  emptyState,
  fromCheckpoint,
  registryFacts,
  render,
  replay,
  resumeFrom,
  ruleModules,
  rulesFingerprint,
  toCheckpoint,
  type Checkpoint,
  type ReplayState,
} from '../scripts/priceHistoryReplay.js';

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
    // The three shops that carry the flag today; a fourth joining is exactly
    // the kind of change that must invalidate every existing checkpoint.
    expect(facts.fragranceOnlyCatalogue).toEqual(['escentric-molecules', 'riiffs', 'zimaya']);
  });
});
