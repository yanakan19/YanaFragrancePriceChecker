-- Keeps the developer dashboard's counts small and safe from flooding. Run
-- EIGHTH, after 0007_site_stats.sql, in the Supabase dashboard's SQL Editor.
-- Safe to run twice: every statement is idempotent, the same rule as the
-- files before it. Optional: the site and the dashboard work the same without
-- it, and nothing a visitor sees changes. See docs/OWNER-STEPS.md
-- ("8e. Keep the counts small") and docs/TRACKING-AND-STORAGE-STRATEGY.md.
--
-- What this changes:
--
--   count_page_view(...)    the same as in 0007, plus a cap: an hour holds at
--   count_shop_click(...)   most 2,000 rows per table. Once an hour has that
--                           many, a page, country and linking site not yet
--                           seen that hour is added to the '/other' row (a
--                           click to the 'other' product) instead of a new
--                           row, so every view and click is still counted
--                           and the totals stay right; only the detail of
--                           the extra rows is folded. Without it anyone
--                           holding the public key could add a new row per
--                           call with made up page names and fill the free
--                           plan's 500 MB database, which would stop sign in,
--                           wishlists and alerts too.
--   site_stats_compact()    folds old hourly rows: rows older than three
--                           London days become one row per London day, and
--                           rows older than 13 months one row per London
--                           month, per page, country and linking site (per
--                           product, shop and country for clicks). Every
--                           bar the dashboard draws is unchanged: its Hour
--                           view covers the last 24 hours, Day 30 days, Week
--                           12 weeks, Month 12 months and Year 5 years, and
--                           each only ever needs the bucket a row falls in.
--                           Owner only, or the database's own scheduler.
--   a daily schedule        if the pg_cron extension can be switched on, the
--                           fold runs at 03:23 UTC every day. If it cannot,
--                           the script says so and carries on; run
--                           `select public.site_stats_compact();` by hand
--                           now and then instead.
--
-- Measured (PGlite, Postgres 17, the 0007 tables, product addresses from
-- data/product-slugs.json): a site_page_views row costs about 196 bytes with
-- its primary key index. So the cap bounds a flood at 2,000 rows an hour per
-- table, about 9.4 MB a day per table, instead of no bound at all: weeks to
-- fill the free plan rather than minutes, with every count still in place.
--
-- Undo: run 0007_site_stats.sql again (it puts back the two counting
-- functions without the cap), then
--   select cron.unschedule('site-stats-compact');
--   drop function if exists public.site_stats_compact();

-- ── 1. The cap ──────────────────────────────────────────────────────────────
-- Rows an hour may hold per table before new combinations are folded into
-- the catch all row. Real traffic reaches it only at tens of thousands of
-- views a day, and then only the long tail of pages is folded.
create or replace function public.site_stats_hour_cap()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2000 $$;

revoke all on function public.site_stats_hour_cap() from public, anon, authenticated;

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
  v_hour timestamptz := date_trunc('hour', now());
  v_country text := public.request_country();
begin
  if v_page !~ '^/[A-Za-z0-9_./-]{0,199}$' then
    v_page := '/other';
  end if;
  if not v_entry or v_ref !~ '^[a-z0-9.-]{1,100}$' then
    v_ref := '';
  end if;
  -- The cap: counting stops at the cap (the subquery's limit), so the check
  -- reads at most that many index entries however full the hour is.
  if not exists (
       select 1 from public.site_page_views
       where hour = v_hour and page = v_page and country = v_country and referrer_host = v_ref)
     and (select count(*) from (
       select 1 from public.site_page_views where hour = v_hour limit public.site_stats_hour_cap()) s)
       >= public.site_stats_hour_cap() then
    v_page := '/other';
    v_ref := '';
  end if;
  insert into public.site_page_views as v (hour, page, country, referrer_host, views, visits)
  values (v_hour, v_page, v_country, v_ref, 1, case when v_entry then 1 else 0 end)
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
  v_hour timestamptz := date_trunc('hour', now());
  v_country text := public.request_country();
begin
  -- Length apart from the pattern: Postgres refuses a repetition count above
  -- 255, which is what broke 0007's first version of this function.
  if v_product !~ '^[A-Za-z0-9_.:-]+$' or char_length(v_product) > 256
     or v_retailer !~ '^[a-z0-9-]{1,64}$' then
    return;
  end if;
  if not exists (
       select 1 from public.site_shop_clicks
       where hour = v_hour and product_id = v_product and retailer_id = v_retailer and country = v_country)
     and (select count(*) from (
       select 1 from public.site_shop_clicks where hour = v_hour limit public.site_stats_hour_cap()) s)
       >= public.site_stats_hour_cap() then
    v_product := 'other';
    v_brand := '';
  end if;
  insert into public.site_shop_clicks as c (hour, product_id, brand, retailer_id, country, clicks)
  values (v_hour, v_product, v_brand, v_retailer, v_country, 1)
  on conflict (hour, product_id, retailer_id, country)
  do update set clicks = c.clicks + 1;
end;
$$;

revoke all on function public.count_shop_click(text, text, text) from public;
grant execute on function public.count_shop_click(text, text, text) to anon, authenticated;

-- ── 2. The fold ─────────────────────────────────────────────────────────────
-- Each pass moves every row older than a London day (or month) boundary to
-- that day's (month's) first instant, summing rows that land on the same
-- key. Rows are taken out and put back in one transaction, so a fold that
-- fails changes nothing, and running it twice gives the same result as once.
-- Returns how many rows the two tables hold afterwards.
create or replace function public.site_stats_compact()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_london_today timestamp := date_trunc('day', now() at time zone 'Europe/London');
  -- Rows before this become one row per London day.
  v_day_cutoff timestamptz := (v_london_today - interval '3 days') at time zone 'Europe/London';
  -- Rows before this become one row per London month.
  v_month_cutoff timestamptz := (date_trunc('month', v_london_today) - interval '13 months') at time zone 'Europe/London';
  v_before jsonb;
begin
  -- The owner from the dashboard's account, or the database itself (the
  -- scheduler and the SQL Editor run with no signed in account). Inside a
  -- security definer function current_user is this function's owner, so the
  -- check asks who is signed in instead.
  if (select auth.uid()) is not null and not public.is_site_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  v_before := jsonb_build_object(
    'page_view_rows_before', (select count(*) from public.site_page_views),
    'shop_click_rows_before', (select count(*) from public.site_shop_clicks));

  -- Months first, so a row is never folded to a day and then again.
  create temporary table pg_temp.site_stats_fold_views on commit drop as
    select (date_trunc('month', v.hour at time zone 'Europe/London') at time zone 'Europe/London') as hour,
           v.page, v.country, v.referrer_host, sum(v.views)::integer as views, sum(v.visits)::integer as visits
    from public.site_page_views v
    where v.hour < v_month_cutoff
    group by 1, 2, 3, 4;
  delete from public.site_page_views where hour < v_month_cutoff;
  insert into public.site_page_views (hour, page, country, referrer_host, views, visits)
    select hour, page, country, referrer_host, views, visits from pg_temp.site_stats_fold_views;
  drop table pg_temp.site_stats_fold_views;

  create temporary table pg_temp.site_stats_fold_views on commit drop as
    select (date_trunc('day', v.hour at time zone 'Europe/London') at time zone 'Europe/London') as hour,
           v.page, v.country, v.referrer_host, sum(v.views)::integer as views, sum(v.visits)::integer as visits
    from public.site_page_views v
    where v.hour >= v_month_cutoff and v.hour < v_day_cutoff
    group by 1, 2, 3, 4;
  delete from public.site_page_views where hour >= v_month_cutoff and hour < v_day_cutoff;
  insert into public.site_page_views (hour, page, country, referrer_host, views, visits)
    select hour, page, country, referrer_host, views, visits from pg_temp.site_stats_fold_views;
  drop table pg_temp.site_stats_fold_views;

  create temporary table pg_temp.site_stats_fold_clicks on commit drop as
    select (date_trunc('month', c.hour at time zone 'Europe/London') at time zone 'Europe/London') as hour,
           c.product_id, max(c.brand) as brand, c.retailer_id, c.country, sum(c.clicks)::integer as clicks
    from public.site_shop_clicks c
    where c.hour < v_month_cutoff
    group by 1, 2, 4, 5;
  delete from public.site_shop_clicks where hour < v_month_cutoff;
  insert into public.site_shop_clicks (hour, product_id, brand, retailer_id, country, clicks)
    select hour, product_id, brand, retailer_id, country, clicks from pg_temp.site_stats_fold_clicks;
  drop table pg_temp.site_stats_fold_clicks;

  create temporary table pg_temp.site_stats_fold_clicks on commit drop as
    select (date_trunc('day', c.hour at time zone 'Europe/London') at time zone 'Europe/London') as hour,
           c.product_id, max(c.brand) as brand, c.retailer_id, c.country, sum(c.clicks)::integer as clicks
    from public.site_shop_clicks c
    where c.hour >= v_month_cutoff and c.hour < v_day_cutoff
    group by 1, 2, 4, 5;
  delete from public.site_shop_clicks where hour >= v_month_cutoff and hour < v_day_cutoff;
  insert into public.site_shop_clicks (hour, product_id, brand, retailer_id, country, clicks)
    select hour, product_id, brand, retailer_id, country, clicks from pg_temp.site_stats_fold_clicks;
  drop table pg_temp.site_stats_fold_clicks;

  return v_before || jsonb_build_object(
    'page_view_rows_after', (select count(*) from public.site_page_views),
    'shop_click_rows_after', (select count(*) from public.site_shop_clicks));
end;
$$;

revoke all on function public.site_stats_compact() from public, anon;
grant execute on function public.site_stats_compact() to authenticated;

-- ── 3. The daily schedule, when the database allows it ──────────────────────
-- pg_cron is offered on every Supabase plan. If it cannot be switched on
-- here, nothing else in this file depends on it.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron is not available (%); run select public.site_stats_compact(); by hand now and then.', sqlerrm;
    return;
  end;
  -- Scheduling under an existing name replaces that job, so a second run
  -- leaves one job, not two.
  perform cron.schedule('site-stats-compact', '23 3 * * *', 'select public.site_stats_compact()');
exception when others then
  raise notice 'The daily fold was not scheduled (%); run select public.site_stats_compact(); by hand now and then.', sqlerrm;
end;
$$;
