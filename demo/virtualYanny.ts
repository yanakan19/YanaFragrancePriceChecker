/**
 * Virtual Yanny: pricesniffs.space's own fragrance chatbot widget.
 *
 * The backend (YanaFreeAPIMerger/, a separate Node service — see its own
 * README and docs/VIRTUAL-YANNY-DEPLOY.md) is not something this static
 * site can run itself. This value shipped blank until the backend had
 * somewhere to live — the same "absent rather than invented" pattern
 * demo/supabase.ts uses, because a guessed or placeholder URL makes the
 * widget fail on every single use instead of failing once, openly, at the
 * health check below.
 *
 * Live since 2026-08-13. Set to the app deployed by
 * .github/workflows/deploy-yanny.yml, whose name comes from
 * YanaFreeAPIMerger/fly.toml and whose hostname is always <app>.fly.dev.
 *
 * Normally this line is written by deploy/set-yanny-api-base-url.sh, which
 * refuses to write a URL it has not just seen report itself healthy. That
 * script could not run where this edit was made — the environment has no
 * outbound network, and the health request 403s at its proxy before it
 * leaves. What stands in its place is the same check, made from a machine
 * that does have network: run 2 of the deploy workflow (job 94432961781,
 * commit 600ada3, 2026-08-13T11:30) passed step "Verify the deployed
 * backend reports healthy", which exits non-zero unless the response body
 * reports ok, configured and freellmapiReachable all true. It passed on its
 * first poll. Nobody here has fetched this host; that job has.
 *
 * If it ever needs repointing, prefer the script over editing this by hand.
 *
 * The `: string` is load-bearing, not decoration. Without it TypeScript
 * infers the literal type of whatever is on the right, and the check below
 * — the one that decides whether the widget even tries — becomes a
 * comparison between two literals that the compiler can settle on its own.
 * That is an error under tsconfig.demo.json, so the site stops building the
 * moment this stops being blank. Annotating it keeps the value a plain
 * string and the check a real runtime question, which is what it is: this
 * line is meant to be edited.
 */
const VIRTUAL_YANNY_API_BASE_URL: string = 'https://pricesniffs-yanny.fly.dev';

export const VIRTUAL_YANNY_CONFIGURED = VIRTUAL_YANNY_API_BASE_URL !== '';

function apiUrl(path: string): string {
  return `${VIRTUAL_YANNY_API_BASE_URL}${path}`;
}

export interface YannyHealth {
  ok: boolean;
  configured: boolean;
  freellmapiReachable: boolean;
  agentCount: number;
}

const UNAVAILABLE: YannyHealth = { ok: false, configured: false, freellmapiReachable: false, agentCount: 0 };

/**
 * Run every time the popup opens, never assumed from a previous check — see
 * the panel's own comment in app.ts. Confirms both that this backend is
 * reachable at all and that it can in turn reach FreeLLMAPI, since a
 * listening server with a dead router behind it would otherwise look
 * healthy right up until the first real question hung or failed.
 */
export async function checkYannyHealth(): Promise<YannyHealth> {
  if (!VIRTUAL_YANNY_CONFIGURED) return UNAVAILABLE;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/health'), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return UNAVAILABLE;
    const body = (await res.json()) as Partial<YannyHealth>;
    return {
      ok: body.ok === true,
      configured: body.configured === true,
      freellmapiReachable: body.freellmapiReachable === true,
      agentCount: typeof body.agentCount === 'number' ? body.agentCount : 0,
    };
  } catch {
    return UNAVAILABLE;
  }
}

export interface YannyCriterion {
  key: string;
  weight: number;
  describe: string;
}
export interface YannyMatrixRow {
  agentNumber: number;
  content: string;
  totalScore: number;
  criteriaScores: Record<string, number>;
  rank: number;
}
export interface YannyResult {
  ok: boolean;
  error?: string;
  winner?: YannyMatrixRow;
  criteria?: YannyCriterion[];
  matrix?: YannyMatrixRow[];
  agentCount?: number;
  respondedCount?: number;
  failedCount?: number;
}
export type YannyEvent =
  | { type: 'status'; message: string }
  | { type: 'agent'; agentNumber: number; ok: boolean; message: string }
  | { type: 'result'; result: YannyResult }
  | { type: 'error'; message: string };

export type YannyIntent = 'price' | 'suggest' | 'general';

/**
 * Streams the council's progress via Server-Sent Events, calling `onEvent`
 * for each one as it arrives — the splash sequence, each agent chip, and
 * finally the ranked result all come through this one callback rather than
 * a single awaited response, so the UI can show real progress instead of a
 * blank wait.
 */
export async function askVirtualYanny(
  message: string,
  intent: YannyIntent | null,
  onEvent: (event: YannyEvent) => void,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, intent }),
    });
  } catch {
    onEvent({ type: 'error', message: 'Could not reach Virtual Yanny. Check your connection and try again.' });
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}) as { message?: string });
    onEvent({ type: 'error', message: body.message ?? 'Something went wrong.' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const raw of events) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as YannyEvent);
      } catch {
        // A malformed chunk mid-stream is not worth surfacing as an error to
        // a reader already partway through a conversation.
      }
    }
  }
}
