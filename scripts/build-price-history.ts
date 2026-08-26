/**
 * Reconstructs a real price history from git, and keeps extending it.
 *
 *   npm run catalogue:history
 *
 * data/catalogue/*.json only ever stores each retailer's current snapshot —
 * there is no time series on disk. But every harvest commits that snapshot,
 * and 49+ of those commits go back to 1 Aug 2026. Replaying them in order
 * reconstructs a genuine history: every point below is a price that was
 * really recorded at that time, read straight out of a real commit, not
 * interpolated or invented.
 *
 * Two rules carried over from build-demo-catalogue.ts, because this is the
 * same "no invented numbers" question asked of the past instead of the
 * present:
 *
 *   1. **Live snapshots only.** A retailer's file can read `source: "fixtures"`
 *      at some point in its history and `"live"` later, once real harvesting
 *      caught up (this happened to several — see docs/INGESTION-AUDIT.md).
 *      Every commit is checked individually; a fixture-era snapshot
 *      contributes nothing, even for a retailer that is fully live today.
 *   2. **Fragrance only, same identity.** isFragrance/fragranceId are
 *      imported from src/catalogue/fragranceId.ts rather than reimplemented,
 *      so a listing's id here can never drift from what
 *      build-demo-catalogue.ts calls the same product. That now includes
 *      fragranceId's optional untrustworthy-EAN argument: this script
 *      recomputes productMatch.ts's untrustworthyEans fresh for each replayed
 *      commit's own snapshot (an EAN collision in today's feed says nothing
 *      about whether it existed last month) and passes it through exactly as
 *      build-demo-catalogue.ts does, so a listing that would fall back to its
 *      retailer-sku identity in the current catalogue falls back to the same
 *      identity here.
 *
 * The line plotted is the cheapest price a reader could actually have paid at
 * each point in time, with the retailer that held it — not one line per shop
 * — because that is what "the historical price of the fragrance" means to a
 * reader comparing prices, and it is what the hover tooltip needs to name a
 * specific retailer.
 *
 * "Could actually have paid" is enforced by src/catalogue/listingAvailability.ts's
 * isAvailableListing, on top of the two rules above: a listing must still be
 * listed (`status === 'active'`) *and* not confirmed out of stock
 * (`inStock !== false`). `inStock: null` — stock never established, which is
 * the only value some retailers' listings ever carry — is kept in rather than
 * treated as unavailable; see that file's header for why and for the measured
 * counts. Before this rule, a listing status could say "still on the shelf"
 * while `inStock: false` said "you cannot buy it", and the chart plotted the
 * price anyway.
 *
 * ── Explicit gap markers ─────────────────────────────────────────────────
 * A commit where every listing for a fragrance is excluded (out of stock
 * everywhere, or delisted everywhere) produces no cheapest price at all that
 * commit. Left silent, that is invisible to the series: if the fragrance
 * returns later at an *unchanged* price, the "collapse a run of identical
 * observations" rule below never fires a new point either, and
 * src/services/priceHistoryDaily.ts's carry forward would bridge straight
 * across the gap as though the price held steady the whole time — which is
 * not what happened; it was not buyable for part of that stretch.
 * `{ priceGbp: null, retailerId: null }` is written into the series at
 * exactly the commit this happens, and nowhere else, so the frontend can
 * tell "a fresh reading of an unchanged price" apart from "we never stopped
 * watching, but nothing was buyable here" and reset its carry forward
 * accordingly. It is never plotted as a price — see priceHistoryDaily.ts's
 * own header for the frontend half of this.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFragrance, fragranceId } from '../src/catalogue/fragranceId.js';
import { isAvailableListing } from '../src/catalogue/listingAvailability.js';
import { untrustworthyEans } from '../src/catalogue/productMatch.js';
import { CURRENCY_UNCONFIRMED } from '../src/config/retailers.js';
import type { StoredListing } from '../src/catalogue/types.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE_PATH = 'data/catalogue';

interface Snapshot {
  retailerId: string;
  updatedAt?: string;
  source?: string;
  listings: StoredListing[];
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
}

/** Every commit that touched the catalogue, oldest first, with its real timestamp. */
function commitsTouchingCatalogue(): { sha: string; at: string }[] {
  const log = git(['log', '--reverse', '--format=%H %aI', '--', CATALOGUE_PATH]);
  return log
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, at] = line.split(' ');
      return { sha: sha!, at: at! };
    });
}

/** Every data/catalogue/*.json path that existed at a given commit. */
function catalogueFilesAt(sha: string): string[] {
  return git(['ls-tree', '-r', '--name-only', sha, '--', CATALOGUE_PATH])
    .trim()
    .split('\n')
    .filter((p) => p.endsWith('.json'));
}

function readFileAt(sha: string, path: string): Snapshot | null {
  try {
    const raw = git(['show', `${sha}:${path}`]);
    return JSON.parse(raw) as Snapshot;
  } catch {
    // A file that exists in the tree can still fail to parse if a commit
    // caught it mid-write in some earlier, less careful version of the
    // harvest script. Treated as no data for that retailer at that commit
    // rather than aborting the whole reconstruction over one bad snapshot.
    return null;
  }
}

/**
 * One entry in the shipped, collapsed series. `priceGbp: null` is the
 * explicit gap marker described in this file's own header — never a real
 * price, only ever written where one used to be buyable and stopped being
 * so this commit. A real price point never has a null field; the two are
 * never ambiguous to a reader of the data.
 */
export interface PricePoint {
  at: string;
  priceGbp: number | null;
  retailerId: string | null;
}

const commits = commitsTouchingCatalogue();
console.log(`Replaying ${commits.length} commits touching ${CATALOGUE_PATH}...`);

const history = new Map<string, PricePoint[]>();

for (const [i, { sha, at }] of commits.entries()) {
  const cheapestThisCommit = new Map<string, { priceGbp: number; retailerId: string }>();

  // Read every live snapshot at this commit once, up front — not per file
  // inside the pricing loop below — because untrustworthyEans (see its own
  // header comment in productMatch.ts) has to see every retailer's listings
  // before any of them is turned into a price point, for the same reason
  // build-demo-catalogue.ts computes it before its own product loop: an EAN
  // collision within one shop's feed has to be known before the first
  // colliding listing is read, not discovered after the second one has
  // already been read as though it agreed with the first.
  const activeAtCommit: StoredListing[][] = [];
  for (const path of catalogueFilesAt(sha)) {
    const snapshot = readFileAt(sha, path);
    if (!snapshot || snapshot.source !== 'live') continue;
    // status === 'active' alone is a lifecycle check, not a buyability one —
    // see isAvailableListing's own header for what that means and the
    // measurements behind also requiring `inStock !== false` here.
    activeAtCommit.push(snapshot.listings.filter(isAvailableListing));
  }
  const untrustworthy = untrustworthyEans(activeAtCommit.flat());

  for (const listings of activeAtCommit) {
    for (const l of listings) {
      if (!isFragrance(l)) continue;
      // A shop whose currency was never established has no price history, and
      // clearing its current snapshot cannot reach the past: this script
      // replays old commits, so the pre-quarantine files are still right there
      // holding the figures the quarantine took down. Before this line,
      // 4,961 of 16,437 published points were nicchia-luxury-uk's (2,942) and
      // escentual's (2,019) — the second set being exactly the ~1.44x-inflated
      // list that 86c4660 found and cleared. A chart whose whole claim is that
      // every point is a price that was really charged cannot plot a number
      // nobody can say the unit of.
      if (CURRENCY_UNCONFIRMED.has(l.retailerId)) continue;
      // A listing with no price is not a price point. This was an unguarded
      // `l.priceGbp!`, and the comparison below reads a null as smaller than
      // every real figure — so an unpriced listing would win "cheapest" and
      // be plotted as a £0 low that no shop ever charged, on a chart whose
      // whole claim is that every point was genuinely live. That is not
      // hypothetical: clearing a shop's prices is now how this project
      // records "we cannot stand behind these figures" (see
      // src/catalogue/priceQuarantine.ts), so nulls arrive here by design.
      // build-demo-catalogue.ts already guards the same way, for the same
      // reason.
      if (typeof l.priceGbp !== 'number' || !(l.priceGbp > 0)) continue;
      const id = fragranceId(l, untrustworthy);
      const price = l.priceGbp;
      const current = cheapestThisCommit.get(id);
      // Retailer id as the tiebreaker keeps this deterministic run to run —
      // an arbitrary object-iteration-order pick would make the recorded
      // "cheapest" retailer flicker between reconstructions of the exact
      // same commit, which is a worse kind of wrong than picking either one
      // consistently.
      if (!current || price < current.priceGbp || (price === current.priceGbp && l.retailerId < current.retailerId)) {
        cheapestThisCommit.set(id, { priceGbp: price, retailerId: l.retailerId });
      }
    }
  }

  for (const [id, point] of cheapestThisCommit) {
    const series = history.get(id) ?? [];
    const last = series.at(-1);
    // Collapse a run of identical observations into one point. The shop held
    // the same cheapest price across several commits far more often than it
    // changed, and a dot at every single commit for a price that never moved
    // would flood the chart and the hover targets with redundant points for
    // no information gain — the line between two kept points already reads
    // as "held steady" for exactly as long as it did.
    if (!last || last.priceGbp !== point.priceGbp || last.retailerId !== point.retailerId) {
      series.push({ at, priceGbp: point.priceGbp, retailerId: point.retailerId });
      history.set(id, series);
    }
  }
  // The mid-series gap fix: a fragrance that has a price on record
  // (`history.has(id)`) but no entry in `cheapestThisCommit` this round went
  // unavailable everywhere — out of stock, delisted, or both — this commit.
  // Write one explicit gap marker at the transition, exactly like the price
  // collapsing above only keeps one point per unbroken run: if the last
  // thing on record for this id is already a gap marker, nothing changed and
  // no second marker is written; only the moment it *stops* being priced
  // gets one. See this file's own header and
  // src/services/priceHistoryDaily.ts for why this exists and how the
  // frontend uses it.
  for (const [id, series] of history) {
    if (cheapestThisCommit.has(id)) continue;
    const last = series.at(-1);
    if (last && last.priceGbp !== null) {
      series.push({ at, priceGbp: null, retailerId: null });
    }
  }

  if ((i + 1) % 10 === 0 || i === commits.length - 1) {
    console.log(`  ${i + 1}/${commits.length} commits replayed, ${history.size} fragrances with history so far`);
  }
}

console.log(`\n${history.size} fragrances have at least one recorded price`);

// A single *real* point draws no line — demo/app.ts's chart already refuses
// to render below two — so shipping the rest of a sub-two series would only
// bloat the bundle with data nothing ever reads. Counted by real price
// points, not by series.length: a series can now also hold gap markers
// (see this file's own header), and a single price followed by a gap marker
// is still just one reading, not a line. Filtered here rather than left for
// the frontend to skip, so the shipped file's own size reflects real
// chartable coverage.
const realPointCount = (series: PricePoint[]): number => series.filter((p) => p.priceGbp !== null).length;
const sortedEntries = [...history.entries()]
  .filter(([, series]) => realPointCount(series) >= 2)
  .sort(([a], [b]) => a.localeCompare(b));
console.log(`${sortedEntries.length} of those have 2+ real points (an actual line) and are included below`);

const body = `/**
 * Auto-generated by scripts/build-price-history.ts. Do not edit by hand.
 *
 * Reconstructed from ${commits.length} real harvest commits, ${commits[0]?.at.slice(0, 10)} to
 * ${commits.at(-1)?.at.slice(0, 10)}. Every point is a price a reader could actually have
 * paid at that time — still listed and not confirmed out of stock — see the
 * script's own header for the full rules that keep fixture-era, non-fragrance
 * and unbuyable data out of this file, and for what a null priceGbp/retailerId
 * pair means (never a price; always an explicit "not buyable here" marker).
 */

export interface PriceHistoryPoint {
  at: string;
  priceGbp: number | null;
  retailerId: string | null;
}

export const PRICE_HISTORY: Record<string, PriceHistoryPoint[]> = ${JSON.stringify(Object.fromEntries(sortedEntries))};

export function priceHistoryFor(fragranceId: string): PriceHistoryPoint[] {
  return PRICE_HISTORY[fragranceId] ?? [];
}
`;

writeFileSync(resolve(root, 'demo/priceHistory.generated.ts'), body);
console.log(`\ndemo/priceHistory.generated.ts written (${(body.length / 1024).toFixed(0)} kB)`);
