import { describe, expect, it } from 'vitest';
import {
  cleanNoteName,
  compareNotes,
  groupNotes,
  noteMergeKey,
  noteSlug,
  noteSortKey,
  sameNote,
} from '../src/catalogue/noteName.js';

/**
 * Scent note names (owner request, 6 Oct 2026): sort and show a clean name,
 * merge only true duplicates, never a variant.
 */

describe('cleanNoteName', () => {
  it('strips emoji, keeping the name', () => {
    expect(cleanNoteName('🍋 Lemon')).toBe('Lemon');
    expect(cleanNoteName('🌸 Orange Blossom')).toBe('Orange Blossom');
    expect(cleanNoteName('Vanilla 🍦')).toBe('Vanilla');
    expect(cleanNoteName('🤍 Marshmallow')).toBe('Marshmallow');
  });

  it('strips zero width characters glued to a name', () => {
    expect(cleanNoteName('Rose​')).toBe('Rose');
    expect(cleanNoteName('Amber ​')).toBe('Amber');
    expect(cleanNoteName('Ylang­-Ylang')).toBe('Ylang-Ylang');
  });

  it('strips trademark marks and stray symbols without leaving a gap or a TM', () => {
    expect(cleanNoteName('Ambrox® Super')).toBe('Ambrox Super');
    expect(cleanNoteName('Orcanox™ Upcycled')).toBe('Orcanox Upcycled');
    expect(cleanNoteName('Amberfix©')).toBe('Amberfix');
    expect(cleanNoteName('{Patchouli')).toBe('Patchouli');
    expect(cleanNoteName('Musk"')).toBe('Musk');
    expect(cleanNoteName('__ marshmallow')).toBe('marshmallow');
    expect(cleanNoteName('bergamot\n- __')).toBe('bergamot');
  });

  it('strips leftover line break markup', () => {
    expect(cleanNoteName('Dragon fruit>br>')).toBe('Dragon fruit');
    expect(cleanNoteName('Clary Sage br>')).toBe('Clary Sage');
    expect(cleanNoteName('Rose<br/>')).toBe('Rose');
  });

  it('collapses extra spaces and tidies hyphens', () => {
    expect(cleanNoteName('  Black   Pepper ')).toBe('Black Pepper');
    expect(cleanNoteName('Lily -of-the-Valley')).toBe('Lily-of-the-Valley');
    expect(cleanNoteName('Ylang‑Ylang')).toBe('Ylang-Ylang');
    expect(cleanNoteName('Cedar - Amber')).toBe('Cedar - Amber');
  });

  it('keeps accents and apostrophes, and straightens a curly one', () => {
    expect(cleanNoteName('Crème Brûlée')).toBe('Crème Brûlée');
    expect(cleanNoteName('Pomme d’Amour')).toBe("Pomme d'Amour");
  });

  it('returns an empty string when nothing is left', () => {
    expect(cleanNoteName('🍋')).toBe('');
    expect(cleanNoteName('__')).toBe('');
    expect(cleanNoteName('x')).toBe('');
  });
});

describe('noteSortKey and compareNotes', () => {
  it('folds case, accents and symbols', () => {
    expect(noteSortKey('🍋 Lemon')).toBe('lemon');
    expect(noteSortKey('Maté')).toBe('mate');
    expect(noteSortKey('Crème Brûlée')).toBe('creme brulee');
    expect(noteSortKey('Ylang-Ylang')).toBe('ylang ylang');
  });

  it('sorts a name that opened with an emoji where its letters say', () => {
    const names = ['Vanilla', '🍋 Lemon', 'amber', 'Maté', '__ marshmallow', 'Lavender', 'Mandarin'];
    expect([...names].sort(compareNotes)).toEqual(['amber', 'Lavender', '🍋 Lemon', 'Mandarin', '__ marshmallow', 'Maté', 'Vanilla']);
  });

  it('is a total order, so Z to A is A to Z reversed', () => {
    const names = ['Rose', 'rose', 'Rosé', '🌹 Rose', 'Rose​'];
    const az = [...names].sort(compareNotes);
    const za = [...names].sort((a, b) => compareNotes(b, a));
    expect(za).toEqual([...az].reverse());
  });
});

describe('the merge rule', () => {
  it('merges names that differ only by case, spacing, symbols, emoji, accents or hyphen', () => {
    expect(sameNote('Oak Moss', 'Oakmoss')).toBe(true);
    expect(sameNote('OAKMOSS', 'oakmoss')).toBe(true);
    expect(sameNote('Ylang-Ylang', 'Ylang ylang')).toBe(true);
    expect(sameNote('Ylang‑ylang', 'Ylang-Ylang')).toBe(true);
    expect(sameNote('Maté', 'Mate')).toBe(true);
    expect(sameNote('Crème Brûlée', 'Creme Brulee')).toBe(true);
    expect(sameNote('🍋 Lemon', 'Lemon')).toBe(true);
    expect(sameNote('Rose​', 'Rose')).toBe(true);
    expect(sameNote('Ambrox®', 'Ambrox')).toBe(true);
    expect(sameNote('Lily of the Valley', 'Lily-of-the-Valley')).toBe(true);
    expect(sameNote("Ta'if Rose", 'Taif Rose')).toBe(true);
    expect(sameNote('Passion Fruit', 'Passionfruit')).toBe(true);
    expect(sameNote('Dragon fruit>br>', 'Dragon Fruit')).toBe(true);
  });

  it('never merges a variant', () => {
    expect(sameNote('Madagascan Vanilla', 'Vanilla')).toBe(false);
    expect(sameNote('Sambac Jasmine', 'Jasmine')).toBe(false);
    expect(sameNote('Jasmine Sambac', 'Jasmine')).toBe(false);
    expect(sameNote('Jasmine Sambac', 'Sambac Jasmine')).toBe(false);
    expect(sameNote('Tonka Bean', 'Tonka Beans')).toBe(false);
    expect(sameNote('Blackcurrant Bud', 'Blackcurrant Buds')).toBe(false);
    expect(sameNote('Vanilla', 'Vanilla Bean')).toBe(false);
    expect(sameNote('Rose', 'Rose Water')).toBe(false);
    expect(sameNote('Orange', 'Orange Blossom')).toBe(false);
    expect(sameNote('Cedar', 'Cedarwood')).toBe(false);
    expect(sameNote('Sandalwood', 'White Sandalwood')).toBe(false);
  });

  it('gives a name with nothing left no key, and merges nothing with it', () => {
    expect(noteMergeKey('🍋')).toBe('');
    expect(sameNote('🍋', '🍎')).toBe(false);
  });

  it('is symmetric and reflexive', () => {
    const names = ['Oak Moss', 'Oakmoss', 'Maté', 'Mate', 'Vanilla', 'Madagascan Vanilla'];
    for (const a of names) {
      expect(sameNote(a, a)).toBe(true);
      for (const b of names) expect(sameNote(a, b)).toBe(sameNote(b, a));
    }
  });
});

describe('groupNotes', () => {
  const raw = new Map<string, number>([
    ['Vanilla', 900],
    ['vanilla', 20],
    ['🍦 Vanilla', 1],
    ['Madagascan Vanilla', 34],
    ['__ Madagascan vanilla', 1],
    ['Jasmine', 2000],
    ['Sambac Jasmine', 40],
    ['Jasmine Sambac', 60],
    ['Oakmoss', 600],
    ['Oak Moss', 4],
    ['Maté', 10],
    ['Mate', 25],
    ['🍋', 3],
  ]);
  const groups = groupNotes(raw);
  const names = groups.map((g) => g.display);

  it('keeps variants as their own notes', () => {
    expect(names).toContain('Vanilla');
    expect(names).toContain('Madagascan Vanilla');
    expect(names).toContain('Jasmine');
    expect(names).toContain('Sambac Jasmine');
    expect(names).toContain('Jasmine Sambac');
  });

  it('joins true duplicates into one note and remembers every spelling', () => {
    const vanilla = groups.find((g) => g.display === 'Vanilla')!;
    expect(vanilla.raw).toEqual(['vanilla', 'Vanilla', '🍦 Vanilla'].sort());
    expect(groups.filter((g) => g.key === 'oakmoss')).toHaveLength(1);
    expect(groups.filter((g) => g.key === 'mate')).toHaveLength(1);
  });

  it('shows the commonest clean spelling, and leaves out a name with nothing left', () => {
    expect(groups.find((g) => g.key === 'mate')!.display).toBe('Mate');
    expect(groups.find((g) => g.key === 'madagascanvanilla')!.display).toBe('Madagascan Vanilla');
    expect(groups.some((g) => g.key === '')).toBe(false);
  });

  it('comes back in A to Z order and is the same whatever order it is given', () => {
    expect(names).toEqual([...names].sort(compareNotes));
    const reversed = groupNotes(new Map([...raw].reverse())).map((g) => g.display);
    expect(reversed).toEqual(names);
  });
});

describe('noteSlug', () => {
  it('folds accents, where the router slugify would drop the letter', () => {
    expect(noteSlug('Maté')).toBe('mate');
    expect(noteSlug('Crème Brûlée')).toBe('creme-brulee');
  });

  it('is the same for a name and its decorated spelling', () => {
    expect(noteSlug('🍋 Lemon')).toBe('lemon');
    expect(noteSlug('Lily-of-the-Valley')).toBe('lily-of-the-valley');
    expect(noteSlug('Lily of the Valley')).toBe('lily-of-the-valley');
  });

  it('keeps variants at different addresses', () => {
    expect(noteSlug('Madagascan Vanilla')).not.toBe(noteSlug('Vanilla'));
    expect(noteSlug('Sambac Jasmine')).not.toBe(noteSlug('Jasmine'));
  });
});
