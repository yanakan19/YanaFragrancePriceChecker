import { test } from 'vitest';
import assert from 'node:assert/strict';
import worker, { allowedOrigins, configuredModels, health, race, validateChatBody, DEFAULT_MODELS } from '../../workers/yanny/src/index.js';

/**
 * The Worker's own logic, exercised without a network: which models are
 * configured from which env, which origins may call it, what a body must
 * look like, and — the part that matters — how the race between models
 * settles on an answer. `call` and `fetchImpl` are injected so nothing
 * here reaches a provider; what is asserted is the decision, not a model.
 */

const SITE_DATA = 'ABOUT THIS SITE: test.\n\nNOTE MATCHED CANDIDATES (requested: Vanilla):\nHouse Bottle (Eau de Parfum) — shares: Vanilla — notes on file: Vanilla, Musk. Cheapest £42.00.';

/* ── configuration ─────────────────────────────────────────────────────── */

test('configuredModels: only providers with a key are used, in the configured order', () => {
  const env = {
    YANNY_MODELS: JSON.stringify([
      { provider: 'groq', model: 'a' },
      { provider: 'gemini', model: 'b' },
      { provider: 'cerebras', model: 'c' },
    ]),
    GROQ_API_KEY: 'k1',
    CEREBRAS_API_KEY: 'k3',
  };
  const models = configuredModels(env);
  assert.deepEqual(models.map((m) => [m.provider, m.model]), [['groq', 'a'], ['cerebras', 'c']]);
  assert.ok(models.every((m) => m.baseUrl.startsWith('https://')));
});

test('configuredModels: a custom endpoint needs both its URL and key; unparseable YANNY_MODELS falls back to the defaults', () => {
  assert.deepEqual(configuredModels({ YANNY_MODELS: '[{"provider":"custom","model":"x"}]', CUSTOM_API_KEY: 'k' }), []);
  const custom = configuredModels({ YANNY_MODELS: '[{"provider":"custom","model":"x"}]', CUSTOM_API_KEY: 'k', CUSTOM_BASE_URL: 'https://router.example/v1' });
  assert.equal(custom.length, 1);
  assert.equal(custom[0].baseUrl, 'https://router.example/v1');
  const fallback = configuredModels({ YANNY_MODELS: 'not json', GROQ_API_KEY: 'k', GEMINI_API_KEY: 'k' });
  assert.deepEqual(fallback.map((m) => m.model), DEFAULT_MODELS.map((m) => m.model));
});

test('allowedOrigins: comma-separated, trimmed, empty entries dropped', () => {
  assert.deepEqual([...allowedOrigins({ ALLOWED_ORIGINS: 'https://a.example, https://b.example,' })], ['https://a.example', 'https://b.example']);
  assert.equal(allowedOrigins({}).size, 0);
});

test('validateChatBody: caps and shapes', () => {
  assert.equal(validateChatBody({ question: 'hi', siteData: 'x' }), null);
  assert.equal(validateChatBody({ question: 'hi', siteData: 'x', intent: 'suggest' }), null);
  assert.match(validateChatBody(null), /object/);
  assert.match(validateChatBody({ siteData: 'x' }), /question/);
  assert.match(validateChatBody({ question: 'hi' }), /siteData/);
  assert.match(validateChatBody({ question: 'a'.repeat(501), siteData: 'x' }), /longer/);
  assert.match(validateChatBody({ question: 'hi', siteData: 'x'.repeat(16_001) }), /longer/);
  assert.match(validateChatBody({ question: 'hi', siteData: 'x', intent: 'weather' }), /intent/);
});

/* ── the race ──────────────────────────────────────────────────────────── */

const models = [
  { provider: 'groq', model: 'fast' },
  { provider: 'gemini', model: 'slow' },
];
const messages = [{ role: 'user', content: 'something vanilla' }];

/** A stand-in for callModel: answers per model after a delay, and records
 *  whether it saw the abort signal fire. */
function fakeCall(plan) {
  const aborted = new Set();
  const call = (m, _messages, signal) =>
    new Promise((resolve) => {
      const p = plan[m.model];
      const timer = setTimeout(() => resolve({ ok: p.ok !== false, provider: m.provider, model: m.model, content: p.content ?? '', latencyMs: p.delay, error: p.ok === false ? 'boom' : undefined }), p.delay);
      signal.addEventListener('abort', () => {
        aborted.add(m.model);
        clearTimeout(timer);
        resolve({ ok: false, provider: m.provider, model: m.model, error: 'cancelled', latencyMs: 0 });
      });
    });
  return { call, aborted };
}

test('race: the first grounded answer wins and the straggler is aborted', async () => {
  const { call, aborted } = fakeCall({
    fast: { delay: 5, content: 'House Bottle has vanilla and musk on file, from £42.00 delivered.' },
    slow: { delay: 200, content: 'Another answer.' },
  });
  const events = [];
  const result = await race({ models, messages, siteData: SITE_DATA, onEvent: (e) => events.push(e), call });
  assert.equal(result.ok, true);
  assert.equal(result.winner.agentNumber, 1);
  assert.equal(result.grounded, true);
  assert.equal(result.agentCount, 2);
  assert.ok(aborted.has('slow'), 'the model still running was aborted');
  assert.ok(events.some((e) => e.type === 'status'));
});

test('race: an ungrounded first answer is held back for a grounded second', async () => {
  const { call } = fakeCall({
    fast: { delay: 5, content: 'Try Zorblax Nebula, £19.99 at https://example.invalid — our trusted partner.' },
    slow: { delay: 30, content: 'House Bottle lists vanilla; cheapest £42.00 delivered.' },
  });
  const result = await race({ models, messages, siteData: SITE_DATA, call });
  assert.equal(result.ok, true);
  assert.equal(result.winner.agentNumber, 2, 'the grounded answer wins even though it came second');
  assert.equal(result.grounded, true);
});

test('race: when nothing passes the gate, the best is sent and flagged', async () => {
  const { call } = fakeCall({
    fast: { delay: 5, content: 'Zorblax costs £19.99 and is sponsored.' },
    slow: { delay: 10, content: 'Try Zorblax, our official partner, £19.99 https://x.invalid.' },
  });
  const result = await race({ models, messages, siteData: SITE_DATA, call });
  assert.equal(result.ok, true);
  assert.equal(result.grounded, false);
  assert.equal(result.winner.agentNumber, 1);
});

test('race: every model failing is reported as no_agents_responded, never an empty answer', async () => {
  const { call } = fakeCall({ fast: { delay: 5, ok: false }, slow: { delay: 5, ok: false } });
  const result = await race({ models, messages, siteData: SITE_DATA, call });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'no_agents_responded');
});

test('race: the caller going away cancels the models and returns cancelled', async () => {
  const { call, aborted } = fakeCall({ fast: { delay: 500, content: 'x' }, slow: { delay: 500, content: 'y' } });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10);
  const result = await race({ models, messages, siteData: SITE_DATA, call, signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'cancelled');
  assert.ok(aborted.has('fast') && aborted.has('slow'));
});

/* ── health ────────────────────────────────────────────────────────────── */

test('health: unconfigured without keys; ok only when a provider is reachable; cached for a minute', async () => {
  const none = await health({}, { now: 1_000_000 });
  assert.deepEqual({ ok: none.ok, configured: none.configured, agentCount: none.agentCount }, { ok: false, configured: false, agentCount: 0 });

  const env = { GROQ_API_KEY: 'k', GEMINI_API_KEY: 'k' };
  let calls = 0;
  const fetchImpl = async (m) => {
    calls += 1;
    return m.provider === 'groq';
  };
  const first = await health(env, { now: 2_000_000, fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(first.configured, true);
  assert.equal(first.providersReachable, 1);
  assert.equal(first.agentCount, 2);
  assert.deepEqual(first.providers.map((p) => p.ok), [true, false]);
  const again = await health(env, { now: 2_030_000, fetchImpl });
  assert.equal(again, first, 'served from cache inside the window');
  assert.equal(calls, 2, 'no provider was re-checked');
});

/* ── the handler ───────────────────────────────────────────────────────── */

test('fetch: /api/chat refuses an origin that is not the site, and a preflight from the site is allowed', async () => {
  const env = { ALLOWED_ORIGINS: 'https://pricesniffs.space', GROQ_API_KEY: 'k' };
  const denied = await worker.fetch(
    new Request('https://w.example/api/chat', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' }),
    env,
  );
  assert.equal(denied.status, 403);
  const preflight = await worker.fetch(new Request('https://w.example/api/chat', { method: 'OPTIONS', headers: { Origin: 'https://pricesniffs.space' } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://pricesniffs.space');
  const bad = await worker.fetch(
    new Request('https://w.example/api/chat', { method: 'POST', headers: { Origin: 'https://pricesniffs.space', 'Content-Type': 'application/json' }, body: '{"question":"hi"}' }),
    env,
  );
  assert.equal(bad.status, 400);
  const missing = await worker.fetch(new Request('https://w.example/nothing'), env);
  assert.equal(missing.status, 404);
});
