import { officialSiteFor, type BrandSite } from './brandSites.js';

/**
 * What the fragrance detail page's "Official Site" + "Fragrantica" links
 * need, decided independently of markup so it can be unit tested directly —
 * app.ts pulls in the whole DOM-touching harness at import time (it calls
 * `init()` at the bottom of the file the moment it loads), so nothing in it
 * can be imported from a plain Node test, the same reason demo/volumeBands.ts,
 * demo/listSort.ts and demo/trustpilotWidget.ts already live in their own
 * modules.
 *
 * ── Official Site: the brand's homepage, not a per-fragrance page ──────────
 * The owner's original ask was for a link to the fragrance's own page on the
 * brand's site where possible. That isn't available: `BRAND_SITES` in
 * brandSites.ts only ever records one URL per house — its homepage, found
 * and verified by hand — and nothing in the harvested catalogue
 * (demo/catalogue.generated.ts) carries a brand-owned product-page URL for
 * any individual fragrance. Concatenating a guessed slug onto the brand's
 * domain to fabricate one would be exactly the "invented link" this project
 * forbids (see officialSiteFor's own doc comment: "never guessed from a
 * plausible domain pattern"). So this reuses `officialSiteFor` directly, the
 * same lookup and the same URL brandView() already renders on the brand's
 * own directory page — this feature is exactly as good as what already
 * exists there, no better and no worse. Null when officialSiteFor has no
 * entry, same absent-rather-than-guessed rule as everywhere else that lookup
 * is used.
 *
 * ── Fragrantica: a search link, not a guessed product page ─────────────────
 * A specific Fragrantica product page follows
 * `/perfume/{Brand-Slug}/{Name-Slug}-{id}.html`, but the numeric id is only
 * knowable by visiting Fragrantica — which docs/SCRAPING.md and this
 * project's standing rules forbid (Fragrantica's ToS prohibits automated
 * access; WebFetch to fragrantica.com is EGRESS_BLOCKED from this sandbox
 * regardless). Nothing else in this repo captures a Fragrantica URL for any
 * product either (checked: no affiliate feed field, no "as seen on"
 * reference anywhere in demo/ or src/). A constructed *search* URL needs no
 * id — it's Fragrantica's own general search entry point, working for any
 * query whether or not that exact concentration/size has its own page — so
 * it's the honest version of this link rather than a URL that might 404 or
 * land on the wrong perfume. Always present: unlike the official-site link,
 * a search never depends on a lookup table having an entry.
 */
export interface FragranceLinks {
  officialSite: BrandSite | null;
  fragranticaSearchUrl: string;
}

export function fragranceLinksFor(brand: string, name: string): FragranceLinks {
  return {
    officialSite: officialSiteFor(brand),
    fragranticaSearchUrl: `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${brand} ${name}`)}`,
  };
}
