-- The developer dashboard (owner request, 6 October 2026): visitor counts,
-- clicks through to shops, and brands or shops hidden or removed from the
-- site. Run SEVENTH, after 0001 to 0006, in the Supabase dashboard's SQL
-- Editor. Safe to run twice: every statement is idempotent, the same rule as
-- the files before it. See docs/OWNER-STEPS.md ("Developer dashboard").
--
-- What this adds:
--
--   profiles.is_admin        the owner's flag. False for everyone; the owner
--                            sets it on their own row in the SQL Editor (the
--                            exact statement is in docs/OWNER-STEPS.md). No
--                            reader can set it through the API: a trigger
--                            refuses any change to it from the anon and
--                            authenticated roles.
--   is_site_admin()          true only for a signed in account whose flag is
--                            set. The page at /developer asks it first.
--   site_page_views          page views and visits, counted per hour, page,
--                            country and referring site. No row names a
--                            visitor.
--   site_shop_clicks         clicks through to a shop, counted per hour,
--                            product, shop and country.
--   count_page_view(...)     the one way a visitor's browser adds a count:
--   count_shop_click(...)    it adds one to an hour's total and can do
--                            nothing else. Callable with the public anon key.
--   site_stats(...)          the totals for the dashboard. Owner only.
--   site_overrides           brands and shops the owner has hidden or removed.
--                            Anyone may read the list (the site applies it on
--                            every page load and the deploy reads it to build
--                            the site); only the owner may change it.
--
-- ── What is counted, and what never is ──────────────────────────────────────
-- A page view is the page's address (no query string, no #anchor), the hour
-- it happened in, the visitor's country, and, for the first page of a visit
-- only, the host name of the site that linked to it (google.com, not the
-- address). A shop click is the product, the shop and the country. Nothing
-- else: no IP address, no cookie, no identifier of any kind, nothing stored
-- on the visitor's device for counting. Rows are hourly totals, so two
-- visitors in the same hour from the same country on the same page are one
-- row with a count of two.
--
-- ── Where the country comes from ────────────────────────────────────────────
-- Supabase's API sits behind Cloudflare (its responses carry `server:
-- cloudflare` and a `cf-ray` id). Cloudflare looks the connecting address up
-- at its edge and passes the answer to the origin as the `CF-IPCountry`
-- request header: a two letter code, `XX` when it does not know, `T1` for
-- Tor. PostgREST hands the request's headers to the database as the
-- `request.headers` setting, and count_page_view reads that one header and
-- nothing else. Our own code never sees or looks up an IP address. If the
-- header is missing (Supabase could change its edge) every row says
-- "Unknown" rather than a guess; docs/OWNER-STEPS.md has the query that
-- shows which it is after the first visits.
--
-- ── Visits without cookies ──────────────────────────────────────────────────
-- A visit is counted when a page is opened from outside the site: typed in,
-- from a bookmark, or from another site's link (the browser's referrer is not
-- this site), and not a reload. Moving around inside the site adds page
-- views, never visits. The browser works this out from what it already has;
-- nothing is written to the device to remember anyone.

-- ── 1. The owner's flag ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- The update policy from 0001 lets a signed in reader change their own row.
-- RLS polices rows, not columns, so without this a reader could set their
-- own flag straight through the API. The trigger refuses any change to the
-- flag made by the two roles the public API runs as; the SQL Editor runs as
-- `postgres` and is unaffected.
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and current_user in ('anon', 'authenticated') then
    raise exception 'is_admin can only be changed in the SQL Editor' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_is_admin() from public, anon, authenticated;

drop trigger if exists guard_is_admin on public.profiles;
create trigger guard_is_admin
  before update of is_admin on public.profiles
  for each row execute procedure public.guard_is_admin();

-- security definer, so it can be used inside the policies below without
-- each one re-checking profiles' own policies row by row. It only ever reads
-- the caller's own row.
create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

-- ── 2. The counts ───────────────────────────────────────────────────────────
-- '' rather than null for "unknown" and "none", so each column can be part
-- of the primary key and one hour's visitors from the same place add up in
-- one row.
create table if not exists public.site_page_views (
  hour timestamptz not null,
  page text not null,
  country text not null default '',
  referrer_host text not null default '',
  views integer not null default 0,
  visits integer not null default 0,
  primary key (hour, page, country, referrer_host)
);

alter table public.site_page_views drop constraint if exists site_page_views_shape;
alter table public.site_page_views
  add constraint site_page_views_shape check (
    char_length(page) between 1 and 200
    and country ~ '^([A-Z]{2})?$'
    and char_length(referrer_host) <= 100
    and views >= 0 and visits >= 0
  );

create table if not exists public.site_shop_clicks (
  hour timestamptz not null,
  product_id text not null,
  brand text not null default '',
  retailer_id text not null,
  country text not null default '',
  clicks integer not null default 0,
  primary key (hour, product_id, retailer_id, country)
);

alter table public.site_shop_clicks drop constraint if exists site_shop_clicks_shape;
alter table public.site_shop_clicks
  add constraint site_shop_clicks_shape check (
    char_length(product_id) between 1 and 256
    and char_length(brand) <= 120
    and char_length(retailer_id) between 1 and 64
    and country ~ '^([A-Z]{2})?$'
    and clicks >= 0
  );

-- Owner only. RLS on, every privilege taken from the public roles, and read
-- given back to a signed in account only through a policy that asks
-- is_site_admin(). Nobody may write a row directly: counts arrive only
-- through the two functions in section 3.
alter table public.site_page_views enable row level security;
alter table public.site_shop_clicks enable row level security;
revoke all on table public.site_page_views from public, anon, authenticated;
revoke all on table public.site_shop_clicks from public, anon, authenticated;
grant select on table public.site_page_views to authenticated;
grant select on table public.site_shop_clicks to authenticated;
grant select, insert, update, delete on table public.site_page_views to service_role;
grant select, insert, update, delete on table public.site_shop_clicks to service_role;

drop policy if exists "owner reads page views" on public.site_page_views;
create policy "owner reads page views"
  on public.site_page_views for select
  to authenticated
  using ((select public.is_site_admin()));

drop policy if exists "owner reads shop clicks" on public.site_shop_clicks;
create policy "owner reads shop clicks"
  on public.site_shop_clicks for select
  to authenticated
  using ((select public.is_site_admin()));

-- ── 3. The narrow path in ───────────────────────────────────────────────────
-- security definer, because the anon role has no rights on the tables above.
-- Each call adds exactly one to one hour's total and returns nothing. Every
-- argument is checked against the shape the site sends and anything else is
-- filed under a catch all rather than stored as sent. Anyone holding the
-- public key can call these, so the totals can be inflated by someone set on
-- it; they can never be read, changed downwards or used to store anything
-- else.

-- The visitor's country from Cloudflare's header, or '' when it is absent,
-- unknown (XX) or Tor (T1). See the header of this file.
create or replace function public.request_country()
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  headers json;
  code text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  code := upper(coalesce(headers ->> 'cf-ipcountry', ''));
  if code !~ '^[A-Z]{2}$' or code in ('XX', 'T1') then
    return '';
  end if;
  return code;
end;
$$;

revoke all on function public.request_country() from public, anon, authenticated;

create or replace function public.count_page_view(p_page text, p_entry boolean default false, p_referrer text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_page text := coalesce(p_page, '');
  v_entry boolean := coalesce(p_entry, false);
  v_ref text := lower(coalesce(p_referrer, ''));
begin
  if v_page !~ '^/[A-Za-z0-9_./-]{0,199}$' then
    v_page := '/other';
  end if;
  if not v_entry or v_ref !~ '^[a-z0-9.-]{1,100}$' then
    v_ref := '';
  end if;
  insert into public.site_page_views as v (hour, page, country, referrer_host, views, visits)
  values (date_trunc('hour', now()), v_page, public.request_country(), v_ref, 1, case when v_entry then 1 else 0 end)
  on conflict (hour, page, country, referrer_host)
  do update set views = v.views + 1, visits = v.visits + excluded.visits;
end;
$$;

revoke all on function public.count_page_view(text, boolean, text) from public;
grant execute on function public.count_page_view(text, boolean, text) to anon, authenticated;

create or replace function public.count_shop_click(p_product text, p_brand text, p_retailer text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product text := coalesce(p_product, '');
  v_brand text := left(regexp_replace(coalesce(p_brand, ''), '[[:cntrl:]]', '', 'g'), 120);
  v_retailer text := coalesce(p_retailer, '');
begin
  -- The length is checked apart from the pattern: Postgres refuses a
  -- repetition count above 255 in a pattern ("invalid repetition count"), so
  -- '{1,256}' made every click fail (found 2026-10-06, before any count).
  if v_product !~ '^[A-Za-z0-9_.:-]+$' or char_length(v_product) > 256
     or v_retailer !~ '^[a-z0-9-]{1,64}$' then
    return;
  end if;
  insert into public.site_shop_clicks as c (hour, product_id, brand, retailer_id, country, clicks)
  values (date_trunc('hour', now()), v_product, v_brand, v_retailer, public.request_country(), 1)
  on conflict (hour, product_id, retailer_id, country)
  do update set clicks = c.clicks + 1;
end;
$$;

revoke all on function public.count_shop_click(text, text, text) from public;
grant execute on function public.count_shop_click(text, text, text) to anon, authenticated;

-- ── 4. The dashboard's totals (owner only) ──────────────────────────────────
-- One call returns everything the top of /developer shows for a period, as
-- JSON, so a year of hourly rows is summed here rather than sent to the
-- browser. Buckets are London wall clock time (the owner's), as text the page
-- matches to its own list of buckets (demo/siteStats.ts). p_country narrows
-- everything but the list of countries itself; null or '' is every country,
-- and 'unknown' is the visits whose country was not known.
create or replace function public.site_stats(p_since timestamptz, p_unit text, p_country text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit text := case when p_unit in ('hour', 'day', 'week', 'month', 'year') then p_unit else 'day' end;
  v_since timestamptz := greatest(coalesce(p_since, now() - interval '1 day'), now() - interval '6 years');
  v_all boolean := coalesce(p_country, '') = '';
  v_country text := case when lower(coalesce(p_country, '')) = 'unknown' then '' else upper(coalesce(p_country, '')) end;
  result jsonb;
begin
  if not public.is_site_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'series', coalesce((
      select jsonb_agg(jsonb_build_array(s.bucket, s.views, s.visits) order by s.bucket)
      from (
        select to_char(date_trunc(v_unit, v.hour at time zone 'Europe/London'), 'YYYY-MM-DD"T"HH24:MI') as bucket,
               sum(v.views)::bigint as views, sum(v.visits)::bigint as visits
        from public.site_page_views v
        where v.hour >= v_since and (v_all or v.country = v_country)
        group by 1
      ) s), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(jsonb_build_array(c.country, c.views, c.visits) order by c.visits desc, c.views desc, c.country)
      from (
        select v.country, sum(v.views)::bigint as views, sum(v.visits)::bigint as visits
        from public.site_page_views v
        where v.hour >= v_since
        group by 1
      ) c), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_array(p.page, p.views) order by p.views desc, p.page)
      from (
        select v.page, sum(v.views)::bigint as views
        from public.site_page_views v
        where v.hour >= v_since and (v_all or v.country = v_country)
        group by 1
        order by 2 desc, 1
        limit 10
      ) p), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_array(r.referrer_host, r.visits) order by r.visits desc, r.referrer_host)
      from (
        select v.referrer_host, sum(v.visits)::bigint as visits
        from public.site_page_views v
        where v.hour >= v_since and v.referrer_host <> '' and (v_all or v.country = v_country)
        group by 1
        order by 2 desc, 1
        limit 10
      ) r), '[]'::jsonb),
    'clicks', coalesce((
      select jsonb_agg(jsonb_build_array(k.product_id, k.brand, k.retailer_id, k.clicks) order by k.clicks desc)
      from (
        select c.product_id, max(c.brand) as brand, c.retailer_id, sum(c.clicks)::bigint as clicks
        from public.site_shop_clicks c
        where c.hour >= v_since and (v_all or c.country = v_country)
        group by c.product_id, c.retailer_id
        order by 4 desc
        limit 2000
      ) k), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.site_stats(timestamptz, text, text) from public, anon;
grant execute on function public.site_stats(timestamptz, text, text) to authenticated;

-- ── 5. Hidden and removed brands and shops ──────────────────────────────────
-- Last on purpose: the deploy and the page take this table's existence as
-- the sign that everything above is in place, and start counting.
--
-- kind     'brand' or 'retailer'.
-- key      a brand's address word (/brands/<key>), or a shop's registry id.
-- state    'hidden': off the site, kept in the data, back the moment it is
--          shown again. 'removed': hidden, and also left out of the build;
--          a removed shop is no longer crawled either.
-- name     what the dashboard calls it, for a removed brand no longer in the
--          build. Never read by the site.
--
-- A row exists only while something is hidden or removed: Show Again
-- deletes it. src/config/retailers.ts stays the code's own list of shops;
-- this is a layer on top of it, read by the deploy, the crawl and the page.
create table if not exists public.site_overrides (
  kind text not null,
  key text not null,
  state text not null,
  name text not null default '',
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);

alter table public.site_overrides drop constraint if exists site_overrides_shape;
alter table public.site_overrides
  add constraint site_overrides_shape check (
    kind in ('brand', 'retailer')
    and key ~ '^[a-z0-9-]{1,120}$'
    and state in ('hidden', 'removed')
    and char_length(name) <= 120
  );

alter table public.site_overrides enable row level security;
revoke all on table public.site_overrides from public, anon, authenticated;
grant select on table public.site_overrides to anon, authenticated;
grant insert, update, delete on table public.site_overrides to authenticated;
grant select, insert, update, delete on table public.site_overrides to service_role;

drop policy if exists "anyone reads overrides" on public.site_overrides;
create policy "anyone reads overrides"
  on public.site_overrides for select
  to anon, authenticated
  using (true);

drop policy if exists "owner adds overrides" on public.site_overrides;
create policy "owner adds overrides"
  on public.site_overrides for insert
  to authenticated
  with check ((select public.is_site_admin()));

drop policy if exists "owner changes overrides" on public.site_overrides;
create policy "owner changes overrides"
  on public.site_overrides for update
  to authenticated
  using ((select public.is_site_admin()))
  with check ((select public.is_site_admin()));

drop policy if exists "owner deletes overrides" on public.site_overrides;
create policy "owner deletes overrides"
  on public.site_overrides for delete
  to authenticated
  using ((select public.is_site_admin()));
