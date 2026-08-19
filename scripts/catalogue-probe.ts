/**
 * Adaptive probe: try to reach each shop, learn from what fails, write it down.
 *
 *   npm run probe                 # every shop
 *   npm run probe -- --shop=boots # one shop
 *
 * Each shop gets its strategies ordered by what has worked before, tried until
 * one returns listings. Every outcome, good or bad, is folded into
 * data/strategy-memory.json, so the next run starts from what this one learned
 * instead of repeating it.
 *
 * Writes no catalogue data. Discovery only.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { loadRobots, runStrategy, type Http } from '../src/catalogue/attempt.js';
import { apifyProxyConfigFromEnv, apifyProxyHttp } from '../src/catalogue/apifyProxy.js';
import { apifyActorConfigFromEnv, apifyActorRenderer } from '../src/catalogue/apifyActor.js';
import {
  EMPTY_MEMORY, planFor, record, explain, type StrategyMemory,
} from '../src/catalogue/strategy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const memoryPath = resolve(root, 'data/strategy-memory.json');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyShop = arg('shop');

const proxyConfig = apifyProxyConfigFromEnv();
const proxiedHttp = proxyConfig ? apifyProxyHttp(proxyConfig) : undefined;
if (proxyConfig) {
  console.log('Apify residential proxy configured. proxied-fetch is available this run.\n');
} else {
  console.log('No APIFY_PROXY_PASSWORD set. proxied-fetch will stay unavailable.\n');
}

// A separate credential from the proxy above — see apifyActor.ts's own
// header on why the two are not interchangeable. Either, both or neither may
// be set; each strategy fails soft with its own clear reason when its
// credential is absent, same as proxied-fetch always has.
const actorConfig = apifyActorConfigFromEnv();
const actorRenderer = actorConfig ? apifyActorRenderer(actorConfig) : undefined;
if (actorConfig) {
  console.log('Apify actor configured. browser-render is available this run.\n');
} else {
  console.log('No APIFY_TOKEN set. browser-render will stay unavailable.\n');
}

let memory: StrategyMemory = EMPTY_MEMORY;
if (existsSync(memoryPath)) {
  try {
    memory = JSON.parse(readFileSync(memoryPath, 'utf8')) as StrategyMemory;
  } catch {
    console.error('strategy-memory.json is unreadable. Starting fresh rather than guessing.');
  }
}

const http: Http = async (url, headers) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    const body = await res.text();
    return { status: res.status, body, ok: res.ok };
  } catch (err) {
    return { status: 0, body: '', ok: false, error: String(err).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// affiliate-feed shops have an approved feed as their route in — probing
// retrieval strategies against them would mean testing how to scrape a
// partner who already handed the data over for free. See catalogue-harvest.ts.
//
// `enabled` is skipped only when a specific --shop was named. The bulk sweep
// (no --shop) stays scoped to enabled shops, same as always — nobody wants a
// routine run spending politeness budget on shops nobody has decided to
// carry. But a handful of disabled candidates (very, beauty-bay,
// cult-beauty-global, beauty-pie) have never had a single retrieval strategy
// tried against them at all: their registry entries hold `catalogue: null`
// because nobody has confirmed real section URLs yet, which is a fact that
// can only be established by asking, and asking a specific disabled shop by
// name is a deliberate diagnostic act, not an accidental one. Flipping
// `enabled` to make that possible is explicitly out of scope for this
// module — see the retailer's own comment — so the bypass lives here
// instead.
const shops = RETAILERS.filter(
  (r) => r.adapter !== 'affiliate-feed' && (onlyShop ? r.id === onlyShop : r.enabled),
);

console.log(`\nAdaptive retrieval probe`);
console.log(`shops    ${shops.length}`);
console.log(`memory   ${Object.keys(memory.records).length} prior observations\n`);

const wins: string[] = [];
const losses: string[] = [];

for (const retailer of shops) {
  const robots = await loadRobots(retailer, http);
  const politeGap = Math.max(
    retailer.catalogue?.minRequestGapMs ?? 1500,
    (robots.crawlDelaySeconds ?? 0) * 1000,
  );

  const plan = planFor(memory, retailer.id, {
    allowMetered: Boolean(proxyConfig) || Boolean(actorConfig),
  });
  const tried: string[] = [];
  let won = false;

  for (const strategyId of plan) {
    const attempt = await runStrategy(strategyId, {
      retailer, http, robots, sampleQuery: 'Dior Sauvage Eau de Parfum 100ml',
      ...(proxiedHttp ? { proxiedHttp } : {}),
      ...(actorRenderer ? { actorRender: actorRenderer.render } : {}),
    });

    memory = record(memory, retailer.id, strategyId, attempt.result);
    tried.push(
      `${strategyId} ${attempt.result.ok ? `ok ${attempt.result.listings}` : `x ${attempt.result.error}`}`,
    );

    // A strategy that returned real listings ends the search for this shop.
    if (attempt.result.ok && attempt.result.listings > 0) {
      won = true;
      wins.push(
        `  ${retailer.name.padEnd(20)} ${strategyId} found ${attempt.result.listings} listings` +
          (attempt.discovered?.sectionUrls?.[0]
            ? `\n      working URL: ${attempt.discovered.sectionUrls[0]}`
            : ''),
      );
      break;
    }

    await sleep(politeGap);
  }

  if (!won) {
    losses.push(`  ${retailer.name.padEnd(20)} ${tried.join(' | ')}`);
  }

  const robotsNote = robots.unavailable
    ? 'robots.txt unreadable'
    : `${robots.sitemaps.length} sitemaps, ${robots.disallow.length} disallow rules`;
  console.log(`${retailer.name.padEnd(20)} ${won ? 'REACHED' : 'blocked'}   (${robotsNote})`);
}

if (actorRenderer) {
  console.log(`\nApify actor pages rendered this run: ${actorRenderer.used()}`);
}

mkdirSync(dirname(memoryPath), { recursive: true });
writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`);

console.log(`\n${wins.length} of ${shops.length} shops reached\n`);
if (wins.length) {
  console.log('Working:');
  console.log(wins.join('\n'));
}
if (losses.length) {
  console.log('\nStill blocked, with everything tried:');
  console.log(losses.join('\n'));
}

console.log('\nWhat the crawler now believes:\n');
for (const retailer of shops) {
  console.log(`  ${retailer.name}`);
  for (const line of explain(memory, retailer.id)) console.log(`    ${line}`);
}
console.log('\nmemory written to data/strategy-memory.json\n');
