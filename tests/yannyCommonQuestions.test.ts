import { test } from 'vitest';
import assert from 'node:assert/strict';
// @ts-expect-error — plain JavaScript module, no declarations
import { resolveQuestion, resolveOfflineAnswer } from '../demo/yanny/engine.js';
// @ts-expect-error — plain JavaScript module, no declarations
import { classifyIntent } from '../demo/yanny/intent.js';
// @ts-expect-error — plain JavaScript module, no declarations
import { loadSite, warmProductIndex } from '../demo/yanny/siteData.js';
// @ts-expect-error — plain JavaScript module, no declarations
import { stripLinks } from '../demo/yanny/links.js';
import { slugify } from '../demo/router';
import { yannyMessageHtml, yannyPlainText } from '../demo/yannyRender';

/**
 * The questions shoppers most often type into Virtual Yanny, asked exactly
 * the way the widget asks them with the AI side disconnected — which is how
 * the site ships until the owner deploys the Worker (see
 * docs/VIRTUAL-YANNY-DEPLOY.md). Each one goes through `classifyIntent` and
 * `resolveQuestion`; a question that would go to the model is answered by
 * `resolveOfflineAnswer`, the same function the widget falls back to.
 *
 * Nothing here pins a price, a shop or a count: the catalogue is rebuilt
 * every day. What is pinned is what makes an answer correct and useful
 * whatever today's prices are:
 *
 *   - the right product is named (and the wrong one is not),
 *   - an answer about a product links to that product's page, and every
 *     link in every answer resolves to a real page on the site,
 *   - every "£X delivered from Shop" beside a product link is exactly the
 *     headline price and shop that page shows today (computed here with the
 *     page's own pipeline, so this holds on any day's data),
 *   - nothing crashes and nothing comes back empty or as a dead end.
 *
 * Written from how people actually type: lowercase, typos, forum shorthand
 * ("cdnim", "br540"), half-sentences, and questions that are not about
 * fragrance at all.
 */

const site = await loadSite();
await warmProductIndex();

interface Case {
  q: string;
  /** Patterns the answer (links stripped) must contain. */
  has?: RegExp[];
  /** Patterns it must not contain. */
  not?: RegExp[];
  /** A product answer: must link to a product page and quote a price or say it is out of stock. */
  product?: boolean;
  /** Must contain at least one link of any kind. */
  link?: boolean;
}

const PRICE_OR_OOS = /£\d+\.\d\d|out of stock/;

const CASES: Case[] = [
  // ── price lookups ────────────────────────────────────────────────────────
  { q: 'cheapest Sauvage EDP 100ml', product: true, has: [/Dior Sauvage \(Eau de Parfum\)/, /100ml/] },
  { q: 'how much is dior sauvage edt', product: true, has: [/Dior Sauvage \(Eau de Toilette\)/] },
  { q: 'price of sauvage', product: true, has: [/Dior Sauvage/] },
  { q: 'sauvage', product: true, has: [/Dior Sauvage/] },
  { q: 'aventus price', product: true, has: [/Creed Aventus/] },
  { q: 'creed aventus 100ml', product: true, has: [/Creed Aventus/, /100ml/] },
  { q: 'how much is baccarat rouge 540', product: true, has: [/Baccarat Rouge 540/] },
  { q: 'mfk baccarat rouge 540 extrait', product: true, has: [/Baccarat Rouge 540 \(Extrait de Parfum\)/] },
  { q: 'lattafa khamrah price', product: true, has: [/Lattafa Khamrah/] },
  { q: 'Armaf Club de Nuit Intense Man price', product: true, has: [/Club De Nuit Intense Man/i] },
  { q: 'ysl libre price', product: true, has: [/Yves Saint Laurent Libre/] },
  { q: 'Tom Ford Oud Wood price', product: true, has: [/Tom Ford Oud Wood/] },
  { q: 'black opium price', product: true, has: [/Black Opium/] },
  { q: 'Carolina Herrera Good Girl price', product: true, has: [/Good Girl/] },
  { q: 'how much is ariana grande cloud', product: true, has: [/Ariana Grande Cloud/] },
  { q: 'xerjoff erba pura 100ml', product: true, has: [/Erba Pura/, /100ml/] },
  { q: 'versace eros edt 100ml', product: true, has: [/Versace Eros \(Eau de Toilette\)/] },
  { q: 'paco rabanne 1 million', product: true, has: [/Rabanne 1 Million/] },
  { q: 'flowerbomb', product: true, has: [/Flowerbomb/] },
  { q: 'prada paradoxe', product: true, has: [/Prada Paradoxe/] },
  { q: 'how much is 9pm by afnan', product: true, has: [/Afnan 9PM/i] },
  { q: 'rasasi hawas', product: true, has: [/Rasasi Hawas/] },
  { q: 'BLEU DE CHANEL PRICE', product: true, has: [/Chanel Bleu De/] },
  { q: 'cheapest place to buy jimmy choo man', product: true, has: [/Jimmy Choo Man/] },
  // Brand written into the product name by some shops and not others: one
  // product, answered, not a "which did you mean" list of near-duplicates.
  { q: 'armani code price', product: true, has: [/Armani Code|Giorgio Armani Code/], not: [/A few products match/] },
  { q: 'Hugo Boss Bottled price', product: true, has: [/Bottled/], not: [/A few products match/] },
  // Typos, shorthand and abbreviations.
  { q: 'sauvge price', product: true, has: [/Dior Sauvage/] },
  { q: 'aventis price', product: true, has: [/Creed Aventus/] },
  { q: 'cdnim', product: true, has: [/Armaf Club De Nuit Intense Man/i] },
  { q: 'cdnim price', product: true, has: [/Armaf Club De Nuit Intense Man/i] },
  { q: 'br540 price', product: true, has: [/Baccarat Rouge 540/] },
  { q: 'jpg le male price', product: true, has: [/Jean Paul Gaultier .*Le Male/] },
  { q: 'ysl y edp', product: true, has: [/Yves Saint Laurent Y \(Eau de Parfum\)/] },
  // A house named, its bottle not in the catalogue: say so, and never quote
  // a different house's bottle (an "Inspired by No. 5" dupe) in its place.
  { q: 'chanel no 5 price', link: true, has: [/Chanel/], not: [/Laurelle|Inspired|delivered from/] },
  { q: 'Le Labo Santal 33 price', link: true, has: [/Le Labo/], not: [/delivered from/] },
  { q: 'do you have Sauvage Elixir', has: [/Sauvage/], not: [/Brandy Designs|Salvage/, /^Yes/] },

  // ── stock, sizes and notes ───────────────────────────────────────────────
  { q: 'where can I buy Lattafa Khamrah', product: true, has: [/Lattafa Khamrah/, /in stock|out of stock|lists it/] },
  { q: 'is Khamrah in stock', product: true, has: [/Khamrah/, /Stock is as of/] },
  { q: 'where to buy Erba Pura', product: true, has: [/Erba Pura/] },
  { q: 'what sizes does Sauvage come in', product: true, has: [/Dior Sauvage/, /sizes?/] },
  { q: 'do you have Aventus', product: true, has: [/^Yes — Creed Aventus/] },
  { q: 'what notes are in Black Orchid', link: true, has: [/Tom Ford Black Orchid/, /top:|heart:|base:|No notes are on file/] },
  { q: 'what does Good Girl smell like', link: true, has: [/Good Girl/, /top:|heart:|base:|No notes are on file/] },
  { q: 'notes in La Vie Est Belle', link: true, has: [/La Vie Est Belle/], not: [/Iris, .*\biris\b/] },
  { q: "what's in Tobacco Vanille", link: true, has: [/Tobacco Vanille/] },

  // ── deals ────────────────────────────────────────────────────────────────
  { q: 'is Bleu de Chanel on offer', link: true, has: [/Chanel Bleu De/, /deals list|% off/] },
  { q: 'is boss bottled on offer', link: true, has: [/Bottled/] },
  { q: 'is Good Girl on sale', link: true, has: [/Good Girl/] },
  { q: 'best deals right now', link: true, has: [/% off/, /The full list: Deals/] },
  { q: 'any discounts?', link: true, has: [/% off/] },
  { q: "what's on sale", link: true, has: [/% off/] },

  // ── budgets and gifts ────────────────────────────────────────────────────
  { q: 'best summer fragrance under £50', link: true, has: [/£50\.00 or under/, /season or occasion/] },
  { q: 'gift for my mum under £40', link: true, has: [/£40\.00 or under/, /Women's/] },
  { q: 'gift for him under £60', link: true, has: [/£60\.00 or under/, /Men's/] },
  { q: 'cheapest perfume under £20', link: true, has: [/£20\.00 or under/] },
  { q: 'aftershave under 30 quid', link: true, has: [/£30\.00 or under/] },
  { q: 'cheap aftershave', link: true, has: [/full-size bottles/], not: [/\b[1-9]ml\b|Vial/] },
  { q: 'something sweet under £30', link: true, has: [/£30\.00 or under/, /"sweet"/] },
  { q: 'perfume for my girlfriend birthday', link: true, has: [/Women's/] },

  // ── comparisons ──────────────────────────────────────────────────────────
  { q: 'compare Aventus and Club de Nuit Intense', link: true, has: [/Creed Aventus/, /Club De Nuit Intense/i, /£/] },
  { q: 'is Aventus cheaper than Green Irish Tweed', link: true, has: [/Creed Aventus/, /Green Irish Tweed/] },
  { q: 'Tom Ford Tobacco Vanille vs Oud Wood', link: true, has: [/Tobacco Vanille/, /Oud Wood/], not: [/can't pin down/] },
  { q: 'khamrah vs angels share', link: true, has: [/Khamrah/, /Angels' Share/] },
  { q: 'which is cheaper sauvage or bleu de chanel', link: true, has: [/Dior Sauvage/, /Chanel Bleu De/] },
  { q: "what's the price difference between sauvage edt and edp", link: true, has: [/Sauvage \(Eau de Toilette\)/, /Sauvage \(Eau de Parfum\)/] },
  { q: 'edp vs edt', has: [/Eau de Parfum/, /Eau de Toilette/, /rule of thumb/] },
  { q: 'what does edp mean', has: [/Eau de Parfum/] },

  // ── by scent and "smells like" ───────────────────────────────────────────
  { q: 'what smells like Baccarat Rouge 540', link: true, has: [/Baccarat Rouge 540/, /shares:/, /not the same as smelling alike/] },
  { q: 'dupe for aventus', link: true, has: [/Creed Aventus/, /shares:/] },
  { q: 'aventus dupe', link: true, has: [/Creed Aventus/, /shares:/] },
  { q: 'what smells like Tobacco Vanille but cheaper', link: true, has: [/Tobacco Vanille/, /cheaper than its/] },
  { q: 'can you recommend a fresh citrus scent', link: true, has: [/shares:/] },
  { q: 'something vanilla, no florals', link: true, has: [/Vanilla/, /leaving out/] },
  { q: 'vanilla perfume for women', link: true, has: [/Vanilla/, /Women's/] },
  { q: 'long lasting perfume', has: [/long-lasting/] },
  { q: 'best fragrance for the office', has: [/season or occasion/] },

  // ── delivery, shops and the site itself ──────────────────────────────────
  { q: 'free delivery shops', link: true, has: [/Free on any order|No shop this site tracks delivers free/] },
  { q: 'how much is delivery from Boots', link: true, has: [/Boots/, /£\d+\.\d\d|delivers free|does not publish/] },
  { q: 'does The Perfume Shop charge for delivery', link: true, has: [/The Perfume Shop/] },
  { q: 'which shops do you compare', has: [/\d+ shops/] },
  { q: 'how fresh are your prices', has: [/harvest/] },
  { q: 'how does this site make money', link: true, has: [/Affiliate disclosure/] },
  { q: 'how do these prices get checked', link: true, has: [/How PriceSniffs works/] },
  { q: 'can i return a perfume', link: true, has: [/Refunds and returns/] },
  { q: 'is my data safe', link: true, has: [/Privacy notice/] },
  { q: 'how do i contact you', link: true, has: [/Contact and feedback/] },
  { q: 'who are you', has: [/Virtual Yanny/] },
  { q: 'what Creed do you have', link: true, has: [/Creed bottles? (are|is) tracked/] },
  { q: 'do you sell Maison Francis Kurkdjian', link: true, has: [/Maison Francis Kurkdjian/] },

  // ── small talk, follow-ups and off-topic ─────────────────────────────────
  { q: 'hi', has: [/Hello/] },
  { q: 'hello yanny', has: [/Hello/] },
  { q: 'thanks', has: [/No problem/] },
  { q: 'help', has: [/Ask me a price/] },
  { q: "what's the weather like today", has: [/only help with fragrance/], not: [/delivered from/] },
  { q: 'who won the football', has: [/only help with fragrance/] },
  { q: 'and the 50ml?', has: [/stands alone/] },
];

/** What the widget shows for a question with the AI side not connected. */
async function answer(q: string): Promise<{ text: string; intent: string; viaModel: boolean }> {
  const intent = classifyIntent(q);
  const r = await resolveQuestion({ question: q, intent });
  if (r.source === 'site-data-direct') return { text: r.winner.content, intent, viaModel: false };
  // The model path must arrive with a usable grounding block…
  assert.ok(typeof r.siteData === 'string' && r.siteData.length > 0 && r.siteData.length <= 16_000, `"${q}": bad SITE DATA block`);
  // …and with no model, the widget answers from the catalogue instead.
  return { text: await resolveOfflineAnswer({ question: q, intent: r.intent }), intent, viaModel: true };
}

/* ── link and price checks against the site's own pages ─────────────────── */

const fragranceIds = new Set(site.data.DEMO_FRAGRANCES.map((f: { id: string }) => f.id));
const brandSlugs = new Set(site.data.DEMO_FRAGRANCES.map((f: { brand: string }) => slugify(f.brand)));
const retailerIds = new Set(site.retailers.RETAILERS.map((r: { id: string }) => r.id));
const legalIds = new Set(site.legal.LEGAL_PAGES.map((p: { id: string }) => p.id));
const LIST_PAGES = new Set(['/deals', '/brands', '/retailers', '/notes', '/about']);

function assertLinksResolve(q: string, text: string): string[] {
  const paths = [...text.matchAll(/\[[^\[\]]+\]\((\/[^\s()]*)\)/g)].map((m) => m[1]!);
  for (const path of paths) {
    const [, kind, param] = path.match(/^\/([a-z]+)\/?(.*)$/) ?? [];
    const id = decodeURIComponent(param ?? '');
    const ok =
      (kind === 'fragrance' && fragranceIds.has(id)) ||
      (kind === 'brands' && id !== '' && brandSlugs.has(id)) ||
      (kind === 'retailers' && id !== '' && retailerIds.has(id)) ||
      (kind === 'legal' && legalIds.has(id)) ||
      (id === '' && LIST_PAGES.has(path));
    assert.ok(ok, `"${q}" links to ${path}, which is not a page on the site`);
    // And the widget renders it as a real in-site link, not as text.
    assert.match(yannyMessageHtml(`[x](${path})`), /<a class="yanny-link" href="\/[^"]+" data-yanny-path=/, `"${q}": ${path} not rendered as a link`);
  }
  return paths;
}

/** "[label](/fragrance/<id>)… £X delivered from Shop" — the figure must be
 *  the page's own headline for that id, today. */
const PRICED_LINK_RE =
  /\]\(\/fragrance\/([^)\s]+)\)(?::| —| is(?: cheaper per ml:)?) £([\d,]+\.\d\d) delivered from (.+?)(?= —|\.(?:\s|$)| ·|,|\n|$| for the)/g;

function assertPricesMatchPages(q: string, text: string): number {
  let checked = 0;
  for (const m of text.matchAll(PRICED_LINK_RE)) {
    const id = decodeURIComponent(m[1]!);
    const rows = site.priceService.buildComparison(site.catalogue.offersFor(id), { sortBy: 'delivered' });
    const best = site.priceService.bestOffer(rows);
    assert.ok(best, `"${q}" quotes £${m[2]} for ${id}, whose page has no buyable offer`);
    assert.equal(best.deliveredPriceGbp?.toFixed(2), m[2]!.replace(/,/g, ''), `"${q}": £${m[2]} for ${id} is not that page's headline price`);
    assert.equal(best.retailer.name, m[3]!.trim(), `"${q}": ${id}'s page headlines ${best.retailer.name}, not ${m[3]}`);
    checked++;
  }
  return checked;
}

/* ── the tests ──────────────────────────────────────────────────────────── */

test('common questions: at least 60 of them, all distinct', () => {
  assert.ok(CASES.length >= 60, `only ${CASES.length}`);
  assert.equal(new Set(CASES.map((c) => c.q.toLowerCase())).size, CASES.length);
});

const DEAD_ENDS = [
  /isn't connected in this build/,
  /isn't available right now/,
  /Something went wrong/,
  /undefined|NaN|\[object Object\]|null\b/,
];

for (const c of CASES) {
  test(`common question: ${c.q}`, async () => {
    const { text } = await answer(c.q);
    assert.ok(text && text.trim().length > 15, `"${c.q}" came back empty`);
    for (const re of DEAD_ENDS) assert.doesNotMatch(text, re, `"${c.q}" is a dead end or leaks a raw value:\n${text}`);

    const plain = stripLinks(text);
    for (const re of c.has ?? []) assert.match(plain, re, `"${c.q}" missing ${re}:\n${text}`);
    for (const re of c.not ?? []) assert.doesNotMatch(plain, re, `"${c.q}" contains forbidden ${re}:\n${text}`);

    const links = assertLinksResolve(c.q, text);
    if (c.link || c.product) assert.ok(links.length > 0, `"${c.q}" has no link:\n${text}`);
    if (c.product) {
      assert.ok(links.some((p) => p.startsWith('/fragrance/')), `"${c.q}" does not link to the product:\n${text}`);
      assert.match(plain, PRICE_OR_OOS, `"${c.q}" has neither a price nor a stock statement:\n${text}`);
    }
    assertPricesMatchPages(c.q, text);
  });
}

test('common questions: the quoted prices really are checked against the pages', async () => {
  // Guards the guard: if the answer wording drifted away from the pattern
  // above, every price check would pass vacuously.
  let checked = 0;
  for (const c of CASES.filter((x) => x.product)) checked += assertPricesMatchPages(c.q, (await answer(c.q)).text);
  assert.ok(checked >= 20, `only ${checked} prices were checked against their pages`);
});

/* ── how an answer is drawn ─────────────────────────────────────────────── */

test('rendering: site links become in-site anchors under the base path; nothing else becomes markup', () => {
  const html = yannyMessageHtml('See [Dior Sauvage (EDT)](/fragrance/ean-123) or [Deals](/deals).', '/sub/');
  assert.match(html, /<a class="yanny-link" href="\/sub\/fragrance\/ean-123" data-yanny-path="\/fragrance\/ean-123">Dior Sauvage \(EDT\)<\/a>/);
  assert.match(html, /<a class="yanny-link" href="\/sub\/deals" data-yanny-path="\/deals">Deals<\/a>/);

  // Escaped, never interpreted: markup in an answer, in a label, in a path.
  const hostile = yannyMessageHtml('<img src=x onerror=alert(1)> [<b>x</b>](/fragrance/a"onmouseover="y) [z](/legal/<script>)');
  assert.doesNotMatch(hostile, /<img|<b>|<script|"onmouseover/);
  assert.match(hostile, /&lt;img src=x onerror=alert\(1\)&gt;/);

  // Off-site, protocol-relative and unknown paths stay text.
  for (const bad of ['[x](https://evil.example)', '[x](//evil.example/a)', '[x](/admin/delete)', '[x](javascript:alert(1))']) {
    assert.doesNotMatch(yannyMessageHtml(bad), /<a /, bad);
  }
  assert.equal(yannyPlainText('Try [Dior Sauvage](/fragrance/x) now'), 'Try Dior Sauvage now');
});
