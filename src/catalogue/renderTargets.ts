import type { CatalogueConfig } from '../types/retailer.js';

/**
 * Which pages the render tier asks for, for one shop.
 *
 * ── Why this is a module and not four lines in the harvest ─────────────────
 * scripts/catalogue-harvest.ts used to build its render list inline: every
 * configured section, its `{page}` replaced with `firstPage`, one page each.
 * That is the right default — the render tier is bounded (12 pages a run,
 * shared by every shop that reaches it; see localBrowser.ts) and a section's
 * first page is the cheapest place to find out whether a shop renders at all.
 *
 * It is the wrong ceiling for one measured shape. Notino UK's three
 * subsection URLs come back a Cloudflare managed challenge on every render
 * (data/harvest-report.json, every run from 2026-08-27 to 2026-09-09: HTTP
 * 403 at ~28.8KB, three of three, run after run) while its catch-all
 * /fragrance/ section renders 27-28 priced products a page and links its own
 * next page. Four render pages a run were spent to get one page of products.
 * `CatalogueSection.renderPages` lets that one section ask for its next
 * pages instead, and this module is where that number turns into URLs — a
 * pure function, so the expansion is tested without a browser.
 *
 * ── What it deliberately does not do ────────────────────────────────────────
 * It does not paginate a template that cannot: a `urlTemplate` with no
 * `{page}` in it is one URL however many pages are asked for, because
 * rendering the same address four times is four pages of budget for one
 * answer. And it does not let one shop ask for the whole shared budget —
 * MAX_RENDER_PAGES_PER_SECTION caps a section, on the arithmetic below.
 */

/**
 * The most pages one section may ask the render tier for.
 *
 * The run-wide budget is MAX_LOCAL_RENDER_PAGES_PER_RUN (12) and the per-shop
 * time slice MAX_LOCAL_RENDER_MS_PER_SHOP (120s), both in localBrowser.ts.
 * Notino's pages are measured at ~13s each through that tier (51s for four,
 * scripts/catalogue-harvest.ts dry run 2026-09-10), so six pages is ~80s of a
 * 120s slice and half of the shared page pool — the most any one shop should
 * take while Selfridges and Harvey Nichols still draw from the same twelve.
 * A registry value above this is clamped, never an error: an over-generous
 * number must cost a shop nothing worse than the pages it can have.
 */
export const MAX_RENDER_PAGES_PER_SECTION = 6;

export interface RenderTarget {
  /**
   * Stable per-page id: the section's own id for its first page, and
   * `<section>-p<N>` for page N after it. Used as the listing's `sectionId`
   * and as the file name a render capture is saved under
   * (src/catalogue/renderCapture.ts), so two pages of one section can never
   * overwrite each other on disk.
   */
  id: string;
  /** The section this page belongs to. */
  sectionId: string;
  page: number;
  url: string;
}

/** Expand a shop's sections into the pages its render escalation fetches. */
export function renderTargets(catalogue: CatalogueConfig): RenderTarget[] {
  const targets: RenderTarget[] = [];
  for (const section of catalogue.sections) {
    const paginates = section.urlTemplate.includes('{page}');
    const asked = Number.isFinite(section.renderPages) ? Math.floor(section.renderPages!) : 1;
    const pages = paginates ? Math.min(Math.max(asked, 1), MAX_RENDER_PAGES_PER_SECTION) : 1;
    for (let n = 0; n < pages; n++) {
      const page = catalogue.firstPage + n;
      targets.push({
        id: n === 0 ? section.id : `${section.id}-p${page}`,
        sectionId: section.id,
        page,
        url: section.urlTemplate.replace('{page}', String(page)),
      });
    }
  }
  return targets;
}
