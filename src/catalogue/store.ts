import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CatalogueRun, StoredListing } from './types.js';
import { assertNoQuarantinedGbpPrices } from './currencyQuarantine.js';

/**
 * A JSON file store for the catalogue.
 *
 * Deliberately boring. The project has no database yet, and standing one up is
 * not a prerequisite for proving the crawl and the NEW badge work. The shapes
 * here mirror `schema.sql` one to one, so the move to Postgres replaces this
 * file and nothing above it.
 *
 * One file per retailer keeps a bad run for one shop from corrupting the rest,
 * and makes the diff on a daily commit readable.
 */

export type CrawlSource = 'live' | 'fixtures';

export interface CatalogueSnapshot {
  retailerId: string;
  updatedAt: string;
  /**
   * Which kind of run produced this. Fixture data must never seed a live crawl:
   * the SKUs differ, so every real listing would look new and every saved one
   * would look delisted on the first live run.
   */
  source?: CrawlSource;
  listings: StoredListing[];
  runs: CatalogueRun[];
}

const EMPTY = (retailerId: string): CatalogueSnapshot => ({
  retailerId,
  updatedAt: new Date(0).toISOString(),
  listings: [],
  runs: [],
});

export class CatalogueStore {
  constructor(private readonly root: string) {}

  private path(retailerId: string): string {
    return join(this.root, `${retailerId}.json`);
  }

  read(retailerId: string): CatalogueSnapshot {
    const file = this.path(retailerId);
    if (!existsSync(file)) return EMPTY(retailerId);
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as CatalogueSnapshot;
    } catch {
      // A corrupt snapshot must not be silently treated as an empty one: that
      // would look like a first crawl and suppress every NEW badge for a week.
      throw new Error(
        `Catalogue snapshot for ${retailerId} is unreadable at ${file}. ` +
          `Restore it or delete it deliberately before crawling again.`,
      );
    }
  }

  /**
   * Replace one retailer's snapshot, atomically.
   *
   * The harvest calls this once per shop, inside its loop, so the shops it has
   * already finished are on disk the moment they finish. That is what lets a
   * harvest that runs out of time keep its work: the workflow caps the harvest
   * step and commits `data/catalogue` regardless, so a run cut short publishes
   * every shop it got to instead of discarding all of them.
   *
   * Which makes the *manner* of the cut load-bearing. A step timeout kills the
   * process tree outright — run #180's log ends with the runner terminating
   * `npm run harvest` and its node children mid-shop — and a plain
   * `writeFileSync` truncates the file before it writes, so a kill landing in
   * that window leaves a half-written snapshot on disk. `read()` above rightly
   * refuses to parse one: it throws rather than mistake a truncated file for an
   * empty shop, because treating it as empty would look like a first crawl and
   * suppress every NEW badge for a week. So the next run would not degrade — it
   * would fail outright, on a file the previous run corrupted, and stay failing
   * until someone deleted it by hand.
   *
   * Writing beside the target and renaming closes that window. rename(2) within
   * a directory is atomic, so a reader sees either the previous snapshot or the
   * new one, never a prefix of either. The temp file is removed on failure so a
   * killed run leaves no litter for the next one to commit.
   *
   * It is also the one place every writer of a snapshot passes through — the
   * harvest, the Awin feed ingest, the feed catalogue run, the storefront
   * reprice, price-verify, both repair scripts and the generic crawl — which
   * is why the currency quarantine is enforced here rather than in any one of
   * them. See src/catalogue/currencyQuarantine.ts for what a scheduled run
   * silently undid before it was.
   */
  write(snapshot: CatalogueSnapshot): void {
    assertNoQuarantinedGbpPrices(snapshot.retailerId, snapshot.listings);
    const file = this.path(snapshot.retailerId);
    mkdirSync(dirname(file), { recursive: true });
    // Keep only recent run history. The full record belongs in a database.
    const trimmed: CatalogueSnapshot = {
      ...snapshot,
      runs: [...snapshot.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30),
    };
    // Same directory as the target, so the rename never crosses a filesystem —
    // across one it would fall back to a copy and reopen the very window this
    // exists to close. The pid keeps two concurrent writers apart.
    const temp = `${file}.${process.pid}.tmp`;
    try {
      writeFileSync(temp, `${JSON.stringify(trimmed, null, 2)}\n`);
      renameSync(temp, file);
    } catch (err) {
      try {
        unlinkSync(temp);
      } catch {
        // Already gone, or never created. Nothing to clean up.
      }
      throw err;
    }
  }

  /** Has this retailer ever been crawled successfully? */
  hasBaseline(retailerId: string): boolean {
    return this.read(retailerId).listings.length > 0;
  }
}
