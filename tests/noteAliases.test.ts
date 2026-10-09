import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyNoteAliases,
  canonicalNote,
  checkNoteAliases,
  noteAliasMap,
  noteAliasesAppendOnlyProblems,
  type NoteAliasFile,
} from '../src/catalogue/noteAliases.js';
import { noteMergeKey, noteSlug } from '../src/catalogue/noteName.js';
import { DEMO_FRAGRANCES, NOTE_INDEX, noteForAddress } from '../demo/data.js';
import { slugify } from '../demo/router.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';

/**
 * data/note-aliases.json is the one reviewed list of note spellings that are the
 * same ingredient (owner request, 9 Oct 2026; src/catalogue/noteAliases.ts). The
 * build applies it to every product's notes, so these tests read the catalogue
 * the build wrote.
 */
const root = resolve(import.meta.dirname, '..');
const file = JSON.parse(readFileSync(resolve(root, 'data/note-aliases.json'), 'utf8')) as NoteAliasFile;
const map = noteAliasMap(file);
const variantKeys = new Set(file.aliases.map((a) => noteMergeKey(a.variant)));
const indexKeys = new Map(NOTE_INDEX.map((n) => [noteMergeKey(n.name), n]));

describe('data/note-aliases.json', () => {
  it('is well formed: no self alias, duplicate, unknown kind, chain, cycle or unexplained keepApart', () => {
    expect(checkNoteAliases(file)).toEqual([]);
    expect(file.aliases.length).toBeGreaterThan(1000);
  });

  it('gives a reason for every pair that is not obvious from its kind', () => {
    const missing = file.aliases.filter((a) => (a.kind === 'synonym' || a.kind === 'spelling') && !a.reason);
    expect(missing.map((a) => a.variant)).toEqual([]);
  });

  it('only ever points at a canonical that is never itself a variant (no chains)', () => {
    for (const a of file.aliases) expect(variantKeys.has(noteMergeKey(a.canonical)), `${a.variant} -> ${a.canonical}`).toBe(false);
  });

  it('is append only against HEAD: an entry is never dropped or repointed', () => {
    let before: NoteAliasFile;
    try {
      before = JSON.parse(
        execFileSync('git', ['show', 'HEAD:data/note-aliases.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
      ) as NoteAliasFile;
    } catch {
      return; // not committed yet, or no git history here
    }
    expect(noteAliasesAppendOnlyProblems(before, file)).toEqual([]);
  });
});

describe('the catalogue the build wrote', () => {
  it('has every alias target as a note', () => {
    const missing = [...new Set(file.aliases.map((a) => a.canonical))].filter((c) => !indexKeys.has(noteMergeKey(c)));
    expect(missing).toEqual([]);
  });

  it('lists no folded spelling any more: every one of them is gone from the Notes tab', () => {
    const left = NOTE_INDEX.filter((n) => variantKeys.has(noteMergeKey(n.name))).map((n) => n.name);
    expect(left).toEqual([]);
  });

  it('lists a note once per layer of a product, however many spellings the shop used', () => {
    for (const f of DEMO_FRAGRANCES) {
      if (!f.notes) continue;
      for (const layer of ['top', 'middle', 'base'] as const) {
        const keys = f.notes[layer].map(noteMergeKey);
        expect(new Set(keys).size, `${f.id} ${layer}: ${f.notes[layer].join(', ')}`).toBe(keys.length);
      }
    }
    for (const e of CATALOGUE) {
      if (!e.notes) continue;
      for (const layer of ['top', 'middle', 'base'] as const) {
        const keys = e.notes[layer].map(noteMergeKey);
        expect(new Set(keys).size, `${e.id} ${layer}`).toBe(keys.length);
      }
    }
  });

  it('writes a canonical note under the one spelling the file gives it', () => {
    for (const e of CATALOGUE) {
      if (!e.notes) continue;
      for (const n of [...e.notes.top, ...e.notes.middle, ...e.notes.base]) {
        const to = map.get(noteMergeKey(n));
        if (to !== undefined) expect(n, 'a stored note must already be written as its canonical').toBe(to);
      }
    }
  });

  it('has fewer distinct notes than before the merge', () => {
    const before = new Set([...indexKeys.keys(), ...variantKeys]);
    expect(before.size - NOTE_INDEX.length).toBe(variantKeys.size);
    expect(NOTE_INDEX.length).toBeLessThan(4800); // 5,746 on the Notes tab on 9 Oct 2026
    expect(before.size).toBeGreaterThan(5500);
  });
});

describe('addresses of merged spellings', () => {
  it('open the canonical note: every merged spelling resolves, whichever way its address was made', () => {
    for (const a of file.aliases) {
      const note = indexKeys.get(noteMergeKey(a.canonical))!.name;
      for (const slug of new Set([slugify(a.variant), noteSlug(a.variant)])) {
        if (slug === '') continue;
        // A slug that is another note's own address means that note (its own address always wins).
        const found = noteForAddress(slug);
        if (found === undefined) expect.fail(`/notes/${slug} (${a.variant}) is a dead address`);
        else if (found !== note) expect(noteSlug(found), `/notes/${slug}`).toBe(slug);
      }
    }
  });

  it('send the best known examples to their notes', () => {
    const to = (slug: string) => noteForAddress(slug);
    expect(to('mandarin-orange')).toBe(to('mandarin'));
    expect(to('cedarwood')).toBe(to('cedar'));
    expect(to('oudh')).toBe(to('oud'));
    expect(to('agarwood')).toBe(to('oud'));
    expect(to('tonka')).toBe(to('tonka-bean'));
    expect(to('orris-root')).toBe(to('orris'));
    expect(to('cassis')).toBe(to('blackcurrant'));
    expect(to('black-currant')).toBe(to('blackcurrant'));
    expect(to('olibanum')).toBe(to('frankincense'));
    expect(to('juniper-berry')).toBe(to('juniper-berries'));
    expect(to('pepper-pink')).toBe(to('pink-pepper'));
    expect(to('cardamon')).toBe(to('cardamom'));
    expect(to('rose-absolute')).toBe(to('rose'));
    for (const s of ['mandarin', 'cedar', 'oud', 'tonka-bean', 'orris', 'blackcurrant', 'frankincense']) expect(to(s), s).toBeDefined();
  });
});

describe('notes kept apart', () => {
  it('are distinct notes that never merge, and all exist', () => {
    expect(file.keepApart.length).toBeGreaterThan(60);
    for (const k of file.keepApart) {
      const [x, y] = k.notes;
      const cx = noteMergeKey(canonicalNote(x, map));
      const cy = noteMergeKey(canonicalNote(y, map));
      expect(cx, `${x} / ${y}`).not.toBe(cy);
      expect(indexKeys.has(cx), `${x} is not a note any more`).toBe(true);
      expect(indexKeys.has(cy), `${y} is not a note any more`).toBe(true);
    }
  });

  it('include the pairs the owner named', () => {
    const pairs = new Set(file.keepApart.map((k) => k.notes.map(noteMergeKey).sort().join('|')));
    const has = (a: string, b: string) => pairs.has([a, b].map(noteMergeKey).sort().join('|'));
    for (const [a, b] of [
      ['Blackcurrant', 'Blackcurrant Leaf'],
      ['Blackcurrant', 'Blackcurrant Bud'],
      ['Musk', 'White Musk'],
      ['Orange', 'Bitter Orange'],
      ['Orange', 'Orange Blossom'],
      ['Pepper', 'Pink Pepper'],
      ['Pepper', 'Black Pepper'],
      ['Apple', 'Green Apple'],
    ] as const) {
      expect(has(a, b), `${a} / ${b}`).toBe(true);
    }
  });
});

describe('the icon manifest agrees with the aliases', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'data/note-icons-manifest.json'), 'utf8')) as {
    icons: { file: string; name: string; aliases: string[] }[];
  };
  const iconOf = new Map<string, string>();
  for (const i of manifest.icons) for (const s of [i.name, ...i.aliases]) iconOf.set(noteMergeKey(s), i.file);

  it('gives a merged spelling no other icon than its canonical note, and the canonical an icon whenever a spelling had one', () => {
    const problems: string[] = [];
    for (const a of file.aliases) {
      const iv = iconOf.get(noteMergeKey(a.variant));
      if (iv === undefined) continue;
      const ic = iconOf.get(noteMergeKey(a.canonical));
      if (ic === undefined) problems.push(`"${a.canonical}" has no icon but "${a.variant}" has ${iv}`);
      else if (ic !== iv) problems.push(`"${a.variant}" is drawn with ${iv} but "${a.canonical}" with ${ic}`);
    }
    expect(problems).toEqual([]);
  });
});

describe('applyNoteAliases and checkNoteAliases', () => {
  const small: NoteAliasFile = {
    version: 1,
    aliases: [
      { variant: 'Cedarwood', canonical: 'Cedar', kind: 'synonym', reason: 'cedarwood is cedar' },
      { variant: 'Juniper Berry', canonical: 'Juniper Berries', kind: 'plural' },
    ],
    keepApart: [{ notes: ['Cedar', 'Cedar Leaf'], reason: 'a leaf is not the wood' }],
  };
  const m = noteAliasMap(small);

  it('folds a variant, writes the canonical in the file spelling, and lists a note once', () => {
    expect(applyNoteAliases(['Rose', 'CEDARWOOD', 'cedar', 'Juniper-Berry'], m)).toEqual(['Rose', 'Cedar', 'Juniper Berries']);
  });

  it('tells which spellings it changed', () => {
    const heard: string[] = [];
    applyNoteAliases(['Cedarwood', 'Cedar', 'Musk'], m, (from, to) => heard.push(`${from}>${to}`));
    expect(heard).toEqual(['Cedarwood>Cedar']);
  });

  it('refuses a chain, a cycle, a duplicate, a self alias and a keepApart pair that merges', () => {
    const bad = (aliases: NoteAliasFile['aliases'], keepApart: NoteAliasFile['keepApart'] = []) =>
      checkNoteAliases({ version: 1, aliases, keepApart });
    expect(bad([{ variant: 'A b', canonical: 'C d', kind: 'synonym' }, { variant: 'C d', canonical: 'E f', kind: 'synonym' }]).join()).toMatch(/chain/);
    expect(bad([{ variant: 'A b', canonical: 'C d', kind: 'synonym' }, { variant: 'C d', canonical: 'A b', kind: 'synonym' }]).join()).toMatch(/chain/);
    expect(bad([{ variant: 'A b', canonical: 'C d', kind: 'synonym' }, { variant: 'a-b', canonical: 'E f', kind: 'synonym' }]).join()).toMatch(/twice/);
    expect(bad([{ variant: 'Oak Moss', canonical: 'Oakmoss', kind: 'spelling' }]).join()).toMatch(/same note/);
    expect(
      bad([{ variant: 'Rose Absolute', canonical: 'Rose', kind: 'form' }], [{ notes: ['Rose', 'Rose Absolute'], reason: 'x' }]).join(),
    ).toMatch(/merged by the aliases/);
  });

  it('notices a dropped or repointed entry', () => {
    const repointed: NoteAliasFile = { ...small, aliases: [{ ...small.aliases[0]!, canonical: 'Cedar Leaf' }] };
    expect(noteAliasesAppendOnlyProblems(small, repointed).join()).toMatch(/repointed/);
    expect(noteAliasesAppendOnlyProblems(small, repointed).join()).toMatch(/Juniper Berry.*dropped/);
    expect(noteAliasesAppendOnlyProblems(small, { ...small, aliases: [...small.aliases, { variant: 'X yz', canonical: 'Cedar', kind: 'synonym', reason: 'r' }] })).toEqual([]);
  });
});
