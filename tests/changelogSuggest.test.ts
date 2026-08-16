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
  parseChangelogDateLabel,
  changelogDateFieldToIsoDays,
  coveredChangelogDays,
  newestCoveredDay,
  findUnrecordedWorkDays,
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

describe('parseChangelogDateLabel', () => {
  it('reads the "D Mon YYYY" style the changelog is written in', () => {
    expect(parseChangelogDateLabel('15 Aug 2026')).toBe('2026-08-15');
    expect(parseChangelogDateLabel('5 Aug 2026')).toBe('2026-08-05');
    expect(parseChangelogDateLabel('1 Jan 2026')).toBe('2026-01-01');
  });

  it('round-trips with toChangelogDateLabel', () => {
    for (const iso of ['2026-08-01', '2026-08-15', '2026-12-31']) {
      expect(parseChangelogDateLabel(toChangelogDateLabel(iso))).toBe(iso);
    }
  });

  it('returns null rather than inventing a date it cannot read', () => {
    expect(parseChangelogDateLabel('2026-08-15')).toBeNull();
    expect(parseChangelogDateLabel('4 to 5 Aug 2026')).toBeNull();
    expect(parseChangelogDateLabel('15 Foo 2026')).toBeNull();
    expect(parseChangelogDateLabel('')).toBeNull();
  });

  it('rejects a day that does not exist in that month', () => {
    expect(parseChangelogDateLabel('31 Feb 2026')).toBeNull();
    expect(parseChangelogDateLabel('31 Apr 2026')).toBeNull();
  });
});

describe('changelogDateFieldToIsoDays', () => {
  it('expands a single-day field to that one day', () => {
    expect(changelogDateFieldToIsoDays('14 Aug 2026')).toEqual(['2026-08-14']);
  });

  it('expands the short range spelling the real file uses', () => {
    expect(changelogDateFieldToIsoDays('4 to 5 Aug 2026')).toEqual(['2026-08-04', '2026-08-05']);
  });

  it('expands the fully-spelled range spelling', () => {
    expect(changelogDateFieldToIsoDays('1 Aug 2026 to 2 Aug 2026')).toEqual(['2026-08-01', '2026-08-02']);
  });

  it('includes the days in the middle of a range, not just its ends', () => {
    expect(changelogDateFieldToIsoDays('1 to 4 Aug 2026')).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ]);
  });

  it('claims nothing at all for a spelling it cannot read', () => {
    expect(changelogDateFieldToIsoDays('sometime last week')).toEqual([]);
    expect(changelogDateFieldToIsoDays('4 to 5 Foo 2026')).toEqual([]);
    expect(changelogDateFieldToIsoDays('')).toEqual([]);
  });
});

describe('coveredChangelogDays / newestCoveredDay', () => {
  const fields = ['14 Aug 2026', '4 to 5 Aug 2026', '1 Aug 2026'];

  it('collects every day any entry covers', () => {
    expect([...coveredChangelogDays(fields)].sort()).toEqual([
      '2026-08-01',
      '2026-08-04',
      '2026-08-05',
      '2026-08-14',
    ]);
  });

  it('takes the newest of them as the watermark', () => {
    expect(newestCoveredDay(fields)).toBe('2026-08-14');
  });

  it('returns null when nothing parses, so the caller can refuse to guess', () => {
    expect(newestCoveredDay(['who knows'])).toBeNull();
    expect(newestCoveredDay([])).toBeNull();
  });
});

describe('findUnrecordedWorkDays — the missed-day bug', () => {
  /**
   * The real shape of the 16 Aug 2026 tree, reduced: the changelog's newest
   * entry was 14 Aug, while 15 and 16 Aug both had real reader-facing work
   * sitting under a pile of pipeline commits.
   */
  const commits = [
    commit('h16', '2026-08-16T11:33:05+00:00', 'Image links: 2026-08-16'),
    commit('r16', '2026-08-16T00:35:17+00:00', 'Virtual Yanny: read a whole messy sentence'),
    commit('h15b', '2026-08-15T23:30:51+00:00', 'Image links: 2026-08-15'),
    commit('r15', '2026-08-15T11:09:45+00:00', 'Repair Awin feed mojibake at the point of entry'),
    commit('h15a', '2026-08-15T09:38:58+00:00', 'Harvest: real prices 2026-08-15'),
    commit('h14', '2026-08-14T22:56:33+00:00', 'Harvest: real prices 2026-08-14'),
    commit('r14', '2026-08-14T10:00:00+00:00', 'Something already written up'),
  ];
  const changelogDates = ['14 Aug 2026', '13 Aug 2026'];

  it('reports the OLDEST unrecorded day, not the newest — the whole point', () => {
    const found = findUnrecordedWorkDays(commits, changelogDates);
    expect(found.targetDate).toBe('2026-08-15');
  });

  it('still knows about the later unrecorded days, so none of them is lost', () => {
    const found = findUnrecordedWorkDays(commits, changelogDates);
    expect(found.daysWithWork).toEqual(['2026-08-15', '2026-08-16']);
    expect(found.candidateDays).toEqual(['2026-08-15', '2026-08-16']);
  });

  it('regression: the previous behaviour skipped 15 Aug permanently', () => {
    // deriveTargetDate is what the script used to report on. It picks 16 Aug,
    // and nothing ever brought it back to 15 Aug afterwards.
    expect(deriveTargetDate(commits)).toBe('2026-08-16');
    expect(findUnrecordedWorkDays(commits, changelogDates).targetDate).not.toBe(deriveTargetDate(commits));
  });

  it('once the oldest gap is written up, it moves on to the next one', () => {
    const after = findUnrecordedWorkDays(commits, [...changelogDates, '15 Aug 2026']);
    expect(after.targetDate).toBe('2026-08-16');
    expect(after.daysWithWork).toEqual(['2026-08-16']);
  });

  it('reports nothing outstanding once every day is recorded', () => {
    const after = findUnrecordedWorkDays(commits, [...changelogDates, '15 Aug 2026', '16 Aug 2026']);
    expect(after.candidateDays).toEqual([]);
    expect(after.daysWithWork).toEqual([]);
    expect(after.targetDate).toBeNull();
  });

  it('never reaches back past the newest recorded day into settled curation', () => {
    // 8 and 10 Aug 2026 really do have non-pipeline commits and really have no
    // entry of their own — that work was folded into neighbouring releases.
    // Those are decisions already taken, not gaps to re-raise.
    const withOldWork = [
      ...commits,
      commit('old10', '2026-08-10T19:32:26+00:00', 'Wishlist functionality'),
      commit('old08', '2026-08-08T12:16:39+00:00', 'Add phased execution plan'),
    ];
    const found = findUnrecordedWorkDays(withOldWork, changelogDates);
    expect(found.watermark).toBe('2026-08-14');
    expect(found.candidateDays).toEqual(['2026-08-15', '2026-08-16']);
    expect(found.targetDate).toBe('2026-08-15');
  });

  it('treats an unrecorded but all-pipeline day as genuinely silent, not as work', () => {
    const quiet = [
      commit('h17', '2026-08-17T09:00:00+00:00', 'Harvest: real prices 2026-08-17'),
      commit('h17b', '2026-08-17T03:00:00+00:00', 'Awin feed sync: 2026-08-17'),
      commit('h14', '2026-08-14T22:56:33+00:00', 'Harvest: real prices 2026-08-14'),
    ];
    const found = findUnrecordedWorkDays(quiet, changelogDates);
    expect(found.candidateDays).toEqual(['2026-08-17']);
    expect(found.daysWithWork).toEqual([]);
    expect(found.targetDate).toBeNull();
  });

  it('does not treat a day sitting inside a recorded range as a gap', () => {
    const spanning = [
      commit('a', '2026-08-05T10:00:00+00:00', 'Real work mid-range'),
      commit('b', '2026-08-04T10:00:00+00:00', 'Real work at the start'),
    ];
    const found = findUnrecordedWorkDays(spanning, ['4 to 5 Aug 2026']);
    expect(found.candidateDays).toEqual([]);
    expect(found.targetDate).toBeNull();
  });

  it('reports on a day only from commits actually made on that day', () => {
    const found = findUnrecordedWorkDays(commits, changelogDates);
    expect(found.targetDate).toBe('2026-08-15');
    const real = nonPipelineCommits(commitsOnDate(commits, found.targetDate as string));
    expect(real.map((c) => c.hash)).toEqual(['r15']);
  });

  it('has no opinion at all when the changelog yields no dates', () => {
    const found = findUnrecordedWorkDays(commits, []);
    expect(found.watermark).toBeNull();
    // Everything is a candidate; the script refuses to act on this and exits 2
    // rather than treating an unreadable changelog as an empty one.
    expect(found.candidateDays).toEqual(['2026-08-14', '2026-08-15', '2026-08-16']);
  });
});

describe('findUnrecordedWorkDays against the real demo/changelog.ts', () => {
  it('never picks a day the real file already covers', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const dates = extractChangelogDates(readFileSync(resolve(root, 'demo/changelog.ts'), 'utf8'));

    const commits = [
      commit('a', '2026-08-14T10:00:00+00:00', 'Work on a recorded day'),
      commit('b', '2026-08-05T10:00:00+00:00', 'Work inside the recorded 4-to-5 Aug range'),
    ];
    const found = findUnrecordedWorkDays(commits, dates);
    for (const day of found.candidateDays) {
      expect(changelogHasDate(dates, toChangelogDateLabel(day))).toBe(false);
    }
    expect(found.targetDate).toBeNull();
  });
});
