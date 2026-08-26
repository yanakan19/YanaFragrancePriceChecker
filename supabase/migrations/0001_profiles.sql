-- Module 7 — accounts. Run this FIRST, in the Supabase dashboard's SQL Editor.
-- See docs/SUPABASE-SETUP.md for the surrounding steps (creating the project,
-- wiring the URL/anon key into demo/supabase.ts, setting the Site URL for
-- verification email redirects, and the verification queries that prove this
-- ran correctly).
--
-- This repo has no way to run this for you: the client only ever gets the
-- public anon key (see demo/supabase.ts's own doc comment for why that is
-- fine to ship, unlike a service role key), and DDL needs more than that.
--
-- ── Safe to run twice ───────────────────────────────────────────────────────
-- Every statement below is idempotent: `if not exists` on the table and the
-- index, `drop policy if exists` before each `create policy`, `create or
-- replace` on the function, `drop trigger if exists` before the trigger. A
-- half-finished paste, a re-run after a typo further down, or an owner who
-- cannot remember whether they already did this can simply run the whole file
-- again and end up in the same place. That is worth more than the elegance of
-- a one-shot script, because the person running it gets exactly one shot at
-- reading the error message.

-- One row per account, created automatically the moment someone signs up —
-- never inserted by the client itself (see the trigger below), so a profile
-- can never exist without a matching auth.users row or vice versa.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now()
);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- This is the only thing standing between the anon key that ships in a public
-- JavaScript bundle and every row in this table. Supabase grants `anon` and
-- `authenticated` table-level privileges on everything in `public` by
-- default; RLS is what makes those grants harmless. Without this line the
-- table is world-readable to anyone who opens dist-demo/bundle.js, reads the
-- key out of it, and issues one HTTP request.
alter table public.profiles enable row level security;

-- Deliberately scoped `to authenticated`, not left open to every role. A
-- signed-out visitor carries the `anon` role and now matches no policy at
-- all, so the answer is a flat default deny rather than a predicate that
-- happens to evaluate to NULL for them. Same outcome, one fewer thing to
-- reason about.
--
-- `(select auth.uid())` rather than a bare `auth.uid()` is Supabase's own
-- documented form: the subselect is evaluated once per statement instead of
-- once per candidate row.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- `with check` is stated explicitly rather than left to Postgres's fallback.
-- Postgres does default an UPDATE policy's WITH CHECK to its USING clause, so
-- the old form was not actually exploitable — a reader still could not hand
-- their row to somebody else's id — but "the row you may change" and "the row
-- you may leave behind" are two different questions and a policy that only
-- answers one of them out loud invites the wrong answer next time it is
-- edited.
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT policy and no DELETE policy, on purpose, and their absence is the
-- policy: RLS denies by default, so a client cannot manufacture a profile row
-- for an id it does not own, nor delete one. Inserts arrive only from the
-- security definer trigger below; deletes arrive only as the cascade from
-- auth.users when an account is removed.

-- security definer: this runs with the privileges needed to insert into
-- public.profiles on behalf of a brand new auth.users row, which the row
-- level security policies above would otherwise block (the new user has no
-- session yet at the instant their own row is being created).
--
-- `set search_path = ''` with every name written out in full, rather than
-- `set search_path = public`: a SECURITY DEFINER function resolves unqualified
-- names with the privileges of its owner, so pinning the path to nothing and
-- qualifying explicitly removes the whole class of "something else got
-- resolved first" from the one function here that runs elevated.
--
-- `on conflict do nothing` matters more than it looks. This is an AFTER
-- INSERT trigger on auth.users, so an error raised here aborts the signup
-- transaction and the reader is told "Database error saving new user" with no
-- account created. A duplicate profile row is not worth failing a signup over.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, which in a
-- Supabase project means `anon` and `authenticated` inherit it. Calling this
-- one directly would fail anyway (a trigger function cannot be invoked
-- outside a trigger, and PostgREST does not expose trigger-returning
-- functions), but a SECURITY DEFINER function is precisely the kind of thing
-- that should not be callable by a role that reached it with a key printed in
-- a public bundle. Revoked, then granted back only where it is actually
-- needed: nowhere, because the trigger runs as the table owner.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
