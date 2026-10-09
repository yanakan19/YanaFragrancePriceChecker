import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGION_CONFIGS, REGION_STORAGE_KEY, regionById } from '../src/config/regions.js';
import {
  WELCOME_LOGIN_TEXT,
  WELCOME_TITLE,
  readStoredRegion,
  saveStoredRegion,
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

const GB = regionById('GB')!;
const US = regionById('US')!;
const IN = regionById('IN')!;

const base: WelcomeInput = { switchOn: true, live: [GB, US], pathname: '/', stored: null, active: GB };

describe('when the pop-up shows', () => {
  it('never while the switch is off or only one region is live; on since the public beta of 9 Oct 2026', () => {
    // US and India live and the switch on (owner decision, src/config/regions.ts).
    expect(welcomeEnabled()).toBe(true);
    expect(welcomeEnabled(true, [GB])).toBe(false);
    expect(welcomeEnabled(true, [GB, US])).toBe(true);
    expect(welcomeAction({ ...base, switchOn: false })).toEqual({ kind: 'none' });
    expect(welcomeAction({ ...base, live: [GB] })).toEqual({ kind: 'none' });
  });

  it('asks on the bare home page when nothing has been chosen', () => {
    expect(welcomeAction(base)).toEqual({ kind: 'ask' });
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

  it('never throws when storage is blocked or missing', () => {
    const blocked = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    expect(readStoredRegion(blocked)).toBeNull();
    expect(saveStoredRegion('GB', blocked)).toBe(false);
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
