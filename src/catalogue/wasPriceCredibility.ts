/**
 * Ask the rest of the market whether one shop's reference price is believable.
 *
 * ── What the owner asked for, and what the measurement said ─────────────────
 * The request was to take the RRP from the brand's own site instead of
 * trusting retailers. That was measured and it does not work: of 3,589 active
 * brand-direct listings only 1,055 (29.4%) carry a sterling price at all, from
 * six houses (The Body Shop 417, Paris Corner 241, Jo Loves 216, Escentric
 * Molecules 118, Lattafa 47, Reef 16); the rest publish AED, USD, EUR or IDR,
 * and this project will not invent an exchange rate (see RawListing.nativePrice
 * in types.ts). Worse, where a brand-direct sterling price and a retailer offer
 * both exist the brand is frequently the *cheaper* of the two, so using it as
 * the RRP would produce negative savings.
 *
 * So the reference has to come from the market, and the market is already here:
 * every other shop selling the identical bottle.
 *
 * ── The instinct was right; the suspect was wrong ───────────────────────────
 * Measured over demo/catalogue.generated.ts on 2026-08-25, 12,190 offers claim
 * a reduction (`wasPrice > price`). Comparing each claim against the RRP other
 * shops publish for the identical bottle, n=5,391:
 *
 *     median ratio  1.000      p75  1.062      p95  1.489
 *
 * Shops agree with each other about RRP, and Perfume Click's own median against
 * everyone else's stated RRP is exactly 1.00. Perfume Click is not inventing
 * high reference prices. What it does is *publish* the manufacturer's RRP on
 * most of its catalogue where most shops publish none — and an RRP sits far
 * above street price across the whole discount market (median claim is 1.72x
 * the median price other shops actually charge). That is why it produced 51.4%
 * of the deals pool, and it is a definitional problem with strikethrough-
 * against-RRP, not a lie about the number.
 *
 * What that leaves is the tail this file exists to remove: claims the market
 * actively contradicts. Two tests, because there are two kinds of evidence and
 * each answers a question the other cannot.
 *
 * ── Test one: the claimed saving exceeds the whole bottle ───────────────────
 * The *credible ceiling* for a bottle is the highest figure any other shop
 * publishes for it — its selling price, or its own stated RRP, whichever is
 * higher. A claim is refuted when
 *
 *     wasPrice - price  >=  ceiling
 *
 * i.e. the shop says you are saving more than the bottle costs at its most
 * expensive credible source. Gres Cabotine 100ml: MyBeauty.Boutique's RRP
 * £58.99 against £12.19, a claimed £46.80 saving, while the two other shops
 * stocking it charge at most £11.00.
 *
 * Deliberately threshold-free. There is no natural break in the ratio
 * distribution to put a cutoff at (p50 1.00, p75 1.06, p90 1.35, p95 1.63 with
 * two or more other shops), so any multiple would have been a number chosen to
 * produce a result. "The saving is bigger than the entire bottle" is a
 * statement about the claim itself that needs no constant.
 *
 * Including other shops' *stated RRPs* in the ceiling is what stops this test
 * punishing a shop for publishing a genuine RRP the rest of the market also
 * publishes. Clinique Happy 100ml at "RRP £73, now £26.99" is not refuted,
 * because £73 is what Clinique charges; the check has no business overruling
 * the manufacturer just because the discount market sits at £35.
 *
 * ── Test two: the claim contradicts other shops' own RRPs ───────────────────
 * An RRP is a manufacturer fact — the same bottle has the same RRP everywhere —
 * which is the same property src/catalogue/priceScale.ts relies on, and it
 * means this quantity has a true value of 1.00 to test against. Over the 1,374
 * claims where at least two *other* shops also state an RRP:
 *
 *     p50 0.982    p75 1.000    p90 1.111    p95 1.268    p99 1.718
 *
 * Three quarters of claims sit at or below the highest RRP anyone else states.
 * A claim 25% above it is not a rounding difference: MyBeauty.Boutique's RRP
 * £129.99 for YSL Black Opium 30ml against £72.00 from each of two other shops.
 * That threshold is a chosen number, unlike test one's, so it is set where the
 * result stops looking like noise: at 1.25x it catches 60 of MyBeauty's 395
 * checkable claims (15.2%) against 6 of Perfume Click's 412 (1.5%) and 1 of
 * Fragrance Click's 155 (0.6%). Noise spreads evenly across shops; this does
 * not, and the shop it concentrates on is the one already measured overstating
 * its prices seven times in ten against its own storefront (commit 37ef5e8).
 *
 * ── Why two other shops, never one ──────────────────────────────────────────
 * A single reference is one shop's opinion and can itself be the broken one —
 * exactly the Escentual case priceScale.ts exists for. Measured: among claims
 * with three or more other shops, asking only one of them at a time flips the
 * verdict 12.9% of the time against asking all of them. Two independent shops
 * is also the bar the MyBeauty investigation used ("products at least three
 * shops stock"). It costs coverage — only 3,252 of 12,190 claims have two other
 * shops — and that cost is paid rather than hidden: see UNCHECKED below.
 *
 * ── Three verdicts, because there are three states ──────────────────────────
 * A product only one shop sells has no cross-reference at all. The claim on it
 * can be neither confirmed nor refuted, and calling that "fine" would be the
 * same mistake as calling it "false". It is `unchecked`, and it is the majority
 * — 8,938 of 12,190 claims, 73.3%. Nothing here says anything about those.
 *
 * ── Sizes ───────────────────────────────────────────────────────────────────
 * A reference price is meaningless against a different bottle, so every
 * comparison here is size-gated: a reference whose own size differs from the
 * claiming offer's is dropped, and where the product's offers disagree about
 * size at all the whole product is refused rather than judged.
 *
 * That is not theoretical. Products are grouped by EAN first, and one EAN in
 * the live catalogue carries two different bottles: 6290171010456 is Penthouse
 * Windsor at Beautybase (80ml, £15.00) and at Perfume Click (100ml, £14.15).
 * One of 1,300 multi-listing groups, but it is the exact shape that would let
 * an 80ml price refute a 100ml RRP.
 *
 * ── Nothing here reads the network ──────────────────────────────────────────
 * Every figure is already on disk when this runs, which is what makes the
 * result reproducible and the numbers above re-measurable at any time.
 */

/** One shop's offer on a bottle, as much of it as this check needs. */
export interface CredibilityOffer {
  retailerId: string;
  /** What this shop charges. Always positive by the time this runs. */
  price: number;
  /** What this shop says the bottle is worth. Null where it says nothing. */
  wasPrice: number | null;
  /**
   * Millilitres, as parsed from this shop's own title — not the product
   * record's size. The two are the same for every offer on all but one product
   * in the live catalogue, and this check exists to behave correctly on that
   * one. Null where the size could not be read, which is treated as "cannot
   * compare" rather than "matches".
   */
  sizeMl: number | null;
}

/** What the market had to say about one shop's reference price. */
export type Verdict =
  /**
   * Fewer than two other shops offered evidence of the right kind. The claim
   * stands as the merchant made it, because nothing here has any grounds to
   * touch it — not because it was found sound.
   */
  | 'unchecked'
  /** Checked against the market and contradicted by nothing. */
  | 'corroborated'
  /** Contradicted: see the two tests in this file's header. */
  | 'refuted';

/**
 * How many *other* shops must supply evidence before a verdict is possible.
 * Two, never one — see the header.
 */
export const MIN_REFERENCE_SHOPS = 2;

/**
 * How far above the highest RRP other shops state a claim may sit before it is
 * treated as contradicting them rather than disagreeing with them.
 */
export const MAX_RRP_EXCESS = 1.25;

/** Distinct shops other than `self` in a set of offers. */
function otherShops(offers: readonly CredibilityOffer[], self: CredibilityOffer): CredibilityOffer[] {
  return offers.filter((o) => o.retailerId !== self.retailerId);
}

/**
 * True when every offer on this product describes the same bottle size.
 *
 * Reporting only — `judgeWasPrice` gates each reference individually rather
 * than relying on this, so a product carrying a stray odd size still gets a
 * verdict from the references that do match. Counted in the audit so a
 * grouping that starts mixing bottles is visible in the build log instead of
 * quietly changing what the check compares.
 *
 * A null size is not a match: it is an admission that the size could not be
 * read, and treating it as agreement would be treating an unknown as a fact.
 */
export function sizesAgree(offers: readonly CredibilityOffer[]): boolean {
  if (offers.length === 0) return true;
  const first = offers[0]!.sizeMl;
  if (first === null) return false;
  return offers.every((o) => o.sizeMl === first);
}

/**
 * Judge one shop's reference price against every other shop on the same bottle.
 *
 * `offers` must be every offer on one product, `self` one of them. An offer
 * claiming no reduction is `unchecked`: there is no claim to test.
 */
export function judgeWasPrice(
  offers: readonly CredibilityOffer[],
  self: CredibilityOffer,
): Verdict {
  const was = self.wasPrice;
  if (was === null || !(was > self.price)) return 'unchecked';

  // Size gate, before any arithmetic — see the header. An offer whose own size
  // could not be read has nothing to match against and is never judged; a
  // reference stating a different size is dropped rather than compared.
  if (self.sizeMl === null) return 'unchecked';
  const others = otherShops(offers, self).filter((o) => o.sizeMl === self.sizeMl);

  let checked = false;

  // Test one — the claimed saving against the credible ceiling.
  const ceilingShops = new Set(others.map((o) => o.retailerId));
  if (ceilingShops.size >= MIN_REFERENCE_SHOPS) {
    let ceiling = 0;
    for (const o of others) {
      if (o.price > 0) ceiling = Math.max(ceiling, o.price);
      if (o.wasPrice !== null && o.wasPrice > 0) ceiling = Math.max(ceiling, o.wasPrice);
    }
    if (ceiling > 0) {
      checked = true;
      if (was - self.price >= ceiling) return 'refuted';
    }
  }

  // Test two — the claim against the highest RRP other shops state themselves.
  const stated = others.filter((o) => o.wasPrice !== null && o.wasPrice > 0);
  if (new Set(stated.map((o) => o.retailerId)).size >= MIN_REFERENCE_SHOPS) {
    const topStated = Math.max(...stated.map((o) => o.wasPrice!));
    if (topStated > 0) {
      checked = true;
      if (was >= MAX_RRP_EXCESS * topStated) return 'refuted';
    }
  }

  return checked ? 'corroborated' : 'unchecked';
}

/** What one pass over the catalogue found. */
export interface CredibilityAudit {
  /** Offers claiming a reduction, by verdict. */
  refuted: number;
  corroborated: number;
  unchecked: number;
  /** Refuted claims per shop, so the size of the problem is attributable. */
  refutedByShop: Map<string, number>;
  /** Claims this shop had judged at all, per shop — the denominator for the above. */
  checkedByShop: Map<string, number>;
  /** Products whose offers disagreed about size, so no claim on them was judged. */
  productsWithMixedSizes: number;
}

/**
 * Judge every reference price in the catalogue, one product at a time.
 *
 * Returns the verdicts alongside the counts. The caller decides what to do
 * with a refuted claim; this file only ever states what the market said.
 */
export function auditWasPrices<T extends CredibilityOffer>(
  products: readonly { offers: readonly T[] }[],
): { audit: CredibilityAudit; verdicts: Map<T, Verdict> } {
  const verdicts = new Map<T, Verdict>();
  const audit: CredibilityAudit = {
    refuted: 0,
    corroborated: 0,
    unchecked: 0,
    refutedByShop: new Map(),
    checkedByShop: new Map(),
    productsWithMixedSizes: 0,
  };

  for (const product of products) {
    if (product.offers.length > 1 && !sizesAgree(product.offers)) audit.productsWithMixedSizes++;
    for (const offer of product.offers) {
      if (offer.wasPrice === null || !(offer.wasPrice > offer.price)) continue;
      const verdict = judgeWasPrice(product.offers, offer);
      verdicts.set(offer, verdict);
      audit[verdict]++;
      if (verdict === 'refuted' || verdict === 'corroborated') {
        audit.checkedByShop.set(offer.retailerId, (audit.checkedByShop.get(offer.retailerId) ?? 0) + 1);
      }
      if (verdict === 'refuted') {
        audit.refutedByShop.set(offer.retailerId, (audit.refutedByShop.get(offer.retailerId) ?? 0) + 1);
      }
    }
  }

  return { audit, verdicts };
}
