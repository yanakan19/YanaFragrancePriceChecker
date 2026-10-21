/**
 * The shop sweep in groups, for parallel jobs (22 Oct 2026).
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * One job swept all 58 shops, eight at a time, with the 56 minute deadline and
 * a 40 minute ceiling on each shop. The sweep was lane bound: the last report
 * holds 26,900 shop-seconds, which is 56 minutes across eight lanes, so the
 * deadline cut the run and ten shops stopped on their time budget (John Lewis,
 * Niche Beauty and others). The slowest crawl run took 101 of its 120 minutes.
 * The sweep is now run as HARVEST_GROUPS jobs side by side, each a fixed share
 * of the shops (.github/workflows/catalogue-daily.yml, job `sweep`), and one
 * job merges what they found (scripts/harvest-merge.ts).
 *
 * ── The rules the split keeps ───────────────────────────────────────────────
 *  - A shop is in exactly one group, always the same one (HARVEST_GROUP_PLAN is
 *    a table in this file, reviewed, not recomputed), so it is asked by one job
 *    at one pace: its registry gap, its robots.txt delay and the per host rule
 *    (never two shops on one host at once) are exactly what they were.
 *  - Shops that share a host share a group, or the per host rule would hold
 *    inside each job and not between them.
 *  - The shop that spends the paid actor render (john-lewis) is in group 0, and
 *    only group 0 is offered the metered tiers (--allow-metered), so a run
 *    still spends what one job could: MAX_ACTOR_PAGES_PER_RUN, not twice it.
 *  - The groups are balanced by the time each shop took in the last sweep
 *    (`seconds` in the table, refreshed by `npx tsx scripts/harvest-groups.ts`
 *    from data/harvest-report.json), so neither job is the slow one.
 *  - A shop the table does not know yet (just added to the registry) goes to
 *    the group with the least time, the same answer in every job, so the crawl
 *    never skips a new shop; tests/harvestGroups.test.ts fails until the table
 *    names it.
 */
import { RETAILERS } from '../config/retailers.js';
import type { Retailer } from '../types/retailer.js';
import type { HarvestCursor } from './harvestCursor.js';
import type { HarvestReport, ShopHarvestOutcome } from './harvestReport.js';

/** How many jobs the sweep is split into. */
export const HARVEST_GROUPS = 2;

/** The group that is offered the metered tiers (paid proxy and actor renders). */
export const METERED_GROUP = 0;

/** Seconds a shop with no figure is given: about the median of the last sweep. */
export const DEFAULT_SHOP_SECONDS = 120;

/**
 * Shop id to [group, seconds the shop took in the last sweep, capped by its
 * 40 minute ceiling]. Regenerate with `npx tsx scripts/harvest-groups.ts`.
 */
export const HARVEST_GROUP_PLAN: Readonly<Record<string, readonly [group: number, seconds: number]>> = {
  'al-haramain': [0, 38],
  allbeauty: [1, 118],
  'amazon-uk': [0, 0],
  armaf: [0, 5],
  asda: [0, 0],
  avon: [0, 11],
  'beaute-boulevard': [0, 34],
  'beauty-bay': [1, 42],
  'beauty-flash': [1, 2401],
  'beauty-pie': [1, 61],
  'beauty-the-shop-uk': [0, 0],
  beautybase: [0, 127],
  'bellavita-luxury': [0, 83],
  'bloom-perfumery': [0, 1295],
  boots: [0, 0],
  carethy: [0, 0],
  cosmetify: [0, 0],
  'cult-beauty-global': [0, 342],
  debenhams: [1, 2402],
  'direct-cosmetics': [0, 1209],
  'emirates-oud': [1, 19],
  'escentric-molecules': [1, 34],
  escentual: [0, 81],
  fenwick: [1, 265],
  fragrancehub: [1, 8],
  'french-avenue': [0, 3],
  'glorious-beauty': [0, 113],
  'glossier-uk': [0, 3],
  'gorgeous-shop': [0, 2402],
  harrods: [0, 0],
  'harvey-nichols': [0, 0],
  'home-bargains': [1, 906],
  'house-of-fraser': [0, 0],
  ibraq: [1, 2],
  'john-lewis': [0, 2401],
  justmylook: [1, 193],
  kayali: [1, 67],
  'les-senteurs': [0, 44],
  'liberty-london': [1, 1093],
  'lloyds-pharmacy': [1, 49],
  lookfantastic: [0, 569],
  lush: [0, 0],
  'manchester-ouds': [1, 106],
  'marks-and-spencer': [0, 34],
  next: [0, 0],
  'nicchia-luxury-uk': [1, 83],
  'niche-beauty-uk': [0, 2401],
  ocado: [0, 0],
  opulensi: [1, 38],
  'oud-arabian': [1, 81],
  'paco-perfumerias-uk': [1, 2400],
  'parfumdreams-uk': [1, 2151],
  'perfume-closet': [0, 7],
  'perfume-direct': [1, 34],
  'perfume-market-uk': [0, 62],
  'perfume-shopping': [0, 0],
  perfumeo: [0, 251],
  perfumeuk: [0, 931],
  perfumoi: [1, 6],
  'rasasi-uk-store': [0, 60],
  riiffs: [0, 0],
  'roullier-white': [1, 12],
  'rowlands-pharmacy': [0, 15],
  'saad-fragrance': [1, 3],
  sainsburys: [0, 0],
  'sainte-cellier': [0, 34],
  savers: [0, 0],
  'scent-warehouse': [1, 22],
  'scented-glasgow': [1, 5],
  scentsational: [1, 201],
  scentstore: [1, 703],
  selfridges: [0, 0],
  'sephora-uk': [0, 0],
  'space-nk': [0, 120],
  superdrug: [0, 0],
  tesco: [0, 0],
  'the-beauty-store-uk': [0, 81],
  'the-fragrance-counter': [0, 746],
  'the-fragrance-shop': [0, 0],
  'the-perfume-shop': [0, 0],
  'the-range': [0, 0],
  zara: [0, 0],
  zimaya: [0, 3],
};

/** The shops the sweep asks: every registry shop that is not read from a feed or an import. */
export function sweepableShops(retailers: readonly Retailer[] = RETAILERS): Retailer[] {
  return retailers.filter((r) => r.adapter !== 'affiliate-feed' && r.adapter !== 'owner-import');
}

/** The host a shop's pacing is kept by (the sweep never runs two shops on one). */
export const hostOfShop = (r: Pick<Retailer, 'domain'>): string => r.domain.toLowerCase().replace(/^www\./, '');

/** Per group totals of the seconds in a plan. */
export function groupSeconds(
  plan: Readonly<Record<string, readonly [number, number]>>,
  groups: number = HARVEST_GROUPS,
): number[] {
  const totals = Array.from({ length: groups }, () => 0);
  for (const [group, seconds] of Object.values(plan)) if (group >= 0 && group < groups) totals[group]! += seconds;
  return totals;
}

/**
 * The group of every sweepable shop. A shop in the plan keeps its group; one
 * that is not goes to the group with the least seconds so far (ties to the
 * lower group), taken in id order so every job reaches the same answer. A shop
 * on the same host as a planned shop joins that shop's group.
 */
export function groupAssignment(
  retailers: readonly Retailer[] = RETAILERS,
  plan: Readonly<Record<string, readonly [number, number]>> = HARVEST_GROUP_PLAN,
  groups: number = HARVEST_GROUPS,
): Map<string, number> {
  const out = new Map<string, number>();
  const shops = sweepableShops(retailers);
  const totals = groupSeconds(plan, groups);
  const hostGroup = new Map<string, number>();
  for (const r of shops) {
    const entry = plan[r.id];
    if (entry && entry[0] >= 0 && entry[0] < groups) {
      out.set(r.id, entry[0]);
      if (!hostGroup.has(hostOfShop(r))) hostGroup.set(hostOfShop(r), entry[0]);
    }
  }
  for (const r of [...shops].sort((a, b) => a.id.localeCompare(b.id))) {
    if (out.has(r.id)) continue;
    let g = hostGroup.get(hostOfShop(r));
    if (g === undefined) {
      g = totals.indexOf(Math.min(...totals));
      totals[g]! += DEFAULT_SHOP_SECONDS;
      hostGroup.set(hostOfShop(r), g);
    }
    out.set(r.id, g);
  }
  return out;
}

/** The shop ids of one group. */
export function shopsOfGroup(group: number, retailers: readonly Retailer[] = RETAILERS, groups: number = HARVEST_GROUPS): string[] {
  return [...groupAssignment(retailers, HARVEST_GROUP_PLAN, groups)].filter(([, g]) => g === group).map(([id]) => id).sort();
}

/** `--group=1/2` as [1, 2], or null when absent. Throws on a value that is not a group of a split. */
export function parseGroupArg(value: string | null): { group: number; of: number } | null {
  if (value === null) return null;
  const m = /^(\d+)\/(\d+)$/.exec(value);
  const group = m ? Number(m[1]) : NaN;
  const of = m ? Number(m[2]) : NaN;
  if (!m || of < 1 || group >= of) throw new Error(`--group must look like 0/${HARVEST_GROUPS}, got "${value}"`);
  return { group, of };
}

/**
 * Balanced groups from the seconds each shop took: longest first onto the group
 * with the least so far (the classic greedy split), shops on one host together,
 * the metered shop in METERED_GROUP. Used by scripts/harvest-groups.ts to write
 * the table; the sweep itself only reads the table.
 */
export function balancedPlan(
  seconds: Readonly<Record<string, number>>,
  retailers: readonly Retailer[] = RETAILERS,
  groups: number = HARVEST_GROUPS,
  metered: readonly string[] = ['john-lewis'],
): Record<string, [number, number]> {
  const switchedOff = new Set(retailers.filter((r) => !r.enabled).map((r) => r.id));
  const clusters = new Map<string, { ids: string[]; seconds: number; pinned: boolean }>();
  for (const r of sweepableShops(retailers)) {
    const host = hostOfShop(r);
    const c = clusters.get(host) ?? { ids: [], seconds: 0, pinned: false };
    c.ids.push(r.id);
    // A switched off shop is not asked, so it weighs nothing until it is switched on.
    c.seconds += r.enabled ? (seconds[r.id] ?? DEFAULT_SHOP_SECONDS) : 0;
    c.pinned ||= metered.includes(r.id);
    clusters.set(host, c);
  }
  const totals = Array.from({ length: groups }, () => 0);
  const plan: Record<string, [number, number]> = {};
  const order = [...clusters.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.seconds - a.seconds || a.ids[0]!.localeCompare(b.ids[0]!));
  for (const c of order) {
    const g = c.pinned ? METERED_GROUP : totals.indexOf(Math.min(...totals));
    totals[g]! += c.seconds;
    for (const id of c.ids) plan[id] = [g, switchedOff.has(id) ? 0 : Math.round(seconds[id] ?? DEFAULT_SHOP_SECONDS)];
  }
  return plan;
}

/**
 * Seconds each shop took, from a report. A report from this version of the
 * harvest carries `seconds` per shop; an older one has only when each shop
 * finished, so the time is rebuilt by replaying the queue: `lanes` shops run at
 * once, in the order planned, and each starts when a lane frees.
 */
export function shopSecondsFromReport(report: Pick<HarvestReport, 'startedAt' | 'planned' | 'shops'>, lanes = 8): Record<string, number> {
  const out: Record<string, number> = {};
  const finished = new Map<string, number>();
  for (const s of report.shops) {
    if (typeof s.seconds === 'number') out[s.retailerId] = s.seconds;
    finished.set(s.retailerId, Date.parse(s.finishedAt));
  }
  const free = Array.from({ length: lanes }, () => Date.parse(report.startedAt));
  for (const id of report.planned) {
    const done = finished.get(id);
    if (done === undefined || !Number.isFinite(done)) continue;
    free.sort((a, b) => a - b);
    const start = free[0]!;
    if (out[id] === undefined) out[id] = Math.max(0, Math.round((done - start) / 1000));
    free[0] = Math.max(start, done);
  }
  return out;
}

// ── Merging what the groups found ────────────────────────────────────────────

/** The cursor with each group's own shops taken from that group's cursor and every other entry kept from `base`. */
export function mergeCursors(base: HarvestCursor, parts: readonly { ids: ReadonlySet<string>; cursor: HarvestCursor }[]): HarvestCursor {
  const maps = ['attempted', 'actorRendered', 'discoveryOffset', 'barcodeBackoff'] as const;
  const out: Record<string, Record<string, string | number>> = {};
  for (const name of maps) {
    const merged: Record<string, string | number> = { ...((base[name] as Record<string, string | number> | undefined) ?? {}) };
    for (const { ids, cursor } of parts) {
      const theirs = (cursor[name] as Record<string, string | number> | undefined) ?? {};
      for (const id of ids) {
        if (id in theirs) merged[id] = theirs[id]!;
      }
    }
    if (Object.keys(merged).length > 0 || name === 'attempted' || name === 'actorRendered') out[name] = merged;
  }
  return out as unknown as HarvestCursor;
}

/** One group's part of a merged report, for the run's summary and for balancing. */
export interface ReportedGroup {
  group: number;
  startedAt: string;
  finishedAt: string | null;
  /** Wall minutes the group's sweep took. */
  minutes: number | null;
  shops: number;
  endedReason: HarvestReport['endedReason'];
  /** Shops of the group that stopped on their own time budget. */
  stoppedOnBudget: string[];
}

/** The report of the whole sweep from the groups' reports. A missing group's shops are `notReached`. */
export function mergeReports(parts: readonly { group: number; planned: readonly string[]; report: HarvestReport | null }[]): HarvestReport {
  const have = parts.filter((p): p is { group: number; planned: readonly string[]; report: HarvestReport } => p.report !== null);
  const shops: ShopHarvestOutcome[] = have.flatMap((p) => p.report.shops);
  const reported = new Set(shops.map((s) => s.retailerId));
  const planned = parts.flatMap((p) => (p.report ? p.report.planned : p.planned));
  const starts = have.map((p) => Date.parse(p.report.startedAt)).filter(Number.isFinite);
  const ends = have.map((p) => (p.report.finishedAt ? Date.parse(p.report.finishedAt) : NaN));
  const allEnded = have.length === parts.length && ends.every(Number.isFinite);
  const groups: ReportedGroup[] = have.map((p) => ({
    group: p.group,
    startedAt: p.report.startedAt,
    finishedAt: p.report.finishedAt,
    minutes: p.report.finishedAt ? Math.round((Date.parse(p.report.finishedAt) - Date.parse(p.report.startedAt)) / 60000) : null,
    shops: p.report.shops.length,
    endedReason: p.report.endedReason,
    stoppedOnBudget: p.report.shops
      .filter((s) => s.errors.some((e) => /^stopped early: exceeded this shop's time budget/.test(e)))
      .map((s) => s.retailerId),
  }));
  const reasons = have.map((p) => p.report.endedReason);
  return {
    startedAt: new Date(Math.min(...starts)).toISOString(),
    finishedAt: allEnded ? new Date(Math.max(...ends)).toISOString() : null,
    complete: allEnded,
    endedReason: !allEnded ? null : reasons.includes('deadline') ? 'deadline' : 'swept-every-shop',
    planned,
    notReached: planned.filter((id) => !reported.has(id)),
    shops,
    groups,
  };
}
