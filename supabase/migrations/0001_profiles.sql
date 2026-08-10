-- Module 7 — accounts. Run this once, in the Supabase dashboard's SQL Editor,
-- on a fresh project. See docs/SUPABASE-SETUP.md for the surrounding steps
-- (creating the project, wiring the URL/anon key into demo/supabase.ts,
-- setting the Site URL for verification email redirects).
--
-- This repo has no way to run this for you: the client only ever gets the
-- public anon key (see demo/supabase.ts's own doc comment for why that is
-- fine to ship, unlike a service role key), and DDL needs more than that.
--
-- Scope, deliberately narrow: this is the signup + verification piece asked
-- for, not the wishlists/follows schema EXECUTION-PLAN.md sketches for the
-- rest of Module 7 — those get their own migration when that work starts,
-- rather than shipping tables nothing here reads or writes yet.

-- One row per account, created automatically the moment someone signs up —
-- never inserted by the client itself (see the trigger below), so a profile
-- can never exist without a matching auth.users row or vice versa.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_path text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Row Level Security from the first migration, not retrofitted: a reader can
-- only ever see or change their own row. Nothing in this schema is public.
create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- security definer: this runs with the privileges needed to insert into
-- public.profiles on behalf of a brand new auth.users row, which the row
-- level security policies above would otherwise block (the new user has no
-- session yet at the instant their own row is being created).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
