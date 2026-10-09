/**
 * The countries PriceSniffs is built for, in one place (docs/INTERNATIONAL-PLAN.md,
 * Phase 0; owner decisions of 9 October 2026, docs/DECISIONS.md D30).
 *
 * Everything that differs between countries is data here, not logic: the
 * name and flag, the currency and how money is written, the locale, the size
 * units, the address prefix, whether the country is live, and the hooks the
 * legal pages and the delivery rows will read. The United Kingdom is live and
 * sits at the root of the site, exactly as before; the United States (`/us/`)
 * and India (`/in/`) are present but not live, so nothing a visitor sees
 * changes until one of them is switched on.
 *
 * Kept free of the DOM and of the catalogue, so Node scripts, the price alert
 * emails and the tests can all read it. The menu (demo/app.ts), the flags
 * (demo/flags.ts), the router (demo/router.ts), the money formatter
 * (src/services/money.ts) and the welcome pop-up (demo/regionWelcome.ts) read
 * it; tests/regionConfig.test.ts pins it.
 */

export type RegionId = 'GB' | 'US' | 'IN';

/** Which variant of the disclosure, privacy and terms text a country gets (docs/LEGAL.md). */
export type LegalVariant = 'uk' | 'us' | 'in';

/** Whether the shelf price includes tax, and so what a delivered total means (plan section 4). */
export type TaxModel = 'vat-included' | 'sales-tax-at-checkout' | 'gst-included-mrp';

export interface DeliveryModel {
  /** The word for getting the bottle to the door. */
  word: 'delivery' | 'shipping';
  /** What the local address code is called. */
  postcodeWord: 'postcode' | 'ZIP code' | 'PIN code';
  /** India: a cash on delivery fee is a footnote, never priced in. */
  codFootnote: boolean;
}

export interface RegionConfig {
  id: RegionId;
  /** The name as the menu and the welcome pop-up show it. */
  name: 'United Kingdom' | 'United States' | 'India';
  /** The flag drawn beside the name (demo/flags.ts). */
  flag: RegionId;
  /** ISO 4217, as shown in the menu and read out. */
  currency: 'GBP' | 'USD' | 'INR';
  /** The symbol written before an amount. */
  currencySymbol: '£' | '$' | '₹';
  /** The currency's name in a sentence or a field label ("Target price in pounds"). */
  currencyName: 'pounds' | 'dollars' | 'rupees';
  /** Intl locale for numbers and dates. */
  locale: 'en-GB' | 'en-US' | 'en-IN';
  /** The hreflang this region's pages declare once more than one is live. */
  hreflang: 'en-GB' | 'en-US' | 'en-IN';
  /**
   * How an amount is written. The United Kingdom keeps exactly what the site
   * has always printed, two decimals and no thousands separator (£1299.00),
   * so no UK price changes by a byte. India is whole rupees with Indian
   * grouping (₹1,23,450).
   */
  money: { fractionDigits: 0 | 2; grouping: boolean };
  /** Sizes in ml, or US fluid ounces beside ml ("3.4 fl oz (100 ml)"; owner decision 7). */
  units: 'ml' | 'floz-and-ml';
  /** The first segment of every address in this region; empty for the UK at the root. */
  pathPrefix: '' | 'us' | 'in';
  /** True once the region's pages are built and shown. Only the UK is live today. */
  live: boolean;
  /** Time zone names that suggest this region in the welcome pop-up. */
  timeZones: readonly string[];
  /** The reference price's local name. */
  referencePriceName: 'RRP' | 'MSRP' | 'MRP';
  taxModel: TaxModel;
  delivery: DeliveryModel;
  legal: LegalVariant;
}

/** In the order the menu and the welcome pop-up list them. The first is the default. */
export const REGION_CONFIGS: readonly RegionConfig[] = [
  {
    id: 'GB',
    name: 'United Kingdom',
    flag: 'GB',
    currency: 'GBP',
    currencySymbol: '£',
    currencyName: 'pounds',
    locale: 'en-GB',
    hreflang: 'en-GB',
    money: { fractionDigits: 2, grouping: false },
    units: 'ml',
    pathPrefix: '',
    live: true,
    timeZones: ['Europe/London', 'Europe/Belfast', 'Europe/Guernsey', 'Europe/Jersey', 'Europe/Isle_of_Man'],
    referencePriceName: 'RRP',
    taxModel: 'vat-included',
    delivery: { word: 'delivery', postcodeWord: 'postcode', codFootnote: false },
    legal: 'uk',
  },
  {
    id: 'US',
    name: 'United States',
    flag: 'US',
    currency: 'USD',
    currencySymbol: '$',
    currencyName: 'dollars',
    locale: 'en-US',
    hreflang: 'en-US',
    money: { fractionDigits: 2, grouping: true },
    units: 'floz-and-ml',
    pathPrefix: 'us',
    live: false,
    timeZones: ['America/', 'Pacific/Honolulu', 'US/'],
    referencePriceName: 'MSRP',
    taxModel: 'sales-tax-at-checkout',
    delivery: { word: 'shipping', postcodeWord: 'ZIP code', codFootnote: false },
    legal: 'us',
  },
  {
    id: 'IN',
    name: 'India',
    flag: 'IN',
    currency: 'INR',
    currencySymbol: '₹',
    currencyName: 'rupees',
    locale: 'en-IN',
    hreflang: 'en-IN',
    money: { fractionDigits: 0, grouping: true },
    units: 'ml',
    pathPrefix: 'in',
    live: false,
    timeZones: ['Asia/Kolkata', 'Asia/Calcutta'],
    referencePriceName: 'MRP',
    taxModel: 'gst-included-mrp',
    delivery: { word: 'delivery', postcodeWord: 'PIN code', codFootnote: true },
    legal: 'in',
  },
];

/**
 * The "Select your country" welcome pop-up (plan section 2, "Welcome").
 * Built and tested, and off: it also needs a second live region before it can
 * show, so switching this on alone changes nothing while the UK is the only
 * one. Turn it on with the US beta.
 */
export const REGION_WELCOME_ON = false;

/** Where a visitor's chosen region is kept in their browser (listed on the cookies page once it can be written). */
export const REGION_STORAGE_KEY = 'pricesniffs.region';

export const DEFAULT_REGION: RegionConfig = REGION_CONFIGS[0]!;

export function regionById(id: string | null | undefined): RegionConfig | undefined {
  return REGION_CONFIGS.find((r) => r.id === id);
}

export function liveRegions(): RegionConfig[] {
  return REGION_CONFIGS.filter((r) => r.live);
}

/**
 * The region an address belongs to, and the address without its prefix. Only
 * a live region's prefix counts: while the US is not live, /us/anything is an
 * address like any other (a page not found), exactly as before.
 */
export function splitRegionPrefix(pathname: string): { region: RegionConfig; rest: string } {
  const m = /^\/([a-z]{2})(?=\/|$)(.*)$/.exec(pathname);
  if (m) {
    const region = REGION_CONFIGS.find((r) => r.pathPrefix !== '' && r.pathPrefix === m[1] && r.live);
    if (region) return { region, rest: m[2] || '/' };
  }
  return { region: DEFAULT_REGION, rest: pathname };
}

/** An address inside a region: the UK's paths unchanged, /us/... and /in/... for the others. */
export function regionPath(region: RegionConfig, path: string): string {
  if (region.pathPrefix === '') return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return p === '/' ? `/${region.pathPrefix}/` : `/${region.pathPrefix}${p}`;
}

/** A region's home page. */
export function regionHome(region: RegionConfig): string {
  return regionPath(region, '/');
}

let active: RegionConfig | null = null;

/**
 * The region this page is in, read once from the address (a region only
 * changes with a full page load). The UK under Node and on every UK address.
 */
export function activeRegion(): RegionConfig {
  if (active) return active;
  const pathname = (globalThis as { location?: { pathname?: string } }).location?.pathname ?? '/';
  active = splitRegionPrefix(pathname).region;
  return active;
}

/** For tests: forget the cached region so the next call reads the address again. */
export function resetActiveRegionForTests(): void {
  active = null;
}

/**
 * The region a browser time zone suggests, or null. No request and no
 * storage: Intl's own answer, read in the browser.
 */
export function suggestRegionForTimeZone(timeZone: string | null | undefined): RegionConfig | null {
  if (!timeZone) return null;
  return REGION_CONFIGS.find((r) => r.timeZones.some((z) => (z.endsWith('/') ? timeZone.startsWith(z) : timeZone === z))) ?? null;
}

/**
 * hreflang alternates for an unprefixed path: one per live region plus
 * x-default (the UK page). Empty while only one region is live, since a page
 * with no other version has nothing to declare.
 */
export function hreflangAlternates(siteUrl: string, path: string): { hreflang: string; href: string }[] {
  const live = liveRegions();
  if (live.length < 2) return [];
  return [
    ...live.map((r) => ({ hreflang: r.hreflang, href: `${siteUrl}${regionPath(r, path)}` })),
    { hreflang: 'x-default', href: `${siteUrl}${regionPath(DEFAULT_REGION, path)}` },
  ];
}
