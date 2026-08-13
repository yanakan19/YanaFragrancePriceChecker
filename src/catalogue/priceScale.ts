/**
 * Catch a shop whose whole price list is on a different scale from the market.
 *
 * ── The failure this is the backstop for ────────────────────────────────────
 * Escentual published 2,542 offers on this site at roughly 1.44× what it
 * actually charges — Calvin Klein Obsession For Men 125ml EDT at £57.00
 * against a real £40.25. Nothing downstream could see it. Every offer was
 * individually plausible, the shop's own `/products.json` agreed with our
 * stored figure on 8,098 of 8,102 listings, and a verifier that re-reads the
 * same source can only ever confirm that we copied it correctly.
 *
 * `src/catalogue/shopCurrency.ts` fixes the ingest so the figures are not
 * written as pounds in the first place. This is the second line: a check that
 * does not care *why* a shop's numbers are off, only that they are, and that
 * runs at build time over data already held, with no network.
 *
 * ── What it measures, and why this quantity ─────────────────────────────────
 * Reference prices, not selling prices. A selling price is a business
 * decision: JustMyLook sits at 0.75× the market's median and Beauty Base at
 * 1.07×, both honestly, so no band around a selling price can separate a
 * discounter from a fault. A reference price is a manufacturer fact — the same
 * bottle has the same RRP everywhere — so two honest shops quoting it agree,
 * and the measurement has a true value of 1.00 to test against:
 *
 *   fragrance-click.was / mybeauty-boutique.was   n=188  median 1.000
 *   escentual.was       / fragrance-click.was     n=132  median 1.452
 *   escentual.was       / mybeauty-boutique.was   n=213  median 1.443
 *
 * Escentual agreed with neither, on none of 132 products, by a tight constant.
 *
 * ── Why three conditions and not one ────────────────────────────────────────
 * A shop is only flagged when all three hold, because each one alone has an
 * innocent explanation:
 *
 *   enough overlap    a handful of shared products is small-sample noise, and
 *                     several shops here overlap on fewer than ten
 *   far from 1.00     shops genuinely disagree about RRP at the margins;
 *                     0.9-1.1 is ordinary
 *   tight             this is what separates a *scale* from a *habit*. A shop
 *                     that inflates its "was" for marketing does it unevenly,
 *                     product by product; a shop reporting in the wrong unit
 *                     is off by the same factor on everything. Escentual's
 *                     interquartile spread is 7.8% of its median.
 *
 * Being wrong in the flagging direction costs a shop's offers for a build.
 * Being wrong in the other direction puts a wrong price in front of a shopper.
 * The conditions are set so the second cannot happen quietly.
 */

export interface ScaleOffer {
  retailerId: string;
  wasPrice: number | null;
}

export interface ScaleFinding {
  retailerId: string;
  /** Products where this shop and at least one other both published a reference price. */
  sample: number;
  /** Median of (this shop's reference price / other shops' median reference price). */
  factor: number;
  /** Interquartile spread of that ratio as a share of the median. Small means a scale. */
  spread: number;
}

export interface ScaleAudit {
  /** Shops measured off-scale, worst first. Their offers must not be published. */
  offScale: ScaleFinding[];
  /** Every shop with enough overlap to measure, flagged or not. */
  measured: ScaleFinding[];
}

/** Below this many shared products the ratio is noise, not a measurement. */
const MIN_SAMPLE = 40;
/** Reference prices this far from the market's are still an ordinary disagreement. */
const MAX_DEVIATION = 0.25;
/** Above this interquartile spread it is a habit, not a unit. */
const MAX_SPREAD = 0.25;

function quantile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

function measure(
  products: readonly { offers: readonly ScaleOffer[] }[],
  excluded: ReadonlySet<string>,
): ScaleFinding[] {
  const ratios = new Map<string, number[]>();

  for (const product of products) {
    const priced = product.offers.filter((o) => o.wasPrice !== null && o.wasPrice > 0);
    if (priced.length < 2) continue;

    for (const offer of priced) {
      if (excluded.has(offer.retailerId)) continue;
      const others = priced
        .filter((o) => o.retailerId !== offer.retailerId && !excluded.has(o.retailerId))
        .map((o) => o.wasPrice!)
        .sort((a, b) => a - b);
      if (others.length === 0) continue;
      const market = quantile(others, 0.5);
      if (!(market > 0)) continue;
      let bucket = ratios.get(offer.retailerId);
      if (!bucket) { bucket = []; ratios.set(offer.retailerId, bucket); }
      bucket.push(offer.wasPrice! / market);
    }
  }

  const findings: ScaleFinding[] = [];
  for (const [retailerId, xs] of ratios) {
    if (xs.length < MIN_SAMPLE) continue;
    xs.sort((a, b) => a - b);
    const factor = quantile(xs, 0.5);
    if (!(factor > 0)) continue;
    findings.push({
      retailerId,
      sample: xs.length,
      factor,
      spread: (quantile(xs, 0.75) - quantile(xs, 0.25)) / factor,
    });
  }
  return findings;
}

function isOffScale(f: ScaleFinding): boolean {
  return Math.abs(f.factor - 1) > MAX_DEVIATION && f.spread <= MAX_SPREAD;
}

/**
 * Find shops whose reference prices are not on the market's scale.
 *
 * Run one shop at a time, worst first, re-measuring after each. A shop that is
 * off-scale drags the market median it is part of, which makes the honest
 * shops around it look off in the opposite direction — Escentual's 1.44 is
 * what pushed Fragrance Click's measurement to 0.72 against a true 1.00. So
 * only the single worst offender is condemned per round, and the rest are
 * judged again with it removed.
 */
export function auditPriceScale(
  products: readonly { offers: readonly ScaleOffer[] }[],
): ScaleAudit {
  const excluded = new Set<string>();
  const offScale: ScaleFinding[] = [];

  // One round per shop at most; in practice it settles after the first.
  for (let round = 0; round < 8; round++) {
    const findings = measure(products, excluded);
    const candidates = findings.filter(isOffScale).sort(
      (a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1),
    );
    const worst = candidates[0];
    if (!worst) return { offScale, measured: findings };
    offScale.push(worst);
    excluded.add(worst.retailerId);
  }

  return { offScale, measured: measure(products, excluded) };
}
