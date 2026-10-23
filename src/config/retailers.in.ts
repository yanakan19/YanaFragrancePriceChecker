/**
 * Indian shops for the India dry run (docs/INTERNATIONAL-PLAN.md, Phase 1,
 * step one, "the same for India where shops allow"). Nothing here is
 * published: the region crawl (.github/workflows/catalogue-in.yml) writes
 * data/regions/in/ only, and no page reads it yet.
 *
 * Read on 2026-10-09 as PriceSniffsBot only, robots.txt first (D23). Every
 * Shopify shop's home page said `Shopify.currency` INR at rate 1.0 and
 * `/meta.json` currency INR: a rupee price list kept in rupees. Nykaa, Purplle
 * and Ustraa state `priceCurrency` INR in each product page's JSON-LD.
 * Marketplaces stay out (D29); the owner's marketplace decision for India is
 * still open (plan, owner decision 4).
 *
 * Prices include GST (`IN_TAX_NOTE`). Delivery is standard delivery read off
 * the shop's own page; a cash on delivery fee is recorded as `codFee`, a
 * footnote, never priced in.
 *
 * No affiliate field. Every shop carries `imageBasis` (owner decision of 9 Oct 2026, D24): see src/types/regionRetailer.ts.
 */
import { IN_TAX_NOTE, type RegionRetailer } from '../types/regionRetailer.js';

const CHECKED = '2026-10-09';

/** The second research round of 23 October 2026 (docs/BETA-SCORECARD-2026-10-23.md), shops found by search and read as PriceSniffsBot. */
const FOUND = '2026-10-23';

const SHOPIFY_INR = 'Shopify.currency {"active":"INR","rate":"1.0"}, /meta.json currency INR';

/** Part payments, add ons, rewards and quick commerce bundles, not a bottle to buy on its own. */
const NOT_FOR_SALE_TYPES = ['Upsell', 'Free Gift', 'zepto', 'Flexi Box', 'Partial Payment', 'GWP', 'Sample'] as const;

function unverified(notes: string): RegionRetailer['delivery'] {
  return { standard: null, freeOver: null, estimatedDays: null, verifiedAt: CHECKED, confidence: 'unverified', notes };
}

export const IN_RETAILERS: readonly RegionRetailer[] = [
  {
    id: 'nykaa',
    name: 'Nykaa',
    region: 'IN',
    currency: 'INR',
    domain: 'www.nykaa.com',
    homepage: 'https://www.nykaa.com/',
    tiers: ['designer', 'niche', 'mideast'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: {
      kind: 'sitemap',
      sitemapRoute: {
        // Listed in the sitemap index its robots.txt names (sitemap-v2/sitemap-index.xml).
        roots: ['https://www.nykaa.com/sitemap-v2/sitemap-products-index.xml'],
        follow: '/sitemap-products-\\d+\\.xml$',
        product: '^https://www\\.nykaa\\.com/[^/]*(?:eau-de-parfum|eau-de-toilette|eau-de-cologne|perfume|parfum|cologne|attar|edp|edt)[^/]*/p/\\d+$',
        exclude: '(?:deo|deodorant|body-mist|mist|lotion|shower|soap|candle|diffuser|hair|room|car-)',
        maxSitemaps: 8,
        requireGbp: true,
        // The JSON-LD name carries no size ("Hugo Boss Intense Eau De Parfum");
        // the page's own product record beside it does ("brandName":"Hugo Boss",
        // "packSize":"125ml", the size of the sku the JSON-LD names). Applied only
        // when the page yields one listing.
        titleParts: ['"brandName":"[^"]*","packSize":"(\\d{1,4}(?:\\.\\d)?\\s?ml)"'],
      },
    },
    // Round 2: its JSON-LD sku and mpn are the bottle's barcode on many pages (6293708700035).
    // All seven product sitemaps are read (3,069 perfume addresses, 2026-10-09);
    // what limits it is one product page per request: 295 in 14 minutes.
    // 23 Oct 2026: 40 to 55 minutes at the same 2 second gap (1,649 of 3,069 addresses were read, 751 not re-seen): about 1,300
    // pages a run; the crawl's run limit is 64 minutes (catalogue-in.yml, tests/regionHarvest.test.ts).
    pageBudget: { minutes: 55, newPages: 1400 },
    skuIsBarcode: true,
    minRequestGapMs: 2000,
    delivery: {
      standard: 70,
      freeOver: 299,
      freeOverInclusive: true,
      minimumOrder: 149,
      estimatedDays: null,
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://www.nykaa.com/shipping-policy',
        quote: 'Free Shipping on All Orders of ₹299 and above for all other users, ₹70 as Shipping Charges apply on orders below ₹299. We are currently not accepting any orders below ₹149 for all users.',
        readAt: CHECKED,
      },
      notes: 'Free for all orders for its Prive Platinum and Gold members (a membership perk, never priced in). Cash on delivery not accepted below ₹249 or above ₹50,000.',
    },
    taxNote: IN_TAX_NOTE,
    checked:
      `${CHECKED}: robots.txt 200 (Allow /, sitemap-v2 index named); 7 product sitemaps of 50,000 addresses (about 405 perfume addresses in the first); ` +
      'two product pages read, each one JSON-LD Product with priceCurrency INR (Hugo Boss Intense EDP ₹7,750).',
  },
  {
    id: 'purplle',
    name: 'Purplle',
    region: 'IN',
    currency: 'INR',
    domain: 'www.purplle.com',
    homepage: 'https://www.purplle.com/',
    tiers: ['designer', 'mideast'],
    enabled: false,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    blockedReason:
      'Refused to the crawl runner: from GitHub Actions its sitemap (/sitemap/products/all-subcategories.xml) is answered with a 545 byte page that only loads a bot-check script, instead of the sitemap, on two runs (2026-10-09, runs 37886577840 and 37887989045). From other networks the same request as PriceSniffsBot gets the sitemap. A challenge is a refusal (D23): not worked around. Readable again only if the shop lets the bot through.',
    route: {
      kind: 'sitemap',
      sitemapRoute: {
        // all-subcategories.xml is listed in the sitemap index its robots.txt names.
        roots: ['https://www.purplle.com/sitemap/products/all-subcategories.xml'],
        follow: '/category-fragrance-(?:men|fragrance-women|colongnes)\\.xml$',
        product: '^https://www\\.purplle\\.com/product/[^/?#]+$',
        exclude: '(?:deo|deodorant|body-spray|no-gas|mist|talc|lotion|shower|soap|gift-set|combo)',
        maxSitemaps: 4,
        requireGbp: true,
      },
    },
    minRequestGapMs: 2000,
    // A sold out page's JSON-LD says price "0" (round 2): never a price. A
    // stored listing is marked out of stock at its last price; a new one is
    // not stored (zeroPriceMeansSoldOut, src/catalogue/regionHarvest.ts).
    zeroPriceMeansSoldOut: true,
    // Its sku is "PPLB" and the bottle's EAN-13 ("PPLB8906111693723", La French
    // Luxure Oudh 100 ml, read 2026-10-09); kept only when the check digit holds.
    skuBarcodeFrom: '^PPLB(\\d{13})$',
    delivery: unverified('Its /shippingpolicy page answered 200 but states no figure in its markup.'),
    taxNote: IN_TAX_NOTE,
    checked:
      `${CHECKED}: robots.txt 200; home 200; fragrance category sitemaps (men 348, women 482 product addresses); ` +
      'a product page read, JSON-LD Product with an Offer in INR (Wild Stone Edge EDP 50ml ₹299).',
  },
  // ── Round 2 (docs/RETAILER-CANDIDATES-US-IN-ROUND2-2026-10-09.md), each route
  // re-checked against its robots.txt as PriceSniffsBot on 2026-10-09 ──
  {
    id: 'perfume-palace',
    name: 'Perfume Palace',
    region: 'IN',
    currency: 'INR',
    domain: 'perfumepalace.in',
    homepage: 'https://perfumepalace.in/',
    tiers: ['designer', 'niche', 'mideast'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-13 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 10); hot linked, never copied.
    logo: {
      src: 'https://perfumepalace.in/cdn/shop/files/Perfume_Palace_logo_Final.png?v=1666518741&width=140',
      shape: 'wordmark',
      ink: 'dark',
      basis: 'own-site-declared',
      source: 'https://perfumepalace.in/',
      readAt: '2026-10-13',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    // 926 of its listings carry the vendor "Seema Mehra", a person, not a house
    // ("Lattafa 24 Carat White Gold Eau De Parfum 100ml", read 2026-10-09).
    vendorNotHouse: ['Seema Mehra'],
    delivery: unverified('Its cart says "Shipping Charges Calculated on checkout"; no delivery page answered at the usual addresses.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (stock); home 200; /products.json 200; ${SHOPIFY_INR} (Shopify.country US to a US caller, still INR at rate 1.0).`,
  },
  {
    id: 'fridaycharm',
    name: 'FridayCharm',
    region: 'IN',
    currency: 'INR',
    domain: 'www.fridaycharm.com',
    homepage: 'https://www.fridaycharm.com/',
    tiers: ['designer', 'niche', 'mideast'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: unverified('No delivery page answered at the usual Shopify addresses.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200 (about 2.5 MB a page); ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'perfume-network',
    name: 'Perfume Network',
    region: 'IN',
    currency: 'INR',
    domain: 'www.perfumenetwork.in',
    homepage: 'https://www.perfumenetwork.in/',
    tiers: ['designer', 'niche', 'mideast'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-13 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 10); hot linked, never copied.
    logo: {
      src: 'https://www.perfumenetwork.in/cdn/shop/files/Untitled_design_-_2026-08-12T135110.670.png?v=1786522905',
      shape: 'square',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://www.perfumenetwork.in/',
      readAt: '2026-10-13',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: unverified('No delivery page answered at the usual Shopify addresses.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'aar-fragrances',
    name: 'AAR Fragrances',
    region: 'IN',
    currency: 'INR',
    domain: 'www.aarfragrances.com',
    homepage: 'https://www.aarfragrances.com/',
    tiers: ['mideast', 'designer'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Its pages carry no JSON-LD: the name is the page's <h1>, the price is in
    // og:price:amount ("₹5,000.00") with product:price:currency "Rupee", read
    // as INR by readOgProductPage (src/catalogue/regionHarvest.ts). Stock is
    // set by its script after load, so it is unknown. Decants and samples are
    // left out by the route: they are not the bottle other shops sell.
    route: {
      kind: 'og-price',
      sitemap: 'https://www.aarfragrances.com/sitemap.xml',
      product: '^https://www\\.aarfragrances\\.com/product/[^/?#]+$',
      exclude: '(?:decant|sample|gift-card)',
    },
    // 2,281 product addresses; 266 read in 14 minutes on the second run. 40 to 55 minutes on 23 Oct 2026 (1,586 not re-seen).
    pageBudget: { minutes: 55, newPages: 1400 },
    minRequestGapMs: 2000,
    delivery: unverified('Not read.'),
    taxNote: IN_TAX_NOTE,
    checked:
      '2026-10-09 (round 2): robots.txt 200 (78 B, Disallow empty); home 200; a product page 200 with og:price tags and no JSON-LD. ' +
      '2026-10-09 (Phase 1): www.aarfragrances.com/robots.txt 200 (Disallow empty); /sitemap.xml 200, 4,577 addresses; three product pages ' +
      'read as PriceSniffsBot (Lattafa Dynasty EDP 100ml ₹5,000.00, YSL Kouros EDT 50ml ₹3,499.00), each og:price:amount with product:price:currency "Rupee".',
  },
  {
    id: 'bombay-perfumery',
    name: 'Bombay Perfumery',
    region: 'IN',
    currency: 'INR',
    domain: 'www.bombayperfumery.com',
    homepage: 'https://www.bombayperfumery.com/',
    tiers: ['niche'],
    singleBrandOnly: 'Bombay Perfumery',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: 0,
      freeOver: null,
      estimatedDays: [4, 5],
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://www.bombayperfumery.com/policies/shipping-policy',
        quote: 'All domestic orders will take about 4 -5 days for delivery from the date of dispatch. ... Free shipping is offered to only customers in India.',
        readAt: CHECKED,
      },
    },
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR}, Shopify.country IN. Its "Partial Payment" product is dropped.`,
  },
  {
    id: 'bellavita-india',
    name: 'Bella Vita Organic',
    region: 'IN',
    currency: 'INR',
    domain: 'bellavitaorganic.com',
    homepage: 'https://bellavitaorganic.com/',
    tiers: ['designer'],
    // The UK registry's bellavita-luxury entry names the house the same way.
    singleBrandOnly: 'BellaVita',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-13 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 10); hot linked, never copied.
    logo: {
      src: 'https://bellavitaorganic.com/cdn/shop/files/Bella_Vita_Logo_360_E_2x_d60de42b-fa50-45b3-b490-be70ac1fffa1.png?v=1716533001&width=668',
      shape: 'wordmark',
      ink: 'dark',
      basis: 'own-site-declared',
      source: 'https://bellavitaorganic.com/',
      readAt: '2026-10-13',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: null,
      estimatedDays: null,
      verifiedAt: CHECKED,
      confidence: 'unverified',
      source: {
        url: 'https://bellavitaorganic.com/pages/shipping-policy',
        quote: 'The shipping and handling charges are given at the time of check out and consumers will know about this before making payments.',
        readAt: CHECKED,
      },
      notes: 'The page publishes no rate. /policies/ is disallowed by its robots.txt.',
    },
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR}, Shopify.country IN. Its vendor field holds categories (Frag, BnB, Skincare), not the house.`,
  },
  {
    id: 'wild-stone',
    name: 'Wild Stone',
    region: 'IN',
    currency: 'INR',
    domain: 'www.wildstone.in',
    homepage: 'https://www.wildstone.in/',
    tiers: ['designer'],
    singleBrandOnly: 'Wild Stone',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-13 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 10); hot linked, never copied.
    logo: {
      src: 'https://www.wildstone.in/cdn/shop/files/Wild_Stone_Logo_973ee566-ce01-45db-8b37-628380b8d85b_1417x.png?v=1672557783',
      shape: 'wordmark',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://www.wildstone.in/',
      readAt: '2026-10-13',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: 40,
      freeOver: 399,
      freeOverInclusive: false,
      codFee: 50,
      estimatedDays: null,
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://www.wildstone.in/pages/shipping-policy',
        quote: 'There are no shipping charges above Rs. 399/- order value. However, there is a shipping charge of Rs. 40/- if the order value is below Rs. 399/- and Rs.50/- extra for COD Orders.',
        readAt: CHECKED,
      },
    },
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'naso-profumi',
    name: 'Naso Profumi',
    region: 'IN',
    currency: 'INR',
    domain: 'www.nasoprofumi.com',
    homepage: 'https://www.nasoprofumi.com/',
    tiers: ['niche'],
    singleBrandOnly: 'Naso Profumi',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: unverified('Its shipping policy page answered 200 with no rate in it.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR} (Shopify.country US to a US caller, still INR at rate 1.0).`,
  },
  {
    id: 'pilgrim',
    name: 'Pilgrim',
    region: 'IN',
    currency: 'INR',
    domain: 'discoverpilgrim.com',
    homepage: 'https://discoverpilgrim.com/',
    tiers: ['designer'],
    singleBrandOnly: 'Pilgrim',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: unverified('Its FAQ says "We provide free shipping for orders above a certain amount, which is updated regularly" and states no figure.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR}, Shopify.country IN. Mostly skincare.`,
  },
  {
    id: 'the-man-company',
    name: 'The Man Company',
    region: 'IN',
    currency: 'INR',
    domain: 'www.themancompany.com',
    homepage: 'https://www.themancompany.com/',
    tiers: ['designer'],
    singleBrandOnly: 'The Man Company',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: unverified('No shipping page answered at the usual Shopify addresses.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; /products.json 200; ${SHOPIFY_INR}, Shopify.country IN (Shopify, though the candidates pass recorded it as custom).`,
  },
  {
    id: 'ustraa',
    name: 'Ustraa',
    region: 'IN',
    currency: 'INR',
    domain: 'www.ustraa.com',
    homepage: 'https://www.ustraa.com/',
    tiers: ['designer'],
    singleBrandOnly: 'Ustraa',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-13 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 10); hot linked, never copied.
    logo: {
      src: 'https://www.ustraa.com/icon-180x180.png',
      shape: 'square',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://www.ustraa.com/',
      readAt: '2026-10-13',
    },
    route: {
      kind: 'sitemap',
      sitemapRoute: {
        roots: ['https://www.ustraa.com/sitemap.xml'],
        product: '^https://www\\.ustraa\\.com/[^/]*(?:cologne|perfume|fragrance|edp|edt|attar)[^/]*/p$',
        exclude: '(?:soap|face-wash|body-wash|shampoo|deo|talc|pack-of)',
        maxSitemaps: 1,
        requireGbp: true,
      },
    },
    minRequestGapMs: 2000,
    delivery: {
      standard: 49,
      freeOver: 999,
      freeOverInclusive: false,
      estimatedDays: null,
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://www.ustraa.com/content/cms/shipping-and-handling',
        quote: 'Standard delivery option: - FREE shipping for orders above Rs. 999. - Rs. 49 for orders less than Rs.999.',
        readAt: CHECKED,
      },
    },
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (/sitemap/* disallowed, /sitemap.xml allowed); one flat sitemap; a product page read, JSON-LD Product with priceCurrency INR.`,
  },
  {
    id: 'mirah-belle',
    name: 'Mirah Belle',
    region: 'IN',
    currency: 'INR',
    domain: 'mirahbelle.com',
    homepage: 'https://mirahbelle.com/',
    tiers: ['niche'],
    singleBrandOnly: 'Mirah Belle',
    enabled: false,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    blockedReason:
      'No perfume range found: its sitemap (643 addresses, read 2026-10-09) lists skincare, hair care, soaps and floor cleaner; the only "fragrance" addresses are articles and a lemon floor cleaner. /products.json is disallowed by its robots.txt.',
    route: null,
    minRequestGapMs: 2000,
    delivery: unverified('Not read.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200; sitemap read; no perfume found.`,
  },
  {
    id: 'gulab-singh-johrimal',
    name: 'Gulab Singh Johrimal',
    region: 'IN',
    currency: 'INR',
    domain: 'gulabsinghjohrimal.co.in',
    homepage: 'https://gulabsinghjohrimal.co.in/',
    tiers: ['mideast'],
    singleBrandOnly: 'Gulabsingh Johrimal',
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: null,
      estimatedDays: [2, 5],
      verifiedAt: CHECKED,
      confidence: 'unverified',
      source: {
        url: 'https://gulabsinghjohrimal.co.in/policies/shipping-policy',
        quote: 'Orders can only be delivered to addresses within the territory of India. ... Metro Cities 2–5 Business Days Other Cities & Towns 4–7 Business Days',
        readAt: CHECKED,
      },
      notes: 'The policy states timelines and no rate.',
    },
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200; home 200 (gulabsinghjohrimal.com redirects to .co.in); /products.json 200; ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'scentido',
    name: 'Scentido',
    region: 'IN',
    currency: 'INR',
    domain: 'scentido.com',
    homepage: 'https://scentido.com/',
    tiers: ['niche', 'designer'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 2000,
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, 'Candle', 'Oil', 'Discovery Set', 'Gift Cards', 'Bundle'],
    delivery: unverified('Its /policies/ pages are disallowed by its robots.txt and no /pages/ shipping page was found, so none was read.'),
    taxNote: IN_TAX_NOTE,
    checked: `${FOUND}: found by a search for Indian niche perfume shops; robots.txt 200 (User-agent * allows /products.json; the Crawl-delay lines belong to other named bots); home 200; /products.json 200 (about 650 KB a page, 32 houses in the first 250); ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'maison-des-parfums-in',
    name: 'Maison des Parfums',
    region: 'IN',
    currency: 'INR',
    domain: 'mdpindia.com',
    homepage: 'https://mdpindia.com/',
    tiers: ['niche', 'designer'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    // Its product type names the strength on nearly every bottle ("Eau De Parfum", "EDP", "Eau de Toilette") and its titles do not.
    strengthFromProductType: true,
    route: { kind: 'shopify' },
    minRequestGapMs: 2000,
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, 'Body Lotion', 'Bath & Shower Gel', 'Body Shower Gel'],
    delivery: {
      standard: 0,
      freeOver: null,
      estimatedDays: null,
      verifiedAt: FOUND,
      confidence: 'confirmed',
      source: {
        url: 'https://mdpindia.com/policies/shipping-policy',
        quote: 'Maison Des Parfums does not levy any shipping & handling charges.',
        readAt: FOUND,
      },
      notes: 'Free shipping on every order. The page says most orders are dispatched within 5 to 7 business days (a dispatch time, not a delivery window), so no window is recorded.',
    },
    taxNote: IN_TAX_NOTE,
    checked: `${FOUND}: found by a search for Indian niche perfume shops (Delhi and Mumbai boutiques); robots.txt 200 (stock); home 200; /products.json 200 (about 800 KB a page, 33 houses in the first 250); ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'scentira',
    name: 'Scentira',
    region: 'IN',
    currency: 'INR',
    domain: 'scentira.in',
    homepage: 'https://scentira.in/',
    tiers: ['niche', 'designer', 'mideast'],
    enabled: true,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 2000,
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, 'Bundle', 'Sample', 'Full Size', 'product'],
    // Its own decants and bundles carry the vendor "Scentira" (86 of the first 250): the shop's name, not a house.
    vendorNotHouse: ['Scentira'],
    delivery: {
      standard: null,
      freeOver: null,
      estimatedDays: [3, 5],
      verifiedAt: FOUND,
      confidence: 'unverified',
      source: {
        url: 'https://scentira.in/policies/shipping-policy',
        quote: 'Standard Delivery: Expect your order to arrive within 3-5 business days.',
        readAt: FOUND,
      },
      notes: 'A window and no figure: the cost is worked out from the order weight and place and is not stated, and the cart offers free shipping above a threshold the policy page does not state.',
    },
    taxNote: IN_TAX_NOTE,
    checked: `${FOUND}: found by a search for Indian perfume shops; robots.txt 200 (stock); home 200; /products.json 200 (about 1.6 MB a page, 55 vendors in the first 250); ${SHOPIFY_INR}, Shopify.country IN.`,
  },
  {
    id: 'kannauj-attar',
    name: 'Kannauj Attar',
    region: 'IN',
    currency: 'INR',
    domain: 'kannaujattar.com',
    homepage: 'https://kannaujattar.com/',
    tiers: ['mideast'],
    singleBrandOnly: 'Kannauj Attar',
    enabled: false,
    // Owner decision 2026-10-09 (D24): the shop's own photo, hot-linked, never copied. Delete this line to switch it off.
    imageBasis: 'hotlink-unlicensed',
    blockedReason:
      'WooCommerce. Its public Store API (/wp-json/wc/store/v1/products, robots.txt allows everything) answers in INR (currency_code INR, minor unit 2) and the page also shows dollars, which are never read. But its attars and sprays are variable products whose list entry gives only a "from" price and no size; reading each size needs one request per variation. Off until that read is built.',
    route: null,
    minRequestGapMs: 2000,
    delivery: unverified('No shipping page found at the usual addresses.'),
    taxNote: IN_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (24 B, no restriction, no sitemap); home 200; Store API page one: 20 products, 4 simple (sets and kits), 16 variable.`,
  },
];
