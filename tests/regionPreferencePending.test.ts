import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { regionById, type RegionConfig, type RegionId } from '../src/config/regions.js';
import {
  arrivalAction,
  chooseRegion,
  forgetRegionSync,
  reconcileRegion,
  rememberRegion,
  resetRegionSyncForTests,
  syncRegionWithProfile,
  type ChooseRegionDeps,
  type RegionSyncDeps,
} from '../demo/regionPreference.js';
import { clearPendingRegion, readStoredChoice, readStoredRegion, saveStoredRegion } from '../demo/regionWelcome.js';

/**
 * The bug of 10 October 2026: a signed in visitor chose a country, the write
 * of that choice to their profile failed, and the next page load sent them
 * back to the old country, because the profile still held the old region and
 * the sign in rule said "the profile wins". The rule now: the visitor's
 * explicit choice is the truth from the moment they make it. It is saved in
 * the browser first with a pending marker (inside the one `pricesniffs.region`
 * value), then on the profile; a choice with a marker wins over the profile
 * and is sent again on each load until the write succeeds, which drops the
 * marker (docs/INTERNATIONAL-PLAN.md, "Remembered preference").
 *
 * Every test drives the real storage helpers over an in-memory store and the
 * real rules, wired the way demo/app.ts wires them, with a profile that can
 * be made to fail in each way a profile can: answer false (saveProfileRegion
 * on an error), reject, throw, or never answer.
 */

const GB = regionById('GB')!;
const US = regionById('US')!;
const IN = regionById('IN')!;
const ALL = [GB, US, IN] as const;
const KEY = 'pricesniffs.region';
const NOW = 1_760_000_000_000;

type Failure = 'false' | 'reject' | 'throw' | 'hang' | null;

/** Local storage with the one key the page writes, readable as the raw string. */
function memory(initial?: string) {
  const map = new Map<string, string>(initial === undefined ? [] : [[KEY, initial]]);
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: () => map.get(KEY) ?? null,
    keys: () => [...map.keys()],
  };
}

/** A browser holding a stored value, a profile that can fail, and the page's wiring of both. */
function browser(opts: { stored?: string; profile?: RegionId | null; fail?: Failure; readOk?: boolean } = {}) {
  const store = memory(opts.stored);
  const profile = { region: opts.profile ?? null, fail: opts.fail ?? null, readOk: opts.readOk ?? true, writes: [] as RegionId[], reads: 0 };

  const writeProfile = (id: RegionId): Promise<boolean> => {
    profile.writes.push(id);
    // 'throw' fails before it even returns a promise; the others answer in their own way.
    if (profile.fail === 'throw') throw new Error('offline');
    if (profile.fail === 'reject') return Promise.reject(new Error('denied'));
    if (profile.fail === 'hang') return new Promise<boolean>(() => {});
    if (profile.fail === 'false') return Promise.resolve(false);
    profile.region = id;
    return Promise.resolve(true);
  };

  const sync: RegionSyncDeps = {
    readLocal: () => readStoredChoice(store),
    writeLocal: (id) => saveStoredRegion(id, store),
    clearPending: (choice) => clearPendingRegion(choice, store),
    readProfile: async () => {
      profile.reads++;
      return profile.readOk ? { ok: true, region: profile.region } : { ok: false };
    },
    writeProfile,
  };

  const navigated: string[] = [];
  const choice: ChooseRegionDeps = {
    writeLocal: (id, pendingAt) => saveStoredRegion(id, store, pendingAt ?? null),
    clearPending: (c) => clearPendingRegion(c, store),
    writeProfile,
    navigate: (href) => void navigated.push(href),
    now: () => NOW,
    waitMs: 20,
  };

  /** The visitor picks a country in the menu (the page is in `active`). */
  const choose = (id: RegionId, active: RegionConfig, signedIn = true) => chooseRegion({ id, live: ALL, active, signedIn }, choice);

  /**
   * A page load of a signed in visitor, as demo/app.ts does it: the arrival
   * check on what this browser holds, then the reconciliation with the profile,
   * then time for the background retry to finish.
   */
  const load = async (pathname: string, active: RegionConfig) => {
    resetRegionSyncForTests();
    const arrival = arrivalAction({ live: ALL, pathname, chosen: readStoredRegion(store), active });
    const chosen = await syncRegionWithProfile('visitor', sync);
    await new Promise((r) => setTimeout(r, 5));
    return { arrival, chosen };
  };

  return { store, profile, sync, choice, navigated, choose, load };
}

afterEach(() => {
  resetRegionSyncForTests();
  vi.restoreAllMocks();
});

describe('a failed profile write must not send the visitor back (the 10 October bug)', () => {
  const failures: Failure[] = ['false', 'reject', 'throw', 'hang'];
  const HOW = { false: 'answers false', reject: 'rejects', throw: 'throws', hang: 'never answers' } as const;

  for (const fail of failures) {
    it(`signed in, profile GB, chooses US, the write ${HOW[fail as keyof typeof HOW]}: every later load stays on /us/`, async () => {
      const b = browser({ stored: 'GB', profile: 'GB', fail });
      expect(await b.choose('US', GB)).toBe('opened');
      expect(b.navigated).toEqual(['/us/']);
      // The choice is the truth in this browser from the start, with the marker and the time.
      expect(b.store.raw()).toBe(`US|pending|${NOW}`);
      expect(readStoredRegion(b.store)).toBe('US');

      // The first load of the US home, a reload of it, and a third: none may move the visitor.
      for (let i = 0; i < 3; i++) {
        const { arrival, chosen } = await b.load('/', US);
        expect(arrival, `load ${i + 1}`).toEqual({ kind: 'none' });
        expect(chosen).toBe('US');
        expect(b.store.raw(), `load ${i + 1}`).toBe(`US|pending|${NOW}`);
      }
      // The UK home, opened from a bookmark, goes to the choice, never the other way.
      expect((await b.load('/', GB)).arrival).toEqual({ kind: 'redirect', to: '/us/' });
      // A deep link stays where it is, and the bar offers the country chosen.
      expect((await b.load('/creed_aventus_100ml', GB)).arrival).toMatchObject({ kind: 'mismatch', region: { id: 'US' } });
      // The profile was asked again on every load while the marker stood.
      expect(b.profile.writes.length).toBeGreaterThanOrEqual(5);
      expect(new Set(b.profile.writes)).toEqual(new Set(['US']));
      expect(b.profile.region, 'the profile never took it').toBe('GB');
    });
  }

  it('the rule that sent them back: the profile still holds the old region, and a choice with no marker would have lost to it', () => {
    expect(reconcileRegion('US', 'GB')).toMatchObject({ chosen: 'GB', toLocal: 'GB' });
    expect(reconcileRegion('US', 'GB', true)).toEqual({ chosen: 'US', toLocal: null, toProfile: 'US', clearPending: false });
  });
});

describe('a successful write clears the marker', () => {
  it('signed in, the profile takes the choice: the stored value is the plain region again', async () => {
    const b = browser({ stored: 'GB', profile: 'GB' });
    expect(await b.choose('US', GB)).toBe('opened');
    expect(b.profile.writes).toEqual(['US']);
    expect(b.profile.region).toBe('US');
    expect(b.store.raw()).toBe('US');
    expect(readStoredChoice(b.store)).toEqual({ id: 'US', pendingAt: null });
  });

  it('the marker is on before the profile is asked, and off after it answers', async () => {
    const seen: (string | null)[] = [];
    const b = browser({ stored: 'GB', profile: 'GB' });
    const choice: ChooseRegionDeps = {
      ...b.choice,
      writeProfile: async (id) => {
        seen.push(b.store.raw());
        return b.sync.writeProfile(id);
      },
    };
    await chooseRegion({ id: 'IN', live: ALL, active: GB, signedIn: true }, choice);
    expect(seen).toEqual([`IN|pending|${NOW}`]);
    expect(b.store.raw()).toBe('IN');
  });

  it('a write that lands after the wait still drops the marker (the page is still there)', async () => {
    const b = browser({ stored: 'GB', profile: 'GB' });
    let landed: (ok: boolean) => void = () => {};
    const choice: ChooseRegionDeps = { ...b.choice, writeProfile: () => new Promise<boolean>((r) => void (landed = r)) };
    expect(await chooseRegion({ id: 'US', live: ALL, active: GB, signedIn: true }, choice)).toBe('opened');
    expect(b.store.raw()).toBe(`US|pending|${NOW}`);
    landed(true);
    await new Promise((r) => setTimeout(r, 5));
    expect(b.store.raw()).toBe('US');
  });

  it('choosing the country the page is in is remembered the same way, and the page stays', async () => {
    const b = browser({ stored: 'US', profile: 'US', fail: 'false' });
    expect(await b.choose('GB', GB)).toBe('saved');
    expect(b.navigated).toEqual([]);
    expect(b.store.raw()).toBe(`GB|pending|${NOW}`);
    b.profile.fail = null;
    await b.load('/', GB);
    expect(b.profile.region).toBe('GB');
    expect(b.store.raw()).toBe('GB');
  });
});

describe('the retry', () => {
  it('on the next load: the profile gets the choice again, takes it, and the marker is dropped', async () => {
    const b = browser({ stored: 'GB', profile: 'GB', fail: 'false' });
    await b.choose('US', GB);
    expect(b.profile.region).toBe('GB');
    b.profile.fail = null; // Supabase is back
    const { arrival, chosen } = await b.load('/', US);
    expect(arrival).toEqual({ kind: 'none' });
    expect(chosen).toBe('US');
    expect(b.profile.region).toBe('US');
    expect(b.store.raw()).toBe('US');
    // Settled: the next load makes no write at all.
    const writes = b.profile.writes.length;
    await b.load('/', US);
    expect(b.profile.writes.length).toBe(writes);
  });

  it('still failing on the next load: the choice stands and the marker stays for the one after', async () => {
    const b = browser({ stored: 'GB', profile: 'GB', fail: 'reject' });
    await b.choose('US', GB);
    await b.load('/', US);
    expect(b.store.raw()).toBe(`US|pending|${NOW}`);
    b.profile.fail = null;
    await b.load('/', US);
    expect(b.store.raw()).toBe('US');
    expect(b.profile.region).toBe('US');
  });

  it('when the profile cannot even be read, the pending choice is still sent and still wins', async () => {
    const b = browser({ stored: `US|pending|${NOW}`, profile: 'GB', readOk: false });
    const { chosen } = await b.load('/', US);
    expect(chosen).toBe('US');
    expect(b.profile.writes).toEqual(['US']);
    expect(b.store.raw()).toBe('US');
  });

  it('on the next sign in (the sign in handler runs the same reconciliation)', async () => {
    const b = browser({ stored: 'GB', profile: 'GB', fail: 'false' });
    await b.choose('US', GB);
    // Signed in at page load (the retry failed), signed out, then in again on the same page.
    await b.load('/', US);
    expect(b.store.raw()).toBe(`US|pending|${NOW}`);
    forgetRegionSync(); // what demo/app.ts does when the session ends
    b.profile.fail = null;
    expect(await syncRegionWithProfile('visitor', b.sync)).toBe('US');
    await new Promise((r) => setTimeout(r, 5));
    expect(b.profile.region).toBe('US');
    expect(b.store.raw()).toBe('US');
  });

  it('without that, the same account on the same page reuses its earlier answer (one read and one retry per page load)', async () => {
    const b = browser({ stored: `US|pending|${NOW}`, profile: 'GB', fail: 'false' });
    await b.load('/', US);
    const writes = b.profile.writes.length;
    b.profile.fail = null;
    expect(await syncRegionWithProfile('visitor', b.sync)).toBe('US');
    await new Promise((r) => setTimeout(r, 5));
    expect(b.profile.writes.length).toBe(writes);
    expect(b.store.raw()).toBe(`US|pending|${NOW}`);
  });

  it('demo/app.ts forgets the answer when the session ends, so the next sign in retries', () => {
    const app = readFileSync(new URL('../demo/app.ts', import.meta.url), 'utf8');
    expect(app).toMatch(/\} else \{\s*(\/\/[^\n]*\n\s*)*forgetRegionSync\(\);\s*clearPhoto\(\);/);
  });

  it('when the profile already holds the pending choice (the write landed but the answer was lost), the marker is dropped without a write', async () => {
    const b = browser({ stored: `US|pending|${NOW}`, profile: 'US' });
    expect((await b.load('/', US)).chosen).toBe('US');
    expect(b.profile.writes).toEqual([]);
    expect(b.store.raw()).toBe('US');
  });

  it('only the very choice that was pending is settled: a newer choice made meanwhile keeps its own marker', async () => {
    const b = browser({ stored: `US|pending|${NOW}` });
    const older = readStoredChoice(b.store)!;
    saveStoredRegion('IN', b.store, NOW + 5);
    expect(clearPendingRegion(older, b.store)).toBe(false);
    expect(b.store.raw()).toBe(`IN|pending|${NOW + 5}`);
    expect(clearPendingRegion(readStoredChoice(b.store)!, b.store)).toBe(true);
    expect(b.store.raw()).toBe('IN');
    // A settled choice has nothing to clear.
    expect(clearPendingRegion({ id: 'IN', pendingAt: null }, b.store)).toBe(false);
  });

  it('a choice made while the profile is being read stands, whatever that read found', async () => {
    const b = browser({ stored: 'GB', profile: 'IN' });
    let answer: (v: { ok: true; region: RegionId | null }) => void = () => {};
    const slow: RegionSyncDeps = { ...b.sync, readProfile: () => new Promise((r) => void (answer = r)) };
    const done = syncRegionWithProfile('visitor', slow);
    // The visitor picks the US while the profile is still being read.
    saveStoredRegion('US', b.store, NOW);
    answer({ ok: true, region: 'IN' });
    expect(await done).toBe('US');
    expect(b.store.raw()).toBe(`US|pending|${NOW}`);
    expect(b.profile.writes).toEqual([]);
  });
});

describe('who wins (reconcileRegion)', () => {
  it('a choice with a pending marker wins over a profile with another region, and is written to it', () => {
    expect(reconcileRegion('US', 'GB', true)).toEqual({ chosen: 'US', toLocal: null, toProfile: 'US', clearPending: false });
    expect(reconcileRegion('IN', 'US', true)).toEqual({ chosen: 'IN', toLocal: null, toProfile: 'IN', clearPending: false });
  });

  it('a pending choice over an empty profile is written to it', () => {
    expect(reconcileRegion('US', null, true)).toEqual({ chosen: 'US', toLocal: null, toProfile: 'US', clearPending: false });
  });

  it('a pending choice the profile already holds only drops the marker', () => {
    expect(reconcileRegion('US', 'US', true)).toEqual({ chosen: 'US', toLocal: null, toProfile: null, clearPending: true });
  });

  it('with no marker the old rule holds: the profile wins over a choice made before signing in', () => {
    expect(reconcileRegion('US', 'GB', false)).toEqual({ chosen: 'GB', toLocal: 'GB', toProfile: null, clearPending: false });
    expect(reconcileRegion('IN', null, false)).toEqual({ chosen: 'IN', toLocal: null, toProfile: 'IN', clearPending: false });
    expect(reconcileRegion(null, 'US', false)).toEqual({ chosen: 'US', toLocal: 'US', toProfile: null, clearPending: false });
    // A marker with no region is nothing to keep.
    expect(reconcileRegion(null, 'US', true)).toEqual({ chosen: 'US', toLocal: 'US', toProfile: null, clearPending: false });
  });

  it('a choice made signed out, before signing in, loses to the profile as before (it carries no marker)', async () => {
    const b = browser({ profile: 'GB' });
    expect(await b.choose('US', GB, false)).toBe('opened');
    expect(b.store.raw()).toBe('US');
    // Signing in: the profile's country wins.
    const { chosen } = await b.load('/us/', US);
    expect(chosen).toBe('GB');
    expect(b.store.raw()).toBe('GB');
  });
});

describe('a signed out visitor is unchanged', () => {
  it('only the local key is written: the plain region, no marker, no profile request, nothing else stored', async () => {
    const b = browser({ profile: 'GB', fail: 'false' });
    expect(await b.choose('US', GB, false)).toBe('opened');
    expect(b.navigated).toEqual(['/us/']);
    expect(b.store.raw()).toBe('US');
    expect(b.store.keys()).toEqual([KEY]);
    expect(b.profile.writes).toEqual([]);
    expect(b.profile.reads).toBe(0);
  });

  it('rememberRegion signed out does not touch the profile or the clock', async () => {
    const writeLocal = vi.fn();
    const writeProfile = vi.fn();
    const clearPending = vi.fn();
    const now = vi.fn(() => NOW);
    await rememberRegion('IN', false, { writeLocal, writeProfile, clearPending, now });
    expect(writeLocal.mock.calls).toEqual([['IN']]);
    expect(writeProfile).not.toHaveBeenCalled();
    expect(clearPending).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('while the UK is the only live region nothing is stored at all', async () => {
    const b = browser({ profile: 'GB' });
    expect(await chooseRegion({ id: 'GB', live: [GB], active: GB, signedIn: true }, b.choice)).toBe('ignored');
    expect(b.store.raw()).toBeNull();
    expect(b.profile.writes).toEqual([]);
  });
});

describe('a failed background save is silent', () => {
  it('shows nothing and logs nothing, in every way a profile can fail', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    for (const fail of ['false', 'reject', 'throw', 'hang'] as const) {
      const b = browser({ stored: 'GB', profile: 'GB', fail });
      await b.choose('US', GB);
      await b.load('/', US);
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });

  it('the page code has no pop-up, alert or log in the choice and sync paths', () => {
    const src = readFileSync(new URL('../demo/regionPreference.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/console\.|alert\(|confirm\(|showToast|toast\(/);
  });
});

describe('the stored value', () => {
  it('stays in the one existing key: nothing new is written, so nothing new is listed on the cookies page', async () => {
    const b = browser({ stored: 'GB', profile: 'GB', fail: 'false' });
    await b.choose('IN', GB);
    expect(b.store.keys()).toEqual([KEY]);
    expect(b.store.raw()).toBe(`IN|pending|${NOW}`);
  });
});
