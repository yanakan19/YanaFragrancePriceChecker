import { buildSystemPrompt } from '../../../demo/yanny/prompt.js';
import { groundednessScore } from '../../../demo/yanny/scoring.js';

/**
 * Virtual Yanny's model path: a Cloudflare Worker that holds the provider
 * keys and forwards one grounded question to a small set of free-tier
 * models, returning the first answer that passes the groundedness gate.
 *
 * ── What this replaced ───────────────────────────────────────────────────
 * Until 2026-09-06 every question went to an Express service on Fly.io,
 * which resumed a suspended machine, parsed a 15 MB catalogue, fanned the
 * question out to 28 models behind a shared free-tier router (itself on
 * Fly), waited for a quorum, ranked the answers and sent one back. Two
 * paid machines and four network hops for a question that, eleven times in
 * thirteen, was a catalogue lookup the page could do itself. The lookups
 * now run in the browser (demo/yanny/); only `suggest` and `general` come
 * here, with their SITE DATA block already built.
 *
 * This runs on Cloudflare's free plan: no server to keep warm, no cold
 * start worth measuring, no card on file. Calls go straight to each
 * provider's own OpenAI-compatible endpoint with the owner's own free-tier
 * key — no router in between.
 *
 * ── What it does not trust ───────────────────────────────────────────────
 * The browser builds the SITE DATA block, so a caller can send any text as
 * "site data". That can only make the model answer *their own* question
 * wrongly; it cannot reach anyone else's screen. What it must not become
 * is a free proxy for the owner's keys, so: the Origin must be one this
 * site is served from, the body is capped, every request is rate limited
 * per IP, the system prompt is fixed here and not accepted from the body,
 * `max_tokens` is capped, and every provider call is bounded by a timeout.
 *
 * ── No third-party key is needed ─────────────────────────────────────────
 * The default provider is `workers-ai`: Cloudflare's own inference, reached
 * through the `AI` binding declared in wrangler.toml rather than over HTTP
 * with somebody else's API key. Cloudflare gives every account, including a
 * free one with no card on file, 10,000 Neurons a day at no charge
 * (developers.cloudflare.com/workers-ai/platform/pricing, read 2026-09-08),
 * which is far past what this widget's two model-bound intents will spend.
 *
 * That matters beyond convenience: the owner asked for everything to run
 * free, and a setup that needs a Groq account and a Google AI Studio
 * account before the chat answers anything is three sign-ups where one
 * would do. The HTTP providers below are kept because they are genuinely
 * useful as a second string — if the daily allocation runs out, a
 * configured Groq key answers instead — but every one of them is optional
 * and none is configured by default.
 *
 * ── Configuration ────────────────────────────────────────────────────────
 * Vars (wrangler.toml [vars], public):
 *   YANNY_MODELS    JSON list of {provider, model}. Providers: workers-ai
 *                   (the binding), groq, gemini, cerebras, openrouter, custom.
 *   ALLOWED_ORIGINS comma-separated origins allowed to call /api/chat.
 * Secrets (`wrangler secret put`, never in the repo, all optional):
 *   GROQ_API_KEY, GEMINI_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY,
 *   CUSTOM_BASE_URL + CUSTOM_API_KEY (any other OpenAI-compatible endpoint).
 * Bindings: AI (Cloudflare's inference, `[ai]` in wrangler.toml) and,
 *   optionally, RATE — a Workers rate-limit binding.
 */

export const PROVIDERS = {
  /** Cloudflare's own inference. No base URL and no key: it is a binding on
   *  `env`, so there is nothing to authenticate and nothing to leak. */
  'workers-ai': { binding: 'AI' },
  groq: { baseUrl: 'https://api.groq.com/openai/v1', keyVar: 'GROQ_API_KEY' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyVar: 'GEMINI_API_KEY' },
  cerebras: { baseUrl: 'https://api.cerebras.ai/v1', keyVar: 'CEREBRAS_API_KEY' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', keyVar: 'OPENROUTER_API_KEY' },
  custom: { baseUrl: null, keyVar: 'CUSTOM_API_KEY' },
};

/** Fallback when YANNY_MODELS is unset or unparseable: Cloudflare's own
 *  inference alone, so a Worker deployed with no secrets at all still
 *  answers. The model id is one Cloudflare serves in its catalogue as of
 *  2026-09-08; /api/health reports an id that has since been retired. */
export const DEFAULT_MODELS = [{ provider: 'workers-ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }];

const QUESTION_MAX = 500;
const SITE_DATA_MAX = 16_000;
const MAX_TOKENS = 220;
const MODEL_TIMEOUT_MS = 12_000;
const HEALTH_TIMEOUT_MS = 4_000;
const HEALTH_CACHE_MS = 60_000;
/** Below this groundedness the answer is held back in favour of the next
 *  model's, unless every model's fails, in which case the best is sent
 *  marked `grounded:false`. */
const GROUNDED_FLOOR = 60;
const INTENTS = new Set(['price', 'suggest', 'general']);

/* ── configuration ─────────────────────────────────────────────────────── */

export function configuredModels(env) {
  let list = DEFAULT_MODELS;
  if (env.YANNY_MODELS) {
    try {
      const parsed = JSON.parse(env.YANNY_MODELS);
      if (Array.isArray(parsed) && parsed.length) list = parsed;
    } catch {
      /* fall back to the defaults; health reports the parse failure */
    }
  }
  return list
    .filter((m) => m && typeof m.model === 'string' && PROVIDERS[m.provider])
    .map((m) => {
      const p = PROVIDERS[m.provider];
      // A binding provider is usable when the binding is bound; an HTTP one
      // when it has both an endpoint and a key. Neither can stand in for the
      // other, so they are built as two different shapes rather than one
      // shape with empty fields.
      if (p.binding) return { provider: m.provider, model: m.model, ai: env[p.binding] ?? null };
      const baseUrl = m.provider === 'custom' ? env.CUSTOM_BASE_URL : p.baseUrl;
      return { provider: m.provider, model: m.model, baseUrl, apiKey: env[p.keyVar] ?? '' };
    })
    .filter((m) => (PROVIDERS[m.provider].binding ? Boolean(m.ai) : Boolean(m.baseUrl && m.apiKey)));
}

export function allowedOrigins(env) {
  return new Set(
    String(env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? corsHeaders(origin) : {}) },
  });
}

/* ── health ────────────────────────────────────────────────────────────── */

let healthCache = { at: 0, body: null };

async function providerReachable(m) {
  // A binding is either bound or it is not, and `configuredModels` has
  // already dropped it if it is not. Deliberately NOT probed with a real
  // generation: /api/health runs every time a reader opens the chat panel,
  // and spending a day's free allocation on health checks would take the
  // service down in exactly the way the check exists to report. So this
  // reports what is genuinely knowable for free — the binding is there —
  // and a day's allocation actually running out surfaces on the question
  // itself, where the widget already says so plainly.
  if (PROVIDERS[m.provider].binding) return true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${m.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${m.apiKey}` },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function health(env, { now = Date.now(), fetchImpl } = {}) {
  if (healthCache.body && now - healthCache.at < HEALTH_CACHE_MS) return healthCache.body;
  const models = configuredModels(env);
  const configured = models.length > 0;
  const checks = await Promise.all(models.map((m) => (fetchImpl ? fetchImpl(m) : providerReachable(m))));
  const providers = models.map((m, i) => ({ provider: m.provider, model: m.model, ok: checks[i] }));
  const reachable = providers.filter((p) => p.ok).length;
  const body = {
    ok: configured && reachable > 0,
    configured,
    providersReachable: reachable,
    agentCount: models.length,
    providers,
  };
  healthCache = { at: now, body };
  return body;
}

/* ── one model call ────────────────────────────────────────────────────── */

export async function callModel(m, messages, signal) {
  if (PROVIDERS[m.provider].binding) return callBoundModel(m, messages, signal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  const onOuter = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onOuter, { once: true });
  const startedAt = Date.now();
  try {
    const res = await fetch(`${m.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m.apiKey}` },
      body: JSON.stringify({ model: m.model, messages, temperature: 0.4, max_tokens: MAX_TOKENS }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) throw new Error('empty completion');
    return { ok: true, provider: m.provider, model: m.model, content, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      provider: m.provider,
      model: m.model,
      error: err?.name === 'AbortError' ? 'timed out or cancelled' : String(err?.message ?? err),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuter);
  }
}

/**
 * Cloudflare's own inference, through the binding.
 *
 * No fetch, no key, no base URL — `env.AI.run` is a method on an object the
 * runtime hands the Worker. It takes the same `messages` array the HTTP
 * providers take and returns `{ response }` rather than OpenAI's
 * `choices[0].message.content`, which is the whole of the difference.
 *
 * The binding takes no AbortSignal, so a caller that goes away (the reader
 * pressing stop) cannot tear this call down mid-flight the way it can an
 * HTTP one. What it can do is decline the answer, which is what the check
 * after the await is for: the work finishes and is dropped rather than
 * reaching a socket nobody is reading.
 */
async function callBoundModel(m, messages, signal) {
  const startedAt = Date.now();
  try {
    const out = await m.ai.run(m.model, { messages, temperature: 0.4, max_tokens: MAX_TOKENS });
    if (signal?.aborted) throw new Error('cancelled');
    const content = String(out?.response ?? '').trim();
    if (!content) throw new Error('empty completion');
    return { ok: true, provider: m.provider, model: m.model, content, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      provider: m.provider,
      model: m.model,
      error: String(err?.message ?? err),
      latencyMs: Date.now() - startedAt,
    };
  }
}

/* ── the race ──────────────────────────────────────────────────────────── */

/**
 * Asks every configured model at once and settles on the first answer
 * that passes the groundedness gate, aborting the rest. If none passes,
 * the best-scoring one is returned marked `grounded: false` so the widget
 * can say so. `onEvent` receives progress the same way the old council's
 * SSE did (`status`, `agent`), so the widget's splash needs no new shapes.
 *
 * `call` is injectable for tests.
 */
export async function race({ models, messages, siteData, onEvent, signal, call = callModel }) {
  const emit = (type, data) => onEvent?.({ type, ...data });
  emit('status', { message: `Asking ${models.length === 1 ? 'the model' : `${models.length} models`}…` });

  const abort = new AbortController();
  const onCaller = () => abort.abort();
  if (signal?.aborted) abort.abort();
  else signal?.addEventListener('abort', onCaller, { once: true });

  const answers = [];
  let resolveDone = () => {};
  const done = new Promise((r) => {
    resolveDone = r;
  });
  let winner = null;
  let settled = 0;

  const tasks = models.map((m, i) =>
    call(m, messages, abort.signal).then((result) => {
      settled += 1;
      const agentNumber = i + 1;
      emit('agent', { agentNumber, ok: result.ok, message: result.ok ? `Model ${agentNumber} has answered.` : `Model ${agentNumber} could not answer.` });
      if (result.ok) {
        const grounded = groundednessScore(result.content, siteData);
        answers.push({ ...result, agentNumber, grounded });
        if (!winner && grounded >= GROUNDED_FLOOR) {
          winner = answers[answers.length - 1];
          resolveDone();
        }
      }
      if (settled === models.length) resolveDone();
    }),
  );

  await Promise.race([Promise.all(tasks), done]);
  signal?.removeEventListener('abort', onCaller);
  if (!winner && !signal?.aborted) {
    // Nothing passed the gate: the best of what did answer, flagged.
    winner = [...answers].sort((a, b) => b.grounded - a.grounded)[0] ?? null;
  }
  abort.abort();

  if (signal?.aborted) return { ok: false, error: 'cancelled' };
  if (!winner) return { ok: false, error: 'no_agents_responded', agentCount: models.length };

  return {
    ok: true,
    source: 'model',
    winner: { agentNumber: winner.agentNumber, content: winner.content, totalScore: winner.grounded, criteriaScores: { groundedness: winner.grounded }, rank: 1 },
    grounded: winner.grounded >= GROUNDED_FLOOR,
    agentCount: models.length,
    respondedCount: answers.length,
    timings: { winnerMs: winner.latencyMs },
  };
}

/* ── request handling ──────────────────────────────────────────────────── */

export function validateChatBody(body) {
  if (!body || typeof body !== 'object') return 'body must be a JSON object';
  const { question, intent, siteData } = body;
  if (typeof question !== 'string' || !question.trim()) return 'question is required';
  if (question.length > QUESTION_MAX) return `question is longer than ${QUESTION_MAX} characters`;
  if (typeof siteData !== 'string' || !siteData.trim()) return 'siteData is required';
  if (siteData.length > SITE_DATA_MAX) return `siteData is longer than ${SITE_DATA_MAX} characters`;
  if (intent !== undefined && !INTENTS.has(intent)) return 'intent must be price, suggest or general';
  return null;
}

async function rateLimited(env, request) {
  if (!env.RATE) return false;
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
  try {
    const { success } = await env.RATE.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') ?? '';
    const allowed = allowedOrigins(env);
    const originOk = allowed.has(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: originOk ? corsHeaders(origin) : {} });
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json(await health(env), 200, originOk ? origin : null);
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      if (!originOk) return json({ error: 'forbidden', message: 'This origin may not use the chat.' }, 403, null);
      if (await rateLimited(env, request)) {
        return json({ error: 'rate_limited', message: 'Too many questions from this connection. Try again in a minute.' }, 429, origin);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'bad_request', message: 'body must be JSON' }, 400, origin);
      }
      const problem = validateChatBody(body);
      if (problem) return json({ error: 'bad_request', message: problem }, 400, origin);

      const models = configuredModels(env);
      if (models.length === 0) {
        return json(
          { error: 'not_configured', message: 'No model provider is configured on the chat service. The AI binding is missing and no provider key is set.' },
          503,
          origin,
        );
      }

      const messages = [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'system', content: `SITE DATA:\n${body.siteData}` },
        { role: 'user', content: body.question },
      ];

      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const send = (event) => writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {});

      const aborter = new AbortController();
      request.signal?.addEventListener('abort', () => aborter.abort(), { once: true });

      (async () => {
        try {
          const result = await race({ models, messages, siteData: body.siteData, onEvent: send, signal: aborter.signal });
          if (!aborter.signal.aborted) await send({ type: 'result', result });
        } catch (err) {
          await send({ type: 'error', message: String(err?.message ?? err) });
        } finally {
          await writer.close().catch(() => {});
        }
      })();

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders(origin),
        },
      });
    }

    return json({ error: 'not_found' }, 404, originOk ? origin : null);
  },
};
