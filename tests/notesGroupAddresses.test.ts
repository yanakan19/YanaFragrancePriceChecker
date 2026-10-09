/**
 * The 16 note group pages (/notes/group/<id>, docs/NOTES-PAGE-PLAN.md D): the
 * router knows them, the UK sitemap lists each once with its own canonical, a
 * route page answers each with HTTP 200, and the beta regions (no notes) list none.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTE_GROUP_IDS } from '../src/catalogue/noteGroups.js';
import { headFor, SITE_URL } from '../demo/head.js';
import { matchRoute, routeToPath } from '../demo/router.js';
import { regionHasFixedPage, liveRegions } from '../src/config/regions.js';
import { sitemapPaths } from '../scripts/routePages.js';

const demo = resolve(dirname(fileURLToPath(import.meta.url)), '../demo');
const gb = existsSync(resolve(demo, 'sitemap-gb.xml')) ? readFileSync(resolve(demo, 'sitemap-gb.xml'), 'utf8') : null;

describe('router', () => {
  it('reads /notes/group/<id> as a group page and writes it back', () => {
    for (const id of NOTE_GROUP_IDS) {
      expect(matchRoute(`/notes/group/${id}`)).toMatchObject({ name: 'notesGroup', param: id });
      expect(routeToPath(matchRoute(`/notes/group/${id}`))).toBe(`/notes/group/${id}`);
    }
    expect(matchRoute('/notes/group/Citrus').param).toBe('citrus');
  });

  it('keeps note pages as they were, and a miss under group is not found', () => {
    expect(matchRoute('/notes/vanilla')).toMatchObject({ name: 'note', param: 'vanilla' });
    expect(matchRoute('/notes/group')).toMatchObject({ name: 'note', param: 'group' });
    expect(matchRoute('/notes/group/a/b').name).toBe('notFound');
    expect(matchRoute('/notes/group/1').name).toBe('notFound');
  });

  it('keeps the old /notes?group=citrus a Notes page', () => {
    expect(matchRoute('/notes', '?group=citrus').name).toBe('notes');
  });
});

describe('head tags', () => {
  it('gives each group its own canonical, and keeps an unknown one out of search', () => {
    const tags = headFor({ route: matchRoute('/notes/group/citrus'), leafName: 'Citrus' });
    expect(tags.canonical).toBe(`${SITE_URL}/notes/group/citrus`);
    expect(tags.title).toBe('PriceSniffs: Citrus notes in perfume');
    expect(tags.noindex).toBe(false);
    expect(headFor({ route: matchRoute('/notes/group/zzz'), leafEmpty: true }).noindex).toBe(true);
  });
});

describe('UK sitemap (run npm run demo first)', () => {
  const paths = gb ? sitemapPaths(gb) : [];
  it('lists all 16 group addresses once each', () => {
    expect(gb, 'demo/sitemap-gb.xml is not built: run npm run demo').not.toBeNull();
    const groups = paths.filter((p) => p.startsWith('/notes/group/'));
    expect(groups.sort()).toEqual(NOTE_GROUP_IDS.map((id) => `/notes/group/${id}`).sort());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has a route page for each, carrying its own canonical', () => {
    for (const id of NOTE_GROUP_IDS) {
      const file = resolve(demo, `notes/group/${id}.html`);
      expect(existsSync(file), `${id}.html`).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain(`<link rel="canonical" href="${SITE_URL}/notes/group/${id}" />`);
    }
  });
});

describe('beta regions', () => {
  it('have no group pages while their shops publish no notes', () => {
    for (const r of liveRegions().filter((x) => x.beta)) {
      for (const id of NOTE_GROUP_IDS) expect(regionHasFixedPage(r, `/notes/group/${id}`)).toBe(false);
    }
  });
});
