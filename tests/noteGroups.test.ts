import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTE_INDEX } from '../demo/data.js';
import { createNoteGrouper, NOTE_GROUP_IDS, noteWords, type NoteGroupRules } from '../src/catalogue/noteGroups.js';
import { noteMergeKey } from '../src/catalogue/noteName.js';
import { grouperFor, readNoteGroupInputs } from '../scripts/noteData.js';

/**
 * The 16 groups of the Notes tab (docs/NOTES-PAGE-PLAN.md, section B, approved
 * by the owner on 9 Oct 2026) and the rules that place every note in exactly
 * one of them.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = readNoteGroupInputs(root);
const grouper = grouperFor(inputs);

const APPROVED = [
  ['air-water', 'Fresh Air and Water'],
  ['citrus', 'Citrus'],
  ['herbs-greens', 'Herbs and Greens'],
  ['fruits', 'Fruits and Berries'],
  ['flowers', 'Flowers'],
  ['white-flowers', 'White Flowers'],
  ['spices', 'Spices'],
  ['sweet', 'Sweet and Gourmand'],
  ['drinks', 'Drinks and Spirits'],
  ['woods', 'Woods'],
  ['earth-moss', 'Earth and Moss'],
  ['resins', 'Resins and Incense'],
  ['musk-amber', 'Musk and Amber'],
  ['leather-smoke', 'Leather and Smoke'],
  ['modern', 'Modern Accords and Aldehydes'],
  ['more', 'More Notes'],
] as const;

const byUse = [...NOTE_INDEX].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
const shown = byUse.filter((n) => !grouper.hidden(n.name));

describe('the group list', () => {
  it('is the approved list: ids, names and order exactly', () => {
    expect(inputs.rules.groups.map((g) => [g.id, g.name])).toEqual(APPROVED.map(([id, name]) => [id, name]));
    expect(inputs.rules.groups.map((g) => g.order)).toEqual(APPROVED.map((_, i) => i + 1));
    expect([...NOTE_GROUP_IDS]).toEqual(APPROVED.map(([id]) => id));
  });

  it('gives each group a line of at most 90 characters, no hyphens or dashes, and an author and date', () => {
    for (const g of inputs.rules.groups) {
      expect(g.description.length, g.id).toBeLessThanOrEqual(90);
      expect(g.description, g.id).not.toMatch(/[-‐-―]/);
      expect(g.description, g.id).not.toMatch(/\b(color|flavor|center|favorite)\b/i);
      expect(g.author.length, g.id).toBeGreaterThan(0);
      expect(g.date, g.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('puts no word in two groups', () => {
    const seen = new Map<string, string>();
    for (const [g, words] of Object.entries(inputs.rules.words)) {
      for (const w of words) {
        expect(seen.get(w) ?? g, `${w} is in ${seen.get(w)} and ${g}`).toBe(g);
        seen.set(w, g);
      }
    }
  });
});

describe('every note in exactly one group', () => {
  it('places every note of the Notes tab in one of the 16 groups', () => {
    for (const n of NOTE_INDEX) {
      const a = grouper.classify(n.name);
      expect(NOTE_GROUP_IDS, n.name).toContain(a.group);
    }
  });

  it('gives the same answer every time, and for every spelling of the same merge key', () => {
    const again = grouperFor(readNoteGroupInputs(root));
    for (const n of byUse.slice(0, 800)) {
      expect(again.classify(n.name), n.name).toEqual(grouper.classify(n.name));
      expect(grouper.classify(n.name.toUpperCase()).group, n.name).toBe(grouper.classify(n.name).group);
    }
  });

  it('holds the placements the owner approved', () => {
    const want: [string, string][] = [
      ['Patchouli', 'earth-moss'],
      ['Vetiver', 'earth-moss'],
      ['Tea', 'sweet'],
      ['Coffee', 'sweet'],
      ['Green Tea', 'sweet'],
      ['Black Tea', 'sweet'],
      ['Bergamot', 'citrus'],
      ['Orange Blossom', 'white-flowers'],
      ['Pink Pepper', 'spices'],
      ['Rose Water', 'flowers'],
      ['Tobacco Leaf', 'leather-smoke'],
      ['Salted Caramel', 'sweet'],
      ['Ambroxan', 'musk-amber'],
      ['Hedione', 'modern'],
      ['Iso E Super', 'modern'],
      ['Aldehydes', 'modern'],
      ['Sea Salt', 'air-water'],
      ['Calone', 'air-water'],
      ['Oakmoss', 'earth-moss'],
      ['Benzoin', 'resins'],
      ['Leather', 'leather-smoke'],
      ['Rum', 'drinks'],
      ['Sandalwood', 'woods'],
      ['Jasmine', 'white-flowers'],
      ['Vanilla', 'sweet'],
      ['Musk', 'musk-amber'],
    ];
    for (const [note, group] of want) expect(grouper.classify(note).group, note).toBe(group);
  });

  it('meets the plan targets: no top 500 note in More Notes, More Notes under 10% of notes and 1% of uses', () => {
    const top500 = byUse.slice(0, 500).filter((n) => !grouper.hidden(n.name));
    expect(top500.filter((n) => grouper.classify(n.name).group === 'more').map((n) => n.name)).toEqual([]);
    const more = shown.filter((n) => grouper.classify(n.name).group === 'more');
    const uses = shown.reduce((s, n) => s + n.count, 0);
    expect(more.length / shown.length).toBeLessThan(0.1);
    expect(more.reduce((s, n) => s + n.count, 0) / uses).toBeLessThan(0.01);
  });
});

describe('the rules, one by one', () => {
  const rules: NoteGroupRules = {
    groups: inputs.rules.groups,
    strip: ['absolute', 'oil', 'accord'],
    origins: ['madagascan', 'calabrian'],
    phrases: { 'orange blossom': 'white-flowers' },
    molecules: { hedione: 'modern' },
    words: { citrus: ['bergamot', 'orange'], woods: ['bois', 'wood'], sweet: ['vanilla'], flowers: ['rose'] },
  };
  const g = createNoteGrouper({ rules, overrides: [{ note: 'Rose', group: 'sweet', basis: 'test', date: '2026-10-09' }], aliases: [{ variant: 'Bergamotte', canonical: 'Bergamot' }], icons: [] });

  it('applies an override first', () => expect(g.classify('Rose')).toEqual({ group: 'sweet', rule: 'override' }));
  it('gives a merged spelling its canonical note group', () => expect(g.classify('Bergamotte')).toEqual({ group: 'citrus', rule: 'alias' }));
  it('reads a phrase before its head word', () => expect(g.classify('Orange Blossom Absolute')).toEqual({ group: 'white-flowers', rule: 'phrase' }));
  it('knows named molecules', () => expect(g.classify('Hedione')).toEqual({ group: 'modern', rule: 'molecule' }));
  it('strips suffixes and origins to the head noun', () => {
    expect(g.classify('Madagascan Vanilla Absolute')).toEqual({ group: 'sweet', rule: 'head' });
    expect(g.classify('Calabrian Bergamot Oil')).toEqual({ group: 'citrus', rule: 'head' });
  });
  it('reads X de Y by its first part', () => expect(g.classify('Bois de Rose').group).toBe('woods'));
  it('puts an accord its words cannot place among the modern accords', () => expect(g.classify('Love Accord').group).toBe('modern'));
  it('leaves the rest in More Notes, and only suggests a keyword guess', () => {
    expect(g.classify('Spiced Vanilla Clouds')).toEqual({ group: 'more', rule: 'none' });
    expect(g.suggest('Spiced Vanilla Clouds')).toEqual({ group: 'sweet', via: 'vanilla' });
  });
  it('folds accents and symbols in note words', () => expect(noteWords('Fleur d’Oranger — Absolue')).toEqual(['fleur', 'd', 'oranger', 'absolue']));
});

describe('the reviewed files', () => {
  it('gives every override a real group, a basis and a date, and names each note once', () => {
    const keys = new Set<string>();
    for (const o of inputs.overrides) {
      expect(NOTE_GROUP_IDS, o.note).toContain(o.group);
      expect(o.basis.length, o.note).toBeGreaterThan(3);
      expect(o.date, o.note).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const k = noteMergeKey(o.note);
      expect(keys.has(k), o.note).toBe(false);
      keys.add(k);
    }
  });

  it('dates every hidden name, and hides no note used by 15 or more products', () => {
    for (const n of inputs.notANote.notes) expect(JSON.stringify(n), n.note).toMatch(/"date":"\d{4}-\d{2}-\d{2}"/);
    const busy = byUse.filter((n) => n.count >= 15 && grouper.hidden(n.name)).map((n) => n.name);
    expect(busy).toEqual([]);
  });

  it('never hides a note the rules place, by a marker word', () => {
    const exact = new Set(inputs.notANote.notes.map((n) => noteMergeKey(n.note)));
    for (const n of NOTE_INDEX) {
      if (grouper.hidden(n.name) && !exact.has(noteMergeKey(n.name))) expect(grouper.classify(n.name).group, n.name).toBe('more');
    }
  });

  it('keeps descriptions to one factual line: at most 90 characters, no hyphens or dashes, for real notes', () => {
    const names = new Set(NOTE_INDEX.map((n) => noteMergeKey(n.name)));
    for (const d of inputs.descriptions) {
      expect(d.text.length, d.note).toBeLessThanOrEqual(90);
      expect(d.text, d.note).not.toMatch(/[-‐-―]/);
      expect(d.text, d.note).toMatch(/\.$/);
      expect(names.has(noteMergeKey(d.note)), d.note).toBe(true);
    }
  });

  it('only adds to the overrides and the hidden names (append only against HEAD)', () => {
    const atHead = (path: string): string | null => {
      try {
        return execFileSync('git', ['show', `HEAD:${path}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        return null;
      }
    };
    const head = atHead('data/note-group-overrides.json');
    if (head) {
      const was = (JSON.parse(head) as { overrides: { note: string; group: string }[] }).overrides;
      const now = (JSON.parse(readFileSync(resolve(root, 'data/note-group-overrides.json'), 'utf8')) as { overrides: { note: string }[] }).overrides;
      expect(now.slice(0, was.length).map((o) => o.note)).toEqual(was.map((o) => o.note));
    }
    const headHidden = atHead('data/note-not-a-note.json');
    if (headHidden) {
      const was = (JSON.parse(headHidden) as { notes: { note: string }[] }).notes.map((n) => n.note);
      expect(inputs.notANote.notes.slice(0, was.length).map((n) => n.note)).toEqual(was);
    }
  });
});
