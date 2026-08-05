import type { Retailer } from '../types/retailer.js';
import { brandKey } from '../catalogue/brandName.js';

/**
 * The PriceSniffs retailer registry.
 *
 * Nineteen UK retailers. Every one of them is a legitimate stockist and every
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
    affiliate: {
      ...awinPending('2082'),
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
    enabled: true,
    // No Awin approval yet, so this is a direct scrape rather than a feed —
    // the requested route for this retailer. No live spike was possible from
    // this environment (network egress to arbitrary hosts is blocked here,
    // see docs/INGESTION.md and the proxy's own status endpoint), so adapter
    // is 'unknown' rather than a claimed spike result. The storefront is
    // Shopify (its pagination follows Shopify's own ?page=N convention),
    // which is at least a concrete starting point for whoever runs the spike.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 2.45,
      freeOverGbp: 30,
      // Two independently found copies of their delivery page disagreed on
      // the window (2-5 vs 3-5 working days) — the wider span is recorded so
      // neither reading is contradicted.
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      // Not read directly off escentual.com/pages/delivery-information — that
      // host is unreachable from this environment. Sourced instead from
      // search-engine cached copies of that page's own text, the same
      // indirect-but-real-number standard already applied to Fragrance Click
      // above. Unverified until someone opens the page in a real browser.
      confidence: 'unverified',
      notes:
        'A paid annual "Delivery Pass" (£9.95) gives free next-day delivery on orders over ' +
        '£20 — a membership perk, not modelled in the headline price. 2-Day (£3.50, order by ' +
        '22:30) and 1-Day (£5.95, order by 16:30) express tiers also exist and are likewise ' +
        'out of scope for the standard-delivery-only model this registry uses.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.escentual.com/search?q={q}',
      sections: [
        { id: 'womens', label: "Women's fragrance", urlTemplate: 'https://www.escentual.com/collections/fragrances-for-women?page={page}', tier: 'designer' },
        { id: 'mens', label: "Men's fragrance", urlTemplate: 'https://www.escentual.com/collections/fragrances-for-men?page={page}', tier: 'designer' },
      ],
      firstPage: 1, maxPages: 60, minRequestGapMs: 1500,
    },
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'the-fragrance-counter',
    name: 'The Fragrance Counter',
    domain: 'thefragrancecounter.co.uk',
    homepage: 'https://www.thefragrancecounter.co.uk',
    tiers: ['designer'],
    // Disabled: their own delivery page states delivery is free, but no
    // explicit standard-delivery price or spend threshold could be found to
    // confirm that is unconditional rather than gated on a minimum spend —
    // exactly the gap standardGbp: null exists to say honestly. See the
    // field's doc comment for why leaving it null rather than guessing 0
    // matters here in particular: guessing free would make this retailer
    // artificially win the delivered-price sort every time.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Search-cached copies of their delivery page say standard delivery is by Royal Mail ' +
        'Tracked 48 and describe it as free, but none of them state a minimum spend or confirm ' +
        'it applies to every order. Read thefragrancecounter.co.uk delivery terms directly, ' +
        'fill in standardGbp/freeOverGbp, then enable. A .com storefront also exists ' +
        '(thefragrancecounter.com) — confirm its relationship to the .co.uk site before ' +
        'treating them as the same retailer.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
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
    // Escentual above for why.
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: 2.95,
      freeOverGbp: 30,
      // One cached source describes standard delivery taking up to 10
      // working days, which is unusually slow and sits oddly next to a
      // same-named "24hr tracked" upgrade tier — plausibly two different
      // named services rather than a contradiction, but not resolved from
      // here. The wider span is recorded rather than picking a side.
      estimatedDays: [3, 10],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Independent UK perfumery trading since 1996 (Companies House: Scentstore Limited, ' +
        '05917335). A paid 24hr Tracked upgrade also exists at £3.95. Their own site states ' +
        'they run an Awin affiliate programme, but no merchant id could be found in this pass ' +
        '— resolve that before applying for their programme rather than guessing an id.',
    },
    catalogue: {
      searchUrlTemplate: 'https://www.scentstore.com/search?q={q}',
      sections: [
        { id: 'fragrance', label: 'Perfume', urlTemplate: 'https://www.scentstore.com/shop/perfume/?page={page}', tier: 'designer' },
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
    // Disabled: the free-delivery threshold is reasonably well sourced, but
    // the standard cost below that threshold is not — one third-party
    // aggregator cites a figure, but it was never confirmed on the
    // retailer's own page, which is not a strong enough basis to price a
    // sort key against. See the field's doc comment on why null, not a
    // guess, is what belongs here until that changes.
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [3, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Free UK delivery over £50, next-day option at £3.99. The under-threshold standard ' +
        'cost is only aggregator-sourced (not read off perfumeshopping.com/delivery-and-' +
        'returns directly) — confirm it there before filling in standardGbp and enabling.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
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
        'Was in houses.ts as frenchavenue.com (the global, AED-priced site) until this UK-' +
        'specific storefront turned up. A £50 free-delivery figure appears in search results ' +
        'but is attributed to third-party UK retailers stocking French Avenue, not confirmed ' +
        "as this site's own policy — do not carry it over without checking " +
        'uk.shopfrenchavenue.com directly. No standard-delivery cost found at all.',
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
        'Was in houses.ts as armaf.com (global) until this UK entity turned up: ARMAF (UK) ' +
        'LTD, Companies House 12161258. Their own shipping page exists at ' +
        'armaf.uk/pages/shipping-details (Royal Mail, Mon-Sat, no bank-holiday deliveries) but ' +
        'search results did not surface the actual cost or free-delivery threshold — read that ' +
        'page directly before enabling.',
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
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [2, 5],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'freeOverGbp is their own stated figure (free UK delivery over £50, half-price over ' +
        '£150). The standard cost below £50 was not found — read alharamainperfumes.co.uk/' +
        'en-us/pages/shipping-policy directly, then enable. UK-founded (opened a London retail ' +
        'store), part of the wider Al Haramain group trading since 1970.',
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
    enabled: false,
    adapter: 'unknown',
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
        '"Ibraq (formerly Ibrahim Al Quarashi)" — spelling matches.',
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
      standardGbp: 4.5,
      freeOverGbp: 22,
      estimatedDays: [1, 3],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        "Both figures read off this site's own Shipping Policy page in search results: free " +
        'over £22, flat £4.50 below that, 1-3 business days to hand-off. Not to be confused ' +
        'with Bella Vita Organic (bellavitaorganic.com), an unrelated Indian skincare brand ' +
        'that also trades as "Bellavita" — see the matching caution in demo/brandSites.ts.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
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
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'manchester-ouds',
    name: 'Manchester Ouds',
    domain: 'manchesterouds.com',
    homepage: 'https://manchesterouds.com',
    tiers: ['mideast'],
    enabled: false,
    adapter: 'unknown',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: 50,
      estimatedDays: [2, 4],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'freeOverGbp 50 is their own stated figure ("free UK shipping on orders over £50"). ' +
        'The standard cost below that was not found — read manchesterouds.com directly, ' +
        'then enable.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
  },
  {
    id: 'perfumeo',
    name: 'Perfumeo',
    domain: 'perfumeo.co.uk',
    homepage: 'https://www.perfumeo.co.uk',
    tiers: ['designer'],
    // General discount fragrance retailer, not Middle Eastern focused —
    // requested under "retailer listings" alongside the oud specialists.
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
    // Disabled, and likely to stay that way longer than most: their published
    // terms of sale name no standard delivery charge and no free-delivery
    // threshold anywhere, only a 10 day long-stop for despatch. The twice
    // daily shipping:discover run will try their delivery page, but there is
    // a real chance the figure is only ever shown at checkout.
    enabled: false,
    adapter: 'affiliate-feed',
    currency: 'GBP',
    shipping: {
      standardGbp: null,
      freeOverGbp: null,
      // Not a typical window. Their terms state only that goods arrive "within
      // 10 days of your order", which is the contractual maximum they bind
      // themselves to, so the upper bound is theirs and the lower is a guess
      // held deliberately wide rather than flattering.
      estimatedDays: [2, 10],
      verifiedAt: '2026-08-05',
      confidence: 'unverified',
      notes:
        'Read from their Awin programme terms and their own terms of sale, 5 Aug 2026. Those ' +
        'documents state no delivery price and no free-delivery threshold at all — only the 10 ' +
        'day despatch long-stop recorded above. Identity is confirmed: The Beauty Store London ' +
        'Ltd, company 10805437, VAT GB325347215, returns to Unit 2 Orchard Business Park, ' +
        'Forsyth Road, Woking GU21 5FH. Note the storefront is thebeautystore.com, not the ' +
        '.co.uk domain first assumed here.',
    },
    catalogue: null,
    affiliate: {
      ...awinActive('116255', '3017443'),
      // Their branding terms read "No branding guidelines", which is an
      // absence of instruction, not a grant of permission. imageBasis stays
      // unset, so their photography is not displayed — see the ImageBasis doc
      // comment in src/types/retailer.ts.
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
    // Disabled pending a standard delivery cost, and with a currency question
    // on top — see the note below. The twice-daily shipping:discover run reads
    // their delivery page, so this should resolve without anyone opening a
    // browser.
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
        'A UK subdomain exists (uk.zimayaperfumes.com), which is why this is a retailer rather ' +
        'than a houses.ts entry, on the same reasoning as French Avenue and Armaf. But the UK ' +
        'site advertises "FREE DELIVERY OVER $50" in dollars, so it is not confirmed that it ' +
        'actually prices and ships in sterling — a Shopify storefront left unlocalised would ' +
        'look exactly like this. Confirm the checkout currency before enabling: currency is ' +
        "declared 'GBP' above because the type permits nothing else, which is itself the claim " +
        'being flagged here. Third-party UK stockists quote £50 and £80 free-delivery ' +
        'thresholds, but those are their terms, not this shop\'s.',
    },
    catalogue: null,
    affiliate: { ...NO_AFFILIATE_YET },
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
