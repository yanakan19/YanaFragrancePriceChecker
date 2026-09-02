import type { Retailer } from '../types/retailer.js';
import { brandKey } from '../catalogue/brandName.js';

/**
 * The PriceSniffs retailer registry.
 *
 * 79 retailers, 39 of them `enabled: true`. Every one of them is a legitimate
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
 * tracking; every other entry's resolve to the plain retailer URL. Twelve
 * retailers are confirmed Awin merchants and one (Selfridges) a confirmed
 * Partnerize merchant; 21 applications are in flight and 46 entries have not
 * been researched at all. See `docs/AFFILIATE_SETUP.md` for
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
    //
    // ── The free local-render tier, measured, 2026-08-27 ──────────────────
    // Nobody had tried the *free* tier (a local headless Chromium — see
    // scripts/catalogue-harvest.ts and src/catalogue/localBrowser.ts, which
    // runs unconditionally for every enabled shop before either paid Apify
    // tier, `adapter` notwithstanding) against this shop specifically, so
    // CI dispatch run #344 (commit 0fb2cd4) captured what it actually
    // rendered: data/render-capture/notino-uk/{fragrance,mens,womens,niche}.html.
    //
    // fragrance.html is real: its <title> is "Fragrances" and it carries a
    // genuine CollectionPage JSON-LD block with 27 Product entries under
    // `mainEntity`, each with a real Offer (GBP price, availability, URL).
    // That shape was one flatten() branch away from working — the parser
    // followed `@graph`, `itemListElement` and `item` but had never seen a
    // plain `mainEntity` array, so it silently found nothing here even
    // though this exact page was already being fetched for free every run.
    // Fixed in src/catalogue/jsonld.ts (2026-08-27); tests/catalogue.test.ts
    // runs the real parser against this real, committed fixture and checks
    // an exact price by hand (Xerjoff XJ 1861 Naxos, £144.50) rather than
    // trusting a synthetic one. Notino's Product nodes carry no sku, mpn,
    // gtin13/gtin/gtin14/gtin8 or productID at all — 0 of 27 — and only
    // about a third embed a size in `description`; every listing still gets
    // an identifier because parseListings falls back to the product URL's
    // own slug, same as any other GTIN-less sitemap-route shop already in
    // this registry.
    //
    // mens.html, womens.html and niche.html did NOT come back the same way:
    // each rendered to Cloudflare's interactive "Just a moment..." challenge
    // (title, cf-chl-widget markup, challenges.cloudflare.com script — a real
    // bot-management verdict, `cType: 'managed'` in each page's own
    // `_cf_chl_opt`, not an incidental string hit like the Turnstile config in
    // fragrance.html's own footer). All four requests went through
    // localBrowserRenderer's one shared browser context for the whole batch
    // (see its own comment on why: cookie continuity across pages); fragrance
    // was rendered first and got real content, and the three after it in that
    // same session all got challenged. Their own `cITimeS` (Cloudflare's
    // server-side timestamp, embedded per challenge) put them at 557s/565s/
    // 573s — ~8s apart in the config's own section order, not "~1s apart" as
    // this comment used to claim; ~8s matches localBrowser.ts's own measured
    // per-page cost on a page whose network never goes idle (goto + the 5s
    // NETWORK_IDLE_TIMEOUT_MS + 1.5s SETTLE_MS + 1s gapMs). So the original
    // reading of "rapid navigation" was not what the timestamps actually show
    // — this was ordinary sequential rendering at this tier's normal pace.
    //
    // ── Session-order theory tested live and refuted, 2026-08-27 ──────────
    // Two hypotheses were left open by the above: being first in the shared
    // context is what let /fragrance/ through, or these three URL paths carry
    // a stricter Cloudflare rule regardless of order. CI dispatch (commit
    // 467abec reordered `sections` to put mens first, run #348) tested it
    // directly: with mens as the sole first request in a brand-new browser
    // context — nothing rendered before it in that session at all — it still
    // came back a `cType: 'managed'` challenge (cRay a31ea79598096af7,
    // cITimeS 1787871230). fragrance, now rendered *second* in that same
    // session, still came back real (CollectionPage JSON-LD, title
    // "Fragrances and Aftershaves…"). Order therefore is not the variable:
    // /fragrance/ succeeds regardless of position and the other three fail
    // regardless of position. Reverted back to fragrance-first below — this
    // repo's committed sitemaps and any human checking urlTemplate values by
    // eye expect that order, and there is no longer a reason to keep it
    // changed. See data/render-capture/notino-uk/{mens,fragrance}.html from
    // that run for the raw bytes.
    //
    // What that leaves: these three section paths are, as far as this repo
    // can tell, simply behind a stricter Cloudflare rule than /fragrance/ —
    // by path, not by request pattern. Nothing this codebase does today
    // (context reuse, request timing, batching) plausibly explains or fixes
    // that, and Cloudflare's bot-management scoring is not published, so no
    // further theory is asserted about *why* the split runs along those
    // specific paths. A residential proxy or paid actor render (both untested
    // here — no credential in this environment) might clear a managed
    // challenge that a datacentre-IP headless browser cannot; that is the
    // only remaining unexplored tier, and it is exactly the same paid
    // escalation path already documented above for the 403 case. Nothing
    // about this finding is grounds to fingerprint-spoof or interaction-fake
    // past the challenge — see how this registry already treats Boots,
    // Superdrug and Zara.
    //
    // `adapter` moves from 'proxied' to 'headless' on the strength of the
    // fragrance section alone — a plain headless browser, no residential
    // proxy, no Apify credential, is enough to get real priced listings from
    // this shop's largest, catch-all section. It is not a claim that the
    // other three sections are solved: they still yield nothing through
    // every tier this run tried, and are left as-is rather than chased
    // further without a credentialed proxy/actor tier to actually test.
    adapter: 'headless',
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
    //
    // ── Measured, 2026-08-20. This shop beats the real browser too ──────────
    // Harvest probe run 20, job 96351658923, with APIFY_TOKEN live:
    //
    //     [actor] rendered 1 section page(s), 0 listings parsed, 0 priced
    //     [actor] https://www.boots.com/fragrance/shop-all-fragrance?pageNo=1:
    //         HTTP 200, 2513 bytes
    //
    // Two and a half kilobytes. Read that against the same tier's output for
    // Selfridges (949,307 bytes) and John Lewis (about a megabyte per page)
    // on the same day through the same actor: those are rendered fragrance
    // grids, and this is a challenge page wearing a 200. Boots is refusing a
    // real Chromium browser on a UK residential IP, which is the strongest
    // retrieval this project has and the last one available to it.
    //
    // That is a genuine answer rather than an untried route, and it is worth
    // stating plainly: this shop is not gettable by any means this repo is
    // willing to use. What would change it is Boots' own affiliate feed —
    // permission rather than technique.
    //
    // ── The proxy tier, re-tried 2026-08-20 with checkApifyAccount live ─────
    // apifyAccount.ts's own header records the proxy tier's password as
    // possibly wrong, not merely broken: run 7 (job 96343392189) could not
    // tell "our secret is wrong" apart from "the shop refuses every request".
    // Harvest probe run 25, job 96420938621, 2026-08-20T12:13Z, ran the free
    // preflight first and settled that question for good:
    //
    //     Apify account: urkoppan, plan FREE
    //     Apify proxy groups available: BUYPROXIES94952, GOOGLE_SERP,
    //         RESIDENTIAL, UNBLOCKER
    //     APIFY_PROXY_PASSWORD matches this account's proxy password.
    //
    // The credential is correct. The proxy tier was then tried against this
    // shop anyway (one attempt, as the credential check alone does not prove
    // requests succeed) and failed identically to every prior run:
    //
    //     [proxied] https://www.boots.com/robots.txt: HTTP 0 — TypeError:
    //         fetch failed (Error: Request was cancelled.)
    //
    // So the earlier finding stands, now on firmer ground: this is not a
    // wrong-password problem and never was, once the password is right. Every
    // proxied request still fails at the transport layer before it reaches
    // Boots at all — the same "TypeError: fetch failed" apifyAccount.ts
    // documents at every shop, not something specific to this one. The actor
    // tier fired next (proxy having yielded nothing) and reproduced the
    // identical 2,513-byte challenge page from run 20 above, so nothing about
    // this shop's own answer has changed. What is now ruled out is "maybe the
    // secret is just wrong" — it is not, and the proxy tier's failure is a
    // separate, still-open transport question this run does not have the
    // budget to chase further.
    //
    // ── Closed, 2026-08-21: the actor tier confirms the challenge page ───
    // State probe run 32505341082, job 96844124899, 16:54Z, one rendered page
    // of /fragrance/shop-all-fragrance?pageNo=1 through the actor — a real
    // headless browser on a residential UK IP, the strongest retrieval this
    // repo has:
    //
    //     rendered 2,513 bytes
    //     JSON-LD blocks: 0; parseListings(): 0 listing(s)
    //     "£" price-shaped strings in the rendered markup: 0 (0 distinct)
    //     Script blocks carrying an id: 0
    //     ### RSC flight stream: no self.__next_f.push chunks
    //     ### API-shaped addresses named in the markup: 0 distinct
    //
    // The same 2,513-byte challenge page the plain-fetch route has always
    // got, now through the one tier that had not been asked since the
    // leaked-timer fix. Zero of everything: no structured data, no painted
    // price, no state block, no endpoint the page names to itself. This is
    // not an extraction problem — there is nothing on the page to extract —
    // and it is not a retrieval problem this repo can spend its way out of.
    //
    // No further scraping effort belongs here. The route is the affiliate
    // programme (Awin, applied, merchant 2041, below), which is permission
    // rather than technique. Deliberately not registered in
    // src/catalogue/renderedState.ts; tests/johnLewisNextData.test.ts asserts
    // this shop has no reader and cites this run for why.
    //
    // ── renderRefused, added 2026-08-26 ─────────────────────────────────────
    // The paragraph above already concluded this shop beats a real browser on
    // a residential IP; it just never stopped scripts/catalogue-harvest.ts
    // from spending a local-render page re-confirming that every run. Five
    // committed reports since (data/harvest-report.json, 2026-08-25 and
    // 2026-08-26) show the same 200-with-1188-to-1199-bytes answer through the
    // free local renderer too, so the block is not specific to the paid
    // actor's request shape either. See knownRenderRefusal in
    // src/catalogue/renderRefusal.ts for what this flag now does with that.
    //
    // Left `true`, not `'local'`, once knownRenderRefusal became tier-aware
    // (2026-09-01): the actor tier's own 2,513-byte challenge page (state
    // probe run 32505341082, cited above) is real refusal evidence from that
    // tier too, so this is the one shop this registry can genuinely say has
    // been refused on every render tier this project has tried.
    renderRefused: true,
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
    //
    // ── The free local renderer confirms it, 2026-08-26 ─────────────────────
    // src/catalogue/localBrowser.ts's free headless Chromium has since tried
    // all three sections below on every run that reached them with an actual
    // network round trip (as opposed to the shared render budget running out
    // before this shop's turn — see localBrowser.ts and knownRenderRefusal's
    // own comment for why that pool is scarce). Six such attempts across
    // data/harvest-report.json commits 2cd38bf, 33fa366, 7f49122 and c0d8109
    // (2026-08-25) and 5a5e852, c7725ab and 027593c (2026-08-26) all land in
    // the same narrow band: HTTP 403 at 27,487-27,573 bytes on every one of
    // the three sections, every time — a WAF challenge page sized within a
    // hundred bytes of itself across six independent renders, not a shop with
    // an occasional bad minute. `renderRefused` below stops offering this
    // shop a page from that shared budget for an outcome six real attempts
    // already agree on.
    //
    // Set to `'local'`, not `true`, as of 2026-09-01: every attempt on file
    // is the free local renderer. The Apify actor tier has never run against
    // this shop at all — no credential has existed in this environment — so
    // there is no actor-tier refusal to claim, and a plain boolean would
    // have wrongly skipped an untested route too.
    renderRefused: 'local',
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
    //
    // ── The free local renderer confirms it, 2026-08-26 ─────────────────────
    // Five committed harvest reports with an actual network round trip
    // against this shop's sections (not the shared render budget running out
    // first — see knownRenderRefusal in src/catalogue/renderRefusal.ts),
    // spanning both 2026-08-25 (commits c0d8109, 7f49122) and 2026-08-26
    // (c7725ab, 7b47962, 027593c), all land the same way: HTTP 403 at
    // 326-344 bytes on every section reached, no exceptions. `renderRefused`
    // below stops spending the local render tier's shared page budget
    // re-asking a question five real attempts already agree on.
    //
    // Set to `'local'`, not `true`, as of 2026-09-01: every attempt on file
    // is the free local renderer. The Apify actor tier has never run against
    // this shop at all — no credential has existed in this environment — so
    // there is no actor-tier refusal to claim, and a plain boolean would
    // have wrongly skipped an untested route too.
    //
    // ── 2026-09-02: frozen eleven days. What actually happens now ───────────
    // All 74 stored offers sit on two dates, 2026-08-20 (38) and 2026-08-22
    // (36), and nothing since — the dead-route signature this file first
    // named on John Lewis, and the same window in which the shared $5 Apify
    // credit ran out on 2026-08-21.
    //
    // Read from the crawl job's own log rather than inferred — run #371, job
    // 100062672226, harvest step 2026-09-01T23:28:57Z-2026-09-02T00:25:06Z,
    // which did reach this shop:
    //
    //     The Perfume Shop   0 urls  0 fetched  0 priced listings  (2 errors)
    //       [actor] skipped: The Perfume Shop has answered every real render
    //           attempt on file with a refusal … — skipping the render tier
    //           rather than spending a page confirming that again
    //       https://www.theperfumeshop.com/sitemap.xml: HTTP 403
    //     zero this run: … the-perfume-shop, john-lewis, superdrug, scentstore
    //
    // Run #372 (job 100124753779, 2026-09-02T04:49:44Z) did not reach it at
    // all: "never reached this run: … the-perfume-shop … — out of time before
    // being asked, keeping their previous prices". So the freeze is the free
    // sitemap route's 403 plus `renderRefused: 'local'` correctly declining to
    // re-ask a question five real local renders have already answered. Nothing
    // is malfunctioning; there is no unmetered route left.
    //
    // ── The refusal covers robots.txt too — checked by hand 2026-09-02 ──────
    // Three URLs from this sandbox, every one 389-419 bytes in under 0.35s:
    //
    //     /robots.txt                          403   390 bytes
    //     /sitemap.xml                         403   389 bytes
    //     /womens/womens-perfume/c/W2001       403   419 bytes
    //
    // The body is an Akamai edge deny — "<TITLE>Access Denied</TITLE> … You
    // don't have permission to access … Reference #18.d7bd7768.1788344315…
    // https://errors.edgesuite.net/…" — with a real per-request reference id,
    // so it is this shop's own CDN answering rather than a sandbox relay
    // failure (that shape produces no HTTP status at all; see John Lewis's
    // entry). Byte-for-byte the same block shape Superdrug returns, from the
    // same Akamai host, which is what one would expect: both are AS Watson
    // brands, and this reads as one group-wide edge rule rather than two
    // shops' independent decisions.
    //
    // That /robots.txt is itself refused matters beyond the sections: this
    // project cannot read this shop's own crawl rules from a datacentre
    // address at all, so "is this path allowed" is not answerable here.
    // Nothing treats that as permission — the robots read fails closed.
    //
    // ── Is any route left? ──────────────────────────────────────────────────
    // Materially worse than Superdrug's position, and worth being plain about:
    //
    //   1. The Apify actor tier is UNPROVEN here, not proven. It has never run
    //      against this shop once. Superdrug's own entry can point at job
    //      96839386128 and 60 parsed listings; there is no equivalent here,
    //      and the reasonable expectation that a residential IP would get
    //      through is an expectation, not a result. Enabling a paid tier on
    //      that basis would be spending shared credit to find out.
    //   2. No affiliate route is on file: `affiliate` below is
    //      NO_AFFILIATE_YET. A search on 2026-09-02 found
    //      theperfumeshop.com/affiliates (itself 403 from here, like
    //      everything else on the domain) and third-party pages naming Rakuten
    //      as the network — but only in summary prose, with no result's own
    //      title or link establishing it, which is below the bar this project
    //      uses for web-sourced facts (see demo/brandSites.ts). Recorded as an
    //      unverified lead for an owner who can open that page from an
    //      ordinary connection, not as a finding.
    //   3. Nothing else. Plain fetch, browser-header fetch, sitemap walk,
    //      search page, homepage probe and the free local renderer have all
    //      been refused from this project's own address.
    //
    // So: genuinely dark on every route this project can reach today, and with
    // no proven paid route either. That is a stronger statement than
    // Superdrug's, where a working route exists and is merely unfunded.
    //
    // ── Should the 74 stored offers be delisted? No ─────────────────────────
    // Same reasoning as Superdrug's entry, and it applies here too:
    // STALE_OFFER_DAYS (src/services/priceService.ts) is 10, these are past
    // it, so each row already renders "price last confirmed 11 days ago"
    // (demo/app.ts's offer renderer) and is already outranked by any fresher
    // offer in preferFreshOffers. The shop has not stopped selling these
    // bottles; it has stopped answering this address. Deleting a real observed
    // price in favour of nothing, while the reader can be told exactly how old
    // it is, would lose information rather than add honesty.
    renderRefused: 'local',
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
    //
    // ── The cheaper-route recheck was done, 2026-08-20 ──────────────────────
    // "A longer plain-fetch timeout might fix this for free" was the right
    // thing to try first and it does not work. scripts/catalogue-harvest.ts
    // now recognises a shop whose every error is a timeout and retries it
    // once at 60 seconds before either metered tier (see `looksLikeTimeouts`
    // in src/catalogue/strategy.ts). Harvest probe run 12, job 96345673451:
    //
    //     John Lewis: every failure was a timeout, retrying once at 60s
    //     https://www.johnlewis.com/sitemap.xml:   HTTP 0
    //     https://www.johnlewis.com/siteindex.xml: HTTP 0
    //     [patient] https://www.johnlewis.com/sitemap.xml:   HTTP 0
    //     [patient] https://www.johnlewis.com/siteindex.xml: HTTP 0
    //
    // Both sitemap addresses, at 25 seconds and again at 60. robots.txt
    // itself reads perfectly well from a runner, which is what makes this
    // shop different from Harvey Nichols: nothing is refusing us, the
    // sitemap endpoints simply never answer. "Slow to answer" is confirmed;
    // "would be fine with more patience" is refuted.
    //
    // That leaves the section URLs below, which crawlViaSitemap never
    // touches — it walks sitemaps only. The actor tier does use them, and
    // this shop is the first in the project ever to reach it: run 12
    // rendered all four sections (after a separate fix, since the failing
    // proxy retry had been overwriting this shop's perfectly good robots.txt
    // with "unknown" and thereby disallowing everything). What came back:
    //
    //   - run 12: HTTP 403 `full-permission-actor-not-approved`. The
    //     pageFunction actor needs the account owner's one-time approval.
    //   - run 13, job 96347018835: the code-free fallback actor
    //     (apify/website-content-crawler) ran for 47 seconds — so it is NOT
    //     behind that approval gate — and returned no priced listing.
    //   - run 18, job 96348413008: HTTP 502 Bad Gateway from Apify's own
    //     API, an Apify-side failure rather than anything about this shop.
    //   - run 19, job 96350053274, 2026-08-20T07:35Z — the one that answers
    //     the question:
    //
    //         [actor] rendered 4 section page(s), 0 listings parsed, 0 priced
    //         [actor] …/womens-fragrance/_/N-a63?page=1:   HTTP 200, 1067905 bytes
    //         [actor] …/mens-aftershave/_/N-a61?page=1:    HTTP 200, 1122939 bytes
    //         [actor] …/unisex-fragrance/_/N-nx23?page=1:  HTTP 200, 1063812 bytes
    //         [actor] …/fragrance-sets/…?page=1:           HTTP 200, 1019324 bytes
    //
    // ── What that changes ───────────────────────────────────────────────────
    // The actor tier works. All four of this shop's real category pages came
    // back rendered, HTTP 200, at about a megabyte each — the JavaScript ran
    // and the grid was painted. Retrieval, the thing every entry in this file
    // has treated as the hard part for John Lewis, is solved.
    //
    // The remaining gap is extraction, which is a different problem with a
    // different fix. `parseListings` (src/catalogue/jsonld.ts) reads
    // schema.org Product nodes out of JSON-LD and nothing else, deliberately
    // — "one parser, one truth" is why every route in this repo produces
    // comparable data. These rendered pages carry no such node: 4.2 MB of
    // real John Lewis fragrance grid, zero Product markup in it.
    //
    // So this shop is not blocked on money, on IP reputation, on JavaScript
    // or on permission. It is blocked on the fact that its category pages do
    // not publish structured product data, and the honest options are all
    // extraction-side: render this shop's *product* pages instead (which
    // almost certainly do carry JSON-LD, but at one metered page per product,
    // exactly the cost shape docs/INGESTION.md forbids), or teach the
    // pipeline a second extraction format, which is a decision about "one
    // parser, one truth" and not one to take quietly inside a retailer entry.
    // Neither is attempted here. What is now established, and was not before,
    // is which of the two questions is actually open.
    //
    // ── The hydration-blob hypothesis: answered, and the "stall" above was ──
    // ── never a stall — corrected 2026-08-20 by reading the raw job logs ────
    // The two dispatches this entry used to describe as cancelled after
    // "20+ minutes with no result" (32367872684, 32368455831) were re-read
    // directly from the GitHub Actions API rather than from a human's
    // impression of a watched terminal, and neither claim survives that:
    //
    //   - Run 32367872684, job 96421371936: the render step ran from
    //     12:15:32Z to 12:19:19Z — 3m47s total, not 20 minutes — and the
    //     actor itself answered in under 24s. By 12:15:56Z the log already
    //     showed the full result:
    //
    //         rendered 1,058,463 bytes
    //         Next.js __NEXT_DATA__: FOUND, 215,243 bytes — price-shaped
    //             keys: false, name-shaped keys: true, currency key: false
    //         other application/json script blocks by id:
    //             __EXPERIMENTATION_CONFIG__, __PAGE_EXPERIENCES_DATA__,
    //             __EXPERIMENTATION_DATA__, __NEXT_DATA__
    //
    //   - Run 32368455831, job 96423240334 (the "retry"): render step ran
    //     12:22:13Z–12:24:11Z (1m58s), actor answered by 12:22:32Z (19s),
    //     same finding — __NEXT_DATA__ FOUND, 163,568 bytes this time,
    //     name-shaped keys true, price-shaped and currency both false.
    //
    // So the hydration-blob hypothesis was answered, twice, with the same
    // positive result, well before either job was cancelled — the opposite
    // of "answered by neither". What actually happened is a client-side bug,
    // not an Apify or account-tier limit: src/catalogue/apifyActor.ts's
    // `runOneActor` races the real fetch against
    // `new Promise((resolve) => setTimeout(() => resolve('timeout'),
    // ACTOR_CALL_TIMEOUT_MS + 5_000))` (apifyActor.ts:382) to bound a hung
    // call. When the real fetch wins the race, as it did here in under 24s,
    // that losing timer is never cleared — `Promise.race` does not cancel
    // its losers — so a live setTimeout for up to 285s keeps the Node
    // process (and the CI step, which has no more log lines to print) alive
    // long after the useful work is already done and printed. Both runs
    // here were cancelled by hand inside that dead window (3m47s and 1m58s
    // in, both under the 285s the leaked timer would have needed to fire on
    // its own) and read as "stuck" purely because nothing new appeared in
    // the log — not because retrieval, the actor, or the FREE plan were
    // slow. Selfridges' own entry records a comparable render finishing "in
    // under 5 minutes" on two occasions; re-read against this same bug, one
    // of those (job 96419581995) measured its render step at 12:09:05Z–
    // 12:13:51Z — 4m46s, i.e. 286 seconds, essentially exactly
    // ACTOR_CALL_TIMEOUT_MS + 5_000 to the second. That was not a fast,
    // healthy actor call either; it was the same leaked timer running to
    // its own natural end because nobody cancelled it first. Recorded here
    // as a code action, not fixed in this pass — apifyActor.ts is this
    // project's crawl core and a two-line fix (track and clearTimeout the
    // second promise's timer, or replace the manual race with
    // `AbortSignal.timeout`) belongs to whoever next touches that file, not
    // to a change buried inside a retailer entry.
    //
    // What this leaves for extraction: `__NEXT_DATA__` is present on this
    // shop's rendered category pages, twice confirmed, in the 160–220 kB
    // range, and its own regex-based key scan (deliberately crude — see
    // scripts/apify-blob-probe.ts's redaction rules) reads name-shaped keys
    // as present and both price-shaped and currency keys as absent. That is
    // consistent with a props payload built for the page chrome (product
    // names, breadcrumbs, experimentation flags — note the sibling
    // `__EXPERIMENTATION_DATA__`/`__PAGE_EXPERIENCES_DATA__` blocks) rather
    // than one carrying this shop's own priced catalogue, but a heuristic
    // key-name scan saying "no price key" is not the same claim as a human
    // reading the actual JSON structure once retrieved without being
    // cancelled mid-flight. That reading — is there a priced product array
    // nested inside `__NEXT_DATA__.props.pageProps` or similar, the way
    // Next.js apps commonly shape it — is the concrete next step, and it
    // needs the timer bug fixed first so the run is not mistaken for a
    // hang and killed before anyone gets to look.
    //
    // ── That reading was done, 2026-08-21, and the answer is yes ───────────
    // State probe run 32503415608, job 96838106561, 16:33Z — one rendered
    // page of the womens-fragrance section, 1,060,957 bytes, through the new
    // scripts/apify-state-probe.ts, which prints JSON key paths rather than a
    // yes/no per known marker:
    //
    //     JSON-LD blocks: 4; parseListings(): 0 listing(s)
    //     "£" price-shaped strings in the rendered markup: 477 (83 distinct)
    //     #__NEXT_DATA__ type=application/json 216,448 bytes
    //     candidate product array:
    //         props.pageProps.productListingData.products[] — 74 object(s)
    //     key presence across all 74: productId, title, brand, image, url,
    //         variantPriceRange, outOfStock, isAvailableToOrder, attributes …
    //
    // So the "price-shaped keys: false" above is a false negative, and the
    // paragraph reasoning from it — that this payload is page chrome rather
    // than a priced catalogue — is wrong. It is the catalogue. The price sits
    // at `variantPriceRange.value.min`/`.max`, with a £-marked twin at
    // `variantPriceRange.display.min`/`.max`, under a parent no `"price":`
    // regex was going to reach. Run 32504051993, job 96840113636, confirmed
    // the identical structure on the mens-aftershave section.
    //
    // src/catalogue/johnLewisNextData.ts now reads it, registered in
    // src/catalogue/renderedState.ts and consulted by
    // scripts/catalogue-harvest.ts only after parseListings has returned
    // nothing for a rendered page. What it will and will not claim is in that
    // module's header; the short version is that a card whose variants
    // disagree on price (CHANEL Coco Mademoiselle Crush Absolu, £117 to £160
    // across 50ml and 100ml, one title naming neither) is stored as a listing
    // with no price rather than priced at a guess, and that a price is only
    // read when the shop's own display string starts with £.
    //
    // This entry's `enabled: true` and `currency: 'GBP'` are unchanged by that
    // work — the shop was already enabled, already rendering four section
    // pages per metered sweep, and already getting nothing for them. The
    // difference is that those renders now produce listings.
    //
    // ── The free local renderer's first real shot, 2026-08-27 — and why it ──
    // ── is not the same finding as above, or as the five renderRefused shops ─
    // Every finding above came from Apify's paid actor tier. The free local
    // renderer (src/catalogue/localBrowser.ts) never got a genuine attempt at
    // this shop until now: run #340 (job 98237536789, 2026-08-26T17:15:30Z)
    // and run #341 (2026-08-26, harvest-cursor.json shows no attempt at all)
    // both reached this shop with the run's 12-page local-render budget
    // already spent by shops earlier in sweep order, so every one of its four
    // URLs answered "local render budget of 12 pages exhausted for this run"
    // — never actually sent to the browser. Worth flagging on its own: a
    // budget-exhausted shop still gets its data/harvest-cursor.json entry
    // stamped as attempted (confirmed: run #340 stamped this shop
    // 2026-08-26T17:12:40Z despite rendering nothing), which pushes it
    // further back in the next run's longest-unasked-first order rather than
    // holding it near the front until it actually gets a real page budget —
    // a shop can in principle be perpetually budget-starved by this. Not
    // fixed here: it did not bite this time (see below), and fixing a
    // starvation mode that has not yet been observed to recur would be
    // guessing at which of several plausible repairs (excluding
    // budget-exhausted attempts from the cursor, reserving a page for the
    // longest-unasked shop, raising the per-run budget) the evidence
    // actually calls for.
    //
    // Run #342 (job 98370769894, 2026-08-27T01:00:32Z-01:00:37Z) is the one
    // that finally spent a real page on this shop — first in the render
    // queue that run, all 12 pages still unspent — and the result is a third
    // failure shape, not the second confirmation of either finding already on
    // this entry:
    //
    //   [actor] rendered 4 section page(s), 0 listings parsed, 0 priced
    //   [actor] …/womens-fragrance/_/N-a63?page=1: HTTP 0, 0 bytes, local
    //       render failed: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR
    //   (identical on all four section URLs)
    //
    // That is not the 200-with-a-tiny-body shape the five `renderRefused`
    // shops share (see e.g. Boots' own entry above) — there is no HTTP
    // response at all, so knownRenderRefusal in src/catalogue/
    // renderRefusal.ts would not even classify it as a refusal, and this
    // shop is not being given that flag on one sample of a different
    // failure. It is also not proof the shop is unreachable: the paid actor
    // rendered these exact four URLs at ~1MB each, HTTP 200, as recently as
    // the finding above. The plausible reading is that this Cloudflare-
    // fronted shop's edge is dropping the HTTP/2 handshake from the free
    // renderer's `--only-shell` Chromium specifically — a TLS/HTTP2
    // fingerprint difference from whatever client the actor tier presents —
    // but that is a hypothesis, not something this one run confirms either
    // way. Left as a dated observation for whoever reads this after the next
    // few real attempts land; the five-report bar the shops above needed
    // before `renderRefused: true` was written is the right bar here too.
    //
    // ── Second real attempt, 2026-08-27 — same shape, still short of the bar ─
    // Three dispatches landed between the observation above and now, and none
    // of them could have reached this shop by design: runs #343 and #344 (jobs
    // 98455508015, 98457358377) were `capture_render_shop=notino-uk` dispatches
    // whose "Harvest via sitemap" step never ran at all (skipped — only "Capture
    // rendered HTML for one shop" runs on that path), and run #345 (job
    // 98507799845) was a plain demo-rebuild dispatch with the same step
    // skipped. The next scheduled sweep, run #346 (job 98541223952,
    // 2026-08-27T13:52:32Z-15:27:29Z), is the one that actually asked again —
    // and was not budget-starved either: "John Lewis: rendering 4 section
    // page(s) through local browser" at 15:08:48Z, with the run's own tally
    // reading "local browser pages rendered this run: 9 of 12 budgeted" (4 of
    // those 9 spent here, 3 short of the cap). The result:
    //
    //   [actor] rendered 4 section page(s), 0 listings parsed, 0 priced
    //   [actor] …/womens-fragrance/_/N-a63?page=1: HTTP 0, 0 bytes, local
    //       render failed: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR
    //   (identical on all four section URLs, same as run #342)
    //
    // Two independent real sweeps, the only two genuine local-render attempts
    // this shop has ever gotten, now agree exactly: same error, same all-four-
    // URLs spread, same zero-byte HTTP 0. That is one more consistent data
    // point than "left as a dated observation" had a day ago, and it is
    // starting to look like the real shape of this shop rather than a fluke —
    // but it is two reports, not the five the `renderRefused` shops above were
    // held to, so it is not applied here either. Also worth recording as
    // negative evidence: the perpetual-budget-starvation risk flagged
    // 2026-08-26 (a budget-exhausted shop still stamps the cursor as
    // attempted) has not recurred in either real sweep since — #342 hit this
    // shop first with all 12 pages free, #346 reached it with 8 of 12 still
    // unspent going in. Two more sweeps without a repeat is not proof it
    // cannot happen again, but it is not the recurring pattern that would
    // justify picking one of the three named repairs over guessing, so none
    // is made here. Left again for whoever reads this after the next few real
    // attempts land.
    //
    // ── 2026-08-28 check-in — two dispatches, neither able to reach this shop ─
    // Checked the two workflow_dispatch runs that landed after #346: run #347
    // (job 98662114309, 2026-08-27T20:28:30Z) and run #348 (job 98698173806,
    // 2026-08-27T22:52:13Z). Neither was a full harvest sweep, so neither
    // could have added a third report. #348 was a `capture_render_shop=
    // notino-uk` dispatch — same shape as #343/#344 above: "Harvest via
    // sitemap" shows `skipped` in its job steps, only "Capture rendered HTML
    // for one shop" ran, and its head commit (467abec, "Notino: temp reorder
    // to test session-order theory on the CF challenge") confirms the target
    // was Notino, not this shop. #347 is stranger still: every step after
    // "Test before crawling" shows `skipped` in the job's step list, Harvest
    // via sitemap and Capture-render alike — the dispatch ran the test suite
    // (1563 passing) and nothing else. Whatever inputs produced that, it
    // reached no shop at all, so it's a non-event here too.
    //
    // The next scheduled sweep, run #349, started 2026-08-28T00:16:21Z and
    // was still `in_progress` as of this check-in — not yet available to
    // read. Tally stands at two real reports (#342, #346), still short of
    // the five-report bar; whoever picks this up next should check #349
    // first rather than assume this pass covered it.
    //
    // ── 2026-09-01: the bar is cleared — eight more real attempts, all identical ─
    // Every scheduled run between #349 and the present was checked (job logs
    // read via the GitHub Actions API, not inferred). Eight reached this shop
    // with real local-render budget; the rest did not, for a reason visible
    // in their own logs, not silence:
    //
    //   #349, #351, #354, #356, #358, #361, #363 — "never reached this run:
    //     ... john-lewis ... — out of time before being asked, keeping their
    //     previous prices". Not an observation of this shop either way: the
    //     sweep's own run-minutes deadline landed before john-lewis's turn.
    //   #364, #365 — never reached the harvest step at all. "Test before
    //     crawling" fails on both (tests/dealsBrandDirect.test.ts, a
    //     catalogue data-drift issue unrelated to this shop or this entry),
    //     so "Harvest via sitemap" shows `skipped` in the job's own step
    //     list. Outside this entry's scope; noted for whoever looks at why
    //     the schedule has stopped harvesting at all.
    //
    // The eight that did reach it, every one the same shape as #342 and
    // #346 above — 4 section pages rendered, 0 listings, HTTP 0/0 bytes,
    // `net::ERR_HTTP2_PROTOCOL_ERROR` on all four URLs, no exceptions:
    //
    //   #350 (job 98888276129) 2026-08-28T15:56:27Z
    //   #352 (job 99066739197) 2026-08-29T07:34:31Z
    //   #353 (job 99112266790) 2026-08-29T15:19:30Z
    //   #355 (job 99173337128) 2026-08-29T23:52:36Z
    //   #357 (job 99250321415) 2026-08-30T12:05:36Z
    //   #359 (job 99318453071) 2026-08-30T21:00:51Z
    //   #360 (job 99337408720) 2026-08-31T00:09:01Z
    //   #362 (job 99495164138) 2026-08-31T13:43:09Z
    //
    // Sampled line, identical in shape across all eight (#357's, run
    // 33308924371, job 99250321415):
    //
    //   [actor] rendered 4 section page(s), 0 listings parsed, 0 priced
    //   [actor] …/womens-fragrance/_/N-a63?page=1: HTTP 0, 0 bytes, local
    //       render failed: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR
    //
    // Ten real attempts now (#342, #346 above, plus these eight), ten for
    // ten on the identical signature — the five-report bar the other
    // `renderRefused` shops on this file were held to, cleared with margin
    // rather than just reached. `renderRefused: true` below stops
    // scripts/catalogue-harvest.ts spending a render-tier page confirming
    // this again every run; see knownRenderRefusal in
    // src/catalogue/renderRefusal.ts for what the flag does with it.
    //
    // ── 2026-09-01: both leads chased down — neither restores a route today ──
    //
    // Lead 1: is ERR_HTTP2_PROTOCOL_ERROR an HTTP/2 negotiation problem, the
    // kind forcing HTTP/1.1 fixes? The project's own prior evidence already
    // answers this without spending a new CI run. src/catalogue/httpFetch.ts's
    // createHttp() calls Node's global fetch() with no dispatcher config, and
    // Node's built-in fetch (undici) never negotiates HTTP/2 unless a caller
    // opts a dispatcher into allowH2 — nothing here does. That route has
    // therefore always been HTTP/1.1 only, and it is exactly the route
    // crawlViaSitemap used against this shop's sitemap.xml/siteindex.xml on
    // job 96345673451 (cited further up this entry, 2026-08-20): "Both
    // sitemap addresses, at 25 seconds and again at 60" — HTTP 0, total
    // silence, on a route that was never HTTP/2 to begin with. Whatever is
    // failing here is not specific to HTTP/2 ALPN negotiation, because this
    // shop's already-HTTP/1.1 route fails the identical way.
    //
    // Tried to confirm this directly against the live site too, from this
    // sandbox, with a hard caveat first: this sandbox's own egress proxy
    // (127.0.0.1:34323, see /root/.ccr/README.md) is a relay, and its own
    // /__agentproxy/status endpoint, read during this test, listed
    // www.johnlewis.com among recentRelayFailures ("tunnel closed (code
    // 1006, Connection ended) after 6s") interleaved with the identical
    // failure against www.google.com, accounts.google.com and
    // android.clients.google.com in the same few seconds — sites that are
    // plainly not blocking anyone. That proves the relay itself was
    // unreliable in this window and disqualifies anything routed through it
    // as evidence about johnlewis.com. Bypassing that relay (curl --noproxy
    // '*'; separately, Node's own fetch(), which does not consult the proxy
    // env vars at all) did reach a real johnlewis.com — a DigiCert-issued
    // certificate for CN=johnlewis.com, O=John Lewis plc, and robots.txt
    // answered HTTP 200 with real, correct content, fast, every time (see
    // the robots.txt paragraph below). But every dynamic path tried this
    // way — the homepage, /sitemap.xml, /siteindex.xml, and all four
    // section URLs — answered instead with an immediate (150-300ms),
    // byte-identical HTTP 503, 108 bytes, over both HTTP/2 (curl, ALPN
    // negotiated) and HTTP/1.1 (Node's fetch) equally:
    //
    //     upstream connect error or disconnect/reset before headers.
    //     retried and the latest reset reason: remote reset
    //
    // That is textbook Envoy-gateway error text, not a Cloudflare/Incapsula-
    // style challenge (no branding, no cookie, no CAPTCHA, no HTML) — but
    // getting the identical body over both protocol versions, through a
    // "direct" path this sandbox cannot fully vouch for either (its own
    // network layer presents a certificate Chromium itself refuses to
    // trust, net::ERR_CERT_AUTHORITY_INVALID, even with every proxy env var
    // unset — so "direct" from this sandbox is still mediated by
    // something), means this sandbox cannot isolate protocol version as the
    // variable, and cannot say with confidence whether that 503 is
    // johnlewis.com's own edge or a description of this sandbox's network
    // layer failing to reach it. Playwright's own Chromium could not be
    // gotten to reach johnlewis.com from this sandbox at all, on any path
    // tried (via the proxy: net::ERR_CONNECTION_RESET; env vars unset:
    // net::ERR_CERT_AUTHORITY_INVALID) — so the exact CI failure,
    // net::ERR_HTTP2_PROTOCOL_ERROR, could not be reproduced or fixed here
    // either way, and confirming a fix needs a real CI run this pass cannot
    // spend and then wait on.
    //
    // Net effect: the strongest evidence available — CI's own already-
    // HTTP/1.1 plain-fetch route failing identically against this same
    // domain — argues against Lead 1, and nothing gathered here contradicts
    // it. --disable-http2 is a real, legitimate Chromium launch flag
    // (forcing ALPN to skip h2 is protocol negotiation, not evasion), but is
    // not added to src/catalogue/localBrowser.ts in this pass: the evidence
    // on file says it would not help.
    //
    // robots.txt, re-read today: unchanged in substance from the analysis
    // above (Last-Modified: Fri, 07 Aug 2026). "Real N Values" still Allows
    // /browse/*/_/N-* ahead of the shorter */_/N-* Disallow, so all four
    // section URLs remain permitted; /search* remains Disallowed (not used
    // by this entry's routes); the Sitemap: directive still names
    // https://www.johnlewis.com/siteindex.xml. Nothing this shop's routes
    // touch is forbidden.
    //
    // Lead 2: the Apify actor tier worked before (run 19, 2026-08-20) —
    // does it still, and what would routing this shop through it cost?
    //
    // Technically, this shop's own history above already answers "would it
    // work": run 19 rendered all four sections through the actor at ~1MB
    // each, HTTP 200, and by 2026-08-21 johnLewisNextData.ts was reading
    // real priced listings out of them. Neither piece of code has been
    // removed — src/catalogue/apifyActor.ts and
    // src/catalogue/johnLewisNextData.ts both still exist, and
    // parseRenderedState (src/catalogue/renderedState.ts) still wires
    // 'john-lewis': parseJohnLewisListings. On the same evidence, the actor
    // tier should still work against this shop today.
    //
    // But it has not run against this shop even once since local rendering
    // arrived (2026-08-26, per this entry above), and will not on any
    // ordinary sweep, by design rather than by accident.
    // scripts/catalogue-harvest.ts builds one renderer per run:
    //
    //     const localRenderer = noLocalRender ? null : localBrowserRenderer(...);
    //     const actorRenderer = localRenderer ?? (useApifyActor ? apifyActorRenderer(actorConfig!) : null);
    //
    // The free local renderer is non-null whenever it is not explicitly
    // turned off, so it is what every shop's render call actually uses on
    // every ordinary run — the Apify actor is only ever reached with
    // --no-local-render passed, a run-wide switch, not a per-shop one.
    // There is no code path today that sends this one shop to the actor
    // while every other render-dependent shop keeps using the free tier.
    // Running with --no-local-render --allow-metered would restore this
    // shop's actor route — and would also move every other render-
    // dependent shop (Selfridges included, this project's one remaining
    // shop with a genuinely positive *local*-render outcome, per
    // knownRenderRefusal's own comment in src/catalogue/renderRefusal.ts)
    // onto the metered tier for that entire run, which is the exact shape
    // of the 2026-08-21 outage src/catalogue/localBrowser.ts's own header
    // records: five shops (Boots, Selfridges, John Lewis, Superdrug, Zara)
    // dark at once when the $5 monthly credit ran out on day 21 of the
    // month. Whether September's credit is available, and how much of it,
    // is not visible from here — no Apify account exists in this
    // environment (docs/INGESTION.md says the same) — so that trade is not
    // one to make blind, and is not made here. Roughly what it would cost
    // if made: four pages a run at docs/INGESTION.md's own $2-5/1,000-page
    // actor estimate is about $0.008-0.02 per run this shop is reached —
    // cheap alone, and exactly what already emptied a $5 shared credit
    // early once with four other shops drawing on the same pool.
    //
    // A smaller, real gap worth naming precisely: knownRenderRefusal reads
    // one flag (retailer.renderRefused) and, when set, skips whichever
    // renderer actorRenderer currently holds — local or Apify, it does not
    // distinguish. Every one of this shop's ten refusals on file is a
    // *local*-render result; the actor has only ever answered this shop
    // with a real catalogue page. So if a future --no-local-render run ever
    // did try to route this shop through the actor to recover it,
    // `renderRefused: true` below would skip that attempt too, on evidence
    // that never actually came from that tier. Not fixed here — it has
    // never yet mattered, because no --no-local-render run has happened
    // since this flag was set — but worth flagging for whoever next touches
    // knownRenderRefusal or runs the harvest with that flag: this shop's
    // refusal evidence covers the local tier only.
    //
    // The concrete owner action, matching how this entry has recorded that
    // before: decide whether this shop's proven, working actor route is
    // worth a standing claim on the shared monthly credit that has already
    // run out once with five shops depending on it — and if so, give it a
    // per-shop preference in the harvest script rather than the run-wide
    // --no-local-render switch, so the other render-dependent shops keep
    // their free route. Not a decision to make inside a retailer entry.
    //
    // What this means for the four listings currently stored: not fixed by
    // anything above. The catalogue's four live listings have no route back
    // to a live price check under the pipeline as it runs today: the free
    // tier is refused, and the paid tier that could refresh them needs the
    // owner decision above, which this entry does not make for it.
    //
    // ── renderRefused made tier-aware, 2026-09-01 ───────────────────────────
    // The gap the paragraph above named — one boolean flag skipping whichever
    // render tier is active, when this shop's refusal evidence is entirely
    // local — is now fixed in knownRenderRefusal (src/catalogue/
    // renderRefusal.ts): `renderRefused: 'local'` blocks the free local
    // renderer only. If a future run ever does give this shop the actor
    // route (per-shop preference, not built here — see the owner-action
    // paragraph above), it gets a real attempt rather than being skipped on
    // evidence that never came from that tier.
    renderRefused: 'local',
    //
    // ── OWNER DECISION: the paid render tier for this one shop ──────────────
    // Everything needed to make the call, restated here so it is all in one
    // place rather than spread through the history above. Deliberately NOT
    // enabled: this spends real money, so it is the owner's decision, not a
    // default any pass makes on her behalf.
    //
    // THE CHANGE, in full: delete the two slashes on the line below, so the
    // entry reads `renderTier: 'actor',`. Nothing else. The plumbing already
    // exists and is tested — rendererForShop() in src/catalogue/renderTier.ts
    // (tests/renderTier.test.ts, 8 tests), called per retailer at
    // scripts/catalogue-harvest.ts:741, and `renderRefused: 'local'` above
    // already leaves the actor route open for this shop while keeping the
    // free tier skipped.
    //
    // WHAT IT COSTS, per run this shop is actually reached: four section
    // pages at docs/INGESTION.md's own published-pricing estimate of $2-5 per
    // 1,000 actor-rendered pages, so roughly $0.008-0.02. That is the whole
    // direct cost, and on its own it is small.
    //
    // WHAT IT RISKS: the credit is shared, and it has already run out once.
    // On 2026-08-21 the $5 monthly Apify credit emptied on day 21 of the
    // month and five shops went dark together — Boots, Selfridges, John
    // Lewis, Superdrug, Zara (see src/catalogue/localBrowser.ts's header).
    // That outage came from the run-wide --no-local-render switch, which this
    // field exists to avoid: setting it moves this shop and no other. The
    // spend is still drawn from the same shared pool, so the risk that
    // remains is the pool being emptied early for everything else that draws
    // on it, not five shops moving at once. Whether September's credit is
    // available, and how much of it, is not visible from this environment —
    // no Apify account exists here.
    //
    // WHAT IT BUYS: this shop's four stored listings have no route back to a
    // live price check today. Local rendering is refused ten times over; the
    // actor route is proven (run 19, 2026-08-20: all four sections rendered
    // at ~1MB, HTTP 200, real priced listings read out by
    // src/catalogue/johnLewisNextData.ts, which still exists and is still
    // wired). Nothing else on file recovers them.
    //
    // ── ENABLED 2026-09-02, BOUNDED. The owner approved it; the arithmetic ──
    // ── decided the shape ───────────────────────────────────────────────────
    // The cost paragraph above was written when the cron fired three-hourly.
    // It now fires hourly (`15 * * * *`), and redoing the sum at that cadence
    // is what changed the answer from "enable it" to "enable it with a bound":
    //
    //     4 pages/run at $2-5 per 1,000 (docs/INGESTION.md)
    //     hourly       2,918 pages/month   $5.84 - $14.60/month
    //     every 24h      122 pages/month   $0.24 -  $0.61/month
    //
    // The shared pool is $5/month. Hourly rendering of this one shop overruns
    // it alone — 117% of the pool at the cheap end of the estimate, 292% at
    // the dear end — before Boots, Selfridges, Superdrug or Zara draw a single
    // page. That is the 2026-08-21 outage's own mechanism, arrived at from a
    // different direction, and enabling this unbounded would have set it up to
    // happen again. Every-24-hours costs 5-12% of the pool and leaves the
    // other four shops the room they have today.
    //
    // So the bound is implemented in code, per shop, not left to the two
    // run-wide YAML gates that already exist. Those gates are real and they
    // help — the workflow's `guard` job holds a real harvest to roughly one
    // per 237 minutes, and the harvest step only passes `--allow-metered` when
    // data/metered-harvest-marker.txt is 20+ hours old — but neither is
    // per-shop, and the second is deliberately overridden by a hand dispatch
    // ("An explicit allow_metered dispatch always wins"). A few dispatches in
    // one afternoon would each hand this shop four more paid pages with
    // nothing counting them. ACTOR_TIER_MIN_INTERVAL_HOURS
    // (src/catalogue/renderTier.ts) counts them: at most one actor render of
    // this shop per 24 hours, measured from data/harvest-cursor.json's own
    // `actorRendered` stamp, which is written at dispatch rather than on
    // success so a failing render still counts against the bound. When the
    // bound declines, this shop gets NO render that run — not a fallback to
    // the local tier it is already refused by. See tests/renderTier.test.ts
    // and tests/harvestCursor.test.ts.
    renderTier: 'actor',
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
    // ── Affiliate, researched 2026-08-20 — no confirmed programme found ────
    // WebSearch (this sandbox has no fetch access to ui.awin.com,
    // rakutenadvertising.com or johnlewis.com itself — every one of those
    // returned EGRESS_BLOCKED from WebFetch here) turned up nothing that
    // clears this project's own "never guess a network" bar. What exists:
    // several low-quality affiliate-aggregator listings (VigLink/Sovrn
    // Commerce, Skimlinks) carry a "John Lewis & Partners Affiliate
    // Program" page, and separate search summaries asserted, inconsistently
    // across queries, that the underlying network is Awin, Impact and CJ —
    // three different answers for the same shop, none traceable to a
    // primary source (an actual ui.awin.com merchant profile, a Rakuten or
    // CJ programme page, or johnlewis.com's own affiliate page). Sovrn
    // Commerce and Skimlinks are themselves not primary affiliate networks
    // in the Awin/Rakuten/CJ sense — they auto-monetise outbound links
    // across many merchants under their own umbrella deals rather than
    // offering a per-merchant product feed, and that shape of tool commonly
    // excludes exactly this site's use case (comparison/aggregation) in its
    // own terms, the same issue Superdrug's own entry already flags for a
    // named network. Recorded as unresearched rather than attached to any
    // of the three guesses. The concrete owner action: search "John Lewis"
    // from inside the Awin dashboard the Boots/LOOKFANTASTIC/Superdrug
    // entries above already draw on (this sandbox cannot reach
    // ui.awin.com to do that search itself), and from the Rakuten
    // Advertising publisher search once that pending signup clears — both
    // are a few minutes' work for a logged-in human and neither is
    // guessable from here.
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
    //
    // ── The actor route, attempted 2026-08-20 — corrected the same day ──────
    // Dispatched scripts/apify-blob-probe.ts against this shop's own
    // catalogue.sections[0] (the "fragrance" section) — first-ever actor
    // attempt against this shop, now that APIFY_TOKEN is live. This entry
    // used to say the render step "sat in progress for 12+ minutes with no
    // result and was cancelled by hand" and read it as a third stall of
    // four. Reading job 96424955880's own log directly (GitHub Actions API,
    // not a human's impression of a watched terminal) shows something
    // different: the render succeeded in 27 seconds and the job was
    // cancelled 40 seconds after the step started, with the result already
    // printed —
    //
    //     Rendering Superdrug: https://www.superdrug.com/fragrance/c/fragrance?page=1
    //     rendered 1,092,576 bytes
    //     Next.js __NEXT_DATA__: not found      Nuxt __NUXT__: not found
    //     generic __PRELOADED_STATE__: not found  generic __INITIAL_STATE__: not found
    //     Apollo __APOLLO_STATE__: not found    React Server Components self.__next_f: not found
    //     other application/json script blocks by id: spartacus-app-state
    //     ##[error]The operation was canceled.
    //
    // Retrieval works and is fast — a real, 1.09 MB rendered fragrance grid,
    // same shape as every other Class-1 shop's actor render this file
    // records. There was a result; it was just never read, because the run
    // was cancelled inside the dead window a leaked timer in
    // apifyActor.ts's `runOneActor` produces on every call whose fetch wins
    // its own race (see John Lewis's entry for the mechanism and the fix
    // this implies). "Property of the actor tier" was the wrong read on the
    // pattern — it was a property of this project's own client code, now
    // named rather than blamed on Apify or the FREE plan.
    //
    // What the corrected result actually gives: none of the five generic
    // hydration-blob markers this probe knows, but a named block —
    // `spartacus-app-state` — that none of them are. Spartacus is SAP
    // Commerce Cloud's own storefront framework, and this shop's URL shape
    // (`/fragrance/c/fragrance`, a `/c/{code}` category path) is the
    // classic SAP Commerce Cloud / Hybris pattern, so the name is a
    // plausible fit rather than a coincidence — genuinely unexplored,
    // because the run that found it was mistaken for a failure and its
    // output never read until this correction. Whether `spartacus-app-state`
    // carries this shop's actual priced catalogue (Spartacus state trees
    // commonly do hold product/cart data client-side) is the concrete next
    // step, not yet attempted: dump that block's structure — redacted, the
    // same way every other marker here already is — once the timer bug no
    // longer makes a 27-second answer look like a hang.
    //
    // ── That step was taken, 2026-08-21, and its premise was wrong ────────
    // State probe run 32503824167, job 96839386128, 16:37Z, one rendered page
    // of /fragrance/c/fragrance?page=1, 1,101,636 bytes:
    //
    //     JSON-LD blocks: 1; parseListings(): 60 listing(s)
    //     #json-ld type=application/ld+json 30,153 bytes
    //     #spartacus-app-state type=application/json 742,007 bytes
    //     @graph[].itemListElement[].item.name  ×60
    //         e.g. Hugo Boss BOSS Bottled Aftershave 100ml
    //     @graph[].itemListElement[].item.offers.price  ×60  e.g. 26.8
    //     @graph[].itemListElement[].item.offers.priceCurrency  ×60  e.g. GBP
    //
    // This shop needs no new parser and never did. Its rendered category page
    // publishes an ItemList of 60 schema.org Products with prices and an
    // explicit priceCurrency, and `parseListings` — the one parser, unchanged
    // — reads all 60 of them. The `spartacus-app-state` line of enquiry was a
    // dead end in the most benign way: that block is 742 kB of CMS layout,
    // navigation and translation strings, and the only product-shaped
    // collection in it is `cx-state.translations.chunks.entities.product`,
    // which is UI copy. It is deliberately NOT registered in
    // src/catalogue/renderedState.ts, and that module's header says why.
    //
    // Why this shop has produced nothing so far is therefore not extraction
    // at all: the actor run that would have shown this (job 96424955880) was
    // killed at 40 seconds by the leaked-timer bug fixed in 16297ca, before
    // its result printed. A metered harvest should now find these 60.
    //
    // The `priceCurrency: "GBP"` on all 60 is a real sterling reading, but it
    // is recorded here as evidence and not acted on — currency confirmation
    // is its own step with its own proof requirement, and is not done here.
    //
    // ── The free local renderer gets the same 403 the plain fetch always ────
    // ── did — diagnosed 2026-08-26, not a parsing problem ───────────────────
    // The 60-listing success just above came through the Apify actor, which
    // exits on a residential IP. src/catalogue/localBrowser.ts has since
    // replaced that tier with a free headless Chromium running on this
    // project's own CI runner — a datacenter IP — and every real render
    // attempt against this shop since (as opposed to a run that never reached
    // the network at all; see below) has come back refused:
    //
    //   data/harvest-report.json, commit 7b47962, run finished
    //   2026-08-26T03:41:54Z:
    //     [actor] https://www.superdrug.com/fragrance/c/fragrance?page=1:
    //         HTTP 403, 317 bytes
    //     [actor] .../premium-fragrances/c/premium-brands?page=1:
    //         HTTP 403, 341 bytes
    //
    //   data/harvest-report.json, commit b9a4c1a, run finished
    //   2026-08-26T13:24:09Z — the same two URLs, the same day's later run:
    //     HTTP 403, 317 bytes
    //     HTTP 403, 341 bytes
    //
    // Not just the same shape twice — the identical byte count twice, ten
    // hours apart, on two independently launched browsers. That is a static
    // WAF block page keyed on the request's origin, not two different real
    // responses that happen to both be small. It is also exactly the earlier
    // free-route finding this entry already recorded ("Live spike 1 Aug 2026:
    // HTTP 403 from a datacentre IP", "403 on every free strategy" per
    // data/strategy-memory.json 2026-08-10) — the plain fetch, the Apify
    // proxy probe and now the free local browser all agree, because all
    // three exit this project's own address rather than a residential one.
    // `renderRefusal.ts` already classifies both bodies as refusals ("the
    // shop answered HTTP 403 — this address is refused, not empty"), so this
    // was never read as an empty catalogue.
    //
    // Every other committed run (2026-08-25 and the rest of 2026-08-26) shows
    // this shop's local-render attempt reported instead as
    // `local render budget of 12 pages exhausted for this run` — HTTP 0, 0
    // bytes, no network reached at all. That is the render tier's shared
    // per-run page budget being spent by whichever shops sit earlier in that
    // run's sweep, not this shop answering anything, and it does not change
    // the verdict above: the two runs that did reach the network both got the
    // identical 403.
    //
    // So the finding is precise, not "not gettable": extraction is proven
    // (60 real, GBP-priced listings, job 96839386128 above) and retrieval
    // works from a residential IP (the same job) but not from this project's
    // own — a datacenter-IP refusal the free render tier cannot fix by
    // rendering harder, only by exiting from a different address. `adapter:
    // 'proxied'` stays as the honest statement of what this shop actually
    // needs. What changes here is spending: `renderRefused` stops
    // scripts/catalogue-harvest.ts offering this shop a page from the local
    // tier's shared budget for a question two real attempts have already
    // answered, freeing that page for a shop whose local-render outcome is
    // still open. See knownRenderRefusal in src/catalogue/renderRefusal.ts.
    //
    // Set to `'local'`, not `true`, as of 2026-09-01: both 403s above came
    // from the free local renderer, and the actor tier's own 60-listing
    // success earlier in this entry is real evidence it is NOT refused here
    // — a plain boolean would have wrongly skipped that working route too.
    //
    // ── 2026-09-02: frozen twelve days. What actually happens now, from the ──
    // ── job logs rather than from this entry's own history ──────────────────
    // Every one of this shop's 112 stored offers carries the same lastSeenAt,
    // 2026-08-21 — one timestamp for an entire catalogue, the dead-route
    // signature this file first named on John Lewis. That date is not a
    // coincidence: it is the day the shared $5 Apify credit ran out (see
    // src/catalogue/localBrowser.ts's header), and the actor tier is the only
    // route that has ever produced listings here.
    //
    // Read directly from the crawl job's own log, not inferred — run #371,
    // job 100062672226, harvest step 2026-09-01T23:28:57Z-2026-09-02T00:25:06Z,
    // which did reach this shop:
    //
    //     Superdrug          0 urls  0 fetched  0 priced listings  (2 errors)
    //       [actor] skipped: Superdrug has answered every real render attempt
    //           on file with a refusal … — skipping the render tier rather
    //           than spending a page confirming that again
    //       https://www.superdrug.com/sitemap.xml: HTTP 403
    //     zero this run: boots, the-fragrance-shop, harvey-nichols,
    //         debenhams, the-perfume-shop, john-lewis, superdrug, scentstore
    //
    // The next scheduled run, #372 (job 100124753779, 2026-09-02T04:49:44Z),
    // did not reach this shop at all — "never reached this run: … superdrug …
    // — out of time before being asked, keeping their previous prices" — which
    // is why the freeze persists between the runs that do ask.
    //
    // So the mechanism is exactly two things and nothing else: the free
    // sitemap route gets HTTP 403, and `renderRefused: 'local'` correctly
    // skips the free renderer that has already been refused twice. Nothing is
    // broken and nothing is being retried pointlessly; there is simply no
    // unmetered route left.
    //
    // ── The refusal is broader than any earlier note recorded ───────────────
    // Checked by hand from this sandbox, 2026-09-02, and worth writing down
    // because it changes what "403 on the sections" means: robots.txt itself
    // answers 403. Six URLs, every one of them 384-398 bytes in 0.2-0.5s:
    //
    //     /robots.txt                     403   385 bytes
    //     /sitemap.xml                    403   384 bytes
    //     /fragrance/c/fragrance          403   398 bytes
    //
    // The body is an Akamai edge deny — "<TITLE>Access Denied</TITLE> … You
    // don't have permission to access … Reference #18.9ebd7768.1788344314…
    // https://errors.edgesuite.net/…" — with a real per-request reference id,
    // i.e. the shop's own CDN answering, not this sandbox's relay failing (a
    // relay failure produces no HTTP status at all; see John Lewis's entry for
    // that shape). The same 403, same body, same Akamai host, comes back for
    // The Perfume Shop, which is not surprising: both are AS Watson brands.
    //
    // A blanket deny that includes /robots.txt is a different fact from a
    // section-level block. It means this project cannot even read this shop's
    // own crawl rules from a datacentre address — so "is this path allowed"
    // is not a question that can be asked here, let alone answered. Nothing in
    // the pipeline treats that as permission: crawlViaSitemap's robots read
    // fails closed, exactly as it should.
    //
    // ── Is any route left? ──────────────────────────────────────────────────
    // Three, in descending order of how real they are:
    //
    //   1. The Apify actor tier. PROVEN on this shop specifically: job
    //      96839386128 (2026-08-21) rendered /fragrance/c/fragrance and
    //      parseListings read 60 GBP-priced schema.org Products out of it,
    //      with no new parser needed. That is a working route today, gated
    //      only on credit and on a per-shop preference existing — which it
    //      now does (`renderTier` in src/catalogue/renderTier.ts). Deliberately
    //      NOT enabled here: the owner's ruling covered John Lewis only, and
    //      2026-08-21 is the standing demonstration of what happens when
    //      several shops draw on one $5 pool at once — this shop was one of
    //      the five that went dark that day.
    //   2. Awin. `affiliate` below already records this shop as Awin-verified
    //      with `status: 'not-applied'`. A joined programme brings a product
    //      feed, and a feed is not a crawl — it is the one route on this list
    //      that the Akamai deny cannot touch, because it is served by Awin
    //      rather than by superdrug.com. Owner action (apply to the
    //      programme); nothing here can do it.
    //   3. Nothing else. There is no second free retrieval path to try: the
    //      plain fetch, the browser-header fetch, the sitemap walk, the
    //      search page, the homepage probe and the free local renderer have
    //      each been refused from this project's own address, and the deny now
    //      covers robots.txt too.
    //
    // ── Should the 112 stored offers be delisted? No ────────────────────────
    // They are already handled honestly by the code that exists.
    // STALE_OFFER_DAYS (src/services/priceService.ts) is 10, these are past
    // it, so every one of them already renders with "price last confirmed 12
    // days ago" on its own row (demo/app.ts's offer renderer) and is already
    // outranked by any fresher offer in preferFreshOffers. Deleting them would
    // remove a real price this project genuinely observed, in favour of no
    // information at all, on no evidence that the shop has stopped selling
    // the bottle — the shop has not refused to tell us its price, it has
    // refused to tell *this address*. Delisting is the right answer when a
    // listing is gone; it is the wrong answer when the reader can be told
    // exactly how old the number is, which they already are.
    renderRefused: 'local',
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
    //
    // ── Measured, 2026-08-20. The actor gets in; the markup is the problem ──
    // Harvest probe run 21, job 96351681373, with APIFY_TOKEN live:
    //
    //     https://www.selfridges.com/sitemap.xml: HTTP 403
    //     [actor] rendered 1 section page(s), 0 listings parsed, 0 priced
    //     [actor] https://www.selfridges.com/GB/en/cat/beauty/fragrance/?pn=1:
    //         HTTP 200, 949307 bytes
    //
    // The free route is refused exactly as this entry describes, and the
    // actor walks straight past that refusal: 949 kB of real, rendered
    // Selfridges fragrance page from a shop that 403s every plain request
    // this project makes. The IP-level block is beaten.
    //
    // And nothing came out of it, because `parseListings` reads schema.org
    // Product nodes from JSON-LD and this page publishes none. That is the
    // same wall John Lewis hit on the same day through the same tier (see its
    // entry), and it is worth separating from the block that precedes it:
    // retrieval here is solved and extraction is not. Unlike Boots — which
    // answered the same actor with a 2.5 kB challenge page — this shop is
    // reachable, and what stands between it and the site is a parser
    // question, not a permission or a spending one.
    //
    // ── The hydration-blob hypothesis, checked and answered ─────────────────
    // The next question this raised: if not JSON-LD, does the same rendered
    // page carry its product data in a framework hydration blob instead —
    // `__NEXT_DATA__`, `window.__PRELOADED_STATE__`, Apollo state — which
    // would be far cheaper to extract than a second general parser?
    // scripts/apify-blob-probe.ts (added to answer exactly this) re-rendered
    // the same section URL and scanned the result. Run 32367317128, job
    // 96419581995, 2026-08-20T12:09Z, 949,036 bytes:
    //
    //     Next.js __NEXT_DATA__:            not found
    //     Nuxt __NUXT__:                     not found
    //     generic __PRELOADED_STATE__:       not found
    //     generic __INITIAL_STATE__:         not found
    //     Apollo __APOLLO_STATE__:           not found
    //     React Server Components self.__next_f: FOUND, 18 bytes — no
    //         price-shaped or name-shaped keys
    //
    // No. This page is a Next.js App Router page streamed through React
    // Server Components, not a client-hydrated page carrying a synchronous
    // JSON state object. `self.__next_f.push` is RSC's own streaming
    // protocol marker, not a data blob — 18 bytes is a stub call, and RSC's
    // actual payload (if any is even present in this particular render) is
    // chunked and framed in a shape this project's regex-based scan cannot
    // extract, and that a general JSON-LD parser was never going to touch
    // either way. The cheap-extractor hypothesis does not hold for this
    // shop: getting product data out of this specific render would mean
    // parsing RSC's streaming format specifically, not adding one more
    // known-marker case to a generic blob scanner. Recorded as a measured
    // negative, not an unexplored option.
    //
    // ── A correction to "under 5 minutes both times", 2026-08-20 ────────────
    // John Lewis's own entry above documents a client-side bug found by
    // reading this shop's job logs directly through the GitHub API: this
    // probe's render step (job 96419581995) measured 12:09:05Z–12:13:51Z,
    // 286 seconds — essentially exactly apifyActor.ts's leaked
    // `ACTOR_CALL_TIMEOUT_MS + 5_000` (285s) timer, not a healthy actor call
    // finishing promptly. The actual render+scan almost certainly completed
    // in the same ~20–30s every other shop's version of this probe has
    // shown; this run simply was not cancelled early, so it ran out its
    // full dead window before the process could exit. "Retrieval works and
    // is fast" still stands — the render itself succeeds — but "in under 5
    // minutes" should be read as "the whole step took under 5 minutes
    // because of a timer leak", not as a measurement of how long this shop
    // actually takes to render. See John Lewis's entry for the fix this
    // implies (apifyActor.ts's runOneActor, not touched in this pass).
    //
    // ── Not a dead end: the RSC stream carries a typed grid, 2026-08-21 ──
    // State probe run 32505063770, job 96843269238, 16:51Z, one rendered page
    // of /GB/en/cat/beauty/fragrance/?pn=1, 964,069 bytes:
    //
    //     JSON-LD blocks: 1; parseListings(): 0 listing(s)
    //       #breadcrumb-schema type=application/ld+json 273 bytes
    //     ### RSC flight stream: 19 chunk(s), 459,936 chars assembled
    //       "price" as a key: first at 398417
    //       "sku": first at 398478
    //
    // The page's only JSON-LD really is a breadcrumb, as recorded above. But
    // the 19 `self.__next_f.push` chunks reassemble into 460 kB of flight
    // stream, and at offset 398,417 sits a GraphQL result set that labels its
    // own types:
    //
    //     "products":[{"__typename":"Product",
    //       "name":"Atelier des Fleurs Cedrus de Nuit Eau de Parfum 150ml",
    //       "seoKey":"chloe-atelier-des-fleurs-…-150ml_R04693967",
    //       "brand":"CHLOE","productId":"R04693967",
    //       "lowestPrice":[{"currency":"GBP","price":231,
    //         "markdownPrice":null,"prevMarkdownPrice":null}], …
    //
    // Three complete records in that one window: £231, £115 and £375. The
    // records carry no URL, so the address was measured off the same grid's
    // own anchors rather than constructed — run 32505707116, job 96845282753
    // — and is `/GB/en/product/{seoKey}/`, not the `/GB/en/cat/` this shop's
    // category pages use.
    //
    // src/catalogue/selfridgesRsc.ts reads it, registered in
    // src/catalogue/renderedState.ts. One limit, argued in that module's
    // header: stock is always null, because the stream never states
    // availability anywhere in its 459,936 characters.
    //
    // ── The markdown question, settled 2026-08-22 ───────────────────────────
    // A record carrying a markdown used to be stored unpriced, because no
    // captured record established whether a reduced product's current price
    // is in `price` or in `markdownPrice`. State probe run 32540580489, job
    // 96949668662, 00:31Z, one rendered page of /GB/en/cat/beauty/on_sale/
    // ?pn=1, settles it with three genuinely reduced records — a Theragun Pro
    // Plus at price 499 / markdownPrice 599, a Theragun Relief at 99 / 129, a
    // TheraFace Pro at 49 / 79 — and the same run's painted-markup scan found
    // both figures written on the page itself for all three ("£499.00" and
    // "£599.00" among them). `price` is the lower figure and the one the shop
    // paints as today's buyable price; `markdownPrice`, when set and higher
    // than `price`, is the pre-reduction reference figure. The parser now
    // reads both: `priceGbp` from `price` unconditionally, `wasPriceGbp` from
    // `markdownPrice` only where it exceeds `price`. `prevMarkdownPrice`
    // remains unread — no captured record has ever set it.
    //
    // This shop stays as it is below. Extraction is proven; currency
    // confirmation is a separate step and has not been done here.
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
    // ── Affiliate, researched 2026-08-20 — not Awin, not Rakuten ────────────
    // PerformanceIN (industry trade press, 18 May 2022, "Selfridges Chooses
    // Partnerize to Consolidate Its Global Affiliate Programme") reports
    // Selfridges moved its affiliate programme onto Partnerize and
    // explicitly retired its legacy Awin and Rakuten programmes as part of
    // that move — corroborated independently by a third-party affiliate
    // directory listing ("Selfridges Affiliate Program | Partnerize")
    // describing live programme terms: no PPC bidding on Selfridges' own
    // brand terms, only valid voucher codes may be promoted, email
    // marketing needs prior approval, and sub-affiliate networks must be
    // disclosed. Neither source states whether price-comparison sites are
    // accepted — unlike Superdrug's entry, which has that answer in
    // writing, this one does not, and it should be treated as an open
    // question to ask during application rather than assumed either way.
    //
    // This matters for sequencing: the owner's Awin and Rakuten publisher
    // applications already in progress will not reach this merchant even
    // once approved, because (per this 2022 report) Selfridges is not
    // listed on either marketplace — Partnerize is a separate account, its
    // own signup, with its own brand-by-brand application inside it. That
    // is four years old as a data point and was not re-confirmed live from
    // this sandbox (selfridges.com and every Selfridges-affiliate page
    // WebFetch was pointed at returned EGRESS_BLOCKED here) — worth a
    // one-message check ("does Selfridges still run its programme on
    // Partnerize?") before the owner spends time on a second network
    // signup, rather than assumed current four years on.
    //
    // No merchant ID: Partnerize does not publish a public per-merchant
    // profile URL the way Awin's `ui.awin.com/merchant-profile/{id}` does,
    // so there is nothing to cite in `publisherId`'s place — left null
    // rather than invented. `deeplinkTemplate` is null for the same reason:
    // Partnerize's own link shape was not found from a primary source in
    // this pass, so nothing is guessed here either.
    //
    // ── Re-verification attempt, 2026-08-21 — WebSearch only, still not a ────
    // ── primary source, but the 2022 finding looks current ───────────────────
    // WebFetch to selfridges.com and Partnerize's own site is still
    // EGRESS_BLOCKED from this sandbox, same as when the finding above was
    // first recorded, so this could only be re-checked via WebSearch, which
    // does work here. Result: CONFIRMED CURRENT, on secondary evidence, not
    // CONTRADICTED. Two independent affiliate-network aggregator listings
    // dated well after the 2022 PerformanceIN article both name Partnerize
    // as Selfridges' live affiliate network today — a hienergyrocket.com
    // listing titled "Selfridges Affiliate Program | Partnerize" and a
    // cuelinks.com listing dated "April 2026" (payout 1.35% per sale, 7-day
    // cookie, marked paused by the advertiser there specifically, which
    // reads as that one aggregator's own campaign status rather than
    // Selfridges pausing the programme generally — affplus.com and affi.io
    // list it as a live Partnerize programme with no pause noted). No
    // search turned up any report of Selfridges moving off Partnerize back
    // to Awin, Rakuten, CJ or Impact, or any 2023-2026-dated source
    // contradicting the 2022 move. Neither aggregator is Selfridges or
    // Partnerize themselves, so this is still not the primary-source
    // confirmation a WebFetch to selfridges.com's own affiliate page would
    // give — but it is real evidence from four years later than the
    // original source, not just its age alone, and it points the same way.
    // On this, the Partnerize signup at partnerize.com/partners looks worth
    // the owner's time rather than worth delaying for a fresher signal.
    // `enabled` and pricing are unchanged by this comment.
    affiliate: {
      network: 'partnerize',
      verified: true,
      status: 'not-applied',
      publisherId: null,
      deeplinkTemplate: null,
      querySuffixTemplate: null,
      signupUrl: 'https://partnerize.com/partners',
      notes:
        'Sourced from PerformanceIN, 18 May 2022: Selfridges consolidated its affiliate ' +
        'programme onto Partnerize, retiring Awin and Rakuten. Not the same network as the ' +
        "owner's pending Awin/Rakuten applications — this needs its own Partnerize publisher " +
        'signup, then a separate application to the Selfridges programme inside it. Whether ' +
        'PriceSniffs (a comparison site) is accepted is unconfirmed either way; ask during ' +
        'application. Four-year-old sourcing, not re-verified live from this sandbox — worth ' +
        "re-checking Selfridges' own affiliate page before the owner spends time on the signup.",
    },
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
    // shop-specific needed beyond this comment.
    //
    // ── Measured, 2026-08-20, with APIFY_TOKEN live for the first time ──────
    // The paragraph above ends "the owner adding APIFY_TOKEN is what turns
    // this from a design into a measurement". It has been added, and the
    // measurement contradicts the design's premise.
    //
    // Harvest probe run 2, job 96342150229, and run 7, job 96343392189:
    //
    //     https://www.harveynichols.com/robots.txt: HTTP 503   (bot UA)
    //     https://harveynichols.com/robots.txt:     HTTP 503   (bot UA)
    //     https://www.harveynichols.com/robots.txt: HTTP 503   (browser UA)
    //     https://harveynichols.com/robots.txt:     HTTP 503   (browser UA)
    //
    // Four attempts, two hostnames, two user-agents, all inside one second.
    // This shop is not serving a script-rendered page to us any more; it is
    // not serving us anything. That is a change since 2026-08-10, when
    // data/strategy-memory.json recorded HTTP 200 on four separate strategies
    // against it — so the "200 with an empty grid" story above was true and
    // is now out of date. The current failure is an IP-level refusal of the
    // network the runner sits on, which is exactly the shape this file calls
    // 'proxied' elsewhere, not 'headless'. `adapter` is left as 'headless'
    // only because that remains untested: nothing has yet got past the
    // refusal to find out what the page contains.
    //
    // Both metered tiers were tried and neither could get past it either:
    //
    //   - The Apify proxy fails at every shop, not just this one, with
    //     "TypeError: fetch failed (Error: Request was cancelled.)" on every
    //     request. See src/catalogue/apifyAccount.ts.
    //   - The Apify actor is refused before it starts. Run 11, job
    //     96345230824: HTTP 403 `full-permission-actor-not-approved` —
    //     "This Actor requires full access to your account. You must approve
    //     its permissions before running it." apify/puppeteer-scraper takes a
    //     pageFunction, so Apify will not run it until the account owner
    //     approves it once, by hand, in the console. That is an owner action;
    //     no code change can grant it.
    //
    // So this shop is not yet shown to be gettable OR ungettable. What is
    // established is that every route currently available to this project
    // fails before reaching its markup, and which single click would let the
    // most promising one be tried at all.
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
    // Was `enabled: true` with a real catalogue.sections config and zero
    // listings behind it — the switch was on and nothing could flow, because
    // nothing this repo's tooling can send ever reaches the domain.
    //
    // Direct re-attempt 2026-08-12 got HTTP 403 on the homepage, robots.txt
    // AND /policies/shipping-policy alike — the whole site refuses this
    // tooling, not one page. Currency probe, run 32276664942 job 96145604924,
    // 2026-08-19T16:34Z, commit 2107dfa: robots.txt did not answer at all
    // this time — no response, not even a 403 — so the probe made zero
    // further requests, exactly as its own standard requires ("holding off
    // rather than assuming we are welcome"). Two attempts a week apart, two
    // different failure shapes (an explicit block, then silence), same
    // outcome: nothing here suggests this address will ever answer this
    // tooling. Per this registry's own rule that robots.txt (or its total
    // absence) is binding, this is a documented dead end, not a to-do —
    // disabled rather than left on dark. The catalogue.sections URLs below
    // were confirmed live in a human browser 6 Aug 2026 and are kept as a
    // record of that fact; they are not something an automated route can
    // reach from here. Re-enable only after a probe run actually gets past
    // robots.txt.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-12',
      confidence: 'unverified',
      notes:
        'THE FLAT STANDARD RATE IS UNCONFIRMED. Free UK delivery over £50, next-day option at ' +
        '£3.99 (aggregator-sourced, not read off the retailer\'s own page). Re-attempted ' +
        'directly 2026-08-12: every request to perfumeshopping.com (homepage, robots.txt, ' +
        '/policies/shipping-policy) returned HTTP 403. Re-attempted from CI 2026-08-19 (run ' +
        '32276664942 job 96145604924): robots.txt did not answer at all. See the entry-level ' +
        'comment above for why this shop is now disabled rather than shown dark.',
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
    //
    // ── Enabled and still dark for days; the reason, and the fix ────────────
    // Every run from that enabling until 2026-08-20 reported this shop as
    // `0 urls  0 fetched  0 priced listings` with no error line at all (run
    // 261, job 96314578076, is one of many). Nothing was wrong with the shop.
    // `loadRobots` asked `https://www.uk.shopfrenchavenue.com/robots.txt` —
    // `www.` bolted onto a domain that already carries a subdomain — which
    // does not resolve; a DNS failure is not a 4xx, so it read as "robots.txt
    // unreachable", which isAllowed treats as everything disallowed, and a
    // disallowed URL is skipped without an error line. See
    // src/catalogue/robotsSource.ts for the full measurement.
    //
    // After the fix, Harvest probe run 3, job 96342168489, 2026-08-20T06:57Z,
    // commit 11f2d06: 141 urls discovered, 9 pages fetched, 141 priced
    // listings. The first real data this shop has ever produced.
    //
    // ── First delivery figure, promoted by hand, 2026-08-27 ─────────────────
    // scripts/shipping-discover.ts read this shop's own shipping policy first
    // on 2026-08-22 (checkedAt 2026-08-22T22:30:01Z, committed 92b3854a) and
    // has re-read the identical page and sentence on every attempt since —
    // most recently run 33027053140 job 98370769894, 2026-08-27T00:34:55Z —
    // always one clean page, one unambiguous sentence, no caveats: verdict
    // PROPOSE-RATE every time. The tool never writes a first figure itself
    // (see shippingRegistryPatch.ts's own header comment — "a new figure →
    // never written... no amount of regex confidence earns the right to make
    // it unattended"); that is a human's call, and per the owner's standing
    // sign-off on this area this is that human reading the same sentence and
    // making it. The page states only the standard cost, nothing about what
    // happens at or above £100, so freeOverGbp is left null rather than
    // inferred from "below £100" — recording a threshold the page never
    // states outright would be exactly the invention this file's own header
    // rules out.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: 4.99,
      freeOverGbp: null,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-27',
      confidence: 'confirmed',
      source: {
        url: 'https://uk.shopfrenchavenue.com/policies/shipping-policy',
        quote: 'Standard Shipping Fee : A flat rate of £4.99 applies on orders below £100 .',
        readAt: '2026-08-27',
      },
      notes:
        'Was in houses.ts as frenchavenue.com (the global, AED-priced site) until this UK-' +
        'specific storefront turned up. A £50 free-delivery figure appears in search results ' +
        'but is attributed to third-party UK retailers stocking French Avenue, not confirmed ' +
        "as this site's own policy — do not carry it over without checking " +
        'uk.shopfrenchavenue.com directly. Currency separately confirmed sterling; see this ' +
        "entry's comment above.",
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
      verifiedAt: '2026-08-30',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://alharamainperfumes.co.uk/en-us/pages/delivery-information',
        quote: 'FREE UK Delivery on orders over £50 (Royal Mail Standard Service)',
        readAt: '2026-08-30',
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
    //
    // robots.txt has since tightened. Shipping probe, run 32279443137 job
    // 96154463621, 2026-08-19T17:03Z — under four hours after the currency
    // probe above — found `/` itself now disallowed ("0 pages UNREACHABLE",
    // both the home page and /policies/shipping-policy refused). Whatever
    // permitted every request at 13:06Z no longer does at 17:03Z: robots.txt
    // is the shop's own instruction and it changed, not a bug in either
    // probe. Recorded as a second reason this stays off, not just "no
    // route yet" — a sitemap walk would need to ask the same now-disallowed
    // origin, so crawlViaSitemap is blocked too, not merely untried.
    //
    // ── That reading was wrong, and the sitemap walk works ──────────────────
    // The paragraph above is retracted. Nothing about this shop's robots.txt
    // changed between 13:06Z and 17:03Z on 2026-08-19. What differed is which
    // address each probe asked. The currency probe asked the shop's own
    // origin and was permitted; the shipping probe went through
    // attempt.ts's `loadRobots`, which asked
    // `https://www.uk.riiffsperfumes.com/robots.txt` — `www.` bolted onto a
    // domain that already carries a subdomain — got nothing, and returned
    // UNREACHABLE_ROBOTS, which isAllowed treats as everything disallowed.
    // "0 pages UNREACHABLE" is that function's output for a hostname that
    // does not exist; it is not what a Disallow rule produces. See
    // src/catalogue/robotsSource.ts.
    //
    // Measured after that fix, Harvest probe run 14, job 96347721166,
    // 2026-08-20T07:24Z, commit eb8bb05: robots.txt read, 142 product URLs
    // discovered, 20 pages fetched, **19 priced listings** parsed out of
    // them. There is a working retrieval route to this shop.
    //
    // The shop-level probe found the storefront silent on currency at every
    // address tried, and this file does not let a JSON-LD price publish as
    // sterling on the registry's say-so alone — the same assumption that
    // published dollars as pounds at Escentual. So the id was added to
    // CURRENCY_UNCONFIRMED at the foot of this file.
    //
    // ── The untried angle: a product page's own priceCurrency ───────────────
    // Currency probe, run 32366295704 job 96416544427, 2026-08-20T11:57Z,
    // asked the specific product page the harvest itself fetched
    // (https://uk.riiffsperfumes.com/product/aswaar/, read off that harvest
    // run's own log — scripts/catalogue-harvest.ts now prints one on every
    // shop that priced, see its own header comment) rather than the shop's
    // origin or a market-path guess. Every one of the six candidates that
    // reached the page at all (origin, ?country=GB, both cookies,
    // Accept-Language en-GB — the four market-path guesses 404 here, same as
    // the shop-level probe found) read its schema.org JSON-LD as **44.99
    // GBP**, identically. That is the one positive sterling reading this
    // entry's own CURRENCY_UNCONFIRMED note said would be enough. Removed
    // from that list at the foot of this file.
    //
    // Enabled on that, with every other gate already proven above: robots.txt
    // permits, the sitemap route reads 19 priced listings (Harvest probe run
    // 14, job 96347721166), and now sterling from the product page itself.
    // `sitemapHarvestConfirmed: true` records the second half of that — see
    // its own doc comment in src/types/retailer.ts for why this is the first
    // entry to need it: `standardGbp` stays null (nobody has found this
    // shop's below-£100 rate yet, see shipping.notes below), so this joins
    // tests/registry.test.ts's "unstated delivery" allowlist, and that list
    // requires a stated real ingestion route — the generic sitemap walk
    // already measured against this shop is that route, just never named as
    // one until now.
    enabled: true,
    adapter: 'unknown',
    sitemapHarvestConfirmed: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 100,
      estimatedDays: [2, 3],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'freeOverGbp and the 2-3 working day window are their own stated figures. The ' +
        'standard cost below £100 has never been read off this shop\'s own delivery page — no ' +
        'shipping:discover run has reached it, unlike fragrancehub\'s confirmed ' +
        'standardRateNotPublished. Genuinely unconfirmed, not established as unstated; the ' +
        'entry is enabled on tests/registry.test.ts\'s unstated-delivery allowlist all the same, ' +
        'same as this file\'s header explains that field is for. Read the page directly to ' +
        'close this out.',
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
    //
    // ── Enabled and still dark, for the same reason as French Avenue ────────
    // Reported `0 urls  0 fetched  0 priced listings` with no error on every
    // run since (run 261, job 96314578076, among them). `loadRobots` asked
    // `https://www.ibraquk.com/robots.txt`; this storefront serves its apex
    // and not `www`, so that address never answered, which read as "robots.txt
    // unreachable" and therefore as everything disallowed — silently, because
    // a disallowed URL is skipped without an error line. Note this entry's own
    // comment above already recorded "robots.txt permitted every request": the
    // currency probe asked the right host and got a real answer. Only the
    // harvest asked the wrong one. See src/catalogue/robotsSource.ts.
    //
    // After the fix, Harvest probe run 4, job 96342189471, 2026-08-20T06:57Z,
    // commit 11f2d06: 95 urls discovered, 6 pages fetched, 95 priced
    // listings. The first real data this shop has ever produced.
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
      verifiedAt: '2026-09-01',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://manchesterouds.com/pages/shipping-policy',
        quote: 'Free shipping on orders over £50',
        readAt: '2026-09-01',
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
    //
    // ── The sitemap route, on the other hand, works ─────────────────────────
    // Harvest probe run 15, job 96347744390, 2026-08-20T07:24Z, commit
    // eb8bb05: robots.txt read and permitting, sitemap.xml itself 404s but
    // robots.txt names others, 1,446 product URLs discovered, 20 pages
    // fetched, **20 priced listings** — every page fetched yielded one. This
    // shop was in the "no working route" group and it is not; nobody had
    // asked it through crawlViaSitemap.
    //
    // Two separate things were previously recorded as blocking it and only
    // one of them survives.
    //
    //   - `standardGbp: null` does NOT block enabling. This file's own header
    //     says so plainly: such a shop renders "delivery not stated", can
    //     never be shown as cheapest, and is enabled elsewhere on exactly
    //     that basis (french-avenue, ibraq, zimaya). The note below claiming
    //     it "still blocks enabling" is wrong and is retracted here.
    //   - The currency did block it, until now. The probe above found this
    //     storefront silent — no currency published anywhere, by any of nine
    //     ways of asking. The sitemap route would read its JSON-LD prices and
    //     label them sterling on the registry's say-so, which is precisely
    //     how dollars were published as pounds at Escentual. So this id
    //     joined CURRENCY_UNCONFIRMED at the foot of this file, which also
    //     stopped any writer storing a GBP figure against it.
    //
    // ── The untried angle: a product page's own priceCurrency ───────────────
    // Currency probe, run 32366445247 job 96416932763, 2026-08-20T11:59Z,
    // asked the specific product page the harvest itself fetched
    // (https://perfumeo.co.uk/products/petra-viola-by-lattafa-100ml-eau-de-parfum-2/,
    // read off that harvest run's own log the same way riiffs' was — see
    // catalogue-harvest.ts's own header comment on printing a sample priced
    // URL) rather than the shop's origin or a market-path guess. Every one
    // of the six candidates that reached the page at all (origin, ?country=
    // GB, both localisation cookies, Accept-Language en-GB — the four
    // market-path guesses 404 here, same as the shop-level probe found) read
    // its schema.org JSON-LD as **49.99 GBP**, identically. That is the one
    // positive sterling reading this entry's own CURRENCY_UNCONFIRMED note
    // said would be enough. Removed from that list at the foot of this file.
    //
    // Enabled on that: sitemap route proven (20 priced listings, above),
    // robots.txt permits, delivery page genuinely read and confirmed to
    // state no flat rate (not merely unstated), and now sterling from the
    // product page itself. `sitemapHarvestConfirmed: true` records the
    // ingestion-route half — see its own doc comment in src/types/retailer.ts,
    // added for riiffs earlier today, the first entry to need it.
    enabled: true,
    adapter: 'unknown',
    sitemapHarvestConfirmed: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Read directly, not just searched for: shipping probe, run 32279620206 job ' +
        '96155027469, 2026-08-19T17:05Z, fetched 4 pages of perfumeo.co.uk (+1 footer link ' +
        'followed) and confirmed NO RATE STATED — the delivery page exists and was read, it ' +
        'simply never names a flat standard charge, the same shape beauty-pie and ' +
        'cult-beauty-global\'s delivery pages show. Not a retrieval failure to fix; there is no ' +
        'figure on the page to find, which is why this stays enabled on ' +
        'tests/registry.test.ts\'s unstated-delivery allowlist rather than blocked.',
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
    // Was `adapter: 'affiliate-feed'` pointed at an Awin programme this
    // entry's own prior notes recorded as `awinActive('116255', ...)`,
    // "joined 5 Aug 2026" — but the feed itself was never pulled ("Feed not
    // yet checked" in that same note), so this shop ran enabled with zero
    // listings regardless. The owner has since confirmed directly that the
    // application was in fact REJECTED, not accepted — this entry's earlier
    // "active" data was wrong. The feed route is dead: there is no live
    // programme behind it, and no basis for the phone-call image permission
    // that data cited either, so that has been dropped along with it.
    //
    // What replaces it is a different, independently verified route: this
    // shop's own Shopify storefront. Currency probe, run 32278317097 job
    // 96150855581, 2026-08-19T16:52Z, commit 96315d3: /products.json returns
    // a real Shopify payload (e.g.
    // yves-saint-laurent-black-opium-glitter-eau-de-parfum at 39.99).
    // ?country=GB explicitly quotes AND settles GBP at rate 1; every other
    // way of asking labels the identical figures USD while still settling
    // GBP — the same numbers under two labels, no real conversion — so
    // ?country=GB is the confirmed-sterling address (same shape as Al
    // Haramain/Armaf/French Avenue/IBRAQ elsewhere in this file).
    // robots.txt permitted every request made. `shopifyStorefront` set
    // below; `adapter` no longer names a feed that does not exist.
    //
    // ── `catalogue: null` here is deliberate, and is not why anything is
    //    missing ────────────────────────────────────────────────────────────
    // Recorded because the opposite was assumed and acted on: that this shop
    // yields nothing because the crawler has no section URLs to walk, and
    // that the fix is to invent some. It is not. `crawlViaShopifyProducts`
    // (src/catalogue/shopifyProductsCrawl.ts) builds its own address from
    // `retailer.domain` alone — `https://{domain}/products.json?limit=...` —
    // and never reads `catalogue` at all. scripts/catalogue-harvest.ts only
    // falls through to `crawlViaSitemap`, which is the route that does need
    // sections, when the Shopify route comes back not-Shopify or empty. It
    // does neither here.
    //
    // Measured rather than reasoned: harvest probe --dry-run --shop=
    // the-beauty-store-uk, run 32388845816 job 96489829499,
    // 2026-08-20T15:56:24Z, commit 378bebe, with `catalogue` still null as it
    // is below. 20 pages fetched, 400 urls, 400 priced listings, sample
    // https://thebeautystore.com/products/armani-acqua-di-gio-parfum-refill-
    // bottle-150ml, and the log's own line "sterling market: ?country=GB
    // (Shopify Markets' country parameter) — the origin quotes this runner
    // something else", which is the ?country=GB fact above still holding.
    //
    // The stored snapshot agrees and is larger, because the scheduled crawl
    // is not capped at 20 pages: data/catalogue/the-beauty-store-uk.json at
    // commit 378bebe holds 4,902 listings, all 4,902 priced, 4,832 with a
    // photo, 4,622 in stock, source 'live', updatedAt 2026-08-20T07:33:23Z.
    // Among them is the exact product the owner pasted — /products/paco-
    // rabanne-pure-xs-eau-de-parfum-spray-50ml at £29.99, in stock — which
    // is also present in demo/catalogue.generated.ts, so it is on the site
    // and not merely on disk.
    //
    // Adding section URLs here would therefore be dead configuration on the
    // live route and a second, slower way to read the same storefront on the
    // fallback. If this shop ever stops being Shopify, that is the moment to
    // write a `catalogue` block — and to measure it, not guess it.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
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
    // Not an omission — see the "`catalogue: null` here is deliberate" block
    // in this entry's own comment above for the run that proves the Shopify
    // route reaches 400 priced listings with this field exactly as it is.
    catalogue: null,
    affiliate: {
      network: 'awin',
      verified: true,
      status: 'rejected',
      publisherId: null,
      deeplinkTemplate: null,
      querySuffixTemplate: null,
      signupUrl: 'https://ui.awin.com/merchant-profile/116255',
      notes:
        "The owner confirmed directly that this programme's application was not accepted — " +
        'rejected, not pending and not active. Merchant id 116255 is kept above only as a record ' +
        "of which programme this was; it names no live relationship. Prices now come from the " +
        "shop's own storefront (see the entry-level comment above), not an affiliate feed, so no " +
        'imageUsageConfirmed/imageBasis is set: there is no affiliate terms page granting a basis ' +
        'for displaying their photography, and none is claimed.',
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
    // ── Harvested 84, published 0, and why that is now 50 ────────────────────
    // Run 261 (job 96314578076, 2026-08-20T04:29Z) stored 84 real, in-stock,
    // sterling-priced listings from this shop and the site showed none of
    // them. `isFragrance` requires a size before it will treat a listing as a
    // comparable bottle, and Zimaya titles its products with the name alone:
    // "Ghali Imperial", "Ode to Rose Royale", "Rabab Gems". Not one of the 84
    // titles carried a size.
    //
    // Two separate things were in the way and both are answered here.
    //
    // 1. The size. 50 of the 84 state it in the product URL Zimaya itself
    //    publishes — /products/al-kaser-100ml, /products/itqan-gold-edp-100ml
    //    — which is the retailer stating the size, in a field this repo
    //    already holds, in a place nothing was reading. scripts/catalogue-
    //    harvest.ts now reads it (src/catalogue/sizeFromUrl.ts). The other 34
    //    state it nowhere and stay out: this recovers a stated size, it never
    //    invents one, so this shop reaches the site with 50 bottles, not 84.
    //
    // 2. The concentration word. Zimaya names nothing "eau de parfum" either,
    //    so the general test would still have rejected all 84. Checked title
    //    by title against the harvested snapshot before setting the flag
    //    below: all 84 are fine fragrances — no body spray, no deodorant, no
    //    bath or body line of any kind, which is exactly the trap
    //    fragranceOnlyCatalogue's own doc comment warns about with LUSH and
    //    Bath & Body Works. This is the Escentric Molecules case again: a
    //    single house naming its products after itself rather than after a
    //    concentration.
    //
    // Measured after both changes, Harvest probe run 6, job 96342235367,
    // 2026-08-20T06:57Z, commit 11f2d06: 84 urls, 6 pages fetched, 84 priced
    // listings, "50 sizes read from product URLs" — the predicted 50 exactly.
    fragranceOnlyCatalogue: true,
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
    // Was enabled with zero listings — no route was ever wired. Currency
    // probe, run 32277002439 job 96146678060, 2026-08-19T16:38Z, commit
    // a5b1757: /products.json returned a real Shopify payload (e.g.
    // go-boujee-1 108.00, boujee-kitty-caramel-milk-22 80.00), and the
    // origin quotes GBP, settles GBP, at rate 1 — identically through five
    // other ways of asking (?country=GB, both localisation cookies,
    // Accept-Language en-GB). /en-gb, /gb, /uk and /en-uk all 404, as
    // expected of a single-market store. robots.txt permitted every request
    // made. So `shopifyStorefront` is set below. Note the sample also
    // included a "mini perfume holder charm" — this shop sells fragrance
    // accessories alongside scent, which is exactly the kind of listing
    // `fragranceOnlyCatalogue`'s doc comment warns against admitting without
    // the concentration-word title test; that flag is deliberately left
    // unset here.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
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
    //
    // Was enabled with zero listings — no route was ever wired. Currency
    // probe, run 32277218325 job 96147368914 (market sweep) and run
    // 32277396198 job 96147931164 (a real product page,
    // /uk/en/fashionably-london-edp-100-ml---3-38-oz-p20210888.html, found via
    // web search rather than guessed), both 2026-08-19T16:4*Z, commit
    // da7a4dd: not Shopify — /products.json-shaped signals absent everywhere,
    // .json on the product path 404s. The bare origin, /gb, /uk and every
    // cookie/header variant all answer home 200 — this domain is reachable,
    // nothing here is blocked — but the product PAGE itself carries no
    // schema.org JSON-LD and no currency meta at all, on any of the seven
    // ways asked. That is the same signature Harvey Nichols' entry above
    // documents: HTTP 200 with the markup genuinely empty until JavaScript
    // runs, not a wrong URL and not a block. So `adapter: 'headless'` here
    // too, for the same reason and pointed at the same Apify-actor route —
    // see apifyActor.ts and the Harvey Nichols comment for what that route
    // is and is not proven to do. It is UNPROVEN for this shop specifically:
    // no APIFY_TOKEN exists in this environment, so nothing below has
    // actually run. The two catalogue.sections URLs are real category pages
    // (found the same way as the product URL above, not invented) but a
    // script-rendered SPA's true pagination scheme was not established —
    // the ?page= param is this repo's usual convention, unverified past
    // page 1, and moot until a token makes the route runnable at all.
    // Currency stays exactly what it was before this pass: nothing measured
    // here bears on it either way, since the probe's only currency signals
    // (Shopify.currency, /meta.json, JSON-LD priceCurrency) require a
    // storefront shape this one does not have — that is a gap in what this
    // probe can see, not a finding that Zara's published GBP price is
    // wrong.
    //
    // ── The actor route, attempted 2026-08-20 — corrected the same day ──────
    // APIFY_TOKEN is live now, so this shop's own catalogue.sections[0] was
    // dispatched through scripts/apify-blob-probe.ts to test both retrieval
    // and the hydration-blob extraction hypothesis at once. This entry used
    // to describe run 32368679808 as sitting "in progress for 14+ minutes
    // with no result" and read it as a stall shared with John Lewis. Job
    // 96423941633's own log, read directly via the GitHub Actions API,
    // shows the render answered in 23 seconds and the job was cancelled
    // 2m04s after the step started — well inside, not past, a reasonable
    // watch window:
    //
    //     Rendering Zara: https://www.zara.com/uk/en/woman-beauty-perfumes-l1415.html?page=1
    //     rendered 2,924,033 bytes
    //     Next.js __NEXT_DATA__: not found   Nuxt __NUXT__: not found
    //     generic __PRELOADED_STATE__: not found  generic __INITIAL_STATE__: not found
    //     Apollo __APOLLO_STATE__: not found  React Server Components self.__next_f: not found
    //     No known hydration-blob marker found in this page.
    //     ##[error]The operation was canceled.
    //
    // So both questions this run was meant to answer are in fact answered,
    // not stalled: retrieval works (2.92 MB rendered, the largest of this
    // pass's four renders) and none of the six known hydration-blob markers
    // are present — a genuine negative, not a timeout. The "stall" was the
    // same client-side artifact John Lewis's and Superdrug's entries now
    // document: apifyActor.ts's `runOneActor` leaves an uncleared setTimeout
    // running for up to 285s after a fetch that wins its own race, which
    // keeps the CI step showing no new output long after the real answer is
    // already in the log, and this run was cancelled by hand inside that
    // dead window rather than left to exit on its own. "FREE plan" and
    // "actor tier" were the wrong things to blame; see John Lewis's entry
    // for the mechanism. Retrieval is now proven for this shop; extraction
    // remains open exactly as before, since a plain JSON-LD parser and every
    // known hydration-blob marker both come up empty, and this render's own
    // markup would need a shop-specific extractor to go further — not
    // pursued here.
    //
    // ── renderRefused, added 2026-08-26 ─────────────────────────────────────
    // The paragraph above is the actor tier, a real browser on a residential
    // IP, and it got through (2.92 MB, HTTP 200). scripts/catalogue-harvest.ts
    // has since defaulted to the free local renderer instead — same browser,
    // datacenter IP — and every real (non-budget-exhausted) attempt it has
    // made answers HTTP 403 at 325-331 bytes: four such attempts across
    // data/harvest-report.json commits on 2026-08-25 and 2026-08-26, none of
    // them the tiny-byte 2xx a JS challenge would produce. That is the
    // datacenter-vs-residential IP distinction localBrowser.ts's own header
    // names as the one thing this tier does not solve, caught here in the
    // one shop this registry can show both sides of directly. See
    // knownRenderRefusal in src/catalogue/renderRefusal.ts.
    //
    // Set to `'local'`, not `true`, as of 2026-09-01: the actor-tier
    // paragraph directly above is real evidence of a 2.92MB page actually
    // retrieved, the opposite of a refusal — only the free local renderer
    // has ever refused this shop, so only that tier should be skipped.
    renderRefused: 'local',
    enabled: true,
    adapter: 'headless',
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
    // searchUrlTemplate: the bare /uk/en/search page is confirmed to exist;
    // the ?searchTerm= param itself was only seen live on Zara's US mirror
    // (zara.com/us/en/search?searchTerm=) during the same search, not
    // queried directly against /uk/en/ here — kept for shape-consistency
    // with every other entry's required field, not asserted as measured.
    // ── Re-probed 2026-08-21 after the timer fix: retrieval and partial
    // ── extraction both work; whether anything is priced is still open ────
    // Item 18a of the 2026-08-20 backlog asked for exactly one thing: re-probe
    // this shop now that 16297ca has stopped a 23-second answer looking like a
    // hang. State probe run 32506369776, job 96847334075, 17:06Z, one rendered
    // page of woman-beauty-perfumes-l1415:
    //
    //     rendered 2,940,171 bytes
    //     JSON-LD blocks: 1; parseListings(): 7 listing(s)
    //     "£" price-shaped strings in the rendered markup: 0 (0 distinct)
    //     Script blocks carrying an id: 0
    //     ### RSC flight stream: no self.__next_f.push chunks
    //
    // Three things follow. Retrieval works and is not marginal — 2.9 MB, the
    // largest render this project has taken from any shop. The existing
    // parser does find product markup here, seven items of it, so this is not
    // a John Lewis-style "no schema.org anywhere" case and needs no
    // rendered-state reader; it is deliberately absent from
    // src/catalogue/renderedState.ts. And the page paints no £ string at all,
    // which for a UK storefront showing prices on every card means the price
    // is written some other way — a bare number with the currency stated
    // elsewhere, most likely — so whether those seven listings are *priced*
    // is precisely the question this run does not answer.
    //
    // That is the open item, and it is answerable free: `npm run harvest
    // --shop=zara --dry-run --allow-metered` reports parsed and priced
    // separately per section. The state probe now prints a priced count of its
    // own too, added in the same commit as this note for the next run. What is
    // ruled out already is the timer bug, a bot wall, an empty render, and any
    // need for a second extraction format here.
    //
    // ── Settled 2026-08-22: priced, not merely listed ───────────────────────
    // `npm run harvest --shop=zara --dry-run --allow-metered` was run first,
    // locally, with no APIFY_TOKEN in that environment: the free route alone
    // gets `https://www.zara.com/sitemap.xml: HTTP 403`, 0 urls, 0 priced —
    // the same IP-level refusal this entry already documents, and no answer
    // to the open question, exactly as expected without the metered tiers.
    //
    // So the state probe was re-dispatched with the priced-count line added
    // above. State probe run 32540501204, job 96949453791, 00:30Z, one
    // rendered page of woman-beauty-perfumes-l1415:
    //
    //     rendered 2,759,211 bytes
    //     JSON-LD blocks: 1; parseListings(): 8 listing(s), 8 priced —
    //         first: LOOK at 118.92
    //     "£" price-shaped strings in the rendered markup: 0 (0 distinct)
    //
    // All 8 listings this render's `parseListings()` found carry a price
    // (schema.org `offers.price`, read the same way as every other JSON-LD
    // shop). The page still paints no "£" string — the price is written as a
    // bare number with currency stated structurally, not visually — which is
    // exactly the "written some other way" this entry already predicted and
    // is why the £-scan reads zero while the parser reads eight priced. Zara's
    // catalogue is priced. This commit does not enable the shop: currency
    // confirmation (is the 118.92 actually GBP, not a mislabelled EUR from a
    // shared template) is the separate step this entry has always deferred,
    // and still is.
    catalogue: {
      searchUrlTemplate: 'https://www.zara.com/uk/en/search?searchTerm={q}',
      sections: [
        { id: 'women', label: "Women's fragrance", urlTemplate: 'https://www.zara.com/uk/en/woman-beauty-perfumes-l1415.html?page={page}', tier: 'designer' },
        { id: 'men', label: "Men's fragrance", urlTemplate: 'https://www.zara.com/uk/en/man-accessories-perfumes-l551.html?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 20, minRequestGapMs: 2000,
    },
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
    // Was `enabled: true` with zero listings — no route was ever wired, and
    // none could be established. Currency probe attempted twice, 2026-08-19,
    // roughly 11 minutes apart (run 32278174768 job 96150394516 at 16:50Z,
    // and run 32279193684 job 96153817539 at 17:01Z): both got "COULD NOT
    // ASK: robots.txt did not answer at https://lush.com" — no request was
    // ever made either time. Per this file's own standard for that failure
    // shape (see beauty-the-shop-uk and paco-perfumerias below), a repeat
    // like this reads as the shop refusing or rate-limiting this address
    // rather than a fluke, and the right response is to stop asking rather
    // than probe harder. This is a reachability finding, not a currency one
    // — LUSH's GBP pricing was never in doubt, unlike those two entries — so
    // this id is not added to CURRENCY_UNCONFIRMED. Disabled rather than
    // left dark: no route (Shopify, sitemap, proxied or headless) can be
    // evaluated when even robots.txt cannot be read. Re-enable only after a
    // probe run actually gets an answer from this domain.
    //
    // fragranceOnlyCatalogue is correctly NOT set here, per its own doc
    // comment in src/types/retailer.ts, which names LUSH specifically: it
    // sells bath and body products, and the concentration-word title test is
    // exactly what keeps soap out of a fragrance comparison. That stays true
    // regardless of this shop's reachability.
    //
    // ── Re-asked 2026-08-20, and the answer is sharper than before ──────────
    // Harvest probe run 16, job 96347765072, commit eb8bb05: robots.txt was
    // read this time, from www.lush.com rather than the bare lush.com the
    // earlier probes tried, and it permits. The sitemap does not:
    //
    //     https://www.lush.com/sitemap.xml: HTTP 403
    //
    // So this is no longer "we cannot even read robots.txt". It is a shop
    // that publishes crawl permission and then refuses the crawl, from this
    // network, at the first request. Both metered tiers were unavailable to
    // test against it (the Apify proxy fails everywhere, and the actor tier
    // needs `catalogue.sections`, which this entry has none of). Still
    // `enabled: false`, now for a measured refusal rather than for silence.
    enabled: false,
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
    //
    // ── The ordinary sitemap walk was pursued, 2026-08-20 ───────────────────
    // Harvest probe run 17, job 96347788808, commit eb8bb05. robots.txt read
    // and permitting; /sitemap.xml 404s but robots.txt names others and a
    // real product URL was discovered through them. Fetching it:
    //
    //     https://www.bathandbodyworks.co.uk/style/su468821/ah7419: HTTP 403
    //     stopped early: the shop began refusing requests
    //
    // So the sitemap walk is answered too: this shop publishes a sitemap,
    // permits crawling in robots.txt, and then 403s the product pages from
    // this network. That is a measured refusal at the page level, not an
    // untried route, and it is the reason this stays off.
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
        'than EDP/EDT in the main, worth confirming isFragrance actually recognises their ' +
        'listings — fragranceOnlyCatalogue is deliberately NOT set here, unlike a single-house ' +
        'storefront, precisely because this shop sells mostly non-fragrance body/bath product ' +
        'and the concentration-word title test is what keeps that out; see that field\'s own doc ' +
        'comment in src/types/retailer.ts, which names this shop specifically. Shipping probe, ' +
        'run 32279983083 job 96156214531, 2026-08-19T17:09Z: robots.txt still permits every ' +
        'request, but every candidate delivery path came back either 404 or a genuine server ' +
        'error (/pages/help: HTTP 500) — "0 pages UNREACHABLE". Not a robots.txt refusal this ' +
        'time, a live 500 from their own server; worth retrying rather than treating as settled.',
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
    // Currency probe (run 32256810054, job 96080315943, 2026-08-19): robots.txt
    // answers with no disallow, and the bare origin serves a sterling price
    // list — home 200, quotes GBP, no conversion applied — to a GitHub Actions
    // runner. /en-gb, /gb, /uk, /en-uk all 404 (this shop has no market-prefix
    // layout), and every other request shape (cookies, Accept-Language) agrees
    // with the origin at GBP. So currency is genuinely confirmed sterling from
    // CI, at the plain origin, with no market-pinning needed.
    //
    // What the same run ruled out: /products.json 404s at every address tried,
    // so this is not a Shopify storefront and shopifyStorefront stays unset.
    //
    // Shipping probe, run 32280695672 job 96158519562, 2026-08-19T17:17Z:
    // fetched the delivery page (3 pages, +6 footer links followed) and read
    // its own words — "UK Standard Delivery ~ £3.99 per order ~ ⭐ FREE with
    // Debenhams UNLIMITED" (https://www.debenhams.com/pages/informational/
    // delivery). £3.99 is the standard rate; UNLIMITED is a paid subscription
    // scheme, modelled as membershipPerk and never applied to the delivered
    // price, same treatment as every other membership scheme in this file. No
    // basket threshold is stated for non-members, so freeOverGbp stays null.
    //
    // Enabled on that: currency confirmed sterling, robots permits, not
    // Shopify, and now a real, sourced standard delivery cost — the same
    // basis bellavita-luxury/oud-arabian/lush already enable on with
    // catalogue: null and adapter: 'unknown', relying on crawlViaSitemap's
    // generic sitemap-discovery route (src/catalogue/sitemapCrawl.ts). No
    // category URL has been found or verified, so catalogue stays null;
    // unlike a standardGbp: null entry this does not need one to join
    // tests/registry.test.ts's "unstated" list, because it is not on it. The
    // Awin application from 2026-08-11 is still `pending`.
    //
    // ── That route was finally exercised, 2026-08-20, and it half-works ─────
    // This shop had been enabled for days without ever being attempted: the
    // harvest step's 60-minute cap landed mid-sweep every run and everything
    // after Emirates Oud in registry order was never asked (run 261, job
    // 96314578076). It is asked now — scripts/catalogue-harvest.ts sweeps
    // never-live shops first for exactly this reason — and here is what it
    // gets. Harvest probe run 5, job 96342208089, at 20 pages, and run 9,
    // job 96343533243, at 70:
    //
    //     Debenhams  741 urls  53 fetched  0 priced listings
    //     https://www.debenhams.com/sitemap.xml: HTTP 404
    //     fetched but nothing priced, e.g.:
    //       https://www.debenhams.com/categories/beauty-sale-fragrance
    //       https://www.debenhams.com/categories/beauty-mens-fragrance
    //       https://www.debenhams.com/categories/beauty-fragrance-parfum-mens
    //
    // Nothing is blocked. robots.txt reads and permits, the sitemaps it
    // names are served, and 741 genuine fragrance URLs come out of them. All
    // 53 pages fetched were *category* pages, and category pages carry no
    // schema.org Product node, so the walk spends its whole budget on aisle
    // signs rather than products.
    //
    // The cause is in the discovery pass, not in this shop.
    // crawlViaSitemap's `discover` keeps two sets — URLs whose own path
    // names a fragrance word, and URLs whose parent sitemap says it lists
    // products — and uses the second only when the first is empty. Debenhams
    // files its categories under /categories/beauty-*-fragrance, so the
    // first set is large and wrong, and the product URLs never get a turn.
    // Any retailer that names its aisles after fragrance has the same shape.
    //
    // Left `enabled: true` rather than switched off, deliberately: this is a
    // shop with confirmed sterling, permitted crawling, a sourced delivery
    // cost and 741 of its own URLs in hand, which is a route not yet aimed
    // properly rather than a shop that cannot be compared. Not fixed here —
    // reordering that discovery pass changes which URLs all 29 shops fetch,
    // which is not a change to make without a sweep to measure it against.
    enabled: true,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.99,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      membershipPerk: {
        scheme: 'Debenhams UNLIMITED',
        description: 'Paid subscription scheme advertised alongside the standard rate as giving free delivery.',
      },
      verifiedAt: '2026-08-19',
      confidence: 'confirmed',
      source: {
        url: 'https://www.debenhams.com/pages/informational/delivery',
        quote: 'UK Standard Delivery ~ £3.99 per order ~ ⭐ FREE with Debenhams UNLIMITED',
        readAt: '2026-08-19',
      },
      notes:
        'Read directly off the shop\'s own delivery page by shipping:discover, not searched for. ' +
        'No non-member spend threshold for free delivery is stated on the page, so freeOverGbp ' +
        'stays null rather than assumed.',
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
    // Currency probe (run 32254695358, job 96073578532, 2026-08-19): robots.txt
    // answers with no disallow. The bare origin quotes this US runner USD, but
    // the /en-gb market path — meta.json 200, home 200 — serves GBP at no
    // conversion: STERLING, confirmed, and specifically at that address, not
    // the origin. /gb and /uk 404, /en-uk answers but in EUR, so the market is
    // addressed by that one exact prefix rather than a general convention.
    //
    // Not confirmed Shopify: /en-gb/products.json 404s (as does every other
    // address tried), so this GBP reading comes from the theme/page, not a
    // products feed, and shopifyStorefront stays unset.
    //
    // ── The correctness trap, and what is now built for it ──────────────────
    // The plain origin quotes USD and /en-uk quotes EUR — a sitemap walk that
    // is not pinned to /en-gb could just as easily discover an off-locale
    // product URL and, since src/catalogue/jsonld.ts's price parser has no
    // priceCurrency check of its own, publish a dollar or euro figure as
    // pounds without anything noticing. `CatalogueConfig.requiredUrlPrefix`
    // now exists specifically for this (see its doc comment in
    // src/types/retailer.ts): when set, both the production harvest
    // (crawlViaSitemap in src/catalogue/sitemapCrawl.ts) and the diagnostic
    // probe (viaSitemap in src/catalogue/attempt.ts) seed discovery from
    // `/en-gb/sitemap.xml` and drop every discovered URL outside that prefix,
    // sitemap index or product alike. Both are unit-tested
    // (tests/sitemapCrawl.test.ts, tests/attempt.test.ts).
    //
    // What is NOT yet established is whether `/en-gb/sitemap.xml` actually
    // exists and lists real fragrance products — that is a fact about this
    // one shop's sitemap layout, not something a unit test can prove.
    // Shipping probe, run 32282115059 job 96163076612, 2026-08-19T17:32Z:
    // the delivery page was read and genuinely states no flat standard
    // charge ("NO RATE STATED"), so there is also no real delivery figure
    // that would let this join tests/registry.test.ts's "unstated" list on
    // its own. A catalogue-probe dispatch (probe_shop=niche-beauty-uk) was
    // queued this session at run 32279140837 to test the live sitemap, but
    // sat behind a ~70-minute scheduled harvest and had not completed by the
    // end of this session. Whoever picks this up next: read that run's log
    // first; if it shows real /en-gb-scoped listings, set
    // `catalogue: { ..., requiredUrlPrefix: '/en-gb' }` and enable.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-19',
      confidence: 'unverified',
      notes:
        'Read directly, not unread: shipping probe, run 32282115059 job 96163076612, ' +
        '2026-08-19T17:32Z, fetched niche-beauty.com\'s delivery page and confirmed it never ' +
        'names a flat standard charge — "NO RATE STATED". Applied via Awin 2026-08-11, still ' +
        'pending.',
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
    //
    // ── Evidence refreshed 2026-08-19 ────────────────────────────────────────
    // Currency probe, run 32257210189, job 96081595191: robots.txt answers
    // with no disallow, and /products.json returned a real Shopify payload
    // (Susanne Kaufmann bath/skincare lines this shop also carries) — so the
    // route this shop WOULD be harvested by, once its currency clears, is
    // confirmed Shopify. `shopifyStorefront: true` is set below on that
    // strength alone; it does not change `enabled`.
    //
    // The currency question is unchanged in substance and freshly confirmed in
    // detail. Every request shape settles EUR (rate 1.1869842 against the USD
    // this runner is quoted by default). Asked ?country=GB the theme LABELS
    // the price GBP, but the shop still settles EUR underneath at a computed
    // rate of 0.8729568 — a live Shopify-Markets conversion of the same euro
    // figure, not a second, genuine sterling price list. That is a different
    // mechanism from the Awin feed's fixed 1.3490 divisor recorded above (a
    // static factor baked into the feed export, not this storefront's own
    // per-request FX math), but the same fact about the shop: no GBP price
    // list independent of a euro one has ever been found here, by either
    // route. /gb, /uk, /en-uk still 404 — no market-prefix layout.
    enabled: false,
    adapter: 'affiliate-feed',
    shopifyStorefront: true,
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
    //
    // Currency probe (run 32257096463, job 96081230582, 2026-08-19): robots.txt
    // answers with no disallow, and the bare origin answers 200 — but no
    // candidate, of the nine tried, published any currency at all. No
    // Shopify.currency in the theme, no /meta.json, at any address (/en-gb,
    // /gb, /uk, /en-uk all 404 too). /products.json also 404s everywhere, so
    // this is not a confirmed Shopify storefront either. A genuinely silent
    // storefront, not a foreign-currency one — the honest reading is "unknown"
    // rather than "not sterling", and there is no route (Shopify or otherwise)
    // yet proven for this shop.
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
    // ── Currency + route, 2026-08-19 ───────────────────────────────────────
    // Currency probe, run 32277342412 job 96147763012, 2026-08-19T16:41Z:
    // confirmed Shopify (/products.json returns a real payload — the-dynamo-
    // deep-led-collagen-boosting-mask at 299.00, two Reena Simon candles at
    // 65.00 — at every address that answered) and confirmed sterling, but not
    // at the plain origin: the bare domain quotes this US runner USD settling
    // GBP at rate 1.35, and every cookie/header variant does the same. Only
    // `?country=GB` settles GBP at rate 1 with no conversion — meta.json 200,
    // home 200, and the identical three prices above served with no
    // conversion applied. STERLING, confirmed, specifically at that address.
    // `shopifyStorefront: true` below is set on that evidence, the same
    // ibraq/KAYALI basis: a real priceable Shopify payload, not just a theme
    // guess. The existing `resolveUkMarket` sweep in
    // `crawlViaShopifyProducts` already tries `?country=GB` on its own — see
    // `src/catalogue/shopifyProductsCrawl.ts` — so no further wiring was
    // needed to reach this address; the harvest asks the same way this probe
    // did. `catalogue: null` is fine as-is: the Shopify route never reads
    // `catalogue.sections`, and no category URL has been found or is needed.
    //
    // `enabled` stays false. Not for retrieval or currency any more — both
    // are now proven — but for the one question the 2026-08-19 Apify review
    // below raised and deliberately left open: Beauty Pie is a membership
    // retailer whose products are "priced at cost to members," and the
    // figures this probe read (including via the public, unauthenticated
    // `?country=GB` /products.json, so not gated behind a login) may be that
    // member price rather than a figure any visitor can act on without also
    // paying for membership. This probe did not read a product PAGE — only
    // the bulk variant feed — so it cannot settle whether the page discloses
    // a non-member price alongside it or requires membership to check out at
    // all. That is the one remaining blocker: read one live product page,
    // then decide.
    enabled: false,
    adapter: 'unknown',
    shopifyStorefront: true,
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
    // NOT AN APIFY CANDIDATE on the evidence gathered this review. `npm run
    // shipping:discover --shop=beauty-pie` (price-verify.yml run 32258830120,
    // job 96087143064) fetched two pages successfully — "2 pages, NO RATE
    // STATED", meaning the delivery page was read and simply never names a
    // flat standard charge, not that it was refused. The one path this run
    // did not fetch was skipped on principle, not by force:
    // `/cart/shipping_rates.json: disallowed by robots.txt — checkout
    // estimator not attempted` — a real Disallow rule, correctly respected,
    // exactly the "robots.txt is the answer" stance this project holds
    // everywhere else (see attempt.ts). Two ordinary pages fetched clean, one
    // path politely skipped on the site's own instruction: nothing here
    // reads as bot-defence. `catalogue: null` still means no confirmed
    // category URL exists — that prerequisite is unrelated to Apify and
    // applies to any adapter, free included — but this shop belongs with the
    // cheap free-route candidates, not this tier.
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
    // First real evidence gathered this review. A catalogue-daily.yml
    // workflow_dispatch (probe_shop=very) queued behind the day's scheduled
    // harvest and never got a runner in time — GitHub Actions keeps only one
    // pending run per concurrency group, so a second dispatch fired shortly
    // after cancelled it rather than queuing both. price-verify.yml's own
    // concurrency group is separate and was free, so
    // `npm run shipping:discover -- --shop=very` ran there instead (run
    // 32257812348, job 96083580395): `products.json` 404s (not Shopify),
    // and both the bare homepage and /policies/shipping-policy came back
    // HTTP 403. That is a genuine block, not silence — very.co.uk refuses a
    // datacentre address outright, the same shape as this file's other
    // confirmed Class-1 shops (Superdrug, Selfridges, Notino UK, The
    // Fragrance Shop, The Perfume Shop). `catalogue: null` still means no
    // confirmed category URL exists for the proxy or actor tier to target —
    // that has to come from a human opening the real site in a browser
    // first, the same step every other shop in this file went through —
    // but bot-defence status is no longer unestablished: it is confirmed,
    // by a real HTTP response, not assumed.
    //
    // very.co.uk is a general department store (electronics, furniture,
    // clothing) that also sells fragrance, the same shape as John Lewis —
    // worth comparing once real section URLs exist, since a large general
    // retailer's defence posture can still differ sharply from a specialist
    // beauty retailer's even when both 403 a bare homepage request.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'gorgeous-shop',
    name: 'Gorgeous Shop',
    domain: 'gorgeousshop.com',
    homepage: 'https://www.gorgeousshop.com',
    tiers: ['designer'],
    // Currency probe (run 32254790354, job 96073877400, 2026-08-19): robots.txt
    // itself answers (no disallow found), but every single request this
    // script knows how to make — the bare origin, all four market-prefix
    // paths, every cookie/header combination, ten candidates in total — came
    // back HTTP 403. Not a currency finding: the storefront refused all of
    // them outright, uniformly, which reads as bot-defence rather than a
    // route this project can fix by asking differently. APIFY CANDIDATE for
    // Group C — a plain HTTP client from a datacentre address is refused here
    // categorically; see AdapterStrategy 'proxied' / apifyActor.ts.
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
    // Currency probe run twice (run 32255421951 job 96075888273, and run
    // 32257346131 job 96082041201, both 2026-08-19): both attempts got
    // "COULD NOT ASK: robots.txt did not answer at https://beautyflash.co.uk"
    // — no request was even made, on either run, roughly 25 minutes apart.
    // Per the probe's own standard (see scripts/currency-probe.ts's header,
    // and how it treated escentual.com's own repeated robots.txt silence on
    // 2026-08-15), a repeated failure like this is read as the shop
    // rate-limiting or otherwise refusing this address rather than a fluke —
    // the answer is to leave it alone rather than probe harder. This is not a
    // currency finding either way. APIFY CANDIDATE for Group C: robots.txt
    // itself is unreachable to a plain datacentre client on two separate
    // attempts.
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
    // CURRENCY NOT CONFIRMED — see CURRENCY_UNCONFIRMED at the foot of this
    // file. Currency probe (run 32255905250, job 96077421762, 2026-08-19):
    // robots.txt answers (2s crawl-delay, honoured), and the bare origin
    // answers 200 — quoting this US runner USD, not GBP, and every other way
    // of asking (?country=GB, both cookies, Accept-Language en-GB) agrees at
    // USD. /en-gb, /gb, /uk, /en-uk all 404 — no market-prefix layout to try
    // instead. Not confirmed Shopify either: /products.json 404s at every
    // address. A .com domain quoting dollars by default is exactly the shape
    // this repo has learned to distrust (see escentual's history above) — the
    // difference here is nothing has yet found a GBP reading at all, at any
    // address, so unlike escentual there is no known way to ask for sterling.
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
    //
    // Currency probe run twice (run 32256970672 job 96080822225, and run
    // 32257466936 job 96082441277, both 2026-08-19, roughly 7 minutes apart):
    // both got "COULD NOT ASK: robots.txt did not answer at
    // https://beautytheshop.com" — no request was made either time. Per the
    // probe's own standard, a repeated failure like this reads as the shop
    // refusing or rate-limiting this address rather than a fluke; the right
    // response is to leave it alone rather than probe harder, not to treat it
    // as a currency finding. APIFY CANDIDATE for Group C: robots.txt itself is
    // unreachable to a plain datacentre client on two separate attempts.
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
    // Currency probe (run 32256242622, job 96078492089, 2026-08-19): robots.txt
    // answers with no disallow, and the bare origin serves sterling — home
    // 200, quotes GBP, no conversion — to a GitHub Actions runner. Every other
    // request shape (?country=GB, both cookies, Accept-Language) agrees at
    // GBP; /en-gb, /gb, /uk, /en-uk all 404 (no market-prefix layout). So
    // currency is genuinely confirmed sterling from CI, at the plain origin.
    //
    // Not confirmed Shopify: /products.json 404s everywhere tried, so
    // shopifyStorefront stays unset and there is no proven harvest route yet
    // — sitemap-discovery is the generic fallback and has not been run
    // against this shop. `enabled` stays false for that reason plus unread
    // shipping and a still-`pending` Awin application, not a currency doubt.
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
        'Read directly now, not just unread: shipping probe, run 32281096849 job 96159821825, ' +
        '2026-08-19T17:22Z, checked every candidate delivery-page path against ' +
        'perfumemarketuk.com and found none of them exist, with no footer link to one either — ' +
        '"NO PAGE FOUND", a genuine dead end on this shop\'s own site rather than an unread ' +
        'page. Still blocks enabling on the same standardGbp: null basis as before.',
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
    // CURRENCY NOT CONFIRMED — see CURRENCY_UNCONFIRMED at the foot of this
    // file. Currency probe (run 32256361673, job 96078874562, 2026-08-19):
    // robots.txt answers with no disallow, and the bare origin answers 200 —
    // but no candidate, of the nine tried, published any currency at all. No
    // Shopify.currency in the theme, no /meta.json, at any address (/en-gb,
    // /gb, /uk, /en-uk all 404 too). /products.json also 404s everywhere. A
    // .co.uk domain is not evidence of sterling pricing on its own (see
    // zimaya's entry below), and here the storefront is simply silent rather
    // than confirming anything — "unknown", not "not sterling", and no
    // harvest route (Shopify or otherwise) has been established.
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
    // Ambiguous first evidence, not a confirmed block. The catalogue-daily.yml
    // probe_shop dispatch queued behind the scheduled harvest and never got a
    // runner (same concurrency-slot issue noted on very.co.uk above), so
    // `npm run shipping:discover -- --shop=beauty-bay` ran via price-verify.yml
    // instead (run 32258017812, job 96084246448): verdict NO PAGE FOUND, and
    // critically *not* UNREACHABLE — this script's own verdict logic (see
    // scripts/shipping-discover.ts) only reaches UNREACHABLE when a fetch
    // actually errors, so a homepage fetch here did not error; none of the
    // script's guessed delivery-page paths matched a real one on
    // beautybay.com. `products.json` returned an HTML document, not JSON
    // ("Unexpected token '<', \"<!doctype \"..."), meaning either not
    // Shopify or a Shopify endpoint answering with a shell page rather than
    // the catalogue. That is meaningfully different from very.co.uk's clean
    // 403 on its own homepage: nothing here shows Beauty Bay refusing a
    // request outright. Read as "not yet shown to be bot-defended" rather
    // than "confirmed easy" — a direct plain fetch of the bare homepage and
    // robots.txt (which this run did not isolate on its own) is the next
    // concrete check, cheaper than Apify and worth doing before assuming
    // this belongs in the same tier as very.co.uk. `catalogue: null` still
    // means no confirmed category URL exists for any adapter regardless.
    catalogue: null,
    affiliate: { ...awinRequested() },
  },
  {
    id: 'fragrancedirect',
    name: 'Fragrancedirect',
    domain: 'fragrancedirect.co.uk',
    homepage: 'https://www.fragrancedirect.co.uk',
    tiers: ['designer'],
    // CURRENCY NOT CONFIRMED — see CURRENCY_UNCONFIRMED at the foot of this
    // file. Currency probe (run 32256534104, job 96079423648, 2026-08-19):
    // robots.txt answers with no disallow, and the bare origin answers 200 —
    // but no candidate, of the nine tried, published any currency at all. No
    // Shopify.currency in the theme, no /meta.json, at any address (/en-gb,
    // /gb, /uk, /en-uk all 404 too). /products.json also 404s everywhere. A
    // .co.uk domain is not evidence of sterling pricing on its own (see
    // zimaya's entry below) — this storefront is simply silent about its
    // currency rather than confirming anything, and no harvest route has been
    // established either.
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
    // Currency probe, run 32277974545 job 96149760375, 2026-08-19T16:48Z:
    // robots.txt answers with no disallow, and the bare origin serves
    // sterling — home 200, quotes GBP, no conversion — to a GitHub Actions
    // runner. Every other request shape (?country=GB, both cookies,
    // Accept-Language) agrees at GBP; /en-gb, /gb, /uk, /en-uk all 404 (no
    // market-prefix layout). So currency is genuinely confirmed sterling from
    // CI, at the plain origin, same shape as perfume-market-uk and debenhams.
    // Not Shopify: /products.json 404s at every address tried (matches the
    // Apify-evaluation comment below). `enabled` stays false: no proven
    // harvest route yet (sitemap-discovery is the generic fallback and has
    // not been run against this shop) and standardGbp is still null with no
    // known ingestion route to join the "unstated" list on — see
    // tests/registry.test.ts. Currency is no longer the gap; a route or a
    // real delivery figure is.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      // £3.95 taken as the standard rate, on the owner's reading: of the two
      // charges the page names, standard delivery is the cheaper and slower
      // tier and £9.95 is an express one. That is a judgement about UK retail
      // convention rather than a label the page supplies, so it is recorded as
      // inference here rather than passed off as a quotation.
      standardGbp: 3.95,
      // Deliberately still null, and this is the load-bearing half. The page
      // names four free-delivery thresholds — £30, £90, £100, £150 — with
      // nothing tying any of them to the standard tier, so pairing one with
      // £3.95 would be a guess in the one direction that actually hurts a
      // reader. Claiming free delivery from £30 when the real standard
      // threshold is £100 understates the delivered price, which sorts this
      // shop above shops that are genuinely cheaper — the exact failure the
      // delivered-price sort exists to prevent. A null threshold can only ever
      // overstate what delivery costs, which is the safe direction to be wrong
      // in, so it stays null until someone reads the page and can say which
      // threshold belongs to standard.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-19',
      confidence: 'unverified',
      source: {
        url: 'https://www.cultbeauty.co.uk/info/delivery-information',
        quote:
          'Delivery page names charges of £3.95 and £9.95, and free-delivery thresholds of £30, ' +
          '£90, £100 and £150, without labelling which pairing is standard.',
        readAt: '2026-08-19',
      },
      notes:
        'Read directly, not merely unread: shipping probe, run 32281470836 job 96161024104, ' +
        '2026-08-19T17:26Z, fetched the delivery page and found it genuinely ambiguous — two ' +
        'delivery charges (£3.95, £9.95) with no label saying which is standard, and four ' +
        'free-delivery thresholds (£30, £90, £100, £150), almost certainly standard and express ' +
        'tiers plus loyalty-scheme thresholds run together by the extractor. The £3.95 charge is ' +
        'now taken as standard by inference from UK retail convention (the cheaper, slower tier), ' +
        'which is enough to price delivery. The threshold is NOT inferred, because guessing it ' +
        'wrong understates the delivered price rather than overstating it. Read ' +
        "cultbeauty.co.uk's delivery page by hand to settle which threshold pairs with £3.95, " +
        'then set freeOverGbp and raise confidence.',
    },
    // ── Apify harvest evaluation, 2026-08-19 ──────────────────────────────
    // NOT AN APIFY CANDIDATE on the evidence gathered this review — hand this
    // one to whichever group takes the cheap free-route shops next, rather
    // than the bot-defended-majors tier. `npm run shipping:discover
    // --shop=cult-beauty-global` (price-verify.yml run 32258749428, job
    // 96086619048) fetched a real delivery page successfully: "1 pages, +1
    // links, AMBIGUOUS" — a genuine plain HTTP fetch reached the site, found
    // a footer link to a delivery page, and read it; only the actual rate
    // was unclear on the page, not the retrieval. `products.json` 404s (not
    // Shopify), but that is irrelevant to bot-defence. This is the opposite
    // finding from very.co.uk's clean 403 immediately above — nothing here
    // shows cultbeauty.co.uk refusing a datacentre address. `catalogue: null`
    // still means no confirmed category URL exists yet — that prerequisite is
    // unrelated to Apify and applies to any adapter — but designing a paid
    // retrieval tier for a shop with no evidence of needing one would be
    // exactly the mistake this review's own brief warned against.
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
    // CURRENCY NOT CONFIRMED — see CURRENCY_UNCONFIRMED at the foot of this
    // file. Currency probe (run 32256674382, job 96079949118, 2026-08-19):
    // robots.txt answers with no disallow, and the bare origin answers 200 —
    // but no candidate, of the nine tried, published any currency at all (no
    // Shopify.currency in the theme, no /meta.json). /en-gb, /gb, /uk, /en-uk
    // all 404, and so does /products.json at every address tried — so this is
    // not a confirmed Shopify storefront either, and there is no proven
    // harvest route yet. A genuinely silent storefront, not a foreign-currency
    // one.
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

  // ── Surfaced by Microsoft Shopping; a currency probe has since read it ──────
  {
    id: 'carethy',
    name: 'Carethy',
    // Taken from the shopping listing, which named the shop "Carethy.co.uk".
    // That is the only source for this domain — nobody has opened it in a
    // browser, so the `www.` on the homepage below is a convention, not
    // something observed. Confirm both before enabling.
    domain: 'carethy.co.uk',
    homepage: 'https://www.carethy.co.uk',
    // From the one listing seen: a Calvin Klein Eau de Parfum, which is
    // designer. Whether they carry niche or Middle Eastern houses is unknown,
    // so those tiers are not claimed.
    tiers: ['designer'],
    // Disabled, and it must stay that way until someone has actually read this
    // shop. In particular the currency is not established and this entry is
    // listed in CURRENCY_UNCONFIRMED at the foot of this file, which is the
    // lesson from nicchia-luxury-uk written down as data rather than as
    // regret: that shop went live with 4,032 listings on a `currency: 'GBP'`
    // nobody had checked, and the guard could not catch it because nobody had
    // added it to the list. A .co.uk domain is not evidence of sterling
    // pricing — uk.zimayaperfumes.com quotes dollars.
    //
    // Currency probe (run 32254829111, job 96074001578, 2026-08-19): robots.txt
    // answers with a 10s crawl-delay (honoured — this is why the probe step
    // took nearly 4.5 minutes), no disallow. The bare origin answers 200, but
    // no candidate, of the nine tried, published any currency at all — no
    // Shopify.currency, no /meta.json, at any address (/en-gb, /gb, /uk,
    // /en-uk all 404 too). /products.json also 404s everywhere. A genuinely
    // silent storefront: still no basis to leave CURRENCY_UNCONFIRMED, and now
    // also no confirmed harvest route (not Shopify).
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
    //   1. There is no legitimate way to read Amazon's prices without an
    //      approved API, and that API's own eligibility gate closes on
    //      itself — see the 2026-08-20 update below for what actually
    //      changed here and what did not. Scraping is the other route and is
    //      not one: it breaches their terms, and a price this project could
    //      not source or defend is the opposite of what every other entry in
    //      this file is for.
    //   2. The API's terms restrict how long a retrieved price may be
    //      retained and displayed. This repo stores prices at rest in
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
    //
    // ── Measured honestly, 2026-08-20, and the API status updated ──────────
    // The owner has now asked for Amazon four times, so this pass did two
    // things: attempted the shop exactly like every other retailer here, and
    // checked what actually happened to PA-API, which this entry had cited
    // as "scheduled for retirement 2026-05-15" — a date already past.
    //
    // What WebSearch found (sourced, not assumed): PA-API v5 did retire, on
    // schedule — Offers V1 went first, 2026-01-31, and the endpoint fully
    // retired 2026-05-15 after an 2026-04-30 recommended-migration date. Its
    // replacement is the Amazon Creators API, OAuth 2.0 rather than PA-API's
    // AWS-signature scheme, documented at
    // affiliate-program.amazon.com/creatorsapi. The eligibility gate did not
    // loosen — if anything it sharpened: an approved Creators account needs
    // at least 10 qualified Associates referral sales in the trailing 30
    // days to hold API access at all, checked continuously, not once at
    // signup, and access is suspended within days of falling below that
    // rather than revoked outright once you have ever cleared it. Blocker 1
    // above stands exactly as written, now against the Creators API instead
    // of PA-API: the API is still how you would build the thing that
    // produces the sales, so the gate still closes on itself. Blocker 2
    // needs re-reading against the Creators API's own current terms should
    // this ever get closer to attempted — nobody has done that yet either.
    // (Sources: affiliate-program.amazon.com/creatorsapi and its own
    // /docs page, both read via WebSearch snippets in this environment,
    // which still has no direct egress to open either page — see
    // docs/INGESTION.md.)
    //
    // The measurement: scripts/amazon-probe.ts (added this pass) treats
    // amazon.co.uk exactly like every other shop — robots.txt read and
    // obeyed literally, only permitted paths fetched, no escalation beyond
    // plain BROWSER_HEADERS. Run 32368003975, job 96422545919,
    // 2026-08-20T12:19:43Z:
    //
    //     https://www.amazon.co.uk/robots.txt: HTTP 200 — 93 disallow
    //         rules, 8 allow rules, 0 sitemaps. Neither /s nor any prefix of
    //         it is disallowed.
    //     https://www.amazon.co.uk/s?k=perfume:    PERMITTED — HTTP 503,
    //         1,427 bytes
    //     https://www.amazon.co.uk/s?k=fragrance:  PERMITTED — HTTP 503,
    //         1,427 bytes
    //
    // robots.txt permits the ordinary keyword-search page every visitor
    // uses. Amazon then refuses it anyway, at the HTTP layer, to a plain
    // browser-headers GitHub Actions request — a live technical block, not a
    // robots.txt refusal, and one this project's own rules do not permit
    // working around (no challenge bypass, no headless escalation beyond
    // what every other shop gets, and Boots' own entry is the record of
    // what that ceiling looks like when a shop actually holds it). No search
    // page was fetched successfully, so no product page was ever attempted
    // — the script refuses to construct a /dp/<ASIN> link rather than name
    // one it never actually saw. No price was read, stored, or invented.
    //
    // So: three independent blockers (API eligibility, retention terms,
    // multi-seller pricing) and now a fourth, purely technical one (the
    // one permitted path Amazon's own robots.txt names returns 503 to this
    // network). Nothing here supports enabling a route.
    //
    // ── Verified against Amazon's own pages, 2026-09-01 ─────────────────────
    // Owner asked, again, for a decision-ready answer: is there a lawful route
    // at all, and if so what exactly would it take. This pass had something
    // the 2026-08-19 and -20 passes did not — an environment that can actually
    // fetch affiliate-program.amazon.com and .co.uk directly, not just read
    // WebSearch snippets of them. Everything below is quoted from a page this
    // pass opened itself; nothing here is a search-result summary treated as
    // fact.
    //
    // Blocker 1, API eligibility — confirmed current, restated more precisely.
    // affiliate-program.amazon.com/creatorsapi/docs, fetched directly: "Have
    // at least 10 qualifying sales within the past 30 days to access the PA
    // API through the Creators API." Unchanged from the 2026-08-20 finding,
    // now read off Amazon's own page rather than inferred from a snippet. The
    // UK-specific route is real, not a US programme pressed into service:
    // affiliate-program.amazon.co.uk/creatorsapi redirects to Amazon's own
    // sign-in with assoc_handle=amzn_associates_gb, a GB-scoped handle. PA-API
    // v5's retirement is also confirmed from the source rather than a search
    // snippet: the old v5 docs URL now redirects to
    // .../creatorsapi/docs/en-us/paapiv5-deprecation, which states plainly
    // "The Amazon Product Advertising API 5.0 (PA-API 5) has been deprecated
    // and is being replaced by the Creators API," and that a v5 call now
    // returns HTTP 403 with "Product Advertising API is deprecated. Please
    // migrate to Creators API using the migration guide...". Consistent with
    // what 2026-08-20 found; no exact shutdown date was on this particular
    // page, so that earlier dated finding is not contradicted, just not
    // re-confirmed here.
    //
    // Worth being exact about what "closes on itself" means, because it is
    // not literally circular. Joining Associates is free and needs no API:
    // an approved Associate can place plain tagged text/image links
    // (SiteStripe) to amazon.co.uk with no price shown at all, and those
    // links' sales count toward the 10-in-30-days bar. So the real shape of
    // the gate is: this project could join Associates today, add "View on
    // Amazon" links with no price beside them, and would need to sustain ten
    // qualifying purchases through those links in every rolling 30-day window
    // before it could even apply for the API that would let it show a price.
    // That is a genuine, non-circular first step — and also a real traffic
    // and conversion bar this project has no evidence yet of being able to
    // clear, since it has no measured Amazon-directed traffic today.
    //
    // Blocker 2, retention/display terms — confirmed real, and now precise
    // rather than assumed. affiliate-program.amazon.com/help/operating/policies,
    // fetched directly, quoted exactly: "You may store other Product
    // Advertising Content that does not consist of images for caching
    // purposes for up to 24 hours, but if you do so you must immediately
    // thereafter refresh and re-display the Product Advertising Content by
    // making a call to Creators API, PA API or retrieving a new Data Feed."
    // Images are stricter — no caching at all, only a link, also capped at 24
    // hours. A timestamp must sit next to any displayed price with the exact
    // wording "Product prices and availability are accurate as of the
    // date/time indicated and are subject to change," unless the display is
    // refreshed hourly. One carve-out: "Individual ASINs...may be retained
    // indefinitely until the license terminates" — the identifier, not the
    // price or content attached to it.
    //
    // The conflict this entry already named is real: data/catalogue/*.json
    // holds prices at rest indefinitely and demo/priceHistory.generated.ts
    // exists specifically to keep a price-history timeline, both flatly
    // incompatible with a 24-hour cache-then-refresh-or-purge rule. It goes
    // further than a missing cron job, too. This repo's own rule is never to
    // rewrite published history, and git is an append-only store — so once an
    // Amazon-sourced price lands in a tracked file, `git log` keeps it
    // retrievable forever regardless of what the live page later shows,
    // which is itself indefinite retention of licensed content. A compliant
    // design could not commit amazon-uk's fetched rows to a tracked file the
    // way the harvest does for every other retailer: no
    // data/catalogue/amazon-uk.json snapshot, no priceHistory.generated.ts
    // line, a live/short-cache-only fetch path instead, a visible timestamp
    // plus Amazon's exact disclaimer text next to every price, no cached
    // image, and only the ASIN persisted anywhere. That is a different
    // product for this one retailer than every other row in this file gets,
    // not a config flag — worth weighing on its own before deciding this is
    // worth pursuing at all.
    //
    // Blocker 3, multi-seller pricing — checked, not resolved. Older PA-API
    // documentation describes the API returning one "BuyBox winner" offer per
    // item when one exists, rather than every seller's price — which, if
    // still true of the Creators API, would hand this project the one number
    // it needs the way every other retailer's page already does. That claim
    // could not be confirmed here from a primary source: the legacy docs
    // pages that describe it now 403 or redirect straight to the deprecation
    // notice above, and no equivalent page was found and fetched for the
    // current Creators API. Left open rather than claimed, in the spirit this
    // file already treats an unread page.
    //
    // Also checked: whether Amazon UK runs through any network feed this
    // project could apply to the way it already does for Awin (see
    // src/catalogue/awinFeed.ts) — no. Amazon Associates/Creators is Amazon's
    // own direct, in-house channel; nothing found puts amazon.co.uk's general
    // catalogue on Awin, Rakuten, Partnerize or Tradedoubler, consistent with
    // this entry's own `affiliate.network: 'direct'`. The nearest adjacent
    // thing, CJ Affiliate's "Amazon Sellers" programme
    // (junction.cj.com/article/publishers-now-have-access-to-amazon-sellers-in-cj,
    // fetched directly), is not a substitute: it is a partnership, via
    // PartnerBoost, giving access to roughly 800 individually-enrolled
    // third-party sellers' own catalogues ("Amazon sellers from Europe and
    // North America," 400,000+ products) — not Amazon's own retail catalogue,
    // and a fundamentally different shape than one feed per retailer: it
    // would mean thin-slicing "Amazon UK" into hundreds of individual seller
    // relationships, each answering blocker 3 by making it worse, not better.
    //
    // Blocker 4, the 503 to the one robots.txt-permitted path — not re-tested
    // this pass. Out of scope for a check about the lawful route, and
    // touching it again would mean re-probing amazon.co.uk's own defences,
    // which this project does not do. Left exactly as measured 2026-08-20.
    //
    // The answer the owner asked for: no lawful route is available today.
    // Nothing above supports flipping `enabled`, and nothing was added toward
    // one — no adapter, no credentials, no secret names guessed ahead of an
    // account that does not exist. If this is ever pursued anyway, the
    // concrete sequence, in order, is:
    //
    //   1. Join Amazon Associates UK, free, at
    //      https://affiliate-program.amazon.co.uk/, registering this site's
    //      own domain as the property.
    //   2. Build nothing API-shaped yet. Add plain SiteStripe-tagged "View on
    //      Amazon" links with no price displayed — these need no API access
    //      and are the only lawful way to earn qualifying sales before any
    //      API application exists.
    //   3. Sustain at least 10 qualifying Associates sales in every trailing
    //      30-day window (completed, un-returned, properly tagged purchases —
    //      Amazon's own definition). Access to apply does not open before
    //      this is demonstrated, and per the docs above it is checked on a
    //      rolling basis afterwards too, not just once.
    //   4. Once that bar is being cleared, apply for Creators API access at
    //      https://affiliate-program.amazon.co.uk/creatorsapi and follow the
    //      credential setup the console shows at that point. The exact
    //      credential/secret field names sit behind that login and were not
    //      guessed here — read them from the console once the account exists
    //      rather than from this comment.
    //   5. Add the resulting credentials as GitHub Actions secrets only once
    //      they exist. Do not pre-add placeholder secret names.
    //   6. Before writing any adapter, re-read the Creators API's full
    //      current licence (not just the caching clause quoted above) and
    //      confirm with the owner explicitly that a live-only, non-historical
    //      Amazon row — no committed snapshot, no price-history line, a
    //      visible per-price timestamp and disclaimer — is an acceptable
    //      product before building it, since it is not what this file gives
    //      any other retailer.
    //   7. Resolve blocker 3 only once the API can actually be called: what
    //      GetItems/GetOffers returns for a multi-seller listing is testable,
    //      not researchable, from outside an approved account.
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
    // networks this account already uses — confirmed 2026-09-01 by reading
    // Amazon's own operating-policies and Creators API docs pages directly
    // (see the dated comment block above); no network-distributed feed for
    // it was found. `verified: false` stays exactly that: this account has
    // still never applied or signed in, so nothing about signup itself —
    // as opposed to the publicly-readable policy pages — has been confirmed
    // from here.
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
    // Enabled 2026-08-20 on the owner's direct instruction ("Add Fragrance
    // Hub (priority retailer)"), and the gates genuinely pass: sterling and
    // the Shopify route are CI-proven above, robots permits, and the shipping
    // block's £90 free-delivery threshold was read off the shop's own policy
    // page. The paragraph that used to sit here held it back for having no
    // confirmed affiliate programme — reasoning several enabled entries in
    // this file never had applied to them (kayali, zara and the mideast
    // houses all ship with NO_AFFILIATE_YET), which the 2026-08-19 audit
    // flagged as inconsistent. Links resolve to the plain retailer URL until
    // a programme exists, exactly as they do for every other unaffiliated
    // shop here.
    enabled: true,
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
      verifiedAt: '2026-08-30',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://www.fragrancehub.co.uk/policies/shipping-policy',
        quote: 'FREE SHIPPING FOR ORDERS OVER £90',
        readAt: '2026-08-30',
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

  // ── 2026-08-20: department stores and a fashion retailer, named by the
  // owner or found while looking for what they named ─────────────────────
  {
    id: 'harrods',
    name: 'Harrods',
    domain: 'harrods.com',
    homepage: 'https://www.harrods.com/en-gb',
    tiers: ['designer', 'niche'],
    // Named by the owner directly ("Harrods ... called out for niche
    // perfume"), added 2026-08-20 from WebSearch snippets of harrods.com
    // alone — this sandbox has no egress, so no page here has actually been
    // opened. /en-gb/perfume is the general fragrance department (Chanel,
    // Dior, Tom Ford, CREED among the houses named in search results);
    // Salon de Parfums (harrods.com/en-gb/c/departments/salon-de-parfums) is
    // a distinct in-store-and-online section of 25 hand-selected niche
    // houses — Bond No. 9, Xerjoff, Roja Parfums, Henry Jacques were named —
    // which is why both tiers are claimed rather than just one.
    //
    // Currency probe, run 98, job 96415230154, 2026-08-20T11:52Z: every one
    // of the nine ways of asking got HTTP 403 on both the theme's meta
    // signal and the bare page — origin, /en-gb, /gb, /uk, /en-uk, both
    // cookies, ?country=GB-shaped and Accept-Language en-GB alike. A clean,
    // uniform block rather than a mixed result, the same shape this
    // registry already has for Selfridges (see its own entry above,
    // "Live spike... HTTP 403 from a datacentre IP before any markup was
    // served. Bot mitigation, not a parsing problem."). Nothing about
    // currency was established either way — a 403 answers nothing — so this
    // stays on CURRENCY_UNCONFIRMED, now for a different, harder reason than
    // "unread": what has been read is a refusal.
    //
    // ── 2026-09-01: audited for a legitimate ingestion route — none found ────
    // Six real requests, two tools, one shape. WebFetch and a direct curl (a
    // real browser User-Agent, this sandbox's own egress) both hit
    // harrods.com/robots.txt itself and got HTTP 403 before any body came
    // back — so even the robots file, the thing a crawler is supposed to
    // read *before* deciding anything, cannot be read here. The same 403
    // repeated identically on /sitemap.xml, /products.json (a Shopify-
    // convention probe — a shop that *is* Shopify answers this with JSON;
    // this got the same refusal as everything else, so it is uninformative
    // rather than a "no"), /en-gb/perfume (the fragrance category page),
    // /en-gb/become-an-affiliate and /en-gb/i-need-help/delivery. This
    // project's own harvest tooling reproduces it independently:
    //
    //     npx tsx scripts/catalogue-harvest.ts --dry-run --shop=harrods --max=10
    //       Harrods   0 urls   0 fetched   0 priced listings  (1 errors)
    //           https://www.harrods.com/sitemap.xml: HTTP 403
    //
    // Six for six, refused before a single byte of markup, exactly the
    // "bot mitigation, not a parsing problem" shape the 2026-08-20 currency
    // probe above already found and this reconfirms with a different tool.
    // Platform cannot be established from a 403: no BuiltWith-style report
    // or public source naming Harrods' storefront stack (Shopify, Salesforce
    // Commerce Cloud, commercetools or otherwise) turned up on a targeted
    // WebSearch either, so that stays unknown too, not "ruled out".
    //
    // Awin: checked and ruled out, not just unresearched. A WebSearch for
    // "Harrods Awin affiliate programme merchant profile" surfaced several
    // ui.awin.com/merchant-profile/{id} links, but following two of them
    // (23108, 20851) shows neither is Harrods — 23108 is a dead profile
    // (HTTP 404) and 20851 is Innermost, a nutrition brand. The search hits
    // were false positives, not a genuine listing. This project's only
    // affiliate-feed ingestion code is Awin's (src/catalogue/awinFeed.ts),
    // so `adapter: 'affiliate-feed'` is not available here regardless of
    // what follows below.
    //
    // Multiple independent third-party affiliate-directory aggregators
    // (uppromote.com, two separate FlexOffers pages for "Harrods (UK)" and
    // "Harrods (US)", admitad.com, getlasso.co, affilitizer.com) instead
    // consistently name Partnerize and Rakuten Advertising (formerly
    // LinkShare) as Harrods' actual affiliate networks, tracked since May
    // 2024 with a UK-specific Partnerize programme reported live from
    // January 2026. Deliberately NOT written into the `affiliate` field
    // below the way Selfridges' Partnerize finding was: that one rested on
    // a named trade-press article (PerformanceIN); this one is aggregator
    // directories only, harrods.com/en-gb/become-an-affiliate itself 403s
    // here so no primary source could be read, and the aggregators
    // disagree with each other on the cookie window (one says "up to 20
    // days", others say "30-day cookie") — an internal contradiction, not
    // just staleness. Recorded here as a lead for the owner, not as a
    // confirmed programme. It would not open a route by itself even if
    // confirmed: this codebase has no Partnerize or Rakuten feed-ingestion
    // code, only awinFeed.ts.
    //
    // The free local-browser render tier (src/catalogue/localBrowser.ts)
    // was considered and deliberately not attempted. Its own header states
    // its limit plainly: it changes the render, not the address, and "a
    // shop that refuses datacenter traffic will refuse this too". Every 403
    // measured above came back before any markup at all, on the first
    // connection, the exact IP-level-refusal shape that module says it does
    // not solve — and it only ever fires for a retailer with a real
    // `catalogue.sections` list (scripts/catalogue-harvest.ts's render
    // step), which this entry deliberately does not have, because no
    // Harrods URL could be verified to resolve to anything but the same
    // refusal. Inventing section URLs just to feed the render tier would
    // mean guessing at addresses this pass could not confirm, which is
    // exactly what task rule 4's "real section URLs you verified resolve"
    // forbids.
    //
    // The tier that actually got Selfridges and John Lewis past an
    // identically-shaped block — the Apify actor, on a residential IP — has
    // never been run against Harrods: no `harrods` key exists anywhere in
    // data/strategy-memory.json, and this sandbox holds neither
    // `APIFY_TOKEN` nor `APIFY_PROXY_PASSWORD` to run one now. Whether it
    // clears this block, and if so whether the result carries JSON-LD, a
    // hydration blob (as Selfridges' RSC stream did), or nothing at all, is
    // open and cannot be settled without a real credential and a real run —
    // not guessed at here.
    //
    // Conclusion: no legitimate ingestion route currently exists for this
    // shop. Not Awin (checked), no proven crawl route (blocked six for six,
    // robots.txt included), no feed-integrated affiliate network, and the
    // one tier that has beaten this exact block shape elsewhere has never
    // been run here for real. Stays enabled: false, adapter: 'unknown',
    // catalogue: null, affiliate unchanged. The delivery page 403'd too
    // (see above), so the shipping block below is untouched rather than
    // guessed at — same standing rule as fragrancehub's and every other
    // `unverified` entry in this file.
    //
    // ── A second, fresh pass, 2026-09-01 (later the same day) — still nothing ─
    // Three angles the audit above did not try, none of them a repeat of it:
    //
    //   1. Harrods' own tech-stack partnerships (WebSearch: "product data
    //      feed API partner integration"). Turned up EDI via TrueCommerce
    //      (B2B supplier onboarding, not a price/catalogue feed), an SAP
    //      Integration Suite writeup (internal platform migration, nothing
    //      public), and a Farfetch "Black & White Solutions" white-label
    //      partnership. That last one looked genuinely promising — Farfetch
    //      runs its own marketplace with real affiliate/API routes — so it
    //      was chased directly (WebFetch, retaildive.com's own coverage):
    //      confirmed private backend technology only ("Harrods will
    //      continue to manage marketing, brand relationship and product
    //      strategy"), not a Farfetch storefront listing. No public feed or
    //      API is mentioned anywhere in that partnership's own coverage.
    //   2. A Google Merchant Center-style public XML/RSS product feed,
    //      hosted separately from the WAF-fronted main site the way some
    //      shops expose one for Shopping ads. No such feed URL surfaced on a
    //      targeted search; nothing here found one to fetch or would have
    //      fetched it if found — Google Merchant feeds are generally
    //      access-controlled to Google itself, not published for public
    //      reuse, so this would not have been a real route even located.
    //   3. Affiliate networks the first pass's aggregator sources did not
    //      name: CJ Affiliate/Commission Junction and Skimlinks/Sovrn.
    //      Searched directly rather than assumed absent. Confirmed CJ is
    //      NOT one of Harrods' networks; Rakuten Advertising is reconfirmed
    //      as the primary one (consistent with the first pass). Skimlinks
    //      surfaced as a secondary, indirect route, but it is a link-
    //      monetization layer that rewrites outbound links after the fact —
    //      it carries no product or price data feed, so it could not feed
    //      this project's catalogue even in principle, independent of the
    //      fact that this codebase has no Skimlinks ingestion code either
    //      (only src/catalogue/awinFeed.ts, per the paragraph above).
    //
    // Nothing here changes the conclusion. The concrete next step remains
    // exactly what the audit above already named: the Apify actor tier's
    // residential-proxy render, the one route this project has never tried
    // against Harrods and the one that has cleared an identically-shaped
    // datacenter-IP block for Selfridges and John Lewis elsewhere in this
    // registry. It needs a real APIFY_TOKEN and a real run this sandbox has
    // neither — not evaded, not guessed at, left for whoever has the
    // credential to actually spend one page finding out.
    //
    // ── 2026-09-02: the owner has EXCLUDED the Apify route. So: nothing. ─────
    // Both passes above end by naming the Apify residential-proxy render as
    // "the concrete next step" and "the one route never tried". The owner has
    // now ruled that route out. Every conclusion above therefore has to be
    // re-read without its escape hatch, and what is left is not "blocked
    // pending a credential" — it is that this shop has no available route at
    // all.
    //
    // One further look, for routes neither earlier pass tried, and confined to
    // things that are not evasion of the WAF: an official partner or data
    // feed, a syndication arrangement, or a public dataset.
    //
    //   1. A NON-WAF HOST. The plainest untried idea, and the one most likely
    //      to have worked: both passes above only ever asked www.harrods.com,
    //      and a WAF is often scoped to the storefront host alone. Probed
    //      eleven hosts directly. `www.harrods.com` 403 (795 bytes),
    //      `images.harrods.com` 403 (372 bytes), `harrods.com` 301 to www —
    //      and the rest (media, press, about, careers, api, static, assets, m)
    //      do not resolve to anything this sandbox can connect to at all.
    //      No host on this estate answers.
    //   2. partnerships.harrods.com — a genuinely separate host, surfaced by
    //      search as "Luxury Brand Marketing with Harrods Partnerships", and
    //      exactly the kind of primary source both passes above wanted and
    //      could not reach (the first pass could only cite aggregator
    //      directories for Partnerize/Rakuten, and flagged that they
    //      contradict each other on the cookie window). It 403s too, 378
    //      bytes, on both a direct request with a desktop Safari user agent
    //      and WebFetch. So the affiliate network still cannot be
    //      primary-sourced, for the same reason as everything else.
    //   3. A NON-GB LOCALE. If the block were geo-scoped, another locale's own
    //      path would answer. /en-us/become-an-affiliate: 403, 836 bytes.
    //      /en-gb/affiliate-pages, a different path from the /become-an-
    //      affiliate the first pass tried: 403, 826 bytes. The block is
    //      site-wide across hosts, locales and paths, not scoped to the GB
    //      storefront.
    //   4. AN OFFICIAL PUBLIC FEED OR API. Searched specifically for one
    //      ("public product data feed OR developer API OR open data catalogue
    //      partner"). None exists. What that search does surface about
    //      Harrods' data is cio.com's own writeup of an internal product hub
    //      feeding its POS and eCommerce site — an internal system, never a
    //      published resource. The only "Harrods API" that exists anywhere is
    //      a third-party Apify actor built to scrape the site, which is both
    //      the excluded route and a scraper rather than an official feed.
    //
    // Conclusion, and it is a different one from the two passes above: with
    // Apify excluded, Harrods has NO available route. Not a blocked one, not
    // one pending a credential — none. Every retrieval path is refused
    // site-wide before a byte of markup, on every host, locale and path tried;
    // the affiliate networks that aggregators name (Partnerize, Rakuten) still
    // cannot be primary-sourced because the pages that would confirm them are
    // behind the same block, and neither has feed-ingestion code here in any
    // case (only src/catalogue/awinFeed.ts, and Awin was ruled out by
    // following the merchant-profile ids in 2026-09-01's audit); no official
    // feed, API or public dataset exists; and no partner or syndication
    // arrangement carries the catalogue anywhere public (Farfetch's Black &
    // White deal was chased in the second pass and is private backend
    // technology).
    //
    // What would change this is not another search. It is either the owner
    // reinstating the Apify route, or joining Harrods' affiliate programme
    // through whichever network actually runs it and this project growing the
    // ingestion code for that network — both owner decisions, neither
    // available here. `enabled: false` stays, and it is now the accurate
    // description of the shop's position rather than a holding state.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet describes "complimentary UK delivery on orders
      // over £100", but that is marketing copy read secondhand, not a
      // shipping:discover run against Harrods' own delivery page — see
      // fragrancehub's entry above for the same distinction — so the figure
      // is named here, not stored as freeOverGbp. Still true as of
      // 2026-09-01: harrods.com/en-gb/i-need-help/delivery returned HTTP 403
      // when checked directly (see the dated comment above), so this has
      // still never been read from the shop's own page.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from harrods.com itself: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. The £100 free-delivery figure above and the ' +
        'brand list in the tiers comment both come from WebSearch result snippets, quoted as ' +
        'far as they go and no further. No affiliate programme runs through Awin (checked and ' +
        'ruled out 2026-09-01); aggregator sources point at Partnerize/Rakuten instead but are ' +
        'not primary-sourced — see the dated comment above for the full audit.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'next',
    name: 'Next',
    domain: 'next.co.uk',
    homepage: 'https://www.next.co.uk',
    tiers: ['designer'],
    // Named by the owner directly. Added 2026-08-20 from WebSearch snippets
    // of next.co.uk/beauty/fragrance and next.co.uk/shop/beauty/fragrance
    // alone — no page opened, this sandbox has no egress. A fashion
    // retailer with a real, dedicated fragrance department: designer brands
    // named in results include Hugo Boss, Jean Paul Gaultier, Jimmy Choo,
    // Tom Ford, Prada, Dolce & Gabbana, Gucci and Rabanne, alongside Next's
    // own house fragrance line — multi-brand, so no singleBrandOnly (unlike
    // Zara and Avon below, which sell only their own name).
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from next.co.uk itself: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. Search snippets mention "next day delivery" as ' +
        'an available express option but state no standard flat rate or free-delivery ' +
        "threshold, so neither field is filled from a marketing claim the way fragrancehub's " +
        "£90 or Harrods' £100 were. No affiliate programme has been researched.",
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'avon',
    name: 'Avon',
    domain: 'avon.uk.com',
    homepage: 'https://avon.uk.com',
    tiers: ['designer'],
    singleBrandOnly: 'Avon',
    // Named by the owner directly. Added 2026-08-20 from WebSearch snippets
    // of avon.uk.com/collections/fragrance and related category pages alone
    // — no page opened, this sandbox has no egress. Every fragrance named
    // in results (Far Away, Little Black Dress, Attraction) is an Avon
    // house line rather than a third-party designer brand, the same
    // structure as Zara's own-name perfume line above, so singleBrandOnly
    // is set on that basis rather than assumed from the "direct-sales"
    // reputation alone.
    //
    // The URLs surfaced by search follow a /collections/ path shape —
    // avon.uk.com/collections/fragrance, /collections/womens-perfume — the
    // same shape Bloom Perfumery, Les Senteurs and Perfume Direct below all
    // show too, which was suggestive of a Shopify storefront but, on its
    // own, only a pattern in search-result URLs rather than a read of
    // /products.json. That has since been read directly:
    //
    // Currency probe, run 102, job 96416797227, 2026-08-20T11:58Z: the bare
    // origin and five of the other eight ways of asking (?country=GB, both
    // cookies separately, both together, Accept-Language en-GB) all answered
    // meta 200 / home 200, quoting AND settling GBP at rate 1 — no
    // conversion anywhere. /en-gb, /gb, /uk, /en-uk all 404, expected of a
    // single-market store (the same shape Zimaya's entry documents).
    // Removed from CURRENCY_UNCONFIRMED at the foot of this file on that
    // evidence. The same run read /products.json and got a real Shopify
    // payload back at every address — three priced rows
    // (her-wisdom-sim-sim-whipped-oil-body-cream at 9.60,
    // her-wisdom-sim-sim-indulgent-glow-bath-and-shower-oil at 10.00,
    // her-wisdom-sim-sim-caring-skin-and-hair-perfume-mist at 8.40; none of
    // the three sampled happen to be fragrance, which says nothing about
    // whether the collections named above carry any) — so
    // `shopifyStorefront` is set below rather than left unset. `adapter`
    // stays 'unknown': no harvest has actually run against this shop yet,
    // and nothing here proposes enabling it on a currency-and-route reading
    // alone.
    // Enabled 2026-08-20: the owner named this shop directly ("include avon
    // on perfumes"), and its probe cleared the same bar kayali and
    // fragrancehub were enabled on the same week — sterling at rate 1 on six
    // of nine request shapes AND a real Shopify /products.json payload (run
    // 102, job 96416797227; recorded in full above). Single-brand storefront,
    // so its offers surface on brand and fragrance pages only, per the
    // singleBrandOnly rules. Delivery rate unstated -> the unstated-delivery
    // allowlist in tests/registry.test.ts, same as fragrancehub.
    enabled: true,
    adapter: 'unknown',
    shopifyStorefront: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet describes "Free delivery available on orders over
      // £25", marketing copy read secondhand rather than a shipping:discover
      // run against Avon's own delivery page, so the figure is named here
      // and not stored as freeOverGbp.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Delivery terms have not been read from avon.uk.com itself, only its checkout currency ' +
        'and Shopify route (see the comment above this entry). The £25 free-delivery figure ' +
        'above comes from a WebSearch result snippet, quoted as far as it goes and no further. ' +
        'No affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'sephora-uk',
    name: 'Sephora UK',
    domain: 'sephora.co.uk',
    homepage: 'https://www.sephora.co.uk',
    tiers: ['designer', 'niche'],
    // Added 2026-08-20 from WebSearch snippets of sephora.co.uk/fragrances
    // alone — no page opened, this sandbox has no egress. Launched in the
    // UK 17 October 2022 (per a Woman & Home piece surfaced in results) at
    // this exact domain, "over 300 makeup, fragrance, skin & hair brands",
    // both mass designer houses (Chanel, Dior, Tom Ford named) and niche
    // indie brands (Kayali named) in the one storefront — hence both tiers.
    //
    // Currency probe, run 99, job 96416155239, 2026-08-20T11:56Z: every one
    // of the nine ways of asking got meta 404 / home 403, uniformly across
    // origin, /en-gb, /gb, /uk, /en-uk, both cookies, ?country=GB and
    // Accept-Language en-GB. Same shape as Harrods' entry above — a clean
    // refusal, not a mixed reading — and nothing about currency was
    // established either way. Stays on CURRENCY_UNCONFIRMED for that reason
    // rather than "unread".
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from sephora.co.uk itself: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. A search snippet mentions "free delivery & ' +
        'returns for all My Sephora Members" — a loyalty-scheme perk, not a standard-delivery ' +
        'figure, and the membership caveat this registry already applies to Boots Advantage and ' +
        'Superdrug Beautycard applies here too, so nothing is recorded from it. No affiliate ' +
        'programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'space-nk',
    name: 'Space NK',
    domain: 'spacenk.com',
    homepage: 'https://www.spacenk.com/uk',
    tiers: ['niche'],
    // Added 2026-08-20 from WebSearch snippets of spacenk.com/uk/fragrance
    // alone — no page opened, this sandbox has no egress. Space NK's own
    // help centre (help.spacenk.com) states in as many words that
    // "www.spacenk.com is the only genuine and legitimate website for Space
    // NK" and warns of fraudulent lookalikes — worth recording given how
    // many near-miss domains turned up for Bloom Perfumery below. Prestige/
    // niche houses named in results: Byredo, Maison Margiela, Diptyque.
    // British retailer, founded 1991; acquired by US-based Ulta Beauty in
    // July 2025 per a Wikipedia snippet — noted because a change of
    // ownership is exactly the kind of event that can move a storefront's
    // settlement currency, so this was not assumed to still behave as a
    // purely-British operation just because the shop itself is. It was
    // checked instead of assumed:
    //
    // Currency probe, run 100, job 96416323928, 2026-08-20T11:57Z: the bare
    // origin and six of the other eight ways of asking (/uk, ?country=GB,
    // both cookies separately, both together, Accept-Language en-GB) all
    // answered HTTP 200 and quoted GBP with no conversion — STERLING. /en-gb,
    // /gb and /en-uk 404, which reads as this shop simply not using that
    // market-path shape rather than a refusal (the ones that do resolve all
    // agree). Removed from CURRENCY_UNCONFIRMED at the foot of this file on
    // that evidence. Not a confirmed Shopify storefront, though: every
    // address tried for /products.json 404'd in the same run, so
    // `shopifyStorefront` stays unset and `adapter` stays 'unknown' — the
    // currency question is answered, the ingestion route is not, and
    // nothing here proposes enabling this shop on a currency reading alone.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet describes "free delivery over £25 on their UK
      // site", marketing copy read secondhand rather than a
      // shipping:discover run against Space NK's own delivery page, so the
      // figure is named here and not stored as freeOverGbp.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-24',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://www.spacenk.com/uk/shipping',
        quote: 'FREE UK STANDARD DELIVERY on all orders over £25',
        readAt: '2026-08-24',
      },
      notes:
        'Delivery terms have not been read from spacenk.com itself, only its checkout currency ' +
        '(see the comment above this entry). The £25 free-delivery figure above comes from a ' +
        'WebSearch result snippet, quoted as far as it goes and no further. No affiliate ' +
        'programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'house-of-fraser',
    name: 'House of Fraser',
    domain: 'houseoffraser.co.uk',
    homepage: 'https://www.houseoffraser.co.uk',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch snippets of
    // houseoffraser.co.uk/beauty/perfumes alone — no page opened, this
    // sandbox has no egress. British department-store chain, part of
    // Frasers Group, 22 UK/Ireland locations per a Wikipedia snippet; the
    // site itself now brands its pages "FRASERS" in the page titles search
    // returned, though the domain and the shop name it trades under are
    // still houseoffraser.co.uk / House of Fraser. Designer houses named
    // in results: Paco Rabanne, Marc Jacobs, Dolce & Gabbana, Gucci, Calvin
    // Klein, BOSS.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from houseoffraser.co.uk itself: not its delivery terms, ' +
        'not its robots.txt, not its checkout currency. No delivery figure of any kind turned ' +
        'up in the WebSearch snippets read for this entry, so nothing is recorded even as a ' +
        'marketing-copy caveat. No affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'marks-and-spencer',
    name: 'Marks & Spencer',
    domain: 'marksandspencer.com',
    homepage: 'https://www.marksandspencer.com',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch snippets of
    // marksandspencer.com/l/beauty/womens-perfume and
    // marksandspencer.com/l/beauty/discover alone — no page opened, this
    // sandbox has no egress. Sells its own house fragrance lines (Studio,
    // Discover, Apothecary — a Grazia piece said Discover sold "over one
    // million bottles" in the first three months of 2026 alone) alongside
    // third-party designer brands named in results (Estée Lauder, Clinique,
    // L'Occitane), so this is multi-brand and no singleBrandOnly is set,
    // unlike Avon above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from marksandspencer.com itself: not its delivery terms, ' +
        'not its robots.txt, not its checkout currency. No delivery figure of any kind turned ' +
        'up in the WebSearch snippets read for this entry. No affiliate programme has been ' +
        'researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'les-senteurs',
    name: 'Les Senteurs',
    domain: 'lessenteurs.com',
    homepage: 'https://www.lessenteurs.com',
    tiers: ['niche'],
    // Added 2026-08-20 from WebSearch snippets of
    // lessenteurs.com/collections/fragrance alone — no page opened, this
    // sandbox has no egress. Describes itself (per search results) as
    // "London's oldest independent perfumery"; physical shop at 71
    // Elizabeth Street, SW1W 9PJ, online at online@lessenteurs.com. Niche
    // houses named in results: Parfum d'Empire, Thomas de Monaco, Dusita,
    // Tauer, Papillon, Cloon Keen — an independent specialist rather than a
    // department store, which is the category the owner's brief asked for
    // beyond the named retailers.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet describes "free UK delivery on orders over £150",
      // marketing copy read secondhand rather than a shipping:discover run
      // against the shop's own delivery page, so the figure is named here
      // and not stored as freeOverGbp.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from lessenteurs.com itself: not its delivery terms, not ' +
        'its robots.txt, not its checkout currency. The £150 free-delivery figure above comes ' +
        'from a WebSearch result snippet, quoted as far as it goes and no further. No affiliate ' +
        'programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'bloom-perfumery',
    name: 'Bloom Perfumery',
    domain: 'bloomperfume.co.uk',
    homepage: 'https://bloomperfume.co.uk',
    tiers: ['niche'],
    // Added 2026-08-20 from WebSearch snippets alone — no page opened, this
    // sandbox has no egress. Domain chosen deliberately: search turned up
    // bloomperfume.co.uk, bloomperfume.com, bloomperfumery.shop,
    // bloomperfumeshop.shop, getbloomperfumery.shop and
    // visitbloomperfume.shop all describing the same Covent Garden shop —
    // the kind of domain sprawl this registry has already seen turn out to
    // be genuinely fraudulent (see Space NK's entry above, whose own help
    // centre warns of exactly this pattern). bloomperfume.co.uk is the one
    // used for its actual account pages in results
    // (bloom@bloomperfume.co.uk as the contact address, /pages/about and
    // /pages/new-store as real subpages) and matches the shop's own Covent
    // Garden business listings, which is the basis for treating it as
    // canonical rather than guessed — not a guarantee, since nothing here
    // has actually been opened. Independent niche perfumery, 4 Slingsby
    // Place, London WC2E 9AB; houses named in results: Etat Libre d'Orange,
    // Ormonde Jayne, Imaginary Authors.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from bloomperfume.co.uk itself: not its delivery terms, ' +
        'not its robots.txt, not its checkout currency. No delivery figure of any kind turned ' +
        'up in the WebSearch snippets read for this entry. No affiliate programme has been ' +
        'researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'shy-mimosa',
    name: 'Shy Mimosa',
    domain: 'shymimosa.co.uk',
    homepage: 'https://www.shymimosa.co.uk',
    tiers: ['niche'],
    // Added 2026-08-20 from WebSearch snippets of
    // shymimosa.co.uk/perfume-shop/ alone — no page opened, this sandbox
    // has no egress. Independent niche perfumery boutique in Bristol, both
    // a physical shop and an online store; houses named in results: Le
    // Galion, Mendittorosa Odori d'Anima, Marc-Antoine Barrois, and its own
    // Shy Mimosa house line alongside them — multi-brand, so no
    // singleBrandOnly.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet gave a specific figure — "Delivery price for
      // orders under £100.00 is £4.99" — more precise than the "free over
      // £X" lines this entry's siblings carry, but it is still a WebSearch
      // snippet rather than a shipping:discover read of the shop's own
      // delivery page, so it is named here rather than stored.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from shymimosa.co.uk itself: not its delivery terms, not ' +
        'its robots.txt, not its checkout currency. A WebSearch snippet stated "Delivery price ' +
        'for orders under £100.00 is £4.99" — quoted as far as it goes and no further, and not ' +
        'promoted to standardGbp/freeOverGbp on the same basis as every other entry added ' +
        'today. No affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'perfume-price',
    name: 'Perfume Price',
    domain: 'perfumeprice.co.uk',
    homepage: 'https://www.perfumeprice.co.uk',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch snippets alone — no page opened, this
    // sandbox has no egress. A registered UK company (PERFUMEPRICE.CO.UK
    // LTD, Companies House number 09965068, per a gov.uk search result),
    // which is a stronger legitimacy signal than most entries added today
    // get. Describes itself as fragrance-only, discount designer bottles
    // (Gucci, Calvin Klein, Dior named in results). Trustpilot reviews
    // (5,593 considered, per the snippet) read as largely positive; a
    // Reviews.io snippet for the same shop reads less favourably, with
    // historical complaints about product quality and delivery — both
    // recorded here rather than only the flattering one.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      // A search snippet describes "free delivery over £25", marketing copy
      // read secondhand rather than a shipping:discover run against the
      // shop's own delivery page, so the figure is named here and not
      // stored as freeOverGbp.
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-29',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://www.perfumeprice.co.uk/delivery-and-returns',
        quote: 'FREE TRACKED DELIVERY OVER £25',
        readAt: '2026-08-29',
      },
      notes:
        'Nothing here has been read from perfumeprice.co.uk itself: not its delivery terms, ' +
        'not its robots.txt, not its checkout currency. The £25 free-delivery figure above ' +
        'comes from a WebSearch result snippet, quoted as far as it goes and no further. No ' +
        'affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'perfume-direct',
    name: 'Perfume Direct',
    domain: 'perfumedirect.com',
    homepage: 'https://www.perfumedirect.com',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch snippets of
    // perfumedirect.com/collections/all and perfumedirect.com/pages/about-us
    // alone — no page opened, this sandbox has no egress. Founded 2018 in
    // Manchester, UK, per its own About page snippet; also trades through a
    // Superdrug Marketplace storefront, which is a different retailer
    // relationship from the direct site this entry describes. Designer
    // houses named in results: Jimmy Choo, Calvin Klein, Montblanc, Dolce &
    // Gabbana, Mugler, Hugo Boss, Paco Rabanne, Issey Miyake, Prada.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from perfumedirect.com itself: not its delivery terms, not ' +
        'its robots.txt, not its checkout currency. Search snippets mention "fast UK delivery" ' +
        'without a rate or a free-delivery threshold, so neither field is filled from a ' +
        'marketing claim. No affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'tesco',
    name: 'Tesco',
    domain: 'tesco.com',
    homepage: 'https://www.tesco.com',
    tiers: ['designer'],
    // The first supermarket in this registry, and it arrives with a
    // distinction that has to be made before any price of theirs is ever
    // shown, because getting it wrong misattributes both the price and the
    // delivery terms to a company that set neither.
    //
    // ── Two different shops share this domain ────────────────────────────────
    // The owner pasted https://www.tesco.com/shop/en-GB/products/326671463
    // (their copy carried stkn/msclkid/gclid/tw_adid/utm_* click-ids from a
    // live ad session; every query parameter is stripped here and nothing
    // but the canonical path is written down — see the note below about what
    // that path is worth anyway).
    //
    // A /shop/en-GB/products/{id} address is Tesco MARKETPLACE, not Tesco.
    // Marketplace is Tesco's third-party selling programme, running on
    // Mirakl — the same platform B&Q, Screwfix, Currys and Superdrug use —
    // where approved outside sellers list alongside Tesco's own range. Read
    // from WebSearch summaries of Which?'s and lovemoney's coverage of the
    // launch and from Mirakl's own description of how a Mirakl shop works
    // (no page opened; this sandbox has no egress). Three facts from that
    // reading decide the question:
    //
    //   - the seller sets the price, not Tesco;
    //   - the seller charges its own separate delivery fee and dispatches
    //     the item itself, separately from any Tesco shop;
    //   - Tesco's own terms disclaim responsibility for delivery, returns,
    //     refunds and complaints on Marketplace items.
    //
    // This registry models exactly one shipping policy per retailer and
    // attributes every listing to the named shop. A Marketplace listing
    // breaks both halves at once: it would show a third party's price under
    // Tesco's name and price it with Tesco's delivery terms, which do not
    // apply to it. That is the same class of error as a foreign-currency
    // price published as sterling — a number that is real somewhere and
    // wrong here. So /shop/ is out of scope for this entry permanently, and
    // not merely unproven. If this ever changes, it changes because
    // Retailer grows a way to say "this offer is a marketplace offer, sold
    // and delivered by someone else", which it does not have.
    //
    // Tesco's OWN fragrance range is a different matter and is why this
    // entry exists at all. It sits under
    // /groceries/en-GB/shop/health-and-beauty/perfumes-aftershaves-and-gift-
    // sets/ and its men's counterpart under
    // /groceries/en-GB/shop/health-and-beauty/men's-toiletries/aftershave-
    // and-men's-fragrances/. Those are Tesco's prices under Tesco's own
    // grocery delivery, which is the comparable thing. Search summaries name
    // Calvin Klein, Hugo Boss, Police and Armaf in it, so it is designer
    // stock and not only body sprays. Note that /groceries/ has its own
    // /shop/marketplace/ subtree, which is Marketplace again wearing a
    // grocery URL and is excluded on the same grounds.
    //
    // ── Why it is off ────────────────────────────────────────────────────────
    // Nothing about tesco.com has been read from tesco.com. Not its
    // robots.txt, not its checkout currency, not its delivery terms, not
    // whether any of those category pages publish product JSON-LD a fetch
    // could parse. The category paths above come from WebSearch result URLs
    // and titles alone. Enabling on that would be enabling on a famous name,
    // which is the exact mistake Nicchia Luxury's entry above records.
    //
    // ── Measured 2026-08-20, and it did not get far ──────────────────────────
    // Harvest probe --dry-run --shop=tesco --max=10, run 32389888196 job
    // 96493168477, 2026-08-20T16:05:00Z, commit 071bbb7:
    //
    //   Tesco   0 urls   0 fetched   0 priced listings  (1 errors)
    //       https://www.tesco.com/sitemap.xml: HTTP 504
    //
    // robots.txt itself was read — the harvest prints a loud "robots.txt
    // could not be read" block when it cannot, and printed none, and a URL
    // it considered disallowed would never have been fetched. So Tesco's
    // robots.txt permits /sitemap.xml and the file behind it gateway-timed
    // out. Only one root was tried, which means robots.txt declared no
    // Sitemap: line of its own for the walk to prefer.
    //
    // A 504 is the server saying "not now" rather than "not you", so this
    // is a route that has not been shown to fail so much as one that has not
    // yet answered. Nothing about currency, delivery or JSON-LD was learned.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. So a priced
    // listing proves a price was found and parsed, and says nothing whatever
    // about which currency it is in. That is why this entry stays in
    // CURRENCY_UNCONFIRMED regardless of the count above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from tesco.com itself: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. Tesco grocery delivery is slot-booked rather ' +
        'than a flat per-order rate, which is a shape this model has no field for, so no figure ' +
        'is entered even provisionally. Separately, the delivery terms on a Tesco Marketplace ' +
        "item are the third-party seller's and not Tesco's at all — see this entry's comment " +
        'above for why that route is excluded outright. No affiliate programme has been ' +
        'researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'asda',
    name: 'Asda',
    domain: 'groceries.asda.com',
    homepage: 'https://groceries.asda.com',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Asda sells fragrance online through
    // two separate storefronts on two subdomains, which is the first thing
    // anyone crawling it has to decide between:
    //
    //   groceries.asda.com  the grocery shelf — /shelf/fragrance/womens-
    //                       fragrance/1818823464 and asda.com/groceries/
    //                       toiletries-beauty/make-up-nails/fragrance/
    //                       mens-fragrances both surfaced in search results
    //   direct.asda.com     George at ASDA — /george/collections/fragrance/
    //                       D28M8,default,sc.html and its men's/women's
    //                       siblings, whose result snippets name Calvin
    //                       Klein and Hugo Boss
    //
    // `domain` is set to the grocery side because that is Asda-the-
    // supermarket, which is what was asked for, and because George's
    // ",default,sc.html" URL shape is a Demandware/Salesforce Commerce
    // catalogue address rather than a plain path. Which of the two actually
    // yields parseable listings is unmeasured; if the George side turns out
    // to be the one that answers, this field is where that gets recorded.
    //
    // ── Measured 2026-08-20, and the failure is ours, not Asda's ─────────────
    // Harvest probe --dry-run --shop=asda --max=10, run 32390519099 job
    // 96495258488, 2026-08-20T16:11:05Z, commit 59f60a9:
    //
    //   Asda   0 urls   0 fetched   0 priced listings  (2 errors)
    //       https://www.groceries.asda.com/sitemap.xml: HTTP 0
    //       [patient] https://www.groceries.asda.com/sitemap.xml: HTTP 0
    //
    // Look at the host. crawlViaSitemap builds its conventional root as
    // `https://www.{domain}/sitemap.xml`, and this entry's domain is already
    // a subdomain, so it asked www.groceries.asda.com — which does not
    // exist. HTTP 0 is a connection that never completed, twice, including
    // once at the 60-second patient timeout, which is what a nonexistent
    // host looks like. This is the identical shape recorded in
    // catalogue-harvest.ts's own header for uk.shopfrenchavenue.com and
    // uk.zimayaperfumes.com.
    //
    // So NOTHING has been measured about Asda: not its robots.txt policy
    // beyond the file being readable, not its sitemap, not whether its pages
    // carry JSON-LD. Recording this as "Asda refuses us" would be recording
    // our own bug as a fact about a shop, which is precisely the mistake
    // this file keeps having to undo. What it needs is a probe against a
    // host that exists — either groceries.asda.com without the www, or
    // direct.asda.com for the George storefront.
    //
    // ── That probe was then run, and Asda does refuse us ─────────────────────
    // Currency probe, run 32391415231 job 96498178427, 2026-08-20T16:20:37Z,
    // commit 64edae7. scripts/currency-probe.ts builds its origin as
    // `retailer.domain` with any leading `www.` stripped, so it asked the
    // host that actually exists — groceries.asda.com — which is exactly the
    // gap the harvest probe above could not cover.
    //
    // robots.txt was reachable (the script exits early with its own message
    // when it is not, and instead ran all ten candidates). Every one of the
    // ten — bare origin, /en-gb, /gb, /uk, /en-uk, ?country=GB, both
    // localisation cookies separately and together, Accept-Language en-GB —
    // returned HTTP 403 for both the homepage and /meta.json. Ten for ten.
    //
    // So this is now a finding about Asda rather than about our URL
    // building: the storefront refuses this client at the edge, on the
    // correct host, whatever it is asked. No currency was published because
    // no document was served. Same bracket as Boots and Superdrug above, and
    // like them the open question is whether a residential IP or a real
    // browser gets through — neither has been tried here.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. So a priced
    // listing proves a price was found and parsed, and says nothing whatever
    // about which currency it is in. That is why this entry stays in
    // CURRENCY_UNCONFIRMED regardless of the count above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from any Asda domain: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. Grocery delivery is slot-booked rather than a ' +
        'flat per-order rate — the same shape problem recorded on the Tesco entry — so no ' +
        'figure is entered. George at ASDA on direct.asda.com may well have a flat parcel rate; ' +
        'nobody has read it. No affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'sainsburys',
    name: "Sainsbury's",
    domain: 'sainsburys.co.uk',
    homepage: 'https://www.sainsburys.co.uk',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Two generations of URL turned up in
    // the same search, which matters for anything that has to still resolve
    // next month:
    //
    //   /gol-ui/groceries/beauty-and-cosmetics/fragrances/c:1018916 and
    //   /gol-ui/groceries/beauty-and-cosmetics/fragrances/for-her/c:1018914
    //   and .../mens-grooming/shaving-and-beard-care/aftershave/c:1018981
    //     — the current Groceries Online UI, category-id addressed
    //
    //   /webapp/wcs/stores/servlet/gb/groceries/... ?krypto=<long opaque
    //   blob>&ddkey=...
    //     — a WebSphere Commerce legacy address carrying a signed, expiring
    //       "krypto" parameter. Deliberately NOT recorded as a catalogue URL
    //       anywhere: it is session-scoped, it is exactly the kind of
    //       parameter this repo strips rather than commits, and an entry
    //       point that expires is not an entry point.
    //
    // "gol-ui" is a client-rendered application, on the evidence of the name
    // and the id-in-path routing, which would put this shop in the same
    // bracket as Boots/Selfridges/John Lewis/Zara above — reachable, but with
    // no schema.org JSON-LD for parseListings to read. That is a suspicion
    // from a URL shape, not a measurement, and is written here as one.
    //
    // ── Measured 2026-08-20: refused ─────────────────────────────────────────
    // Harvest probe --dry-run --shop=sainsburys --max=10, run 32390533846
    // job 96495305455, 2026-08-20T16:11:18Z, commit 59f60a9:
    //
    //   Sainsbury's   0 urls   0 fetched   0 priced listings  (1 errors)
    //       https://www.sainsburys.co.uk/sitemap.xml: HTTP 403
    //
    // robots.txt was read and named no sitemap of its own; the conventional
    // path 403s. Note this says nothing either way about the gol-ui
    // client-rendering suspicion recorded above — the walk never got as far
    // as a product page to find out whether one carries JSON-LD. Two
    // separate unknowns, and only the outer one has been touched.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. So a priced
    // listing proves a price was found and parsed, and says nothing whatever
    // about which currency it is in. That is why this entry stays in
    // CURRENCY_UNCONFIRMED regardless of the count above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        "Nothing here has been read from sainsburys.co.uk itself: not its delivery terms, not " +
        'its robots.txt, not its checkout currency. Grocery delivery is slot-booked rather than ' +
        'a flat per-order rate, so no figure is entered. No affiliate programme has been ' +
        'researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'morrisons',
    name: 'Morrisons',
    domain: 'groceries.morrisons.com',
    homepage: 'https://groceries.morrisons.com',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. The most encouraging of the grocers
    // on URL shape alone, for two reasons.
    //
    // First, it has individually addressable product pages of the form
    // /products/{slug}/{numeric id} — search results returned
    // /products/paco-rabanne-pour-homme-aftershave-lotion/113683477 and
    // /products/joop-homme-aftershave/106199290 — which is the shape a
    // sitemap walk can enumerate and a JSON-LD parser can read one at a time.
    // Asda's and Sainsbury's fragrance results were category listings only.
    //
    // Second, those two products are Paco Rabanne and Joop!, i.e. real
    // designer bottles rather than gift sets and body sprays, and a third
    // named in the same results is Davidoff Cool Water. A supermarket that
    // stocks only Lynx duos is not a price source for this site; this one is
    // not that.
    //
    // Categories seen: /categories/toiletries-beauty/gifting-fragrances/
    // aftershave-fragrances-for-him/180870 (numeric) and
    // .../perfume-fragrances-for-her/8eb91d51-126d-4a61-9a95-cf77e083a6f1
    // (uuid). Two id schemes in one category tree is worth noting before
    // anyone writes a URL template against it.
    //
    // ── Measured 2026-08-20: the only grocer here with a working route ───────
    // Harvest probe --dry-run --shop=morrisons --max=10, run 32390450886 job
    // 96495029195, 2026-08-20T16:11:13Z, commit 59f60a9:
    //
    //   Morrisons   182 urls   10 fetched   10 priced listings  (1 errors)
    //       https://www.groceries.morrisons.com/sitemap.xml: HTTP 403
    //       sample priced URL: https://groceries.morrisons.com/products/
    //         vitfix-magnesium-effervescent-citrus/115826347
    //
    // Read carefully, that error is ours and the result is theirs.
    // crawlViaSitemap always tries `https://www.{domain}/sitemap.xml` as a
    // conventional root (see its own code), which for a domain that is
    // already a subdomain becomes www.groceries.morrisons.com — a host that
    // 403s. It still found 182 product URLs, which can only have come from
    // the Sitemap: lines in this shop's own robots.txt, so robots.txt was
    // read, it named its sitemaps, and every URL the walk wanted was
    // permitted. Ten of those pages were fetched and all ten yielded a
    // parseable price, which means this storefront publishes product
    // schema.org JSON-LD on a plain server-side fetch — the thing Boots,
    // Selfridges, John Lewis, Superdrug and Zara above all fail to do.
    //
    // The sample is a magnesium supplement rather than a fragrance because
    // the walk is unscoped: it enumerates the whole grocery catalogue. That
    // is a `catalogue.requiredUrlPrefix` / sections question, not a
    // retrieval one.
    //
    // ── Currency: one reading, and less than it sounds ───────────────────────
    // Currency probe, run 32390810738 job 96496199287, 2026-08-20T16:14:18Z,
    // commit 59f60a9. Six of the ten ways of asking — the bare origin,
    // ?country=GB, both localisation cookies separately and together, and
    // Accept-Language en-GB — each returned "quotes GBP, settles nothing,
    // rate —", i.e. a sterling figure with no conversion named anywhere, and
    // the script's own verdict line was "PASS: sterling price list served to
    // origin". /en-gb, /gb, /uk and /en-uk all 404, as expected of a
    // single-market grocer.
    //
    // What that reading actually is matters. /meta.json 404s and there is no
    // Shopify.currency in the theme, so the GBP came from
    // parseShopCurrency's last resort: a bare `"currency":"GBP"` match
    // anywhere in the homepage HTML (src/catalogue/shopifyJson.ts). That is
    // a real signal from the shop's own page and it is not a product's
    // priceCurrency. The product page passed to the probe —
    // /products/paco-rabanne-pour-homme-aftershave-lotion/113683477, taken
    // from a WebSearch result — returned HTTP 404 through all six addresses,
    // so the JSON-LD reading this needed was never taken. Whether that URL
    // is stale or the host refuses that request shape is unknown.
    //
    // ── Currency: confirmed 2026-08-21, on a resolving product page ──────────
    // Currency probe, run 32503927947 job 96839718465, 2026-08-21T16:38:34Z,
    // --product=https://groceries.morrisons.com/products/
    // vitfix-magnesium-effervescent-citrus/115826347 — the harvest's own
    // sample priced URL above, and a genuinely different, resolving address
    // from the paco-rabanne URL that 404'd on 2026-08-20. This time the
    // JSON-LD reading was taken: "page 3.5 GBP" through every one of the six
    // ways of asking that reached the page, alongside the same
    // origin-quotes-GBP market-address signal as before. A resolving product
    // page naming its own priceCurrency is exactly the smaller, narrower gap
    // the note above asked for, so the reading stands on the strong evidence
    // this time, not the weak homepage one. Removed from CURRENCY_UNCONFIRMED
    // below on that evidence and enabled.
    //
    // ── Affiliate: a lead, and not a good enough one to write into config ────
    // A WebSearch for a Morrisons programme returned listings on several
    // third-party affiliate directories (FlexOffers, Skimlinks, VigLink,
    // FMTC, Cuelinks among them) naming a "Morrisons Grocery" programme, and
    // summaries describing it as running on FlexOffers and Tradedoubler with
    // commission restricted to new customers above a basket threshold.
    // Nothing there is Awin, Rakuten, Impact or CJ, and none of it was read
    // on a network's own page — affiliate directories carry stale and
    // second-hand programme data as a matter of course. `affiliate` below
    // therefore stays NO_AFFILIATE_YET rather than claiming a network this
    // registry has no shape for and nobody has confirmed.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. That is why the
    // 10-of-10 count above did not by itself clear this entry — the currency
    // note above did that separately.
    //
    // sitemapHarvestConfirmed is set on the same basis as the note above:
    // a real, measured crawlViaSitemap pass with 10-of-10 priced listings
    // (run 32390450886 job 96495029195), the riiffs/perfumeo shape that
    // tests/registry.test.ts's "unstated delivery" allowlist requires a real
    // ingestion route on record for. The `www.` prefix bug the same comment
    // above blamed for this entry's one harvest error was fixed separately
    // (see sitemapCrawl.ts and its own commit) and is not re-measured here.
    enabled: true,
    adapter: 'unknown',
    sitemapHarvestConfirmed: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-29',
      confidence: 'confirmed',
      standardRateNotPublished: true,
      source: {
        url: 'https://groceries.morrisons.com/content/delivery-pass-content-page',
        quote: '£5 off your first 3 fast orders with code: 5firstnow *min spend £30',
        readAt: '2026-08-29',
      },
      notes:
        'Nothing here has been read from groceries.morrisons.com itself: not its delivery ' +
        'terms, not its robots.txt, not its checkout currency. Grocery delivery is slot-booked ' +
        'rather than a flat per-order rate, so no figure is entered. No affiliate programme has ' +
        'been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'ocado',
    name: 'Ocado',
    domain: 'ocado.com',
    homepage: 'https://www.ocado.com',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Has a genuine general fragrance
    // category rather than only home fragrance:
    // /categories/health-beauty-personal-care/fragrance/11e8eb7a-b47d-4ac1-
    // a686-9e1ae4b2aeee, whose result summary names Burberry, Hugo Boss,
    // Jimmy Choo and Calvin Klein. Separately carries an M&S-at-Ocado
    // homeware/beauty tree (/categories/m-s/...), which is M&S stock sold by
    // Ocado — note marks-and-spencer already exists as its own entry above,
    // so anything harvested here would need care not to be double-counted
    // against that one as if two shops were competing.
    //
    // Ranked below Morrisons despite the better brand list because no
    // individually addressable product URL surfaced at all — every Ocado
    // result was a category page with a uuid — and a category-only site is
    // the case a sitemap walk handles worst.
    //
    // ── Measured 2026-08-20, and the result is genuinely ambiguous ───────────
    // Harvest probe --dry-run --shop=ocado --max=10, run 32390552445 job
    // 96495373910, 2026-08-20T16:11:33Z, commit 59f60a9:
    //
    //   Ocado   0 urls   0 fetched   0 priced listings
    //
    // No error line, and the shop's whole step ran in under 0.2 seconds.
    // Zero errors is the unusual part: every other refusal in this batch
    // left an HTTP status behind. crawlViaSitemap skips a robots-disallowed
    // URL with a bare `continue` and records nothing at all (sitemapCrawl.ts
    // line 257), so "permitted nothing we asked for" is the reading that
    // fits both the silence and the speed — no fetch of any sitemap could
    // have completed in that time.
    //
    // It is not the only reading. A sitemap that fetched instantly and
    // listed no product URLs would look identical in this log. Distinguishing
    // them needs a run that prints the robots verdict itself, which
    // scripts/currency-probe.ts does and which has not been dispatched for
    // this shop. Recorded as unresolved rather than written up as a refusal.
    //
    // ── Partly resolved the same day: a challenge, not a refusal ─────────────
    // Currency probe, run 32391500310 job 96498456655, 2026-08-20T16:22:02Z,
    // commit 665ebb6. robots.txt was reachable, and all ten ways of asking
    // got the homepage back as HTTP 202 — Accepted, not OK. A 202 on a
    // document request is the signature of a bot challenge or interstitial
    // served in place of the page, which is a different thing from the 403
    // Asda returns and from the 403s Savers, The Range and Sainsbury's
    // return. /meta.json and /products.json both 404 at every address, and
    // no candidate published any currency at all — the probe's own words,
    // "the storefront was silent, which must be read as unknown and never as
    // sterling".
    //
    // What that adds to the ambiguity above: the host answers, and answers
    // every request shape identically, so "the sitemap fetch failed" is not
    // the explanation for the harvest's silent zero. It does not on its own
    // prove robots.txt was what stopped the walk, and no run has printed
    // that verdict directly, so the paragraph above stands as written.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. So a priced
    // listing proves a price was found and parsed, and says nothing whatever
    // about which currency it is in. That is why this entry stays in
    // CURRENCY_UNCONFIRMED regardless of the count above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from ocado.com itself: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. Ocado delivery is slot-booked and tied to a ' +
        'Smart Pass membership scheme, neither of which this model prices in, so no figure is ' +
        'entered. No affiliate programme has been researched.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'savers',
    name: 'Savers',
    domain: 'savers.co.uk',
    homepage: 'https://www.savers.co.uk',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Not a grocer: a 500-plus-store
    // health, home and beauty discounter owned by AS Watson, which is the
    // same group that owns Superdrug — already in this registry above, on
    // `adapter: 'proxied'`, and currently returning nothing. Whatever
    // Superdrug's storefront does about bots, this one may well do too, and
    // that is a reason to measure it rather than to assume either way.
    //
    // Fragrance URLs seen: /perfume/womens-perfumes/c/for-her,
    // /Perfume/Women's-Perfumes/Fragrance/c/fragrance and
    // /perfume/Shop-All-Fragrance-Clearance/c/shop-all-fragrance. The
    // "/c/{code}" suffix is the SAP Commerce (Hybris) category convention,
    // which is a conventional server-rendered stack rather than a grocery
    // SPA — the reason this is ranked above the grocers for likely
    // crawlability despite being a much smaller shop.
    //
    // One caution recorded because it was seen and would be dishonest to
    // drop: a consumer-reviews aggregator surfaced in the same search
    // carrying complaints about undelivered orders, unresolved refunds and
    // suspected counterfeit perfume. That is third-party review-site
    // reputation, not a finding about this shop, and it is not evidence of
    // anything — but this registry sends real people to real checkouts, so a
    // human should look before this one is ever switched on.
    //
    // ── Measured 2026-08-20: refused ─────────────────────────────────────────
    // Harvest probe --dry-run --shop=savers --max=10, run 32390473517 job
    // 96495106365, 2026-08-20T16:10:44Z, commit 59f60a9:
    //
    //   Savers   0 urls   0 fetched   0 priced listings  (1 errors)
    //       https://www.savers.co.uk/sitemap.xml: HTTP 403
    //
    // robots.txt was read (no unreadable-robots block printed, and a URL the
    // rules disallowed would not have been fetched at all), and only the one
    // conventional root was tried, so robots.txt declared no Sitemap: line.
    // The 403 is the storefront refusing this client, which is a fact about
    // its bot defences rather than about its crawl policy — the same
    // distinction the Superdrug entry above draws, and Superdrug is the same
    // corporate group. Whether a residential IP or a real browser gets past
    // it is exactly what the metered tiers exist to answer and has not been
    // asked here.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. So a priced
    // listing proves a price was found and parsed, and says nothing whatever
    // about which currency it is in. That is why this entry stays in
    // CURRENCY_UNCONFIRMED regardless of the count above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from savers.co.uk itself: not its delivery terms, not its ' +
        'robots.txt, not its checkout currency. Search summaries mention free Click & Collect, ' +
        'which is not a delivery rate, so nothing is entered. No affiliate programme has been ' +
        'researched; a third-party affiliate directory suggested there is none on the major ' +
        'networks, which is not the same as having checked Awin and Rakuten directly.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'bm-stores',
    name: 'B&M',
    domain: 'bmstores.co.uk',
    homepage: 'https://www.bmstores.co.uk',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Variety discounter, 700-plus
    // stores. Fragrance tree at /products/health-and-beauty/fragrance with
    // /men-s-fragrance, /women-s-fragrance and a ?page=N pagination
    // parameter that appeared in the results themselves (?page=2, ?page=3),
    // so the paging convention is at least visible from outside. Result
    // summaries name Joop!, Davidoff, Hugo Boss and Victoria Beckham, so
    // designer stock rather than own-label.
    //
    // Note the plain hierarchical paths with no id segment and no session
    // parameter — the friendliest URL shape of anything in this batch.
    // Whether the pages behind them carry product JSON-LD is unmeasured.
    //
    // ── Measured 2026-08-20: a working route ─────────────────────────────────
    // Harvest probe --dry-run --shop=bm-stores --max=10, run 32390489171 job
    // 96495154921, 2026-08-20T16:11:41Z, commit 59f60a9:
    //
    //   B&M   233 urls   10 fetched   10 priced listings  (1 errors)
    //       https://www.bmstores.co.uk/sitemap.xml: HTTP 404
    //       sample priced URL: https://www.bmstores.co.uk/products/
    //         flash-bathroom-500ml-febreze-fresh-scent-409799
    //
    // The conventional sitemap path simply does not exist here; the 233 URLs
    // came from the Sitemap: lines in this shop's own robots.txt, which the
    // walk prefers when they are there. So robots.txt was read, it named its
    // sitemaps, every URL was permitted, and ten of ten fetched product
    // pages carried a parseable schema.org price. Second-best retrieval
    // result of the eight shops in this batch.
    //
    // The sample is a bathroom cleaner because the walk is unscoped across
    // the whole catalogue — a sections/requiredUrlPrefix question, not a
    // retrieval one.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. That is why the
    // 10-of-10 count above did not by itself clear this entry.
    //
    // ── Currency: confirmed 2026-08-21, on a real product page ───────────────
    // Currency probe, run 32503013366 job 96836834119, 2026-08-21T16:28:03Z,
    // --product=https://www.bmstores.co.uk/products/flash-bathroom-500ml-
    // febreze-fresh-scent-409799 (the sample priced URL the harvest probe
    // above already fetched, not a guess). The market-address sweep found no
    // Shopify.currency and no /meta.json, same silence as this domain's other
    // readings — but the product page's own schema.org JSON-LD labelled its
    // price "1.89 GBP" identically through every way of asking that reached
    // it. That is the shop's own label on its own price, on its own page.
    // Removed from CURRENCY_UNCONFIRMED below on that evidence and enabled.
    // Harvest probe run 32390489171 job 96495154921 above is a real,
    // measured crawlViaSitemap pass with 10-of-10 priced listings, so
    // sitemapHarvestConfirmed is set rather than left unstated — this is the
    // riiffs/perfumeo shape: enabled with standardGbp still null below, so
    // tests/registry.test.ts's "unstated delivery" allowlist needs a real
    // ingestion route on record, and this is it.
    enabled: true,
    adapter: 'unknown',
    sitemapHarvestConfirmed: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from bmstores.co.uk itself: not its delivery terms, not ' +
        'its robots.txt, not its checkout currency. No delivery figure of any kind appeared in ' +
        'the search summaries read for this entry. No affiliate programme has been researched; ' +
        'a third-party affiliate directory suggested there is none on the major networks, which ' +
        'is not the same as having checked Awin and Rakuten directly.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'the-range',
    name: 'The Range',
    domain: 'therange.co.uk',
    homepage: 'https://www.therange.co.uk',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Fragrance tree at
    // /health-and-beauty/fragrances-and-gifting/perfumes-and-aftershaves/
    // with /male-aftershave-and-fragrance/ and a
    // /female-fragrance-and-perfumes/designer-fragrances-eau-de-parfum leaf;
    // result summaries name Calvin Klein, Paco Rabanne and David Beckham.
    // Plain hierarchical paths, no ids, no session parameters.
    //
    // The only shop in this batch with an affiliate programme found: an
    // Awin merchant profile at ui.awin.com/merchant-profile/5238 titled "The
    // Range Affiliate Programme" appeared as a search result in its own
    // right. That is `awinPending` territory — a confirmed merchant we have
    // not applied to — and it is recorded that way below rather than as
    // anything live. A commission rate ("2% rising to 8%") appeared in a
    // third-party blog summarising the programme; it is not repeated in the
    // config, because a rate read off a blog is not a rate.
    //
    // Worth more than a scrape route if it lands: an approved Awin
    // programme gives a product feed with prices and an image licence in the
    // terms, which is the difference between hot-linking someone's
    // photography unlicensed and being invited to.
    //
    // ── Measured 2026-08-20: refused ─────────────────────────────────────────
    // Harvest probe --dry-run --shop=the-range --max=10, run 32390498472 job
    // 96495184519, 2026-08-20T16:10:56Z, commit 59f60a9:
    //
    //   The Range   0 urls   0 fetched   0 priced listings  (1 errors)
    //       https://www.therange.co.uk/sitemap.xml: HTTP 403
    //
    // robots.txt was read and named no sitemap of its own; the conventional
    // path 403s. Worth restating what that does and does not mean for this
    // particular entry: the scrape route is refused, and the Awin route
    // recorded below is untouched by that. A merchant feed is handed over
    // rather than fetched, so a shop that will not serve a crawler can still
    // be a perfectly good affiliate partner. Of the eight shops in this
    // batch this is the one where applying is likely to be worth more than
    // any amount of further crawling.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. So a priced
    // listing proves a price was found and parsed, and says nothing whatever
    // about which currency it is in. That is why this entry stays in
    // CURRENCY_UNCONFIRMED regardless of the count above.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from therange.co.uk itself: not its delivery terms, not ' +
        'its robots.txt, not its checkout currency. Search summaries mention home delivery and ' +
        'reserve & collect without naming a rate, so nothing is entered.',
    },
    catalogue: null,
    // Merchant id 5238 read off the title of an ui.awin.com/merchant-profile
    // search result, not from a logged-in Awin session. `awinPending` is the
    // right shape for that: confirmed merchant, no application made, nothing
    // claimed about a relationship. Applying is a human action.
    affiliate: { ...awinPending('5238') },
  },
  {
    id: 'home-bargains',
    name: 'Home Bargains',
    domain: 'home.bargains',
    homepage: 'https://home.bargains',
    tiers: ['designer'],
    // Added 2026-08-20 from WebSearch result URLs and titles alone — no page
    // opened, this sandbox has no egress. Variety discounter, 600-plus
    // stores, and the only entry in this batch whose search results included
    // a dedicated designer-fragrance hub: /brand/designerfragrances/
    // designer-fragrances, alongside /category/975/fragrances.
    //
    // Two live domains appeared in the same search and this entry has to
    // pick one: home.bargains (used above, and the one carrying the designer
    // hub) and homebargains.co.uk, whose fragrance URL is
    // /category/22-fragrances.aspx — an older ASP.NET address. Which is
    // canonical and whether one redirects to the other is unmeasured, and it
    // is the first thing a probe against this entry should settle, because
    // `domain` is what every crawl route builds its requests from.
    //
    // ── Measured 2026-08-20: the best retrieval result in this batch ─────────
    // Harvest probe --dry-run --shop=home-bargains --max=10, run 32390508333
    // job 96495217728, 2026-08-20T16:11:45Z, commit 59f60a9:
    //
    //   Home Bargains   756 urls   10 fetched   10 priced listings
    //       sample priced URL: https://home.bargains/product/
    //         006cd416-38d5-4412-bd19-7c7a0443780b/
    //         disney-alice-in-wonderland-scented-diffuser-200ml-paint-the-roses
    //
    // No error line at all — the only shop of the eight to produce a clean
    // sweep. robots.txt was read and permitted everything asked for, the
    // sitemap resolved, 756 product URLs were enumerated, and ten of ten
    // fetched pages carried a parseable schema.org price. Product URLs are
    // /product/{uuid}/{slug}.
    //
    // That also settles the two-domain question above in favour of
    // home.bargains, at least to the extent that this is the one that
    // answered. Nothing has been established about homebargains.co.uk.
    //
    // One thing "priced listings" does NOT mean, recorded here because it
    // would be easy to read it as more than it is: src/catalogue/jsonld.ts
    // does not look at schema.org `priceCurrency` at all — it takes the
    // number out of the offer and stores it as `priceGbp`. That is why the
    // 10-of-10 count above did not by itself clear this entry.
    //
    // ── Currency: confirmed 2026-08-21, on a real product page ───────────────
    // Currency probe, run 32502916682 job 96836526874, 2026-08-21T16:26:48Z,
    // --product=https://home.bargains/product/006cd416-38d5-4412-bd19-7c7a0443780b/
    // disney-alice-in-wonderland-scented-diffuser-200ml-paint-the-roses (the
    // sample priced URL the harvest probe above already fetched, not a guess).
    // The market-address sweep found no Shopify.currency and no /meta.json —
    // same silence as every other reading on this domain — but the product
    // page itself carries schema.org JSON-LD, and its priceCurrency read GBP
    // identically through all six ways of asking: "page 4.99 GBP". That is
    // the shop's own label on its own price, on its own page, which is the
    // standard this file asks for. Removed from CURRENCY_UNCONFIRMED below on
    // that evidence and enabled. Harvest probe run 32390508333 job
    // 96495217728 above is a real, measured crawlViaSitemap pass with
    // 10-of-10 priced listings — the cleanest sweep of any shop in this
    // batch — so sitemapHarvestConfirmed is set rather than left unstated:
    // the riiffs/perfumeo shape, enabled with standardGbp still null below,
    // which is exactly what tests/registry.test.ts's "unstated delivery"
    // allowlist requires a real ingestion route on record for.
    enabled: true,
    adapter: 'unknown',
    sitemapHarvestConfirmed: true,
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-20',
      confidence: 'unverified',
      notes:
        'Nothing here has been read from either Home Bargains domain: not its delivery terms, ' +
        'not its robots.txt, not its checkout currency. Search summaries mention home delivery ' +
        'without naming a rate, so nothing is entered. No affiliate programme has been ' +
        'researched.',
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
  // riiffs was removed from this list on 2026-08-20, on the untried angle its
  // own note here named: a product page's own JSON-LD priceCurrency rather
  // than the shop's origin. Currency probe, run 32366295704 job 96416544427,
  // read https://uk.riiffsperfumes.com/product/aswaar/ (the harvest's own
  // fetched URL) as 44.99 GBP through every candidate that reached it. See
  // the comment on its registry entry above. It is now `enabled: true`.
  // perfumeo was removed from this list the same day, on the same angle:
  // Currency probe, run 32366445247 job 96416932763, read
  // https://perfumeo.co.uk/products/petra-viola-by-lattafa-100ml-eau-de-parfum-2/
  // (the harvest's own fetched URL) as 49.99 GBP through every candidate
  // that reached it. See the comment on its registry entry above. It is now
  // `enabled: true`.
  // home-bargains was removed from this list on 2026-08-21, on the same
  // angle: Currency probe, run 32502916682 job 96836526874, read the
  // harvest's own sample priced URL (a Disney diffuser on home.bargains) as
  // "4.99 GBP" via schema.org JSON-LD through every candidate that reached
  // it. See the comment on its registry entry above. It is now `enabled: true`.
  // bm-stores was removed from this list the same day, on the same angle:
  // Currency probe, run 32503013366 job 96836834119, read the harvest's own
  // sample priced URL (a Febreze bathroom spray on bmstores.co.uk) as
  // "1.89 GBP" via schema.org JSON-LD through every candidate that reached
  // it. See the comment on its registry entry above. It is now `enabled: true`.
  // morrisons was removed from this list the same day, on the narrower gap
  // its own note here had already named: the previous product URL tried
  // (paco-rabanne-pour-homme-aftershave-lotion) 404'd, so a second, genuinely
  // resolving product page was needed. Currency probe, run 32503927947 job
  // 96839718465, read the harvest's own sample priced URL
  // (vitfix-magnesium-effervescent-citrus) as "3.5 GBP" via schema.org
  // JSON-LD through every candidate that reached it. See the comment on its
  // registry entry above. It is now `enabled: true`.
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
      'programme checks out in GBP, or the site is EU-priced throughout, has not been confirmed. ' +
      'Currency probe, run 32257096463 job 96081230582, 2026-08-19: robots.txt answers with no ' +
      'disallow, and the bare origin answers 200, but none of the nine ways of asking published ' +
      'any currency at all — no Shopify.currency in the theme, no /meta.json, and /en-gb /gb /uk ' +
      '/en-uk all 404. /products.json also 404s everywhere, so this is not a confirmed Shopify ' +
      'storefront either. A genuinely silent storefront, not evidence either way.',
  ],
  [
    'beauty-the-shop-uk',
    'Ships from Madrid, Spain. Whether UK orders are actually GBP-priced has not been confirmed. ' +
      'Currency probe attempted twice, 2026-08-19 (run 32256970672 job 96080822225, and run ' +
      '32257466936 job 96082441277, roughly 7 minutes apart): both got "COULD NOT ASK: robots.txt ' +
      'did not answer at https://beautytheshop.com" — no request was made either time. A repeated ' +
      'failure like this reads as the shop refusing or rate-limiting this address rather than a ' +
      'fluke; per the probe\'s own standard the right response is to leave it alone rather than ' +
      'probe harder. Not a currency finding, and a documented Apify candidate for whoever next ' +
      'takes on scraping this shop directly — a plain HTTP client cannot even read its robots.txt.',
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
      'so no routine run can put them back. Evidence refreshed 2026-08-19 (currency probe, run ' +
      '32257210189, job 96081595191): /products.json now returns a real Shopify payload — this ' +
      'is confirmed Shopify, the route that WOULD serve it — but every request shape still ' +
      'settles EUR. Asked ?country=GB the theme labels the price GBP while settling EUR at a ' +
      'computed rate of 0.8729568, a live Shopify-Markets conversion of the same euro figure, ' +
      'not a second genuine sterling list; this is a different mechanism from the Awin feed\'s ' +
      'fixed 1.3490 divisor above, but the same underlying fact: no GBP price list independent ' +
      'of a euro one has been found here by any route tried.',
  ],
  [
    'carethy',
    'Listed here on the day it was added, before anyone had opened the shop — which is the ' +
      'only moment at which this list can be complete. Everything known about carethy.co.uk ' +
      'is one row of a Microsoft Shopping results page; its checkout currency has not been ' +
      'looked at, and a .co.uk domain is not evidence of sterling (uk.zimayaperfumes.com ' +
      'quotes dollars). No claim is made that it prices in anything in particular. Currency ' +
      'probe, run 32254829111 job 96074001578, 2026-08-19: robots.txt answers with a 10s ' +
      'crawl-delay and no disallow; the bare origin answers 200, but none of the nine ways of ' +
      'asking published any currency at all, and /products.json 404s everywhere too. Now a ' +
      'genuinely silent storefront rather than an unopened one — still no basis for sterling.',
  ],
  [
    'scentsational',
    'scentsational.com quotes this US runner USD by default and at every request shape tried ' +
      '(currency probe, run 32255905250 job 96077421762, 2026-08-19): origin, ?country=GB, both ' +
      'localisation cookies and Accept-Language en-GB all settle USD; /en-gb, /gb, /uk, /en-uk ' +
      'all 404, so there is no market-prefix address to try instead. /products.json 404s ' +
      'everywhere too, so this is not a confirmed Shopify storefront either. Unlike escentual, ' +
      'no request this repo knows how to make has found a GBP reading anywhere on this shop.',
  ],
  [
    'parfumdreams-uk',
    'Currency probe, run 32256361673 job 96078874562, 2026-08-19: robots.txt answers with no ' +
      'disallow, and the bare origin answers 200, but none of the nine ways of asking published ' +
      'any currency at all — no Shopify.currency, no /meta.json, and /en-gb /gb /uk /en-uk all ' +
      '404. /products.json also 404s everywhere. A .co.uk domain is not evidence of sterling ' +
      'pricing on its own (uk.zimayaperfumes.com quotes dollars) — this storefront is simply ' +
      'silent about its currency rather than confirming anything.',
  ],
  [
    'fragrancedirect',
    'Currency probe, run 32256534104 job 96079423648, 2026-08-19: robots.txt answers with no ' +
      'disallow, and the bare origin answers 200, but none of the nine ways of asking published ' +
      'any currency at all — no Shopify.currency, no /meta.json, and /en-gb /gb /uk /en-uk all ' +
      '404. /products.json also 404s everywhere. A .co.uk domain is not evidence of sterling ' +
      'pricing on its own (uk.zimayaperfumes.com quotes dollars) — this storefront is simply ' +
      'silent about its currency rather than confirming anything.',
  ],
  [
    'cosmetify',
    'Currency probe, run 32256674382 job 96079949118, 2026-08-19: robots.txt answers with no ' +
      'disallow, and the bare origin answers 200, but none of the nine ways of asking published ' +
      'any currency at all — no Shopify.currency, no /meta.json, and /en-gb /gb /uk /en-uk all ' +
      '404. /products.json also 404s at every address tried, so this is not a confirmed Shopify ' +
      'storefront either. A genuinely silent storefront, not a foreign-currency one.',
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
  [
    'harrods',
    'Currency probe, run 98, job 96415230154, 2026-08-20T11:52Z: every one of the nine ways of ' +
      'asking got HTTP 403 on both the meta signal and the bare page, uniformly — the same clean ' +
      'block this file already has on Selfridges (see its own entry above). A 403 answers ' +
      'nothing about currency; it is not evidence for sterling any more than against it. A ' +
      'famous UK department store is not the same claim as a measured sterling price list — ' +
      'Nicchia Luxury ran enabled on a less careful version of that same assumption for three ' +
      'days (see its own entry above). One positive sterling reading — which will need residential ' +
      "retrieval given this block, per docs/INGESTION.md's usual escalation — is what would " +
      'remove this id.',
  ],
  [
    'next',
    "Listed here on the day it was added, before anyone had opened the shop. Everything known " +
      "about next.co.uk's fragrance department comes from WebSearch snippets; its checkout " +
      'currency has not been read. A .co.uk domain is not evidence of sterling pricing on its ' +
      'own — uk.zimayaperfumes.com quotes dollars. One positive sterling reading from a ' +
      'currency probe is what would remove this id.',
  ],
  // avon was removed from this list on 2026-08-20, on the evidence the list
  // itself asks for: currency probe, run 102, job 96416797227, read a
  // sterling price list off the shop's own storefront at rate 1, through six
  // of nine ways of asking, and confirmed a real Shopify /products.json
  // payload in the same run. See the comment on its registry entry above
  // for what that run established. It remains `enabled: false` — currency
  // and route are proven, enabling is still a separate judgement nobody has
  // made yet.
  [
    'sephora-uk',
    'Currency probe, run 99, job 96416155239, 2026-08-20T11:56Z: every one of the nine ways of ' +
      'asking got meta 404 / home 403, uniformly — the same clean block as Harrods\' entry above, ' +
      'not a mixed reading. A 403/404 pair answers nothing about currency either way. Sephora UK ' +
      'is a UK-launched storefront of a larger international group, and this registry has ' +
      'already seen a UK-branded shop quote the wrong currency to this tooling by default and ' +
      'settle GBP only on request (see escentual\'s and fragrancehub\'s own entries above) — one ' +
      'more reason not to assume either way. One positive sterling reading is what would remove ' +
      'this id.',
  ],
  // space-nk was removed from this list on 2026-08-20, on the evidence the
  // list itself asks for: currency probe, run 100, job 96416323928, read a
  // sterling price list off the shop's own storefront at rate 1, through
  // seven of nine ways of asking. See the comment on its registry entry
  // above for what that run did and did not establish (in particular:
  // currency yes, a confirmed /products.json route no). It remains
  // `enabled: false` — a confirmed currency is not, by itself, a decision to
  // fetch from a shop with no proven ingestion route.
  [
    'house-of-fraser',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about houseoffraser.co.uk comes from WebSearch snippets; its checkout currency has not ' +
      'been read. A .co.uk domain is not evidence of sterling pricing on its own — ' +
      'uk.zimayaperfumes.com quotes dollars. One positive sterling reading from a currency ' +
      'probe is what would remove this id.',
  ],
  [
    'marks-and-spencer',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about marksandspencer.com comes from WebSearch snippets; its checkout currency has not ' +
      'been read. A famous UK high-street name is not the same claim as a measured sterling ' +
      'price list — Nicchia Luxury ran enabled on a less careful version of that same ' +
      'assumption for three days (see its own entry above). One positive sterling reading from ' +
      'a currency probe is what would remove this id.',
  ],
  [
    'les-senteurs',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about lessenteurs.com comes from WebSearch snippets; its checkout currency has not been ' +
      'read. One positive sterling reading from a currency probe is what would remove this id.',
  ],
  [
    'bloom-perfumery',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about bloomperfume.co.uk comes from WebSearch snippets — see this entry\'s own registry ' +
      'comment for the domain-sprawl caution that went into even choosing which of six ' +
      'candidate domains to enter here. Its checkout currency has not been read. One positive ' +
      'sterling reading from a currency probe is what would remove this id.',
  ],
  [
    'shy-mimosa',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about shymimosa.co.uk comes from WebSearch snippets, including the one specific delivery ' +
      "figure (£4.99 under £100) recorded in this entry's shipping.notes; its checkout " +
      'currency has not been read. One positive sterling reading from a currency probe is what ' +
      'would remove this id.',
  ],
  [
    'perfume-price',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about perfumeprice.co.uk comes from WebSearch snippets, including its Companies House ' +
      'registration; its checkout currency has not been read. One positive sterling reading ' +
      'from a currency probe is what would remove this id.',
  ],
  [
    'perfume-direct',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about perfumedirect.com comes from WebSearch snippets; its checkout currency has not ' +
      'been read. One positive sterling reading from a currency probe is what would remove ' +
      'this id.',
  ],
  [
    'asda',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about groceries.asda.com comes from WebSearch result URLs and titles; its checkout ' +
      'currency has not been read. One positive sterling reading from a currency probe is what ' +
      'would remove this id.',
  ],
  [
    'sainsburys',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about sainsburys.co.uk comes from WebSearch result URLs and titles; its checkout ' +
      'currency has not been read. One positive sterling reading from a currency probe is what ' +
      'would remove this id.',
  ],
  [
    'ocado',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about ocado.com comes from WebSearch result URLs and titles; its checkout currency has ' +
      'not been read. One positive sterling reading from a currency probe is what would remove ' +
      'this id.',
  ],
  [
    'savers',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about savers.co.uk comes from WebSearch result URLs and titles; its checkout currency ' +
      'has not been read. One positive sterling reading from a currency probe is what would ' +
      'remove this id.',
  ],
  [
    'the-range',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about therange.co.uk comes from WebSearch result URLs and titles; its checkout currency ' +
      'has not been read. Note that a confirmed Awin merchant profile is not a currency ' +
      'reading either — Nicchia Luxury was enabled on an Awin feed\'s GBP column and that is ' +
      'the entry this list exists because of. One positive sterling reading from a currency ' +
      'probe is what would remove this id.',
  ],
  [
    'tesco',
    'Listed here on the day it was added, before anyone had opened the shop. Everything known ' +
      'about tesco.com comes from WebSearch result URLs and titles; its checkout currency has ' +
      'not been read. Being the largest grocer in the country is not a measurement — the ' +
      'reason this list exists is that a famous domain reads as self-evidently sterling right ' +
      'up until it is asked. One positive sterling reading from a currency probe is what would ' +
      'remove this id, and it would still leave the Marketplace exclusion in this entry\'s own ' +
      'comment standing, which is a separate question from currency.',
  ],
]);

// Runs once, at import, which is the only moment early enough to matter: by
// the time a price reaches a snapshot the currency has already been assumed.
// Cannot fire today — every id above is `enabled: false` — and that is the
// point. The count on this list moves as shops are measured (zimaya and
// FragranceHub came off it on 2026-08-19 evidence; khadlaj, scentsational,
// Parfumdreams UK, Fragrancedirect and Cosmetify went on it the same day) so
// no fixed number is pinned here — only the invariant that every id present
// is disabled. It exists for the edit that flips one of them without reading
// the note.
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
