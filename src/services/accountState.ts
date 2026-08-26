/**
 * Which account state the reader is actually in, as one pure function.
 *
 * The account page and the detail page's Save button both have to answer the
 * same handful of questions — is this deployment configured for accounts at
 * all, has the first session check even finished, is somebody signed in, have
 * they proven they control the address they signed up with — and they have to
 * answer them the *same* way. When that reasoning lived inline in app.ts as
 * two separate ladders of `if`, they drifted: one of them had a branch for a
 * reader who has signed up but has no session yet, and the other did not, so
 * a signup that succeeded rendered as though nothing had happened.
 *
 * Kept DOM-free and in src/ rather than demo/app.ts for the same reason
 * authErrors.ts is: demo/ is compiled with a DOM lib the rest of this project
 * deliberately does not carry, and the ordinary tsconfig — the one the test
 * suite runs under — cannot see it. Gating logic that decides whether an
 * unverified reader can write to a database is exactly the logic that should
 * be under test, so it lives where tests can reach it.
 *
 * Nothing here talks to Supabase. Every input is already-resolved fact handed
 * in by the caller, which is what makes it testable with no network at all —
 * and this sandbox has no route to Supabase, so anything requiring one could
 * not be verified here in any case.
 */

/** The signed-in reader, reduced to the two facts any of this depends on.
 *  `verified` is Supabase's `email_confirmed_at != null`, resolved by the
 *  caller (see isVerified in demo/auth.ts) so this module needs no Supabase
 *  types and no Supabase import. */
export interface AccountUser {
  /** Supabase permits a user with no email (OAuth-only identities); null is
   *  the honest value there rather than an invented placeholder. */
  email: string | null;
  verified: boolean;
}

export interface AccountStateInput {
  /** demo/supabase.ts's SUPABASE_CONFIGURED: both the project URL and the
   *  anon key are non-empty. False on a fork or a fresh clone with the
   *  credentials blanked out, which must stay a calm "not switched on" page
   *  rather than a form that fails on every submit. */
  configured: boolean;
  /** True once the very first `auth.getUser()` has resolved. Distinct from
   *  `user === null`, which means genuinely signed out: before the first
   *  check has come back we know nothing, and showing a sign-in form in that
   *  gap makes a signed-in reader's own page flash "sign in" at them. */
  checked: boolean;
  user: AccountUser | null;
  /** The address a signup (or a sign-in that bounced off an unconfirmed
   *  account) was just attempted with. Supabase issues no session at all when
   *  "Confirm email" is on, so this is the only thing that distinguishes
   *  "just signed up, go and check your inbox" from "arrived here signed out"
   *  — both have `user === null`. Empty string means neither happened. */
  pendingEmail: string;
}

/**
 * `verify` covers both routes to the same place: a session exists but the
 * address is unconfirmed, and no session exists because Supabase withheld one
 * until the address is confirmed. The reader's situation and the only useful
 * next action ("follow the link, or have it sent again") are identical, so
 * they get one screen — but `hasSession` still distinguishes them, because
 * one can offer Sign out and the other has nothing to sign out of.
 */
export type AccountState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'verify'; email: string; hasSession: boolean }
  | { kind: 'signedIn'; email: string }
  | { kind: 'signedOut' };

export function accountState(input: AccountStateInput): AccountState {
  // Order matters, and it is deliberately most-certain-first.
  if (!input.configured) return { kind: 'unconfigured' };
  if (!input.checked) return { kind: 'loading' };

  const user = input.user;
  if (user) {
    // A real session outranks any pending address we were remembering: if
    // Supabase says this person is signed in and confirmed, they are, and a
    // stale pendingEmail from an earlier attempt must not keep them staring
    // at a "check your inbox" page they have already finished with.
    if (user.verified) return { kind: 'signedIn', email: user.email ?? '' };
    return { kind: 'verify', email: user.email ?? '', hasSession: true };
  }

  // No session, but we know an address was just used. This is the branch that
  // was missing: with "Confirm email" switched on in the Supabase dashboard —
  // which is how this project is meant to run — signUp() resolves ok and
  // hands back no session whatsoever, and onAuthChange never fires, so
  // without this the page simply re-rendered the empty form and the reader
  // had no way to tell whether anything had happened.
  if (input.pendingEmail !== '') {
    return { kind: 'verify', email: input.pendingEmail, hasSession: false };
  }

  return { kind: 'signedOut' };
}

/**
 * What the Save control on a fragrance should be.
 *
 * `hidden` rather than a disabled button in the two cases where the reader
 * could not act on it and is owed no explanation: accounts are not switched
 * on for this deployment (there is nothing to save into, and saying so on
 * every product page would be noise about our plumbing), and the first
 * session check has not come back yet (a button that flips from "Sign in to
 * save" to "Saved" a beat after the page paints is worse than one that
 * arrives a beat late).
 *
 * `prompt` is the invitation for a signed-out reader — this is one of the few
 * moments an account genuinely earns its keep, so it is worth a nudge.
 *
 * An unverified reader gets `prompt`, not `toggle`, and that is the point of
 * this function existing separately from accountState: the write gate is
 * verification, not merely having signed up. Supabase's own row level
 * security is the thing that actually enforces it (see
 * supabase/migrations/0002_wishlists.sql and the "Confirm email" step in
 * docs/SUPABASE-SETUP.md) — this is the UI agreeing with the database rather
 * than the UI being the only thing standing there.
 */
export type WishlistControl = 'hidden' | 'prompt' | 'toggle';

export function wishlistControl(input: AccountStateInput): WishlistControl {
  const state = accountState(input);
  switch (state.kind) {
    case 'unconfigured':
    case 'loading':
      return 'hidden';
    case 'signedIn':
      return 'toggle';
    case 'verify':
    case 'signedOut':
      return 'prompt';
  }
}
