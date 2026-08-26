-- Proof that the two migrations did what they claim. Not a migration: this
-- creates and changes nothing, it only reads the catalogue. Paste the whole
-- file into the Supabase dashboard's SQL Editor after running
-- 0001_profiles.sql and 0002_wishlists.sql, and check the four results
-- against the expected output written above each query.
--
-- Worth running rather than assuming, because the failure mode here is
-- silent. A table with Row Level Security switched off does not error and
-- does not look different in the dashboard's table editor — it simply
-- answers every request that arrives with the anon key, and that key is
-- printed in a JavaScript bundle anyone can open. "It works" and "it is
-- wide open" produce the same screen.

-- ── 1. Every table in `public` must have RLS enabled ────────────────────────
-- Expect exactly two rows, `profiles` and `wishlists`, both with
-- rls_enabled = true. A `false` anywhere in this result is a live data leak,
-- not a warning: fix it before going further.
-- A third table appearing here is not necessarily wrong, but it is something
-- neither migration created, and it needs the same check.
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  c.relforcerowsecurity    as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- ── 2. The policies, verb by verb ───────────────────────────────────────────
-- Expect six rows:
--   profiles   SELECT  "read own profile"
--   profiles   UPDATE  "update own profile"
--   wishlists  SELECT  "read own wishlist"
--   wishlists  INSERT  "insert own wishlist rows"
--   wishlists  UPDATE  "update own wishlist rows"
--   wishlists  DELETE  "delete own wishlist rows"
--
-- `roles` should read {authenticated} on every row — never {public}, which
-- would mean the policy is also offered to the signed-out `anon` role.
-- Every `qual` and `with_check` should mention auth.uid(). A policy whose
-- qual is just `true` grants that verb to every signed-in reader on every
-- row, which is one user reading another's list.
--
-- profiles having no INSERT or DELETE row is correct and deliberate: RLS
-- denies by default, inserts come from the on_auth_user_created trigger, and
-- deletes come from the cascade off auth.users.
select
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- ── 3. The signup trigger exists and is attached to auth.users ──────────────
-- Expect one row: on_auth_user_created / handle_new_user, enabled = 'O'.
-- No row means signups will succeed in auth.users and never get a profile.
select
  t.tgname       as trigger_name,
  p.proname      as function_name,
  p.prosecdef    as is_security_definer,
  t.tgenabled    as enabled
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgname = 'on_auth_user_created'
  and not t.tgisinternal;

-- ── 4. Nobody reachable with the anon key may execute the trigger function ──
-- Expect all three to be false. `true` anywhere means a role that arrives
-- holding a key printed in a public bundle can call a SECURITY DEFINER
-- function; re-run the revoke statements at the end of 0001_profiles.sql.
select
  has_function_privilege('anon',          'public.handle_new_user()', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') as authenticated_can_execute,
  has_function_privilege('public',        'public.handle_new_user()', 'execute') as public_can_execute;
