-- Price drop emails for wishlist items (queue item 4.1). Run FOURTH, after
-- 0001, 0002 and 0003, in the Supabase dashboard's SQL Editor. Safe to run
-- twice: every statement is idempotent, the same rule as the files before it.
-- See docs/SUPABASE-SETUP.md ("8. Price alerts") and docs/OWNER-STEPS.md.
--
-- What this adds:
--
--   profiles.price_alerts           the reader's own opt in, off by default.
--                                   They change it from the account page,
--                                   through the existing "update own
--                                   profile" policy.
--   price_alert_accounts            one row per reader who has ever opted in:
--                                   their unsubscribe token and the day we
--                                   last emailed them. Server only.
--   price_alert_history             one row per wishlist item the sender has
--                                   seen: the last price it emailed about or
--                                   recorded, so the same drop is never sent
--                                   twice. Server only.
--   unsubscribe_price_alerts(token) the one click unsubscribe, callable with
--                                   the public anon key and nothing but the
--                                   token from the email.
--   price_alert_recipients()        who to email, for the daily sender
--                                   (.github/workflows/price-alerts.yml),
--                                   which calls it with the service role key.
--                                   Nobody else may call it.
--
-- "Server only" means: RLS on, no policies at all, and every table privilege
-- revoked from anon and authenticated. The service role bypasses RLS, and it
-- is the only thing that reads or writes these two tables. A reader never
-- sees their own token through the API; they only ever receive it by email.

-- ── 1. The opt in ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists price_alerts boolean not null default false;

-- ── 2. Per account state (server only) ──────────────────────────────────────
create table if not exists public.price_alert_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- A random v4 uuid: 122 bits, not guessable, and it names nothing about
  -- the reader. It is the whole credential for the unsubscribe link.
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  -- The UK calendar day of the last email, so a re-run on the same day (a
  -- manual dispatch after the morning run) never sends a second one.
  last_sent_on date,
  created_at timestamptz not null default now()
);

alter table public.price_alert_accounts enable row level security;
revoke all on table public.price_alert_accounts from public, anon, authenticated;
grant select, insert, update, delete on table public.price_alert_accounts to service_role;

-- ── 3. Last price per wishlist item (server only) ───────────────────────────
-- Keyed on the wishlist row itself, so removing a fragrance from a wishlist
-- removes its history (on delete cascade) and saving it again starts fresh.
-- Deleting the account cascades through wishlists to here as well.
create table if not exists public.price_alert_history (
  wishlist_id uuid primary key references public.wishlists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The cheapest delivered price we last emailed about, or recorded the
  -- first time we saw this item. A drop is measured from here.
  last_price_gbp numeric(10, 2) not null,
  last_emailed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.price_alert_history drop constraint if exists price_alert_history_price_nonneg;
alter table public.price_alert_history
  add constraint price_alert_history_price_nonneg check (last_price_gbp >= 0);

alter table public.price_alert_history enable row level security;
revoke all on table public.price_alert_history from public, anon, authenticated;
grant select, insert, update, delete on table public.price_alert_history to service_role;

create index if not exists price_alert_history_user_id_idx on public.price_alert_history (user_id);

-- ── 4. A token exists the moment someone opts in ────────────────────────────
-- security definer because the reader's own role has no rights on
-- price_alert_accounts at all (section 2). It only ever inserts a row for the
-- profile being changed, and does nothing when the row already exists, so
-- turning alerts off and on again keeps the same token.
create or replace function public.ensure_price_alert_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price_alerts then
    insert into public.price_alert_accounts (user_id) values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_price_alert_account() from public, anon, authenticated;

drop trigger if exists on_price_alerts_opt_in on public.profiles;
create trigger on_price_alerts_opt_in
  after insert or update of price_alerts on public.profiles
  for each row execute procedure public.ensure_price_alert_account();

-- Anyone already opted in before the trigger existed (a re-run) gets a row.
insert into public.price_alert_accounts (user_id)
select p.id from public.profiles p where p.price_alerts
on conflict (user_id) do nothing;

-- ── 5. One click unsubscribe ────────────────────────────────────────────────
-- Token only: it takes nothing but the token, looks up whose it is, and
-- switches that reader's alerts off. It returns only whether the token was
-- known, never whose it was or any address. Callable signed out, because the
-- reader clicking a link in an email may not be signed in on that device.
-- Running it twice is harmless: the second call finds alerts already off and
-- still answers true.
create or replace function public.unsubscribe_price_alerts(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if p_token is null then
    return false;
  end if;
  select a.user_id into owner_id
  from public.price_alert_accounts a
  where a.unsubscribe_token = p_token;
  if owner_id is null then
    return false;
  end if;
  update public.profiles set price_alerts = false where id = owner_id;
  return true;
end;
$$;

revoke all on function public.unsubscribe_price_alerts(uuid) from public;
grant execute on function public.unsubscribe_price_alerts(uuid) to anon, authenticated;

-- ── 6. Who to email (service role only) ─────────────────────────────────────
-- Reads auth.users for the address, which is why it is security definer.
-- Only confirmed addresses of readers who have opted in. Never callable with
-- the anon key: execute is revoked from everyone and granted to service_role
-- alone, the key held as a GitHub secret by the sender.
create or replace function public.price_alert_recipients()
returns table (r_user_id uuid, r_email text, r_token uuid, r_last_sent_on date)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select p.id, u.email::text, a.unsubscribe_token, a.last_sent_on
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.price_alert_accounts a on a.user_id = p.id
  where p.price_alerts
    and u.email is not null
    and u.email_confirmed_at is not null;
end;
$$;

revoke all on function public.price_alert_recipients() from public, anon, authenticated;
grant execute on function public.price_alert_recipients() to service_role;
