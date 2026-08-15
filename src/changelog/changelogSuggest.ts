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
 * The date this run should report on: the UTC calendar date of the most
 * recent commit on the (now-verified-fresh) tree — never the live clock.
 *
 * Commits is expected newest-first, i.e. straight from `git log` with no
 * `--reverse`. Automated pipeline commits land roughly hourly, so on a fresh
 * tree the newest commit's date is "today" in every case that matters; the
 * one case it deliberately does NOT paper over is a tree where nothing has
 * committed in a long time — then it reports on whatever day the last real
 * commit happened, which is the honest answer, not today's blank one.
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
