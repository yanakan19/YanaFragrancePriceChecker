/**
 * Switching country, and the slim bar that offers it (docs/INTERNATIONAL-PLAN.md
 * section 2, "The menu: switching and remembering"; public beta of 9 October
 * 2026).
 *
 * Where the menu (and the bar) takes a visitor who picks another country:
 *   - on a product page: that product's page there, when it is sold there;
 *     else its brand's page there, when the brand is sold there; else that
 *     country's home;
 *   - on a brand page: the brand's page there, else that country's Brands;
 *   - on a shop page: that country's Shops (every shop sells in one country);
 *   - on a note page: that country's Notes;
 *   - on any other page that every country has (Deals, Explore, About, the
 *     guides, the Legal Notice and the rest): the same page there, filters
 *     kept;
 *   - anywhere else (the account pages, which are the visitor's own and not
 *     the country's, a page not found, the owner's dashboard): that country's
 *     home.
 * The lookup of products and brands sold elsewhere is a small lazy data file
 * per page (`regions`, scripts/regionSite.ts RegionLinks), fetched only when
 * the menu or the bar needs it; without it a product or brand page goes to the
 * country's home, never to a page that might not exist.
 *
 * The slim bar: a deep link (any address but the bare UK home, where the
 * welcome pop-up asks instead) is never redirected. When the visitor's saved
 * country, or with nothing saved their browser's time zone, is another live
 * country than the page's, a one line bar says "You are seeing UK prices. See
 * US prices", and the mirror on the US and Indian pages.
 *
 * Pure and free of the DOM, so tests/regionSwitch.test.ts holds every case;
 * demo/app.ts draws the menu and the bar.
 */
import { regionPath, splitRegionPrefix, type RegionConfig, type RegionId } from '../src/config/regions.js';
import { routeToPath, slugify, type Route } from './router.js';

/** What a page knows of the other regions (the `regions` lazy data file). */
export type RegionLinks = Partial<Record<RegionId, { slugs: Record<string, string>; brands: string[] }>>;

/** The page being left, as much as the switch needs. */
export interface SwitchFrom {
  route: Route;
  /** The product on screen, on a product page. */
  productId?: string | null;
  /** The brand of the product on screen, or of the brand page. */
  brand?: string | null;
}

/** The routes every live region has a page for (the region's own copy of it). */
const SAME_PAGE_ROUTES: ReadonlySet<Route['name']> = new Set<Route['name']>([
  'home', 'search', 'brands', 'deals', 'retailers', 'notes', 'fragrances', 'oils', 'sets', 'about', 'legalNotice',
  'botPage', 'howWeCheck', 'guides', 'guide', 'settings', 'suggestions', 'legal',
]);

/** A route's path with no region prefix: what it is inside any region. */
function pathInRegion(route: Route): string {
  // routeToPath writes the address inside the page's own region; take that prefix off.
  return splitRegionPrefix(routeToPath(route)).rest;
}

/** Where picking `to` takes the visitor from this page. */
export function switchTarget(from: SwitchFrom, to: RegionConfig, links: RegionLinks | null): string {
  const there = links?.[to.id];
  const { route } = from;
  const brandPage = (brand: string | null | undefined): string | null => {
    const slug = brand ? slugify(brand) : '';
    return slug && there?.brands.includes(slug) ? regionPath(to, `/brands/${encodeURIComponent(slug)}`) : null;
  };
  switch (route.name) {
    case 'product':
    case 'fragrance': {
      const slug = from.productId ? there?.slugs[from.productId] : undefined;
      if (slug) return regionPath(to, `/${slug}`);
      return brandPage(from.brand) ?? regionPath(to, '/');
    }
    case 'brand':
      return brandPage(from.brand ?? route.param) ?? regionPath(to, '/brands');
    case 'retailer':
      return regionPath(to, '/retailers');
    case 'note':
      return regionPath(to, '/notes');
    default:
      return SAME_PAGE_ROUTES.has(route.name) ? regionPath(to, pathInRegion(route)) : regionPath(to, '/');
  }
}

/** True when the switch needs the lazy links file to answer well (a product or a brand page). */
export function switchNeedsLinks(route: Route): boolean {
  return route.name === 'product' || route.name === 'fragrance' || route.name === 'brand';
}

export interface BarInput {
  /** The region the page is in. */
  active: RegionConfig;
  /** The live regions. */
  live: readonly RegionConfig[];
  /** The address path, without the query. */
  pathname: string;
  /** The region saved in this browser, if any. */
  stored: RegionId | null;
  /** The browser time zone's suggestion, used only when nothing is saved. */
  suggested: RegionId | null;
  /** Dismissed for this visit (session storage). */
  dismissed: boolean;
}

/** The region the bar offers, or null when it shows nothing. */
export function barRegion(input: BarInput): RegionConfig | null {
  const { active, live, pathname, stored, suggested, dismissed } = input;
  if (dismissed || live.length < 2) return null;
  // The bare UK home asks with the welcome pop-up, or takes a saved choice there.
  if (pathname === '/') return null;
  const wanted = stored ?? suggested;
  const region = live.find((r) => r.id === wanted);
  return region && region.id !== active.id ? region : null;
}

/** The adjective a sentence uses for a region's prices: "UK prices", "US prices", "Indian prices". */
export function pricesWord(region: RegionConfig): string {
  return `${region.shopsAdjective} prices`;
}

/** The bar's words: "You are seeing UK prices." and the link "See US prices". */
export function barText(active: RegionConfig, offered: RegionConfig): { lead: string; link: string } {
  return { lead: `You are seeing ${pricesWord(active)}.`, link: `See ${pricesWord(offered)}` };
}

/** Session storage key: the bar was closed for this visit. */
export const BAR_DISMISSED_KEY = 'pricesniffs.regionBarClosed';

/**
 * The hreflang alternates of a product or brand page (plan section 2,
 * "Canonical, hreflang and sitemaps"): the page itself and its counterpart in
 * every other live region that sells the product or the brand, read from the
 * `regions` lazy file, and x-default for the UK page when the UK has one. A
 * product's counterpart is found by its id, so a bottle with another address
 * in another region still points at the right page. Empty when no other
 * region has it, or before the file has loaded.
 */
export function leafAlternates(
  siteUrl: string,
  active: RegionConfig,
  live: readonly RegionConfig[],
  ownPath: string,
  from: SwitchFrom,
  links: RegionLinks | null,
): { hreflang: string; href: string }[] {
  if (!links) return [];
  const holders: { region: RegionConfig; path: string }[] = [{ region: active, path: ownPath }];
  for (const r of live) {
    if (r.id === active.id) continue;
    const there = links[r.id];
    if (!there) continue;
    if (from.route.name === 'brand') {
      const slug = slugify(from.brand ?? from.route.param);
      if (slug && there.brands.includes(slug)) holders.push({ region: r, path: ownPath });
    } else if (from.productId) {
      const slug = there.slugs[from.productId];
      if (slug) holders.push({ region: r, path: `/${slug}` });
    }
  }
  if (holders.length < 2) return [];
  const ordered = live.map((r) => holders.find((h) => h.region.id === r.id)).filter((h): h is { region: RegionConfig; path: string } => !!h);
  const uk = ordered.find((h) => h.region.pathPrefix === '');
  return [
    ...ordered.map((h) => ({ hreflang: h.region.hreflang, href: `${siteUrl}${regionPath(h.region, h.path)}` })),
    ...(uk ? [{ hreflang: 'x-default', href: `${siteUrl}${uk.path}` }] : []),
  ];
}
