import { describe, expect, it } from 'vitest';
import { pingSupabase, render, summariseRuns, summariseShops, supabaseConfigFrom, type HarvestLite, type RunLite } from '../scripts/weekly-health.js';

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
