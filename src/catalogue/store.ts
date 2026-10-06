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

// ── "Last seen" once per run, not once per listing (2026-10-06) ─────────────
//
// Every listing a run confirms gets that run's time as `lastSeenAt`, so a sweep
// rewrote the field on almost every listing of every shop it reached: in one
// harvest 64,504 of 82,900 listings changed nothing else, and that churn was
// most of what the snapshots added to the repository every day
// (docs/TRACKING-AND-STORAGE-STRATEGY.md, item 6). On disk the time most
// listings share is now written once, as the snapshot's `seenAt`, and a
// listing carries its own `lastSeenAt` only when it differs (a page by page
// shop re-reads only some listings each run; a delisted one keeps the run that
// last saw it). Everything above the store sees exactly the listings it always
// did: `read` fills the field back in, at the same place in the object, and
// `write` takes it out again. Measured on the 12 snapshot commits of
// 5 October, packed the way git packs them: 2.64 MB of growth became 0.48 MB.
//
// Files written before this have no `seenAt` and every listing's own field,
// and read exactly as before, so nothing has to be converted and old commits
// stay readable (the price history replay reads them, and does not use the
// field). Reading a snapshot file without this store: `decodeSnapshot`.
// Undo: write without `encodeSnapshot`; this reader reads both forms.

/** The snapshot as written to disk: `seenAt`, and `lastSeenAt` only where it differs. */
export type StoredSnapshotFile = Omit<CatalogueSnapshot, 'listings'> & {
  seenAt?: string;
  listings: Array<Omit<StoredListing, 'lastSeenAt'> & { lastSeenAt?: string }>;
};

/**
 * The time most listings were last seen: the run's own time for any shop read
 * whole. Ties go to the later time, so the answer is the same on every
 * machine. Null for a snapshot with no listing.
 */
export function commonSeenAt(listings: readonly { lastSeenAt?: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const l of listings) if (l.lastSeenAt) counts.set(l.lastSeenAt, (counts.get(l.lastSeenAt) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [at, n] of counts) {
    if (n > bestCount || (n === bestCount && best !== null && at > best)) {
      best = at;
      bestCount = n;
    }
  }
  return best;
}

/** The on-disk form of a snapshot: see above. Keys keep their order; `seenAt` follows `updatedAt`. */
export function encodeSnapshot(snapshot: CatalogueSnapshot): StoredSnapshotFile {
  const seenAt = commonSeenAt(snapshot.listings);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (key === 'seenAt') continue;
    if (key === 'listings') {
      out.listings = seenAt === null
        ? snapshot.listings
        : snapshot.listings.map((l) => {
          if (l.lastSeenAt !== seenAt) return l;
          const { lastSeenAt: _shared, ...rest } = l;
          return rest;
        });
    } else {
      out[key] = value;
    }
    if (key === 'updatedAt' && seenAt !== null) out.seenAt = seenAt;
  }
  if (seenAt !== null && !('seenAt' in out)) out.seenAt = seenAt;
  return out as StoredSnapshotFile;
}

/**
 * A snapshot file as every reader expects it: each listing with its
 * `lastSeenAt`, put back right after `firstSeenAt`, and no `seenAt`. Files
 * from before 2026-10-06 come back unchanged. Generic so a script that reads
 * the file with its own narrower type keeps it.
 */
export function decodeSnapshot<T>(raw: T): T {
  const file = raw as { seenAt?: unknown; listings?: unknown };
  if (typeof file !== 'object' || file === null || typeof file.seenAt !== 'string') return raw;
  const seenAt = file.seenAt;
  const { seenAt: _seenAt, ...rest } = file as Record<string, unknown> & { seenAt: string };
  if (Array.isArray(file.listings)) {
    rest.listings = file.listings.map((l: Record<string, unknown>) => {
      if (typeof l !== 'object' || l === null || 'lastSeenAt' in l) return l;
      const back: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(l)) {
        back[key] = value;
        if (key === 'firstSeenAt') back.lastSeenAt = seenAt;
      }
      if (!('lastSeenAt' in back)) back.lastSeenAt = seenAt;
      return back;
    });
  }
  return rest as T;
}

/** Reads and decodes one snapshot file, for scripts that read data/catalogue or data/houses directly. */
export function readSnapshotFile<T = CatalogueSnapshot>(path: string): T {
  return decodeSnapshot(JSON.parse(readFileSync(path, 'utf8')) as T);
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
      return decodeSnapshot(JSON.parse(readFileSync(file, 'utf8')) as CatalogueSnapshot);
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
      writeFileSync(temp, `${JSON.stringify(encodeSnapshot(trimmed), null, 2)}\n`);
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
