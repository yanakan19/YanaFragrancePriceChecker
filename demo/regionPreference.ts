/**
 * The remembered country (docs/INTERNATIONAL-PLAN.md, section 2, "Welcome",
 * "Remembered preference: built 9 Oct 2026"), so that "or log in, we'll
 * remember your preference" is true.
 *
 * Where a choice is kept:
 * - in this browser, local storage `pricesniffs.region` (demo/regionWelcome.ts),
 *   so the next page load needs no request;
 * - for a signed in visitor, also `profiles.region` (demo/regionProfile.ts,
 *   migration 0009), so it follows them to another device.
 *
 * Every choice, from the welcome pop-up, the country menu or the Country row
 * on the profile page, is written to both when signed in. On sign in, and once
 * per page load for a signed in visitor, the two are reconciled
 * (reconcileRegion): the profile wins, a choice made in this browser fills an
 * empty profile, and nothing is written when the profile could not be read.
 *
 * Only the bare home page (/) is ever redirected to the remembered country's
 * home. A deep link (a product, a brand, notes, guides, a region's own home)
 * stays where it is (arrivalAction).
 *
 * All of it is off while the UK is the only live region (regionChoiceOn):
 * nothing is read, written or drawn. Kept free of the DOM and of the Supabase
 * client: the page passes in how to read and write each place, so
 * tests/regionPreference.test.ts drives every rule with plain functions.
 */

import { liveRegions, regionHome, type RegionConfig, type RegionId } from '../src/config/regions.js';
import { flagSvg } from './flags.js';
import type { ProfileRegionRead } from './regionProfile.js';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** True once there is a choice to remember: a second region is live. False today. */
export function regionChoiceOn(live: readonly RegionConfig[] = liveRegions()): boolean {
  return live.length >= 2;
}

// ── sign in: this browser and the profile agree ───────────────────────────

export interface RegionReconcile {
  /** The visitor's country once reconciled, or null when neither place holds one. */
  chosen: RegionId | null;
  /** Write this to local storage (the profile's choice, mirrored), or null. */
  toLocal: RegionId | null;
  /** Write this to the profile (this browser's choice, filling an empty profile), or null. */
  toProfile: RegionId | null;
}

/**
 * The rule, in one place. The profile wins: it is what the visitor asked to
 * be remembered, and every choice made while signed in is written there too.
 * A choice made in this browser before signing in is copied to a profile that
 * has none. With neither, nothing is chosen and the welcome pop-up asks.
 */
export function reconcileRegion(local: RegionId | null, profile: RegionId | null): RegionReconcile {
  if (profile) return { chosen: profile, toLocal: local === profile ? null : profile, toProfile: null };
  if (local) return { chosen: local, toLocal: null, toProfile: local };
  return { chosen: null, toLocal: null, toProfile: null };
}

export interface RegionSyncDeps {
  readLocal: () => RegionId | null;
  writeLocal: (id: RegionId) => unknown;
  readProfile: () => Promise<ProfileRegionRead>;
  writeProfile: (id: RegionId) => Promise<unknown>;
}

let synced: { key: string; result: Promise<RegionId | null> } | null = null;

/**
 * Reconciles once per signed in account per page load and answers the
 * visitor's country. The sign in handler and the arrival check share one
 * answer, so the profile is read once. When the profile cannot be read the
 * choice in this browser stands and nothing is written. `accountKey` only
 * tells one account from the next on the same page; it is never stored or
 * logged.
 */
export function syncRegionWithProfile(accountKey: string, deps: RegionSyncDeps): Promise<RegionId | null> {
  if (synced && synced.key === accountKey) return synced.result;
  const result = (async (): Promise<RegionId | null> => {
    const local = deps.readLocal();
    let read: ProfileRegionRead;
    try {
      read = await deps.readProfile();
    } catch {
      read = { ok: false };
    }
    if (!read.ok) return local;
    const r = reconcileRegion(local, read.region);
    if (r.toLocal) deps.writeLocal(r.toLocal);
    if (r.toProfile) {
      try {
        void deps.writeProfile(r.toProfile).catch(() => undefined);
      } catch {
        // A failed write changes nothing: it is tried again on the next load.
      }
    }
    return r.chosen;
  })();
  synced = { key: accountKey, result };
  return result;
}

/** For tests: forget the reconciled answer. */
export function resetRegionSyncForTests(): void {
  synced = null;
}

// ── arrival: redirect the bare home page only ─────────────────────────────

export type ArrivalAction =
  | { kind: 'none' }
  | { kind: 'redirect'; to: string }
  /** A deep link outside the remembered country: it stays, and the slim bar may offer the visitor's own. */
  | { kind: 'mismatch'; region: RegionConfig };

export interface ArrivalInput {
  /** The regions that can be chosen (the live ones). */
  live: readonly RegionConfig[];
  /** The address path without the query; '/' is the bare home page. */
  pathname: string;
  /** The remembered country, from this browser or the profile. */
  chosen: RegionId | null;
  /** The region the page is in. */
  active: RegionConfig;
}

/**
 * What a page does about a remembered country on arrival. Only the bare home
 * page is redirected, and only to a live region's home. A product, brand,
 * notes or guides page, or a region's own home, is what someone shared or
 * asked for, so it is never moved.
 */
export function arrivalAction({ live, pathname, chosen, active }: ArrivalInput): ArrivalAction {
  if (!regionChoiceOn(live)) return { kind: 'none' };
  const region = live.find((r) => r.id === chosen);
  if (!region || region.id === active.id) return { kind: 'none' };
  return pathname === '/' ? { kind: 'redirect', to: regionHome(region) } : { kind: 'mismatch', region };
}

// ── a choice: the country menu and the Country row ────────────────────────

/** How long a choice waits for the profile write before it goes on anyway. */
export const PROFILE_WAIT_MS = 1500;

export interface ChooseRegionInput {
  id: string | undefined;
  /** The regions that can be chosen. */
  live: readonly RegionConfig[];
  active: RegionConfig;
  signedIn: boolean;
}

export interface ChooseRegionDeps {
  writeLocal: (id: RegionId) => unknown;
  writeProfile: (id: RegionId) => Promise<unknown>;
  /** A full page load to another region's home. */
  navigate: (href: string) => void;
  waitMs?: number;
}

/** 'ignored': nothing to choose; 'saved': remembered, staying here; 'opened': remembered, going to its home. */
export type ChooseRegionResult = 'ignored' | 'saved' | 'opened';

/**
 * Remembers a choice in this browser and, when signed in, on the profile
 * (waiting at most PROFILE_WAIT_MS for it), then opens that region's home
 * unless the page is already in it. While only one region is live there is
 * nothing to choose, so nothing is stored, as before.
 */
export async function chooseRegion(input: ChooseRegionInput, deps: ChooseRegionDeps): Promise<ChooseRegionResult> {
  if (!regionChoiceOn(input.live)) return 'ignored';
  const region = input.live.find((r) => r.id === input.id);
  if (!region) return 'ignored';
  deps.writeLocal(region.id);
  if (input.signedIn) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wait = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, deps.waitMs ?? PROFILE_WAIT_MS);
    });
    const write = Promise.resolve()
      .then(() => deps.writeProfile(region.id))
      .catch(() => undefined);
    await Promise.race([write, wait]);
    clearTimeout(timer);
  }
  if (region.id === input.active.id) return 'saved';
  deps.navigate(regionHome(region));
  return 'opened';
}

// ── the Country row on the profile page ───────────────────────────────────

export const COUNTRY_ROW_LABEL = 'Country';
export const COUNTRY_ROW_NOTE = 'Saved on your account, so it follows you to any device you sign in on.';

export interface CountryRowInput {
  /** The regions to offer, in config order. */
  choices: readonly RegionConfig[];
  /** The visitor's country, marked: their saved choice, else the region the page is in. */
  current: RegionId | null;
  /** The mark beside the current choice (the page's ICON_TICK). */
  tickIcon: string;
  /** While a choice is being saved, every button is disabled. */
  busy?: boolean;
}

/**
 * The Country row: one button per country, drawn as the welcome pop-up draws
 * them (flag, name, currency symbol and code), the current one pressed and
 * ticked. Empty while fewer than two regions can be chosen.
 */
export function countryRowHtml({ choices, current, tickIcon, busy = false }: CountryRowInput): string {
  if (choices.length < 2) return '';
  const items = choices
    .map((r) => {
      const on = r.id === current;
      return `<button type="button" class="region-welcome-choice acct-country-choice" data-acct-country="${r.id}" aria-pressed="${on}"${busy ? ' disabled' : ''}>${flagSvg(r.flag)}<span class="region-welcome-text"><span class="region-welcome-name">${esc(r.name)}</span> <span class="region-welcome-cur"><span aria-hidden="true">${esc(r.currencySymbol)}</span> ${esc(r.currency)}</span></span>${
        on ? `<span class="acct-country-tick" aria-hidden="true">${tickIcon}</span>` : ''}</button>`;
    })
    .join('');
  return `<section class="acct-card acct-country" aria-labelledby="acct-country-label">
        <p class="acct-card-label t-eyebrow" id="acct-country-label">${COUNTRY_ROW_LABEL}</p>
        <div class="acct-country-list" role="group" aria-labelledby="acct-country-label">${items}</div>
        <p class="acct-card-note t-caption" aria-live="polite">${busy ? 'Saving your country.' : COUNTRY_ROW_NOTE}</p>
      </section>`;
}
