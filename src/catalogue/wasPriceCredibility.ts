/**
 * Ask the rest of the market whether one shop's reference price is believable.
 *
 * ── What the owner asked for, and what the measurement said ─────────────────
 * The request was to take the RRP from the brand's own site instead of
 * trusting retailers. Looking for it in data/houses — the direct-from-house
 * harvest — does not work, and still does not: re-measured 2026-08-26 and
 * unchanged from the original reading, of 3,589 active brand-direct listings
 * only 1,055 (29.4%) carry a sterling price at all, from six houses (The Body
 * Shop 417, Paris Corner 241, Jo Loves 216, Escentric Molecules 118, Lattafa
 * 47, Reef 16); the rest publish AED, USD, EUR or IDR, and this project will
 * not invent an exchange rate (see RawListing.nativePrice in types.ts).
 *
 * That measurement was right about data/houses and wrong about the conclusion
 * drawn from it, because it looked in the wrong place. Fourteen fragrance
 * houses run a UK storefront that is already in the ordinary retailer registry
 * flagged `singleBrandOnly` — armaf.uk, Al Haramain, French Avenue, Zimaya,
 * Kayali, BellaVita, Escentric Molecules, Avon and the rest — and those are
 * harvested into data/catalogue in sterling like any other shop. The brand's
 * own price is therefore already sitting in the offer list of the very product
 * whose RRP is in question. Nothing new has to be fetched.
 *
 * The other half of the old conclusion — "the brand is frequently the *cheaper*
 * of the two, so using it as the RRP would produce negative savings" — is also
 * a fact about data/houses rather than about this source. Measured over the
 * 851 built products that carry a size-matched sterling offer from their own
 * house, 178 of which are also stocked by an ordinary retailer: the house is
 * dearer than the cheapest retailer on 151 of them (84.8%) and cheaper on 27
 * (15.2%). The cheaper case is real and is handled below rather than averaged
 * away — see "Test zero".
 *
 * So there are now two sources of reference evidence, and they are not equal:
 * every other shop selling the identical bottle, and the company that makes it.
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
 * What that leaves is the tail this file exists to remove: claims the evidence
 * actively contradicts. Three tests, because there are three kinds of evidence
 * and each answers a question the others cannot.
 *
 * ── Test zero: the house's own price is a ceiling on its own RRP ────────────
 * Cross-retailer agreement cannot detect retailers copying one another's
 * inflated reference price, and the case that prompted this is exactly that.
 * Armaf Club De Nuit Intense Man EDT 105ml (ean-6085010044712): Perfume Click
 * states RRP £69.00, The Beauty Store £69.00, MyBeauty.Boutique £68.99,
 * Emirates Oud £40.00, FragranceHub £29.95 — five different RRPs for one
 * bottle. The first three corroborate each other, so tests one and two both
 * passed the £69 claim and the site rendered "65% off RRP" against it. Armaf's
 * own shop sells that bottle for £37.99.
 *
 * Three shops repeating a number is not evidence that the number is true. The
 * manufacturer's own till is, and it is the one source that cannot be
 * corroborating a figure it copied from someone else. So a claim is refuted
 * when
 *
 *     wasPrice  >  the highest figure the house itself publishes for this bottle
 *
 * "Highest figure it publishes" and not "its price", because a house discounts
 * its own line too and its own strikethrough is the RRP straight from the
 * source: Armaf lists Club De Nuit Intense Man Limited Edition Pure Parfum
 * 105ml at £59.99 was £69.99, and £69.99 is then a perfectly credible RRP for
 * any shop to state. Taking the maximum is also the safe direction against the
 * grouping being wrong: if a house's own listing for a *different* 105ml
 * variant were ever folded into this product, a maximum can only raise the
 * ceiling and refute fewer claims, never invent a refutation.
 *
 * Threshold-free, like test one and unlike test two — "the shop says the bottle
 * is worth more than the company that makes it charges for it" needs no
 * constant to be a contradiction.
 *
 * One brand-direct shop is enough, where the market tests need two (see "Why
 * two other shops, never one"). That exception is the whole point rather than a
 * relaxation: the reason two shops are needed there is that any one shop may be
 * the broken one, and the argument does not transfer to the house itself. There
 * is exactly one manufacturer, a second opinion on its own price does not
 * exist, and asking for one would be asking for evidence that cannot be
 * produced.
 *
 * Measured over the built catalogue on 2026-08-26. 882 offers are their own
 * product's house (al-haramain 382, armaf 182, french-avenue 118, avon 60,
 * zimaya 50, escentric-molecules 46, kayali 23, bellavita-luxury 21), reaching
 * 851 of 14,784 products; 241 reduction claims have a size-matched house price
 * to be tested against, and 169 of them state an RRP above what the house
 * itself publishes. Verdict by verdict against the two market tests alone, over
 * all 12,195 claims:
 *
 *     corroborated -> refuted      136
 *     unchecked    -> refuted       27
 *     unchecked    -> corroborated  22
 *     unchanged                 12,010
 *
 * The first row is the point: 136 strikethroughs the site renders today, every
 * one of them past both market tests, contradicted by the manufacturer's own
 * price. Armaf Club De Nuit Intense Man EDT 105ml supplies three of them
 * (£69.00, £69.00, £40.00 against Armaf's £37.99) and keeps the fourth,
 * FragranceHub's RRP £29.95 — under the house price, so not a claim the house
 * contradicts, and the page now shows one 6% saving instead of a 65% one.
 *
 * One consequence worth knowing before reading the two tests below. The house's
 * own offer is an ordinary member of test one's ceiling as well, so once a
 * claim survives test zero it cannot fail test one: the ceiling is at least the
 * house ceiling, which is at least the claim, and the claimed *saving* is
 * strictly less than the claim. Where a house price exists, test two is
 * therefore the only one of the other two that can still add a refutation —
 * and it does, which is why all three are run rather than short-circuited.
 *
 * ── What the house price is allowed to earn, not just remove ────────────────
 * 49 of the 241 claims have the house price as their *only* evidence: fewer
 * than MIN_REFERENCE_SHOPS other shops stock the identical size, so neither
 * market test could run and the old verdict was `unchecked` and the
 * strikethrough withheld. Test zero judges them — 27 refuted, 22 corroborated.
 *
 * The 22 are a deliberate widening of a gate the owner asked to keep strict,
 * and the argument for it is that they are not being let through on weaker
 * evidence but on stronger: each is a reference price at or below what the
 * company making the bottle publishes for it, which is a better reason to
 * believe a figure than two discount retailers agreeing. It is 22 claims out
 * of 12,195, so if that argument is not accepted the cost of reverting it is
 * one condition and 22 strikethroughs.
 *
 * ── The house being cheaper is a real case, and it is not a saving ──────────
 * On 27 of the 178 comparable products the house undercuts every retailer.
 * Nothing here substitutes the house's price in as the reference, in that case
 * or any other, and the reason is in src/types/offer.ts's own comment on
 * `wasPrice`: it is *the retailer's* reference price, and putting a figure the
 * retailer never published behind its name, under the "RRP" label demo/app.ts
 * renders, would be a UK CPR pricing-claims problem rather than a modelling
 * choice. So the house price is used only to *refute*, never to supply. Where
 * the house is cheaper, every retailer claim above it is refuted, no
 * strikethrough is shown, and the honest comparison a reader wants is the one
 * already on the page: the house's own shop, listed as an ordinary offer with
 * its own price, in the same list. "Cheaper than buying direct" is a claim this
 * check has the evidence to support and no field to say it in; see the report
 * accompanying this commit for what rendering it would cost.
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
 * The one place that argument does not reach is test zero, where a second
 * opinion is not merely scarce but non-existent: see there.
 *
 * ── Three verdicts, because there are three states ──────────────────────────
 * A product only one shop sells, whose house has no UK storefront here, has no
 * cross-reference at all. The claim on it can be neither confirmed nor refuted,
 * and calling that "fine" would be the same mistake as calling it "false". It
 * is `unchecked`, and it is the majority — 8,879 of 12,195 claims, 72.8%.
 * Nothing here says anything about those:
 * this file only ever states what the evidence did or did not corroborate.
 * scripts/build-demo-catalogue.ts is the caller that decided what to do with
 * an `unchecked` verdict — currently, the same as a `refuted` one — and that
 * decision belongs there, not here, so it can change without this file's
 * three verdicts having to change shape to accommodate it.
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
  /**
   * True when this offer is the fragrance house's own storefront selling its
   * own bottle — armaf.uk on an Armaf product, not Perfume Click on one.
   *
   * Decided by the caller, not here. It is a fact about the retailer registry
   * (`Retailer.singleBrandOnly`) crossed with the product's brand
   * (`cannotCarryBrand`), and this file deliberately imports nothing: keeping
   * the registry lookup on the caller's side is what lets every number in the
   * header above be re-measured from a plain array of offers, and what keeps a
   * single-brand shop's *other* listings — Armaf's shop is still just a shop
   * when the product is not Armaf's — from being read as the house's own word.
   */
  brandDirect: boolean;
}

/** What the market had to say about one shop's reference price. */
export type Verdict =
  /**
   * No evidence of the right kind: fewer than two other shops, and no offer
   * from the house's own storefront. The claim stands as the merchant made it,
   * because nothing here has any grounds to touch it — not because it was
   * found sound.
   */
  | 'unchecked'
  /** Checked against the evidence available and contradicted by none of it. */
  | 'corroborated'
  /** Contradicted: see the three tests in this file's header. */
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

/**
 * The highest figure the fragrance house itself publishes for this bottle,
 * across whichever of these offers come from its own storefront. 0 when none
 * do, which is the "no such evidence" answer rather than a ceiling of zero.
 *
 * Its selling price *and* its own stated reference price both count, and the
 * higher wins: a house running a sale on its own line has not thereby revised
 * its RRP down, and its strikethrough is the RRP from the only source entitled
 * to set one. See the header's Test zero for the Armaf limited-edition case
 * (£59.99 was £69.99) this exists to get right.
 *
 * Callers must have size-matched the offers first — see judgeWasPrice.
 */
function brandCeiling(offers: readonly CredibilityOffer[]): number {
  let ceiling = 0;
  for (const o of offers) {
    if (!o.brandDirect) continue;
    if (o.price > 0) ceiling = Math.max(ceiling, o.price);
    if (o.wasPrice !== null && o.wasPrice > 0) ceiling = Math.max(ceiling, o.wasPrice);
  }
  return ceiling;
}

/** Distinct shops other than `self` in a set of offers. */
function otherShops(offers: readonly CredibilityOffer[], self: CredibilityOffer): CredibilityOffer[] {
  return offers.filter((o) => o.retailerId !== self.retailerId);
}

/**
 * Test zero's ceiling for one claim: the highest figure this bottle's own
 * house publishes for it, size-matched to the claiming offer. 0 when the house
 * has no listing of its own here, or when the claim's own size is unreadable
 * and so nothing can be matched to it.
 *
 * Exported because it is the one number a caller may legitimately want without
 * a verdict — the build log reports how much of the catalogue this evidence
 * reaches, and a test asserts the Armaf case against it directly.
 */
export function brandAnchor(
  offers: readonly CredibilityOffer[],
  self: CredibilityOffer,
): number {
  if (self.sizeMl === null) return 0;
  return brandCeiling(otherShops(offers, self).filter((o) => o.sizeMl === self.sizeMl));
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

  // Test zero — the house's own published figures for its own bottle. Runs
  // first because it is the strongest evidence here and the only kind a ring
  // of retailers copying each other's RRP cannot manufacture. Read off
  // `others`, so a house's own storefront is never the sole witness for its
  // own claim; where it is the claimant, the market tests below still judge it.
  const houseCeiling = brandCeiling(others);
  if (houseCeiling > 0) {
    // Enough on its own — one manufacturer is all there is. See the header.
    checked = true;
    if (was > houseCeiling) return 'refuted';
  }

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
  /**
   * Claims that had test zero's evidence available at all: a size-matched
   * offer from the bottle's own house. The denominator for the two below.
   */
  brandAnchored: number;
  /**
   * Claims stating a reference price above what the house itself publishes.
   * Every one of these is `refuted`, whatever the rest of the market said.
   */
  refutedByBrand: number;
  /**
   * Claims the house's own price was the *only* evidence for — fewer than
   * MIN_REFERENCE_SHOPS other shops stock the identical size, so neither
   * market test could run and the verdict would otherwise be `unchecked`.
   *
   * This is the coverage test zero adds rather than removes, kept separate so
   * the two directions can be read off the build log independently: a rule
   * that only ever withheld strikethroughs and a rule that also earns some
   * should not be reported as one number.
   */
  brandOnlyEvidence: number;
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
    brandAnchored: 0,
    refutedByBrand: 0,
    brandOnlyEvidence: 0,
  };

  for (const product of products) {
    if (product.offers.length > 1 && !sizesAgree(product.offers)) audit.productsWithMixedSizes++;
    for (const offer of product.offers) {
      if (offer.wasPrice === null || !(offer.wasPrice > offer.price)) continue;
      const verdict = judgeWasPrice(product.offers, offer);
      verdicts.set(offer, verdict);
      audit[verdict]++;

      const anchor = brandAnchor(product.offers, offer);
      if (anchor > 0) {
        audit.brandAnchored++;
        if (offer.wasPrice > anchor) audit.refutedByBrand++;
        // "No market test could have run" is exactly "fewer than
        // MIN_REFERENCE_SHOPS other shops stock this size" — test one's
        // ceiling and test two's stated-RRP set are both drawn from that same
        // pool, so neither can reach its quorum when the pool cannot.
        const marketShops = new Set(
          product.offers
            .filter((o) => o.retailerId !== offer.retailerId && o.sizeMl === offer.sizeMl)
            .map((o) => o.retailerId),
        );
        if (marketShops.size < MIN_REFERENCE_SHOPS) audit.brandOnlyEvidence++;
      }
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
