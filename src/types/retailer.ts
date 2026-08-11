/**
 * Retailer registry types.
 *
 * ── On the absence of a `trusted` flag ────────────────────────────────────────
 * An earlier design carried a per-retailer `trusted` boolean. It was dropped
 * deliberately, because it never had a stated criterion and so could not be
 * maintained: Selfridges and Harvey Nichols are beyond reproach on
 * authenticity, yet were marked untrusted — which means the flag was silently
 * encoding "good value" while being named for authenticity.
 *
 * The decision taken instead: every retailer in this registry is a legitimate
 * UK stockist and all of them are fine to send a user to. What differentiates
 * a good listing from a bad one is not the retailer's identity but whether we
 * are showing the truth about the offer:
 *
 *   1. the genuine price being charged right now;
 *   2. the was/now pair and discount percentage, when the retailer is running
 *      a real promotion;
 *   3. the delivery cost that will actually be added at checkout, including
 *      whether this order clears that retailer's free-delivery threshold;
 *   4. the stock state, with out-of-stock listings pushed to the bottom rather
 *      than quietly mixed in.
 *
 * Those obligations are universal, so they live in the offer pipeline
 * (`src/services/`) rather than as a per-retailer flag. `enabled` remains as
 * the one per-retailer switch, and it means exactly what it says: whether we
 * currently fetch from this retailer at all.
 *
 * Per-seller trust *is* still modelled for TikTok Shop (see
 * `src/config/tiktokSellers.ts`), where counterfeits are a genuine risk and the
 * flag has a concrete meaning.
 */

/**
 * Catalogue segments a retailer meaningfully stocks. Used to skip retailers
 * that cannot plausibly carry a fragrance — there is no point asking Superdrug
 * for Amouage.
 */
export type RetailerTier = 'designer' | 'niche' | 'mideast';

/** How offers are fetched from this retailer. Set by the Phase 0 spike. */
export type AdapterStrategy =
  /** Retailer PDP embeds a schema.org/Product JSON-LD block: plain fetch + parse. */
  | 'json-ld'
  /** JS rendered but reachable: a plain headless browser is enough. */
  | 'headless'
  /**
   * Refuses a datacentre address outright. Needs retrieval through residential
   * addresses, which costs money per request, so this is the adapter of last
   * resort. Prefer an affiliate feed for anything marked this way.
   * See docs/INGESTION.md.
   */
  | 'proxied'
  /** Product feed from the affiliate network is the source of truth. */
  | 'affiliate-feed'
  /** Not yet determined — the Phase 0 spike has not covered this retailer. */
  | 'unknown';

/** Affiliate networks the UK beauty market actually runs on. */
export type AffiliateNetwork =
  | 'awin'
  | 'rakuten'
  | 'cj'
  | 'partnerize'
  | 'tradedoubler'
  | 'impact'
  /** Retailer runs its own in-house programme. */
  | 'direct';

export interface AffiliateConfig {
  /**
   * The network this programme runs on. `null` means not yet researched.
   * `verified` distinguishes "we confirmed this against the network's own
   * merchant listing" from "this is the likely network, pending the audit".
   */
  network: AffiliateNetwork | null;
  verified: boolean;
  /**
   * Application state. Nothing below `active` produces a tracked link — the
   * offer URL falls back to the plain retailer URL, which is correct and
   * clickable, just unmonetised.
   */
  status: 'not-researched' | 'not-applied' | 'pending' | 'active' | 'rejected';
  /** Publisher/affiliate id issued by the network once approved. */
  publisherId: string | null;
  /**
   * Deeplink template. `{{publisherId}}` and `{{url}}` (URL-encoded target)
   * are substituted at link-build time. Null until the programme is live.
   *
   * Only right for a redirect-domain affiliate network — Awin, Rakuten and
   * the like — where the retailer's own URL becomes an encoded *value*
   * inside someone else's tracking link (`awin1.com/cread.php?...&ued={{url}}`).
   * Wrong for an in-house tool that tracks a sale from a query parameter
   * appended straight onto the retailer's own product page, with no redirect
   * domain at all — see `querySuffixTemplate` for that shape instead.
   */
  deeplinkTemplate: string | null;
  /**
   * The other affiliate URL shape: some in-house tools (GoAffPro among them)
   * track purely from a query parameter on the retailer's own product URL —
   * no redirect domain, the page a shopper lands on is genuinely the
   * retailer's own. `{{publisherId}}` is the only substitution, e.g.
   * `ref={{publisherId}}`. Applied by appending it onto `productUrl` with
   * `?` or `&` as already present query parameters require — never through
   * `deeplinkTemplate`'s `{{url}}`, which URL-encodes its target for exactly
   * the redirect-wrapping case this is not: encoding productUrl here would
   * turn a real, clickable retailer link into a broken, percent-escaped
   * string with a query parameter stuck on the end of it. Null until the
   * programme is live, same as `deeplinkTemplate`; a retailer sets one or
   * the other, never both.
   */
  querySuffixTemplate: string | null;
  /** Where to sign up, so the reminder output is actionable rather than nagging. */
  signupUrl: string | null;
  /**
   * Whether we have confirmed — by reading that merchant's own Terms/Creative
   * page in the network dashboard — that its product images may be used to
   * promote it as an approved affiliate.
   *
   * This is deliberately separate from `status === 'active'`. Being accepted
   * onto a programme means the merchant has agreed to pay commission; it is
   * not, by itself, proof of what their creative-usage terms say. Almost every
   * Awin programme does permit feed images for exactly this purpose — that is
   * why the feed includes them — but "almost every" is not "this one, verified",
   * and nothing here can check an authenticated dashboard on your behalf.
   *
   * Kept as the record of what has actually been *read*, and now separate from
   * whether images are displayed — see `imageBasis`.
   */
  imageUsageConfirmed?: boolean;
  /**
   * Why this retailer's product photography may be displayed, or unset for
   * "no basis, show the placeholder".
   *
   * This replaced a bare boolean. The boolean could only say yes or no, so
   * turning images on for a shop meant asserting a licence that had not been
   * obtained, and the field could not distinguish the three genuinely
   * different situations this project is in. Naming the basis keeps the
   * distinction auditable: anyone reading the registry can see which shops
   * rest on a licence and which do not, and the site's terms can describe
   * what actually happens rather than a flattering version of it.
   */
  imageBasis?: ImageBasis;
  notes?: string;
}

/** The grounds on which a retailer's product photography is displayed. */
export type ImageBasis =
  /**
   * That merchant's own affiliate creative terms have been read and permit
   * using its product images to promote it. The strongest basis available.
   */
  | 'affiliate-terms'
  /**
   * The image comes from the brand's own storefront: their photograph, of
   * their own product, published by them. This is what the direct house
   * catalogues run on.
   */
  | 'own-storefront'
  /**
   * Hot-linked from the retailer's own server with no licence obtained, on
   * the site owner's decision.
   *
   * Nothing is copied or rehosted — the reader's browser fetches the image
   * from the retailer, exactly as it would on the retailer's own page, and
   * the image sits beside a link sending that reader to buy from them. That
   * is ordinary practice for price comparison, and materially different from
   * reproducing the file. It is still not a licence, and this value says so
   * rather than dressing it up as one. A retailer that asks us to stop, or
   * that blocks hot-linking, is honoured immediately by unsetting this.
   */
  | 'hotlink-unlicensed';

/**
 * A retailer's standard UK delivery rules.
 *
 * Only *standard* delivery is modelled, because that is what the comparison
 * shows by default. Express tiers exist but are opt-in at checkout and would
 * make the headline number misleading.
 */
export interface ShippingRule {
  /**
   * Cost of standard delivery when the free-delivery threshold is not met.
   *
   * `null` means we have not established it yet, and is deliberately distinct
   * from `0` — zero says "this shop always ships free", which is a claim, and
   * every other number here is one too. A newly joined affiliate programme
   * routinely tells you its free-delivery threshold and nothing about what
   * delivery costs below it, and the registry previously had no way to say so:
   * the only options were to invent a figure or to leave the retailer out.
   *
   * A retailer whose standard cost is null used to have to be
   * `enabled: false`, which protected the comparison by hiding the shop. It no
   * longer does. Such a retailer may be enabled, and then:
   *
   *   - `resolveDelivery` returns `costGbp: null` and its offers carry
   *     `deliveredPriceGbp: null` — never the item price, never zero;
   *   - the UI renders it as "delivery not stated" everywhere a delivery cost
   *     or delivered price would appear;
   *   - the delivered-price sort ranks every offer with a known delivered
   *     price above every offer without one, and `bestOffer` will not name an
   *     unknown-delivery offer as cheapest while any comparable offer exists.
   *
   * The guarantee that matters is unchanged and is enforced by tests in
   * tests/registry.test.ts: delivered price is the comparison's default sort
   * key, so a shop with an unknown delivery cost silently counted as zero
   * would sort as artificially cheapest, which is the single most damaging
   * error this app can make. It is now prevented by ranking rather than by
   * hiding the shop.
   */
  standardGbp: number | null;
  /**
   * Order subtotal (excluding delivery) at or above which standard delivery
   * becomes free. `null` means this retailer has no spend-based free delivery
   * — Notino, for example, gates free delivery on specific products instead.
   */
  freeOverGbp: number | null;
  /** Indicative standard delivery window, [min, max] working days. */
  estimatedDays: [number, number];
  /**
   * Free delivery that requires a paid subscription or loyalty scheme. Recorded
   * for display as a footnote, and never applied to the delivered price — we
   * cannot assume the user is a member, and quoting a members-only price as the
   * headline would be exactly the kind of dishonesty this model exists to avoid.
   */
  membershipPerk?: {
    scheme: string;
    description: string;
  };
  /** ISO-8601 date these figures were last checked against the retailer. */
  verifiedAt: string;
  /**
   * `confirmed` — read off the retailer's own delivery page.
   * `unverified` — sourced indirectly; treat the delivered price as indicative
   *   and surface a caveat in the UI.
   */
  confidence: 'confirmed' | 'unverified';
  notes?: string;
}

/**
 * Where a retailer's fragrance catalogue lives, and how to walk it.
 *
 * A daily crawl needs to know which pages actually enumerate the fragrance
 * range. Retailers split it differently: some have one /fragrance tree, some
 * separate men's and women's, some bury niche houses in a distinct department.
 * Each entry here is one walkable section.
 */
export interface CatalogueSection {
  /** Stable key for this section, unique within the retailer. */
  id: string;
  /** Human label, used in run reports. */
  label: string;
  /** Listing page URL. `{page}` is substituted with the page number. */
  urlTemplate: string;
  /** Which catalogue segment this section maps to, for matching hints. */
  tier: RetailerTier;
}

export interface CatalogueConfig {
  /**
   * The shop's own search URL, with `{q}` for the URL encoded query.
   *
   * A working fallback for any listing whose product URL we do not have or
   * cannot trust. Landing someone on a shop's search results for the exact
   * product name always works, whereas a guessed product URL is a 404 and looks
   * broken. Marked unverified until each one is opened in a browser.
   */
  searchUrlTemplate: string;
  sections: CatalogueSection[];
  /** Page number the retailer's pagination starts at. Usually 1, sometimes 0. */
  firstPage: number;
  /**
   * Stop after this many pages per section, however many the retailer claims.
   * A guard against a pagination bug walking forever.
   */
  maxPages: number;
  /**
   * Minimum gap between requests to this retailer, in milliseconds. Politeness
   * is not optional: a daily catalogue walk is thousands of requests, and the
   * fastest way to get blocked is to arrive all at once.
   */
  minRequestGapMs: number;
}

export interface Retailer {
  /** Stable internal key. Never derive this from the domain — domains change. */
  id: string;
  /** Display name, exactly as the retailer brands itself. */
  name: string;
  domain: string;
  homepage: string;
  /**
   * The retailer's own description of itself, quoted rather than paraphrased,
   * and only where we actually have one from a source they control (an
   * affiliate programme profile, their own About page). Left unset otherwise:
   * writing marketing copy on a shop's behalf would be inventing words and
   * attributing them to a real company.
   */
  blurb?: string;
  /** Catalogue segments this retailer is worth querying for. */
  tiers: RetailerTier[];
  /**
   * Set when this "retailer" is actually one house's own storefront — Armaf's
   * UK shop, French Avenue's UK shop, and so on — rather than a multi-brand
   * shop that happens to carry that house alongside others.
   *
   * This matters for one specific correctness question: on another brand's
   * fragrance page, is it true to say this retailer does not have it? For an
   * ordinary multi-brand retailer, yes — they could plausibly stock anything
   * in their tiers, and today they don't. For a single-brand storefront it is
   * not just untrue today, it could never become true: Armaf's own shop
   * structurally cannot sell a Dior fragrance. Presenting the two the same
   * way under "Not available" claims a fact about the second that isn't real.
   *
   * The value is the brand name exactly as it appears on `DemoFragrance.brand`
   * once matched (matching itself goes through `brandKey` from
   * `src/catalogue/brandName.ts`, so casing/punctuation differences between
   * this field and a harvested brand string don't cause a false mismatch).
   * `undefined` for every ordinary multi-brand retailer.
   */
  singleBrandOnly?: string;
  /** Whether the pipeline currently fetches from this retailer at all. */
  enabled: boolean;
  adapter: AdapterStrategy;
  /**
   * Confirmed to run on Shopify, so scripts/catalogue-harvest.ts tries
   * src/catalogue/shopifyProductsCrawl.ts's `/products.json` walk before
   * falling back to the sitemap route — Shopify's own complete, paginated
   * catalogue rather than a keyword-matched guess at which sitemap entries
   * are fragrance. Unset (not merely `false`) for every retailer this has
   * not been checked for, the same "not yet confirmed" convention `catalogue:
   * null` and `standardGbp: null` already use elsewhere in this type — this
   * only ever adds one extra route to try, so leaving it unset costs
   * nothing, but setting it without confirming would waste a request on
   * every harvest for a retailer that turns out not to be Shopify at all.
   */
  shopifyStorefront?: boolean;
  shipping: ShippingRule;
  affiliate: AffiliateConfig;
  /**
   * Fragrance catalogue entry points. `null` where the section URLs have not
   * been confirmed yet, which keeps the daily crawl from inventing paths.
   */
  catalogue: CatalogueConfig | null;
  /** All registry entries are UK storefronts pricing in sterling. */
  currency: 'GBP';
  /**
   * The 24-character hex id Trustpilot assigns a business, found in the
   * embed snippet their own site generates for that business — the widget's
   * script needs this specific id to fetch a rating; a domain alone is not
   * enough, and neither is guessing. `null` (the default for every retailer
   * below) means exactly what it always means in this registry: not
   * confirmed yet, so nothing is shown rather than something invented.
   * `demo/app.ts`'s trustpilotWidget only renders once this is set. Two
   * fetch mechanisms available while building this were both blocked from
   * reaching trustpilot.com, so these have to be filled in by hand, one
   * retailer at a time, from https://www.trustpilot.com/review/<domain>.
   */
  trustpilotBusinessId?: string | null;
}
