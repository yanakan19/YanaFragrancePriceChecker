import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCouncil } from '../server/council.js';
import { classifyIntent } from '../server/intent.js';
import { loadSite, buildSiteDataBlock, suggestContextFor } from '../server/siteData.js';
import { parseBudget } from '../server/requestPhrases.js';

/**
 * The question-type corpus: every shape of question a shopper plausibly
 * types, each in the phrasings people actually use, run end to end through
 * the real modules — classifyIntent, then runCouncil with an empty model
 * roster, exactly the setup test/catalogueLookups.test.js established:
 * a `site-data-direct` result proves zero model calls were made, and a
 * `no_agents_responded` error proves a model call was genuinely attempted.
 *
 * Like test/messyQuestions.test.js (whose header explains why at length),
 * every question here is written, not observed: no history of real user
 * questions exists anywhere to draw on. Treat the set as a hypothesis about
 * how people type, pinned so behaviour cannot silently regress.
 *
 * Three things are asserted for every type:
 *
 *   path      which route answers it. 'deterministic' means no model in the
 *             loop; 'council' means the model fan-out was attempted.
 *   grounding a deterministic answer may contain only figures, retailers
 *             and products that are genuinely in the data (checked against
 *             independently rebuilt sets below), or be an honest refusal.
 *             A council-bound question must arrive with a SITE DATA block
 *             that grounds it or explicitly refuses — never an empty one.
 *   latency   deterministic answers are asserted to finish in
 *             milliseconds (a generous 250ms bound against CI noise;
 *             `npm run bench` measures the real figures, currently ~2-7ms
 *             warm). Council answers cost a network fan-out — seconds —
 *             which cannot be measured from this sandbox (no outbound
 *             network); the proven attempt IS the latency class.
 */

const site = await loadSite();
const emptyModels = { baseUrl: 'https://unused.invalid', apiKey: 'unused', models: [] };
const noop = () => {};

/* ── independently rebuilt grounding sets ─────────────────────────────────
 * Every £ figure a deterministic answer may state, rebuilt here from the
 * same catalogue the answers read — delivered and item prices for every
 * offer, every retailer's shipping figures, every deal's was/now pair. An
 * answer stating any other £ figure invented it (the one exception is a
 * ceiling the reader themselves named, checked per question). */
const legitPrices = new Set();
for (const frag of site.data.DEMO_FRAGRANCES) {
  const rows = site.priceService.buildComparison(site.catalogue.offersFor(frag.id), {
    sortBy: 'delivered',
    tier: frag.tier,
  });
  for (const r of rows) {
    if (r.deliveredPriceGbp != null) legitPrices.add(r.deliveredPriceGbp.toFixed(2));
    if (r.itemPriceGbp != null) legitPrices.add(r.itemPriceGbp.toFixed(2));
  }
}
for (const r of site.retailers.RETAILERS) {
  if (r.shipping?.standardGbp != null) legitPrices.add(r.shipping.standardGbp.toFixed(2));
  if (r.shipping?.freeOverGbp != null) legitPrices.add(r.shipping.freeOverGbp.toFixed(2));
}
for (const d of site.data.DEALS) {
  legitPrices.add(d.price.toFixed(2));
  legitPrices.add(d.wasPrice.toFixed(2));
}

const retailerNames = [...new Set(site.retailers.RETAILERS.map((r) => r.name))];
// Two shapes of product line exist: budget/brand lines carry the
// concentration in parentheses, deals lines are brand+name only.
const productTitles = new Set(
  site.data.DEMO_FRAGRANCES.flatMap((f) => [
    `${f.brand} ${f.name} (${f.concentration})`.toLowerCase(),
    `${f.brand} ${f.name}`.toLowerCase(),
  ]),
);

/** Grounding invariants every deterministic answer must satisfy, whatever
 *  its type: no invented £ figure, no invented retailer, no invented
 *  product, no URL (none is ever in the data), no promoted-listing talk. */
function assertGrounded(question, answer) {
  // The reader's own ceiling is allowed back in the answer, and the
  // refusal's example phrase 'like "under £30"' is an example of what to
  // type, not a price.
  const ceiling = parseBudget(question)?.maxGbp ?? null;
  const stripped = answer.replace(/like "under £30"/g, '');
  for (const m of stripped.matchAll(/£(\d+(?:\.\d+)?)/g)) {
    const value = Number(m[1]);
    if (ceiling !== null && value === ceiling) continue;
    assert.ok(
      legitPrices.has(value.toFixed(2)),
      `"${question}" stated £${m[1]}, which is not a price, shipping figure or deal figure in the catalogue:\n${answer}`,
    );
  }
  // Registry names can contain dots ("MyBeauty.Boutique"), so instead of
  // parsing a name out, check that what follows "delivered from " starts
  // with a real registry name.
  for (const m of answer.matchAll(/delivered from /g)) {
    const rest = answer.slice(m.index + m[0].length);
    assert.ok(
      retailerNames.some((n) => rest.startsWith(n)),
      `"${question}" quoted a retailer not in the registry: "...delivered from ${rest.slice(0, 40)}"`,
    );
  }
  for (const line of answer.split('\n')) {
    const named = line.match(/^(.+?) \d+(?:\.\d+)?ml — £/);
    if (!named) continue;
    assert.ok(
      productTitles.has(named[1].toLowerCase()),
      `"${question}" named "${named[1]}", which is not a catalogue product:\n${answer}`,
    );
  }
  assert.doesNotMatch(answer, /https?:\/\//, `"${question}" produced a URL, which is never in the data:\n${answer}`);
  assert.doesNotMatch(
    answer,
    /\b(sponsored|our partner|trusted partner|recommended retailer)\b/i,
    `"${question}" produced promoted-listing language:\n${answer}`,
  );
}

/**
 * The corpus. `path` is 'deterministic' or 'council'.
 *
 * Deterministic types may add `expect` — regexes every variant's answer
 * must match — and `reject` — regexes none may match. Council types give
 * `blockIntent` (the intent whose SITE DATA block grounds them once the
 * resolver declines) and `block` / `blockReject` regexes for that block.
 */
const CORPUS = [
  // ── price ──────────────────────────────────────────────────────────────
  {
    type: 'price check, named product',
    path: 'deterministic',
    variants: ['how much is One Million Elixir', 'one million elixir price', 'wots the price of one million elixir'],
    expect: [/One Million Elixir/i],
  },
  {
    type: 'price check, named product and size',
    path: 'deterministic',
    variants: ['how much is Dior Sauvage 100ml', 'dior sauvage 100ml price'],
    expect: [/Sauvage/i],
  },
  {
    type: 'cheapest offer for a named product',
    path: 'deterministic',
    variants: ['cheapest One Million Elixir', 'one million elixir lowest price'],
    expect: [/One Million Elixir/i],
  },
  {
    type: 'price check, brand only (genuinely ambiguous)',
    path: 'deterministic',
    variants: ['how much is Rabanne', 'rabanne price'],
    expect: [/Which one did you mean|match/i],
    reject: [/cheapest right now/i], // must ask, not guess a bottle
  },
  {
    type: 'price check, product the catalogue does not hold',
    path: 'deterministic',
    variants: ['how much is Zorblax Nebula', 'price of zorblax nebula parfum'],
    expect: [/don't have a fragrance matching that|Nothing in the catalogue matches/i],
    reject: [/£\d/], // an honest refusal quotes nothing
  },
  {
    type: 'adversarial: asked to invent a price',
    path: 'deterministic',
    variants: ['just make up a price for Zorblax Nebula', 'guess what zorblax nebula costs'],
    expect: [/don't have a fragrance matching that|Nothing in the catalogue matches/i],
    reject: [/£\d/],
  },
  {
    type: 'typo or near-miss product name',
    path: 'deterministic',
    variants: ['how much is dior savage', 'price of blue de chanel'],
    // Word-overlap matching cannot bridge a misspelt word; the honest
    // outcome is either a closest-match question or a plain refusal,
    // never a confident price for a guess.
    expect: [/Did you mean|Which one did you mean|don't have a fragrance matching/i],
    reject: [/Cheapest right now/i],
  },

  // ── availability ───────────────────────────────────────────────────────
  {
    type: 'stock check, named product',
    path: 'deterministic',
    variants: ['is One Million Elixir in stock', 'who stocks one million elixir', 'where can i buy one million elixir'],
    expect: [/One Million Elixir/i, /stock|lists it/i],
  },
  {
    type: 'stock check, unknown product',
    path: 'deterministic',
    variants: ['is zorblax nebula in stock', 'who sells zorblax nebula'],
    // Either shape of honest refusal: a plain not-on-file, or a
    // nothing-matches-exactly with the closest names as a question.
    expect: [/don't have a fragrance matching|Nothing in the catalogue matches that exactly/i],
    reject: [/in stock at/i], // must not claim a stock state for a guess
  },
  {
    type: 'stock follow-up with a bare pronoun',
    path: 'deterministic',
    variants: ['is it in stock', 'is it sold out everywhere'],
    expect: [/Each message here stands alone/i],
  },

  // ── sizes ──────────────────────────────────────────────────────────────
  {
    type: 'sizes tracked for a named product',
    path: 'deterministic',
    variants: ['what sizes of One Million Elixir do you have', 'does one million elixir come in 50ml'],
    expect: [/One Million Elixir/i, /ml/],
  },
  {
    type: 'size follow-up ("what about the 50ml")',
    path: 'deterministic',
    variants: ['what about the 50ml', 'and the 100ml?'],
    expect: [/Each message here stands alone/i],
  },

  // ── delivery ───────────────────────────────────────────────────────────
  {
    type: 'delivery terms for a named shop',
    path: 'deterministic',
    variants: ['how much is delivery from Boots', 'boots delivery cost'],
    expect: [/Boots/],
  },
  {
    type: 'who delivers free',
    path: 'deterministic',
    variants: ['who does free delivery', 'who delivers for free', 'free shipping anywhere?'],
    expect: [/[Ff]ree/],
  },
  {
    type: 'delivery overview, no shop named',
    path: 'deterministic',
    variants: ['how much is postage', 'whats delivery like'],
    expect: [/Delivery is per shop|publish a standard rate/i],
  },
  {
    type: 'delivery to a destination (not recorded)',
    path: 'deterministic',
    variants: ['do you deliver to ireland', 'does boots ship to ireland', 'international shipping?'],
    expect: [/not something this site records|nothing about destinations/i],
    reject: [/\byes\b/i], // must never read as a yes about a destination
  },

  // ── deals ──────────────────────────────────────────────────────────────
  {
    type: 'deals browsing',
    path: 'deterministic',
    variants: ["what's on sale", 'any discounts?', 'best deals rn'],
    expect: [/deals list/i, /item prices before delivery/i],
  },
  {
    type: 'deal check for a named product',
    path: 'deterministic',
    variants: ['any discounts on One Million Elixir', 'is one million elixir on sale'],
    expect: [/One Million Elixir/i],
  },

  // ── budget ─────────────────────────────────────────────────────────────
  {
    type: 'budget filter, plain',
    path: 'deterministic',
    variants: ['what can i get under £50', 'anything decent under 30 quid', 'ive got £40 to spend'],
    expect: [/delivered/i],
  },
  {
    type: 'budget + scent combined',
    path: 'deterministic',
    variants: ['something sweet under £30', 'woody perfume under 50 quid'],
    // Both constraints honoured, and the descriptor reading disclosed.
    expect: [/Read "(sweet|woody)" as|without the scent filter/i],
  },
  {
    type: "the owner's multi-constraint question",
    path: 'deterministic',
    variants: ['find a woman a perfume under £30 that smells sweet', 'sweet perfume for a woman under £40'],
    expect: [/can't filter by who it is for/i],
  },
  {
    type: 'cheapest overall / cheapest of a tier',
    path: 'deterministic',
    variants: ['cheapest niche fragrance you list', 'whats the cheapest thing you have'],
    expect: [/[Cc]heapest.*delivered price|delivered/i],
  },

  // ── comparison ─────────────────────────────────────────────────────────
  {
    type: 'compare two named products',
    path: 'deterministic',
    variants: ['is One Million Elixir cheaper than Aventus', 'one million elixir vs aventus'],
    expect: [/cheaper|no buyable listing/i],
  },
  {
    type: 'compare where one side cannot be pinned down',
    path: 'deterministic',
    variants: ['is Sauvage cheaper than Aventus', 'sauvage vs aventus'],
    expect: [/can't pin down/i],
    reject: [/is cheaper:/],
  },

  // ── brand ──────────────────────────────────────────────────────────────
  {
    type: 'brand coverage',
    path: 'deterministic',
    variants: ['what Creed do you have', 'do you list Amouage'],
    expect: [/bottles? (are|is) tracked|bottle is tracked/i],
  },
  {
    type: 'do-you-have for a named product',
    path: 'deterministic',
    variants: ['do you have Aventus', 'do you sell aventus'],
    expect: [/Aventus/i],
  },

  // ── notes ──────────────────────────────────────────────────────────────
  {
    type: 'what a named product smells like (published notes)',
    path: 'deterministic',
    variants: ['what does One Million Elixir smell like', 'what are the notes in one million elixir'],
    // Either the notes on file or the honest no-notes statement — never a
    // scent description composed from nothing.
    expect: [/notes the retailer listings state|No notes are on file/i],
  },

  // ── meta ───────────────────────────────────────────────────────────────
  {
    type: 'price freshness',
    path: 'deterministic',
    variants: ['how fresh are these prices', 'when were prices last updated'],
    expect: [/harvest|refresh/i],
  },
  {
    type: 'shop coverage',
    path: 'deterministic',
    variants: ['which shops do you cover', 'what retailers do you track'],
    expect: [/shops:/i, /None of them pays for placement/i],
  },
  {
    type: 'catalogue size',
    path: 'deterministic',
    variants: ['how many fragrances do you have', 'how many brands do you track'],
    expect: [/bottles across|brands/i],
  },
  {
    type: 'identity ("who are you")',
    path: 'deterministic',
    variants: ['who are you', 'are you a bot', 'what is pricesniffs'],
    expect: [/Virtual Yanny/i, /not a person/i],
  },

  // ── greetings ──────────────────────────────────────────────────────────
  {
    type: 'greeting, nothing else in the message',
    path: 'deterministic',
    variants: ['hello', 'hey yanny', 'good morning'],
    expect: [/Hello/i],
  },
  {
    type: 'thanks',
    path: 'deterministic',
    variants: ['thanks', 'thank you!'],
    expect: [/No problem/i],
  },

  // ── constraints the catalogue provably lacks ───────────────────────────
  {
    type: 'gender/audience-only request (not recorded — must say so)',
    path: 'deterministic',
    variants: ['perfume for women', 'something for my girlfriend', 'i need a present for my mum'],
    expect: [/can't filter by who it is for/i, /doesn't record that|records neither|records none/i],
    reject: [/delivered from/], // a refusal quotes no listing
  },
  {
    type: 'strength/longevity request (not recorded — must say so)',
    path: 'deterministic',
    variants: ['what perfume you recommend for a smelly man', 'need something that lasts'],
    expect: [/how strong or long-lasting/i],
    reject: [/delivered from/],
  },
  {
    type: 'season/occasion-only request (not recorded — must say so)',
    path: 'deterministic',
    variants: ['recommend me a summer fragrance', 'what should i wear to a wedding', 'anything for the office'],
    expect: [/season or occasion/i],
    reject: [/delivered from/],
  },

  // ── council-bound: taste, policy prose, out of scope ───────────────────
  {
    type: '"smells like X" with a resolvable reference',
    path: 'council',
    blockIntent: 'suggest',
    variants: ['what smells similar to Aventus', 'any dupes for baccarat rouge 540'],
    block: [/NOTE MATCHED CANDIDATES/],
  },
  {
    type: 'scent-descriptor suggestion (grounded, judgement still modelled)',
    path: 'council',
    blockIntent: 'suggest',
    variants: ['something sweet', 'i want something fresh and clean'],
    block: [/NOTE MATCHED CANDIDATES \(requested:/, /HOW THE SCENT WORDS WERE READ/],
  },
  {
    type: 'open taste with nothing to ground on',
    path: 'council',
    blockIntent: 'suggest',
    variants: ['do you have anything nice', 'whats the best perfume you got', 'help me pick something'],
    block: [/NOTE MATCHED CANDIDATES: none requested/, /WHAT CAN BE FILTERED ON INSTEAD/],
  },
  {
    type: 'how the site makes money (policy prose)',
    path: 'council',
    blockIntent: 'general',
    variants: ['how do you make money', 'do you get commission'],
    // The pages' own words are "commission" and "affiliate";
    // policyContextFor's query expansion maps money-phrasings onto them so
    // a page that answers this actually gets attached. Both the affiliate
    // disclosure and the how-it-works page state the commission policy, so
    // either is real grounding.
    block: [/SITE POLICY \((Affiliate disclosure|How PriceSniffs works|About PriceSniffs)\)/],
  },
  {
    type: 'off-topic entirely',
    path: 'council',
    blockIntent: 'general',
    variants: ["what's the weather in london today", 'can you do my homework', 'do you sell skincare'],
    // The block gives a model nothing to invent from: the about line and at
    // most a policy page — no products, no prices. Rule 7 does the refusing.
    block: [/ABOUT THIS SITE/],
    blockReject: [/NOTE MATCHED CANDIDATES \(requested:/, /PRICE MATCH \(/],
  },
];

/* ── the assertions ────────────────────────────────────────────────────── */

test('corpus: at least 30 distinct question types, each with at least 2 phrasings', () => {
  assert.ok(CORPUS.length >= 30, `only ${CORPUS.length} types`);
  for (const entry of CORPUS) {
    assert.ok(entry.variants.length >= 2, `"${entry.type}" has only ${entry.variants.length} variant(s)`);
  }
});

for (const entry of CORPUS) {
  test(`corpus [${entry.path}]: ${entry.type}`, async () => {
    for (const question of entry.variants) {
      const intent = classifyIntent(question);
      const startedAt = performance.now();
      const result = await runCouncil({ question, intent, config: emptyModels, onEvent: noop });
      const ms = performance.now() - startedAt;

      if (entry.path === 'deterministic') {
        assert.equal(
          result.source,
          'site-data-direct',
          `"${question}" (intent ${intent}) was expected to answer deterministically, got: ${JSON.stringify(result)}`,
        );
        // Latency class: milliseconds, no model in the loop. The bound is
        // deliberately generous (CI noise); npm run bench holds the real
        // numbers.
        assert.ok(ms < 250, `"${question}" took ${ms.toFixed(0)}ms — not a milliseconds-class answer`);

        const answer = result.winner.content;
        assert.ok(answer.length > 20, `"${question}" answered with nothing useful`);
        assertGrounded(question, answer);
        for (const re of entry.expect ?? []) {
          assert.match(answer, re, `"${question}" missing ${re}:\n${answer}`);
        }
        for (const re of entry.reject ?? []) {
          assert.doesNotMatch(answer, re, `"${question}" matched forbidden ${re}:\n${answer}`);
        }
      } else {
        // Latency class: council — a model fan-out was genuinely attempted
        // (this sandbox has no outbound network, so with an empty roster
        // the only honest proof is the no_agents_responded error).
        assert.equal(result.ok, false, `"${question}" (intent ${intent}) was answered deterministically: ${JSON.stringify(result)}`);
        assert.equal(result.error, 'no_agents_responded');

        // The grounding the council would have received.
        const block =
          entry.blockIntent === 'suggest'
            ? await suggestContextFor(question)
            : await buildSiteDataBlock(question, entry.blockIntent);
        for (const re of entry.block ?? []) {
          assert.match(block, re, `"${question}" council block missing ${re}:\n${block}`);
        }
        for (const re of entry.blockReject ?? []) {
          assert.doesNotMatch(block, re, `"${question}" council block matched forbidden ${re}:\n${block}`);
        }
      }
    }
  });
}
