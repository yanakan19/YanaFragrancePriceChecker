import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase.js';
import {
  authCallbackErrorMessage,
  authErrorMessage,
  authFailureReason,
  type AuthFailureReason,
} from '../src/services/authErrors.js';

/**
 * `reason` is a required field on every failure, not an optional one: under
 * this project's `exactOptionalPropertyTypes` an omitted-versus-undefined
 * distinction is a real one, and a caller switching on it should never have
 * to handle a third "the field is missing" case. 'other' is the honest
 * default and covers everything a caller can only display.
 */
export type AuthResult = { ok: true } | { ok: false; message: string; reason: AuthFailureReason };

/** Every "there is no client" path says the same thing, in one place. */
const NOT_CONFIGURED: AuthResult = {
  ok: false,
  message: 'Accounts are not set up on this deployment yet.',
  reason: 'other',
};

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return NOT_CONFIGURED;
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + '/account' },
  });
  if (error) {
    return { ok: false, message: authErrorMessage(error.message, 'signUp'), reason: authFailureReason(error.message) };
  }
  return { ok: true };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return NOT_CONFIGURED;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: authErrorMessage(error.message, 'signIn'), reason: authFailureReason(error.message) };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const client = supabase();
  if (!client) return;
  await client.auth.signOut();
}

export async function resendVerification(email: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return NOT_CONFIGURED;
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: window.location.origin + '/account' },
  });
  if (error) {
    return { ok: false, message: authErrorMessage(error.message, 'signUp'), reason: authFailureReason(error.message) };
  }
  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return NOT_CONFIGURED;
  // Supabase itself does not leak whether the address exists here, and
  // neither does this call's own success path — always the same message,
  // whatever the outcome, short of a real transport error.
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/account',
  });
  // Supabase's own endpoint already never reveals whether the address has an
  // account; the only errors worth surfacing here are ones about the request
  // itself (malformed address, rate limiting), never "not found".
  if (error && (error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('invalid'))) {
    return { ok: false, message: authErrorMessage(error.message, 'reset'), reason: 'other' };
  }
  return { ok: true };
}

/**
 * Reads back the result of the URL callback the client already ran on its
 * own, and returns an honest sentence if that callback failed — or `null`
 * if there was nothing to report (nothing was configured, or the link
 * worked, or this load was not a confirmation/recovery redirect at all).
 *
 * `supabase()`'s createClient() call does not pass `skipAutoInitialize`, so
 * the underlying GoTrueClient already called its own `initialize()` once,
 * synchronously, the moment the client was constructed — it is what
 * actually reads the confirmation link's tokens (or `?code=`) out of the
 * current URL. Its result, including any error, is cached on the client
 * (`initializePromise`) and calling `.initialize()` again here does not
 * repeat any of that work; it only lets this call site read what already
 * happened, per the method's own documented contract in auth-js.
 *
 * Before this existed, nothing in this codebase ever read that result. A
 * link that failed — expired, already used, or (see demo/supabase.ts's
 * flowType comment) opened in a browser lacking a stored PKCE verifier —
 * produced no session, no error event on `onAuthChange`, and nothing this
 * app's UI reacted to: the reader landed on /account looking exactly like a
 * fresh, signed out visit, with no way to tell a real problem from having
 * followed a stale bookmark. Call this once at startup, alongside
 * `currentUser()` and `onAuthChange` in app.ts's init(), and show whatever
 * it returns.
 */
export async function checkEmailLinkCallback(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const { error } = await client.auth.initialize();
  return error ? authCallbackErrorMessage(error.name) : null;
}

export function currentUser(): Promise<User | null> {
  const client = supabase();
  if (!client) return Promise.resolve(null);
  return client.auth.getUser().then(({ data }) => data.user ?? null);
}

/** True once Supabase has recorded a confirmed email for this account. */
export function isVerified(user: User | null): boolean {
  return user?.email_confirmed_at != null;
}

/** Fires on every sign in, sign out and token refresh — including the tab
 *  that just followed a verification link back in, which is why the account
 *  page never needs its own polling to notice a verification completed. */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  const client = supabase();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

/**
 * Sets a new password for the signed-in account. Used twice: by the reader who
 * followed a password reset link (Supabase signs them in for exactly this) and
 * by a signed-in reader changing it from the account page.
 */
export async function updatePassword(password: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return NOT_CONFIGURED;
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    const raw = error.message.toLowerCase();
    // Supabase refuses a new password identical to the current one.
    if (raw.includes('different from the old')) {
      return { ok: false, message: 'Choose a password you have not used for this account before.', reason: 'other' };
    }
    return { ok: false, message: authErrorMessage(error.message, 'signIn'), reason: authFailureReason(error.message) };
  }
  return { ok: true };
}

/**
 * Deletes the signed-in account and everything attached to it (the profile
 * and wishlist rows cascade from auth.users). Runs the `delete_own_account`
 * function from supabase/migrations/0003_delete_account.sql, which can only
 * ever delete the caller's own account. If the owner has not run that
 * migration yet, says how to ask for deletion instead.
 */
export async function deleteOwnAccount(contactEmail: string): Promise<AuthResult> {
  const client = supabase();
  if (!client) return NOT_CONFIGURED;
  const { error } = await client.rpc('delete_own_account');
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message);
    return {
      ok: false,
      message: missing
        ? `Deleting accounts from this page is not switched on yet. Email ${contactEmail} from this address and we will delete it for you.`
        : 'Your account could not be deleted. Please try again.',
      reason: 'other',
    };
  }
  await client.auth.signOut();
  return { ok: true };
}

/** Fires when this tab arrived from a password reset link: Supabase has
 *  signed the reader in, and the account page should ask for a new password. */
export function onPasswordRecovery(callback: () => void): () => void {
  const client = supabase();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') callback();
  });
  return () => data.subscription.unsubscribe();
}
