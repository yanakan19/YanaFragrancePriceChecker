import { describe, expect, it } from 'vitest';
import {
  isPipelineCommit,
  parseCommitLog,
  commitUtcDate,
  deriveTargetDate,
  commitsOnDate,
  nonPipelineCommits,
  toChangelogDateLabel,
  extractChangelogDates,
  changelogHasDate,
  PIPELINE_PREFIXES,
  type CommitEntry,
} from '../src/changelog/changelogSuggest.js';

function commit(hash: string, isoDate: string, subject: string): CommitEntry {
  return { hash, isoDate, subject };
}

describe('isPipelineCommit', () => {
  it('flags every documented automated prefix', () => {
    for (const prefix of PIPELINE_PREFIXES) {
      expect(isPipelineCommit(`${prefix} 2026-08-15`)).toBe(true);
    }
  });

  it('does not flag a real commit that merely mentions a pipeline word mid-sentence', () => {
    expect(isPipelineCommit('Fix harvest retry logic double-counting stock')).toBe(false);
    expect(isPipelineCommit('Add retailer registry entry for Escentric Molecules')).toBe(false);
  });

  it('only matches at the start of the subject, not anywhere in it', () => {
    expect(isPipelineCommit('Redo the Harvest: real prices summary formatting')).toBe(false);
  });
});

describe('parseCommitLog', () => {
  it('parses %H%x1f%cI%x1f%s formatted lines', () => {
    const raw = [
      'abc123\x1f2026-08-15T09:38:58+00:00\x1fHarvest: real prices 2026-08-15',
      'def456\x1f2026-08-15T08:37:25+00:00\x1fTop Deals Today: 2026-08-15',
    ].join('\n');
    expect(parseCommitLog(raw)).toEqual([
      commit('abc123', '2026-08-15T09:38:58+00:00', 'Harvest: real prices 2026-08-15'),
      commit('def456', '2026-08-15T08:37:25+00:00', 'Top Deals Today: 2026-08-15'),
    ]);
  });

  it('preserves a colon inside the subject instead of splitting on it', () => {
    const raw = 'abc\x1f2026-08-15T09:00:00+00:00\x1fFix: delivery threshold: off by one';
    expect(parseCommitLog(raw)[0]?.subject).toBe('Fix: delivery threshold: off by one');
  });

  it('ignores blank lines and trailing whitespace', () => {
    const raw = '\n  \nabc\x1f2026-08-15T09:00:00+00:00\x1fReal work\n\n';
    expect(parseCommitLog(raw)).toHaveLength(1);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCommitLog('')).toEqual([]);
  });
});

describe('commitUtcDate', () => {
  it('reads the UTC calendar date regardless of the recorded offset', () => {
    expect(commitUtcDate('2026-08-15T23:59:00+00:00')).toBe('2026-08-15');
    // 23:30 in UTC-07:00 is 06:30 the next day in UTC.
    expect(commitUtcDate('2026-08-15T23:30:00-07:00')).toBe('2026-08-16');
  });

  it('throws rather than silently returning an invalid date', () => {
    expect(() => commitUtcDate('not-a-date')).toThrow();
  });
});

describe('deriveTargetDate — the live-clock bug fix', () => {
  it('takes the newest commit (first in git-log order), not the current wall clock', () => {
    const commits = [
      commit('c3', '2026-08-15T23:58:00+00:00', 'Harvest: real prices 2026-08-15'),
      commit('c2', '2026-08-15T10:00:00+00:00', 'Fix a real bug'),
      commit('c1', '2026-08-14T09:00:00+00:00', 'Harvest: real prices 2026-08-14'),
    ];
    expect(deriveTargetDate(commits)).toBe('2026-08-15');
  });

  it('falls back honestly to the last real day when nothing committed "today"', () => {
    const commits = [commit('c1', '2026-08-13T09:00:00+00:00', 'Last thing that happened')];
    expect(deriveTargetDate(commits)).toBe('2026-08-13');
  });

  it('returns null rather than guessing when there are no commits at all', () => {
    expect(deriveTargetDate([])).toBeNull();
  });
});

describe('commitsOnDate / nonPipelineCommits — the filtering the changelog depends on', () => {
  const commits = [
    commit('c1', '2026-08-15T09:38:58+00:00', 'Harvest: real prices 2026-08-15'),
    commit('c2', '2026-08-15T08:37:25+00:00', 'Top Deals Today: 2026-08-15'),
    commit('c3', '2026-08-15T08:34:18+00:00', 'Shipping terms: what each delivery page says 2026-08-15'),
    commit('c4', '2026-08-15T07:00:00+00:00', 'Escentric Molecules is now a confirmed UK retailer'),
    commit('c5', '2026-08-14T22:56:33+00:00', 'Harvest: real prices 2026-08-14'),
  ];

  it('selects only commits on the given UTC day', () => {
    expect(commitsOnDate(commits, '2026-08-15').map((c) => c.hash)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('drops every automated pipeline commit, leaving only real work', () => {
    const day = commitsOnDate(commits, '2026-08-15');
    expect(nonPipelineCommits(day).map((c) => c.hash)).toEqual(['c4']);
  });

  it('reports an all-pipeline day as genuinely empty, matching real 15 Aug 2026 commits so far', () => {
    const allPipeline = [
      commit('c1', '2026-08-15T09:38:58+00:00', 'Harvest: real prices 2026-08-15'),
      commit('c2', '2026-08-15T08:37:04+00:00', 'Awin feed sync: 2026-08-15'),
      commit('c3', '2026-08-15T07:40:01+00:00', 'Image links: 2026-08-15'),
    ];
    expect(nonPipelineCommits(commitsOnDate(allPipeline, '2026-08-15'))).toEqual([]);
  });
});

describe('toChangelogDateLabel', () => {
  it('matches the "D Mon YYYY" style already used in demo/changelog.ts', () => {
    expect(toChangelogDateLabel('2026-08-15')).toBe('15 Aug 2026');
    expect(toChangelogDateLabel('2026-08-05')).toBe('5 Aug 2026');
    expect(toChangelogDateLabel('2026-01-01')).toBe('1 Jan 2026');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => toChangelogDateLabel('15 Aug 2026')).toThrow();
    expect(() => toChangelogDateLabel('2026-8-5')).toThrow();
  });
});

describe('extractChangelogDates / changelogHasDate — the duplicate-entry guard', () => {
  const source = `
    export const CHANGELOG = [
      { version: 'v3.5.0', date: '14 Aug 2026', title: 'x', points: [] },
      { version: 'v3.0.0', date: '4 to 5 Aug 2026', title: 'y', points: [] },
    ];
  `;

  it('extracts every date literal in file order', () => {
    expect(extractChangelogDates(source)).toEqual(['14 Aug 2026', '4 to 5 Aug 2026']);
  });

  it('matches an exact single-day entry', () => {
    expect(changelogHasDate(extractChangelogDates(source), '14 Aug 2026')).toBe(true);
  });

  it('matches a date at either end of a hand-written range', () => {
    const dates = extractChangelogDates(source);
    expect(changelogHasDate(dates, '4 Aug 2026')).toBe(true);
    expect(changelogHasDate(dates, '5 Aug 2026')).toBe(true);
  });

  it('does not false-positive on a day that is not actually covered', () => {
    const dates = extractChangelogDates(source);
    expect(changelogHasDate(dates, '15 Aug 2026')).toBe(false);
    // Regression guard: "5 Aug 2026" is a literal substring of "4 to 5 Aug 2026",
    // so a naive .includes() check would wrongly cover neighbouring days too.
    expect(changelogHasDate(dates, '45 Aug 2026')).toBe(false);
  });

  it('reads the real demo/changelog.ts file without throwing', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const real = readFileSync(resolve(root, 'demo/changelog.ts'), 'utf8');
    const dates = extractChangelogDates(real);
    expect(dates.length).toBeGreaterThan(0);
    expect(changelogHasDate(dates, '14 Aug 2026')).toBe(true);
    // The real file's actual "4 to 5 Aug 2026" range, both ends.
    expect(changelogHasDate(dates, '4 Aug 2026')).toBe(true);
    expect(changelogHasDate(dates, '5 Aug 2026')).toBe(true);
    // 15 Aug 2026 must not already be recorded — that is the whole premise
    // of this task's backfill check.
    expect(changelogHasDate(dates, '15 Aug 2026')).toBe(false);
  });
});
