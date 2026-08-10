import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { runCouncil } from './council.js';
import { classifyIntent } from './intent.js';

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

async function loadAgentModels() {
  const raw = await readFile(path.join(__dirname, 'config', 'agents.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return (parsed.models ?? []).slice(0, 28);
}

app.get('/api/config', async (req, res) => {
  const models = await loadAgentModels();
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
 */
app.get('/api/health', async (req, res) => {
  const baseUrl = process.env.FREELLMAPI_BASE_URL;
  const apiKey = process.env.FREELLMAPI_API_KEY;
  const models = await loadAgentModels();
  const configured = Boolean(baseUrl && apiKey) && models.length > 0;

  if (!configured) {
    return res.json({ ok: false, configured: false, freellmapiReachable: false, agentCount: models.length });
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

  res.json({ ok: freellmapiReachable, configured: true, freellmapiReachable, agentCount: models.length });
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

  const models = await loadAgentModels();
  if (models.length === 0) {
    return res.status(503).json({ error: 'no_agents_configured', message: 'server/config/agents.json has no models listed.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const intent = explicitIntent && ['price', 'suggest', 'general'].includes(explicitIntent)
    ? explicitIntent
    : classifyIntent(message);

  try {
    const result = await runCouncil({
      question: message,
      intent,
      config: { baseUrl, apiKey, models },
      onEvent: send,
    });
    send({ type: 'result', result });
  } catch (err) {
    send({ type: 'error', message: String(err?.message ?? err) });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Virtual Yanny backend listening on http://localhost:${PORT}`);
});
