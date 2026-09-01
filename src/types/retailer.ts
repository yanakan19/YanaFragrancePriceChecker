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
  /**
   * Where a `confirmed` figure was read, and the sentence it was read from.
   *
   * Every number in this block changes what the site tells a shopper to pay, so
   * `confidence: 'confirmed'` is only worth anything if the thing that
   * confirmed it can be re-read by whoever doubts it. This holds that: the URL
   * fetched, the sentence on it, and the date. Written by
   * `scripts/shipping-discover.ts` when it promotes a rule, and equally fine to
   * fill in by hand after reading a page yourself.
   *
   * Absent on a rule that has never been confirmed, and absent on the older
   * hand-confirmed entries that predate this field — absence means "no
   * recorded source", never "no source exists".
   */
  source?: ShippingSource;
  /**
   * Set only when this shop's own delivery page has been read and genuinely
   * publishes no flat standard rate.
   *
   * `standardGbp: null` alone cannot say this. It is the value the field takes
   * both for a shop nobody has looked at yet and for a shop that has been
   * looked at carefully and does not publish a rate, and those are completely
   * different facts about the world. Several shops here advertise "free over
   * £50" and simply never print what they charge below it — that is a real
   * category, not a parsing failure, and until now the registry could not
   * distinguish it from an unfinished job.
   *
   * Requires `standardGbp: null`, and requires `source` to hold the page that
   * was read: this is a claim about what a shop does not publish, which is a
   * claim, so it carries evidence like every other one.
   *
   * Changes nothing about the delivered price. Such a shop still resolves to a
   * null delivery cost, still shows as delivery not stated, and still cannot
   * rank as cheapest. What it changes is what the site is entitled to say about
   * why.
   */
  standardRateNotPublished?: boolean;
  notes?: string;
}

/** The page a shipping figure was read off, and the wording it was read from. */
export interface ShippingSource {
  /** The exact URL fetched. */
  url: string;
  /**
   * The sentence on that page the figure came from, quoted rather than
   * summarised, so a reader can search the page for it.
   */
  quote: string;
  /** ISO-8601 date the page was read. */
  readAt: string;
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
  /**
   * A URL path this shop's sitemap walk (`crawlViaSitemap` in
   * `src/catalogue/sitemapCrawl.ts`) must stay under, e.g. `/en-gb`.
   *
   * Exists for one specific failure shape: a shop that quotes different
   * currencies at different address prefixes, where the price parser
   * (`src/catalogue/jsonld.ts`) has no `priceCurrency` check at all — it reads
   * a JSON-LD number and records it as `priceGbp`, trusting the registry's
   * `currency: 'GBP'` rather than anything the page actually said. For an
   * ordinary shop that is harmless, because the whole storefront is one price
   * list. For niche-beauty-uk it is not: the plain origin quotes a US CI
   * runner USD, only `/en-gb` quotes sterling, and `/en-uk` quotes euros (see
   * that entry's own comment, currency probe run 32254695358). A sitemap walk
   * seeded from the plain domain, or from a robots.txt sitemap that is not
   * itself scoped to `/en-gb`, could just as easily hand back a euro or dollar
   * figure and this parser would publish it as pounds without ever noticing.
   *
   * Set only once the confirmed-sterling address has been read directly from
   * a CI run, never guessed. When set, `discover()` seeds from
   * `https://www.{domain}{prefix}/sitemap.xml` ahead of anything robots.txt
   * names, and drops every discovered URL — sitemap index or product alike —
   * whose path does not start with it. Unset for every other retailer, where
   * the plain domain is the only price list there is.
   */
  requiredUrlPrefix?: string;
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
  /**
   * True only when everything this shop sells is a fragrance, so a listing of
   * its can be trusted as one even when its title carries no concentration
   * word.
   *
   * `isFragrance` normally requires a title to name a concentration — "eau de
   * parfum", "EDP", "cologne" and so on. That test is load-bearing and must
   * stay: a broad beauty retailer's catalogue is mostly not fragrance, and
   * without it Escentual alone would contribute 4,173 serums, brushes and
   * shampoos (Dermalogica, Schwarzkopf, Elemis) to a fragrance comparison.
   *
   * But a single fragrance house names its own products after itself, not
   * after a concentration: "Escentric 01 200ml" and "Molecule 01 100ml" are
   * unmistakably fine fragrances and unmistakably fail that test. Escentric
   * Molecules lost 64 of its 118 listings that way and reached the app with
   * two.
   *
   * Deliberately NOT inferred from `singleBrandOnly`, and deliberately not
   * inferred from `tiers`: LUSH and Bath & Body Works are also single-brand
   * and are also `tiers: ['niche']` / `['designer']`, but they sell bath and
   * body products where the concentration test is exactly what is keeping
   * soap out. Nothing about the shape of a registry entry distinguishes those
   * two cases, so this is a separate statement a human makes about a specific
   * shop after looking at what it actually sells. Default off; adding it to
   * the wrong shop admits that shop's whole non-fragrance catalogue.
   */
  fragranceOnlyCatalogue?: boolean;
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
  /**
   * A Harvest probe has actually run `crawlViaSitemap` against this
   * retailer's own sitemap and come back with real, priced listings — not a
   * guess that the generic route "should" work, a measured run and job id
   * recorded in this entry's own comment.
   *
   * Every enabled retailer with `catalogue: null` and `adapter: 'unknown'`
   * already gets tried through this same generic sitemap-discovery route
   * (see scripts/catalogue-harvest.ts and src/catalogue/sitemapCrawl.ts) —
   * debenhams, lush-while-it-was-enabled, oud-arabian and bellavita-luxury
   * all shipped on exactly that basis, with no field here to say so, because
   * none of them also carried `standardGbp: null`. This field exists for the
   * shop that does both at once: tests/registry.test.ts's "unstated delivery"
   * allowlist requires a real, stated ingestion route before it will let a
   * retailer with no known delivery cost stay enabled, and until riiffs this
   * route had never been the one doing the proving. Unset (not merely
   * `false`) for every retailer this has not been measured for — same
   * "not yet confirmed" convention as `shopifyStorefront` above, and the
   * same reason: setting it without a real harvest run behind it would be
   * exactly the invented-route problem this registry's own header warns
   * against.
   */
  sitemapHarvestConfirmed?: boolean;
  /**
   * This retailer's affiliate feed has been *measured* to publish prices the
   * shop does not charge, so its own Shopify storefront is the price of
   * record instead — see src/catalogue/feedPriceRepair.ts for the mechanism
   * and the measurement behind it.
   *
   * Set only from a "Price verification" run that keyed a large majority of
   * the retailer's listings and found a one-sided disagreement. One-sided is
   * the load-bearing word: a stale snapshot disagrees in both directions
   * roughly evenly, so a lopsided split is what distinguishes "this feed is
   * wrong" from "we last looked a while ago". Never set on a hunch, and never
   * on a feed that has not been measured at all — the repair clears the price
   * of any listing the storefront does not carry, which is right for a feed
   * known to be wrong and reckless for one that is merely unexamined.
   *
   * Requires `shopifyStorefront: true`; there is no other route implemented.
   */
  storefrontIsPriceAuthority?: boolean;
  /**
   * This shop's catalogue section pages have been measured, more than once and
   * on more than one day, answering a real headless-browser render — not a
   * budget-exhausted stub, an actual network round trip — with a refusal:
   * `src/catalogue/renderRefusal.ts`'s HTTP-403-or-tiny-2xx shape. Rendering
   * did not change the answer, because the block sits at the network layer
   * (an IP or WAF decision) rather than in whatever JavaScript the page would
   * have run.
   *
   * `scripts/catalogue-harvest.ts` skips the render escalation entirely for a
   * shop carrying this, rather than spending a page finding out again what
   * every real attempt so far has already found. That page goes to a shop
   * whose outcome is not yet settled instead — see localBrowser.ts's own
   * header for why the render tier's per-run page budget is shared and
   * scarce, and harvestCursor.ts's for why a shared budget starves whichever
   * shop is last in a run's rotation.
   *
   * Set only from real, repeated, dated evidence recorded in the retailer's
   * own entry below — never from a single run, and never from a run whose
   * render was budget-exhausted rather than actually attempted. Unset (not
   * merely `false`) for every retailer this has not been established for,
   * matching this file's usual convention: absence means "not yet measured",
   * not "known to be fine".
   *
   * Tier-aware as of 2026-09-01 (see knownRenderRefusal in
   * src/catalogue/renderRefusal.ts): `'local'` means the refusal evidence on
   * file is from the free local-browser renderer only — the paid Apify
   * actor tier is either untested or has demonstrably NOT refused this shop,
   * so it must still be offered a real attempt. Plain `true` is reserved for
   * a shop whose refusal evidence covers every render tier this project has
   * actually tried.
   */
  renderRefused?: boolean | 'local';
  /**
   * Per-shop render-tier preference, added 2026-09-01. Unset (the case for
   * every retailer today) means exactly the prior behaviour: this shop's
   * render escalation uses whichever renderer the run defaults to — the free
   * local browser when it is on, else the paid Apify actor when that is
   * configured and allowed.
   *
   * `'actor'` asks scripts/catalogue-harvest.ts to route THIS shop's render
   * calls to the paid actor tier specifically, independent of every other
   * shop's renderer. It exists because the only way to reach the actor used
   * to be `--no-local-render`, a run-wide switch that moves every render-
   * dependent shop onto the metered tier at once — which is exactly what
   * emptied the shared $5 monthly Apify credit on 2026-08-21, darkening five
   * shops together (Boots, Selfridges, John Lewis, Superdrug, Zara) when only
   * one of them needed rescuing. See John Lewis's own registry entry for the
   * worked example this was built for: its actor route is proven (real
   * ~1MB section pages, real priced listings) while its local-render route
   * is refused ten times over, so it is the shop this field was designed to
   * let the owner flip on deliberately — without the recovery of one shop
   * costing every other render-dependent shop its free route again.
   *
   * Honoured only when the actor tier is actually available this run
   * (APIFY_TOKEN set, --allow-metered passed, budget not exhausted) — it can
   * never turn a run with no metered tier configured into one that needs
   * one, and it never changes any other shop's renderer. Setting it spends
   * real money on every run that reaches this shop's render escalation
   * (docs/INGESTION.md's own estimate: roughly $2-5 per 1,000 actor-rendered
   * pages) — a deliberate owner decision with the cost in front of them, not
   * a default. No retailer sets this today.
   */
  renderTier?: 'actor';
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
