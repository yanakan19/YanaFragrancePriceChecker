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
 *      build-demo-catalogue.ts calls the same product.
 *
 * The line plotted is the cheapest live price at each point in time, with
 * the retailer that held it — not one line per shop — because that is what
 * "the historical price of the fragrance" means to a reader comparing prices,
 * and it is what the hover tooltip needs to name a specific retailer.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFragrance, fragranceId } from '../src/catalogue/fragranceId.js';
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

export interface PricePoint {
  at: string;
  priceGbp: number;
  retailerId: string;
}

const commits = commitsTouchingCatalogue();
console.log(`Replaying ${commits.length} commits touching ${CATALOGUE_PATH}...`);

const history = new Map<string, PricePoint[]>();

for (const [i, { sha, at }] of commits.entries()) {
  const cheapestThisCommit = new Map<string, { priceGbp: number; retailerId: string }>();

  for (const path of catalogueFilesAt(sha)) {
    const snapshot = readFileAt(sha, path);
    if (!snapshot || snapshot.source !== 'live') continue;

    for (const l of snapshot.listings) {
      if (l.status !== 'active' || !isFragrance(l)) continue;
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
      const id = fragranceId(l);
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

  if ((i + 1) % 10 === 0 || i === commits.length - 1) {
    console.log(`  ${i + 1}/${commits.length} commits replayed, ${history.size} fragrances with history so far`);
  }
}

console.log(`\n${history.size} fragrances have at least one recorded price`);

// A single point draws no line — demo/app.ts's priceHistoryChart already
// refuses to render below two, so shipping the rest would only bloat the
// bundle with data nothing ever reads. Filtered here rather than left for
// the frontend to skip, so the shipped file's own size reflects real
// chartable coverage.
const sortedEntries = [...history.entries()]
  .filter(([, series]) => series.length >= 2)
  .sort(([a], [b]) => a.localeCompare(b));
console.log(`${sortedEntries.length} of those have 2+ points (an actual line) and are included below`);

const body = `/**
 * Auto-generated by scripts/build-price-history.ts. Do not edit by hand.
 *
 * Reconstructed from ${commits.length} real harvest commits, ${commits[0]?.at.slice(0, 10)} to
 * ${commits.at(-1)?.at.slice(0, 10)}. Every point is a price that was genuinely live at
 * that time — see the script's own header for the two rules that keep
 * fixture-era and non-fragrance data out of this file.
 */

export interface PriceHistoryPoint {
  at: string;
  priceGbp: number;
  retailerId: string;
}

export const PRICE_HISTORY: Record<string, PriceHistoryPoint[]> = ${JSON.stringify(Object.fromEntries(sortedEntries))};

export function priceHistoryFor(fragranceId: string): PriceHistoryPoint[] {
  return PRICE_HISTORY[fragranceId] ?? [];
}
`;

writeFileSync(resolve(root, 'demo/priceHistory.generated.ts'), body);
console.log(`\ndemo/priceHistory.generated.ts written (${(body.length / 1024).toFixed(0)} kB)`);
