import {
  concentrationLabel,
  genderCoverage,
  genderDisclosure,
  loadSite,
  productLabel,
  resolveProductQuery,
  sizeSlices,
  requestedNotes,
  parseSuggestRequest,
  offerableDescriptors,
  pricedSlices,
  noteMatchedEntries,
} from './siteData.js';
import { readConcentration } from './productMatch.js';
import { fragranceLink, brandLink, retailerLink, siteLink } from './links.js';
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
    const names = result.candidates.slice(0, 5).map((f) => fragranceLink(productLabel(f), f.id));
    // See formatPriceAnswer's own note on `exact`: a tie on a complete match
    // and a tie on a partial one are different facts and get different
    // words. Saying "a few products match" about a partial tie overstates
    // what the matcher found.
    if (result.exact === false) {
      return `Nothing in the catalogue matches that exactly. The closest I have: ${names.join(', ')}. Did you mean one of those? Type its full name and I'll look again.`;
    }
    return `A few products match that: ${names.join(', ')}. Which one did you mean? Type its full name.`;
  }
  if (result.status === 'low_confidence') {
    return (
      `Closest I can find, though I'm not certain it's the one: ${fragranceLink(productLabel(result), result.anchor?.id)}. ` +
      `I'd rather not state ${subject} for a guess. ` +
      `Not the one you meant? Type the exact brand and product name and I'll look again.`
    );
  }
  // A follow-up shape ("what about the 50ml", "is it in stock") failed for a
  // different reason than a misspelt name did, and the honest refusal names
  // it: no conversation is kept, so there is no "it" to resolve. Saying
  // "try the brand and product name" alone reads as if the bot forgot
  // something it was just told.
  // A house was named and none of its bottles matched: see `brandWordIn` in
  // productMatch.js for why that is a refusal rather than a near miss.
  if (result.brandNamed) {
    return (
      `I can't find that ${result.brandNamed} fragrance in the current catalogue, so I can't give ${subject} for it. ` +
      `Every ${result.brandNamed} bottle that is tracked: ${brandLink(result.brandNamed)}.`
    );
  }
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
 *  site's own detail page builds it (`rowsFor` in demo/app.ts: same
 *  buildComparison, `sortBy: 'delivered'`, and no tier filter — the page
 *  dropped that filter because it hid real in-stock offers, and keeping it
 *  here made a chat answer and the page quote different prices for the same
 *  bottle), so nothing said here can disagree with the page. */
function rowsFor(site, frag) {
  return site.priceService.buildComparison(site.catalogue.offersFor(frag.id), { sortBy: 'delivered' });
}

/** The same, with two shops' rows for one size pooled — see `sizeSlices`
 *  in siteData.js for why one size can be several catalogue rows. */
function rowsForAll(site, frags) {
  return site.priceService.buildComparison(
    frags.flatMap((f) => site.catalogue.offersFor(f.id)),
    { sortBy: 'delivered' },
  );
}

/** A `bestOffer` row reduced to what an answer quotes, plus the id of the
 *  page whose headline it is (see links.js). */
function bestSummary(best, fallbackId) {
  if (!best) return null;
  return {
    deliveredPriceGbp: best.deliveredPriceGbp,
    itemPriceGbp: best.itemPriceGbp,
    retailerName: best.retailer.name,
    id: best.variantId ?? fallbackId ?? null,
  };
}

/** The date part of the catalogue's own crawl timestamp, for the freshness
 *  caveat every stock answer carries. Never formatted from `new Date()`. */
function crawledOn(site) {
  return String(site.catalogue.CRAWLED_AT ?? '').slice(0, 10);
}

/**
 * Which size's page an answer about a whole product should link to: the
 * cheapest buyable size, so the figure a reader sees first on arrival is
 * the lowest one the answer mentioned; else the given fallback.
 */
function pageIdFor(sizes, fallbackId) {
  let best = null;
  for (const s of sizes) {
    if (s.best?.deliveredPriceGbp == null) continue;
    if (!best || s.best.deliveredPriceGbp < best.deliveredPriceGbp) best = s.best;
  }
  return best?.id ?? fallbackId ?? null;
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

  const sizes = sizeSlices(resolved.group).map(({ sizeMl, frags }) => {
    const rows = rowsForAll(site, frags);
    const byState = (state) => [...new Set(rows.filter((r) => r.stock === state).map((r) => r.retailer.name))].sort();
    const best = site.priceService.bestOffer(rows);
    return {
      sizeMl,
      inStock: byState('inStock'),
      lowStock: byState('lowStock'),
      preOrder: byState('preOrder'),
      unknown: byState('unknown'),
      outOfStock: byState('outOfStock'),
      id: frags[0].id,
      best: bestSummary(best, frags[0].id),
    };
  });

  return {
    status: 'matched',
    brand: resolved.anchor.brand,
    name: resolved.anchor.name,
    concentration: resolved.anchor.concentration,
    linkId: pageIdFor(sizes, resolved.anchor.id),
    sizes,
    crawledOn: crawledOn(site),
  };
}

export function formatAvailabilityAnswer(result) {
  if (result.status !== 'matched') return formatIdentityRefusal(result, 'stock');

  const label = fragranceLink(productLabel(result), result.linkId);
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
    const size = fragranceLink(`${s.sizeMl}ml`, s.best?.id ?? s.id);
    if (parts.length === 0) return `${size}: no shop this site tracks lists it at all.`;
    const price = s.best?.deliveredPriceGbp != null
      ? ` Cheapest ${gbp(s.best.deliveredPriceGbp)} delivered from ${s.best.retailerName}.`
      : '';
    return `${size}: ${parts.join('; ')}.${price}`;
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

  // Deduplicated case- and spacing-insensitively, and across layers (the
  // first layer a note is listed in keeps it). Two shops' lists merged
  // naively read "Iris, Jasmine, Orange Blossom, iris, jasmine, orange
  // blossom" for La Vie Est Belle, and "Black Currant ... Blackcurrant" —
  // one note spelt by two shops, printed as two.
  const layers = { top: [], middle: [], base: [] };
  const seen = new Set();
  const keyOf = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  let sourcesWithNotes = 0;
  for (const frag of resolved.group) {
    if (!frag.notes) continue;
    sourcesWithNotes++;
  }
  for (const layer of ['top', 'middle', 'base']) {
    for (const frag of resolved.group) {
      for (const raw of frag.notes?.[layer] ?? []) {
        const n = raw.trim();
        if (!n || seen.has(keyOf(n))) continue;
        seen.add(keyOf(n));
        // A shop that lower-cased its list loses to one that did not.
        layers[layer].push(n[0] === n[0].toLowerCase() ? n.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : n);
      }
    }
  }

  const sizes = pricedSlices(resolved.group, site);
  return {
    status: 'matched',
    brand: resolved.anchor.brand,
    name: resolved.anchor.name,
    concentration: resolved.anchor.concentration,
    linkId: pageIdFor(sizes, resolved.anchor.id),
    hasNotes: sourcesWithNotes > 0,
    top: layers.top,
    middle: layers.middle,
    base: layers.base,
  };
}

export function formatNotesAnswer(result) {
  if (result.status !== 'matched') return formatIdentityRefusal(result, 'its notes');

  const label = fragranceLink(productLabel(result), result.linkId);
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

  const sizes = sizeSlices(resolved.group).map(({ sizeMl, frags }) => {
    const rows = rowsForAll(site, frags);
    const best = site.priceService.bestOffer(rows);
    return {
      sizeMl,
      // Three distinguishable states, not two. "No shop lists it" and "every
      // shop that lists it says out of stock" are different facts, and both
      // are different again from "listed and buyable but nobody states a
      // delivery cost". Collapsing them into one sentence would report a
      // real listing as an absent one.
      listedCount: rows.length,
      purchasableCount: rows.filter((r) => r.isPurchasable).length,
      id: frags[0].id,
      best: bestSummary(best, frags[0].id),
    };
  });

  const asked = question.match(SIZE_RE);
  return {
    status: 'matched',
    brand: resolved.anchor.brand,
    name: resolved.anchor.name,
    concentration: resolved.anchor.concentration,
    linkId: pageIdFor(sizes, resolved.anchor.id),
    askedSizeMl: asked ? Number(asked[1]) : null,
    sizes,
  };
}

export function formatSizeAnswer(result) {
  if (result.status !== 'matched') return formatIdentityRefusal(result, 'its sizes');

  const label = fragranceLink(productLabel(result), result.linkId);
  const sizeLink = (s) => fragranceLink(`${s.sizeMl}ml`, s.best?.id ?? s.id);
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
    if (exact) return `Yes — ${label} in ${sizeLink(exact)}: ${priceOf(exact)}.`;
    return `${label} is on file, but not in ${result.askedSizeMl}ml. Sizes tracked: ${tracked}.`;
  }

  if (result.sizes.length === 1) {
    return `${label} is tracked in one size only, ${sizeLink(result.sizes[0])}: ${priceOf(result.sizes[0])}.`;
  }
  return `${label} is tracked in ${result.sizes.length} sizes:\n${result.sizes
    .map((s) => `${sizeLink(s)}: ${priceOf(s)}.`)
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
    id: r.id,
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
    const shop = retailerLink(r.name, r.id);
    const parts = [
      r.standardGbp === 0
        ? `${shop} delivers free on any order`
        : `${shop} charges ${gbp(r.standardGbp)} standard delivery`,
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
        ? `Free on any order: ${nameList(result.alwaysFree.map((r) => retailerLink(r.name, r.id)))}.`
        : 'No shop this site tracks delivers free on any order.',
    );
    if (result.freeOverSpend.length) {
      lines.push(
        `Free above a spend: ${result.freeOverSpend.map((r) => `${retailerLink(r.name, r.id)} over ${gbp(r.freeOverGbp)}`).join(', ')}.`,
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
    id: d.fragrance.id,
    brand: d.fragrance.brand,
    name: d.fragrance.name,
    concentration: d.fragrance.concentration,
    sizeMl: d.fragrance.sizeMl,
    nowGbp: d.price,
    wasGbp: d.wasPrice,
    percentOff: d.percentOff,
    retailerName: site.retailers.getRetailer(d.retailerId)?.name ?? null,
  });

  const ranked = [...site.data.DEALS].sort((a, b) => b.percentOff - a.percentOff || a.price - b.price);
  const generatedOn = String(site.data.DEALS_GENERATED_AT ?? '').slice(0, 10);

  if (named.status === 'matched') {
    const ids = new Set(named.group.map((f) => f.id));
    const forProduct = ranked.filter((d) => ids.has(d.fragrance.id));
    // Its price today as well, from the same pipeline the page uses: a
    // reader asking "is X on offer" wants to know what it costs either way,
    // and "not in the deals list" alone sends them off to ask again.
    const sizes = pricedSlices(named.group, site);
    const cheapest = sizes
      .filter((v) => v.best?.deliveredPriceGbp != null)
      .sort((a, b) => a.best.deliveredPriceGbp - b.best.deliveredPriceGbp)[0] ?? null;
    return {
      kind: 'product',
      brand: named.anchor.brand,
      name: named.anchor.name,
      concentration: named.anchor.concentration,
      linkId: cheapest?.best.id ?? named.anchor.id,
      cheapest: cheapest
        ? { sizeMl: cheapest.sizeMl, deliveredPriceGbp: cheapest.best.deliveredPriceGbp, retailerName: cheapest.best.retailerName }
        : null,
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
    `${fragranceLink(`${d.brand} ${d.name} ${d.sizeMl}ml`, d.id)} — ${gbp(d.nowGbp)}, was ${gbp(d.wasGbp)} (${d.percentOff}% off)` +
    (d.retailerName ? ` at ${d.retailerName}` : '') + '.';

  if (result.kind === 'product') {
    const label = fragranceLink(productLabel(result), result.linkId);
    if (result.deals.length === 0) {
      const today = result.cheapest
        ? ` Its cheapest right now is ${gbp(result.cheapest.deliveredPriceGbp)} delivered for the ${result.cheapest.sizeMl}ml, from ${result.cheapest.retailerName}.`
        : ' No shop has it buyable with a stated delivery cost right now.';
      return `${label} is not in the current deals list (built ${result.generatedOn}).${today}`;
    }
    return `${label}:\n${result.deals.map(line).join('\n')}\nThose are item prices before delivery. Deals list built ${result.generatedOn}.`;
  }

  return (
    `Biggest reductions in the current deals list (${result.total} deals, built ${result.generatedOn}):\n` +
    `${result.deals.map(line).join('\n')}\n` +
    `Those are item prices before delivery, and the was-prices are each retailer's own. The full list: ${siteLink('Deals', '/deals')}.`
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
 * instead of it. The third constraint, who it is for, was reported as unmet
 * for as long as there was nothing to meet it with; it is now a real filter
 * over `demo/gender.ts`'s reading of the title, disclosed in the answer
 * rather than applied silently — see the audience block inside this
 * function and `genderCoverage` in siteData.js.
 */
const MIN_FULL_SIZE_ML = 30;

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

  // Who it is for, applied as a real filter rather than reported as unmet.
  // The owner's own example, "find a woman a perfume under £30 that smells
  // sweet", used to answer two of its three constraints and name the third
  // as impossible; the second of the five bottles it returned was Calvin
  // Klein Obsession For Men. The reading is the site's own (demo/gender.ts,
  // imported — see `genderCoverage` in siteData.js), it covers 13.54% of the
  // catalogue, and `genderDisclosure` states that inside the answer. The
  // 10,951 bottles whose titles say nothing are excluded from the result and
  // are NOT recorded as rejected on the merits: they were never candidates,
  // because nobody said.
  const who = detectAudience(question);
  const genderReading = who ? AUDIENCE_READING[who] ?? null : null;
  const coverage = genderReading ? await genderCoverage() : null;

  let matches = index;
  // "Cheapest" with no ceiling means the cheapest *bottle*, not the cheapest
  // thing with a price on it: measured, "cheap aftershave" opened with a
  // 3ml 4711 sample and a 3ml roll-on stick. Below 30ml is a travel size or
  // a sample, and the answer says the filter was applied.
  if (maxGbp === null) {
    matches = matches.filter(
      (r) => (r.frag.sizeMl ?? 0) >= MIN_FULL_SIZE_ML && !/\b(vials?|samples?|decants?|testers?|minis?|miniatures?)\b/i.test(r.frag.name),
    );
  }
  if (tier) matches = matches.filter((r) => r.frag.tier === tier);
  if (maxGbp !== null) matches = matches.filter((r) => r.deliveredPriceGbp <= maxGbp);
  if (coverage) matches = matches.filter((r) => coverage.byId.get(r.frag.id)?.reading === genderReading);
  // How many survive price, tier and audience *before* the scent filter, so
  // an empty result can say what dropping the scent constraint would give
  // back instead of reading as "the catalogue has nothing".
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
      id: r.frag.id,
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
    // The audience filter, if one ran: which reading, and the disclosure
    // that has to travel with any answer built on it.
    gender: coverage
      ? {
          reading: genderReading,
          label: coverage.label[genderReading],
          readingTotal: coverage.counts[genderReading],
          disclosure: await genderDisclosure(),
        }
      : null,
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
  // "Who it is for" used to head this list and deliberately no longer does.
  // It is now partly answerable — from title wording, for 13.54% of the
  // catalogue — and the answers that honour it disclose that coverage
  // instead of refusing (see `resolveGenderQuery`). The two below have no
  // data behind them at all and are still refusals.
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
 *   2. It asks for one of the two things the catalogue provably does not
 *      hold: how strong and long-lasting a fragrance is, or what season or
 *      occasion suits it (see `detectPerformanceRequest` and
 *      `detectOccasionRequest` in requestPhrases.js for the measurements
 *      behind "provably"). Who it is for used to be the third and is not
 *      any more — it is partly readable from title wording, and a question
 *      resting entirely on it is answered above by `resolveGenderQuery`
 *      rather than refused here.
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
 * moved the longevity shape here. The deterministic refusal
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

  // "Something for my girlfriend" — the whole question is who it is for, and
  // that is now partly answerable. Only when nothing *else* in it is
  // unanswerable, though: "what perfume you recommend for a smelly man"
  // names a man and a longevity requirement, the longevity is the actual
  // request, and handing back five men's bottles would look like the
  // question had been served when its central constraint was dropped. So an
  // unmet constraint still wins, and the refusal below still names it.
  if (!groundable && unsupported.length === 0) {
    const gender = await resolveGenderQuery(question);
    if (gender) return gender;
  }

  if (groundable || unsupported.length === 0) return null;

  return {
    kind: 'ungroundable',
    referenceUnresolved: request.referenceUnresolved,
    unmatchedDescriptors: request.unmatchedDescriptors,
    unsupported,
    descriptors: await offerableDescriptors(),
  };
}

/* ── who it is for ─────────────────────────────────────────────────────── */

/**
 * What `detectAudience` found, as one of the four readings `demo/gender.ts`
 * produces. Never a fourth mapping invented here: a question naming a man
 * asks for the bottles whose own titles name a man.
 *
 * 'both' — a question naming a man *and* a woman, "a present for my mum and
 * dad" — maps to 'unisex', because the bottles whose titles say they are for
 * both are exactly the ones that say "unisex". That is a small answer (18
 * products) and the disclosure says so; the alternative, quietly returning
 * men's and women's bottles mixed together, would be answering a different
 * question.
 */
const AUDIENCE_READING = { men: 'mens', women: 'womens', both: 'unisex' };

/**
 * "Perfume for women", "something for my girlfriend", "a gift for my dad".
 *
 * The one answer in this file built on a *reading* of the catalogue rather
 * than a field of it, and the whole design is about keeping that visible.
 *
 * ── What it may state, and what it may not ───────────────────────────────
 * It may state that a bottle's title says "Pour Homme", because the title
 * does. Every item below carries the exact phrase that classified it, and
 * the answer prints it, so a reader can check the classification against the
 * words on the card and disagree with it. That is the same standing the
 * scent-descriptor families have (see NOTE_FAMILY_CANDIDATES): a stated
 * reading of real published text, never a claim about how a bottle smells or
 * who should wear it.
 *
 * It may not state anything about the 10,951 bottles whose titles say
 * nothing. They are not returned, they are not counted as unisex, and they
 * are not counted as excluded-on-the-merits either. The answer discloses how
 * many of them there are precisely so that "657 women's bottles out of
 * 12,666" cannot be read as "the catalogue is thin on women's perfume". It
 * is not; it is thin on shops that said.
 *
 * ── Why the listings come from the delivered-price index ─────────────────
 * The same index the budget answers use, so a bottle quoted here is a bottle
 * a reader can actually buy at the price stated, and the ordering (most
 * widely stocked, then cheapest) is the site's own. A gender reading picks
 * *which* rows; it never invents one.
 */
export async function resolveGenderQuery(question) {
  const who = detectAudience(question);
  if (!who) return null;
  const reading = AUDIENCE_READING[who];
  if (!reading) return null;

  const coverage = await genderCoverage();
  const index = await deliveredPriceIndex();

  const matching = index.filter((r) => coverage.byId.get(r.frag.id)?.reading === reading);
  const items = [...matching]
    .sort((a, b) => b.frag.popularity - a.frag.popularity || a.deliveredPriceGbp - b.deliveredPriceGbp)
    .slice(0, 5)
    .map((r) => ({
      id: r.frag.id,
      brand: r.frag.brand,
      name: r.frag.name,
      concentration: r.frag.concentration,
      sizeMl: r.frag.sizeMl,
      deliveredPriceGbp: r.deliveredPriceGbp,
      retailerName: r.retailerName,
      // The words that classified it, straight out of the title.
      phrase: coverage.byId.get(r.frag.id)?.phrase ?? null,
    }));

  return {
    kind: 'gender',
    who,
    reading,
    readingLabel: coverage.label[reading],
    // Products carrying this reading anywhere in the catalogue, and the
    // subset of those with a buyable, delivery-priced listing. Two different
    // numbers and both are said, because "only 61 are buyable" is a fact
    // about the shops today and "657 are women's" is a fact about the
    // titles.
    readingTotal: coverage.counts[reading],
    buyableMatching: matching.length,
    pricedTotal: index.length,
    disclosure: await genderDisclosure(),
    items,
  };
}

export function formatGenderAnswer(result) {
  const n = (x) => x.toLocaleString('en-GB');
  const line = (i) =>
    `${fragranceLink(`${productLabel(i)} ${i.sizeMl}ml`, i.id)} — ${gbp(i.deliveredPriceGbp)} delivered from ${i.retailerName}` +
    (i.phrase ? ` — title says "${i.phrase}".` : '.');

  if (result.items.length === 0) {
    return (
      `Nothing filed as ${result.readingLabel} has a buyable, delivery-priced listing right now, out of the ` +
      `${n(result.readingTotal)} whose titles say so. ${result.disclosure}`
    );
  }

  return (
    `${n(result.readingTotal)} bottles have a title saying they're ${result.readingLabel}, ` +
    `${n(result.buyableMatching)} of them buyable with a stated delivery cost. Most widely stocked:\n` +
    `${result.items.map(line).join('\n')}\n` +
    `${result.disclosure} So this is what the shops labelled, not everything that would suit.`
  );
}

export function formatSuggestAnswer(result) {
  if (result.kind === 'gender') return formatGenderAnswer(result);
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
    `${fragranceLink(`${productLabel(i)} ${i.sizeMl}ml`, i.id)} — ${gbp(i.deliveredPriceGbp)} delivered from ${i.retailerName}.`;
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
  // The audience filter has to be disclosed wherever it ran, including on
  // the empty branches: "nothing under £30 for a woman" is a different fact
  // from "nothing under £30", and a reader who is not told the filter was
  // applied to 5.19% of the catalogue will read it as the stronger one.
  const genderNote = result.gender
    ? ` Filtered to the ${result.gender.readingTotal.toLocaleString('en-GB')} bottles whose titles say ` +
      `${result.gender.label}. ${result.gender.disclosure}`
    : '';

  if (result.items.length === 0) {
    // Two things can be absent here, and only one of them is a price
    // ceiling. "Under £30" has a threshold to quote back; "the cheapest
    // niche fragrance you list" has none — `maxGbp` is null on that branch
    // by design (see resolveBudgetQuery). Quoting it regardless is what
    // this used to do, and `gbp(null)` threw, which reached the reader as
    // the widget's generic "something went wrong" on a question the data
    // could have answered honestly. Measured on the 2026-09-08 catalogue:
    // "cheapest niche fragrance you list" and "cheapest middle eastern
    // fragrance" both took it.
    // The wording for a named ceiling is left exactly as it was; only the
    // no-ceiling branch is new, because only it was unreachable-without-
    // crashing before.
    const capped = result.maxGbp !== null;
    const priced = `${result.pricedTotal.toLocaleString('en-GB')} entries with a buyable, delivery-priced listing`;

    // A scent filter that emptied a non-empty price list is a different
    // fact from an empty price list, and saying which is which is the
    // difference between a dead end and a next step.
    if (scent.any && result.pricedMatching > 0) {
      const lead = capped
        ? `Nothing ${tierWord}with those notes on file comes in at ${gbp(result.maxGbp)} delivered.`
        : `Nothing ${tierWord}with those notes on file has a buyable, delivery-priced listing right now.`;
      const without = capped
        ? `${result.pricedMatching.toLocaleString('en-GB')} ${tierWord}bottles are under that without the scent filter`
        : `${result.pricedMatching.toLocaleString('en-GB')} ${tierWord}bottles have one without the scent filter`;
      return (
        `${lead} ${without}, ` +
        `and only ${result.withNotesTotal.toLocaleString('en-GB')} of the ${result.pricedTotal.toLocaleString('en-GB')} ` +
        `priced entries have any notes published at all.${reading}${unmatchedLine}${caveat}${genderNote}`
      );
    }
    const lead = capped
      ? `Nothing ${tierWord}comes in at ${gbp(result.maxGbp)} delivered right now`
      : `Nothing ${tierWord}has a buyable, delivery-priced listing right now`;
    return `${lead}, out of the ${priced}.${caveat}${genderNote}`;
  }

  const scentSource = scent.any
    ? `\nMatched on notes the shops published; only ${result.withNotesTotal.toLocaleString('en-GB')} of the ` +
      `${result.pricedTotal.toLocaleString('en-GB')} priced entries have notes on file.`
    : '';

  if (result.kind === 'cheapest') {
    return (
      `Cheapest ${tierWord}full-size bottles (${MIN_FULL_SIZE_ML}ml and up) by delivered price${scent.any ? ' with those notes on file' : ''}:\n` +
      `${result.items.map(line).join('\n')}\n` +
      `Delivered prices, cheapest buyable listing per bottle.${reading}${unmatchedLine}${caveat}${genderNote}${scentSource}`
    );
  }

  const noun = scent.any ? 'bottles with those notes on file' : 'bottles';
  return (
    `${result.totalMatching.toLocaleString('en-GB')} ${tierWord}${noun} come in at ${gbp(result.maxGbp)} or under delivered. ` +
    `${scent.any ? 'The closest matches' : 'The most widely stocked of them'}:\n${result.items.map(line).join('\n')}\n` +
    `Delivered prices, cheapest buyable listing per bottle.${reading}${unmatchedLine}${caveat}${genderNote}${scentSource}`
  );
}

/* ── comparison ────────────────────────────────────────────────────────── */

const COMPARE_SPLIT_RE = /\s+(?:cheaper than|dearer than|more expensive than|less expensive than|compared to|compared with|versus|vs\.?|or)\s+/i;

/** The words that only frame a comparison, stripped from the front before
 *  the two sides are looked for. */
const COMPARE_LEAD_RE =
  /^\s*(?:(?:can you |please )?compare(?: the)?(?: prices? of)?|comparison of|(?:what(?:'s| is)? (?:the )?)?(?:price )?difference between|which is (?:cheaper|better|better value|dearer)[,:]?|price of)\s+/i;

/** "X and Y", "X & Y", "X with Y" — only tried once the question has been
 *  framed as a comparison, because "and" is inside real product names
 *  ("Diamonds And Rubies"). Every split point is tried; see below. */
const AND_SPLIT_RE = /\s+(?:and|&|with)\s+/gi;

/** A side that is nothing but a strength ("edp", "the eau de parfum") once
 *  filler is gone — it borrows its product words from the other side. */
function strengthOnly(text) {
  const { wanted, rest } = readConcentration(text);
  if (!wanted) return null;
  const leftover = rest.replace(/\b(the|a|an|one|version|bottle|which|is|cheaper|better|vs|price|and)\b/g, ' ').trim();
  return leftover === '' ? wanted : null;
}

/** "Eau de Parfum" back to the words a question would use for it. */
const STRENGTH_WORDS = {
  'Eau de Parfum': 'edp',
  'Eau de Toilette': 'edt',
  'Eau de Cologne': 'edc',
  'Extrait de Parfum': 'extrait',
  Parfum: 'parfum',
  'Perfume Oil': 'perfume oil',
  Aftershave: 'aftershave',
  'Eau Fraiche': 'eau fraiche',
};

/** Sides a and b of a comparison, each as question text, or null. */
function compareSides(question) {
  const framed = COMPARE_LEAD_RE.test(question) || /\b(which (?:is|one is) (?:cheaper|better|dearer)|difference)\b/i.test(question);
  const body = question.replace(COMPARE_LEAD_RE, '').replace(/[?!.]+\s*$/, '');
  const byWord = body.split(COMPARE_SPLIT_RE);
  if (byWord.length >= 2) return [[byWord[0], byWord.slice(1).join(' ')]];
  if (!framed) return null;
  // Every "and" is a candidate split, left to right; the caller keeps the
  // first one where both halves name a product.
  const out = [];
  for (const m of body.matchAll(AND_SPLIT_RE)) {
    out.push([body.slice(0, m.index), body.slice(m.index + m[0].length)]);
  }
  return out.length ? out : null;
}

/**
 * "Is X cheaper than Y", "X or Y, which is better value", "compare X and
 * Y", "Sauvage EDT vs EDP", "what's the difference between EDP and EDT".
 *
 * Both sides go through the same `resolveProductQuery` every other lookup
 * uses, and both must come back `matched` before a comparison is stated. If
 * either side is unsettled the answer names *which* side could not be
 * identified rather than quietly comparing the one it did find against
 * something it guessed — a comparison built on one confident half is worse
 * than no comparison, because the reader cannot see which half was invented.
 *
 * "Better value" is deliberately not answered as an opinion. What is
 * compared is a delivered price, like for like where the two share a size
 * (100ml first, then the largest shared size), and only when they share
 * none the cheapest of each — said to be different bottles, with a per-ml
 * figure beside each, because £70 for 100ml against £55 for 50ml is not the
 * cheaper bottle winning on value.
 *
 * A side that is only a strength ("Sauvage EDT vs EDP") borrows the other
 * side's product words, and a question whose both sides are only strengths
 * ("edp vs edt") is about the strengths themselves — see
 * `formatStrengthExplainer`.
 */
export async function resolveCompareQuery(question) {
  const site = await loadSite();
  const splits = compareSides(question);
  if (!splits) {
    // "What does EDP mean" — no second side, but a strength on its own.
    const only = strengthOnly(question.replace(/\b(what|does|do|is|mean|means|stand|stands|for)\b/gi, ' '));
    return only ? { kind: 'strengths', strengths: [only], counts: await strengthCounts(site) } : null;
  }

  const sideOf = async (text) => {
    const resolved = await resolveProductQuery(text, 'compare');
    if (resolved.status !== 'matched') return { side: text.trim(), resolved };
    return {
      side: text.trim(),
      resolved,
      brand: resolved.brand ?? resolved.anchor.brand,
      name: resolved.name ?? resolved.anchor.name,
      concentration: resolved.concentration ?? resolved.anchor.concentration,
      slices: pricedSlices(resolved.group, site),
    };
  };

  let firstTry = null;
  for (const [rawA, rawB] of splits) {
    let a = rawA;
    let b = rawB;
    const sa = strengthOnly(a);
    const sb = strengthOnly(b);
    if (sa && sb) {
      return { kind: 'strengths', strengths: [sa, sb], counts: await strengthCounts(site) };
    }
    // "Sauvage EDT vs EDP": the right side is a strength alone, so it is the
    // left side's product in that strength.
    if (sb && !sa) b = `${readConcentration(a).rest} ${STRENGTH_WORDS[sb] ?? sb}`;
    if (sa && !sb) a = `${readConcentration(b).rest} ${STRENGTH_WORDS[sa] ?? sa}`;
    let [left, right] = await Promise.all([sideOf(a), sideOf(b)]);
    // "Tom Ford Tobacco Vanille vs Oud Wood": the house is named once and
    // meant twice. A side that does not settle on its own is tried again
    // with the other side's house in front of it.
    if (left.resolved.status === 'matched' && right.resolved.status !== 'matched') {
      const retry = await sideOf(`${left.brand} ${b}`);
      if (retry.resolved.status === 'matched') right = { ...retry, side: b.trim() };
    } else if (right.resolved.status === 'matched' && left.resolved.status !== 'matched') {
      const retry = await sideOf(`${right.brand} ${a}`);
      if (retry.resolved.status === 'matched') left = { ...retry, side: a.trim() };
    }
    const attempt = { left, right };
    if (left.resolved.status === 'matched' && right.resolved.status === 'matched') {
      return { kind: 'compared', ...attempt };
    }
    if (!firstTry) firstTry = attempt;
  }
  return { kind: 'unresolved', ...firstTry };
}

/** How many bottles the catalogue files under each strength, for the
 *  explainer's one line of real data. */
async function strengthCounts(site) {
  const counts = new Map();
  for (const f of site.data.DEMO_FRAGRANCES) counts.set(f.concentration, (counts.get(f.concentration) ?? 0) + 1);
  return counts;
}

/** The shared size a like-for-like comparison is made at: 100ml if both
 *  have it priced, else the largest size both have priced, else null. */
function sharedSize(left, right) {
  const priced = (side) => new Set(side.slices.filter((v) => v.best?.deliveredPriceGbp != null).map((v) => v.sizeMl));
  const a = priced(left);
  const shared = [...priced(right)].filter((s) => s !== null && a.has(s));
  if (shared.length === 0) return null;
  return shared.includes(100) ? 100 : Math.max(...shared);
}

function nearestFullSize(side) {
  let best = null;
  const gap = (v) => Math.abs((v.sizeMl ?? 0) - 100);
  for (const v of side.slices) {
    if (v.best?.deliveredPriceGbp == null) continue;
    if (!best || gap(v) < gap(best) || (gap(v) === gap(best) && v.best.deliveredPriceGbp < best.best.deliveredPriceGbp)) best = v;
  }
  return best;
}

/**
 * EDP against EDT, as a convention and not as a measurement.
 *
 * This is the one answer in the file that is not read off the catalogue,
 * and it is written to say so: the strength bands are the industry's usual
 * rule of thumb, houses set their own, and nothing here measures how long a
 * bottle lasts. What the catalogue can add — how many bottles it files
 * under each — it adds, and it offers the comparison it can genuinely make,
 * a price comparison of one named fragrance across its strengths.
 */
const STRENGTH_BANDS = {
  'Extrait de Parfum': 'Extrait de Parfum is usually the strongest, roughly 20-40% perfume oil',
  Parfum: 'Parfum (or Pure Parfum) is usually around 20-30% perfume oil',
  'Eau de Parfum': 'Eau de Parfum (EDP) is usually around 15-20% perfume oil',
  'Eau de Toilette': 'Eau de Toilette (EDT) is usually around 5-15%',
  'Eau de Cologne': 'Eau de Cologne (EDC) is usually lighter still, around 2-5%',
  'Eau Fraiche': 'Eau Fraiche is usually the lightest, around 1-3%',
  'Perfume Oil': 'Perfume Oil is perfume in an oil base rather than alcohol, usually applied by roller or dab',
  Aftershave: 'Aftershave is usually the lightest of all, often with skin-soothing ingredients',
};

function formatStrengthExplainer(result) {
  const n = (x) => x.toLocaleString('en-GB');
  const wanted = [...new Set(result.strengths)];
  const ladder = (wanted.length >= 2 ? wanted : ['Eau de Parfum', 'Eau de Toilette', ...wanted])
    .filter((s, i, all) => all.indexOf(s) === i && STRENGTH_BANDS[s])
    .map((s) => STRENGTH_BANDS[s]);
  const tracked = wanted
    .map((s) => `${n(result.counts.get(s) ?? 0)} ${s} bottles`)
    .join(' and ');
  return (
    `${ladder.join('; ')}. That's the usual rule of thumb, not a measurement — each house sets its own strength, ` +
    'and the same name can smell a little different in each. This site records the strength each shop states, ' +
    `not how long a bottle lasts. Tracked here: ${tracked}. ` +
    'Name a fragrance ("Sauvage EDT vs EDP") and I\'ll compare the prices of its strengths.'
  );
}

export function formatCompareAnswer(result) {
  if (result.kind === 'strengths') return formatStrengthExplainer(result);

  if (result.kind === 'unresolved') {
    const bad = result.left.resolved.status !== 'matched' ? result.left : result.right;
    return `I can't pin down "${bad.side}", so I can't compare them. ${formatIdentityRefusal(bad.resolved, 'a comparison')}`;
  }

  const { left, right } = result;
  const label = (s, v) => fragranceLink(productLabel(s), v?.best?.id ?? s.slices[0]?.ids[0]);
  const perMl = (v) => (v.sizeMl ? ` (£${(v.best.deliveredPriceGbp / v.sizeMl).toFixed(2)}/ml)` : '');

  const size = sharedSize(left, right);
  if (size !== null) {
    const lv = left.slices.find((v) => v.sizeMl === size);
    const rv = right.slices.find((v) => v.sizeMl === size);
    const [cheaper, cv, dearer, dv] =
      lv.best.deliveredPriceGbp <= rv.best.deliveredPriceGbp ? [left, lv, right, rv] : [right, rv, left, lv];
    const gap = dv.best.deliveredPriceGbp - cv.best.deliveredPriceGbp;
    const verdict = gap < 0.005
      ? 'They cost the same.'
      : `${productLabel(cheaper)} is ${gbp(gap)} cheaper.`;
    return (
      `Like for like at ${size}ml: ${label(cheaper, cv)} is ${gbp(cv.best.deliveredPriceGbp)} delivered from ` +
      `${cv.best.retailerName}, and ${label(dearer, dv)} is ${gbp(dv.best.deliveredPriceGbp)} from ` +
      `${dv.best.retailerName}. ${verdict}`
    );
  }

  // No shared size: each side's buyable size nearest a full 100ml bottle,
  // rather than each side's cheapest — which is nearly always a 10ml
  // decant, and "£11.10 against £233.55" said nothing about the two
  // perfumes. Per-ml figures go beside both.
  const lc = nearestFullSize(left);
  const rc = nearestFullSize(right);
  if (!lc || !rc) {
    // Both sides get named even though only one has a figure. Reporting only
    // the missing half reads as though the other was never asked about, and
    // the price that *is* known is the useful part of the answer.
    const [missing, known, kv] = lc ? [right, left, lc] : [left, right, rc];
    const knownLine = kv
      ? ` ${label(known, kv)} is ${gbp(kv.best.deliveredPriceGbp)} delivered from ${kv.best.retailerName} for the ${kv.sizeMl}ml.`
      : ` ${productLabel(known)} has no such listing either.`;
    return `${label(missing)} has no buyable listing with a stated delivery cost right now, so there is nothing to compare it against.${knownLine}`;
  }

  const [cheaper, cv, dearer, dv] =
    lc.best.deliveredPriceGbp / (lc.sizeMl || 1) <= rc.best.deliveredPriceGbp / (rc.sizeMl || 1)
      ? [left, lc, right, rc]
      : [right, rc, left, lc];
  return (
    `${label(cheaper, cv)} is cheaper per ml: ${gbp(cv.best.deliveredPriceGbp)} delivered from ${cv.best.retailerName} ` +
    `for the ${cv.sizeMl}ml${perMl(cv)}, against ${gbp(dv.best.deliveredPriceGbp)} from ${dv.best.retailerName} for the ` +
    `${dv.sizeMl}ml of ${label(dearer, dv)}${perMl(dv)}. They don't share a size that's buyable at both, so compare the per-ml figures.`
  );
}

/* ── concentration browsing ────────────────────────────────────────────── */

/**
 * The words a reader uses for a strength, and the catalogue values each one
 * names.
 *
 * This table maps *requests* onto values; it never asserts a value exists.
 * Every lookup below intersects it with the live catalogue and answers from
 * the intersection, so a concentration that falls out of the data stops
 * being offered instead of being claimed. Measured over DEMO_FRAGRANCES on
 * the current harvest (`npx tsx` counting `f.concentration`):
 *
 *   Eau de Parfum 8,138 · Eau de Toilette 3,094 · Extrait de Parfum 465 ·
 *   Parfum 344 · Eau de Cologne 247 · Not stated 208 · Perfume Oil 112 ·
 *   Aftershave 34 · Eau Fraiche 23 · Extrait 1
 *
 * Three of those are recent and are the reason this table exists at all.
 * `Perfume Oil` became a real value in its own right (112 products that had
 * been mis-filed under "Perfume"), `Extrait de Parfum` was recapitalised,
 * and the retailer shrugs — bare "Perfume", "Fragrance", "Oud" — became
 * `Not stated`. Before this table a reader asking "do you have any perfume
 * oils" got no deterministic answer at all and the question went to the
 * council with no concentration data in front of it.
 *
 * Longest phrase first, and the reason is mechanical: "eau de parfum"
 * contains "parfum", so a shorter-first scan would report 344 Parfums for a
 * question about the 8,138 Eaux de Parfum.
 */
const CONCENTRATION_PHRASES = [
  ['extrait de parfum', ['Extrait de Parfum', 'Extrait']],
  ['eau de parfum', ['Eau de Parfum']],
  ['eau de toilette', ['Eau de Toilette']],
  ['eau de cologne', ['Eau de Cologne']],
  ['eau fraiche', ['Eau Fraiche']],
  ['perfume oil', ['Perfume Oil']],
  ['fragrance oil', ['Perfume Oil']],
  ['aftershave', ['Aftershave']],
  ['aftershaves', ['Aftershave']],
  ['perfume oils', ['Perfume Oil']],
  ['extraits', ['Extrait de Parfum', 'Extrait']],
  ['extrait', ['Extrait de Parfum', 'Extrait']],
  ['colognes', ['Eau de Cologne']],
  ['cologne', ['Eau de Cologne']],
  ['edp', ['Eau de Parfum']],
  ['edt', ['Eau de Toilette']],
  ['edc', ['Eau de Cologne']],
  ['parfum', ['Parfum']],
].sort((a, b) => b[0].length - a[0].length);

/**
 * Strength words this catalogue does not grade on, and must not pretend to.
 *
 * "Attar" is the case that forced this. It is a real word for a real thing
 * and readers do type it, but no product in this catalogue carries it as a
 * concentration — checked at answer time by `resolveConcentrationQuery`
 * rather than asserted here, so if a feed ever starts publishing it the
 * refusal turns itself off. The nearest thing the catalogue holds is the
 * brand "Attar & Co", which is a different claim and is not offered as a
 * substitute: a reader asking for attars is asking about a kind of
 * fragrance, not about one house.
 *
 * "Oud" is deliberately NOT here, even though it used to be a concentration
 * value and the harvest has since reclassified it to `Not stated` as a
 * retailer shrug. It is also a note the catalogue really carries, and "do
 * you have any oud" is overwhelmingly a note question — answering it with a
 * lecture about strengths would take a question this site can genuinely
 * serve and route it to a refusal. The same reasoning keeps bare "perfume"
 * out: it is the word half the corpus uses for "fragrance".
 */
const NON_CONCENTRATION_WORDS = new Map([
  ['attar', 'Attar is not one of the strengths this catalogue records.'],
  ['attars', 'Attar is not one of the strengths this catalogue records.'],
  ['ittar', 'Ittar is not one of the strengths this catalogue records.'],
  ['perfume oil concentrate', 'Not a value this catalogue records.'],
]);

let concentrationIndex = null;
/** Every concentration the catalogue actually uses, with its products.
 *  Keyed by the exact stored string, which is what `Not stated` is one of. */
async function concentrations() {
  if (concentrationIndex) return concentrationIndex;
  const site = await loadSite();
  const byValue = new Map();
  for (const f of site.data.DEMO_FRAGRANCES) {
    const entry = byValue.get(f.concentration) ?? { value: f.concentration, products: [] };
    entry.products.push(f);
    byValue.set(f.concentration, entry);
  }
  concentrationIndex = byValue;
  return concentrationIndex;
}

/** The stated strengths, commonest first, never including `Not stated` —
 *  which is the absence of one and is reported separately. */
async function statedConcentrations() {
  const byValue = await concentrations();
  return [...byValue.values()]
    .filter((e) => concentrationLabel(e.value) !== null)
    .sort((a, b) => b.products.length - a.products.length);
}

/**
 * "Do you have any perfume oils", "do you stock extrait de parfum", "what
 * attars do you have".
 *
 * A count and a sample, both read off the catalogue. Returns `null` when the
 * question names no strength at all, so nothing else routed here changes.
 *
 * The one judgement in it is the `Not stated` rule: a reader asking which
 * concentrations the site covers is told the stated ones and then told, as a
 * separate fact, how many products no shop graded. Listing "Not stated"
 * among Eau de Parfum and Extrait de Parfum would present a missing answer
 * as a kind of perfume.
 */
export async function resolveConcentrationQuery(question) {
  const haystack = ` ${question.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const byValue = await concentrations();

  const named = CONCENTRATION_PHRASES.find(([phrase]) => haystack.includes(` ${phrase} `));
  if (named) {
    const [phrase, values] = named;
    const present = values.filter((v) => (byValue.get(v)?.products.length ?? 0) > 0);
    if (present.length === 0) {
      return { kind: 'concentration-absent', phrase, reason: null, stated: await statedSummary() };
    }
    const products = present.flatMap((v) => byValue.get(v).products);
    const site = await loadSite();
    // Buyable first, then popularity. Sorting on popularity alone filled the
    // Perfume Oil sample with five bottles that read "nothing buyable with a
    // stated delivery cost right now" — true of each of them, and useless as
    // an answer to "do you have any". The count above is still the whole
    // group, and the buyable count is stated beside it.
    const priced = products.map((f) => ({ f, best: site.priceService.bestOffer(rowsFor(site, f)) }));
    const examples = [...priced]
      .sort((a, b) =>
        Number(b.best?.deliveredPriceGbp != null) - Number(a.best?.deliveredPriceGbp != null) ||
        b.f.popularity - a.f.popularity)
      .slice(0, 5)
      .map(({ f, best }) => {
        return {
          id: f.id,
          brand: f.brand,
          name: f.name,
          concentration: f.concentration,
          sizeMl: f.sizeMl,
          best: best?.deliveredPriceGbp != null
            ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name }
            : null,
        };
      });
    return {
      kind: 'concentration',
      phrase,
      values: present,
      productCount: products.length,
      buyableCount: priced.filter((p) => p.best?.deliveredPriceGbp != null).length,
      catalogueTotal: site.data.DEMO_FRAGRANCES.length,
      examples,
    };
  }

  for (const [word, reason] of NON_CONCENTRATION_WORDS) {
    if (!haystack.includes(` ${word} `)) continue;
    // Checked against the live data rather than trusted: if any product ever
    // carries this as its concentration, this is no longer a refusal to make.
    if ((byValue.get(word)?.products.length ?? 0) > 0) continue;
    const cased = [...byValue.keys()].find((v) => v.toLowerCase() === word);
    if (cased && byValue.get(cased).products.length > 0) continue;
    return { kind: 'concentration-absent', phrase: word, reason, stated: await statedSummary() };
  }

  return null;
}

/** The stated strengths with their counts, plus the ungraded pile, for the
 *  two answers that have to name the whole vocabulary. */
async function statedSummary() {
  const byValue = await concentrations();
  const site = await loadSite();
  return {
    values: (await statedConcentrations()).map((e) => ({ value: e.value, count: e.products.length })),
    notStatedCount: [...byValue.values()]
      .filter((e) => concentrationLabel(e.value) === null)
      .reduce((n, e) => n + e.products.length, 0),
    total: site.data.DEMO_FRAGRANCES.length,
  };
}

/** The whole vocabulary as one clause, `Not stated` kept out of the list and
 *  named afterwards as the absence it is. */
function concentrationVocabularySentence(stated) {
  const n = (x) => x.toLocaleString('en-GB');
  return (
    `${stated.values.map((v) => `${v.value} (${n(v.count)})`).join(', ')}. ` +
    `A further ${n(stated.notStatedCount)} of the ${n(stated.total)} bottles have no strength stated — ` +
    'the shop listing them did not say, so neither do I.'
  );
}

export function formatConcentrationAnswer(result) {
  const n = (x) => x.toLocaleString('en-GB');

  if (result.kind === 'concentration-absent') {
    return (
      `Nothing is filed under "${result.phrase}" here. ` +
      (result.reason ? `${result.reason} ` : '') +
      `The strengths the catalogue does record: ${concentrationVocabularySentence(result.stated)}`
    );
  }

  if (result.kind === 'concentration-vocabulary') {
    return `The strengths shops stated on these listings: ${concentrationVocabularySentence(result.stated)}`;
  }

  const line = (p) =>
    `${fragranceLink(`${productLabel(p)} ${p.sizeMl}ml`, p.id)}` +
    (p.best ? ` — ${gbp(p.best.deliveredPriceGbp)} delivered from ${p.best.retailerName}.` : ' — nothing buyable with a stated delivery cost right now.');

  const valueWords = result.values.length > 1 ? `${nameList(result.values)} between them` : result.values[0];
  const buyable =
    result.buyableCount === result.productCount
      ? ''
      : ` ${n(result.buyableCount)} of them have a buyable listing with a stated delivery cost right now.`;
  return (
    `${n(result.productCount)} of the ${n(result.catalogueTotal)} tracked bottles are filed as ${valueWords} ` +
    `(that count is per bottle size, not per perfume).${buyable}\nMost widely stocked of the buyable ones:\n` +
    `${result.examples.map(line).join('\n')}`
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
    // A strength, before a product. "Do you stock extrait de parfum" names
    // no brand and no product, but `resolveProductQuery` matched it anyway
    // — the concentration is part of every product's own match haystack, so
    // it tied across eight unrelated Extraits and asked the reader "which
    // one did you mean?", which answers a question nobody asked. A browse by
    // strength is a count, and counts belong here.
    const concentration = await resolveConcentrationQuery(question);
    if (concentration) return concentration;

    // No brand named. It may still name a product ("do you have Aventus"),
    // which the product resolver answers; anything else goes to the council.
    const named = await resolveProductQuery(question, 'brand');
    if (named.status === 'no_match' || weakIdentity(named)) return null;
    if (named.status !== 'matched') return named;
    // One line per size, every shop's listing of that size pooled — the
    // same slices the price answer uses, so "do you have X" and "how much
    // is X" cannot quote the same bottle differently.
    const sizes = pricedSlices(named.group, site).map((v) => ({
      id: v.best?.id ?? v.ids[0],
      sizeMl: v.sizeMl,
      best: v.best?.deliveredPriceGbp != null
        ? { deliveredPriceGbp: v.best.deliveredPriceGbp, retailerName: v.best.retailerName }
        : null,
    }));
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
        id: f.id,
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
  if (result.kind.startsWith('concentration')) return formatConcentrationAnswer(result);

  if (result.kind === 'product') {
    const label = fragranceLink(productLabel(result), result.sizes.find((s) => s.best)?.id ?? result.sizes[0]?.id);
    const lines = result.sizes.map((s) =>
      s.best
        ? `${fragranceLink(`${s.sizeMl}ml`, s.id)}: ${gbp(s.best.deliveredPriceGbp)} delivered from ${s.best.retailerName}.`
        : `${fragranceLink(`${s.sizeMl}ml`, s.id)}: nothing buyable with a stated delivery cost right now.`);
    return `Yes — ${label}.\n${lines.join('\n')}`;
  }

  const line = (p) =>
    `${fragranceLink(`${productLabel(p)} ${p.sizeMl}ml`, p.id)}` +
    (p.best ? ` — ${gbp(p.best.deliveredPriceGbp)} delivered from ${p.best.retailerName}.` : ' — nothing buyable with a stated delivery cost right now.');

  const head =
    result.productCount === 1
      ? `One ${result.brand} bottle is tracked`
      : `${result.productCount} ${result.brand} bottles are tracked`;
  const buyable =
    result.buyableCount === result.productCount
      ? ''
      : ` ${result.buyableCount} of them have a buyable listing with a stated delivery cost right now.`;

  return `${head} (that count is per bottle size, not per perfume).${buyable}\nMost widely stocked:\n${result.examples.map(line).join('\n')}\nAll of them: ${brandLink(result.brand)}.`;
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
 * "What concentrations do you cover", "which strengths do you list".
 *
 * Placed before META_COVERAGE_RE in `resolveMetaQuery` because it has to be:
 * coverage matches on the bare phrase "do you cover", so before this rule
 * existed "what concentrations do you cover" was answered with the list of
 * 28 shops — a fluent, entirely correct sentence about something the reader
 * had not asked about, which is the hardest kind of wrong answer to notice.
 */
const META_CONCENTRATION_RE =
  /\b(concentrations?|strengths?)\b.{0,30}\b(do you|you (cover|have|list|track|stock)|are (there|available)|available)\b|\b(what|which|how many)\b.{0,20}\b(concentrations?|strengths?)\b/i;

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

  // Size before coverage, deliberately: "how many brands do you track"
  // carries coverage vocabulary ("do you track") but asks for a count, and
  // answering it with the shop list answers a question nobody asked.
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

  // Before coverage, deliberately — see META_CONCENTRATION_RE's own comment.
  if (META_CONCENTRATION_RE.test(question)) {
    return { kind: 'concentration-vocabulary', stated: await statedSummary() };
  }

  if (META_COVERAGE_RE.test(question)) {
    const enabled = site.retailers.RETAILERS.filter((r) => r.enabled !== false);
    return {
      kind: 'coverage',
      names: enabled.map((r) => r.name),
      notStated: enabled.filter((r) => r.shipping.standardGbp === null).map((r) => r.name),
    };
  }

  return null;
}

export function formatMetaAnswer(result) {
  const n = (x) => x.toLocaleString('en-GB');

  if (result.kind === 'concentration-vocabulary') return formatConcentrationAnswer(result);

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

/* ── answers written without a model ───────────────────────────────────── */

/**
 * The question shapes that normally go to the model — "what smells like
 * X", "something sweet, no florals", "how do you make money" — answered
 * from the same grounding the model would have been given, for when there
 * is no model to give it to: the Worker is not deployed yet, is rate
 * limiting, or did not answer in time.
 *
 * Before this the widget's only answer to every one of those, with the AI
 * side unplugged, was "That one needs the AI side of me, which isn't
 * connected in this build yet" — a dead end on exactly the questions a
 * shopper is most likely to ask a chat box rather than a search box. The
 * catalogue can do better than nothing: the model's own SITE DATA block is
 * a list of real bottles that share real published notes, and that list,
 * priced and linked, is an answer.
 *
 * What it does not do is the model's job: it says the match is on
 * published notes, never that two bottles smell alike.
 */
function cheapestPriced(slices) {
  let best = null;
  for (const v of slices) {
    if (v.best?.deliveredPriceGbp == null) continue;
    if (!best || v.best.deliveredPriceGbp < best.best.deliveredPriceGbp) best = v;
  }
  return best;
}

const CHEAPER_RE = /\b(cheaper|cheap|less expensive|budget|affordable|for less)\b/i;

export async function resolveSuggestFallback(question) {
  const site = await loadSite();
  const request = await parseSuggestRequest(question);
  const unsupported = unsupportedConstraintNotes(question);

  if (request.wanted.length === 0) {
    if (!request.reference && !request.referenceUnresolved && unsupported.length === 0) {
      const gender = await resolveGenderQuery(question);
      if (gender) return gender;
    }
    return {
      kind: 'ungroundable',
      referenceUnresolved: request.referenceUnresolved,
      referenceWithoutNotes: request.reference ? request.reference.label : null,
      unmatchedDescriptors: request.unmatchedDescriptors,
      unsupported,
      descriptors: await offerableDescriptors(),
    };
  }

  let entries = await noteMatchedEntries(request);

  // Who it is for, read from the title the same way the budget answer
  // reads it, and disclosed the same way.
  const who = request.audience;
  const reading = who ? AUDIENCE_READING[who] ?? null : null;
  const coverage = reading ? await genderCoverage() : null;
  if (coverage) entries = entries.filter((e) => e.rows.some((r) => coverage.byId.get(r.id)?.reading === reading));

  const popularity = (e) => e.rows.reduce((n, r) => n + Number(r.popularity ?? 0), 0);
  entries.sort((a, b) => b.matchedCount - a.matchedCount || popularity(b) - popularity(a));

  let maxGbp = request.budget?.maxGbp ?? null;
  let referenceCheapest = null;
  let referenceLinkId = null;
  if (request.reference?.rows) {
    const c = cheapestPriced(pricedSlices(request.reference.rows, site));
    referenceLinkId = c?.best.id ?? request.reference.rows[0]?.id ?? null;
    if (c && CHEAPER_RE.test(question)) {
      referenceCheapest = { sizeMl: c.sizeMl, deliveredPriceGbp: c.best.deliveredPriceGbp };
      const under = c.best.deliveredPriceGbp - 0.01;
      maxGbp = maxGbp === null ? under : Math.min(maxGbp, under);
    }
  }

  // Priced in rank order, stopping once five buyable ones are found. A
  // price ceiling can push the five far down the list, so the scan is
  // bounded by a generous count rather than by the first few.
  const items = [];
  for (const e of entries.slice(0, maxGbp === null ? 120 : 2000)) {
    // The cheapest full-size bottle where there is one: a 5ml decant is a
    // price, but not the answer to "something vanilla".
    const slices = pricedSlices(e.rows, site);
    const full = slices.filter((v) => (v.sizeMl ?? 0) >= MIN_FULL_SIZE_ML);
    const c = cheapestPriced(full) ?? cheapestPriced(slices);
    if (!c) continue;
    if (maxGbp !== null && c.best.deliveredPriceGbp > maxGbp) continue;
    items.push({
      id: c.best.id,
      brand: e.frag.brand,
      name: e.frag.name,
      concentration: e.frag.concentration,
      sizeMl: c.sizeMl,
      deliveredPriceGbp: c.best.deliveredPriceGbp,
      retailerName: c.best.retailerName,
      matched: e.matched,
    });
    if (items.length >= 5) break;
  }

  return {
    kind: 'candidates',
    reference: request.reference ? { label: request.reference.label, id: referenceLinkId, notes: request.reference.notes } : null,
    referenceCheapest,
    families: request.families,
    literal: request.literal,
    unwanted: request.unwanted,
    maxGbp: request.budget?.maxGbp ?? null,
    matchingCount: entries.length,
    gender: coverage ? { label: coverage.label[reading], disclosure: await genderDisclosure() } : null,
    unsupported,
    items,
  };
}

export function formatSuggestFallback(result) {
  if (result.kind === 'gender') return formatGenderAnswer(result);
  if (result.kind === 'ungroundable') {
    if (result.referenceWithoutNotes) {
      return (
        `${result.referenceWithoutNotes} is in the catalogue, but no shop published its notes, so I have nothing to match ` +
        `it against. What I can go on: a scent word — ${result.descriptors.join(', ')} — or a delivered price ceiling like "under £30".`
      );
    }
    return formatSuggestAnswer(result);
  }

  const n = (x) => x.toLocaleString('en-GB');
  const shares = (matched) => {
    const shown = matched.slice(0, 4).join(', ');
    return matched.length > 4 ? `${shown} and ${matched.length - 4} more` : shown;
  };
  const ceiling = result.referenceCheapest
    ? `, all cheaper than its ${gbp(result.referenceCheapest.deliveredPriceGbp)} (${result.referenceCheapest.sizeMl}ml)`
    : result.maxGbp !== null
      ? ` at ${gbp(result.maxGbp)} or under delivered`
      : '';
  const excluding = result.unwanted.length ? `, leaving out anything listing ${nameList(result.unwanted)}` : '';

  let lead;
  if (result.reference) {
    const ref = fragranceLink(result.reference.label, result.reference.id);
    lead = `Going by the notes shops published for ${ref} (${shares(result.reference.notes)}), these buyable bottles share the most of them${ceiling}${excluding}:`;
  } else if (result.families.length) {
    const read = result.families.map(({ word, notes }) => `"${word}" as ${nameList(notes, 4)}`).join('; ');
    lead = `Reading ${read}, these buyable bottles list the most of those notes${ceiling}${excluding}:`;
  } else {
    lead = `These buyable bottles list ${nameList(result.literal)}${ceiling}${excluding}:`;
  }

  const unsupported = unsupportedSentence(result.unsupported ?? [], "I can't filter by");
  const genderNote = result.gender ? ` Only bottles whose titles say ${result.gender.label}. ${result.gender.disclosure}` : '';

  if (result.items.length === 0) {
    return (
      `${n(result.matchingCount)} bottles share those notes, but none is buyable with a stated delivery cost${ceiling} right now.` +
      (unsupported ? ` ${unsupported}` : '') + genderNote
    );
  }

  const lines = result.items.map(
    (i) =>
      `${fragranceLink(`${productLabel(i)} ${i.sizeMl}ml`, i.id)} — ${gbp(i.deliveredPriceGbp)} delivered from ${i.retailerName} — shares: ${shares(i.matched)}`,
  );
  const caveat = result.reference
    ? 'Sharing notes is not the same as smelling alike: this is a match on what the shops published, not a nose.'
    : 'Matched on the notes shops published, so a bottle with no notes on file cannot show up here.';
  return [lead, ...lines, `${caveat}${unsupported ? ` ${unsupported}` : ''}${genderNote}`].join('\n');
}

/** A policy question answered from the page itself: its title, linked, and
 *  the opening of its text, cut at a sentence. */
export function formatPolicyFallback({ page, text }) {
  // The page's own opening paragraph where it has one: cutting the
  // tag-stripped text instead ran a heading into the sentence after it
  // ("Delivery is counted Every price includes…").
  const firstParagraph = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(page.body ?? '')?.[1];
  const source = firstParagraph ? firstParagraph.replace(/<[^>]+>/g, ' ') : text;
  const clean = source.replace(/\s+/g, ' ').trim();
  let excerpt = clean;
  if (clean.length > 320) {
    excerpt = clean.slice(0, 320);
    const stop = excerpt.lastIndexOf('. ');
    excerpt = stop > 120 ? excerpt.slice(0, stop + 1) : `${excerpt.replace(/\s+\S*$/, '')}…`;
  }
  return `That's covered on our ${siteLink(page.title, `/legal/${encodeURIComponent(page.id)}`)} page. In short: ${excerpt}`;
}

/** What the assistant is for, for a message that is not about fragrance. */
export const SCOPE_ANSWER =
  "I can only help with fragrance shopping on this site, so I can't answer that one. I can look up prices, stock, " +
  'sizes, notes, deals, delivery and comparisons, or find bottles by scent — try "how much is Dior Sauvage EDT" or ' +
  '"something vanilla under £40".';

/** The last resort when a question needed the model and there is none. */
export const NO_MODEL_ANSWER =
  "I can't answer that one from the catalogue alone, and the AI side that handles open questions isn't available " +
  'right now. I can look up prices, stock, sizes, notes, deals, delivery and comparisons, or find bottles by scent — ' +
  'try "how much is Dior Sauvage EDT" or "something vanilla under £40".';
