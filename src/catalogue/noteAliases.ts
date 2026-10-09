/**
 * Reviewed note aliases: spellings that are the SAME ingredient as another note.
 *
 * data/note-aliases.json is the one list (owner request, 9 Oct 2026). The
 * mechanical merge in noteName.ts joins names that differ only in case,
 * spacing, accents or punctuation; this joins the rest after a person has
 * looked: plurals (Juniper Berry, Juniper Berries), word order (Pepper Pink),
 * absolute, essence or oil of X (Rose Absolute), a country and its nationality
 * word (Italy Lemon), misspellings (Cardamon), and two names for one material
 * (Cassis and Blackcurrant, Orris Root and Orris, Olibanum and Frankincense).
 * Origins, parts (leaf, bud, blossom, wood, flower) and accords stay their own
 * notes, and the file's `keepApart` list says so for the pairs most likely to be
 * mistaken for one.
 *
 * The build (scripts/build-demo-catalogue.ts) applies it to every product's
 * notes, so every list that shows notes (product page, Notes tab, note pages,
 * filters, deals) and every future region that reads the catalogue shows one
 * name per ingredient. The file is append only, like data/id-aliases.json: the
 * published address of a merged spelling (/notes/<slug>) redirects to its
 * canonical note, and the entry is that address memory.
 *
 * Pure: nothing here reads a file. The build and the tests read the JSON.
 */
import { noteMergeKey } from './noteName.js';

export type NoteAliasKind = 'plural' | 'order' | 'form' | 'country' | 'spelling' | 'synonym';

export interface NoteAliasEntry {
  /** The spelling that is folded away. */
  variant: string;
  /** The note it becomes. Never itself a variant (no chains). */
  canonical: string;
  kind: NoteAliasKind;
  /** Why, for the pairs that are not obvious from the kind. */
  reason?: string;
}

export interface NoteKeepApart {
  notes: [string, string];
  reason: string;
}

export interface NoteAliasFile {
  version: number;
  aliases: NoteAliasEntry[];
  keepApart: NoteKeepApart[];
}

/** Merge key of a variant to the canonical name. */
export type NoteAliasMap = ReadonlyMap<string, string>;

export const NOTE_ALIAS_KINDS: readonly NoteAliasKind[] = ['plural', 'order', 'form', 'country', 'spelling', 'synonym'];

/**
 * Merge key to the one spelling the site uses: a variant's key to its
 * canonical, and a canonical's own key to its canonical, so the spelling and
 * the capitals of a merged note are the file's, not whichever a shop typed.
 */
export function noteAliasMap(file: Pick<NoteAliasFile, 'aliases'>): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of file.aliases) {
    const key = noteMergeKey(a.variant);
    if (key && !map.has(key)) map.set(key, a.canonical);
  }
  for (const a of file.aliases) {
    const key = noteMergeKey(a.canonical);
    if (key && !map.has(key)) map.set(key, a.canonical);
  }
  return map;
}

/** The note a name is shown as: its canonical if it is a reviewed variant, else itself. */
export function canonicalNote(name: string, map: NoteAliasMap): string {
  return map.get(noteMergeKey(name)) ?? name;
}

/**
 * One layer of notes with the aliases applied. A note that two spellings both
 * named (Cedar and Cedarwood) is listed once, in the place of the first.
 * `onRewrite` hears every spelling that was changed, for the address redirects.
 */
export function applyNoteAliases(
  names: readonly string[],
  map: NoteAliasMap,
  onRewrite?: (from: string, to: string) => void,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const to = map.get(noteMergeKey(raw));
    if (to !== undefined && to !== raw) onRewrite?.(raw, to);
    const name = to ?? raw;
    const key = noteMergeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Everything wrong with the file as it stands. Empty means it can be applied. */
export function checkNoteAliases(file: NoteAliasFile): string[] {
  const problems: string[] = [];
  const byKey = new Map<string, NoteAliasEntry>();
  for (const a of file.aliases) {
    const vk = noteMergeKey(a.variant);
    const ck = noteMergeKey(a.canonical);
    if (!vk || !ck) problems.push(`"${a.variant}" -> "${a.canonical}": a name has no letters`);
    else if (vk === ck) problems.push(`"${a.variant}" is the same note as its canonical "${a.canonical}" (the mechanical merge already joins them)`);
    if (!NOTE_ALIAS_KINDS.includes(a.kind)) problems.push(`"${a.variant}": unknown kind "${a.kind}"`);
    const had = byKey.get(vk);
    if (had) problems.push(`"${a.variant}" is listed twice (${had.canonical} and ${a.canonical})`);
    else byKey.set(vk, a);
  }
  for (const a of file.aliases) {
    const next = byKey.get(noteMergeKey(a.canonical));
    if (next) problems.push(`chain: "${a.variant}" -> "${a.canonical}" -> "${next.canonical}"`);
  }
  const map = noteAliasMap(file);
  for (const k of file.keepApart) {
    const [x, y] = k.notes;
    if (noteMergeKey(canonicalNote(x, map)) === noteMergeKey(canonicalNote(y, map))) {
      problems.push(`keepApart pair "${x}" and "${y}" is merged by the aliases`);
    }
    if (!k.reason) problems.push(`keepApart pair "${x}" and "${y}" has no reason`);
  }
  return problems;
}

/**
 * Append only: every variant `before` held is still there with the same
 * canonical, and every keepApart pair is still listed. Returns what broke.
 */
export function noteAliasesAppendOnlyProblems(before: NoteAliasFile, after: NoteAliasFile): string[] {
  const problems: string[] = [];
  const now = noteAliasMap(after);
  for (const a of before.aliases) {
    const to = now.get(noteMergeKey(a.variant));
    if (to === undefined) problems.push(`"${a.variant}" was dropped`);
    else if (noteMergeKey(to) !== noteMergeKey(a.canonical)) problems.push(`"${a.variant}" was repointed from "${a.canonical}" to "${to}"`);
  }
  const pairs = new Set(after.keepApart.map((k) => k.notes.map(noteMergeKey).sort().join('|')));
  for (const k of before.keepApart) {
    if (!pairs.has(k.notes.map(noteMergeKey).sort().join('|'))) problems.push(`keepApart "${k.notes.join('" / "')}" was dropped`);
  }
  return problems;
}
