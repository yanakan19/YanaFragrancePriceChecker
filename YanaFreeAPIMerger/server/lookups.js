import {
  loadSite,
  resolveProductQuery,
  requestedNotes,
  parseSuggestRequest,
  offerableDescriptors,
} from './siteData.js';
import {
  parseBudget,
  detectAudience,
  detectPerformanceRequest,
  detectOccasionRequest,
} from './requestPhrases.js';

/**
 * Deterministic answers for the question shapes that have exact answers.
 *
 * ── Why these live here and not in the council ───────────────────────────
 * The reported "One Million Elixir" bug was a model confidently denying a
 * fragrance the catalogue underneath it named outright, and it won the
 * anonymous ranking while doing so. The fix for price questions was not a
 * better prompt or a better score: it was noticing that "how much is X" is a
 * database question, and a template reading straight off the database cannot
 * produce a fluent denial because there is no model in the loop to produce
 * one.
 *
 * That argument is not special to price. "Is X in stock", "what does X smell
 * like", "what sizes of X", "how much is delivery from Y", "what's on sale",
 * "what can I get under £50", "is X cheaper than Y", "what Creed do you
 * have", "which shops do you cover", "how fresh are these prices" are all
 * questions whose true answer is already sitting in `demo/data.ts`,
 * `demo/catalogue.generated.ts`, `demo/deals.generated.ts` and
 * `src/config/retailers.ts`. Each one below reads those and formats what it
 * found. None of them can state a price, size, retailer, note or stock state
 * that is not in the data, because every such value in the output text is
 * interpolated from a field that was read, not composed.
 *
 * ── The safety argument, stated once ─────────────────────────────────────
 * Two failure modes are possible in principle for a deterministic answer,
 * and they are handled differently:
 *
 *   1. Saying something untrue about a product. Ruled out structurally —
 *      every figure is interpolated from a catalogue field.
 *   2. Saying something true about the *wrong* product, because the matcher
 *      picked the wrong one. This is the real risk, and it is why every
 *      product-anchored lookup here routes identity through
 *      `resolveProductQuery` (siteData.js) and answers *only* on its
 *      `matched` branch. Its other three branches — `no_match`, `ambiguous`,
 *      `low_confidence` — are refusals, and `formatIdentityRefusal` below is
 *      the single place their words are written. A tie between distinct
 *      products asks which was meant; a weak single match says it is not
 *      certain; nothing scores an answer.
 *
 * Catalogue-wide lookups (deals, budget, delivery terms, coverage) have no
 * identity step to get wrong: they answer about the catalogue itself.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 * Anything without a single right answer in the data: "what's similar to
 * X", "recommend me something for summer", "what should I wear to a
 * wedding". Those stay with the council, where a model's phrasing is the
 * actual product rather than a relay for a number. See council.js.
 */

const gbp = (n) => `£${n.toFixed(2)}`;

/** A short, honest list: at most `max` names, then "and N others". */
function nameList(names, max = 4) {
  if (names.length <= max) {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(', ')} and ${names.length - max} others`;
}

/**
 * The words for every outcome of `resolveProductQuery` that is not a
 * settled identity. Written once, so that "is X in stock", "what does X
 * smell like" and "what sizes of X" all refuse in the same terms rather
 * than each inventing their own hedge.
 *
 * `subject` is what the caller was trying to answer, so the refusal says
 * what could not be done rather than a bare "not found".
 */
export function formatIdentityRefusal(result, subject) {
  if (result.status === 'ambiguous') {
    const names = result.candidates.map((f) => `${f.brand} ${f.name} (${f.concentration})`);
    // See formatPriceAnswer's own note on `exact`: a tie on a complete match
    // and a tie on a partial one are different facts and get different
    // words. Saying "a few products match" about a partial tie overstates
    // what the matcher found.
    if (result.exact === false) {
      return `Nothing in the catalogue matches that exactly. The closest I have: ${names.join(', ')}. Did you mean one of those?`;
    }
    return `A few products match that: ${names.join(', ')}. Which one did you mean?`;
  }
  if (result.status === 'low_confidence') {
    return (
      `The closest I can find is ${result.brand} ${result.name} (${result.concentration}), ` +
      `though I'm not certain that's the one, so I'd rather not state ${subject} for it. ` +
      `Is that what you meant? If not, try the exact brand and product name.`
    );
  }
  // A follow-up shape ("what about the 50ml", "is it in stock") failed for a
  // different reason than a misspelt name did, and the honest refusal names
  // it: no conversation is kept, so there is no "it" to resolve. Saying
  // "try the brand and product name" alone reads as if the bot forgot
  // something it was just told.
  const followUpNote = result.followUp
    ? 'Each message here stands alone — I don\'t carry the previous question over, so I can\'t tell what "it" refers to. '
    : '';
  return (
    `${followUpNote}I don't have a fragrance matching that in the current catalogue. Try the brand and ` +
    'product name together — for example "Dior Sauvage EDT 100ml".'
  );
}

/**
 * Whether a `resolveProductQuery` refusal is too weak to even be worth
 * asking the reader about.
 *
 * An `ambiguous` result with `exact: true` is a real tie between products
 * that genuinely match — worth a "which did you mean". An `ambiguous` result
 * with `exact: false`, or a `low_confidence` one, means the question's words
 * were only partly found anywhere; for question shapes that do not require
 * a named product ("do you have anything nice", "any bargains today") that
 * is not evidence a product was named at all, and listing four unrelated
 * perfumes as "the closest I have" answers a question nobody asked. Those
 * go to the council instead.
 */
function weakIdentity(result) {
  return result.status === 'low_confidence' || (result.status === 'ambiguous' && result.exact === false);
}

/** Every comparison row for one catalogue entry, built exactly the way the
 *  site's own detail page builds it (same buildComparison, same tier
 *  filter), so nothing said here can disagree with the page. */
function rowsFor(site, frag) {
  return site.priceService.buildComparison(site.catalogue.offersFor(frag.id), {
    sortBy: 'delivered',
    tier: frag.tier,
  });
}

/** The date part of the catalogue's own crawl timestamp, for the freshness
 *  caveat every stock answer carries. Never formatted from `new Date()`. */
function crawledOn(site) {
  return String(site.catalogue.CRAWLED_AT ?? '').slice(0, 10);
}

/* ── availability ──────────────────────────────────────────────────────── */

/**
 * Who stocks a named fragrance, and in what stock state, per size.
 *
 * Every retailer named and every stock state stated is read off a
 * `PresentedOffer` built by the site's own pipeline. The five stock states
 * are kept distinct rather than collapsed into "available / not", because
 * `unknown` genuinely means "we could not parse this shop's page" and
 * reporting it as either in or out of stock would be a claim the data does
 * not support — the same distinction `src/types/offer.ts` and
 * `buildComparison`'s STOCK_RANK already make upstream.
 */
export async function resolveAvailabilityQuery(question) {
  const site = await loadSite();
  const resolved = await resolveProductQuery(question, 'availability');
  if (resolved.status !== 'matched') return resolved;

  const sizes = resolved.group.map((frag) => {
    const rows = rowsFor(site, frag);
    const byState = (state) => rows.filter((r) => r.stock === state).map((r) => r.retailer.name).sort();
    const best = site.priceService.bestOffer(rows);
    return {
      sizeMl: frag.sizeMl,
      inStock: byState('inStock'),
      lowStock: byState('lowStock'),
      preOrder: byState('preOrder'),
      unknown: byState('unknown'),
      outOfStock: byState('outOfStock'),
      best: best
        ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name }
        : null,
    };
  });

  return {
    status: 'matched',
    brand: resolved.anchor.brand,
    name: resolved.anchor.name,
    concentration: resolved.anchor.concentration,
    sizes,
    crawledOn: crawledOn(site),
  };
}

export function formatAvailabilityAnswer(result) {
  if (result.status !== 'matched') return formatIdentityRefusal(result, 'stock');

  const label = `${result.brand} ${result.name} (${result.concentration})`;
  const lines = result.sizes.map((s) => {
    const parts = [];
    if (s.inStock.length) parts.push(`in stock at ${nameList(s.inStock)}`);
    if (s.lowStock.length) parts.push(`low stock at ${nameList(s.lowStock)}`);
    if (s.preOrder.length) parts.push(`pre-order at ${nameList(s.preOrder)}`);
    if (s.outOfStock.length) parts.push(`out of stock at ${nameList(s.outOfStock)}`);
    // Never folded into either of the above: a shop whose page we could not
    // read is not evidence either way, and saying so is the only honest
    // option. See src/types/offer.ts on why `unknown` is its own state.
    if (s.unknown.length) parts.push(`${s.unknown.length} shop(s) did not state stock`);
    if (parts.length === 0) return `${s.sizeMl}ml: no shop this site tracks lists it at all.`;
    const price = s.best?.deliveredPriceGbp != null
      ? ` Cheapest ${gbp(s.best.deliveredPriceGbp)} delivered from ${s.best.retailerName}.`
      : '';
    return `${s.sizeMl}ml: ${parts.join('; ')}.${price}`;
  });

  const head = result.sizes.length === 1 ? `${label}. ` : `${label}:\n`;
  return `${head}${lines.join('\n')}\nStock is as of the last catalogue refresh (${result.crawledOn}) and changes faster than that.`;
}

/* ── notes ─────────────────────────────────────────────────────────────── */

/**
 * The published notes for a named fragrance, or a plain statement that none
 * are published.
 *
 * `DemoFragrance.notes` is `null` whenever no retailer listing this site
 * harvested stated any — see its own doc comment in demo/data.ts ("Only ever
 * notes a source explicitly labelled. Null means genuinely unknown"). 3,428
 * of the catalogue's 10,321 entries carry notes at the time of writing
 * (counted with `data.DEMO_FRAGRANCES.filter(f => f.notes).length`), so
 * "not stated" is the common case, not an edge one, and it is exactly the
 * case where a model would be most tempted to fill the gap from its own
 * training. This path cannot: there is no generator, only a field.
 *
 * Notes are merged across the sizes of one product, the same way
 * `suggestContextFor` merges them and for the same measured reason — the
 * 30ml and 100ml rows of one perfume are separate catalogue entries and can
 * carry different, partially overlapping note lists harvested from different
 * retailers' pages.
 */
export async function resolveNotesQuery(question) {
  const site = await loadSite();
  const resolved = await resolveProductQuery(question, 'notes');
  if (resolved.status !== 'matched') return resolved;

  const layers = { top: new Set(), middle: new Set(), base: new Set() };
  let sourcesWithNotes = 0;
  for (const frag of resolved.group) {
    if (!frag.notes) continue;
    sourcesWithNotes++;
    for (const layer of ['top', 'middle', 'base']) {
      for (const n of frag.notes[layer] ?? []) if (n.trim()) layers[layer].add(n.trim());
    }
  }

  return {
    status: 'matched',
    brand: resolved.anchor.brand,
    name: resolved.anchor.name,
    concentration: resolved.anchor.concentration,
    hasNotes: sourcesWithNotes > 0,
    top: [...layers.top],
    middle: [...layers.middle],
    base: [...layers.base],
  };
}

export function formatNotesAnswer(result) {
  if (result.status !== 'matched') return formatIdentityRefusal(result, 'its notes');

  const label = `${result.brand} ${result.name} (${result.concentration})`;
  if (!result.hasNotes) {
    return (
      `No notes are on file for ${label}. This site only stores notes a retailer actually ` +
      'published on its own listing, and none of the shops carrying this one did, so there ' +
      "is nothing to give — I'd rather say that than describe a scent I don't have data for."
    );
  }

  const parts = [];
  if (result.top.length) parts.push(`top: ${result.top.join(', ')}`);
  if (result.middle.length) parts.push(`heart: ${result.middle.join(', ')}`);
  if (result.base.length) parts.push(`base: ${result.base.join(', ')}`);
  return `${label} — ${parts.join('; ')}. These are the notes the retailer listings state, not a scent description.`;
}

/* ── sizes ─────────────────────────────────────────────────────────────── */

const SIZE_RE = /(\d+(?:\.\d+)?)\s?ml\b/i;

/** Which sizes of a named fragrance the catalogue tracks, with each one's
 *  cheapest delivered price. */
export async function resolveSizeQuery(question) {
  const site = await loadSite();
  const resolved = await resolveProductQuery(question, 'size');
  if (resolved.status !== 'matched') return resolved;

  const sizes = resolved.group.map((frag) => {
    const rows = rowsFor(site, frag);
    const best = site.priceService.bestOffer(rows);
    return {
      sizeMl: frag.sizeMl,
      // Three distinguishable states, not two. "No shop lists it" and "every
      // shop that lists it says out of stock" are different facts, and both
      // are different again from "listed and buyable but nobody states a
      // delivery cost". Collapsing them into one sentence would report a
      // real listing as an absent one.
      listedCount: rows.length,
      purchasableCount: rows.filter((r) => r.isPurchasable).length,
      best: best ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name } : null,
    };
  });

  const asked = question.match(SIZE_RE);
  return {
    status: 'matched',
    brand: resolved.anchor.brand,
    name: resolved.anchor.name,
    concentration: resolved.anchor.concentration,
    askedSizeMl: asked ? Number(asked[1]) : null,
    sizes,
  };
}

export function formatSizeAnswer(result) {
  if (result.status !== 'matched') return formatIdentityRefusal(result, 'its sizes');

  const label = `${result.brand} ${result.name} (${result.concentration})`;
  const priceOf = (s) => {
    if (s.best?.deliveredPriceGbp != null) {
      return `${gbp(s.best.deliveredPriceGbp)} delivered from ${s.best.retailerName}`;
    }
    if (s.listedCount === 0) return 'no shop this site tracks lists it';
    if (s.purchasableCount === 0) return 'out of stock at every shop this site tracks';
    return `listed at ${s.purchasableCount} shop(s), none of which states a delivery cost`;
  };
  const tracked = result.sizes.map((s) => `${s.sizeMl}ml`).join(', ');

  if (result.askedSizeMl !== null) {
    const exact = result.sizes.find((s) => s.sizeMl === result.askedSizeMl);
    if (exact) return `Yes — ${label} in ${exact.sizeMl}ml: ${priceOf(exact)}.`;
    return `${label} is on file, but not in ${result.askedSizeMl}ml. Sizes tracked: ${tracked}.`;
  }

  if (result.sizes.length === 1) {
    return `${label} is tracked in one size only, ${result.sizes[0].sizeMl}ml: ${priceOf(result.sizes[0])}.`;
  }
  return `${label} is tracked in ${result.sizes.length} sizes:\n${result.sizes
    .map((s) => `${s.sizeMl}ml: ${priceOf(s)}.`)
    .join('\n')}`;
}

/* ── retailers and delivery ────────────────────────────────────────────── */

/**
 * Which retailer, if any, a question names.
 *
 * Matched against the registry's own `name`, `id` and `domain` rather than a
 * hand-kept list of aliases, so a retailer added to `src/config/retailers.ts`
 * is answerable here the moment it lands. Longest match wins, which is what
 * keeps "The Fragrance Shop" from resolving to "The Fragrance Counter" or
 * vice versa: both share two words, and only the full name settles it.
 */
export async function findRetailerInQuestion(question) {
  const { retailers } = await loadSite();
  const haystack = ` ${question.toLowerCase().replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  let best = null;
  for (const r of retailers.RETAILERS) {
    if (r.enabled === false) continue;
    const forms = [r.name, r.id.replace(/-/g, ' '), r.domain?.replace(/\.(com|co\.uk|uk|net|shop)$/, '')]
      .filter(Boolean)
      .map((f) => f.toLowerCase().replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    for (const form of forms) {
      if (haystack.includes(` ${form} `) && (!best || form.length > best.matchedLength)) {
        best = { retailer: r, matchedLength: form.length };
      }
    }
  }
  return best?.retailer ?? null;
}

const FREE_DELIVERY_RE = /\bfree (delivery|shipping|postage|p ?& ?p)\b|\bdeliver(s|y)? (for )?free\b/i;

/** "Do you deliver to Ireland", "who ships abroad", "international
 *  shipping?" — a question about *where* shops deliver, which is the one
 *  delivery fact the registry does not record. */
const GEO_DELIVERY_RE =
  /\b(?:deliver|delivery|deliveries|ship|ships|shipping|post|posted|send)\s+(?:to|outside|abroad|internationally|overseas)\b|\b(?:international|overseas)\s+(?:delivery|shipping|postage)\b|\bship\s+abroad\b/i;

/**
 * Delivery terms, from `src/config/retailers.ts` and nothing else.
 *
 * Three shapes, in the order a question resolves them:
 *
 *   `retailer`  the question named a shop — its own standard rate, free-over
 *               threshold and estimated days, verbatim.
 *   `free`      "who does free delivery" — the shops whose `standardGbp` is
 *               a real, sourced 0, kept strictly apart from the shops that
 *               are free only above a spend, and from the shops that state
 *               no rate at all. src/services/shipping.ts makes exactly this
 *               distinction ("`0` is a real claim that this shop ships free;
 *               `null` is the absence of one") and collapsing it here would
 *               undo it in prose.
 *   `overview`  no shop named — what delivery costs across the registry.
 *
 * A question that names a *fragrance* rather than a shop is not handled
 * here: the price path already quotes delivered prices, so council.js sends
 * it there instead of answering it twice in two voices.
 */
export async function resolveDeliveryQuery(question) {
  const site = await loadSite();
  const enabled = site.retailers.RETAILERS.filter((r) => r.enabled !== false);
  const terms = (r) => ({
    name: r.name,
    standardGbp: r.shipping.standardGbp,
    freeOverGbp: r.shipping.freeOverGbp,
    estimatedDays: r.shipping.estimatedDays ?? null,
    confirmed: r.shipping.confidence === 'confirmed',
    membershipPerk: r.shipping.membershipPerk?.description ?? null,
  });

  const named = await findRetailerInQuestion(question);

  // Destination questions come first, shop named or not: "does Boots
  // deliver to Ireland" is about the destination, and answering it with
  // Boots's standard rate would look like a yes. The registry records each
  // shop's standard rate, free-over threshold and estimated days — nothing
  // about where it ships — so the honest answer says exactly that, plus the
  // named shop's stated terms where there is one.
  if (GEO_DELIVERY_RE.test(question)) {
    return { kind: 'geography', retailer: named ? terms(named) : null };
  }

  if (named) return { kind: 'retailer', retailer: terms(named) };

  if (FREE_DELIVERY_RE.test(question)) {
    return {
      kind: 'free',
      alwaysFree: enabled.filter((r) => r.shipping.standardGbp === 0).map(terms),
      freeOverSpend: enabled
        .filter((r) => r.shipping.standardGbp !== null && r.shipping.standardGbp > 0 && r.shipping.freeOverGbp !== null)
        .map(terms)
        .sort((a, b) => a.freeOverGbp - b.freeOverGbp)
        .slice(0, 5),
      notStated: enabled.filter((r) => r.shipping.standardGbp === null).map((r) => r.name),
    };
  }

  const stated = enabled.filter((r) => r.shipping.standardGbp !== null);
  const rates = stated.map((r) => r.shipping.standardGbp).sort((a, b) => a - b);
  return {
    kind: 'overview',
    retailerCount: enabled.length,
    statedCount: stated.length,
    lowestGbp: rates[0] ?? null,
    highestGbp: rates[rates.length - 1] ?? null,
    alwaysFree: enabled.filter((r) => r.shipping.standardGbp === 0).map((r) => r.name),
    notStated: enabled.filter((r) => r.shipping.standardGbp === null).map((r) => r.name),
  };
}

export function formatDeliveryAnswer(result) {
  const days = (d) => (Array.isArray(d) && d.length === 2 ? `${d[0]}-${d[1]} days` : null);

  if (result.kind === 'geography') {
    const base =
      'Where each shop delivers to is not something this site records — the retailer registry ' +
      'holds each shop\'s standard delivery cost, any free-over threshold and estimated days, ' +
      'nothing about destinations. For a specific country, check the shop\'s own delivery page.';
    const r = result.retailer;
    if (!r) return base;
    const stated =
      r.standardGbp === null
        ? `${r.name} does not publish a standard delivery cost at all.`
        : r.standardGbp === 0
          ? `What ${r.name} does state: free standard delivery.`
          : `What ${r.name} does state: ${gbp(r.standardGbp)} standard delivery` +
            (r.freeOverGbp !== null ? `, free over ${gbp(r.freeOverGbp)}.` : '.');
    return `${base} ${stated}`;
  }

  if (result.kind === 'retailer') {
    const r = result.retailer;
    // A shop that publishes no standard rate is the one case where there is
    // no number to give, and inventing one is precisely what the registry's
    // own `standardGbp: null` exists to prevent.
    if (r.standardGbp === null) {
      return (
        `${r.name} does not publish a standard delivery cost, so its listings show as ` +
        '"delivery not stated" and are never ranked as the cheapest option here.' +
        (r.freeOverGbp !== null ? ` It does state free delivery over ${gbp(r.freeOverGbp)}.` : '')
      );
    }
    const parts = [
      r.standardGbp === 0
        ? `${r.name} delivers free on any order`
        : `${r.name} charges ${gbp(r.standardGbp)} standard delivery`,
    ];
    if (r.standardGbp > 0 && r.freeOverGbp !== null) parts.push(`free over ${gbp(r.freeOverGbp)}`);
    if (r.standardGbp > 0 && r.freeOverGbp === null) parts.push('with no spend-based free delivery');
    const d = days(r.estimatedDays);
    if (d) parts.push(`estimated ${d}`);
    // Stated rather than buried: the registry marks entries whose shipping
    // figures were sourced indirectly, and a delivered price built on one is
    // exactly as reliable as that source.
    const caveat = r.confirmed ? '' : ' That figure has not been re-confirmed against their own delivery page recently.';
    return `${parts.join(', ')}.${caveat}`;
  }

  if (result.kind === 'free') {
    const lines = [];
    lines.push(
      result.alwaysFree.length
        ? `Free on any order: ${nameList(result.alwaysFree.map((r) => r.name))}.`
        : 'No shop this site tracks delivers free on any order.',
    );
    if (result.freeOverSpend.length) {
      lines.push(
        `Free above a spend: ${result.freeOverSpend.map((r) => `${r.name} over ${gbp(r.freeOverGbp)}`).join(', ')}.`,
      );
    }
    if (result.notStated.length) {
      lines.push(`${nameList(result.notStated)} state no delivery cost at all, which is not the same as free.`);
    }
    return lines.join(' ');
  }

  const bits = [
    `Delivery is per shop, not per site. Of the ${result.retailerCount} shops tracked, ` +
      `${result.statedCount} publish a standard rate, from ${gbp(result.lowestGbp)} to ${gbp(result.highestGbp)}.`,
  ];
  if (result.alwaysFree.length) bits.push(`${nameList(result.alwaysFree)} deliver free on any order.`);
  if (result.notStated.length) {
    bits.push(
      `${nameList(result.notStated)} publish no rate, so their listings show as "delivery not stated" and never rank as cheapest.`,
    );
  }
  bits.push('Prices quoted here are delivered prices unless said otherwise.');
  return bits.join(' ');
}

/* ── deals ─────────────────────────────────────────────────────────────── */

/**
 * The site's own "Top Deals Today" list, which is a fixed snapshot rebuilt
 * on a schedule rather than recomputed per question (see demo/data.ts's own
 * note on DEALS). Every was/now pair here is the retailer's own published
 * reference price — `RawOffer.wasPrice` is only ever populated when the shop
 * published one, never inferred from this site's price history, because
 * presenting a derived figure as a retailer's "was" price is a UK pricing-
 * claims problem and not merely a modelling one (see src/types/offer.ts).
 *
 * Deal prices are *item* prices. That is said in the answer rather than
 * quietly compared against the delivered prices the rest of this file
 * quotes.
 */
export async function resolveDealsQuery(question) {
  const site = await loadSite();
  const named = await resolveProductQuery(question, 'deals');

  const present = (d) => ({
    brand: d.fragrance.brand,
    name: d.fragrance.name,
    concentration: d.fragrance.concentration,
    sizeMl: d.fragrance.sizeMl,
    nowGbp: d.price,
    wasGbp: d.wasPrice,
    percentOff: d.percentOff,
    retailerName: site.index.getRetailer(d.retailerId)?.name ?? null,
  });

  const ranked = [...site.data.DEALS].sort((a, b) => b.percentOff - a.percentOff || a.price - b.price);
  const generatedOn = String(site.data.DEALS_GENERATED_AT ?? '').slice(0, 10);

  if (named.status === 'matched') {
    const ids = new Set(named.group.map((f) => f.id));
    const forProduct = ranked.filter((d) => ids.has(d.fragrance.id));
    return {
      kind: 'product',
      brand: named.anchor.brand,
      name: named.anchor.name,
      concentration: named.anchor.concentration,
      deals: forProduct.map(present),
      generatedOn,
    };
  }
  // An identity the matcher *nearly* settled is refused rather than silently
  // widened into "here are today's top deals", which would answer a question
  // nobody asked while looking like an answer to the one they did. A merely
  // partial match is different: it is not evidence a product was named at
  // all, so those go to the council rather than producing a "did you mean"
  // list of unrelated perfumes.
  if (named.status !== 'no_match') return weakIdentity(named) ? null : named;

  return { kind: 'top', total: ranked.length, deals: ranked.slice(0, 5).map(present), generatedOn };
}

export function formatDealsAnswer(result) {
  if (result.kind === undefined) return formatIdentityRefusal(result, 'a discount');

  const line = (d) =>
    `${d.brand} ${d.name} ${d.sizeMl}ml — ${gbp(d.nowGbp)}, was ${gbp(d.wasGbp)} (${d.percentOff}% off)` +
    (d.retailerName ? ` at ${d.retailerName}` : '') + '.';

  if (result.kind === 'product') {
    const label = `${result.brand} ${result.name} (${result.concentration})`;
    if (result.deals.length === 0) {
      return `${label} is not in the current deals list (built ${result.generatedOn}). That does not mean it is full price everywhere — ask me for its price and I'll give the cheapest delivered.`;
    }
    return `${label}:\n${result.deals.map(line).join('\n')}\nThose are item prices before delivery. Deals list built ${result.generatedOn}.`;
  }

  return (
    `Biggest reductions in the current deals list (${result.total} deals, built ${result.generatedOn}):\n` +
    `${result.deals.map(line).join('\n')}\n` +
    'Those are item prices before delivery, and the was-prices are each retailer\'s own.'
  );
}

/* ── budget ────────────────────────────────────────────────────────────── */

/**
 * Cheapest delivered price per catalogue entry, computed once per process.
 *
 * Safe to memoise for exactly the reason siteData.js's header gives for
 * importing the site modules once: the snapshot this reads from cannot
 * change while the process runs, so a cached derivation of it cannot go
 * stale relative to the answers built beside it. Measured on the live
 * catalogue (10,321 entries, 12,281 offers): 47ms to build, once.
 *
 * Entries with no comparable delivered price are omitted rather than
 * defaulted. A shop that states no delivery cost has no delivered price at
 * all — never a zero — and an out-of-stock listing is not something a
 * "under £50" answer may quote (see `bestOffer`'s own doc comment on why
 * headlining a price nobody can pay is the classic comparison-site lie).
 */
let deliveredIndex = null;
async function deliveredPriceIndex() {
  if (deliveredIndex) return deliveredIndex;
  const site = await loadSite();
  const rows = [];
  for (const frag of site.data.DEMO_FRAGRANCES) {
    const best = site.priceService.bestOffer(rowsFor(site, frag));
    if (!best || best.deliveredPriceGbp === null) continue;
    rows.push({
      frag,
      deliveredPriceGbp: best.deliveredPriceGbp,
      retailerName: best.retailer.name,
    });
  }
  deliveredIndex = rows;
  return rows;
}

const TIER_WORDS = [
  ['niche', /\bniche\b/i],
  ['designer', /\bdesigner\b/i],
  ['mideast', /\b(mid ?east(ern)?|middle eastern|arabian|arabic)\b/i],
];

/**
 * "What can I get under £50", "cheapest niche fragrance you list", and —
 * since a real person puts everything in one sentence — "find a woman a
 * perfume under £30 that smells sweet".
 *
 * A filter over the delivered-price index, not a recommendation: the
 * question asks what the catalogue holds below a number, and that has an
 * exact answer. Which five of the matches are shown is ordered by how many
 * shops carry each one (`popularity`, the site's own ordering signal for
 * every unsorted list — see BY_POPULARITY in demo/data.ts), then by price,
 * so the sample is the same one the site itself would lead with rather than
 * five arbitrary rows.
 *
 * ── Why the scent side is read here, and not left to the council ─────────
 * This used to read the amount and nothing else. Measured against the live
 * catalogue before the change, the owner's own example question
 *
 *   "find a woman a perfume under £30 that smells sweet"
 *
 * classified as `budget` and came back with the five most widely stocked
 * bottles under £30 — chosen for popularity, not for sweetness, the second
 * of them Calvin Klein Obsession For Men. Two of the reader's three
 * constraints were discarded and nothing in the answer said so, which is
 * worse than a refusal: it looks like the question was addressed.
 *
 * So the same `requestedNotes` reading `suggestContextFor` uses runs here
 * too, and its note filter applies *with* the price filter rather than
 * instead of it. The third constraint, who it is for, has no data behind it
 * at all (see `detectAudience` in requestPhrases.js for the counts) and is
 * reported as unmet rather than quietly dropped.
 */
export async function resolveBudgetQuery(question) {
  const index = await deliveredPriceIndex();
  const budget = parseBudget(question);
  const maxGbp = budget?.maxGbp ?? null;
  const tier = TIER_WORDS.find(([, re]) => re.test(question))?.[0] ?? null;

  // No amount and no "cheapest" framing is not a budget question this can
  // answer — hand it back so the council gets it rather than inventing a
  // threshold nobody named.
  const cheapestFraming = /\bcheap(est)?\b/i.test(question);
  if (maxGbp === null && !cheapestFraming) return null;

  const scent = await requestedNotes(question);
  // Lowercased note names in a Set, so the per-fragrance check below is a
  // hash lookup rather than a scan of the request for each of ~10,000 rows.
  // Same equality rule `fragrancesWithNote` uses in demo/data.ts: exact
  // name, case-insensitive, any layer.
  const wantedNotes = new Set(scent.notes.map((n) => n.toLowerCase()));
  const notesOf = (frag) =>
    frag.notes ? ['top', 'middle', 'base'].flatMap((l) => frag.notes[l] ?? []) : [];

  let matches = index;
  if (tier) matches = matches.filter((r) => r.frag.tier === tier);
  if (maxGbp !== null) matches = matches.filter((r) => r.deliveredPriceGbp <= maxGbp);
  // How many survive price and tier *before* the scent filter, so an empty
  // result can say what dropping the scent constraint would give back
  // instead of reading as "the catalogue has nothing".
  const pricedMatching = matches.length;

  let scented = matches;
  if (wantedNotes.size > 0) {
    scented = matches
      .map((r) => ({
        ...r,
        matched: [...new Set(notesOf(r.frag).filter((n) => wantedNotes.has(n.toLowerCase())))],
      }))
      .filter((r) => r.matched.length > 0);
  }

  const items = [...scented]
    .sort((a, b) => {
      // Most of the scent request satisfied first — the same ranking
      // `suggestContextFor` uses and for the same reason: a bottle carrying
      // four of the requested notes is a better answer than one carrying
      // one of them, whatever their popularity.
      if (wantedNotes.size > 0 && (a.matched?.length ?? 0) !== (b.matched?.length ?? 0)) {
        return (b.matched?.length ?? 0) - (a.matched?.length ?? 0);
      }
      return maxGbp === null
        ? a.deliveredPriceGbp - b.deliveredPriceGbp
        : b.frag.popularity - a.frag.popularity || a.deliveredPriceGbp - b.deliveredPriceGbp;
    })
    .slice(0, 5)
    .map((r) => ({
      brand: r.frag.brand,
      name: r.frag.name,
      concentration: r.frag.concentration,
      sizeMl: r.frag.sizeMl,
      deliveredPriceGbp: r.deliveredPriceGbp,
      retailerName: r.retailerName,
      matched: r.matched ?? [],
    }));

  return {
    kind: maxGbp === null ? 'cheapest' : 'under',
    maxGbp,
    tier,
    totalMatching: scented.length,
    pricedMatching,
    pricedTotal: index.length,
    // Only fragrances a shop published notes for can ever pass a scent
    // filter, so a count taken after one is out of that subset and not out
    // of the catalogue. Reported rather than left implied.
    withNotesTotal: wantedNotes.size > 0 ? index.filter((r) => r.frag.notes).length : null,
    scent: {
      families: scent.families,
      literal: scent.literal,
      unmatchedDescriptors: scent.unmatchedDescriptors,
      any: wantedNotes.size > 0,
    },
    unsupported: unsupportedConstraintNotes(question),
    items,
  };
}

/**
 * The constraints an answer was asked for and cannot honour, in the plain
 * voice the rest of this file uses.
 *
 * Deliberately short and free of apology or correction. "A perfume for a
 * smelly man" is a request for something long-lasting, put bluntly; the
 * useful reply is that the data does not rank longevity, not a comment on
 * how it was asked.
 */
export function unsupportedConstraintNotes(question) {
  const notes = [];
  if (detectAudience(question)) notes.push('who it is for');
  if (detectPerformanceRequest(question)) notes.push('how strong or long-lasting something is');
  if (detectOccasionRequest(question)) notes.push('what season or occasion suits it');
  return notes;
}

/** The one sentence that says which constraints went unhonoured. One
 *  sentence and not one per constraint: two near-identical apologies in a
 *  row is exactly the hedging prompt rule 8 rules out. */
function unsupportedSentence(labels, opener) {
  if (labels.length === 0) return '';
  const tail =
    labels.length > 2
      ? 'the catalogue records none of those'
      : labels.length === 2
        ? 'the catalogue records neither'
        : "the catalogue doesn't record that";
  return `${opener} ${nameList(labels)} — ${tail}.`;
}

/**
 * The suggestion questions that have nothing in the catalogue to stand on,
 * answered here instead of by the council.
 *
 * Taste stays with the council, and the bar for taking a question off it is
 * deliberately high — two conditions, both required:
 *
 *   1. The question grounds on nothing. No note, no descriptor the
 *      catalogue carries, no resolvable reference fragrance, no budget.
 *   2. It asks for one of the three things the catalogue provably does not
 *      hold: who a fragrance is for, how strong and long-lasting it is, or
 *      what season or occasion suits it (see `detectAudience`,
 *      `detectPerformanceRequest` and `detectOccasionRequest` in
 *      requestPhrases.js for the measurements behind "provably").
 *
 * Condition 1 alone is not enough, and that is the point of splitting them.
 * "Do you have anything nice" also grounds on nothing, but nothing in the
 * data *contradicts* it either — it is an open taste question, it is what
 * the council is for, and the README says so. It keeps going there.
 *
 * "Recommend me a summer fragrance" used to be in that open-taste group and
 * deliberately is not any more. A grounded council answer to it could only
 * ever be a refusal — the SITE DATA block carries no candidates (season
 * words are listing metadata, see NON_NOTE_VOCABULARY), and rule 1 forbids
 * "summer means citrus" from training — so 28 model calls were being spent
 * writing a refusal no model could be talked out of, the same argument that
 * moved the audience and longevity shapes here. The deterministic refusal
 * names the constraint and offers the real filters instead, in
 * milliseconds. What that costs: a model might have phrased the refusal
 * more conversationally; it could not, within the rules, have said more.
 *
 * What is caught is the question whose central constraint the data cannot
 * serve at all: the owner's own "what perfume you recommend for a smelly
 * man", or "something for my girlfriend". Those used to reach the council
 * with a SITE DATA block saying "NOTE MATCHED CANDIDATES: none requested"
 * and nothing else — 28 models asked to write about fragrances with no
 * fragrance data in front of them, held off naming one by prompt rule 1c
 * alone. The answer at the end of that could only ever be a refusal, and a
 * refusal is the one answer worth writing where no model can be talked out
 * of it. This one says which part of the question the data cannot serve and
 * offers the three things it genuinely can filter on. It names no
 * fragrance, because it cannot.
 */
export async function resolveSuggestQuery(question) {
  const request = await parseSuggestRequest(question);
  const groundable = request.wanted.length > 0 || Boolean(request.reference) || Boolean(request.budget);
  const unsupported = unsupportedConstraintNotes(question);
  if (groundable || unsupported.length === 0) return null;

  return {
    kind: 'ungroundable',
    referenceUnresolved: request.referenceUnresolved,
    unmatchedDescriptors: request.unmatchedDescriptors,
    unsupported,
    descriptors: await offerableDescriptors(),
  };
}

export function formatSuggestAnswer(result) {
  const parts = [];
  if (result.referenceUnresolved) {
    parts.push(
      `I can't pin down "${result.referenceUnresolved}" in the catalogue, so there are no notes of its to match against.`,
    );
  }
  const unsupported = unsupportedSentence(result.unsupported, "I can't filter by");
  if (unsupported) parts.push(unsupported);
  if (result.unmatchedDescriptors.length) {
    parts.push(`Nothing on file under ${nameList(result.unmatchedDescriptors)} either.`);
  }
  if (parts.length === 0) {
    parts.push("That doesn't give me enough to point at anything real.");
  }
  parts.push(
    `What I can go on: a scent word — ${result.descriptors.join(', ')} — a delivered price ceiling ` +
      'like "under £30", or the published notes of a fragrance you name. Any of those and I can give you actual listings.',
  );
  return parts.join(' ');
}

export function formatBudgetAnswer(result) {
  const line = (i) =>
    `${i.brand} ${i.name} (${i.concentration}) ${i.sizeMl}ml — ${gbp(i.deliveredPriceGbp)} delivered from ${i.retailerName}.`;
  const tierWord = result.tier ? `${result.tier === 'mideast' ? 'Middle Eastern' : result.tier} ` : '';

  // How the scent words were read, said out loud. Same rule as the council
  // block: the notes are real catalogue notes and the bottles genuinely
  // list them, but reading "sweet" as vanilla and tonka is this site's
  // interpretation of an English word, and a reader is entitled to see it
  // and disagree with it.
  const scent = result.scent ?? { any: false, families: [], literal: [], unmatchedDescriptors: [] };
  const descriptorWords = new Set(scent.families.map((f) => f.word.toLowerCase()));
  const readingParts = [
    ...scent.families.map(({ word, notes }) => `"${word}" as ${nameList(notes, 4)}`),
    ...scent.literal.filter((n) => !descriptorWords.has(n.toLowerCase())),
  ];
  const reading = scent.any && readingParts.length ? ` Read ${readingParts.join(', ')}.` : '';
  const unmatchedLine = scent.unmatchedDescriptors.length
    ? ` No notes on file for ${nameList(scent.unmatchedDescriptors)}, so that part is not in the filter.`
    : '';
  const caveat = result.unsupported?.length
    ? ` ${unsupportedSentence(result.unsupported, "Can't filter by")}`
    : '';

  if (result.items.length === 0) {
    // A scent filter that emptied a non-empty price list is a different
    // fact from an empty price list, and saying which is which is the
    // difference between a dead end and a next step.
    if (scent.any && result.pricedMatching > 0) {
      return (
        `Nothing ${tierWord}with those notes on file comes in at ${gbp(result.maxGbp)} delivered. ` +
        `${result.pricedMatching.toLocaleString('en-GB')} ${tierWord}bottles are under that without the scent filter, ` +
        `and only ${result.withNotesTotal.toLocaleString('en-GB')} of the ${result.pricedTotal.toLocaleString('en-GB')} ` +
        `priced entries have any notes published at all.${reading}${unmatchedLine}${caveat}`
      );
    }
    return (
      `Nothing ${tierWord}comes in at ${gbp(result.maxGbp)} delivered right now, out of the ` +
      `${result.pricedTotal.toLocaleString('en-GB')} entries with a buyable, delivery-priced listing.${caveat}`
    );
  }

  const scentSource = scent.any
    ? `\nMatched on notes the shops published; only ${result.withNotesTotal.toLocaleString('en-GB')} of the ` +
      `${result.pricedTotal.toLocaleString('en-GB')} priced entries have notes on file.`
    : '';

  if (result.kind === 'cheapest') {
    return (
      `Cheapest ${tierWord}entries by delivered price${scent.any ? ' with those notes on file' : ''}:\n` +
      `${result.items.map(line).join('\n')}\n` +
      `Delivered prices, cheapest buyable listing per bottle.${reading}${unmatchedLine}${caveat}${scentSource}`
    );
  }

  const noun = scent.any ? 'bottles with those notes on file' : 'bottles';
  return (
    `${result.totalMatching.toLocaleString('en-GB')} ${tierWord}${noun} come in at ${gbp(result.maxGbp)} or under delivered. ` +
    `${scent.any ? 'The closest matches' : 'The most widely stocked of them'}:\n${result.items.map(line).join('\n')}\n` +
    `Delivered prices, cheapest buyable listing per bottle.${reading}${unmatchedLine}${caveat}${scentSource}`
  );
}

/* ── comparison ────────────────────────────────────────────────────────── */

const COMPARE_SPLIT_RE = /\s+(?:cheaper than|dearer than|more expensive than|less expensive than|compared to|compared with|versus|vs\.?|or)\s+/i;

/**
 * "Is X cheaper than Y", "X or Y, which is better value".
 *
 * Both sides go through the same `resolveProductQuery` every other lookup
 * uses, and both must come back `matched` before a comparison is stated. If
 * either side is unsettled the answer names *which* side could not be
 * identified rather than quietly comparing the one it did find against
 * something it guessed — a comparison built on one confident half is worse
 * than no comparison, because the reader cannot see which half was invented.
 *
 * "Better value" is deliberately not answered as an opinion. What is
 * compared is the cheapest delivered price of each, and when those are for
 * different bottle sizes the answer says so: £70 for 100ml and £55 for 50ml
 * is not the cheaper bottle winning on value, and presenting it as though it
 * were would be the most easily missed wrong answer in this whole file.
 */
export async function resolveCompareQuery(question) {
  const site = await loadSite();
  const parts = question.split(COMPARE_SPLIT_RE);
  if (parts.length < 2) return null;

  const cheapestOf = async (text) => {
    const resolved = await resolveProductQuery(text, 'compare');
    if (resolved.status !== 'matched') return { side: text.trim(), resolved };
    let best = null;
    for (const frag of resolved.group) {
      const b = site.priceService.bestOffer(rowsFor(site, frag));
      if (!b || b.deliveredPriceGbp === null) continue;
      if (!best || b.deliveredPriceGbp < best.deliveredPriceGbp) {
        best = { deliveredPriceGbp: b.deliveredPriceGbp, retailerName: b.retailer.name, sizeMl: frag.sizeMl };
      }
    }
    return {
      side: text.trim(),
      resolved,
      brand: resolved.anchor.brand,
      name: resolved.anchor.name,
      concentration: resolved.anchor.concentration,
      best,
    };
  };

  const [left, right] = await Promise.all([cheapestOf(parts[0]), cheapestOf(parts[1])]);
  if (left.resolved.status !== 'matched' || right.resolved.status !== 'matched') {
    return { kind: 'unresolved', left, right };
  }
  return { kind: 'compared', left, right };
}

export function formatCompareAnswer(result) {
  const label = (s) => `${s.brand} ${s.name} (${s.concentration})`;

  if (result.kind === 'unresolved') {
    const bad = result.left.resolved.status !== 'matched' ? result.left : result.right;
    return `I can't pin down "${bad.side}", so I can't compare them. ${formatIdentityRefusal(bad.resolved, 'a comparison')}`;
  }

  const { left, right } = result;
  const priced = [left, right].filter((s) => s.best);
  if (priced.length < 2) {
    // Both sides get named even though only one has a figure. Reporting only
    // the missing half reads as though the other was never asked about, and
    // the price that *is* known is the useful part of the answer.
    const missing = left.best ? right : left;
    const known = left.best ? left : right;
    const knownLine = known.best
      ? ` ${label(known)} is ${gbp(known.best.deliveredPriceGbp)} delivered from ${known.best.retailerName} for the ${known.best.sizeMl}ml.`
      : ` ${label(known)} has no such listing either.`;
    return `${label(missing)} has no buyable listing with a stated delivery cost right now, so there is nothing to compare it against.${knownLine}`;
  }

  const cheaper = left.best.deliveredPriceGbp <= right.best.deliveredPriceGbp ? left : right;
  const dearer = cheaper === left ? right : left;
  const sizeNote =
    left.best.sizeMl === right.best.sizeMl
      ? ` Both figures are for the ${left.best.sizeMl}ml.`
      : ` Different bottles though — ${left.best.sizeMl}ml against ${right.best.sizeMl}ml — so that is not a like-for-like price.`;

  return (
    `${label(cheaper)} is cheaper: ${gbp(cheaper.best.deliveredPriceGbp)} delivered from ` +
    `${cheaper.best.retailerName}, against ${gbp(dearer.best.deliveredPriceGbp)} from ` +
    `${dearer.best.retailerName} for ${label(dearer)}.${sizeNote}`
  );
}

/* ── brand browsing ────────────────────────────────────────────────────── */

let brandIndex = null;
/** Every brand in the catalogue with its product count, longest name first
 *  so "Maison Francis Kurkdjian" is preferred over a shorter brand whose
 *  name happens to be a substring of the question too. */
async function brands() {
  if (brandIndex) return brandIndex;
  const site = await loadSite();
  const counts = new Map();
  for (const f of site.data.DEMO_FRAGRANCES) {
    const entry = counts.get(f.brand) ?? { brand: f.brand, products: [] };
    entry.products.push(f);
    counts.set(f.brand, entry);
  }
  brandIndex = [...counts.values()]
    .map((e) => ({ ...e, needle: ` ${e.brand.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} ` }))
    .sort((a, b) => b.needle.length - a.needle.length);
  return brandIndex;
}

/**
 * "What Creed do you have", "do you list Amouage".
 *
 * A brand either is or is not in the catalogue, and how many bottles of it
 * are there is a count — nothing here is a judgement. Returns `null` when
 * the question names no brand this site carries *and* no product either, so
 * the council can take it: "do you have anything nice" is a brand-shaped
 * question with no brand in it, and answering it from a table would be worse
 * than answering it in words.
 */
export async function resolveBrandQuery(question) {
  const site = await loadSite();
  const haystack = ` ${question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const hit = (await brands()).find((b) => haystack.includes(b.needle));

  if (!hit) {
    // No brand named. It may still name a product ("do you have Aventus"),
    // which the product resolver answers; anything else goes to the council.
    const named = await resolveProductQuery(question, 'brand');
    if (named.status === 'no_match' || weakIdentity(named)) return null;
    if (named.status !== 'matched') return named;
    const sizes = named.group.map((f) => {
      const best = site.priceService.bestOffer(rowsFor(site, f));
      return {
        sizeMl: f.sizeMl,
        best: best?.deliveredPriceGbp != null
          ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name }
          : null,
      };
    });
    return {
      kind: 'product',
      brand: named.anchor.brand,
      name: named.anchor.name,
      concentration: named.anchor.concentration,
      sizes,
    };
  }

  const withPrice = hit.products
    .map((f) => {
      const best = site.priceService.bestOffer(rowsFor(site, f));
      return {
        brand: f.brand,
        name: f.name,
        concentration: f.concentration,
        sizeMl: f.sizeMl,
        popularity: f.popularity,
        best: best?.deliveredPriceGbp != null
          ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name }
          : null,
      };
    })
    .sort((a, b) => b.popularity - a.popularity || (a.best?.deliveredPriceGbp ?? Infinity) - (b.best?.deliveredPriceGbp ?? Infinity));

  return {
    kind: 'brand',
    brand: hit.brand,
    productCount: hit.products.length,
    buyableCount: withPrice.filter((p) => p.best).length,
    examples: withPrice.slice(0, 5),
  };
}

export function formatBrandAnswer(result) {
  if (result.kind === undefined) return formatIdentityRefusal(result, 'what is listed');

  if (result.kind === 'product') {
    const label = `${result.brand} ${result.name} (${result.concentration})`;
    const lines = result.sizes.map((s) =>
      s.best
        ? `${s.sizeMl}ml: ${gbp(s.best.deliveredPriceGbp)} delivered from ${s.best.retailerName}.`
        : `${s.sizeMl}ml: nothing buyable with a stated delivery cost right now.`);
    return `Yes — ${label}.\n${lines.join('\n')}`;
  }

  const line = (p) =>
    `${p.brand} ${p.name} (${p.concentration}) ${p.sizeMl}ml` +
    (p.best ? ` — ${gbp(p.best.deliveredPriceGbp)} delivered from ${p.best.retailerName}.` : ' — nothing buyable with a stated delivery cost right now.');

  const head =
    result.productCount === 1
      ? `One ${result.brand} bottle is tracked`
      : `${result.productCount} ${result.brand} bottles are tracked`;
  const buyable =
    result.buyableCount === result.productCount
      ? ''
      : ` ${result.buyableCount} of them have a buyable listing with a stated delivery cost right now.`;

  return `${head} (that count is per bottle size, not per perfume).${buyable}\nMost widely stocked:\n${result.examples.map(line).join('\n')}`;
}

/* ── greetings ─────────────────────────────────────────────────────────── */

const THANKS_RE = /\b(thanks|thank\s+you|thankyou|ta|cheers|nice\s+one)\b/i;

/**
 * "hello" / "thanks", answered in milliseconds instead of by 28 models.
 *
 * intent.js only routes here when the whole message is a greeting or a
 * thanks and nothing else, so there is no question in it to answer and
 * nothing a model could add but phrasing. The reply is a fixed offer of
 * what this service can actually do, with the two live counts read off the
 * snapshot — the same numbers `aboutContext` quotes — so even the hello
 * cannot state a figure the catalogue does not hold.
 */
export async function resolveGreetingQuery(question) {
  const site = await loadSite();
  return {
    kind: THANKS_RE.test(question) ? 'thanks' : 'hello',
    fragranceCount: site.data.DEMO_FRAGRANCES.length,
    retailerCount: site.retailers.RETAILERS.filter((r) => r.enabled !== false).length,
  };
}

export function formatGreetingAnswer(result) {
  if (result.kind === 'thanks') {
    return 'No problem. Ask any time — prices, stock, sizes, deals and delivery for anything this site tracks.';
  }
  return (
    `Hello. I answer from this site's own data: ${result.fragranceCount.toLocaleString('en-GB')} fragrances ` +
    `across ${result.retailerCount} UK shops. Ask me a price ("how much is Dior Sauvage EDT"), what's on sale, ` +
    'what you can get under a budget, or for something by scent — sweet, fresh, woody and so on.'
  );
}

/* ── meta: facts about the service itself ──────────────────────────────── */

const META_IDENTITY_RE =
  /\b(who are you|what are you\b|are you (a |an )?(bot|robot|chatbot|human|ai|real)|what (is|are) (this site|this website|pricesniffs)|what does (this site|this website|pricesniffs) do)\b/i;
const META_FRESHNESS_RE = /\b(how (fresh|old|current|recent|up.to.date)|last (updated|refreshed|checked)|when (was|were|did) .{0,40}(updated|refreshed|crawled|checked|harvested))\b/i;
const META_COVERAGE_RE = /\b((which|what|how many) (shops?|retailers?|stores?|sites?|merchants?)|do you (cover|track|include|check)|shops? do you|retailers? do you)\b/i;
const META_SIZE_RE = /\bhow many (fragrances?|perfumes?|products?|brands?|scents?|bottles?)\b/i;

/**
 * The countable facts about this service, and only those.
 *
 * "How fresh are these prices", "which shops do you cover", "how many
 * fragrances do you have" are questions with numeric answers that go stale
 * hourly, which is exactly the kind a model should never be asked to recall.
 * Every figure below is computed from the loaded snapshot at answer time.
 *
 * Everything else meta — "how do you make money", the affiliate disclosure,
 * privacy, terms — returns `null` and goes to the council. Those answers are
 * prose the site has already written on its own legal pages, `policyContextFor`
 * already puts the relevant page in the SITE DATA block, and truncating a
 * legal page into a one-line template is a worse answer than letting a model
 * summarise the page it is being shown.
 */
export async function resolveMetaQuery(question) {
  const site = await loadSite();

  // "Who are you", "are you a bot", "what is this site". The answer is a
  // fact about the service, not prose from a legal page: what it is, that
  // it is not a person, and the live counts. Everything else about the
  // company (privacy, contact, money) still goes to the council with the
  // real policy page attached — see the null return below.
  if (META_IDENTITY_RE.test(question)) {
    return {
      kind: 'identity',
      companyName: site.legal.COMPANY.name,
      fragranceCount: site.data.DEMO_FRAGRANCES.length,
      retailerCount: site.retailers.RETAILERS.filter((r) => r.enabled !== false).length,
      crawledOn: crawledOn(site),
    };
  }

  if (META_FRESHNESS_RE.test(question)) {
    return {
      kind: 'freshness',
      crawledAt: site.catalogue.CRAWLED_AT ?? null,
      dealsGeneratedAt: site.data.DEALS_GENERATED_AT ?? null,
    };
  }

  if (META_COVERAGE_RE.test(question)) {
    const enabled = site.retailers.RETAILERS.filter((r) => r.enabled !== false);
    return {
      kind: 'coverage',
      names: enabled.map((r) => r.name),
      notStated: enabled.filter((r) => r.shipping.standardGbp === null).map((r) => r.name),
    };
  }

  if (META_SIZE_RE.test(question)) {
    const frags = site.data.DEMO_FRAGRANCES;
    let offers = 0;
    for (const f of frags) offers += site.catalogue.offersFor(f.id).length;
    return {
      kind: 'size',
      fragranceCount: frags.length,
      brandCount: new Set(frags.map((f) => f.brand)).size,
      offerCount: offers,
      retailerCount: site.retailers.RETAILERS.filter((r) => r.enabled !== false).length,
      withNotesCount: frags.filter((f) => f.notes).length,
    };
  }

  return null;
}

export function formatMetaAnswer(result) {
  const n = (x) => x.toLocaleString('en-GB');

  if (result.kind === 'identity') {
    return (
      `I'm Virtual Yanny, ${result.companyName}'s fragrance assistant — an automated price checker, ` +
      `not a person. I answer only from this site's own data: ${n(result.fragranceCount)} fragrances ` +
      `across ${result.retailerCount} UK shops, last refreshed ${result.crawledOn}. ` +
      'Ask me prices, stock, sizes, deals, delivery, or for something by scent.'
    );
  }

  if (result.kind === 'freshness') {
    return (
      `Prices come from the last catalogue harvest, ${String(result.crawledAt).replace('T', ' ').slice(0, 16)} UTC. ` +
      `The deals list is rebuilt on its own slower schedule, last ${String(result.dealsGeneratedAt).replace('T', ' ').slice(0, 16)} UTC. ` +
      'Shops can change a price or sell out between harvests, so check the shop before you buy.'
    );
  }

  if (result.kind === 'coverage') {
    return (
      `${result.names.length} shops: ${result.names.join(', ')}.` +
      (result.notStated.length
        ? ` ${nameList(result.notStated)} publish no standard delivery cost, so they show as "delivery not stated" and never rank as cheapest.`
        : '') +
      ' None of them pays for placement.'
    );
  }

  return (
    `${n(result.fragranceCount)} bottles across ${n(result.brandCount)} brands, ` +
    `${n(result.offerCount)} live listings from ${result.retailerCount} shops. ` +
    `${n(result.withNotesCount)} of the bottles carry notes, which are only stored where a retailer published them.`
  );
}
