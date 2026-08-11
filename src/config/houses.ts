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
    // 'Afnan', not this house's own 'Afnan Perfumes' — see the 'reef' entry
    // below for why, and src/catalogue/brandName.ts for the call.
    name: 'Afnan',
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
    // 'Lattafa', not this house's own 'Lattafa Perfumes' — see the 'reef'
    // entry below for why, and src/catalogue/brandName.ts for the call.
    name: 'Lattafa',
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
    // 'Surrati', not this house's own 'Surrati Perfumes' — see the 'reef'
    // entry below for why, and src/catalogue/brandName.ts for the call.
    name: 'Surrati',
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
    // 'Rayhaan', not this house's own 'Rayhaan Perfumes' — see the 'reef'
    // entry below for why, and src/catalogue/brandName.ts for the call.
    name: 'Rayhaan',
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
    // 'Arabiyat', not this house's own 'Arabiyat Prestige' — see the 'reef'
    // entry below for why, and src/catalogue/brandName.ts for the call.
    name: 'Arabiyat',
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
  {
    id: 'maison-alhambra',
    name: 'Maison Alhambra',
    origin: 'https://maisonalhambra.co',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'a Lattafa Perfumes Industries brand, so it shares a manufacturer with the Lattafa entry above but is sold separately',
      'several near-identical domains exist (themaison-alhambra.com, maisonalhambraperfume.com, maisonalhambras.com) — only maisonalhambra.co presents itself as the official one, confirm before trusting listings from any other',
    ],
  },
  {
    id: 'swiss-arabian',
    name: 'Swiss Arabian',
    origin: 'https://swissarabian.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      "the brand names arabianperfumes.uk as its sole UK distributor; that is a shop rather than the house, so if its prices are wanted it belongs in retailers.ts, not here",
    ],
  },
  {
    id: 'fragrance-world',
    name: 'Fragrance World',
    origin: 'https://fragranceworld.ae',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'parent of French Avenue, which is already a retailers.ts entry on its own UK subdomain — expect overlapping products between the two',
    ],
  },
  {
    id: 'ajmal',
    name: 'Ajmal',
    origin: 'https://www.ajmal.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established'],
  },
  {
    id: 'dumont',
    name: 'Dumont Paris',
    origin: 'https://dumontparfums.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'dumontparis.com is the brand site and dumontparfums.com the shop; this points at the shop because that is what carries prices, but the relationship between the two was not confirmed',
    ],
  },
  {
    id: 'al-rehab',
    name: 'Al-Rehab',
    origin: 'https://www.alrehab.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'trading since 1975 out of Jeddah. Four separate domains present themselves as official (alrehab.com, al-rehab.com, alrehaboriental.com, alrehabstore.com) — this points at the first, unconfirmed',
    ],
  },
  {
    id: 'orto-parisi',
    name: 'Orto Parisi',
    origin: 'https://ortoparisi.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'Italian niche rather than Middle Eastern, so it does not fit the mideast tier this registry was built around — kept here because it is still a house selling direct',
    ],
  },
  {
    id: 'nasomatto',
    name: 'Nasomatto',
    origin: 'https://nasomatto.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'same perfumer as Orto Parisi above (Alessandro Gualtieri), separate house and separate storefront',
    ],
  },
  {
    id: 'gissah',
    name: 'Gissah',
    origin: 'https://gissahuae.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'Kuwait-founded (2010) niche house, UAE storefront. A UK stockist exists (arabianfragranceshop.co.uk) if a comparison point is wanted sooner than this harvest can provide one',
    ],
  },
  {
    id: 'reef',
    // Display name 'Reef Perfumes', not the bare 'REEF' this house's own
    // storefront uses — this house's brand does not flow through
    // buildBrandCanon (src/catalogue/brandName.ts) the way a retailer
    // listing's vendor field does, so it stayed literally 'REEF' even after
    // that table was told 'REEF' and 'Reef Perfumes' are the same house.
    // Set here at the source instead, to the same spelling that table
    // chooses, so a reader never sees both.
    name: 'Reef Perfumes',
    origin: 'https://www.reef-parfum.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'Saudi niche house, founded 2018. "REEF" is a generic enough word that search results carry a lot of noise — confirm this domain before trusting its listings',
    ],
  },
  {
    id: 'al-wataniah',
    name: 'Al Wataniah',
    origin: 'https://www.alwataniah.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: ['storefront currency and UK delivery terms not yet established', 'Dubai, founded 2012'],
  },
  {
    id: 'amouage',
    name: 'Amouage',
    origin: 'https://amouage.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'ships from Oman to 63 countries per their own shipping policy page, so UK delivery may genuinely exist — worth confirming currency at checkout before assuming it is not GBP',
      'already stocked by several UK retailers (Harrods, 50-ml.co.uk, Perfume Warehouse), so this house entry is for a direct-from-Oman comparison point rather than filling a coverage gap',
    ],
  },
  {
    id: 'bdk-parfums',
    name: 'BDK Parfums',
    origin: 'https://bdkparfums.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'Paris niche house (David Benedek). No UK-specific storefront found; likely EUR pricing',
    ],
  },
  {
    id: 'sol-de-janeiro',
    name: 'Sol de Janeiro',
    origin: 'https://soldejaneiro.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      "their own site states it ships within the United States only — this is likely to stay catalogue-only permanently rather than pending, since there may be no order a UK buyer can place here at all",
      'already stocked by several UK retailers (Boots, Space NK, Harrods) for anyone wanting a UK price sooner than confirming that',
    ],
  },

  // ── Applied via Awin, 2026-08-11 ───────────────────────────────────────────
  // Temporary placeholders: each is a real, well-known house whose UK Awin
  // programme this account applied to (see the Activity Stream). Houses
  // carry no affiliate config of their own — see this file's own header
  // comment on why — so there is nothing to record about the application
  // itself here beyond the blocker; the affiliate side lives entirely in
  // retailers.ts for the shops that actually stock these brands.
  {
    id: 'escentric-molecules',
    name: 'Escentric Molecules',
    origin: 'https://www.escentric.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'applied to their UK Awin programme 2026-08-11; only a US-labelled (escentric.com/en-us) storefront was found, no separate UK domain confirmed',
      'already stocked by several UK retailers (Liberty, Selfridges, Cult Beauty, Space NK) for anyone wanting a UK price sooner than confirming this',
    ],
  },
  {
    id: 'mugler',
    name: 'Mugler',
    origin: 'https://www.mugler.co.uk',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'applied to their UK Awin programme 2026-08-11; a dedicated mugler.co.uk exists but has not been opened from this environment',
    ],
  },
  {
    id: 'the-body-shop',
    name: 'The Body Shop',
    origin: 'https://www.thebodyshop.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'applied to their UK Awin programme 2026-08-11; no separate UK-specific domain confirmed, thebodyshop.com may resolve UK pricing by geolocation or may not — not established from here',
      'fragrance is a small part of a much larger bath/body/cosmetics catalogue; expect most harvested listings to be rejected by the isFragrance filter',
    ],
  },
  {
    id: 'jo-loves',
    name: 'Jo Loves',
    origin: 'https://www.joloves.com',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'applied to their UK Awin programme (registered as "Jo Loves Limited") 2026-08-11 — joloves.com is the company\'s own registered domain per Companies House, not merely the most likely of several found',
    ],
  },
  {
    id: 'lancome',
    name: 'Lancôme',
    origin: 'https://www.lancome.co.uk',
    confidence: 'unverified',
    routes: ['shopify-products-json', 'sitemap-jsonld'],
    enabled: true,
    blockers: [
      'storefront currency and UK delivery terms not yet established',
      'applied to their UK Awin programme 2026-08-11; a large L\'Oréal-group brand, unlikely to run on Shopify — the sitemap-jsonld route is the more likely one to actually work here',
    ],
  },
];