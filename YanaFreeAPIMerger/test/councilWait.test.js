import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { runCouncil } from '../server/council.js';

/**
 * What the council does with the *time* its agents take, as opposed to what
 * it does with their answers.
 *
 * The fan-out used to be `await Promise.allSettled(...)` over every model in
 * agents.json, which meant one straggler set the latency for the whole
 * question: nothing could be sent until the last of 28 calls settled, so a
 * single model having a bad minute pinned every council answer to
 * AGENT_TIMEOUT_SECONDS. These tests pin the three ways the wait can now end
 * — quorum, deadline, everyone reported — plus the two things that must not
 * change with it: a total failure is still a total failure, and abandoned
 * calls are actually torn down rather than left running.
 *
 * ── Why a real HTTP server rather than a stub ───────────────────────────
 * The behaviour under test lives in the seam between council.js and
 * freellmapiClient.js: an AbortSignal threaded through fetch. A stubbed
 * client would exercise the bookkeeping and skip the only part that could
 * plausibly be wrong. This server also records which requests it saw
 * cancelled, which is how "the stragglers were aborted" is checked as a fact
 * about the wire rather than a fact about a variable.
 *
 * Delays here are inputs, not measurements of any real model — nothing in
 * this repo can reach FreeLLMAPI to measure one. What is asserted is
 * therefore always a comparison against the delays fed in, never a bare
 * millisecond figure.
 */

/** @param {Record<string, number>} delays model id -> ms before it answers */
async function withRouter(delays, run) {
  const cancelled = new Set();
  const started = new Set();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const { model } = JSON.parse(body);
      started.add(model);
      const timer = setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: `An answer from ${model}.` } }] }));
      }, delays[model] ?? 10);
      // The client hanging up is what "cancelled" means here, and clearing
      // the timer is what stops this stand-in doing work nobody wants —
      // exactly what aborting the real call is for.
      res.on('close', () => {
        if (!res.writableEnded) {
          cancelled.add(model);
          clearTimeout(timer);
        }
      });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await run({ baseUrl: `http://127.0.0.1:${server.address().port}`, cancelled, started });
  } finally {
    server.close();
    await once(server, 'close');
  }
}

/** Sets the two knobs for one test and puts the environment back afterwards. */
async function withEnv(vars, run) {
  const before = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    process.env[k] = String(v);
  }
  try {
    return await run();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// 'suggest' is not in DETERMINISTIC_INTENTS, so it genuinely reaches the
// council — which is the whole point of these tests. A price question would
// be answered from the catalogue and never call a model at all.
const QUESTION = 'something vanilla but not too sweet, for the evening';

test('council: a quorum of answers ends the wait, and the slow ones do not hold the question up', async () => {
  const fast = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`fast-${i}`, 10]));
  const slow = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`slow-${i}`, 4000]));
  const models = [...Object.keys(fast), ...Object.keys(slow)];

  await withRouter({ ...fast, ...slow }, async ({ baseUrl, cancelled }) => {
    await withEnv({ COUNCIL_QUORUM: 4, COUNCIL_DEADLINE_MS: 8000 }, async () => {
      const startedAt = Date.now();
      const result = await runCouncil({
        question: QUESTION,
        intent: 'suggest',
        config: { baseUrl, apiKey: 'test', models },
        onEvent: () => {},
      });
      const elapsed = Date.now() - startedAt;

      assert.equal(result.ok, true);
      assert.equal(result.timings.waited, 'quorum');
      assert.equal(result.respondedCount, 4, 'exactly the quorum should have been ranked');
      assert.equal(result.outstandingCount, 4, 'the slow four were still working, not failed');
      // Asserted against the input, not a bare number: the point is that it
      // did not wait on the 4000ms group, and generous headroom keeps this
      // from turning into a flaky timing test on a loaded machine.
      assert.ok(elapsed < 3000, `expected to finish well before the 4000ms models, took ${elapsed}ms`);

      // The stragglers are torn down rather than left running into an answer
      // nobody will read, which is what keeps them off the shared free-tier
      // quota the next question needs.
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(cancelled.size, 4, `expected the four slow calls to be cancelled, saw ${[...cancelled]}`);
    });
  });
});

test('council: with quorum out of reach, the deadline ends the wait instead — measured from the first answer, not from fan-out', async () => {
  // One model answers almost at once and the rest never would in time. If
  // the deadline ran from fan-out this would still be right; the case that
  // separates them is the one below.
  const delays = { quick: 10, ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`never-${i}`, 9000])) };
  const models = Object.keys(delays);

  await withRouter(delays, async ({ baseUrl }) => {
    await withEnv({ COUNCIL_QUORUM: 99, COUNCIL_DEADLINE_MS: 300 }, async () => {
      const startedAt = Date.now();
      const result = await runCouncil({
        question: QUESTION,
        intent: 'suggest',
        config: { baseUrl, apiKey: 'test', models },
        onEvent: () => {},
      });
      const elapsed = Date.now() - startedAt;

      assert.equal(result.ok, true);
      assert.equal(result.timings.waited, 'deadline');
      assert.equal(result.respondedCount, 1);
      assert.ok(elapsed < 4000, `the deadline should have ended this long before 9000ms, took ${elapsed}ms`);
    });
  });
});

test('council: a slow first answer is waited for — the deadline clock does not start until there is something to ship', async () => {
  // Every model is slower than the deadline. Started at fan-out, that clock
  // would expire with nothing collected and the question would fail; started
  // at the first answer, they all still land.
  const delays = Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`late-${i}`, 500]));
  const models = Object.keys(delays);

  await withRouter(delays, async ({ baseUrl }) => {
    await withEnv({ COUNCIL_QUORUM: 99, COUNCIL_DEADLINE_MS: 150 }, async () => {
      const result = await runCouncil({
        question: QUESTION,
        intent: 'suggest',
        config: { baseUrl, apiKey: 'test', models },
        onEvent: () => {},
      });
      assert.equal(result.ok, true, 'a router slow to its first answer must not be cut off holding none');
      assert.ok(result.respondedCount >= 1);
      assert.ok(result.timings.firstAnswerMs >= 150, 'the first answer really did arrive after the deadline length');
    });
  });
});

test('council: when nothing answers at all, that is still reported as nothing answering — not as an early deadline', async () => {
  const models = ['broken-a', 'broken-b'];
  // A router that refuses every call: no success, so no deadline can start.
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"nope"}');
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await withEnv({ COUNCIL_QUORUM: 1, COUNCIL_DEADLINE_MS: 50 }, async () => {
      const result = await runCouncil({
        question: QUESTION,
        intent: 'suggest',
        config: { baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: 'test', models },
        onEvent: () => {},
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'no_agents_responded');
      assert.equal(result.answers.length, 2, 'every agent must have been waited for before declaring total failure');
    });
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('council: the reader going away cancels the model calls rather than leaving them running', async () => {
  const delays = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`slow-${i}`, 5000]));
  const models = Object.keys(delays);

  await withRouter(delays, async ({ baseUrl, cancelled, started }) => {
    // Quorum out of reach and no deadline, so the only thing that can end
    // this wait is the abort — which is what the widget's stop button and a
    // closed tab both come through as.
    await withEnv({ COUNCIL_QUORUM: 99, COUNCIL_DEADLINE_MS: 0 }, async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 200);

      const startedAt = Date.now();
      const result = await runCouncil({
        question: QUESTION,
        intent: 'suggest',
        config: { baseUrl, apiKey: 'test', models },
        onEvent: () => {},
        signal: controller.signal,
      });
      const elapsed = Date.now() - startedAt;

      assert.equal(result.ok, false);
      assert.equal(result.error, 'cancelled');
      assert.ok(elapsed < 3000, `stopping should not wait out the 5000ms calls, took ${elapsed}ms`);

      await new Promise((r) => setTimeout(r, 100));
      assert.equal(started.size, models.length, 'every call had genuinely been made before the stop');
      assert.equal(cancelled.size, models.length, `every in-flight call should be cancelled, saw ${[...cancelled]}`);
    });
  });
});
