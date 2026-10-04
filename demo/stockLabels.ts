import type { PresentedOffer, StockState } from '../src/types/offer.js';

/**
 * The words a reader sees for a stock state, kept in one module so a test can
 * hold them to the house style (Title Case labels, no hyphens or dashes).
 *
 * The stock line says the state and nothing else. There is no unit count
 * anywhere on the site and there never has been: a retailer feed carries a
 * true/false in-stock flag, never a number, so there is nothing to show.
 *
 * A `stockQtyMark()` helper used to append "(-)" after "In stock" to say that
 * absence out loud. It was removed on 2026-08-26 (owner's instruction: no
 * stock count anywhere) and should not come back in another shape — the "(-)"
 * read as a broken template or a missing figure rather than as the deliberate
 * statement it was, which is the failure mode of stating an absence with a
 * punctuation mark. The gap itself is still real and is documented here.
 *
 * Preorder is written without a hyphen: the house style has no hyphens or
 * dashes in anything a reader sees, so the owner's "Pre-Order" is "Preorder"
 * on the site (decided 2026-10-04, applied everywhere, the legal text too).
 */
export const STOCK_LABEL: Record<StockState, string> = {
  inStock: 'In stock',
  lowStock: 'Low stock',
  preOrder: 'Preorder',
  unknown: 'Stock not confirmed',
  outOfStock: 'Sold out',
};

/**
 * What a fragrance with no buyable offer says: Sold Out, or Preorder Only
 * where every shop that lists it is a pre-order and none has it sold out. A
 * mixed page (some pre-order, some sold out) says Sold Out, because nothing
 * can be bought and the pre-orders sit on the page itself.
 */
export function noStockLabel(rows: readonly Pick<PresentedOffer, 'isPurchasable' | 'stock'>[]): 'Sold Out' | 'Preorder Only' {
  const listed = rows.filter((r) => !r.isPurchasable);
  return listed.length > 0 && listed.every((r) => r.stock === 'preOrder') ? 'Preorder Only' : 'Sold Out';
}

/**
 * What an offer row says about its stock, apart from its price.
 *
 * - `tag`: a Preorder tag on the shop name, for a row that is a pre-order.
 * - `lastPrice`: a sold out row's price is the last one seen, and says so. A
 *   pre-order is not that: its price is the shop's live pre-order price, so it
 *   keeps the delivery and age facts like a buyable row.
 * - `fact`: Low stock or unconfirmed stock on a buyable row, said in the facts
 *   line; In stock is the section's own message and is never repeated.
 */
export function rowStockMarks(row: Pick<PresentedOffer, 'isPurchasable' | 'stock'>): {
  tag: string | null;
  lastPrice: boolean;
  fact: string | null;
} {
  const preOrder = row.stock === 'preOrder';
  return {
    tag: preOrder ? STOCK_LABEL.preOrder : null,
    lastPrice: !row.isPurchasable && !preOrder,
    fact: row.isPurchasable && row.stock !== 'inStock' ? STOCK_LABEL[row.stock] : null,
  };
}
