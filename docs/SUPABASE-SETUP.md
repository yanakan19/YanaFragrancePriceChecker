# Supabase setup — Module 7 accounts

PriceSniffs is a static site with no server. Supabase is the one deliberate
exception: hosted Postgres, hosted auth and hosted verification email, so this
project does not have to run or secure a server of its own to have accounts.
Everything else on the site — every price, every comparison, every page — works
with no account, no sign-in and no network call to Supabase at all, and that
must stay true. Accounts are an addition to this site, never a gate in front
of it.

## Where this stands

**Written and in the bundle:** the Supabase client (`demo/supabase.ts`), sign
up / sign in / sign out / resend verification / password reset
(`demo/auth.ts`), wishlist read, save and remove (`demo/wishlist.ts`), the
`/account` page and the Save control on a fragrance (`demo/app.ts`), the
error-message mapping that refuses to leak whether an address has an account
(`src/services/authErrors.ts`), the gating rules that decide who sees a write
control (`src/services/accountState.ts`), and both database migrations
(`supabase/migrations/`).

**Not yet done, and only the project owner can do it:** running the two
migrations, and setting four things in the Supabase dashboard. That is the
whole of what is left, and it is the checklist below.

**Not tested against a live Supabase from inside this repo's tooling.** The
sandbox this code was written in has no network route to
`*.supabase.co` — a request to the project's own `/auth/v1/health` returns
nothing at all. So no sign-up, sign-in, table read or migration has ever been
executed from here, and nothing in this document should be read as "confirmed
working". It is "written, type-checked, unit-tested where a unit test can
reach, and reviewed". The browser checks in step 6 are the first time any of
it actually runs.

---

## The checklist

A note on the menu paths below: this sandbox has no network route to
`supabase.com` either, so none of these exact labels were re-checked against
the live dashboard while writing this. They are believed correct as of when
this was written, but Supabase does rename and reshuffle dashboard sections
between releases. If a path below does not exist as written, the setting has
almost certainly just moved rather than disappeared — search the dashboard's
own search box (or Supabase's current docs) for the bolded setting name
itself (e.g. "Confirm email", "Site URL") rather than assuming the feature is
gone.

### 1. Confirm the credentials in the repo match your project

`demo/supabase.ts` already carries a project URL and an anon key. Check they
belong to the project you are about to run the SQL in: Dashboard → Project
Settings → API, compare **Project URL** and the **anon / public** key.

The anon key is public by design and is *meant* to ship inside
`demo/index.html` — it grants exactly what Row Level Security allows a
signed-out or signed-in-as-themselves visitor to do, and nothing more. The
**`service_role` key must never appear in this repo, in a commit, in a build
or in a log.** There is deliberately no code path anywhere in this project
that accepts one; do not add one.

If either value is ever blanked out (a fork, a fresh clone),
`SUPABASE_CONFIGURED` goes false and the site keeps working in full with the
account page saying accounts are not switched on. That is a supported state,
not a broken one.

### 2. Run the migrations, in this order

Dashboard → SQL Editor → New query. Paste each file whole, run it, check for
an error, then move to the next.

1. `supabase/migrations/0001_profiles.sql` — the `profiles` table, its RLS
   policies, and the trigger that creates a profile row the moment someone
   signs up.
2. `supabase/migrations/0002_wishlists.sql` — the `wishlists` table, its four
   RLS policies, its bounds and its index.

Order matters: nothing in 0002 references 0001 directly, but 0001 is what
makes an account exist in the first place.

Both files are safe to run more than once. Every statement in them is
idempotent, so a half-finished paste, a re-run after fixing a typo, or simply
not remembering whether you already did it all end in the same place.

### 3. Require email confirmation — do not skip this

Dashboard → Authentication → Sign In / Providers → Email → **Confirm email:
on**.

This is the setting the whole account feature leans on, and turning it off to
make testing easier would undo the gating in the client as well as in the
database. With it on, `signUp()` returns success and *no session at all* until
the address is confirmed, so an unverified signup holds no key that can write
anything. The UI agrees with that: `wishlistControl()` in
`src/services/accountState.ts` gives an unverified reader the "Sign in to save"
invitation and never the real toggle, and there is a test asserting exactly
that.

Also on this screen: leave the minimum password length at 8 or higher. The
sign-up form asks for 8 (`minlength="8"`), and `authErrorMessage` has the
matching message for a password Supabase rejects as too short.

### 4. Set the Site URL and redirect URLs

Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://pricesniffs.space`
- **Redirect URLs**, add:
  - `https://pricesniffs.space/account`
  - `http://localhost:PORT/account` — only if you want signup to work from a
    local build, for whatever port you serve `demo/` on

`/account` is the exact path because that is what `demo/auth.ts` asks for, in
three places: `signUp`, `resendVerification` and `requestPasswordReset` all
pass `window.location.origin + '/account'`. Get this wrong and a reader's
confirmation link lands somewhere that is not this site, and there is nothing
in the code that can rescue that.

One thing worth knowing before you test it: the live site is on GitHub Pages,
which has no file at `/account`, so it serves `demo/404.html` — the same
built document as `index.html` — with an HTTP 404 status. The app boots and
routes to the account page as normal, and the token Supabase appends survives
the redirect. It looks wrong in a network tab and is not.

### 5. Prove the database is actually locked down

Dashboard → SQL Editor → paste `supabase/verify.sql` and run it. It changes
nothing; it reads the catalogue and answers four questions. Each query has the
expected result written above it, and the first is the one that matters most:

> Every table in `public` must come back with `rls_enabled = true`.

A table with RLS off does not error and does not look different in the table
editor. It just answers every request that arrives with the anon key — the key
printed in the public bundle. "It works" and "it is wide open" produce an
identical screen, which is why this gets checked rather than assumed.

### 6. Walk the flow in a browser, once

None of this has been executed against a live Supabase (see "Where this
stands"), so this is the real first run. In order, on the live site:

1. `/account` shows a Sign in / Sign up form — not "accounts are not switched
   on", which would mean step 1 is wrong.
2. Sign up with a real address. The page should switch to **"Verify your
   email"** with a Resend button. If it stays on the empty form, the signup
   did not succeed.
3. The verification email arrives. Its link points at
   `https://pricesniffs.space/account`.
4. **Open the link in a different browser than the one you signed up in** —
   e.g. sign up in Chrome, open the email and click the link in Safari or on
   your phone. This is the case `demo/supabase.ts` is explicitly configured
   for (`flowType: 'implicit'`, with the reasoning at that exact line) and it
   is a completely ordinary path for a real reader: sign up on a phone, read
   mail on a desktop. It should land on `/account` reading **"Signed in
   as …"** with a Wishlist heading below it, in the second browser, with no
   error shown. If it instead lands on the signed-out form with a red message
   about the link only working in the browser you signed up in
   (`authCallbackErrorMessage` in `src/services/authErrors.ts`), the project
   has drifted off the implicit flow this checklist assumes — check Dashboard
   → Authentication → Sign In / Providers → Email for a PKCE-only setting, and
   check `demo/supabase.ts` was actually rebuilt into the live bundle
   (`npm run demo`; see `tests/demoBuildFreshness.test.ts`).
5. Separately, confirm a bad link fails *visibly* rather than silently: wait
   for a confirmation link to expire (or reuse one already followed), open
   it, and check `/account` shows the "did not work … request a new one"
   message instead of a plain, unexplained sign-in form. That message is the
   fix for a link failure that used to produce no session and no error at
   all — see `demo/auth.ts`'s `checkEmailLinkCallback`.
6. Dashboard → Table Editor → `profiles` now has a row whose `id` matches the
   new user in Authentication → Users. That is the trigger from 0001 working.
7. Open any fragrance. The Save control now reads **Save** rather than "Sign
   in to save". Press it; it should read **Saved**.
8. Back to `/account`: that fragrance is in the Wishlist list. `wishlists` in
   the Table Editor has one row, with your `user_id`.
9. Remove it from the account page. The row disappears from both.
10. Sign out. `/account` returns to the form, the Save control on a fragrance
    returns to "Sign in to save", and every price on the site is exactly as it
    was. **This last part is the one that must not break.**

If step 2 or 3 stalls, check the rate limit before anything else — Supabase's
shared SMTP allows only a handful of emails per hour (see step 7).

### 7. (Optional, later) Real email sending

Supabase sends verification email through its own shared SMTP by default,
rate limited to a few per hour. Fine for the walkthrough above, not for real
signup volume. Dashboard → Authentication → Emails → SMTP Settings to point it
at a provider (Postmark, Resend, SES). Nothing in this repo changes for that;
it is entirely a dashboard setting.

---

## What the migrations actually guarantee

Worth stating plainly, because "there are RLS policies" is not the same claim
as "a reader cannot reach another reader's rows".

**`profiles`** — RLS enabled. A signed-in reader may `select` and `update`
their own row (`auth.uid() = id`) and nothing else. There is no `insert`
policy and no `delete` policy, and that absence *is* the policy: RLS denies by
default, so no client can manufacture a profile for an id it does not own or
delete one. Rows are created only by the `on_auth_user_created` trigger and
removed only by the cascade off `auth.users`. Every policy is scoped `to
authenticated`, so a signed-out visitor matches no policy at all.
`display_name` and `avatar_path` are bounded (80 and 512 characters) the same
way `wishlists`' columns are below — nothing in this repo writes to either
column yet, but the update policy already lets a signed-in reader write to
them today, straight through PostgREST, and RLS alone says nothing about how
big that write may be.

**`wishlists`** — RLS enabled. All four verbs are policed separately and every
one is scoped to `auth.uid() = user_id`, so there is no verb through which one
reader reaches another's rows. `select`, `insert` and `update` are all needed:
saving a fragrance is an upsert, which PostgREST resolves to `insert … on
conflict do update` and which is checked against the insert *and* update
policies. Scoped `to authenticated`, so signed out is a flat deny.
`fragrance_id` is bounded to 128 characters and `target_price_gbp` cannot be
negative — RLS answers "whose rows" completely and says nothing about how big
a row may be, and a signed-in reader holds a key that can write here without
going near `demo/wishlist.ts`.

`demo/wishlist.ts` also filters every query by the signed-in user's own id
rather than leaning on the policy alone. That is redundant on purpose: a bug
that dropped the filter would still only get back what RLS allows, and the
client and the database saying the same thing is worth more than the database
being the only thing that says it.

## What is still not built

Follows and the row-click profile UI that EXECUTION-PLAN.md sketches for the
rest of Module 7. Those get their own migration and their own pass when that
work starts. (Wishlists **are** built — `supabase/migrations/0002_wishlists.sql`
and `demo/wishlist.ts` — and an earlier version of this document said
otherwise. It was written before that pass landed and was never updated.)
