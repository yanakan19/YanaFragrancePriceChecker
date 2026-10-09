// scripts/deploy-decision.mjs: the deploy workflow publishes the site only
// when the built page could change (owner decision, 2026-10-06).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canChangePage, COUNTS_ANYWAY, decide, NOT_PAGE_FOLDERS, PAGE_DATA_FOLDERS, overridesFingerprint, readLiveState, readOverrides, supabasePublic,
} from '../scripts/deploy-decision.mjs';
import { OVERRIDES_ENDPOINT } from '../scripts/siteBuild.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../demo/supabase.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';

const workflow = readFileSync(join(REPO_ROOT, '.github/workflows/deploy-pages.yml'), 'utf8');
const TIP = 'b'.repeat(40);
const LIVE = 'a'.repeat(40);
const FP = overridesFingerprint([]);

describe('which paths can change the page', () => {
  it('is the push filter of deploy-pages.yml, folder for folder', () => {
    const filter = /\n {2}push:\n(?: {4}.*\n)*? {4}paths:\n((?: {6}- .*\n)+)/.exec(workflow)![1]!
      .split('\n').map((l) => l.trim().replace(/^- '?|'$/g, '')).filter(Boolean);
    expect(filter[0]).toBe('**');
    const excluded = filter.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
    const included = filter.slice(1).filter((p) => !p.startsWith('!'));
    expect(excluded.sort()).toEqual([...NOT_PAGE_FOLDERS.map((f) => `${f}**`), '**/*.md'].sort());
    expect(included).toEqual([...COUNTS_ANYWAY, ...PAGE_DATA_FOLDERS.map((f) => `${f}**`)]);
  });

  it('counts the US and Indian crawls\' data, which the region pages are built from, and not the rest of data/', () => {
    expect(PAGE_DATA_FOLDERS).toEqual(['data/regions/']);
    for (const p of ['data/regions/us/catalogue/perfumania.json', 'data/regions/in/price-history.json', 'data/regions/us/product-slugs.json']) {
      expect(canChangePage(p), p).toBe(true);
    }
    expect(canChangePage('data/regions.md')).toBe(false);
    expect(canChangePage('data/catalogue/escentual.json')).toBe(false);
  });

  it('counts the generated modules, the source and the build, and not snapshots, reports or posts', () => {
    for (const p of ['demo/catalogue.generated.ts', 'demo/priceHistory.generated.ts', 'demo/fragranceLinks.generated.ts',
      'src/config/retailers.ts', 'scripts/build-demo.ts', 'package-lock.json', 'demo/template.html',
      '.github/workflows/deploy-pages.yml']) {
      expect(canChangePage(p), p).toBe(true);
    }
    for (const p of ['data/catalogue/escentual.json', 'data/price-history-checkpoint.json', 'data/harvest-report.json',
      'social/posts/2026-10-06/post.png', 'docs/OWNER-STEPS.md', 'README.md', 'tests/x.test.ts',
      '.github/workflows/catalogue-daily.yml', 'supabase/migrations/0008_site_stats_limits.sql']) {
      expect(canChangePage(p), p).toBe(false);
    }
  });
});

describe('the decision', () => {
  const live = { commit: LIVE, overrides: FP };
  const paths = (list: string[] | null) => () => list;

  it('always deploys a push or a run by hand', () => {
    for (const event of ['push', 'workflow_dispatch']) {
      expect(decide({ event, tip: LIVE, overrides: FP, live, changedPaths: paths([]) }).deploy).toBe(true);
    }
  });

  it('deploys after a region crawl that committed region data, and skips one that committed nothing', () => {
    const region = paths(['data/regions/us/catalogue/perfumania.json', 'data/regions/us/report.json']);
    const verdict = decide({ event: 'workflow_run', tip: TIP, overrides: FP, live, changedPaths: region });
    expect(verdict.deploy).toBe(true);
    expect(verdict.reason).toContain('data/regions/us/catalogue/perfumania.json');
    expect(decide({ event: 'workflow_run', tip: LIVE, overrides: FP, live, changedPaths: paths([]) }).deploy).toBe(false);
  });

  it('skips a crawl run that committed nothing, or only snapshots and reports', () => {
    expect(decide({ event: 'workflow_run', tip: LIVE, overrides: FP, live, changedPaths: paths([]) }).deploy).toBe(false);
    const onlyData = paths(['data/catalogue/escentual.json', 'data/harvest-report.json', 'data/harvest-cursor.json']);
    expect(decide({ event: 'workflow_run', tip: TIP, overrides: FP, live, changedPaths: onlyData }).deploy).toBe(false);
    expect(decide({ event: 'schedule', tip: TIP, overrides: FP, live, changedPaths: onlyData }).deploy).toBe(false);
  });

  it('deploys when a rebuild or a source change landed since the live commit', () => {
    const rebuilt = paths(['data/catalogue/escentual.json', 'demo/catalogue.generated.ts']);
    const verdict = decide({ event: 'workflow_run', tip: TIP, overrides: FP, live, changedPaths: rebuilt });
    expect(verdict.deploy).toBe(true);
    expect(verdict.reason).toContain('demo/catalogue.generated.ts');
  });

  it('deploys when the hidden and removed list changed, but not on a database that did not answer', () => {
    const removed = overridesFingerprint([{ kind: 'brand', key: 'dior', state: 'removed' }]);
    expect(decide({ event: 'schedule', tip: LIVE, overrides: removed, live, changedPaths: paths([]) }).deploy).toBe(true);
    expect(decide({ event: 'schedule', tip: LIVE, overrides: 'unreachable', live, changedPaths: paths([]) }).deploy).toBe(false);
    // A live build made while the database was down deploys again once it answers.
    const downLive = { commit: LIVE, overrides: 'unreachable' };
    expect(decide({ event: 'schedule', tip: LIVE, overrides: FP, live: downLive, changedPaths: paths([]) }).deploy).toBe(true);
  });

  it('deploys when the live record is missing or its commit is not in the history', () => {
    expect(decide({ event: 'workflow_run', tip: TIP, overrides: FP, live: null, changedPaths: paths([]) }).deploy).toBe(true);
    expect(decide({ event: 'workflow_run', tip: TIP, overrides: FP, live, changedPaths: paths(null) }).deploy).toBe(true);
  });
});

describe('the fingerprint and the fetches', () => {
  it('does not depend on the order of the rows', () => {
    const a = { kind: 'brand', key: 'dior', state: 'hidden', name: 'Dior' };
    const b = { kind: 'retailer', key: 'boots', state: 'removed' };
    expect(overridesFingerprint([a, b])).toBe(overridesFingerprint([b, a]));
    expect(overridesFingerprint([a])).not.toBe(overridesFingerprint([{ ...a, state: 'removed' }]));
    expect(overridesFingerprint(null)).toBe('unreachable');
  });

  it('reads the same public address and key as the page', () => {
    expect(supabasePublic()).toEqual({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
    expect(OVERRIDES_ENDPOINT).toBe(`${SUPABASE_URL}/rest/v1/site_overrides?select=kind,key,state,name`);
  });

  it('tells a missing table from a database that did not answer', async () => {
    const answer = (status: number, body: unknown = []) => async () => ({ ok: status === 200, status, json: async () => body });
    expect(await readOverrides(answer(404))).toBe('missing');
    expect(await readOverrides(answer(500))).toBe('unreachable');
    expect(await readOverrides(async () => { throw new Error('offline'); })).toBe('unreachable');
    expect(await readOverrides(answer(200, []))).toBe(FP);
  });

  it('reads the live record past the CDN cache and refuses a malformed one', async () => {
    let asked = '';
    const record = (body: unknown) => async (url: string) => { asked = url; return { ok: true, status: 200, json: async () => body }; };
    expect(await readLiveState(record({ commit: LIVE, overrides: FP }), '42')).toEqual({ commit: LIVE, overrides: FP });
    expect(asked).toMatch(/^https:\/\/[^/]+\/build-state\.json\?check=42$/);
    expect(await readLiveState(record({ commit: 'main' }), '1')).toBeNull();
    expect(await readLiveState(async () => ({ ok: false, status: 404, json: async () => null }), '1')).toBeNull();
  });
});

describe('deploy-pages.yml', () => {
  it('runs the deploy job only when the decide job says so, and records what it built', () => {
    expect(workflow).toContain('run: node scripts/deploy-decision.mjs decide');
    expect(workflow).toMatch(/\n {2}deploy:\n {4}needs: decide\n {4}if: needs\.decide\.outputs\.deploy == 'true'\n/);
    const record = workflow.indexOf('node scripts/deploy-decision.mjs record demo/build-state.json');
    expect(record).toBeGreaterThan(workflow.indexOf('scripts/check-demo-freshness.ts'));
    expect(record).toBeLessThan(workflow.indexOf('actions/upload-pages-artifact'));
  });

  it('checks on a schedule, so a dashboard change reaches the build within about half an hour', () => {
    expect(workflow).toMatch(/\n {2}schedule:\n {4}- cron: '7,37 \* \* \* \*'\n/);
  });
});
