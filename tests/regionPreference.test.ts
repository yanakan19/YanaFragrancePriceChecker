import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REGION_CONFIGS, liveRegions, regionById, type RegionId } from '../src/config/regions.js';
import {
  COUNTRY_ROW_LABEL,
  COUNTRY_ROW_NOTE,
  arrivalAction,
  chooseRegion,
  countryRowHtml,
  reconcileRegion,
  regionChoiceOn,
  resetRegionSyncForTests,
  syncRegionWithProfile,
  type ChooseRegionDeps,
  type RegionSyncDeps,
} from '../demo/regionPreference.js';
import type { ProfileRegionRead } from '../demo/regionProfile.js';
import { buildDataExport } from '../src/services/accountMenu.js';

/**
 * The remembered country (docs/INTERNATIONAL-PLAN.md, section 2, "Welcome",
 * "Remembered preference: built 9 Oct 2026"): the sign in rule, the bare
 * home page as the only address ever redirected, a choice written to the
 * profile from the country menu as well as the pop-up, and the Country row on
 * the profile page. Every rule takes the live regions as an argument, so
 * these hold today (the UK alone) and once the US and India are live. The
 * built page half is tests/regionPreferenceBrowser.test.ts.
 */

const GB = regionById('GB')!;
const US = regionById('US')!;
const IN = regionById('IN')!;
const ALL = [GB, US, IN] as const;

describe('when anything is remembered at all', () => {
  it('only once a second region is live', () => {
    expect(regionChoiceOn([GB])).toBe(false);
    expect(regionChoiceOn([GB, US])).toBe(true);
    expect(regionChoiceOn(ALL)).toBe(true);
    // The default reads the config, whatever today's switches say.
    expect(regionChoiceOn()).toBe(liveRegions().length >= 2);
  });
});

describe('signing in: the profile and this browser agree (reconcileRegion)', () => {
  it('a profile with a country and nothing in this browser: the profile is mirrored here', () => {
    expect(reconcileRegion(null, 'US')).toEqual({ chosen: 'US', toLocal: 'US', toProfile: null });
  });

  it('a choice made here before signing in fills a profile that has none', () => {
    expect(reconcileRegion('IN', null)).toEqual({ chosen: 'IN', toLocal: null, toProfile: 'IN' });
  });

  it('both set and different: the profile wins', () => {
    expect(reconcileRegion('GB', 'IN')).toEqual({ chosen: 'IN', toLocal: 'IN', toProfile: null });
    expect(reconcileRegion('US', 'GB')).toEqual({ chosen: 'GB', toLocal: 'GB', toProfile: null });
  });

  it('both set and the same: nothing is written', () => {
    expect(reconcileRegion('US', 'US')).toEqual({ chosen: 'US', toLocal: null, toProfile: null });
  });

  it('neither: nothing is chosen, so the welcome pop-up may ask', () => {
    expect(reconcileRegion(null, null)).toEqual({ chosen: null, toLocal: null, toProfile: null });
  });
});

describe('syncRegionWithProfile', () => {
  afterEach(() => resetRegionSyncForTests());

  function deps(local: RegionId | null, read: ProfileRegionRead) {
    const calls = { writeLocal: [] as RegionId[], writeProfile: [] as RegionId[], reads: 0 };
    const d: RegionSyncDeps = {
      readLocal: () => local,
      writeLocal: (id) => void calls.writeLocal.push(id),
      readProfile: async () => {
        calls.reads++;
        return read;
      },
      writeProfile: async (id) => {
        calls.writeProfile.push(id);
        return true;
      },
    };
    return { d, calls };
  }

  it('mirrors the profile into this browser, so the next load needs no request', async () => {
    const { d, calls } = deps(null, { ok: true, region: 'US' });
    expect(await syncRegionWithProfile('a', d)).toBe('US');
    expect(calls.writeLocal).toEqual(['US']);
    expect(calls.writeProfile).toEqual([]);
  });

  it('copies this browser\'s choice to an empty profile', async () => {
    const { d, calls } = deps('IN', { ok: true, region: null });
    expect(await syncRegionWithProfile('a', d)).toBe('IN');
    expect(calls.writeProfile).toEqual(['IN']);
    expect(calls.writeLocal).toEqual([]);
  });

  it('lets the profile win over a different choice here', async () => {
    const { d, calls } = deps('GB', { ok: true, region: 'IN' });
    expect(await syncRegionWithProfile('a', d)).toBe('IN');
    expect(calls.writeLocal).toEqual(['IN']);
    expect(calls.writeProfile).toEqual([]);
  });

  it('writes nothing when the profile could not be read: the choice here stands', async () => {
    const { d, calls } = deps('US', { ok: false });
    expect(await syncRegionWithProfile('a', d)).toBe('US');
    expect(calls.writeLocal).toEqual([]);
    expect(calls.writeProfile).toEqual([]);
    resetRegionSyncForTests();
    const thrown: RegionSyncDeps = { ...d, readProfile: () => Promise.reject(new Error('offline')) };
    expect(await syncRegionWithProfile('a', thrown)).toBe('US');
    expect(calls.writeProfile).toEqual([]);
  });

  it('a failed profile write changes nothing and throws nothing', async () => {
    const { d } = deps('IN', { ok: true, region: null });
    const failing: RegionSyncDeps = { ...d, writeProfile: () => Promise.reject(new Error('denied')) };
    expect(await syncRegionWithProfile('a', failing)).toBe('IN');
  });

  it('reads the profile once per account per page load, shared by the sign in handler and the arrival check', async () => {
    const { d, calls } = deps(null, { ok: true, region: 'US' });
    const [one, two] = await Promise.all([syncRegionWithProfile('a', d), syncRegionWithProfile('a', d)]);
    expect([one, two]).toEqual(['US', 'US']);
    expect(calls.reads).toBe(1);
    // Another account signing in on the same page is read afresh.
    await syncRegionWithProfile('b', d);
    expect(calls.reads).toBe(2);
  });
});

describe('arrival: only the bare home page is redirected (arrivalAction)', () => {
  it('takes a visitor who chose the US or India from the UK home to that home', () => {
    expect(arrivalAction({ live: ALL, pathname: '/', chosen: 'US', active: GB })).toEqual({ kind: 'redirect', to: '/us/' });
    expect(arrivalAction({ live: ALL, pathname: '/', chosen: 'IN', active: GB })).toEqual({ kind: 'redirect', to: '/in/' });
  });

  it('never redirects a deep link: a product, a brand, notes, guides, a region\'s own home', () => {
    for (const pathname of ['/creed_aventus_100ml', '/fragrance/ean-6290360375687', '/brands/creed', '/notes', '/notes/vanilla', '/guides', '/guides/how-we-match', '/deals', '/about', '/account', '/us/', '/in/creed_aventus_100ml']) {
      const a = arrivalAction({ live: ALL, pathname, chosen: 'US', active: pathname.startsWith('/in/') ? IN : GB });
      expect(a.kind, pathname).toBe('mismatch');
      expect(a.kind === 'mismatch' && a.region.id, pathname).toBe('US');
    }
  });

  it('does nothing when the page is already in the chosen region', () => {
    expect(arrivalAction({ live: ALL, pathname: '/', chosen: 'GB', active: GB })).toEqual({ kind: 'none' });
    expect(arrivalAction({ live: ALL, pathname: '/us/deals', chosen: 'US', active: US })).toEqual({ kind: 'none' });
  });

  it('does nothing with no choice, a region that is not live, or only the UK live (today)', () => {
    expect(arrivalAction({ live: ALL, pathname: '/', chosen: null, active: GB })).toEqual({ kind: 'none' });
    expect(arrivalAction({ live: [GB, US], pathname: '/', chosen: 'IN', active: GB })).toEqual({ kind: 'none' });
    expect(arrivalAction({ live: [GB], pathname: '/', chosen: 'US', active: GB })).toEqual({ kind: 'none' });
  });
});

describe('a choice (chooseRegion): the country menu and the Country row', () => {
  function deps(profile: (id: RegionId) => Promise<unknown> = async () => true) {
    const calls = { writeLocal: [] as RegionId[], writeProfile: [] as RegionId[], navigate: [] as string[] };
    const d: ChooseRegionDeps = {
      writeLocal: (id) => void calls.writeLocal.push(id),
      writeProfile: (id) => {
        calls.writeProfile.push(id);
        return profile(id);
      },
      navigate: (href) => void calls.navigate.push(href),
      waitMs: 50,
    };
    return { d, calls };
  }

  it('signed in: saved here and on the profile, then that region\'s home opens', async () => {
    const { d, calls } = deps();
    expect(await chooseRegion({ id: 'US', live: ALL, active: GB, signedIn: true }, d)).toBe('opened');
    expect(calls).toEqual({ writeLocal: ['US'], writeProfile: ['US'], navigate: ['/us/'] });
  });

  it('signed out: saved here only, nothing goes to a profile', async () => {
    const { d, calls } = deps();
    expect(await chooseRegion({ id: 'IN', live: ALL, active: GB, signedIn: false }, d)).toBe('opened');
    expect(calls).toEqual({ writeLocal: ['IN'], writeProfile: [], navigate: ['/in/'] });
  });

  it('the region the page is in is remembered too, and the page stays', async () => {
    const { d, calls } = deps();
    expect(await chooseRegion({ id: 'GB', live: ALL, active: GB, signedIn: true }, d)).toBe('saved');
    expect(calls).toEqual({ writeLocal: ['GB'], writeProfile: ['GB'], navigate: [] });
  });

  it('a slow or failing profile write never holds the visitor: it goes on after the wait', async () => {
    const slow = deps(() => new Promise(() => {}));
    const t0 = Date.now();
    expect(await chooseRegion({ id: 'US', live: ALL, active: GB, signedIn: true }, slow.d)).toBe('opened');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40);
    expect(slow.calls.navigate).toEqual(['/us/']);
    const failing = deps(() => Promise.reject(new Error('denied')));
    expect(await chooseRegion({ id: 'IN', live: ALL, active: GB, signedIn: true }, failing.d)).toBe('opened');
    expect(failing.calls.navigate).toEqual(['/in/']);
  });

  it('while the UK is the only live region nothing is stored, as before; a region that is not live cannot be chosen', async () => {
    const { d, calls } = deps();
    expect(await chooseRegion({ id: 'GB', live: [GB], active: GB, signedIn: true }, d)).toBe('ignored');
    expect(await chooseRegion({ id: 'IN', live: [GB, US], active: GB, signedIn: true }, d)).toBe('ignored');
    expect(await chooseRegion({ id: undefined, live: ALL, active: GB, signedIn: true }, d)).toBe('ignored');
    expect(calls).toEqual({ writeLocal: [], writeProfile: [], navigate: [] });
  });
});

describe('the country menu writes to the profile (demo/app.ts)', () => {
  const app = readFileSync(new URL('../demo/app.ts', import.meta.url), 'utf8');
  const body = (name: string) => {
    const start = app.indexOf(`function ${name}(`);
    expect(start, name).toBeGreaterThan(-1);
    return app.slice(start, app.indexOf('\n}\n', start));
  };

  it('chooseRegionFromMenu hands the choice to chooseRegion with the signed in state', () => {
    const menu = body('chooseRegionFromMenu');
    expect(menu).toMatch(/chooseRegion\(\{ id, live: liveRegions\(\), active: activeRegion\(\), signedIn: state\.authUser !== null \}, regionChoiceDeps\)/);
  });

  it('whose profile write is saveProfileRegion, the same one the pop-up and the Country row use', () => {
    const deps = /const regionChoiceDeps = \{([\s\S]*?)\n\};/.exec(app)?.[1] ?? '';
    expect(deps).toMatch(/writeProfile: saveProfileRegion/);
    expect(deps).toMatch(/writeLocal: \(id: RegionId\) => saveStoredRegion\(id\)/);
    expect(body('chooseCountryFromProfile')).toMatch(/chooseRegion\([\s\S]*regionChoiceDeps/);
    expect(app).toMatch(/saveToProfile: \(id: RegionId\) => \(state\.authUser \? saveProfileRegion\(id\) : Promise\.resolve\(false\)\)/);
  });

  it('a signed in visitor is reconciled on sign in and on each page load, through one shared answer', () => {
    expect(body('syncProfileRegion')).toMatch(/syncRegionWithProfile\(userId, regionSyncDeps\)/);
    expect(body('startRegionWelcome')).toMatch(/syncRegionWithProfile\(user\.id, regionSyncDeps\)/);
    expect(app).toMatch(/if \(user && isVerified\(user\)\) \{[\s\S]{0,200}syncProfileRegion\(user\.id\);/);
  });
});

describe('the Country row on the profile page (countryRowHtml)', () => {
  const html = countryRowHtml({ choices: ALL, current: 'US', tickIcon: '<svg class="ico tick"></svg>' });

  it('is absent while fewer than two regions can be chosen (the UK alone today)', () => {
    expect(countryRowHtml({ choices: [GB], current: 'GB', tickIcon: '' })).toBe('');
    expect(countryRowHtml({ choices: [], current: null, tickIcon: '' })).toBe('');
  });

  it('is present with two or more, in the account card style, labelled Country', () => {
    expect(countryRowHtml({ choices: [GB, US], current: 'GB', tickIcon: '' })).toContain('data-acct-country="US"');
    expect(html).toMatch(/^<section class="acct-card acct-country" aria-labelledby="acct-country-label">/);
    expect(html).toContain(`<p class="acct-card-label t-eyebrow" id="acct-country-label">${COUNTRY_ROW_LABEL}</p>`);
    expect(COUNTRY_ROW_LABEL).toBe('Country');
    expect(html).toContain(COUNTRY_ROW_NOTE);
    expect(COUNTRY_ROW_NOTE.length).toBeLessThanOrEqual(80);
  });

  it('draws each country as the welcome pop-up does: flag, name, currency symbol and code', () => {
    const buttons = [...html.matchAll(/<button type="button" class="region-welcome-choice acct-country-choice" data-acct-country="([A-Z]+)" aria-pressed="(true|false)">/g)].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([
      ['GB', 'false'],
      ['US', 'true'],
      ['IN', 'false'],
    ]);
    expect(html.match(/<svg class="flag"/g)).toHaveLength(3);
    for (const r of REGION_CONFIGS) {
      expect(html).toContain(`<span class="region-welcome-name">${r.name}</span> <span class="region-welcome-cur"><span aria-hidden="true">${r.currencySymbol}</span> ${r.currency}</span>`);
    }
  });

  it('marks only the current choice, pressed and ticked', () => {
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/acct-country-tick/g)).toHaveLength(1);
    expect(html).toMatch(/data-acct-country="US" aria-pressed="true">[\s\S]*?<span class="acct-country-tick" aria-hidden="true"><svg class="ico tick"><\/svg><\/span><\/button>/);
    // A current country that is not offered marks nothing.
    expect(countryRowHtml({ choices: [GB, US], current: 'IN', tickIcon: '' })).not.toContain('aria-pressed="true"');
  });

  it('disables every button while a choice is being saved, and says so', () => {
    const busy = countryRowHtml({ choices: ALL, current: 'GB', tickIcon: '', busy: true });
    expect(busy.match(/ disabled>/g)).toHaveLength(3);
    expect(busy).toContain('Saving your country.');
    expect(html).not.toContain(' disabled');
  });
});

describe('Download My Data holds the chosen country', () => {
  const base = {
    email: 'reader@example.com',
    accountCreatedAt: null,
    emailConfirmedAt: null,
    wishlist: [],
    fragranceName: () => null,
    priceAlerts: null,
    exportedAt: new Date('2026-10-09T12:00:00Z'),
  };

  it('as saved, or null when none is saved or it could not be read', () => {
    expect(buildDataExport({ ...base, country: 'US' }).country).toBe('US');
    expect(buildDataExport({ ...base, country: null }).country).toBeNull();
    expect(buildDataExport(base).country).toBeNull();
  });
});

describe('with the US and India live (the beta flags set)', () => {
  afterEach(() => {
    vi.doUnmock('../src/config/regions.js');
    vi.resetModules();
  });

  it('remembering switches on, and the cookies and privacy pages say where the country is kept', async () => {
    vi.resetModules();
    vi.doMock('../src/config/regions.js', async (importOriginal) => {
      const real = await importOriginal<typeof import('../src/config/regions.js')>();
      return { ...real, liveRegions: () => [...real.REGION_CONFIGS] };
    });
    const pref = await import('../demo/regionPreference.js');
    expect(pref.regionChoiceOn()).toBe(true);
    const legal = await import('../demo/legal.js');
    const key = legal.STORAGE_KEYS.find((k) => k.key === 'pricesniffs.region');
    expect(key?.holds).toBe('that choice. When you are signed in it is also saved on your profile, so it follows you to another device');
    const privacy = legal.LEGAL_PAGES.find((p) => p.id === 'privacy')!.body.replace(/\s+/g, ' ');
    expect(privacy).toContain(
      '<strong>Your country, if you choose one.</strong> When you are signed in, your chosen country is saved on your profile, so it follows you to another device. You can change it on your profile.',
    );
    // demo/legal.ts carries the whole catalogue: its first load here is the slow part.
  }, 120_000);
});

describe('today, with the UK the only live region', () => {
  it('the privacy page says nothing about a country on the profile', async () => {
    const legal = await import('../demo/legal.js');
    const privacy = legal.LEGAL_PAGES.find((p) => p.id === 'privacy')!.body;
    expect(privacy.includes('Your country, if you choose one')).toBe(liveRegions().length >= 2);
  }, 120_000);
});
