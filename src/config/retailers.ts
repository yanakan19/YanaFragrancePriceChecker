import type { Retailer } from '../types/retailer.js';

/**
 * The PriceSniffs retailer registry.
 *
 * Thirteen UK retailers. Every one of them is a legitimate stockist and every
 * one is fine to send a customer to — see the header comment in
 * `src/types/retailer.ts` for why there is no `trusted` flag here and what
 * replaced it.
 *
 * ── Shipping figures ─────────────────────────────────────────────────────────
 * `verifiedAt` and `confidence` are load-bearing. Delivery terms change without
 * notice, and a stale threshold produces a wrong delivered price, which is the
 * single most damaging kind of error this app can make. Entries marked
 * `unverified` were sourced indirectly and must be confirmed against the
 * retailer's own delivery page before the delivered-price sort is trusted in
 * production. `npm run shipping:staleness` lists what needs re-checking.
 *
 * Only standard delivery is modelled. Express tiers and membership schemes
 * (Boots Advantage, TFS MYTFS, LOOKFANTASTIC Premier, Superdrug Beautycard,
 * Selfridges+) are recorded as footnotes and never priced in — we cannot assume
 * a customer is a member.
 *
 * ── Affiliate ────────────────────────────────────────────────────────────────
 * Every programme below is currently unmonetised: links resolve to the plain
 * retailer URL. Boots, Superdrug and LOOKFANTASTIC are confirmed Awin
 * merchants; the rest need the §2.1 audit. See `docs/AFFILIATE_SETUP.md` for
 * how to apply, and `npm run affiliate:status` for what is outstanding.
 */

/** Placeholder used for every programme that is not yet live. */
const NO_AFFILIATE_YET = {
  network: null,
  verified: false,
  status: 'not-researched',
  publisherId: null,
  deeplinkTemplate: null,
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
function awinActive(merchantId: string, publisherId: string) {
  return {
    network: 'awin',
    verified: true,
    status: 'active',
    publisherId,
    deeplinkTemplate:
      `https://www.awin1.com/cread.php?awinmid=${merchantId}&awinaffid={{publisherId}}&ued={{url}}`,
    signupUrl: `https://ui.awin.com/merchant-profile/${merchantId}`,
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
    // Live spike 1 Aug 2026: HTTP 200 but no product markup found. Either
    // the section URL is wrong or the grid is drawn by script.
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
      confidence: 'unverified',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.allbeauty.com/uk/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.allbeauty.com/uk/fragrance?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1200,
    },
    affiliate: { ...NO_AFFILIATE_YET },
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
    currency: 'GBP',
    shipping: {
      standardGbp: 2.99,
      freeOverGbp: 25,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Free next-day (RM24 Tracked) over £80; standard free tier is RM48 Tracked.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.justmylook.com/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.justmylook.com/collections/fragrance?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1200,
    },
    affiliate: { ...NO_AFFILIATE_YET },
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
    catalogue: {
      searchUrlTemplate: 'https://www.notino.co.uk/search.asp?exps={q}',
      sections: [
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
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md.
    adapter: 'proxied',
    currency: 'GBP',
    shipping: {
      standardGbp: 3.95,
      freeOverGbp: 25,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Click & Collect £1.50, free over £15. Cloudflare-fronted — expect a hard scrape.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.boots.com/sitesearch?searchTerm={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.boots.com/fragrance?pageNo={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 2500,
    },
    affiliate: awinPending('2041'),
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
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md.
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
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md.
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
        { id: 'womens', label: "Women's perfume", urlTemplate: 'https://www.theperfumeshop.com/womens/c/womens?page={page}', tier: 'designer' },
        { id: 'mens', label: "Men's aftershave", urlTemplate: 'https://www.theperfumeshop.com/mens/c/mens?page={page}', tier: 'designer' },
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
    // Live spike 1 Aug 2026: HTTP 404. The section URL below is wrong and
    // needs correcting before this shop can be judged.
    adapter: 'unknown',
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
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.johnlewis.com/beauty/fragrance/c/e15006?page={page}', tier: 'designer' },
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
    currency: 'GBP',
    shipping: {
      standardGbp: 4.95,
      freeOverGbp: 45,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
      notes: 'Up to 48h order processing before dispatch — the day window excludes that.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.beautybase.com/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.beautybase.com/fragrance-c1?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'lookfantastic',
    name: 'LOOKFANTASTIC',
    domain: 'lookfantastic.com',
    homepage: 'https://www.lookfantastic.com',
    tiers: ['designer', 'niche'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 404. The section URL below is wrong and
    // needs correcting before this shop can be judged.
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
      verifiedAt: '2026-08-01',
      confidence: 'unverified',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.lookfantastic.com/elysium.search?search={q}',
      sections: [
        { id: 'fragrance', label: 'Fragrance', urlTemplate: 'https://www.lookfantastic.com/fragrance.list?pageNumber={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: awinPending('2082'),
  },
  {
    id: 'superdrug',
    name: 'Superdrug',
    domain: 'superdrug.com',
    homepage: 'https://www.superdrug.com',
    tiers: ['designer'],
    enabled: true,
    // Live spike 1 Aug 2026: HTTP 403 from a datacentre IP before any
    // markup was served. Bot mitigation, not a parsing problem. Prefer an
    // affiliate feed; paid residential retrieval is the fallback.
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md.
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
      ],
      firstPage: 1, maxPages: 50, minRequestGapMs: 2000,
    },
    affiliate: {
      network: 'awin',
      verified: true,
      status: 'not-applied',
      publisherId: null,
      deeplinkTemplate: null,
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
    // See docs/SPIKE-RESULTS.md and docs/INGESTION.md.
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
    // the section URL is wrong or the grid is drawn by script.
    adapter: 'unknown',
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
      verifiedAt: '2026-08-03',
      // Not read directly off fragranceclick.co.uk/delivery — that request
      // returned HTTP 403, the same bot mitigation seen elsewhere in this
      // registry. Sourced instead from a search-engine summary of that same
      // page's own content (title: "Delivery Information | Free UK
      // Shipping | Fragrance Click"), which is indirect enough to keep this
      // unverified until someone opens the page in a real browser and
      // confirms it by eye.
      confidence: 'unverified',
      notes:
        'Free UK delivery on every order via Royal Mail Tracked 48 (2-3 days), no minimum ' +
        'spend — so standardGbp is genuinely 0, not a rounding of a small fee. Paid express ' +
        'tiers exist (Tracked 24 at £1.95, Special Delivery at £9.95) but are not modelled, ' +
        'per this registry\'s standard-delivery-only rule.',
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
    enabled: false,
    // 8,908 products in the Awin feed, updated daily — the same case as
    // Fragrance Click, and the reason docs/INGESTION.md puts feeds first.
    // No sitemap walk is configured because the feed is the ingestion route.
    adapter: 'affiliate-feed',
    currency: 'GBP',
    shipping: {
      // Not established. Their Awin programme terms describe commission and
      // cookie length and say nothing about delivery, and their delivery page
      // has not been read. Null rather than a guess — see the field's doc
      // comment for why zero would have been actively wrong.
      standardGbp: null,
      freeOverGbp: null,
      // Placeholder, and unreachable while this retailer is disabled. It is
      // not a claim about their delivery speed.
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-04',
      confidence: 'unverified',
      notes:
        'Nothing in this block is established. Read https://mybeauty.boutique delivery ' +
        'terms, fill in standardGbp/freeOverGbp/estimatedDays, then set enabled: true.',
    },
    catalogue: null,
    affiliate: {
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
    id: 'glorious-beauty',
    name: 'Glorious Beauty',
    domain: 'gloriousbeauty.co.uk',
    homepage: 'https://gloriousbeauty.co.uk',
    // Their own words, from the programme profile they publish on Awin.
    blurb:
      'Glorious Beauty presents a curated, handpicked portfolio of glorious make-up, ' +
      'skincare, fragrance and wellness brands inspired to bring out the glorious in you.',
    tiers: ['designer'],
    // Disabled until standard delivery is established. Unlike MyBeauty above,
    // this one has no product feed at all to fall back on.
    enabled: false,
    // Their Awin programme reports 0 products and "last updated: never", so
    // there is no feed to take. If this shop is ever enabled it will need the
    // sitemap route, which is why the adapter is unknown rather than
    // affiliate-feed — nothing about its retrieval has been established.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      // Not established. See the field's doc comment.
      standardGbp: null,
      // This one IS confirmed: "Free shipping on orders over £28", stated in
      // their own programme terms on Awin.
      freeOverGbp: 28,
      // Placeholder, unreachable while disabled, and not a delivery-speed claim.
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-04',
      confidence: 'unverified',
      notes:
        'freeOverGbp 28 is confirmed from the advertiser\'s own Awin programme terms. ' +
        'The standard cost below that threshold, and the delivery window, are not ' +
        'established: read https://gloriousbeauty.co.uk delivery page, then enable.',
    },
    catalogue: null,
    affiliate: {
      ...awinActive('107736', '3017443'),
      notes:
        'Merchant id 107736, joined 4 Aug 2026. No product feed published (0 products, ' +
        'never updated), so there is nothing to import — ask the advertiser whether one ' +
        'is planned. Commission: fragrance 3%, beauty 7% new / 3% existing. 30-day ' +
        'cookie, 21-day auto-validation.',
    },
  },
] as const;

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
