-- The visitor's chosen country on their profile (owner request, 9 October
-- 2026; docs/INTERNATIONAL-PLAN.md, "Welcome: Select your country"). Run
-- NINTH, after 0001 to 0008, in the Supabase dashboard's SQL Editor. Safe to
-- run twice: every statement is idempotent, the same rule as the files before
-- it. Optional until the US beta: the site reads and writes this column only
-- while the welcome pop-up is switched on (REGION_WELCOME_ON in
-- src/config/regions.ts), and it is off. Nothing a visitor sees changes.
--
-- What this adds:
--
--   profiles.region   'GB', 'US' or 'IN': the country a signed in reader
--                     chose in the "Select your country" pop-up or the
--                     country menu, so the choice follows them to another
--                     device. Null (the default, and every existing row)
--                     means no choice yet; the pop-up then asks once.
--
-- Who can read and write it: nothing new. The policies from 0001 already let
-- a signed in reader read and update their own profile row and nobody
-- else's; the check below limits what that row may hold. demo/regionProfile.ts
-- reads and writes it only when signed in.
--
-- Nothing is backfilled and nothing is deleted. Undo, if ever needed:
--   alter table public.profiles drop constraint if exists profiles_region_known;
--   alter table public.profiles drop column if exists region;

-- ── 1. The column ───────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists region text;

-- ── 2. Only the three country codes the site knows ──────────────────────────
-- The same list as REGION_CONFIGS in src/config/regions.ts. `not valid` so a
-- re-run never fails on a row written before this existed; every insert and
-- update from now on is still checked. Dropped and added again so a re-run
-- after the list grows picks up the new list.
alter table public.profiles drop constraint if exists profiles_region_known;
alter table public.profiles
  add constraint profiles_region_known
  check (region is null or region in ('GB', 'US', 'IN')) not valid;

comment on column public.profiles.region is
  'Country chosen in the Select your country pop-up: GB, US or IN. Null until chosen.';
