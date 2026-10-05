/**
 * Which product a saved fragrance is today.
 *
 * A wishlist row stores the product id the reader saved. When the catalogue
 * later folds that product into another (src/catalogue/idAliases.ts) the old id
 * leaves the catalogue, and a price lookup by it finds nothing: the wishlist
 * showed no price and the daily alert sender skipped the row. Everything that
 * looks a saved id up resolves it here first, on the read side only. The row
 * keeps the id the reader saved, and so does the database.
 *
 * Pure and DOM free so the browser (demo/app.ts) and the alert sender
 * (scripts/price-alerts.ts) share one rule, and tests drive it with no network.
 */

/** Old id to the id of the product that absorbed it: ID_ALIASES in demo/dormant.generated.ts. */
export type AliasMap = Readonly<Record<string, string>>;

/** The longest chain of merges followed. The build settles chains itself; this only stops a loop in a bad file. */
const MAX_HOPS = 12;

function own(map: AliasMap, id: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : undefined;
}

/**
 * The id of the product a saved id stands for now, or null: not a product that
 * exists any more (no merge leads to one). An id that exists is its own answer
 * and is never redirected. `exists` says whether an id is a product in the
 * catalogue. `aliases` is null while the merge map is not loaded, when only an
 * id that exists resolves.
 */
export function resolveFragranceId(
  id: string,
  aliases: AliasMap | null,
  exists: (id: string) => boolean,
): string | null {
  if (exists(id)) return id;
  if (aliases === null) return null;
  const seen = new Set<string>([id]);
  let at = id;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const next = own(aliases, at);
    if (next === undefined || seen.has(next)) return null;
    if (exists(next)) return next;
    seen.add(next);
    at = next;
  }
  return null;
}

/** The facts of a wishlist row that grouping reads. */
export interface ResolvableWishlistRow {
  fragranceId: string;
  addedAt: string;
  targetPriceGbp: number | null;
  savedPriceGbp: number | null;
}

/** One line of the wishlist page: a product, with every saved row that resolves to it. */
export interface WishlistGroup<T extends ResolvableWishlistRow> {
  /** The product's current id, or null: it no longer exists. */
  id: string | null;
  /** The row the line is read from: the oldest, so its saved price is the earliest baseline. */
  primary: T;
  /** Every saved row of this line, the primary first. Stored ids stay as the reader saved them. */
  rows: T[];
  /** True when some row was saved under an id that has since merged into `id`. */
  merged: boolean;
  /** True when two or more saved rows resolve to the same product. */
  combined: boolean;
  /** The saved price the line measures change from: the primary's, else the earliest row's that has one. Never made up. */
  savedPriceGbp: number | null;
  /** The target price: the primary's, else the lowest another row set, or null. */
  targetPriceGbp: number | null;
}

/**
 * The wishlist as lines to show, in the order the rows came. Rows that resolve
 * to the same product become one line (nothing is deleted); a row whose id
 * resolves to nothing is its own line with `id: null`, one per row.
 */
export function groupWishlist<T extends ResolvableWishlistRow>(
  rows: readonly T[],
  aliases: AliasMap | null,
  exists: (id: string) => boolean,
): WishlistGroup<T>[] {
  const order: (string | T)[] = [];
  const byProduct = new Map<string, T[]>();
  for (const row of rows) {
    const id = resolveFragranceId(row.fragranceId, aliases, exists);
    if (id === null) {
      order.push(row);
      continue;
    }
    const list = byProduct.get(id);
    if (list) list.push(row);
    else {
      byProduct.set(id, [row]);
      order.push(id);
    }
  }

  const oldestFirst = (a: T, b: T) => {
    const x = Date.parse(a.addedAt);
    const y = Date.parse(b.addedAt);
    return (Number.isNaN(x) ? Infinity : x) - (Number.isNaN(y) ? Infinity : y);
  };

  return order.map((item): WishlistGroup<T> => {
    if (typeof item !== 'string') {
      return {
        id: null,
        primary: item,
        rows: [item],
        merged: false,
        combined: false,
        savedPriceGbp: item.savedPriceGbp,
        targetPriceGbp: item.targetPriceGbp,
      };
    }
    const list = [...byProduct.get(item)!].sort(oldestFirst);
    const primary = list[0]!;
    const savedPriceGbp = primary.savedPriceGbp ?? list.find((r) => r.savedPriceGbp !== null)?.savedPriceGbp ?? null;
    const targets = list.map((r) => r.targetPriceGbp).filter((t): t is number => t !== null);
    const targetPriceGbp = primary.targetPriceGbp ?? (targets.length > 0 ? Math.min(...targets) : null);
    return {
      id: item,
      primary,
      rows: list,
      merged: list.some((r) => r.fragranceId !== item),
      combined: list.length > 1,
      savedPriceGbp,
      targetPriceGbp,
    };
  });
}
