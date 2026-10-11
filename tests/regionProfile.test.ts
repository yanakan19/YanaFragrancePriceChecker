import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * demo/regionProfile.ts: reading and writing profiles.region for a signed in
 * visitor. A failed write answers false, whatever the failure (an error in
 * the answer, a thrown error, no client, no user), because
 * demo/regionPreference.ts keeps the visitor's choice pending on anything but
 * true and sends it again on the next load. Nothing is logged.
 */

type Answer = { error: unknown };

function fakeClient(opts: { user?: { id: string } | null; update?: () => Promise<Answer>; getUser?: () => Promise<unknown> } = {}) {
  const calls = { update: [] as unknown[], eq: [] as unknown[] };
  const client = {
    auth: {
      getUser: opts.getUser ?? (async () => ({ data: { user: opts.user === undefined ? { id: 'user-1' } : opts.user } })),
    },
    from: (table: string) => {
      expect(table).toBe('profiles');
      return {
        update: (row: unknown) => {
          calls.update.push(row);
          return {
            eq: (col: string, val: string) => {
              calls.eq.push([col, val]);
              return opts.update ? opts.update() : Promise.resolve({ error: null });
            },
          };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { region: 'US' }, error: null }),
          }),
        }),
      };
    },
  };
  return { client, calls };
}

async function load(client: unknown) {
  vi.resetModules();
  vi.doMock('../demo/supabase.js', () => ({ supabase: () => client }));
  return import('../demo/regionProfile.js');
}

afterEach(() => {
  vi.doUnmock('../demo/supabase.js');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('saveProfileRegion', () => {
  it('answers true when the row is updated, writing only the region on the reader\'s own row', async () => {
    const { client, calls } = fakeClient();
    const { saveProfileRegion } = await load(client);
    expect(await saveProfileRegion('US')).toBe(true);
    expect(calls.update).toEqual([{ region: 'US' }]);
    expect(calls.eq).toEqual([['id', 'user-1']]);
  });

  it('answers false when the database refuses the row', async () => {
    const { client } = fakeClient({ update: async () => ({ error: { message: 'new row violates row-level security policy' } }) });
    const { saveProfileRegion } = await load(client);
    expect(await saveProfileRegion('US')).toBe(false);
  });

  it('answers false when the request throws (network error, Supabase down)', async () => {
    const { client } = fakeClient({ update: () => Promise.reject(new TypeError('Failed to fetch')) });
    const { saveProfileRegion } = await load(client);
    expect(await saveProfileRegion('IN')).toBe(false);
    const gone = fakeClient({ getUser: () => Promise.reject(new Error('offline')) });
    expect(await (await load(gone.client)).saveProfileRegion('IN')).toBe(false);
  });

  it('answers false when signed out, when there is no client, and for a region that does not exist, without a request', async () => {
    const out = fakeClient({ user: null });
    expect(await (await load(out.client)).saveProfileRegion('US')).toBe(false);
    expect(out.calls.update).toEqual([]);
    expect(await (await load(null)).saveProfileRegion('US')).toBe(false);
    const ok = fakeClient();
    expect(await (await load(ok.client)).saveProfileRegion('DE' as never)).toBe(false);
    expect(ok.calls.update).toEqual([]);
  });

  it('logs nothing, whatever fails', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { client } = fakeClient({ update: () => Promise.reject(new Error('boom')) });
    await (await load(client)).saveProfileRegion('US');
    const refused = fakeClient({ update: async () => ({ error: { message: 'no' } }) });
    await (await load(refused.client)).saveProfileRegion('US');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

describe('readProfileRegion', () => {
  it('reads the region, and says it could not read rather than "none saved" when signed out or the client is missing', async () => {
    const { client } = fakeClient();
    expect(await (await load(client)).readProfileRegion()).toEqual({ ok: true, region: 'US' });
    expect(await (await load(fakeClient({ user: null }).client)).readProfileRegion()).toEqual({ ok: false });
    expect(await (await load(null)).readProfileRegion()).toEqual({ ok: false });
  });
});
