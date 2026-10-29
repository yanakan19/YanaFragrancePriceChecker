/**
 * `softIt` and `softly`: a data check whose failed assertion is a finding, not a
 * failure, in the crawl (and only there). See scripts/softTestReport.ts for why.
 *
 *   softIt('unisex-twin', 'lists no "Unisex" name beside the same name without it', () => { ... });
 *
 *   it('shows only pictures a shop owns', () => {
 *     expect(ownFolderFiles).toEqual([]);                       // structure: always hard
 *     softly('region-picture-strangers', () => {                // one odd listing: soft
 *       expect(strangers).toEqual([]);
 *     });
 *   });
 *
 * Outside the crawl (SOFT_TEST_FINDINGS unset: a developer's machine, every push,
 * a pull request) both are strict, exactly the plain assertions. In the crawl
 * only an AssertionError is softened; any other error is a real failure. Use it
 * for a check that judges what shops listed. Never for a structural guard: an
 * append only memory, an id alias, the sitemap answering 200, the deploy budget,
 * or a build that must not break. A `check` name is unique within its file.
 */
import { expect, it } from 'vitest';
import { recordFinding } from '../../scripts/softTestReport.js';

export function softPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const p = env.SOFT_TEST_FINDINGS;
  return typeof p === 'string' && p !== '' ? p : null;
}

export function isAssertion(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AssertionError' || /^AssertionError/.test(e.constructor.name));
}

function repoRelative(path: string | undefined): string {
  const p = (path ?? 'unknown').replace(/\\/g, '/');
  const i = p.lastIndexOf('/tests/');
  return i >= 0 ? p.slice(i + 1) : p;
}

/** Rethrows unless this is an assertion failing in the crawl, where it becomes a finding. */
function soften(check: string, title: string | undefined, e: unknown): void {
  const path = softPath();
  if (path === null || !isAssertion(e)) throw e;
  const state = expect.getState();
  const file = repoRelative(state.testPath);
  const message = (e as Error).message;
  recordFinding(path, { check, file, title: title ?? state.currentTestName ?? check, message });
  console.log(`::warning file=${file}::soft data check "${check}" found something (the crawl goes on): ${message.replace(/\s+/g, ' ').slice(0, 300)}`);
}

/** Runs the assertions; in the crawl a failed one is recorded and the test goes on. */
export function softly(check: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    soften(check, undefined, e);
  }
}

export function softIt(check: string, title: string, fn: () => void | Promise<void>, timeout?: number): void {
  it(
    title,
    async () => {
      try {
        await fn();
      } catch (e) {
        soften(check, title, e);
      }
    },
    timeout,
  );
}
