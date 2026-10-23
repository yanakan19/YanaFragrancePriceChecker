/**
 * Canadian shops for the Canada beta (docs/INTERNATIONAL-PLAN.md, "Canada",
 * 22 October 2026). The region crawl (.github/workflows/catalogue-ca.yml)
 * reads these shops and writes data/regions/ca/ only; the deploy builds the
 * /ca/ pages from that folder.
 *
 * Every shop was read on 2026-10-22 as PriceSniffsBot and nothing else,
 * robots.txt first (docs/DECISIONS.md D23). For each Shopify shop the home
 * page's `Shopify.currency` and `/meta.json` were read: all said CAD at rate
 * 1.0, country CA, which is a Canadian dollar price list kept in Canadian
 * dollars, not a conversion. Perfume Plus (a Wix store) states
 * `priceCurrency` CAD in each product page's JSON-LD. A shop that quoted CAD
 * only as a conversion (Authentic Perfume Store, rate 1.43) is not listed.
 *
 * The shops that refused the bot (a 403 on robots.txt and the home page) are
 * listed switched off, with what they answered, so nobody tries them again
 * another way: a shop that refuses is left out (D23).
 *
 * Delivery is standard delivery only, from the shop's own page with the
 * sentence quoted where it was found cheaply; `unverified` otherwise. Tax is
 * never estimated: GST, HST and PST depend on the province, so the note is
 * `CA_TAX_NOTE`.
 *
 * No affiliate field. Every shop carries `imageBasis` (D24): see src/types/regionRetailer.ts.
 */
import { CA_TAX_NOTE, type RegionRetailer } from '../types/regionRetailer.js';

const CHECKED = '2026-10-22';

/** What a Shopify shop said about its currency on 2026-10-22, as the bot. */
const SHOPIFY_CAD = 'Shopify.currency {"active":"CAD","rate":"1.0"}, /meta.json currency CAD, country CA';

/** Gifts with purchase, sample pickers, gift cards and loyalty rewards, not things to buy on their own. */
const NOT_FOR_SALE_TYPES = ['Free Gift', 'Gift Cards', 'Gift Card', 'Perfume Sample', 'Gift With Purchase', 'GWP'] as const;

/** Body care, candles and the like that these shops file next to their perfume. */
const NOT_PERFUME_TYPES = [
  'Deodorant', 'After Shave', 'Aftershave', 'Body Wash', 'Body Spray', 'Body Lotion', 'Body Cream', 'Shower Gel', 'Hair Mist',
  'Hair Perfume', 'Laundry Perfume', 'Bath & Body', 'Candles', 'Bougie', "Parfum d'ambiance", 'Tea',
] as const;

function unverified(notes: string): RegionRetailer['delivery'] {
  return { standard: null, freeOver: null, estimatedDays: null, verifiedAt: CHECKED, confidence: 'unverified', notes };
}

function refused(id: string, name: string, domain: string, answered: string): RegionRetailer {
  return {
    id,
    name,
    region: 'CA',
    currency: 'CAD',
    domain,
    homepage: `https://${domain}/`,
    tiers: ['designer'],
    enabled: false,
    imageBasis: 'hotlink-unlicensed',
    blockedReason: `Refused PriceSniffsBot on ${CHECKED}: ${answered}. Left out under D23 (a shop that refuses is never worked around: no browser user agent, no proxy, no rendered visit).`,
    route: null,
    minRequestGapMs: 2000,
    delivery: unverified('Not read: the shop refused the crawler.'),
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: ${answered}.`,
  };
}

export const CA_RETAILERS: readonly RegionRetailer[] = [
  {
    id: 'discount-fragrances-ca',
    name: 'Discount Fragrances',
    region: 'CA',
    currency: 'CAD',
    domain: 'discountfragrances.ca',
    homepage: 'https://discountfragrances.ca/',
    tiers: ['designer', 'mideast'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-23 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 11); hot linked, never copied.
    logo: {
      src: 'https://discountfragrances.ca/cdn/shop/files/discount_logo_blue_lettering_transparent_v2.png?v=1760217897&width=500',
      shape: 'wordmark',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://discountfragrances.ca/',
      readAt: '2026-10-23',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: 129,
      estimatedDays: [1, 5],
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://discountfragrances.ca/pages/faq',
        quote: 'FREE SHIPPING ON ORDERS OVER $129 ... Most orders are processed within 2 business days. Once shipped, delivery typically takes 1-5 business days depending on location.',
        readAt: CHECKED,
      },
      notes: 'The paid rate below the threshold is worked out at checkout and not stated, so it stays null.',
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200; ${SHOPIFY_CAD}. Edmonton, Alberta.`,
  },
  {
    id: 'perfumeonline-ca',
    name: 'PerfumeOnline.ca',
    region: 'CA',
    currency: 'CAD',
    domain: 'perfumeonline.ca',
    homepage: 'https://perfumeonline.ca/',
    tiers: ['designer', 'niche'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: 149,
      freeOverInclusive: false,
      estimatedDays: [1, 7],
      verifiedAt: '2026-10-23',
      confidence: 'confirmed',
      source: {
        url: 'https://perfumeonline.ca/policies/shipping-policy',
        quote: "We offer free shipping on orders over $149 across Canada and USA. ... Ontario 1 – 4 Business Days CA$8.95 ... Quebec 1 – 5 Business Days CA$9.95 ... Alberta 3 – 7 Business Days CA$12.95",
        readAt: '2026-10-23',
      },
      notes: "The paid rate depends on the province (CA$8.95 Ontario, CA$9.95 Quebec, CA$12.95 most other provinces, CA$14.75 the territories), so no single figure is recorded and it stays null. Orders ship within 24 to 48 business hours.",
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200; ${SHOPIFY_CAD}. Whitby, Ontario.`,
  },
  {
    id: 'fragrance-canada',
    name: 'Fragrance Canada',
    region: 'CA',
    currency: 'CAD',
    domain: 'fragrancecanada.ca',
    homepage: 'https://fragrancecanada.ca/',
    tiers: ['designer', 'mideast'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-23 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 11); hot linked, never copied.
    logo: {
      src: 'https://fragrancecanada.ca/cdn/shop/files/New_Logo_Update_440x.png?v=1792200766',
      shape: 'wordmark',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://fragrancecanada.ca/',
      readAt: '2026-10-23',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: 249,
      freeOverInclusive: false,
      estimatedDays: null,
      verifiedAt: '2026-10-23',
      confidence: 'confirmed',
      source: {
        url: 'https://fragrancecanada.ca/policies/shipping-policy',
        quote: "FREE SHIPPING ON ORDERS OVER $249! ... Orders are processed and shipped out from our warehouse within 2-7 business days. ... Ontario - Delivery within 2-5 business days after being processed and shipping out.",
        readAt: '2026-10-23',
      },
      notes: "The paid rate is not stated, so it stays null. Delivery after processing runs 2 to 5 business days in Ontario up to 7 to 12 in Newfoundland and PEI, on top of 2 to 7 days of processing, so no single window is recorded.",
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200; ${SHOPIFY_CAD}. Scarborough, Ontario.`,
  },
  {
    id: 'fragrance-online-co',
    name: 'Fragrance Online Co.',
    region: 'CA',
    currency: 'CAD',
    domain: 'fragranceonlineco.ca',
    homepage: 'https://fragranceonlineco.ca/',
    tiers: ['designer', 'niche', 'mideast'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Quotes USD to a US runner unless asked for its Canadian market; CAD at rate 1 with ?country=CA (src/types/regionRetailer.ts).
    marketQuery: 'country=CA',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: 149,
      freeOverInclusive: false,
      estimatedDays: [1, 4],
      verifiedAt: '2026-10-23',
      confidence: 'confirmed',
      source: {
        url: 'https://fragranceonlineco.ca/policies/shipping-policy',
        quote: "Standard Shipping (Canada) Free on orders over $149 Orders under $149: Shipping calculated at checkout Estimated delivery: 1–4 business days",
        readAt: '2026-10-23',
      },
      notes: "The paid rate is calculated at checkout and not stated, so it stays null. Orders are processed within 0 to 1 business days; same day delivery in the Toronto area is a flat $27.99 and never free.",
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200 (about 1.2 MB a page); ${SHOPIFY_CAD}. Richmond Hill, Ontario.`,
  },
  {
    id: 'maximum-fragrance',
    name: 'Maximum Fragrance',
    region: 'CA',
    currency: 'CAD',
    domain: 'maximumfragrance.ca',
    homepage: 'https://maximumfragrance.ca/',
    tiers: ['designer', 'niche', 'mideast'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-23 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 11); hot linked, never copied.
    logo: {
      src: 'https://maximumfragrance.com/cdn/shop/files/Maximum-Fragrance-logo.jpg?v=1760057336&width=1640',
      shape: 'wordmark',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://maximumfragrance.ca/',
      readAt: '2026-10-23',
    },
    // Quotes USD to a US runner unless asked for its Canadian market; CAD at rate 1 with ?country=CA (src/types/regionRetailer.ts).
    marketQuery: 'country=CA',
    // Its titles name no strength; its product type does ("Eau De Parfum", "Extrait De Parfum") on the typed 40% (23 Oct 2026).
    strengthFromProductType: true,
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    // Its Shopify sku is the bottle's 12 digit UPC (778628036083, 737052796727); a figure that fails the check digit is dropped.
    skuIsBarcode: true,
    excludeProductTypes: NOT_FOR_SALE_TYPES,
    delivery: {
      standard: null,
      freeOver: 149,
      freeOverInclusive: false,
      estimatedDays: null,
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://maximumfragrance.ca/pages/faq',
        quote: 'Free Shipping On Orders Over $149*',
        readAt: CHECKED,
      },
      notes: 'The announcement bar carries an asterisk whose conditions were not found; the paid rate is not stated, so it stays null.',
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /; the Crawl-delay lines are for other named bots); home 200; /products.json 200; ${SHOPIFY_CAD}. Mississauga, Ontario.`,
  },
  {
    id: 'perfume-factory-ca',
    name: 'Perfume Factory',
    region: 'CA',
    currency: 'CAD',
    domain: 'perfumefactory.ca',
    homepage: 'https://perfumefactory.ca/',
    tiers: ['designer'],
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-23 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 11); hot linked, never copied.
    logo: {
      src: 'https://perfumefactory.ca/cdn/shop/files/original-logo.jpg?v=1781549077&width=500',
      shape: 'wordmark',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://perfumefactory.ca/',
      readAt: '2026-10-23',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, ...NOT_PERFUME_TYPES],
    delivery: unverified('No delivery page answered at the usual Shopify addresses.'),
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200; ${SHOPIFY_CAD}. Niagara-on-the-Lake, Ontario, in business for over 40 years.`,
  },
  {
    id: 'h-parfums',
    name: 'H Parfums',
    region: 'CA',
    currency: 'CAD',
    domain: 'hparfums.com',
    homepage: 'https://hparfums.com/',
    tiers: ['niche'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-23 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 11); hot linked, never copied.
    logo: {
      src: 'https://hparfums.com/cdn/shop/files/Favicon_H-parfums_f9bd88ed-f092-4158-8f00-c76a86a88305.png?v=1628706473&width=180',
      shape: 'square',
      ink: 'dark',
      basis: 'own-site-declared',
      source: 'https://hparfums.com/',
      readAt: '2026-10-23',
    },
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    // Not strengthFromProductType: its product type is "Parfum" on 712 of 714 products, the shop's category (the same type
    // sits on "Rouge Smoking Extrait" and on products whose page says eau de parfum), so it states no strength (23 Oct 2026).
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, ...NOT_PERFUME_TYPES],
    // A discovery kit lists "15 x 2 ml": not a bottle other shops sell.
    titleMustMatch: '^(?!.*(?:discovery|kit|coffret|sample|échantillon))',
    delivery: {
      standard: null,
      freeOver: 150,
      freeOverInclusive: false,
      estimatedDays: null,
      verifiedAt: CHECKED,
      confidence: 'confirmed',
      source: {
        url: 'https://hparfums.com/pages/shipping-returns',
        quote: 'Free shipping + 3 free samples of your choice on all orders over $150.',
        readAt: CHECKED,
      },
      notes: 'The paid rate below the threshold is worked out at checkout and not stated, so it stays null. Free shipping across Canada.',
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200 (about 1.3 MB a page); ${SHOPIFY_CAD}. Outremont, Montreal; English pages.`,
  },
  {
    id: 'parfum-exquis',
    name: 'Parfum Exquis',
    region: 'CA',
    currency: 'CAD',
    domain: 'parfumexquis.com',
    homepage: 'https://parfumexquis.com/',
    tiers: ['niche'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Logo read 2026-10-23 from the shop's own homepage by scripts/logo-probe.ts (docs/LOGOS-PLAN.md section 11); hot linked, never copied.
    logo: {
      src: 'https://parfumexquis.com/cdn/shop/files/for_google2.png?crop=center&height=180&v=1682549828&width=180',
      shape: 'square',
      ink: 'own',
      basis: 'own-site-declared',
      source: 'https://parfumexquis.com/',
      readAt: '2026-10-23',
    },
    // Quotes USD to a US runner unless asked for its Canadian market; CAD at rate 1 with ?country=CA (src/types/regionRetailer.ts).
    marketQuery: 'country=CA',
    // Its titles name no strength; its product type does ("Eau de parfum", "Extrait de Parfum") on nearly every bottle.
    strengthFromProductType: true,
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, ...NOT_PERFUME_TYPES, 'Perfume Discovery set', 'Charms & Pendants in Jewelry', 'Perfume pendant'],
    delivery: {
      standard: null,
      freeOver: 60,
      freeOverInclusive: true,
      estimatedDays: [3, 5],
      verifiedAt: '2026-10-23',
      confidence: 'confirmed',
      source: {
        url: 'https://parfumexquis.com/?country=CA',
        quote: 'Free shipping on orders 60$+',
        readAt: '2026-10-23',
      },
      notes: 'The threshold is the home page announcement bar asked for the Canadian market (CAD); the same bar reads 30$ to a US visitor. The window is from https://parfumexquis.com/policies/shipping-policy: "please allow 3-5 days from the dispatch date for your order to arrive". That page states no rate and no threshold, so the paid rate stays null.',
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200; /products.json 200 (about 1.9 MB a page); ${SHOPIFY_CAD}. Montreal.`,
  },
  {
    id: 'niche-essence',
    name: 'Niche Essence',
    region: 'CA',
    currency: 'CAD',
    domain: 'www.nicheessence.com',
    homepage: 'https://www.nicheessence.com/',
    tiers: ['niche'],
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    // Quotes USD to a US runner unless asked for its Canadian market; CAD at rate 1 with ?country=CA (src/types/regionRetailer.ts).
    marketQuery: 'country=CA',
    route: { kind: 'shopify' },
    minRequestGapMs: 1500,
    // Three in four of its listings are 3 ml samples ("Amouage Outlands Essence De Parfum Sample 3ml"), filed as type "Sample".
    excludeProductTypes: [...NOT_FOR_SALE_TYPES, ...NOT_PERFUME_TYPES, 'Sample', 'Discovery Set', 'Coffret'],
    delivery: {
      standard: null,
      freeOver: 75,
      freeOverInclusive: false,
      estimatedDays: null,
      verifiedAt: '2026-10-23',
      confidence: 'confirmed',
      source: {
        url: 'https://www.nicheessence.com/policies/shipping-policy',
        quote: "Enjoy free shipping on orders over $75 across Canada",
        readAt: '2026-10-23',
      },
      notes: "The paid rate and the delivery window are not stated, so they stay null.",
    },
    taxNote: CA_TAX_NOTE,
    checked: `${CHECKED}: robots.txt 200 (User-agent * allows /); home 200 at www.; /products.json 200; ${SHOPIFY_CAD}. Toronto.`,
  },
  {
    id: 'perfume-plus-ca',
    name: 'Perfume Plus',
    region: 'CA',
    currency: 'CAD',
    domain: 'www.perfumeplus.ca',
    homepage: 'https://www.perfumeplus.ca/',
    tiers: ['designer'],
    fragranceOnlyCatalogue: true,
    enabled: true,
    imageBasis: 'hotlink-unlicensed',
    route: {
      kind: 'sitemap',
      sitemapRoute: {
        roots: ['https://www.perfumeplus.ca/sitemap.xml'],
        follow: 'store-products-sitemap\\.xml$',
        product: '^https://www\\.perfumeplus\\.ca/product-page/[^/?#]+$',
        maxSitemaps: 2,
        requireGbp: true,
      },
    },
    minRequestGapMs: 2000,
    delivery: unverified('A Shipping and Returns page exists (a Wix page drawn by script); its terms were not read.'),
    taxNote: CA_TAX_NOTE,
    checked:
      `${CHECKED}: robots.txt 200 (User-agent * allows /; Crawl-delay lines are for dotbot and AhrefsBot); home 200; /products.json 400; ` +
      'store-products-sitemap.xml lists about 175 product pages; a product page read has one JSON-LD Product, offers in priceCurrency CAD (Burberry Her, $139).',
  },
  refused('fragrancebuy-ca', 'FragranceBuy.ca', 'fragrancebuy.ca', 'robots.txt, the home page and /products.json all answered 403'),
  refused('ace-gifts-plus', 'Ace Gifts Plus', 'acegiftsplus.ca', 'robots.txt, the home page and /products.json all answered 403'),
  refused('sephora-ca', 'Sephora Canada', 'www.sephora.com', 'robots.txt and the home page answered 403'),
  refused('holt-renfrew', 'Holt Renfrew', 'www.holtrenfrew.com', 'robots.txt, the home page and /products.json all answered 403'),
  refused('simons', 'Simons', 'www.simons.ca', 'robots.txt and the home page answered 403'),
  refused('london-drugs', 'London Drugs', 'www.londondrugs.com', 'robots.txt and the home page answered 403'),
  refused('shoppers-drug-mart', 'Shoppers Drug Mart', 'www.shoppersdrugmart.ca', 'robots.txt answered 200 and allows all bots, but the home page answered 403'),
  refused('ssense', 'SSENSE', 'www.ssense.com', 'robots.txt answered 200, but the home page answered 403'),
  refused('walmart-ca', 'Walmart Canada', 'www.walmart.ca', 'robots.txt answered 200, but the home page redirected to its block page (/blocked)'),
];
