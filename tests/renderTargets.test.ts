import { describe, expect, it } from 'vitest';
import { renderTargets, MAX_RENDER_PAGES_PER_SECTION } from '../src/catalogue/renderTargets.js';
import type { CatalogueConfig } from '../src/types/retailer.js';

/**
 * renderTargets() is the mechanism behind `CatalogueSection.renderPages`: the
 * render tier used to fetch exactly one page per section, and Notino UK's
 * registry entry is the measured case for why one section sometimes needs
 * its next pages instead — see src/catalogue/renderTargets.ts's own header.
 * Every case below is a clause of that contract.
 */
function catalogue(sections: CatalogueConfig['sections'], firstPage = 1): CatalogueConfig {
  return {
    searchUrlTemplate: 'https://shop.example/search?q={q}',
    sections,
    firstPage,
    maxPages: 10,
    minRequestGapMs: 1000,
  };
}

describe('renderTargets', () => {
  it('renders one page per section when no section asks for more — the prior behaviour, exactly', () => {
    const targets = renderTargets(
      catalogue([
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://shop.example/fragrance?page={page}', tier: 'designer' },
        { id: 'niche', label: 'Niche', urlTemplate: 'https://shop.example/niche?page={page}', tier: 'niche' },
      ]),
    );
    expect(targets).toEqual([
      { id: 'fragrance', sectionId: 'fragrance', page: 1, url: 'https://shop.example/fragrance?page=1' },
      { id: 'niche', sectionId: 'niche', page: 1, url: 'https://shop.example/niche?page=1' },
    ]);
  });

  it('expands a section that asks for more pages, from firstPage upward, with an id per page', () => {
    const targets = renderTargets(
      catalogue([
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://shop.example/fragrance/?f={page}-1-55544', tier: 'designer', renderPages: 4 },
      ]),
    );
    expect(targets.map((t) => t.url)).toEqual([
      'https://shop.example/fragrance/?f=1-1-55544',
      'https://shop.example/fragrance/?f=2-1-55544',
      'https://shop.example/fragrance/?f=3-1-55544',
      'https://shop.example/fragrance/?f=4-1-55544',
    ]);
    // The first page keeps the section's own id, so a shop that never sets
    // renderPages sees no change to its listings' sectionId or its capture
    // file names; the pages after it get one each, so two pages of one
    // section can never overwrite each other on disk.
    expect(targets.map((t) => t.id)).toEqual(['fragrance', 'fragrance-p2', 'fragrance-p3', 'fragrance-p4']);
    expect(new Set(targets.map((t) => t.id)).size).toBe(4);
    expect(targets.every((t) => t.sectionId === 'fragrance')).toBe(true);
  });

  it('counts from the catalogue\'s own firstPage, not from 1', () => {
    const targets = renderTargets(
      catalogue(
        [{ id: 'all', label: 'All', urlTemplate: 'https://shop.example/all?p={page}', tier: 'designer', renderPages: 2 }],
        0,
      ),
    );
    expect(targets.map((t) => [t.page, t.url, t.id])).toEqual([
      [0, 'https://shop.example/all?p=0', 'all'],
      [1, 'https://shop.example/all?p=1', 'all-p1'],
    ]);
  });

  it('renders a template with no {page} in it exactly once, whatever renderPages says', () => {
    // Rendering the same address four times is four pages of the shared
    // budget for one answer.
    const targets = renderTargets(
      catalogue([
        { id: 'fixed', label: 'Fixed', urlTemplate: 'https://shop.example/fragrance', tier: 'designer', renderPages: 4 },
      ]),
    );
    expect(targets).toEqual([{ id: 'fixed', sectionId: 'fixed', page: 1, url: 'https://shop.example/fragrance' }]);
  });

  it('caps one section at MAX_RENDER_PAGES_PER_SECTION rather than letting it take the whole shared budget', () => {
    const targets = renderTargets(
      catalogue([
        { id: 'all', label: 'All', urlTemplate: 'https://shop.example/all?page={page}', tier: 'designer', renderPages: 50 },
      ]),
    );
    expect(targets).toHaveLength(MAX_RENDER_PAGES_PER_SECTION);
    expect(targets.at(-1)!.page).toBe(MAX_RENDER_PAGES_PER_SECTION);
  });

  it('treats zero, negative and non-numeric renderPages as one', () => {
    for (const renderPages of [0, -3, Number.NaN, 0.4]) {
      const targets = renderTargets(
        catalogue([
          { id: 'all', label: 'All', urlTemplate: 'https://shop.example/all?page={page}', tier: 'designer', renderPages },
        ]),
      );
      expect(targets, `renderPages: ${renderPages}`).toHaveLength(1);
    }
  });
});
