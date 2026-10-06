// Types for scripts/deploy-watchdog.mjs, which stays plain JavaScript so the
// deploy workflow's `decide` job can run it before `npm ci`.
export const STUCK_AFTER_MINUTES: number;
export interface WatchedRun { id: number | string; run_number: number }
export interface WatchedJob { name: string; status: string; runner_name?: string | null; created_at: string }
export function stuckRuns(input: {
  runs: WatchedRun[];
  jobsOf: (id: number) => WatchedJob[] | undefined;
  ownRunId: number | string | undefined;
  now: number;
  minutes?: number;
}): { id: number | string; number: number; reason: string }[];
