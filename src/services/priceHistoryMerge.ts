import type { RawHistoryPoint } from './priceHistoryDaily.js';

/**
 * One cheapest price line out of several, exactly as the replay would have
 * drawn it had those ids always been one product.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * scripts/build-price-history.ts keys every listing on fragranceId(), the
 * identity a listing has on its own. scripts/build-demo-catalogue.ts then
 * folds same bottle products together (productMatch.ts's findDuplicateGroups:
 * a shop that publishes no barcode joins the barcoded product of the same
 * house, name, size and strength). The product page used to look its chart up
 * under the surviving id only, so every absorbed listing's recorded prices
 * were missing from the graph: Justmylook's Montblanc Explorer Platinum 100ml,
 * listed without an EAN, was on the page and never on its chart. The catalogue
 * now ships the absorbed ids (HISTORY_ALIASES), and the page merges their
 * series with this.
 *
 * ── Why the merge is exact ──────────────────────────────────────────────────
 * Each series is a step function: a point is written only when that id's
 * cheapest price (or the shop holding it) changes, and a null marker only at
 * the commit where nothing under that id was buyable any more. Between two of
 * its points a series holds its last value. Every series comes from the same
 * replay, so all their timestamps are commit timestamps on one clock. The
 * cheapest across several ids at any commit is therefore the cheapest of each
 * id's held value at that commit, which is what this computes at every
 * timestamp any of them changes, collapsing a repeat the same way the replay
 * does (and breaking a tie on the lower retailer id, as the replay does).
 * Nothing is interpolated: every point out is a point some series had in.
 */
export function mergeCheapestSeries(seriesList: readonly (readonly RawHistoryPoint[])[]): RawHistoryPoint[] {
  const nonEmpty = seriesList.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return [...nonEmpty[0]!];

  const time = (at: string): number => {
    const ms = Date.parse(at);
    return Number.isFinite(ms) ? ms : 0;
  };
  // Every distinct instant any series changes, oldest first, keeping one
  // original spelling of each timestamp to write back out.
  const instants = new Map<number, string>();
  for (const s of nonEmpty) for (const p of s) if (!instants.has(time(p.at))) instants.set(time(p.at), p.at);
  const order = [...instants.keys()].sort((a, b) => a - b);

  // undefined: not started yet; null: started, nothing buyable now.
  const held: ({ priceGbp: number; retailerId: string } | null | undefined)[] = nonEmpty.map(() => undefined);
  const cursor = nonEmpty.map(() => 0);
  const out: RawHistoryPoint[] = [];

  for (const t of order) {
    nonEmpty.forEach((s, i) => {
      while (cursor[i]! < s.length && time(s[cursor[i]!]!.at) === t) {
        const p = s[cursor[i]!]!;
        held[i] = p.priceGbp === null || p.retailerId === null ? null : { priceGbp: p.priceGbp, retailerId: p.retailerId };
        cursor[i]!++;
      }
    });
    let best: { priceGbp: number; retailerId: string } | null = null;
    let started = false;
    for (const h of held) {
      if (h === undefined) continue;
      started = true;
      if (h === null) continue;
      if (!best || h.priceGbp < best.priceGbp || (h.priceGbp === best.priceGbp && h.retailerId < best.retailerId)) best = h;
    }
    if (!started) continue;
    const last = out.at(-1);
    if (best) {
      if (!last || last.priceGbp !== best.priceGbp || last.retailerId !== best.retailerId) {
        out.push({ at: instants.get(t)!, priceGbp: best.priceGbp, retailerId: best.retailerId });
      }
    } else if (last && last.priceGbp !== null) {
      // A gap only at the transition, never before the first real price.
      out.push({ at: instants.get(t)!, priceGbp: null, retailerId: null });
    }
  }
  return out;
}
