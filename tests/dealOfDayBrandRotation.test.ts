import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BRAND_REST_DAYS,
  chooseFrom,
  daysBetween,
  dealFor,
  restingBrands,
  type HistoryEntry,
  type Pick,
} from '../scripts/social-deal-of-day.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';

/**
 * The Deal of the Day takes the biggest saving not posted before, and Zimaya
 * came up on 2, 3 and 4 October 2026. The owner's rule: a new brand every week,
 * no repeats of the same brand within the week.
 */

const root = resolve(import.meta.dirname, '..');
const stored: HistoryEntry[] = JSON.parse(readFileSync(resolve(root, 'social/deal-of-the-day-history.json'), 'utf8'));

/** The history as it stood when the owner made the rule. */
const AS_OF_4_OCT: HistoryEntry[] = [
  { date: '2026-10-02', id: 'ean-6290171071983', brand: 'Zimaya' },
  { date: '2026-10-03', id: 'ean-6290171075189', brand: 'Zimaya' },
  { date: '2026-10-04', id: 'ean-6290171072874', brand: 'Zimaya' },
];

/** A qualifying deal, with only the facts the choice reads. */
function deal(id: string, brand: string, percent: number, saving = 10): Pick {
  return { frag: { id, brand } as Pick['frag'], best: {} as Pick['best'], delivered: 100 - saving, msrp: 100, percent };
}

const brandOf = (c: ReturnType<typeof chooseFrom>) => (c.pick ? c.pick.frag.brand : null);

describe('a brand rests for 7 days', () => {
  it('is the owner\'s seven days', () => {
    expect(BRAND_REST_DAYS).toBe(7);
  });

  it('counts whole days between two dates, across a month end and a clock change', () => {
    expect(daysBetween('2026-10-02', '2026-10-04')).toBe(2);
    expect(daysBetween('2026-09-28', '2026-10-05')).toBe(7);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2); // the clocks go back on 25 October
  });

  it('blocks a brand for the six days after it is posted and frees it on the seventh', () => {
    const history = [{ date: '2026-10-01', id: 'a', brand: 'Lattafa' }];
    const pool = [deal('l1', 'Lattafa', 50), deal('o1', 'Other', 10)];
    for (const day of ['02', '03', '04', '05', '06', '07']) {
      expect(brandOf(chooseFrom(pool, history, `2026-10-${day}`)), `day ${day}`).toBe('Other');
    }
    expect(brandOf(chooseFrom(pool, history, '2026-10-08'))).toBe('Lattafa');
  });

  it('treats a brand by its name, not its case, spacing or punctuation', () => {
    const history = [{ date: '2026-10-03', id: 'a', brand: 'Dolce & Gabbana' }];
    const pool = [deal('d1', 'Dolce&Gabbana', 50), deal('d2', 'DOLCE & GABBANA', 45), deal('o1', 'Other', 10)];
    expect(brandOf(chooseFrom(pool, history, '2026-10-04'))).toBe('Other');
  });

  it('does not let today\'s own entry block a rerun of today', () => {
    const history = [{ date: '2026-10-04', id: 'z1', brand: 'Zimaya' }];
    const pool = [deal('z1', 'Zimaya', 40), deal('o1', 'Other', 10)];
    expect(chooseFrom(pool, history, '2026-10-04')).toEqual({ pick: pool[0] });
  });

  it('counts a date after today as recent, so a clock that moved back never repeats a brand', () => {
    const history = [{ date: '2026-10-09', id: 'a', brand: 'Lattafa' }];
    expect(restingBrands(history, '2026-10-04').has('lattafa')).toBe(true);
  });
});

describe('the pick, otherwise unchanged', () => {
  it('is the biggest saving, then the biggest amount, then the id', () => {
    const pool = [deal('b', 'B', 30, 5), deal('a', 'A', 30, 5), deal('c', 'C', 30, 9), deal('d', 'D', 12)];
    expect(chooseFrom(pool, [], '2026-10-04')).toEqual({ pick: pool[2] });
    expect(chooseFrom(pool.slice(0, 2), [], '2026-10-04')).toEqual({ pick: pool[1] });
  });

  it('never posts a perfume twice, whatever its brand', () => {
    const history = [{ date: '2026-09-01', id: 'z1', brand: 'Zimaya' }];
    const pool = [deal('z1', 'Zimaya', 40), deal('z2', 'Zimaya', 20)];
    expect(chooseFrom(pool, history, '2026-10-04')).toEqual({ pick: pool[1] });
  });
});

describe('on the history the owner complained about', () => {
  // Zimaya on 2, 3 and 4 October, and the biggest saving on the list is Zimaya.
  const pool = [
    deal('z-new', 'Zimaya', 41),
    deal('z-next', 'Zimaya', 38),
    deal('rasasi', 'Rasasi', 33),
    deal('armaf', 'Armaf', 29),
  ];

  it('moves on to the biggest saving from another brand, the next day and for six days after the last Zimaya', () => {
    for (const day of ['05', '06', '07', '08', '09', '10']) {
      const choice = chooseFrom(pool, AS_OF_4_OCT, `2026-10-${day}`);
      expect(brandOf(choice), `day ${day}`).toBe('Rasasi');
    }
  });

  it('lets Zimaya back a week after its last post, not before', () => {
    expect(brandOf(chooseFrom(pool, AS_OF_4_OCT, '2026-10-10'))).toBe('Rasasi');
    expect(brandOf(chooseFrom(pool, AS_OF_4_OCT, '2026-10-11'))).toBe('Zimaya');
  });

  it('says so and picks nothing when only Zimaya qualifies, naming the brand and the day', () => {
    const choice = chooseFrom([pool[0]!, pool[1]!], AS_OF_4_OCT, '2026-10-05');
    expect(choice.pick).toBeNull();
    if (choice.pick !== null) throw new Error('unreachable');
    expect(choice.rule).toBe('brand-rest');
    expect(choice.reason).toContain('Zimaya on 2026-10-04');
    expect(choice.reason).toContain('Nothing was written');
  });

  it('says that no deal qualifies, as it always did, when none does', () => {
    const choice = chooseFrom([], AS_OF_4_OCT, '2026-10-05');
    expect(choice).toMatchObject({ pick: null, rule: 'no-deal' });
  });
});

describe('on the stored history', () => {
  const last = stored.at(-1)!;
  const tomorrow = new Date(Date.parse(`${last.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  it('has the brand of every entry, which the rule reads', () => {
    expect(stored.length).toBeGreaterThan(0);
    for (const h of stored) expect(h.brand, h.id).toBeTruthy();
  });

  it('keeps every brand posted in the last six days out of the next day\'s pick, however big its saving', () => {
    const resting = [...restingBrands(stored, tomorrow).values()];
    expect(resting.length).toBeGreaterThan(0);
    const pool = [
      ...resting.map((r, i) => deal(`resting-${i}`, r.brand, 90 - i)),
      deal('fresh-low', 'A Brand Nobody Posted', 5),
    ];
    const choice = chooseFrom(pool, stored, tomorrow);
    expect(brandOf(choice)).toBe('A Brand Nobody Posted');
  });

  it('would pick, from the live catalogue, a perfume of a brand that is not resting, or nothing', () => {
    const qualifying = DEMO_FRAGRANCES.map(dealFor).filter((p): p is Pick => p !== null);
    const resting = restingBrands(stored, tomorrow);
    const choice = chooseFrom(qualifying, stored, tomorrow);
    if (choice.pick) {
      expect(resting.has(choice.pick.frag.brand.toLowerCase().replace(/[^a-z0-9]+/g, ''))).toBe(false);
      // and it is the biggest saving among the brands that may be posted
      const allowed = qualifying.filter((p) => !resting.has(p.frag.brand.toLowerCase().replace(/[^a-z0-9]+/g, '')));
      expect(choice.pick.percent).toBe(Math.max(...allowed.filter((p) => !stored.some((h) => h.id === p.frag.id)).map((p) => p.percent)));
    } else {
      expect(choice.reason).toMatch(/Nothing was written|No perfume qualifies/);
    }
  });
});

describe('the run', () => {
  const source = readFileSync(resolve(root, 'scripts/social-deal-of-day.ts'), 'utf8');

  it('returns before it writes anything when nothing may be posted, and exits with a code a schedule can see', () => {
    const main = source.slice(source.indexOf('async function main'));
    const fallback = main.indexOf('choice.pick === null');
    expect(fallback).toBeGreaterThan(-1);
    expect(main.indexOf('return;', fallback)).toBeLessThan(main.indexOf('mkdirSync'));
    expect(main.slice(fallback, main.indexOf('const p = choice.pick'))).toContain('process.exitCode');
    expect(main.indexOf('writeFileSync(HISTORY')).toBeGreaterThan(main.indexOf('mkdirSync'));
  });

  it('holds a chosen perfume to the same rule unless the person says otherwise', () => {
    expect(source).toContain("flag('--allow-brand-repeat')");
    expect(source).toContain('restingBrands(history, today).get(brandKey(p.frag.brand))');
  });
});
