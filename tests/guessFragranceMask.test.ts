import { describe, expect, it } from 'vitest';
import {
  SMALL_WORDS, cleanProductName, hiddenAnswerWords, hiddenCount, lettersIn, maskPhrase, phraseText, planBlock, planPuzzleText, tidyName,
} from '../scripts/social-guess-mask.js';

// docs/GUESS-THE-FRAGRANCE-PLAN.md 1.6: every row of the edge case table.
const TABLE: [string, string][] = [
  ['Sauvage', 'S______'],
  ['Aventus', 'A______'],
  ["L'INTERDIT", "L'I_______"],
  ["L'eau D'issey", "L'eau D'I____"],
  ["''Le Male''", 'Le M___'],
  ['Eau de Pamplemousse Rose', 'Eau de P___________ R___'],
  ['Juliette Has a Gun', 'J_______ H__ a G__'],
  ['Dolce & Gabbana', 'D____ & G______'],
  ['Club De Nuit Intense Man', 'C___ de N___ I______ M__'],
  ['Baccarat Rouge 540', 'B_______ R____ 540'],
  ['1 Million', '1 M______'],
  ['212 VIP Men', '212 V__ M__'],
  ['L.12.12 Blanc Eau Intense', 'L.12.12 B____ eau I______'],
  ['Eilish No.2', 'E_____ No.2'],
  ["Ralph's Club", "R____'s C___"],
  ['Replica Never-ending Summer', 'R______ N____ E_____ S_____'],
  ['Maison Francis Kurkdjian', 'M_____ F______ K________'],
  ['Initio Parfums Privés', 'I_____ P______ P_____'],
  ['Blu Mediterraneo Arancia Di Capri', 'B__ M___________ A______ di C____'],
];

describe('the dash rule (plan 1.6)', () => {
  for (const [input, shown] of TABLE) {
    it(`${input} shows ${shown}`, () => {
      expect(phraseText(maskPhrase(input))).toBe(shown);
    });
  }

  it('hidden blanks equal letters minus the letters shown', () => {
    for (const [input] of TABLE) {
      const words = maskPhrase(input);
      const shownLetters = words.reduce((n, w) => n + w.reduce((m, c) => m + ('t' in c ? [...c.t].filter((g) => /\p{L}/u.test(g)).length : 0), 0), 0);
      expect(hiddenCount(words) + shownLetters, input).toBe(lettersIn(words));
    }
  });

  it('shows nothing but a first letter, a small word, a digit word or a short apostrophe part', () => {
    for (const [input] of TABLE) {
      for (const w of maskPhrase(input)) {
        const text = w.map((c) => ('t' in c ? c.t : '')).join('');
        const blanks = w.filter((c) => 'blank' in c).length;
        if (blanks > 0) {
          // A masked word: its shown text is one letter, plus punctuation, apostrophes and 1 to 2 letter parts.
          const letters = [...text].filter((g) => /\p{L}/u.test(g)).length;
          expect(letters, `${input}: ${text}`).toBeLessThanOrEqual(3);
        } else {
          const bare = text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
          expect(SMALL_WORDS.has(bare) || /\d/.test(text) || !/\p{L}/u.test(text) || /'/.test(text) || bare.length <= 2, `${input}: ${text}`).toBe(true);
        }
      }
    }
  });

  it('writes no hyphen, underscore or dash character into a picture word (blanks are drawn)', () => {
    for (const [input] of TABLE) {
      for (const w of maskPhrase(input)) for (const c of w) if ('t' in c) expect(c.t).not.toMatch(/[-_‐-―−]/);
    }
  });

  it('counts an accent once and never reveals an accent on a hidden letter', () => {
    const words = maskPhrase('Privés Lancôme');
    expect(phraseText(words)).toBe('P_____ L______');
    expect(hiddenCount(words)).toBe(11);
  });

  it('turns hyphens into spaces and normalises quotes', () => {
    expect(tidyName('Never-ending')).toBe('Never ending');
    expect(tidyName('Ralph’s')).toBe("Ralph's");
    expect(tidyName("''Le Male''")).toBe('Le Male');
  });
});

describe('what a puzzle may be (plan 1.6 rule 5)', () => {
  it('removes the house from the front of the name and a strength phrase from the end', () => {
    expect(cleanProductName('Lancome', 'Lancome La Vie Est Belle')).toBe('La Vie Est Belle');
    expect(cleanProductName('Dolce & Gabbana', 'Dolce & Gabbana Light Blue Eau de Toilette')).toBe('Light Blue');
    expect(cleanProductName("Ralph", "Ralph's Club")).toBe("Ralph's Club");
    expect(cleanProductName('X', 'Eau de Pamplemousse Rose')).toBe('Eau de Pamplemousse Rose');
    expect(cleanProductName('Y', 'Le Parfum')).toBe('Le Parfum');
  });

  it('refuses data slips, repeats, too long and too short names', () => {
    const reason = (b: string, n: string) => {
      const r = planPuzzleText(b, n);
      return r.ok ? 'ok' : r.reason;
    };
    expect(reason('Dior', 'Terre D\'')).toMatch(/apostrophe/);
    expect(reason('Dior', 'Elixir Elixir')).toMatch(/repeated/);
    expect(reason('Dior', 'Sauvage (New)')).toMatch(/brackets/);
    expect(reason('Dior', 'Ab')).toMatch(/letters/);
    expect(reason('Dior', 'Abcdefghij Klmnopqrst Uvwxyzabcd Efghij')).toMatch(/at most 32/);
    expect(reason('Dior', 'One Two Three Four Five Six Seven')).toMatch(/words|at most 32/);
    expect(reason('Dior', 'Sauvage')).toBe('ok');
  });

  it('refuses a name that is only small words', () => {
    const r = planPuzzleText('Dior', 'Eau de La');
    expect(r.ok).toBe(false);
  });

  it('lists the really hidden words of an answer, never the shown ones', () => {
    expect(hiddenAnswerWords('Jean Paul Gaultier', 'Le Male').sort()).toEqual(['gaultier', 'jean', 'male', 'paul']);
    expect(hiddenAnswerWords('Givenchy', "L'Interdit")).toContain('interdit');
    expect(hiddenAnswerWords('Dolce & Gabbana', 'Light Blue')).not.toContain('and');
  });
});

describe('the layout planner', () => {
  it('uses one line at the largest size when it fits, and wraps between words only', () => {
    const one = planBlock(maskPhrase('Aventus'), 696, [88, 80, 64], 3, 214)!;
    expect(one.size).toBe(88);
    expect(one.lines).toHaveLength(1);
    const long = planBlock(maskPhrase('Maison Francis Kurkdjian'), 696, [88, 80, 72, 64, 56, 48], 2, 150)!;
    expect(long.lines.length).toBeLessThanOrEqual(2);
    expect(long.lines.flat()).toHaveLength(3);
  });

  it('returns null rather than cutting a word that cannot fit', () => {
    expect(planBlock(maskPhrase('Abcdefghijklmnopqrstuvwxyzabcdef'), 300, [88, 48], 3, 214)).toBeNull();
  });
});
