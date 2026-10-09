// Types for scripts/deploy-decision.mjs, which stays plain JavaScript so the
// deploy workflow's `decide` job can run it before `npm ci`.
export const SITE: string;
export const STATE_FILE: string;
export const NOT_PAGE_FOLDERS: readonly string[];
export const COUNTS_ANYWAY: readonly string[];
export const PAGE_DATA_FOLDERS: readonly string[];
export function canChangePage(path: string): boolean;
export function supabasePublic(source?: string): { url: string; key: string };
export function overridesFingerprint(rows: unknown): string;
export interface LiveState { commit: string; overrides?: string; builtAt?: string }
type Fetch = (url: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export function readOverrides(fetchImpl?: Fetch): Promise<string>;
export function readLiveState(fetchImpl?: Fetch, bust?: string): Promise<LiveState | null>;
export function decide(input: {
  event: string;
  tip: string;
  overrides: string;
  live: LiveState | null;
  changedPaths: (from: string, to: string) => string[] | null;
}): { deploy: boolean; reason: string };
