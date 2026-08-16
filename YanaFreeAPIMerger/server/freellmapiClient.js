const TIMEOUT_MS = (Number(process.env.AGENT_TIMEOUT_SECONDS) || 25) * 1000;

// Calls one pinned model on the user's own self-hosted FreeLLMAPI router.
// FreeLLMAPI exposes an OpenAI-compatible /v1/chat/completions; pinning the
// `model` field to a catalog id (rather than "auto"/"fusion") makes THIS
// specific call hit that specific model, which is what lets us run a genuine
// per-model panel instead of relying on FreeLLMAPI's own capped fusion panel.
//
// ── `signal`, and why this call needs one ────────────────────────────────
// TIMEOUT_MS has always been able to end this call; it just could not end it
// *early*. Two things now want to, and neither is a timeout:
//
//   1. The council has enough answers to rank and is not waiting for the
//      rest. Leaving twenty calls running into a result nobody will read
//      burns shared free-tier quota that other questions need (see the
//      README's note on the router's pooled quota), which is a way of making
//      the *next* question slower.
//   2. The reader pressed stop, or closed the tab, and server/index.js saw
//      the response socket close.
//
// The two are kept apart in the reported error because they mean different
// things to whoever reads the log: "cancelled" is this app deciding it was
// done, "timed out" is a model that never came back.
export async function callAgentModel({ baseUrl, apiKey, model, messages, signal }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  // Registered before the fetch and torn down in the finally, so a long-lived
  // outer signal does not accumulate one listener per agent call per question.
  const onOuterAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.6 }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw new Error('empty completion');

    return {
      ok: true,
      model,
      content,
      routedVia: res.headers.get('x-routed-via') ?? model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      model,
      cancelled: aborted && Boolean(signal?.aborted),
      error: aborted
        ? signal?.aborted
          ? 'cancelled before it answered'
          : `timed out after ${TIMEOUT_MS}ms`
        : String(err?.message ?? err),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
