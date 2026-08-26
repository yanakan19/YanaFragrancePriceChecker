-- Module 7 — wishlists. Run SECOND, after 0001_profiles.sql, the same way:
-- paste into the Supabase dashboard's SQL Editor and run. See
-- docs/SUPABASE-SETUP.md, including the verification queries at the end that
-- prove RLS is actually on.
--
-- Schema matches what EXECUTION-PLAN.md sketched for this table: user,
-- fragrance id, added at, optional target price. `follows` is not part of
-- this migration — that was explicitly conditional on 2.3's social features
-- being wanted, and nothing has asked for those yet.
--
-- Safe to run twice, for the same reason 0001 is: every statement below is
-- idempotent, and the constraints are added by name with a `drop constraint
-- if exists` first so a table created by an earlier version of this file
-- picks them up rather than silently keeping the old shape.

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  -- `default auth.uid()` is belt and braces on top of the insert policy
  -- below: demo/wishlist.ts always sends the id explicitly, and the policy
  -- would reject anything else, but a row that forgot the column entirely
  -- now lands on the caller rather than on a null violation.
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Matches DemoFragrance['id'] in demo/data.ts (an EAN-derived string, not
  -- a uuid) — this table has no foreign key into the catalogue because the
  -- catalogue itself is generated data, not a database table, so there is
  -- nothing here for a foreign key to reference.
  fragrance_id text not null,
  -- What a reader typed in when saving it, entirely optional. Never set by
  -- this project itself — a blank/null value is the honest "no target set"
  -- state, the same "absent rather than invented" rule the rest of this
  -- project's numbers run on.
  target_price_gbp numeric(10, 2),
  added_at timestamptz not null default now(),
  -- One row per (reader, fragrance): saving something already saved updates
  -- the existing row (see the upsert in demo/wishlist.ts) rather than
  -- duplicating it.
  unique (user_id, fragrance_id)
);

-- ── Bounds on what a reader may write into their own rows ───────────────────
-- RLS answers "whose rows" and answers it completely. It says nothing about
-- how big a row may be, and a signed-in reader holds a key that can write to
-- this table directly, without going anywhere near demo/wishlist.ts. A
-- fragrance id in this catalogue is an EAN-derived string of well under 128
-- characters; without a bound, that column is an open text field on a free
-- tier database. A negative target price is not a price anyone typed.
--
-- Added by name, dropped first, so re-running this file on a table that
-- already exists actually applies them.
alter table public.wishlists drop constraint if exists wishlists_fragrance_id_len;
alter table public.wishlists
  add constraint wishlists_fragrance_id_len
  check (char_length(fragrance_id) between 1 and 128);

alter table public.wishlists drop constraint if exists wishlists_target_price_nonneg;
alter table public.wishlists
  add constraint wishlists_target_price_nonneg
  check (target_price_gbp is null or target_price_gbp >= 0);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- As with profiles: the anon key ships inside a public JavaScript bundle, so
-- this line is the entire difference between "a reader's saved list is
-- private" and "anyone who opens the bundle can read every reader's list".
alter table public.wishlists enable row level security;

-- All four verbs are policed separately and every one of them is scoped to
-- the row's own owner, so there is no verb a reader can reach another
-- reader's row through. Scoped `to authenticated`, so a signed-out visitor
-- matches no policy at all and is denied by default rather than by a
-- predicate that happens to compare against a NULL uid.
--
-- SELECT and INSERT are both needed by the upsert in demo/wishlist.ts, and so
-- is UPDATE: PostgREST resolves an upsert to `insert ... on conflict do
-- update`, which is checked against the insert policy and the update policy
-- both. Saving an already-saved fragrance with a new target price is that
-- update path, and it is the reader editing their own row.
drop policy if exists "read own wishlist" on public.wishlists;
create policy "read own wishlist"
  on public.wishlists for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "insert own wishlist rows" on public.wishlists;
create policy "insert own wishlist rows"
  on public.wishlists for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Explicit `with check` alongside `using`, for the same reason as profiles:
-- Postgres would default the check to the using clause, so the old form was
-- not exploitable — a reader could not reassign a row to another user_id —
-- but the rule that a row must still belong to you *after* the update is
-- worth stating rather than inheriting.
drop policy if exists "update own wishlist rows" on public.wishlists;
create policy "update own wishlist rows"
  on public.wishlists for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete own wishlist rows" on public.wishlists;
create policy "delete own wishlist rows"
  on public.wishlists for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists wishlists_user_id_idx on public.wishlists (user_id);
