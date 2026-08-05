/**
 * Fragrance houses we source directly from the house's own storefront.
 *
 * ── Why these are not in RETAILERS ───────────────────────────────────────────
 * `src/config/retailers.ts` models UK shops: sterling prices, UK delivery
 * thresholds, UK affiliate programmes. A house selling from Dubai or Sharjah
 * has none of those, and forcing one into that shape would mean inventing a
 * shipping rule and a currency. They are a different kind of source and get
 * their own registry.
 *
 * ── Why direct at all ────────────────────────────────────────────────────────
 * The Middle Eastern segment barely appears in the UK retailers this project
 * walks — the registry has a `mideast` tier precisely because that gap was
 * already known. The houses themselves publish their full range. Going to the
 * source is both better coverage and fewer hops.
 *
 * ── The honesty rules that apply here ────────────────────────────────────────
 * Every field below is either verified or explicitly marked unverified. In
 * particular:
 *
 *   - `origin` is the house's storefront as published by the house. Where that
 *     has not actually been confirmed the entry says so via `confidence`, and
 *     nothing downstream may present its prices as fact until it has been.
 *   - `currency` is never assumed. It is resolved at harvest time from the
 *     storefront itself (see `parseShopCurrency`), and a non-sterling price is
 *     recorded as such rather than converted.
 *   - No house below is claimed to be on Shopify. `route` records what we will
 *     *try*, in order; what actually worked is written back to the harvest
 *     report from a real run, not asserted here.
 *
 * These were named as the priority set. They are the starting point, not a
 * finished list.
 *
 * ── On research done without opening the storefront ──────────────────────────
 * The entries added 2026-08-05 (Assaf onward) come from this session's own web
 * search, not a page actually opened — this environment's network is blocked
 * at the gateway for arbitrary hosts (confirmed: even a plain fetch to
 * example.com is rejected by the proxy), the same condition the note above
 * already describes for the original five. A search result that quotes a
 * house's own page text is a stronger source than a guessed domain, but it is
 * still not the page itself, so every `origin` below stays `unverified` until
 * a run with real egress — the daily harvest, not this session — opens it.
 *
 * French Avenue and Armaf used to be here. Both were promoted to
 * `retailers.ts` instead once their own UK-specific storefronts
 * (uk.shopfrenchavenue.com, armaf.uk) turned up — a domain that pins UK and
 * sterling is what this registry exists to distinguish from the global
 * storefronts still listed below, and a house that clears that bar belongs in
 * the retailer registry's comparison, not this catalogue-only one.
 */

/** How we will attempt to read a house's catalogue, cheapest first. */
export type HouseRoute =
  /**
   * Shopify's public `/products.json`. No key, no browser, structured, and it
   * carries product photography. Tried first wherever it might apply.
   */
  | 'shopify-products-json'
  /** The sitemap walk plus JSON-LD that the UK retailers already use. */
  | 'sitemap-jsonld';

export interface House {
  /** Stable internal key. */
  id: string;
  /** The house's name as it brands itself. */
  name: string;
  /**
   * Storefront origin, no trailing slash.
   *
   * `confidence: 'unverified'` means this domain has not been opened and
   * confirmed as the house's own storefront from this environment — the
   * sandbox this was written in has these domains blocked at the network
   * gateway, so none of them could be checked here. A run on a machine with
   * open egress is what promotes an entry to `confirmed`.
   */
  origin: string;
  confidence: 'confirmed' | 'unverified';
  /** Retrieval routes to try, in order. */
  routes: HouseRoute[];
  /** Whether the harvester attempts this house at all. */
  enabled: boolean;
  /**
   * What is still missing before this house's prices could be shown to a UK
   * buyer as a real offer. Non-empty means the listings are catalogue-only:
   * we know the product exists and what it looks like, not what it costs here.
   */
  blockers: string[];
}

export const HOUSES: readonly House[] = [
  {
    id: 'rasasi',
    name: 'Rasasi',
    origin: 'https://www.rasasi.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'afnan',
    name: 'Afnan Perfumes',
    origin: 'https://www.afnanperfumes.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'al-attaar',
    name: 'Al Attaar',
    origin: 'https://www.alttaffa.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'domain supplied as "alttaffa"; the house also trades as Al Attaar and Lattafa, which are different businesses — confirm which storefront this is before trusting its listings',
    ],
  },
  {
    id: 'pairfum-london',
    name: 'Pairfum London',
    origin: 'https://www.pairfum.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'single-brand seller (InovAir Ltd, trading as Pairfum London), so this is a house rather than a retailers.ts entry despite already being UK-based and GBP-priced — no other shop stocks this brand to compare against',
      'delivery threshold conflicts across sources (£50 free-over in one, £120 in another) — read pairfum.com directly before quoting either figure anywhere',
    ],
  },
  {
    id: 'assaf',
    name: 'Assaf',
    origin: 'https://assaf.ae',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'Assaf Trading LLC, UAE. A second domain (3saf.com) also brands itself Assaf — not confirmed as the same storefront before trusting its listings',
    ],
  },
  {
    id: 'gulf-orchid',
    name: 'Gulf Orchid',
    origin: 'https://shop-gulforchid.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'Dubai-based manufacturer, trading since 1987. Sister brand to Maison Asrar (below) — the two share a manufacturer, not a storefront, so each still needs its own harvest',
    ],
  },
  {
    id: 'maison-asrar',
    name: 'Maison Asrar',
    origin: 'https://maisonasrar.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      "manufactured by Gulf Orchid (above), branded and sold separately",
    ],
  },
  {
    id: 'ahmed-al-maghribi',
    name: 'Ahmed Al Maghribi',
    origin: 'https://ae.ahmedalmaghribi.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'the UAE storefront (ae.) is what this points at; the brand also runs separate om./us. regional subdomains and no UK one was found — worth checking for a uk. subdomain before assuming there is none',
    ],
  },
  {
    id: 'lattafa',
    name: 'Lattafa Perfumes',
    origin: 'https://lattafa.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'lattafa.com reads as a catalogue/informational site in search results rather than a confirmed working checkout — worth confirming it actually sells direct before spending harvest budget on it',
      'already the best-represented Middle Eastern house in this catalogue indirectly, stocked by several enabled UK retailers (Beauty Base among them) — this entry is for completeness, not a coverage gap',
    ],
  },
  {
    id: 'surrati',
    name: 'Surrati Perfumes',
    origin: 'https://surrati.ae',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'founded 1929 in Makkah. Search also surfaced surratiperfumes.com and surrati.com.pk as separate storefronts — not confirmed whether these are the same business or independent distributors before trusting any of them interchangeably',
    ],
  },
  {
    id: 'rayhaan',
    name: 'Rayhaan Perfumes',
    origin: 'https://rayhaanperfumes.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'requested as "Rahyaan" — this is the Dubai-based house trading as Rayhaan Perfumes, founded 2020; flagging the spelling in case a differently spelled brand was actually intended',
    ],
  },
  {
    id: 'paris-corner',
    name: 'Paris Corner',
    origin: 'https://pariscorner.ae',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'their own site states delivery is offered exclusively within the UAE — a UK buyer very likely cannot check out here at all, so this entry may end up catalogue-only permanently rather than pending',
    ],
  },
  {
    id: 'arabiyat-prestige',
    name: 'Arabiyat Prestige',
    origin: 'https://arabiyatprestige.shop',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'a separate arabiyatprestigeus.com exists for the US market; no UK-specific storefront was found',
    ],
  },
  {
    id: 'mykonos',
    name: 'Mykonos',
    origin: 'https://officialmykonos.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'a young brand (first edition 2025) sold into the Arabic fragrance market but based in Indonesia — worth confirming this is the brand meant before trusting its listings, since "Mykonos" is otherwise just the Greek island',
    ],
  },
  {
    id: 'bujairami',
    name: 'Bujairami',
    origin: 'https://bujairami.ae',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'an Australian-founded house (bujairami.com.au, AUD) with a separate Dubai storefront (bujairami.ae) pointed at here as the more plausible source for GCC-market pricing — not confirmed which, if either, reaches UK buyers',
    ],
  },
];

export function houseById(id: string): House | null {
  return HOUSES.find((h) => h.id === id) ?? null;
}
