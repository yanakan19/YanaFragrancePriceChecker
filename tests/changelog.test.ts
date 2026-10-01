import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../demo/changelog.js';
import { changelogDateFieldToIsoDays } from '../src/changelog/changelogSuggest.js';

/** Hyphen, hyphen variants, en and em dashes, minus and figure dashes. */
const DASH = /[-‐‑‒–—―−﹘﹣－]/;

describe('update history shown on the home page', () => {
  it('has entries', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  for (const entry of CHANGELOG) {
    describe(`${entry.version} (${entry.date})`, () => {
      it('has a short title', () => {
        expect(entry.title.length, entry.title).toBeLessThanOrEqual(45);
        expect(entry.title.trim()).not.toBe('');
      });

      it('has one to three short points', () => {
        expect(entry.points.length).toBeGreaterThanOrEqual(1);
        expect(entry.points.length).toBeLessThanOrEqual(3);
        for (const p of entry.points) {
          expect(p.length, p).toBeLessThanOrEqual(50);
          expect(p.trim()).not.toBe('');
        }
      });

      it('uses no hyphens or dashes', () => {
        for (const text of [entry.title, ...entry.points]) expect(text, text).not.toMatch(DASH);
      });

      it('has a date that parses', () => {
        expect(changelogDateFieldToIsoDays(entry.date), entry.date).not.toEqual([]);
      });
    });
  }

  it('lists the newest first', () => {
    const lastDay = (date: string) => changelogDateFieldToIsoDays(date).at(-1)!;
    for (let i = 1; i < CHANGELOG.length; i++) {
      const newer = CHANGELOG[i - 1]!;
      const older = CHANGELOG[i]!;
      expect(lastDay(newer.date) >= lastDay(older.date), `${newer.version} is older than ${older.version}`).toBe(true);
    }
  });

  it('uses each version once', () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
