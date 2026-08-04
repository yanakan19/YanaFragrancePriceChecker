/**
 * Undo the delistings that the `complete: true` bug produced.
 *
 *   npm run repair:delist -- --dry-run   # report what would change
 *   npm run repair:delist                # apply it
 *
 * ── What went wrong ──────────────────────────────────────────────────────────
 * Until this was fixed, scripts/catalogue-harvest.ts told reconcile() that
 * every budgeted sample was a complete walk of the shop. reconcile() correctly
 * concluded that anything absent from a complete walk had been withdrawn, so
 * each hourly run marked the whole of the previous run's findings as delisted.
 * Beauty Base ended with 240 of its 300 known listings delisted at
 * 2026-08-02T16:38:39.030Z — the same millisecond, which no real shop does.
 *
 * ── Why undoing it is honest ─────────────────────────────────────────────────
 * Those delistings were never observations. Not one of them came from a walk
 * that actually reached the end of the catalogue, so none is evidence that the
 * product stopped being sold. Clearing them does not assert the listing is on
 * sale right now; it restores the only thing we ever genuinely knew, which is
 * "we saw this at `lastSeenAt` and have not looked since". That is exactly what
 * `lastSeenAt` already says, and the app surfaces it.
 *
 * A listing that really has gone will be caught by the refresh share of the
 * harvest budget, which re-fetches the stalest URLs first.
 *
 * ── The threshold ────────────────────────────────────────────────────────────
 * Only *mass* events are reverted: many listings delisted at one identical
 * timestamp. A shop dropping a handful of products over a day is ordinary
 * retail and is left alone. A shop dropping hundreds within the same
 * millisecond is this bug.
 */
import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../src/catalogue/store.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');

/**
 * How many listings must share one delisting instant before it is treated as
 * the bug rather than as retail. Ten is comfortably above any plausible
 * simultaneous withdrawal and far below the hundreds this bug produced.
 */
const MASS_EVENT_THRESHOLD = 10;

const dirs = ['data/catalogue', 'data/houses'].filter((d) => existsSync(resolve(root, d)));

let totalRestored = 0;

for (const relDir of dirs) {
  const dir = resolve(root, relDir);
  const store = new CatalogueStore(dir);

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const id = file.replace(/\.json$/, '');
    const snapshot = store.read(id);

    // Fixture snapshots are invented data and are not affected by this bug.
    if (snapshot.source !== 'live') continue;

    const counts = new Map<string, number>();
    for (const l of snapshot.listings) {
      if (l.status === 'delisted' && l.delistedAt) {
        counts.set(l.delistedAt, (counts.get(l.delistedAt) ?? 0) + 1);
      }
    }

    const massEvents = new Set(
      [...counts.entries()].filter(([, n]) => n >= MASS_EVENT_THRESHOLD).map(([ts]) => ts),
    );
    if (massEvents.size === 0) continue;

    let restored = 0;
    const listings = snapshot.listings.map((l) => {
      if (l.status !== 'delisted' || !l.delistedAt || !massEvents.has(l.delistedAt)) return l;
      restored++;
      return {
        ...l,
        status: 'active' as const,
        delistedAt: null,
        // `relistedAt` deliberately untouched: this listing never actually left,
        // so recording a return would invent an event as fictitious as the
        // delisting being undone.
      };
    });

    totalRestored += restored;
    console.log(
      `  ${id.padEnd(20)} restored ${String(restored).padStart(4)} listings ` +
        `from ${massEvents.size} mass event(s)`,
    );

    if (!dryRun) {
      store.write({ ...snapshot, listings });
    }
  }
}

console.log(
  `\n${totalRestored} listings restored${dryRun ? ' (dry run, nothing written)' : ''}.`,
);
if (totalRestored > 0 && !dryRun) {
  console.log('Rebuild the app to see them: npm run catalogue:demo && npm run demo');
}
