/**
 * The freshness table written into data/harvest-report.json after a sweep:
 * for every enabled shop with live data, how old its shown prices are and
 * whether the shop answered this sweep. Shared by the harvest (one job sweep,
 * scripts/catalogue-harvest.ts) and by the merge of the parallel groups
 * (scripts/harvest-merge.ts), which is the only place that sees every group.
 */
import type { CatalogueSnapshot } from './store.js';
import { shopFreshness } from './freshness.js';
import { refusalIn } from './refusal.js';
import type { ReportedFreshness, ShopHarvestOutcome } from './harvestReport.js';

/**
 * The shops that answered. A shop that refused any page this run is a shop
 * refusing us, even where another page answered (Selfridges, run #577: page one
 * rendered, pages 2 to 5 refused). So is a shop only the render tier reaches,
 * which reads the first page of each section and nothing else, by design:
 * Selfridges again, run #588, 60 re-priced of 293 held. Neither can have its
 * whole held range re-priced, so both are warned about by the freshness check,
 * never failed on. A plain HTTP 401, 403, 407 or 429 in a shop's errors counts
 * the same (Beauty Flash and Gorgeous Shop, 10 red runs from #1236: a 429 after
 * two to five pages, 700+ listings left unread).
 */
export function answeredShopIds(shops: readonly ShopHarvestOutcome[]): Set<string> {
  return new Set(
    shops
      .filter((s) => s.tier !== 'none' && s.tier !== 'render' && !(s.refusals && s.refusals.length > 0) && !refusalIn(s.errors))
      .map((s) => s.retailerId),
  );
}

/** The table, from what is on disk now: `read` gives a shop's snapshot, `measured` the shops to measure. */
export function freshnessTable(
  shops: readonly ShopHarvestOutcome[],
  measured: readonly { id: string }[],
  read: (id: string) => Pick<CatalogueSnapshot, 'source' | 'listings'>,
  now: Date = new Date(),
): Record<string, ReportedFreshness> {
  const answered = answeredShopIds(shops);
  const table: Record<string, ReportedFreshness> = {};
  for (const r of measured) {
    const snap = read(r.id);
    if (snap.source !== 'live') continue;
    table[r.id] = { ...shopFreshness(snap.listings, now), answered: answered.has(r.id) };
  }
  return table;
}
