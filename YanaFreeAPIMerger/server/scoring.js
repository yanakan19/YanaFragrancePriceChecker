// Anonymous scoring matrix: every surviving agent answer is scored on the
// same weighted criteria, purely from the text itself (no answer ever sees
// another's score, and the scorer never sees which real model produced it —
// it only receives { agentNumber, content }). This is the "detailed,
// intricate scoring matrix" that replaces a single model just being trusted.
//
// `groundedness` is the criterion this integration was built around: every
// other criterion judges how *good* an answer reads, this one judges whether
// it is actually true to the SITE DATA it was given. It carries the largest
// single weight on purpose — an agent that ignores the "site data only" rule
// in its system prompt must lose the ranking here even if nothing else about
// its answer looks wrong, because a fluent, well structured, invented answer
// is worse than a plain honest one, not better.

const CRITERIA = [
  {
    key: 'groundedness',
    weight: 0.3,
    describe: 'Every price/claim in the answer actually traces back to the injected SITE DATA — no invented URLs, no confident answer where SITE DATA found nothing or said out of stock, no puffery language contradicting "No Promoted Listings"',
    score: ({ content, siteData }) => groundednessScore(content, siteData),
  },
  {
    key: 'relevance',
    weight: 0.2,
    describe: 'How much of the answer directly addresses the question\'s key terms',
    score: ({ content, question }) => keywordOverlapScore(content, question),
  },
  {
    key: 'domainGrounding',
    weight: 0.14,
    describe: 'Use of concrete fragrance vocabulary (notes, houses, concentrations, price/currency)',
    score: ({ content }) => domainGroundingScore(content),
  },
  {
    key: 'structure',
    weight: 0.1,
    describe: 'Organized, scannable answer (lists/short paragraphs) vs. a wall of text',
    score: ({ content }) => structureScore(content),
  },
  {
    key: 'actionability',
    weight: 0.1,
    describe: 'Gives the user something to actually do next (a pick, a price, a next step)',
    score: ({ content }) => actionabilityScore(content),
  },
  {
    key: 'concision',
    weight: 0.07,
    describe: 'Answers without excessive padding, disclaimers, or repetition',
    score: ({ content }) => concisionScore(content),
  },
  {
    key: 'calibratedConfidence',
    weight: 0.06,
    describe: 'States facts plainly but flags genuine uncertainty (e.g. prices) rather than over- or under-hedging',
    score: ({ content }) => calibratedConfidenceScore(content),
  },
  {
    key: 'safety',
    weight: 0.03,
    describe: 'No fabricated-looking specifics presented with false certainty (exact prices/URLs with no hedge)',
    score: ({ content }) => safetyScore(content),
  },
];

function words(text) {
  return (text || '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'i', 'you', 'it', 'what', 'which', 'do', 'does', 'my', 'me',
  'that', 'this', 'with', 'be', 'can', 'will', 'about',
]);

function keywordOverlapScore(content, question) {
  const qWords = [...new Set(words(question).filter((w) => !STOPWORDS.has(w) && w.length > 2))];
  if (qWords.length === 0) return 50;
  const cWords = new Set(words(content));
  const hits = qWords.filter((w) => cWords.has(w)).length;
  return Math.round((hits / qWords.length) * 100);
}

const NOTE_WORDS = [
  'note', 'notes', 'edp', 'edt', 'parfum', 'cologne', 'oud', 'vanilla', 'musk',
  'amber', 'citrus', 'woody', 'floral', 'sandalwood', 'bergamot', 'jasmine',
  'rose', 'patchouli', 'vetiver', 'longevity', 'sillage', 'niche', 'designer',
  'ml', 'oz', 'price', '£', 'gbp', 'discount', 'retailer',
];

function domainGroundingScore(content) {
  const c = content.toLowerCase();
  const hits = NOTE_WORDS.filter((w) => c.includes(w)).length;
  return Math.min(100, Math.round((hits / 6) * 100));
}

function structureScore(content) {
  const hasList = /(^|\n)\s*[-*\d]/.test(content);
  const paragraphs = content.split(/\n{1,}/).filter(Boolean).length;
  const avgLineLen = content.length / Math.max(1, content.split(/\n/).length);
  let score = 40;
  if (hasList) score += 30;
  if (paragraphs > 1) score += 15;
  if (avgLineLen < 220) score += 15;
  return Math.min(100, score);
}

function actionabilityScore(content) {
  const c = content.toLowerCase();
  const markers = ['try', 'recommend', 'pick', 'go with', 'best option', 'i\'d suggest', 'consider', 'buy', 'cheapest', 'lowest price'];
  const hits = markers.filter((m) => c.includes(m)).length;
  const hasNumberish = /\d/.test(content);
  return Math.min(100, hits * 22 + (hasNumberish ? 20 : 0) + 20);
}

function concisionScore(content) {
  const len = content.length;
  if (len === 0) return 0;
  if (len < 120) return 60; // too thin to be useful
  if (len <= 900) return 100;
  if (len <= 1600) return 70;
  return 40;
}

function calibratedConfidenceScore(content) {
  const c = content.toLowerCase();
  const hedges = (c.match(/\b(may|might|approximately|around|roughly|typically|can vary|as of|check current)\b/g) ?? []).length;
  const overclaim = /\b(guaranteed|always|definitely the cheapest|100%)\b/.test(c);
  let score = 70;
  if (hedges >= 1 && hedges <= 3) score += 20;
  if (hedges > 5) score -= 15; // over-hedged, wishy-washy
  if (overclaim) score -= 30;
  return Math.max(0, Math.min(100, score));
}

function safetyScore(content) {
  const c = content.toLowerCase();
  const hasExactPriceNoHedge = /£\d+(\.\d{2})?/.test(content) && !/(approx|around|roughly|as of|may vary|check|current)/.test(c);
  const hasFakeUrl = /https?:\/\/\S+/.test(content);
  let score = 100;
  if (hasExactPriceNoHedge) score -= 25;
  if (hasFakeUrl) score -= 20;
  return Math.max(0, score);
}

/**
 * Whether the answer is actually traceable to the SITE DATA block it was
 * given, not just plausible-sounding. Deterministic proxies, not a semantic
 * check — cheap and mechanical on purpose, so it runs the same way for every
 * agent and cannot be talked around by fluent phrasing:
 *
 *   - every £-price the answer states must appear verbatim in SITE DATA;
 *     a single ungrounded price is the clearest possible sign of an agent
 *     answering from its own training instead of the data it was given.
 *   - no URL is ever injected into SITE DATA, so any URL in the answer is
 *     definitionally invented, not sourced.
 *   - when SITE DATA explicitly recorded no match for this question ("PRICE
 *     MATCH: none" / "NOTE MATCHED CANDIDATES: none"), the answer must say
 *     it does not have that on file rather than confidently filling the gap.
 *   - when SITE DATA says a fragrance is out of stock everywhere, the answer
 *     must reflect that rather than quoting a price as if it were still
 *     available — the same "do not paper over a gap" failure as the point
 *     above, just triggered by a different SITE DATA shape.
 *   - language that dresses a retailer up as sponsored, trusted, or a
 *     partner contradicts this site's own "No Promoted Listings" line (see
 *     demo/app.ts's hero copy and demo/legal.ts's affiliate disclosure) even
 *     when every price in the answer is accurate, so it is scored as a
 *     groundedness failure too: it is stating a relationship SITE DATA never
 *     asserted.
 */
export function groundednessScore(content, siteData) {
  const data = siteData || '';
  let score = 100;

  const prices = content.match(/£\d+(\.\d{2})?/g) ?? [];
  const ungroundedPrices = prices.filter((p) => !data.includes(p));
  score -= ungroundedPrices.length * 40;

  if (/https?:\/\/\S+/.test(content)) score -= 30;

  const dataFoundNothing = /price match: none|note matched candidates: none/i.test(data);
  const answerAdmitsGap = /don'?t have that on file|no (fragrance|match|information)\s+(on file|found)/i.test(content);
  if (dataFoundNothing && !answerAdmitsGap) score -= 35;

  const dataSaysOutOfStock = /out of stock everywhere/i.test(data);
  const answerReflectsOutOfStock = /out of stock|sold out|not (currently )?available|no(?:ne|thing) (in stock|available)/i.test(content);
  if (dataSaysOutOfStock && !answerReflectsOutOfStock) score -= 35;

  if (/\b(sponsored|paid partner|official partner|trusted partner|promoted listing|our partner|recommended by us|advertisement|advertorial)\b/i.test(content)) {
    score -= 25;
  }

  return Math.max(0, score);
}

/**
 * Score every agent's answer independently, then rank. `siteData` is the
 * exact SITE DATA block every agent was given for this question — passed
 * through so groundedness can check claims against the same source the
 * agents themselves were constrained to. Returns the matrix so the UI can
 * show, per agent, the per-criterion breakdown without ever exposing which
 * real model produced it.
 */
export function scoreAndRank(question, siteData, agentAnswers) {
  const matrix = agentAnswers.map((a) => {
    const criteriaScores = {};
    let total = 0;
    for (const c of CRITERIA) {
      const s = c.score({ content: a.content, question, siteData });
      criteriaScores[c.key] = s;
      total += s * c.weight;
    }
    return {
      agentNumber: a.agentNumber,
      content: a.content,
      totalScore: Math.round(total * 10) / 10,
      criteriaScores,
    };
  });

  matrix.sort((a, b) => b.totalScore - a.totalScore);
  matrix.forEach((m, i) => { m.rank = i + 1; });
  return { criteria: CRITERIA.map(({ key, weight, describe }) => ({ key, weight, describe })), matrix };
}
