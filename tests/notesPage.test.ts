import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DEMO_FRAGRANCES, NOTE_INDEX } from '../demo/data.js';
import { sortNotes } from '../demo/listSort.js';
import { factsFor, noteMatches, prepareNotesData } from '../demo/notesData.js';
import { groupHref, noteHeroHtml, notesResults, notesTabHtml, relatedNotesHtml, tierLabel, tilesPerGroup, type NotesTabEnv, type NotesTabState } from '../demo/notesPage.js';
import { buildNoteData, HASHED_ICON_PATTERN, hashedIconName, readNoteGroupInputs } from '../scripts/noteData.js';
import { LAZY_BUILT_MODULES, LAZY_NAMES } from '../scripts/dataFiles.js';

/**
 * The Notes tab and the note page as drawn (docs/NOTES-PAGE-PLAN.md, section D,
 * and the owner's layout of 9 Oct 2026), from the same lazy data file the
 * build writes (scripts/noteData.ts), under Node.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = readNoteGroupInputs(root);
const pyramids = DEMO_FRAGRANCES.filter((f) => f.notes).map((f) => [...f.notes!.top, ...f.notes!.middle, ...f.notes!.base]);
const file = buildNoteData(NOTE_INDEX, pyramids, inputs, (f) => `note-icons/h/${hashedIconName(f, f)}`);
const data = prepareNotesData(JSON.parse(JSON.stringify({ NOTE_DATA: file })));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const titleCase = (s: string) => s.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
const env = (over: Partial<NotesTabEnv> = {}): NotesTabEnv => ({
  esc,
  titleCase,
  base: '/',
  controls: '<div class="controls"></div>',
  sorted: sortNotes(NOTE_INDEX, 'common'),
  withNotes: pyramids.length,
  products: DEMO_FRAGRANCES.length,
  chunked: (items, render) => items.slice(0, 48).map(render).join('') + (items.length > 48 ? '<li class="grid-more" aria-hidden="true"></li>' : ''),
  ...over,
});
const st = (over: Partial<NotesTabState> = {}): NotesTabState => ({ query: '', group: '', layer: 'any', desktop: true, ...over });
const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

describe('the Notes tab', () => {
  const desktop = notesTabHtml(data, false, st(), env());
  const phone = notesTabHtml(data, false, st({ desktop: false }), env());

  it('draws a few tiles a group, not every note: 12 a group on desktop, 8 on a phone', () => {
    const groups = data.groups.length;
    expect(count(desktop, /class="note-tile"/g)).toBeLessThanOrEqual(groups * tilesPerGroup(true));
    expect(count(phone, /class="note-tile"/g)).toBeLessThanOrEqual(groups * tilesPerGroup(false));
    expect(count(desktop, /class="note-tile"/g)).toBeGreaterThan(100);
    // Every element the old tab drew was a row per note: about 18,500 for 4,600 notes.
    expect(count(desktop, /<[a-z]/g)).toBeLessThan(2000);
  });

  it('makes every tile a real link to the note page, with the picture first and the name after it', () => {
    const tiles = desktop.match(/<a class="note-tile"[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t).toMatch(/href="\/notes\/[^"]+" data-nav/);
      expect(t.indexOf('<img')).toBeLessThan(t.indexOf('note-tile-name'));
      expect(t).toMatch(/alt="" width="96" height="96" loading="lazy" decoding="async"/);
      expect(t).toMatch(/src="\/note-icons\/h\/[a-z0-9-]+\.[0-9a-f]{10}\.svg"/);
    }
  });

  it('heads each group with its name, its count and our own line, and ends with See all', () => {
    for (const g of data.groups.filter((x) => x.id !== 'more')) {
      expect(desktop).toContain(`id="gh-${g.id}"`);
      expect(desktop).toContain(esc(g.description));
    }
    expect(desktop).toMatch(/<span class="nt-count t-count">[\d,]+ notes<\/span>/);
    expect(desktop).toContain(`href="${esc(groupHref('citrus'))}" data-nav>See all`);
  });

  it('has one sticky bar of group chips with counts, labelled, as links', () => {
    expect(count(desktop, /<nav class="nt-jump" aria-label="Jump to a group">/g)).toBe(1);
    expect(count(desktop, /<a class="nt-chip/g)).toBe(data.groups.length);
    expect(desktop).toMatch(/href="#g-citrus" data-jump="citrus">Citrus <span class="nt-chip-n">[\d,]+<\/span>/);
  });

  it('has a labelled search box and a polite status, and no letter strip or duplicate layer chips', () => {
    expect(desktop).toMatch(/<label for="note-search"[^>]*>Search notes<\/label>/);
    expect(desktop).toContain('id="note-search"');
    expect(desktop).toMatch(/id="note-search-status"[^>]*aria-live="polite"/);
    expect(desktop).not.toMatch(/alpha-scrubber|alpha-break|data-note-layer/);
  });

  it('shows More Notes last and closed', () => {
    const more = desktop.indexOf('id="g-more"');
    expect(more).toBeGreaterThan(desktop.indexOf('id="g-modern"'));
    expect(desktop.slice(more - 40, more)).toContain('<details');
  });

  it('never shows prose as a tile', () => {
    const hidden = file.hidden.map((i) => file.names[i]!);
    expect(hidden.length).toBeGreaterThan(20);
    for (const h of ['setting the stage', 'sophistication', 'Parfum', 'Fragrance']) {
      if (NOTE_INDEX.some((n) => n.name === h)) expect(hidden, h).toContain(h);
    }
    const all = notesTabHtml(data, false, st({ group: 'more' }), env({ chunked: (items, render) => items.map(render).join('') }));
    for (const h of hidden) expect(all).not.toContain(`>${esc(titleCase(h))}</span>`);
  });

  it('narrows the tiles to the search, by the start of any word and by other spellings', () => {
    const res = notesResults(data, st({ query: 'berg' }), env());
    const names = [...res.body.matchAll(/note-tile-name">([^<]+)</g)].map((m) => m[1]!);
    expect(names).toContain('Bergamot');
    expect(names).not.toContain('Lemon');
    expect(names).not.toContain('Iceberg Lettuce');
    expect(res.status).toMatch(/notes? match/);
    expect(noteMatches(factsFor(data, 'Mandarin'), 'mandarine') || noteMatches(factsFor(data, 'Mandarin'), 'mandarin')).toBe(true);
    // Groups with no match leave the page; their chips stay, dimmed.
    expect(res.body).not.toContain('id="g-drinks"');
    expect(res.jump).toMatch(/class="nt-chip is-empty"[^>]*>Drinks and Spirits/);
    expect(notesResults(data, st({ query: 'zzzzqq' }), env()).total).toBe(0);
  });

  it('opens a group on its own: every note, in chunks, and the groups it is worn with', () => {
    const one = notesTabHtml(data, false, st({ group: 'citrus' }), env());
    expect(one).toMatch(/<h1[^>]*>.*Citrus Notes<\/h1>/);
    expect(one).toContain('aria-label="Breadcrumb"');
    expect(one).toContain('class="grid-more"');
    expect(one).toMatch(/Often worn with Citrus/);
    expect(one).toMatch(/aria-current="page">Citrus/);
  });

  it('applies the layer filter', () => {
    const top = notesResults(data, st({ layer: 'top' }), env());
    const any = notesResults(data, st(), env());
    expect(top.total).toBeLessThan(any.total);
  });

  it('says it is loading until the file arrives, and lists the notes plainly if it fails', () => {
    expect(notesTabHtml(null, false, st(), env())).toContain('Loading the groups');
    expect(notesTabHtml(null, true, st(), env())).toMatch(/could not be loaded[\s\S]*class="note-tile note-tile-plain"/);
  });
});

describe('the lazy notes file', () => {
  it('is registered as a built lazy file and stays small', () => {
    expect(LAZY_BUILT_MODULES.notes).toBe('scripts/noteData.ts');
    expect(LAZY_NAMES).toContain('notes');
    const json = JSON.stringify({ NOTE_DATA: file });
    expect(json.length).toBeLessThan(400_000);
    expect(gzipSync(json).length).toBeLessThan(110_000);
  });

  it('gives every note its own icon or its group icon, and never nothing', () => {
    for (const n of NOTE_INDEX) {
      const f = factsFor(data, n.name);
      expect(f.icon, n.name).toMatch(HASHED_ICON_PATTERN);
    }
    expect(factsFor(data, 'Bergamot').groupIcon).toBe(false);
    const groupOnly = NOTE_INDEX.find((n) => factsFor(data, n.name).groupIcon && factsFor(data, n.name).group.id !== 'more');
    expect(groupOnly && factsFor(data, groupOnly.name).icon).toBe(groupOnly && factsFor(data, groupOnly.name).group.icon);
  });

  it('relates notes from our own pyramids: up to 8, never the note itself', () => {
    const b = factsFor(data, 'Bergamot');
    expect(b.related.length).toBeGreaterThan(2);
    expect(b.related.length).toBeLessThanOrEqual(8);
    expect(b.related).not.toContain('Bergamot');
  });
});

describe('a note page', () => {
  const counts = new Map(NOTE_INDEX.map((n) => [n.name, n.count] as const));
  const b = factsFor(data, 'Bergamot');
  const hero = noteHeroHtml('Bergamot', b, 3000, '<button class="note-chip">Top · 1</button>', { esc, titleCase, base: '/' });

  it('has a breadcrumb, a large picture, the name, its group as a link and its description', () => {
    expect(hero).toMatch(/aria-label="Breadcrumb"><a href="\/notes" data-nav>Notes<\/a>.*Citrus<\/a><\/nav>/s);
    expect(hero).toMatch(/note-hero-art" style="--mh:\d+"><img src="\/note-icons\/h\/bergamot\.[0-9a-f]{10}\.svg" alt="" width="200" height="200"/);
    expect(hero).toContain('<h1 class="t-page">Bergamot</h1>');
    expect(hero).toContain(`href="${groupHref('citrus')}" data-nav`);
    expect(hero).toContain(esc(b.description!));
  });

  it("shows the group's own line, named as the group's, where no description is written", () => {
    const other = NOTE_INDEX.find((n) => !factsFor(data, n.name).description && factsFor(data, n.name).group.id === 'woods')!;
    const f = factsFor(data, other.name);
    expect(noteHeroHtml(other.name, f, other.count, '', { esc, titleCase, base: '/' })).toContain(`Woods:</span> ${esc(f.group.description)}`);
  });

  it('lists the related notes as small tiles', () => {
    const html = relatedNotesHtml(b, data, counts, { esc, titleCase, base: '/' });
    expect(html).toContain('Often found with');
    expect(count(html, /class="note-tile note-tile-sm"/g)).toBe(b.related.filter((r) => counts.has(r)).length);
  });

  it('says where the note sits in each fragrance: Top, Heart, Base', () => {
    expect(tierLabel({ top: ['Bergamot'], middle: [], base: ['bergamot'] }, 'Bergamot')).toBe('Top · Base');
    expect(tierLabel({ top: [], middle: ['Rose'], base: [] }, 'rose')).toBe('Heart');
    expect(tierLabel(null, 'Rose')).toBe('');
  });
});

const built = existsSync(resolve(root, 'demo/index.html'));
describe.skipIf(!built)('the built page', () => {
  it('publishes the notes file and the hashed icons, and the home page names no icon', () => {
    const files = readdirSync(resolve(root, 'demo/data'));
    expect(files.some((f) => /^notes\.[0-9a-f]{16}\.json$/.test(f))).toBe(true);
    const icons = readdirSync(resolve(root, 'demo/note-icons/h'));
    expect(icons.length).toBe(inputs.icons.length + inputs.groupIcons.length);
    for (const i of icons) expect(`note-icons/h/${i}`).toMatch(HASHED_ICON_PATTERN);
    const home = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
    expect(home).not.toMatch(/note-icons\/h\/[a-z]/);
  });

  it('keeps the icons cache first in the service worker, in a cache of their own', () => {
    const sw = readFileSync(resolve(root, 'demo/sw.js'), 'utf8');
    expect(sw).toContain("const ICON_CACHE = 'pricesniffs-icons-v1';");
    expect(sw).toContain(String.raw`/\/note-icons\/h\/[a-z0-9-]+\.[0-9a-f]{10}\.svg$/`);
  });
});
