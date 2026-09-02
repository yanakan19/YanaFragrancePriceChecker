/**
 * The strongest reference price available for a fragrance, and where it came
 * from — what the top-of-page box beside the lowest price renders, so the box
 * appears on far more than the 888 products (5.8% of 15,227, measured
 * 2026-09-02) that carry a `houseCeiling`.
 *
 * ── The owner's report, and why the fix is not "trust the shop" ─────────────
 * The report was that the box appears almost nowhere outside French Avenue.
 * True: `houseCeiling` is a fragrance house's own storefront price, and only
 * 851 products' houses run one we harvest. The obvious-looking fix — fall back
 * to a shop's own `wasPrice` when there is no house price — is exactly the
 * thing src/catalogue/wasPriceCredibility.ts exists to stop this site doing
 * unfiltered: a shop's stated RRP is a claim by a party with an interest in it
 * looking inflated, and 8,975 of the 12,195 reduction claims measured
 * 2026-09-01 (73.6%) are either actively contradicted by the evidence or
 * simply untested, because fewer than two other shops stock the identical
 * bottle.
 *
 * So this does not read a shop's raw `wasPrice`. It reads `PresentedOffer`s
 * `discount`, which by the time it reaches this file has already been through
 * that filter: `scripts/build-demo-catalogue.ts` nulls every offer's
 * `wasPrice` whose verdict was not `corroborated` before the catalogue is
 * ever written, so `discount !== null` here already *is* "the market did not
 * contradict this claim" — see that script's own comment on the nulling step
 * for the full three-verdict accounting. Nothing here re-derives or loosens
 * that judgement; it only picks the best of what already survived it.
 *
 * ── The tiers, measured over the built catalogue on 2026-09-02 ──────────────
 * Of 15,227 products:
 *
 *     888   (5.8%)  carry a house price — the strongest evidence there is,
 *                    the company that makes the bottle stating its own price
 *     1,443 (9.5%)  carry no house price but do carry a retailer's reference
 *                    price the market did not contradict
 *     7,532 (49.5%) carry only a reference price no market test could run on
 *                    at all — `unchecked`, not "confirmed cheap": three shops
 *                    on the identical bottle in the identical size are needed
 *                    before either market test in wasPriceCredibility.ts can
 *                    even start, and most of the catalogue never reaches that
 *     5,364 (35.2%) carry no reference price of any kind
 *
 * The middle two rows are why this stops at `corroborated` rather than
 * reading every `wasPriceGbp` a shop publishes: doing that would put a
 * weakly-evidenced number on about half the catalogue, on exactly the same
 * unchecked claims the strikethrough on every offer row already declines to
 * show. This box is not entitled to a lower bar than the row underneath it.
 *
 * ── House price excludes the house's own row ─────────────────────────────
 * Where a house price exists it wins outright — `pickReferencePrice` never
 * looks at retailer offers once `houseCeiling` is set. Where it does not, the
 * fragrance's own house may still be one of the retailer offers scanned (a
 * brand's shop reselling a fragrance from a *different* house — Armaf's shop
 * carrying Jenny Glow, see build-demo-catalogue.ts's own note on
 * `cannotCarryBrand`), so callers pass `isHouseOffer` per offer rather than
 * this file importing the registry to work it out — same division of labour
 * `msrpFor` in demo/app.ts already uses.
 */

/** Which kind of evidence produced the figure — decides the box's label. */
export type ReferencePriceTier = 'house' | 'retailerRrp';

export interface ReferencePrice {
  tier: ReferencePriceTier;
  amountGbp: number;
}

/** As much of one offer as this file needs to judge it. */
export interface ReferenceCandidateOffer {
  /** The corroborated reference price this shop states, or null if none survived. */
  wasPriceGbp: number | null;
  /**
   * True when this offer is the fragrance's own house selling its own
   * bottle. Excluded from the retailer tier: its evidence already decided
   * `houseCeilingGbp` (a stronger, ceiling-wide figure — test zero's ceiling
   * in wasPriceCredibility.ts, not just this one row's own claim), so
   * counting it again here would either repeat that number under the weaker
   * "RRP" label or, mid-sale, show a different, lower figure under it — both
   * misattributing the manufacturer's own word as a retailer's guess.
   */
  isHouseOffer: boolean;
}

/**
 * The best reference price this product can honestly show, or null.
 *
 * `houseCeilingGbp` wins whenever it is set — it is never compared against a
 * retailer's figure, because the two are not the same kind of evidence and a
 * house mid-sale can legitimately sit *below* a corroborated retailer RRP
 * without that RRP becoming the stronger claim (see wasPriceCredibility.ts's
 * own "house being cheaper is a real case" section). Failing that, this
 * returns the *highest* corroborated retailer price on offer — the same
 * "highest figure counts as the ceiling" rule `brandCeiling` in
 * wasPriceCredibility.ts already applies to house evidence, applied here to
 * retailer evidence for the same reason: a shop running its own sale has not
 * thereby revised the RRP down.
 */
export function pickReferencePrice(
  houseCeilingGbp: number | null,
  offers: readonly ReferenceCandidateOffer[],
): ReferencePrice | null {
  if (houseCeilingGbp !== null && houseCeilingGbp > 0) {
    return { tier: 'house', amountGbp: houseCeilingGbp };
  }

  let best: number | null = null;
  for (const offer of offers) {
    if (offer.isHouseOffer) continue;
    if (offer.wasPriceGbp === null || !(offer.wasPriceGbp > 0)) continue;
    if (best === null || offer.wasPriceGbp > best) best = offer.wasPriceGbp;
  }
  return best !== null ? { tier: 'retailerRrp', amountGbp: best } : null;
}
