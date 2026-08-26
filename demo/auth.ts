import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase.js';
import { authErrorMessage, authFailureReason, type AuthFailureReason } from '../src/services/authErrors.js';

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
