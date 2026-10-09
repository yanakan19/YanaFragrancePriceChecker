/**
 * The group of every scent note: one of the 16 groups the owner approved on
 * 9 Oct 2026 (docs/NOTES-PAGE-PLAN.md, section B).
 *
 * Pure: no files, no catalogue. The rules are data (data/note-groups.json, the
 * reviewed overrides in data/note-group-overrides.json, the merged spellings in
 * data/note-aliases.json and the icon manifest's families), handed in by the
 * caller, so a review changes data and never this code.
 *
 * Every note gets exactly one group. The rules run in this order and the first
 * that answers wins:
 *
 *   1. override   a reviewed decision, with its basis and date
 *   2. alias      a merged spelling takes its canonical's group; a note an icon
 *                 serves (its name or one of its aliases) takes the icon's family
 *   3. phrase     an exact name, or its last two or three words, whose head word
 *                 would mislead ("Orange Blossom" is a white flower, not citrus)
 *   4. molecule   a named aroma material (decision 6 of the plan)
 *   5. head noun  the last word once suffixes (absolute, oil, accord...) and
 *                 origins (Madagascan, Calabrian...) are stripped; for "X de Y"
 *                 or "X of Y" the first part ("Bois de Santal" is wood)
 *   6. otherwise  More Notes
 *
 * A keyword elsewhere in the name, or a known word at the start or end of a
 * compound ("Pepperwood"), is only a suggestion (`suggestNoteGroup`): the
 * review script lists them and a person (or the reviewing agent) turns the good
 * ones into overrides. It is never applied by itself.
 */
import { noteMergeKey } from './noteName.js';

/** The 16 group ids, in the approved order (light to heavy). */
export const NOTE_GROUP_IDS = [
  'air-water', 'citrus', 'herbs-greens', 'fruits', 'flowers', 'white-flowers', 'spices', 'sweet',
  'drinks', 'woods', 'earth-moss', 'resins', 'musk-amber', 'leather-smoke', 'modern', 'more',
] as const;
export type NoteGroupId = (typeof NOTE_GROUP_IDS)[number];

export interface NoteGroupInfo {
  id: NoteGroupId;
  name: string;
  order: number;
  description: string;
  author: string;
  date: string;
}

/** data/note-groups.json */
export interface NoteGroupRules {
  groups: NoteGroupInfo[];
  strip: string[];
  origins: string[];
  phrases: Record<string, string>;
  molecules: Record<string, string>;
  words: Record<string, string[]>;
}

/** One reviewed decision in data/note-group-overrides.json. */
export interface NoteGroupOverride {
  note: string;
  group: string;
  /** Why: `head noun`, `lexicon`, `keyword (reviewed)`, `owner`, `wikidata:Q…`, or a short reason. */
  basis: string;
  date: string;
}

/** One group as the page needs it. `hue` tints the tile ground (the monogram tokens). */
/** The Notes tab's lazy data file (built by scripts/noteData.ts, read by demo/notesData.ts). One group as the page needs it. */
export interface NoteGroupOut {
  id: NoteGroupId;
  name: string;
  description: string;
  icon: string;
  hue: number;
}

/** The file. Per note arrays share one index: `names[i]`, `group[i]`, `icon[i]`. */
export interface NoteDataFile {
  v: 1;
  groups: NoteGroupOut[];
  /** Hashed paths of the notes' own icons; `icon[i]` indexes it, -1 for the group icon. */
  icons: string[];
  names: string[];
  group: number[];
  icon: number[];
  /** Up to 8 related notes per note (indices), for notes in 5 or more products. */
  related: Record<number, number[]>;
  /** Other spellings search finds a note by: [note index, spelling, 1 when it is a misspelling]. */
  alias: [number, string, 0 | 1][];
  /** One line descriptions, written and reviewed (data/note-descriptions.json). */
  desc: Record<number, string>;
  /** Prose the parser read as a note (data/note-not-a-note.json): not shown as a tile. */
  hidden: number[];
  /** For each group, the groups that most often share a pyramid with it (indices). */
  wornWith: number[][];
}

export type NoteGroupRule = 'override' | 'alias' | 'phrase' | 'molecule' | 'head' | 'none';

export interface NoteGroupAnswer {
  group: NoteGroupId;
  rule: NoteGroupRule;
}

export interface NoteGrouperInput {
  rules: NoteGroupRules;
  overrides: readonly NoteGroupOverride[];
  /** data/note-aliases.json: each merged spelling and the note it now is. */
  aliases: readonly { variant: string; canonical: string }[];
  /** data/note-icons-manifest.json `icons`: each icon's name, family and the spellings it serves. */
  icons: readonly { name: string; group: string; aliases: readonly string[] }[];
  /** data/note-not-a-note.json: prose a shop's description left in its notes list. */
  notANote?: { markers: readonly string[]; notes: readonly { note: string }[] };
}

const CONNECTORS = new Set(['de', 'of', 'du', 'des', 'd', 'di', 'del', 'della', 'da', 'do', 'dos', 'von']);
const LEADING_FILLER = new Set([...CONNECTORS, 'the', 'a', 'an', 'and', 'with', 'la', 'le', 'les', 'il', 'el']);

/** Lower case, accents folded, "&" as "and", every other symbol a space. */
export function noteWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '');
}

/** The forms of one word to look up: itself, then singulars of a plural. */
function forms(w: string): string[] {
  const out = [w];
  if (w.length > 3 && w.endsWith('ies')) out.push(`${w.slice(0, -3)}y`);
  if (w.length > 3 && w.endsWith('es')) out.push(w.slice(0, -2));
  if (w.length > 2 && w.endsWith('s')) out.push(w.slice(0, -1));
  return out;
}

const isGroup = (g: string): g is NoteGroupId => (NOTE_GROUP_IDS as readonly string[]).includes(g);

export interface NoteGrouper {
  /** The group of a note name, and the rule that placed it. */
  classify(name: string): NoteGroupAnswer;
  /** A guess for a note the rules leave in More Notes, for review only. */
  suggest(name: string): { group: NoteGroupId; via: string } | null;
  /**
   * Prose, not a note: a reviewed exact name, or a name holding a marker word
   * that the rules cannot place (a placed note is never hidden by a marker).
   */
  hidden(name: string): boolean;
}

export function createNoteGrouper(input: NoteGrouperInput): NoteGrouper {
  const { rules } = input;
  for (const [i, g] of rules.groups.entries()) {
    if (g.id !== NOTE_GROUP_IDS[i]) throw new Error(`note-groups.json: group ${i + 1} is ${g.id}, expected ${NOTE_GROUP_IDS[i]}`);
  }
  const check = (g: string, where: string): NoteGroupId => {
    if (!isGroup(g)) throw new Error(`${where}: "${g}" is not one of the 16 groups`);
    return g;
  };

  const overrides = new Map<string, NoteGroupId>();
  for (const o of input.overrides) overrides.set(noteMergeKey(o.note), check(o.group, `override ${o.note}`));
  const canonicalOf = new Map<string, string>();
  for (const a of input.aliases) canonicalOf.set(noteMergeKey(a.variant), a.canonical);
  const iconGroup = new Map<string, NoteGroupId>();
  for (const icon of input.icons) {
    const g = check(icon.group, `icon ${icon.name}`);
    for (const n of [icon.name, ...icon.aliases]) {
      const k = noteMergeKey(n);
      if (!iconGroup.has(k)) iconGroup.set(k, g);
    }
  }

  const strip = new Set(rules.strip.map((w) => noteWords(w).join(' ')));
  const origins = new Set(rules.origins);
  const phrases = new Map<string, NoteGroupId>();
  const words = new Map<string, NoteGroupId>();
  for (const [p, g] of Object.entries(rules.phrases)) phrases.set(noteWords(p).join(' '), check(g, `phrase ${p}`));
  for (const [g, list] of Object.entries(rules.words)) {
    const id = check(g, `words ${g}`);
    for (const w of list) {
      const norm = noteWords(w).join(' ');
      if (norm.includes(' ')) {
        if (!phrases.has(norm)) phrases.set(norm, id);
      } else words.set(norm, id);
    }
  }
  const molecules = new Map<string, NoteGroupId>();
  for (const [m, g] of Object.entries(rules.molecules)) molecules.set(noteWords(m).join(' '), check(g, `molecule ${m}`));

  const word = (w: string): NoteGroupId | undefined => {
    for (const f of forms(w)) {
      const g = words.get(f);
      if (g) return g;
    }
    return undefined;
  };

  /** The words that carry the name: suffixes, origins, numbers and leading filler gone. */
  const core = (name: string): string[] => {
    const t = noteWords(name).filter((w) => !/^\d+$/.test(w));
    const drop = (w: string) => strip.has(w) || origins.has(w);
    let changed = true;
    while (changed && t.length > 1) {
      changed = false;
      // "Rose Essential Oil", "Smell the Taste": suffixes of two or three words.
      for (const n of [3, 2]) {
        if (t.length > n && strip.has(t.slice(-n).join(' '))) { t.splice(-n); changed = true; }
      }
      if (t.length > 1 && drop(t[t.length - 1]!)) { t.pop(); changed = true; }
      if (t.length > 1 && (drop(t[0]!) || LEADING_FILLER.has(t[0]!))) { t.shift(); changed = true; }
    }
    return t;
  };

  const tail = (t: string[], n: number): string => t.slice(-n).join(' ');

  const byRules = (name: string): NoteGroupAnswer => {
    const t = core(name);
    if (t.length === 0) return { group: 'more', rule: 'none' };
    const whole = t.join(' ');
    // 3. phrase: the whole, then its last three and two words.
    for (const p of [whole, tail(t, 3), tail(t, 2)]) {
      const g = phrases.get(p);
      if (g) return { group: g, rule: 'phrase' };
    }
    // 4. molecule
    for (const m of [whole, tail(t, 2), tail(t, 1)]) {
      const g = molecules.get(m);
      if (g) return { group: g, rule: 'molecule' };
    }
    // 5. head noun: "X de Y" and "X of Y" by their first part, else the last word.
    const cut = t.findIndex((w, i) => i > 0 && CONNECTORS.has(w));
    if (cut > 0) {
      const head = t.slice(0, cut);
      const g = (head.length > 1 ? phrases.get(tail(head, 2)) : undefined) ?? word(head[head.length - 1]!);
      if (g) return { group: g, rule: 'head' };
    }
    const g = word(t[t.length - 1]!);
    if (g) return { group: g, rule: 'head' };
    // A named accord whose own words name no material ("Love Accord",
    // "Cyanide Accord") is an abstract accord: decision 6 of the plan.
    const raw = noteWords(name);
    if (raw.length > 1 && /^(accord|accords|chord)$/.test(raw[raw.length - 1]!)) return { group: 'modern', rule: 'head' };
    return { group: 'more', rule: 'none' };
  };

  const classify = (name: string, depth = 0): NoteGroupAnswer => {
    const key = noteMergeKey(name);
    const o = overrides.get(key);
    if (o) return { group: o, rule: 'override' };
    const canonical = canonicalOf.get(key);
    if (canonical !== undefined && depth < 4 && noteMergeKey(canonical) !== key) {
      return { group: classify(canonical, depth + 1).group, rule: 'alias' };
    }
    const icon = iconGroup.get(key);
    if (icon) return { group: icon, rule: 'alias' };
    return byRules(name);
  };

  const suggest = (name: string): { group: NoteGroupId; via: string } | null => {
    const t = core(name);
    for (let i = t.length - 2; i >= 0; i--) {
      const g = word(t[i]!) ?? molecules.get(t[i]!);
      if (g) return { group: g, via: t[i]! };
    }
    // A known word at the end or the start of a compound: "Pepperwood", "Peppercorn".
    const last = t[t.length - 1] ?? '';
    if (last.length >= 6) {
      let best: { group: NoteGroupId; via: string } | null = null;
      for (const [w, g] of words) {
        if (w.length < 4 || w.length >= last.length) continue;
        if ((last.endsWith(w) || last.startsWith(w)) && (!best || w.length > best.via.length)) best = { group: g, via: w };
      }
      return best;
    }
    return null;
  };

  const hiddenNames = new Set((input.notANote?.notes ?? []).map((n) => noteMergeKey(n.note)));
  const markers = new Set(input.notANote?.markers ?? []);
  const hidden = (name: string): boolean =>
    hiddenNames.has(noteMergeKey(name)) ||
    (noteWords(name).some((w) => markers.has(w)) && classify(name).group === 'more');

  return { classify: (name) => classify(name), suggest, hidden };
}
