import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CatalogueRun, StoredListing } from './types.js';

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

export interface CatalogueSnapshot {
  retailerId: string;
  updatedAt: string;
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

  write(snapshot: CatalogueSnapshot): void {
    const file = this.path(snapshot.retailerId);
    mkdirSync(dirname(file), { recursive: true });
    // Keep only recent run history. The full record belongs in a database.
    const trimmed: CatalogueSnapshot = {
      ...snapshot,
      runs: [...snapshot.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 30),
    };
    writeFileSync(file, `${JSON.stringify(trimmed, null, 2)}\n`);
  }

  /** Has this retailer ever been crawled successfully? */
  hasBaseline(retailerId: string): boolean {
    return this.read(retailerId).listings.length > 0;
  }
}
