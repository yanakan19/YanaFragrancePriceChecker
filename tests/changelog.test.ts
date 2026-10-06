import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../demo/changelog.js';
import { changelogDateFieldToIsoDays } from '../src/changelog/changelogSuggest.js';

/** Hyphen, hyphen variants, en and em dashes, minus and figure dashes. */
const DASH = /[-‐‑‒–—―−﹘﹣－]/;

/** The limits in CLAUDE.md, "Update history". */
const MAX_GROUPS = 4;
const MAX_HEADING = 24;
const MAX_POINTS_PER_GROUP = 8;
const MAX_POINTS_PER_ENTRY = 12;
const MAX_POINT = 50;
/** Entries from this day on cover one day each; older ones may cover a range. */
const SINGLE_DAY_FROM = '2026-10-01';

const versionParts = (version: string) => /^v(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number) ?? [];

describe('update history shown on the home page', () => {
  it('has entries', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  for (const entry of CHANGELOG) {
    describe(`${entry.version} (${entry.date})`, () => {
      it('has a version like v3.95.0', () => {
        expect(versionParts(entry.version), entry.version).toHaveLength(3);
      });

      it('has one to four headed groups, each with its own heading', () => {
        expect(entry.groups.length).toBeGreaterThanOrEqual(1);
        expect(entry.groups.length).toBeLessThanOrEqual(MAX_GROUPS);
        const headings = entry.groups.map((g) => g.heading);
        expect(new Set(headings).size, headings.join(', ')).toBe(headings.length);
        for (const heading of headings) {
          expect(heading.trim(), 'empty heading').not.toBe('');
          expect(heading, heading).toBe(heading.trim());
          expect(heading.length, heading).toBeLessThanOrEqual(MAX_HEADING);
        }
      });

      it('has no empty group and only short points', () => {
        let total = 0;
        for (const group of entry.groups) {
          expect(group.points.length, `${group.heading} has no points`).toBeGreaterThanOrEqual(1);
          expect(group.points.length, `${group.heading} has too many points`).toBeLessThanOrEqual(MAX_POINTS_PER_GROUP);
          for (const p of group.points) {
            expect(p.trim(), 'empty point').not.toBe('');
            expect(p, p).toBe(p.trim());
            expect(p.length, p).toBeLessThanOrEqual(MAX_POINT);
          }
          total += group.points.length;
        }
        // Only major changes get a line: a busy day folds related changes
        // together or drops the least noticeable, it does not grow the entry.
        expect(total, 'too many points in one day').toBeLessThanOrEqual(MAX_POINTS_PER_ENTRY);
      });

      it('uses no hyphens or dashes', () => {
        for (const group of entry.groups) {
          for (const text of [group.heading, ...group.points]) expect(text, text).not.toMatch(DASH);
        }
      });

      it('has a date that parses', () => {
        expect(changelogDateFieldToIsoDays(entry.date), entry.date).not.toEqual([]);
      });

      it('covers a single day from 1 Oct 2026 on', () => {
        const days = changelogDateFieldToIsoDays(entry.date);
        if (days.length > 0 && days.at(-1)! >= SINGLE_DAY_FROM) {
          expect(days, `${entry.date} must be one day`).toHaveLength(1);
        }
      });
    });
  }

  it('has one entry per day: no date is covered twice', () => {
    const seen = new Map<string, string>();
    for (const entry of CHANGELOG) {
      for (const day of changelogDateFieldToIsoDays(entry.date)) {
        const earlier = seen.get(day);
        expect(earlier, `${day} is in both ${earlier} and ${entry.version}: merge them into one entry`).toBeUndefined();
        seen.set(day, entry.version);
      }
    }
  });

  it('lists the newest first', () => {
    const firstDay = (date: string) => changelogDateFieldToIsoDays(date)[0]!;
    const lastDay = (date: string) => changelogDateFieldToIsoDays(date).at(-1)!;
    for (let i = 1; i < CHANGELOG.length; i++) {
      const newer = CHANGELOG[i - 1]!;
      const older = CHANGELOG[i]!;
      expect(firstDay(newer.date) > lastDay(older.date), `${newer.version} is older than ${older.version}`).toBe(true);
    }
  });

  it('uses each version once, rising with the date', () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (let i = 1; i < CHANGELOG.length; i++) {
      const [a, b] = [versionParts(CHANGELOG[i - 1]!.version), versionParts(CHANGELOG[i]!.version)];
      const newerIsHigher = a[0]! !== b[0]! ? a[0]! > b[0]! : a[1]! !== b[1]! ? a[1]! > b[1]! : a[2]! > b[2]!;
      expect(newerIsHigher, `${CHANGELOG[i - 1]!.version} should be higher than ${CHANGELOG[i]!.version}`).toBe(true);
    }
  });
});
