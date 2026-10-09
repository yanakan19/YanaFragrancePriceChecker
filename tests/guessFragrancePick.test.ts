import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { CRAWLED_AT } from '../demo/catalogue.generated.js';
import {
  BRAND_REST_DAYS, MAX_NOTES, MAX_PER_TIER, MIN_NOTES, buildContext, choose, evaluate, productKey, productsOf, rank, score,
  type Candidate, type HistoryEntry,
} from '../scripts/social-guess-fragrance.js';

// docs/GUESS-THE-FRAGRANCE-PLAN.md section 2: every hard rule, the rests, the
// variety scoring and a pick that never changes for the same input. The tests
// read the real catalogue, so they hold for whatever the crawl last built.
const NOW = new Date(CRAWLED_AT);
const TODAY = '2026-10-13';
const ctx = (history: HistoryEntry[] = []) => buildContext(NOW, TODAY, history);
const products = productsOf(DEMO_FRAGRANCES);
const entryOf = (c: Candidate, date: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  date, no: 1, id: c.rep.id, key: c.key, brand: c.rep.brand, gender: c.gender, tier: c.tierName, band: c.band, revealed: null, ...over,
});

const first = choose(products, ctx());
const pick = first.pick;

describe('the pick', () => {
  it('finds a product that passes every rule today', () => {
    expect(pick, 'reason' in first ? first.reason : '').not.toBeNull();
  });

  it('gives the same pick for the same input', () => {
    const again = choose(products, ctx());
    expect(again.pick?.rep.id).toBe(pick!.rep.id);
  });

  it('shows 5 to 12 notes, at most 4 a tier, in at least two tiers, with an icon each', () => {
    expect(pick!.shown.length).toBeGreaterThanOrEqual(MIN_NOTES);
    expect(pick!.shown.length).toBeLessThanOrEqual(MAX_NOTES);
    for (const tier of ['top', 'middle', 'base'] as const) expect(pick!.shown.filter((n) => n.tier === tier).length).toBeLessThanOrEqual(MAX_PER_TIER);
    expect(new Set(pick!.shown.map((n) => n.tier)).size).toBeGreaterThanOrEqual(2);
    for (const n of pick!.shown) expect(n.icon.file).toMatch(/\.svg$/);
  });

  it('is a popular product with a strength, a photo and a fresh purchasable price', () => {
    expect(pick!.popularity).toBeGreaterThanOrEqual(6);
    expect(['Eau de Parfum', 'Eau de Toilette', 'Extrait de Parfum', 'Parfum', 'Eau de Cologne']).toContain(pick!.rep.concentration);
    expect(pick!.price.frag.photoUrl).toBeTruthy();
    expect(pick!.price.best.isPurchasable).toBe(true);
    expect(pick!.price.delivered).toBeGreaterThan(0);
    expect(NOW.getTime() - Date.parse(pick!.price.best.fetchedAt)).toBeLessThanOrEqual(24 * 3_600_000);
  });

  it('never repeats a product, in any size', () => {
    const history = [entryOf(pick!, '2026-01-01')];
    const next = choose(products, ctx(history));
    expect(next.pick?.key).not.toBe(pick!.key);
    // The same product in another size has the same key, so it is blocked too.
    const sizes = DEMO_FRAGRANCES.filter((f) => productKey(f) === pick!.key);
    expect(sizes.length).toBeGreaterThan(0);
    for (const sibling of sizes) {
      const res = evaluate(products.get(productKey(sibling))!, ctx(history));
      expect(res.candidate).toBeNull();
      expect(res.rules.find((r) => !r.pass)?.rule).toBe('never posted before');
    }
  });

  it('lets a rerun on the same day keep that day\'s own pick', () => {
    const next = choose(products, ctx([entryOf(pick!, TODAY)]));
    expect(next.pick?.key).toBe(pick!.key);
  });

  it(`rests a brand for ${BRAND_REST_DAYS} days, not longer`, () => {
    const recent = [entryOf(pick!, '2026-10-05', { key: 'someotherproduct' })];
    const blocked = evaluate(products.get(pick!.key)!, ctx(recent));
    expect(blocked.rules.find((r) => !r.pass)?.rule).toMatch(/brand rests/);
    const old = [entryOf(pick!, '2026-09-20', { key: 'someotherproduct' })];
    expect(evaluate(products.get(pick!.key)!, ctx(old)).candidate).not.toBeNull();
  });

  it('keeps away from the Deal of the Day brand of the same or the previous day', () => {
    const base = ctx();
    const withDeal = { ...base, dealBrands: [{ date: '2026-10-12', brand: pick!.rep.brand }] };
    expect(evaluate(products.get(pick!.key)!, withDeal).rules.find((r) => !r.pass)?.rule).toBe('not the Deal of the Day brand');
  });

  it('lets --allow-repeat through and says so in the rule results', () => {
    const res = evaluate(products.get(pick!.key)!, { ...ctx([entryOf(pick!, '2026-10-01')]), allowRepeat: true });
    expect(res.candidate).not.toBeNull();
    expect(res.rules.some((r) => r.detail.includes('(allowed)'))).toBe(true);
  });

  it('leaves no pick when nothing passes (the run then writes nothing and exits 3)', () => {
    const empty = { ...ctx(), brandSize: new Map<string, number>() };
    const none = choose(products, empty);
    expect(none.pick).toBeNull();
    expect('reason' in none && none.reason).toMatch(/No product passes/);
  });
});

describe('the hard rules', () => {
  const failing = (frag: (typeof DEMO_FRAGRANCES)[number]) => evaluate([frag], ctx()).rules.find((r) => !r.pass)?.rule;
  it('refuses a gift set or an oil', () => {
    const set = DEMO_FRAGRANCES.find((f) => f.giftSet !== null)!;
    const oil = DEMO_FRAGRANCES.find((f) => f.oil !== null)!;
    expect(failing(set)).toBe('single bottle');
    expect(failing(oil)).toBe('single bottle');
  });
  it('refuses a strength that is disputed, not stated or an aftershave', () => {
    for (const strength of ['Disputed', 'Not stated', 'Aftershave']) {
      const f = DEMO_FRAGRANCES.find((x) => x.concentration === strength && x.giftSet === null && x.oil === null)!;
      expect(failing(f), strength).toBe('strength');
    }
  });
  it('refuses a product nobody stocks widely', () => {
    const f = [...products.values()].map((s) => s[0]!).find((x) => x.popularity < 6 && x.notes);
    expect(f).toBeDefined();
    const res = evaluate(products.get(productKey(f!))!, ctx());
    expect(res.candidate).toBeNull();
  });
});

describe('variety (plan 2.2)', () => {
  const cand = (gender: Candidate['gender'], tier: string, band: Candidate['band'], popularity = 10) => ({ ...pick!, gender, tierName: tier, band, popularity }) as Candidate;
  const history: HistoryEntry[] = [
    { date: '2026-10-09', no: 1, id: 'a', key: 'a', brand: 'A', gender: 'womens', tier: 'designer', band: 'under40', revealed: null },
  ];
  it('prefers another gender, another tier and another budget band than the last puzzles', () => {
    const same = score(cand('womens', 'designer', 'under40'), history, TODAY);
    const other = score(cand('mens', 'niche', 'over100'), history, TODAY);
    expect(other - same).toBeCloseTo(7, 5);
  });
  it('breaks ties by popularity, then by id, so a rerun picks the same one', () => {
    const a = cand('mens', 'niche', 'over100', 12);
    const b = cand('mens', 'niche', 'over100', 8);
    expect(rank([b, a], history, TODAY)[0]!.popularity).toBe(12);
    const c1 = { ...a, rep: { ...a.rep, id: 'b' } } as Candidate;
    const c2 = { ...a, rep: { ...a.rep, id: 'a' } } as Candidate;
    expect(rank([c1, c2], history, TODAY)[0]!.rep.id).toBe('a');
  });
});
