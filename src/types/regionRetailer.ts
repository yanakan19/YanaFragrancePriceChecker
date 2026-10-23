/**
 * Shops outside the United Kingdom, for the US and India dry runs
 * (docs/INTERNATIONAL-PLAN.md, Phase 1, step one: "a US test run with no
 * publishing", and the same for India).
 *
 * Kept apart from `Retailer` (src/types/retailer.ts) on purpose. Every field
 * of `Retailer` that carries money is named in pounds (`standardGbp`,
 * `freeOverGbp`) and its `currency` is the literal 'GBP'; Phase 0 left those
 * names alone (renaming them touches the UK snapshots' replay, plan section
 * 1). A US shop written into that shape would have to pretend its dollars are
 * pounds. So a region shop has its own small shape, with neutral money names
 * in its own currency, and nothing in it is read by the UK pipeline: the UK
 * harvest, catalogue, history, slugs and pages never see these entries.
 *
 * What a region entry deliberately does not have:
 *   - no `affiliate` block: the owner decided on 9 Oct 2026 that no affiliate
 *     programme is joined for now; only shops our crawler can read under
 *     docs/DECISIONS.md D23 are listed;
 *   - no `affiliate`-style extras. `logo` and `squareLogo` are allowed since 13 Oct 2026 (owner said yes;
 *     docs/LOGOS-PLAN.md section 10): the same `LogoRef` as a UK shop, only what the shop's own site
 *     declares, hot linked. `imageBasis` is the one photo field, and it is the same switch
 *     as the UK's (src/types/retailer.ts): the owner answered D24 for the US and
 *     India on 9 Oct 2026, so each shop carries `hotlink-unlicensed` and its
 *     photos show, hot-linked from the shop's own page and never copied. Delete
 *     a shop's line to hide its photos on the next build;
 *   - no Trustpilot fields.
 * tests/regionRetailers.test.ts holds every one of those lines.
 */
import type { LogoRef, RetailerTier, ShopifyVariantRule, SitemapRoute } from './retailer.js';
import type { RegionId } from '../config/regions.js';

/**
 * The regions this file serves: Phase 0's `RegionId` (src/config/regions.ts)
 * without the UK, which keeps its own registry.
 */
export type RegionCode = Exclude<RegionId, 'GB'>;

/** The shop's own currency, as the shop states it. Never a conversion. */
export type RegionCurrency = 'USD' | 'INR' | 'CAD';

/** The page a delivery figure was read off, and the sentence it came from. */
export interface RegionDeliverySource {
  url: string;
  quote: string;
  /** ISO-8601 date the page was read, as PriceSniffsBot. */
  readAt: string;
}

/**
 * Standard delivery only, as in the UK (`ShippingRule`), in the shop's own
 * currency. `null` means not established, never zero.
 */
export interface RegionDelivery {
  /** Standard delivery below the free threshold. */
  standard: number | null;
  /** The order subtotal at which standard delivery becomes free. */
  freeOver: number | null;
  /**
   * Whether a basket of exactly `freeOver` already ships free. True only where
   * the shop says "or more" / "and above"; "over $40" is false.
   */
  freeOverInclusive?: boolean;
  /** The smallest order the shop accepts, where it states one (Nykaa: ₹149). */
  minimumOrder?: number;
  /**
   * India: a cash on delivery fee the shop states. A footnote, never priced
   * in, like a membership scheme in the UK.
   */
  codFee?: number;
  /** Indicative standard delivery window, [min, max] working days, where stated. */
  estimatedDays: [number, number] | null;
  /** When the figures were last checked against the shop's own page. */
  verifiedAt: string;
  /** `confirmed`: read off the shop's own page, quoted in `source`. */
  confidence: 'confirmed' | 'unverified';
  source?: RegionDeliverySource;
  notes?: string;
}

/** How a region shop's listings are read, reusing the UK adapters. */
export type RegionRoute =
  /** Shopify's own `/products.json` (src/catalogue/shopifyProductsCrawl.ts). */
  | { kind: 'shopify'; variantRule?: ShopifyVariantRule }
  /**
   * The shop's sitemap or category pages, then each product page's
   * schema.org JSON-LD (src/catalogue/sitemapCrawl.ts, src/catalogue/jsonld.ts).
   * The harvest always reads it with `requireGbp` on, which makes the parser
   * keep a price only where the page names its currency; the region layer then
   * keeps it only when that currency is the region's.
   */
  | { kind: 'sitemap'; sitemapRoute: SitemapRoute }
  /**
   * A shop whose pages carry no JSON-LD but state the price in Open Graph
   * product tags (`og:price:amount`, `product:price:currency`) and the name
   * in the page's one <h1> (AAR Fragrances). Product addresses come from the
   * plain sitemap `sitemap`; `product` and `exclude` are source text, case
   * blind. Read by `readOgProductPage` in src/catalogue/regionHarvest.ts.
   */
  | { kind: 'og-price'; sitemap: string; product: string; exclude?: string };

export interface RegionRetailer {
  /** Stable key, never one the UK registry uses. */
  id: string;
  /** As the shop brands itself. */
  name: string;
  region: RegionCode;
  /** Must equal the region's currency; the shop's own pages say it (see `checked`). */
  currency: RegionCurrency;
  domain: string;
  homepage: string;
  tiers: RetailerTier[];
  /** One house's own shop: fills that house's pages, rarely competes on price. */
  singleBrandOnly?: string;
  /**
   * Everything this shop lists is a fragrance, so a sized listing whose title
   * names no strength is still one (the UK's `Retailer.fragranceOnlyCatalogue`,
   * read through `sellsOnlyFragrance` in src/catalogue/fragranceId.ts). A
   * statement a human makes after looking at the shop; never inferred.
   */
  fragranceOnlyCatalogue?: boolean;
  /**
   * The grounds on which this shop's own product photos are shown (D24, the
   * owner's answer of 9 Oct 2026). Unset means no photo of this shop is shown.
   */
  imageBasis?: 'hotlink-unlicensed';
  /** The shop's own logo, as for a UK shop (docs/LOGOS-PLAN.md section 10). Unset means initials. */
  logo?: LogoRef;
  /** A square mark beside a wordmark `logo`. */
  squareLogo?: LogoRef;
  /** Whether the region crawl reads this shop. */
  enabled: boolean;
  /** Why an entry is off, in a sentence, when it is. */
  blockedReason?: string;
  route: RegionRoute | null;
  /** Least delay between two requests to this shop. */
  minRequestGapMs: number;
  /**
   * Shopify product types that are not something a shopper can buy on its own:
   * free gifts, sample pickers, loyalty rewards. Dropped before the catalogue.
   */
  excludeProductTypes?: readonly string[];
  /**
   * Keep only listings whose title matches this expression (source text, case
   * blind). MicroPerfumes lists each perfume three times, as "- Retail Bottle",
   * "- Travel Spray" and "- Sample Vial", and only the retail bottle is the
   * article other shops sell.
   */
  titleMustMatch?: string;
  /**
   * The shop's own product id is the bottle's barcode (Beauty Encounter's
   * Shopify `sku`, Nykaa's JSON-LD `sku`), so it is read as the barcode where
   * the listing carries none and it passes the barcode checks (barcode.ts).
   */
  skuIsBarcode?: boolean;
  /**
   * The shop's page states a price of 0 for a product it has sold out
   * (Purplle, round 2). A 0 is never a price: a listing already stored is
   * kept at its last price and marked out of stock, and a new one is not
   * stored at all.
   */
  zeroPriceMeansSoldOut?: boolean;
  /**
   * The barcode inside the shop's own id, as source text with one capture
   * group of digits: Purplle's sku is "PPLB" and the EAN-13
   * ("PPLB8906111693723"). Kept only when it passes the barcode checks.
   */
  skuBarcodeFrom?: string;
  /**
   * Shopify `vendor` values this shop uses for itself, not for a house
   * (Perfume Palace files 926 of its listings under "Seema Mehra"). A listing
   * with one of these stores no brand, and the build reads the house from the
   * title against the houses the region's shops name.
   */
  vendorNotHouse?: readonly string[];
  /**
   * A larger page budget than the run's default, for a shop whose catalogue
   * is read one product page at a time (Nykaa, Ulta, AAR Fragrances). The
   * gap between requests stays the shop's own (`minRequestGapMs`, or its
   * robots.txt Crawl-delay): more time, never more speed. Each run reads the
   * pages it has never read first, so the snapshot grows run by run.
   */
  pageBudget?: { minutes: number; newPages: number };
  /**
   * The page names its selected size only in its schema.org ProductGroup
   * (`hasVariant[].sku` and `.size`), while its priced Product names none
   * (Ulta: "HUGO Man Eau de Toilette" at sku 2273379, the 4.2 oz variant).
   * The region harvest reads that size off the same page and adds it to the
   * title of the listing with that sku.
   */
  sizeFromProductGroup?: boolean;
  /**
   * The page prints every size as an offer of one AggregateOffer (`offers.offers[]`), each naming its size only in its
   * `checkoutPageURLTemplate` ("...&field2=Size:3.3 oz.") and its own sku in `itemOffered` (Dillard's). The region harvest reads
   * those offers off the page it fetched and makes one listing per size (`aggregateOfferListings` in
   * src/catalogue/regionHarvest.ts); the page's own product id is not a barcode and is not kept as one.
   */
  offersFromAggregate?: boolean;
  /**
   * The page prints the strength in a labelled field of its product facts ("Concentration" then "Extrait", Luckyscent), and
   * its titles do not. The region harvest reads the value off the page it fetched anyway and puts the strength into the title
   * of a listing that states none (`pageFieldStrength`, `titleWithPageStrength`).
   */
  strengthFromPageField?: string;
  /**
   * The Shopify `vendor` is the shop, not the house (Parfums Raffy), so it is
   * not stored as the brand; the region build reads the house from the title
   * against the houses the region's other shops name.
   */
  vendorIsShop?: boolean;
  /**
   * Shops measured to run one catalogue (the same products in the same order,
   * the same sku numbering) share a group name. They are counted once in the
   * plan's "two or more shops" measure, because a sister shop's price is not
   * an independent comparison. Ownership is not claimed, only the measurement.
   */
  catalogueGroup?: string;
  /**
   * The shop writes "Cologne" on its bottles whatever their strength (Perfumania, Fragrance Outlet and Fragrance Market label every
   * men's bottle so, about 3,800 of the US shops' 4,800 cologne listings). For this shop a "Cologne" or "Eau de
   * Cologne" word in a title is not a strength: the listing is read as strength not stated, unless the title states
   * another strength (EDT, EDP, Parfum), which then wins. Owner decision, 21 Oct 2026. Other shops keep Eau de Cologne.
   */
  cologneWordIsNotAStrength?: boolean;
  /**
   * The shop's own product type field states the strength ("Eau De Parfum", "Extrait De Parfum"), and its titles do not
   * (Maximum Fragrance, Parfum Exquis). For a listing whose title states no strength the strength is read from the type
   * (`strengthOfShopType` in src/catalogue/regionCatalogue.ts); a strength the title states always wins. Eau de Cologne
   * stays a strength of its own, but a bare "Cologne" or "Perfume & Cologne" is a category, not a strength. Not set where
   * the type is a category for every listing (H Parfums writes "Parfum" on all 712 of its products).
   */
  strengthFromProductType?: boolean;
  /**
   * Ask the home page for the shop's own market with Shopify's standard selector, `country=CA`. Four Canadian
   * Shopify shops answer a US caller in the market of its address (USD at a conversion rate, whatever the
   * language header) unless the market is named; with `?country=CA` they quote Canadian dollars at rate 1, as they
   * do to a visitor in Canada, and the currency rule then accepts them. The same query is added to
   * every products.json page, since two of them convert their catalogue into the caller's market too
   * (Niche Essence, Parfum Exquis: 0.71 of the Canadian price without it). The same selector the UK crawl uses (`?country=GB`); nothing about who is asking changes.
   */
  marketQuery?: string;
  delivery: RegionDelivery;
  /**
   * What the shelf price includes, in the plan's words (section 4): US prices
   * are before sales tax, Indian prices include GST.
   */
  taxNote: string;
  /**
   * What was measured, by whom and when: robots.txt, the route, the currency
   * the shop stated (Shopify.currency and /meta.json, or the JSON-LD
   * priceCurrency), as PriceSniffsBot.
   */
  checked: string;
}

/** The honest sentence under every US total (plan section 4, "Delivery and tax model"). */
export const US_TAX_NOTE = 'Price before sales tax. Sales tax is added at checkout and depends on your state.';

/** Indian shelf prices include GST and may not exceed the printed MRP. */
export const IN_TAX_NOTE = 'Price includes GST.';

/** Canadian shelf prices are before sales tax (GST, HST or PST, which depend on the province). */
export const CA_TAX_NOTE = 'Price before tax. GST, HST or PST is added at checkout and depends on your province.';
