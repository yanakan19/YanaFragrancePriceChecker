/**
 * Price history, loaded when it is needed rather than before the app starts.
 *
 * demo/priceHistory.generated.ts is ~6.6 MB of JSON (~425 KB gzipped), and the
 * one thing that reads it is the product page's price chart. It used to be one
 * of the data files the page fetched and parsed before it could draw a single
 * tile. It is now a lazy data file (LAZY_DATA_MODULES in scripts/dataFiles.ts):
 * the bundle imports only its types, and this module fetches it through the
 * loader's `__psLazy(name)` the first time a product page asks, or earlier,
 * when the browser is idle after the first paint (prefetchWhenIdle), so it is
 * usually in by the time anyone opens a product page.
 *
 * Nothing on start-up needs it. Deals are reductions against each shop's own
 * stated reference price, computed at build time into deals.generated.ts by
 * scripts/build-deals.ts, and no tile or list label is derived from history,
 * so there is no summary to keep eager either.
 *
 * A failed fetch is not remembered: the next product page asks again, so a
 * dropped connection costs one chart, not the rest of the visit's.
 */
import type { PriceHistoryPoint } from './priceHistory.generated.js';
import type { PriceHistoryGap } from '../src/services/priceHistoryGaps.js';
import { dayKey } from '../src/services/priceHistoryDaily.js';

/** Same name as LAZY_GLOBAL in scripts/dataFiles.ts; tests/priceHistoryLazy pins the two. */
export const LAZY_GLOBAL = '__psLazy';
/** The lazy data file's name, a key of LAZY_DATA_MODULES in scripts/dataFiles.ts. */
export const PRICE_HISTORY_FILE = 'priceHistory';

export type LazyStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Something loaded at most once, on first need, with its state readable synchronously. */
export interface LazyData<T> {
  /** The value, once loaded; null before that and after a failure. */
  current(): T | null;
  status(): LazyStatus;
  /** Starts the load unless one is running or done; every caller shares it. */
  load(): Promise<T>;
}

export function lazyData<T>(fetcher: () => Promise<T>): LazyData<T> {
  let value: T | null = null;
  let status: LazyStatus = 'idle';
  let pending: Promise<T> | null = null;
  return {
    current: () => value,
    status: () => status,
    load() {
      if (pending) return pending;
      status = 'loading';
      // Promise.resolve().then, so a fetcher that throws synchronously fails
      // the same way as one that rejects.
      pending = Promise.resolve()
        .then(fetcher)
        .then(
          (v) => {
            value = v;
            status = 'ready';
            return v;
          },
          (err: unknown) => {
            status = 'failed';
            pending = null;
            throw err;
          },
        );
      return pending;
    },
  };
}

/** What the lazy file holds: the generated module's two data exports. */
export interface PriceHistoryFile {
  PRICE_HISTORY: Record<string, PriceHistoryPoint[]>;
  PRICE_HISTORY_GAP: Record<string, PriceHistoryGap>;
}

export interface PriceHistoryData {
  history: Record<string, PriceHistoryPoint[]>;
  gaps: Record<string, PriceHistoryGap>;
  /**
   * The first and last calendar day any price was recorded for anything — the
   * shared x-axis every chart is drawn on, so two fragrances' charts sit on the
   * same timeline and can be compared by eye. Computed once from the history
   * rather than hardcoded, so it extends itself as the site ages; null when
   * there is no real price in it at all.
   */
  span: { first: string; last: string } | null;
}

/** Every point scanned, not just each list's ends: an out-of-order list must not mis-scale every chart. */
export function historySpan(history: Record<string, PriceHistoryPoint[]>): PriceHistoryData['span'] {
  let first: string | null = null;
  let last: string | null = null;
  for (const series of Object.values(history)) {
    for (const p of series) {
      // Gap markers (priceGbp: null) carry a real timestamp too, but they
      // never widen the axis on their own — they only ever fall between two
      // real readings that already bound the same span.
      if (p.priceGbp === null) continue;
      const key = dayKey(p.at);
      if (first === null || key < first) first = key;
      if (last === null || key > last) last = key;
    }
  }
  return first !== null && last !== null ? { first, last } : null;
}

/** Checks the file's shape and derives the span. Throws on anything else, which the page shows as a failed load. */
export function preparePriceHistory(raw: unknown): PriceHistoryData {
  const file = raw as Partial<PriceHistoryFile> | null;
  const isRecord = (v: unknown): v is Record<string, never> => typeof v === 'object' && v !== null && !Array.isArray(v);
  if (!isRecord(file) || !isRecord(file.PRICE_HISTORY) || !isRecord(file.PRICE_HISTORY_GAP)) {
    throw new Error('price history file is not { PRICE_HISTORY, PRICE_HISTORY_GAP }');
  }
  return { history: file.PRICE_HISTORY, gaps: file.PRICE_HISTORY_GAP, span: historySpan(file.PRICE_HISTORY) };
}

type LazyFetch = (name: string) => Promise<unknown>;

/** The loader's `__psLazy`, or a rejection when the page has none (a build without lazy files). */
export function fetchLazyFile(name: string, scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): Promise<unknown> {
  const fetchLazy = scope[LAZY_GLOBAL] as LazyFetch | undefined;
  if (typeof fetchLazy !== 'function') return Promise.reject(new Error(`no ${LAZY_GLOBAL} on this page`));
  return fetchLazy(name);
}

export function createPriceHistory(fetchFile: LazyFetch = fetchLazyFile): LazyData<PriceHistoryData> {
  return lazyData(() => fetchFile(PRICE_HISTORY_FILE).then(preparePriceHistory));
}

/** The app's one copy. */
export const priceHistory = createPriceHistory();

/** The few browser calls prefetchWhenIdle makes, so tests can drive them. */
export interface IdleScheduler {
  requestAnimationFrame(fn: () => void): unknown;
  setTimeout(fn: () => void, ms: number): unknown;
  requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => unknown;
}

/**
 * Runs `task` once the browser has drawn a frame and then has nothing better
 * to do: requestIdleCallback where there is one (Safari has none), with a
 * deadline so a page that is never idle still gets it, and a plain timeout
 * where there is not. The frame first, so the work never competes with the
 * first paint it is meant to follow.
 */
export function prefetchWhenIdle(task: () => void, env: IdleScheduler = globalThis as unknown as IdleScheduler): void {
  env.requestAnimationFrame(() => {
    env.setTimeout(() => {
      if (typeof env.requestIdleCallback === 'function') env.requestIdleCallback(task, { timeout: 4000 });
      else env.setTimeout(task, 1000);
    }, 0);
  });
}
