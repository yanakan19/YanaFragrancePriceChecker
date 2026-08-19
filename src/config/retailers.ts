import type { Retailer } from '../types/retailer.js';
import { brandKey } from '../catalogue/brandName.js';

/**
 * The PriceSniffs retailer registry.
 *
 * 58 retailers, 33 of them `enabled: true`. Every one of them is a legitimate
 * stockist and every one is fine to send a customer to — see the header
 * comment in `src/types/retailer.ts` for why there is no `trusted` flag here
 * and what replaced it.
 *
 * Counts in this header are asserted by `tests/registry.test.ts`, so a header
 * that has drifted from the array below fails the build rather than quietly
 * misdescribing it. It said "Nineteen UK retailers" until 2026-08-13, when
 * there were 55 — that is what this note is guarding against.
 *
 * "UK retailers" is not quite what this list is, either. Most are UK
 * storefronts; several are not (Nicchia Luxury is Italian, Paco Perfumerias
 * Spanish, Beauty The Shop ships from Madrid). What every *enabled* entry has
 * in common is that it sells to UK customers and its prices reach us in
 * sterling — which is a claim about each shop that has to be established, not
 * assumed, and the subject of the CURRENCY_UNCONFIRMED list at the foot of
 * this file.
 *
 * ── Shipping figures ─────────────────────────────────────────────────────────
 * `verifiedAt` and `confidence` are load-bearing. Delivery terms change without
 * notice, and a stale threshold produces a wrong delivered price, which is the
 * single most damaging kind of error this app can make. Entries marked
 * `unverified` were sourced indirectly and must be confirmed against the
 * retailer's own delivery page before the delivered-price sort is trusted in
 * production. `npm run shipping:staleness` lists what needs re-checking.
 *
 * `standardGbp: null` says "this shop has never published a flat standard
 * rate". Such a shop may be enabled: its offers carry no delivered price at
 * all, render as "delivery not stated", and are ranked below every offer that
 * has one, so it can never be presented as the cheapest. What is never done,
 * for any retailer here under any circumstance, is inventing the figure.
 *
 * Only standard delivery is modelled. Express tiers and membership schemes
 * (Boots Advantage, TFS MYTFS, LOOKFANTASTIC Premier, Superdrug Beautycard,
 * Selfridges+) are recorded as footnotes and never priced in — we cannot assume
 * a customer is a member.
 *
 * ── Affiliate ────────────────────────────────────────────────────────────────
 * Six programmes are live and monetised (`status: 'active'`): Fragrance Click,
 * MyBeauty.Boutique, Glorious Beauty, The Beauty Store UK and Nicchia Luxury
 * through Awin, Emirates Oud through its own in-house tool. Their links carry
 * tracking; every other entry's resolve to the plain retailer URL. Ten
 * retailers are confirmed Awin merchants; 22 applications are in flight and 25
 * entries have not been researched at all. See `docs/AFFILIATE_SETUP.md` for
 * how to apply, and `npm run affiliate:status` for the current breakdown —
 * that command reads the array, so it is right when this paragraph is not.
 */

/** Placeholder used for every programme that is not yet live. */
const NO_AFFILIATE_YET = {
  network: null,
  verified: false,
  status: 'not-researched',
  publisherId: null,
  deeplinkTemplate: null,
  querySuffixTemplate: null,
  signupUrl: null,
} as const;

/** A confirmed Awin merchant we have not yet applied to. */
function awinPending(merchantId: string) {
  return {
    network: 'awin',
    verified: true,
    status: 'not-applied',
    publisherId: null,
    deeplinkTemplate: null,
    querySuffixTemplate: null,
    signupUrl: `https://ui.awin.com/merchant-profile/${merchantId}`,
  } as const;
}

/**
 * An Awin merchant whose programme has approved us. `merchantId` is that
 * programme's own id (`awinmid`), read off its merchant profile page or the
 * "Get links" panel in the Awin dashboard — never guessed. `publisherId` is
 * the account-wide id (`awinaffid`) from Account details in the Awin
 * dashboard, the same for every approved programme on this account.
 *
 * `imageUsageConfirmed` is deliberately not set here and defaults to unset
 * (falsy) — see the field's doc comment in `src/types/retailer.ts`. Pass it
 * explicitly as `true` only once that merchant's own Terms/Creative tab has
 * actually been read.
 */
/**
 * We have applied to this programme and are waiting to hear back. Distinct
 * from `awinPending` (confusingly named in hindsight — that one means
 * "confirmed Awin merchant, not yet applied"): this is `status: 'pending'`,
 * the enum value for an application actually in flight, sourced from this
 * account's own Awin Activity Stream showing a "requested to join" entry.
 *
 * `merchantId` is optional because the Activity Stream gives only the
 * programme's display name, never its merchant id — that only appears on
 * the merchant's own profile page, which needs a live Awin session to read.
 * Passed when already known from an earlier `awinPending`/`awinActive` call
 * on the same programme; left unset otherwise rather than guessed.
 */
function awinRequested(merchantId: string | null = null) {
  return {
    network: 'awin',
    verified: merchantId !== null,
    status: 'pending',
    publisherId: null,
    deeplinkTemplate: null,
    querySuffixTemplate: null,
    signupUrl: merchantId ? `https://ui.awin.com/merchant-profile/${merchantId}` : null,
  } as const;
}

function awinActive(merchantId: string, publisherId: string) {
  return {
    network: 'awin',
    verified: true,
    status: 'active',
    publisherId,
    deeplinkTemplate:
      `https://www.awin1.com/cread.php?awinmid=${merchantId}&awinaffid={{publisherId}}&ued={{url}}`,
    querySuffixTemplate: null,
    signupUrl: `https://ui.awin.com/merchant-profile/${merchantId}`,
  } as const;
}

/**
 * An in-house affiliate tool (GoAffPro and similar) that tracks purely from a
 * query parameter on the retailer's own product URL — see the doc comment on
 * `AffiliateConfig.querySuffixTemplate` for why this needs its own shape
 * rather than reusing `awinActive`'s.
 */
function inHouseActive(publisherId: string, querySuffixTemplate: string, signupUrl: string | null = null) {
  return {
    network: 'direct',
    verified: true,
    status: 'active',
    publisherId,
    deeplinkTemplate: null,
    querySuffixTemplate,
    signupUrl,
  } as const;
}

export const RETAILERS: readonly Retailer[] = [
  {
    id: 'allbeauty',
    name: 'Allbeauty',
    domain: 'allbeauty.com',
    homepage: 'https://www.allbeauty.com',
    tiers: ['designer', 'niche', 'mideast'],
    enabled: true,
    // Live spike 1 Aug 2026: the old /uk/fragrance URL returned HTTP 200 with
    // no product markup. Confirmed live in a browser 6 Aug 2026: the real
    // page is /collections/fragrance (a Shopify-style collection path) and
    // the grid loads more products by scrolling — genuinely JS driven past
    // the first screen, not just a wrong URL. A plain fetch of the corrected
    // URL may still recover the first batch, since Shopify themes typically
    // server render an initial page for search engines even when later
    // products load on scroll, but that is an expectation, not a confirmed
    // fact, so adapter stays 'unknown' and maxPages stays at 1 until a real
    // run shows what comes back.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 25,
      estimatedDays: [3, 5],
      membershipPerk: {
        scheme: 'myDelivery',
        description: '£9.90/year for unlimited free delivery on any service.',
      },
      verifiedAt: '2026-08-01',
      // Read, and deliberately still unverified. A GitHub runner fetched
      // allbeauty.com/pages/delivery-information (npm run shipping:discover,
      // committed in 47c5356, checkedAt 2026-08-14T09:11:00Z) and it names six
      // different rows all worded "Standard Delivery £X" — £3.95, £6.95,
      // £7.95, £9.95, £11.95 and £14.95 — each paired with its own free-over
      // threshold of £25, £75 or £125. That reads like a destination table,
      // and the extracted text does not say which row is the UK. £3.95 is the
      // only row paired with £25, and £25 is confirmed as the UK threshold
      // twice over ("FREE UK Delivery over £25", and "Free standard delivery
      // on UK orders over £25." on the shipping policy) — which makes £3.95
      // very likely right and still an inference, and an inferred delivery
      // cost is what this field exists to keep out of the "Cheapest" label.
      // What it needs is the page's own UK row, read as a row.
      confidence: 'unverified',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.allbeauty.com/uk/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://allbeauty.com/collections/fragrance', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 1, minRequestGapMs: 1200,
    },
    affiliate: {
      // Applied via Awin's own Activity Stream 2026-08-11, merchant id not
      // yet known — only surfaces once the programme accepts and its
      // profile page becomes readable.
      ...awinRequested(),
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'justmylook',
    name: 'Justmylook',
    domain: 'justmylook.com',
    homepage: 'https://www.justmylook.com',
    tiers: ['designer', 'niche'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 200 but no product markup found. Either
    // the section URL is wrong or the grid is drawn by script.
    adapter: 'unknown',
    // Confirmed on Shopify, and deliberately not switched to it yet — the same
    // call as Beauty Base above, with its own numbers.
    //
    // "Price verification" run 1 (job 94286860783, 2026-08-12) read
    // justmylook.com/products.json: 17,169 products, 117,462 lookup keys, and
    // 1,934 of the 1,941 stored listings keyed to a live variant, so the
    // stored SKUs are this shop's Shopify variant SKUs.
    //
    // Staleness here is milder than Beauty Base's but real: a median 30.0
    // hours, 52.1 at the 90th percentile, up to 173.4, with 39.7% under a day
    // old. Measured cost of it: of the 1,934 keyed listings, 59 disagreed with
    // the live storefront and 11 were overstatements — 3.05% drift, 0.57%
    // overstated.
    //
    // The reason to hold is scale. 17,169 products against 1,941 listings held
    // today is roughly a ninefold expansion of this snapshot, most of it not
    // fragrance, and that is a deliberate decision about crawl budget and repo
    // size rather than a price fix.
    currency: 'GBP',
    shipping: {
      standardGbp: 2.99,
      freeOverGbp: 25,
      estimatedDays: [2, 4],
      // Both figures were held from 2026-08-01 with no recorded source. The
      // shop's own shipping policy has since been read by a machine that can
      // reach it and states them in one sentence, so they are the same two
      // numbers with something behind them. npm run shipping:discover from a
      // GitHub runner, committed in cbf2294 as
      // data/shipping-discovery-report.json, checkedAt 2026-08-15T08:34:07Z.
      // Page still reachable on 2026-08-16, run 31950919159 job 95174128232.
      verifiedAt: '2026-08-15',
      confidence: 'confirmed',
      source: {
        url: 'https://www.justmylook.com/policies/shipping-policy',
        quote:
          'This service is free for orders over £25, orders under £25 will be subject to a £2.99 delivery charge.',
        readAt: '2026-08-15',
      },
      notes:
        'Free next-day (RM24 Tracked) over £80; standard free tier is RM48 Tracked. The same ' +
        'page says both separately — "Justmylook offers free delivery on all UK orders over ' +
        '£25 via Royal Mail 48 Tracked." and "We offer free next-day delivery on all orders ' +
        'over £80 via Royal Mail 24 Tracked." The £80 tier is an upgrade, not the standard ' +
        'rule, and is not modelled. The 2-4 day window is unchanged and still unsourced: only ' +
        'the cost and the threshold were read off the page.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.justmylook.com/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.justmylook.com/collections/fragrance?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1200,
    },
    affiliate: {
      ...NO_AFFILIATE_YET,
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'notino-uk',
    name: 'Notino UK',
    domain: 'notino.co.uk',
    homepage: 'https://www.notino.co.uk',
    tiers: ['designer', 'niche', 'mideast'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // data/strategy-memory.json's most recent probe (2026-08-10) is a clean
    // pattern here, unlike Boots: all five free strategies — section-plain,
    // section-browser-headers, sitemap-discovery, search-page, homepage-probe
    // — returned HTTP 403 every time. This is a straightforward IP-level
    // refusal, not a script-rendered page: robots.txt has never ruled the
    // section URL out (it is reachable in principle, the *request* is what
    // gets refused). apifyProxyHttp's residential proxy (APIFY_PROXY_PASSWORD)
    // is the right first tier for exactly this shape and is already wired
    // generically in scripts/catalogue-harvest.ts against the four sections
    // below, no shop-specific code needed. If a real run shows the proxy
    // alone still 403s — plausible, since a 403 this consistent may be
    // checking more than source IP (TLS fingerprint, header order) — the
    // browser-render tier (APIFY_TOKEN, src/catalogue/apifyActor.ts) is the
    // fallback, because it renders through the same residential proxy inside
    // an actual browser rather than a plain HTTP client. Neither tier has
    // run for real: no Apify credential exists in this environment.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 2.99,
      // Notino has no spend-based free delivery. It gates free postage on
      // specific products and periodic sitewide promotions instead, so a
      // threshold here would systematically understate its delivered price.
      freeOverGbp: null,
      estimatedDays: [3, 4],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes:
        'Evri home £2.99, DPD home £3.49, Evri pickup £2.49. Free delivery is per-product ' +
        'or promotional, not spend-based — model it per offer, not per retailer.',
    },
    // The gendered/niche split below was never confirmed live, only
    // guessed, so it stays rather than being removed on suspicion alone.
    // /fragrance/ was confirmed live in a browser 6 Aug 2026 (stripped of
    // the ad-click tracking parameters it was pasted with) and added
    // alongside it as a general catch-all section.
    catalogue: {
      searchUrlTemplate: 'https://www.notino.co.uk/search.asp?exps={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.notino.co.uk/fragrance/?page={page}', tier: 'designer' },
        { id: 'womens', label: "Women's perfume", urlTemplate: 'https://www.notino.co.uk/perfumes-for-women/?f=page-{page}', tier: 'designer' },
        { id: 'mens', label: "Men's perfume", urlTemplate: 'https://www.notino.co.uk/perfumes-for-men/?f=page-{page}', tier: 'designer' },
        { id: 'niche', label: 'Niche perfume', urlTemplate: 'https://www.notino.co.uk/niche-perfumes/?f=page-{page}', tier: 'niche' },
      ],
      firstPage: 1, maxPages: 80, minRequestGapMs: 1500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'boots',
    name: 'Boots',
    domain: 'boots.com',
    homepage: 'https://www.boots.com',
    tiers: ['designer'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md. Section URL switched
    // 6 Aug 2026 to the fuller /shop-all-fragrance listing (confirmed live
    // in a browser), rather than the narrower landing page previously
    // guessed — this does not change the 403 outcome, which is IP based
    // and happens before the URL is even read.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // The picture is not a clean 403 wall. data/strategy-memory.json's most
    // recent probe (2026-08-10) shows section-plain 403, but
    // section-browser-headers, sitemap-discovery and homepage-probe all came
    // back HTTP 200 with zero listings — the same shape Harvey Nichols and
    // John Lewis show, which their own entries record as a script-rendered
    // grid rather than an IP refusal. Boots may be a mix of both: some
    // requests refused outright, others served a shell page with no product
    // markup until JavaScript runs. Neither strategy has ever ruled the
    // section URL out via robots.txt (only /sitesearch is disallowed, hit by
    // search-page, not this section).
    //
    // Two escalation tiers now exist, both already wired generically in
    // scripts/catalogue-harvest.ts — nothing shop-specific was needed beyond
    // the `catalogue.sections` below, which both tiers reuse as-is:
    //   1. Apify's residential proxy (APIFY_PROXY_PASSWORD) for the 403s.
    //   2. An Apify actor real-browser render (APIFY_TOKEN, see
    //      src/catalogue/apifyActor.ts) for the 200-with-nothing pages.
    // Both are unproven against this shop specifically: no Apify credential
    // exists in this environment, so neither tier has ever run for real. The
    // owner adding either secret to the repo's Actions settings is what
    // turns this from a design into a measurement.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 25,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-01',
      // Read, and deliberately still unverified. boots.com/delivery was
      // fetched by a GitHub runner (npm run shipping:discover, committed in
      // 25fd0a0, checkedAt 2026-08-14T20:33:04Z) and the discovery run itself
      // returned AMBIGUOUS: the page names two delivery charges, £1.00 and
      // £5.75, and two free thresholds, £15 and £25, without the extracted
      // text saying which pairing is standard home delivery. Neither charge is
      // the £3.95 held here. Rather than pick one, this stays unverified —
      // the figure is wrong in a way that needs the page read properly, not a
      // choice made between two numbers on its behalf.
      confidence: 'unverified',
      notes: 'Click & Collect £1.50, free over £15. Cloudflare-fronted — expect a hard scrape.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.boots.com/sitesearch?searchTerm={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.boots.com/fragrance/shop-all-fragrance?pageNo={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 2500,
    },
    // Applied via Awin's own Activity Stream 2026-08-11 — merchant id 2041
    // was already known from the earlier awinPending() confirmation.
    affiliate: awinRequested('2041'),
  },
  {
    id: 'the-fragrance-shop',
    name: 'The Fragrance Shop',
    domain: 'thefragranceshop.co.uk',
    homepage: 'https://www.thefragranceshop.co.uk',
    tiers: ['designer', 'mideast'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md. /fragrance/l added
    // 6 Aug 2026 as a general section confirmed live in a browser; the
    // gendered sections below were never confirmed wrong, so they stay.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // data/strategy-memory.json's most recent probe (2026-08-10): 403 on
    // every free strategy tried (section-plain, section-browser-headers,
    // search-page, homepage-probe), and sitemap-discovery found no fragrance
    // URLs at all rather than a 403 — consistent with a shop that blocks
    // before serving anything, sitemap included. Same clean IP-refusal shape
    // as Superdrug, Selfridges, Notino UK and The Perfume Shop below, not the
    // script-rendered-page shape Harvey Nichols/John Lewis show. The proxy
    // tier (APIFY_PROXY_PASSWORD) is the natural first try, already wired
    // generically against the three sections below; the actor tier
    // (APIFY_TOKEN) is the fallback if a real run shows the block survives a
    // residential IP alone. Neither has run for real — no Apify credential
    // exists in this environment.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.49,
      freeOverGbp: 40,
      estimatedDays: [3, 5],
      membershipPerk: {
        scheme: 'MYTFS / Scentaddict',
        description: 'Free 48-hour express delivery for members.',
      },
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.thefragranceshop.co.uk/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.thefragranceshop.co.uk/fragrance/l?page={page}', tier: 'designer' },
        { id: 'womens', label: "Women's fragrance", urlTemplate: 'https://www.thefragranceshop.co.uk/womens-fragrance?page={page}', tier: 'designer' },
        { id: 'mens', label: "Men's fragrance", urlTemplate: 'https://www.thefragranceshop.co.uk/mens-fragrance?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'the-perfume-shop',
    name: 'The Perfume Shop',
    domain: 'theperfumeshop.com',
    homepage: 'https://www.theperfumeshop.com',
    tiers: ['designer'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md. Section URLs
    // replaced 6 Aug 2026 with the real category-code paths confirmed live
    // in a browser — the generic /womens/c/womens style guessed earlier
    // was less specific than what the site actually uses.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // data/strategy-memory.json's most recent probe (2026-08-10): 403 on
    // every free strategy (section-plain, section-browser-headers,
    // sitemap-discovery, search-page, homepage-probe) — the same clean
    // IP-refusal shape as Superdrug, Selfridges, Notino UK and The Fragrance
    // Shop. The proxy tier (APIFY_PROXY_PASSWORD) is the natural first try
    // and is already wired generically against the four sections below; the
    // actor tier (APIFY_TOKEN) is the fallback if a real run shows the
    // refusal survives a residential IP alone. Neither has run for real — no
    // Apify credential exists in this environment.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.5,
      freeOverGbp: 25,
      estimatedDays: [3, 5],
      membershipPerk: {
        scheme: 'Rewards',
        description: 'Free standard delivery on all orders for Rewards members.',
      },
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Click & Collect is free at any basket value.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.theperfumeshop.com/search?q={q}',
      sections: [
        { id: 'womens', label: "Women's perfume", urlTemplate: 'https://www.theperfumeshop.com/womens/womens-perfume/c/W2001?page={page}', tier: 'designer' },
        { id: 'mens', label: "Men's fragrance", urlTemplate: 'https://www.theperfumeshop.com/mens/mens-fragrance/c/M2001?page={page}', tier: 'designer' },
        { id: 'offers', label: 'Fragrance offers', urlTemplate: 'https://www.theperfumeshop.com/offers/all-offers/fragrance-offers/c/W30050?page={page}', tier: 'designer' },
        { id: 'gift-sets', label: 'Gift sets', urlTemplate: 'https://www.theperfumeshop.com/products/gift-sets/c/GS2001?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'john-lewis',
    name: 'John Lewis',
    domain: 'johnlewis.com',
    homepage: 'https://www.johnlewis.com',
    tiers: ['designer'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 404. The single section URL below was
    // wrong. Replaced 6 Aug 2026 with the real category URLs (confirmed
    // live in a browser), which also turned out to be four separate
    // listings rather than one combined fragrance page.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // `adapter: 'unknown'` was never updated once the 404 above was fixed,
    // and the evidence since does not show a clean bot-defence wall the way
    // Boots or Superdrug do. data/strategy-memory.json's most recent probe
    // (2026-08-10): section-plain and sitemap-discovery both return HTTP
    // 200 (sitemap reaches the file but the fragrance-keyword walk finds
    // nothing on it), while section-browser-headers and homepage-probe both
    // record `AbortError: This operation was aborted` — the probe's own 20s
    // timeout firing, not a refusal. Nothing here has ever produced a 403,
    // and robots.txt has only ever ruled out /search (hit by search-page),
    // never a section URL. That is a materially different signature from
    // this file's other Class-1 shops and reads as "slow to answer" at
    // least as plausibly as "script-rendered" — a genuinely different
    // failure from either, and one a longer plain-fetch timeout might fix
    // for free before any Apify spend. Recorded as a candidate for a
    // cheaper-route recheck, not asserted as bot-defended.
    //
    // If a re-probe with a longer timeout still yields nothing, both
    // Apify tiers apply exactly as designed for the rest of this file's
    // shops: the proxy (APIFY_PROXY_PASSWORD) against whichever section
    // still 403s or times out, the actor real-browser render (APIFY_TOKEN,
    // src/catalogue/apifyActor.ts) against whichever renders a script-only
    // grid. Kept on `adapter: 'proxied'` below to match this file's
    // convention for "known to need paid retrieval", now that the 404 is
    // resolved and this design has actually been done — not because the
    // 403 evidence the other Class-1 shops have has been reproduced here.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 4.5,
      freeOverGbp: 50,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Cloudflare-fronted — pair with Boots as the hard-site benchmark in Phase 0.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.johnlewis.com/search?search-term={q}',
      sections: [
        { id: 'womens', label: "Women's fragrance", urlTemplate: 'https://www.johnlewis.com/browse/beauty/womens-fragrance/_/N-a63?page={page}', tier: 'designer' },
        { id: 'mens', label: "Men's aftershave", urlTemplate: 'https://www.johnlewis.com/browse/beauty/mens-aftershave/_/N-a61?page={page}', tier: 'designer' },
        { id: 'unisex', label: 'Unisex fragrance', urlTemplate: 'https://www.johnlewis.com/browse/beauty/unisex-fragrance/_/N-nx23?page={page}', tier: 'designer' },
        { id: 'gift-sets', label: 'Fragrance gift sets', urlTemplate: 'https://www.johnlewis.com/browse/beauty/view-all-beauty-fragrance-gift-sets/fragrance-sets/_/N-7d54Z1z0g57k?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 50, minRequestGapMs: 2500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'beautybase',
    name: 'Beauty Base',
    domain: 'beautybase.com',
    homepage: 'https://www.beautybase.com',
    // Decision recorded 2026-08-01: included on equal footing with every other
    // entry. It is a legitimate UK stockist with real niche depth (Creed,
    // Xerjoff, Amouage), and under the current model there is no trust flag for
    // it to fail — only the obligation to price it honestly.
    tiers: ['designer', 'niche'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 200 but no product markup found. Either
    // the section URL is wrong or the grid is drawn by script.
    adapter: 'unknown',
    // Confirmed on Shopify, and deliberately not switched to it yet.
    //
    // "Price verification" run 1 (job 94286860783, 2026-08-12) read
    // beautybase.com/products.json: 3,695 products, 22,137 lookup keys, and
    // 3,056 of the 3,058 stored listings keyed straight to a live variant —
    // so this shop's stored SKUs *are* its Shopify variant SKUs, and setting
    // `shopifyStorefront: true` would not orphan a single listing or trigger
    // a mass delist.
    //
    // What it would fix is staleness. The sitemap route re-prices ~28 of this
    // shop's listings per run, so its stored prices are a median 47.3 hours
    // old, 108 at the 90th percentile and up to 265 (measured over all 3,058
    // active listings on 2026-08-12); only 25.2% were under a day old.
    // products.json would re-price every one of them every run, as it already
    // does for Escentual.
    //
    // Left unset because the measured cost of that staleness turns out to be
    // small — the same run compared all 3,056 keyed listings against the live
    // storefront and found 14 disagreements, 9 of them overstatements, 0.46%
    // — while the change itself is large and cannot be rehearsed offline: the
    // endpoint returns the shop's entire catalogue, not just fragrance, so
    // the snapshot would grow severalfold and the harvest's time budget would
    // shift with it. Worth doing deliberately, with a blast-radius diff, not
    // as a side effect of a price-accuracy fix.
    //
    // MARKETS. Checked ahead of that switch, since a Shopify shop that quotes
    // a CI runner a foreign market's list is how Escentual came to publish
    // dollars as pounds. Currency probe, run 31950521787 job 95173173389,
    // 2026-08-16T13:42Z, commit a336322: the plain origin quotes a US GitHub
    // runner GBP, settles GBP, at rate 1, and ?country=GB, both localisation
    // cookies and Accept-Language en-GB return the same currency and the same
    // three prices (40.00, 9.99, 40.00). Nothing here is market-dependent, so
    // turning the flag on would not import that problem. /en-gb, /gb, /uk and
    // /en-uk 404.
    currency: 'GBP',
    shipping: {
      standardGbp: 4.95,
      freeOverGbp: 45,
      estimatedDays: [3, 5],
      // Held from 2026-08-01 with no recorded source, and now read off the
      // shop's own page by npm run shipping:discover from a GitHub runner,
      // committed in 47c5356 as data/shipping-discovery-report.json, checkedAt
      // 2026-08-14T09:11:00Z. The quoted line is an exclusions heading rather
      // than a rate table, and it is still the page naming its own standard
      // UK delivery charge in words: £4.95, or free above the threshold.
      verifiedAt: '2026-08-14',
      confidence: 'confirmed',
      source: {
        url: 'https://www.beautybase.com/policies/shipping-policy',
        quote: '*EXCLUSIONS TO £4.95 OR FREE STANDARD UK DELIVERY CHARGE',
        readAt: '2026-08-14',
      },
      notes:
        'Up to 48h order processing before dispatch — the day window excludes that, and the ' +
        '3-5 day span itself is unchanged and still unsourced. The £45 threshold comes off the ' +
        'same page: "FREE on orders over £45 (please see exceptions below)." Those exceptions ' +
        'are addresses, not products — "LOCATIONS EXCLUDED FROM STANDARD UK DELIVERY ~ These ' +
        'locations carry a charge of £6.99, subject to the items ordered:" — so £6.99 is a ' +
        'surcharge for particular postcodes rather than a second standard rate, and the ' +
        'mainland figure is the one modelled here.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.beautybase.com/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.beautybase.com/fragrance-c1?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: {
      ...NO_AFFILIATE_YET,
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'lookfantastic',
    name: 'LOOKFANTASTIC',
    domain: 'lookfantastic.com',
    homepage: 'https://www.lookfantastic.com',
    tiers: ['designer', 'niche'],
    enabled: true,
    // Live spike 1 Aug 2026 found the old section URL 404ing (fragrance.list
    // no longer exists). Corrected 6 Aug 2026 to the real category path,
    // confirmed live in a browser, not by a fetch from here. Pagination
    // scheme for the new path is not yet known, so maxPages stays at 1 until
    // a run against this URL shows what page 2 actually looks like — a wrong
    // guessed page param is worse than no pagination, since it either wastes
    // requests or silently repeats page one.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 25,
      estimatedDays: [2, 3],
      membershipPerk: {
        scheme: 'Premier Delivery',
        description: '£9.90/year for unlimited free delivery over £10 per order.',
      },
      // Held from 2026-08-01 with no recorded source, and now read off the
      // shop's own delivery page by npm run shipping:discover from a GitHub
      // runner, committed in cbf2294 as data/shipping-discovery-report.json,
      // checkedAt 2026-08-15T08:34:07Z. One sentence carries both figures.
      verifiedAt: '2026-08-15',
      confidence: 'confirmed',
      source: {
        url: 'https://www.lookfantastic.com/c/info/delivery/',
        quote: 'Tracked Delivery - £3.95 or FREE on orders over £25',
        readAt: '2026-08-15',
      },
      notes:
        'Tracked Delivery is the cheapest UK option the page names, so it is the one modelled. ' +
        'Everything else on it is an upgrade or a subscription and is out of scope: "Next Day ' +
        'Delivery - £5.95", "Same Day Delivery £9.95", and Premier Delivery at £9.90 a year ' +
        '(recorded above as a membership perk, not as the standard rate). The 2-3 day window ' +
        'is unchanged and still unsourced — only the cost and the threshold were read.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.lookfantastic.com/elysium.search?search={q}',
      // Full "view all fragrance" URL given directly 2026-08-11, replacing
      // the narrower category page — this field is only read by the Phase 0
      // spike probe and catalogue-fixtures.ts, never the live harvester
      // (crawlViaSitemap discovers real product URLs from lookfantastic.com's
      // own sitemap.xml regardless of what is written here), so this change
      // is documentation accuracy, not a fix to what the daily crawl fetches.
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.lookfantastic.com/c/health-beauty/fragrance/view-all-fragrance/', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 1, minRequestGapMs: 1500,
    },
    affiliate: {
      // Applied via Awin's own Activity Stream 2026-08-11 — merchant id 2082
      // was already known from the earlier awinPending() confirmation.
      ...awinRequested('2082'),
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'superdrug',
    name: 'Superdrug',
    domain: 'superdrug.com',
    homepage: 'https://www.superdrug.com',
    // Niche added 6 Aug 2026 alongside the premium-fragrances section below
    // — without it here too, priceService's tier gate would skip Superdrug
    // for every niche fragrance regardless of what the crawl finds there.
    tiers: ['designer', 'niche'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md. Main section URL
    // confirmed correct in a live browser check 6 Aug 2026, which also
    // surfaced a second, premium-fragrances listing added below.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // data/strategy-memory.json's most recent probe (2026-08-10): 403 on
    // every free strategy (section-plain, section-browser-headers,
    // sitemap-discovery, search-page, homepage-probe). A clean IP-level
    // refusal, not a script-rendered page — the same shape as Selfridges,
    // Notino UK, The Fragrance Shop and The Perfume Shop. Robots.txt has
    // never ruled either section below out. The proxy tier
    // (APIFY_PROXY_PASSWORD) is the natural first try and is already wired
    // generically against both sections; the actor tier (APIFY_TOKEN,
    // src/catalogue/apifyActor.ts) is the fallback if a real run shows the
    // refusal survives a residential IP alone. Neither has run for real —
    // no Apify credential exists in this environment.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 4.5,
      // Non-member threshold. The £20 Beautycard tier is a membership perk and
      // is deliberately not used for the headline delivered price.
      freeOverGbp: 25,
      estimatedDays: [3, 4],
      membershipPerk: {
        scheme: 'Health & Beautycard',
        description: 'Free standard and next-day delivery over £20 for cardholders.',
      },
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Order & Collect is free at any basket value.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.superdrug.com/search?text={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.superdrug.com/fragrance/c/fragrance?page={page}', tier: 'designer' },
        { id: 'premium', label: 'Premium fragrances', urlTemplate: 'https://www.superdrug.com/fragrance/premium-fragrances/c/premium-brands?page={page}', tier: 'niche' },
      ],
      firstPage: 1, maxPages: 50, minRequestGapMs: 2000,
    },
    affiliate: {
      network: 'awin',
      verified: true,
      status: 'not-applied',
      publisherId: null,
      deeplinkTemplate: null,
      querySuffixTemplate: null,
      signupUrl: 'https://ui.awin.com/merchant-profile/search?q=Superdrug',
      notes:
        'Awin-confirmed, ~1.6% commission, 30-day cookie. The programme excludes coupon, ' +
        'cashback and deal sites — PriceSniffs is a comparison site, so expect that question ' +
        'during approval. Lead with the editorial/notes side of the product.',
    },
  },
  {
    id: 'selfridges',
    name: 'Selfridges',
    domain: 'selfridges.com',
    homepage: 'https://www.selfridges.com',
    tiers: ['niche'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md. Section URL
    // independently confirmed correct in a live browser check 6 Aug 2026.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // data/strategy-memory.json's most recent probe (2026-08-10): 403 on
    // every free strategy (section-plain, section-browser-headers,
    // sitemap-discovery, search-page, homepage-probe). A clean IP-level
    // refusal, same shape as Superdrug, Notino UK, The Fragrance Shop and
    // The Perfume Shop. Robots.txt has never ruled the section below out.
    // The proxy tier (APIFY_PROXY_PASSWORD) is the natural first try and is
    // already wired generically against it; the actor tier (APIFY_TOKEN,
    // src/catalogue/apifyActor.ts) is the fallback if a real run shows the
    // refusal survives a residential IP alone. Neither has run for real —
    // no Apify credential exists in this environment.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 6.99,
      freeOverGbp: 100,
      estimatedDays: [2, 4],
      membershipPerk: {
        scheme: 'Selfridges+',
        description: '£10/year for unlimited standard, nominated-day and next-day delivery.',
      },
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes:
        'CONFLICTING SOURCES: the free-delivery threshold is cited as both £100 and £150. ' +
        'Confirm against selfridges.com/GB/en/info/dispatch-delivery/uk-delivery/ before ' +
        'trusting the delivered price for this retailer.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.selfridges.com/GB/en/search/?freeText={q}',
      sections: [
        { id: 'fragrance', label: 'Beauty fragrance', urlTemplate: 'https://www.selfridges.com/GB/en/cat/beauty/fragrance/?pn={page}', tier: 'niche' },
      ],
      firstPage: 1, maxPages: 50, minRequestGapMs: 2500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'harvey-nichols',
    name: 'Harvey Nichols',
    domain: 'harveynichols.com',
    homepage: 'https://www.harveynichols.com',
    tiers: ['niche'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 200 but no product markup found. Either
    // the section URL is wrong or the grid is drawn by script. Re-checked
    // 6 Aug 2026 against a live browser: the URL below is the real page, so
    // the URL was never the problem — the grid genuinely needs JavaScript to
    // render.
    //
    // ── Apify harvest design, reviewed 2026-08-19 ─────────────────────────
    // The "this project has no crawling route for yet" line above is no
    // longer true — that route is src/catalogue/apifyActor.ts, added this
    // review. data/strategy-memory.json's most recent probe (2026-08-10) is
    // this file's cleanest case for it: every one of the five free
    // strategies — section-plain, section-browser-headers, sitemap-discovery,
    // search-page, homepage-probe — returned HTTP 200 with zero listings.
    // Never a single 403, never a robots.txt rule-out. That is the exact
    // signature a script-rendered grid produces and a proxied plain fetch
    // cannot fix, however many IPs it tries, because the response is
    // genuinely empty of markup until JavaScript runs — see apifyActor.ts's
    // own header, which cites this shop as its motivating case. `adapter`
    // changed from 'unknown' to 'headless' to name that specifically, rather
    // than 'proxied', which this file uses for an IP-level refusal Harvey
    // Nichols has never shown. The route itself (browser-render strategy /
    // Apify actor tier) is already wired generically in
    // scripts/catalogue-harvest.ts against the section below — nothing
    // shop-specific needed beyond this comment. Unproven against this shop
    // specifically: no Apify credential exists in this environment, so
    // nothing here has run for real. The owner adding APIFY_TOKEN is what
    // turns this from a design into a measurement.
    adapter: 'headless',
    currency: 'GBP',
    shipping: {
      // Beauty-only baskets get the reduced rate, and a fragrance comparison is
      // by definition a beauty-only basket, so £5.95 is the right figure here
      // rather than the £7.50 general rate.
      standardGbp: 5.95,
      freeOverGbp: 300,
      estimatedDays: [3, 3],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes:
        'General standard delivery is £7.50; beauty-only orders are £5.95. Free over £300 ' +
        'is effectively unreachable on a single fragrance, so this retailer will almost ' +
        'always carry delivery in the delivered-price sort.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.harveynichols.com/search/?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.harveynichols.com/beauty/fragrance/?page={page}', tier: 'niche' },
      ],
      firstPage: 1, maxPages: 50, minRequestGapMs: 2500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'fragrance-click',
    name: 'Fragrance Click',
    domain: 'fragranceclick.co.uk',
    homepage: 'https://www.fragranceclick.co.uk',
    // Their own words, from the programme profile they publish on Awin. Every
    // other retailer here has no blurb because we have no text they wrote.
    blurb:
      'A UK based online fragrance retailer focusing on bestselling fragrances from well known ' +
      'brands, priced below the high street. Every product is brand new, backed by a UK based ' +
      'customer service team.',
    tiers: ['designer'],
    enabled: true,
    // Approved Awin merchant with a live, daily-updated product feed (895
    // SKUs) — the exact case docs/INGESTION.md argues for: take the feed,
    // never build a scraper for a shop that already hands the data over.
    // catalogue stays null deliberately, not as a TODO — there is no
    // sitemap walk to configure here, the feed is the only ingestion route.
    adapter: 'affiliate-feed',
    currency: 'GBP',
    shipping: {
      standardGbp: 0,
      freeOverGbp: 0,
      estimatedDays: [2, 3],
      // Was indirect until 2026-08-14: fragranceclick.co.uk/delivery answered
      // HTTP 403 from the environment this entry was written in, so the figure
      // came from a search-engine summary of that page's own content (title:
      // "Delivery Information | Free UK Shipping | Fragrance Click"). A GitHub
      // runner fetched the page itself — npm run shipping:discover, committed
      // in 25fd0a0 as data/shipping-discovery-report.json, checkedAt
      // 2026-08-14T20:33:04Z — and the page says it in as many words, on both
      // /delivery and /shipping-policy independently.
      //
      // "on All Orders" is what makes 0 safe here rather than a guess at a fee
      // nobody printed: this is the free-with-no-threshold case, which is why
      // freeOverGbp is 0 and not null.
      verifiedAt: '2026-08-14',
      confidence: 'confirmed',
      source: {
        url: 'https://www.fragranceclick.co.uk/delivery',
        quote: 'Free Tracked 48 Delivery on All Orders',
        readAt: '2026-08-14',
      },
      notes:
        'Free UK delivery on every order via Royal Mail Tracked 48 (2-3 days), no minimum ' +
        'spend — so standardGbp is genuinely 0, not a rounding of a small fee. The same page ' +
        'repeats it as "Free Royal Mail Tracked 48 Shipping on Every Order". Paid express ' +
        'tiers exist (Tracked 24 at £1.95, Special Delivery at £9.95) but are not modelled, ' +
        'per this registry\'s standard-delivery-only rule. The 2-3 day window is unchanged and ' +
        'still unsourced.',
    },
    catalogue: null,
    affiliate: {
      ...awinActive('124166', '3017443'),
      // Confirmed against this merchant's own Terms tab in the Awin
      // dashboard, not inferred from programme approval: "Publishers may
      // not alter any of the creative... may not hard code the creative
      // into their sites." That is permission with two conditions, not a
      // prohibition — and both conditions are already how this app treats
      // imageUrl (a live reference, never a downloaded copy). See
      // docs/AFFILIATE_SETUP.md.
      imageUsageConfirmed: true,
      imageBasis: 'affiliate-terms',
      notes:
        'Merchant id 124166, joined 3 Aug 2026. Storefront domain inferred from the ' +
        'programme description and a public company-registry match (Fragrance Click Ltd, ' +
        'Companies House 12092721) — the Awin programme page\'s own "Website" link was ' +
        'blank when checked, so treat the domain as strong-confidence, not confirmed.',
    },
  },
  {
    id: 'mybeauty-boutique',
    name: 'MyBeauty.Boutique',
    domain: 'mybeauty.boutique',
    homepage: 'https://mybeauty.boutique',
    // Their own words, from the programme profile they publish on Awin.
    blurb:
      'MyBeauty.Boutique — your trusted partner for beauty and wellness, with products ' +
      'selected to meet high standards of safety and efficacy, and clear information ' +
      'about ingredients and sourcing.',
    tiers: ['designer'],
    // Disabled until standard delivery is read off their own delivery page.
    // Everything else is ready: the programme is joined and the feed is live.
    enabled: true,
    // 8,908 products in the Awin feed, updated daily — the same case as
    // Fragrance Click, and the reason docs/INGESTION.md puts feeds first.
    // No sitemap walk is configured because the feed is the ingestion route.
    adapter: 'affiliate-feed',
    // The feed is the ingestion route; it is not the price.
    //
    // "Price verification" run 2 (job 94288914961, 2026-08-12) keyed 8,902 of
    // these 8,908 listings to a live variant on mybeauty.boutique's own
    // Shopify storefront, by the exact product and variant id the feed row
    // already carries in merchant_product_id, and compared every one:
    //
    //     agree      2,613  (29.4%)
    //     disagree   6,289  (70.6%)  — 6,245 overstated, 44 understated
    //     median absolute difference £11
    //     total overstatement across the retailer £205,624
    //     worst: Creed White Amber 250ml, we showed £1,797.99, shop
    //            charges £962.99
    //
    // 6,245 against 44 is not a stale snapshot — that drifts both ways
    // evenly. It is the feed systematically publishing above what the shop
    // charges. Separately, 3,370 of those listings are out of stock on the
    // storefront while the feed calls them in stock.
    //
    // The 2,613 exact penny-level agreements are also what rules out the
    // reading that this storefront answers CI in another currency: two
    // currencies do not agree to the penny 2,613 times. Nicchia Luxury shows
    // what that failure actually looks like — 6,844 listings, zero
    // agreements — and is why both scripts now resolve the currency first.
    //
    // See src/catalogue/feedPriceRepair.ts for what this flag does and
    // src/types/retailer.ts for what has to be true before setting it.
    //
    // MARKETS. Not exposed to what caught Escentual, which matters more here
    // than for most: storefrontIsPriceAuthority means this shop's own
    // /products.json overwrites its feed's prices, and scripts/storefront-
    // reprice.ts reads the plain origin without resolving a UK market at all.
    // Currency probe, run 31950525824 job 95173317905, 2026-08-16T13:42Z,
    // commit a336322: the origin quotes a US GitHub runner GBP at rate 1, and
    // ?country=GB, both cookies and Accept-Language en-GB return the same
    // currency and the same prices (23.49, 14.29, 25.99). So the reprice reads
    // the same list a UK shopper sees. Were that ever to change, that script
    // refuses a non-sterling storefront outright rather than repricing from
    // it, which fails safe — but it would stop repricing, not start resolving
    // a market, and that is the thing to fix if this shop ever goes
    // multi-market.
    shopifyStorefront: true,
    storefrontIsPriceAuthority: true,
    currency: 'GBP',
    shipping: {
      // Not established. Their Awin programme terms describe commission and
      // cookie length and say nothing about delivery, and their delivery page
      // has not been read. Null rather than a guess — see the field's doc
      // comment for why zero would have been actively wrong.
      standardGbp: 3.99,
      freeOverGbp: 60,
      // Placeholder, and unreachable while this retailer is disabled. It is
      // not a claim about their delivery speed.
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-05',
      confidence: 'confirmed',
      notes:
        'Read off their own policy page by npm run shipping:discover on 2026-08-05, which quoted '  +
        '"Standard Delivery (0-10kg): £3.99 / 2-5 working days" from '  +
        'https://mybeauty.boutique/policies/shipping-policy, plus free delivery over £60. Express '  +
        'tiers (£4.49, and £5.49 over 10kg) exist and are out of scope for the standard-only model. '  +
        'Weight-banded above 10kg, which this registry cannot express — the £3.99 band covers a '  +
        'fragrance order comfortably.',
    },
    catalogue: null,
    affiliate: {
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
      ...awinActive('106925', '3017443'),
      // Deliberately not set: the merchant's Terms/Creative tab has not been
      // read, so no product photography of theirs may be displayed yet.
      notes:
        'Merchant id 106925, joined 4 Aug 2026. Feed carries 8,908 products, updated ' +
        'daily. 30-day cookie, 14-day auto-validation. Import with ' +
        'npm run catalogue:feed -- --file=<feed.csv> --retailer=mybeauty-boutique',
    },
  },
  {
    id: 'escentual',
    name: 'Escentual',
    domain: 'escentual.com',
    homepage: 'https://www.escentual.com',
    tiers: ['designer'],
    // Off since 2026-08-13, and the reason is now known rather than suspected.
    //
    // What was said on 13 Aug: its prices sat on a foreign scale, roughly 1.44x
    // two UK shops that agreed with each other, and which currency it actually
    // quoted was NOT established because nothing here could reach the shop.
    //
    // What was measured on 15 Aug, from a GitHub Actions runner, which can
    // (currency probe, run 31880556596, job 95002418010, commit a735ef6):
    // escentual.com is a UK shop that SETTLES in GBP and quotes whoever asks
    // in the currency of wherever they are asking from. To that runner it
    // quoted USD at its own published rate of 1.38605, and served 57.00 for
    // the Calvin Klein Obsession 125ml this repo had published as "£57.00".
    // Asked with ?country=GB the same shop, the same endpoint, the same
    // product came back 40.95 GBP at rate 1. So the 8,104 figures were dollars
    // — not a mislabelled foreign price list, but this project standing in
    // Virginia and writing down what it was shown.
    //
    // Note what 40.95 is not: 57 / 1.38605 is 41.12. A Shopify market applies
    // its own rounding, so the shop's GBP list is not its USD list converted
    // back, and nobody may ever "recover" one from the other.
    //
    // src/catalogue/shopifyProductsCrawl.ts can now find that market by
    // itself: where the origin is not established as sterling it tries the
    // ways a UK price list can be addressed and reads the catalogue from the
    // first that proves itself GBP, settling GBP, at no conversion. So this
    // shop is now harvestable in pounds — which is a different thing from
    // being provably safe to publish, and the switch below is still off.
    //
    // What is still not established is what a *checkout* charges, which is the
    // bar CURRENCY_UNCONFIRMED at the foot of this file sets for leaving it.
    // Nothing here has put anything in a basket, and a storefront price list
    // is very strong evidence for that and is not that. Turning this on is a
    // human's call: read the entry at the foot of this file first, and if you
    // make it, harvest before you enable — data/catalogue/escentual.json holds
    // no sterling price today, on purpose.
    //
    // This flag is the second lock, not a duplicate of the first: if the
    // storefront answers GBP at rate 1 to a CI runner, the ingest guard passes
    // and only the price-scale audit would stand between those figures and the
    // site. Two independent things then have to fail rather than one.
    enabled: false,
    // No Awin approval yet, so this is a direct scrape rather than a feed —
    // the requested route for this retailer. No live spike was possible from
    // this environment (network egress to arbitrary hosts is blocked here,
    // see docs/INGESTION.md and the proxy's own status endpoint), so adapter
    // is 'unknown' rather than a claimed spike result. The storefront is
    // Shopify (its pagination follows Shopify's own ?page=N convention).
    // Section URLs below were corrected 6 Aug 2026 against a live browser
    // check — the gendered /collections/fragrances-for-women(-men) paths
    // this config guessed earlier do not appear to be the real ones.
    adapter: 'unknown',
    // The note above already said this storefront is Shopify, but nothing
    // acted on it: without this flag the harvest only ever ran the generic
    // sitemap walk. Run #161 (2026-08-12) is what makes it worth setting.
    // With the hostname bug fixed, Escentual finally fetched 70 genuine
    // product pages rather than CMS pages — and still priced nothing. The
    // three URLs the run sampled are all /products/<handle>:
    //   escentual.com/products/acqua-di-parma-peonia-nobile-eau-de-parfum-spray
    //   escentual.com/products/4160-tuesdays-london-1969-eau-de-parfum-spray
    //   escentual.com/products/acqua-di-parma-osmanthus-eau-de-parfum-spray
    // That is Shopify's own product path convention, and /products.json is
    // the same endpoint that answered for Escentric Molecules in a single
    // request where 70 page fetches had answered with nothing.
    //
    // Safe to set on a convention rather than a confirmed spike, because
    // scripts/catalogue-harvest.ts keeps the Shopify result only when the
    // endpoint really is Shopify AND returned listings; anything else falls
    // straight through to crawlViaSitemap, which is exactly today's
    // behaviour. The downside case is the walk this shop already does — 70
    // fetches for zero listings, 5m38s of run #158 and 5m36s of #161.
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      // £2.45 until 2026-08-15, and £2.45 was wrong.
      //
      // That figure came from search-engine cached copies of the delivery page
      // rather than the page, because the environment it was written in cannot
      // reach escentual.com. A runner that can was pointed at it — shipping
      // probe, run 31880775379, job 95002922730, commit 05e2263 — and the page
      // itself says £3.50. The registry was 45% under the real cost on a site
      // whose default sort key is delivered price, which is exactly how a shop
      // gets shown as cheapest when it is not; the same class of error as a
      // wrong price, and quieter.
      //
      // The threshold survived the check unchanged. The window did not: the
      // page says 3-5 working days, so the 2-5 span recorded to reconcile two
      // disagreeing cached copies can go.
      standardGbp: 3.5,
      freeOverGbp: 30,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-15',
      confidence: 'confirmed',
      source: {
        url: 'https://www.escentual.com/pages/delivery-information',
        quote: 'Standard Delivery ~ £3.50 / free on orders over £30 ~ 3-5 working days*',
        readAt: '2026-08-15',
      },
      notes:
        'A paid annual "Delivery Pass" (£9.95) gives free next-day delivery on orders over ' +
        '£20 — a membership perk, not modelled in the headline price. 2-Day (£3.50, order by ' +
        '22:30) and 1-Day (£5.95, order by 16:30) express tiers also exist and are likewise ' +
        'out of scope for the standard-delivery-only model this registry uses.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.escentual.com/search?q={q}',
      sections: [
        { id: 'all-fragrance', label: 'Fragrance', urlTemplate: 'https://escentual.com/collections/all-fragrance?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    // Applied via Awin's own Activity Stream 2026-08-11, merchant id not yet
    // known — only surfaces once the programme accepts and its profile page
    // becomes readable.
    affiliate: { ...awinRequested() },
  },
  {
    id: 'the-fragrance-counter',
    name: 'The Fragrance Counter',
    domain: 'thefragrancecounter.co.uk',
    homepage: 'https://www.thefragrancecounter.co.uk',
    tiers: ['designer'],
    // Enabled with delivery not stated. Their own delivery page describes
    // delivery as free, but no explicit standard price or spend threshold
    // could be found to confirm that is unconditional rather than gated on a
    // minimum spend — exactly the gap standardGbp: null exists to say
    // honestly, and guessing 0 would make this retailer artificially win the
    // delivered-price sort every time. Shown rather than hidden: with
    // standardGbp null its offers carry no delivered price, render as
    // "delivery not stated", and rank below every shop that publishes a rate.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 100,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-12',
      confidence: 'confirmed',
      notes:
        'Read directly off their own delivery page, ' +
        'https://www.thefragrancecounter.co.uk/delivery.html, on 2026-08-12: "Royal Mail 48hr ' +
        'Tracked - £3.95 (FREE over £100)". That page also lists Royal Mail 24hr Tracked UK ' +
        'Delivery at £4.95 and Royal Mail Special Delivery at £9.95 as paid upgrade tiers, out ' +
        'of scope for the standard-only model. A .com storefront also exists ' +
        '(thefragrancecounter.com) — confirm its relationship to the .co.uk site before ' +
        'treating them as the same retailer.',
    },
    // Confirmed live in a browser 6 Aug 2026.
    catalogue: {
      searchUrlTemplate: 'https://www.thefragrancecounter.co.uk/catalogsearch/result/?q={q}',
      sections: [
        { id: 'womens', label: "Women's fragrance", urlTemplate: 'https://www.thefragrancecounter.co.uk/all-womens-fragrance.html?p={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 40, minRequestGapMs: 1500,
    },
    // Applied via Awin's own Activity Stream 2026-08-11, merchant id not yet
    // known — only surfaces once the programme accepts and its profile page
    // becomes readable.
    affiliate: {
      ...awinRequested(),
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'scentstore',
    name: 'ScentStore',
    domain: 'scentstore.com',
    homepage: 'https://www.scentstore.com',
    tiers: ['designer', 'niche'],
    enabled: true,
    // No Awin approval yet, so this is a direct scrape rather than a feed.
    // No live spike was possible from this environment — see the note on
    // Escentual above for why. Section URL replaced 6 Aug 2026 with the
    // real filtered listing confirmed live in a browser (both fragrance
    // categories selected via repeated filter params), preserved exactly
    // as given rather than "cleaned", since a guessed fix to unfamiliar
    // encoding risks breaking a filter that already works.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 2.95,
      freeOverGbp: 30,
      // One cached source described standard delivery taking up to 10 working
      // days, which read oddly next to a same-named "24hr tracked" upgrade
      // tier, and the wider span was recorded rather than picking a side. The
      // page itself settles it: they really are two named services, and the
      // slow one really is that slow — "Please allow a full 10 working days
      // for orders to arrive when Standard Free UK delivery is chosen
      // (non-tracked)."
      estimatedDays: [3, 10],
      // Read off the shop's own page by npm run shipping:discover from a
      // GitHub runner, committed in 431649e as
      // data/shipping-discovery-report.json, checkedAt 2026-08-16T08:30:45Z.
      // Both figures were already right; neither had anything behind it.
      verifiedAt: '2026-08-16',
      confidence: 'confirmed',
      source: {
        url: 'https://www.scentstore.com/about/delivery-returns/',
        quote: '£2.95 Free on Orders Over £30',
        readAt: '2026-08-16',
      },
      notes:
        'Independent UK perfumery trading since 1996 (Companies House: Scentstore Limited, ' +
        '05917335). The same page states the threshold on its own — "Standard UK delivery is ' +
        'FREE over £30." — and names the paid upgrades separately: "24 Hour Tracked Delivery ' +
        'is available at £3.95 on weekdays only (order cut off 3pm)" and "Next Day Delivery is ' +
        'available at £6.95 Mon-Thur only (order cut off 3pm)." Neither is modelled. Their own ' +
        'site states they run an Awin affiliate programme, but no merchant id could be found ' +
        'in this pass — resolve that before applying for their programme rather than guessing ' +
        'an id.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.scentstore.com/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Perfume', urlTemplate: 'https://www.scentstore.com/shop-all-products/?page={page}&filters%5Bcategory_lvl_0%5D%5B%5D=Perfume+for+Women&filters%5Bcategory_lvl_0%5D%5B%5D=Men%27s+Fragrance+%26amp%3B+Aftershave', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'perfume-shopping',
    name: 'Perfume Shopping',
    domain: 'perfumeshopping.com',
    homepage: 'https://www.perfumeshopping.com',
    tiers: ['designer'],
    // Enabled with delivery not stated. The free-delivery threshold is
    // reasonably well sourced, but the standard cost below it is not — one
    // third-party aggregator cites a figure, never confirmed on the retailer's
    // own page, which is not a strong enough basis to price a sort key
    // against. So standardGbp stays null and this shop is shown without a
    // delivered price rather than either hidden or given an invented one.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-12',
      confidence: 'unverified',
      notes:
        'THE FLAT STANDARD RATE IS UNCONFIRMED, so this shop is shown with delivery not ' +
        'stated: no delivered price is computed for it and it can never rank as cheapest. ' +
        'Free UK delivery over £50, next-day option at £3.99 (aggregator-sourced, not read ' +
        'off the retailer\'s own page). Re-attempted directly 2026-08-12: every request to ' +
        'perfumeshopping.com (homepage, robots.txt, /policies/shipping-policy) returned ' +
        'HTTP 403 — the whole site refuses this tooling, not just the shipping page, so ' +
        'robots.txt itself could not even be read to check what a compliant crawl route ' +
        'would look like. Needs a different network path or a human browser session to move ' +
        'past aggregator-sourced numbers.',
    },
    // Confirmed live in a browser 6 Aug 2026. A third
    // /brands page was also given but is a brand index rather than a
    // paginated product grid, so it is not a crawl section here.
    catalogue: {
      searchUrlTemplate: 'https://www.perfumeshopping.com/en/search?q={q}',
      sections: [
        { id: 'women', label: "Women's fragrance", urlTemplate: 'https://www.perfumeshopping.com/en/collection/women?page={page}', tier: 'designer' },
        { id: 'men', label: "Men's fragrance", urlTemplate: 'https://www.perfumeshopping.com/en/collection/men?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 40, minRequestGapMs: 1500,
    },
    // Applied via Awin's own Activity Stream 2026-08-11, merchant id not yet
    // known — only surfaces once the programme accepts and its profile page
    // becomes readable.
    affiliate: { ...awinRequested() },
  },
  {
    id: 'glorious-beauty',
    name: 'Glorious Beauty',
    domain: 'gloriousbeauty.co.uk',
    homepage: 'https://gloriousbeauty.co.uk',
    // Their own words, from the programme profile they publish on Awin.
    blurb:
      'Glorious Beauty presents a curated, handpicked portfolio of glorious make-up, ' +
      'skincare, fragrance and wellness brands inspired to bring out the glorious in you.',
    tiers: ['designer'],
    // Enabled with delivery not stated: an active Awin partner whose standard
    // rate has still never been established, so it is shown without a
    // delivered price rather than kept out of the app entirely. Unlike
    // MyBeauty above, this one has no product feed at all to fall back on.
    enabled: true,
    // Their Awin programme reports 0 products and "last updated: never", so
    // there is no feed to take. It needs the sitemap route, which is why the
    // adapter is unknown rather than affiliate-feed — nothing about its
    // retrieval has been established. The fragrance collection URL below is
    // confirmed live in a browser 6 Aug 2026, so retrieval is ready; what is
    // still missing is the standard delivery cost (see shipping below), which
    // now costs this shop its place in the delivered-price ranking rather than
    // its place in the app.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      // Confirmed 2026-08-12: their own shipping-policy page states a direct
      // flat rate, not just the free-delivery threshold this entry used to
      // carry alone. See notes for the exact quote and URL.
      standardGbp: 3.99,
      // Confirmed: "Free for all orders over £28" on the same page, matching
      // the figure already held from their Awin programme terms.
      freeOverGbp: 28,
      // Indicative only, and not a delivery-speed claim.
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-12',
      confidence: 'confirmed',
      notes:
        'Read directly off their own shipping policy page, ' +
        'https://gloriousbeauty.co.uk/policies/shipping-policy, on 2026-08-12: "UK Standard ' +
        'Tracked Delivery — Free for all orders over £28" and "£3.99 for all orders up to ' +
        '£27.99". The same page separately prices a faster "UK Tracked 24" upgrade tier at ' +
        '£5.95 (free over £60) and Ireland tracked delivery at £7.99 — both out of scope for ' +
        'the standard-only model.',
    },
    catalogue: {
      searchUrlTemplate: 'https://gloriousbeauty.co.uk/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://gloriousbeauty.co.uk/collections/fragrance?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: {
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
      ...awinActive('107736', '3017443'),
      notes:
        'Merchant id 107736, joined 4 Aug 2026. No product feed published (0 products, ' +
        'never updated), so there is nothing to import — ask the advertiser whether one ' +
        'is planned. Commission: fragrance 3%, beauty 7% new / 3% existing. 30-day ' +
        'cookie, 21-day auto-validation.',
    },
  },
  // ── 2026-08-05: Middle Eastern / Arabic single-brand and multi-brand shops ──
  // Sourced the same way as Escentual and ScentStore above: this session's
  // network is blocked at the gateway for arbitrary hosts, so every fact below
  // came from a web search quoting the shop's own page text, never a page
  // actually opened. Every shipping figure below is therefore `unverified`,
  // and every entry without a confirmed standardGbp stays `enabled: false` —
  // the registry's existing rule, not a new one, applied to a new batch.
  {
    id: 'french-avenue',
    name: 'French Avenue',
    domain: 'uk.shopfrenchavenue.com',
    homepage: 'https://uk.shopfrenchavenue.com',
    tiers: ['mideast'],
    singleBrandOnly: 'French Avenue',
    // Single-brand seller — Fragrance World's UK storefront for their French
    // Avenue line — but unlike Pairfum London this one is worth comparing
    // against, because other enabled retailers here also stock French Avenue,
    // so it competes on price rather than existing in isolation.
    //
    // Currency probe, run 32255268280 job 96075418694, 2026-08-19T12:56Z,
    // commit 14eede4: the plain origin quotes a US GitHub runner GBP, settles
    // GBP, at rate 1, and every UK-market address tried (?country=GB, both
    // localisation cookies, Accept-Language en-GB) returns the same currency
    // and the identical three prices (jasmere-edp-100ml 30.00,
    // zenith-noire-edp-100ml 30.00, glorious-oud-royal-blanc-exdp-80ml 25.00)
    // — no conversion anywhere. /en-gb, /gb, /uk, /en-uk all 404. The same
    // run read /products.json and got a real Shopify payload back, so
    // `shopifyStorefront` is set below.
    //
    // Enabled on that: currency confirmed, robots permit, products.json
    // works. `standardGbp` stays null — no delivery figure has been found at
    // all — which is not a reason to keep the shop off the site (see
    // tests/registry.test.ts's `unstated` list): the offer renders "delivery
    // not stated" and can never be shown as cheapest, it is simply never
    // invented.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Was in houses.ts as frenchavenue.com (the global, AED-priced site) until this UK-' +
        'specific storefront turned up. A £50 free-delivery figure appears in search results ' +
        'but is attributed to third-party UK retailers stocking French Avenue, not confirmed ' +
        "as this site's own policy — do not carry it over without checking " +
        'uk.shopfrenchavenue.com directly. No standard-delivery cost found at all. Currency ' +
        'separately confirmed sterling; see this entry\'s comment above.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'armaf',
    name: 'Armaf',
    domain: 'armaf.uk',
    homepage: 'https://armaf.uk',
    tiers: ['mideast'],
    singleBrandOnly: 'Armaf',
    // Currency probe, run 32256539223 job 96079521031, 2026-08-19T13:10Z,
    // commit fc97aad: the plain origin quotes a US GitHub runner GBP, settles
    // GBP, at rate 1, and every UK-market address tried (?country=GB, both
    // localisation cookies, Accept-Language en-GB) returns the same currency
    // and the identical price across all three sampled products (110.00 for
    // each of the profumi-dart-* range) — no conversion anywhere. /en-gb,
    // /gb, /uk, /en-uk all 404. The same run read /products.json and got a
    // real Shopify payload back, so `shopifyStorefront` is set below.
    //
    // Enabled on that: currency confirmed, robots permit, products.json
    // works. `standardGbp` stays null — no delivery figure has been found at
    // all — which is not a reason to keep the shop off the site (see
    // tests/registry.test.ts's `unstated` list): the offer renders "delivery
    // not stated" and can never be shown as cheapest, it is simply never
    // invented.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Was in houses.ts as armaf.com (global) until this UK entity turned up: ARMAF (UK) ' +
        'LTD, Companies House 12161258. Their own shipping page exists at ' +
        'armaf.uk/pages/shipping-details (Royal Mail, Mon-Sat, no bank-holiday deliveries) but ' +
        'search results did not surface the actual cost or free-delivery threshold — read that ' +
        'page directly. Currency separately confirmed sterling; see this entry\'s comment above.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'al-haramain',
    name: 'Al Haramain Perfumes',
    domain: 'alharamainperfumes.co.uk',
    homepage: 'https://alharamainperfumes.co.uk',
    tiers: ['mideast'],
    singleBrandOnly: 'Al Haramain',
    // MARKETS. This shop's /en-us/ delivery-page path was a hint worth
    // taking seriously — currency probe, run 32255764344 job 96077031353,
    // 2026-08-19T13:02Z, commit 14eede4: the plain origin quotes this US
    // runner USD and settles nothing, and every cookie/header candidate does
    // the same (localisation cookie, cart_currency cookie, both together,
    // Accept-Language en-GB — all quote USD). Only `?country=GB` reaches a
    // sterling list: meta and home both 200, quotes GBP, settles GBP, rate 1.
    // Critically, the actual figures are identical across every candidate —
    // origin(USD-labelled) and ?country=GB(GBP-labelled) both read
    // dehnal-al-oudh-cambodi-100ml at 85.00, shefon-deodorant-bspray-200ml at
    // 3.50, al-halal-sparkle-perfumed-hand-sanitiser-200ml at 4.99 — so no
    // conversion is applied between them and the number is sound as pounds.
    // /en-gb, /gb, /uk, /en-uk all 404. Same shape as Escentric Molecules:
    // the origin is not the sterling address, but a nearby one is, and this
    // repo's UK-market search (src/catalogue/marketProbe.ts, wired into
    // crawlViaShopifyProducts) exists exactly to find it.
    //
    // The same run read /products.json and got a real Shopify payload back,
    // so `shopifyStorefront` is set below.
    //
    // Enabled on that: currency confirmed (via the resolved UK market),
    // robots permit, products.json works. `standardGbp` stays null —
    // freeOverGbp is their own stated figure but no flat rate below it has
    // been found — which is not a reason to keep the shop off the site (see
    // tests/registry.test.ts's `unstated` list): the offer renders "delivery
    // not stated" and can never be shown as cheapest.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-18',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://alharamainperfumes.co.uk/en-us/pages/delivery-information',
        quote: 'FREE UK Delivery on orders over £50 (Royal Mail Standard Service)',
        readAt: '2026-08-18',
      },
      notes:
        'freeOverGbp is their own stated figure (free UK delivery over £50, half-price over ' +
        '£150). The standard cost below £50 was not found — read alharamainperfumes.co.uk/' +
        'en-us/pages/shipping-policy directly, then enable. UK-founded (opened a London retail ' +
        'store), part of the wider Al Haramain group trading since 1970. Currency separately ' +
        'confirmed sterling via the ?country=GB market; see this entry\'s comment above.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'riiffs',
    name: 'Riiffs Perfumes',
    domain: 'uk.riiffsperfumes.com',
    homepage: 'https://uk.riiffsperfumes.com',
    tiers: ['mideast'],
    singleBrandOnly: 'Riiffs',
    // NOT Shopify — checked, not guessed. Currency probe, run 32256162179
    // job 96078235660, 2026-08-19T13:06Z, commit 14eede4: robots.txt was
    // reachable and permitted every request tried (home page answered 200
    // for all nine ways of asking), but /products.json 404s on every one of
    // them — the same "page===1, HTTP 404" signal
    // src/catalogue/shopifyProductsCrawl.ts itself reads as "not a Shopify
    // storefront". No candidate published a currency anywhere either (no
    // /meta.json, no Shopify.currency in the theme). A dead end for the
    // Shopify route specifically; this shop would need the ordinary sitemap
    // walk (crawlViaSitemap) if it is ever pursued, which is untouched by
    // this finding.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 100,
      estimatedDays: [2, 3],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'freeOverGbp and the 2-3 working day window are their own stated figures. The ' +
        'standard cost below £100 was not found — read the shipping policy at ' +
        'uk.riiffsperfumes.com directly, then enable.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'ibraq',
    name: 'IBRAQ',
    domain: 'ibraquk.com',
    homepage: 'https://ibraquk.com',
    tiers: ['mideast'],
    singleBrandOnly: 'IBRAQ',
    // Currency probe, run 32256269411 job 96078682112, 2026-08-19T13:07Z,
    // commit 14eede4: the plain origin quotes a US GitHub runner GBP, settles
    // GBP, at rate 1, and every UK-market address tried (?country=GB, both
    // localisation cookies, Accept-Language en-GB) returns the same currency
    // and the identical three prices (49.99 with a 59.99 compare_at, 79.99,
    // 24.99) — no conversion anywhere. /en-gb, /gb, /uk and /en-uk all 404.
    // The same run read /products.json and got a real Shopify payload back
    // (tobacco-collection-set-9x10ml among the priced rows), so
    // `shopifyStorefront` is set below. robots.txt permitted every request.
    //
    // Enabled on that: currency confirmed, robots permit, products.json
    // works. `standardGbp` stays null — freeOverGbp is this shop's own
    // stated figure but no standard flat rate has been found — which is not
    // a reason to keep it off the site (see tests/registry.test.ts's
    // `unstated` list): the offer renders "delivery not stated" and can
    // never be shown as cheapest, it is simply never invented.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [1, 2],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'The Saudi house formerly trading as Ibrahim Al Qurashi, rebranded IBRAQ — this is ' +
        'its dedicated UK storefront. freeOverGbp and 1-2 working day processing are their ' +
        'own stated figures; the standard cost below £50 was not found. Requested as ' +
        '"Ibraq (formerly Ibrahim Al Quarashi)" — spelling matches. Currency separately ' +
        'confirmed sterling; see this entry\'s comment above.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'bellavita-luxury',
    name: 'BellaVita Luxury',
    domain: 'bellavitaluxury.uk',
    homepage: 'https://bellavitaluxury.uk',
    tiers: ['mideast'],
    singleBrandOnly: 'BellaVita',
    // "Luxury-inspired" fragrance dupes rather than a heritage Arabic house —
    // the same category Bujairami (houses.ts) trades in — filed under
    // `mideast` as the closest existing tier for this kind of catalogue
    // rather than inventing a new one for a single retailer.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      // £4.50 free over £22 until 2026-08-16, and both were wrong.
      //
      // They came from a search-engine rendering of this shop's Shipping
      // Policy page rather than the page, which is the same indirect route
      // that put Escentual's delivery a pound under the truth. A GitHub runner
      // fetched the page itself — npm run shipping:discover, committed in
      // 47c5356 as data/shipping-discovery-report.json, checkedAt
      // 2026-08-14T09:11:00Z — and it states one rule in one sentence: £3.99
      // below £30, free above it. So the rate was 51p too high and the
      // threshold £8 too low, which on a site sorted by delivered price moved
      // this shop the safe way but by a figure nobody had read.
      standardGbp: 3.99,
      freeOverGbp: 30,
      // Unchanged and still unsourced: the page read here says nothing about
      // how long delivery takes.
      estimatedDays: [1, 3],
      verifiedAt: '2026-08-16',
      confidence: 'confirmed',
      source: {
        url: 'https://bellavitaluxury.uk/policies/shipping-policy',
        quote: 'Free shipping on all orders above £30, below that a delivery fee of £3.99 will be charged',
        readAt: '2026-08-14',
      },
      notes:
        'The £30 threshold is corroborated on a second page of the same shop — ' +
        'https://bellavitaluxury.uk/pages/shipping-policy-bellavita-luxury-united-kingdom, ' +
        'read in the same pass: "Free shipping on all orders over 30 GBP." A promotional ' +
        'banner elsewhere on the policy page reads "FREE Shipping Above £25"; the £30 figure ' +
        'is taken because two pages state it and it is the one written as the rule rather than ' +
        'as a banner, and because taking the higher threshold can only overstate a delivered ' +
        'price, never understate it. Not to be confused with Bella Vita Organic ' +
        '(bellavitaorganic.com), an unrelated Indian skincare brand that also trades as ' +
        '"Bellavita" — see the matching caution in demo/brandSites.ts.',
    },
    catalogue: null,
    affiliate: {
      ...NO_AFFILIATE_YET,
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'oud-arabian',
    name: 'Oud Arabian',
    domain: 'oudarabian.co.uk',
    homepage: 'https://oudarabian.co.uk',
    tiers: ['mideast'],
    // Multi-brand: stocks Lattafa, Al Haramain, Afnan, Bujairami and others,
    // not a single house's own storefront — requested under "retailer
    // listings" rather than the named-brand list.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.99,
      freeOverGbp: 30,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-05',
      confidence: 'confirmed',
      notes:
        'Read off their own policy page by npm run shipping:discover on 2026-08-05, which quoted '  +
        '"Standard Delivery (3-5 Working Days): £3.99" and "Free Delivery: Orders over £30 qualify '  +
        'for free standard delivery" from https://oudarabian.co.uk/policies/shipping-policy. That '  +
        'also resolves the earlier £50 figure seen in their returns terms: it was about return '  +
        'postage deduction, not the delivery threshold. Express is £7.99 and out of scope.',
    },
    catalogue: null,
    affiliate: {
      ...NO_AFFILIATE_YET,
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'manchester-ouds',
    name: 'Manchester Ouds',
    domain: 'manchesterouds.com',
    homepage: 'https://manchesterouds.com',
    tiers: ['mideast'],
    // Enabled with delivery not stated. The gap is the flat standard rate, not
    // the shop's legitimacy or its crawl target, and an unstated rate now
    // costs a shop its place in the delivered-price ranking rather than its
    // place in the app.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-17',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://manchesterouds.com/pages/shipping-policy',
        quote: 'Free shipping on orders over £50',
        readAt: '2026-08-17',
      },
      notes:
        'THE FLAT STANDARD RATE IS UNCONFIRMED, so this shop is shown with delivery not ' +
        'stated: no delivered price is computed for it and it can never rank as cheapest. ' +
        'freeOverGbp 50 is their own stated figure — shipping-policy page, 2026-08-12: ' +
        '"Standard shipping is free on orders over £50, while a nominal fee applies to orders ' +
        'below £50." That "nominal fee" is never given a number anywhere checked: ' +
        '/policies/shipping-policy, /policies/refund-policy (only repeats the £50 free ' +
        'threshold), /pages/shipping-returns, /pages/help, /pages/delivery-information and ' +
        '/pages/faq (all 404). Confirmed Shopify (products.json resolves) so the checkout ' +
        'shipping-rates route (src/catalogue/shippingQuote.ts) is the next thing to try — not ' +
        'attempted this pass, no read-only tool available here that can add to cart and query ' +
        'it.',
    },
    // Crawl target confirmed live in a browser 6 Aug 2026.
    catalogue: {
      searchUrlTemplate: 'https://manchesterouds.com/search?q={q}',
      sections: [
        { id: 'all', label: 'All fragrances', urlTemplate: 'https://manchesterouds.com/collections/all?page={page}', tier: 'mideast' },
      ],
      firstPage: 1, maxPages: 30, minRequestGapMs: 1500,
    },
    affiliate: {
      ...NO_AFFILIATE_YET,
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'emirates-oud',
    name: 'Emirates Oud',
    domain: 'emiratesoud.co.uk',
    homepage: 'https://emiratesoud.co.uk',
    tiers: ['mideast'],
    // Multi-brand oud specialist (product paths like /products/rayhaan-aquatica
    // name "Rayhaan" as the house, not Emirates Oud itself) — a retailer
    // listing, not a house's own storefront.
    //
    // Approved into their affiliate programme (GoAffPro) 10 Aug 2026.
    // This environment's outbound network denies every direct request to
    // emiratesoud.co.uk, so the standard delivery rate came from CI instead:
    // `npm run shipping:discover -- --raw=emirates-oud` (2026-08-11) recorded
    // the full extracted text of both their shipping-policy and refund-policy
    // pages — see the shipping block below for the sentence that supplied the
    // figure, from the refund-policy page rather than the shipping-policy one.
    enabled: true,
    adapter: 'unknown',
    // Product paths (/products/<handle>) are the standard Shopify convention,
    // not confirmed by reading the storefront directly (blocked — see the
    // note below) but confirmed enough by that convention alone to be worth
    // trying first: src/catalogue/shopifyProductsCrawl.ts's /products.json
    // walk, ahead of the generic sitemap route, once this retailer is enabled.
    //
    // MARKETS. Not exposed to what caught Escentual. Currency probe, run
    // 31950479975 job 95173070180, 2026-08-16T13:40Z, commit a336322: the
    // plain origin quotes a US GitHub runner GBP, settles GBP, at rate 1, and
    // ?country=GB, both localisation cookies and Accept-Language en-GB all
    // return the same currency and the same three prices (41.99, 41.99,
    // 35.00). No market serves this shop's storefront anything but sterling
    // by any route tried, so a runner-read price is the same price a shopper
    // in the UK sees. /en-gb, /gb, /uk and /en-uk 404, which is expected of a
    // single-market store.
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      // Sourced, not estimated. Their own shipping-policy page
      // (https://emiratesoud.co.uk/policies/shipping-policy) never names a
      // flat rate — it only says "Shipping Rates : Shipping fees depend on
      // the delivery destination and order size. The final price is
      // calculated at checkout." The figure came instead from their
      // refund-policy page (https://emiratesoud.co.uk/policies/refund-policy),
      // read verbatim by CI on 2026-08-11 via `npm run shipping:discover --
      // --raw=emirates-oud`: "If your initial order qualified for free
      // delivery, returning items may reduce the order value below the
      // threshold, resulting in a postage charge of £3.99 deducted from the
      // refund. This deduction covers the shipping costs initially waived due
      // to the free delivery offer." That £3.99 is stated as exactly the
      // standard UK shipping cost the £50 free-delivery threshold waives —
      // i.e. what a sub-£50 order is charged for standard delivery.
      standardGbp: 3.99,
      // Sourced, not estimated. The 2026-08-11 shipping:discover run reached
      // https://emiratesoud.co.uk/policies/shipping-policy (HTTP 200) and read
      // this sentence verbatim: "Free Shipping : Orders over £50 within the UK
      // qualify for free shipping." That is the whole of what their delivery
      // page states as a number.
      freeOverGbp: 50,
      // Placeholder pending confirmation, same status as standardGbp above —
      // not sourced, not used in any delivered-price math (unlike
      // standardGbp, which is why this field tolerates an estimate while
      // that one does not), only ever shown as indicative text once enabled.
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-11',
      // 'unverified', not 'confirmed', and the distinction is real rather than
      // cautious boilerplate. £3.99 is genuinely their own figure, but it was
      // read off a returns clause explaining what a refund deducts, not off a
      // rate card — and their shipping-policy page says in terms that
      // "Shipping fees depend on the delivery destination and order size. The
      // final price is calculated at checkout." So a single flat number cannot
      // be true for every basket, and this is exactly what ShippingRule's own
      // doc comment means by sourced indirectly: treat the delivered price as
      // indicative. This flag reaches the reader as a reliability signal, so
      // claiming 'confirmed' here would overstate what we actually have.
      confidence: 'unverified',
      notes:
        'Approved affiliate as of 10 Aug 2026. Free delivery over £50 is ' +
        'confirmed from their own shipping policy page, read by CI on ' +
        '2026-08-11. Standard delivery below £50 is £3.99, confirmed from ' +
        'their refund-policy page (same CI run, 2026-08-11, raw-text mode): ' +
        '"...resulting in a postage charge of £3.99 deducted from the ' +
        'refund. This deduction covers the shipping costs initially waived ' +
        'due to the free delivery offer." — ' +
        'https://emiratesoud.co.uk/policies/refund-policy',
    },
    // No section URLs to guess: the sitemap harvester (crawlViaSitemap)
    // discovers products from /sitemap.xml and robots.txt on its own, the
    // same route already proven against every Shopify storefront in this
    // registry (Allbeauty among them — this is also a Shopify store, going
    // by its /products/<slug> paths) — a guessed category URL was never
    // needed for that path, only for the older, deprecated section-crawl
    // strategies this registry has otherwise moved off.
    catalogue: null,
    affiliate: {
      ...inHouseActive('YANAKANSIVAKUMAR1', 'ref={{publisherId}}', 'https://emiratesoud.co.uk'),
      // Hot-linked with no separate licence read, on the site owner's own
      // decision — the same basis most retailers in this registry start on
      // (see ImageBasis's doc comment) — explicitly requested here rather
      // than defaulted: "I want you to have all the listings and images
      // scraped with all my affiliate links active", 10 Aug 2026.
      imageBasis: 'hotlink-unlicensed',
      notes:
        'GoAffPro, not Awin — tracks purely from a ?ref= query parameter on ' +
        'their own product URL (querySuffixTemplate), not a redirect-domain ' +
        'deeplink. See querySuffixTemplate\'s own doc comment in ' +
        'src/types/retailer.ts for why that needed a different mechanism ' +
        'from every other retailer here.',
    },
  },
  {
    id: 'perfumeo',
    name: 'Perfumeo',
    domain: 'perfumeo.co.uk',
    homepage: 'https://www.perfumeo.co.uk',
    tiers: ['designer'],
    // General discount fragrance retailer, not Middle Eastern focused —
    // requested under "retailer listings" alongside the oud specialists.
    //
    // NOT Shopify — checked, not guessed. Currency probe, run 32256436199
    // job 96079115721, 2026-08-19T13:09Z, commit fc97aad: robots.txt was
    // reachable and permitted every request tried (home page answered 200
    // for all nine ways of asking), but /products.json 404s on every one of
    // them. No candidate published a currency anywhere either. A dead end
    // for the Shopify route specifically.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Nothing about their delivery terms turned up in search results at all beyond the ' +
        'shop existing and trading as Perfumeo Ltd. Read perfumeo.co.uk delivery terms ' +
        'directly, fill in every field above, then enable.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'the-beauty-store-uk',
    name: 'The Beauty Store UK',
    domain: 'thebeautystore.com',
    homepage: 'https://www.thebeautystore.com',
    blurb:
      'We keep costs down with an honest to goodness no-frills approach. We do not pay for ' +
      'fancy marketing campaigns or luxurious offices, so we can pass on all our savings to you.',
    tiers: ['designer'],
    enabled: true,
    adapter: 'affiliate-feed',
    currency: 'GBP',
    shipping: {
      standardGbp: 2.95,
      freeOverGbp: 50,
      // Not a typical window. Their terms state only that goods arrive "within
      // 10 days of your order", which is the contractual maximum they bind
      // themselves to, so the upper bound is theirs and the lower is a guess
      // held deliberately wide rather than flattering.
      estimatedDays: [2, 10],
      verifiedAt: '2026-08-05',
      confidence: 'confirmed',
      notes:
        'Read off their own policy page by npm run shipping:discover on 2026-08-05, which quoted '  +
        '"Standard Delivery (UK Mainland) : £2.95" and "FREE DELIVERY OVER £50" from '  +
        'https://www.thebeautystore.com/policies/shipping-policy. Express is £4.95 and out of '  +
        'scope for the standard-only model. Their terms of sale separately bind them to despatch '  +
        'within 10 days, which is the upper bound recorded above rather than a typical window. '  +
        'Identity confirmed: The Beauty Store London Ltd, company 10805437, VAT GB325347215. '  +
        'Note the storefront is thebeautystore.com, not the .co.uk domain first assumed here.',
    },
    catalogue: null,
    affiliate: {
      ...awinActive('116255', '3017443'),
      // Permission to use their product photography was given directly by
      // their team on a call, 5 Aug 2026, after the site was explained to
      // them: they confirmed that "No branding guidelines" in the programme
      // terms is permissive rather than silent. That is a stronger basis than
      // reading a terms page, which is why imageBasis is set — but it is
      // spoken rather than written, so it is recorded here with its date and
      // provenance so anyone auditing can ask for it in writing.
      imageUsageConfirmed: true,
      imageBasis: 'affiliate-terms',
      notes:
        'Merchant id 116255, joined 5 Aug 2026. Programme terms last updated 30 May 2025. ' +
        'Commission is calculated on a transaction value that includes VAT, delivery, card fees ' +
        'and gift wrapping, and no product category is excluded. Paid search on their brand name ' +
        'is heavily restricted, which does not affect this site — we run no ads. Feed not yet ' +
        'checked: Toolbox > Create-a-Feed. Import with npm run catalogue:feed -- ' +
        '--file=<feed.csv> --retailer=the-beauty-store-uk'
    },
  },
  {
    id: 'zimaya',
    name: 'Zimaya',
    domain: 'uk.zimayaperfumes.com',
    homepage: 'https://uk.zimayaperfumes.com',
    tiers: ['mideast'],
    singleBrandOnly: 'Zimaya',
    // Was disabled for a currency question — the UK subdomain advertised
    // "FREE DELIVERY OVER $50" in dollars, which is exactly what an
    // unlocalised Shopify storefront looks like — and that question is now
    // answered.
    //
    // Currency probe, run 32254603051 job 96073283174, 2026-08-19T12:49Z,
    // commit 14eede4: the plain origin quotes a US GitHub runner GBP, settles
    // GBP, at rate 1, and every UK-market address tried (?country=GB, both
    // localisation cookies, Accept-Language en-GB) returns the same currency
    // and the identical three prices (35.00, 35.00, 35.00) — no conversion
    // anywhere. /en-gb, /gb, /uk and /en-uk all 404, expected of a
    // single-market store. robots.txt allowed every request the probe made.
    // Removed from CURRENCY_UNCONFIRMED at the foot of this file on that
    // evidence.
    //
    // The same run read /products.json and got a real Shopify payload back
    // (ghali-imperial, ghali-elegante, ode-to-rose-royale among the priced
    // rows), so `shopifyStorefront` is set below rather than left unset.
    //
    // Enabled on that: currency confirmed, robots permit, products.json
    // works. What is still missing is a standard delivery cost — the $50
    // marketing figure above is not this shop's flat rate, and no other
    // source has stated one — which is why `standardGbp` stays null. That is
    // not a reason to keep the shop off the site: an unstated cost renders as
    // "delivery not stated" and can never be shown as cheapest (see
    // tests/registry.test.ts's `unstated` list), it is simply never invented.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'A UK subdomain exists (uk.zimayaperfumes.com), which is why this is a retailer rather ' +
        'than a houses.ts entry, on the same reasoning as French Avenue and Armaf. The UK site ' +
        'advertises "FREE DELIVERY OVER $50" in dollars, which is marketing copy rather than a ' +
        "confirmed flat rate — currency itself is separately confirmed sterling, see this " +
        'entry\'s comment above. Third-party UK stockists quote £50 and £80 free-delivery ' +
        "thresholds, but those are their terms, not this shop's. Standard cost below any " +
        'threshold not found anywhere — read uk.zimayaperfumes.com/policies/shipping-policy ' +
        'directly.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'khadlaj',
    name: 'Khadlaj',
    domain: 'khadlaj-perfumes.co.uk',
    homepage: 'https://www.khadlaj-perfumes.co.uk',
    tiers: ['mideast'],
    singleBrandOnly: 'Khadlaj',
    // Confirmed Shopify, currency NOT confirmed sterling — a dead end worth
    // recording rather than a to-do.
    //
    // Currency probe, run 32255506486 job 96076159301, 2026-08-19T12:59Z,
    // commit 14eede4: /products.json answered with a real Shopify payload
    // (khadlaj-titan-100-ml-eau-de-parfum-spray-for-men, 110.00; a
    // grand-collection set at 210.00 with a 300.00 compare_at) — so this shop
    // is Shopify. But every one of the nine ways of asking quoted this US
    // runner USD at rate 1, including the UK-market addresses this repo now
    // tries (?country=GB, both localisation cookies, Accept-Language en-GB):
    // none of them settled GBP the way al-haramain's or Escentric Molecules'
    // did. /en-gb, /gb, /uk and /en-uk all 404. Nothing measured here
    // suggests this shop has a sterling price list reachable from any address
    // tried. Added to CURRENCY_UNCONFIRMED at the foot of this file on that
    // evidence — a stronger basis than a marketing-copy hunch, since this is
    // a currency the storefront itself served.
    //
    // `shopifyStorefront` deliberately left unset: the mechanism this repo
    // uses to opt a retailer into the /products.json route is meant to
    // signal a *priceable* Shopify shop, and this one cannot be priced from
    // any address this repo knows how to ask.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [4, 6],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        "The brand's own .co.uk site exists but its delivery cost was not found; only third-party " +
        'UK stockists (Emirates Oud free over £50, Perfume Heaven free over £40) turned up, and ' +
        "those are not this shop's terms. The shipping:discover run will try khadlaj-perfumes." +
        'co.uk directly. Moot until the currency question above is resolved.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'kayali',
    name: 'KAYALI',
    domain: 'uk.kayali.com',
    homepage: 'https://uk.kayali.com',
    tiers: ['designer', 'niche'],
    singleBrandOnly: 'Kayali',
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 5.5,
      freeOverGbp: 79,
      estimatedDays: [2, 3],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        "Both figures from the brand's own Zendesk help centre (kayalihelp.zendesk.com): UK " +
        'delivery £5.50, free over £79, 2-3 business days. Founded by Mona Kattan; also stocked ' +
        'by Boots, Selfridges, Sephora and Cult Beauty, so expect overlap once this harvest runs.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'zara',
    name: 'Zara',
    domain: 'zara.com',
    homepage: 'https://www.zara.com/uk',
    tiers: ['designer'],
    singleBrandOnly: 'Zara',
    // A fashion retailer, not a fragrance specialist, but its own perfume line
    // is single-brand the same way Armaf's shop is — Zara does not stock any
    // other house's fragrance.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 50,
      estimatedDays: [2, 3],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Standard £3.95, free over £50, 2-3 days — read from Zara UK\'s own delivery-methods ' +
        "page via search summary. Next-day (£4.95) and same-day London (£7.95) exist and are " +
        'out of scope for the standard-only model. Fragrance since 1998 via Puig.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'escentric-molecules',
    name: 'Escentric Molecules',
    domain: 'escentric.com',
    homepage: 'https://www.escentric.com',
    tiers: ['niche'],
    singleBrandOnly: 'Escentric Molecules',
    // Their whole range is fine fragrance — Molecule 01-05, Escentric 01-05,
    // the M+ series and the Portable 30ml bottles — and none of it names a
    // concentration in its title, so the concentration test rejected 64 of
    // their 118 harvested listings and the shop reached the app with two
    // offers. Checked their catalogue title by title before setting this:
    // what it newly admits is 44 single bottles priced £60-£220, and the 20
    // multi-item ATOM.iser sets stay out on the multi-item guard in
    // isFragrance rather than on the concentration test.
    fragranceOnlyCatalogue: true,
    // Promoted out of src/config/houses.ts 2026-08-12, on the same basis as
    // French Avenue and Armaf before it: their houses.ts entry was blocked on
    // "storefront currency and UK delivery terms not yet established" because
    // only a US-labelled URL (escentric.com/en-us) had been seen. Read
    // directly this pass, the plain escentric.com storefront resolves in
    // sterling with a stated flat UK rate — clears the bar for a UK retailer
    // entry rather than a currency-unknown house catalogue.
    enabled: true,
    adapter: 'unknown',
    // Not a convention guess like Emirates Oud above: escentric.com's
    // /products.json was read successfully by `npm run houses` on run #158
    // (2026-08-12 09:22:17Z), back when this was still a houses.ts entry, and
    // returned "118 listings 118 in GBP 118 with photo shopify-products-json
    // [GBP]" from a single request. Promoting the entry to retailers.ts
    // without carrying that route across would have sent it down the generic
    // sitemap walk instead — 70 page fetches and roughly three minutes to
    // rediscover what one request already answers.
    //
    // MARKETS. This shop does to a US runner exactly what Escentual did, and
    // the only reason it is not a second Escentual is that its two lists carry
    // the same numbers. Currency probe, run 31950486539 job 95173126194 and
    // run 31950603105 job 95173370315, 2026-08-16T13:41Z and 13:43Z, commit
    // a336322:
    //
    //   origin                   quotes USD  settles GBP  rate 1.3531
    //   ?country=GB              quotes GBP  settles GBP  rate 1
    //   localization=GB cookie   quotes USD  settles GBP  rate 1.3531
    //   cart_currency=GBP cookie quotes USD  settles GBP  rate 1.3531
    //   Accept-Language en-GB    quotes USD  settles GBP  rate 1.3531
    //   /en-gb /gb /uk /en-uk    404
    //
    // Only `?country=GB` reaches the sterling list — the cookie a country
    // selector sets does not, which is where this differs from Escentual.
    // Across the 16 priced rows of a 25-product page the two lists are
    // numerically identical (55.00, 135.00, 130.00, 135.00, 40.00, 30.00,
    // 35.00, 35.00, 80.00 x5, 360.00, 230.00, 300.00), so no conversion is
    // applied between the markets, and the figures this repo holds — read back
    // on 2026-08-16 and equal to that GB list product for product — are sound
    // as pounds. Nothing was converted to reach that, and nothing here rests
    // on the rate.
    //
    // So it stays out of CURRENCY_UNCONFIRMED: the shop was measured
    // publishing a sterling list and our stored figures match it. What it does
    // rest on is crawlViaShopifyProducts continuing to resolve the GB market.
    // The day escentric.com prices its US market separately, a run that read
    // the origin would publish dollars as pounds and nothing in the numbers
    // would look wrong.
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: 7.5,
      freeOverGbp: 80,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-12',
      confidence: 'confirmed',
      notes:
        'Read directly off their own delivery-and-returns page, ' +
        'https://www.escentric.com/pages/delivery-and-returns, on 2026-08-12: "£7.50 on ' +
        'orders under £80" and "Enjoy complimentary delivery on orders of £80 or more". A ' +
        'separate £125 promotional spend threshold (free 10ml Escentric 01) seen on the ' +
        'homepage is a gift-with-purchase offer, not a second delivery tier, and is out of ' +
        'scope here. Already stocked by several UK retailers (Liberty, Selfridges, Cult ' +
        'Beauty, Space NK) — expect catalogue overlap once this harvest runs.',
    },
    catalogue: null,
    affiliate: {
      ...NO_AFFILIATE_YET,
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'lush',
    name: 'LUSH',
    domain: 'lush.com',
    homepage: 'https://www.lush.com/uk/en',
    tiers: ['niche'],
    singleBrandOnly: 'Lush',
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 50,
      estimatedDays: [2, 3],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        "Standard £3.95, free over £50, 2-3 working days from dispatch — read from Lush UK's own " +
        'delivery information page via search summary. A paid Delivery Pass subscription also ' +
        'exists and is not modelled, per the membership-perk rule. Fragrance is a small part of a ' +
        'much larger bath/body/cosmetics catalogue; expect most harvested listings to be rejected ' +
        'by the isFragrance filter.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'bath-body-works-uk',
    name: 'Bath & Body Works',
    domain: 'bathandbodyworks.co.uk',
    homepage: 'https://www.bathandbodyworks.co.uk',
    tiers: ['designer'],
    singleBrandOnly: 'Bath & Body Works',
    // NOT Shopify — checked, not guessed, across two runs. Currency probe,
    // run 32255284750 job 96075537892, 2026-08-19T12:57Z, commit 14eede4:
    // robots.txt did not answer at all ("COULD NOT ASK"), so nothing was
    // requested that pass. Retried, run 32256639926 job 96079766579,
    // 2026-08-19T13:11Z, commit fc97aad: robots.txt answered this time and
    // permitted every request (home page 200 for all nine ways of asking),
    // but /products.json came back "not a Shopify products payload" on every
    // one of them — the multinational US parent's UK site is not on Shopify.
    // No candidate published a currency either. A dead end for the Shopify
    // route specifically; this shop is a large non-Shopify retailer and
    // would need a different strategy (the ordinary sitemap walk, or a
    // dedicated adapter) if it is ever pursued.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 6],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Search only surfaced the US site\'s $50 threshold, which is not this UK site\'s terms. ' +
        'No standard-delivery cost for bathandbodyworks.co.uk found. Fine fragrance mists rather ' +
        'than EDP/EDT in the main, worth confirming isFragrance actually recognises their listings.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },

  // ── Applied via Awin, 2026-08-11 ───────────────────────────────────────────
  // Temporary placeholders, exactly as requested: every one of these is a
  // real UK-facing retailer this account has applied to join on Awin (see
  // the Activity Stream), domain confirmed by web search this session since
  // this environment cannot open any of them directly. None has had its page
  // structure, delivery terms, or Awin acceptance confirmed yet — enabled:
  // false and catalogue: null throughout, same as every other unconfirmed
  // entry in this file. affiliate.status is 'pending' via awinRequested()
  // because the application itself is real, not because anything downstream
  // of it is.
  {
    id: 'debenhams',
    name: 'Debenhams',
    domain: 'debenhams.com',
    homepage: 'https://www.debenhams.com',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'niche-beauty-uk',
    name: 'Niche-Beauty UK',
    domain: 'niche-beauty.com',
    homepage: 'https://www.niche-beauty.com',
    tiers: ['niche'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'nicchia-luxury-uk',
    name: 'Nicchia Luxury UK',
    domain: 'nicchialuxury.com',
    homepage: 'https://www.nicchialuxury.com',
    // Their own words, from the programme profile they publish on Awin.
    blurb:
      'Nicchia Luxury is an Italian e-commerce site specializing in niche perfumery, ' +
      'with over 160 brands, along with a curated selection of beauty, cosmetics, and ' +
      'home products.',
    tiers: ['niche'],
    // CURRENCY NOT CONFIRMED — switched off 2026-08-13. It ran `enabled: true`
    // on a real, confirmed Awin feed (6,794 listings pulled 2026-08-12), and
    // its shipping policy was genuinely read; what was never established is
    // the one thing the whole snapshot depends on, which currency the shop
    // charges in. 4,032 offer rows were published as GBP on that unproven
    // declaration (counted in demo/catalogue.generated.ts, 2026-08-13).
    //
    // What has since been measured, and what has not:
    //
    //   Its storefront publishes EUR. `parseShopCurrency` read
    //   nicchialuxury.com in CI on 2026-08-13T11:00Z (Price verification run
    //   4, job 94426059278) and got EUR, not GBP.
    //
    //   It publishes no sterling price list anywhere we can find. Run 5 (job
    //   94428122841) tried the prefixes a Shopify UK market is served under —
    //   /en-gb, /gb, /uk, /en-uk. /en-gb answered USD; none answered GBP.
    //   Origin EUR, /en-gb USD, no GBP at any address tried.
    //
    //   Our stored figures are that euro list divided by one constant. The
    //   same run compared all 6,843 keyable listings: live/stored is 1.3490,
    //   and 4,378 of the 4,383 listings at or above £50 — 99.9% — sit within
    //   1% of it. (Below £50 the spread widens purely because both sides are
    //   whole numbers; that is rounding, not a second price list.) A shop does
    //   not reprice a whole catalogue by one identical multiple. These are one
    //   price list in two units.
    //
    // So the "GBP" in the feed is a conversion of this shop's euro prices at a
    // fixed 1.3490, not a price Nicchia quotes. Two things follow, and neither
    // is established: whether 1.3490 was ever a real exchange rate (no FX rate
    // was consulted here, so this file asserts nothing about that), and
    // whether the shop will take sterling from a UK customer at all — nothing
    // measured so far suggests it does. A shopper sent from a GBP figure to a
    // checkout that charges euros pays whatever that day's rate makes it, not
    // the number we printed.
    //
    // The one reassurance in all of it: the stored numbers are not the euro
    // numbers with a pound sign on them. That fault would put the ratio at
    // 1.0, and it is 1.3490 across the population.
    //
    // See CURRENCY_UNCONFIRMED at the foot of this file. The way back to
    // `enabled: true` is a sterling price read off this shop's own checkout —
    // not a judgement that the above looks fine.
    enabled: false,
    adapter: 'affiliate-feed',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-12',
      confidence: 'unverified',
      notes:
        'Their shipping-policy and refund-policy pages were read by ' +
        'shipping:discover on 2026-08-12 (16 pages tried). Both only state a ' +
        'free EXPRESS delivery threshold ("Free express delivery over 140 ' +
        'USD") and a list of free-shipping thresholds by destination — never ' +
        'a standard flat rate for an order that does not clear a threshold. ' +
        'That figure is not published anywhere found.',
    },
    catalogue: null,
    // Real approval, not another application-in-flight: Awin notified this
    // account directly that Nicchia Luxury UK accepted it onto their
    // programme. Merchant id 123544 read off their own merchant profile
    // (ui.awin.com/merchant-profile/123544, titled "Nicchia Luxury UK
    // Affiliate Programme"); publisherId 3017443 is this account's own id,
    // shared with every other approved Awin programme here. Still needs
    // whatever route actually gets their products in — a confirmed feed via
    // npm run awin:feed-sync, or a confirmed scrapable page structure — before
    // this can move past affiliate readiness to enabled: true.
    affiliate: { ...awinActive('123544', '3017443') },
  },
  {
    id: 'paco-perfumerias',
    name: 'Paco Perfumerias',
    domain: 'pacoperfumerias.com',
    homepage: 'https://www.pacoperfumerias.com',
    tiers: ['designer', 'niche'],
    // CURRENCY NOT CONFIRMED. Do not flip this to true on the strength of the
    // Awin application alone — read `shipping.notes` below and
    // CURRENCY_UNCONFIRMED at the foot of this file first. The `currency:
    // 'GBP'` on the next line is what the Retailer type forces, not a fact
    // about this shop: it is Spanish, and nobody has established what its
    // checkout charges in. Enabling it while that is open publishes euros as
    // pounds. The guard below throws rather than let that happen quietly.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 7],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes:
        'Applied via Awin 2026-08-11. A Spanish retailer (pacoperfumerias.com); whether its Awin ' +
        'UK programme actually checks out in GBP or this is an EU-priced site with a UK-targeted ' +
        'affiliate programme has not been confirmed — so the GBP above is the type talking, not ' +
        'a checked figure, and this entry is listed in CURRENCY_UNCONFIRMED at the foot of this ' +
        'file. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'wowcher',
    name: 'Wowcher',
    domain: 'wowcher.co.uk',
    homepage: 'https://www.wowcher.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 7],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes:
        'Applied via Awin 2026-08-11. A deals marketplace rather than a dedicated fragrance ' +
        'retailer — most listings will not be fragrance at all. Delivery terms and page ' +
        'structure not yet read.',
    },
    // ── Apify harvest evaluation, 2026-08-19: not a scraper candidate ────────
    // Assigned to the bot-defended-majors review on the assumption it was a
    // shelf retailer like the rest of this file. It is not, and no amount of
    // rendering technology changes that.
    //
    // Wowcher sells time-limited voucher deals, not SKU prices. Its product
    // model is fundamentally different from every other entry here: a "Dior
    // Sauvage 100ml" listing on this site would be a voucher good for a
    // redemption window, priced against whatever discount that specific deal
    // is running that week, not a standing shelf price a shopper can compare
    // against Boots or LOOKFANTASTIC on the day they read it. This site's
    // whole premise — "what does this fragrance cost right now, at this
    // retailer" — presumes a price the retailer is charging for the product
    // itself, continuously. A voucher deal is a different offer shape:
    // discontinuous (expires and is replaced by a different deal at a
    // different discount), often bundled or quantity-limited, and frequently
    // not for the product at all but for a redemption code or experience
    // that happens to be fragrance-adjacent. Comparing it against a standing
    // retail price the way this site compares Boots against Superdrug would
    // misrepresent both sides: the "price" would be a snapshot of a
    // promotion's current state, not a price, and would go stale the moment
    // the deal rotates or sells out — which a nightly harvest has no way to
    // detect mid-cycle the way it detects an ordinary price change.
    //
    // This is a product-model mismatch, not a retrieval problem, so no Apify
    // config was designed and no bot-defence status was established — an
    // actor could render Wowcher's pages perfectly and the output still
    // would not be an honest fragrance price. Keeping this disabled is the
    // right call independent of anything Apify could fix. If this is ever
    // revisited, the question to answer first is not "can we scrape it" but
    // "does a redeemed-voucher price belong next to a standing retail price
    // at all" — an editorial decision, not an engineering one.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'beauty-pie',
    name: 'Beauty Pie',
    domain: 'beautypie.com',
    homepage: 'https://www.beautypie.com',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes:
        'Applied via Awin 2026-08-11. Membership-model retailer (products priced at cost to ' +
        'members) — worth checking whether its listed prices are even meaningful without a ' +
        'membership before this goes live. Delivery terms and page structure not yet read.',
    },
    // ── Apify harvest evaluation, 2026-08-19 ──────────────────────────────
    // Not designed. Nothing in this project has ever fetched a single page
    // from this shop — no strategy-memory record exists for it, because
    // scripts/catalogue-probe.ts only ever probes `enabled` shops and this
    // one never has been. `catalogue: null` means there is no confirmed
    // category URL to point any adapter at yet, free, proxied or actor —
    // that has to come from a human opening the real site in a browser, the
    // same first step every other shop in this file went through (see the
    // "confirmed live in a browser" notes throughout). Bot-defence status is
    // therefore unestablished, not "hard" or "easy" — there is no evidence
    // either way, and Apify only has a job once a real start URL exists to
    // give it.
    //
    // A second, independent open question sits ahead of the retrieval one:
    // the shipping note above already flags that Beauty Pie's listed prices
    // are "at cost to members" — if the storefront only shows that
    // member-cost figure and not a comparable non-member price, no adapter,
    // however good, produces an honest comparison against a shop anyone can
    // walk into and buy from at the price shown. That has to be answered by
    // reading the actual product page, not assumed either way here.
    //
    // Awin applied 2026-08-11, unconfirmed as of this review (2026-08-19,
    // eight days later) — `npm run awin:memberships` is the tool that would
    // confirm approval, and if it lands first this whole question moves to
    // Group A/B's feed-sync territory rather than staying here.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'very',
    name: 'very.co.uk',
    domain: 'very.co.uk',
    homepage: 'https://www.very.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    // ── Apify harvest evaluation, 2026-08-19 ──────────────────────────────
    // Not designed, for the same reason as Beauty Pie above: no
    // strategy-memory record exists, `catalogue: null` means no confirmed
    // category URL exists for any adapter to target, and bot-defence status
    // is genuinely unestablished rather than assumed hard. A CI probe
    // dispatch was attempted this review (catalogue-daily.yml workflow_dispatch
    // with probe_shop=very, using catalogue-probe.ts's new --shop bypass of
    // `enabled` — see that script's own comment) but was queued behind the
    // day's scheduled harvest and then displaced by a second dispatch before
    // it got a runner; GitHub Actions keeps only one pending run per
    // concurrency group, so firing dispatches back to back cancels the
    // earlier one rather than queuing both. Re-running that single-shop
    // probe once a runner is free is the next concrete step, and it costs
    // nothing — it is the free-tier strategies, not Apify.
    //
    // very.co.uk is a general department store (electronics, furniture,
    // clothing) that also sells fragrance, the same shape as John Lewis —
    // worth checking against John Lewis's own entry once real URLs exist,
    // since a large general retailer's defence posture can differ sharply
    // from a specialist beauty retailer's.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'gorgeous-shop',
    name: 'Gorgeous Shop',
    domain: 'gorgeousshop.com',
    homepage: 'https://www.gorgeousshop.com',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'beauty-flash',
    name: 'Beauty Flash',
    domain: 'beautyflash.co.uk',
    homepage: 'https://www.beautyflash.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'scentsational',
    name: 'Scentsational',
    domain: 'scentsational.com',
    homepage: 'https://www.scentsational.com',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'beauty-the-shop-uk',
    name: 'Beauty The Shop UK',
    domain: 'beautytheshop.com',
    homepage: 'https://www.beautytheshop.com',
    tiers: ['designer', 'niche'],
    // CURRENCY NOT CONFIRMED — same shape as Paco Perfumerias above. The
    // `currency: 'GBP'` on the next line is what the Retailer type forces, not
    // a fact about this shop: it ships from Madrid and nobody has established
    // what UK orders are actually priced in. Read `shipping.notes` below and
    // CURRENCY_UNCONFIRMED at the foot of this file before enabling it.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 7],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes:
        'Applied via Awin 2026-08-11. Ships from Madrid, Spain — whether UK orders are actually ' +
        'GBP-priced has not been confirmed, so the GBP above is the type talking, not a checked ' +
        'figure, and this entry is listed in CURRENCY_UNCONFIRMED at the foot of this file. ' +
        'Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'perfume-market-uk',
    name: 'Perfume Market UK',
    domain: 'perfumemarketuk.com',
    homepage: 'https://www.perfumemarketuk.com',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'parfumdreams-uk',
    name: 'Parfumdreams UK',
    domain: 'parfumdreams.co.uk',
    homepage: 'https://www.parfumdreams.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'perfume-click',
    name: 'Perfume Click',
    domain: 'perfume-click.co.uk',
    homepage: 'https://www.perfume-click.co.uk',
    tiers: ['designer'],
    // Accepted onto the Awin programme, and nobody noticed for three days.
    //
    // The application went in on 2026-08-11 and this entry sat at 'pending'
    // because nothing in the project ever checked back. What surfaced it was
    // scripts/awin-memberships.ts on 2026-08-14: advertiser 6561 reads
    // membershipStatus 'active' in the account's own feed list. Before that
    // script the only signal was the feed sync's "910 feed(s) visible" line,
    // which counts feeds rather than memberships and so said nothing at all
    // about approvals.
    //
    // Enabled 2026-08-16. This entry set its own two gates — a feed that had
    // actually landed, and a standard delivery cost read off the shop's own
    // site — and both were met days before anyone came back to look, while it
    // still said "no feed has been fetched from this merchant yet". That
    // sentence was true when written and stale by the time it was read again,
    // which is the failure mode of a gate nothing goes back to check.
    //
    // THE FEED. data/catalogue/perfume-click.json holds 10,581 rows, 10,499 of
    // them active and priced, snapshot source 'live', last imported
    // 2026-08-15 21:07:56 per data/awin-feed-sync-state.json.
    //
    // THE CURRENCY, which is what Nicchia Luxury proves a .co.uk domain and a
    // UK Awin programme do not settle. Four readings, and the third is the one
    // that would have caught Nicchia:
    //   - perfume-click.co.uk on a UK Awin programme, advertiser 6561,
    //     membershipStatus 'active';
    //   - the shop's own delivery page quotes sterling throughout — "Standard
    //     Delivery (Collection also available) ~ £2.95" and "Free Delivery On
    //     Orders Over £50" — where Nicchia's own shipping policy quoted "Free
    //     express delivery over 140 USD";
    //   - RRP against a confirmed-sterling UK shop. Over the 348 EANs this
    //     feed shares with fragrance-click, wasPrice/wasPrice has median 1.012
    //     and p25 exactly 1.000, spread rather than clustered. A reference
    //     price is a manufacturer fact, so two honest UK shops agree on it,
    //     and a shop on a foreign scale shows a CONSTANT factor instead —
    //     Escentual 1.452, Nicchia 1.3490 across 99.9% of its rows. This is
    //     inference from a sample and not a checkout, and is labelled as such;
    //     what it rules out is the exact failure both those shops had;
    //   - the id is not in CURRENCY_UNCONFIRMED, and prices run £2.10 to
    //     £633.45 with a median of £20.75, which is a fragrance price list in
    //     pounds.
    // No feed currency column was trusted for any of this. A feed currency
    // column is precisely what was trusted for Nicchia Luxury.
    //
    // THE DELIVERY COST is in the block below, read off their own page by CI
    // and quoted there.
    enabled: true,
    // Routes this merchant into scripts/awin-feed-sync.ts, which selects on
    // exactly this: adapter 'affiliate-feed', network 'awin', and a merchant
    // id recoverable from the signup URL. Nothing else has to change for the
    // next sync to try it. If the merchant publishes no feed the sync reports
    // that and moves on, the same way it already does for The Beauty Store UK.
    adapter: 'affiliate-feed',
    currency: 'GBP',
    shipping: {
      // First figure this entry has ever held, and it is not a first guess.
      // perfume-click.co.uk answered HTTP 403 to every candidate path on six
      // consecutive runs from 2026-08-11 to 2026-08-13. On 2026-08-15 a
      // GitHub runner reached /Delivery-Information/ and read the rate off it
      // — npm run shipping:discover, committed in 6a99c99 as
      // data/shipping-discovery-report.json, checkedAt 2026-08-15T20:23:39Z.
      // That run's own verdict was PROPOSE-RATE: the tool will not write a
      // shop's first delivery figure itself and hands it to a human. This is
      // that human act, on the sentence it quoted.
      standardGbp: 2.95,
      freeOverGbp: 50,
      // Unchanged and unsourced — the page read here states costs, not
      // timings.
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-15',
      confidence: 'confirmed',
      source: {
        url: 'https://www.perfume-click.co.uk/Delivery-Information/',
        quote: 'Standard Delivery (Collection also available) ~ £2.95',
        readAt: '2026-08-15',
      },
      notes:
        'Awin programme accepted — advertiser 6561 reads membershipStatus "active" in the ' +
        "account's own feed list, read by npm run awin:memberships on 2026-08-14. The £50 " +
        'threshold comes off the same page, stated twice: "Free Delivery On Orders Over £50" ' +
        'and, in its own country table, "United Kingdom ~ Orders over £50 : FREE". An Express ' +
        'tier at £3.95 ("Express Delivery (Collection also available) ~ £3.95") is an upgrade ' +
        'and is not modelled.',
    },
    catalogue: null,
    affiliate: {
      ...awinActive('6561', '3017443'),
      // Images are hot-linked from this shop's own servers with no licence
      // obtained — see the ImageBasis doc comment. Nothing is copied or
      // rehosted, and every image sits beside a link sending the reader to buy
      // from them. Unset this the moment they object or block hot-linking.
      imageBasis: 'hotlink-unlicensed',
    },
  },
  {
    id: 'beauty-bay',
    name: 'Beauty Bay',
    domain: 'beautybay.com',
    homepage: 'https://www.beautybay.com',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    // ── Apify harvest evaluation, 2026-08-19 ──────────────────────────────
    // Not designed, same reasoning as very.co.uk and Beauty Pie above: no
    // strategy-memory record exists, `catalogue: null` means no confirmed
    // category URL for any adapter to target, bot-defence status is
    // genuinely unestablished. A CI probe dispatch was queued this review
    // (catalogue-daily.yml, probe_shop=beauty-bay) and is waiting behind the
    // day's scheduled harvest as of this writing — check
    // data/strategy-memory.json for a beauty-bay:: record before assuming
    // this is still unread by the time anyone acts on this entry.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'fragrancedirect',
    name: 'Fragrancedirect',
    domain: 'fragrancedirect.co.uk',
    homepage: 'https://www.fragrancedirect.co.uk',
    tiers: ['designer'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes:
        // Merchant id 9, same account-wide network as Fragrance Click UK's — found while
        // confirming this domain, not guessed.
        'Applied via Awin 2026-08-11 (merchant id 9). Delivery terms and page structure not yet read.',
    },
    catalogue: null,
    affiliate: { ...awinRequested('9') },
  },
  {
    id: 'cult-beauty-global',
    name: 'Cult Beauty Global',
    domain: 'cultbeauty.co.uk',
    homepage: 'https://www.cultbeauty.co.uk',
    tiers: ['designer', 'niche'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes: 'Applied via Awin 2026-08-11. Delivery terms and page structure not yet read.',
    },
    // ── Apify harvest evaluation, 2026-08-19 ──────────────────────────────
    // Not designed, same reasoning as the other three unresearched Awin
    // applicants above: no strategy-memory record exists, `catalogue: null`
    // means no confirmed category URL for any adapter to target, bot-defence
    // status is genuinely unestablished. Not probed this review — the CI
    // dispatch budget for this pass went to very.co.uk and Beauty Bay first;
    // `npm run probe -- --shop=cult-beauty-global` via a
    // catalogue-daily.yml workflow_dispatch (probe_shop=cult-beauty-global)
    // is the next concrete, free step, same tool as the other two.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },

  // ── Confirmed Awin merchant, not yet applied to (Cosmetify) ─────────────────
  {
    id: 'cosmetify',
    name: 'Cosmetify',
    domain: 'cosmetify.com',
    homepage: 'https://www.cosmetify.com',
    tiers: ['designer', 'niche'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-11',
      confidence: 'unverified',
      notes:
        // Surfaced by Microsoft Shopping listing our own Azzaro search alongside
        // it. Awin merchant id 29993 confirmed via their own merchant profile
        // (ui.awin.com/merchant-profile/29993); their affiliate page states the
        // product feed includes EANs. Not yet applied to on this account —
        // see the outreach doc. Delivery terms and page structure not yet read.
        "Confirmed Awin merchant (id 29993), not yet applied to. EAN-inclusive product feed per Cosmetify's own affiliate page. Delivery terms and page structure not yet read.",
    },
    catalogue: null,
    affiliate: { ...awinPending('29993') },
  },

  // ── Surfaced by Microsoft Shopping, nothing yet read from the shop ──────────
  {
    id: 'carethy',
    name: 'Carethy',
    // Taken from the shopping listing, which named the shop "Carethy.co.uk".
    // That is the only source for this domain — nobody has opened it, so the
    // `www.` on the homepage below is a convention, not something observed.
    // Confirm both before enabling.
    domain: 'carethy.co.uk',
    homepage: 'https://www.carethy.co.uk',
    // From the one listing seen: a Calvin Klein Eau de Parfum, which is
    // designer. Whether they carry niche or Middle Eastern houses is unknown,
    // so those tiers are not claimed.
    tiers: ['designer'],
    // Disabled, and it must stay that way until someone has actually read this
    // shop. Everything known about it is one line of a third-party shopping
    // widget. In particular the currency is not established and this entry is
    // listed in CURRENCY_UNCONFIRMED at the foot of this file, which is the
    // lesson from nicchia-luxury-uk written down as data rather than as
    // regret: that shop went live with 4,032 listings on a `currency: 'GBP'`
    // nobody had checked, and the guard could not catch it because nobody had
    // added it to the list. A .co.uk domain is not evidence of sterling
    // pricing — uk.zimayaperfumes.com quotes dollars.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      // Not a reading of their delivery page, which nobody has opened — the
      // registry requires a range and this is the neutral one used for every
      // unresearched entry here. shipping:discover replaces it with what the
      // page says, or records that the page says nothing.
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-13',
      confidence: 'unverified',
      notes:
        'Added 2026-08-13 from a Microsoft Shopping results page, which listed it against ' +
        'Calvin Klein Contradiction Eau de Parfum 100ml. Nothing here has been read from the ' +
        'shop itself: not its delivery terms, not its robots.txt, not its checkout currency, ' +
        'not whether it sells fragrance beyond the one listing seen. The £30.14 in that ' +
        'listing was a paid placement in a third-party surface, not a price read from this ' +
        'shop, and is deliberately not recorded as one anywhere. No affiliate programme has ' +
        'been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },

  // ── Amazon UK: wanted, but gated behind things nobody here can do ───────────
  {
    id: 'amazon-uk',
    name: 'Amazon UK',
    domain: 'amazon.co.uk',
    homepage: 'https://www.amazon.co.uk',
    // Amazon sells across every tier. Claiming all of them would be true of
    // the shop and useless as a signal, so this records the two the site
    // actually compares on and leaves the rest unclaimed until a real
    // catalogue exists to measure.
    tiers: ['designer', 'niche'],
    // Disabled, and unlike most entries here that is not merely "nobody has
    // looked yet". Three separate things block it, and none of them is code:
    //
    //   1. There is no legitimate way to read Amazon's prices without the
    //      Product Advertising API (PA-API 5.0), and PA-API keys are issued
    //      only to an approved Associates account that has already made
    //      qualifying sales. The API is how you would build the thing that
    //      produces the sales, so the gate closes on itself. Scraping is the
    //      other route and is not one: it breaches their terms, and a price
    //      this project could not source or defend is the opposite of what
    //      every other entry in this file is for.
    //   2. PA-API's terms restrict how long a retrieved price may be retained
    //      and displayed. This repo stores prices at rest in
    //      data/catalogue/*.json and keeps demo/priceHistory.generated.ts
    //      deliberately, so the storage model and the licence may be in
    //      direct conflict. NOBODY HAS READ THE CURRENT OPERATING AGREEMENT —
    //      that conflict is stated here as the thing to check first, not as a
    //      finding. Check it before writing an adapter, not after.
    //   3. Amazon fragrance is largely third-party marketplace, with a
    //      documented grey-market and authenticity problem, and a listing
    //      often carries several sellers at several prices. "The Amazon
    //      price" is not one number the way every other retailer here quotes
    //      one. Which seller a comparison would name is an editorial decision
    //      that has not been made.
    //
    // ── Reviewed 2026-08-19, position unchanged ───────────────────────────
    // Revisited as part of the bot-defended-majors Apify rollout, on the
    // instruction that Amazon specifically gets no scraper built for it.
    // Confirmed here rather than assumed: none of the three blockers above
    // is a retrieval problem Apify — real-browser rendering, a UK-geo
    // residential proxy, or otherwise — could touch. (1) is a licensing gate
    // on the *legitimate* API, and scraping around it does not acquire a
    // licence, it evades the requirement for one; a site whose entire pitch
    // is a defensible, sourced price cannot rest one of its 58 retailers on
    // a route it would have to hide. (2) and (3) are retention-terms and
    // editorial questions that exist independent of how the page is
    // fetched. No Apify config was designed, no strategy-memory probe was
    // run against amazon.co.uk, and none of that is an oversight — it is
    // the deliberate absence this entry has held since 2026-08-16, held
    // again now on inspection rather than by default.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      // The neutral placeholder every unresearched entry here carries, not a
      // reading of Amazon's delivery terms. Amazon's actual delivery cost
      // depends on Prime membership, seller, and basket — a single standard
      // rate may not be expressible for this retailer at all, which is itself
      // something to establish before enabling.
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-16',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from Amazon. Delivery cost varies by Prime membership, ' +
        'seller and basket, so whether a single standard rate can honestly represent this ' +
        'retailer is an open question, not a figure waiting to be looked up.',
    },
    catalogue: null,
    // Amazon Associates is Amazon's own in-house programme, not one of the
    // networks this account already uses. `verified: false` because nobody
    // has opened the programme's own page from here to confirm its terms —
    // egress to arbitrary hosts is blocked in the environment this was
    // written in (see docs/INGESTION.md).
    affiliate: {
      ...NO_AFFILIATE_YET,
      network: 'direct',
      status: 'not-applied',
      signupUrl: 'https://affiliate-program.amazon.co.uk/',
    },
  },
  {
    id: 'fragrancehub',
    name: 'FragranceHub',
    domain: 'fragrancehub.co.uk',
    homepage: 'https://www.fragrancehub.co.uk/',
    tiers: ['mideast'],
    // Added 2026-08-18 from WebSearch snippets alone, then actually measured
    // the next day. Self-described as "Home of Niche Arabian Perfumes",
    // stocking Lattafa, Afnan and Ajmal — the same mideast tier three
    // existing retailers already carry.
    //
    // ── What the currency probe found ────────────────────────────────────────
    // Price verification run 23, job 95684340039, 2026-08-18: the storefront
    // served a sterling price list, at rate 1, to eight of the nine ways of
    // asking — its bare origin, ?country=GB, a localization=GB cookie, a
    // cart_currency=GBP cookie, both cookies together, and an en-GB
    // Accept-Language header. Only the market-path addresses (/en-gb, /gb,
    // /uk, /en-uk) 404, which is a shop that simply does not use that URL
    // shape rather than one that refuses sterling.
    //
    // That is why the id has been removed from CURRENCY_UNCONFIRMED at the
    // foot of this file. The bar that list sets is a sterling price read off
    // the shop itself rather than assumed from the type, and this clears it.
    // Note what it does not establish: the runner is not in the UK, so this
    // proves what the shop quotes that machine, and a harvest must ask the
    // same way rather than trusting whichever market a runner lands in.
    //
    // `shopifyStorefront` is now set rather than left unset: the same run read
    // /products.json and got a real Shopify payload back, three priced
    // products among them (rayhaan-nava-sol-eau-de-parfum-100ml at 30.00,
    // khadlaj-shiyaaka-sky-eau-de-parfum-100ml at 34.99). That is the
    // confirmed read the previous note said was still missing. `adapter` stays
    // 'unknown' because no harvest has actually run against this shop yet.
    //
    // Still off, and the blocker is commercial rather than technical: no
    // affiliate programme is confirmed. Nothing here is a reason to flip
    // `enabled` — a delivery cost and an affiliate route are both still open.
    enabled: false,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet describes "free shipping when spending over £90",
      // but that is marketing copy read secondhand, not a shipping:discover
      // run against the shop's own delivery page — so the figure is named
      // here, not stored as freeOverGbp.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-18',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://www.fragrancehub.co.uk/policies/shipping-policy',
        quote: 'FREE SHIPPING FOR ORDERS OVER £90',
        readAt: '2026-08-18',
      },
      notes:
        "Their own shipping-policy page was read by shipping:discover on 2026-08-18 and states " +
        '"FREE SHIPPING FOR ORDERS OVER £90" (quoted in `source` above), which supersedes the ' +
        'WebSearch snippet this entry was first written from. No standard flat rate for an order ' +
        'below that threshold is published anywhere on the page, which is what ' +
        '`standardRateNotPublished` records — an absent figure, not one waiting to be looked up. ' +
        'Currency is separately confirmed as sterling; see the comment above this entry.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
] as const;

/**
 * Retailers whose `currency: 'GBP'` above is an artefact of the type rather
 * than a checked fact, each mapped to the reason nobody can yet say what that
 * shop charges in.
 *
 * `Retailer['currency']` is the literal type `'GBP'` — its doc comment in
 * src/types/retailer.ts reads "All registry entries are UK storefronts pricing
 * in sterling" — so the type has no value meaning "not established yet". Every
 * entry in this file therefore asserts sterling whether or not anyone looked.
 * For the shops below nobody has looked, and each one's own `shipping.notes`
 * says so in as many words. That left the entry stating as fact the exact
 * thing its own note calls unconfirmed.
 *
 * It is a trap rather than a cosmetic contradiction, because code downstream
 * reads the registry's promise literally. src/catalogue/shopifyProductsCrawl.ts
 * stamps `currency: 'GBP'` onto every price it reads and cites "that type's own
 * constraint" as its authority for doing so. Enable a euro-priced shop on a
 * scrape route and euro amounts publish as pounds on every listing, with
 * nothing failing anywhere — on a site whose entire premise is real GBP prices.
 * The affiliate-feed route happens to be safer: src/catalogue/awinFeed.ts skips
 * any row whose currency column is not GBP, so such a retailer would yield
 * nothing rather than nonsense. That covers one of the several ways a retailer
 * gets brought online, not all of them, and it is a side effect of the feed
 * parser rather than a guarantee this file makes.
 *
 * So the unconfirmed-ness lives here as data, and the check below turns
 * "someone flips `enabled: true` without reading the note" from a silent
 * mispricing into a throw on the first import. No currency is invented for any
 * of these — none has been confirmed, and guessing one is the error being
 * prevented.
 *
 * The way off this list is to reach one of these shops' own checkout and
 * record which currency it actually charged, then delete the id here and say
 * so in that retailer's `shipping.notes`. Deleting an id to quieten a failing
 * build re-arms the trap and removes the only thing standing in front of it.
 */
export const CURRENCY_UNCONFIRMED: ReadonlyMap<string, string> = new Map([
  // zimaya was removed from this list on 2026-08-19, on the evidence the list
  // itself asks for: currency probe, run 32254603051 job 96073283174, read a
  // sterling price list off the shop's own storefront at rate 1, identically
  // through six separate ways of asking. See the comment on its registry
  // entry above for what that run established. It is now `enabled: true`.
  // fragrancehub was removed from this list on 2026-08-19, on the evidence the
  // list itself asks for: Price verification run 23, job 95684340039, read a
  // sterling price list off the shop's own storefront at rate 1 through eight
  // separate ways of asking. See the comment on its registry entry above for
  // what that run did and did not establish. It remains `enabled: false` for
  // unrelated reasons, so nothing about this removal puts a price on the site.
  [
    'khadlaj',
    'khadlaj-perfumes.co.uk is confirmed Shopify (products.json returns a real payload, ' +
      'priced products among them) but every one of nine ways of asking — origin, ?country=GB, ' +
      'both localisation cookies, Accept-Language en-GB, and the /en-gb /gb /uk /en-uk market ' +
      'paths — either 404s or quotes this runner USD at rate 1, none settling GBP. Currency ' +
      'probe, run 32255506486 job 96076159301, 2026-08-19T12:59Z. Nothing measured suggests a ' +
      'sterling price list is reachable from any address this repo knows how to ask.',
  ],
  [
    'paco-perfumerias',
    'A Spanish retailer (pacoperfumerias.com) with a UK-targeted Awin programme. Whether that ' +
      'programme checks out in GBP, or the site is EU-priced throughout, has not been confirmed.',
  ],
  [
    'beauty-the-shop-uk',
    'Ships from Madrid, Spain. Whether UK orders are actually GBP-priced has not been confirmed.',
  ],
  [
    'nicchia-luxury-uk',
    'An Italian storefront (nicchialuxury.com) whose own shipping policy states its threshold ' +
      'in dollars ("Free express delivery over 140 USD"), and whose storefront was measured ' +
      'publishing EUR on 2026-08-13 (parseShopCurrency, Price verification run 4, job ' +
      '94426059278). Its stored prices are NOT those euro figures — live/stored across all ' +
      '6,843 keyable listings is a constant 1.3490 (99.9% of the 4,383 listings at or above ' +
      '£50 sit within 1% of it), where relabelled euros would give 1.0 — so the feed is not ' +
      'republishing the storefront in the wrong unit; it is that euro list divided by a fixed ' +
      'factor. No sterling price list was found at any address tried (run 5, job 94428122841: ' +
      '/en-gb answered USD; /gb, /uk, /en-uk none). Whether 1.3490 was ever a real exchange ' +
      'rate was not established, and nothing measured suggests this shop takes sterling at ' +
      'all. It ran enabled with 4,032 offer rows live on that unproven declaration until ' +
      '2026-08-13. Its stored snapshot went on holding all 6,843 of those figures in priceGbp ' +
      'for three days after that — disabling a shop stops it being published, it does not touch ' +
      'the file — and they were cleared on 2026-08-16 by npm run quarantine:prices, each amount ' +
      "kept as nativePrice under currency 'unknown', the only label the measurements above " +
      'support: not the euros the storefront quotes, not pounds, and not a converted anything. ' +
      'CatalogueStore.write now refuses to store a sterling figure against any id on this list, ' +
      'so no routine run can put them back.',
  ],
  [
    'carethy',
    'Listed here on the day it was added, before anyone had opened the shop — which is the ' +
      'only moment at which this list can be complete. Everything known about carethy.co.uk ' +
      'is one row of a Microsoft Shopping results page; its checkout currency has not been ' +
      'looked at, and a .co.uk domain is not evidence of sterling (uk.zimayaperfumes.com ' +
      'quotes dollars). No claim is made that it prices in anything in particular.',
  ],
  [
    'escentual',
    'The shop is a UK shop and it charges in pounds; what was published here was dollars. ' +
      'Measured 2026-08-15 from a GitHub Actions runner (currency probe, run 31880556596, job ' +
      '95002418010, commit a735ef6): escentual.com/meta.json says it SETTLES in GBP, while its ' +
      'theme quoted that runner USD at its own published rate of 1.38605. Asked ?country=GB — ' +
      'or holding the localization=GB cookie a country selector sets — the same storefront ' +
      'quotes GBP at rate 1. The difference is not cosmetic: /products.json served 39.00 for ' +
      'nuxe-reve-de-miel-ultra-comforting-body-cream at the origin and 28.00 under ?country=GB, ' +
      'and the Calvin Klein Obsession 125ml this repo held at "£57.00" came back 40.95 GBP. ' +
      'That is what the offline measurement of 2026-08-13 (commit 86c4660) was seeing when it ' +
      'found this shop 1.452x fragrance-click over 132 products and 1.443x mybeauty-boutique ' +
      'over 213, where those two agree with each other at 1.000, and when a hand check from the ' +
      'UK read £40.25 against our £57.00. Nothing in this repo ever applied a rate; the shop ' +
      'applied one and we wrote the result down as pounds. Nor may anyone undo it that way: 57 ' +
      '/ 1.38605 is 41.12 and the GBP list says 40.95, because a Shopify market rounds its own ' +
      'prices. It ran enabled with 2,542 offer rows live until 2026-08-13. ' +
      'WHAT WOULD TAKE IT OFF THIS LIST: the bar above is a checkout, and a checkout is exactly ' +
      'what has not been reached — no basket has been made at this shop and none should be made ' +
      'casually. What is held instead is a storefront price list the shop labels GBP, settling ' +
      'GBP, at no conversion, in two independent documents (the theme and the product page\'s ' +
      'schema.org priceCurrency), reproducible in a minute by dispatching price-verify.yml with ' +
      'currency_probe and currency_probe_require_gbp. A human may decide that clears the bar. ' +
      'This id stays here until one does, and the deciding is the point: it is not a thing to ' +
      'infer from a green tick.',
  ],
]);

// Runs once, at import, which is the only moment early enough to matter: by
// the time a price reaches a snapshot the currency has already been assumed.
// Cannot fire today — all six are `enabled: false` — and that is the point.
// It exists for the edit that flips one of them without reading the note.
//
// It did not catch Nicchia Luxury, because Nicchia Luxury was never on this
// list: the entry was enabled on 2026-08-12 by someone who had read the Awin
// feed's GBP column and taken it for the shop's currency, and this map only
// guards ids that are already in it. A check over a hand-maintained list
// cannot fire for the case nobody thought to add, which is the case that
// needs it. What it does do is make the next flip of any listed id loud.
//
// This check guards the registry. It does not guard the snapshots on disk,
// and until 2026-08-16 nothing did: an id could sit here, disabled, while its
// data/catalogue file went on holding thousands of prices in priceGbp, and a
// routine run could refresh them — which is what happened to Escentual on
// 2026-08-13 (86c4660 cleared 8,104, harvest 5c32130 restored all 8,104
// ninety minutes later) and what Nicchia Luxury's 6,843 rows were still doing
// three days on. assertNoQuarantinedGbpPrices, called from
// CatalogueStore.write, is the other half: while an id is on this list, no
// writer of any snapshot can put a sterling figure against it.
const enabledWithoutConfirmedCurrency = RETAILERS.filter(
  (r) => r.enabled && CURRENCY_UNCONFIRMED.has(r.id),
);
if (enabledWithoutConfirmedCurrency.length > 0) {
  throw new Error(
    'Retailer(s) enabled without a confirmed currency: ' +
      enabledWithoutConfirmedCurrency
        .map((r) => `${r.id} — ${CURRENCY_UNCONFIRMED.get(r.id)}`)
        .join(' | ') +
      " Their currency: 'GBP' is what the Retailer type forces, not anything anyone checked, so " +
      'enabling them can publish euro prices as pounds. Confirm the checkout currency first, then ' +
      'remove the id from CURRENCY_UNCONFIRMED in src/config/retailers.ts. Removing it to make ' +
      'this message go away is the failure this check exists to prevent.',
  );
}

/** Registry lookup by id. Built once — the registry is static. */
const BY_ID = new Map(RETAILERS.map((r) => [r.id, r]));

export function getRetailer(id: string): Retailer | undefined {
  return BY_ID.get(id);
}

/** Retailers the pipeline should currently fetch from. */
export function enabledRetailers(): Retailer[] {
  return RETAILERS.filter((r) => r.enabled);
}

/**
 * Retailers worth querying for a given catalogue segment. Skipping a retailer
 * that cannot carry the product saves a fetch and avoids a spurious no-result.
 */
export function retailersForTier(tier: Retailer['tiers'][number]): Retailer[] {
  return enabledRetailers().filter((r) => r.tiers.includes(tier));
}

/**
 * Whether this retailer could never carry this brand, because it is one other
 * house's own storefront.
 *
 * This is the distinction between "does not stock it" and "is not that kind of
 * shop". Armaf's own UK shop not selling a Dior fragrance is not a gap in
 * Armaf's range — it is what a single-brand storefront is. Saying "not
 * available" there states something about Dior's availability that isn't
 * really about availability at all, so the two are presented separately (see
 * `detailView` in demo/app.ts).
 *
 * Matching goes through `brandKey`, so "BellaVita Luxury (UK)" and "BellaVita"
 * still resolve to the same house rather than reading as two. A prefix match
 * is deliberately as far as it goes: retailer feeds suffix the house with
 * market and entity noise ("(UK)", "Luxury"), but a *substring* match anywhere
 * would let two genuinely unrelated names collide, which is the one error that
 * would hide a real shop from a page it belongs on.
 */
export function cannotCarryBrand(retailer: Retailer, brand: string): boolean {
  if (!retailer.singleBrandOnly) return false;
  const house = brandKey(retailer.singleBrandOnly);
  const candidate = brandKey(brand);
  if (!house || !candidate) return false;
  return !(candidate.startsWith(house) || house.startsWith(candidate));
}
