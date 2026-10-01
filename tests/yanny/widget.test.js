import { test } from 'vitest';
import assert from 'node:assert/strict';
import { askVirtualYanny, VIRTUAL_YANNY_CONFIGURED, checkYannyHealth } from '../../demo/virtualYanny.ts';

/**
 * The widget's own question path, as the panel drives it, in the state the
 * site ships in: the AI side not yet connected (VIRTUAL_YANNY_API_BASE_URL
 * is blank until the owner deploys the Worker — docs/VIRTUAL-YANNY-DEPLOY.md).
 *
 * Every turn must end in exactly one terminal event, and that event must be
 * an answer a reader can use: never a raw error code, never the old dead
 * end ("that one needs the AI side of me"), never nothing.
 */

async function ask(question, signal) {
  const events = [];
  await askVirtualYanny(question, null, (e) => events.push(e), signal);
  return events;
}

test('widget: this build ships with the AI side unplugged, and says so as "not-built"', async () => {
  assert.equal(VIRTUAL_YANNY_CONFIGURED, false);
  const health = await checkYannyHealth();
  assert.equal(health.ok, false);
  assert.equal(health.reason, 'not-built');
});

for (const question of [
  'how much is Dior Sauvage EDT',
  'what smells like Aventus but cheaper',
  'something vanilla, no florals',
  'how does this site make money',
  'do you have anything nice',
  'who won the football',
]) {
  test(`widget: "${question}" ends in one usable answer with no AI side`, async () => {
    const events = await ask(question);
    const terminal = events.filter((e) => e.type === 'result' || e.type === 'error');
    assert.equal(terminal.length, 1, JSON.stringify(events));
    const [end] = terminal;
    assert.equal(end.type, 'result');
    assert.equal(end.result.ok, true);
    assert.equal(end.result.source, 'site-data-direct');
    const text = end.result.winner.content;
    assert.ok(text.length > 30, text);
    assert.doesNotMatch(text, /needs the AI side of me|no_agents_responded|undefined|\[object Object\]/);
    assert.equal(events[0].type, 'status', 'the panel is told what is happening first');
  });
}

test('widget: a turn stopped before it starts emits nothing at all', async () => {
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await ask('how much is Dior Sauvage EDT', controller.signal), []);
});
