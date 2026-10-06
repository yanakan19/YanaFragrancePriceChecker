/**
 * Decides whether .github/workflows/deploy-pages.yml should build and publish
 * the site, and writes the record of what a deployment was built from.
 *
 * Owner decision, 6 October 2026: the site redeploys only when the built page
 * could change. Until then every crawl run that ended started a full deploy,
 * the half hourly ticks that skip in seconds included: 86 deploys on
 * 5 October, about 50 of them with nothing new (docs/TRACKING-AND-STORAGE-
 * STRATEGY.md, item 4).
 *
 *   node scripts/deploy-decision.mjs decide        # writes deploy, reason,
 *                                                  # overrides to $GITHUB_OUTPUT
 *   node scripts/deploy-decision.mjs record <file> # after the build: what this
 *                                                  # deployment was built from
 *
 * ── What the published site remembers ───────────────────────────────────────
 * Every deployment publishes `build-state.json` beside the page: the commit it
 * was built from and a fingerprint of the dashboard's hidden and removed list
 * it was built with. The next run reads it back from the live site, so the
 * answer is always "what is live now", never a guess from the workflow's own
 * history, and a deployment that failed leaves the old record in place (the
 * next run then deploys again).
 *
 * ── When it deploys ─────────────────────────────────────────────────────────
 *   a push or a run by hand      always (the push's own path filter already
 *                                left out the pushes that cannot change it)
 *   after a crawl or links run,  when a file that can change the page changed
 *   and on the schedule          between the live commit and the branch tip
 *                                (the same folders the push filter counts), or
 *                                when the hidden and removed list is not the
 *                                one the live site was built with, or when the
 *                                live record cannot be read or its commit is
 *                                not in the history
 *
 * So a crawl run that committed nothing, or only snapshots and reports, does
 * not deploy, and a "Remove" or "Show again" in the dashboard reaches the
 * build at the next half hourly scheduled check. The page reads the live list
 * on every load anyway (scripts/siteBuild.ts), so hiding is immediate; the
 * deploy is what drops a removed brand's data and sitemap entries.
 *
 * Plain JavaScript with no dependencies, so the check runs before `npm ci`.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the live site is, and where it keeps the record. */
export const SITE = `https://${readFileSync(join(ROOT, 'demo/CNAME'), 'utf8').trim()}`;
export const STATE_FILE = 'build-state.json';

/**
 * Paths whose change cannot change the built page: the same list as the push
 * trigger's `paths` filter in deploy-pages.yml (tests/deployDecision.test.ts
 * holds the two together). A path matches when it starts with one of the
 * folders or ends with `.md`; .github/workflows/deploy-pages.yml itself does
 * count.
 */
export const NOT_PAGE_FOLDERS = ['data/', 'docs/', 'tests/', 'social/', 'apps/', 'supabase/', '.github/'];
export const COUNTS_ANYWAY = ['.github/workflows/deploy-pages.yml'];

/** True when a change to this path can change what `npm run demo` builds. */
export function canChangePage(path) {
  if (COUNTS_ANYWAY.includes(path)) return true;
  if (path.endsWith('.md')) return false;
  return !NOT_PAGE_FOLDERS.some((folder) => path.startsWith(folder));
}

/** The two public values from demo/supabase.ts (the anon key ships in the page). */
export function supabasePublic(source = readFileSync(join(ROOT, 'demo/supabase.ts'), 'utf8')) {
  const url = /export const SUPABASE_URL: string =\s*'([^']*)'/.exec(source)?.[1] ?? '';
  const key = /export const SUPABASE_ANON_KEY: string =\s*'([^']*)'/.exec(source)?.[1] ?? '';
  return { url, key };
}

/**
 * A fingerprint of the hidden and removed list: `sha256:<hex>` of its rows in
 * a fixed order, `missing` when the table does not exist (the build then turns
 * the dashboard off), `unreachable` when the database did not answer.
 */
export function overridesFingerprint(rows) {
  if (!Array.isArray(rows)) return 'unreachable';
  const canonical = rows
    .map((r) => [String(r?.kind ?? ''), String(r?.key ?? ''), String(r?.state ?? ''), String(r?.name ?? '')])
    .sort((a, b) => a.join('\u0000').localeCompare(b.join('\u0000')));
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`;
}

async function fetchWithRetry(url, init, tries = 3) {
  let last = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      last = err;
      if (attempt < tries) await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  throw last;
}

export async function readOverrides(fetchImpl = fetchWithRetry) {
  const { url, key } = supabasePublic();
  if (!url || !key) return 'missing';
  try {
    const res = await fetchImpl(`${url}/rest/v1/site_overrides?select=kind,key,state,name`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (res.status === 404) return 'missing';
    if (!res.ok) return 'unreachable';
    return overridesFingerprint(await res.json());
  } catch {
    return 'unreachable';
  }
}

/** The live record, or null when it cannot be read. */
export async function readLiveState(fetchImpl = fetchWithRetry, bust = String(Date.now())) {
  try {
    // A query string the CDN has not seen, so it does not answer from a copy
    // cached before the last deployment.
    const res = await fetchImpl(`${SITE}/${STATE_FILE}?check=${encodeURIComponent(bust)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const state = await res.json();
    return typeof state?.commit === 'string' && /^[0-9a-f]{40}$/.test(state.commit) ? state : null;
  } catch {
    return null;
  }
}

/**
 * The decision, from what is live and what is on the branch now.
 *   changedPaths(from, to) returns the paths that differ, or null when `from`
 *   is not in the history.
 */
export function decide({ event, tip, overrides, live, changedPaths }) {
  if (event === 'push' || event === 'workflow_dispatch') return { deploy: true, reason: `a ${event}` };
  if (!live) return { deploy: true, reason: 'the live site has no readable build record' };
  if (overrides !== 'unreachable' && live.overrides !== overrides) {
    return { deploy: true, reason: 'the hidden and removed list changed' };
  }
  if (live.commit === tip) return { deploy: false, reason: `the live site is built from the tip (${tip.slice(0, 8)})` };
  const paths = changedPaths(live.commit, tip);
  if (paths === null) return { deploy: true, reason: `the live commit ${live.commit.slice(0, 8)} is not in the history` };
  const page = paths.filter(canChangePage);
  if (page.length > 0) {
    const shown = page.slice(0, 5).join(', ') + (page.length > 5 ? ` and ${page.length - 5} more` : '');
    return { deploy: true, reason: `${page.length} file(s) that can change the page changed: ${shown}` };
  }
  return {
    deploy: false,
    reason: `nothing that can change the page changed since ${live.commit.slice(0, 8)} (${paths.length} other file(s))`,
  };
}

function gitChangedPaths(from, to) {
  try {
    execFileSync('git', ['cat-file', '-e', `${from}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    return null;
  }
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', from, to], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

async function main() {
  const [command, file] = process.argv.slice(2);
  const tip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (command === 'record') {
    const overrides = process.env.OVERRIDES || 'unreachable';
    writeFileSync(file, `${JSON.stringify({ commit: tip, overrides, builtAt: new Date().toISOString() }, null, 2)}\n`);
    console.log(`deploy-decision: recorded ${tip.slice(0, 8)}, overrides ${overrides.slice(0, 19)} in ${file}`);
    return;
  }
  if (command !== 'decide') throw new Error('usage: deploy-decision.mjs decide | record <file>');
  const event = process.env.EVENT ?? '';
  const overrides = await readOverrides();
  const live = event === 'push' || event === 'workflow_dispatch' ? null : await readLiveState(fetchWithRetry, process.env.GITHUB_RUN_ID ?? String(Date.now()));
  const verdict = decide({ event, tip, overrides, live, changedPaths: gitChangedPaths });
  console.log(`deploy-decision: ${verdict.deploy ? 'deploy' : 'skip'}: ${verdict.reason}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${verdict.deploy}\noverrides=${overrides}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Deploy: **${verdict.deploy ? 'yes' : 'no'}**, ${verdict.reason}.\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    // A decision that cannot be made deploys: the old behaviour, never worse.
    console.log(`::warning::deploy-decision failed (${err instanceof Error ? err.message : String(err)}); deploying.`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'deploy=true\noverrides=unreachable\n');
  });
}
