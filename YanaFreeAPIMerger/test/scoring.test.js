import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAndRank, groundednessScore } from '../server/scoring.js';

test('groundednessScore: a price present in SITE DATA is not penalised', () => {
  const siteData = 'PRICE MATCH (100% confidence): Dior Sauvage, Eau de Toilette, 30ml. Cheapest right now: £56.99 delivered, from Justmylook.';
  const content = 'Sauvage EDT is £56.99 delivered from Justmylook right now.';
  assert.equal(groundednessScore(content, siteData), 100);
});

test('groundednessScore: a price NOT present in SITE DATA is heavily penalised', () => {
  const siteData = 'PRICE MATCH (100% confidence): Dior Sauvage, Eau de Toilette, 30ml. Cheapest right now: £56.99 delivered, from Justmylook.';
  // An invented figure that does not appear anywhere in the injected data —
  // exactly the failure mode this criterion exists to catch.
  const content = 'Sauvage EDT is around £45.00 depending on where you look.';
  assert.equal(groundednessScore(content, siteData), 60);
});

test('groundednessScore: multiple ungrounded prices compound the penalty', () => {
  const siteData = 'PRICE MATCH (100% confidence): Dior Sauvage, Eau de Toilette, 30ml. Cheapest right now: £56.99 delivered, from Justmylook.';
  const content = 'Prices range from £30.00 to £45.00 typically, though I have also seen £60.00.';
  assert.equal(groundednessScore(content, siteData), 0); // 3 * 40 = 120, floored at 0
});

test('groundednessScore: any URL is penalised, since SITE DATA never injects one', () => {
  const siteData = 'PRICE MATCH (100% confidence): Dior Sauvage, Eau de Toilette, 30ml. Cheapest right now: £56.99 delivered, from Justmylook.';
  const content = 'You can buy it here: https://example.com/sauvage for £56.99.';
  assert.equal(groundednessScore(content, siteData), 70);
});

test('groundednessScore: confidently answering when SITE DATA found nothing is penalised', () => {
  const siteData = 'PRICE MATCH: none. No fragrance in the current catalogue matched this query closely enough to quote a price.';
  const content = 'That one usually retails for about £80 depending on the retailer.';
  // The invented price alone costs 40; failing to admit the gap costs another 35.
  assert.equal(groundednessScore(content, siteData), 25);
});

test('groundednessScore: admitting the gap when SITE DATA found nothing is not penalised for that', () => {
  const siteData = 'PRICE MATCH: none. No fragrance in the current catalogue matched this query closely enough to quote a price.';
  const content = "I don't have that on file right now — it may not be in the current catalogue.";
  assert.equal(groundednessScore(content, siteData), 100);
});

test('scoreAndRank: an answer that ignores the site-data-only rule loses to one that follows it, even though the invented answer reads more fluently', () => {
  const siteData = 'PRICE MATCH (100% confidence): Dior Sauvage, Eau de Toilette, 30ml. Cheapest right now: £56.99 delivered, from Justmylook. Stocked by 1 shop(s) this site tracks in total.';
  const question = 'how much is Sauvage EDT';

  const grounded = {
    agentNumber: 1,
    content: 'Sauvage EDT (30ml) is £56.99 delivered from Justmylook right now — the cheapest option this site tracks for it.',
  };
  const invented = {
    agentNumber: 2,
    content:
      'Sauvage EDT typically retails around £70, though prices vary widely by retailer and region. ' +
      'I would recommend checking a few different stores, such as https://example.com/fragrances, to compare. ' +
      'Generally speaking, Dior fragrances offer excellent value and are always a solid choice for any collection ' +
      'given their broad appeal and long-lasting reputation in the fragrance world.',
  };

  const { matrix } = scoreAndRank(question, siteData, [invented, grounded]);
  assert.equal(matrix[0].agentNumber, 1, `expected the grounded answer to win, got agent ${matrix[0].agentNumber}`);
  assert.ok(matrix[0].totalScore > matrix[1].totalScore);
});

test('groundednessScore: ignoring an explicit out-of-stock fact is penalised', () => {
  const siteData = 'PRICE MATCH (100% confidence): Some Brand Some Perfume, Eau de Parfum, 50ml. Currently out of stock everywhere this site tracks.';
  const content = 'That one is £65.00 delivered right now.';
  // The invented price alone costs 40; ignoring the out-of-stock fact costs another 35.
  assert.equal(groundednessScore(content, siteData), 25);
});

test('groundednessScore: reflecting an out-of-stock fact is not penalised for that', () => {
  const siteData = 'PRICE MATCH (100% confidence): Some Brand Some Perfume, Eau de Parfum, 50ml. Currently out of stock everywhere this site tracks.';
  const content = "That one is currently out of stock everywhere this site tracks, so I can't give you a price.";
  assert.equal(groundednessScore(content, siteData), 100);
});

test('groundednessScore: calling a retailer "trusted" or "our partner" contradicts No Promoted Listings and is penalised', () => {
  const siteData = 'PRICE MATCH (100% confidence): Dior Sauvage, Eau de Toilette, 30ml. Cheapest right now: £56.99 delivered, from Justmylook.';
  const content = 'Our trusted partner Justmylook has it for £56.99 delivered.';
  assert.equal(groundednessScore(content, siteData), 75);
});

// ── Regression: the reported "One Million Elixir" bug ──────────────────────
// The chatbot denied a fragrance SITE DATA actually matched. Before the fix
// above, groundednessScore gave a false denial like this a perfect 100 (no
// ungrounded price, no fake URL — the only two things it checked), so a
// tidy, well-structured denial could out-score a plain correct answer. These
// pin the exact reported wording so this cannot silently regress.

test('groundednessScore: falsely denying a fragrance that SITE DATA actually matched is heavily penalised', () => {
  const siteData =
    'PRICE MATCH (100% confidence): Rabanne One Million Elixir Intense, Parfum, 50ml. ' +
    'Cheapest right now: £56.50 delivered, from Justmylook.';
  const content =
    'I don\'t have a fragrance named "One Million Elixir" on file right now.\n' +
    'The closest matches in SITE DATA are:\n' +
    '- One Million (Paco Rabanne) – available from multiple retailers.\n' +
    '- 1 Million Parfum (Paco Rabanne) – also tracked.';
  assert.equal(groundednessScore(content, siteData), 40);
});

test('groundednessScore: naming the matched fragrance is not penalised for that', () => {
  const siteData =
    'PRICE MATCH (100% confidence): Rabanne One Million Elixir Intense, Parfum, 50ml. ' +
    'Cheapest right now: £56.50 delivered, from Justmylook.';
  const content = 'Rabanne One Million Elixir Intense (50ml) is £56.50 delivered from Justmylook.';
  assert.equal(groundednessScore(content, siteData), 100);
});

test('scoreAndRank: a false "not on file" denial loses to a correct grounded answer, even though the denial reads more structured', () => {
  const siteData =
    'PRICE MATCH (100% confidence): Rabanne One Million Elixir Intense, Parfum, 50ml. ' +
    'Cheapest right now: £56.50 delivered, from Justmylook. Stocked by 1 shop(s) this site tracks in total.';
  const question = 'how much is One Million Elixir';

  const falseDenial = {
    agentNumber: 1,
    content:
      'I don\'t have a fragrance named "One Million Elixir" on file right now.\n' +
      'The closest matches in SITE DATA are:\n' +
      '- **One Million (Paco Rabanne)** – available from multiple retailers.\n' +
      '- **1 Million Parfum (Paco Rabanne)** – also tracked.',
  };
  const grounded = {
    agentNumber: 2,
    content: 'Rabanne One Million Elixir Intense (50ml) is £56.50 delivered from Justmylook right now.',
  };

  const { matrix } = scoreAndRank(question, siteData, [falseDenial, grounded]);
  assert.equal(matrix[0].agentNumber, 2, `expected the grounded answer to win, got agent ${matrix[0].agentNumber}`);
  assert.ok(matrix[0].totalScore > matrix[1].totalScore);
});

test('groundednessScore: a genuine "SITE DATA found nothing" denial is still not penalised by the new check', () => {
  // Guards against the new check swallowing the original, legitimate case:
  // when SITE DATA really did find nothing, admitting that is still correct.
  const siteData = 'PRICE MATCH: none. No fragrance in the current catalogue matched this query closely enough to quote a price.';
  const content = "I don't have that on file right now — it may not be in the current catalogue.";
  assert.equal(groundednessScore(content, siteData), 100);
});

test('scoreAndRank: criteria weights sum to 1', () => {
  const { criteria } = scoreAndRank('x', '', [{ agentNumber: 1, content: 'x' }]);
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights summed to ${total}, expected 1`);
});
