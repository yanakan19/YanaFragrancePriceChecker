import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../scripts/harvest-merge.js';
import { pack } from '../scripts/harvest-pack.js';
import { RETAILERS } from '../src/config/retailers.js';
import {
  HARVEST_GROUPS, HARVEST_GROUP_PLAN, METERED_GROUP, balancedPlan, groupAssignment, groupSeconds, hostOfShop, mergeCursors,
  mergeReports, parseGroupArg, shopSecondsFromReport, shopsOfGroup, sweepableShops,
} from '../src/catalogue/harvestGroups.js';
import { buildHarvestReport, type ShopHarvestOutcome } from '../src/catalogue/harvestReport.js';
import { EMPTY_CURSOR, type HarvestCursor } from '../src/catalogue/harvestCursor.js';
import { answeredShopIds } from '../src/catalogue/harvestFreshness.js';
import type { Retailer } from '../src/types/retailer.js';

/**
 * The shop sweep run as parallel groups (src/catalogue/harvestGroups.ts). Rules
 * over the registry and the table, never a count of today's shops or a time
 * the next sweep can change.
 */
const shop = (id: string, domain = `${id}.example`, enabled = true): Retailer => ({ id, domain, enabled, adapter: 'unknown' }) as unknown as Retailer;

describe('the plan over the real registry', () => {
  const sweepable = sweepableShops();
  const assignment = groupAssignment();

  it('puts every shop the sweep asks in exactly one group, and no other shop in any', () => {
    expect([...assignment.keys()].sort()).toEqual(sweepable.map((r) => r.id).sort());
    for (const g of assignment.values()) expect(g).toBeGreaterThanOrEqual(0), expect(g).toBeLessThan(HARVEST_GROUPS);
    const lists = Array.from({ length: HARVEST_GROUPS }, (_, g) => shopsOfGroup(g));
    expect(lists.flat().sort()).toEqual(sweepable.map((r) => r.id).sort());
    expect(new Set(lists.flat()).size).toBe(lists.flat().length);
  });

  it('names every enabled shop in the table, and no shop the registry does not have (run npx tsx scripts/harvest-groups.ts --write)', () => {
    const ids = new Set(sweepable.map((r) => r.id));
    expect(sweepable.filter((r) => r.enabled && !(r.id in HARVEST_GROUP_PLAN)).map((r) => r.id)).toEqual([]);
    expect(Object.keys(HARVEST_GROUP_PLAN).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('keeps shops that share a host in one group, so the per host pace holds between the jobs as well as inside one', () => {
    const byHost = new Map<string, Set<number>>();
    for (const r of sweepable) byHost.set(hostOfShop(r), (byHost.get(hostOfShop(r)) ?? new Set()).add(assignment.get(r.id)!));
    expect([...byHost].filter(([, g]) => g.size > 1).map(([h]) => h)).toEqual([]);
  });

  it('balances the groups by the time each shop took last: no group has more than 55% of the enabled shops\' seconds', () => {
    const enabled = Object.fromEntries(Object.entries(HARVEST_GROUP_PLAN).filter(([id]) => sweepable.find((r) => r.id === id)?.enabled));
    const totals = groupSeconds(enabled);
    const sum = totals.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
    for (const t of totals) expect(t / sum).toBeLessThanOrEqual(0.55);
  });

  it('keeps the shops that spend paid renders in the one group that is offered the metered tiers', () => {
    const actor = RETAILERS.filter((r) => (r as { renderTier?: string }).renderTier === 'actor').map((r) => r.id);
    for (const id of actor) expect(assignment.get(id), id).toBe(METERED_GROUP);
  });
});

describe('the rules, on made up shops', () => {
  const plan = { a: [0, 600], b: [1, 300], c: [1, 300] } as const;

  it('keeps a shop where the table put it and sends a new one to the lighter group, the same in every job', () => {
    const shops = [shop('a'), shop('b'), shop('c'), shop('z-new')];
    const first = groupAssignment(shops, plan);
    expect(first.get('a')).toBe(0);
    expect(first.get('b')).toBe(1);
    expect(first.get('z-new')).toBe(0);
    expect([...groupAssignment([...shops].reverse(), plan)].sort()).toEqual([...first].sort());
  });

  it('puts a new shop on the host of a planned shop in that shop\'s group', () => {
    const g = groupAssignment([shop('a', 'one.example'), shop('b', 'two.example'), shop('c', 'three.example'), shop('d', 'www.TWO.example')], plan);
    expect(g.get('d')).toBe(g.get('b'));
  });

  it('leaves out shops read from a feed or an import', () => {
    const feed = { ...shop('f'), adapter: 'affiliate-feed' } as unknown as Retailer;
    const imp = { ...shop('i'), adapter: 'owner-import' } as unknown as Retailer;
    expect([...groupAssignment([shop('a'), feed, imp], plan).keys()]).toEqual(['a']);
  });

  it('splits a time table evenly, hosts together, the metered shop in the metered group, a switched off shop weighing nothing', () => {
    const shops = [shop('big', 'big.example'), shop('m1', 'm.example'), shop('m2', 'm.example'), shop('s1'), shop('s2'), shop('s3'), shop('off', 'off.example', false)];
    const seconds = { big: 1000, m1: 400, m2: 100, s1: 300, s2: 300, s3: 300, off: 9999 };
    const p = balancedPlan(seconds, shops, 2, ['m2']);
    expect(p.m1![0]).toBe(p.m2![0]);
    expect(p.m2![0]).toBe(METERED_GROUP);
    expect(p.off![1]).toBe(0);
    const totals = groupSeconds(p);
    expect(Math.abs(totals[0]! - totals[1]!)).toBeLessThanOrEqual(400);
  });

  it('reads --group', () => {
    expect(parseGroupArg(null)).toBeNull();
    expect(parseGroupArg('1/2')).toEqual({ group: 1, of: 2 });
    for (const bad of ['2/2', '1', 'a/b', '0/0', '-1/2']) expect(() => parseGroupArg(bad), bad).toThrow(/--group/);
  });

  it('rebuilds the seconds a shop took from when shops finished, by replaying the lanes in the planned order, unless the report says', () => {
    const at = (s: number) => new Date(Date.parse('2026-10-21T10:00:00Z') + s * 1000).toISOString();
    const shops = [
      { retailerId: 'a', finishedAt: at(100) }, { retailerId: 'b', finishedAt: at(40) }, { retailerId: 'c', finishedAt: at(150), seconds: 60 },
    ] as unknown as ShopHarvestOutcome[];
    const out = shopSecondsFromReport({ startedAt: at(0), planned: ['a', 'b', 'c'], shops }, 2);
    expect(out).toEqual({ a: 100, b: 40, c: 60 });
    // With one lane the second shop starts when the first ends.
    expect(shopSecondsFromReport({ startedAt: at(0), planned: ['b', 'a'], shops: shops.slice(0, 2) }, 1)).toEqual({ b: 40, a: 60 });
  });
});

describe('merging what the groups found', () => {
  const cursor = (attempted: Record<string, string>, extra: Partial<HarvestCursor> = {}): HarvestCursor => ({ ...EMPTY_CURSOR, attempted, actorRendered: {}, ...extra });

  it('takes each group\'s own shops from its cursor and keeps every other entry', () => {
    const base = cursor({ a: '2026-10-01', b: '2026-10-01', c: '2026-10-01', old: '2026-09-01' }, { discoveryOffset: { a: 5, b: 7 } });
    const g0 = cursor({ a: '2026-10-21', b: '2026-10-20', c: '2026-09-30' }, { discoveryOffset: { a: 50, b: 70 } });
    const g1 = cursor({ a: '2026-10-22', b: '2026-10-22', c: '2026-10-21' });
    const merged = mergeCursors(base, [{ ids: new Set(['a', 'b']), cursor: g0 }, { ids: new Set(['c']), cursor: g1 }]);
    expect(merged.attempted).toEqual({ a: '2026-10-21', b: '2026-10-20', c: '2026-10-21', old: '2026-09-01' });
    expect(merged.discoveryOffset).toEqual({ a: 50, b: 70 });
  });

  it('keeps a shop\'s old stamp when its group did not reach it', () => {
    const merged = mergeCursors(cursor({ a: '2026-10-01' }), [{ ids: new Set(['a']), cursor: cursor({}) }]);
    expect(merged.attempted).toEqual({ a: '2026-10-01' });
  });

  const outcome = (id: string, errors: string[] = [], tier: ShopHarvestOutcome['tier'] = 'free'): ShopHarvestOutcome => ({
    retailerId: id, name: id, urlsDiscovered: 1, pagesFetched: 1, priced: 1, tier, renderer: null, errorCount: errors.length, errors,
    finishedAt: '2026-10-21T10:30:00.000Z',
  });

  it('joins the groups\' reports: the first start, the last end, each group\'s minutes and the shops that stopped on their budget', () => {
    const r0 = buildHarvestReport('2026-10-21T10:00:00.000Z', ['a', 'b'], [outcome('a'), outcome('b', ["stopped early: exceeded this shop's time budget (40 min)"])], '2026-10-21T10:40:00.000Z', 'swept-every-shop');
    const r1 = buildHarvestReport('2026-10-21T10:01:00.000Z', ['c'], [outcome('c')], '2026-10-21T10:31:00.000Z', 'deadline');
    const m = mergeReports([{ group: 0, planned: ['a', 'b'], report: r0 }, { group: 1, planned: ['c'], report: r1 }]);
    expect(m.startedAt).toBe('2026-10-21T10:00:00.000Z');
    expect(m.finishedAt).toBe('2026-10-21T10:40:00.000Z');
    expect(m.complete).toBe(true);
    expect(m.endedReason).toBe('deadline');
    expect(m.shops.map((s) => s.retailerId)).toEqual(['a', 'b', 'c']);
    expect(m.notReached).toEqual([]);
    expect(m.groups!.map((g) => g.minutes)).toEqual([40, 30]);
    expect(m.groups![0]!.stoppedOnBudget).toEqual(['b']);
  });

  it('leaves a group that handed nothing over unreached and the sweep incomplete, not failed', () => {
    const r0 = buildHarvestReport('2026-10-21T10:00:00.000Z', ['a'], [outcome('a')], '2026-10-21T10:40:00.000Z', 'swept-every-shop');
    const m = mergeReports([{ group: 0, planned: ['a'], report: r0 }, { group: 1, planned: ['c', 'd'], report: null }]);
    expect(m.notReached).toEqual(['c', 'd']);
    expect(m.complete).toBe(false);
    expect(m.endedReason).toBeNull();
    expect(m.groups).toHaveLength(1);
  });

  it('still reads as a report shopsThatRanOutOfTime and the freshness check understand', () => {
    const r = buildHarvestReport('2026-10-21T10:00:00.000Z', ['a'], [outcome('a', ["stopped early: exceeded this shop's time budget (40 min)"])], '2026-10-21T10:40:00.000Z');
    const m = mergeReports([{ group: 0, planned: ['a'], report: r }]);
    expect(answeredShopIds(m.shops).has('a')).toBe(true);
    expect(JSON.parse(JSON.stringify(m)).shops[0].errors[0]).toMatch(/^stopped early: exceeded this shop's time budget/);
  });
});

describe('handing a group over and merging it, on a made up repository', () => {
  // The real scripts, pointed at a temporary repository.
  const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const snapshot = (id: string, n: number) => JSON.stringify({ retailerId: id, source: 'fixtures', updatedAt: '2026-10-01T00:00:00.000Z', listings: [], n });
  const g0 = shopsOfGroup(0)[0]!;
  const g0b = shopsOfGroup(0)[1]!;
  const g1 = shopsOfGroup(1)[0]!;

  function repo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'harvest-merge-'));
    sh(dir, 'init', '-q', '-b', 'main');
    sh(dir, 'config', 'user.email', 't@example.com');
    sh(dir, 'config', 'user.name', 't');
    mkdirSync(join(dir, 'data/catalogue'), { recursive: true });
    for (const id of [g0, g0b, g1]) writeFileSync(join(dir, `data/catalogue/${id}.json`), snapshot(id, 0));
    writeFileSync(join(dir, 'data/harvest-cursor.json'), JSON.stringify({ attempted: { [g0]: '2026-10-01', [g1]: '2026-10-01', other: '2026-09-01' }, actorRendered: {} }));
    sh(dir, 'add', '-A');
    sh(dir, 'commit', '-q', '-m', 'base');
    return dir;
  }

  /** What a sweep job leaves in its checkout, handed over from a copy of the base repository. */
  function sweepArtifact(base: string, group: number, ids: string[], out: string): void {
    const work = mkdtempSync(join(tmpdir(), 'harvest-sweep-'));
    execFileSync('git', ['clone', '-q', base, work]);
    for (const id of ids) writeFileSync(join(work, `data/catalogue/${id}.json`), snapshot(id, group + 1));
    const cursor = JSON.parse(readFileSync(join(work, 'data/harvest-cursor.json'), 'utf8')) as HarvestCursor;
    for (const id of ids) cursor.attempted[id] = `2026-10-2${group}`;
    writeFileSync(join(work, 'data/harvest-cursor.json'), JSON.stringify(cursor));
    const at = new Date().toISOString();
    writeFileSync(join(work, 'data/harvest-report.json'), JSON.stringify(buildHarvestReport(at, ids, ids.map((id) => ({
      retailerId: id, name: id, urlsDiscovered: 1, pagesFetched: 1, priced: 1, tier: 'free', renderer: null, errorCount: 0, errors: [], finishedAt: at,
    })), at, 'swept-every-shop')));
    pack('sweep', group, join(out, `harvest-${group}`), work);
  }

  it('applies each group\'s shops, merges the cursor and the report, and leaves a shop the branch changed since the group started', () => {
    const base = repo();
    const out = mkdtempSync(join(tmpdir(), 'harvest-shards-'));
    sweepArtifact(base, 0, [g0, g0b], out);
    sweepArtifact(base, 1, [g1], out);
    // Another workflow commits g0b after the sweep jobs started.
    writeFileSync(join(base, `data/catalogue/${g0b}.json`), snapshot(g0b, 99));
    sh(base, 'commit', '-q', '-am', 'someone else');

    expect(run(out, null, base)).toBe(0);
    const read = (p: string) => readFileSync(join(base, p), 'utf8');
    expect(JSON.parse(read(`data/catalogue/${g0}.json`)).n).toBe(1);
    expect(JSON.parse(read(`data/catalogue/${g1}.json`)).n).toBe(2);
    expect(JSON.parse(read(`data/catalogue/${g0b}.json`)).n).toBe(99);
    const cursor = JSON.parse(read('data/harvest-cursor.json')) as HarvestCursor;
    expect(cursor.attempted[g0]).toBe('2026-10-20');
    expect(cursor.attempted[g1]).toBe('2026-10-21');
    expect(cursor.attempted.other).toBe('2026-09-01');
    const report = JSON.parse(read('data/harvest-report.json'));
    expect(report.groups.map((g: { group: number }) => g.group)).toEqual([0, 1]);
    expect(report.shops.map((s: { retailerId: string }) => s.retailerId).sort()).toEqual([g0, g0b, g1].sort());
    expect(report.complete).toBe(true);
    expect(report.freshness).toBeDefined();
  });

  it('merges with one group missing: its shops stay as they were and are listed as not reached', () => {
    const base = repo();
    const out = mkdtempSync(join(tmpdir(), 'harvest-shards-'));
    sweepArtifact(base, 0, [g0], out);
    expect(run(out, null, base)).toBe(0);
    const report = JSON.parse(readFileSync(join(base, 'data/harvest-report.json'), 'utf8'));
    expect(report.complete).toBe(false);
    expect(report.notReached).toContain(g1);
    expect(JSON.parse(readFileSync(join(base, `data/catalogue/${g1}.json`), 'utf8')).n).toBe(0);
  });

  it('fails when no sweep group handed anything over, and ignores a file that is not one of the group\'s shops', () => {
    const base = repo();
    expect(run(join(tmpdir(), 'harvest-nothing-here'), null, base)).toBe(1);
    const out = mkdtempSync(join(tmpdir(), 'harvest-shards-'));
    sweepArtifact(base, 0, [g0, g1], out);
    expect(run(out, null, base)).toBe(0);
    expect(JSON.parse(readFileSync(join(base, `data/catalogue/${g1}.json`), 'utf8')).n).toBe(0);
  });

  it('takes only the group that owns the shop on a one shop dispatch', () => {
    const base = repo();
    const out = mkdtempSync(join(tmpdir(), 'harvest-shards-'));
    sweepArtifact(base, 0, [g0], out);
    sweepArtifact(base, 1, [g1], out);
    expect(run(out, g1, base)).toBe(0);
    expect(JSON.parse(readFileSync(join(base, `data/catalogue/${g1}.json`), 'utf8')).n).toBe(2);
    expect(JSON.parse(readFileSync(join(base, `data/catalogue/${g0}.json`), 'utf8')).n).toBe(0);
    expect(JSON.parse(readFileSync(join(base, 'data/harvest-report.json'), 'utf8')).shops).toHaveLength(1);
  });
});
