/**
 * Products with no current prices, loaded when one of their addresses is opened.
 *
 * The data (src/catalogue/dormantProducts.ts) is a lazy data file, like the
 * price history (demo/priceHistoryStore.ts): the bundle imports only its types
 * and fetches it through the loader's `__psLazy(name)`. Nothing asks for it on
 * the first load, in a list, in a search, on Deals or anywhere a count is made;
 * the only caller is the route for a fragrance address that is not in the
 * catalogue, which needs to know whether it is one of these or simply not here.
 *
 * The same file answers the other question an unknown address raises: was this
 * product folded into another one? ID_ALIASES maps the id of a product that a
 * merge absorbed to the id that holds it now (src/catalogue/idAliases.ts), so
 * an old address opens the surviving product and the address bar is rewritten
 * to it. It rides in this file and not the catalogue for the same reason the
 * products do: nothing on the first load asks for it.
 *
 * A failed fetch is not remembered, as with the price history, so the next
 * visit to such an address asks again.
 */
import type { DormantEntry, DormantFile } from '../src/catalogue/dormantProducts.js';
// Types only: the module itself is the build's (it reads barcodes through productMatch.ts) and stays out of the bundle.
import type { IdAliases } from '../src/catalogue/idAliases.js';
import { fetchLazyFile, lazyData, type LazyData } from './priceHistoryStore.js';

/** The lazy data file's name, a key of LAZY_DATA_MODULES in scripts/dataFiles.ts. */
export const DORMANT_FILE = 'dormant';

export type DormantProducts = Record<string, DormantEntry>;

/** What the page keeps of the file: the pages with no current prices, and the folded ids. */
export interface DormantData {
  products: DormantProducts;
  aliases: IdAliases;
  /** Slug of a product folded into another, to the id of the product that holds it now. */
  slugAliases: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the file's shape. Throws on anything else, which the page treats as a failed load. */
export function prepareDormant(raw: unknown): DormantData {
  const file = raw as Partial<DormantFile> | null;
  const products = file?.DORMANT_PRODUCTS;
  const aliases = file?.ID_ALIASES;
  const slugAliases = file?.SLUG_ALIASES;
  if (!isRecord(products) || !isRecord(aliases) || !isRecord(slugAliases)) {
    throw new Error('dormant products file is not { DORMANT_PRODUCTS, ID_ALIASES, SLUG_ALIASES }');
  }
  return {
    products: products as DormantProducts,
    aliases: aliases as IdAliases,
    slugAliases: slugAliases as Record<string, string>,
  };
}

export function createDormant(fetchFile: (name: string) => Promise<unknown> = fetchLazyFile): LazyData<DormantData> {
  return lazyData(() => fetchFile(DORMANT_FILE).then(prepareDormant));
}

/** The app's one copy. */
export const dormant = createDormant();

/** One dormant product, or undefined: not loaded yet, or not one of them. Own keys only, so an id is never a prototype name. */
export function dormantEntry(id: string): DormantEntry | undefined {
  const all = dormant.current()?.products;
  return all !== undefined && Object.prototype.hasOwnProperty.call(all, id) ? all[id] : undefined;
}

/**
 * The id of the product that absorbed this one, or undefined: not an id any
 * merge absorbed. Own keys only, so an id is never a prototype name.
 */
export function absorbedBy(data: DormantData, id: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(data.aliases, id) ? data.aliases[id] : undefined;
}

/** Each loaded file's slug to id index, built the first time it is asked. */
const slugIndexes = new WeakMap<DormantData, Map<string, string>>();

/**
 * The id a product address (a slug) that is not in the catalogue stands for, or
 * null: the page with no current prices that holds the slug, or the product a
 * merge folded the slug's own product into, when that product is a page.
 * `isLive` says whether an id is in the catalogue.
 */
export function idForSlug(data: DormantData | null, slug: string, isLive: (id: string) => boolean): string | null {
  if (data === null) return null;
  let idBySlug = slugIndexes.get(data);
  if (idBySlug === undefined) {
    idBySlug = new Map(Object.entries(data.products).map(([id, entry]) => [entry.slug, id] as const));
    slugIndexes.set(data, idBySlug);
  }
  const own = idBySlug.get(slug);
  if (own !== undefined) return own;
  if (!Object.prototype.hasOwnProperty.call(data.slugAliases, slug)) return null;
  const to = data.slugAliases[slug]!;
  return isLive(to) || Object.prototype.hasOwnProperty.call(data.products, to) ? to : null;
}

/**
 * Where an address that is not in the catalogue lands: the product that
 * absorbed it, when that product is a page (in the catalogue, or a page with no
 * current prices), otherwise null. `isLive` says whether an id is in the
 * catalogue. The page asks this only of an id that is neither that nor a page
 * with no current prices, which are never aliases (scripts/build-demo-
 * catalogue.ts leaves them out), so a page that exists is never redirected.
 */
export function movedTo(data: DormantData | null, id: string, isLive: (id: string) => boolean): string | null {
  if (data === null) return null;
  const to = absorbedBy(data, id);
  if (to === undefined || to === id) return null;
  const isPage = isLive(to) || Object.prototype.hasOwnProperty.call(data.products, to);
  return isPage ? to : null;
}
