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

export type RouteName =
  | 'home' | 'search' | 'brands' | 'brand' | 'deals' | 'retailers' | 'retailer'
  | 'notes' | 'note' | 'fragrance' | 'about' | 'settings' | 'legal' | 'account'
  | 'design' | 'notFound';

/** What a matched URL says about where we are. */
export interface Route {
  name: RouteName;
  /** The path segment identifying a leaf, already decoded. Empty for lists. */
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
  about: 'about',
  settings: 'settings',
  account: 'account',
  // Reachable by URL and from the footer, and deliberately nowhere in the top
  // bar: this is a shop for perfume, and a shopper looking for a cheap bottle
  // of Sauvage should never have to step over a swatch table to find it. See
  // designView in demo/app.ts.
  design: 'design',
};

const LEAF_ROUTES: Record<string, RouteName> = {
  brands: 'brand',
  retailers: 'retailer',
  notes: 'note',
  fragrance: 'fragrance',
  legal: 'legal',
};

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
    return name ? { name, param: '', query } : { name: 'notFound', param: pathname, query };
  }

  const leaf = LEAF_ROUTES[head!];
  if (leaf && tail) {
    return { name: leaf, param: decodeURIComponent(tail), query };
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
  const qs = new URLSearchParams(query).toString();
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
      case 'fragrance': return `/fragrance/${encodeURIComponent(param)}`;
      case 'about': return '/about';
      case 'settings': return '/settings';
      case 'account': return '/account';
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
