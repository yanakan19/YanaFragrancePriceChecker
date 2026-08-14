import { loadSite, resolveProductQuery } from './siteData.js';

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
  return (
    "I don't have a fragrance matching that in the current catalogue. Try the brand and " +
    'product name — for example "Dior Sauvage EDT".'
  );
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
