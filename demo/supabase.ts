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
 * These stayed empty for as long as this sandbox could not create a Supabase
 * project or hold its own secrets — the same "cannot invent a number" rule
 * the rest of this project runs on, just applied to credentials instead of a
 * price. A real project now exists, and its Project URL and anon public key
 * (Project Settings > API in the Supabase dashboard) are the two values
 * below — pasted in by the project owner, not generated here. The guard
 * stays: if either value is ever blanked out again (a fork, a fresh clone
 * without them), `SUPABASE_CONFIGURED` goes back to false and the account
 * page says accounts are not switched on, instead of showing a form that
 * fails on every submit.
 */
// Typed `string`, not inferred as a literal: the SUPABASE_CONFIGURED check
// below compares against '', which is only meaningful — and only compiles
// under tsconfig.demo.json's stricter checking — if TS is not allowed to
// narrow these to the one literal value they happen to hold today.
const SUPABASE_URL: string = 'https://kemjyocklbkgjsyfdqtf.supabase.co';
const SUPABASE_ANON_KEY: string =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlbWp5b2NrbGJrZ2pzeWZkcXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwODM4NjYsImV4cCI6MjEwMjY1OTg2Nn0._U502yyU9FNWtVb3Y4fPyI4yON_Hl8GYgf0b-unwrKU';

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
          // ── flowType, pinned rather than left to the library default ──────
          //
          // Verified against the exact version this project pins
          // (@supabase/supabase-js 2.112.2, node_modules/@supabase/auth-js
          // 2.112.2): both the supabase-js wrapper's own
          // DEFAULT_AUTH_OPTIONS (dist/index.mjs) and auth-js's GoTrueClient
          // DEFAULT_OPTIONS (dist/main/GoTrueClient.js) read
          // `flowType: "implicit"`. That is the real current default for
          // this dependency, not 'pkce' — read from the installed source,
          // not assumed from general Supabase documentation, which mostly
          // discusses PKCE in the context of OAuth/social redirects.
          //
          // Set explicitly anyway, for two reasons. First, so this is a
          // decision on record rather than an unstated default a future
          // reader has to go re-derive from node_modules to understand.
          // Second, because the choice matters concretely for this project:
          // signUp()'s request body only includes a PKCE `code_challenge`
          // when `this.flowType === 'pkce'` (see GoTrueClient.js's
          // signUp()) — the confirmation email's link shape is decided
          // entirely by *this client's own configured flow*, not by
          // anything server side, so pinning it here is what actually keeps
          // the link shape fixed regardless of what a future dependency
          // bump changes the default to.
          //
          // The choice is 'implicit', not 'pkce', because of exactly the
          // path this project must support: a reader signs up on one
          // device (typically a phone) and opens the confirmation link in
          // whatever mail client they read on another. Under 'pkce', that
          // link carries a `?code=` the browser has to exchange for a
          // session using a `code_verifier` the *signing-up* browser
          // stashed in its own local storage — absent in a second browser
          // by construction. auth-js's own source names this exact case:
          // AuthPKCECodeVerifierMissingError's message reads "This can
          // happen if the auth flow was initiated in a different browser or
          // device" (errors.js). Under 'implicit', the confirmation link
          // instead carries the session's access and refresh tokens
          // directly in its URL fragment — see _getSessionFromURL in
          // GoTrueClient.js — so whichever browser opens the link has
          // everything it needs in the link itself, with no per-browser
          // storage to have missed.
          //
          // The honest trade-off: implicit puts real session tokens in a
          // URL (briefly in the address bar and browser history, before
          // this library clears the fragment on success — same file,
          // `window.location.hash = ''`), which PKCE's authorization-code
          // indirection avoids. That protection matters most for an OAuth
          // redirect that bounces through a third-party authorization
          // server's own domain, where an intercepted code is otherwise
          // usable by whoever captured the redirect. There is no such
          // third party here: this is a direct email/password confirmation
          // link the reader receives in their own inbox, so accepting
          // implicit's narrower exposure is a reasonable price for a
          // cross-device flow this product actually needs to work.
          //
          // What this cannot fix on its own: a link that is expired,
          // already used, or otherwise rejected by Supabase still fails —
          // just for an ordinary, flow-independent reason instead of a
          // cross-browser one. See demo/auth.ts's checkEmailLinkCallback for
          // why that failure is now surfaced to the reader instead of
          // silently producing a page that looks like nothing happened.
          flowType: 'implicit',
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
