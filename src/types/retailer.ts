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
 * Where a logo comes from and why we may show it — mirrors `ImageBasis`
 * above, but for a shop's or a house's mark rather than a product photo.
 * See docs/LOGOS-PLAN.md §4e for the full reasoning; nothing here is
 * displayed without one of these recorded, the same "record the reason,
 * then show it" discipline `imageBasis` already runs on.
 */
export interface LogoRef {
  /** Hot-linked URL on the owner's own server, or a repo path under /logos/. */
  src: string;
  /** Which slot it may fill — see docs/LOGOS-PLAN.md §4c. */
  shape: 'square' | 'wordmark';
  /** Measured, not eyeballed: which ground it needs. */
  ink: 'dark' | 'light' | 'own';
  basis: LogoBasis;
  /** The page the declaration was read off, so anyone can re-read it. */
  source: string;
  /** ISO-8601 date it was read and measured. */
  readAt: string;
}

export type LogoBasis =
  /**
   * Declared by the owner on their own site — <link rel="icon">,
   * apple-touch-icon, or schema.org Organization.logo — and hot-linked from
   * their server. Referential use under the conditions in
   * docs/LOGOS-PLAN.md §2c. Unset it the moment they object.
   */
  | 'own-site-declared'
  /**
   * Wikimedia Commons, whose licence template states public domain (a
   * wordmark below the threshold of originality). `source` is the Commons
   * file page; the Wikidata QID goes in a comment beside the entry, because
   * name matching to Wikidata mis-resolves — see §3 source 2.
   */
  | 'commons-public-domain'
  /**
   * That merchant's own affiliate creative terms have been read and permit
   * its logo. Strongest available; today nothing holds it.
   */
  | 'affiliate-creative';

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
  /**
   * A cheaper, still paid, delivery rate once the basket passes a spend. It is
   * not free delivery: `freeOverGbp` stays null for such a shop, and a basket
   * is never shown as free because of it. Debenhams is the case: "Delivery
   * From £2.99 Or 99p On Orders Over £30".
   *
   * `overGbp` is the spend, `costGbp` the rate that applies above it, and
   * `inclusive` says whether a basket of exactly `overGbp` already gets it.
   * Leave `inclusive` false ("over £30" means strictly more than £30) unless
   * the shop's own wording says "at least" or "£30 or more". A free threshold
   * (`freeOverGbp`) still wins wherever it is lower.
   *
   * `source` is the evidence, and `readBy` says who read it: 'owner' for a
   * sentence the owner copied off the shop's own product page, 'bot' for one a
   * fetch read off a delivery page.
   */
  cheaperRateOver?: {
    overGbp: number;
    costGbp: number;
    inclusive: boolean;
    source: CheaperRateSource;
  };
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
  /**
   * The smallest basket the shop will deliver, where it has one: Morrisons'
   * online trolley reads "Minimum: £25.00". A bottle priced below it cannot be
   * ordered on its own, so its row says so. Never applied to the price.
   */
  minimumOrderGbp?: number;
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
   * Set when the figures were confirmed by hand in the shop's own basket or
   * checkout: an item put in the bag and the delivery options it offered read
   * off the screen, rather than a delivery page fetched and quoted.
   *
   * That is stronger evidence of what a shopper pays than a delivery page, but
   * it is a different fact, and the site said the wrong one: every confirmed
   * rule without a `source` rendered as "Confirmed against this shop's own
   * delivery page", including Riiffs, whose pages answer every automated read
   * with a captcha and whose £3.95 nobody here has ever seen on a delivery
   * page. `demo/deliveryFacts.ts` names this check instead when it is present.
   */
  basketCheck?: BasketCheck;
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

/** A delivery charge read by hand off the shop's own basket or checkout. */
export interface BasketCheck {
  /** ISO-8601 date the basket was checked. */
  readAt: string;
  /** The delivery wording the basket or checkout showed, quoted as recorded. */
  quote: string;
}

/**
 * Evidence for a cheaper delivery rate. Kept apart from `ShippingSource`
 * because the owner read it off a product page without a URL to hand, and a URL
 * is never invented to fill the field.
 */
export interface CheaperRateSource {
  /** The shop's own sentence, quoted exactly as read. */
  quote: string;
  /** ISO-8601 date it was read. */
  readAt: string;
  /** Who read it: the owner by eye, or a fetch of a delivery page. */
  readBy: 'owner' | 'bot';
  /** Which page of the shop it was read on, in words. */
  where: string;
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
  /**
   * How many consecutive pages of this section the render tier fetches, from
   * `firstPage` upward. Unset means one — the first page only, which is what
   * every render-dependent shop got before this field existed and what every
   * shop that does not set it still gets.
   *
   * Exists for exactly one measured shape: a shop whose product pages and
   * sitemap refuse a plain fetch, whose subsection URLs are challenged even in
   * a real browser, and whose single catch-all section renders cleanly — so
   * that one section's pagination is the only free route to anything past
   * its first 27 products. Notino UK is that shop (see its registry entry):
   * a render tier that renders page 1 of four sections got 28 listings and
   * three challenge pages, every run, for two weeks. Rendering four pages of
   * the one section that answers costs the same four pages of the shared
   * render budget and gets four times the products.
   *
   * Only ever honoured by scripts/catalogue-harvest.ts's render step, through
   * `renderTargets` in src/catalogue/renderTargets.ts, and only when the
   * template actually carries `{page}` — a literal URL cannot paginate and is
   * rendered once whatever this says. Capped by MAX_RENDER_PAGES_PER_SECTION
   * there, because the render tier's page budget is one pool shared by every
   * render-dependent shop in a run (src/catalogue/localBrowser.ts). The
   * adaptive probe's browser-render strategy (src/catalogue/attempt.ts) and
   * the paid actor path through it stay first-page-only regardless.
   */
  renderPages?: number;
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

/**
 * Which Shopify variants are ordinary UK retail bottles.
 *
 * `parseShopifyProducts` turns every variant of every product into a listing,
 * which is right for a shop whose variants are sizes. Bloom Perfumery's are
 * not: each size is listed several times under an "Info" option (ol, tf, sd,
 * tfsd, ato), alongside 1 ml samples, sample packs, atomizer refills, raw
 * materials and vouchers, and publishing the cheapest of those as the UK
 * price would show a shopper a figure they cannot pay. This is the shop's
 * own distinction written down, measured shop by shop, never guessed.
 *
 * A product, and then a variant, is kept only if it passes every test set.
 * A test naming an option the product does not have drops the product.
 */
export interface ShopifyVariantRule {
  /** Keep only products whose `product_type` is one of these (case blind). */
  productTypes?: readonly string[];
  /**
   * Options the product must carry, by name (case blind). A fragrance sold
   * with a concentration has one; a hand sanitizer filed under the same
   * product type does not.
   */
  requiredOptions?: readonly string[];
  /**
   * The option that separates the UK retail list from the others, by the name
   * the product gives it, and the values that are the UK retail list. The
   * option is left out of the listing's title.
   */
  marketOption?: { name: string; keep: readonly string[] };
  /**
   * The option that carries the bottle size. Only a single plain millilitre
   * size passes ("50 ml", "7.5 ml"); multipacks ("2×7.5 ml"), formats ("10 ml
   * roll-on") and sample packs ("9 x 1 ml") do not, and nothing under `minMl`
   * does.
   */
  sizeOption?: { name: string; minMl: number };
}

/**
 * The shop's own fragrance aisles, read as category pages.
 *
 * A sitemap lists every product the shop sells and says nothing of which are
 * perfume. Cult Beauty's lists 10,639 products, almost none named for the
 * aisle they sit in, and was last written on 2026-09-03: of the 1,697 products
 * its fragrance category pages showed on 2026-10-04, 148 were not in it. A walk
 * guessing perfume from the product's name found 1,138 of them and left out
 * every perfume whose name carries no strength word. Where the shop's category
 * pages list their products in the page's own markup, the aisles are the
 * shop's statement of what its fragrance range is, and they are read instead.
 *
 * Walked one request at a time, as the crawler, with the route's gap between
 * every pair of requests and robots.txt checked for every address. A category
 * page that the shop sorts by a changing ranking can list a product twice and
 * miss another within one walk, so no walk is ever taken as the whole range:
 * a product absent from it is never treated as withdrawn (only the shop's own
 * 404, 410 or redirect says that), and the next run's walk finds what this one
 * missed.
 */
export interface CategoryWalk {
  /** Category page addresses (page one), each walked to its last page. Every address must be permitted by robots.txt. */
  pages: string[];
  /** The query parameter that carries the page number, from page 2 on (page 1 is the address as given). */
  pageParam: string;
  /**
   * A regular expression (source text, one capture group) matched against a
   * category page's markup, global and case blind. The capture is a product
   * page's address, absolute or site relative; any query or fragment is
   * dropped. Only addresses that also match the route's `product` and not its
   * `exclude` are kept.
   */
  productLink: string;
  /**
   * A regular expression (source text, one capture group) matched against the
   * first page: how many pages the category has. Unset, a category is walked
   * until a page lists no product or `maxPages` is reached.
   */
  pageCount?: string;
  /** Most pages walked in one category, whatever the page says. */
  maxPages: number;
  /**
   * Read page one of every category and one page in `rotation` of the rest, a
   * different slice each run, so every page is read about every `rotation`
   * runs instead of every run. Needs `pageCount`. Measured on Cult Beauty from
   * a GitHub runner (run 37203579061): 148 pages took 11 minutes at 1.5 s
   * between requests and about 3 s for the shop to answer, out of a 40 minute
   * shop ceiling that also has to re-read every stored price. A new product is
   * found within a day either way; the minutes go to the prices.
   */
  rotation?: number;
}

/**
 * A shop's sitemap walk, written down rather than guessed.
 *
 * The generic walk in `src/catalogue/sitemapCrawl.ts` guesses which sitemaps
 * hold products from their names and which pages are perfume from their
 * paths. That guess is wrong in specific, measured ways for some shops: a
 * department store whose product sitemaps are fifty gzipped files (John
 * Lewis), one whose beauty sitemap is the ninth of nine and is never reached
 * before the budget runs out (Marks and Spencer), one whose single product
 * sitemap lists every country's store (Space NK, Niche Beauty). For those the
 * route is read off the shop's own robots.txt and sitemaps by hand and pinned
 * here, and the walk follows it and nothing else.
 *
 * A pinned route also changes how the walk presents itself: every request it
 * makes carries the crawler's own honest user agent (`BOT_HEADERS` in
 * `src/catalogue/attempt.ts`), never a browser's, and requests inside the
 * sitemap walk are spaced by the same gap as product pages, so a shop that
 * asks for a crawl delay gets it on every request.
 */
export interface SitemapRoute {
  /**
   * Category pages the shop itself files its fragrance range under, walked page
   * by page to find product pages. Unset for every shop whose sitemap is the
   * whole story. See `CategoryWalk`.
   */
  categories?: CategoryWalk;
  /**
   * A product page whose variants are sizes of one fragrance, all named alike
   * and none the page's own product, states each size on its size buttons
   * (THG: `data-sku` with `data-size`). Read them, so each size is a listing
   * of its own instead of the page being none; see `withVariantSizes` in
   * `src/catalogue/jsonld.ts` for exactly when a page is left alone.
   */
  variantSizesFromPage?: boolean;
  /**
   * The shop's titles often name no strength, but the brand's copy on a THG
   * product page states it in the shop's own template (the product's name,
   * its strength and the size in brackets: "Alto Astral Eau de Parfum
   * (50ml)"). Read it from the page the walk already fetched, so it costs no
   * request, and put it into the title before the size. A page that states
   * none, or two, leaves the title as it was. See
   * `src/catalogue/thgPageStrength.ts` for the rule and what was measured.
   */
  strengthFromPage?: boolean;
  /**
   * Never read product pages a run reads, when that many are unread. The run
   * wide page budget (`--max`, 42 never read pages a shop a run on the
   * scheduled sweep) is the floor for every shop; this raises it for one shop
   * whose range is many times a run's budget, so a first full read takes days
   * rather than weeks. It never pads a run with re-reads: with nothing unread
   * left, a run reads only what the due list and the ordinary budget ask for.
   * The shop's own time ceiling still ends a run that asks for more than it
   * can read.
   */
  discoveryPages?: number;
  /**
   * Sitemap URLs the walk starts from. Each must be a sitemap the shop's
   * robots.txt names, or one listed inside such a sitemap, and robots.txt must
   * permit it: the walk checks every URL against robots.txt before asking.
   */
  roots: string[];
  /**
   * A regular expression (source text) a child sitemap's URL must match to be
   * opened. Unset: every child sitemap listed by a root is opened.
   */
  follow?: string;
  /**
   * A regular expression (source text) a page URL must match to be fetched as
   * a product page. This is where a country is pinned: Space NK's pattern
   * starts `^https://www\.spacenk\.com/uk/`, so a /us/ page is never asked for.
   */
  product: string;
  /** Page URLs matching this regular expression are dropped (home fragrance, for example). */
  exclude?: string;
  /** Sitemap fetches allowed for discovery. Default 12, capped at 60. */
  maxSitemaps?: number;
  /**
   * Keep a price only when the page it came from names sterling for it
   * (schema.org `priceCurrency` GBP, or the page's own `og:price:currency`
   * where the markup carries no currency of its own). Set for every shop whose
   * storefront serves more than one currency.
   */
  requireGbp?: boolean;
  /**
   * Regular expressions (source text, one capture group each) read off a
   * product page and appended to its listing's title, for a shop whose
   * structured data names a fragrance without its concentration or size
   * (one shop's microdata says only "Chypre Shot"; the page says "Extrait de
   * Parfum" and "100ml" beside it). Only applied when the page yields exactly
   * one listing, so text is never attached to the wrong product.
   */
  titleParts?: string[];
  /**
   * Read each product through the shop's own product API instead of its
   * page. Only 'beauty-bay-api' exists (src/catalogue/beautyBayApi.ts): Beauty
   * Bay's pages are an empty app shell and the price arrives from that API.
   * The API host's own robots.txt is read before it is asked anything.
   */
  pageReader?: 'beauty-bay-api';
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
  /**
   * This shop files a perfume under its own product type "Fragrance", and every
   * perfume of its own that names a strength names Eau de Parfum, so a perfume
   * the shop types "Fragrance" but whose title names no strength is read as Eau
   * de Parfum. Beauty Pie only: its "Le Smash Santal 50ml" (£59) is typed
   * Fragrance and carries no strength word in its title, so it was read, sized
   * and still hidden, and all 11 other perfumes it types Fragrance say "Eau De
   * Parfum" in their titles (checked 2026-10-04).
   *
   * Never inferred from the shop or its product types: it is a statement a
   * human makes after reading what that shop's other perfumes say, and it
   * stands only while that stays true. A title that does name a strength keeps
   * it. See `productTypeStatesEauDeParfum` in `src/catalogue/fragranceId.ts`.
   */
  fragranceTypeIsEauDeParfum?: boolean;
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
   * Which of a Shopify product's variants are the shop's ordinary UK retail
   * bottles, for a storefront whose `/products.json` lists more than that.
   * Read by `parseShopifyProducts`; see `ShopifyVariantRule`. Unset for every
   * shop whose every variant is a UK bottle, which is all of them but one.
   */
  shopifyVariantRule?: ShopifyVariantRule;
  /**
   * The shop's feed states no bottle size for its perfumes, but each product
   * page does, so the harvest reads the size from the page: per variant, from
   * the page's own variants data, with robots.txt checked for every page and
   * the crawler's honest user agent. See `src/catalogue/productPageSize.ts`.
   * A page that states no size leaves the listing unsized, which the
   * catalogue's size rule then keeps out of every comparison. Needs
   * `shopifyStorefront: true`; set only where a shop has been measured to
   * state sizes on its pages and not in its feed.
   */
  sizeFromProductPage?: boolean;
  /**
   * How old a stored price may get, in hours, before a harvest re-reads its
   * product page. Unset: the sweep's own age (12 on the scheduled run). Set
   * it only for a shop whose range is so large that re-reading all of it that
   * often fills the shop's whole slot of the sweep and leaves nothing for new
   * products (Cult Beauty, about 1,300 listings against a 40 minute slot).
   *
   * It wins over the sweep's `--refresh-after-hours`, because the scheduled
   * workflow passes that for every shop. A price can age past this by the gap
   * to the next sweep before it is re-read, so it is held to
   * `MAX_REFRESH_AFTER_HOURS` (36) in src/catalogue/freshness.ts, which keeps
   * every answering shop inside the 48 hour freshness check
   * (scripts/freshness-check.ts); tests/refreshAge.test.ts enforces it.
   */
  refreshAfterHours?: number;
  /**
   * The shop's titles name no strength (Eau de Parfum, Parfum, Eau de
   * Toilette), but each perfume's product page states it in the theme's own
   * product data, so the harvest reads it from the page and puts it into the
   * title, before the size: one request per perfume page, robots.txt checked
   * for every page, the crawler's honest user agent. See
   * `src/catalogue/productPageStrength.ts` for what is read and what is not.
   * A page that states none leaves the listing as the feed gave it, which the
   * catalogue treats as "Not stated". Needs `shopifyStorefront: true`; set
   * only for a shop measured to state strengths on its pages (Kayali), and
   * only by naming that shop here. It is not inferred from a shop's product
   * type.
   */
  strengthFromProductPage?: boolean;
  /**
   * The shop's `/products.json` calls a Pre-Order bottle available and carries
   * nothing that tells it from one on the shelf, but each product page states
   * it per variant in its JSON-LD (schema.org availability PreOrder beside the
   * variant's own `sku`). The harvest reads that page for every listing the
   * feed calls available and marks the pre-orders, which the site shows as
   * Preorder and never counts as stock. One request per product page,
   * robots.txt checked for every page, the crawler's honest user agent, spaced
   * by the shop's own gap and bounded by the harvest's time budget. See
   * `src/catalogue/productPageAvailability.ts`. A page that cannot be read
   * leaves the feed's word, except that a recent pre-order from an earlier
   * read of that page is kept. Needs `shopifyStorefront: true`; set only for a
   * shop measured to state pre-orders on its pages and not in its feed
   * (Bloom Perfumery), and only by naming that shop here.
   */
  availabilityFromProductPage?: boolean;
  /**
   * This shop's "Travel Spray" variant is the same perfume in a small
   * atomiser, one more size on the perfume's own page (Kayali's "10ml Travel
   * Spray" beside its 100ml, 50ml, "10ml Miniature" and 1.5ml), so the word is
   * a label on the size and not part of the name, and the bottle is a
   * fragrance. Without it the word keeps a listing out of the catalogue
   * (NOT_A_FRAGRANCE) and, if it got in, would stay in the name. Never read
   * for any other shop: where a travel spray is a different article from the
   * plain bottle of the same size (Nina Ricci's L'Air du Temps, two barcodes
   * at 30ml) it must not be folded into it. See `stripSizeLabel` in
   * `src/catalogue/fragranceId.ts`.
   */
  travelSizeIsASize?: boolean;
  /**
   * The owner has decided that this shop's UK storefront price is acceptable
   * even though the shop converts it live from another currency, and has
   * checked what that shop's own cart and checkout charge a UK address.
   *
   * Without this, `readStorefrontCurrency` refuses any storefront that settles
   * in a currency other than GBP or applies a conversion rate other than 1,
   * because a converted figure is not a price list the shop keeps in pounds.
   * With it, that one refusal is waived, and only for a response that says it
   * is the GB market (`Shopify.country` "GB") and quotes GBP. A shop that
   * quotes euros, or any other market, is still refused, and so is a shop that
   * names no market at all.
   *
   * It is a human decision recorded as data, never something a measurement can
   * set: `basis` carries the owner's own check and the date it was made.
   */
  convertedSterlingAccepted?: {
    /** ISO-8601 date of the owner's decision. */
    decidedAt: string;
    /** What the owner checked, in a sentence, with no personal detail. */
    basis: string;
  };
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
   * a default.
   *
   * 2026-09-02: the owner approved it for John Lewis, and it is set on that
   * one shop and no other. Setting it does NOT mean "render this shop every
   * run": ACTOR_TIER_MIN_INTERVAL_HOURS in src/catalogue/renderTier.ts caps
   * one shop to a single actor render per 24 hours, because at the hourly
   * cron this shop's four pages would cost $5.84-$14.60 a month against a
   * $5 pool — more than the whole pool, spent by one shop. Inside that window
   * the shop gets no render at all rather than dropping to the free local
   * tier it is already refused by. Anything added here has to have that
   * arithmetic redone for it; tests/registry.test.ts pins the scope to one
   * shop so a second cannot appear quietly.
   */
  renderTier?: 'actor';
  /**
   * A sitemap route pinned by hand for this one shop. See `SitemapRoute`.
   * Unset for every shop whose generic sitemap walk already works.
   */
  sitemapRoute?: SitemapRoute;
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
   * `demo/app.ts`'s trustpilotWidget only offers the rating widget once this
   * is set, and only for a shop that also has a `trustpilotUrl`. It has to be
   * filled in by hand, one retailer at a time, from the embed snippet
   * Trustpilot generates.
   */
  trustpilotBusinessId?: string | null;
  /**
   * The address of this shop's own page on Trustpilot, which the shop's page
   * links to as "Reviews on Trustpilot". It always has the shape
   * https://uk.trustpilot.com/review/<name>, but the <name> is the one
   * Trustpilot filed the shop under, which is not always the shop's own
   * domain (a www. prefix or another TLD), so it is never derived from
   * `domain`. Set only once the page was fetched and answered 200 and named
   * this shop, with `trustpilotCheckedOn` saying when. Unset means not
   * verified, or no page exists, and then nothing is shown and nothing is
   * guessed. Trustpilot's robots.txt (read 2026-10-04) disallows every path
   * for agents it does not name, PriceSniffsBot among them, so a page that
   * cannot be fetched under it cannot be verified under it either. This is a
   * plain link out, not an affiliate link, and carries no tracking. No score,
   * star rating or review count is ever copied from Trustpilot.
   */
  trustpilotUrl?: string | null;
  /** The date (YYYY-MM-DD) `trustpilotUrl` was last confirmed. Set together with it. */
  trustpilotCheckedOn?: string | null;
  /**
   * This shop's own mark, shown beside its name on the Shops directory row
   * and its profile hero — see docs/LOGOS-PLAN.md. Unset means the monogram,
   * which is the default and needs no field to say so. Not populated as part
   * of adding this type: see the plan's step 5, deferred.
   */
  logo?: LogoRef;
  /**
   * The shop's own square icon, for a shop whose `logo` is a wide wordmark.
   * The wordmark stays in the profile hero; this fills the square slots (the
   * 20px mark on every offer row and the 42px Shops directory tile), which a
   * wordmark cannot fill without being squeezed. Same recording rules as
   * `logo`, and `shape` is always 'square'. Unset means the initials tile.
   */
  squareLogo?: LogoRef;
}
