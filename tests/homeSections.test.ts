/**
 * The four home pages (/, /us/, /in/, /ca/) share one structure (owner
 * request, 23 Oct 2026): the same sections in the same order, the same
 * headings, the same shape of tile row, drawn by the same code. The UK is the
 * reference. Each country's built bundle draws its own home view here
 * (scripts/firstScreen.ts homeViewHtml), so a section one country lacks, a
 * heading only one has, or a row of a different shape fails.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { homeViewHtml } from '../scripts/firstScreen.js';
import { liveRegions } from '../src/config/regions.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist-demo');
const sites = liveRegions().map((r) => ({ id: r.id, dist: r.pathPrefix ? resolve(dist, r.pathPrefix) : dist, path: r.pathPrefix ? `/${r.pathPrefix}/` : '/' }));
const built = sites.every((s) => existsSync(resolve(s.dist, 'bundle.js')));

/** The outline of a home view: each section's classes, its headings, and how many tiles each row holds. */
function outline(html: string): string[] {
  const out: string[] = [];
  const re = /<(section|div|h1|h2|ul|ol)\b[^>]*class="([^"]*)"[^>]*>|<h2\b[^>]*>([^<]*)<\/h2>/g;
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(re)) {
    if (m[3] !== undefined) {
      out.push(`h2 ${m[3].trim()}`);
      continue;
    }
    const classes = m[2]!.split(/\s+/).filter((c) => /^(intro|hero-|marquee$|pop-|home-|bottom-split|updates-|guides-|section-head)/.test(c));
    if (classes.length > 0) out.push(`${m[1]} ${classes.join(' ')}`);
  }
  // The headings' own words: the same everywhere (localWords changes none of them).
  for (const m of html.matchAll(/<h2 class="t-section"[^>]*>([^<]*)<\/h2>/g)) out.push(`heading ${m[1]!.trim()}`);
  for (const m of html.matchAll(/<ul class="pop-rail">([\s\S]*?)<\/ul>\s*<\/section>/g)) out.push(`row of ${(m[1]!.match(/class="pop-item"/g) ?? []).length}`);
  return out;
}

describe.skipIf(!built)('the four home pages', () => {
  const views = new Map(sites.map((s) => [s.id, homeViewHtml(s.dist, s.path)]));
  const reference = outline(views.get('GB')!);

  it('the UK home has the sections every country must have', () => {
    for (const want of ['heading Most Stocked', 'heading Most Popular', 'heading Update History']) expect(reference).toContain(want);
  });

  for (const s of sites.filter((x) => x.id !== 'GB')) {
    it(`${s.path} has the UK's sections, headings and rows, in the UK's order`, () => {
      expect(outline(views.get(s.id)!)).toEqual(reference);
    });
  }
});
