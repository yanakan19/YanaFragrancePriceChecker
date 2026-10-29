import { describe, expect, it } from 'vitest';
import {
  CRAWL_WORKFLOW, crawlLimitFrom, pingSupabase, render, slowestRun, summariseFreshness, summariseLinks, summarisePhotos, summariseRuns, summariseShops, supabaseConfigFrom, worstCases,
  type HarvestLite, type ProductLite, type RunLite, type WorstCaseInput,
} from '../scripts/weekly-health.js';

const shop = (id: string, errors: string[] = [], priced = 5) => ({ retailerId: id, priced, errorCount: errors.length, errors });
const harvest: HarvestLite = {
  complete: true,
  endedReason: 'swept-every-shop',
  notReached: [],
  shops: [shop('a'), shop('b', ["stopped early: exceeded this shop's time budget"]), shop('c', ['https://c.test/x: HTTP 503'], 0)],
  freshness: {
    a: { shown: 10, over48h: 0, answered: true },
    b: { shown: 20, over48h: 3, answered: true },
    c: { shown: 500, over48h: 0, answered: false },
    d: { shown: 40, over48h: 0, answered: false },
  },
};

describe('weekly health: shops', () => {
  const s = summariseShops(harvest);
  it('counts the shops that answered', () => {
    expect(s.total).toBe(4);
    expect(s.answered).toBe(2);
  });
  it('lists shops that did not answer, biggest first', () => {
    expect(s.silent.map((x) => x.id)).toEqual(['c', 'd']);
  });
  it('separates a time budget stop from an error', () => {
    expect(s.timeBudget).toEqual(['b']);
    expect(s.errored.find((e) => e.id === 'c')?.first).toContain('HTTP 503');
  });
  it('lists shops with listings older than 48 hours', () => {
    expect(s.stale).toEqual([{ id: 'b', over48h: 3, shown: 20 }]);
  });
});

describe('weekly health: feed and import shops, and shops the sweep did not reach', () => {
  const h: HarvestLite = {
    complete: true,
    endedReason: 'deadline',
    notReached: ['late'],
    shops: [shop('swept')],
    freshness: {
      swept: { shown: 10, over48h: 0, answered: true },
      silent: { shown: 30, over48h: 0, answered: false },
      late: { shown: 40, over48h: 0, answered: false },
      awin: { shown: 9000, over48h: 0, answered: false, source: 'feed' },
      staleawin: { shown: 800, over48h: 120, answered: false, source: 'feed' },
      saved: { shown: 0, over48h: 0, answered: false, source: 'import' },
    },
  };
  const s = summariseShops(h);
  it('does not call a feed or an import shop silent, and counts only swept shops as asked', () => {
    expect(s.silent.map((x) => x.id)).toEqual(['silent']);
    expect(s.total).toBe(3);
    expect(s.answered).toBe(1);
  });
  it('does not call a shop silent that the sweep ran out of time before asking: it is listed as not reached', () => {
    expect(s.silent.map((x) => x.id)).not.toContain('late');
    expect(s.notReached).toEqual(['late']);
  });
  it('lists feed and import shops by their source, with the age of their listings', () => {
    expect(s.feeds).toEqual([
      { id: 'awin', source: 'feed', shown: 9000, over48h: 0 },
      { id: 'staleawin', source: 'feed', shown: 800, over48h: 120 },
      { id: 'saved', source: 'import', shown: 0, over48h: 0 },
    ]);
  });
  it('raises a stale feed as a worst case, and never an import', () => {
    const lines = worstCases({ shops: s, freshness: null, photos: null, links: null, deploy: null, crawl: null, runs: null });
    expect(lines.some((l) => l.includes('staleawin') && l.includes('feed sync'))).toBe(true);
    expect(lines.some((l) => l.includes('`awin`') || l.includes('`saved`'))).toBe(false);
  });
});

describe('weekly health: runs', () => {
  const at = (m: number) => new Date(Date.UTC(2026, 9, 12, 8, m)).toISOString();
  const r = (conclusion: string, start: number, end: number, status = 'completed'): RunLite => ({ workflow: 'W', status, conclusion, startedAt: at(start), updatedAt: at(end) });
  it('counts failures and cancellations and leaves cancelled runs out of the durations', () => {
    const [w] = summariseRuns([r('success', 0, 10), r('success', 0, 20), r('failure', 0, 30), r('cancelled', 0, 55), r('success', 0, 5, 'in_progress')]);
    expect(w).toMatchObject({ workflow: 'W', runs: 4, failed: 1, cancelled: 1, maxMin: 30, medianMin: 20 });
  });
  it('puts the workflow with the longest run first', () => {
    const rows = summariseRuns([{ ...r('success', 0, 5), workflow: 'short' }, { ...r('success', 0, 90), workflow: 'long' }]);
    expect(rows.map((x) => x.workflow)).toEqual(['long', 'short']);
  });
});

describe('weekly health: supabase read', () => {
  it('reads the project address and public key from the page source, as written there', () => {
    const src = "export const SUPABASE_URL: string = 'https://x.supabase.co';\nexport const SUPABASE_ANON_KEY: string =\n  'k.e.y';\n";
    expect(supabaseConfigFrom(src)).toEqual({ url: 'https://x.supabase.co', key: 'k.e.y' });
    expect(supabaseConfigFrom('nothing here')).toBeNull();
  });
  it('reports the status, and null when there is no answer', async () => {
    expect(await pingSupabase('https://x.test', 'k', (async () => new Response('[]', { status: 200 })) as typeof fetch)).toEqual({ status: 200 });
    expect(await pingSupabase('https://x.test', 'k', (async () => { throw new Error('down'); }) as typeof fetch)).toEqual({ status: null });
  });
  it('asks the owner to look at the dashboard when it does not answer', () => {
    const md = render({ shops: summariseShops(harvest), harvest, runs: [], ping: { status: null }, now: new Date('2026-10-19T00:00:00Z') });
    expect(md).toContain('Supabase dashboard');
    expect(md).toContain('Written to the job summary only');
  });
});

describe('weekly health: price freshness per shop', () => {
  const f = summariseFreshness({
    freshness: {
      fresh: { shown: 100, over24h: 0, over48h: 0, answered: true },
      day: { shown: 50, over24h: 40, over48h: 0, answered: true },
      old: { shown: 10, over24h: 6, over48h: 5, answered: true },
      empty: { shown: 0, over24h: 0, over48h: 0, answered: false },
      legacy: { shown: 20, over48h: 2, answered: true },
    },
  });
  it('gives shares of the shown listings, the stalest by 48 hours first, then by 24 hours', () => {
    expect(f.map((x) => x.id)).toEqual(['old', 'legacy', 'day', 'fresh']);
    expect(f[0]).toMatchObject({ share48: 0.5, share24: 0.6 });
  });
  it('leaves out a shop with nothing shown, and counts a 48 hour old listing as over 24 hours where the report has no 24 hour count', () => {
    expect(f.some((x) => x.id === 'empty')).toBe(false);
    expect(f.find((x) => x.id === 'legacy')).toMatchObject({ over24h: 2, share24: 0.1 });
  });
});

const product = (brand: string, name: string, shops: string[], hasPhoto = true, fragranticaDirect = true): ProductLite => ({ brand, name, shops, hasPhoto, fragranticaDirect });

describe('weekly health: photos and links', () => {
  const products = [
    product('A', 'One', ['s1', 's2', 's3'], false, false),
    product('B', 'Two', ['s1', 's2']),
    product('C', 'Three', ['s1', 's1'], false),
    product('D', 'Four', ['s2'], true, false),
  ];
  it('counts products without a photo per shop, the shop with most first, a shop listed twice counted once', () => {
    const p = summarisePhotos(products);
    expect(p).toMatchObject({ products: 4, withoutPhoto: 2 });
    expect(p.perShop[0]).toEqual({ id: 's1', listed: 3, withoutPhoto: 2 });
    expect(p.perShop.map((x) => x.id)).toEqual(['s1', 's2', 's3']);
  });
  it('names the most stocked products without a photo, most shops first, one per scent, up to the limit', () => {
    expect(summarisePhotos([...products, product('A', 'One', ['s9'], false)]).mostStocked.filter((x) => x.name === 'One')).toHaveLength(1);
    expect(summarisePhotos(products).mostStocked).toEqual([{ brand: 'A', name: 'One', shops: 3 }, { brand: 'C', name: 'Three', shops: 1 }]);
    expect(summarisePhotos(products, 1).mostStocked).toHaveLength(1);
  });
  it('checks the links of the most stocked only, and lists those on the fallback search', () => {
    expect(summariseLinks(products, 2)).toEqual({ checked: 2, fallback: [{ brand: 'A', name: 'One', shops: 3 }] });
    expect(summariseLinks(products).fallback.map((x) => x.name)).toEqual(['One', 'Four']);
    // One per scent: a second size of One is not a second product of the 200.
    expect(summariseLinks([products[0]!, product('A', 'One', ['s9'], true, false), products[1]!], 2).checked).toBe(2);
  });
});

describe('weekly health: deploy size and crawl time', () => {
  it('reads the crawl job limit as the largest job level timeout in its workflow', () => {
    const yaml = 'jobs:\n  a:\n    timeout-minutes: 5\n    steps:\n      - run: x\n        timeout-minutes: 300\n  b:\n    timeout-minutes: 120\n';
    expect(crawlLimitFrom(yaml)).toBe(120);
    expect(crawlLimitFrom('jobs: {}')).toBeNull();
    // Split into jobs run one after another (the sweep groups run side by side as one): their limits add.
    const split = 'jobs:\n  guard:\n    timeout-minutes: 5\n  prepare:\n    timeout-minutes: 45\n    steps:\n      - run: x\n        timeout-minutes: 300\n  sweep:\n    timeout-minutes: 80\n  houses:\n    timeout-minutes: 40\n  crawl:\n    timeout-minutes: 55\n';
    expect(crawlLimitFrom(split)).toBe(180);
  });
  it('finds the slowest completed run of the crawl, a cancelled one included', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 12, 8, m)).toISOString();
    const runs: RunLite[] = [
      { workflow: CRAWL_WORKFLOW, status: 'completed', conclusion: 'success', startedAt: at(0), updatedAt: at(50) },
      { workflow: CRAWL_WORKFLOW, status: 'completed', conclusion: 'cancelled', startedAt: at(0), updatedAt: at(119) },
      { workflow: 'Other', status: 'completed', conclusion: 'success', startedAt: at(0), updatedAt: at(500) },
      { workflow: CRAWL_WORKFLOW, status: 'in_progress', conclusion: null, startedAt: at(0), updatedAt: at(200) },
    ];
    expect(slowestRun(runs, CRAWL_WORKFLOW)).toMatchObject({ minutes: 119, conclusion: 'cancelled' });
    expect(slowestRun([], CRAWL_WORKFLOW)).toBeNull();
  });
});

describe('weekly health: the worst cases', () => {
  const base: WorstCaseInput = { shops: null, freshness: null, photos: null, links: null, deploy: null, crawl: null, runs: null };
  it('says so when nothing is over its line', () => {
    expect(worstCases(base)).toEqual([]);
  });
  it('lists a soft data check that found something, and the section says so', () => {
    const soft = { limit: 4, findings: [{ check: 'unisex-twin', file: 'tests/sameFragranceNames.test.ts', title: 't', message: 'expected [ Array(1) ] to deeply equal []' }] };
    expect(worstCases({ ...base, soft }).join('\n')).toContain('`unisex-twin`');
    expect(render({ shops: null, harvest: null, runs: [], ping: { status: null }, now: new Date('2026-10-29T00:00:00Z'), soft })).toContain('## Soft data checks');
  });
  it('ranks a shop that did not answer above a deploy or a crawl near its limit, failures, stale prices, photos and links', () => {
    const lines = worstCases({
      shops: summariseShops(harvest),
      freshness: summariseFreshness({ freshness: { ...harvest.freshness, b: { shown: 20, over24h: 5, over48h: 3, answered: true } } }),
      photos: { products: 100, withoutPhoto: 40, perShop: [{ id: 'p', listed: 100, withoutPhoto: 40 }], mostStocked: [] },
      links: { checked: 200, fallback: [{ brand: 'A', name: 'One', shops: 3 }] },
      deploy: { bytes: 620e6, budget: 700e6 },
      crawl: { slowest: { minutes: 110, startedAt: 'x', conclusion: 'success' }, limit: 120 },
      runs: [{ workflow: 'W', runs: 10, failed: 2, cancelled: 0, medianMin: 1, p90Min: 1, maxMin: 1 }],
    });
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    expect(at('`c` did not answer')).toBe(0);
    expect(at('`d` did not answer')).toBe(1);
    expect(lines.filter((l) => l.includes('time budget')), 'one line for every shop stopped on its budget').toHaveLength(1);
    for (const [higher, lower] of [
      ['did not answer', 'time budget'],
      ['time budget', 'deploy output'],
      ['time budget', 'slowest crawl'],
      ['deploy output', 'failed 2'],
      ['slowest crawl', 'failed 2'],
      ['failed 2', 'over 48 hours'],
      ['over 48 hours', 'no photo'],
      ['no photo', 'Fragrantica search'],
    ] as [string, string][]) expect(at(higher), `${higher} above ${lower}`).toBeLessThan(at(lower));
  });
  it('puts a few old listings in a big shop last', () => {
    const lines = worstCases({ ...base, freshness: summariseFreshness({ freshness: { big: { shown: 5000, over24h: 3, over48h: 3, answered: true }, half: { shown: 10, over24h: 6, over48h: 0, answered: true } } }) });
    expect(lines.findIndex((l) => l.includes('`big`'))).toBeGreaterThan(lines.findIndex((l) => l.includes('`half`')));
  });
  it('leaves out what is well inside its line, and keeps to the limit', () => {
    const lines = worstCases({ ...base, deploy: { bytes: 300e6, budget: 700e6 }, crawl: { slowest: { minutes: 60, startedAt: 'x', conclusion: 'success' }, limit: 120 } });
    expect(lines).toEqual([]);
    const many = worstCases({ ...base, shops: { ...summariseShops(harvest), silent: Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, shown: 10 })) } }, 5);
    expect(many).toHaveLength(5);
  });
  it('heads the summary', () => {
    const md = render({ shops: summariseShops(harvest), harvest, runs: [], ping: { status: 200 }, now: new Date('2026-10-19T00:00:00Z'), freshness: summariseFreshness(harvest) });
    expect(md.indexOf('## Worst cases')).toBeLessThan(md.indexOf('## Shops'));
    expect(md).toContain('1. Shop `c` did not answer');
    expect(md).toContain('## Price freshness per shop');
  });
});
