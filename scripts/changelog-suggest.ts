/**
 * Deterministic replacement for asking a fresh nightly session to work out,
 * from scratch, what happened today and whether it belongs in the changelog.
 *
 *   npx tsx scripts/changelog-suggest.ts
 *   npm run changelog:suggest
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * A trigger fires a prompt into a fresh session every night at 23:55 UTC
 * asking it to append that day's work to demo/changelog.ts. It produced
 * nothing on every firing since it was created, for three compounding
 * reasons, all in the calling session's own shell steps rather than in this
 * repo:
 *
 *   1. Fresh containers can start from a stale cached checkout (observed:
 *      12 Aug 23:11, days behind).
 *   2. The resync those sessions ran chained `git fetch && git reset --hard
 *      origin/<branch>` with no check that the fetch actually updated
 *      anything. `git fetch` can exit 0 without the local `origin/<branch>`
 *      ref moving (auth hiccup, wrong remote, a fetch that silently no-ops)
 *      — and `reset --hard` against that stale ref succeeds anyway, quietly
 *      landing back on the stale tree from (1).
 *   3. The session then genuinely finds zero commits for "today" on that
 *      stale tree, correctly reports nothing happened, and exits — a real
 *      observation from a false premise, indistinguishable from an honestly
 *      quiet day.
 *   4. Separately: "today" was computed from the live clock four minutes
 *      before UTC midnight. A slow start rolls it to the wrong calendar day
 *      even on a correctly synced tree.
 *
 * This script owns the parts that were the actual bugs — resync, date, and
 * commit selection — so the nightly session's only remaining job is: run
 * this, then turn its output into prose. See "WHAT THE NIGHTLY TRIGGER
 * SHOULD SEND" at the bottom of this file for the replacement prompt.
 *
 * ── A fifth bug, found 16 Aug 2026 ────────────────────────────────────────
 * The script above fixed which day it was safe to *trust*, but still only
 * ever looked at one day: the newest commit's. That made every missed night
 * permanent. If a firing produced no entry, the next firing's newest commit
 * had already moved to a later day and the missed one was never revisited.
 * Both 15 and 16 Aug 2026 had real reader-facing work and both were skipped
 * this way, behind a changelog whose newest entry was 14 Aug.
 *
 * It now compares the days the changelog already covers against the days that
 * actually have non-pipeline commits, and reports the OLDEST day still
 * unrecorded — so gaps get filled in order and nothing is lost by being a day
 * late. See `findUnrecordedWorkDays` for why that search starts at the newest
 * recorded day rather than at the beginning of history.
 *
 * ── Exit codes (the point of this whole exercise) ─────────────────────────
 * Unchanged in meaning from the original version; only *which* day exit 0
 * talks about has changed (oldest unrecorded, not newest committed).
 *
 *   0  Found real, non-pipeline commits for the target date. stdout has a
 *      report a session can turn directly into changelog prose.
 *   2  Could not verify a fresh tree (fetch failed, or HEAD still disagrees
 *      with the remote after resyncing), or could not trust its own inputs
 *      well enough to go on. LOUD, on stderr. This is exactly the failure
 *      mode that used to look like a quiet day — it must never again be
 *      silently treated as one.
 *   3  Fresh tree confirmed, but every unrecorded day's commits are automated
 *      pipeline noise. A genuinely silent stretch — write nothing to the
 *      changelog, and this is success, not failure.
 *   4  demo/changelog.ts already covers every day that has commits. Nothing
 *      outstanding; re-running (e.g. after a retry) should not duplicate an
 *      entry.
 *
 * Never writes to demo/changelog.ts itself. Deciding which commits deserve a
 * reader-facing sentence and phrasing that sentence in the project's plain,
 * no-jargon style is a judgement call this script cannot safely make for
 * every kind of change — see that file's own header for the rules. Getting
 * that wrong in either direction (inventing an entry, or describing engineering
 * detail) is worse than a script that stops one step short and hands a human
 * or a session the real, filtered facts to write from.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCommitLog,
  deriveTargetDate,
  commitsOnDate,
  nonPipelineCommits,
  toChangelogDateLabel,
  extractChangelogDates,
  findUnrecordedWorkDays,
  newestCoveredDay,
  PIPELINE_PREFIXES,
  type CommitEntry,
} from '../src/changelog/changelogSuggest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG_PATH = resolve(root, 'demo/changelog.ts');

const EXIT_OK = 0;
const EXIT_TREE_NOT_FRESH = 2;
const EXIT_NOTHING_TO_REPORT = 3;
const EXIT_ALREADY_RECORDED = 4;

function arg(name: string, fallback: string | null): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function git(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 16 });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function fail(message: string): never {
  console.error(`::error:: ${message}`);
  process.exit(EXIT_TREE_NOT_FRESH);
}

/**
 * The whole point of this script. Fetches, checks the fetch actually
 * succeeded, and then cross-checks HEAD against an independent `git
 * ls-remote` call (not the just-updated local tracking ref, which is
 * exactly what silently lied last time) before trusting anything on disk.
 */
function assertFreshTree(remote: string, branch: string): void {
  console.log(`Verifying a fresh tree against ${remote}/${branch}...`);

  const fetched = git(['fetch', '--quiet', remote, branch]);
  if (fetched.code !== 0) {
    fail(
      `git fetch ${remote} ${branch} failed (exit ${fetched.code}). Refusing to trust this checkout.\n` +
        (fetched.stderr || '(no stderr captured)'),
    );
  }

  const fetchHead = git(['rev-parse', 'FETCH_HEAD']);
  if (fetchHead.code !== 0 || !fetchHead.stdout.trim()) {
    fail('git fetch reported success but FETCH_HEAD does not resolve. Refusing to trust this checkout.');
  }
  const fetchedSha = fetchHead.stdout.trim();

  // Independent of the fetch above: ask the remote directly what the branch
  // tip actually is right now. This is the check that catches "fetch exited
  // 0 but did not really move anything" — the local FETCH_HEAD alone cannot
  // prove that, since it is exactly what a no-op fetch would leave stale too.
  const lsRemote = git(['ls-remote', remote, `refs/heads/${branch}`]);
  if (lsRemote.code !== 0 || !lsRemote.stdout.trim()) {
    fail(`git ls-remote ${remote} refs/heads/${branch} failed (exit ${lsRemote.code}). Cannot confirm the real remote state.`);
  }
  const remoteSha = (lsRemote.stdout.split('\t')[0] ?? '').trim();
  if (!remoteSha) {
    fail(`Could not parse a SHA out of ls-remote output: ${JSON.stringify(lsRemote.stdout)}`);
  }
  if (remoteSha !== fetchedSha) {
    fail(
      `git fetch landed on ${fetchedSha} but ls-remote says ${remote}/${branch} is really at ${remoteSha}. ` +
        'These must agree before anything downstream can be trusted.',
    );
  }

  const headBefore = git(['rev-parse', 'HEAD']).stdout.trim();
  if (headBefore !== remoteSha) {
    console.log(`HEAD (${headBefore.slice(0, 7)}) is not ${remote}/${branch} (${remoteSha.slice(0, 7)}) — resetting.`);
    const reset = git(['reset', '--hard', 'FETCH_HEAD']);
    if (reset.code !== 0) {
      fail(`git reset --hard FETCH_HEAD failed (exit ${reset.code}):\n${reset.stderr}`);
    }
  }

  const headAfter = git(['rev-parse', 'HEAD']).stdout.trim();
  if (headAfter !== remoteSha) {
    fail(
      `Still not on the real remote tip after resync: HEAD is ${headAfter}, ` +
        `${remote}/${branch} is ${remoteSha}. This is the exact silent-staleness bug this check exists to catch.`,
    );
  }

  console.log(`Confirmed fresh: HEAD == ${remote}/${branch} == ${headAfter}\n`);
}

function currentBranch(): string {
  const r = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const name = r.stdout.trim();
  if (r.code !== 0 || !name || name === 'HEAD') {
    fail(`Could not determine the current branch name (detached HEAD?): ${JSON.stringify(r)}`);
  }
  return name;
}

/**
 * Every commit from the newest day the changelog already covers onwards.
 *
 * %x1f (unit separator) delimits fields so a subject line can contain
 * anything printable without corrupting the parse. `--since` is anchored on
 * the changelog's own watermark rather than a fixed commit count, because the
 * window this has to cover is "however far behind the changelog has fallen",
 * which no fixed number can promise. `git log --since` filters on committer
 * date, the same date `%cI` prints. The -n cap is only a runaway guard.
 */
function loadCommitsSince(watermark: string): CommitEntry[] {
  const log = git([
    'log',
    '--no-merges',
    '-n',
    '5000',
    `--since=${watermark}T00:00:00Z`,
    '--pretty=format:%H%x1f%cI%x1f%s',
  ]);
  if (log.code !== 0) {
    fail(`git log failed (exit ${log.code}): ${log.stderr}`);
  }
  return parseCommitLog(log.stdout);
}

function describeDay(commits: readonly CommitEntry[], day: string): string {
  const dayCommits = commitsOnDate(commits, day);
  const real = nonPipelineCommits(dayCommits);
  const pipeline = dayCommits.length - real.length;
  return `${toChangelogDateLabel(day)}: ${dayCommits.length} commit(s), ${pipeline} automated pipeline, ${real.length} other`;
}

function main(): void {
  const remote = arg('remote', 'origin') as string;
  const branch = arg('branch', null) ?? currentBranch();

  assertFreshTree(remote, branch);

  const changelogSource = readFileSync(CHANGELOG_PATH, 'utf8');
  const existingDates = extractChangelogDates(changelogSource);
  if (existingDates.length === 0) {
    fail(`No date fields could be read out of ${CHANGELOG_PATH}. Refusing to guess what is already recorded.`);
  }
  const watermark = newestCoveredDay(existingDates);
  if (!watermark) {
    fail(
      `None of the ${existingDates.length} date field(s) in ${CHANGELOG_PATH} parsed as a real date ` +
        `(${existingDates.slice(0, 3).join(' | ')}...). Refusing to guess what is already recorded.`,
    );
  }
  console.log(`Newest day already recorded in demo/changelog.ts: ${watermark} -> "${toChangelogDateLabel(watermark)}"`);

  const commits = loadCommitsSince(watermark);
  if (commits.length === 0) {
    fail(`No commits found at all on or after ${watermark} — that cannot be right on a tree just confirmed fresh.`);
  }

  const newestDay = deriveTargetDate(commits);
  console.log(`Newest day with commits on the tree (not the clock): ${newestDay}`);

  const { candidateDays, daysWithWork, targetDate } = findUnrecordedWorkDays(commits, existingDates);

  if (candidateDays.length === 0) {
    console.log('\nEvery day with commits is already covered by demo/changelog.ts. Nothing to do.');
    process.exit(EXIT_ALREADY_RECORDED);
  }

  console.log(`\n${candidateDays.length} day(s) not yet recorded:`);
  for (const day of candidateDays) {
    console.log(`  ${describeDay(commits, day)}`);
  }

  if (!targetDate) {
    console.log(
      '\nNo non-pipeline work on any unrecorded day. This is a genuinely silent stretch — write nothing.',
    );
    process.exit(EXIT_NOTHING_TO_REPORT);
  }

  const label = toChangelogDateLabel(targetDate);
  const real = nonPipelineCommits(commitsOnDate(commits, targetDate));

  console.log(`\nOldest unrecorded day with real work: ${targetDate} -> "${label}". Write this one.`);
  const remaining = daysWithWork.slice(1);
  if (remaining.length > 0) {
    console.log(
      `Still unrecorded after it: ${remaining.map(toChangelogDateLabel).join(', ')}. ` +
        'Run this script again once this entry is committed — one day per entry, in order.',
    );
  }

  console.log(`\n=== Real commits on ${label}, for changelog drafting ===`);
  console.log(`(oldest first; filtered out: ${PIPELINE_PREFIXES.join(', ')})\n`);
  for (const c of [...real].reverse()) {
    console.log(`  ${c.hash.slice(0, 7)}  ${c.subject}`);
  }
  console.log(
    `\nTurn the above into demo/changelog.ts prose per that file's own header rules: plain reader-facing ` +
      'language, no engineering detail, one plain sentence per point, no trailing full stop. Only describe what is ' +
      `actually there above, dated ${label} and nothing else — do not add, infer, or move anything to a different date.`,
  );
  process.exit(EXIT_OK);
}

main();

/**
 * ── WHAT THE NIGHTLY TRIGGER SHOULD SEND ──────────────────────────────────
 * Replace the trigger's prompt with something close to:
 *
 *   Run `npx tsx scripts/changelog-suggest.ts` and read both its exit code
 *   and its output.
 *   - Exit 0: it printed real commits for one specific date — the oldest day
 *     still missing from the changelog, which may NOT be today. Write ONE new
 *     entry to demo/changelog.ts for exactly that date, following the file's
 *     own header rules exactly, using only what the script printed — then run
 *     `npm run demo` and commit demo/changelog.ts, demo/index.html and
 *     demo/404.html together. Then run the script again: if it prints another
 *     date, repeat, one entry per day, until it exits 3 or 4. Never merge two
 *     days into one entry and never date an entry anything other than the day
 *     the script named.
 *   - Exit 3: a genuinely quiet stretch. Do nothing to demo/changelog.ts.
 *     This is success, not a problem to solve.
 *   - Exit 4: everything with commits is already recorded. Do nothing.
 *   - Exit 2: it could not verify a fresh tree, or could not read the
 *     changelog's own dates. Do NOT try to work around this or fall back to
 *     manual git commands — stop and report the exact stderr it printed; this
 *     exit code is the one this script exists to make loud instead of silent.
 *   Do not compute "today" yourself, do not run your own git log, and do
 *   not touch the changelog on any exit code other than 0.
 */
