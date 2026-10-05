/**
 * Products with no current prices: a page that stays, with nothing to buy.
 *
 * Until 2026-10-04 a product whose last offer was older than
 * HIDE_OFFER_AFTER_DAYS (src/services/offerAge.ts) was dropped from the
 * catalogue and its address answered Page Not Found. That is wrong for a
 * shopper holding the link: the product exists, the shop has simply stopped
 * confirming a price. The page now stays, with its photo, its name and its price
 * history, and says plainly that there are no current prices.
 *
 * ── Where these live, and why not in the catalogue ───────────────────────────
 * Nowhere a list, a count or a ranking can see them. The catalogue file is the
 * first load (about 26 MB of JSON before the app starts), and every list, the
 * search, Deals, Most Stocked, the shop and brand counts and the sitemap read
 * it, so a dormant product in it would be in all of them. They are in a data
 * file of their own, demo/dormant.generated.ts, fetched on demand like the
 * price history (LAZY_DATA_MODULES in scripts/dataFiles.ts): only the address of
 * a product that is not in the catalogue asks for it, and nothing on the first
 * load, in any list, the sitemap or the counts changes.
 */
import type { StockState } from '../types/offer.js';

/** One price a shop last confirmed for a dormant product, kept for its graph. */
export interface DormantOffer {
  retailerId: string;
  price: number;
  /** When the shop last confirmed it: always older than the hide window. */
  fetchedAt: string;
  stock: StockState;
}

/**
 * What a dormant product's page needs: the same facts a catalogue entry carries
 * for its header, and the old prices for the graph. No notes, no house price, no
 * offers: there is nothing current to compare.
 */
export interface DormantEntry {
  /** The product's address, as on a catalogue entry (src/catalogue/productSlug.ts). */
  slug: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
  ean: string | null;
  /** A photo under the same licensing rules as every other page, or null. */
  image: string | null;
  /** The CSS transform that evens the bottle's size, only where one applies. */
  imageTransform?: string;
  /** Set only for a gift set, as on a catalogue entry. */
  giftSet?: { contents: string[] | null; title: string };
  /** Every price the shops last confirmed, oldest first. */
  older: DormantOffer[];
}

/** What the lazy data file holds: the generated module's one data export. */
export interface DormantFile {
  DORMANT_PRODUCTS: Record<string, DormantEntry>;
  /**
   * Ids of products folded into another, each with the id that holds it now
   * (src/catalogue/idAliases.ts). Fetched with the products above because the
   * question is the same one: an address that is not in the catalogue.
   */
  ID_ALIASES: Record<string, string>;
  /**
   * Slugs that were given to products now folded into another, each with the id
   * of the product that holds it now (src/catalogue/productSlug.ts). Same file
   * for the same reason: an address that is not in the catalogue.
   */
  SLUG_ALIASES: Record<string, string>;
}
