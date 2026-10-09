/**
 * Guess the Fragrance: the dash rule (docs/GUESS-THE-FRAGRANCE-PLAN.md 1.6) and
 * the planner that fits a masked name into a block of the picture.
 *
 * Pure: no imports, no files, so tests load it cheaply. A hidden letter is
 * never a character here: a word is a list of cells, each either shown text or
 * a blank, and the picture draws a blank as a bar (so no dash or hyphen
 * character ever reaches a post's text).
 */

/** A shown piece of text, or one hidden letter. */
export type Cell = { t: string } | { blank: true };
export type MaskWord = Cell[];

const isBlank = (c: Cell): c is { blank: true } => 'blank' in c;

/** Words that stay fully visible (plan 1.6 rule 2). */
export const SMALL_WORDS = new Set(
  ('a an the of and or in on at to for by with from de du des del della dei di da la le les el al il lo las los der den von van et y e no pour eau').split(' '),
);

/** The five strengths a puzzle may carry (plan 2.1 rule 2). */
export const STRENGTHS = ['Eau de Parfum', 'Eau de Toilette', 'Extrait de Parfum', 'Parfum', 'Eau de Cologne'] as const;

const QUOTES = /[‘’‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟"]/g;

const graphemes = (s: string): string[] => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment);
const isLetter = (g: string) => /\p{L}/u.test(g);
const isLetterOrDigit = (g: string) => /[\p{L}\p{N}]/u.test(g);
const letterCount = (s: string) => graphemes(s).filter(isLetter).length;

/** The post rule: hyphens and dashes become spaces. Quotes are normalised; quotes wrapping the whole text go. */
export function tidyName(raw: string): string {
  let s = raw.replace(QUOTES, "'").replace(DOUBLE_QUOTES, '"');
  s = s.replace(/\s*[-‐-―−]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  while (s.length > 2 && /^['"]/.test(s) && /['"]$/.test(s)) s = s.slice(1, -1).trim();
  return s;
}

const upperFirst = (s: string) => {
  const g = graphemes(s);
  return g.length ? g[0]!.toLocaleUpperCase('en-GB') + g.slice(1).join('') : s;
};

/** First letter shown (upper case, accent kept), one blank per remaining letter; punctuation stays in place. */
function maskPart(part: string): MaskWord {
  const out: MaskWord = [];
  let shown = false;
  for (const g of graphemes(part)) {
    if (!shown && isLetterOrDigit(g)) {
      out.push({ t: g.toLocaleUpperCase('en-GB') });
      shown = true;
    } else if (shown && isLetterOrDigit(g)) out.push({ blank: true });
    else out.push({ t: g });
  }
  return out;
}

/** The rule for one space separated word. `first` is true for the first word of a name. */
export function maskWord(word: string, first: boolean): MaskWord {
  if (!isLetterOrDigit(word)) return [{ t: word }]; // punctuation on its own
  if (/\d/.test(word)) return [{ t: word }]; // a digit word is part of the name
  const bare = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
  if (!word.includes("'")) {
    if (SMALL_WORDS.has(bare)) return [{ t: first ? upperFirst(word) : word.toLowerCase() }];
    return maskPart(word);
  }
  // Apostrophes split a word into parts: a part of 1 or 2 letters stays, a longer one is masked.
  const parts = word.split("'");
  const out: MaskWord = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push({ t: "'" });
    if (p === '') return;
    const letters = letterCount(p);
    if (letters <= 2 || /\d/.test(p)) out.push({ t: p });
    else if (SMALL_WORDS.has(p.toLowerCase())) out.push({ t: first && i === 0 ? upperFirst(p) : p.toLowerCase() });
    else out.push(...maskPart(p));
  });
  return out;
}

/** The rule for a whole phrase (a house or a name). */
export function maskPhrase(raw: string): MaskWord[] {
  const s = tidyName(raw);
  if (s === '') return [];
  return s.split(' ').map((w, i) => maskWord(w, i === 0));
}

/** The phrase as plain text with `_` for each blank (tests, dry runs and check.json; never a picture's text). */
export const wordText = (w: MaskWord): string => w.map((c) => (isBlank(c) ? '_' : c.t)).join('');
export const phraseText = (words: readonly MaskWord[]): string => words.map(wordText).join(' ');
export const hiddenCount = (words: readonly MaskWord[]): number => words.reduce((n, w) => n + w.filter(isBlank).length, 0);
/** Letters (shown or hidden) in a phrase. */
export const lettersIn = (words: readonly MaskWord[]): number =>
  words.reduce((n, w) => n + w.reduce((m, c) => m + (isBlank(c) ? 1 : letterCount(c.t)), 0), 0);

/** Strength phrases that end a catalogue name; they are shown as a clue, so they leave the name first. */
const STRENGTH_TAIL = /\s+(?:eau de parfum|eau de toilette|eau de cologne|extrait de parfum|edp|edt|edc)\s*$/i;

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** The name without a leading house and without a trailing strength phrase. */
export function cleanProductName(brand: string, name: string): string {
  let n = tidyName(name);
  const b = tidyName(brand);
  const word = (w: string) => w.replace(/&/g, 'and').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '');
  const bw = b.split(' ').map(word);
  const nw = n.split(' ');
  if (b && nw.length > bw.length && bw.every((w, i) => w !== '' && w === word(nw[i]!))) n = nw.slice(bw.length).join(' ');
  for (let i = 0; i < 2 && STRENGTH_TAIL.test(n); i++) n = n.replace(STRENGTH_TAIL, '').trim();
  return n;
}

export interface PuzzleText {
  ok: true;
  houseWords: MaskWord[];
  nameWords: MaskWord[];
  /** The name as it is answered (house and strength taken off). */
  answerName: string;
  hidden: number;
}
export type PuzzleRefusal = { ok: false; reason: string };

/** Eligibility (plan 1.6 rule 5). */
export function planPuzzleText(brand: string, name: string): PuzzleText | PuzzleRefusal {
  const bad = /[()[\]{}]/;
  if (bad.test(brand) || bad.test(name)) return { ok: false, reason: 'brackets in the house or name' };
  const answerName = cleanProductName(brand, name);
  if (/'\s*$/.test(answerName)) return { ok: false, reason: 'the name ends in an apostrophe (a data slip)' };
  if (/'\s*$/.test(tidyName(brand))) return { ok: false, reason: 'the house ends in an apostrophe' };
  const nameWords = maskPhrase(answerName);
  const houseWords = maskPhrase(brand);
  if (!houseWords.length || !nameWords.length) return { ok: false, reason: 'empty house or name' };
  const letters = lettersIn(nameWords);
  if (letters < 4) return { ok: false, reason: `name has ${letters} letters, needs 4` };
  if (letters > 32) return { ok: false, reason: `name has ${letters} letters, at most 32` };
  if (nameWords.length > 6) return { ok: false, reason: `name has ${nameWords.length} words, at most 6` };
  const lowered = answerName.split(' ').map((w) => norm(w));
  if (new Set(lowered).size < lowered.length) return { ok: false, reason: 'a repeated word in the name' };
  const hidden = hiddenCount(houseWords) + hiddenCount(nameWords);
  if (hidden < 3) return { ok: false, reason: `only ${hidden} hidden letters, needs 3` };
  if (hiddenCount(nameWords) < 1) return { ok: false, reason: 'the name shows in full' };
  return { ok: true, houseWords, nameWords, answerName, hidden };
}

/** The words of the answer that are really hidden (not small words, digit words or short apostrophe parts). */
export function hiddenAnswerWords(brand: string, name: string): string[] {
  const out = new Set<string>();
  for (const phrase of [tidyName(brand), cleanProductName(brand, name)]) {
    for (const w of phrase.split(' ')) {
      const masked = maskWord(w, false);
      if (!masked.some(isBlank)) continue;
      // The whole word, and each apostrophe part that is itself hidden.
      out.add(norm(w).replace(/ /g, ''));
      for (const part of w.split("'")) if (letterCount(part) > 2 && !SMALL_WORDS.has(part.toLowerCase())) out.add(norm(part).replace(/ /g, ''));
    }
  }
  out.delete('');
  return [...out];
}

/* ── the blank layout planner ───────────────────────────────────────────── */

/** Width of a blank cell in em: every blank is the same width, so a word's length reads as a count. */
export const CELL_EM = 0.5;
/** Gap between words in em. */
export const WORD_GAP_EM = 0.5;

/** A rough width in em of shown text (the browser check in the layout test is the exact one). */
export function shownEm(s: string): number {
  let em = 0;
  for (const g of graphemes(s)) {
    if (/[WM]/.test(g)) em += 0.95;
    else if (/\p{Lu}/u.test(g)) em += 0.74;
    else if (/[ilIjtf'.,]/.test(g)) em += 0.3;
    else if (/\p{L}/u.test(g)) em += 0.58;
    else if (/\p{N}/u.test(g)) em += 0.56;
    else if (g === '&') em += 0.72;
    else em += 0.4;
  }
  return em;
}

export const wordEm = (w: MaskWord): number => w.reduce((n, c) => n + (isBlank(c) ? CELL_EM : shownEm(c.t)), 0);

export interface BlockPlan {
  size: number;
  lines: MaskWord[][];
}

/**
 * Chooses the largest size from `sizes` (descending) at which the words wrap
 * between words into at most `maxLines` lines of at most `widthPx`, and whose
 * lines fit `heightPx` at 1.12 line height. Returns null if even the smallest
 * size does not fit (the puzzle is then not eligible: it is skipped, never cut).
 */
export function planBlock(words: readonly MaskWord[], widthPx: number, sizes: readonly number[], maxLines: number, heightPx: number): BlockPlan | null {
  for (const size of sizes) {
    const room = widthPx / size;
    const lines: MaskWord[][] = [];
    let current: MaskWord[] = [];
    let used = 0;
    let fits = true;
    for (const w of words) {
      const em = wordEm(w);
      if (em > room) {
        fits = false;
        break;
      }
      const add = current.length ? WORD_GAP_EM + em : em;
      if (used + add > room && current.length) {
        lines.push(current);
        current = [w];
        used = em;
      } else {
        current.push(w);
        used += add;
      }
    }
    if (!fits) continue;
    if (current.length) lines.push(current);
    if (lines.length <= maxLines && lines.length * size * 1.12 <= heightPx) return { size, lines: balance(lines, room) };
  }
  return null;
}

/** Moves words from a long first line to a short last one when that makes the lines even (never adds a line). */
function balance(lines: MaskWord[][], room: number): MaskWord[][] {
  const out = lines.map((l) => [...l]);
  const em = (l: MaskWord[]) => l.reduce((n, w, i) => n + wordEm(w) + (i ? WORD_GAP_EM : 0), 0);
  for (let i = out.length - 1; i > 0; i--) {
    while (out[i - 1]!.length > 1) {
      const moved = out[i - 1]![out[i - 1]!.length - 1]!;
      const before = Math.max(em(out[i - 1]!), em(out[i]!));
      const nextPrev = out[i - 1]!.slice(0, -1);
      const nextCur = [moved, ...out[i]!];
      const after = Math.max(em(nextPrev), em(nextCur));
      if (after < before - 0.01 && em(nextCur) <= room) {
        out[i - 1] = nextPrev;
        out[i] = nextCur;
      } else break;
    }
  }
  return out;
}
