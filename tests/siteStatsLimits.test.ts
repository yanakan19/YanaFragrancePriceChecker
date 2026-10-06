import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Migration 0008 caps and folds the developer dashboard's counts
// (docs/TRACKING-AND-STORAGE-STRATEGY.md). It was run against Postgres
// (PGlite) when written: the cap folds new rows into '/other' without losing
// a count, the fold keeps every day, month and year total and is idempotent,
// and a signed in account that is not the owner is refused. These checks pin
// what that run proved, in text, since the test suite has no database.

const dir = new URL('../supabase/migrations/', import.meta.url);
const strip = (sql: string) => sql.replace(/--.*$/gm, '');

describe('every migration', () => {
  it('uses no pattern repetition count above 255, which Postgres refuses at run time', () => {
    // 0007's first count_shop_click used {1,256}: every shop click raised
    // "invalid repetition count(s)" and nothing was counted.
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      const code = strip(readFileSync(new URL(f, dir), 'utf8'));
      for (const m of code.matchAll(/\{(\d+)(?:,(\d+))?\}/g)) {
        const top = Number(m[2] ?? m[1]);
        expect(top, `${f}: ${m[0]}`).toBeLessThanOrEqual(255);
      }
    }
  });
});

describe('migration 0008', () => {
  const sql = readFileSync(new URL('0008_site_stats_limits.sql', dir), 'utf8');
  const code = strip(sql);

  it('is safe to run twice', () => {
    expect(code).not.toMatch(/create (table|function|index) (?!if not exists|or replace|temporary)/i);
    expect(code).toMatch(/create extension if not exists pg_cron/);
  });

  it('keeps the two counting functions callable with the public key, with the same signatures', () => {
    expect(code).toMatch(/create or replace function public\.count_page_view\(p_page text, p_entry boolean default false, p_referrer text default ''\)/);
    expect(code).toMatch(/create or replace function public\.count_shop_click\(p_product text, p_brand text, p_retailer text\)/);
    expect(code).toMatch(/grant execute on function public\.count_page_view\(text, boolean, text\) to anon, authenticated;/);
    expect(code).toMatch(/grant execute on function public\.count_shop_click\(text, text, text\) to anon, authenticated;/);
  });

  it('folds rows past the hourly cap into a catch all row instead of dropping the count', () => {
    expect(code).toMatch(/v_page := '\/other';/);
    expect(code).toMatch(/v_product := 'other';/);
    expect(code.match(/limit public\.site_stats_hour_cap\(\)/g)).toHaveLength(2);
  });

  it('lets only the owner or the database itself run the fold', () => {
    expect(code).toMatch(/revoke all on function public\.site_stats_compact\(\) from public, anon;/);
    expect(code).toMatch(/if \(select auth\.uid\(\)\) is not null and not public\.is_site_admin\(\) then\s+raise exception/);
  });

  it('pins search_path on every function it defines', () => {
    const fns = code.split(/create or replace function /).slice(1);
    expect(fns.length).toBe(4);
    for (const f of fns) expect(f, f.slice(0, 60)).toMatch(/set search_path = ''/);
  });

  it('keeps hourly rows for three London days, so the Hour view is untouched', () => {
    expect(code).toMatch(/v_london_today - interval '3 days'/);
    expect(code).toMatch(/interval '13 months'/);
  });
});
