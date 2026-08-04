# Extraction plan: free methods for the retailer and house crawl

This is a specification, not a status report. It proposes what to build and try
next; it does not claim any of the proposals have been run against a real shop.
This environment's network policy blocks every retailer and house domain — curl
returns `CONNECT tunnel failed, response 403` for all of them — so nothing here
could be live-tested from here. Where a claim needed evidence, it came from
reading the actual code and the actual `data/*.json` output of real CI runs, not
from guessing. Anything not backed by one of those two sources is labelled
**unknown, needs a CI run to confirm**, and stays labelled that way rather than
being asserted.

Evidence read to write this: `src/catalogue/sitemapCrawl.ts`, `jsonld.ts`,
`shopifyJson.ts`, `apifyProxy.ts`, `awinFeed.ts`, `robots.ts`, `attempt.ts`,
`reconcile.ts`, `strategy.ts`, `types.ts`; `scripts/catalogue-harvest.ts`,
`scripts/houses-harvest.ts`; `src/config/retailers.ts`, `src/config/houses.ts`;
`docs/INGESTION.md`, `docs/SPIKE-RESULTS.md`, `docs/LEGAL.md`,
`docs/CATALOGUE.md`, `docs/AFFILIATE_SETUP.md`, `docs/DECISIONS.md`;
`data/house-sourcing-report.json`, `data/strategy-memory.json`; and
`.github/workflows/catalogue-daily.yml`.

---

## 0. What is already built, for a baseline

| Method | Where | Status per the 2026-08-04 CI ground truth |
|---|---|---|
| Sitemap discovery + JSON-LD parse | `sitemapCrawl.ts` + `jsonld.ts` | Working: allbeauty, justmylook, beautybase (3,015 URLs found), lookfantastic |
| Shopify `/products.json` | `shopifyJson.ts` | Working: armaf (252 listings), french-avenue (151) — both non-GBP, so `priceGbp` is null on every row (see §"What it deliberately does not give us" in `shopifyJson.ts`) |
| Awin affiliate feed (CSV/TSV) | `awinFeed.ts` + `scripts/catalogue-feed.ts` | Built and unit-tested against synthetic rows only; the real Fragrance Click UK feed has never been pulled through it |
| Apify residential proxy (retrieval only, same parser) | `apifyProxy.ts` | Built, gated on `APIFY_PROXY_PASSWORD` which is not set; has never run against real Apify infrastructure |
| robots.txt obedience, crawl-delay | `robots.ts` | Working, and correctly conservative — see §4 |

Everything below is additional to this, not a replacement for it.

---

## 1. Five more free extraction methods

Ranked roughly by how much of the current failing set they are likely to help
with, based on what platform each failing shop's markup and headers *might*
indicate — none of this has been confirmed by opening the sites, because this
sandbox cannot reach them.

### 1.1 WooCommerce Store API — `/wp-json/wc/store/v1/products`

**What it is.** WooCommerce ships a public, unauthenticated REST endpoint for
the storefront's own product data — it is what the block-based cart/checkout
UI calls client-side, so it has to work without a key. No plugin config is
required for it to exist; it is core WooCommerce since 5.8 (2021).

**How to detect it applies.**
- `GET /wp-json/` returns a namespace list; look for `"wc/store/v1"` in it.
- Cheaper: probe `GET /wp-json/wc/store/v1/products?per_page=1` directly and
  check for a 200 with a JSON array, rather than fetching the whole namespace
  index first.
- Corroborating signals on the homepage: `<meta name="generator"
  content="WooCommerce ...">`, `wp-content/plugins/woocommerce` in any asset
  URL, a `woocommerce-*` CSS class on the body tag.

**Fields.** `name`, `prices.price` / `regular_price` / `sale_price` (in minor
units, with `currency_minor_unit` telling you how many decimal places — do not
assume 2), `stock_status` (`instock` / `outofstock` / `onbackorder`), `images[]`
(full CDN URLs), `permalink`, `sku`.

**EAN?** No, not by default. WooCommerce core has no barcode field; a GTIN only
appears here if the shop installed a specific plugin (e.g. "EAN for
WooCommerce") *and* that plugin chose to expose it through `meta_data` on this
endpoint, which most do not — `meta_data` on the Store API is filtered to a
short allow-list for privacy reasons, unlike the authenticated Admin REST API.
Treat EAN as absent unless a specific shop is confirmed to expose it.

**Images?** Yes, full-resolution CDN URLs, same posture as every other method
here: link to them live, never rehost (matches the existing rule in
`shopifyJson.ts`'s header comment and `docs/AFFILIATE_SETUP.md`'s image-rights
section).

**Failure modes.**
- Plugin-disabled or old WooCommerce (< 5.8): 404 on the endpoint. Not a
  block, just "this route doesn't apply here" — same as the existing
  `viaShopify` comment in `houses-harvest.ts` treating a Shopify 404 as "not
  Shopify" rather than an error worth logging.
- A firewall/WAF in front of WordPress (common — Wordfence, Sucuri, Cloudflare)
  can still 403 `/wp-json/*` even though WooCommerce itself would answer. This
  is indistinguishable from a bot-wall 403 on any other route and should be
  classified the same way (§3).
- Pagination: `per_page` maxes out around 100; a shop with a large fragrance
  range needs the same budgeted-pages discipline `sitemapCrawl.ts` already
  applies, not an unbounded loop.
- No relation to a WooCommerce shop's sitemap — this is a separate, cheaper
  discovery route that should be tried *before* the sitemap+JSON-LD walk for a
  confirmed WooCommerce shop, since it is structured data in one request
  rather than N page fetches.

None of the eight currently-failing UK retailers are confirmed WooCommerce shops
— **unknown, needs a CI run to confirm** which platform each actually runs on.
This is worth checking first, cheaply, exactly because it's a one-request probe.

### 1.2 Magento / Adobe Commerce public GraphQL — `POST /graphql`

**What it is.** Magento 2 storefronts (a large share of mid-size UK retail,
including many built on Adobe Commerce) expose a GraphQL endpoint that answers
unauthenticated `products` queries by default — it is what the storefront's own
PWA/theme calls to render a category page, so anonymous read access to catalog
data is the normal configuration, not a misconfiguration.

**How to detect it applies.**
- `POST /graphql` with a minimal introspection-free query:
  ```graphql
  { products(search: "a", pageSize: 1) { items { name sku } } }
  ```
  A 200 with a `data.products` shape confirms it; a 404 or a GraphQL error
  about a disabled endpoint rules it out.
- Corroborating signals: `X-Magento-Cache-Debug` response header on any page,
  `Mage.Cookies` / `form_key` cookie, `/static/version*/frontend/` asset paths.

**Fields.** `name`, `price_range.minimum_price.final_price.value` +
`.currency`, `stock_status` (`IN_STOCK` / `OUT_OF_STOCK`), `image.url`,
`sku`, `url_key`. Category browsing is a `categoryList` or
`products(filter: {category_id: ...})` query, so this can replace sitemap
discovery entirely for a confirmed Magento shop.

**EAN?** Only if the shop mapped a GTIN to a queryable custom attribute and
that attribute is included in the schema exposed to `products` — Magento does
not ship a canonical `gtin`/`ean` field. Would need a per-shop `custom_attributes`
query naming the actual attribute code (commonly `barcode`, `ean`, or `gtin`,
but not standardised) — **unknown per shop until the schema is introspected**,
and introspection itself is often disabled in production even when the query
endpoint is open.

**Images?** Yes, CDN URLs.

**Failure modes.**
- Many storefronts disable the GraphQL endpoint for anonymous callers, or rate
  limit it separately from the REST/HTML front door — a 403 here does not
  necessarily mean the whole site is blocking you, it needs to be tried as its
  own attempt rather than assumed to fail alongside `section-plain`.
- Requires a `Store` header (`Store: default` or similar) on some
  multi-storeview installs, or the query silently returns the wrong storeview's
  prices/currency. Worth checking the response currency against what the
  registry expects rather than trusting it blind.
- GraphQL is POST-only with a JSON body, which is a different `Http` shape from
  every existing strategy in `attempt.ts` (all are plain GET). This is a real,
  concrete implementation cost: the `Http` type in `attempt.ts` would need a
  method/body variant, not just a new URL template.

### 1.3 Microdata / RDFa fallback parser

**What it is.** `schema.org/Product` markup the same JSON-LD parser targets,
written in a second, older syntax: HTML attributes (`itemscope itemtype`,
`itemprop`) instead of a `<script type="application/ld+json">` block. Older
CMS themes, some Magento 1 holdovers, and template-generated product pages
still use this exclusively. `jsonld.ts` currently only reads the JSON-LD form
— a page using microdata-only markup parses to zero listings today even though
it is carrying exactly the structured data the project already knows how to
use conceptually.

**How to detect it applies.** A page returns 200, `parseListings()` (JSON-LD)
returns `[]`, and a regex/DOM check finds `itemtype="http://schema.org/Product"`
or `itemtype="https://schema.org/Product"` in the body. Cheap to check
speculatively on every page that JSON-LD came back empty for, since it costs no
extra fetch — same HTML already in hand.

**Fields.** Same conceptual set as JSON-LD: `itemprop="name"`, `"price"` (often
inside a nested `itemprop="offers" itemscope itemtype=".../Offer"` block,
mirroring the `Offer` nesting `jsonld.ts` already handles), `"image"` (as `src`
or `content` depending on the tag), `"sku"`, `"gtin13"`/`"gtin"`, `"availability"`
(a `link`/`meta` tag whose `href`/`content` carries the schema.org URL, same
format `parseAvailability()` already parses).

**EAN?** Yes where the theme includes `itemprop="gtin13"` — same reliability as
JSON-LD's GTIN field, since it is the same underlying vendor obligation to mark
it up, just a different syntax.

**Images?** Yes.

**Failure modes.**
- Microdata is more permissive about nesting than JSON-LD (attributes can
  appear in any DOM order, `itemprop` can repeat), so a regex-only parser will
  be less reliable than a real DOM walk. A lightweight HTML parser (already a
  dependency question — check `package.json` before assuming one needs adding)
  is the honest way to do this correctly rather than a `matchAll` regex that
  half-works on real markup, echoing the same "real markup is messier than the
  spec" lesson `jsonld.ts`'s own header comment already draws for JSON-LD.
- Some sites emit *both* JSON-LD and microdata for the same product (redundant
  by design, for older crawler compatibility). The fallback should only ever
  fire when JSON-LD found nothing, to avoid double-counting or preferring a
  less reliable source when a better one already worked.

This is worth building specifically for **Harvey Nichols and John Lewis**: both
return HTTP 200 with no product markup found by the current JSON-LD parser,
which is consistent with (among other explanations) a theme using microdata
instead of JSON-LD. **Unknown, needs a CI run to confirm** — but it is a
same-cost check against pages already being fetched, so there is no reason not
to add it regardless of which shop it ends up mattering for.

### 1.4 Plugin-exposed Merchant/Shopping XML feed

**What it is.** Many WooCommerce and some Shopify stores run a plugin (e.g.
"WooCommerce Google Product Feed", "AdTribes PPC Feed Manager", Shopify's own
Google & YouTube channel app) that publishes a Google Merchant Center-style RSS
2.0 feed with the `g:` (`http://base.google.com/ns/1.0`) namespace at a
predictable, **unauthenticated** URL — because the entire point of the feed is
for Google's crawler to fetch it without credentials. This is different from
the Google Merchant Center *API*, which needs OAuth; this is the raw feed file
sitting at a public URL the same way a sitemap does.

**How to detect it applies.** No universal path — plugin-dependent. Worth
trying a short list of conventional locations as a low-cost probe:
`/product_feed.xml`, `/feed/google-product-feed`, `/?feed=google_base`,
`/wp-content/uploads/woocommerce-gpf/google.xml`, and checking the homepage
`<head>` for a `<link rel="alternate" type="application/rss+xml">` pointing at
something feed-shaped. A 200 whose root element is `<rss>` with `xmlns:g`
declared confirms it.

**Fields.** `g:id` (merchant SKU), `title`, `g:price` (with currency suffix,
e.g. `"49.99 GBP"` — easy to parse, unlike the sitemap route's currency
ambiguity problem in `shopifyJson.ts`), `g:availability` (`in stock` / `out of
stock` / `preorder`), `g:image_link`, `g:gtin`, `link` (product URL).

**EAN?** Often yes — `g:gtin` is one of Google's two accepted identifier fields
(the other being `g:mpn` + `g:brand` together), and most shops that bother
running a Shopping feed populate it because Google's own feed-quality scoring
rewards it. This is the one candidate method here that could plausibly beat
even JSON-LD's GTIN completeness, *if* a shop happens to expose one.

**Images?** Yes, and specifically curated for the Shopping feed (clean product
shot, often exactly the kind of image `docs/AFFILIATE_SETUP.md` describes
affiliate feed imagery as being — "a real photo of the actual bottle").

**Failure modes.**
- No universal discovery path, unlike a sitemap (which robots.txt reliably
  points at) — this is genuinely a guess-a-short-list method, and guessing
  wrong just yields harmless 404s, no worse than the section-URL guesses that
  already 404 today.
- The feed can silently go stale if the plugin's cron stopped running; there's
  no way to tell freshness from the file alone, so treat prices from this route
  with the same "checked at" timestamp discipline the rest of the project
  already applies, not as guaranteed-live.
- Not every shop runs one. Given none of the failing eight are confirmed to run
  this, this is a speculative, low-effort-to-try / low-confidence-of-hit
  method — worth a short automated probe pass across all shops rather than
  hand-checking each one.

### 1.5 Sitemap completeness: index variants and actual gzip decoding

This extends what is already built rather than adding a new source, and it
surfaced a concrete, verifiable code gap while researching it.

**Untried sitemap root paths.** `sitemapCrawl.ts`'s `discover()` currently
tries only the roots robots.txt declares plus one conventional guess,
`https://www.{domain}/sitemap.xml` (`sitemapCrawl.ts:124`). It does not try
`sitemap_index.xml`, `sitemap-index.xml`, or a platform-specific default like
Magento's `/sitemap/sitemap.xml` or Salesforce Commerce Cloud's
`/sitemap_index.xml` pattern. Cheap to add as further fallback roots, tried
only when the conventional path also fails, so it costs nothing on shops where
`/sitemap.xml` already works.

**The gzip gap.** This is a real bug hypothesis, not a new feature. `isXml()`
in `sitemapCrawl.ts:72` matches `\.xml(\.gz)?` — meaning the crawler will
happily queue a `.xml.gz` sitemap URL it discovers inside a sitemap index. But
every `Http` implementation in this codebase (`catalogue-harvest.ts`'s `http`,
`houses-harvest.ts`'s `http`, `apifyProxy.ts`'s fetch call) does `await
res.text()` with no decompression step — confirmed by grepping the whole repo
for `gzip`/`gunzip`/`zlib`/`inflate` and finding nothing outside an unrelated
PNG-encoding script. A genuinely gzip-compressed sitemap file (as opposed to a
plain-text one merely named `.xml.gz`, and as opposed to `Content-Encoding:
gzip` on the wire, which `fetch` *does* handle transparently) would decode as
garbled binary read as UTF-8 text, and the `<loc>` regex would find zero
matches against it — a `200, 0 urls, no error` result indistinguishable from
"this sitemap genuinely lists nothing we want."

That is exactly the symptom recorded for **Boots**. Large retail platforms
(Salesforce Commerce Cloud, Adobe Commerce, BigCommerce) commonly serve
pre-compressed sitemap indexes by default to save bandwidth on catalogues with
tens of thousands of SKUs. **Unknown whether Boots actually does this — needs a
CI run to confirm** — but it is a concrete, cheap-to-test hypothesis rather
than a guess pulled from nowhere, and fixing it is a small, contained change:
detect the gzip magic bytes (`0x1f 0x8b`) on the raw response and pipe through
Node's built-in `zlib.gunzipSync` before handing the body to the `<loc>`
regex. Worth instrumenting *before* trying anything more expensive against
Boots.

**Extending the affiliate feed parser to other networks.** `awinFeed.ts` reads
Awin's generic datafeed format. Rakuten Advertising, CJ Affiliate, Partnerize
and Tradedoubler (the other four networks `docs/AFFILIATE_SETUP.md` already
names as the UK beauty market's likely remaining coverage) each publish their
own feed export formats — not identical to Awin's, but the same category of
document: a downloadable CSV/TSV/XML a human pulls from a dashboard once
approved. This is not a new *detection* problem (there's no live-crawlable
signal; it's a business-development/approval question exactly like Awin), it's
the same feed-ingestion architecture `awinFeed.ts` + `catalogue-feed.ts`
already prove out, needing one column-mapping module per network once a shop
on that network is actually approved. Not worth building speculatively before
any of the eight failing retailers is confirmed to be on one of these networks
— **the audit in `docs/AFFILIATE_SETUP.md`'s "not researched" list is the
actual blocking step**, not the parser.

---

## 2. The eight failing UK retailers: ranked next actions

Ranking is by likelihood of success given the evidence, not by ease alone —
though for the two Awin-confirmed shops those happen to coincide.

### Superdrug — hard 403 on every strategy including `homepage-probe`

Confirmed Awin merchant, `status: 'not-applied'` (`src/config/retailers.ts:398`).
Programme excludes coupon/cashback/deal sites but explicitly not comparison
sites — `docs/AFFILIATE_SETUP.md` already flags the framing to use.

1. **Apply to the Superdrug Awin programme now.** Highest-confidence action on
   this whole list: the merchant relationship is already confirmed, only the
   application is missing, and per `docs/INGESTION.md` this is "paperwork, not
   engineering." Solves EAN, images and price in one step, and stops all
   further scraping attempts against a shop that has 403'd every single free
   strategy tried so far, including a plain homepage GET.
2. If declined or pending a long time: no further scraping is recommended (see
   §4) — a shop 403ing `section-plain`, `section-browser-headers`,
   `sitemap-discovery`, `search-page` *and* `homepage-probe` uniformly is
   showing IP/network-level bot mitigation, not a fixable URL problem. This is
   the textbook case for the Apify residential-proxy fallback that already
   exists in the code, gated on paying for it.

### Boots — sitemaps fetch fine, zero matching product URLs, no error

Also a confirmed Awin merchant, `awinPending('2041')`
(`src/config/retailers.ts:202`).

1. **Apply to the Boots Awin programme now.** Same reasoning as Superdrug —
   already the confirmed route, sidesteps the sitemap puzzle entirely.
2. **In parallel (cheap, and useful even after the feed lands, since a feed
   application can still be rejected): test the gzip hypothesis from §1.5.**
   Add gzip-magic-byte detection to the sitemap fetch path and re-run the
   harvest. If Boots's sitemap index does serve `.xml.gz` children, this alone
   could fix it for free.
3. **If gzip isn't the cause, add a diagnostic log of "near misses":** when
   `discover()` finds sitemap children whose names don't match `PRODUCT_SITEMAP`
   or `SCENT`, log the raw filenames it saw and didn't descend into (to CI
   output or a small report file). Boots's PIM may use a naming convention the
   current regex genuinely doesn't anticipate, and this sandbox cannot open
   Boots's actual sitemap index to find out by inspection — a targeted log from
   a real CI run is the only way to see it without guessing blind.

### Notino UK — 403 on `/sitemap.xml`, described as intermittent

No affiliate programme researched yet (`docs/AFFILIATE_SETUP.md`: "not
researched").

1. **Affiliate audit first.** Notino is a large multinational retailer;
   check Awin, Rakuten, CJ, Partnerize and Tradedoubler for a UK programme
   before spending more engineering effort. Unlike the other 403'd shops,
   *some* of Notino's requests apparently succeed ("intermittently"), which
   points at rate-based mitigation rather than a blanket IP ban — a feed still
   sidesteps the question entirely and is worth checking first regardless.
2. **If no programme exists:** the "intermittent" framing is itself
   diagnostic and already loggable from existing data. `data/strategy-memory.json`
   records `attempts`/`successes` per strategy per shop over time — plot
   Notino's 403 rate against `minRequestGapMs` and time-of-day across several
   real hourly runs (the schedule already runs every hour per
   `.github/workflows/catalogue-daily.yml`) to see whether a longer gap
   (`retailer.catalogue.minRequestGapMs` is currently 1500ms) measurably
   reduces the block rate before concluding it's unfixable. This is testable
   with data the project is already collecting, not a new experiment.

### The Fragrance Shop — hard 403 on every strategy including `homepage-probe`

No affiliate programme researched yet.

1. **Affiliate audit.** Same posture as Superdrug: a uniform 403 across every
   free strategy, including a bare homepage fetch, is IP-reputation or WAF
   fingerprinting rather than a URL problem a code change can fix.
2. **If no programme:** last-resort candidate for the metered proxy, same
   caveat as Superdrug in §4 about not escalating past a repeated, explicit
   refusal without weighing the posture question first.

### The Perfume Shop — hard 403 on every strategy including `homepage-probe`

Identical situation and identical recommended order to The Fragrance Shop.
No affiliate programme researched yet — audit first, proxy only as a
last resort with the same posture caveat.

### Selfridges — hard 403 on every strategy including `homepage-probe`

No affiliate programme researched yet. Department stores in the UK are less
uniformly on Awin than pure-play beauty retailers; worth checking Rakuten
Advertising and Partnerize specifically, both of which are more common among
department-store-scale UK retailers than Awin is.

1. **Affiliate audit**, Rakuten/Partnerize first given the retailer type.
2. **If no programme:** proxy last resort, same posture caveat.

### Harvey Nichols — HTTP 200 everywhere, 404 on `/sitemap.xml`, robots.txt declares no sitemap

This shop is *not* being blocked — every strategy including the configured
section URL returns 200. The problem is discovery and/or parsing, both cheap
to iterate on:

1. **Try `/sitemap_index.xml`, `/sitemap-index.xml`, and the Salesforce
   Commerce Cloud-conventional `/sitemap_index_1.xml`** as further fallback
   roots (§1.5). SFCC is common among boutique/department-store sites of this
   scale; worth checking response headers (`Set-Cookie: dwsid=...`,
   `X-Powered-By`) for an SFCC fingerprint before guessing paths blindly.
2. **Re-parse the already-fetched homepage response for a `<link rel="sitemap">`
   tag** — the `homepage-probe` strategy already fetches this page and gets a
   200; nothing currently looks at it for a self-declared sitemap URL, only for
   JSON-LD. Zero extra fetches to add this check.
3. **Add the microdata fallback parser (§1.3) and try it against the
   configured section URL.** A 200 with no JSON-LD but real product content on
   the page is consistent with either a microdata-only theme or a
   client-side-rendered grid; microdata is the cheaper hypothesis to rule out
   first since it needs no new infrastructure, only a new parser.
4. **If none of the above finds anything: check for an inlined JSON state
   blob** (`<script id="__NEXT_DATA__">`, `window.__INITIAL_STATE__`, or
   similar framework convention) in the already-fetched section page. Many
   SPA storefronts render the grid client-side but still ship the full product
   list as embedded JSON for hydration — reading that JSON directly is a
   zero-cost alternative to standing up a headless browser, and should be
   tried before reaching for one.

### John Lewis — robots.txt-declared `/siteindex.xml` times out (transport 0)

1. **Confirm whether the conventional `/sitemap.xml` fallback already works
   under the *current* code.** The `strategy-memory.json` record showing
   `sitemap-discovery: HTTP 200, 0 listings` for John Lewis
   (`data/strategy-memory.json:339-349`) is from the older probe path in
   `attempt.ts`'s `viaSitemap`, which requires a URL itself to say
   "fragrance/perfume" — it predates `sitemapCrawl.ts`'s generic
   product-sitemap fallback (the one whose header comment explicitly credits
   fixing this exact symptom for Boots and Harvey Nichols). John Lewis has
   never been tried against the newer generic-fallback code. **Unknown, needs
   a CI run of `npm run harvest --shop=john-lewis` to confirm** whether the
   fix that already helped two other shops also helps this one for free.
2. **Stop spending the fetch timeout budget on `/siteindex.xml`.** It times
   out (transport 0) rather than erroring fast, which burns the request's full
   timeout window for no benefit every single run, on a path that has never
   once worked. Add a per-host or per-URL skip-list (or: try the conventional
   root *first* and only fall back to a robots-declared root that has
   previously timed out), so a known-dead endpoint stops being retried at full
   cost every hour.
3. **Affiliate audit** — John Lewis Partnership has historically run
   affiliate programmes; not currently researched in `docs/AFFILIATE_SETUP.md`
   and worth a look given the site's Cloudflare-fronted reputation noted
   directly in the registry comment (`src/config/retailers.ts:290`).

### A note on lookfantastic (working, but worth hardening)

Not one of the eight, but named as "intermittently" 403 in the same breath.
It already works via sitemap+JSON-LD and is a confirmed Awin merchant,
`status: 'not-applied'` (`src/config/retailers.ts:362`). Same recommendation
as Boots and Superdrug: applying converts an intermittently-blocked free route
into a reliable, EAN-and-image-bearing one, and is worth doing even though the
free route already partly works.

### The three failing Middle Eastern houses

These are a different category of failure — platform/data problems, not bot
walls — and none of the fixes above apply directly.

**Rasasi** — both `/products.json` (HTTP 500) and `/sitemap.xml` (HTTP 500)
failed with a server error, not a block. Per `robots.ts`'s own stated
philosophy ("a struggling server is not an invitation"), correctly held off
rather than guessed at.

1. Retry on the next scheduled run — a 500 on *both* independent endpoints in
   the same run smells like the origin was down or mid-deploy, not a
   structural problem. This needs no code change, only patience the hourly
   schedule already provides.
2. If 500s persist across multiple runs: **verify the platform assumption
   itself.** `routes: ['shopify-products-json', 'sitemap-jsonld']`
   (`src/config/houses.ts:79`) assumes Rasasi is Shopify or at least
   sitemap-bearing; a 500 on `/products.json` could equally mean this is not a
   Shopify storefront at all — a real Shopify shop with no fragrance in the
   theme would 404, not 500. Add a lightweight platform fingerprint (Shopify
   asset domain `cdn.shopify.com`, `Shopify.shop` global, `X-ShopId` header) on
   the homepage before continuing to try Shopify-specific routes against it.
3. Try the apex domain (`rasasi.com`) alongside `www.rasasi.com` — the
   existing alternate-origin retry in `houses-harvest.ts:204-219` only
   triggers when robots.txt is *unreachable*, not when the platform routes
   themselves 500 while robots.txt is fine. Worth extending that retry
   condition, or trying it manually first.

**Afnan (`afnanperfumes.com`) and Al Attaar (`alttaffa.com`)** — robots.txt
unreachable at both `www.` and apex for each. The registry's own comment on
Al Attaar already flags the likely real cause: *"the house also trades as Al
Attaar and Lattafa, which are different businesses"* (`src/config/houses.ts:119`).

1. **This is a data problem, not a crawling problem — no amount of retry
   logic fixes a wrong domain.** Before any further engineering, confirm each
   house's actual storefront domain independently (a web search, a company
   registry lookup analogous to the Companies House cross-check already done
   for Fragrance Click UK in `src/config/retailers.ts:533-536`, or simply
   asking someone who knows the brand) rather than guessing at domain
   spelling variants.
2. Once a confirmed domain is in hand, no code change is needed — the existing
   `robotsFor`/alternate-origin logic in `houses-harvest.ts` will pick it up
   the same way it does for every other house.

---

## 3. Error-handling: classifying failures correctly

The one rule every class below has to respect: **absence is never delisting
evidence unless the walk was complete.** `reconcile.ts`'s `complete` flag
already enforces this at the data layer — nothing proposed here should ever
call `reconcile()` with `complete: true` off the back of a run that hit any of
the failure classes below partway through.

| Class | Example | Correct response | Already implemented where |
|---|---|---|---|
| **Hard block** | HTTP 403, 429 | Stop the walk for this shop this run (don't burn budget retrying a wall). Record it. Escalate to the fallback ladder (§5) rather than retrying the same free route harder. Never treat as delisting evidence. | `sitemapCrawl.ts:235-238` already stops early on 403/429 mid-walk |
| **Soft miss** | HTTP 404 on one specific sitemap/endpoint path | Not a shop-level refusal — try the next candidate path (§1.5's alternate sitemap roots). Only becomes meaningful if *every* candidate path 404s. | Partially — `viaShopify` in `houses-harvest.ts:101-106` already treats a 404 as "not this platform" rather than an error |
| **Transport failure** | Status 0, `AbortError`, connection timeout, DNS failure | Treat as "server unreachable," which per RFC 9309 §2.3.1.4 means *fail closed* — same posture `robots.ts`'s `UNREACHABLE_ROBOTS` already takes for robots.txt itself. Retry next scheduled run; never infer permission or absence from it. | `robots.ts:30-41` (for robots.txt specifically) — the same posture should extend to product/sitemap fetches, and mostly already does via the generic non-`ok` branch |
| **Empty-but-OK** | HTTP 200, zero matching URLs or listings, no error | **Not an error and not delisting evidence** — but also not something to silently accept. Trigger the cheaper diagnostic passes first (microdata fallback, near-miss logging, gzip check) before concluding the route genuinely doesn't apply. | `sitemapCrawl.ts`'s own header comment describes exactly this trap for Boots/Harvey Nichols and the generic-sitemap fix it added in response |
| **Server fault** | HTTP 5xx | Same posture as transport failure: hold off, don't retry immediately, don't treat as permission or absence. A struggling server is not an invitation (quoting `robots.ts:6-7`'s own framing, which should generalise past robots.txt itself). | `robots.ts:83-84`, `loadRobots` in `attempt.ts:82-84` |

A finer distinction worth adding to the existing model: **a 403 on
`robots.txt` fetched with an honestly-identified bot user-agent
(`pricesniffsbot`, see `robots.ts:6` and `attempt.ts:28`) is a stronger refusal
signal than a 403 on a page fetched with browser-disguised headers.** The
former is a shop actively telling an identified, well-behaved crawler no; the
latter could just be generic bot mitigation that doesn't distinguish. The
current code does not weight these differently — both currently just produce
`UNREACHABLE_ROBOTS`/a failed attempt. Worth carrying that distinction forward
into whatever decides "is this shop a proxy candidate", since continuing past
an explicit refusal to an identified crawler is the more serious of the two
(see §4).

```
// Illustrative only — not proposing a specific function signature, the
// existing code already has several converging near-equivalents
// (robots.ts's unavailable/NO_RESTRICTIONS split, attempt.ts's ruleOut,
// strategy.ts's ruledOut). Any real implementation should unify with those
// rather than add a fourth parallel classification.
function classify(res: HttpResponse): FailureClass {
  if (res.status === 403 || res.status === 429) return 'hard-block';
  if (res.status === 404) return 'soft-miss';
  if (res.status === 0) return 'transport';
  if (res.status >= 500) return 'server-fault';
  if (res.ok && listingsFound === 0) return 'empty-but-ok';
  return 'ok';
}
```

---

## 4. Rate limiting and legal compliance, per method

### robots.txt and crawl-delay — what is already right, and one gap

`robots.ts`'s RFC 9309 handling is correct and, if anything, conservative in
the right direction: a 5xx or network failure on robots.txt means *fail
closed* (`UNREACHABLE_ROBOTS`), not "assume permission" — getting this
backwards previously and silently disabling five shops is exactly the kind of
mistake this posture prevents recurring. `isAllowed()`'s longest-match-wins,
`Allow`-beats-`Disallow`-at-equal-length resolution matches how major crawlers
resolve it. `crawlDelaySeconds` is honoured as a floor against the configured
`minRequestGapMs` (`catalogue-harvest.ts:85-88`).

**One real gap:** `sitemapCrawl.ts`'s `discover()` (the up-to-12-fetch sitemap
walk, `sitemapCrawl.ts:141-171`) has no `sleep()` between its own requests —
only the later per-product-page loop in `crawlViaSitemap` applies `gapMs`
(`sitemapCrawl.ts:246`). Twelve requests fired back-to-back is a small burst,
and a site's crawl-delay obligation applies to every resource on the site, not
only the ones this project happens to consider "the interesting part." Worth
adding the same gap to `discover()`'s loop — small, contained fix, no
behavioural change beyond spacing out an already-existing set of requests.

### Politeness across the new methods

- **WooCommerce Store API / Magento GraphQL:** these are single structured
  requests per page of results rather than a page fetch per product, so they
  are *more* polite than the equivalent sitemap+JSON-LD walk for the same
  catalogue size, not less — same economic logic `docs/INGESTION.md` already
  applies to why category-page crawling beats per-product crawling.
- **Merchant/Shopping feed probing (§1.4):** the discovery step itself tries
  several guessed paths, most of which will 404. Keep this list short (the four
  or five paths named in §1.4) and run it once per shop, not on every crawl —
  cache which path worked (or that none did) the same way `strategy-memory.json`
  already caches per-strategy outcomes, rather than re-guessing hourly.
- **Affiliate feeds (any network):** no live-traffic politeness question at
  all once approved — a feed pull is a scheduled download from a URL/API the
  network itself rate-limits and expects to be called, not a page-by-page
  crawl of the retailer's site.

### The legal line: reading a published document vs circumventing a control

This needs to be precise, because "free method" and "permissible method" are
not the same test, and the task's core ethos — absent rather than invented —
extends naturally to: *permitted rather than obtained by force.*

**On the permissible side of the line**, and nothing here should be treated as
requiring further justification beyond what already exists in the codebase's
own reasoning:

- Fetching a sitemap, `robots.txt`, or a `/products.json`-style public API that
  the platform vendor itself documents as intended for anonymous, unauthenticated
  access. These are published *by design* for exactly this kind of consumption
  — a sitemap exists because the site wants crawlers to use it instead of
  guessing paths, precisely the point `sitemapCrawl.ts`'s own header comment
  makes.
- Reading JSON-LD/microdata/OpenGraph markup a page serves to every visitor,
  bot or not — this is public-facing content, not a protected resource.
- Pulling an approved affiliate feed — this is data the retailer has
  contractually agreed to hand to approved publishers; there is no question to
  weigh here at all.
- Respecting a 403/disallow as an answer and routing around it *by asking a
  different, permitted source* (a feed, a different network) rather than by
  forcing the same blocked path.

**On the side to recommend against**, matching what the task explicitly asked
to flag:

- **Anything marketed as defeating a WAF/bot-mitigation challenge** —
  `docs/INGESTION.md`'s own candidate-actor table already names several
  (`h4sh/anti-bot-bypass`, `xtech/cloudflare-scraper-pro`) as things to
  *benchmark*, not adopt. This spec goes further: **recommend against ever
  adopting one.** A 403 from Cloudflare/PerimeterX/DataDome is a technical
  access-control decision the site operator made and re-affirms on every
  request; a tool whose entire value proposition is defeating that decision is
  circumventing an access control, not reading published data, and the fact
  that it is offered commercially on a marketplace does not change that
  classification. This is a materially different act from what Apify Proxy (as
  currently integrated) does — that integration only changes the *IP address*
  a normal, honest HTTP request originates from; it does not solve CAPTCHAs,
  spoof browser fingerprints, or execute JS to defeat a challenge. Keep that
  distinction sharp if the proxy integration is ever extended: adding
  fingerprint-spoofing or CAPTCHA-solving to it would cross the same line the
  candidate actors already sit on the wrong side of.
- **Continuing to retry a shop from any address, proxied or not, after it has
  403'd an honestly-identified bot user-agent specifically** (the finer
  distinction from §3). That is not ambiguous bot mitigation catching a
  datacentre IP by accident — it is closer to an explicit refusal to a party
  that identified itself, and `docs/INGESTION.md`'s own "posture" section
  already says the quiet part: *"Continuing to hammer them from rotating
  residential addresses is technically possible and is the sort of thing that
  reads badly in a dispute."* This spec agrees and generalises it: escalating
  past an explicit refusal is a legal-exposure decision, not an engineering
  one, and specifically under the UK's **Computer Misuse Act 1990**, whether a
  403 constitutes withdrawal of authorisation to access a computer system is a
  live, unsettled question rather than a solved one — worth a real legal
  opinion before ever routing a genuinely-refused shop through the proxy at
  scale, not an engineering judgement call.
- **Downloading and rehosting product images**, rather than linking to the
  retailer's own hosted copy. Every method proposed above (and every existing
  one) treats `imageUrl` as a live reference, never a copy — consistent with
  both `shopifyJson.ts`'s explicit statement of this and the Awin Terms
  language quoted in `docs/AFFILIATE_SETUP.md` ("may not hard code the
  creative into their sites"). Worth restating here because it is exactly the
  kind of shortcut a "just make it work" instinct reaches for.
- **Treating "we can technically reach it" as "we are entitled to keep all of
  it."** The UK/EU sui generis database right protects against extracting or
  re-utilising a *substantial part* of a protected database through repeated
  systematic extraction of insubstantial parts, even where each individual
  request is itself lawful. The existing budgeted-crawl design (a fixed
  `maxPages` per run, sampling rather than exhaustively mirroring a catalogue)
  is the right shape to stay clearly inside that line, and any change that
  removes the budget cap "to get more coverage" should be weighed against this,
  not only against cost.

**Genuinely open, not resolved here:** whether a specific retailer's Terms of
Use separately prohibit automated access even where `robots.txt` is silent.
`robots.txt` compliance and ToS compliance are two different questions, and
this codebase currently only checks the former. `docs/LEGAL.md` already flags
that the site's own legal pages are drafts needing a solicitor's review before
launch — the same caveat should extend to the ingestion strategy as a whole
before this project is crawling at any real scale: **this is a "get it
reviewed" item, not a "the code already handles it" item.**

---

## 5. Fallback ladder, cheapest and most-permissible first

A single ordering, applied per shop, stopping at the first step that returns
priced listings:

1. **robots.txt-declared sitemap**, honouring its own `crawl-delay`.
2. **Conventional and platform-specific sitemap path variants** (§1.5):
   `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml`, decompressing
   `.xml.gz` where the magic bytes say it's real gzip.
3. **A confirmed-applicable public platform API**: Shopify `/products.json`
   (built), WooCommerce Store API (§1.1), Magento public GraphQL (§1.2) — try
   only after a cheap platform fingerprint confirms it's worth trying, not
   speculatively against every shop.
4. **JSON-LD (built), then microdata (§1.3) as a same-page fallback**, on
   whatever product pages the discovery step above found.
5. **A plugin-exposed Merchant/Shopping XML feed** (§1.4), tried against a
   short list of conventional paths, cached once known either way.
6. **An approved affiliate network feed** (Awin built; Rakuten/CJ/Partnerize/
   Tradedoubler need the audit `docs/AFFILIATE_SETUP.md` already calls for).
   Requires approval, which is a business-development step with real lead
   time, but once granted it is the highest-quality source (EAN, licensed
   images, no crawling at all) and should pre-empt every step above it for any
   shop it's live for — exactly the existing `adapter: 'affiliate-feed'`
   short-circuit in `catalogue-harvest.ts:71`.
7. **Metered residential proxy retrieval of category pages only** (built,
   unverified against real infrastructure), reserved for shops that: have no
   applicable affiliate programme, have refused every free route, and have not
   403'd an honestly-identified bot user-agent specifically (§4's finer
   distinction) — that last condition is a recommended addition to the
   existing `useProxy` gate in `catalogue-harvest.ts:109`, not something it
   currently checks.
8. **Never:** CAPTCHA-solving or browser-fingerprint-spoofing bypass services;
   continuing to retry a shop that has explicitly refused an identified
   crawler; rehosting images; removing the budget cap to extract more of a
   catalogue than sampling requires.

### Per-segment shape

| Segment | Typical platform | Ladder emphasis |
|---|---|---|
| UK high-street/beauty retailers (the 13 in `retailers.ts`) | Mixed: custom platforms, several Cloudflare-fronted, at least three confirmed Awin | Steps 1–2 first (cheap, already partly working); step 6 is unusually high-value here specifically because three of the eight failures already have a confirmed merchant relationship sitting unused |
| Middle Eastern houses (the 5 in `houses.ts`) | Mostly Shopify-adjacent, unconfirmed | Step 3 (Shopify `/products.json`) first, per the existing `routes` ordering in `houses.ts`; steps 1–2 as the built-in fallback; step 6 essentially unavailable (no UK affiliate relationship to a Dubai/Sharjah-based house) — the real blocker for houses is currency (§ `shopifyJson.ts`'s `nativePrice` handling), not discovery |

---

## Summary table: field coverage by method

| Method | Price | Stock | Images | EAN/GTIN | Cost | Status |
|---|---|---|---|---|---|---|
| Sitemap + JSON-LD | Yes | Yes | Yes | Often | Free | Built, working on 4 shops |
| Shopify `/products.json` | Yes (native currency) | Yes | Yes | **No** (Admin API only) | Free | Built, working on 2 houses, non-GBP |
| WooCommerce Store API | Yes | Yes | Yes | Rarely (plugin-dependent) | Free | Proposed |
| Magento public GraphQL | Yes | Yes | Yes | Sometimes (custom attribute, unconfirmed per shop) | Free | Proposed |
| Microdata/RDFa fallback | Yes | Yes | Yes | Often | Free | Proposed |
| Merchant/Shopping XML feed | Yes | Yes | Yes | Often | Free | Proposed, no reliable discovery path |
| Awin affiliate feed | Yes | Yes | Yes | Usually | Free (after approval) | Built, untested against real data |
| Other affiliate networks | Yes | Yes | Yes | Usually | Free (after approval) | Not built, needs per-network parser once approved |
| Apify residential proxy | Yes | Yes | Yes | Same as whatever it's paired with (JSON-LD here) | ~£20–25/month | Built, unverified against real infrastructure |
