import { describe, expect, it } from 'vitest';
import {
  accountState,
  wishlistControl,
  type AccountStateInput,
} from '../src/services/accountState.js';

/**
 * These are deliberately the *gating* tests, not a re-description of the UI.
 * None of them touches Supabase: this sandbox has no network route to it (a
 * request to the project's own /auth/v1/health returns nothing at all), so a
 * test that needed one could not honestly pass here. What can be pinned down
 * without a network is exactly the part worth pinning down — who is allowed
 * to see a write control, and whether an unconfigured deployment stays calm.
 */

/** A configured, checked, signed-out deployment: the ordinary starting point
 *  every test below varies one thing from. */
const base: AccountStateInput = {
  configured: true,
  checked: true,
  user: null,
  pendingEmail: '',
};

describe('accountState', () => {
  it('reports an unconfigured deployment before anything else', () => {
    // Blank credentials are a valid, non-crashing state — a fork or a fresh
    // clone must still render the whole site, account page included.
    expect(accountState({ ...base, configured: false })).toEqual({ kind: 'unconfigured' });
  });

  it('stays unconfigured even with a session and a pending address in hand', () => {
    // Nothing about a leftover session should be able to talk an unconfigured
    // build into showing an account UI it has no backend for.
    const state = accountState({
      configured: false,
      checked: true,
      user: { email: 'reader@example.com', verified: true },
      pendingEmail: 'reader@example.com',
    });
    expect(state).toEqual({ kind: 'unconfigured' });
  });

  it('is loading, not signed out, before the first session check resolves', () => {
    // The distinction the whole flicker-free first paint depends on.
    expect(accountState({ ...base, checked: false })).toEqual({ kind: 'loading' });
  });

  it('is signed out when configured, checked, with no user and nothing pending', () => {
    expect(accountState(base)).toEqual({ kind: 'signedOut' });
  });

  it('sends a signed-in but unconfirmed reader to verification, with a session to sign out of', () => {
    const state = accountState({ ...base, user: { email: 'reader@example.com', verified: false } });
    expect(state).toEqual({ kind: 'verify', email: 'reader@example.com', hasSession: true });
  });

  it('sends a just-signed-up reader with no session to verification too', () => {
    // "Confirm email" on means signUp() returns ok and no session at all.
    // Without this branch a successful signup rendered as a no-op.
    const state = accountState({ ...base, pendingEmail: 'newcomer@example.com' });
    expect(state).toEqual({ kind: 'verify', email: 'newcomer@example.com', hasSession: false });
  });

  it('has nothing to sign out of when verification is pending without a session', () => {
    const state = accountState({ ...base, pendingEmail: 'newcomer@example.com' });
    expect(state.kind === 'verify' && state.hasSession).toBe(false);
  });

  it('lets a real confirmed session outrank a stale pending address', () => {
    const state = accountState({
      ...base,
      user: { email: 'reader@example.com', verified: true },
      pendingEmail: 'reader@example.com',
    });
    expect(state).toEqual({ kind: 'signedIn', email: 'reader@example.com' });
  });

  it('carries an empty string rather than inventing an address when Supabase has none', () => {
    // Supabase permits an identity with no email. Absent, not made up.
    expect(accountState({ ...base, user: { email: null, verified: true } })).toEqual({
      kind: 'signedIn',
      email: '',
    });
  });
});

describe('wishlistControl', () => {
  it('shows nothing at all when accounts are not configured', () => {
    expect(wishlistControl({ ...base, configured: false })).toBe('hidden');
  });

  it('shows nothing until the first session check has resolved', () => {
    expect(wishlistControl({ ...base, checked: false })).toBe('hidden');
  });

  it('invites a signed-out reader to sign in rather than hiding the idea', () => {
    expect(wishlistControl(base)).toBe('prompt');
  });

  it('does NOT give an unverified reader a write control', () => {
    // The gate is verification, not merely having signed up. This is the one
    // assertion here that is a security assertion: loosening it to make a
    // flow easier to exercise would put a write control in front of somebody
    // who has not yet proven they control the address.
    expect(wishlistControl({ ...base, user: { email: 'reader@example.com', verified: false } })).toBe('prompt');
  });

  it('does NOT give a reader with a pending signup a write control either', () => {
    expect(wishlistControl({ ...base, pendingEmail: 'newcomer@example.com' })).toBe('prompt');
  });

  it('gives a verified, signed-in reader the real toggle', () => {
    expect(wishlistControl({ ...base, user: { email: 'reader@example.com', verified: true } })).toBe('toggle');
  });

  it('never returns a toggle for anyone accountState does not call signed in', () => {
    // Exhaustive sweep of the input space that matters, so a future branch
    // added to accountState cannot quietly widen who gets to write.
    for (const configured of [true, false]) {
      for (const checked of [true, false]) {
        for (const user of [null, { email: 'a@b.c', verified: false }, { email: 'a@b.c', verified: true }]) {
          for (const pendingEmail of ['', 'a@b.c']) {
            const input: AccountStateInput = { configured, checked, user, pendingEmail };
            const isSignedIn = accountState(input).kind === 'signedIn';
            expect(wishlistControl(input) === 'toggle').toBe(isSignedIn);
          }
        }
      }
    }
  });
});
