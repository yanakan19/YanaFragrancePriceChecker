import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Accounts backend for Module 7 (signup, verification, eventually wishlists).
 *
 * PriceSniffs is otherwise a pure static site — no server, no database, this
 * is the one thing in the whole demo/ tree that makes a network call at all.
 * Supabase is the deliberate exception: hosted Postgres, hosted auth and
 * hosted verification email in one place, so this project does not have to
 * run or secure a server of its own to have accounts. See
 * docs/SUPABASE-SETUP.md for the five minute setup and exactly what SQL to
 * run once.
 *
 * ── Why these two values are hardcoded, not secrets ──────────────────────────
 * `SUPABASE_URL` and `SUPABASE_ANON_KEY` both ship inside this file's own
 * bundled output, readable by anyone who opens dist-demo/bundle.js — and that
 * is fine, by Supabase's own design. The anon key only ever grants what Row
 * Level Security explicitly allows a signed out (or signed in as themselves)
 * visitor to do; it carries no elevated access. The real secret is the
 * *service role* key, which must never appear anywhere in this repo or this
 * bundle — there is deliberately no code path here that even accepts one.
 * This mirrors how every other retailer credential in this project is
 * handled: a publisher id is fine to ship, a login is not.
 *
 * ── Why blank is a valid, non-crashing state ─────────────────────────────────
 * These start empty because this sandbox cannot create a Supabase project or
 * hold its own secrets — the same "cannot invent a number" rule the rest of
 * this project runs on, just applied to credentials instead of a price. Once
 * a real project exists, its Project URL and anon public key (Project
 * Settings > API in the Supabase dashboard) get pasted in below and the
 * account UI goes live with no other code change. Until then,
 * `SUPABASE_CONFIGURED` is false and the account page says exactly that
 * instead of a form that fails on every submit.
 */
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

export const SUPABASE_CONFIGURED = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';

let client: SupabaseClient | null = null;
let clientFailed = false;

/**
 * Null while not configured, or if configuration turns out to be broken —
 * every caller in auth.ts already checks for null and degrades to "accounts
 * are not available" rather than assuming a client exists. createClient()
 * throws synchronously on a malformed URL, and this is called from init()
 * before any of the rest of the app's event wiring runs, so an unguarded
 * throw here would take the entire site down over a typo in one credential.
 * The core price comparison has nothing to do with accounts and must never
 * be able to fail because of them — the same reasoning that keeps a broken
 * Trustpilot widget or a failed product image from breaking anything else.
 */
export function supabase(): SupabaseClient | null {
  if (!SUPABASE_CONFIGURED || clientFailed) return null;
  if (!client) {
    try {
      client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          // Confirmation links land back on this same static site (see
          // docs/SUPABASE-SETUP.md's Site URL / Redirect URLs step), which
          // then has to read the token out of the URL itself. persistSession
          // keeps a signed in reader signed in across a reload, same as any
          // ordinary web app.
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } catch (err) {
      clientFailed = true;
      console.error('Supabase client failed to initialise; accounts are unavailable this session.', err);
      return null;
    }
  }
  return client;
}
