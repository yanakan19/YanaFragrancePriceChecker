import { describe, expect, it } from 'vitest';
import { cleanNotes } from '../scripts/social-deal-of-day.js';

// The notes card's safety net (social/DESIGN-SYSTEM.md section 7): a note is a
// short ingredient; anything else is a scraping slip, and a set with too many
// slips is not shown at all.
const frag = { brand: 'Zimaya', name: 'Rabab Pulp' } as Parameters<typeof cleanNotes>[1];

describe('Deal of the Day notes check', () => {
  it('keeps clean notes, title cased, without dashes or repeats', () => {
    const { notes, reasons } = cleanNotes(
      { top: ['mango', 'Orange Blossom.'], middle: ['ylang-ylang', 'jasmine', 'Mango'], base: ['musk', 'vanilla'] },
      frag,
    );
    expect(reasons).toEqual([]);
    expect(notes).toEqual({ top: ['Mango', 'Orange Blossom'], middle: ['Ylang Ylang', 'Jasmine'], base: ['Musk', 'Vanilla'] });
  });

  it('treats missing notes as unavailable', () => {
    expect(cleanNotes(null, frag)).toEqual({ notes: null, reasons: ['no notes published'] });
  });

  it('rejects a set where too much is not a note', () => {
    const { notes, reasons } = cleanNotes(
      {
        top: ['Rabab Pulp Eau de Parfum 100ml', 'Free UK delivery over £50', 'bergamot'],
        middle: ['A long sentence describing the scent in detail'],
        base: ['amber'],
      },
      frag,
    );
    expect(notes).toBeNull();
    expect(reasons.join(' ')).toMatch(/did not look like notes/);
  });

  it('rejects too few notes and implausibly long tiers', () => {
    expect(cleanNotes({ top: ['rose'], middle: [], base: ['oud'] }, frag).notes).toBeNull();
    const many = Array.from({ length: 16 }, (_, i) => `note${String.fromCharCode(97 + i)}`);
    expect(cleanNotes({ top: many, middle: ['rose'], base: ['oud'] }, frag).reasons.join(' ')).toMatch(/top has 16 notes/);
  });
});
