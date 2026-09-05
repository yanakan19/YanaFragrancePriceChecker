/**
 * Reconstructs a real price history from git, and keeps extending it.
 *
 *   npm run catalogue:history          # resumes from the last checkpoint
 *   npm run catalogue:history -- --full   # replays every commit from scratch
 *
 * data/catalogue/*.json only ever stores each retailer's current snapshot —
 * there is no time series on disk. But every harvest commits that snapshot,
 * and hundreds of those commits go back to 1 Aug 2026. Replaying them in
 * order reconstructs a genuine history: every point below is a price that was
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
 *      fragranceId's optional untrustworthy-EAN argument: the replay
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
 * A shop whose currency was never established (CURRENCY_UNCONFIRMED) has no
 * price history either, and clearing its current snapshot cannot reach the
 * past: the replay reads old commits, so the pre-quarantine files are still
 * right there holding the figures the quarantine took down. Before that
 * rule, 4,961 of 16,437 published points were nicchia-luxury-uk's (2,942)
 * and escentual's (2,019) — the second set being exactly the ~1.44x-inflated
 * list that 86c4660 found and cleared. A chart whose whole claim is that
 * every point is a price that was really charged cannot plot a number nobody
 * can say the unit of. Likewise a listing with no price is not a price
 * point: an unguarded `l.priceGbp!` once let a null win "cheapest" as £0,
 * and clearing a shop's prices is now how this project records "we cannot
 * stand behind these figures" (src/catalogue/priceQuarantine.ts), so nulls
 * arrive by design.
 *
 * ── Two things this file ships beyond the price line itself ────────────────
 * 1. **Explicit gap markers.** A commit where every listing for a fragrance
 *    is excluded (out of stock everywhere, or delisted everywhere) produces
 *    no cheapest price at all that commit. Left silent, that is invisible to
 *    the series: if the fragrance returns later at an *unchanged* price, the
 *    "collapse a run of identical observations" rule never fires a new point
 *    either, and src/services/priceHistoryDaily.ts's carry forward would
 *    bridge straight across the gap as though the price held steady the
 *    whole time — which is not what happened; it was not buyable for part of
 *    that stretch. `{ priceGbp: null, retailerId: null }` is written into the
 *    series at exactly the commit this happens, and nowhere else, so the
 *    frontend can tell "a fresh reading of an unchanged price" apart from
 *    "we never stopped watching, but nothing was buyable here" and reset its
 *    carry forward accordingly. It is never plotted as a price — see
 *    priceHistoryDaily.ts's own header for the frontend half of this.
 * 2. **A reason for every fragrance that still does not reach a chart.**
 *    Below two *real* (non null) points is still too little to draw a line.
 *    PRICE_HISTORY_GAP names one of three honest, mutually exclusive facts —
 *    never priced at all, priced but only ever out of stock, or exactly one
 *    buyable price on record — computed from a parallel, unfiltered by stock
 *    replay (`everPriced`) kept only for this classification and never
 *    merged into the shipped price line itself. See
 *    src/services/priceHistoryGaps.ts for the wording each one gets.
 *
 * ── Resuming, since 2026-09-05 ──────────────────────────────────────────────
 * The replay itself lives in scripts/priceHistoryReplay.ts and resumes from
 * data/price-history-checkpoint.json rather than starting at the first
 * commit every time: the fold's state after commit k is a complete
 * checkpoint, replaying k+1..n from it equals replaying 1..n from nothing
 * (tests/priceHistoryReplay.test.ts proves that against real history), and
 * a scheduled harvest only ever adds a handful of commits. That module's
 * header records why — eight consecutive red runs from 2026-09-04, a
 * replay that had grown past the workflow's 10-minute step timeout — and
 * when a full replay is still forced (any change to the rules above, which
 * the checkpoint fingerprints). `--full` forces one by hand.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECKPOINT_PATH,
  OUTPUT_PATH,
  commitsTouchingCatalogue,
  emptyState,
  readCheckpoint,
  render,
  replay,
  resumeFrom,
  rulesFingerprint,
  toCheckpoint,
  writeCheckpoint,
} from './priceHistoryReplay.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fullReplay = process.argv.includes('--full');

const commits = commitsTouchingCatalogue(root);
const rules = rulesFingerprint(root);

const decision = fullReplay
  ? ({ resume: false, reason: '--full was passed' } as const)
  : resumeFrom(readCheckpoint(root), rules, commits);

let state = emptyState();
let from = 0;
if (decision.resume) {
  state = decision.state;
  from = decision.from;
  console.log(
    `Resuming from checkpoint: ${decision.commitsReplayed} of ${commits.length} commits touching data/catalogue ` +
      `already replayed, ${commits.length - from} to go.`,
  );
} else {
  console.log(`Full replay of ${commits.length} commits touching data/catalogue (${decision.reason}).`);
}

replay(root, commits.slice(from), state, (done, total, fragrances) => {
  console.log(`  ${from + done}/${commits.length} commits replayed, ${fragrances} fragrances with history so far`);
});

const rendered = render(state, commits);
console.log(`\n${rendered.fragrancesWithHistory} fragrances have at least one recorded price`);
console.log(`${rendered.charted} of those have 2+ real points (an actual line) and are included below`);
const gaps = rendered.gapCounts;
console.log(
  `${gaps.never + gaps['sold-out'] + gaps['not-enough']} fragrances short of a chart get a reason instead of blank space: ` +
    `${gaps.never} never priced, ${gaps['sold-out']} priced only while out of stock, ${gaps['not-enough']} exactly one buyable reading`,
);

writeFileSync(resolve(root, OUTPUT_PATH), rendered.body);
console.log(`\n${OUTPUT_PATH} written (${(rendered.body.length / 1024).toFixed(0)} kB)`);
const checkpointBytes = writeCheckpoint(root, toCheckpoint(state, rules, commits));
console.log(`${CHECKPOINT_PATH} written (${(checkpointBytes / 1024).toFixed(0)} kB) at commit ${commits.at(-1)?.sha.slice(0, 8)}`);
