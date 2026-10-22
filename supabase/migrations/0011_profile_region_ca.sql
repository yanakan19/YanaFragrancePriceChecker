-- Canada added to the countries a profile may hold (docs/INTERNATIONAL-PLAN.md,
-- "Canada", 22 October 2026). Run ELEVENTH, after 0001 to 0010, in the Supabase
-- dashboard's SQL Editor. Safe to run twice: the constraint is dropped and
-- added again. Until it is run, a signed in reader who chooses Canada keeps
-- the choice in their browser only (the page copes with a refused save); after
-- it, the choice follows them to another device like the UK, US and India.
--
-- What this changes: the list of codes in profiles_region_known, from
-- ('GB', 'US', 'IN') to ('GB', 'US', 'IN', 'CA'), the same list as
-- REGION_CONFIGS in src/config/regions.ts. `not valid` so a re-run never fails
-- on a row written earlier. Nothing is backfilled, deleted or granted.
--
-- Undo, if ever needed: run 0009_profile_region.sql again (it restores the
-- three code list), after setting any 'CA' rows back to null:
--   update public.profiles set region = null where region = 'CA';

alter table public.profiles drop constraint if exists profiles_region_known;
alter table public.profiles
  add constraint profiles_region_known
  check (region is null or region in ('GB', 'US', 'IN', 'CA')) not valid;

comment on column public.profiles.region is
  'Country chosen in the Select your country pop-up: GB, US, IN or CA. Null until chosen.';
