import type { StoredListing } from './types.js';

/**
 * Strip the sterling prices from a shop's stored listings, keeping the shop.
 *
 * ── Why a snapshot needs this at all ────────────────────────────────────────
 * The harvest's response to a shop that yields nothing is to leave the stored
 * snapshot alone — the right call for a bad network minute, since a shop is
 * far more often unreachable than genuinely empty. But it is the wrong call
 * for a shop we have just established we cannot price: "no prices this run"
 * then means yesterday's prices keep being published, and if the reason we
 * have no prices is that the shop's figures are not sterling, yesterday's are
 * exactly the numbers that must come down.
 *
 * So a currency refusal has to be able to reach into the snapshot and clear
 * it, rather than only decline to add to it.
 *
 * ── What is kept ────────────────────────────────────────────────────────────
 * Everything except the sterling figures. The listing, its URL, its title, its
 * identifiers and its history all stay: we still know the shop sells this, we
 * have simply stopped claiming to know what it costs in pounds. The published
 * figure moves to `nativePrice` under whatever currency was established, or
 * 'unknown' where none was — the same treatment a house pricing in dirhams
 * already gets, and the reason the demo build drops the offer without dropping
 * the knowledge.
 *
 * Delisted rows are left alone: their price is a record of what was charged
 * while they were on sale, nothing reads it, and rewriting history to fix the
 * present is its own kind of lie.
 */

export interface PriceQuarantineResult {
  listings: StoredListing[];
  /** Active listings that had a sterling price and no longer do. */
  cleared: number;
}

export function quarantinePrices(
  listings: readonly StoredListing[],
  presentedCurrency: string | null,
): PriceQuarantineResult {
  const out: StoredListing[] = [];
  let cleared = 0;

  for (const listing of listings) {
    if (listing.status !== 'active' || listing.priceGbp === null) {
      out.push(listing);
      continue;
    }
    cleared++;
    out.push({
      ...listing,
      priceGbp: null,
      wasPriceGbp: null,
      // Never overwrite a nativePrice a source already published — that one is
      // the source's own statement, this one is only our salvage of a figure
      // we can no longer call pounds.
      nativePrice: listing.nativePrice ?? {
        amount: listing.priceGbp,
        currency: presentedCurrency ?? 'unknown',
      },
    });
  }

  return { listings: out, cleared };
}
