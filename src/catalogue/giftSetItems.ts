import { foldTitle, statedMl } from './fragranceId.js';
import { convertedMl, nominalMlForOz } from './ounceSizes.js';

/**
 * What is in a set, as items (docs/GIFT-SETS-AND-OILS-PLAN.md, section 3.2).
 *
 * A set's contents are kept as the short strings the page has always shown
 * ("100ml Eau de Toilette", "5 x 10ml Eau de Parfum", "150ml Body Wash",
 * "3 pieces"), and this module is the one grammar for both directions: it reads
 * a title or a shop's description into those strings, and reads the strings back
 * into items with a size, a count and a kind. Nothing about the items is stored
 * apart from the strings, so the catalogue file does not grow for them; the Sets
 * tab, its filters and the product page read the same strings.
 *
 * Rules, all from the plan:
 *   - A count is stated only where the text states it ("3 x 10ml", "Duo" is
 *     two). Where the text does not say, the count is null, never 1.
 *   - A size with no unit is never turned into millilitres. A US ounce figure
 *     (a number, then "oz") is, to the nominal bottle size.
 *   - A bare size takes the item word nearest it, either side; where the nearest
 *     word is not a fragrance's and the size is bigger than the bottle before it,
 *     it stays bare rather than guess ("75ml + 30ml + 250ml": the 250ml is not
 *     said to be perfume).
 *   - Where the text names nothing it can read, there is no list and the page
 *     shows the shop's own title.
 */

export type ItemKind = 'fragrance' | 'travel' | 'wash' | 'body' | 'deo' | 'other';

export interface SetItem {
  /** How many, only where the text states it. */
  count: number | null;
  /** Millilitres of one, where the text states a size. */
  ml: number | null;
  /** What it is, from the words beside it; null for a bare size or a piece count. */
  kind: ItemKind | null;
  /** The words that say what it is, as they are shown ("Eau de Parfum", "Shower Gel"). Null for a bare size. */
  label: string | null;
  /** Set only on the "3 pieces" item: the count says how many things, not what they are. */
  pieces?: true;
  /**
   * The words of the segment that are not a size, a count or an item word: the
   * scent's own name where the title gives one ("dark gravity"). Used only to tell
   * two different fragrances in one set from one fragrance in two sizes; never stored.
   */
  scent?: string;
  /** Set where the label was taken from a neighbouring item, not read from the item's own words. */
  inferred?: true;
}

/* ── words ──────────────────────────────────────────────────────────────── */

interface Word {
  re: RegExp;
  label: string;
  kind: ItemKind;
}

/**
 * Item words, tried in order at each place; the first that matches there wins,
 * so a longer phrase is listed before the word inside it.
 */
const WORDS: readonly Word[] = [
  { re: /eau de parfum intense/, label: 'Eau de Parfum Intense', kind: 'fragrance' },
  { re: /eau de parfum|\bedp\b/, label: 'Eau de Parfum', kind: 'fragrance' },
  { re: /eau de toilette|\bedt\b/, label: 'Eau de Toilette', kind: 'fragrance' },
  { re: /eau de cologne|\bedc\b/, label: 'Eau de Cologne', kind: 'fragrance' },
  { re: /extrait de parfum|\bextrait\b/, label: 'Extrait de Parfum', kind: 'fragrance' },
  { re: /perfume oil|parfum oil|perfumed oil/, label: 'Perfume Oil', kind: 'fragrance' },
  { re: /\bparfum\b/, label: 'Parfum', kind: 'fragrance' },
  { re: /\bpdt\b|parfum de toilette|perfume de toilette/, label: 'Parfum de Toilette', kind: 'fragrance' },
  { re: /scent spray/, label: 'Scent Spray', kind: 'fragrance' },
  { re: /perfume mist|fragrance mist|hair mist|body mist|\bmist\b/, label: 'Body Mist', kind: 'body' },
  { re: /\bperfumes?\b|\bfragrance\b/, label: 'Perfume', kind: 'fragrance' },
  { re: /\bcologne\b/, label: 'Cologne', kind: 'fragrance' },
  { re: /\baftershave balm\b|after ?shave balm|a\/balm|post shave moisturi[sz]er/, label: 'Aftershave Balm', kind: 'body' },
  { re: /\baftershave lotion\b|after ?shave lotion/, label: 'Aftershave Lotion', kind: 'body' },
  { re: /\baftershave\b/, label: 'Aftershave', kind: 'fragrance' },
  { re: /travel spray|travel size|travel set|travel atomi[sz]er|spray pen|mega spritzer|atomi[sz]er|purse spray|pocket spray/, label: 'Travel Spray', kind: 'travel' },
  { re: /\bminiatures?\b|\bmini\b/, label: 'Miniature', kind: 'travel' },
  { re: /bath (?:and|&) shower gel|shower ?gel|duschgel|shower mousse|shower cream|b\/?wash|body ?wash|\bhbw\b|hair (?:and|&) body wash|\bs\/gel\b|bath gel|\bsg\b|shower oil|bubble bath/, label: 'Shower Gel', kind: 'wash' },
  { re: /body lotion|b\/lotion|body milk|body souffle|body butter|body cream|hand ?cream|hand lotion|\blotion\b|moisturi[sz]er|\bcream\b|\bbalm\b|lip balm|\bsoap\b/, label: 'Lotion', kind: 'body' },
  { re: /body spray|b\/spray|room spray/, label: 'Body Spray', kind: 'body' },
  { re: /deodorant spray|deo spray|deodorant stick|deo stick|\bdeodorant\b|\bdeo\b|anti-?perspirant/, label: 'Deodorant', kind: 'deo' },
  { re: /air ?fresh(?:e)?ner/, label: 'Air Freshener', kind: 'other' },
  { re: /ankle socks|\bsocks\b|\bbag\b|\bcase\b|\bpouch\b|\bmirror\b|\bholder\b|\bcharm\b|toiletry bag|make ?up case|\btissues?\b/, label: '', kind: 'other' },
];

/** A body companion's own label is the word the title used, tidied; these are the exact ones. */
const TIDY: Record<string, string> = {
  'body lotion': 'Body Lotion', 'b/lotion': 'Body Lotion', 'hand lotion': 'Hand Lotion', 'hand cream': 'Hand Cream',
  'body milk': 'Body Milk', 'body souffle': 'Body Souffle', 'body butter': 'Body Butter', 'body cream': 'Body Cream',
  lotion: 'Lotion', cream: 'Cream', balm: 'Balm', 'lip balm': 'Lip Balm', soap: 'Soap', moisturiser: 'Moisturiser', moisturizer: 'Moisturiser',
  'shower gel': 'Shower Gel', showergel: 'Shower Gel', 'shower cream': 'Shower Cream', 'body wash': 'Body Wash', bodywash: 'Body Wash',
  'b/wash': 'Body Wash', bwash: 'Body Wash', 's/gel': 'Shower Gel', sg: 'Shower Gel', 'bath gel': 'Bath Gel', 'bath & shower gel': 'Bath and Shower Gel',
  'bath and shower gel': 'Bath and Shower Gel', 'shower oil': 'Shower Oil', 'bubble bath': 'Bubble Bath',
  'body spray': 'Body Spray', 'b/spray': 'Body Spray', handcream: 'Hand Cream', hbw: 'Hair and Body Wash', duschgel: 'Shower Gel', 'shower mousse': 'Shower Mousse', mist: 'Body Mist', 'scent spray': 'Scent Spray', 'deo spray': 'Deodorant Spray', 'deodorant spray': 'Deodorant Spray', 'room spray': 'Room Spray',
  'deodorant stick': 'Deodorant Stick', 'deo stick': 'Deodorant Stick', deodorant: 'Deodorant', deo: 'Deodorant',
  'anti-perspirant': 'Antiperspirant', antiperspirant: 'Antiperspirant',
  'travel spray': 'Travel Spray', 'travel size': 'Travel Size', 'travel set': 'Travel Set', 'spray pen': 'Spray Pen',
  'mega spritzer': 'Mega Spritzer', atomiser: 'Atomiser', atomizer: 'Atomiser', 'purse spray': 'Purse Spray', 'pocket spray': 'Pocket Spray',
  'perfume mist': 'Perfume Mist', 'fragrance mist': 'Fragrance Mist', 'hair mist': 'Hair Mist', 'body mist': 'Body Mist',
  'aftershave balm': 'Aftershave Balm', 'after shave balm': 'Aftershave Balm', 'a/balm': 'Aftershave Balm', 'post shave moisturiser': 'Post Shave Moisturiser',
  'aftershave lotion': 'Aftershave Lotion', 'after shave lotion': 'Aftershave Lotion',
  'air freshener': 'Air Freshener', 'air freshner': 'Air Freshener',
  'ankle socks': 'Ankle Socks', socks: 'Socks', bag: 'Bag', case: 'Case', pouch: 'Pouch', mirror: 'Mirror', holder: 'Holder', charm: 'Charm',
  'toiletry bag': 'Toiletry Bag', 'make up case': 'Make Up Case', 'makeup case': 'Make Up Case', tissue: 'Tissues', tissues: 'Tissues',
};

interface Found {
  at: number;
  kind: ItemKind;
  label: string;
}

/** Every item word in `text` (folded, lower case), left to right, without one inside another. */
function wordsIn(text: string): Found[] {
  const out: Found[] = [];
  const taken: [number, number][] = [];
  for (const w of WORDS) {
    const re = new RegExp(w.re.source, 'g');
    for (const m of text.matchAll(re)) {
      const from = m.index!;
      const to = from + m[0].length;
      if (taken.some(([a, b]) => from < b && to > a)) continue;
      taken.push([from, to]);
      const raw = m[0].trim();
      const label = TIDY[raw] ?? (w.label === '' ? titleCase(raw) : w.label);
      out.push({ at: from, kind: w.kind, label });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── sizes ──────────────────────────────────────────────────────────────── */

const NUM = String.raw`\d{1,4}(?:\.\d{1,3})?`;
/** "3 x 10ml", "3x10 ml", "3 * 8.5ml", "4 x 5 ml". */
const COUNT_TIMES_ML = new RegExp(String.raw`(?<![\d.])(\d{1,2})\s*[x×*]\s*(${NUM})\s*ml\b`, 'i');
/** "10ml x 3", "20mlx10". */
const ML_TIMES_COUNT = new RegExp(String.raw`(?<![\d.])(${NUM})\s*ml\s*[x×*]\s*(\d{1,2})\b`, 'i');
/** "2 x 50 ml" with a unit-less size is not read; "2 * 0.33 Eau" (ounces, no unit) gives a count and no size. */
const COUNT_TIMES_BARE = new RegExp(String.raw`(?<![\d.])(\d{1,2})\s*[x×*]\s*(${NUM})(?!\s*(?:ml|g\b|pcs|pieces))`, 'i');
const PLAIN_ML = new RegExp(String.raw`(?<![\d.])(${NUM})\s*ml\b`, 'i');
const OZ = new RegExp(String.raw`(?<![\d.])(\d{1,2}(?:\.\d{1,3})?)\s*(?:fl\.?\s*)?oz\b`, 'i');
const GRAMS = new RegExp(String.raw`(?<![\d.])(${NUM})\s*(?:g|gr|gm|gms|grams?)\b`, 'i');

function mlFromOz(oz: number): number {
  return nominalMlForOz(oz) ?? convertedMl(oz);
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10);

/** One item as the string the page shows. */
export function itemString(item: SetItem): string {
  if (item.pieces) return `${item.count} pieces`;
  const size = item.ml !== null ? `${fmt(item.ml)}ml` : '';
  const count = item.count !== null && item.count > 1 ? `${item.count} x ` : '';
  return `${count}${size}${item.label ? `${size ? ' ' : ''}${item.label}` : ''}`.trim();
}

/** The strings back into items. Anything it cannot read is kept as an item with only a label. */
export function parseContents(contents: readonly string[] | null | undefined): SetItem[] {
  if (!contents) return [];
  return contents.map((s) => {
    const text = s.trim();
    const pieces = text.match(/^(\d+) pieces$/);
    if (pieces) return { count: Number(pieces[1]), ml: null, kind: 'other', label: 'pieces', pieces: true };
    const m = text.match(/^(?:(\d+) x )?(?:(\d+(?:\.\d+)?)ml)?(?: ?(.+))?$/);
    const count = m?.[1] ? Number(m[1]) : null;
    const ml = m?.[2] ? Number(m[2]) : null;
    const label = m?.[3]?.trim() || null;
    return { count, ml, kind: label ? kindOfLabel(label) : null, label };
  });
}

/** What a label says an item is. */
export function kindOfLabel(label: string): ItemKind {
  const t = label.toLowerCase();
  const found = wordsIn(t)[0];
  return found ? found.kind : 'other';
}

/* ── reading text ───────────────────────────────────────────────────────── */

/** Parts of a title or a description line between items. */
const SPLIT = /\s*(?:\+|&|;|,|:|·|•|\|)\s*|\s+[-–—]\s+|\s*[()]\s*|\s+\bwith\b\s+|\s*\/\s*(?=\d)/i;

/** Split on "and" only where both sides name an item or a size, so "Bath and Shower Gel" and "Dolce and Gabbana" stay whole. */
function splitAnd(part: string): string[] {
  const bits = part.split(/\s+\band\b\s+/i);
  if (bits.length < 2) return [part];
  const named = (s: string) => wordsIn(s.toLowerCase()).length > 0 || PLAIN_ML.test(s);
  const out: string[] = [];
  let acc = bits[0]!;
  for (let i = 1; i < bits.length; i++) {
    if (named(acc) && named(bits[i]!)) {
      out.push(acc);
      acc = bits[i]!;
    } else {
      acc = `${acc} and ${bits[i]}`;
    }
  }
  out.push(acc);
  return out;
}

/** "1 x 2ml JF EDT 1 x 2ml Santal EDT": several counted items in one run of words are several items. */
function splitCounts(part: string): string[] {
  const starts = [...part.matchAll(/(?<![\d.])\d{1,2}\s*x\s*\d/gi)].map((m) => m.index!);
  if (starts.length < 2) return [part];
  const out: string[] = [];
  const cuts = starts[0]! > 0 ? [0, ...starts] : starts;
  for (let i = 0; i < cuts.length; i++) out.push(part.slice(cuts[i], cuts[i + 1]));
  return out.map((p) => p.trim()).filter(Boolean);
}

interface Draft {
  count: number | null;
  ml: number | null;
  words: Found[];
  grams: number | null;
  /** Which ounce or bare number this segment had, so it is not read twice. */
  unitless: boolean;
  /** Where in the segment its size is, to find the item word nearest it. */
  sizeAt: number | null;
  scent: string;
}

const SCENT_NOISE = /\b(?:gift ?sets?|sets?|giftset|spray|splash|piece|pieces|pcs|pc|for|men'?s?|women'?s?|him|her|unisex|collection|and|the|of|a|with|in|bundle|duo|trio|boxed|mini|travel)\b/g;

/** A segment's own words, less sizes, counts and item words, as one lower case string. */
function scentOf(text: string, words: readonly Found[]): string {
  let t = text.toLowerCase();
  t = t.replace(new RegExp(String.raw`(?<![\d.])\d{1,4}(?:\.\d{1,3})?\s*(?:ml|oz|g)\b`, 'g'), ' ');
  t = t.replace(/(?<![\d.])\d{1,2}\s*[x×*]\s*/g, ' ');
  for (const w of WORDS) t = t.replace(new RegExp(w.re.source, 'g'), ' ');
  void words;
  return t.replace(SCENT_NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** What one segment says: a count, a size, and its item words. Null where it says none of them. */
function readSegment(raw: string): Draft | null {
  const text = raw.trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  let count: number | null = null;
  let ml: number | null = null;
  let unitless = false;
  let sizeAt: number | null = null;

  const ct = text.match(COUNT_TIMES_ML);
  const tc = !ct ? text.match(ML_TIMES_COUNT) : null;
  if (ct) {
    count = Number(ct[1]);
    ml = statedMl(ct[2]!);
    sizeAt = ct.index!;
  } else if (tc) {
    count = Number(tc[2]);
    ml = statedMl(tc[1]!);
    sizeAt = tc.index!;
  } else {
    const bare = text.match(COUNT_TIMES_BARE);
    if (bare && !PLAIN_ML.test(text)) {
      // "2 * 0.33 Eau De Toilette Spray": a count, and a size with no unit that is not read.
      count = Number(bare[1]);
      unitless = true;
    }
    const m = text.match(PLAIN_ML);
    if (m) {
      ml = statedMl(m[1]!);
      sizeAt = m.index!;
    } else {
      const oz = text.match(OZ);
      if (oz && !GRAMS.test(text)) {
        ml = mlFromOz(Number.parseFloat(oz[1]!));
        sizeAt = oz.index!;
      }
    }
  }
  const g = text.match(GRAMS);
  const words = wordsIn(lower);
  if (count === null && ml === null && words.length === 0) return null;
  return { count, ml, words, grams: g ? Number.parseFloat(g[1]!) : null, unitless, sizeAt, scent: scentOf(text, words) };
}

const FRAGRANCE_LIKE: ReadonlySet<ItemKind> = new Set(['fragrance']);

/**
 * The items a list of text segments names, in order. Companions without a size
 * ("Body Lotion") are items; a fragrance word with no size and no count is not
 * (a title that names an Eau de Parfum and a Body Wash and no sizes has no list).
 */
function itemsFromSegments(segments: readonly string[]): SetItem[] {
  const items: SetItem[] = [];
  let previous: Draft | null = null;
  let previousItem: SetItem | null = null;
  const parts = segments.flatMap(splitAnd).flatMap(splitCounts);
  for (const part of parts) {
    const d = readSegment(part);
    if (!d) {
      continue;
    }
    // A size alone, straight after an item word with no size of its own: "Eau de Parfum Spray (30ml)".
    const hasSize = d.ml !== null;
    const word = pickWord(d, part);
    if (hasSize && !word && previous && previous.ml === null && previous.count === null) {
      const pw = pickWord(previous, '');
      if (pw && FRAGRANCE_LIKE.has(pw.kind)) {
        // The earlier fragrance word names this bottle: the item is the two together.
        const last = items[items.length - 1];
        if (last && last.ml === null && last.label === pw.label) {
          last.ml = d.ml;
          last.count = d.count ?? last.count;
          previous = { ...(previous as Draft), ml: d.ml };
          previousItem = last;
          continue;
        }
      }
    }
    const companion = word !== null && word.kind !== 'fragrance' && !(word.kind === 'travel' && /^miniature$/i.test(word.label));
    if (hasSize || d.count !== null || companion) {
      let kind: ItemKind | null = word ? word.kind : null;
      let label: string | null = word ? word.label : null;
      let inferred = false;
      // A bare size takes the item word nearest it, from the bottle before it, where that is a fragrance
      // and this is no bigger than it.
      if (!word && previousItem && previousItem.kind === 'fragrance' && previousItem.ml !== null && d.ml !== null && d.ml <= previousItem.ml) {
        kind = previousItem.kind;
        label = previousItem.label;
        inferred = true;
      }
      const item: SetItem = { count: d.count, ml: d.ml, kind, label, scent: d.scent, ...(inferred ? { inferred: true as const } : {}) };
      // A weight in grams is no size in ml: a lip balm of 15g is a balm, with no size.
      items.push(item);
      previousItem = item;
    } else if (word) {
      // A fragrance word with no size or count of its own: remembered for the size that follows it.
      const placeholder: SetItem = { count: null, ml: null, kind: word.kind, label: word.label, scent: d.scent };
      items.push(placeholder);
      previousItem = null;
    }
    previous = d;
  }
  // A bare size straight before a fragrance that is no bigger than it ("100ml + 15ml Eau de Parfum") takes that word.
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i]!;
    const b = items[i + 1]!;
    if (a.label === null && a.ml !== null && b.kind === 'fragrance' && b.label && b.ml !== null && b.ml <= a.ml) {
      a.kind = b.kind;
      a.label = b.label;
      a.inferred = true;
    }
  }
  // Placeholders nobody gave a size to are not items.
  return items.filter((i) => i.ml !== null || i.count !== null || (i.kind !== 'fragrance' && i.kind !== null));
}

/**
 * The one word that names a segment: the item word nearest its size ("100ml EDP",
 * "Eau de Parfum Spray 100ml"), or, with no size, the first fragrance word and
 * failing that the first word.
 */
function pickWord(d: Draft, _text: string): Found | null {
  if (d.words.length === 0) return null;
  if (d.sizeAt === null) return d.words.find((w) => w.kind === 'fragrance') ?? d.words[0]!;
  const at = d.sizeAt;
  return d.words.reduce((a, b) => (Math.abs(b.at - at) < Math.abs(a.at - at) ? b : a));
}

/**
 * Items that are the same thing in a row become one with a count: five 9ml
 * colognes listed one after another are "5 x 9ml Cologne", which is what the
 * list says. Only items that say what they are (a bare "10ml" twice is not known
 * to be the same thing twice).
 */
export function mergeSame(items: SetItem[]): SetItem[] {
  const out: SetItem[] = [];
  for (const i of items) {
    const last = out[out.length - 1];
    if (last && !i.pieces && !last.pieces && i.label && last.label === i.label && last.kind === i.kind && last.ml === i.ml && last.ml !== null) {
      last.count = (last.count ?? 1) + (i.count ?? 1);
    } else {
      out.push({ ...i });
    }
  }
  return out;
}

/* ── titles ─────────────────────────────────────────────────────────────── */

const PIECE_COUNT = /\b(\d+)\s*(?:pcs|pc|ps|pieces?|packs?)\b|\bpack of (\d+)\b/i;
const WORD_PIECES = /\b(two|three|four|five|six)[- ]?(?:pcs|pc|pieces?)\b/i;
const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6 };
/** "Duo", "Twin" and "Trio" state two and three things, and nothing about what they are. */
const DUO = /\b(?:duo|twin)\b/i;
const TRIO = /\btrio\b/i;

/** The items a set's title spells out; an empty list where it does not. */
export function itemsFromTitle(title: string): SetItem[] {
  let t = foldTitle(title).replace(/&amp;/g, '&');
  // Kayali's duos and trios name each scent with its own number after a pipe, "(Eden Sparkling Lychee | 39 +
  // Vanilla Candy Rock Sugar | 42)"; the size in the title is each bottle's (see SCENT_PAIR in giftSet.ts).
  const pipes = t.match(/\|\s*\d{2}\b/g);
  if (pipes && pipes.length >= 2) {
    const size = t.match(PLAIN_ML);
    if (size) return [{ count: pipes.length, ml: statedMl(size[1]!), kind: 'fragrance', label: null }];
  }
  // A trailing shop label ("| NEW 2025") is its layout, not contents.
  t = t.replace(/\s+\|\s+(?!\d{2}\b)[^|]*$/, '');
  t = t.replace(/\b(\d+)\s*[x×*]\s*(?=\d)/g, '$1 x '); // "3x10ml" reads as "3 x 10ml"
  const items = mergeSame(itemsFromSegments(t.split(SPLIT)));
  if (items.length > 0) {
    const pieces = pieceItem(t);
    // "3 Piece Gift Set: Eau de Parfum 80ml - Body Lotion 75ml - Shower Gel 75ml" is said by its items; a count
    // that the items already carry adds nothing, one they do not carry is kept.
    return items.length >= 2 ? items : pieces && items.length === 1 && items[0]!.count === null ? [...items, pieces] : items;
  }
  return pieceItem(t) ? [pieceItem(t)!] : [];
}

function pieceItem(t: string): SetItem | null {
  const count = t.match(PIECE_COUNT);
  const word = t.match(WORD_PIECES);
  const pieces = count ? Number(count[1] ?? count[2]) : word ? NUMBER_WORDS[word[1]!.toLowerCase()]! : TRIO.test(t) ? 3 : DUO.test(t) ? 2 : null;
  if (pieces !== null && pieces >= 2) return { count: pieces, ml: null, kind: 'other', label: 'pieces', pieces: true };
  return null;
}

/* ── descriptions ───────────────────────────────────────────────────────── */

const CONTENTS_MARKER = /\b(?:this )?(?:gift )?(?:set|collection|kit|box|trio|duo)\s+(?:contains|includes|comprises|consists of)\b\s*:?|\b(?:contains|includes|comprises)\s*:/i;

/**
 * The items a shop's own description lists, where it has a list after "Set
 * contains:" or the like: Kayali's bulleted "0.34 oz / 10 ml Yum Pistachio
 * Gelato Eau de Parfum", John Lewis's "Crystal Noir Eau de Parfum, 90ml Crystal
 * Noir Bath & Shower Gel, 100ml", Just My Look's "1 x Fierce Eau De Cologne
 * (100ml)", Emirates Oud's "8 x 25ml". Empty where it has none.
 */
export function itemsFromDescription(description: string | null | undefined): SetItem[] {
  if (!description) return [];
  const flat = description
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  const marker = flat.match(CONTENTS_MARKER);
  if (!marker || marker.index === undefined) return [];
  let rest = foldTitle(flat.slice(marker.index + marker[0].length));
  // The list ends where the prose after it begins.
  rest = rest.split(/\s[-–—]\s(?=[a-z]{2,}\s[a-z]{2,}\s[a-z]{2,})|\.\s+(?=[A-Z]{2,}\b|[a-z]{4,}\s)|\bdescription\b|\bspecifications\b/i)[0]!.slice(0, 700);

  // "1 x Name (100ml)" repeated.
  const listed = [...rest.matchAll(/(\d{1,2})\s*x\s+([^()]{3,90}?)\s*\(\s*(\d{1,4}(?:\.\d{1,3})?)\s*ml\s*\)/gi)];
  if (listed.length > 0) {
    return mergeSame(
      listed.map((m) => itemOf(m[2]!, Number(m[1]), statedMl(m[3]!))).filter((i): i is SetItem => i !== null),
    );
  }
  // "Name, 90ml Name, 100ml" (the size comes after the name, and the next name straight after it).
  const sized = [...rest.matchAll(/([^,]{3,90}?),\s*(\d{1,4}(?:\.\d{1,3})?)\s*ml\b(?:\s*\([^)]*\))?/gi)];
  if (sized.length > 0) {
    return mergeSame(sized.map((m) => itemOf(m[1]!, null, statedMl(m[2]!))).filter((i): i is SetItem => i !== null));
  }
  // Bullets: "0.34 oz / 10 ml Name" or "15 g Name".
  const bullets = rest.split(/·|•|\n|\s\*\s/).map((b) => b.trim()).filter(Boolean);
  const fromBullets = bullets.flatMap((b) => {
    const size = b.match(PLAIN_ML);
    const oz = b.match(OZ);
    // "0.53 oz / 15 g Lip Balm": the ounces beside a weight in grams are a weight.
    const ml = size ? statedMl(size[1]!) : oz && !GRAMS.test(b) ? mlFromOz(Number.parseFloat(oz[1]!)) : null;
    const item = itemOf(b, null, ml);
    // A fragrance named with no size is no item of the list.
    return item && (item.ml !== null || (item.kind !== 'fragrance' && item.kind !== null)) ? [item] : [];
  });
  if (fromBullets.length > 0) return mergeSame(fromBullets);
  // "8 x 25ml".
  const plain = rest.match(COUNT_TIMES_ML);
  if (plain) return [{ count: Number(plain[1]), ml: statedMl(plain[2]!), kind: 'fragrance', label: null }];
  return [];
}

function itemOf(nameText: string, count: number | null, ml: number | null): SetItem | null {
  const words = wordsIn(nameText.toLowerCase());
  // An accessory named beside a scent word ("Mini Perfume Holder Charm") is the accessory.
  const word = words.filter((w) => w.kind === 'other').at(-1) ?? words.find((w) => w.kind === 'fragrance') ?? words[0] ?? null;
  if (!word && ml === null) return null;
  return { count: count !== null && count > 1 ? count : null, ml, kind: word ? word.kind : null, label: word ? word.label : null };
}

/* ── what the page and the filters ask ──────────────────────────────────── */

/** The largest fragrance bottle in a set, in ml, or null where no fragrance has a size. */
export function mainMl(items: readonly SetItem[]): number | null {
  let best: number | null = null;
  for (const i of items) {
    if ((i.kind === 'fragrance' || i.kind === 'travel') && i.ml !== null && (best === null || i.ml > best)) best = i.ml;
  }
  return best;
}

/** The kinds of thing a set holds besides its fragrances, for the In the Box filter. */
export function boxKinds(items: readonly SetItem[]): ItemKind[] {
  return [...new Set(items.map((i) => i.kind).filter((k): k is ItemKind => k !== null))];
}

/** Whether a set holds two or more different fragrances (the "Two or More Fragrances" filter). */
export function fragranceCount(items: readonly SetItem[]): number {
  return items.reduce((n, i) => n + (i.kind === 'fragrance' || i.kind === 'travel' ? (i.count ?? 1) : 0), 0);
}

/* ── a set, read ────────────────────────────────────────────────────────── */

/**
 * The contents list a page shows, or null. A list needs two items, or a stated
 * count ("5 x 10ml Eau de Parfum", "3 pieces"): a title that names one bottle and
 * a "Gift Set" says nothing about what else is in the box, and the page then shows
 * the shop's own title rather than a list that reads as the whole of it.
 */
export function displayContents(items: readonly SetItem[]): string[] | null {
  if (items.length === 0) return null;
  const counted = items.some((i) => (i.count ?? 0) >= 2);
  if (items.length >= 2 || counted) return items.map(itemString);
  return null;
}

/** How many of the items say what they are, and are not a piece count. */
const labelled = (items: readonly SetItem[]): number => items.filter((i) => i.label && !i.pieces).length;

const BUNDLE_WORDS = /\b(?:bundles?|duo|trio|twin)\b/i;
const BUNDLE_TYPE = /^\s*bundles?\s*$/i;
/** A bottle this size or bigger is a full size one, not a travel spray or a miniature. */
export const FULL_SIZE_ML = 30;

/**
 * A bundle: the shop's own category says so, the title says bundle, duo, trio or
 * twin, or the set holds two or more full size fragrances whose names differ
 * (100ml of one scent and 50ml of another, not 100ml and 10ml of the same).
 * Bundles are sets, and are told from gift sets by the Kind filter only.
 */
export function isBundle(title: string, productType: string | null | undefined, items: readonly SetItem[]): boolean {
  if (productType && BUNDLE_TYPE.test(productType)) return true;
  if (BUNDLE_WORDS.test(title)) return true;
  const scents = new Set(
    items
      .filter((i) => i.kind === 'fragrance' && !i.inferred && i.ml !== null && i.ml >= FULL_SIZE_ML && i.scent)
      .map((i) => i.scent!),
  );
  return scents.size >= 2;
}

/** What is known of a set from one listing. */
export interface GiftSetFacts {
  contents: string[] | null;
  /** The largest fragrance bottle, where one is stated. */
  mainMl: number | null;
  bundle: boolean;
  /** Where the contents come from: the title (always the first try) or the shop's own description. */
  from: 'title' | 'description';
}

export function readGiftSet(l: { rawTitle: string; description?: string | null; productType?: string | null }): GiftSetFacts {
  const fromTitle = itemsFromTitle(l.rawTitle);
  const fromDescription = itemsFromDescription(l.description);
  // The title is the first try. The shop's own list replaces it only where it names more things by what they are.
  const useDescription = labelled(fromDescription) >= 2 && labelled(fromDescription) > labelled(fromTitle);
  const items = useDescription ? fromDescription : fromTitle;
  return {
    contents: displayContents(items),
    mainMl: mainMl(items),
    bundle: isBundle(l.rawTitle, l.productType, fromTitle),
    from: useDescription ? 'description' : 'title',
  };
}

