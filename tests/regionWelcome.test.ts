import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REGION_CONFIGS, REGION_STORAGE_KEY, REGION_WELCOME_ON, regionById } from '../src/config/regions.js';
import {
  WELCOME_LOGIN_TEXT,
  WELCOME_TITLE,
  clearPendingRegion,
  formatStoredRegion,
  parseStoredRegion,
  readStoredChoice,
  readStoredRegion,
  saveStoredRegion,
  closeRegionWelcome,
  hasStoredSession,
  welcomeAction,
  welcomeDialogHtml,
  welcomeEnabled,
  type WelcomeInput,
} from '../demo/regionWelcome.js';
import { STORAGE_KEYS } from '../demo/legal.js';

/**
 * "Select your country" (docs/INTERNATIONAL-PLAN.md, section 2, "Welcome";
 * owner request, 9 October 2026): when the pop-up shows, what it holds, how
 * the choice is remembered, and the profile column it is saved to. Built and
 * switched off while only the UK is live. The built page half is
 * tests/regionWelcomeBrowser.test.ts.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GB = regionById('GB')!;
const US = regionById('US')!;
const IN = regionById('IN')!;

const base: WelcomeInput = { switchOn: true, live: [GB, US], pathname: '/', stored: null, active: GB };

describe('when the pop-up shows', () => {
  it('never while the switch is off or only one region is live, whichever state the switch is in', () => {
    // US and India live; the switch is the owner's (src/config/regions.ts):
    // off during the AdSense review (13 Oct 2026), on again after approval.
    expect(welcomeEnabled()).toBe(REGION_WELCOME_ON);
    expect(welcomeEnabled(true, [GB])).toBe(false);
    expect(welcomeEnabled(true, [GB, US])).toBe(true);
    expect(welcomeEnabled(false, [GB, US])).toBe(false);
    expect(welcomeAction({ ...base, switchOn: false })).toEqual({ kind: 'none' });
    expect(welcomeAction({ ...base, live: [GB] })).toEqual({ kind: 'none' });
  });

  it('asks on the bare home page when nothing has been chosen', () => {
    expect(welcomeAction(base)).toEqual({ kind: 'ask' });
  });

  it('never asks a signed in visitor, with or without a profile country (owner request, 9 Oct 2026)', () => {
    expect(welcomeAction({ ...base, signedIn: true })).toEqual({ kind: 'none' });
    // A saved country still moves the bare home page, as before.
    expect(welcomeAction({ ...base, signedIn: true, stored: 'US' })).toEqual({ kind: 'redirect', to: '/us/' });
    // Signed out (or unknown) is unchanged.
    expect(welcomeAction({ ...base, signedIn: false })).toEqual({ kind: 'ask' });
  });

  it('treats a Supabase session saved in the browser as signed in, read synchronously', () => {
    const mem = (entries: Record<string, string>) => ({
      get length() { return Object.keys(entries).length; },
      key: (i: number) => Object.keys(entries)[i] ?? null,
      getItem: (k: string) => entries[k] ?? null,
    });
    expect(hasStoredSession(mem({}))).toBe(false);
    expect(hasStoredSession(mem({ 'pricesniffs.region': 'US' }))).toBe(false);
    expect(hasStoredSession(mem({ 'sb-abc-auth-token': '{"access_token":"a","refresh_token":"b"}' }))).toBe(true);
    expect(hasStoredSession(mem({ 'sb-abc-auth-token.0': '{"access_token":"a"' }))).toBe(true);
    expect(hasStoredSession(mem({ 'sb-abc-auth-token': '' }))).toBe(false);
    expect(hasStoredSession(null)).toBe(false);
    expect(hasStoredSession({ length: 1, key: () => { throw new Error('blocked'); }, getItem: () => null })).toBe(false);
    expect(typeof closeRegionWelcome).toBe('function');
  });

  it('the page decides after the signed in state is known and closes an open dialog on sign in', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    expect(app).toMatch(/hasStoredSession\(\)/);
    expect(app).toMatch(/signedIn\s*\}\)\.kind === 'ask'/);
    expect(app).toMatch(/if \(user && !welcomePreview\(\)\) closeRegionWelcome\(\)/);
  });

  it('never on a deep link or on a region\'s own home', () => {
    for (const pathname of ['/creed_aventus_100ml', '/brands/creed', '/notes/vanilla', '/guides', '/deals', '/us/', '/about']) {
      expect(welcomeAction({ ...base, pathname }), pathname).toEqual({ kind: 'none' });
    }
  });

  it('skips the question once a choice is saved, and takes a visitor who chose another live region to its home', () => {
    expect(welcomeAction({ ...base, stored: 'GB' })).toEqual({ kind: 'none' });
    expect(welcomeAction({ ...base, stored: 'US' })).toEqual({ kind: 'redirect', to: '/us/' });
    // A saved region that is not live (India today) is ignored: the visitor is asked.
    expect(welcomeAction({ ...base, stored: 'IN' })).toEqual({ kind: 'ask' });
    expect(welcomeAction({ ...base, live: [GB, US, IN], stored: 'IN' })).toEqual({ kind: 'redirect', to: '/in/' });
  });
});

describe('the remembered choice', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('is saved under pricesniffs.region and read back', () => {
    const s = memory();
    expect(readStoredRegion(s)).toBeNull();
    expect(saveStoredRegion('US', s)).toBe(true);
    expect(s.m.get(REGION_STORAGE_KEY)).toBe('US');
    expect(readStoredRegion(s)).toBe('US');
  });

  it('ignores anything that is not a known region', () => {
    const s = memory();
    s.m.set(REGION_STORAGE_KEY, 'DE');
    expect(readStoredRegion(s)).toBeNull();
    expect(saveStoredRegion('DE' as never, s)).toBe(false);
  });

  it('holds the pending marker and its time inside the same value, so no second key exists', () => {
    const s = memory();
    expect(saveStoredRegion('US', s, 1_760_000_000_000)).toBe(true);
    expect(s.m.get(REGION_STORAGE_KEY)).toBe('US|pending|1760000000000');
    expect([...s.m.keys()]).toEqual([REGION_STORAGE_KEY]);
    expect(readStoredChoice(s)).toEqual({ id: 'US', pendingAt: 1_760_000_000_000 });
    // The region reads the same with or without the marker, so every reader of the choice is unchanged.
    expect(readStoredRegion(s)).toBe('US');
    // A save without the marker is a settled choice.
    expect(saveStoredRegion('IN', s)).toBe(true);
    expect(s.m.get(REGION_STORAGE_KEY)).toBe('IN');
    expect(readStoredChoice(s)).toEqual({ id: 'IN', pendingAt: null });
  });

  it('parses and formats the stored value, and ignores anything else', () => {
    expect(parseStoredRegion('GB')).toEqual({ id: 'GB', pendingAt: null });
    expect(parseStoredRegion('IN|pending|42')).toEqual({ id: 'IN', pendingAt: 42 });
    expect(parseStoredRegion('IN|pending')).toEqual({ id: 'IN', pendingAt: 0 });
    for (const bad of ['', 'DE', 'DE|pending|42', 'US|saved|42', 'US|pending|42|x', 'us', null, undefined]) {
      expect(parseStoredRegion(bad), String(bad)).toBeNull();
    }
    expect(formatStoredRegion('US')).toBe('US');
    expect(formatStoredRegion('US', 7)).toBe('US|pending|7');
    for (const id of ['GB', 'US', 'IN'] as const) {
      expect(parseStoredRegion(formatStoredRegion(id, 123))).toEqual({ id, pendingAt: 123 });
      expect(parseStoredRegion(formatStoredRegion(id))).toEqual({ id, pendingAt: null });
    }
  });

  it('drops the marker only from the very choice that was pending', () => {
    const s = memory();
    saveStoredRegion('US', s, 10);
    expect(clearPendingRegion({ id: 'US', pendingAt: 9 }, s)).toBe(false);
    expect(clearPendingRegion({ id: 'IN', pendingAt: 10 }, s)).toBe(false);
    expect(s.m.get(REGION_STORAGE_KEY)).toBe('US|pending|10');
    expect(clearPendingRegion({ id: 'US', pendingAt: 10 }, s)).toBe(true);
    expect(s.m.get(REGION_STORAGE_KEY)).toBe('US');
    expect(clearPendingRegion({ id: 'US', pendingAt: null }, s)).toBe(false);
    expect(clearPendingRegion({ id: 'US', pendingAt: 10 }, null)).toBe(false);
  });

  it('never throws when storage is blocked or missing', () => {
    const blocked = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(readStoredRegion(blocked)).toBeNull();
    expect(readStoredChoice(blocked)).toBeNull();
    expect(saveStoredRegion('GB', blocked)).toBe(false);
    expect(saveStoredRegion('GB', blocked, 5)).toBe(false);
    expect(clearPendingRegion({ id: 'GB', pendingAt: 5 }, blocked)).toBe(false);
    expect(readStoredRegion(null)).toBeNull();
    expect(saveStoredRegion('GB', null)).toBe(false);
  });

  it('is listed on the cookies page now that the pop-up can write it (US and India live since 9 Oct 2026)', () => {
    expect(STORAGE_KEYS.map((k) => k.key)).toContain(REGION_STORAGE_KEY);
  });
});

describe('what the pop-up holds', () => {
  const html = welcomeDialogHtml({ choices: REGION_CONFIGS, suggested: 'US', closeIcon: '<svg></svg>' });

  it('is titled Select your country, with a close button', () => {
    expect(html).toContain(`<h2 id="region-welcome-title" class="ps-dialog-title">${WELCOME_TITLE}</h2>`);
    expect(WELCOME_TITLE).toBe('Select your country');
    expect(html).toMatch(/<button type="button" class="region-welcome-close" data-region-welcome-close aria-label="Close">/);
  });

  it('has one real link per country, to its home, with its flag and currency', () => {
    const links = [...html.matchAll(/<a class="region-welcome-choice[^"]*" href="([^"]+)" hreflang="([^"]+)" data-region-choice="([A-Z]+)"/g)].map((m) => [m[3], m[1], m[2]]);
    expect(links).toEqual([
      ['GB', '/', 'en-GB'],
      ['US', '/us/', 'en-US'],
      ['IN', '/in/', 'en-IN'],
    ]);
    expect(html.match(/<svg class="flag"/g)).toHaveLength(3);
    for (const t of ['United Kingdom', 'United States', 'India', '£', '$', '₹', 'GBP', 'USD', 'INR']) expect(html).toContain(t);
  });

  it('marks and focuses the time zone suggestion', () => {
    expect(html.match(/region-welcome-suggested/g)).toHaveLength(1);
    expect(html).toMatch(/is-suggested" href="\/us\/"[^>]* autofocus>/);
    expect(html.match(/ autofocus/g)).toHaveLength(1);
    // With no suggestion the first choice takes the focus and nothing is marked.
    const plain = welcomeDialogHtml({ choices: [GB, US], suggested: null, closeIcon: '' });
    expect(plain).not.toContain('region-welcome-suggested');
    expect(plain).toMatch(/href="\/" hreflang="en-GB" data-region-choice="GB" autofocus>/);
  });

  it('offers to log in underneath, opening the existing sign in', () => {
    expect(WELCOME_LOGIN_TEXT).toBe("or log in, we'll remember your preference");
    expect(html).toContain(`<a class="region-welcome-login" href="/account" data-region-welcome-login>or log in, we&#39;ll remember your preference</a>`);
  });
});

describe('0009_profile_region.sql', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0009_profile_region.sql', import.meta.url), 'utf8');
  const code = sql.replace(/--.*$/gm, '');

  it('adds a nullable region column, idempotently', () => {
    expect(code).toMatch(/alter table public\.profiles\s+add column if not exists region text;/);
    expect(code).not.toMatch(/not null/);
    expect(code).not.toMatch(/\bdefault\b/);
  });

  it('allows only the three regions the config knows, without failing on a re-run', () => {
    expect(code).toMatch(/drop constraint if exists profiles_region_known;/);
    expect(code).toMatch(/check \(region is null or region in \('GB', 'US', 'IN'\)\) not valid;/);
    const codes = /region in \(([^)]+)\)/.exec(code)![1]!.split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(codes).toEqual(REGION_CONFIGS.map((r) => r.id));
  });

  it('deletes, drops and grants nothing', () => {
    expect(code).not.toMatch(/\b(delete|truncate|drop table|drop column|grant|revoke|update)\b/i);
  });
});
