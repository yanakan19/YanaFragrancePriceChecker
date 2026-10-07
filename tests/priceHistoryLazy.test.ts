import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { basePath } from '../demo/router.js';
import {
  LAZY_GLOBAL as STORE_LAZY_GLOBAL,
  PRICE_HISTORY_FILE,
  createPriceHistory,
  fetchLazyFile,
  historySpan,
  lazyData,
  prefetchWhenIdle,
  preparePriceHistory,
  type IdleScheduler,
} from '../demo/priceHistoryStore.js';
import {
  LAZY_DATA_MODULES,
  LAZY_NAMES,
  LAZY_GLOBAL,
  READY_GLOBAL,
  hashedDataPath,
  loaderScript,
  referencedDataFiles,
} from '../scripts/dataFiles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The price history (~6.6 MB of JSON) is fetched when the product page's
 * chart needs it, or at idle time after the first paint, instead of before
 * the app may start. See demo/priceHistoryStore.ts. The page-level half (the
 * placeholder, the swap, the failure note) runs against the built page in
 * tests/priceHistoryLazyBrowser.test.ts.
 */

const point = (at: string, priceGbp: number | null) => ({ at, priceGbp, retailerId: priceGbp === null ? null : 'allbeauty' });

describe('lazyData', () => {
  it('does nothing until asked, then fetches once however many callers ask', async () => {
    const fetcher = vi.fn(async () => 42);
    const d = lazyData(fetcher);
    expect(d.status()).toBe('idle');
    expect(d.current()).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    const a = d.load();
    const b = d.load();
    expect(d.status()).toBe('loading');
    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(await d.load()).toBe(42);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(d.status()).toBe('ready');
    expect(d.current()).toBe(42);
  });

  it('forgets a failure, so the next caller tries again', async () => {
    let calls = 0;
    const d = lazyData(async () => {
      calls++;
      if (calls === 1) throw new Error('offline');
      return 'ok';
    });
    await expect(d.load()).rejects.toThrow('offline');
    expect(d.status()).toBe('failed');
    expect(d.current()).toBeNull();
    expect(await d.load()).toBe('ok');
    expect(d.status()).toBe('ready');
    expect(calls).toBe(2);
  });

  it('treats a fetcher that throws synchronously as a failed load, not a crash', async () => {
    const d = lazyData<number>(() => {
      throw new Error('boom');
    });
    await expect(d.load()).rejects.toThrow('boom');
    expect(d.status()).toBe('failed');
  });
});

describe('preparePriceHistory', () => {
  it('derives the shared axis from real prices only, scanning every point', () => {
    const history = {
      a: [point('2026-08-03T10:00:00Z', 10), point('2026-09-30T10:00:00Z', null)],
      // Out of order on purpose: the span must not trust each list's ends.
      b: [point('2026-08-20T10:00:00Z', 12), point('2026-08-02T10:00:00Z', 11), point('2026-09-01T10:00:00Z', 13)],
    };
    const data = preparePriceHistory({ PRICE_HISTORY: history, PRICE_HISTORY_GAP: { c: { reason: 'never' } } });
    expect(data.span).toEqual({ first: '2026-08-02', last: '2026-09-01' });
    expect(data.history).toBe(history);
    expect(data.gaps).toEqual({ c: { reason: 'never' } });
    expect(historySpan({})).toBeNull();
  });

  it('refuses anything that is not the two maps, which the page shows as a failed load', () => {
    for (const bad of [null, [], 'x', {}, { PRICE_HISTORY: {} }, { PRICE_HISTORY: [], PRICE_HISTORY_GAP: {} }]) {
      expect(() => preparePriceHistory(bad)).toThrow();
    }
  });
});

describe('fetching the file', () => {
  it('goes through the loader\'s global, under the same name the build uses', async () => {
    expect(STORE_LAZY_GLOBAL).toBe(LAZY_GLOBAL);
    expect(Object.keys(LAZY_DATA_MODULES)).toContain(PRICE_HISTORY_FILE);
    const asked: string[] = [];
    const scope = { [LAZY_GLOBAL]: async (name: string) => { asked.push(name); return 'data'; } };
    expect(await fetchLazyFile('priceHistory', scope)).toBe('data');
    expect(asked).toEqual(['priceHistory']);
    await expect(fetchLazyFile('priceHistory', {})).rejects.toThrow(LAZY_GLOBAL);
  });

  it('builds the store from the file, and fails it on a bad file rather than drawing nonsense', async () => {
    const good = createPriceHistory(async () => ({ PRICE_HISTORY: { a: [point('2026-08-01T00:00:00Z', 5)] }, PRICE_HISTORY_GAP: {} }));
    expect((await good.load()).span).toEqual({ first: '2026-08-01', last: '2026-08-01' });
    const bad = createPriceHistory(async () => ['not', 'it']);
    await expect(bad.load()).rejects.toThrow();
    expect(bad.status()).toBe('failed');
  });
});

describe('prefetchWhenIdle', () => {
  function scheduler(withIdle: boolean) {
    const log: string[] = [];
    const queue: (() => void)[] = [];
    const env: IdleScheduler = {
      requestAnimationFrame: (fn) => { log.push('frame'); queue.push(fn); },
      setTimeout: (fn, ms) => { log.push(`timeout ${ms}`); queue.push(fn); },
      ...(withIdle ? { requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => { log.push(`idle ${opts?.timeout}`); queue.push(fn); } } : {}),
    };
    const drain = () => { while (queue.length) queue.shift()!(); };
    return { env, log, drain };
  }

  it('waits for a frame, then for idle time with a deadline', () => {
    const { env, log, drain } = scheduler(true);
    const task = vi.fn();
    prefetchWhenIdle(task, env);
    expect(task).not.toHaveBeenCalled();
    drain();
    expect(task).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['frame', 'timeout 0', 'idle 4000']);
  });

  it('falls back to a timeout where there is no requestIdleCallback (Safari)', () => {
    const { env, log, drain } = scheduler(false);
    const task = vi.fn();
    prefetchWhenIdle(task, env);
    drain();
    expect(task).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['frame', 'timeout 0', 'timeout 1000']);
  });
});

/** Runs the loader against a stub window; returns what it fetched and the window. */
function runLoader(pathname: string, lazyServed: Record<string, unknown>) {
  const files = [{ path: hashedDataPath('catalogue', 'c'), start: 0 }];
  const served = { [files[0]!.path]: ['cat'], ...lazyServed };
  const lazy = [{ name: 'priceHistory', path: hashedDataPath('priceHistory', 'h') }];
  const fetched: string[] = [];
  const window: Record<string, unknown> = {};
  const fetch = async (url: string) => {
    fetched.push(url);
    const key = Object.keys(served).find((p) => url.endsWith(p));
    return key ? { ok: true, status: 200, json: async () => served[key] } : { ok: false, status: 404, json: async () => null };
  };
  const document = { readyState: 'complete', addEventListener: () => {} };
  new Function('window', 'location', 'fetch', 'document', 'requestAnimationFrame', loaderScript(files, lazy))(
    window, { pathname }, fetch, document, (fn: () => void) => setTimeout(fn, 0),
  );
  return { fetched, window, files, lazy };
}

describe('the loader\'s on-demand files', () => {
  it('are not fetched at start-up, and the app can start without them', async () => {
    const { fetched, window } = runLoader('/', {});
    await (window[READY_GLOBAL] as Promise<void>);
    expect(fetched).toEqual([`/${hashedDataPath('catalogue', 'c')}`]);
  });

  for (const pathname of ['/', '/fragrance/ean-5012345678900', '/YanaFragrancePriceChecker/index.html']) {
    it(`are fetched from the app's base when asked for, at ${pathname}`, async () => {
      const path = hashedDataPath('priceHistory', 'h');
      const { fetched, window } = runLoader(pathname, { [path]: { PRICE_HISTORY: {} } });
      const lazyFetch = window[LAZY_GLOBAL] as (n: string) => Promise<unknown>;
      expect(await lazyFetch('priceHistory')).toEqual({ PRICE_HISTORY: {} });
      expect(fetched.at(-1)).toBe(basePath(pathname) + path);
    });
  }

  it('reject with the status when the file is missing, and refuse a name they do not have', async () => {
    const { window } = runLoader('/', {});
    const lazyFetch = window[LAZY_GLOBAL] as (n: string) => Promise<unknown>;
    await expect(lazyFetch('priceHistory')).rejects.toMatchObject({ status: 404 });
    await expect(lazyFetch('catalogue')).rejects.toThrow('no lazy data file');
  });
});

describe('the built page', () => {
  const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  const eager = JSON.parse(/var files = (\[.*\]);/.exec(html)![1]!) as [string, number][];
  const lazy = JSON.parse(/var lazy = (\{.*\});/.exec(html)![1]!) as Record<string, string>;

  it('starts without the price history, and still names its file', () => {
    expect(Object.keys(lazy).sort()).toEqual([...LAZY_NAMES].sort());
    const historyPath = lazy[PRICE_HISTORY_FILE]!;
    expect(historyPath).toMatch(/^data\/priceHistory\.[0-9a-f]{16}\.json$/);
    expect(eager.map(([p]) => p)).not.toContain(historyPath);
    expect(eager.some(([p]) => p.startsWith('data/priceHistory.'))).toBe(false);
    // Named in the document is what the service worker keys on: it pre-caches
    // every data file a page names and prunes the rest (demo/sw.js).
    expect(referencedDataFiles(html)).toContain(historyPath);
  });

  it('ships the generated module\'s data exports in the file, unchanged', async () => {
    const file = JSON.parse(readFileSync(resolve(root, 'demo', lazy[PRICE_HISTORY_FILE]!), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(file).sort()).toEqual([...LAZY_DATA_MODULES[PRICE_HISTORY_FILE]!].sort());
    const mod = await import('../demo/priceHistory.generated.js');
    expect(Object.keys(file.PRICE_HISTORY as object).length).toBe(Object.keys(mod.PRICE_HISTORY).length);
    expect(JSON.stringify(file.PRICE_HISTORY_GAP)).toBe(JSON.stringify(mod.PRICE_HISTORY_GAP));
    // And the page can use it as it stands.
    expect(preparePriceHistory(file).span).not.toBeNull();
    // Transforming the ~8 MB generated module takes longer than the default
    // 5 seconds now that the history has grown (it timed out on 2026-10-03),
    // and the history is kept, never pruned, so it only grows from here.
  }, 60_000);
});
