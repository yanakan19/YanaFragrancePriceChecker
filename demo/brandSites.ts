/**
 * Verified official brand websites, keyed by brand name.
 *
 * Populated one brand at a time as each site is actually looked up and
 * confirmed as the brand's own homepage — never guessed from a plausible
 * domain pattern. A brand with no entry here simply has no website line on
 * its profile page, the same "absent rather than invented" rule the rest of
 * this registry runs on (see the `blurb` field on Retailer for the same
 * discipline applied to retailers).
 *
 * The catalogue currently spans around 140 distinct brand strings raw from
 * retailer feeds (some of which are casing/punctuation duplicates of each
 * other, e.g. "Dolce & Gabbana" vs "DOLCE&GABBANA" — a normalisation gap
 * that predates this file and is tracked separately). This list is only the
 * highest-volume brands so far, not a finished set.
 */
export const BRAND_SITES: Record<string, string> = {
  'calvin klein': 'https://www.calvinklein.co.uk/',
  'dolce gabbana': 'https://www.dolcegabbana.com/en-gb/beauty/',
  'paco rabanne': 'https://www.rabanne.com/',
  rabanne: 'https://www.rabanne.com/',
  'carolina herrera': 'https://www.carolinaherrera.com/',
  'jean paul gaultier': 'https://www.jeanpaulgaultier.com/uk/en/',
};

/** Lowercase, strip everything but letters — so "Dolce & Gabbana", "Dolce&Gabbana"
 *  and "DOLCE&GABBANA" all resolve to the same lookup key regardless of which
 *  casing/punctuation variant a given retailer feed happened to use. */
function normalizeBrand(brand: string): string {
  return brand
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** The brand's own official site, if we have verified one — never invented. */
export function officialSiteFor(brand: string): string | null {
  return BRAND_SITES[normalizeBrand(brand)] ?? null;
}
