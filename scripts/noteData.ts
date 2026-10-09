/**
 * The Notes tab's lazy data file (`notes`, docs/NOTES-PAGE-PLAN.md sections B
 * to E): the group of every note, its icon, its related notes, the spellings
 * that search also finds it by, its one line description where one has been
 * written, and the prose that is hidden. Built at deploy time by
 * scripts/bundle-demo.ts from the committed rules and the catalogue the page
 * ships, so nothing here is ever committed and the home page's first load does
 * not carry a byte of it: the page fetches it with `__psLazy('notes')` the
 * first time Notes or a note page opens.
 *
 * The icons are published under content hashed names (`publishNoteIcons`),
 * `note-icons/h/<name>.<hash>.svg`, so demo/sw.js can keep them cache first:
 * a redrawn icon is a new address.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createNoteGrouper, NOTE_GROUP_IDS, noteWords, type NoteDataFile, type NoteGrouper, type NoteGroupId, type NoteGroupOut, type NoteGroupRules, type NoteGroupOverride,
} from '../src/catalogue/noteGroups.js';
import { headWords, NOTE_ICON_FILE, noteHeadWord, prepareNoteIcons, singularWord, type NoteIconFile } from '../src/catalogue/noteIconLookup.js';
import { noteMergeKey } from '../src/catalogue/noteName.js';
import { writeGenerated } from './generatedFiles.js';

/** The lazy data file's name (a key of LAZY_BUILT_MODULES in scripts/dataFiles.ts). */
export const NOTE_DATA_FILE = 'notes';

/** Where the hashed icon copies go, relative to demo/ (a "deploy" folder). */
export const HASHED_ICON_DIR = 'note-icons/h';
/** A hashed icon's address: demo/sw.js carries a copy of this pattern. */
export const HASHED_ICON_PATTERN = /^note-icons\/h\/[a-z0-9-]+\.[0-9a-f]{10}\.svg$/;

/**
 * A hue for each group's tile ground, light to heavy. Our own choice: sea
 * blue, citrus yellow, leaf green, berry red, rose pink, cream, spice orange,
 * caramel, wine, wood brown, moss olive, resin amber, musk lilac, smoke grey
 * blue, modern violet, neutral. Painted through the monogram tokens
 * (--mono-sat, --mono-bg-l), whose contrast is already measured in both themes.
 */
export const GROUP_HUES: Record<NoteGroupId, number> = {
  'air-water': 200, citrus: 50, 'herbs-greens': 110, fruits: 350, flowers: 330, 'white-flowers': 45,
  spices: 22, sweet: 32, drinks: 300, woods: 28, 'earth-moss': 80, resins: 38, 'musk-amber': 270,
  'leather-smoke': 215, modern: 255, more: 0,
};

export interface NoteGroupInputs {
  rules: NoteGroupRules;
  overrides: NoteGroupOverride[];
  aliases: { variant: string; canonical: string; kind?: string }[];
  icons: { file: string; name: string; group: string; aliases: string[] }[];
  groupIcons: { id: string; file: string }[];
  notANote: { markers: string[]; notes: { note: string }[] };
  descriptions: { note: string; text: string }[];
}

const readJson = (root: string, rel: string): unknown => JSON.parse(readFileSync(resolve(root, rel), 'utf8'));

/** The committed rules, read from the repository. */
export function readNoteGroupInputs(root: string): NoteGroupInputs {
  const rules = readJson(root, 'data/note-groups.json') as NoteGroupRules;
  const overrides = (readJson(root, 'data/note-group-overrides.json') as { overrides: NoteGroupOverride[] }).overrides;
  const aliases = (readJson(root, 'data/note-aliases.json') as { aliases: NoteGroupInputs['aliases'] }).aliases;
  const manifest = readJson(root, 'data/note-icons-manifest.json') as {
    icons: NoteGroupInputs['icons'];
    groups: NoteGroupInputs['groupIcons'];
  };
  const notANote = readJson(root, 'data/note-not-a-note.json') as NoteGroupInputs['notANote'];
  const descPath = 'data/note-descriptions.json';
  const descriptions = existsSync(resolve(root, descPath))
    ? (readJson(root, descPath) as { descriptions: { note: string; text: string }[] }).descriptions
    : [];
  return { rules, overrides, aliases, icons: manifest.icons, groupIcons: manifest.groups, notANote, descriptions };
}

export function grouperFor(inputs: NoteGroupInputs): NoteGrouper {
  return createNoteGrouper({
    rules: inputs.rules,
    overrides: inputs.overrides,
    aliases: inputs.aliases,
    icons: inputs.icons,
    notANote: inputs.notANote,
  });
}

/** `<base>.<first 10 hex of sha256>.svg` for these exact bytes. */
export function hashedIconName(file: string, content: string | Buffer): string {
  const base = file.replace(/^groups\//, 'group-').replace(/\.svg$/, '');
  return `${base}.${createHash('sha256').update(content).digest('hex').slice(0, 10)}.svg`;
}

/**
 * Copies every icon of the manifest to demo/note-icons/h/ under its hashed
 * name, removing whatever an earlier build left there, and returns each source
 * file's published path (relative to the site root).
 */
export function publishNoteIcons(root: string, inputs: NoteGroupInputs): Map<string, string> {
  const outDir = resolve(root, 'demo', HASHED_ICON_DIR);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const out = new Map<string, string>();
  for (const file of [...inputs.icons.map((i) => i.file), ...inputs.groupIcons.map((g) => g.file)]) {
    const content = readFileSync(resolve(root, 'demo/note-icons', file));
    const name = hashedIconName(file, content);
    writeGenerated(root, `demo/${HASHED_ICON_DIR}/${name}`, content);
    out.set(file, `${HASHED_ICON_DIR}/${name}`);
  }
  return out;
}

/** The hashed icons a build wrote, for tests. */
export function listPublishedIcons(root: string): string[] {
  const dir = resolve(root, 'demo', HASHED_ICON_DIR);
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

/**
 * The note's own icon, as an index into the manifest's `icons`, or -1: the icon
 * whose name or alias spelling has the note's merge key, else, for a spelling
 * data/note-aliases.json folds into another note, its canonical's (so a merged
 * spelling the catalogue still carries can never miss its canonical's icon).
 * The first icon to claim a spelling keeps it. Shared by the Notes tab's file
 * and the product page's lookup, so the two always show the same picture.
 */
export function ownIconOf(inputs: Pick<NoteGroupInputs, 'icons' | 'aliases'>): (name: string) => number {
  const byKey = new Map<string, number>();
  inputs.icons.forEach((i, at) => {
    for (const n of [i.name, ...i.aliases]) {
      const k = noteMergeKey(n);
      if (!byKey.has(k)) byKey.set(k, at);
    }
  });
  const canonicalOf = new Map<string, string>();
  for (const a of inputs.aliases) canonicalOf.set(noteMergeKey(a.variant), noteMergeKey(a.canonical));
  return (name) => {
    let k = noteMergeKey(name);
    for (let depth = 0; depth < 4; depth++) {
      const at = byKey.get(k);
      if (at !== undefined) return at;
      const next = canonicalOf.get(k);
      if (next === undefined || next === k) break;
      k = next;
    }
    return -1;
  };
}

export interface NoteIndexEntry {
  name: string;
  count: number;
}

/**
 * The file's contents. `notes` is the page's own NOTE_INDEX (name and product
 * count); `pyramids` is each product's notes, as the names the page shows.
 * `iconPath` maps a manifest file (`musk.svg`, `groups/woods.svg`) to its
 * published path.
 */
export function buildNoteData(
  notes: readonly NoteIndexEntry[],
  pyramids: readonly (readonly string[])[],
  inputs: NoteGroupInputs,
  iconPath: (file: string) => string,
): NoteDataFile {
  const grouper = grouperFor(inputs);
  const sorted = [...notes].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const names = sorted.map((n) => n.name);
  const indexOf = new Map(names.map((n, i) => [noteMergeKey(n), i] as const));
  const groupIndex = new Map(NOTE_GROUP_IDS.map((id, i) => [id, i] as const));

  const groups: NoteGroupOut[] = inputs.rules.groups.map((g) => {
    const icon = inputs.groupIcons.find((x) => x.id === g.id);
    if (!icon) throw new Error(`no group icon for ${g.id} in data/note-icons-manifest.json`);
    return { id: g.id, name: g.name, description: g.description, icon: iconPath(icon.file), hue: GROUP_HUES[g.id] };
  });

  // Own icons: the icon whose name or alias spelling is the note's.
  const icons = inputs.icons.map((i) => iconPath(i.file));
  const ownIcon = ownIconOf(inputs);

  const group = sorted.map((n) => groupIndex.get(grouper.classify(n.name).group)!);
  const icon = sorted.map((n) => ownIcon(n.name));
  const hiddenSet = new Set<number>();
  sorted.forEach((n, i) => {
    if (grouper.hidden(n.name)) hiddenSet.add(i);
  });

  // Related notes: the most lift (shared products against what chance would
  // give) among the notes this one is really worn with: shared by at least 3
  // products and by at least 2% of this note's own, the other note in 20 or
  // more products, no prose. Without the 2% floor a big note's list fills
  // with rare notes one shop happens to pair with it.
  const total = pyramids.length;
  const counts = sorted.map((n) => n.count);
  const shared = new Map<number, Map<number, number>>();
  const groupPairs = NOTE_GROUP_IDS.map(() => NOTE_GROUP_IDS.map(() => 0));
  for (const p of pyramids) {
    const ids = [...new Set(p.map((n) => indexOf.get(noteMergeKey(n))).filter((i): i is number => i !== undefined && !hiddenSet.has(i)))];
    const gs = [...new Set(ids.map((i) => group[i]!))];
    for (const a of gs) for (const b of gs) if (a !== b) groupPairs[a]![b]!++;
    for (const a of ids) {
      if (counts[a]! < 5) continue;
      let row = shared.get(a);
      if (!row) shared.set(a, (row = new Map()));
      for (const b of ids) if (a !== b) row.set(b, (row.get(b) ?? 0) + 1);
    }
  }
  const related: Record<number, number[]> = {};
  for (const [a, row] of shared) {
    const ranked = [...row]
      .filter(([b, s]) => s >= Math.max(3, Math.ceil(counts[a]! * 0.02)) && counts[b]! >= 20)
      .map(([b, s]) => ({ b, s, lift: (s * total) / (counts[a]! * counts[b]!) }))
      .sort((x, y) => y.lift - x.lift || y.s - x.s || x.b - y.b)
      .slice(0, 8)
      .map((x) => x.b);
    if (ranked.length > 0) related[a] = ranked;
  }

  // Search also finds a note by a merged spelling and by its icon's aliases.
  const alias: [number, string, 0 | 1][] = [];
  const seenAlias = new Set<string>();
  const addAlias = (canonical: string, variant: string, typo: boolean) => {
    const i = indexOf.get(noteMergeKey(canonical));
    const vk = noteMergeKey(variant);
    if (i === undefined || vk === noteMergeKey(canonical) || indexOf.has(vk) || seenAlias.has(`${i}:${vk}`)) return;
    seenAlias.add(`${i}:${vk}`);
    alias.push([i, variant, typo ? 1 : 0]);
  };
  for (const a of inputs.aliases) addAlias(a.canonical, a.variant, a.kind === 'spelling');

  const desc: Record<number, string> = {};
  for (const d of inputs.descriptions) {
    const i = indexOf.get(noteMergeKey(d.note));
    if (i !== undefined) desc[i] = d.text;
  }

  // Groups worn with each group: most shared pyramids, More Notes left out.
  const more = groupIndex.get('more')!;
  const wornWith = groupPairs.map((row, a) =>
    row
      .map((n, b) => ({ b, n }))
      .filter((x) => x.b !== a && x.b !== more && x.n > 0)
      .sort((x, y) => y.n - x.n || x.b - y.b)
      .slice(0, 4)
      .map((x) => x.b),
  );

  return { v: 1, groups, icons, names, group, icon, related, alias, desc, hidden: [...hiddenSet].sort((a, b) => a - b), wornWith };
}

/**
 * The product page's icon lookup (docs/NOTES-PAGE-PLAN.md section F, read by
 * src/catalogue/noteIconLookup.ts): for every note the page ships, its own
 * icon, its group's, or none for prose. `notes` is the page's NOTE_INDEX,
 * `shown` every spelling a product shows (normally one per note), `iconPath`
 * as for buildNoteData. The group of a note without an icon is carried as a
 * table of head words plus the notes their head word would misplace, which is
 * about a third of the size of listing every note. Before returning, the file
 * is read back the way the page reads it and must give every spelling exactly
 * the picture the grouper and the manifest give it; anything else throws, so a
 * build never publishes a lookup that disagrees with the Notes tab.
 */
export function buildNoteIconLookup(
  notes: readonly NoteIndexEntry[],
  shown: Iterable<string>,
  inputs: NoteGroupInputs,
  iconPath: (file: string) => string,
): NoteIconFile {
  const grouper = grouperFor(inputs);
  const ownIcon = ownIconOf(inputs);
  const dir = `${HASHED_ICON_DIR}/`;
  const fileName = (file: string): string => {
    const p = iconPath(file);
    if (!p.startsWith(dir) || !p.endsWith('.svg')) throw new Error(`note icon ${file} is published at ${p}, not under ${dir}`);
    return p.slice(dir.length, -'.svg'.length);
  };
  const groups = NOTE_GROUP_IDS.map((id) => {
    const icon = inputs.groupIcons.find((g) => g.id === id);
    if (!icon) throw new Error(`no group icon for ${id} in data/note-icons-manifest.json`);
    return fileName(icon.file);
  });
  const more = NOTE_GROUP_IDS.indexOf('more');

  // Every spelling a product shows, by merge key, NOTE_INDEX's own first.
  const spellings = new Map<string, Set<string>>();
  const addSpelling = (name: string) => {
    const k = noteMergeKey(name);
    if (k === '') return;
    const set = spellings.get(k) ?? new Set<string>();
    set.add(name);
    spellings.set(k, set);
  };
  for (const n of notes) addSpelling(n.name);
  for (const name of shown) addSpelling(name);

  const ownKeys = inputs.icons.map(() => new Set<string>());
  const prose = new Set<string>();
  const tail: { key: string; names: string[]; group: number }[] = [];
  for (const [key, set] of spellings) {
    const name = set.values().next().value!;
    const own = ownIcon(name);
    if (grouper.hidden(name)) prose.add(key);
    else if (own >= 0) ownKeys[own]!.add(key);
    else tail.push({ key, names: [...set], group: NOTE_GROUP_IDS.indexOf(grouper.classify(name).group) });
  }

  // Strip words: the rules' suffixes and origins, as single words. Only those
  // that really come off the end of a tail note's name are shipped.
  const stripAll = new Set(
    [...inputs.rules.strip, ...inputs.rules.origins].map((w) => noteWords(w)).filter((w) => w.length === 1).map((w) => singularWord(w[0]!)),
  );
  const stripUsed = new Set<string>();
  for (const t of tail) {
    for (const name of t.names) {
      const words = headWords(name);
      while (words.length > 1 && stripAll.has(words[words.length - 1]!)) stripUsed.add(words.pop()!);
    }
  }
  const headOf = (name: string) => noteHeadWord(name, stripUsed);

  // Each head word places notes in the group most of its notes are in (ties to
  // the lighter group); a word whose notes are mostly More Notes is left out.
  const votes = new Map<string, number[]>();
  for (const t of tail) {
    const w = headOf(t.names[0]!);
    if (w === '') continue;
    const row = votes.get(w) ?? NOTE_GROUP_IDS.map(() => 0);
    row[t.group]!++;
    votes.set(w, row);
  }
  const head = new Map<string, number>();
  for (const [w, row] of votes) {
    let best = 0;
    row.forEach((n, g) => {
      if (n > row[best]!) best = g;
    });
    if (best !== more) head.set(w, best);
  }
  const exact = new Map<string, number>();
  for (const t of tail) {
    if (t.names.some((name) => (head.get(headOf(name)) ?? more) !== t.group)) exact.set(t.key, t.group);
  }

  const sortedJoin = (xs: Iterable<string>): string => [...xs].sort().join('|');
  const perGroup = (m: Map<string, number>): string[] =>
    NOTE_GROUP_IDS.map((_, g) => sortedJoin([...m].filter(([, at]) => at === g).map(([x]) => x)));
  const file: NoteIconFile = {
    v: 1,
    dir,
    icons: inputs.icons.map((i, at) => [fileName(i.file), ...[...ownKeys[at]!].sort()].join('|')),
    groups,
    more,
    prose: sortedJoin(prose),
    strip: sortedJoin(stripUsed),
    head: perGroup(head),
    exact: perGroup(exact),
  };

  // Read it back as the page does, and hold it to the grouper and the manifest.
  const lookup = prepareNoteIcons(JSON.parse(JSON.stringify({ NOTE_ICONS: file })));
  for (const [key, set] of spellings) {
    const first = set.values().next().value!;
    const own = ownIcon(first);
    const want = prose.has(key)
      ? null
      : own >= 0
        ? { src: iconPath(inputs.icons[own]!.file), group: false }
        : { src: `${dir}${groups[NOTE_GROUP_IDS.indexOf(grouper.classify(first).group)]}.svg`, group: true };
    for (const name of set) {
      const got = lookup.iconFor(name);
      if (got?.src !== want?.src || got?.group !== want?.group) {
        throw new Error(`note icon lookup gives "${name}" ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
      }
    }
  }
  return file;
}

/** Re-exported for scripts/bundle-demo.ts: the lookup file's name. */
export { NOTE_ICON_FILE };
