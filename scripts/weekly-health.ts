/**
 * Weekly health summary (.github/workflows/weekly-health.yml).
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo npx tsx scripts/weekly-health.ts
 *
 * Writes a Markdown summary to the job summary ($GITHUB_STEP_SUMMARY, else
 * stdout): which shops answered the last harvest, which hit their time budget
 * or errored, which still show listings over 48 hours old, how each workflow
 * did over the last 7 days (runs, failures, median / 90th percentile / longest
 * minutes), and whether the Supabase project answers a read. It commits
 * nothing and sends nothing: no email. docs/FUTUREPROOFING-PLAN.md C1, A6, E1.
 *
 * The Supabase read uses the project URL and the anon key that already ship
 * inside every page (demo/supabase.ts, protected by Row Level Security); it
 * reads one row of `profiles`, which an anonymous caller gets as an empty list.
 * No secret is used. Its purpose is to keep a free project from pausing.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Fetch = typeof fetch;

export interface ShopRow {
  retailerId: string;
  priced: number;
  errorCount: number;
  errors: string[];
}
export interface FreshnessRow {
  shown: number;
  over48h: number;
  answered: boolean;
}
export interface HarvestLite {
  finishedAt?: string;
  complete?: boolean;
  endedReason?: string;
  notReached?: string[];
  shops: ShopRow[];
  freshness: Record<string, FreshnessRow>;
}
export interface ShopSummary {
  total: number;
  answered: number;
  silent: { id: string; shown: number }[];
  timeBudget: string[];
  errored: { id: string; count: number; first: string }[];
  stale: { id: string; over48h: number; shown: number }[];
  notReached: string[];
}

const TIME_BUDGET = /exceeded this shop's time budget/i;

/** The rule: what the last harvest report says about each shop. Pure. */
export function summariseShops(report: HarvestLite): ShopSummary {
  const fresh = report.freshness ?? {};
  const ids = new Set<string>([...Object.keys(fresh), ...report.shops.map((s) => s.retailerId)]);
  const silent = [...ids]
    .filter((id) => fresh[id] && !fresh[id]!.answered)
    .map((id) => ({ id, shown: fresh[id]!.shown }))
    .sort((a, b) => b.shown - a.shown);
  const timeBudget = report.shops.filter((s) => s.errors.some((e) => TIME_BUDGET.test(e))).map((s) => s.retailerId);
  const errored = report.shops
    .filter((s) => s.errorCount > 0)
    .map((s) => ({ id: s.retailerId, count: s.errorCount, first: (s.errors.find((e) => !TIME_BUDGET.test(e)) ?? s.errors[0] ?? '').slice(0, 110) }))
    .sort((a, b) => b.count - a.count);
  const stale = [...ids]
    .filter((id) => fresh[id] && fresh[id]!.over48h > 0)
    .map((id) => ({ id, over48h: fresh[id]!.over48h, shown: fresh[id]!.shown }))
    .sort((a, b) => b.over48h - a.over48h);
  return {
    total: ids.size,
    answered: [...ids].filter((id) => fresh[id]?.answered).length,
    silent,
    timeBudget,
    errored,
    stale,
    notReached: report.notReached ?? [],
  };
}

export interface RunLite {
  workflow: string;
  status: string;
  conclusion: string | null;
  startedAt: string;
  updatedAt: string;
}
export interface WorkflowStat {
  workflow: string;
  runs: number;
  failed: number;
  cancelled: number;
  medianMin: number;
  p90Min: number;
  maxMin: number;
}

const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i]!;
}

/** Runs per workflow: counts and duration percentiles in minutes. Pure. */
export function summariseRuns(runs: RunLite[]): WorkflowStat[] {
  const by = new Map<string, RunLite[]>();
  for (const r of runs) {
    if (r.status !== 'completed') continue;
    by.set(r.workflow, [...(by.get(r.workflow) ?? []), r]);
  }
  const out: WorkflowStat[] = [];
  for (const [workflow, list] of by) {
    const mins = list
      .filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped')
      .map((r) => Math.max(0, (Date.parse(r.updatedAt) - Date.parse(r.startedAt)) / 60000))
      .sort((a, b) => a - b);
    out.push({
      workflow,
      runs: list.length,
      failed: list.filter((r) => r.conclusion && FAILED.has(r.conclusion)).length,
      cancelled: list.filter((r) => r.conclusion === 'cancelled').length,
      medianMin: Math.round(percentile(mins, 0.5)),
      p90Min: Math.round(percentile(mins, 0.9)),
      maxMin: Math.round(mins[mins.length - 1] ?? 0),
    });
  }
  return out.sort((a, b) => b.maxMin - a.maxMin);
}

export interface Ping {
  status: number | null;
}

/** One anonymous read of one row; any 2xx means the project is awake. */
export async function pingSupabase(url: string, key: string, doFetch: Fetch = fetch): Promise<Ping> {
  try {
    const res = await doFetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
    });
    return { status: res.status };
  } catch {
    return { status: null };
  }
}

/** The URL and anon key the pages ship with, read from the source text. */
export function supabaseConfigFrom(source: string): { url: string; key: string } | null {
  const url = /SUPABASE_URL: string = '([^']+)'/.exec(source)?.[1];
  const key = /SUPABASE_ANON_KEY: string =\s*'([^']+)'/.exec(source)?.[1];
  return url && key ? { url, key } : null;
}

const list = (xs: string[], max = 12) => (xs.length ? xs.slice(0, max).join(', ') + (xs.length > max ? `, and ${xs.length - max} more` : '') : 'none');

export function render(input: { shops: ShopSummary | null; harvest: HarvestLite | null; runs: WorkflowStat[] | null; ping: Ping | null; now: Date }): string {
  const L: string[] = [];
  L.push(`# Weekly health, ${input.now.toISOString().slice(0, 10)}`, '');
  L.push('Written to the job summary only. Nothing is committed or emailed. Plan: `docs/FUTUREPROOFING-PLAN.md`.', '');

  L.push('## Shops (last harvest report)', '');
  if (!input.shops || !input.harvest) {
    L.push('`data/harvest-report.json` could not be read.', '');
  } else {
    const s = input.shops;
    L.push(`Harvest finished ${input.harvest.finishedAt ?? 'unknown'}, ${input.harvest.complete ? 'complete' : 'NOT complete'} (${input.harvest.endedReason ?? 'no reason given'}).`);
    L.push(`${s.answered} of ${s.total} shops answered. Not reached this sweep: ${list(s.notReached)}.`, '');
    L.push('| Check | Shops |', '|---|---|');
    L.push(`| Did not answer (most listings first) | ${list(s.silent.map((x) => `${x.id} (${x.shown})`))} |`);
    L.push(`| Stopped on their time budget | ${list(s.timeBudget)} |`);
    L.push(`| Listings over 48 hours old | ${list(s.stale.map((x) => `${x.id} (${x.over48h} of ${x.shown})`))} |`, '');
    if (s.errored.length) {
      L.push('| Shop with errors | Errors | First |', '|---|---|---|');
      for (const e of s.errored.slice(0, 20)) L.push(`| ${e.id} | ${e.count} | ${e.first.replace(/\|/g, '/')} |`);
      L.push('');
    }
  }

  L.push('## Workflows (last 7 days, completed runs)', '');
  if (!input.runs) {
    L.push('The Actions API could not be read.', '');
  } else {
    L.push('Minutes are from run start to last update, cancelled and skipped runs left out. The crawl job limit is 120 minutes: act when a longest figure passes 100.', '');
    L.push('| Workflow | Runs | Failed | Cancelled | Median | 90th | Longest |', '|---|---|---|---|---|---|---|');
    for (const r of input.runs) L.push(`| ${r.workflow} | ${r.runs} | ${r.failed} | ${r.cancelled} | ${r.medianMin} | ${r.p90Min} | ${r.maxMin}${r.maxMin >= 100 ? ' (over 100)' : ''} |`);
    L.push('');
  }

  L.push('## Supabase', '');
  if (!input.ping) L.push('No project configured in `demo/supabase.ts`.', '');
  else if (input.ping.status !== null && input.ping.status >= 200 && input.ping.status < 300) L.push(`Read answered HTTP ${input.ping.status}: the project is awake.`, '');
  else L.push(`Read answered ${input.ping.status === null ? 'nothing' : `HTTP ${input.ping.status}`}: check the project in the Supabase dashboard (it may be paused; restore it there).`, '');
  return L.join('\n');
}

async function gh(path: string, token: string, doFetch: Fetch): Promise<any> {
  const res = await doFetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub API ${path.split('?')[0]} answered HTTP ${res.status}`);
  return res.json();
}

export async function fetchRuns(repo: string, token: string, now: Date, doFetch: Fetch = fetch): Promise<RunLite[]> {
  const from = new Date(now.getTime() - 7 * 86400e3).toISOString().slice(0, 10);
  const out: RunLite[] = [];
  for (let page = 1; page <= 25; page++) {
    const j = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}&status=completed&created=%3E%3D${from}&exclude_pull_requests=true`, token, doFetch);
    for (const r of j.workflow_runs ?? []) out.push({ workflow: r.name, status: r.status, conclusion: r.conclusion, startedAt: r.run_started_at ?? r.created_at, updatedAt: r.updated_at });
    if ((j.workflow_runs ?? []).length < 100) break;
  }
  return out;
}

async function main(env = process.env): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const now = new Date();
  let harvest: HarvestLite | null = null;
  try {
    harvest = JSON.parse(readFileSync(resolve(root, 'data/harvest-report.json'), 'utf8')) as HarvestLite;
  } catch {
    harvest = null;
  }
  let runs: WorkflowStat[] | null = null;
  try {
    runs = summariseRuns(await fetchRuns(env.GITHUB_REPOSITORY ?? '', env.GITHUB_TOKEN ?? '', now));
  } catch (e) {
    console.log(`::warning::weekly health: ${e instanceof Error ? e.message : String(e)}`);
  }
  let ping: Ping | null = null;
  try {
    const cfg = supabaseConfigFrom(readFileSync(resolve(root, 'demo/supabase.ts'), 'utf8'));
    ping = cfg ? await pingSupabase(cfg.url, cfg.key) : null;
  } catch {
    ping = null;
  }
  if (ping && (ping.status === null || ping.status >= 300)) console.log(`::warning::weekly health: the Supabase read answered ${ping.status ?? 'nothing'}`);
  const md = render({ shops: harvest ? summariseShops(harvest) : null, harvest, runs, ping, now });
  console.log(md);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${md}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`Weekly health failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
