import type { Retailer } from '../types/retailer.js';
import type { CatalogueRun, RawListing } from './types.js';
import { parseListings } from './jsonld.js';
import { reconcile } from './reconcile.js';
import type { CatalogueStore } from './store.js';

/**
 * The daily catalogue crawl.
 *
 * Fetching is injected rather than imported so the same orchestration runs
 * against live HTTP, against saved fixtures, or against a stub in tests. That
 * is not ceremony: the crawl is the part that must be provably correct before
 * it is ever pointed at twelve real shops, and it cannot be tested properly if
 * it hard depends on the network.
 */

export interface FetchResult {
  ok: boolean;
  html: string;
  status: number;
  error?: string;
}

/** Fetches one catalogue page. */
export type PageFetcher = (url: string, retailer: Retailer) => Promise<FetchResult>;

export interface CrawlOptions {
  retailer: Retailer;
  fetchPage: PageFetcher;
  store: CatalogueStore;
  /** Injected for reproducible runs. */
  now?: Date;
  /** Called between requests so politeness delays are testable. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function crawlRetailer(options: CrawlOptions): Promise<CatalogueRun> {
  const { retailer, fetchPage, store, now = new Date(), sleep = realSleep } = options;
  const startedAt = now.toISOString();
  const runId = `${retailer.id}-${startedAt}`;

  const run: CatalogueRun = {
    runId,
    retailerId: retailer.id,
    startedAt,
    finishedAt: null,
    status: 'running',
    baseline: false,
    pagesFetched: 0,
    listingsSeen: 0,
    newListings: 0,
    delistedListings: 0,
    relistedListings: 0,
    errors: [],
  };

  if (!retailer.catalogue) {
    run.status = 'failed';
    run.finishedAt = new Date().toISOString();
    run.errors.push(
      `No catalogue sections configured for ${retailer.name}. Confirm its fragrance ` +
        `section URLs before crawling rather than guessing paths.`,
    );
    return run;
  }

  const { sections, firstPage, maxPages, minRequestGapMs } = retailer.catalogue;
  const crawled: RawListing[] = [];
  let sectionsCompleted = 0;

  for (const section of sections) {
    let sectionOk = true;

    for (let page = firstPage; page < firstPage + maxPages; page++) {
      const url = section.urlTemplate.replace('{page}', String(page));

      let result: FetchResult;
      try {
        result = await fetchPage(url, retailer);
      } catch (err) {
        result = { ok: false, html: '', status: 0, error: String(err) };
      }
      run.pagesFetched++;

      if (!result.ok) {
        sectionOk = false;
        run.errors.push(`${section.id} page ${page}: ${result.error ?? `HTTP ${result.status}`}`);
        break;
      }

      const found = parseListings(result.html, { sectionId: section.id, pageUrl: url });

      // An empty page is how pagination ends. Retailers rarely tell you the
      // page count honestly, and trusting a stated total walks past the end.
      if (found.length === 0) break;

      crawled.push(...found);

      if (minRequestGapMs > 0) await sleep(minRequestGapMs);
    }

    if (sectionOk) sectionsCompleted++;
  }

  // Only a run that walked every section may conclude that a missing listing is
  // gone. A network wobble halfway through must never delist half a catalogue.
  const complete = sectionsCompleted === sections.length;

  const snapshot = store.read(retailer.id);
  const outcome = reconcile({
    existing: snapshot.listings,
    crawled,
    retailerId: retailer.id,
    now: startedAt,
    complete,
  });

  run.baseline = outcome.baseline;
  run.listingsSeen = crawled.length;
  run.newListings = outcome.newIds.length;
  run.delistedListings = outcome.delistedIds.length;
  run.relistedListings = outcome.relistedIds.length;
  run.finishedAt = new Date().toISOString();
  run.status = run.errors.length === 0 ? 'ok' : complete ? 'ok' : 'partial';

  if (crawled.length === 0 && !complete) {
    run.status = 'failed';
  }

  // A failed run leaves the previous snapshot untouched. Writing an empty
  // catalogue would delist everything and then flag it all new on recovery.
  if (run.status !== 'failed') {
    store.write({
      retailerId: retailer.id,
      updatedAt: run.finishedAt,
      listings: outcome.listings,
      runs: [run, ...snapshot.runs],
    });
  }

  return run;
}
