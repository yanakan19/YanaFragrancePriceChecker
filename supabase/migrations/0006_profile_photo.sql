-- Profile photos (owner request, 4 October 2026). Run SIXTH, after 0001 to
-- 0005, in the Supabase dashboard's SQL Editor. Safe to run twice: every
-- statement is idempotent, the same rule as the files before it. See
-- docs/OWNER-STEPS.md ("Profile photos").
--
-- What this adds:
--
--   profiles.avatar_path   where the reader's photo is stored, or null when
--                          there is none. 0001 already declares the column
--                          for a fresh project; `add column if not exists`
--                          covers a profiles table created before it did.
--   storage bucket avatars a PRIVATE bucket holding at most one small image
--                          per reader, at `<user id>/avatar`.
--   four storage policies  a signed in reader may read, upload, replace and
--                          delete that one object of their own, and nothing
--                          else in the bucket.
--   profile_photos_enabled() answers true, so the site knows this has run.
--
-- ── Why a private bucket, not public read ───────────────────────────────────
-- The photo is only ever shown to the reader themselves: in the round account
-- button and at the top of their own profile page. Nobody else needs to fetch
-- it, so nobody else can. A public bucket would make the file readable by
-- anyone holding its address, for as long as it exists, and the address is
-- built from the user id, which is not a secret (it travels inside every
-- session token). With a private bucket the read policy below is the only
-- way in, and it only matches the caller's own file. The site fetches the
-- photo with the reader's own session (demo/profilePhoto.ts) and shows it
-- from a local blob address, so not even a short lived signed URL is handed
-- out.
--
-- ── What the client does before upload ──────────────────────────────────────
-- The browser crops the picture to a square of at most 256px and encodes it
-- afresh as WebP or JPEG through a canvas, which drops all metadata (camera,
-- time, GPS). The bucket's own limits below are the server side ceiling for
-- anything that skips the site and talks to the API directly.

-- ── 1. The path on the profile ──────────────────────────────────────────────
alter table public.profiles
  add column if not exists avatar_path text;

-- The only value a reader may store is their own object's path. The update
-- policy from 0001 already limits a reader to their own row; this limits what
-- that row may point at. `not valid` so a re-run never fails on a row written
-- before this existed; every insert and update from now on is still checked.
alter table public.profiles drop constraint if exists profiles_avatar_path_own;
alter table public.profiles
  add constraint profiles_avatar_path_own
  check (avatar_path is null or avatar_path = id::text || '/avatar') not valid;

-- ── 2. The bucket ───────────────────────────────────────────────────────────
-- Private (public = false). 200 KB per file, double the 100 KB the browser
-- aims for, and only the two formats the browser writes. Re-running updates
-- the limits in place rather than failing on the existing bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 204800, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 3. Who may touch which object ───────────────────────────────────────────
-- Supabase keeps row level security switched on for storage.objects; these
-- policies are what open one object per reader. Every one is scoped `to
-- authenticated`, so a signed out visitor matches none and is denied by
-- default, and every one names the exact object `<caller's id>/avatar`, so a
-- reader can neither read nor write anyone else's photo, nor park any other
-- file in the bucket.
--
-- Upload with replace (upsert) needs select, insert and update together:
-- storage checks the insert policy for a new file and the update policy when
-- one is already there.
drop policy if exists "read own avatar" on storage.objects;
create policy "read own avatar"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

drop policy if exists "replace own avatar" on storage.objects;
create policy "replace own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar')
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar');

-- ── 4. Deleting an account ──────────────────────────────────────────────────
-- Stored files do not cascade from auth.users, and Supabase refuses a direct
-- DELETE on storage.objects from SQL ("use the Storage API instead"). So
-- Delete Account in the site removes the photo through the Storage API with
-- the reader's own session first (the delete policy above), and only then
-- calls delete_own_account() from 0003. If the photo cannot be removed, the
-- account is not deleted and the reader is asked to try again.
--
-- To check for any file left without an account (there should be none):
--   select o.name from storage.objects o
--   where o.bucket_id = 'avatars'
--     and not exists (select 1 from auth.users u where u.id::text = split_part(o.name, '/', 1));
-- Remove any it lists from Storage > avatars in the dashboard.

-- ── 5. The switch the site looks for ────────────────────────────────────────
-- Last on purpose. The site asks this before it offers a photo control, and
-- until it exists the profile page says photos are not available yet (a
-- missing function is a clear "not found", the same signal 0003's
-- delete_own_account gives). Created after the bucket and every policy above,
-- so it only exists once all of them do. It reads nothing and returns true.
create or replace function public.profile_photos_enabled()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.profile_photos_enabled() from public, anon;
grant execute on function public.profile_photos_enabled() to authenticated;
