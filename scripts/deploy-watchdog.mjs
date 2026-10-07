/**
 * Cancels an older deploy run whose `deploy` job has waited for a runner far
 * longer than a deploy takes, so it stops holding the `pages` concurrency
 * group.
 *
 *   node scripts/deploy-watchdog.mjs     # in deploy-pages.yml's decide job
 *
 * ── Why (deploy #1165, 2026-10-06) ──────────────────────────────────────────
 * The `deploy` job of #1165 (a push at 08:58 UTC) was never given a runner and
 * never started a step, yet its run held the `pages` group until something
 * cancelled it at 12:45. Every deploy that arrived meanwhile (#1166 to #1175,
 * ten of them, after finished crawl runs and pushes) waited behind it and was
 * replaced by the next, so the site stayed on the 08:54 build for almost four
 * hours while the crawl went on committing prices. A job's `timeout-minutes`
 * counts only from when a runner picks it up, so nothing in the workflow
 * could end the wait; other workflows got runners throughout.
 *
 * Since then the `pages` group sits on the `deploy` job, not the workflow, so
 * every run's `decide` job runs at once, and it starts here: any other run
 * of this workflow whose `deploy` job is still queued or waiting with no
 * runner, `STUCK_AFTER_MINUTES` after it was created, is cancelled (and force
 * cancelled when a plain cancel is refused). A job with a runner is never
 * touched: it is running, and cancelling a Pages deployment mid flight is
 * what the group's `cancel-in-progress: false` exists to avoid; its own
 * `timeout-minutes` ends it. The run that cancels always deploys the tip, so
 * nothing is lost.
 *
 * Never fails the job: a watchdog that cannot read or cancel only warns.
 * Plain JavaScript with no dependencies, so it runs before `npm ci`.
 */
import { fileURLToPath } from 'node:url';

/** Far above a deploy's three minutes and a normal wait for a runner. */
export const STUCK_AFTER_MINUTES = 30;
const WAITING = new Set(['queued', 'waiting', 'pending', 'requested']);

/**
 * The runs to cancel.
 *   runs: [{ id, run_number }] of this workflow, not completed
 *   jobsOf(id): that run's jobs as the API lists them
 */
export function stuckRuns({ runs, jobsOf, ownRunId, now, minutes = STUCK_AFTER_MINUTES }) {
  const out = [];
  for (const run of runs) {
    if (String(run.id) === String(ownRunId)) continue;
    const deploy = (jobsOf(run.id) ?? []).find((j) => j.name === 'deploy');
    if (!deploy || !WAITING.has(deploy.status) || deploy.runner_name) continue;
    const waited = (now - Date.parse(deploy.created_at)) / 60_000;
    if (waited >= minutes) {
      out.push({ id: run.id, number: run.run_number, reason: `its deploy job has waited ${Math.round(waited)} minutes for a runner` });
    }
  }
  return out;
}

async function api(path, init = {}) {
  const res = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  return res;
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const ownRunId = process.env.GITHUB_RUN_ID;
  if (!repo || !process.env.GH_TOKEN) {
    console.log('deploy-watchdog: no repository or token, nothing to check.');
    return;
  }
  const runs = [];
  for (const status of ['in_progress', 'queued', 'waiting', 'pending']) {
    const res = await api(`/repos/${repo}/actions/workflows/deploy-pages.yml/runs?status=${status}&per_page=50`);
    if (!res.ok) throw new Error(`listing ${status} runs: HTTP ${res.status}`);
    for (const r of (await res.json()).workflow_runs ?? []) if (!runs.some((x) => x.id === r.id)) runs.push(r);
  }
  const jobs = new Map();
  for (const run of runs) {
    if (String(run.id) === String(ownRunId)) continue;
    const res = await api(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=20`);
    jobs.set(run.id, res.ok ? (await res.json()).jobs ?? [] : []);
  }
  const stuck = stuckRuns({ runs, jobsOf: (id) => jobs.get(id), ownRunId, now: Date.now() });
  if (stuck.length === 0) {
    console.log(`deploy-watchdog: ${runs.length} other unfinished deploy run(s), none stuck.`);
    return;
  }
  for (const s of stuck) {
    let res = await api(`/repos/${repo}/actions/runs/${s.id}/cancel`, { method: 'POST' });
    if (res.status !== 202) res = await api(`/repos/${repo}/actions/runs/${s.id}/force-cancel`, { method: 'POST' });
    const done = res.status === 202;
    console.log(`::warning::deploy-watchdog: ${done ? 'cancelled' : `could not cancel (HTTP ${res.status})`} deploy #${s.number}: ${s.reason}.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.log(`::warning::deploy-watchdog could not check for a stuck deploy (${err instanceof Error ? err.message : String(err)}).`);
  });
}
