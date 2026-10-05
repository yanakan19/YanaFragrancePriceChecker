import { officialSiteFor, type BrandSite } from './brandSites.js';
import { FRAGRANCE_LINKS } from './fragranceLinks.generated.js';
import { marketOf } from '../src/catalogue/brandSiteCheck.js';
import { lookupLinks, type CompactTable } from '../src/catalogue/fragranceLinkStore.js';

/**
 * What the fragrance detail page's "Official Site" + "Fragrantica" links
 * need, decided independently of markup so it can be unit tested directly —
 * app.ts pulls in the whole DOM-touching harness at import time (it calls
 * `init()` at the bottom of the file the moment it loads), so nothing in it
 * can be imported from a plain Node test, the same reason demo/volumeBands.ts,
 * demo/listSort.ts and demo/trustpilotWidget.ts already live in their own
 * modules.
 *
 * ── Each link goes to the perfume's own page where one has been checked ─────
 * `FRAGRANCE_LINKS` (demo/fragranceLinks.generated.ts, written from
 * data/fragrance-links.json by scripts/resolve-fragrance-links.ts) holds, for
 * each perfume it covers, its page on Fragrantica and its page on the brand's
 * own website. A stored URL has been matched to the perfume by name, and by
 * concentration where the page is concentration-specific, and sits on the
 * brand's own domain (official) or on fragrantica.com/perfume/ (Fragrantica) —
 * the rules are in src/catalogue/fragranceLinkMatch.ts. Nothing in this module
 * ever builds one of those URLs from a name: a guessed slug is exactly the
 * "invented link" this project forbids, and Fragrantica's numeric id cannot be
 * guessed at all.
 *
 * ── Where nothing is stored, the link falls back to what it always was ──────
 * Official Site: the brand's homepage via `officialSiteFor` (the same lookup
 * and URL brandView() renders on the brand's own directory page); null where
 * that has no entry, and the link is then not rendered.
 *
 * Fragrantica: a search link, which needs no id and works for any query. It
 * is Fragrantica's own general search entry point, so unlike a constructed
 * product page it cannot 404 or land on the wrong perfume. Always present.
 *
 * `officialDirect` and `fragranticaDirect` say which of the two cases a link
 * is, for tests and for any future copy that wants to say "Fragrantica page"
 * rather than "Fragrantica search".
 */
export interface FragranceLinks {
  officialSite: BrandSite | null;
  /** True when `officialSite` is the perfume's own page rather than the brand homepage. */
  officialDirect: boolean;
  /** The perfume's Fragrantica page, or, where none is stored, `fragranticaSearchUrl`. */
  fragranticaUrl: string;
  fragranticaDirect: boolean;
  /** Always the search link, kept for callers that want it regardless. */
  fragranticaSearchUrl: string;
}

export function fragranceLinksFor(
  brand: string,
  name: string,
  concentration = '',
  table: CompactTable = FRAGRANCE_LINKS,
): FragranceLinks {
  const fragranticaSearchUrl = `https://www.fragrantica.com/search/?query=${encodeURIComponent(`${brand} ${name}`)}`;
  const direct = lookupLinks(table, brand, name, concentration);

  const home = officialSiteFor(brand);
  const officialSite: BrandSite | null = direct.official
    ? { url: direct.official, uk: ukMarket(direct.official) }
    : home;

  return {
    officialSite,
    officialDirect: direct.official !== null,
    fragranticaUrl: direct.fragrantica ?? fragranticaSearchUrl,
    fragranticaDirect: direct.fragrantica !== null,
    fragranticaSearchUrl,
  };
}

// The same rule officialSiteFor applies to a homepage (see its own doc comment).
function ukMarket(url: string): boolean {
  const m = marketOf(url);
  return m === 'uk' || m === 'gb';
}

/**
 * What the Fragrantica pill says. "Fragrantica" only where the link opens the
 * perfume's own page; a search link says "Search Fragrantica", because a pill
 * must not claim a page it does not open (owner request, 2026-10-05).
 */
export function fragranticaLabel(links: Pick<FragranceLinks, 'fragranticaDirect'>): string {
  return links.fragranticaDirect ? 'Fragrantica' : 'Search Fragrantica';
}
