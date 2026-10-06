/**
 * URLs and browser history.
 *
 * The app had none of this. `state.view` lived in memory, the address bar never
 * changed, and Back left the site entirely from any depth — open a fragrance,
 * press Back, and you were gone rather than one level up. Nothing could be
 * linked to, bookmarked or shared either: every URL was the homepage.
 *
 * ── Why the mapping lives here and not in app.ts ─────────────────────────────
 * The view functions and `render()` are untouched by this file. The router only
 * reads and writes the same `state` object they already read, so a route is a
 * pure translation between a path and a handful of fields. That keeps the whole
 * change reversible and stops routing logic leaking into rendering.
 *
 * ── Slugs ────────────────────────────────────────────────────────────────────
 * Fragrance ids and retailer ids are already URL-safe and unique, so
 * they go in the path unchanged. Brands and notes are free text and need
 * slugifying. That used to matter for collisions too: the catalogue once held
 * "Dolce & Gabbana", "Dolce&Gabbana" and "DOLCE&GABBANA" as three separate
 * rows, all slugifying to the same string. src/catalogue/brandName.ts now
 * canonicalises casing/punctuation variants at ingest, so as of 2026-08-17
 * there are 0 slug collisions across the catalogue's 629 distinct brands —
 * verified by slugifying every brand string and checking for duplicate keys.
 * The lookup below still resolves a slug back by scanning for the first
 * brand whose slug matches, which is why a future regression in the ingest
 * canonicalisation would degrade silently rather than loudly: this comment
 * is the record of why that scan exists, not evidence it is still needed.
 */

import { BRAND_MERGES } from '../src/catalogue/brandName.js';
import { isProductSlug } from '../src/catalogue/productSlug.js';

export type RouteName =
  | 'home' | 'search' | 'brands' | 'brand' | 'deals' | 'retailers' | 'retailer'
  | 'notes' | 'note' | 'oils' | 'sets' | 'fragrance' | 'product' | 'about' | 'settings' | 'suggestions' | 'legal' | 'account'
  | 'accountWishlist' | 'accountNotifications'
  | 'design' | 'notFound';

/** What a matched URL says about where we are. */
export interface Route {
  name: RouteName;
  /**
   * The path segment identifying a leaf, already decoded. Empty for lists.
   * For `fragrance` it is the product's id (the old /fragrance/<id> address,
   * and what the app holds internally); for `product` it is the slug, the new
   * address /BRAND_NAME_VOLUME (docs/PRODUCT-URLS.md).
   */
  param: string;
  /** Query string values the app cares about. */
  query: Record<string, string>;
}

/** Lowercase, letters and digits only, joined by single hyphens. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The route table, most specific first.
 *
 * A plain list rather than a regex soup: every entry is readable on its own
 * line, and the leaf routes are distinguished by their prefix alone.
 */
const LIST_ROUTES: Record<string, RouteName> = {
  '': 'home',
  search: 'search',
  brands: 'brands',
  deals: 'deals',
  retailers: 'retailers',
  notes: 'notes',
  // The Explore tabs after Notes (docs/GIFT-SETS-AND-OILS-PLAN.md).
  oils: 'oils',
  sets: 'sets',
  about: 'about',
  settings: 'settings',
  suggestions: 'suggestions',
  account: 'account',
  // Reachable by URL and from the footer, and deliberately nowhere in the top
  // bar: this is a shop for perfume, and a shopper looking for a cheap bottle
  // of Sauvage should never have to step over a swatch table to find it. See
  // designView in demo/app.ts.
  design: 'design',
};

/**
 * Addresses that used to be pages of their own and now land somewhere else. They
 * are matched, never answered with a not found: someone has these in a bookmark
 * or a post. The app draws the page they land on and then rewrites the address
 * to that page's own, so an alias is only ever the way in.
 *
 * /gift-sets was the Gift Sets page (owner's decision, 2026-10-03), then only an
 * option under Size (2026-10-04), and is now the Sets tab under Explore
 * (owner's decision, 2026-10-05), which is what the old address opens.
 */
const ALIAS_ROUTES: Record<string, { name: RouteName; query: Record<string, string> }> = {
  'gift-sets': { name: 'sets', query: {} },
};

/**
 * Brand pages that were folded into another brand, as the old slug and the
 * slug of the brand that now holds it. /brands/kayali-uk opens Kayali, and the
 * app then rewrites the address to /brands/kayali, the same way the gift sets
 * address above is rewritten. Read from BRAND_MERGES in brandName.ts, the one
 * list that also merges the brands, so a merge can never leave its old address
 * answering with a not found. That module has no catalogue data in it, which
 * keeps this file as light as it was.
 */
export const BRAND_ALIAS_SLUGS: Readonly<Record<string, string>> = Object.fromEntries(
  BRAND_MERGES.map(([from, to]) => [slugify(from), slugify(to)] as const).filter(([from, to]) => from !== to),
);

/**
 * The account's own pages under /account. Fixed words rather than a param,
 * so a mistyped /account/anything is a miss like any other address, never the
 * profile page pretending to be what was asked for.
 */
const ACCOUNT_ROUTES: Record<string, RouteName> = {
  wishlist: 'accountWishlist',
  notifications: 'accountNotifications',
};

const LEAF_ROUTES: Record<string, RouteName> = {
  brands: 'brand',
  retailers: 'retailer',
  notes: 'note',
  fragrance: 'fragrance',
  legal: 'legal',
};

/**
 * The page's way of finding a product's slug from its id. The router has no
 * catalogue (this file is imported by tests under Node and stays free of the
 * generated data), so the page registers the lookup once it has the catalogue
 * and the lookup reads whatever is loaded at the time of the call.
 */
export type ProductSlugLookup = (id: string) => string | null | undefined;

let slugOfId: ProductSlugLookup = () => null;

/** Registers where product slugs come from. Called by the page at start up, and by tests. */
export function setProductSlugLookup(lookup: ProductSlugLookup): void {
  slugOfId = lookup;
}

/**
 * The path of a product's page: /BRAND_NAME_VOLUME when its slug is known, the
 * old /fragrance/<id> address otherwise. The old address still opens the
 * product and the page rewrites it to the new one, so a product whose slug is
 * not known yet (a page with no current prices whose file has not arrived) is
 * a link that works, never one that does not.
 */
export function productPath(id: string): string {
  const slug = slugOfId(id);
  return slug ? `/${slug}` : `/fragrance/${encodeURIComponent(id)}`;
}

/**
 * Every word the site uses as a first path segment: its own routes and the
 * old product address. A product slug is never one of them (it has at least
 * two underscores and none of these has any); tests/productSlug.test.ts reads
 * this list against the slug shape so a new route cannot collide by accident.
 */
export function rootWords(): string[] {
  return [
    ...Object.keys(LIST_ROUTES),
    ...Object.keys(ALIAS_ROUTES),
    ...Object.keys(LEAF_ROUTES),
    'account',
  ].filter((w, i, all) => w !== '' && all.indexOf(w) === i);
}

/**
 * Parse a path and query into a route.
 *
 * Anything unrecognised resolves to `notFound` rather than throwing. On static
 * hosting this function is also what runs for a path GitHub Pages served
 * through 404.html, so it is the only thing standing between a mistyped URL
 * and a page that silently pretends to be the homepage.
 */
export function matchRoute(pathname: string, search = ''): Route {
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) query[k] = v;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (segments.length === 0) return { name: 'home', param: '', query };

  const [head, tail] = segments;

  if (segments.length === 1) {
    const name = LIST_ROUTES[head!];
    if (name) return { name, param: '', query };
    const alias = ALIAS_ROUTES[head!];
    if (alias) return { name: alias.name, param: '', query: { ...query, ...alias.query } };
    // A product address, /BRAND_NAME_VOLUME. Lower cased here, so a link someone
    // retyped with capitals opens the product and the address bar is rewritten.
    let slug = head!;
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // Not valid percent encoding: no product address looks like that.
    }
    slug = slug.toLowerCase();
    if (isProductSlug(slug)) return { name: 'product', param: slug, query };
    return { name: 'notFound', param: pathname, query };
  }

  if (head === 'account' && segments.length === 2) {
    const name = ACCOUNT_ROUTES[tail!];
    if (name) return { name, param: '', query };
    return { name: 'notFound', param: pathname, query };
  }

  const leaf = LEAF_ROUTES[head!];
  if (leaf && tail) {
    const param = decodeURIComponent(tail);
    // An old brand address lands on the brand it was merged into.
    if (leaf === 'brand') return { name: leaf, param: BRAND_ALIAS_SLUGS[param] ?? param, query };
    return { name: leaf, param, query };
  }

  // An address that matches nothing is not the homepage.
  //
  // This returned `home` until 2026-08-17, which made every wrong URL a soft
  // 404: the reader got a 200-shaped homepage with no hint their link was
  // broken, and a crawler got what looked like thousands of duplicate
  // homepages at made-up addresses. Naming the miss lets the app say so and
  // lets head.ts mark it noindex. `param` carries the path that missed, so
  // the view can show it back.
  return { name: 'notFound', param: pathname, query };
}

/** Build the path for a route. The inverse of matchRoute. */
export function routeToPath(route: Route): string {
  const { name, param, query } = route;
  // A list's filter can hold several values, comma separated
  // (/search?size=30-70,70-120, demo/listFilters.ts). A comma needs no
  // escaping in a query and reads far better bare, so it is left bare;
  // URLSearchParams reads it back the same either way.
  const qs = new URLSearchParams(query).toString().replace(/%2C/gi, ',');
  const suffix = qs ? `?${qs}` : '';

  const path = (() => {
    switch (name) {
      case 'home': return '/';
      case 'search': return '/search';
      case 'brands': return '/brands';
      case 'brand': return `/brands/${encodeURIComponent(param)}`;
      case 'deals': return '/deals';
      case 'retailers': return '/retailers';
      case 'retailer': return `/retailers/${encodeURIComponent(param)}`;
      case 'notes': return '/notes';
      case 'note': return `/notes/${encodeURIComponent(param)}`;
      case 'oils': return '/oils';
      case 'sets': return '/sets';
      case 'fragrance': return productPath(param);
      case 'product': return `/${param}`;
      case 'about': return '/about';
      case 'settings': return '/settings';
      case 'suggestions': return '/suggestions';
      case 'account': return '/account';
      case 'accountWishlist': return '/account/wishlist';
      case 'accountNotifications': return '/account/notifications';
      case 'design': return '/design';
      case 'legal': return `/legal/${encodeURIComponent(param)}`;
      // Not a destination anything navigates *to*: syncUrl never rewrites the
      // address for a miss, so the wrong URL the reader typed stays in the bar
      // where they can see and correct it. Present so this switch stays
      // exhaustive and can never return undefined into a template literal.
      case 'notFound': return param || '/404';
    }
  })();

  return `${path}${suffix}`;
}

/**
 * The base path the app is served from.
 *
 * On the custom domain this is `/`. On a project-pages URL it would be
 * `/<repo>/`, and every route has to sit under it or deep links break. Derived
 * from where the document actually loaded rather than hard-coded, so the same
 * bundle works from either.
 */
export function basePath(
  // Read through globalThis rather than the `window` global directly: this
  // module is imported by tests that run under Node, where `window` is not
  // declared at all. Identical in a browser.
  pathname = (globalThis as { location?: { pathname?: string } }).location?.pathname ?? '/',
): string {
  // The app is a single index.html; anything before it is the base.
  const idx = pathname.indexOf('/index.html');
  if (idx >= 0) return pathname.slice(0, idx + 1);
  return '/';
}
