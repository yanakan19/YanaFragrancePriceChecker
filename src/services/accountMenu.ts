import type { AccountState } from './accountState.js';

/**
 * The account menu at the top right of the bar, and the two pure helpers the
 * account pages lean on: the wishlist sort and the "Download My Data" file.
 *
 * Kept free of the DOM and of Supabase, like accountState.ts beside it, so
 * every signed in and signed out shape can be pinned by a unit test
 * (tests/accountMenu.test.ts) without a session this sandbox cannot get.
 */

/** Where a menu item goes, or what it does. */
export type AccountMenuAction =
  | 'profile'
  | 'wishlist'
  | 'notifications'
  | 'settings'
  | 'suggestions'
  | 'signIn'
  | 'signUp'
  | 'verify'
  | 'signOut';

export interface AccountMenuItem {
  action: AccountMenuAction;
  label: string;
}

/**
 * The items for one account state.
 *
 * `wishlistCount` is null until the wishlist has actually loaded: the count
 * is left off rather than shown as 0, which would be a claim about a list
 * nobody has read yet.
 */
export function accountMenuItems(state: AccountState, wishlistCount: number | null): AccountMenuItem[] {
  const settings: AccountMenuItem = { action: 'settings', label: 'Settings' };
  // Directly under Settings in every menu: anyone can make a suggestion, so
  // it never depends on an account (owner's decision, 2026-10-04).
  const suggestions: AccountMenuItem = { action: 'suggestions', label: 'Suggestions' };
  switch (state.kind) {
    case 'signedIn':
      return [
        { action: 'profile', label: 'View My Profile' },
        { action: 'wishlist', label: wishlistCount === null ? 'View My Wishlist' : `View My Wishlist (${wishlistCount})` },
        { action: 'notifications', label: 'My Notifications' },
        settings,
        suggestions,
        { action: 'signOut', label: 'Sign Out' },
      ];
    case 'signedOut':
      return [
        { action: 'signIn', label: 'Sign In' },
        { action: 'signUp', label: 'Create an Account' },
        settings,
        suggestions,
      ];
    case 'verify':
      // An account that exists but has not confirmed its address yet can do
      // nothing a wishlist or an alert needs, so the menu offers the one step
      // that unlocks them, and a way out when there is a session to leave.
      return [
        { action: 'verify', label: 'Verify Your Email' },
        settings,
        suggestions,
        ...(state.hasSession ? [{ action: 'signOut' as const, label: 'Sign Out' }] : []),
      ];
    case 'unconfigured':
    case 'loading':
      // Nothing to sign in to (or not known yet): the menu still reaches the
      // one item that never depends on an account.
      return [settings, suggestions];
  }
}

/** What the round button shows: an initial once signed in, otherwise an icon. */
export type AccountAvatar = { kind: 'icon'; signedIn: false } | { kind: 'letter'; letter: string; signedIn: true };

export function accountAvatar(state: AccountState): AccountAvatar {
  if (state.kind !== 'signedIn') return { kind: 'icon', signedIn: false };
  const first = [...state.email.trim()][0];
  // An account with no email (Supabase allows it for OAuth identities, which
  // this site does not offer) still gets the icon rather than a blank disc.
  if (!first || !/[\p{L}\p{N}]/u.test(first)) return { kind: 'icon', signedIn: false };
  return { kind: 'letter', letter: first.toLocaleUpperCase('en-GB'), signedIn: true };
}

/** The accessible name of the round button, which carries no visible words. */
export function accountButtonLabel(state: AccountState): string {
  switch (state.kind) {
    case 'signedIn':
      return state.email ? `Account menu, signed in as ${state.email}` : 'Account menu, signed in';
    case 'verify':
      return 'Account menu, email not verified yet';
    case 'signedOut':
      return 'Account menu, signed out';
    case 'loading':
    case 'unconfigured':
      return 'Account menu';
  }
}

/* ── wishlist ─────────────────────────────────────────────────────────────── */

/**
 * The sorts the wishlist page offers. "Biggest Drop" is offered only where it
 * can be measured: a wishlist row stores the cheapest delivered price on the day
 * it was saved (supabase/migrations/0005_wishlist_saved_price.sql), and only
 * rows saved after that was run, with a delivered price that day, have one. See
 * `wishlistSortsFor`.
 */
export type WishlistSort = 'recent' | 'cheapest' | 'drop';

export const WISHLIST_SORTS: { id: WishlistSort; label: string }[] = [
  { id: 'recent', label: 'Newest to Oldest Saved' },
  { id: 'cheapest', label: 'Lowest to Highest Price' },
];

/** Biggest to Smallest Drop, which exists only where at least one row has a change to rank. */
const BIGGEST_DROP = { id: 'drop' as const, label: 'Biggest to Smallest Drop' };

/** The sorts to offer: the two always, and Biggest Drop only when some row has a change since saved. */
export function wishlistSortsFor(hasAnyChange: boolean): { id: WishlistSort; label: string }[] {
  return hasAnyChange ? [...WISHLIST_SORTS, BIGGEST_DROP] : WISHLIST_SORTS;
}

/** The sort to draw: the reader's choice, or Newest to Oldest Saved where Biggest to Smallest Drop is no longer on offer. */
export function effectiveWishlistSort(chosen: WishlistSort, hasAnyChange: boolean): WishlistSort {
  return chosen === 'drop' && !hasAnyChange ? 'recent' : chosen;
}

/**
 * How far today's cheapest delivered price has moved from the one recorded on
 * the day of saving: negative is cheaper now. Null unless both prices exist.
 * A row saved with no price recorded (before the column, or with no delivered
 * price that day) has no change, and one is never made up from today's price.
 */
export function changeSinceSaved(savedGbp: number | null, nowGbp: number | null): number | null {
  if (savedGbp === null || nowGbp === null) return null;
  return Math.round((nowGbp - savedGbp) * 100) / 100;
}

export interface SortableWishlistRow {
  addedAt: string;
  /** Today's cheapest delivered price, or null when nothing is buyable. */
  priceGbp: number | null;
  name: string;
  /** `changeSinceSaved`, where there is one. Negative is a drop. */
  changeGbp?: number | null;
}

/**
 * A sorted copy. Rows with no price today (sold out everywhere, or no stated
 * delivery) go last under Cheapest rather than being read as £0, and ties
 * fall back to the name so the order is stable between renders. Under Biggest
 * Drop the largest fall comes first, a row that is dearer comes after one that
 * is flat, and a row with no change to measure goes last.
 */
export function sortWishlist<T extends SortableWishlistRow>(rows: readonly T[], sort: WishlistSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'en-GB');
  const copy = [...rows];
  if (sort === 'recent') {
    return copy.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt) || byName(a, b));
  }
  if (sort === 'drop') {
    return copy.sort((a, b) => {
      const x = a.changeGbp ?? null;
      const y = b.changeGbp ?? null;
      if (x === null && y === null) return byName(a, b);
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y || byName(a, b);
    });
  }
  return copy.sort((a, b) => {
    if (a.priceGbp === null && b.priceGbp === null) return byName(a, b);
    if (a.priceGbp === null) return 1;
    if (b.priceGbp === null) return -1;
    return a.priceGbp - b.priceGbp || byName(a, b);
  });
}

/* ── Download My Data ─────────────────────────────────────────────────────── */

export interface DataExportInput {
  email: string | null;
  /** auth.users.created_at as Supabase reports it. */
  accountCreatedAt: string | null;
  emailConfirmedAt: string | null;
  wishlist: readonly { fragranceId: string; targetPriceGbp: number | null; addedAt: string; savedPriceGbp?: number | null }[];
  /** Resolved for readability only; the id is what is stored. */
  fragranceName: (id: string) => string | null;
  /** profiles.price_alerts, or null when the setting could not be read. */
  priceAlerts: boolean | null;
  /**
   * The profile photo. `stored` is null when photos are not switched on for
   * the site (nothing can be stored), `dataUrl` is the file itself as a data:
   * address, or null when there is none or it could not be read. Optional so
   * an export built without it still says null rather than nothing.
   */
  photo?: { stored: boolean | null; contentType: string | null; dataUrl: string | null };
  exportedAt: Date;
}

/**
 * Everything the site holds about one account, as far as the signed in
 * browser can read it: the sign in record, the wishlist rows, the alert
 * choice and the profile photo. Built in the browser from the same reads the
 * pages already make, so there is no server of ours in between and nothing
 * is added that is not stored. Fields that could not be read say null rather than a guess.
 */
export function buildDataExport(input: DataExportInput): Record<string, unknown> {
  return {
    about:
      'Everything PriceSniffs holds about your account, as read by your own browser. ' +
      'Theme and layout choices live only in this browser and are not included.',
    exportedAt: input.exportedAt.toISOString(),
    account: {
      email: input.email,
      createdAt: input.accountCreatedAt,
      emailConfirmedAt: input.emailConfirmedAt,
    },
    wishlist: input.wishlist.map((w) => ({
      fragranceId: w.fragranceId,
      fragrance: input.fragranceName(w.fragranceId),
      targetPriceGbp: w.targetPriceGbp,
      savedAt: w.addedAt,
      // Null where none was recorded, never a guess.
      savedPriceGbp: w.savedPriceGbp ?? null,
    })),
    alerts: {
      priceAlertEmails: input.priceAlerts,
    },
    profilePhoto: {
      stored: input.photo?.stored ?? null,
      contentType: input.photo?.contentType ?? null,
      file: input.photo?.dataUrl ?? null,
    },
  };
}

/** The file name the download is saved under, dated so two exports never collide. */
export function dataExportFileName(exportedAt: Date): string {
  return `pricesniffs-my-data-${exportedAt.toISOString().slice(0, 10)}.json`;
}
