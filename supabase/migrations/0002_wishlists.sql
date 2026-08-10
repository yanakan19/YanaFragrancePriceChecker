-- Module 7 — wishlists. Run after 0001_profiles.sql, same way: paste into
-- the Supabase dashboard's SQL Editor and run once. See docs/SUPABASE-SETUP.md.
--
-- Schema matches what EXECUTION-PLAN.md sketched for this table: user,
-- fragrance id, added at, optional target price. `follows` is not part of
-- this migration — that was explicitly conditional on 2.3's social features
-- being wanted, and nothing has asked for those yet.

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
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

alter table public.wishlists enable row level security;

-- Row level security from the first migration touching this table, same as
-- profiles: a reader can only ever see or change their own rows.
create policy "read own wishlist"
  on public.wishlists for select
  using (auth.uid() = user_id);

create policy "insert own wishlist rows"
  on public.wishlists for insert
  with check (auth.uid() = user_id);

create policy "update own wishlist rows"
  on public.wishlists for update
  using (auth.uid() = user_id);

create policy "delete own wishlist rows"
  on public.wishlists for delete
  using (auth.uid() = user_id);

create index wishlists_user_id_idx on public.wishlists (user_id);
