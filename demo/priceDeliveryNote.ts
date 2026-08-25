import type { DeliveryDisplay } from '../src/types/offer.js';
import { formatGbp } from '../src/services/money.js';

/**
 * The small second line printed directly under a shop's price in the
 * "Available at" list, saying what that number does and does not contain.
 *
 * The number above it is `deliveredPriceGbp ?? itemPriceGbp` — item price plus
 * applicable delivery whenever the shop states a delivery cost, and the bare
 * item price only in the one case where it does not (presentOffer() in
 * src/services/priceService.ts refuses to fill a null delivery in with the
 * item price). So the wording is not a stylistic choice: each branch below is
 * the true statement about the specific number it sits under.
 *
 *   - a stated, charged cost  → the number already contains it, so "Includes";
 *   - a stated zero           → also "Includes", because a sourced £0 is a
 *                               claim the shop ships free, not an absence of
 *                               one, and the delivered price is the item
 *                               price for a real reason worth naming;
 *   - no stated cost          → "Plus delivery", with no figure of any kind.
 *                               The number above excludes delivery and nobody
 *                               has established what delivery is, so the line
 *                               may only say that something is still to be
 *                               added. It must never name an amount, and it
 *                               must never say "free" — see DeliveryDisplay's
 *                               doc comment on why null and 0 are different
 *                               facts. Such a row is also barred from ranking
 *                               as cheapest by bestOffer()/buildComparison(),
 *                               which this line does not affect either way.
 *
 * Deliberately silent about whether the delivery figure is confirmed. That
 * qualifier is real and is not dropped — it is carried on the facts line
 * immediately below, beside the same figure ("plus £2.99 delivery (not
 * confirmed with the shop)"). Repeating it here would put a clause longer than
 * the price itself in a 10px uppercase line on roughly two thirds of listings,
 * where it would stop being read at all.
 *
 * Lives in its own module rather than in demo/app.ts so it can be unit tested
 * directly: app.ts calls init() at import time, so nothing in it is importable
 * from a plain Node test. Same reason as demo/deliveryFacts.ts.
 */
export function deliveryPriceNote(delivery: DeliveryDisplay): string {
  if (delivery.costGbp === null) return 'Plus delivery';
  if (delivery.costGbp === 0) return 'Includes free delivery';
  return `Includes ${formatGbp(delivery.costGbp)} delivery`;
}
