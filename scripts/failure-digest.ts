/**
 * Daily failure digest (.github/workflows/failure-digest.yml).
 *
 *   DRY_RUN=true GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo npx tsx scripts/failure-digest.ts
 *
 * Reads the workflow runs of the last 24 hours through the GitHub REST API,
 * counts failures per workflow, flags a scheduled workflow that went quiet
 * (no run at all when its cron says it should have one) or is still failing
 * after earlier successes, and checks the live site answers 200. It emails
 * the owner through Resend ONLY when there is something to report; otherwise
 * it logs "all quiet". The rule is the pure function `summarise`; the rest of
 * this file fetches and sends. Nothing here prints a key, a token or an
 * address. Without RESEND_API_KEY it logs what it would send and exits 0.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resendProvider } from '../src/alerts/provider.js';
import { DEFAULT_FROM } from '../src/alerts/config.js';

export const DEFAULT_TO = 'yanakan19@gmail.com';
export const SITE_URLS = ['https://pricesniffs.space/', 'https://pricesniffs.space/us/', 'https://pricesniffs.space/in/', 'https://pricesniffs.space/ca/'];
export const WINDOW_HOURS = 24;
/** A scheduled run can start late (queueing, dropped ticks); a tick this recent is not yet missed. */
export const GRACE_HOURS = 2;
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

export interface Run {
  id: number;
  workflowId: number;
  name: string;
  conclusion: string | null; // null while running
  createdAt: string;
  url: string;
}
export interface WorkflowInfo {
  id: number;
  name: string;
  /** Cron expressions of the workflow file, empty when it has no schedule. */
  crons: string[];
  disabled?: boolean;
}
export interface SiteCheck {
  url: string;
  status: number | null; // null: no answer
}
export type Problem =
  | { kind: 'failed'; workflow: string; count: number; stillFailing: boolean; latest: Run; step?: string | undefined }
  | { kind: 'still-failing'; workflow: string; latest: Run; step?: string | undefined }
  | { kind: 'quiet'; workflow: string; expectedAt: string }
  | { kind: 'site'; url: string; status: number | null };

// ── cron ────────────────────────────────────────────────────────────────────

function field(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const [range = '*', stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    let lo = min;
    let hi = max;
    if (range !== '*') {
      const [a = '', b] = range.split('-');
      lo = Number(a);
      hi = b === undefined ? (stepText ? max : lo) : Number(b);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** Does a five field UTC cron fire at this minute? */
export function cronFiresAt(cron: string, at: Date): boolean {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return false;
  const [mi, ho, dom, mo, dow] = f as [string, string, string, string, string];
  const domOk = field(dom, 1, 31).has(at.getUTCDate());
  const dowSet = field(dow, 0, 7);
  const dowOk = dowSet.has(at.getUTCDay()) || (at.getUTCDay() === 0 && dowSet.has(7));
  // Standard cron: when both day fields are restricted, either may match.
  const dayOk = dom !== '*' && dow !== '*' ? domOk || dowOk : domOk && dowOk;
  return field(mi, 0, 59).has(at.getUTCMinutes()) && field(ho, 0, 23).has(at.getUTCHours()) && field(mo, 1, 12).has(at.getUTCMonth() + 1) && dayOk;
}

/** The latest scheduled tick inside [now - 24h, now - grace], or null. */
export function lastDueTick(crons: string[], now: Date): Date | null {
  const end = Math.floor((now.getTime() - GRACE_HOURS * 3600e3) / 60e3) * 60e3;
  const start = now.getTime() - WINDOW_HOURS * 3600e3;
  for (let t = end; t >= start; t -= 60e3) {
    const d = new Date(t);
    if (crons.some((c) => cronFiresAt(c, d))) return d;
  }
  return null;
}

/** Cron lines of a workflow file (the text; the repository carries no YAML parser). */
export function cronsOf(workflowText: string): string[] {
  return [...workflowText.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
}

// ── the rule ────────────────────────────────────────────────────────────────

const isFailed = (r: Run) => r.conclusion !== null && FAILED.has(r.conclusion);
const isDone = (r: Run) => r.conclusion !== null && r.conclusion !== 'cancelled' && r.conclusion !== 'skipped';

export interface DigestInput {
  now: Date;
  /** Runs of the last several days (7 is enough), any order. */
  runs: Run[];
  workflows: WorkflowInfo[];
  site: SiteCheck[];
  /** Name of this workflow, never reported as quiet. */
  self?: string | undefined;
  /** Last failing step name per run id, when known. */
  steps?: Record<number, string>;
}

export function summarise(input: DigestInput): { problems: Problem[]; subject: string; body: string } {
  const { now, workflows, site } = input;
  const since = now.getTime() - WINDOW_HOURS * 3600e3;
  const runs = [...input.runs].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)); // newest first
  const problems: Problem[] = [];
  for (const wf of workflows) {
    const mine = runs.filter((r) => r.workflowId === wf.id);
    const recent = mine.filter((r) => Date.parse(r.createdAt) >= since);
    const done = mine.filter(isDone);
    const latest = done[0];
    const failures = recent.filter(isFailed);
    const earlierSuccess = latest ? done.slice(1).some((r) => r.conclusion === 'success') : false;
    const stillFailing = !!latest && isFailed(latest) && earlierSuccess;
    if (failures.length > 0) {
      const last = failures[0]!;
      problems.push({ kind: 'failed', workflow: wf.name, count: failures.length, stillFailing, latest: last, step: input.steps?.[last.id] });
    } else if (stillFailing) {
      problems.push({ kind: 'still-failing', workflow: wf.name, latest: latest!, step: input.steps?.[latest!.id] });
    }
    if (!wf.disabled && wf.name !== input.self && wf.crons.length > 0 && recent.length === 0) {
      const due = lastDueTick(wf.crons, now);
      if (due) problems.push({ kind: 'quiet', workflow: wf.name, expectedAt: due.toISOString() });
    }
  }
  for (const s of site) if (s.status !== 200) problems.push({ kind: 'site', url: s.url, status: s.status });

  const n = problems.length;
  const subject = `PriceSniffs: ${n} problem${n === 1 ? '' : 's'} in the last ${WINDOW_HOURS} hours`;
  return { problems, subject, body: renderBody(problems) };
}

const when = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;

export function renderBody(problems: Problem[]): string {
  const lines = problems.map((p) => {
    switch (p.kind) {
      case 'failed':
        return `FAILED ${p.workflow}: ${p.count} failed run${p.count === 1 ? '' : 's'}${p.stillFailing ? ', still failing' : ''}. Latest ${when(p.latest.createdAt)}${p.step ? `, step "${p.step}"` : ''}. ${p.latest.url}`;
      case 'still-failing':
        return `STILL FAILING ${p.workflow}: latest run ${when(p.latest.createdAt)}${p.step ? `, step "${p.step}"` : ''} failed after earlier successes. ${p.latest.url}`;
      case 'quiet':
        return `QUIET ${p.workflow}: no run in the last ${WINDOW_HOURS} hours, one was due at ${when(p.expectedAt)}.`;
      case 'site':
        return `SITE ${p.url} answered ${p.status === null ? 'nothing' : `HTTP ${p.status}`}, expected 200.`;
    }
  });
  return `${lines.join('\n')}\n\nSent by the Failure digest workflow (Actions tab).\n`;
}

// ── fetching ────────────────────────────────────────────────────────────────

type Fetch = typeof fetch;

async function gh(path: string, token: string, doFetch: Fetch): Promise<any> {
  const res = await doFetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub API ${path.split('?')[0]} answered HTTP ${res.status}`);
  return res.json();
}

export async function fetchRuns(repo: string, token: string, now: Date, doFetch: Fetch = fetch): Promise<Run[]> {
  const from = new Date(now.getTime() - 7 * 86400e3).toISOString().slice(0, 10);
  const out: Run[] = [];
  for (let page = 1; page <= 15; page++) {
    const j = await gh(`/repos/${repo}/actions/runs?per_page=100&page=${page}&created=%3E%3D${from}&exclude_pull_requests=true`, token, doFetch);
    for (const r of j.workflow_runs ?? []) {
      out.push({ id: r.id, workflowId: r.workflow_id, name: r.name, conclusion: r.status === 'completed' ? r.conclusion : null, createdAt: r.created_at, url: r.html_url });
    }
    if ((j.workflow_runs ?? []).length < 100) break;
  }
  return out;
}

export async function fetchWorkflows(repo: string, token: string, dir: string, doFetch: Fetch = fetch): Promise<WorkflowInfo[]> {
  const j = await gh(`/repos/${repo}/actions/workflows?per_page=100`, token, doFetch);
  const files = new Set(readdirSync(dir));
  return (j.workflows as any[]).map((w) => {
    const file = String(w.path).split('/').pop()!;
    const crons = files.has(file) ? cronsOf(readFileSync(join(dir, file), 'utf8')) : [];
    return { id: w.id, name: w.name, crons, disabled: w.state !== 'active' };
  });
}

export async function failingStep(repo: string, token: string, runId: number, doFetch: Fetch = fetch): Promise<string | undefined> {
  try {
    const j = await gh(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`, token, doFetch);
    for (const job of j.jobs ?? []) {
      const step = (job.steps ?? []).find((s: any) => s.conclusion === 'failure' || s.conclusion === 'timed_out');
      if (step) return String(step.name).slice(0, 80);
    }
  } catch {
    /* a missing step name never stops the digest */
  }
  return undefined;
}

/** One request with one retry; status null when nothing answered. */
export async function checkSite(url: string, doFetch: Fetch = fetch): Promise<SiteCheck> {
  let status: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await doFetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      status = res.status;
      if (status === 200) break;
    } catch {
      status = null;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 5000));
  }
  return { url, status };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const env = process.env;
  const token = (env.GITHUB_TOKEN ?? '').trim();
  const repo = (env.GITHUB_REPOSITORY ?? '').trim();
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  const now = new Date();
  const dryRun = (env.DRY_RUN ?? '').trim().toLowerCase() !== 'false';
  const to = (env.DIGEST_TO ?? '').trim() || DEFAULT_TO;
  const from = (env.ALERTS_FROM ?? '').trim() || DEFAULT_FROM;
  const apiKey = (env.RESEND_API_KEY ?? '').trim();
  console.log(`Failure digest: RESEND_API_KEY ${apiKey ? 'is set' : 'is NOT set'}; ${dryRun ? 'dry run' : 'live'}.`);

  const [runs, workflows, site] = await Promise.all([
    fetchRuns(repo, token, now),
    fetchWorkflows(repo, token, join(process.cwd(), '.github/workflows')),
    Promise.all(SITE_URLS.map((u) => checkSite(u))),
  ]);
  console.log(`Read ${runs.length} runs of the last 7 days across ${workflows.length} workflows.`);
  for (const wf of workflows) {
    const n = runs.filter((r) => r.workflowId === wf.id && Date.parse(r.createdAt) >= now.getTime() - WINDOW_HOURS * 3600e3).length;
    console.log(`  ${wf.name}: ${n} runs in 24h${wf.crons.length ? `, cron ${wf.crons.join(' | ')}` : ''}${wf.disabled ? ', disabled' : ''}`);
  }
  console.log(`Site: ${site.map((s) => `${s.url} ${s.status ?? 'no answer'}`).join('; ')}`);

  // Step names cost one call per workflow with a failure, so only for those.
  const first = summarise({ now, runs, workflows, site, self: env.DIGEST_SELF });
  const steps: Record<number, string> = {};
  for (const p of first.problems) {
    if (p.kind === 'failed' || p.kind === 'still-failing') {
      const s = await failingStep(repo, token, p.latest.id);
      if (s) steps[p.latest.id] = s;
    }
  }
  const { problems, subject, body } = summarise({ now, runs, workflows, site, self: env.DIGEST_SELF, steps });

  if (problems.length === 0) {
    console.log('all quiet');
    return;
  }
  console.log(`${subject}\n${body}`);
  if (dryRun || !apiKey) {
    console.log(dryRun ? 'Dry run: nothing sent.' : 'RESEND_API_KEY not set: nothing sent (green, as for price alerts).');
    return;
  }
  const provider = resendProvider({ apiKey, from });
  const html = `<pre style="font-family:inherit;white-space:pre-wrap">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
  const result = await provider.send({
    to,
    subject,
    text: body,
    html,
    unsubscribeUrl: 'https://pricesniffs.space/',
    // One email per UTC day even if the job is re-run.
    idempotencyKey: `failure-digest/${now.toISOString().slice(0, 10)}`,
  });
  if (!result.ok) throw new Error(`Email not sent: ${result.reason}`);
  console.log('Digest email sent.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`Failure digest failed: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
