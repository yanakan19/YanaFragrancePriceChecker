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
 * A failed fetch is not remembered, as with the price history, so the next
 * visit to such an address asks again.
 */
import type { DormantEntry, DormantFile } from '../src/catalogue/dormantProducts.js';
import { fetchLazyFile, lazyData, type LazyData } from './priceHistoryStore.js';

/** The lazy data file's name, a key of LAZY_DATA_MODULES in scripts/dataFiles.ts. */
export const DORMANT_FILE = 'dormant';

export type DormantProducts = Record<string, DormantEntry>;

/** Checks the file's shape. Throws on anything else, which the page treats as a failed load. */
export function prepareDormant(raw: unknown): DormantProducts {
  const file = raw as Partial<DormantFile> | null;
  const products = file?.DORMANT_PRODUCTS;
  if (typeof products !== 'object' || products === null || Array.isArray(products)) {
    throw new Error('dormant products file is not { DORMANT_PRODUCTS }');
  }
  return products;
}

export function createDormant(fetchFile: (name: string) => Promise<unknown> = fetchLazyFile): LazyData<DormantProducts> {
  return lazyData(() => fetchFile(DORMANT_FILE).then(prepareDormant));
}

/** The app's one copy. */
export const dormant = createDormant();

/** One dormant product, or undefined: not loaded yet, or not one of them. Own keys only, so an id is never a prototype name. */
export function dormantEntry(id: string): DormantEntry | undefined {
  const all = dormant.current();
  return all !== null && Object.prototype.hasOwnProperty.call(all, id) ? all[id] : undefined;
}
