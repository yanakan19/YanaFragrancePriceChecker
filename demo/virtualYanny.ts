/**
 * Virtual Yanny: pricesniffs.space's own fragrance chatbot widget.
 *
 * ── Where an answer comes from ───────────────────────────────────────────
 * Two places, and the reader's browser decides which:
 *
 *   1. The page itself. demo/index.html inlines the whole catalogue, and
 *      demo/yanny/ (the engine that used to run on a server) is bundled
 *      beside it. Prices, stock, sizes, notes, delivery, deals, budgets,
 *      comparisons, brand coverage and questions about the site are looked
 *      up here, in a few milliseconds, with no request of any kind. Nothing
 *      the reader types leaves the browser for these.
 *
 *   2. A small Cloudflare Worker (workers/yanny/), for the two question
 *      shapes whose answer is a model's phrasing — "something sweet, no
 *      florals", "do you have anything nice" — and for questions about the
 *      site's own policy pages. The browser builds the SITE DATA block from
 *      its own catalogue first, so the Worker holds no data at all: it
 *      holds the provider keys and forwards one grounded question.
 *
 * Until 2026-09-06 everything went to an Express service on Fly.io (see
 * the header of demo/yanny/siteData.js for what that cost and why it went).
 *
 * ── The base URL ─────────────────────────────────────────────────────────
 * Blank until the Worker has been deployed and reported healthy — the same
 * "absent rather than invented" pattern demo/supabase.ts uses, because a
 * guessed URL makes the model path fail on every use instead of failing
 * once, openly, in the panel. The catalogue answers work regardless.
 *
 * Set it to the URL `npx wrangler deploy --config workers/yanny/wrangler.toml`
 * prints (https://<name>.<subdomain>.workers.dev), run `npm run demo`, and
 * commit. docs/VIRTUAL-YANNY-DEPLOY.md has the whole path.
 *
 * The `: string` is load-bearing: without it TypeScript infers the literal
 * type and the `!== ''` check below becomes a compile-time constant, which
 * tsconfig.demo.json rejects. This line is meant to be edited.
 */
import { classifyIntent } from './yanny/intent.js';
import { resolveQuestion } from './yanny/engine.js';
import { warmProductIndex } from './yanny/siteData.js';

const VIRTUAL_YANNY_API_BASE_URL: string = '';

/** Whether the model path has somewhere to go. The catalogue path always works. */
export const VIRTUAL_YANNY_CONFIGURED = VIRTUAL_YANNY_API_BASE_URL !== '';

function apiUrl(path: string): string {
  return `${VIRTUAL_YANNY_API_BASE_URL}${path}`;
}

export interface YannyHealth {
  ok: boolean;
  configured: boolean;
  providersReachable: number;
  agentCount: number;
  /**
   * Why it is not ok, when it is not, so the panel can say which of three
   * quite different things is true rather than one blanket line:
   * 'not-built' (no Worker URL in this build), 'no-answer' (the Worker did
   * not respond), 'not-configured' (it responded but has no provider key),
   * 'router-down' (keys present, no provider reachable right now).
   */
  reason: 'none' | 'not-built' | 'no-answer' | 'not-configured' | 'router-down';
}

const UNAVAILABLE: YannyHealth = { ok: false, configured: false, providersReachable: 0, agentCount: 0, reason: 'no-answer' };

/** A Worker answers a cached health check in well under a second; this is a
 *  bound on a bad network, not on the service. */
const HEALTH_TIMEOUT_MS = 8000;

/**
 * Whether the model path is up. Run when the panel opens; it gates only
 * the model path — the composer is usable for catalogue questions whatever
 * this says, and the panel shows the result as one status line.
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
    const providersReachable = typeof body.providersReachable === 'number' ? body.providersReachable : 0;
    const ok = body.ok === true;
    return {
      ok,
      configured,
      providersReachable,
      agentCount: typeof body.agentCount === 'number' ? body.agentCount : 0,
      reason: ok ? 'none' : !configured ? 'not-configured' : providersReachable === 0 ? 'router-down' : 'no-answer',
    };
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Gets the first question's cost out of the way before it is asked.
 *
 * The product index (demo/yanny/productMatch.js) is built once per page,
 * on the first question, and that build is the only part of a catalogue
 * answer that takes longer than a few milliseconds. Building it when the
 * pointer reaches the launcher, or the launcher takes focus, moves that
 * behind the reader deciding to click. Throttled to once a minute so a
 * pointer sweeping the corner of the page cannot turn into a stream of
 * requests to the Worker's health endpoint, which is also pinged here so a
 * cold isolate is warm by the time a model question arrives.
 *
 * Deliberately inert: nothing here sets state or is read back.
 */
let lastWarmedAt = 0;
const WARM_INTERVAL_MS = 60_000;

export function warmVirtualYanny(): void {
  const now = Date.now();
  if (now - lastWarmedAt < WARM_INTERVAL_MS) return;
  lastWarmedAt = now;
  void warmProductIndex().catch(() => {});
  if (!VIRTUAL_YANNY_CONFIGURED) return;
  try {
    void fetch(apiUrl('/api/health'), { cache: 'no-store' }).catch(() => {});
  } catch {
    /* some environments throw synchronously; same outcome */
  }
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
  /** 'site-data-direct' — answered from the page's own catalogue, no
   *  request made; 'model' — an AI model wrote it from that data. */
  source?: 'site-data-direct' | 'model';
  /** Model answers only: whether the answer passed the groundedness gate. */
  grounded?: boolean;
  agentCount?: number;
  respondedCount?: number;
}
export type YannyEvent =
  | { type: 'status'; message: string }
  | { type: 'agent'; agentNumber: number; ok: boolean; message: string }
  | { type: 'result'; result: YannyResult }
  | { type: 'error'; message: string };

export type YannyIntent = 'price' | 'suggest' | 'general';

/** What the engine hands back when a question needs a model. Typed here
 *  because the engine is plain JavaScript. */
interface EngineResult {
  ok: boolean;
  source: 'site-data-direct' | 'model';
  intent: string;
  winner?: YannyMatrixRow;
  siteData?: string;
}

const MODEL_PATH_MISSING =
  "That one needs the AI side of me, which isn't connected in this build yet. " +
  'I can still answer prices, stock, sizes, notes, delivery, deals, budgets and comparisons from the catalogue.';

/**
 * Answers one question, calling `onEvent` for each step as it happens —
 * the status line, then the result — so the panel shows real progress.
 *
 * The catalogue path never touches the network and cannot fail for network
 * reasons; it is a local computation that ends in a `result`. The model
 * path streams Server-Sent Events from the Worker. `signal` is the stop
 * button: aborting it tears down the `fetch`, which closes the connection,
 * which is what tells the Worker to abort its own provider calls. Once
 * aborted, nothing further is emitted.
 */
export async function askVirtualYanny(
  message: string,
  intent: YannyIntent | null,
  onEvent: (event: YannyEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  onEvent({ type: 'status', message: 'Looking that up in the catalogue…' });

  let local: EngineResult;
  try {
    local = (await resolveQuestion({ question: message, intent: intent ?? classifyIntent(message) })) as EngineResult;
  } catch {
    if (signal?.aborted) return;
    onEvent({ type: 'error', message: 'Something went wrong looking that up. Try asking it another way.' });
    return;
  }
  if (signal?.aborted) return;

  if (local.source === 'site-data-direct' && local.winner) {
    onEvent({ type: 'result', result: { ok: true, source: 'site-data-direct', winner: local.winner } });
    return;
  }

  if (!VIRTUAL_YANNY_CONFIGURED) {
    onEvent({
      type: 'result',
      result: { ok: true, source: 'site-data-direct', winner: { agentNumber: 0, content: MODEL_PATH_MISSING, totalScore: 0, criteriaScores: {}, rank: 1 } },
    });
    return;
  }

  onEvent({ type: 'status', message: 'Asking the AI, with the catalogue in front of it…' });

  let res: Response;
  try {
    res = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: message, intent: local.intent, siteData: local.siteData }),
      // `?? null` rather than passing the optional straight through:
      // tsconfig.demo.json runs exactOptionalPropertyTypes, under which
      // RequestInit.signal accepts an AbortSignal or null but not an
      // explicit undefined. null is what "no signal" means to fetch anyway.
      signal: signal ?? null,
    });
  } catch {
    if (signal?.aborted) return;
    onEvent({ type: 'error', message: 'Could not reach the AI side of Virtual Yanny. Catalogue questions still work; try this one again in a moment.' });
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
