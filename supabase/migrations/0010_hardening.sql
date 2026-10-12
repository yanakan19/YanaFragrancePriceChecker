-- Hardening from the Supabase advisors, 12 October 2026 (run through the
-- Supabase connector; also recorded here so the repository matches the live
-- project). Safe to run twice: every statement is idempotent. Nothing a
-- visitor sees changes, and no data is touched.
--
-- 1. handle_new_user() is the trigger that creates a profile row when an
--    account is created (0001). It is SECURITY DEFINER and was callable by
--    anyone through /rest/v1/rpc/handle_new_user. Nobody needs to call it:
--    the trigger fires it. EXECUTE is taken away from public, anon and
--    authenticated and given to the auth role that fires the trigger.
-- 2. The row level security policies on profiles and wishlists compared
--    auth.uid() on every row. Written as (select auth.uid()) Postgres
--    evaluates it once per statement (Supabase advisor 0003). Same rule,
--    faster at scale.
--
-- Deliberately unchanged (reviewed): count_page_view and count_shop_click
-- are meant to be callable with the public key (the visit counter, with the
-- hour cap of 0008); site_stats and site_stats_compact check is_site_admin()
-- inside; is_site_admin() only answers for the caller.
--
-- Still the owner's, in the dashboard (no SQL for it): Authentication >
-- Sign In / Providers > Email > turn on "Prevent the use of leaked
-- passwords" (OWNER-STEPS section 10).

-- ── 1. The sign up trigger function is not an API ───────────────────────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ── 2. RLS policies evaluate auth.uid() once per statement ──────────────────
alter policy "read own profile" on public.profiles
  using ((select auth.uid()) = id);
alter policy "update own profile" on public.profiles
  using ((select auth.uid()) = id);

alter policy "read own wishlist" on public.wishlists
  using ((select auth.uid()) = user_id);
alter policy "insert own wishlist rows" on public.wishlists
  with check ((select auth.uid()) = user_id);
alter policy "update own wishlist rows" on public.wishlists
  using ((select auth.uid()) = user_id);
alter policy "delete own wishlist rows" on public.wishlists
  using ((select auth.uid()) = user_id);
