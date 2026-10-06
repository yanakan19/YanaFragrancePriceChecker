import { describe, expect, it } from 'vitest';
import { NOTE_SOURCE_ORDER, compareNoteCandidates, pickBestNotes, type NoteCandidate } from '../src/catalogue/notesPick.js';
import { parseNotes } from '../src/catalogue/notesParse.js';

const cand = (
  retailerId: string,
  notes: { top?: string[]; middle?: string[]; base?: string[] },
  brandDirect = false,
): NoteCandidate => ({
  retailerId,
  url: `https://${retailerId}.example/p`,
  brandDirect,
  notes: { top: notes.top ?? [], middle: notes.middle ?? [], base: notes.base ?? [] },
});

describe('pickBestNotes', () => {
  it('returns null when no shop published notes', () => {
    expect(pickBestNotes([])).toBeNull();
  });

  it('prefers more tiers over more notes', () => {
    const wide = cand('escentual', { top: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const full = cand('beautybase', { top: ['a'], middle: ['b'], base: ['c'] });
    expect(pickBestNotes([wide, full])).toBe(full);
    expect(pickBestNotes([full, wide])).toBe(full);
  });

  it('prefers more notes when the tiers are equal', () => {
    const thin = cand('perfume-direct', { top: ['a'], middle: ['b'], base: ['c'] });
    const rich = cand('escentual', { top: ['a', 'b'], middle: ['b', 'c'], base: ['c'] });
    expect(pickBestNotes([thin, rich])).toBe(rich);
  });

  it('breaks a tie by the source order, then by id, whatever order they arrive in', () => {
    const a = cand('some-new-shop', { top: ['x'], middle: ['y'], base: ['z'] });
    const b = cand('perfume-direct', { top: ['x'], middle: ['y'], base: ['z'] });
    const c = cand('escentual', { top: ['x'], middle: ['y'], base: ['z'] });
    for (const order of [[a, b, c], [c, b, a], [b, a, c]]) expect(pickBestNotes(order)).toBe(b);
    const d = cand('another-new-shop', { top: ['x'], middle: ['y'], base: ['z'] });
    expect(pickBestNotes([a, d])).toBe(d);
  });

  it('puts a fragrance house own storefront ahead of a shop on a tie, but not ahead of a fuller pyramid', () => {
    const house = cand('kayali', { top: ['x'], middle: ['y'], base: ['z'] }, true);
    const shop = cand('perfume-direct', { top: ['x'], middle: ['y'], base: ['z'] });
    expect(pickBestNotes([shop, house])).toBe(house);
    const fuller = cand('perfume-direct', { top: ['x'], middle: ['y'], base: ['z', 'w'] });
    expect(pickBestNotes([house, fuller])).toBe(fuller);
  });

  it('shows one shop whole, never a mix', () => {
    const topOnly = cand('a-shop', { top: ['t1', 't2', 't3'] });
    const baseOnly = cand('b-shop', { base: ['b1', 'b2'] });
    const best = pickBestNotes([topOnly, baseOnly])!;
    expect(best.notes.base).toEqual([]);
    expect(best.retailerId).toBe('a-shop');
  });

  it('compares consistently', () => {
    const x = cand('perfume-direct', { top: ['a'] });
    const y = cand('escentual', { top: ['a'] });
    expect(Math.sign(compareNoteCandidates(x, y))).toBe(-Math.sign(compareNoteCandidates(y, x)));
    expect(compareNoteCandidates(x, x)).toBe(0);
  });

  it('lists each shop in the source order once', () => {
    expect(new Set(NOTE_SOURCE_ORDER).size).toBe(NOTE_SOURCE_ORDER.length);
  });
});

describe('Mugler Alien 30ml EDP (owner example, 6 Oct 2026)', () => {
  const perfumeDirect =
    'Fragrance Type: Amber, Floral. Fragrance Notes: - Top notes: Sambac Jasmine - Middle notes: Cashmere - ' +
    'Base notes: White Amber Launched: 2005. *Refillable Talisman* .';
  const perfumeMarket =
    'Mugler Alien Eau de Parfum is an ambery woody floral fragrance. Fragrance Notes: Top Notes: Jasmine Sambac ' +
    'Middle Notes: Cashmere Wood Base Notes: White Amber';

  it('shows a base tier, credited to the shop it came from', () => {
    const a = parseNotes(perfumeDirect)!;
    const b = parseNotes(perfumeMarket)!;
    expect(a.base).toEqual(['White Amber']);
    expect(b).toEqual({ top: ['Jasmine Sambac'], middle: ['Cashmere Wood'], base: ['White Amber'] });
    const best = pickBestNotes([
      { retailerId: 'perfume-direct', url: 'u1', brandDirect: false, notes: a },
      { retailerId: 'perfume-market-uk', url: 'u2', brandDirect: false, notes: b },
    ])!;
    expect(best.notes.base).toEqual(['White Amber']);
    expect(['perfume-direct', 'perfume-market-uk']).toContain(best.retailerId);
  });

  it('would not let a thinner pyramid hide a full one, whichever was fetched last', () => {
    const thin = parseNotes('Top notes: Sambac Jasmine. Middle notes: Cashmere.')!;
    const full = parseNotes(perfumeMarket)!;
    for (const order of [[thin, full], [full, thin]]) {
      const best = pickBestNotes(
        order.map((n, i) => ({ retailerId: i === 0 ? 'zzz-shop' : 'aaa-shop', url: `u${i}`, brandDirect: false, notes: n })),
      )!;
      expect(best.notes.base).toEqual(['White Amber']);
    }
  });
});
