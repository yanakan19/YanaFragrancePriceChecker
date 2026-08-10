# Supabase setup — Module 7 accounts

The signup and email verification flow is fully built and wired in
(`demo/supabase.ts`, `demo/auth.ts`, `demo/app.ts`'s account view, tested in
`tests/authErrors.test.ts`), but it cannot go live on its own: it needs a real
Supabase project, and this sandbox cannot create one or hold its own secrets
— the same "never invent a number" rule this whole project runs on, just
applied to a credential instead of a price. Until the two values below are
filled in, `SUPABASE_CONFIGURED` is `false` and the account page honestly
says accounts are not switched on yet, rather than showing a form that fails
on every submit.

Five minutes, no code changes beyond one file:

## 1. Create the project

[supabase.com](https://supabase.com) → New project. Free tier covers this
project's expected load. Pick any region; nothing here is latency sensitive.

## 2. Run the migration

Dashboard → SQL Editor → paste the contents of
`supabase/migrations/0001_profiles.sql` → Run. Creates the `profiles` table,
its row level security policies, and the trigger that creates a profile row
automatically the moment someone signs up. This only needs to run once, ever,
on this project.

## 3. Set the Site URL

Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://pricesniffs.space`
- **Redirect URLs**: add `https://pricesniffs.space/account` (and, if you
  want signup to work from a local build too, `http://localhost:PORT/account`
  for whatever port you serve `demo/` on)

This is what a verification email's link actually points at. Get it wrong
and a reader's confirmation link lands somewhere that is not this site.

## 4. Copy the two public values in

Dashboard → Project Settings → API:

- **Project URL**
- **anon / public** key (not the `service_role` key — that one must never go
  in this repo; see `demo/supabase.ts`'s own doc comment for why the anon key
  is safe to ship in a public bundle and the service role key is not)

Paste both into `demo/supabase.ts`:

```ts
const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-public-key';
```

Then rebuild (`npm run demo`) and commit. That is the entire remaining step —
no other file changes, since every UI and code path already checks
`SUPABASE_CONFIGURED` and lights up the moment it is true.

## 5. (Optional, later) Custom email sending

Supabase sends verification emails through its own shared SMTP by default,
rate limited (a handful per hour) — fine for early testing, not for real
signup volume. Dashboard → Authentication → Emails → SMTP Settings to point
it at a real provider (Postmark, Resend, SES) once that matters. Nothing in
this repo needs to change for that switch; it is entirely a dashboard
setting.

## What this does not cover yet

Signup, verification-gated access, resend, and password reset are built.
Wishlists, follows, and the row-click profile UI EXECUTION-PLAN.md describes
for the rest of Module 7 are not — they get their own migration and their
own pass when that work starts, on top of the `profiles` table this one
creates.
