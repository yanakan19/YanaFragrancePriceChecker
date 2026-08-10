/**
 * Virtual Yanny: pricesniffs.space's own fragrance chatbot widget.
 *
 * The backend (YanaFreeAPIMerger/, a separate Node service — see its own
 * README and docs/VIRTUAL-YANNY-DEPLOY.md) is not something this static
 * site can run itself. VIRTUAL_YANNY_API_BASE_URL starts blank because that
 * service has nowhere to live yet (an Oracle Cloud VM is provisioning, not
 * live) — the same "absent rather than invented" pattern demo/supabase.ts
 * already uses for the same reason: a guessed or placeholder URL here would
 * make the widget fail on every single use instead of failing once, openly,
 * at the health check. Once the backend is deployed, this is the one line
 * in the whole integration that changes.
 */
const VIRTUAL_YANNY_API_BASE_URL = '';

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
