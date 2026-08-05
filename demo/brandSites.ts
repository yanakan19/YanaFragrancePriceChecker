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

  // ── Middle Eastern / Arabic houses, resolved 2026-08-05 ──────────────────
  // This session's own network is locked at the gateway (confirmed: even a
  // plain fetch to example.com is rejected by the proxy), so none of these
  // were opened directly the way the rest of this file's entries were. Each
  // one comes from a web search that returned the domain from the house's
  // own site content (a shipping page, an About page, a contact address) —
  // stronger than a guessed pattern, weaker than actually opening the page.
  // Treat these as the starting point for the next confirmation pass, not
  // page-verified facts.
  'french avenue': 'https://uk.shopfrenchavenue.com/',
  armaf: 'https://armaf.uk/',
  'al haramain': 'https://alharamainperfumes.co.uk/',
  riiffs: 'https://uk.riiffsperfumes.com/',
  // Bellavita Luxury (bellavitaluxury.uk) — the UK "luxury-inspired
  // fragrance dupes" business. Not to be confused with Bella Vita Organic
  // (bellavitaorganic.com), an unrelated Indian skincare brand that also
  // trades as "Bellavita" — if that second business ever enters the
  // catalogue under the same normalised key, this entry would wrongly send
  // its customers to the fragrance site instead.
  bellavita: 'https://bellavitaluxury.uk/',
  ibraq: 'https://ibraquk.com/',
  assaf: 'https://assaf.ae/',
  'gulf orchid': 'https://shop-gulforchid.com/',
  'maison asrar': 'https://maisonasrar.com/',
  'ahmed al maghribi': 'https://ae.ahmedalmaghribi.com/en',
  lattafa: 'https://lattafa.com/',
  surrati: 'https://surrati.ae/',
  rayhaan: 'https://rayhaanperfumes.com/',
  'paris corner': 'https://pariscorner.ae/',
  'arabiyat prestige': 'https://arabiyatprestige.shop/',
  mykonos: 'https://officialmykonos.com/',
  bujairami: 'https://bujairami.ae/',
  // Sub-brand of Afnan Perfumes (same founder, Imran Fazlani), launched 2023,
  // with its own UK subdomain — hence a retailers.ts entry rather than a house.
  zimaya: 'https://uk.zimayaperfumes.com/',
  // Elysia has no entry: search turned up only individual perfume names
  // ("Elysia Vanilla", "Elysia Elegance") sold under Fragrance World, not a
  // standalone Elysia storefront — there is no site to link to yet.
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
