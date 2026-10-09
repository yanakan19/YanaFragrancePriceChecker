import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES, NOTE_INDEX } from '../demo/data.js';
import { factsFor, prepareNotesData } from '../demo/notesData.js';
import { NOTE_GROUP_IDS } from '../src/catalogue/noteGroups.js';
import { NOTE_ICON_FILE, noteHeadWord, prepareNoteIcons, type NoteIconFile } from '../src/catalogue/noteIconLookup.js';
import { LAZY_BUILT_MODULES, LAZY_NAMES, referencedDataFiles } from '../scripts/dataFiles.js';
import {
  buildNoteData, buildNoteIconLookup, grouperFor, HASHED_ICON_PATTERN, hashedIconName, ownIconOf, readNoteGroupInputs,
} from '../scripts/noteData.js';

/**
 * The product page's note icons (docs/NOTES-PAGE-PLAN.md, section F): the lazy
 * lookup file scripts/noteData.ts builds and src/catalogue/noteIconLookup.ts
 * reads, held to the grouper, the icon manifest and the Notes tab's own file,
 * and to the loading budget of section F.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = readNoteGroupInputs(root);
const sources = [...inputs.icons.map((i) => i.file), ...inputs.groupIcons.map((g) => g.file)];
/** Each source icon's published path, hashed from its real bytes, as the build names it. */
const published = new Map(sources.map((f) => [f, `note-icons/h/${hashedIconName(f, readFileSync(resolve(root, 'demo/note-icons', f)))}`] as const));
const iconPath = (f: string): string => published.get(f)!;
const pyramids = DEMO_FRAGRANCES.filter((f) => f.notes).map((f) => [...f.notes!.top, ...f.notes!.middle, ...f.notes!.base]);
const file = buildNoteIconLookup(NOTE_INDEX, pyramids.flat(), inputs, iconPath);
const json = JSON.stringify({ NOTE_ICONS: file });
const lookup = prepareNoteIcons(JSON.parse(json));
const grouper = grouperFor(inputs);
const ownIcon = ownIconOf(inputs);
const groupSrc = (id: string): string => iconPath(inputs.groupIcons.find((g) => g.id === id)!.file);

describe('the note icon lookup file', () => {
  it('is a built lazy file of its own, so a product page never fetches the Notes tab file', () => {
    expect(NOTE_ICON_FILE).toBe('noteIcons');
    expect(LAZY_BUILT_MODULES[NOTE_ICON_FILE]).toBe('scripts/noteData.ts');
    expect(LAZY_NAMES).toContain(NOTE_ICON_FILE);
  });

  it('stays small: under 40 kB, under 16 kB gzipped (measured 9 Oct 2026: 29.9 kB, 12.9 kB)', () => {
    expect(json.length).toBeLessThan(40_000);
    expect(gzipSync(json).length).toBeLessThan(16_000);
  });

  it('names only published icons, under the hash of their own bytes', () => {
    const named = [...file.icons.map((e) => e.split('|')[0]!), ...file.groups].map((n) => `${file.dir}${n}.svg`);
    const all = new Set<string>(published.values());
    for (const p of named) {
      expect(p).toMatch(HASHED_ICON_PATTERN);
      expect(all.has(p), p).toBe(true);
    }
    expect(file.icons.length).toBe(inputs.icons.length);
  });

  it('has an icon for every one of the 16 groups, More Notes included', () => {
    expect(file.groups.length).toBe(NOTE_GROUP_IDS.length);
    NOTE_GROUP_IDS.forEach((id, g) => {
      expect(existsSync(resolve(root, `demo/note-icons/groups/${id}.svg`)), id).toBe(true);
      expect(`${file.dir}${file.groups[g]}.svg`).toBe(groupSrc(id));
    });
    expect(NOTE_GROUP_IDS[file.more]).toBe('more');
  });

  it('refuses a file of any other shape', () => {
    expect(() => prepareNoteIcons({})).toThrow();
    expect(() => prepareNoteIcons({ NOTE_ICONS: { ...file, v: 2 } })).toThrow();
    expect(() => prepareNoteIcons({ NOTE_ICONS: { ...file, head: file.head.slice(1) } })).toThrow();
  });
});

describe('the icon each note shows on a product page', () => {
  it('gives every one of the top 200 notes its own icon (a tie at the edge counts in)', () => {
    const ranked = [...NOTE_INDEX].sort((a, b) => b.count - a.count);
    const cutoff = ranked[199]!.count;
    const missing = ranked.filter((n) => n.count >= cutoff && lookup.iconFor(n.name)?.group !== false).map((n) => n.name);
    expect(missing).toEqual([]);
  });

  it('gives a note without its own icon its group icon, More Notes when the rules cannot place it, and prose none', () => {
    let group = 0;
    let more = 0;
    for (const n of NOTE_INDEX) {
      const got = lookup.iconFor(n.name);
      if (grouper.hidden(n.name)) {
        expect(got, n.name).toBeNull();
        continue;
      }
      expect(got, n.name).not.toBeNull();
      if (ownIcon(n.name) >= 0) {
        expect(got, n.name).toEqual({ src: iconPath(inputs.icons[ownIcon(n.name)]!.file), group: false });
      } else {
        const id = grouper.classify(n.name).group;
        expect(got, n.name).toEqual({ src: groupSrc(id), group: true });
        if (id === 'more') more++;
        else group++;
      }
    }
    expect(group).toBeGreaterThan(1000);
    expect(more).toBeGreaterThan(0);
  });

  it('shows the same picture as the Notes tab for every note that is not prose', () => {
    const notes = prepareNotesData(JSON.parse(JSON.stringify({ NOTE_DATA: buildNoteData(NOTE_INDEX, pyramids, inputs, iconPath) })));
    for (const n of NOTE_INDEX) {
      const facts = factsFor(notes, n.name);
      if (facts.hidden) continue;
      expect(lookup.iconFor(n.name), n.name).toEqual({ src: facts.icon, group: facts.groupIcon });
    }
  });

  it("finds the canonical's icon for every spelling data/note-aliases.json merges", () => {
    const variants = inputs.aliases.map((a) => a.variant);
    const withVariants = prepareNoteIcons(JSON.parse(JSON.stringify({ NOTE_ICONS: buildNoteIconLookup(NOTE_INDEX, [...pyramids.flat(), ...variants], inputs, iconPath) })));
    let checked = 0;
    for (const a of inputs.aliases) {
      const own = ownIcon(a.canonical);
      if (own < 0 || grouper.hidden(a.variant)) continue;
      expect(withVariants.iconFor(a.variant), `${a.variant} -> ${a.canonical}`).toEqual({ src: iconPath(inputs.icons[own]!.file), group: false });
      checked++;
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('matches on the merge key, so case, spaces, hyphens and accents never miss', () => {
    const bergamot = lookup.iconFor('Bergamot');
    expect(bergamot?.group).toBe(false);
    expect(lookup.iconFor('BERGAMOT')).toEqual(bergamot);
    expect(lookup.iconFor('ylang-ylang')).toEqual(lookup.iconFor('Ylang Ylang'));
  });

  it('reads the head word the same way the build does, and places a name it has never seen in More Notes', () => {
    expect(noteHeadWord('Smoked Cedar Woods Absolute 2', new Set(['absolute']))).toBe('wood');
    expect(noteHeadWord('Wild Berries', new Set())).toBe('berry');
    expect(lookup.iconFor('Qzxv Plorbque')).toEqual({ src: groupSrc('more'), group: true });
    expect(lookup.iconFor('')).toBeNull();
  });

  it('covers over 90% of note uses with their own icon, and gives all but prose a picture', () => {
    let uses = 0;
    let own = 0;
    let none = 0;
    for (const p of pyramids) {
      for (const n of p) {
        uses++;
        const got = lookup.iconFor(n);
        if (!got) none++;
        else if (!got.group) own++;
      }
    }
    expect(own / uses).toBeGreaterThan(0.9);
    expect(none / uses).toBeLessThan(0.01);
  });
});

const built = existsSync(resolve(root, 'demo/index.html'));
describe.skipIf(!built)('the built site', () => {
  const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  const dataDir = resolve(root, 'demo/data');
  const lookupName = readdirSync(dataDir).find((f) => /^noteIcons\.[0-9a-f]{16}\.json$/.test(f));
  const builtFile = lookupName ? (JSON.parse(readFileSync(resolve(dataDir, lookupName), 'utf8')) as { NOTE_ICONS: NoteIconFile }).NOTE_ICONS : null;

  it('publishes the lookup, and a hashed copy of every icon in the manifest and every icon the lookup names', () => {
    expect(builtFile).not.toBeNull();
    const icons = new Set(readdirSync(resolve(root, 'demo/note-icons/h')));
    for (const f of sources) expect(icons.has(iconPath(f).slice('note-icons/h/'.length)), f).toBe(true);
    for (const n of [...builtFile!.icons.map((e) => e.split('|')[0]!), ...builtFile!.groups]) expect(icons.has(`${n}.svg`), n).toBe(true);
  });

  it('keeps every icon and the lookup out of the first load: only the lazy map names the file', () => {
    expect(html).not.toMatch(/note-icons\/h\/[a-z]/);
    expect(html).toContain(`"noteIcons":"data/${lookupName}"`);
    // The parser now removes the reviewed prose, so the list can be empty; an empty string is in every page.
    if (builtFile!.prose.length > 0) expect(html).not.toContain(builtFile!.prose.slice(0, 60));
    // The eager files the loader fetches before the app starts do not include it.
    const eager = /var files = (\[[^\n]*\]);/.exec(html)?.[1] ?? '[]';
    expect(eager).not.toContain('noteIcons');
    expect(referencedDataFiles(html)).toContain(`data/${lookupName}`);
  });

  it('holds the product page budget: the median 8 notes cost at most 8 icons and one lookup, under 20 kB', () => {
    const pageLookup = prepareNoteIcons({ NOTE_ICONS: builtFile });
    const median = pyramids.find((p) => new Set(p).size === 8)!;
    const srcs = new Set(median.map((n) => pageLookup.iconFor(n)?.src).filter((s): s is string => !!s));
    expect(srcs.size).toBeLessThanOrEqual(8);
    const gz = (path: string): number => gzipSync(readFileSync(path)).length;
    const total = gz(resolve(dataDir, lookupName!)) + [...srcs].reduce((sum, s) => sum + gz(resolve(root, 'demo', s)), 0);
    expect(total, `lookup and icons: ${total} bytes gzipped`).toBeLessThan(20 * 1024);
    // The busiest product shown still stays near the plan's 99th percentile figure.
    const busiest = Math.max(...pyramids.map((p) => new Set(p.map((n) => pageLookup.iconFor(n)?.src)).size));
    expect(busiest).toBeLessThanOrEqual(40);
  });
});
