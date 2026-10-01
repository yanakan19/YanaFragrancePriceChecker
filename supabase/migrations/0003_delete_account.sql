-- Lets a signed-in reader delete their own account from the account page
-- (demo/auth.ts deleteOwnAccount). Run in the Supabase dashboard's SQL Editor
-- after 0001 and 0002. Safe to run twice.
--
-- `security definer` is what allows deleting from auth.users, which the
-- client's own role cannot touch. The function takes no arguments and only
-- ever deletes `auth.uid()`, the caller's own id, so nobody can delete anyone
-- else's account with it. Profiles and wishlists cascade from auth.users
-- (`on delete cascade` in 0001 and 0002), so they go with it.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
