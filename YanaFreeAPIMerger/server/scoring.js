// Anonymous scoring matrix: every surviving agent answer is scored on the
// same weighted criteria, purely from the text itself (no answer ever sees
// another's score, and the scorer never sees which real model produced it —
// it only receives { agentNumber, content }). This is the "detailed,
// intricate scoring matrix" that replaces a single model just being trusted.

const CRITERIA = [
  {
    key: 'relevance',
    weight: 0.28,
    describe: 'How much of the answer directly addresses the question\'s key terms',
    score: ({ content, question }) => keywordOverlapScore(content, question),
  },
  {
    key: 'domainGrounding',
    weight: 0.2,
    describe: 'Use of concrete fragrance vocabulary (notes, houses, concentrations, price/currency)',
    score: ({ content }) => domainGroundingScore(content),
  },
  {
    key: 'structure',
    weight: 0.14,
    describe: 'Organized, scannable answer (lists/short paragraphs) vs. a wall of text',
    score: ({ content }) => structureScore(content),
  },
  {
    key: 'actionability',
    weight: 0.14,
    describe: 'Gives the user something to actually do next (a pick, a price, a next step)',
    score: ({ content }) => actionabilityScore(content),
  },
  {
    key: 'concision',
    weight: 0.1,
    describe: 'Answers without excessive padding, disclaimers, or repetition',
    score: ({ content }) => concisionScore(content),
  },
  {
    key: 'calibratedConfidence',
    weight: 0.08,
    describe: 'States facts plainly but flags genuine uncertainty (e.g. prices) rather than over- or under-hedging',
    score: ({ content }) => calibratedConfidenceScore(content),
  },
  {
    key: 'safety',
    weight: 0.06,
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
  'ml', 'oz', 'price', '$', 'usd', 'discount', 'retailer',
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
  const hasExactPriceNoHedge = /\$\d+(\.\d{2})?/.test(content) && !/(approx|around|roughly|as of|may vary|check|current)/.test(c);
  const hasFakeUrl = /https?:\/\/\S+/.test(content);
  let score = 100;
  if (hasExactPriceNoHedge) score -= 25;
  if (hasFakeUrl) score -= 20;
  return Math.max(0, score);
}

/**
 * Score every agent's answer independently, then rank. Returns the matrix so
 * the UI can show, per agent, the per-criterion breakdown without ever
 * exposing which real model produced it.
 */
export function scoreAndRank(question, agentAnswers) {
  const matrix = agentAnswers.map((a) => {
    const criteriaScores = {};
    let total = 0;
    for (const c of CRITERIA) {
      const s = c.score({ content: a.content, question });
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
