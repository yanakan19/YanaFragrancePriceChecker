import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { runCouncil } from './council.js';
import { classifyIntent, INTENTS } from './intent.js';
import { siteDataFreshness } from './siteData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;
const HEALTH_TIMEOUT_MS = 5000;

const app = express();
app.use(express.json());
// The UI this server answers for is embedded directly in pricesniffs.space's
// own pages now, not served from here (see the parent repo's demo/app.ts) —
// so every request genuinely arrives cross origin, and CORS is not optional.
// Left permissive (reflects any origin) rather than pinned to the one
// production domain, since the base URL this server runs behind is not
// fixed yet either (see the parent repo's demo/virtualYanny.ts) and a local
// build serving from a different origin during setup must keep working too.
app.use(cors());

/**
 * The agent roster, read fresh from disk per call so editing agents.json
 * takes effect without a restart.
 *
 * It never throws, and that is load-bearing rather than defensive habit.
 * Express 4 does not catch a rejected promise from an `async` handler: the
 * rejection escapes the router, no response is ever written, and the
 * request hangs until the client gives up. Every route below awaits this,
 * so a missing or malformed agents.json would have turned `/api/health`
 * into a black hole — the deploy workflow's verify step would sit through
 * twelve empty responses and report "the app did not stay up", which is
 * both wrong and unfixable from that message. Returning an empty list
 * instead makes it `configured:false` with a named reason, which is a fact
 * the health check can report and a person can act on.
 *
 * @returns {Promise<{ models: string[], error: string | null }>}
 */
async function loadAgentModels() {
  try {
    const raw = await readFile(path.join(__dirname, 'config', 'agents.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const models = Array.isArray(parsed.models) ? parsed.models.slice(0, 28) : [];
    if (models.length === 0) {
      return { models, error: 'server/config/agents.json parsed but listed no models' };
    }
    return { models, error: null };
  } catch (err) {
    const error = `could not read server/config/agents.json: ${String(err?.message ?? err)}`;
    // Goes to the container's stderr, which is what `flyctl logs` shows —
    // the one place an operator can see why agentCount is 0.
    console.error(error);
    return { models: [], error };
  }
}

app.get('/api/config', async (req, res) => {
  const { models } = await loadAgentModels();
  const configured = Boolean(process.env.FREELLMAPI_BASE_URL && process.env.FREELLMAPI_API_KEY);
  res.json({ agentCount: models.length, configured });
});

/**
 * The check the frontend runs every time the chat popup is opened, before
 * showing anything a reader could type into — see demo/app.ts's own
 * "Virtual Yanny" panel. Two things have to be true for this service to be
 * of any use, and this checks both rather than just "the process is up":
 *
 *   1. This server itself is reachable and configured (env vars present,
 *      at least one agent model listed).
 *   2. FreeLLMAPI, the actual thing that answers questions, is reachable
 *      right now — a listening Express process with a dead or unreachable
 *      router behind it would otherwise look healthy and then hang or fail
 *      on the very first real question.
 *
 * Never throws past this handler: any failure below is a fact about the
 * backend's current state, not a 500 to the caller.
 *
 * The `siteData` block is reported for operators, and deliberately does not
 * feed `ok`. `server/siteData.js` imports the site's data modules once per
 * process (that file's header explains why re-importing them per question
 * was both a memory leak and a correctness bug), so on a host where the
 * checkout can be updated underneath a running service — the bare-metal
 * `deploy/` path, not the container, whose files are baked into the image —
 * this is how "restart me, my catalogue is older than the disk's" becomes
 * visible. It is not a reason to fail a health check and have the machine
 * killed mid-answer: stale-but-consistent data is still a usable service,
 * and every number the chatbot states is at least internally consistent
 * with the snapshot it holds.
 */
app.get('/api/health', async (req, res) => {
  const baseUrl = process.env.FREELLMAPI_BASE_URL;
  const apiKey = process.env.FREELLMAPI_API_KEY;
  const { models, error: agentsError } = await loadAgentModels();
  const configured = Boolean(baseUrl && apiKey) && models.length > 0;

  // Never loads the site modules itself — reports "not loaded yet" until the
  // first question has pulled them in, so a health check cannot be what pays
  // the ~15 MB parse.
  let siteData;
  try {
    siteData = await siteDataFreshness();
  } catch (err) {
    siteData = { loaded: false, error: String(err?.message ?? err) };
  }

  // `agentsError` is reported only when there is one, and only alongside
  // configured:false — it is the difference between "no key" and "the
  // roster file is unreadable", which otherwise look identical from
  // outside. Nothing consumes it programmatically: the four fields the
  // deploy workflow and demo/virtualYanny.ts read are ok, configured,
  // freellmapiReachable and agentCount, and those keep their exact names
  // and types here.
  if (!configured) {
    return res.json({
      ok: false,
      configured: false,
      freellmapiReachable: false,
      agentCount: models.length,
      siteData,
      ...(agentsError ? { agentsError } : {}),
    });
  }

  let freellmapiReachable = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      freellmapiReachable = upstream.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    freellmapiReachable = false;
  }

  res.json({ ok: freellmapiReachable, configured: true, freellmapiReachable, agentCount: models.length, siteData });
});

app.post('/api/chat', async (req, res) => {
  const { message, intent: explicitIntent } = req.body ?? {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const baseUrl = process.env.FREELLMAPI_BASE_URL;
  const apiKey = process.env.FREELLMAPI_API_KEY;
  if (!baseUrl || !apiKey) {
    return res.status(503).json({
      error: 'not_configured',
      message: 'Set FREELLMAPI_BASE_URL and FREELLMAPI_API_KEY in .env — see README setup.',
    });
  }

  const { models, error: agentsError } = await loadAgentModels();
  if (models.length === 0) {
    return res.status(503).json({
      error: 'no_agents_configured',
      message: agentsError ?? 'server/config/agents.json has no models listed.',
    });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // The other half of the widget's stop button, and of a reader simply
  // closing the tab.
  //
  // Aborting a `fetch` in the browser closes this connection, which is what
  // fires 'close' here. Without this the council carried on calling every
  // model in agents.json into a socket nobody was reading — the reader saw
  // it stop, the free-tier quota did not, and the next question paid for it.
  //
  // 'close' on the *response* rather than the request: for a POST whose body
  // has been fully read, the request stream can close early and normally,
  // which would abort every question the instant its body arrived. And it
  // fires on ordinary completion too, hence the writableEnded guard — by
  // then the council has already returned and there is nothing to abort.
  const aborter = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) aborter.abort();
  });

  const send = (event) => {
    // A cancelled question still has agent calls settling behind it, and each
    // one emits. Writing to a response whose socket has gone is at best
    // wasted and at worst an unhandled error on the stream.
    if (res.writableEnded || res.destroyed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // The widget no longer sends an intent at all (its three intent buttons
  // were removed; demo/virtualYanny.ts posts `intent: null`), so in practice
  // every real question is classified here. The explicit branch is kept for
  // direct API callers, validated against intent.js's own INTENTS list
  // rather than a hardcoded copy of it — the previous hardcoded
  // ['price','suggest','general'] would have silently ignored any of the
  // nine intents added since, falling back to classification, which is safe
  // but confusing.
  const intent = typeof explicitIntent === 'string' && INTENTS.includes(explicitIntent)
    ? explicitIntent
    : classifyIntent(message);

  try {
    const result = await runCouncil({
      question: message,
      intent,
      config: { baseUrl, apiKey, models },
      onEvent: send,
      signal: aborter.signal,
    });
    // A cancelled council has nowhere to send anything: the socket that
    // would carry it is what got cancelled. `send` would drop it anyway;
    // not calling it keeps the intent explicit.
    if (!aborter.signal.aborted) send({ type: 'result', result });
  } catch (err) {
    if (!aborter.signal.aborted) send({ type: 'error', message: String(err?.message ?? err) });
  } finally {
    res.end();
  }
});

// No host argument on purpose, and it must stay that way. Node binds the
// unspecified address when none is given — `::` on a dual-stack host, which
// accepts IPv4 too — so the process is reachable on every interface. Fly's
// proxy reaches a machine over the private network, not over loopback, so
// the classic silent deploy failure here would be binding '127.0.0.1':
// the container starts, the log says "listening", and every request from
// outside times out because nothing outside the machine can see the socket.
// Passing '0.0.0.0' explicitly is the other trap — it looks stricter and is
// actually narrower, since it drops the IPv6 half.
app.listen(PORT, () => {
  console.log(`Virtual Yanny backend listening on port ${PORT} (all interfaces)`);
});
