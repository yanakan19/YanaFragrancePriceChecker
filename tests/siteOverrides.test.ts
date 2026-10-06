import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  applySiteOverrides, brandOverrideKey, countListings, overridesFrom, parseOverrideRows, NO_OVERRIDES,
  type OverrideTarget,
} from '../demo/siteOverrides.js';
import {
  fetchOverrideRows, pruneContext, pruneMovedBlobs, removedSets, removedShopsForCrawl, siteBuildFrom, siteHeadScript,
  OVERRIDES_ENDPOINT, SITE_OFF, type SiteBuild,
} from '../scripts/siteBuild.js';

/**
 * Hidden and removed brands and shops (demo/siteOverrides.ts): how the page,
 * the deploy and the crawl apply the owner's list, on small stand ins for the
 * generated data. The browser side is in tests/developerBrowser.test.ts.
 */

function fixture(): OverrideTarget & {
  retailers: { id: string; enabled: boolean }[];
  catalogue: { id: string; brand: string }[];
  crawled: Record<string, { retailerId: string; price: number }[]>;
  older: Record<string, { retailerId: string }[]>;
  houseProducts: { brand: string; house: string }[];
  deals: { fragranceId: string; retailerId: string }[];
} {
  return {
    retailers: [
      { id: 'boots', enabled: true },
      { id: 'allbeauty', enabled: true },
      { id: 'zara', enabled: false },
    ],
    catalogue: [
      { id: 'p1', brand: 'Dior' },
      { id: 'p2', brand: 'Lattafa' },
      { id: 'p3', brand: 'Dolce & Gabbana' },
      { id: 'p4', brand: 'Lattafa' },
    ],
    crawled: {
      p1: [{ retailerId: 'boots', price: 80 }, { retailerId: 'allbeauty', price: 75 }],
      p2: [{ retailerId: 'boots', price: 30 }],
      p3: [{ retailerId: 'allbeauty', price: 60 }],
      p4: [{ retailerId: 'allbeauty', price: 25 }, { retailerId: 'boots', price: 26 }],
    },
    older: { p1: [{ retailerId: 'boots' }], p3: [{ retailerId: 'allbeauty' }] },
    houseProducts: [{ brand: 'Lattafa', house: 'Lattafa' }, { brand: 'Dior', house: 'Dior' }],
    deals: [
      { fragranceId: 'p1', retailerId: 'boots' },
      { fragranceId: 'p2', retailerId: 'boots' },
      { fragranceId: 'p3', retailerId: 'allbeauty' },
    ],
  };
}

describe('the list as the API returns it', () => {
  it('keeps only rows of the table\'s shape', () => {
    const rows = parseOverrideRows([
      { kind: 'brand', key: 'lattafa', state: 'hidden', name: 'Lattafa' },
      { kind: 'retailer', key: 'boots', state: 'removed' },
      { kind: 'brand', key: 'Bad Key', state: 'hidden' },
      { kind: 'shop', key: 'boots', state: 'hidden' },
      { kind: 'brand', key: 'dior', state: 'gone' },
      null,
      'nonsense',
    ]);
    expect(rows).toEqual([
      { kind: 'brand', key: 'lattafa', state: 'hidden', name: 'Lattafa' },
      { kind: 'retailer', key: 'boots', state: 'removed' },
    ]);
    expect(parseOverrideRows({ not: 'an array' })).toEqual([]);
  });

  it('keys a brand by its address word, so two spellings of one brand are one override', () => {
    expect(brandOverrideKey('Dolce & Gabbana')).toBe('dolce-and-gabbana');
    expect(brandOverrideKey('Dolce&Gabbana')).toBe(brandOverrideKey('Dolce & Gabbana'));
  });

  it('takes the stronger state when a key is listed twice', () => {
    const o = overridesFrom([
      { kind: 'brand', key: 'dior', state: 'removed' },
      { kind: 'brand', key: 'dior', state: 'hidden' },
    ]);
    expect(o.brands.get('dior')).toBe('removed');
  });
});

describe('applying it to the shipped data', () => {
  it('changes nothing at all with no overrides', () => {
    const t = fixture();
    const before = JSON.stringify(t);
    const stash = applySiteOverrides(t, NO_OVERRIDES);
    expect(JSON.stringify(t)).toBe(before);
    expect(stash).toEqual({ entries: [], offers: {}, retailers: [] });
  });

  it('a hidden brand: its products, prices, house products and deals are gone, and stashed for the dashboard', () => {
    const t = fixture();
    const crawled = t.crawled;
    const stash = applySiteOverrides(t, overridesFrom([{ kind: 'brand', key: 'lattafa', state: 'hidden' }]));
    expect(t.catalogue.map((e) => e.id)).toEqual(['p1', 'p3']);
    expect(Object.keys(t.crawled).sort()).toEqual(['p1', 'p3']);
    expect(t.crawled).toBe(crawled); // in place: every module holding it sees the change
    expect(t.houseProducts).toEqual([{ brand: 'Dior', house: 'Dior' }]);
    expect(t.deals.map((d) => d.fragranceId)).toEqual(['p1', 'p3']);
    expect(stash.entries.map((e) => e.id)).toEqual(['p2', 'p4']);
    expect(stash.offers.p4).toHaveLength(2);
    expect(t.retailers.every((r) => r.id === 'zara' || r.enabled)).toBe(true);
  });

  it('a hidden shop: switched off, its prices and deals gone, and a product only it sold leaves the catalogue', () => {
    const t = fixture();
    const stash = applySiteOverrides(t, overridesFrom([{ kind: 'retailer', key: 'allbeauty', state: 'hidden' }]));
    expect(t.retailers.find((r) => r.id === 'allbeauty')!.enabled).toBe(false);
    expect(stash.retailers).toEqual(['allbeauty']);
    expect(t.crawled.p1!.map((o) => o.retailerId)).toEqual(['boots']);
    expect(t.crawled.p4!.map((o) => o.retailerId)).toEqual(['boots']);
    // p3 was sold only by allbeauty.
    expect(t.catalogue.map((e) => e.id)).toEqual(['p1', 'p2', 'p4']);
    expect(t.older.p3).toEqual([]);
    expect(t.deals.map((d) => d.fragranceId)).toEqual(['p1', 'p2']);
    expect(stash.entries.map((e) => e.id)).toEqual(['p3']);
  });

  it('a shop the code already switched off is not reported as switched off by an override', () => {
    const t = fixture();
    const stash = applySiteOverrides(t, overridesFrom([{ kind: 'retailer', key: 'zara', state: 'removed' }]));
    expect(stash.retailers).toEqual([]);
  });

  it('the dashboard still counts what was hidden', () => {
    const full = countListings(fixture().catalogue, fixture().crawled);
    const t = fixture();
    const stash = applySiteOverrides(
      t,
      overridesFrom([
        { kind: 'brand', key: 'lattafa', state: 'hidden' },
        { kind: 'retailer', key: 'allbeauty', state: 'removed' },
      ]),
    );
    const after = countListings(t.catalogue, t.crawled, stash);
    expect([...after.brands.values()]).toEqual([...full.brands.values()]);
    expect(after.retailers).toEqual(full.retailers);
    expect(full.brands.get('lattafa')).toEqual({ key: 'lattafa', name: 'Lattafa', products: 2, listings: 3 });
    expect(full.retailers.get('boots')).toBe(3);
    expect(full.retailers.get('allbeauty')).toBe(3);
  });
});

describe('the deploy', () => {
  const ok: SiteBuild = {
    stats: true,
    source: 'fetched',
    overrides: [
      { kind: 'brand', key: 'lattafa', state: 'removed' },
      { kind: 'brand', key: 'dior', state: 'hidden' },
      { kind: 'retailer', key: 'allbeauty', state: 'removed' },
      { kind: 'retailer', key: 'boots', state: 'hidden' },
    ],
  };

  it('turns the counter on only once the table exists, and never fails over a database that does not answer', () => {
    expect(siteBuildFrom({ status: 'ok', rows: [] })).toEqual({ stats: true, overrides: [], source: 'fetched' });
    expect(siteBuildFrom({ status: 'missing' })).toEqual({ stats: false, overrides: [], source: 'not set up' });
    expect(siteBuildFrom({ status: 'failed', reason: 'timeout' })).toEqual({ stats: true, overrides: [], source: 'unreachable' });
  });

  it('reads the list with the public key and no credentials, retrying before it gives up', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const answers = [new Response('oops', { status: 503 }), new Response(JSON.stringify([{ kind: 'brand', key: 'dior', state: 'hidden' }]))];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return answers.shift()!;
    }) as unknown as typeof fetch;
    const out = await fetchOverrideRows(fake, { waitMs: 1 });
    expect(out).toEqual({ status: 'ok', rows: [{ kind: 'brand', key: 'dior', state: 'hidden' }] });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(OVERRIDES_ENDPOINT);
    expect(Object.keys((calls[0]!.init?.headers ?? {}) as Record<string, string>).sort()).toEqual(['Authorization', 'apikey']);

    const missing = (async () => new Response('{"code":"PGRST205"}', { status: 404 })) as unknown as typeof fetch;
    expect(await fetchOverrideRows(missing)).toEqual({ status: 'missing' });
    const down = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    expect(await fetchOverrideRows(down, { tries: 2, waitMs: 1 })).toEqual({ status: 'failed', reason: 'ECONNRESET' });
  });

  it('leaves removed brands and shops out of the data files, and keeps hidden ones', () => {
    const removed = removedSets(ok);
    expect([...removed.brands]).toEqual(['lattafa']);
    expect([...removed.retailers]).toEqual(['allbeauty']);
    const t = fixture();
    const blobs: unknown[] = ['earlier module', t.catalogue, t.crawled, t.houseProducts];
    const ctx = pruneContext();
    pruneMovedBlobs('catalogue', ['CATALOGUE_CHUNK_0', 'CRAWLED', 'HOUSE_PRODUCTS_CHUNK_0'], blobs, 1, removed, ctx);
    expect((blobs[1] as { id: string }[]).map((e) => e.id)).toEqual(['p1', 'p3']);
    const crawled = blobs[2] as Record<string, { retailerId: string }[]>;
    expect(Object.keys(crawled).sort()).toEqual(['p1', 'p3']);
    expect(crawled.p1!.map((o) => o.retailerId)).toEqual(['boots']);
    expect(crawled.p3).toEqual([]);
    expect(blobs[3]).toEqual([{ brand: 'Dior', house: 'Dior' }]);
    expect(ctx.dropped).toEqual({ products: 2, offers: 5 });

    const deals: unknown[] = [fixture().deals];
    pruneMovedBlobs('deals', ['DEALS_RAW'], deals, 0, removed, pruneContext());
    expect((deals[0] as { retailerId: string }[]).map((d) => d.retailerId)).toEqual(['boots', 'boots']);
  });

  it('touches no data file when nothing is removed', () => {
    const t = fixture();
    const blobs: unknown[] = [t.catalogue, t.crawled];
    pruneMovedBlobs('catalogue', ['CATALOGUE_CHUNK_0', 'CRAWLED'], blobs, 0, removedSets({ ...ok, overrides: ok.overrides.filter((r) => r.state === 'hidden') }), pruneContext());
    expect(blobs[0]).toEqual(fixture().catalogue);
    expect(blobs[1]).toEqual(fixture().crawled);
  });

  it('writes no script into the page while the counter is off and nothing is hidden', () => {
    expect(siteHeadScript(SITE_OFF)).toBe('');
    expect(siteHeadScript({ stats: false, overrides: ok.overrides, source: 'file' })).toBe(
      `window.__psSite=${JSON.stringify({ stats: false, overrides: ok.overrides })};`,
    );
  });

  it('the head script sets the switches, fetches the live list without credentials, and holds the app only briefly', async () => {
    const script = siteHeadScript(ok);
    expect(script).toContain("credentials: 'omit'");
    let fetched = '';
    let resolveFetch: (v: unknown) => void = () => {};
    const window: Record<string, unknown> = { __psReady: Promise.resolve('data in') };
    const sandbox = {
      window,
      setTimeout,
      Promise,
      Array,
      fetch: (url: string) => {
        fetched = url;
        return new Promise((r) => (resolveFetch = r));
      },
    };
    runInNewContext(script, sandbox);
    expect(fetched).toBe(OVERRIDES_ENDPOINT);
    const site = window.__psSite as { stats: boolean; overrides: unknown[]; live?: unknown };
    expect(site.stats).toBe(true);
    expect(site.overrides).toEqual(ok.overrides);
    // The list answers quickly: it is in place before the app starts.
    const ready = window.__psReady as Promise<unknown>;
    resolveFetch({ ok: true, json: () => [{ kind: 'brand', key: 'dior', state: 'hidden' }] });
    await ready;
    expect(site.live).toEqual([{ kind: 'brand', key: 'dior', state: 'hidden' }]);

    // A list that never answers holds the app back by the short wait only.
    const w2: Record<string, unknown> = { __psReady: Promise.resolve() };
    runInNewContext(script, { ...sandbox, window: w2, fetch: () => new Promise(() => {}) });
    const t0 = Date.now();
    await (w2.__psReady as Promise<unknown>);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect((w2.__psSite as { live?: unknown }).live).toBeUndefined();

    // A failed data load still reaches the page's own error handling.
    const w3: Record<string, unknown> = { __psReady: Promise.reject(Object.assign(new Error('x'), { status: 404 })) };
    runInNewContext(script, { ...sandbox, window: w3, fetch: () => Promise.resolve({ ok: false }) });
    await expect(w3.__psReady as Promise<unknown>).rejects.toMatchObject({ status: 404 });
  });
});

describe('the crawl', () => {
  it('skips removed shops only, read from the list', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'site-'));
    const file = join(dir, 'site.json');
    writeFileSync(
      file,
      JSON.stringify({
        stats: true,
        overrides: [
          { kind: 'retailer', key: 'boots', state: 'removed' },
          { kind: 'retailer', key: 'allbeauty', state: 'hidden' },
          { kind: 'brand', key: 'dior', state: 'removed' },
        ],
      }),
    );
    expect([...(await removedShopsForCrawl({ SITE_OVERRIDES_FILE: file }))]).toEqual(['boots']);
  });

  it('skips nothing unless asked to read the list, and nothing when it cannot be read', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await removedShopsForCrawl({}, spy)).size).toBe(0);
    expect(called).toBe(false);
  });

  it('is wired into the harvest, the storefront re-price and their workflow steps', () => {
    const harvest = readFileSync(new URL('../scripts/catalogue-harvest.ts', import.meta.url), 'utf8');
    expect(harvest).toMatch(/!removedShops\.has\(r\.id\)/);
    const reprice = readFileSync(new URL('../scripts/storefront-reprice.ts', import.meta.url), 'utf8');
    expect(reprice).toMatch(/!removedShops\.has\(r\.id\)/);
    const crawl = readFileSync(new URL('../.github/workflows/catalogue-daily.yml', import.meta.url), 'utf8');
    expect(crawl.match(/SITE_OVERRIDES_FETCH: '1'/g)).toHaveLength(2);
    const deploy = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');
    expect(deploy).toMatch(/SITE_OVERRIDES_FETCH: '1'\n\s+run: npm run demo/);
  });
});

describe('migration 0007', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0007_site_stats.sql', import.meta.url), 'utf8');
  const code = sql.replace(/--.*$/gm, '');

  it('turns row level security on for every table it creates', () => {
    const tables = [...code.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]!);
    expect(tables.sort()).toEqual(['site_overrides', 'site_page_views', 'site_shop_clicks']);
    for (const t of tables) expect(code).toContain(`alter table public.${t} enable row level security;`);
  });

  it('stores no IP address, no email and no identifier of a visitor', () => {
    expect(code).not.toMatch(/cf-connecting-ip|x-forwarded-for|x-real-ip|inet\b/i);
    expect(code).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    const views = /create table if not exists public\.site_page_views \(([\s\S]*?)\);/.exec(code)![1]!;
    expect(views.match(/^\s+(\w+) /gm)!.map((c) => c.trim())).toEqual(['hour', 'page', 'country', 'referrer_host', 'views', 'visits', 'primary']);
  });

  it('lets a visitor add a count only through the two functions, and only the owner read them', () => {
    expect(code).toMatch(/revoke all on table public\.site_page_views from public, anon, authenticated;/);
    expect(code).toMatch(/grant execute on function public\.count_page_view\(text, boolean, text\) to anon, authenticated;/);
    expect(code).toMatch(/grant execute on function public\.count_shop_click\(text, text, text\) to anon, authenticated;/);
    expect(code).toMatch(/revoke all on function public\.site_stats\(timestamptz, text, text\) from public, anon;/);
    expect(code).toMatch(/if not public\.is_site_admin\(\) then\s+raise exception/);
  });

  it('keeps the owner flag out of reach of the public API, and names no account', () => {
    expect(code).toMatch(/before update of is_admin on public\.profiles/);
    expect(code).toMatch(/current_user in \('anon', 'authenticated'\)/);
    expect(code).not.toMatch(/is_admin = true/);
  });

  it('lets anyone read the overrides and only the owner change them', () => {
    expect(code).toMatch(/grant select on table public\.site_overrides to anon, authenticated;/);
    for (const verb of ['insert', 'update', 'delete']) {
      expect(code).toMatch(new RegExp(`on public\\.site_overrides for ${verb}\\s+to authenticated\\s+(using|with check) \\(\\(select public\\.is_site_admin\\(\\)\\)\\)`));
    }
  });

  it('creates the overrides table last, since the deploy takes it as the sign the rest is in place', () => {
    const lastCreate = [...code.matchAll(/create (?:table if not exists|or replace function) public\.(\w+)/g)].at(-1)![1];
    expect(lastCreate).toBe('site_overrides');
  });
});
