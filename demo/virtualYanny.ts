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
  /**
   * Why it is not ok, when it is not. Present so the panel can say which of
   * three quite different things went wrong instead of one blanket line —
   * "we could not reach the service" and "the service is up but the model
   * router is rate-limited" need different words and have different
   * lifetimes, and telling them apart from the outside was impossible.
   */
  reason: 'none' | 'not-built' | 'no-answer' | 'not-configured' | 'router-down';
}

const UNAVAILABLE: YannyHealth = {
  ok: false,
  configured: false,
  freellmapiReachable: false,
  agentCount: 0,
  reason: 'no-answer',
};

/**
 * How long the browser waits for /api/health before giving up.
 *
 * This was 6000, and 6000 could not work. The handler on the other end
 * budgets HEALTH_TIMEOUT_MS = 5000 for its own call to the model router
 * (YanaFreeAPIMerger/server/index.js), so six seconds left one second for
 * everything around it: DNS, TLS, a Fly machine resuming from suspend
 * (fly.toml runs min_machines_running = 0, so an idle backend is suspended
 * between readers), Express, two file reads, and the response back. The
 * first reader after a quiet spell lost that race and was told the chatbot
 * was unavailable when it was merely asleep.
 *
 * 15000 clears the server's own 5s ceiling with room for a resume and the
 * round trip, and is still short enough that a genuinely dead backend gives
 * up in a way a person will wait through rather than abandon. It is a
 * client-side bound on somebody else's latency, so it is a judgement, not a
 * measured figure — but the old value was not a judgement, it was smaller
 * than the timeout it was waiting on.
 *
 * fly.toml's [http_service] comment offers the other lever for this exact
 * symptom: min_machines_running = 1, which keeps a machine warm. That costs
 * a machine running 24/7 and would still leave only one second of margin
 * once the router itself is slow, so it is the fallback, not the fix.
 */
const HEALTH_TIMEOUT_MS = 15000;

/**
 * Run every time the popup opens, never assumed from a previous check — see
 * the panel's own comment in app.ts. Confirms both that this backend is
 * reachable at all and that it can in turn reach FreeLLMAPI, since a
 * listening server with a dead router behind it would otherwise look
 * healthy right up until the first real question hung or failed.
 */
export async function checkYannyHealth(): Promise<YannyHealth> {
  if (!VIRTUAL_YANNY_CONFIGURED) return { ...UNAVAILABLE, reason: 'not-built' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/health'), { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return UNAVAILABLE;
    const body = (await res.json()) as Partial<YannyHealth>;
    const configured = body.configured === true;
    const freellmapiReachable = body.freellmapiReachable === true;
    const ok = body.ok === true;
    return {
      ok,
      configured,
      freellmapiReachable,
      agentCount: typeof body.agentCount === 'number' ? body.agentCount : 0,
      // Order matters: an unconfigured backend also reports the router
      // unreachable, and naming the router there would send someone to
      // debug a third party's rate limit over a missing key.
      reason: ok ? 'none' : !configured ? 'not-configured' : !freellmapiReachable ? 'router-down' : 'no-answer',
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
 *
 * ── `signal`, and what aborting it actually stops ────────────────────────
 * Passed straight to `fetch`, which is the only thing that makes the stop
 * button in demo/app.ts mean anything: aborting a `fetch` errors the
 * response body stream and closes the underlying connection, so the browser
 * stops reading and the socket to the backend goes away. It is a real
 * teardown, not a flag the UI checks. The `reader.cancel()` below is
 * belt-and-braces for the case where the abort lands between two reads.
 *
 * What it does not do on its own is stop the *server* working. The council
 * fans one question out to every configured agent model, and those calls
 * would run to completion into a socket nobody is reading. The backend
 * change that pairs with this — server/index.js aborting the council when
 * the request closes — is what makes the far half true, and it only takes
 * effect once that service is redeployed.
 *
 * Once aborted, nothing further is emitted: the caller already knows it
 * stopped, so an `error` event on the way out would only be noise it has to
 * filter back out. A promise that resolves with no terminal event having
 * been delivered is the abort signature.
 */
export async function askVirtualYanny(
  message: string,
  intent: YannyIntent | null,
  onEvent: (event: YannyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;

  let res: Response;
  try {
    res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, intent }),
      // `?? null` rather than passing the optional straight through:
      // tsconfig.demo.json runs exactOptionalPropertyTypes, under which
      // RequestInit.signal accepts an AbortSignal or null but not an
      // explicit undefined. null is what "no signal" means to fetch anyway.
      signal: signal ?? null,
    });
  } catch {
    if (signal?.aborted) return;
    onEvent({ type: 'error', message: 'Could not reach Virtual Yanny. Check your connection and try again.' });
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}) as { message?: string });
    if (signal?.aborted) return;
    onEvent({ type: 'error', message: body.message ?? 'Something went wrong.' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal?.aborted) return;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const raw of events) {
        // Checked per event rather than per chunk: one read can carry
        // several events, and a stop pressed part-way through that batch
        // must not still push the remaining ones into a thread the reader
        // has already been told is finished.
        if (signal?.aborted) return;
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
  } catch {
    // An aborted fetch rejects here, and for the stop button that is the
    // expected path rather than a fault: say nothing. A genuine mid-stream
    // drop is a different thing and the reader does need telling, because
    // the panel would otherwise sit on a spinner no event will ever clear.
    if (signal?.aborted) return;
    onEvent({ type: 'error', message: 'The connection to Virtual Yanny dropped part-way through. Try that again.' });
  } finally {
    // Releases the reader's lock and tears the body stream down on every
    // exit path, the ordinary one included. Cancelling an already-cancelled
    // stream rejects, which is not a fault worth reporting.
    void reader.cancel().catch(() => {});
  }
}
