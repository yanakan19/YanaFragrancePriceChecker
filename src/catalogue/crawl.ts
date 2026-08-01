import type { Retailer } from '../types/retailer.js';
import type { CatalogueRun, RawListing } from './types.js';
import { parseListings } from './jsonld.js';
import { reconcile } from './reconcile.js';
import type { CatalogueStore, CrawlSource } from './store.js';

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
  /** Tags the snapshot, and blocks mixing saved data into a live crawl. */
  source?: CrawlSource;
  /** Injected for reproducible runs. */
  now?: Date;
  /** Called between requests so politeness delays are testable. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A crawl returning less than this share of the listings we already held is
 * treated as broken rather than believed. Half is deliberately generous: real
 * catalogues do shrink after a season ends, but never by more than half
 * overnight.
 */
const COLLAPSE_FLOOR = 0.5;

export async function crawlRetailer(options: CrawlOptions): Promise<CatalogueRun> {
  const {
    retailer, fetchPage, store, now = new Date(), sleep = realSleep, source = 'fixtures',
  } = options;
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

  // Fixture SKUs are invented and will not match a real shop's. Reconciling
  // across the two would delist everything saved and flag the entire real
  // catalogue as new, which is precisely what the baseline guard exists to
  // prevent. Clear data/catalogue before the first live run.
  if (snapshot.listings.length > 0 && snapshot.source && snapshot.source !== source) {
    run.status = 'failed';
    run.finishedAt = new Date().toISOString();
    run.errors.push(
      `Held data for ${retailer.name} came from a ${snapshot.source} run and this is a ` +
        `${source} run. Delete data/catalogue and start a clean baseline rather than ` +
        `mixing the two.`,
    );
    return run;
  }

  const priorActive = snapshot.listings.filter((l) => l.status === 'active').length;

  // A shop that returned hundreds of listings yesterday and almost none today
  // has not stopped selling fragrance. Far more likely the section URL moved,
  // the markup changed, or we were served a bot wall with a 200 status. Writing
  // that through would delist the catalogue, and the recovery run would then
  // flag every single product as new. Refuse it and keep yesterday's data.
  if (priorActive > 0) {
    const collapsed = crawled.length < priorActive * COLLAPSE_FLOOR;
    if (collapsed) {
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
      run.listingsSeen = crawled.length;
      run.errors.push(
        `Refusing to write: found ${crawled.length} listings against ${priorActive} ` +
          `held. Below ${Math.round(COLLAPSE_FLOOR * 100)}% of the previous run, which ` +
          `almost always means a broken section URL or a blocked request rather than ` +
          `a shop clearing its shelves. Previous snapshot kept.`,
      );
      return run;
    }
  }

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
      source,
      listings: outcome.listings,
      runs: [run, ...snapshot.runs],
    });
  }

  return run;
}
