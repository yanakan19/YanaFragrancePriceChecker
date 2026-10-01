import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { basePath } from '../demo/router.js';
import {
  APP_READY_ATTR,
  BLOBS_GLOBAL,
  DATA_FILE_PATTERN,
  READY_GLOBAL,
  bootScript,
  hashedDataPath,
  loaderScript,
  referencedDataFiles,
} from '../scripts/dataFiles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The page's data ships as demo/data/<module>.<hash>.json beside the page
 * rather than inside it (scripts/bundle-demo.ts's header has the numbers).
 * These hold the three parts of that to each other: the build that names and
 * prunes the files, the loader in the page that fetches them, and the
 * service worker that keeps them.
 */
describe('hashed data file names', () => {
  it('are derived from the exact bytes, so a name can never mean two contents', () => {
    const a = hashedDataPath('catalogue', '[1,2,3]');
    expect(a).toMatch(/^data\/catalogue\.[0-9a-f]{16}\.json$/);
    expect(a).toBe(`data/catalogue.${createHash('sha256').update('[1,2,3]').digest('hex').slice(0, 16)}.json`);
    expect(hashedDataPath('catalogue', '[1,2,3]')).toBe(a);
    expect(hashedDataPath('catalogue', '[1,2,4]')).not.toBe(a);
  });

  it('are found in a page by the same pattern the service worker uses', () => {
    const sw = readFileSync(resolve(root, 'demo/sw.js'), 'utf8');
    const swPattern = /const DATA_FILE = \/(.+)\/g;/.exec(sw)?.[1];
    expect(swPattern).toBe(DATA_FILE_PATTERN.source);
    const path = hashedDataPath('priceHistory', '[]');
    expect(referencedDataFiles(`<script>var f=[["${path}",0]]</script>`)).toEqual([path]);
  });
});

/** Runs the loader against a stub window at `pathname` with `served` as the host. */
async function runLoader(
  files: { path: string; start: number }[],
  pathname: string,
  served: Record<string, unknown>,
): Promise<{ fetched: string[]; window: Record<string, unknown> }> {
  const fetched: string[] = [];
  const window: Record<string, unknown> = {};
  const fetch = async (url: string) => {
    fetched.push(url);
    const key = Object.keys(served).find((p) => url.endsWith(p));
    return key
      ? { ok: true, status: 200, json: async () => served[key] }
      : { ok: false, status: 404, json: async () => { throw new Error('not json'); } };
  };
  const document = { readyState: 'complete', addEventListener: () => {} };
  const raf = (fn: () => void) => setTimeout(fn, 0);
  new Function('window', 'location', 'fetch', 'document', 'requestAnimationFrame', loaderScript(files))(
    window, { pathname }, fetch, document, raf,
  );
  await (window[READY_GLOBAL] as Promise<void>).catch(() => {});
  return { fetched, window };
}

describe('the data loader in the page', () => {
  const files = [
    { path: hashedDataPath('deals', 'a'), start: 0 },
    { path: hashedDataPath('catalogue', 'b'), start: 1 },
  ];
  const served = { [files[0]!.path]: ['deals'], [files[1]!.path]: ['c0', 'c1'] };

  // Same pathnames tests/serviceWorker.test.ts holds the worker registration
  // to: a deep link is served this document through 404.html, and a fetch
  // relative to it would ask for /brands/data/…, which does not exist.
  for (const pathname of ['/', '/brands/lattafa', '/fragrance/ean-5012345678900', '/YanaFragrancePriceChecker/index.html']) {
    it(`fetches from the app's base, never the current URL, at ${pathname}`, async () => {
      const { fetched } = await runLoader(files, pathname, served);
      expect(fetched).toEqual(files.map((f) => basePath(pathname) + f.path));
    });
  }

  it('puts every file\'s blobs at their global __psData index', async () => {
    const { window } = await runLoader(files, '/', served);
    expect(window[BLOBS_GLOBAL]).toEqual(['deals', 'c0', 'c1']);
  });

  it('rejects, with the status, when a file is missing', async () => {
    const { window } = await runLoader(files, '/', { [files[0]!.path]: ['deals'] });
    await expect(window[READY_GLOBAL] as Promise<void>).rejects.toMatchObject({ status: 404 });
  });
});

describe('the boot script', () => {
  function boot(ready: Promise<void>, storage: Map<string, string>) {
    const calls = { ran: 0, reloads: 0, shown: '', ready: false };
    const view = { set innerHTML(v: string) { calls.shown = v; } };
    const documentElement = { setAttribute: (name: string) => { if (name === APP_READY_ATTR) calls.ready = true; } };
    const src = bootScript('ran();');
    new Function('__psReady', 'ran', 'sessionStorage', 'location', 'document', 'console', src)(
      ready,
      () => { calls.ran++; },
      { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
      { reload: () => { calls.reloads++; } },
      { getElementById: () => view, documentElement },
      { error: () => {} },
    );
    return calls;
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('runs the app once the data is in', async () => {
    const calls = boot(Promise.resolve(), new Map());
    await flush();
    // …and marks the page ready, which is what the browser scripts and
    // tests wait for now that `load` fires before the data is in.
    expect(calls).toEqual({ ran: 1, reloads: 0, shown: '', ready: true });
  });

  it('reloads once for a page older than the deploy, then says so instead of looping', async () => {
    const storage = new Map<string, string>();
    const gone = () => Promise.reject(Object.assign(new Error('gone'), { status: 404 }));
    const first = boot(gone(), storage);
    await flush();
    expect(first.reloads).toBe(1);
    const second = boot(gone(), storage);
    await flush();
    expect(second.reloads).toBe(0);
    expect(second.shown).toContain('role="alert"');
    expect(second.ran).toBe(0);
    expect(second.ready).toBe(false);
  });
});

describe('the built page and its data folder', () => {
  const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  const referenced = referencedDataFiles(html);

  it('fetches its data rather than carrying it inline', () => {
    expect(html).not.toContain('id="ps-data"');
    expect(referenced.length).toBeGreaterThan(0);
    // The loader sits in <head>, ahead of the stylesheet and the markup, so
    // the downloads start as early as the document allows.
    expect(html.indexOf(READY_GLOBAL)).toBeLessThan(html.indexOf('<style>'));
    // The whole point: was ~25 MB with the data inline.
    expect(html.length).toBeLessThan(3 * 1024 * 1024);
  });

  it('has every file it names, under the hash of its own content', () => {
    for (const path of referenced) {
      const file = resolve(root, 'demo', path);
      expect(existsSync(file), `${path} is named by demo/index.html but missing`).toBe(true);
      const name = /^data\/([A-Za-z]+)\.[0-9a-f]{16}\.json$/.exec(path)![1]!;
      expect(hashedDataPath(name, readFileSync(file))).toBe(path);
    }
  });

  it('holds nothing else: superseded builds\' files are deleted, not left to pile up', () => {
    const onDisk = readdirSync(resolve(root, 'demo/data')).map((f) => `data/${f}`).sort();
    expect(onDisk).toEqual([...referenced].sort());
  });

  it('is served identically at every deep link (404.html is the same document)', () => {
    expect(readFileSync(resolve(root, 'demo/404.html'), 'utf8')).toBe(html);
  });
});

// ── demo/sw.js, run against an in-memory Cache Storage ──────────────────────

const SCOPE = 'https://pricesniffs.space/';

function fakeServiceWorker(host: Map<string, string>) {
  const network: string[] = [];
  let offline = false;
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (req: string | { url: string }) => new URL(typeof req === 'string' ? req : req.url, SCOPE).href;
  const fetch = async (req: string | { url: string }) => {
    const url = keyOf(req);
    if (offline) throw new TypeError('Failed to fetch');
    network.push(url);
    const body = host.get(new URL(url).pathname);
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
  };
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: string | { url: string }) => store.get(keyOf(req))?.clone(),
      put: async (req: string | { url: string }, res: Response) => { store.set(keyOf(req), res); },
      addAll: async (reqs: string[]) => {
        for (const r of reqs) {
          const res = await fetch(r);
          if (!res.ok) throw new Error(`addAll: ${r} ${res.status}`);
          store.set(keyOf(r), res);
        }
      },
      keys: async () => [...store.keys()].map((url) => ({ url })),
      delete: async (req: { url: string }) => store.delete(keyOf(req)),
    };
  };
  const caches = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: string | { url: string }) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(req));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const listeners = new Map<string, (e: unknown) => void>();
  const self = {
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
    skipWaiting: () => {},
    clients: { claim: async () => {} },
    registration: { scope: SCOPE },
    location: { origin: new URL(SCOPE).origin },
  };
  new Function('self', 'caches', 'fetch', readFileSync(resolve(root, 'demo/sw.js'), 'utf8'))(self, caches, fetch);

  async function dispatch(type: string, request?: { url: string; mode: string; method: string }): Promise<Response | undefined> {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)!({
      request,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      respondWith: (p: Promise<Response>) => { response = p; },
    });
    const res = await response;
    // waitUntil can be called from inside respondWith's own chain, so keep
    // draining until nothing new has been queued.
    for (let i = 0; i < pending.length; i++) await pending[i];
    return res;
  }
  const get = (path: string, mode = 'cors') => dispatch('fetch', { url: new URL(path, SCOPE).href, mode, method: 'GET' });
  const cached = async (name: string) => [...(stores.get(name)?.keys() ?? [])].map((u) => new URL(u).pathname).sort();
  return { network, dispatch, get, cached, goOffline: () => { offline = true; } };
}

describe('demo/sw.js', () => {
  const oldData = `/${hashedDataPath('catalogue', 'old')}`;
  const newData = `/${hashedDataPath('catalogue', 'new')}`;
  const page = (data: string) => `<!doctype html><script>var files=[["${data.slice(1)}",0]];</script>`;
  const shell = { '/manifest.webmanifest': '{}', '/favicon.svg': '<svg/>', '/icons/icon-192.png': 'png', '/icons/icon-512.png': 'png' };

  it('pre-caches the data the installing page named, so it opens offline after one visit', async () => {
    const host = new Map(Object.entries({ ...shell, '/index.html': page(oldData), [oldData]: '["old"]' }));
    const sw = fakeServiceWorker(host);
    await sw.dispatch('install');
    expect(await sw.cached('pricesniffs-data-v1')).toEqual([oldData]);
  });

  it('serves a data file from its cache once it has one: cache-first, since the name pins the content', async () => {
    const host = new Map(Object.entries({ ...shell, '/index.html': page(newData), [newData]: '["new"]' }));
    const sw = fakeServiceWorker(host);
    expect(await (await sw.get(newData))!.text()).toBe('["new"]');
    expect(sw.network.filter((u) => u.endsWith(newData))).toHaveLength(1);
    host.delete(newData); // even the host losing it does not matter now
    expect(await (await sw.get(newData))!.text()).toBe('["new"]');
    expect(sw.network.filter((u) => u.endsWith(newData))).toHaveLength(1);
  });

  it('never caches a failed data fetch', async () => {
    const sw = fakeServiceWorker(new Map(Object.entries(shell)));
    expect((await sw.get(newData))!.status).toBe(404);
    expect(await sw.cached('pricesniffs-data-v1')).toEqual([]);
  });

  it('keeps the document network-first, and drops data the newest document no longer names', async () => {
    const host = new Map(Object.entries({ ...shell, '/index.html': page(oldData), [oldData]: '["old"]', [newData]: '["new"]' }));
    const sw = fakeServiceWorker(host);
    await sw.dispatch('install');
    await sw.get(oldData);
    expect(await sw.cached('pricesniffs-data-v1')).toEqual([oldData]);

    // A new build is deployed: the next visit gets the new document from the
    // network, not the cached one, and the old prices are let go.
    host.set('/index.html', page(newData));
    const doc = await sw.get('/index.html', 'navigate');
    expect(await doc!.text()).toBe(page(newData));
    await sw.get(newData);
    expect(await sw.cached('pricesniffs-data-v1')).toEqual([newData]);
  });

  it('opens offline, at any deep link, with the cached document and its data', async () => {
    const host = new Map(Object.entries({ ...shell, '/index.html': page(oldData), [oldData]: '["old"]' }));
    const sw = fakeServiceWorker(host);
    await sw.dispatch('install');
    sw.goOffline();
    const doc = await sw.get('/brands/lattafa', 'navigate');
    expect(await doc!.text()).toBe(page(oldData));
    expect(await (await sw.get(oldData))!.text()).toBe('["old"]');
  });
});
