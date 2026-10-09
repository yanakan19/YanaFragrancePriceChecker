/**
 * The Notes tab's lazy data (docs/NOTES-PAGE-PLAN.md): each note's group, icon,
 * related notes, search spellings and description. The file is built at deploy
 * time by scripts/noteData.ts and fetched with `__psLazy('notes')` the first
 * time Notes or a note page opens, so the home page's first load carries none
 * of it. No DOM here: tests/notesPage.test.ts reads it under Node.
 */
import type { NoteDataFile, NoteGroupOut } from '../src/catalogue/noteGroups.js';
import { fetchLazyFile, lazyData, type LazyData } from './priceHistoryStore.js';

/** The lazy data file's name, a key of LAZY_BUILT_MODULES in scripts/dataFiles.ts. */
export const NOTE_DATA_FILE = 'notes';

export type { NoteGroupOut };

export interface NoteFacts {
  name: string;
  group: NoteGroupOut;
  /** Site relative path of the note's picture: its own icon, else its group's. */
  icon: string;
  /** True when the picture is the group's, not the note's own. */
  groupIcon: boolean;
  related: string[];
  aliases: string[];
  /** The aliases that are misspellings: search finds the note by them, the page does not show them. */
  misspelt: Set<string>;
  description: string | null;
  hidden: boolean;
}

export interface NotesData {
  groups: NoteGroupOut[];
  /** Facts by note name (the name the page shows). */
  byName: Map<string, NoteFacts>;
  /** Groups most often worn with each group, by id. */
  wornWith: Map<string, NoteGroupOut[]>;
  /** The More Notes group, the fallback for a name the file does not know. */
  more: NoteGroupOut;
}

/** Folded for matching: lower case, accents gone, every symbol a space. */
export function foldForSearch(s: string): string {
  return ` ${s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

/** True when a word of the name (or of one of its other spellings) starts with the query. */
export function noteMatches(facts: Pick<NoteFacts, 'name' | 'aliases'>, query: string): boolean {
  const q = foldForSearch(query);
  if (q === ' ') return true;
  return [facts.name, ...facts.aliases].some((n) => foldForSearch(n).includes(q));
}

/** Checks the file's shape and builds the lookups. Throws on anything else. */
export function prepareNotesData(raw: unknown): NotesData {
  const file = (raw as { NOTE_DATA?: NoteDataFile } | null)?.NOTE_DATA;
  if (!file || file.v !== 1 || !Array.isArray(file.names) || !Array.isArray(file.groups)) {
    throw new Error('notes file is not { NOTE_DATA: { v: 1, ... } }');
  }
  const aliases = new Map<number, string[]>();
  const misspelt = new Map<number, Set<string>>();
  for (const [i, v, typo] of file.alias) {
    const list = aliases.get(i);
    if (list) list.push(v);
    else aliases.set(i, [v]);
    if (typo) {
      const set = misspelt.get(i) ?? new Set<string>();
      set.add(v);
      misspelt.set(i, set);
    }
  }
  const hidden = new Set(file.hidden);
  const byName = new Map<string, NoteFacts>();
  file.names.forEach((name, i) => {
    const group = file.groups[file.group[i]!]!;
    const own = file.icon[i]!;
    byName.set(name, {
      name,
      group,
      icon: own >= 0 ? file.icons[own]! : group.icon,
      groupIcon: own < 0,
      related: (file.related[i] ?? []).map((r) => file.names[r]!),
      aliases: aliases.get(i) ?? [],
      misspelt: misspelt.get(i) ?? new Set(),
      description: file.desc[i] ?? null,
      hidden: hidden.has(i),
    });
  });
  const wornWith = new Map(file.groups.map((g, i) => [g.id, (file.wornWith[i] ?? []).map((j) => file.groups[j]!)] as const));
  const more = file.groups.find((g) => g.id === 'more') ?? file.groups[file.groups.length - 1]!;
  return { groups: file.groups, byName, wornWith, more };
}

/**
 * The facts of a note, or a plain answer in More Notes for a name the file
 * does not know (a build whose catalogue moved on).
 */
export function factsFor(data: NotesData, name: string): NoteFacts {
  return (
    data.byName.get(name) ?? {
      name,
      group: data.more,
      icon: data.more.icon,
      groupIcon: true,
      related: [],
      aliases: [],
      misspelt: new Set(),
      description: null,
      hidden: false,
    }
  );
}

export function createNotesData(fetchFile: (name: string) => Promise<unknown> = fetchLazyFile): LazyData<NotesData> {
  return lazyData(() => fetchFile(NOTE_DATA_FILE).then(prepareNotesData));
}

/** The app's one copy. */
export const notesData = createNotesData();
