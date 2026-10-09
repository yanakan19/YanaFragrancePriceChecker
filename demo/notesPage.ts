/**
 * The Notes tab and the top of a note's page, as HTML strings
 * (docs/NOTES-PAGE-PLAN.md, section D, and the owner's layout of 9 Oct 2026):
 * a grid of landscape tiles, the icon on top and the name centred under it,
 * under group headings with counts; a sticky bar of group chips; a search box
 * that narrows the tiles; 4 across on desktop and 2 on a phone, whole rows
 * centred, a short last row included.
 *
 * The first draw shows 12 tiles a group on desktop and 8 on a phone (about
 * 180 tiles, not 4,600 rows); "See all" opens the group's own view
 * (/notes?group=citrus), whose grid the page draws in chunks. Every tile is a
 * real link. No DOM here: tests/notesPage.test.ts draws it under Node.
 */
import { noteSlug } from '../src/catalogue/noteName.js';
import { factsFor, noteMatches, type NoteFacts, type NoteGroupOut, type NotesData } from './notesData.js';

export type NoteLayer = 'top' | 'middle' | 'base';
export type NoteLayerFilter = NoteLayer | 'any';

export interface NoteEntry {
  name: string;
  sort: string;
  count: number;
  layers: Set<NoteLayer>;
}

/** How the page names the three layers: Heart for the middle (owner's brief, 9 Oct 2026). */
export const LAYER_LABEL: Record<NoteLayer, string> = { top: 'Top', middle: 'Heart', base: 'Base' };

export interface NotesTabState {
  query: string;
  group: string;
  layer: NoteLayerFilter;
  desktop: boolean;
}

export interface NotesTabEnv {
  esc: (s: string) => string;
  titleCase: (s: string) => string;
  /** The site's base path, ending in a slash ("/" on the live site). */
  base: string;
  /** The sort and layer controls, drawn by the page. */
  controls: string;
  /** Notes in the order the reader chose (sortNotes). */
  sorted: readonly NoteEntry[];
  /** How many products list notes, and how many there are. */
  withNotes: number;
  products: number;
  /** The page's chunked list builder, for a group's whole grid. */
  chunked: <T>(items: readonly T[], render: (item: T) => string) => string;
}

/** Tiles a group shows before "See all". */
export const tilesPerGroup = (desktop: boolean): number => (desktop ? 12 : 8);

const n = (x: number): string => x.toLocaleString('en-GB');
/** The tile ground's colour: the group's hue, grey for More Notes. */
const ground = (g: NoteGroupOut): string => `--mh:${g.hue}${g.id === 'more' ? ';--ms:0%' : ''}`;
const plural = (x: number, one: string, many: string): string => `${n(x)} ${x === 1 ? one : many}`;

/** The address of a group's own view, with a search if there is one. */
export function groupHref(id: string, query = ''): string {
  const q = new URLSearchParams({ group: id });
  if (query) q.set('q', query);
  return `/notes?${q.toString()}`;
}

/** One tile: a link, the picture on a ground of the group's colour, the name centred under it. */
export function noteTile(entry: Pick<NoteEntry, 'name' | 'count'>, facts: NoteFacts, env: Pick<NotesTabEnv, 'esc' | 'titleCase' | 'base'>, small = false): string {
  const { esc } = env;
  return `<li class="nt-item"><a class="note-tile${small ? ' note-tile-sm' : ''}" href="/notes/${esc(noteSlug(entry.name))}" data-nav style="${ground(facts.group)}">
    <span class="note-tile-art"><img src="${esc(env.base + facts.icon)}" alt="" width="96" height="96" loading="lazy" decoding="async"${facts.groupIcon ? ' class="is-group"' : ''}></span>
    <span class="note-tile-name">${esc(env.titleCase(entry.name))}</span>
    ${small ? '' : `<span class="note-tile-count">${plural(entry.count, 'fragrance', 'fragrances')}</span>`}
  </a></li>`;
}

interface GroupRows {
  group: NoteGroupOut;
  notes: NoteEntry[];
}

/** The notes the tab lists, by group, in the reader's order: no prose, the layer applied. */
export function notesByGroup(data: NotesData, sorted: readonly NoteEntry[], layer: NoteLayerFilter, query: string): GroupRows[] {
  const rows = new Map<string, NoteEntry[]>(data.groups.map((g) => [g.id, []]));
  for (const e of sorted) {
    if (layer !== 'any' && !e.layers.has(layer)) continue;
    const facts = factsFor(data, e.name);
    if (facts.hidden) continue;
    if (query && !noteMatches(facts, query)) continue;
    rows.get(facts.group.id)!.push(e);
  }
  return data.groups.map((g) => ({ group: g, notes: rows.get(g.id)! }));
}

function jumpBar(rows: GroupRows[], state: NotesTabState, env: NotesTabEnv): string {
  const { esc } = env;
  const chips = rows
    .map(({ group, notes }) => {
      const empty = notes.length === 0;
      const here = state.group === group.id;
      // In the overview a chip scrolls to its group; in a group's own view it opens that group.
      const href = state.group ? groupHref(group.id, state.query) : `#g-${group.id}`;
      return `<li><a class="nt-chip${empty ? ' is-empty' : ''}" href="${esc(href)}" ${state.group ? 'data-nav' : `data-jump="${esc(group.id)}"`}${here ? ' aria-current="page"' : ''}${empty ? ' aria-disabled="true" tabindex="-1"' : ''}>${esc(group.name)} <span class="nt-chip-n">${n(notes.length)}</span></a></li>`;
    })
    .join('');
  return `<nav class="nt-jump" aria-label="Jump to a group"><ul>${chips}</ul></nav>`;
}

function groupSection(row: GroupRows, state: NotesTabState, data: NotesData, env: NotesTabEnv): string {
  const { esc } = env;
  const { group, notes } = row;
  const limit = tilesPerGroup(state.desktop);
  const shown = notes.slice(0, limit);
  const tiles = shown.map((e) => noteTile(e, factsFor(data, e.name), env)).join('');
  const what = state.query ? plural(notes.length, 'match', 'matches') : plural(notes.length, 'note', 'notes');
  const head = `<h2 id="gh-${esc(group.id)}" class="nt-title t-section"><img class="nt-title-ico" src="${esc(env.base + group.icon)}" alt="" width="32" height="32" loading="lazy" decoding="async">${esc(group.name)}</h2>
      <span class="nt-count t-count">${what}</span>`;
  const more =
    notes.length > limit
      ? `<p class="nt-all"><a href="${esc(groupHref(group.id, state.query))}" data-nav>See all ${n(notes.length)} ${esc(group.name)} ${state.query ? (notes.length === 1 ? 'match' : 'matches') : 'notes'}</a></p>`
      : '';
  const body = `<p class="nt-line t-body">${esc(group.description)}</p><ul class="nt-grid">${tiles}</ul>${more}`;
  // More Notes is shown last and closed (the plan); a search opens it.
  if (group.id === 'more' && !state.query) {
    return `<details class="nt-sec nt-more" id="g-${esc(group.id)}" data-group="${esc(group.id)}"><summary class="nt-head">${head}</summary>${body}</details>`;
  }
  return `<section class="nt-sec" id="g-${esc(group.id)}" data-group="${esc(group.id)}" aria-labelledby="gh-${esc(group.id)}"><div class="nt-head">${head}</div>${body}</section>`;
}

/** The part of the tab a search redraws: the chips, the groups and the count. */
export function notesResults(data: NotesData, state: NotesTabState, env: NotesTabEnv): { jump: string; body: string; status: string; total: number } {
  const rows = notesByGroup(data, env.sorted, state.layer, state.query);
  const total = rows.reduce((s, r) => s + r.notes.length, 0);
  const status = state.query ? (total === 0 ? `No notes match “${state.query}”` : `${plural(total, 'note matches', 'notes match')}`) : '';
  const jump = jumpBar(rows, state, env);
  let body: string;
  const one = state.group ? rows.find((r) => r.group.id === state.group) : undefined;
  if (one) {
    const { esc } = env;
    const worn = data.wornWith.get(one.group.id) ?? [];
    body = `<section class="nt-sec nt-sec-one" id="g-${esc(one.group.id)}" data-group="${esc(one.group.id)}">
        <p class="nt-line t-body">${esc(one.group.description)}</p>
        ${one.notes.length ? `<ul class="nt-grid">${env.chunked(one.notes, (e) => noteTile(e, factsFor(data, e.name), env))}</ul>` : `<p class="empty-note t-body">No ${esc(one.group.name)} notes match that.</p>`}
      </section>
      ${
        worn.length && !state.query
          ? `<section class="nt-worn" aria-labelledby="nt-worn-h"><h2 id="nt-worn-h" class="t-section">Often worn with ${esc(one.group.name)}</h2>
             <ul class="nt-worn-list">${worn.map((g) => `<li><a class="nt-chip" href="${esc(groupHref(g.id))}" data-nav>${esc(g.name)}</a></li>`).join('')}</ul></section>`
          : ''
      }`;
  } else {
    const visible = rows.filter((r) => r.notes.length > 0);
    body = visible.length
      ? visible.map((r) => groupSection(r, state, data, env)).join('')
      : `<p class="empty-note t-body">No notes match “${env.esc(state.query)}”.</p>`;
  }
  return { jump, body, status, total };
}

/** The whole tab. `data` is null until the lazy file arrives (`failed` when it could not be loaded). */
export function notesTabHtml(data: NotesData | null, failed: boolean, state: NotesTabState, env: NotesTabEnv): string {
  const { esc } = env;
  const group = data && state.group ? data.groups.find((g) => g.id === state.group) : undefined;
  const search = `<div class="nt-search">
      <label for="note-search" class="nt-search-label t-caption">Search notes</label>
      <input id="note-search" class="nt-search-input" type="search" value="${esc(state.query)}" placeholder="Bergamot, rose, oud…" autocomplete="off" spellcheck="false" enterkeyhint="search" aria-describedby="note-search-status">
    </div>`;
  const intro = `<p class="panel-note t-body">Groups are our own way of sorting the notes shops publish. ${n(env.withNotes)} of ${n(env.products)} products list them.</p>`;
  if (!data) {
    return `<div class="nt-wrap">
      <div class="page-head"><h1 class="t-page">Notes</h1></div>
      ${search}${env.controls}${intro}
      <p id="note-search-status" class="t-body" role="status">${failed ? 'The groups could not be loaded. Open Notes again to retry.' : 'Loading the groups…'}</p>
      ${failed ? `<ul class="nt-grid nt-plain">${env.chunked(env.sorted, (e) => `<li class="nt-item"><a class="note-tile note-tile-plain" href="/notes/${esc(noteSlug(e.name))}" data-nav><span class="note-tile-name">${esc(env.titleCase(e.name))}</span><span class="note-tile-count">${plural(e.count, 'fragrance', 'fragrances')}</span></a></li>`)}</ul>` : ''}
    </div>`;
  }
  const res = notesResults(data, state, env);
  const title = group
    ? `<nav class="crumbs t-caption" aria-label="Breadcrumb"><a href="/notes" data-nav>Notes</a><span aria-hidden="true"> / </span><span aria-current="page">${esc(group.name)}</span></nav>
       <div class="page-head"><h1 class="t-page nt-page-title"><img class="nt-title-ico" src="${esc(env.base + group.icon)}" alt="" width="40" height="40" decoding="async">${esc(group.name)} Notes</h1><span class="count t-count" data-nt-total>${n(res.total)}</span></div>`
    : `<div class="page-head"><h1 class="t-page">Notes</h1><span class="count t-count" data-nt-total>${n(res.total)}</span></div>`;
  return `<div class="nt-wrap">
    ${title}
    ${search}
    ${env.controls}
    ${group ? '' : intro}
    <div class="nt-jump-wrap" data-nt-jump>${res.jump}</div>
    <p id="note-search-status" class="sr" role="status" aria-live="polite">${esc(res.status)}</p>
    <div id="nt-results">${res.body}</div>
  </div>`;
}

/** The note page's head: breadcrumb, large picture, name, group, description and the layer chips. */
export function noteHeroHtml(
  name: string,
  facts: NoteFacts | null,
  count: number,
  layerChips: string,
  env: Pick<NotesTabEnv, 'esc' | 'titleCase' | 'base'>,
): string {
  const { esc } = env;
  const title = esc(env.titleCase(name));
  const groupLink = facts ? `<a class="nt-group-chip" href="${esc(groupHref(facts.group.id))}" data-nav><img src="${esc(env.base + facts.group.icon)}" alt="" width="20" height="20" decoding="async">${esc(facts.group.name)}</a>` : '';
  // A description only where one has been written and reviewed; otherwise the
  // group's own line, named as the group's (decision 8: never a filler).
  const line = facts
    ? facts.description
      ? `<p class="note-desc t-body">${esc(facts.description)}</p>`
      : `<p class="note-desc t-body"><span class="dimmer">${esc(facts.group.name)}:</span> ${esc(facts.group.description)}</p>`
    : '';
  const shown = facts ? facts.aliases.filter((a) => !facts.misspelt.has(a)) : [];
  const aka = shown.length ? `<p class="note-aka t-caption">Also published as ${shown.slice(0, 6).map(esc).join(', ')}${shown.length > 6 ? ' and others' : ''}.</p>` : '';
  return `<nav class="crumbs t-caption" aria-label="Breadcrumb"><a href="/notes" data-nav>Notes</a>${
    facts ? `<span aria-hidden="true"> / </span><a href="${esc(groupHref(facts.group.id))}" data-nav>${esc(facts.group.name)}</a>` : ''
  }</nav>
  <div class="note-hero">
    <div class="note-hero-art"${facts ? ` style="${ground(facts.group)}"` : ''}>${facts ? `<img src="${esc(env.base + facts.icon)}" alt="" width="200" height="200" decoding="async"${facts.groupIcon ? ' class="is-group"' : ''}>` : ''}</div>
    <div class="note-hero-text">
      <h1 class="t-page">${title}</h1>
      ${groupLink}
      ${line}
      <p class="note-in t-body">In ${plural(count, 'fragrance', 'fragrances')}</p>
      ${layerChips ? `<p class="note-chips note-chips-profile">${layerChips}</p>` : ''}
      ${aka}
    </div>
  </div>`;
}

/** "Often found with": up to 8 small tiles of the notes that share the most pyramids with this one. */
export function relatedNotesHtml(facts: NoteFacts | null, data: NotesData | null, counts: Map<string, number>, env: Pick<NotesTabEnv, 'esc' | 'titleCase' | 'base'>): string {
  if (!facts || !data || facts.related.length === 0) return '';
  const tiles = facts.related
    .filter((r) => counts.has(r))
    .map((r) => noteTile({ name: r, count: counts.get(r)! }, factsFor(data, r), env, true))
    .join('');
  return tiles ? `<section class="note-related" aria-labelledby="note-related-h"><h2 id="note-related-h" class="t-section">Often found with</h2><ul class="nt-grid nt-grid-sm">${tiles}</ul></section>` : '';
}

/** Where a note sits in one fragrance's pyramid: "Top", "Heart · Base". */
export function tierLabel(notes: { top: readonly string[]; middle: readonly string[]; base: readonly string[] } | null, note: string): string {
  if (!notes) return '';
  const needle = note.toLowerCase();
  return (['top', 'middle', 'base'] as NoteLayer[])
    .filter((l) => notes[l].some((x) => x.toLowerCase() === needle))
    .map((l) => LAYER_LABEL[l])
    .join(' · ');
}
