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
 * on the profile page, is saved in this browser FIRST and, when signed in,
 * then on the profile (rememberRegion). The visitor's explicit choice is the
 * truth from the moment they make it: while the profile write is not
 * confirmed, the choice is stored with a pending marker and a time inside the
 * same `pricesniffs.region` value (`US|pending|1760000000000`, see
 * demo/regionWelcome.ts), and the profile is never allowed to override it.
 * The write is tried again on each page load, and on the next sign in, until
 * it succeeds, which drops the marker.
 *
 * On sign in, and once per page load for a signed in visitor, the two places
 * are reconciled (reconcileRegion): a choice with a pending marker wins; else
 * the profile wins over a choice made in this browser before signing in; a
 * choice made in this browser fills an empty profile; and nothing is written
 * when the profile could not be read (except the retry of a pending choice).
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
import type { StoredRegionChoice } from './regionWelcome.js';

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
  /** Write this to the profile (this browser's choice: filling an empty profile, or a pending choice), or null. */
  toProfile: RegionId | null;
  /** The profile already holds this browser's pending choice: drop the marker, nothing to write. */
  clearPending: boolean;
}

/**
 * The rule, in one place.
 * 1. A choice this browser holds with a pending marker (`localPending`) wins
 *    over the profile: it is the visitor's latest word and the profile has not
 *    heard it yet (the write failed or never finished). It is written to the
 *    profile again; when the profile already holds it, the marker is dropped.
 *    The profiles table keeps no time of last change, so nothing can show that
 *    another device chose later: the marker wins until the write succeeds.
 * 2. Otherwise the profile wins: it is what the visitor asked to be remembered
 *    by, and a choice made while signed in is on it. A choice made in this
 *    browser before signing in is copied to a profile that has none.
 * 3. With neither, nothing is chosen and the welcome pop-up asks.
 */
export function reconcileRegion(local: RegionId | null, profile: RegionId | null, localPending = false): RegionReconcile {
  if (local && localPending) {
    return profile === local
      ? { chosen: local, toLocal: null, toProfile: null, clearPending: true }
      : { chosen: local, toLocal: null, toProfile: local, clearPending: false };
  }
  if (profile) return { chosen: profile, toLocal: local === profile ? null : profile, toProfile: null, clearPending: false };
  if (local) return { chosen: local, toLocal: null, toProfile: local, clearPending: false };
  return { chosen: null, toLocal: null, toProfile: null, clearPending: false };
}

export interface RegionSyncDeps {
  /** What this browser holds, with its pending marker (readStoredChoice). */
  readLocal: () => StoredRegionChoice | null;
  writeLocal: (id: RegionId) => unknown;
  /** Drops the pending marker of that very choice (clearPendingRegion). */
  clearPending: (choice: StoredRegionChoice) => unknown;
  readProfile: () => Promise<ProfileRegionRead>;
  writeProfile: (id: RegionId) => Promise<unknown>;
}

/** True when a profile write answered that it saved (saveProfileRegion answers a boolean). */
const saved = (answer: unknown): boolean => answer === true;

let synced: { key: string; result: Promise<RegionId | null> } | null = null;

/**
 * Reconciles once per signed in account per page load and answers the
 * visitor's country. The sign in handler and the arrival check share one
 * answer, so the profile is read once. When the profile cannot be read the
 * choice in this browser stands and nothing is written, except that a pending
 * choice is still sent to the profile again. A choice made while the profile
 * was being read is newer than what was read, so it stands as it is. A failed
 * write is never shown or logged: the marker stays and it is tried again on
 * the next load. `accountKey` only tells one account from the next on the same
 * page; it is never stored or logged.
 */
export function syncRegionWithProfile(accountKey: string, deps: RegionSyncDeps): Promise<RegionId | null> {
  if (synced && synced.key === accountKey) return synced.result;
  const result = (async (): Promise<RegionId | null> => {
    const before = deps.readLocal();
    let read: ProfileRegionRead;
    try {
      read = await deps.readProfile();
    } catch {
      read = { ok: false };
    }
    // Read after the profile answers, so a choice made in the meantime is seen.
    const local = deps.readLocal();
    if (local?.id !== before?.id || local?.pendingAt !== before?.pendingAt) return local?.id ?? null;
    const pendingChoice = local !== null && local.pendingAt !== null ? local : null;
    const retry = (id: RegionId): void => {
      try {
        void deps
          .writeProfile(id)
          .then((answer) => {
            if (pendingChoice && saved(answer)) deps.clearPending(pendingChoice);
          })
          .catch(() => undefined);
      } catch {
        // A failed write changes nothing: it is tried again on the next load.
      }
    };
    if (!read.ok) {
      if (pendingChoice) retry(pendingChoice.id);
      return local?.id ?? null;
    }
    const r = reconcileRegion(local?.id ?? null, read.region, pendingChoice !== null);
    if (r.toLocal) deps.writeLocal(r.toLocal);
    if (r.clearPending && pendingChoice) deps.clearPending(pendingChoice);
    if (r.toProfile) retry(r.toProfile);
    return r.chosen;
  })();
  synced = { key: accountKey, result };
  return result;
}

/**
 * Forgets the reconciled answer, so the next sign in on this page reconciles
 * (and sends a pending choice again) afresh instead of reusing the answer of
 * an account that has since signed out.
 */
export function forgetRegionSync(): void {
  synced = null;
}

/** For tests: forget the reconciled answer. */
export const resetRegionSyncForTests = forgetRegionSync;

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

export interface RememberRegionDeps {
  /** Saves the choice in this browser; with `pendingAt` it carries the pending marker (saveStoredRegion). */
  writeLocal: (id: RegionId, pendingAt?: number) => unknown;
  /** Drops the pending marker of that very choice (clearPendingRegion). */
  clearPending: (choice: StoredRegionChoice) => unknown;
  writeProfile: (id: RegionId) => Promise<unknown>;
  /** The clock, for the time kept in the pending marker. */
  now?: () => number;
  waitMs?: number;
}

/**
 * Remembers a visitor's explicit choice. In this browser FIRST, so from this
 * moment it is the truth. Signed out, that is all: nothing else is written.
 * Signed in, it is saved with the pending marker and a time, then written to
 * the profile (waiting at most PROFILE_WAIT_MS for it, never longer, so a slow
 * or failing profile never holds the visitor). A write that answers true drops
 * the marker, even when it lands after the wait; a write that fails, throws or
 * never answers leaves it, and the choice stands here and is sent again on the
 * next page load and sign in (syncRegionWithProfile). A failed save shows
 * nothing and logs nothing.
 */
export async function rememberRegion(id: RegionId, signedIn: boolean, deps: RememberRegionDeps): Promise<void> {
  if (!signedIn) {
    deps.writeLocal(id);
    return;
  }
  const pendingAt = (deps.now ?? Date.now)();
  deps.writeLocal(id, pendingAt);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deps.waitMs ?? PROFILE_WAIT_MS);
  });
  const write = Promise.resolve()
    .then(() => deps.writeProfile(id))
    .then((answer) => {
      if (saved(answer)) deps.clearPending({ id, pendingAt });
    })
    .catch(() => undefined);
  await Promise.race([write, wait]);
  clearTimeout(timer);
}

export interface ChooseRegionInput {
  id: string | undefined;
  /** The regions that can be chosen. */
  live: readonly RegionConfig[];
  active: RegionConfig;
  signedIn: boolean;
}

export interface ChooseRegionDeps extends RememberRegionDeps {
  /** A full page load to another region's home. */
  navigate: (href: string) => void;
}

/** 'ignored': nothing to choose; 'saved': remembered, staying here; 'opened': remembered, going to its home. */
export type ChooseRegionResult = 'ignored' | 'saved' | 'opened';

/**
 * Remembers a choice (rememberRegion: in this browser first and, when signed
 * in, on the profile) then opens that region's home unless the page is
 * already in it. Whether or not the profile took it, the visitor goes where
 * they chose. While only one region is live there is nothing to choose, so
 * nothing is stored, as before.
 */
export async function chooseRegion(input: ChooseRegionInput, deps: ChooseRegionDeps): Promise<ChooseRegionResult> {
  if (!regionChoiceOn(input.live)) return 'ignored';
  const region = input.live.find((r) => r.id === input.id);
  if (!region) return 'ignored';
  await rememberRegion(region.id, input.signedIn, deps);
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
