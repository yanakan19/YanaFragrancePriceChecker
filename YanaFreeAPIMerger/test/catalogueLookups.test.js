import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCouncil } from '../server/council.js';
import { classifyIntent } from '../server/intent.js';
import { loadSite } from '../server/siteData.js';
import {
  findRetailerInQuestion,
  resolveDeliveryQuery,
  formatDeliveryAnswer,
  resolveDealsQuery,
  formatDealsAnswer,
  resolveBudgetQuery,
  formatBudgetAnswer,
  resolveCompareQuery,
  formatCompareAnswer,
  resolveBrandQuery,
  formatBrandAnswer,
  resolveMetaQuery,
  formatMetaAnswer,
} from '../server/lookups.js';

/**
 * The catalogue-wide lookups: delivery terms, deals, budget filters,
 * comparisons, brand browsing and the countable facts about the service.
 *
 * These have no product-identity step to get wrong — they answer about the
 * catalogue itself — so what is checked here is that every figure they state
 * is recomputable from the same data, independently, in the test. Where a
 * count is asserted it is recounted rather than pinned, because the live
 * catalogue is rewritten roughly every two hours.
 */

const site = await loadSite();
const enabled = site.retailers.RETAILERS.filter((r) => r.enabled !== false);
const emptyModels = { baseUrl: 'https://unused.invalid', apiKey: 'unused', models: [] };
const noop = () => {};

/* ── delivery ──────────────────────────────────────────────────────────── */

test('delivery: a named shop is answered with that shop\'s own registry figures, recomputed here', async () => {
  for (const retailer of enabled.slice(0, 8)) {
    const result = await resolveDeliveryQuery(`how much is delivery from ${retailer.name}`);
    assert.equal(result.kind, 'retailer', `${retailer.name} was not recognised`);
    assert.equal(result.retailer.name, retailer.name);
    assert.equal(result.retailer.standardGbp, retailer.shipping.standardGbp);
    assert.equal(result.retailer.freeOverGbp, retailer.shipping.freeOverGbp);
  }
});

test('delivery: a shop with no published rate is never given one', async () => {
  const unstated = enabled.filter((r) => r.shipping.standardGbp === null);
  assert.ok(unstated.length > 0, 'expected at least one retailer with standardGbp: null');
  for (const retailer of unstated) {
    const answer = formatDeliveryAnswer(await resolveDeliveryQuery(`delivery cost at ${retailer.name}`));
    assert.match(answer, /does not publish a standard delivery cost/);
    assert.match(answer, /never ranked as the cheapest/);
    // The only £ figure allowed in this answer is the free-over threshold,
    // which is a real published field. A standard rate must not appear.
    for (const stated of [...answer.matchAll(/£(\d+\.\d{2})/g)].map((m) => Number(m[1]))) {
      assert.equal(stated, retailer.shipping.freeOverGbp, `invented a delivery figure for ${retailer.name}: ${answer}`);
    }
  }
});

test('delivery: "free on any order" and "free above a spend" are never merged', async () => {
  const result = await resolveDeliveryQuery('who does free delivery');
  assert.equal(result.kind, 'free');
  const trulyFree = enabled.filter((r) => r.shipping.standardGbp === 0).map((r) => r.name).sort();
  assert.deepEqual(result.alwaysFree.map((r) => r.name).sort(), trulyFree);
  // Nothing whose standard rate is above zero may appear in that list —
  // src/services/shipping.ts keeps `0` (a sourced claim of free delivery)
  // and `null` (no claim at all) distinct, and so must this.
  for (const r of result.alwaysFree) assert.equal(r.standardGbp, 0);
  for (const r of result.freeOverSpend) assert.ok(r.standardGbp > 0);
});

test('findRetailerInQuestion: the longer of two overlapping shop names wins', async () => {
  const shop = await findRetailerInQuestion('what does delivery cost at The Fragrance Counter');
  assert.equal(shop?.name, 'The Fragrance Counter');
  const other = await findRetailerInQuestion('what does delivery cost at The Fragrance Shop');
  assert.equal(other?.name, 'The Fragrance Shop');
});

/* ── deals ─────────────────────────────────────────────────────────────── */

test('deals: every was/now/percent triple stated is one the deals list actually holds', async () => {
  const result = await resolveDealsQuery("what's on sale");
  assert.equal(result.kind, 'top');
  const byKey = new Map(
    site.data.DEALS.map((d) => [`${d.fragrance.id}|${d.retailerId}`, d]),
  );
  for (const shown of result.deals) {
    const match = [...byKey.values()].find(
      (d) => d.fragrance.brand === shown.brand && d.fragrance.name === shown.name && d.price === shown.nowGbp,
    );
    assert.ok(match, `stated a deal not in the list: ${JSON.stringify(shown)}`);
    assert.equal(shown.wasGbp, match.wasPrice);
    assert.equal(shown.percentOff, match.percentOff);
  }
  const answer = formatDealsAnswer(result);
  // Deal prices are item prices; comparing them silently against the
  // delivered prices the rest of the bot quotes would be the easiest
  // mistake here to make and the hardest for a reader to spot.
  assert.match(answer, /item prices before delivery/);
});

test('deals: a named product with no current deal is told so, not given someone else\'s discount', async () => {
  const result = await resolveDealsQuery('any discounts on One Million Elixir');
  assert.equal(result.kind, 'product');
  assert.equal(result.brand, 'Rabanne');
  const answer = formatDealsAnswer(result);
  if (result.deals.length === 0) {
    assert.match(answer, /not in the current deals list/);
    assert.doesNotMatch(answer, /% off/);
  } else {
    for (const d of result.deals) assert.match(answer, new RegExp(`${d.percentOff}% off`));
  }
});

/* ── budget ────────────────────────────────────────────────────────────── */

test('budget: every bottle offered under a threshold really is at or under it, delivered', async () => {
  for (const [question, cap] of [['what can i get under £50', 50], ['anything under 30 quid', 30], ['fragrances up to £40', 40]]) {
    const result = await resolveBudgetQuery(question);
    assert.equal(result.kind, 'under');
    assert.equal(result.maxGbp, cap);
    for (const item of result.items) {
      assert.ok(item.deliveredPriceGbp <= cap, `${item.brand} ${item.name} at £${item.deliveredPriceGbp} exceeds £${cap}`);
    }
    assert.match(formatBudgetAnswer(result), /Delivered prices/);
  }
});

test('budget: the count stated is the real count, recomputed independently', async () => {
  const result = await resolveBudgetQuery('what can i get under £50');
  let recount = 0;
  for (const frag of site.data.DEMO_FRAGRANCES) {
    const best = site.priceService.bestOffer(
      site.priceService.buildComparison(site.catalogue.offersFor(frag.id), { sortBy: 'delivered', tier: frag.tier }),
    );
    if (best && best.deliveredPriceGbp !== null && best.deliveredPriceGbp <= 50) recount++;
  }
  assert.equal(result.totalMatching, recount);
});

test('budget: a tier filter only ever offers bottles of that tier', async () => {
  const result = await resolveBudgetQuery('cheapest niche fragrance you list');
  assert.equal(result.tier, 'niche');
  const niche = new Set(
    site.data.DEMO_FRAGRANCES.filter((f) => f.tier === 'niche').map((f) => `${f.brand}|${f.name}|${f.sizeMl}`),
  );
  for (const item of result.items) {
    assert.ok(niche.has(`${item.brand}|${item.name}|${item.sizeMl}`), `${item.brand} ${item.name} is not niche tier`);
  }
});

test('budget: a budget-shaped question with no threshold in it is handed to the council, not given an invented one', async () => {
  assert.equal(await resolveBudgetQuery('is anything good value at the moment'), null);
});

/* ── comparison ────────────────────────────────────────────────────────── */

test('comparison: the side named as cheaper really is the cheaper of the two figures given', async () => {
  const result = await resolveCompareQuery('is One Million Elixir cheaper than Aventus');
  assert.equal(result.kind, 'compared');
  assert.ok(result.left.best && result.right.best, 'expected both sides priced');
  const answer = formatCompareAnswer(result);
  const cheaper = result.left.best.deliveredPriceGbp <= result.right.best.deliveredPriceGbp ? result.left : result.right;
  assert.match(answer, new RegExp(`${cheaper.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^]*is cheaper`));
});

test('comparison: comparing different bottle sizes says so rather than implying like-for-like', async () => {
  const result = await resolveCompareQuery('is One Million Elixir cheaper than Aventus');
  if (result.kind !== 'compared' || !result.left.best || !result.right.best) return;
  const answer = formatCompareAnswer(result);
  if (result.left.best.sizeMl === result.right.best.sizeMl) assert.match(answer, /Both figures are for the \d+ml/);
  else assert.match(answer, /not a like-for-like price/);
});

test('comparison: one unidentifiable side means no comparison at all, and it says which side', async () => {
  const result = await resolveCompareQuery('is Sauvage cheaper than Aventus');
  assert.equal(result.kind, 'unresolved');
  const answer = formatCompareAnswer(result);
  assert.match(answer, /can't pin down/);
  assert.doesNotMatch(answer, /is cheaper:/);
});

/* ── brand ─────────────────────────────────────────────────────────────── */

test('brand: the product count stated is the real count for that brand', async () => {
  for (const brand of ['Creed', 'Amouage', 'Tom Ford']) {
    const result = await resolveBrandQuery(`do you have any ${brand}`);
    assert.equal(result.kind, 'brand', `${brand} was not recognised as a brand`);
    assert.equal(result.brand, brand);
    assert.equal(result.productCount, site.data.DEMO_FRAGRANCES.filter((f) => f.brand === brand).length);
    for (const ex of result.examples) assert.equal(ex.brand, brand);
  }
});

test('brand: a brand-shaped question naming neither a brand nor a product goes to the council', async () => {
  assert.equal(await resolveBrandQuery('do you have anything nice'), null);
});

test('brand: a brand carried but currently unbuyable says so instead of implying it is for sale', async () => {
  const result = await resolveBrandQuery('do you list Amouage');
  const answer = formatBrandAnswer(result);
  if (result.buyableCount === 0) assert.match(answer, /nothing buyable with a stated delivery cost/);
  assert.match(answer, new RegExp(`${result.productCount} Amouage bottles|One Amouage bottle`));
});

/* ── meta ──────────────────────────────────────────────────────────────── */

test('meta: countable facts are the live figures, not remembered ones', async () => {
  const size = await resolveMetaQuery('how many fragrances do you have');
  assert.equal(size.kind, 'size');
  assert.equal(size.fragranceCount, site.data.DEMO_FRAGRANCES.length);
  assert.equal(size.brandCount, new Set(site.data.DEMO_FRAGRANCES.map((f) => f.brand)).size);
  assert.equal(size.retailerCount, enabled.length);

  const coverage = await resolveMetaQuery('which shops do you cover');
  assert.deepEqual(coverage.names, enabled.map((r) => r.name));
  assert.match(formatMetaAnswer(coverage), /None of them pays for placement/);

  const fresh = await resolveMetaQuery('how fresh are these prices');
  assert.equal(fresh.crawledAt, site.catalogue.CRAWLED_AT);
  assert.match(formatMetaAnswer(fresh), /\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
});

test('meta: prose questions the site has already answered on its own pages go to the council, not a template', async () => {
  for (const q of ['how do you make money', 'do you get commission', 'what is your privacy policy']) {
    assert.equal(await resolveMetaQuery(q), null, `"${q}" should not be templated`);
  }
});

/* ── routing ───────────────────────────────────────────────────────────── */

/**
 * With no models configured, any attempt to consult an agent fails the
 * council with `no_agents_responded`. So an ok:true site-data-direct result
 * proves zero model calls were made, and an error proves the opposite —
 * which is what makes the second half of this test meaningful rather than
 * merely aspirational.
 */
test('routing: the catalogue-wide question shapes are answered with no model call, end to end from the raw question', async () => {
  const questions = [
    'how much is delivery from Boots',
    'who does free delivery',
    "what's on sale",
    'any discounts?',
    'what can i get under £50',
    'cheapest niche fragrance you list',
    'is One Million Elixir cheaper than Aventus',
    'what Creed do you have',
    'do you list Amouage',
    'how fresh are these prices',
    'which shops do you cover',
    'how many fragrances do you have',
  ];
  for (const question of questions) {
    const result = await runCouncil({
      question,
      intent: classifyIntent(question),
      config: emptyModels,
      onEvent: noop,
    });
    assert.equal(result.ok, true, `"${question}" did not answer: ${JSON.stringify(result)}`);
    assert.equal(result.source, 'site-data-direct', `"${question}" reached the council`);
    assert.ok(result.winner.content.length > 20, `"${question}" answered with nothing useful`);
  }
});

test('routing: genuinely open questions still reach the council', async () => {
  // "what should i wear to a wedding" and "recommend me a summer fragrance"
  // were in this list; a season/occasion question that grounds on nothing
  // else is now refused deterministically (a rule-1-bound council model
  // could only ever refuse it anyway) — see messyQuestions.test.js.
  const questions = [
    'what smells similar to Aventus',
    'how do you make money',
    'do you have anything nice',
  ];
  for (const question of questions) {
    const result = await runCouncil({
      question,
      intent: classifyIntent(question),
      config: emptyModels,
      onEvent: noop,
    });
    assert.equal(result.ok, false, `"${question}" was answered deterministically: ${JSON.stringify(result)}`);
    assert.equal(result.error, 'no_agents_responded');
  }
});
