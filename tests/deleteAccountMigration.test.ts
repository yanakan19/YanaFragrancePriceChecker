import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The function runs with elevated rights (security definer), so the guard
// rails are worth pinning: it may only ever delete the caller's own account,
// and only a signed-in caller may run it.
const sql = readFileSync(new URL('../supabase/migrations/0003_delete_account.sql', import.meta.url), 'utf8');

describe('0003_delete_account.sql', () => {
  it('deletes only the caller, by auth.uid()', () => {
    expect(sql).toMatch(/delete from auth\.users where id = auth\.uid\(\);/);
    expect(sql).toMatch(/create or replace function public\.delete_own_account\(\)\s/);
  });

  it('pins search_path and refuses anonymous callers', () => {
    expect(sql).toMatch(/set search_path = ''/);
    expect(sql).toMatch(/revoke all on function public\.delete_own_account\(\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.delete_own_account\(\) to authenticated;/);
  });
});
