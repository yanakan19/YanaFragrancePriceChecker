import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountAvatar, accountButtonLabel, accountMenuItems, buildDataExport, dataExportFileName, sortWishlist, WISHLIST_SORTS,
} from '../src/services/accountMenu.js';
import { accountState } from '../src/services/accountState.js';
import { matchRoute, routeToPath, type RouteName } from '../demo/router.js';
import { headFor } from '../demo/head.js';

/**
 * The owner's account revamp (2026-10-04), the parts that need no browser:
 * what the account menu offers in each state, the three account addresses
 * and their titles, that none of them is indexed or in the sitemap, the
 * wishlist sort, and the Download My Data file. The browser half is
 * tests/accountPagesBrowser.test.ts.
 */

const signedIn = accountState({ configured: true, checked: true, user: { email: 'reader@example.com', verified: true }, pendingEmail: '' });
const signedOut = accountState({ configured: true, checked: true, user: null, pendingEmail: '' });
const loading = accountState({ configured: true, checked: false, user: null, pendingEmail: '' });
const unconfigured = accountState({ configured: false, checked: true, user: null, pendingEmail: '' });
const verify = accountState({ configured: true, checked: true, user: { email: 'new@example.com', verified: false }, pendingEmail: '' });
const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe('the account menu', () => {
  it('offers the signed in items, with the wishlist count once it is known', () => {
    expect(labels(accountMenuItems(signedIn, 3))).toEqual([
      'View My Profile', 'View My Wishlist (3)', 'My Notifications', 'Settings', 'Sign Out',
    ]);
    // Before the wishlist has loaded the count is left off, never shown as 0.
    expect(labels(accountMenuItems(signedIn, null))).toContain('View My Wishlist');
    expect(labels(accountMenuItems(signedIn, 0))).toContain('View My Wishlist (0)');
  });

  it('offers sign in, create an account and settings when signed out', () => {
    expect(labels(accountMenuItems(signedOut, null))).toEqual(['Sign In', 'Create an Account', 'Settings']);
    expect(accountMenuItems(signedOut, null).map((i) => i.action)).toEqual(['signIn', 'signUp', 'settings']);
  });

  it('offers only Settings while loading or when accounts are not set up', () => {
    expect(labels(accountMenuItems(loading, null))).toEqual(['Settings']);
    expect(labels(accountMenuItems(unconfigured, null))).toEqual(['Settings']);
  });

  it('sends an unverified account to verify, with a way to sign out of its session', () => {
    expect(labels(accountMenuItems(verify, null))).toEqual(['Verify Your Email', 'Settings', 'Sign Out']);
  });

  it('shows the first letter of the email once signed in, and an icon otherwise', () => {
    expect(accountAvatar(signedIn)).toEqual({ kind: 'letter', letter: 'R', signedIn: true });
    for (const s of [signedOut, loading, unconfigured, verify]) expect(accountAvatar(s).kind).toBe('icon');
    expect(accountAvatar({ kind: 'signedIn', email: '' }).kind).toBe('icon');
  });

  it('names the button for a screen reader in every state', () => {
    expect(accountButtonLabel(signedIn)).toBe('Account menu, signed in as reader@example.com');
    expect(accountButtonLabel(signedOut)).toBe('Account menu, signed out');
    expect(accountButtonLabel(loading)).toBe('Account menu');
  });

  it('uses Title Case labels with no hyphens or dashes', () => {
    const all = [signedIn, signedOut, loading, verify].flatMap((s) => labels(accountMenuItems(s, 2)));
    for (const l of all) {
      expect(l, l).not.toMatch(/[-–—]/);
      for (const w of l.replace(/\(\d+\)/, '').split(/\s+/).filter(Boolean)) {
        if (['an', 'of', 'the', 'a'].includes(w)) continue;
        expect(w[0], `${l}: "${w}"`).toBe(w[0]!.toUpperCase());
      }
    }
  });
});

describe('the account pages have addresses, titles and stay out of search', () => {
  const pages: [string, RouteName, string][] = [
    ['/account', 'account', 'PriceSniffs: Account'],
    ['/account/wishlist', 'accountWishlist', 'PriceSniffs: My Wishlist'],
    ['/account/notifications', 'accountNotifications', 'PriceSniffs: My Notifications'],
  ];

  it.each(pages)('%s is its own route and round trips', (path, name) => {
    const r = matchRoute(path);
    expect(r.name).toBe(name);
    expect(routeToPath(r)).toBe(path);
  });

  it.each(pages)('%s has its own title and is noindex', (path, name, title) => {
    const t = headFor({ route: { name, param: '', query: {} } });
    expect(t.title).toBe(title);
    expect(t.noindex).toBe(true);
    expect(t.canonical.endsWith(path)).toBe(true);
  });

  it('titles the profile "My Profile" only while the page shows it', () => {
    const route = { name: 'account' as const, param: '', query: {} };
    expect(headFor({ route, leafName: 'My Profile' }).title).toBe('PriceSniffs: My Profile');
    expect(headFor({ route }).title).toBe('PriceSniffs: Account');
  });

  it('does not match made up addresses under /account', () => {
    expect(matchRoute('/account/billing').name).toBe('notFound');
    expect(matchRoute('/account/wishlist/extra').name).toBe('notFound');
  });

  it('keeps the unsubscribe link working on /account', () => {
    expect(matchRoute('/account', '?unsubscribe=abc').query.unsubscribe).toBe('abc');
  });

  it('leaves every account page and Settings out of the sitemap', () => {
    const xml = readFileSync(new URL('../demo/sitemap.xml', import.meta.url), 'utf8');
    expect(xml).not.toMatch(/<loc>[^<]*\/account[^<]*<\/loc>/);
    expect(xml).not.toMatch(/<loc>[^<]*\/settings<\/loc>/);
    expect(xml).toMatch(/<loc>[^<]*\/about<\/loc>/);
  });
});

describe('the wishlist sort', () => {
  const rows = [
    { name: 'B', addedAt: '2026-10-01T00:00:00Z', priceGbp: 30 },
    { name: 'A', addedAt: '2026-10-03T00:00:00Z', priceGbp: null },
    { name: 'C', addedAt: '2026-10-02T00:00:00Z', priceGbp: 20 },
  ];

  it('offers Recently Saved and Cheapest, and no drop it cannot measure', () => {
    expect(WISHLIST_SORTS.map((s) => s.label)).toEqual(['Recently Saved', 'Cheapest']);
  });

  it('puts the newest save first', () => {
    expect(sortWishlist(rows, 'recent').map((r) => r.name)).toEqual(['A', 'C', 'B']);
  });

  it('puts the cheapest first and anything with no price today last', () => {
    expect(sortWishlist(rows, 'cheapest').map((r) => r.name)).toEqual(['C', 'B', 'A']);
  });

  it('does not reorder the list it was given', () => {
    sortWishlist(rows, 'cheapest');
    expect(rows.map((r) => r.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('Download My Data', () => {
  const at = new Date('2026-10-04T12:00:00Z');
  const file = buildDataExport({
    email: 'reader@example.com',
    accountCreatedAt: '2026-09-20T10:00:00Z',
    emailConfirmedAt: '2026-09-20T10:05:00Z',
    wishlist: [
      { fragranceId: 'ean-1', targetPriceGbp: 30, addedAt: '2026-10-01T09:00:00Z', savedPriceGbp: 41.5 },
      { fragranceId: 'gone', targetPriceGbp: null, addedAt: '2026-10-02T09:00:00Z' },
    ],
    fragranceName: (id) => (id === 'ean-1' ? 'Armaf Club de Nuit 105ml' : null),
    priceAlerts: true,
    exportedAt: at,
  });

  it('holds the email, the creation date, the wishlist and the alert setting', () => {
    expect(file.exportedAt).toBe('2026-10-04T12:00:00.000Z');
    expect(file.account).toEqual({ email: 'reader@example.com', createdAt: '2026-09-20T10:00:00Z', emailConfirmedAt: '2026-09-20T10:05:00Z' });
    expect(file.wishlist).toEqual([
      { fragranceId: 'ean-1', fragrance: 'Armaf Club de Nuit 105ml', targetPriceGbp: 30, savedAt: '2026-10-01T09:00:00Z', savedPriceGbp: 41.5 },
      // A fragrance no longer listed keeps its id and says null, never a guess;
      // a row with no saved price says null too.
      { fragranceId: 'gone', fragrance: null, targetPriceGbp: null, savedAt: '2026-10-02T09:00:00Z', savedPriceGbp: null },
    ]);
    expect(file.alerts).toEqual({ priceAlertEmails: true });
  });

  it('adds nothing that is not stored, such as a plan', () => {
    expect(JSON.stringify(file)).not.toMatch(/plan|premium/i);
  });

  it('is saved under a dated name', () => {
    expect(dataExportFileName(at)).toBe('pricesniffs-my-data-2026-10-04.json');
  });
});
