/**
 * Pure logic behind `scripts/changelog-suggest.ts`.
 *
 * Kept separate from the script (which does the actual git calls and file
 * I/O) so every rule that decides what counts as "real work" and what date
 * it happened on can be unit tested without touching git or the filesystem.
 * See that script's header for the story of why this exists.
 */

/** Commit subject prefixes written by the automated pipeline, not a person deciding something changed. */
export const PIPELINE_PREFIXES = [
  'Harvest:',
  'Catalogue:',
  'Image links:',
  'Top Deals Today:',
  'Awin feed sync:',
  'Shipping terms:',
  'Probe:',
] as const;

export interface CommitEntry {
  hash: string;
  /** Committer date, strict ISO 8601 (git log %cI) — carries its own offset. */
  isoDate: string;
  subject: string;
}

/** True for a commit subject written by the scheduled pipeline rather than by dev work. */
export function isPipelineCommit(subject: string): boolean {
  return PIPELINE_PREFIXES.some((prefix) => subject.startsWith(prefix));
}

/**
 * Parse `git log --pretty=format:%H%x1f%cI%x1f%s` output (one commit per
 * line, fields separated by 0x1f so a subject containing "|" or any other
 * printable character can never split a field).
 */
export function parseCommitLog(raw: string): CommitEntry[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [hash, isoDate, ...rest] = line.split('\x1f');
      return { hash: hash ?? '', isoDate: isoDate ?? '', subject: rest.join('\x1f') };
    })
    .filter((c) => c.hash !== '' && c.isoDate !== '');
}

/** The commit's calendar date in UTC, as YYYY-MM-DD, regardless of the offset git recorded it with. */
export function commitUtcDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Not a parseable commit date: ${isoDate}`);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * The UTC calendar date of the most recent commit on the (now-verified-fresh)
 * tree — never the live clock.
 *
 * Commits is expected newest-first, i.e. straight from `git log` with no
 * `--reverse`.
 *
 * NOTE: this is no longer what the script reports on. Reporting only on the
 * newest commit's day is precisely the bug described in
 * `findUnrecordedWorkDays` below: a day the nightly run missed could never be
 * revisited, because the next night's newest commit had already moved past it.
 * Kept because "what is the newest day on this tree" is still a useful,
 * separately meaningful fact, and the script prints it for context.
 */
export function deriveTargetDate(commits: readonly CommitEntry[]): string | null {
  const newest = commits[0];
  return newest ? commitUtcDate(newest.isoDate) : null;
}

/** Commits (any order) whose UTC calendar date equals targetDate (YYYY-MM-DD). */
export function commitsOnDate(commits: readonly CommitEntry[], targetDate: string): CommitEntry[] {
  return commits.filter((c) => commitUtcDate(c.isoDate) === targetDate);
}

/** Non-pipeline commits — the ones a changelog entry could actually be drafted from. */
export function nonPipelineCommits(commits: readonly CommitEntry[]): CommitEntry[] {
  return commits.filter((c) => !isPipelineCommit(c.subject));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** YYYY-MM-DD -> the "D Mon YYYY" label demo/changelog.ts entries use, e.g. "15 Aug 2026". */
export function toChangelogDateLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Expected YYYY-MM-DD, got: ${isoDate}`);
  }
  const [, year, month, day] = match as unknown as [string, string, string, string];
  const monthName = MONTHS[Number.parseInt(month, 10) - 1];
  if (!monthName) {
    throw new Error(`Not a real month: ${isoDate}`);
  }
  return `${Number.parseInt(day, 10)} ${monthName} ${year}`;
}

/** Every `date: '...'` value literal in demo/changelog.ts's source text, in file order. */
export function extractChangelogDates(changelogSource: string): string[] {
  const dates: string[] = [];
  const re = /date:\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(changelogSource)) !== null) {
    const value = m[1];
    if (value !== undefined) dates.push(value);
  }
  return dates;
}

/**
 * True if a single changelog `date` field value covers `label` (a
 * "D Mon YYYY" string) — either as an exact single-day entry, or as either
 * end of a hand-written range. Two range spellings exist in the file today:
 * "4 to 5 Aug 2026" (month/year stated once, at the end) and, defensively,
 * the fully-spelled "1 Aug 2026 to 2 Aug 2026" form. Deliberately not a
 * plain substring test — "5 Aug 2026" is a substring of "4 to 5 Aug 2026",
 * but that would also wrongly match a fabricated "45 Aug 2026".
 */
export function dateFieldCoversLabel(dateField: string, label: string): boolean {
  if (dateField === label) return true;

  if (dateField.endsWith(` to ${label}`) || dateField.startsWith(`${label} to `)) return true;

  // "4 to 5 Aug 2026": a bare leading day number sharing the trailing
  // month/year with the day it is ranged to.
  const shortRange = /^(\d{1,2}) to (\d{1,2}) (\w{3} \d{4})$/.exec(dateField);
  if (shortRange) {
    const [, startDay, endDay, monthYear] = shortRange as unknown as [string, string, string, string];
    if (`${startDay} ${monthYear}` === label || `${endDay} ${monthYear}` === label) return true;
  }

  return false;
}

/** True if any entry in the changelog already covers `label` (a "D Mon YYYY" string). */
export function changelogHasDate(existingDates: readonly string[], label: string): boolean {
  return existingDates.some((d) => dateFieldCoversLabel(d, label));
}

// ── Finding the days the changelog has *missed* ────────────────────────────

const MONTH_INDEX: ReadonlyMap<string, number> = new Map(MONTHS.map((name, i) => [name, i + 1]));

/** "15 Aug 2026" -> "2026-08-15". Null for anything that is not that exact shape. */
export function parseChangelogDateLabel(label: string): string | null {
  const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(label.trim());
  if (!m) return null;
  const [, day, monthName, year] = m as unknown as [string, string, string, string];
  const month = MONTH_INDEX.get(monthName);
  if (month === undefined) return null;
  const dayNum = Number.parseInt(day, 10);
  if (dayNum < 1 || dayNum > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  // Reject impossible calendar days ("31 Feb 2026") by round-tripping.
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

/** Every YYYY-MM-DD from `from` to `to` inclusive, ascending. Empty if `to` precedes `from`. */
function isoDaysBetween(from: string, to: string): string[] {
  if (to < from) return [];
  const out: string[] = [];
  let cursor = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  // A guard rather than a limit: no real changelog range is anywhere near this
  // long, and an unbounded loop on malformed input would hang the nightly run.
  for (let guard = 0; cursor <= end && guard < 1000; guard += 1) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60 * 1000;
  }
  return out;
}

/**
 * Every calendar day a single changelog `date` field claims, as YYYY-MM-DD.
 * Understands the same three spellings `dateFieldCoversLabel` does — a single
 * day, the short range "4 to 5 Aug 2026", and the fully-spelled
 * "1 Aug 2026 to 2 Aug 2026" — and expands a range to every day inside it, so
 * a day sitting in the middle of a range counts as recorded too.
 * Returns [] for anything it cannot read, so an unfamiliar spelling can never
 * silently claim a day it does not describe.
 */
export function changelogDateFieldToIsoDays(dateField: string): string[] {
  const single = parseChangelogDateLabel(dateField);
  if (single) return [single];

  const shortRange = /^(\d{1,2}) to (\d{1,2}) (\w{3} \d{4})$/.exec(dateField.trim());
  if (shortRange) {
    const [, startDay, endDay, monthYear] = shortRange as unknown as [string, string, string, string];
    const from = parseChangelogDateLabel(`${startDay} ${monthYear}`);
    const to = parseChangelogDateLabel(`${endDay} ${monthYear}`);
    if (from && to) return isoDaysBetween(from, to);
    return [];
  }

  const longRange = /^(.+?) to (.+)$/.exec(dateField.trim());
  if (longRange) {
    const from = parseChangelogDateLabel(longRange[1] ?? '');
    const to = parseChangelogDateLabel(longRange[2] ?? '');
    if (from && to) return isoDaysBetween(from, to);
  }

  return [];
}

/** Every calendar day (YYYY-MM-DD) any changelog entry already covers. */
export function coveredChangelogDays(dateFields: readonly string[]): Set<string> {
  const days = new Set<string>();
  for (const field of dateFields) {
    for (const day of changelogDateFieldToIsoDays(field)) days.add(day);
  }
  return days;
}

/** The newest day any changelog entry covers, as YYYY-MM-DD. Null if none parses. */
export function newestCoveredDay(dateFields: readonly string[]): string | null {
  let newest: string | null = null;
  for (const day of coveredChangelogDays(dateFields)) {
    if (newest === null || day > newest) newest = day;
  }
  return newest;
}

export interface UnrecordedWork {
  /** The newest day demo/changelog.ts already covers — the line this search starts from. */
  watermark: string | null;
  /** Days on or after the watermark with commits that no changelog entry covers, oldest first. */
  candidateDays: string[];
  /** Of those, the days that have at least one non-pipeline commit, oldest first. */
  daysWithWork: string[];
  /** The oldest such day: the one this run should be written up. Null if there is none. */
  targetDate: string | null;
}

/**
 * Find every day whose real work the changelog has never recorded, oldest first.
 *
 * ── The bug this replaces ─────────────────────────────────────────────────
 * The original script reported on the newest commit's day and nothing else.
 * A night the nightly run did not produce an entry was therefore lost for
 * good: by the next firing the newest commit had moved on to a later day, and
 * the missed one was never looked at again. Observed for real — 15 and 16 Aug
 * 2026 both had reader-facing work, and both went permanently unrecorded
 * behind a 14 Aug entry.
 *
 * ── Why the search starts at a watermark ──────────────────────────────────
 * The obvious version — "every day with work that is not in the changelog" —
 * would reach all the way back through the project's history and re-raise days
 * that were curated long ago. 8 and 10 Aug 2026, for instance, both have real
 * commits and neither has its own entry, because that work was deliberately
 * folded into neighbouring releases. Those are settled editorial decisions,
 * not gaps.
 *
 * So the search begins at the newest day the changelog covers. Everything at
 * or after that line is genuinely unprocessed; everything before it has
 * already been through the curation this script must not second-guess. The
 * watermark day itself is covered by definition, so it is never a candidate.
 *
 * Nothing here decides what a day's entry should say, and nothing here moves
 * work between days: a commit only ever counts towards the UTC day it was
 * actually committed on.
 */
export function findUnrecordedWorkDays(
  commits: readonly CommitEntry[],
  changelogDateFields: readonly string[],
): UnrecordedWork {
  const covered = coveredChangelogDays(changelogDateFields);
  const watermark = newestCoveredDay(changelogDateFields);

  const commitDays = [...new Set(commits.map((c) => commitUtcDate(c.isoDate)))].sort();
  const candidateDays = commitDays.filter(
    (day) => (watermark === null || day >= watermark) && !covered.has(day),
  );
  const daysWithWork = candidateDays.filter(
    (day) => nonPipelineCommits(commitsOnDate(commits, day)).length > 0,
  );

  return { watermark, candidateDays, daysWithWork, targetDate: daysWithWork[0] ?? null };
}
