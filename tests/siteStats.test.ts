import { describe, expect, it } from 'vitest';
import {
  bucketKeys, bucketLabel, clickTops, countablePage, countryName, fillSeries, isAutomatedAgent, isEntry, niceScale,
  parseStats, referrerHost, seriesTotals, sinceFor, STATS_RANGES,
} from '../demo/siteStats.js';

/**
 * The visitor counter's rules and the developer dashboard's sums
 * (demo/siteStats.ts). The counter itself runs in the browser
 * (demo/siteCounter.ts); what it sends is decided here.
 */

describe('what the counter sends', () => {
  it('records the path only: no query string, no anchor, no trailing slash', () => {
    expect(countablePage('/search?q=my+name')).toBe('/search');
    expect(countablePage('/about/legal#privacy')).toBe('/about/legal');
    expect(countablePage('/brands/kayali/')).toBe('/brands/kayali');
    expect(countablePage('/')).toBe('/');
    expect(countablePage('/dior_sauvage_100ml')).toBe('/dior_sauvage_100ml');
  });

  it('never counts the owner\'s own dashboard', () => {
    expect(countablePage('/developer')).toBeNull();
    expect(countablePage('/developer?x=1')).toBeNull();
  });

  it('files an address the site would never write as /other, as the database does', () => {
    expect(countablePage('/someone@example.com')).toBe('/other');
    expect(countablePage(`/${'a'.repeat(300)}`)).toBe('/other');
    expect(countablePage('/caf%C3%A9')).toBe('/other');
  });

  it('keeps only the linking site\'s host, without www, and nothing from this site', () => {
    expect(referrerHost('https://www.google.com/search?q=sauvage', 'pricesniffs.space')).toBe('google.com');
    expect(referrerHost('https://pricesniffs.space/brands', 'pricesniffs.space')).toBe('');
    expect(referrerHost('https://www.pricesniffs.space/', 'pricesniffs.space')).toBe('');
    expect(referrerHost('', 'pricesniffs.space')).toBe('');
    expect(referrerHost('not a url', 'pricesniffs.space')).toBe('');
    expect(referrerHost('android-app://com.google.android.gm/', 'pricesniffs.space')).toBe('com.google.android.gm');
  });

  it('opens a visit from outside the site, never on a reload, a step back, or a page of this site', () => {
    expect(isEntry('', 'pricesniffs.space', 'navigate')).toBe(true);
    expect(isEntry('https://www.tiktok.com/', 'pricesniffs.space', 'navigate')).toBe(true);
    expect(isEntry('https://pricesniffs.space/deals', 'pricesniffs.space', 'navigate')).toBe(false);
    expect(isEntry('', 'pricesniffs.space', 'reload')).toBe(false);
    expect(isEntry('https://www.tiktok.com/', 'pricesniffs.space', 'back_forward')).toBe(false);
  });

  it('leaves crawlers and automated browsers out', () => {
    expect(isAutomatedAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isAutomatedAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36')).toBe(true);
    expect(isAutomatedAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false);
  });
});

describe('the buckets each range shows', () => {
  // 6 October 2026, 14:30 in London (BST, UTC+1): a Tuesday.
  const now = new Date('2026-10-06T13:30:00Z');

  it('has the five ranges the owner asked for, in order', () => {
    expect(STATS_RANGES.map((r) => r.label)).toEqual(['Hour', 'Day', 'Week', 'Month', 'Year']);
  });

  it('hour: the last 24 hours in London time, ending with this one', () => {
    const keys = bucketKeys('hour', now);
    expect(keys).toHaveLength(24);
    expect(keys.at(-1)).toBe('2026-10-06T14:00');
    expect(keys[0]).toBe('2026-10-05T15:00');
  });

  it('day: the last 30 London days', () => {
    const keys = bucketKeys('day', now);
    expect(keys).toHaveLength(30);
    expect(keys.at(-1)).toBe('2026-10-06T00:00');
    expect(keys[0]).toBe('2026-09-07T00:00');
  });

  it('week: twelve weeks, each starting on a Monday, as the database truncates them', () => {
    const keys = bucketKeys('week', now);
    expect(keys).toHaveLength(12);
    expect(keys.at(-1)).toBe('2026-10-05T00:00');
    expect(keys[0]).toBe('2026-07-20T00:00');
    for (const k of keys) expect(new Date(`${k}:00Z`).getUTCDay()).toBe(1);
  });

  it('month and year', () => {
    expect(bucketKeys('month', now)).toEqual([
      '2025-11-01T00:00', '2025-12-01T00:00', '2026-01-01T00:00', '2026-02-01T00:00', '2026-03-01T00:00', '2026-04-01T00:00',
      '2026-05-01T00:00', '2026-06-01T00:00', '2026-07-01T00:00', '2026-08-01T00:00', '2026-09-01T00:00', '2026-10-01T00:00',
    ]);
    expect(bucketKeys('year', now)).toEqual(['2022-01-01T00:00', '2023-01-01T00:00', '2024-01-01T00:00', '2025-01-01T00:00', '2026-01-01T00:00']);
  });

  it('the hour the clocks go back is one bucket, as the database folds it', () => {
    // 25 October 2026: 01:00 to 02:00 BST, then 01:00 to 02:00 GMT again.
    const keys = bucketKeys('hour', new Date('2026-10-25T03:30:00Z'));
    expect(keys.filter((k) => k === '2026-10-25T01:00')).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a week starting on a Sunday night still belongs to the Monday before', () => {
    // Sunday 11 October 2026, 23:30 London.
    expect(bucketKeys('week', new Date('2026-10-11T22:30:00Z')).at(-1)).toBe('2026-10-05T00:00');
  });

  it('asks the database from before the first bucket begins', () => {
    for (const r of STATS_RANGES) {
      const first = bucketKeys(r.id, now)[0]!;
      // The first bucket starts at its London wall clock time, at most an hour
      // before the same figures read as UTC.
      expect(sinceFor(r.id, now).getTime()).toBeLessThanOrEqual(new Date(`${first}:00Z`).getTime() - 3_600_000);
    }
  });

  it('labels bars briefly and tooltips in full', () => {
    expect(bucketLabel('hour', '2026-10-06T14:00')).toBe('14:00');
    expect(bucketLabel('hour', '2026-10-06T14:00', true)).toBe('6 Oct, 14:00');
    expect(bucketLabel('day', '2026-10-06T00:00')).toBe('6 Oct');
    expect(bucketLabel('week', '2026-10-05T00:00', true)).toBe('Week from 5 Oct');
    expect(bucketLabel('month', '2026-10-01T00:00', true)).toBe('October 2026');
    expect(bucketLabel('year', '2026-01-01T00:00')).toBe('2026');
  });
});

describe('summing what site_stats returns', () => {
  const raw = {
    series: [
      ['2026-10-05T00:00', 40, 12],
      ['2026-10-06T00:00', '25', '9'],
      ['2026-09-01T00:00', 99, 99], // before the range: not drawn
      ['bad key', 5, 5],
    ],
    countries: [['GB', 60, 18], ['', 4, 3], ['gb', 1, 1]],
    pages: [['/', 30], ['/dior_sauvage_100ml', 12], ['no slash', 3]],
    sources: [['google.com', 7], ['', 2]],
    clicks: [
      ['ean-1', 'Dior', 'boots', 5],
      ['ean-1', 'Dior', 'allbeauty', 2],
      ['ean-2', 'Lattafa', 'allbeauty', 4],
      ['ean-3', 'Dior', 'boots', 1],
      ['', 'X', 'boots', 9],
      ['ean-4', 'X', 'boots', -3],
    ],
    extra: 'ignored',
  };

  it('keeps only rows of the right shape', () => {
    const s = parseStats(raw);
    expect(s.series.map((p) => p.key)).toEqual(['2026-10-05T00:00', '2026-10-06T00:00', '2026-09-01T00:00']);
    expect(s.series[1]).toEqual({ key: '2026-10-06T00:00', views: 25, visits: 9 });
    expect(s.countries.map((c) => c.code)).toEqual(['GB', '']);
    expect(s.pages.map((p) => p.page)).toEqual(['/', '/dior_sauvage_100ml']);
    expect(s.sources).toEqual([{ host: 'google.com', visits: 7 }]);
    expect(s.clicks).toHaveLength(4);
    expect(parseStats(null)).toEqual({ series: [], countries: [], pages: [], sources: [], clicks: [] });
    expect(parseStats('nonsense').series).toEqual([]);
  });

  it('fills every bucket, zero where nobody came, and ignores totals outside the range', () => {
    const keys = ['2026-10-04T00:00', '2026-10-05T00:00', '2026-10-06T00:00'];
    const filled = fillSeries(keys, parseStats(raw).series);
    expect(filled).toEqual([
      { key: '2026-10-04T00:00', views: 0, visits: 0 },
      { key: '2026-10-05T00:00', views: 40, visits: 12 },
      { key: '2026-10-06T00:00', views: 25, visits: 9 },
    ]);
    expect(seriesTotals(filled)).toEqual({ views: 65, visits: 21 });
  });

  it('ranks the most clicked products, brands and shops', () => {
    const tops = clickTops(parseStats(raw).clicks);
    expect(tops.total).toBe(12);
    expect(tops.products).toEqual([{ key: 'ean-1', count: 7 }, { key: 'ean-2', count: 4 }, { key: 'ean-3', count: 1 }]);
    expect(tops.brands).toEqual([{ key: 'Dior', count: 8 }, { key: 'Lattafa', count: 4 }]);
    expect(tops.shops).toEqual([{ key: 'allbeauty', count: 6 }, { key: 'boots', count: 6 }]);
    expect(clickTops(parseStats(raw).clicks, 1).products).toHaveLength(1);
  });

  it('scales the chart to a clean top with at most a handful of gridlines', () => {
    expect(niceScale(0)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
    expect(niceScale(3)).toEqual({ top: 3, ticks: [0, 1, 2, 3] });
    expect(niceScale(7)).toEqual({ top: 8, ticks: [0, 2, 4, 6, 8] });
    expect(niceScale(1234)).toEqual({ top: 1500, ticks: [0, 500, 1000, 1500] });
    for (const max of [1, 9, 17, 101, 4999]) {
      const { top, ticks } = niceScale(max);
      expect(top).toBeGreaterThanOrEqual(max);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it('names countries, and says Unknown where none was known', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName('')).toBe('Unknown');
  });
});
