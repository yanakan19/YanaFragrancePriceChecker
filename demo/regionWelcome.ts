/**
 * "Select your country": the welcome pop-up on the bare home page, and the
 * visitor's remembered region (docs/INTERNATIONAL-PLAN.md, section 2,
 * "Welcome"; owner request, 9 October 2026).
 *
 * Built and tested, and switched off: it shows only when REGION_WELCOME_ON is
 * true AND a second region is live (src/config/regions.ts), so while the UK is
 * the only live region the page behaves exactly as before. Switch it on with
 * the US beta.
 *
 * What it does once on:
 * - Shows only on the bare home page (/), only when no region has been
 *   chosen: nothing in local storage and, for a signed in visitor, nothing on
 *   the profile (demo/regionProfile.ts). Never on a deep link.
 * - One large link per live region, with its flag and currency, the browser
 *   time zone's suggestion marked "Suggested", and underneath "or log in,
 *   we'll remember your preference", which opens the existing sign in.
 * - Choosing saves the region in local storage (pricesniffs.region) and, when
 *   signed in, on the profile, then goes to that region's home (the UK stays
 *   on /). Each choice is a real link (<a href="/us/">), so it works without
 *   the script too.
 * - Closing it (Escape, the close button, a tap outside) means "stay on the
 *   UK site" for this visit only and saves nothing.
 * - A saved choice skips the pop-up; a visitor who chose another live region
 *   and opens the UK home is taken to that region's home.
 *
 * A real <dialog> opened with showModal(): focus moves into it (to the
 * suggested choice), Escape closes it, focus goes back to where it was. A
 * small centred card that leaves the home page readable behind it, so it is
 * not an intrusive interstitial. Tests: tests/regionWelcome.test.ts (the
 * logic and the markup) and tests/regionWelcomeBrowser.test.ts (the built
 * page, through the ?regionwelcome=preview address, which opens it with every
 * region as a choice whatever the switch says).
 */

import {
  REGION_CONFIGS,
  REGION_STORAGE_KEY,
  REGION_WELCOME_ON,
  liveRegions,
  regionById,
  regionHome,
  suggestRegionForTimeZone,
  type RegionConfig,
  type RegionId,
} from '../src/config/regions.js';
import { flagSvg } from './flags.js';

/** The pop-up's words, in one place for the tests. */
export const WELCOME_TITLE = 'Select your country';
export const WELCOME_LOGIN_TEXT = "or log in, we'll remember your preference";
export const WELCOME_SUGGESTED = 'Suggested';

/** The address that opens the pop-up on the built page for a test or a preview. */
export const WELCOME_PREVIEW_PARAM = 'regionwelcome';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ── the remembered choice ──────────────────────────────────────────────────

/** The region saved in this browser, or null. Never throws (private windows, blocked storage). */
export function readStoredRegion(storage: Pick<Storage, 'getItem'> | null = safeLocalStorage()): RegionId | null {
  try {
    const id = storage?.getItem(REGION_STORAGE_KEY);
    return regionById(id)?.id ?? null;
  } catch {
    return null;
  }
}

/** Saves the visitor's choice in this browser. Answers false when storage is unavailable. */
export function saveStoredRegion(id: RegionId, storage: Pick<Storage, 'setItem'> | null = safeLocalStorage()): boolean {
  if (!regionById(id)) return false;
  try {
    if (!storage) return false;
    storage.setItem(REGION_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

// ── when it shows ──────────────────────────────────────────────────────────

export interface WelcomeInput {
  /** REGION_WELCOME_ON, or true in the preview. */
  switchOn: boolean;
  /** The regions that can be chosen. */
  live: readonly RegionConfig[];
  /** The address path, without the query. */
  pathname: string;
  /** The region saved in this browser, if any. */
  stored: RegionId | null;
  /** The region the page is in. */
  active: RegionConfig;
}

export type WelcomeAction = { kind: 'none' } | { kind: 'redirect'; to: string } | { kind: 'ask' };

/**
 * What the home page does about the visitor's region on arrival. Pure: the
 * caller reads the address and the storage, and checks the profile before it
 * acts on 'ask'.
 */
export function welcomeAction(input: WelcomeInput): WelcomeAction {
  const { switchOn, live, pathname, stored, active } = input;
  if (!switchOn || live.length < 2) return { kind: 'none' };
  // Only the bare home page. A deep link (a product, a brand, a guide) and a
  // region's own home are never interrupted.
  if (pathname !== '/') return { kind: 'none' };
  const chosen = live.find((r) => r.id === stored);
  if (chosen) return chosen.id === active.id ? { kind: 'none' } : { kind: 'redirect', to: regionHome(chosen) };
  return { kind: 'ask' };
}

/** True when the pop-up can show at all: the switch is on and a second region is live. */
export function welcomeEnabled(on: boolean = REGION_WELCOME_ON, live: readonly RegionConfig[] = liveRegions()): boolean {
  return on && live.length >= 2;
}

// ── the markup ─────────────────────────────────────────────────────────────

export interface WelcomeMarkupInput {
  choices: readonly RegionConfig[];
  /** The time zone's suggestion, marked "Suggested" and focused first. */
  suggested: RegionId | null;
  /** The close button's icon (the page's own ICON_CLOSE). */
  closeIcon: string;
}

/** The dialog's inner markup: title, one link per region, the sign in link. */
export function welcomeDialogHtml({ choices, suggested, closeIcon }: WelcomeMarkupInput): string {
  const focusId = choices.some((r) => r.id === suggested) ? suggested : choices[0]?.id;
  const items = choices
    .map((r) => {
      const isSuggested = r.id === suggested;
      return `<li><a class="region-welcome-choice${isSuggested ? ' is-suggested' : ''}" href="${esc(regionHome(r))}" hreflang="${r.hreflang}" data-region-choice="${r.id}"${
        r.id === focusId ? ' autofocus' : ''}>${flagSvg(r.flag)}<span class="region-welcome-text"><span class="region-welcome-name">${esc(r.name)}</span> <span class="region-welcome-cur"><span aria-hidden="true">${esc(r.currencySymbol)}</span> ${esc(r.currency)}</span></span>${
        isSuggested ? ` <span class="region-welcome-suggested">${WELCOME_SUGGESTED}</span>` : ''}</a></li>`;
    })
    .join('');
  return `<div class="region-welcome-body">
      <div class="region-welcome-head">
        <h2 id="region-welcome-title" class="ps-dialog-title">${WELCOME_TITLE}</h2>
        <button type="button" class="region-welcome-close" data-region-welcome-close aria-label="Close">${closeIcon}</button>
      </div>
      <ul class="region-welcome-list" aria-labelledby="region-welcome-title">${items}</ul>
      <p class="region-welcome-login-line"><a class="region-welcome-login" href="/account" data-region-welcome-login>${esc(WELCOME_LOGIN_TEXT)}</a></p>
    </div>`;
}

/** The browser's time zone, or null. No request, no storage. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

// ── the dialog ─────────────────────────────────────────────────────────────

export interface OpenWelcomeOptions {
  choices: readonly RegionConfig[];
  active: RegionConfig;
  closeIcon: string;
  /** Saves the choice on the profile when signed in; resolves either way. */
  saveToProfile: (id: RegionId) => Promise<unknown>;
  /** Opens the existing sign in (the /account page). */
  openSignIn: () => void;
  /** Goes to another region's home: a full page load. */
  navigate: (href: string) => void;
}

/** How long a choice waits for the profile write before it navigates anyway. */
const PROFILE_WAIT_MS = 1500;

/** Opens the pop-up. Resolves with the region chosen, or null when closed without a choice. */
export function openRegionWelcome(o: OpenWelcomeOptions): Promise<RegionId | null> {
  document.getElementById('region-welcome')?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = 'region-welcome';
  dlg.className = 'ps-dialog region-welcome';
  dlg.setAttribute('aria-labelledby', 'region-welcome-title');
  const suggested = suggestRegionForTimeZone(browserTimeZone());
  dlg.innerHTML = welcomeDialogHtml({
    choices: o.choices,
    suggested: suggested && o.choices.some((r) => r.id === suggested.id) ? suggested.id : null,
    closeIcon: o.closeIcon,
  });
  document.body.appendChild(dlg);
  const returnTo = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;

  return new Promise((resolve) => {
    let chosen: RegionId | null = null;
    dlg.addEventListener('close', () => {
      dlg.remove();
      returnTo?.focus();
      resolve(chosen);
    }, { once: true });
    // A tap on the backdrop (the dialog element itself, outside its card) closes it.
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('cancel');
    });
    // Escape closes it every time. The browser does this for a modal dialog
    // too, but may hold back a close request that comes with no user action
    // since the dialog opened (Chrome's close watcher rules), which here is
    // the usual case: it opens on arrival.
    dlg.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      dlg.close('cancel');
    });
    dlg.querySelector('[data-region-welcome-close]')?.addEventListener('click', () => dlg.close('cancel'));
    dlg.querySelector('[data-region-welcome-login]')?.addEventListener('click', (e) => {
      e.preventDefault();
      dlg.close('cancel');
      o.openSignIn();
    });
    dlg.querySelectorAll<HTMLAnchorElement>('[data-region-choice]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const region = regionById(a.dataset.regionChoice);
        if (!region) return;
        e.preventDefault();
        chosen = region.id;
        saveStoredRegion(region.id);
        const wait = new Promise((r) => setTimeout(r, PROFILE_WAIT_MS));
        void Promise.race([o.saveToProfile(region.id).catch(() => undefined), wait]).then(() => {
          dlg.close('choose');
          if (region.id !== o.active.id) o.navigate(a.href);
        });
      });
    });
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    // showModal focuses the autofocus choice; make sure, for older engines.
    if (!dlg.contains(document.activeElement)) dlg.querySelector<HTMLElement>('[autofocus]')?.focus();
  });
}

/** Every region in config order, for the preview (all of them choosable). */
export function previewChoices(): readonly RegionConfig[] {
  return REGION_CONFIGS;
}
