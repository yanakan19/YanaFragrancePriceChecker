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
 * slugifying, and brands specifically collide: the catalogue holds "Dolce &
 * Gabbana", "Dolce&Gabbana" and "DOLCE&GABBANA" as three separate rows, which
 * all slugify to the same string. That is a pre-existing data-quality problem —
 * those are already three separate entries in the Brands list today, routing
 * did not create it — so the lookup resolves a slug back by scanning for the
 * first brand whose slug matches, and the duplicates remain visible until the
 * catalogue normalises brand names at ingest. Recorded rather than papered over.
 */

export type RouteName =
  | 'home' | 'search' | 'brands' | 'brand' | 'deals' | 'retailers' | 'retailer'
  | 'notes' | 'note' | 'fragrance' | 'about' | 'settings' | 'legal';

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
 * Anything unrecognised resolves to home rather than throwing: a stale
 * bookmark or a hand-typed URL should land somewhere sensible, and on static
 * hosting this function is also what runs for a path GitHub Pages served
 * through 404.html.
 */
export function matchRoute(pathname: string, search = ''): Route {
  const query: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) query[k] = v;

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (segments.length === 0) return { name: 'home', param: '', query };

  const [head, tail] = segments;

  if (segments.length === 1) {
    const name = LIST_ROUTES[head!];
    return name ? { name, param: '', query } : { name: 'home', param: '', query };
  }

  const leaf = LEAF_ROUTES[head!];
  if (leaf && tail) {
    return { name: leaf, param: decodeURIComponent(tail), query };
  }

  return { name: 'home', param: '', query };
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
      case 'legal': return `/legal/${encodeURIComponent(param)}`;
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
export function basePath(pathname = window.location.pathname): string {
  // The app is a single index.html; anything before it is the base.
  const idx = pathname.indexOf('/index.html');
  if (idx >= 0) return pathname.slice(0, idx + 1);
  return '/';
}
