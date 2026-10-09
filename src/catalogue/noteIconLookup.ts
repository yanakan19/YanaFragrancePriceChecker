/**
 * The product page's note icons (docs/NOTES-PAGE-PLAN.md, section F): which
 * picture each note of a product's Top, Middle and Base rows shows. Pure: no
 * DOM, no files. The lookup file is built at deploy time by scripts/noteData.ts
 * (`buildNoteIconLookup`) from the same rules and catalogue as the Notes tab's
 * file, and fetched with `__psLazy('noteIcons')` the first time a product page
 * with notes opens, so nothing of it is in the home page's first load.
 *
 * The answer for a note, first hit wins:
 *
 *   1. prose the parser read as a note (data/note-not-a-note.json): no icon
 *   2. the note's own icon, by its merge key (the build has already followed
 *      data/note-aliases.json, so a merged spelling finds its canonical's icon)
 *   3. its group's icon, shown at 70% opacity: the group comes from the list of
 *      notes the head word below would place wrongly, else from the head word
 *   4. the More Notes icon
 *
 * Step 3 is how the file stays small. Most of the long tail is placed by the
 * last word of its name ("Smoked Cedar Wood" is woods), so the file carries a
 * table of those words and only lists, by merge key, the notes whose group
 * differs from what their last word says. The build checks that the file gives
 * every note of the catalogue exactly the group the grouper gives it
 * (src/catalogue/noteGroups.ts), and refuses to write it otherwise.
 */
import { noteMergeKey } from './noteName.js';

/** The lazy data file's name, a key of LAZY_BUILT_MODULES in scripts/dataFiles.ts. */
export const NOTE_ICON_FILE = 'noteIcons';

/** What the file holds, under `NOTE_ICONS`. Lists of words and keys are joined by "|". */
export interface NoteIconFile {
  v: 1;
  /** Folder of the hashed icons, relative to the site root, ending in "/". */
  dir: string;
  /** Each own icon: its hashed file name without ".svg", then the merge keys it serves. */
  icons: string[];
  /** The group icons' hashed file names without ".svg", in NOTE_GROUP_IDS order. */
  groups: string[];
  /** Index in `groups` of More Notes. */
  more: number;
  /** Merge keys of prose: no icon. */
  prose: string;
  /** Words dropped from the end of a name before its head word is read. */
  strip: string;
  /** Per group (same order as `groups`): the head words that place a note there. */
  head: string[];
  /** Per group: merge keys of the notes placed there that the head word would place elsewhere. */
  exact: string[];
}

export interface NoteIcon {
  /** Path of the hashed icon, relative to the site root. */
  src: string;
  /** True when the picture is the note's group's, not its own. */
  group: boolean;
}

export interface NoteIconLookup {
  /** The icon of a note as the page shows it, or null for prose. */
  iconFor(name: string): NoteIcon | null;
}

/** One form per word, so the build and the page read the same head word: "berries" is "berry". */
export function singularWord(w: string): string {
  if (w.length > 3 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 2 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/**
 * The words of a name as the head word reads them: lower case, accents folded,
 * every symbol a space, numbers gone, each word in its one form. The same
 * folding as noteWords in src/catalogue/noteGroups.ts, kept here so the page
 * does not bundle the grouper's tables.
 */
export function headWords(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '' && !/^\d+$/.test(w))
    .map(singularWord);
}

/** The last word of a name, the strip words dropped from the end. */
export function noteHeadWord(name: string, strip: ReadonlySet<string>): string {
  const words = headWords(name);
  while (words.length > 1 && strip.has(words[words.length - 1]!)) words.pop();
  return words[words.length - 1] ?? '';
}

const split = (s: string): string[] => (s === '' ? [] : s.split('|'));

/** Checks the file's shape and builds the lookups. Throws on anything else. */
export function prepareNoteIcons(raw: unknown): NoteIconLookup {
  const file = (raw as { NOTE_ICONS?: NoteIconFile } | null)?.NOTE_ICONS;
  if (
    !file || file.v !== 1 || typeof file.dir !== 'string' || !Array.isArray(file.icons) || !Array.isArray(file.groups) ||
    !Array.isArray(file.head) || !Array.isArray(file.exact) || file.head.length !== file.groups.length ||
    file.exact.length !== file.groups.length || !file.groups[file.more]
  ) {
    throw new Error('note icon file is not { NOTE_ICONS: { v: 1, ... } }');
  }
  const own = new Map<string, NoteIcon>();
  for (const entry of file.icons) {
    const [name, ...keys] = split(entry);
    const icon = { src: `${file.dir}${name}.svg`, group: false };
    for (const k of keys) own.set(k, icon);
  }
  const groups = file.groups.map((name) => ({ src: `${file.dir}${name}.svg`, group: true }));
  const prose = new Set(split(file.prose));
  const strip = new Set(split(file.strip));
  const head = new Map<string, number>();
  const exact = new Map<string, number>();
  file.groups.forEach((_, g) => {
    for (const w of split(file.head[g]!)) head.set(w, g);
    for (const k of split(file.exact[g]!)) exact.set(k, g);
  });
  return {
    iconFor(name) {
      const key = noteMergeKey(name);
      if (key === '' || prose.has(key)) return null;
      const mine = own.get(key);
      if (mine) return mine;
      return groups[exact.get(key) ?? head.get(noteHeadWord(name, strip)) ?? file.more]!;
    },
  };
}
