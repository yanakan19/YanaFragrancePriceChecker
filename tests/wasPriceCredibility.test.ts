import { describe, expect, it } from 'vitest';
import {
  auditWasPrices,
  brandAnchor,
  judgeWasPrice,
  sizesAgree,
  MIN_REFERENCE_SHOPS,
  MAX_RRP_EXCESS,
  type CredibilityOffer,
} from '../src/catalogue/wasPriceCredibility.js';

/**
 * An offer with everything the check reads, defaulting to a plain 100ml
 * listing from an ordinary multi-brand shop. `brandDirect` defaults off for
 * the same reason it does in the builder: the failure mode of forgetting to
 * set it is a missing anchor, never a wrongly attributed one.
 */
function offer(p: Partial<CredibilityOffer> & { retailerId: string; price: number }): CredibilityOffer {
  return { wasPrice: null, sizeMl: 100, brandDirect: false, ...p };
}

/** The bottle's own house, selling its own bottle. */
function house(p: Partial<CredibilityOffer> & { retailerId: string; price: number }): CredibilityOffer {
  return offer({ ...p, brandDirect: true });
}

describe('judgeWasPrice — nothing to judge', () => {
  it('is unchecked when the shop claims no reduction', () => {
    const a = offer({ retailerId: 'a', price: 25, wasPrice: null });
    const rest = [offer({ retailerId: 'b', price: 24 }), offer({ retailerId: 'c', price: 26 })];
    expect(judgeWasPrice([a, ...rest], a)).toBe('unchecked');
  });

  it('is unchecked when the reference price is at or below the selling price', () => {
    const a = offer({ retailerId: 'a', price: 25, wasPrice: 25 });
    const rest = [offer({ retailerId: 'b', price: 24 }), offer({ retailerId: 'c', price: 26 })];
    expect(judgeWasPrice([a, ...rest], a)).toBe('unchecked');
  });
});

describe('judgeWasPrice — how much market it takes to have an opinion', () => {
  it('is unchecked when nobody else sells the bottle', () => {
    const a = offer({ retailerId: 'a', price: 25, wasPrice: 77.99 });
    expect(judgeWasPrice([a], a)).toBe('unchecked');
  });

  it('is unchecked on one other shop, however far off the claim looks', () => {
    const a = offer({ retailerId: 'a', price: 25, wasPrice: 500 });
    expect(judgeWasPrice([a, offer({ retailerId: 'b', price: 24 })], a)).toBe('unchecked');
  });

  it('refuses to treat two listings from the same shop as two shops', () => {
    const a = offer({ retailerId: 'a', price: 25, wasPrice: 500 });
    const twice = [offer({ retailerId: 'b', price: 24 }), offer({ retailerId: 'b', price: 23 })];
    expect(judgeWasPrice([a, ...twice], a)).toBe('unchecked');
  });

  it('has an opinion at exactly MIN_REFERENCE_SHOPS other shops', () => {
    expect(MIN_REFERENCE_SHOPS).toBe(2);
    const a = offer({ retailerId: 'a', price: 25, wasPrice: 500 });
    const rest = [offer({ retailerId: 'b', price: 24 }), offer({ retailerId: 'c', price: 26 })];
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });
});

describe('judgeWasPrice — test zero, the house’s own price', () => {
  /* Armaf Club De Nuit Intense Man EDT 105ml (ean-6085010044712) as the live
     catalogue held it on 2026-08-26. Three shops state ~£69 and corroborate
     each other, which is exactly why the market tests passed the claim; Armaf
     itself sells the bottle for £37.99. */
  const armafShelf = [
    offer({ retailerId: 'perfume-click', price: 23.8, wasPrice: 69, sizeMl: 105 }),
    offer({ retailerId: 'the-beauty-store-uk', price: 26.99, wasPrice: 69, sizeMl: 105 }),
    offer({ retailerId: 'mybeauty-boutique', price: 25.49, wasPrice: 68.99, sizeMl: 105 }),
    offer({ retailerId: 'emirates-oud', price: 26.99, wasPrice: 40, sizeMl: 105 }),
    offer({ retailerId: 'fragrancehub', price: 27.95, wasPrice: 29.95, sizeMl: 105 }),
    offer({ retailerId: 'beautybase', price: 29, sizeMl: 105 }),
    offer({ retailerId: 'justmylook', price: 23.99, sizeMl: 105 }),
  ];
  const armaf = house({ retailerId: 'armaf', price: 37.99, sizeMl: 105 });

  it('refutes the £69 claim three shops corroborate, because Armaf charges £37.99', () => {
    const claim = armafShelf[0]!;
    expect(judgeWasPrice(armafShelf, claim)).toBe('corroborated');
    expect(judgeWasPrice([...armafShelf, armaf], claim)).toBe('refuted');
  });

  it('refutes every claim above the house price, however many shops repeat it', () => {
    const shelf = [...armafShelf, armaf];
    for (const id of ['perfume-click', 'the-beauty-store-uk', 'mybeauty-boutique', 'emirates-oud']) {
      const claim = shelf.find((o) => o.retailerId === id)!;
      expect(judgeWasPrice(shelf, claim), id).toBe('refuted');
    }
  });

  it('leaves a claim the house does not contradict alone', () => {
    /* FragranceHub's RRP £29.95 is under Armaf's own £37.99, so it is not a
       figure the manufacturer contradicts and the 6% saving survives. */
    const shelf = [...armafShelf, armaf];
    const claim = shelf.find((o) => o.retailerId === 'fragrancehub')!;
    expect(judgeWasPrice(shelf, claim)).toBe('corroborated');
  });

  it('takes the house’s own stated RRP over its sale price', () => {
    /* Armaf lists Club De Nuit Intense Man Limited Edition Pure Parfum 105ml
       at £59.99 was £69.99. A shop stating RRP £69.99 is quoting the house. */
    const onSale = house({ retailerId: 'armaf', price: 59.99, wasPrice: 69.99, sizeMl: 105 });
    const claim = offer({ retailerId: 'a', price: 49.95, wasPrice: 69.99, sizeMl: 105 });
    expect(brandAnchor([claim, onSale], claim)).toBe(69.99);
    expect(judgeWasPrice([claim, onSale], claim)).toBe('corroborated');
  });

  it('needs only one house, where the market tests need two shops', () => {
    const claim = offer({ retailerId: 'a', price: 20, wasPrice: 30 });
    expect(judgeWasPrice([claim], claim)).toBe('unchecked');
    expect(judgeWasPrice([claim, house({ retailerId: 'h', price: 45 })], claim)).toBe('corroborated');
    expect(judgeWasPrice([claim, house({ retailerId: 'h', price: 25 })], claim)).toBe('refuted');
  });

  it('never lets a different size be the anchor', () => {
    const claim = offer({ retailerId: 'a', price: 20, wasPrice: 60, sizeMl: 100 });
    const wrongBottle = house({ retailerId: 'h', price: 25, sizeMl: 30 });
    expect(brandAnchor([claim, wrongBottle], claim)).toBe(0);
    expect(judgeWasPrice([claim, wrongBottle], claim)).toBe('unchecked');
  });

  it('does not let a house corroborate its own claim', () => {
    /* Self is excluded from the anchor exactly like every other reference in
       this file, so a house's own strikethrough is judged by the market or not
       at all — never by itself. */
    const claim = house({ retailerId: 'h', price: 20, wasPrice: 500 });
    expect(brandAnchor([claim], claim)).toBe(0);
    expect(judgeWasPrice([claim], claim)).toBe('unchecked');
  });

  it('still lets the market refute a claim the house price allows', () => {
    /* £190 is under the house's £200, so test zero passes it, and the claimed
       £90 saving is well under the ceiling, so test one does too — but two
       other shops each state an RRP of £100 and £190 is 1.9x that. Test zero
       adds evidence; it never overrides the other two. */
    const claim = offer({ retailerId: 'a', price: 100, wasPrice: 190 });
    const shelf = [
      claim,
      house({ retailerId: 'h', price: 200 }),
      offer({ retailerId: 'b', price: 90, wasPrice: 100 }),
      offer({ retailerId: 'c', price: 95, wasPrice: 100 }),
    ];
    expect(brandAnchor(shelf, claim)).toBe(200);
    expect(judgeWasPrice(shelf, claim)).toBe('refuted');
  });

  it('shows no saving at all where the house undercuts the shop', () => {
    /* The case that broke the previous attempt at brand-sourced RRP: the house
       is cheaper than the retailer, so there is no saving to render and
       substituting the house price in would produce a negative one. Nothing is
       substituted; the claim is simply refuted and the strikethrough withheld,
       leaving the house's own offer on the page to make the comparison. */
    const claim = offer({ retailerId: 'a', price: 45, wasPrice: 60 });
    const shelf = [claim, house({ retailerId: 'h', price: 37.99 })];
    expect(judgeWasPrice(shelf, claim)).toBe('refuted');
    expect(claim.wasPrice! - claim.price).toBeGreaterThan(0);
  });

  it('refutes only strictly above the house price, not at it', () => {
    const claim = offer({ retailerId: 'a', price: 20, wasPrice: 40 });
    expect(judgeWasPrice([claim, house({ retailerId: 'h', price: 40 })], claim)).toBe('corroborated');
    expect(judgeWasPrice([claim, house({ retailerId: 'h', price: 39.99 })], claim)).toBe('refuted');
  });
});

describe('judgeWasPrice — test one, the saving against the credible ceiling', () => {
  /* Gres Cabotine 100ml as the live catalogue held it on 2026-08-25. */
  it('refutes a saving larger than the whole bottle costs anywhere', () => {
    const a = offer({ retailerId: 'mybeauty-boutique', price: 12.19, wasPrice: 58.99 });
    const rest = [
      offer({ retailerId: 'perfume-click', price: 11.0 }),
      offer({ retailerId: 'the-beauty-store-uk', price: 10.5 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });

  it('corroborates a saving that stays inside the market', () => {
    const a = offer({ retailerId: 'a', price: 26.99, wasPrice: 40 });
    const rest = [offer({ retailerId: 'b', price: 30 }), offer({ retailerId: 'c', price: 35 })];
    expect(judgeWasPrice([a, ...rest], a)).toBe('corroborated');
  });

  it('is decided by the highest price in the market, not the median', () => {
    const a = offer({ retailerId: 'a', price: 10, wasPrice: 45 });
    // Median of the others is 12; their maximum is 36. 45 - 10 = 35 < 36.
    const rest = [
      offer({ retailerId: 'b', price: 11 }),
      offer({ retailerId: 'c', price: 12 }),
      offer({ retailerId: 'd', price: 36 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('corroborated');
  });

  it('counts another shop’s own stated RRP as part of the ceiling', () => {
    /* Clinique Happy 100ml: £73 is a real Clinique list price, and the check
       has no business overruling the manufacturer just because the discount
       market sits at £35. Without the other shop's RRP in the ceiling this
       would be refuted, £73 - £26.99 = £46.01 against a top price of £35. */
    const a = offer({ retailerId: 'a', price: 26.99, wasPrice: 73 });
    const rest = [
      offer({ retailerId: 'b', price: 35, wasPrice: 73 }),
      offer({ retailerId: 'c', price: 30 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('corroborated');
  });

  it('refutes at the boundary — a saving exactly equal to the ceiling', () => {
    const a = offer({ retailerId: 'a', price: 10, wasPrice: 30 });
    const rest = [offer({ retailerId: 'b', price: 20 }), offer({ retailerId: 'c', price: 18 })];
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });
});

describe('judgeWasPrice — test two, the claim against other shops’ own RRPs', () => {
  /* YSL Black Opium 30ml as the live catalogue held it on 2026-08-25:
     MyBeauty.Boutique states £129.99 where two other shops each state £72. */
  it('refutes a claim well above every other shop’s stated RRP', () => {
    const a = offer({ retailerId: 'mybeauty-boutique', price: 72.49, wasPrice: 129.99 });
    const rest = [
      offer({ retailerId: 'perfume-click', price: 55, wasPrice: 72 }),
      offer({ retailerId: 'the-beauty-store-uk', price: 58, wasPrice: 72 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });

  it('catches what the ceiling test alone cannot', () => {
    /* The same claim, with the ceiling test satisfied: the saving (£57.50) is
       comfortably under the ceiling (£72), so test one passes it. */
    const a = offer({ retailerId: 'a', price: 72.49, wasPrice: 129.99 });
    const rest = [
      offer({ retailerId: 'b', price: 55, wasPrice: 72 }),
      offer({ retailerId: 'c', price: 58, wasPrice: 72 }),
    ];
    expect(a.wasPrice! - a.price).toBeLessThan(72);
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });

  it('lets an ordinary disagreement about RRP stand', () => {
    const a = offer({ retailerId: 'a', price: 40, wasPrice: 78 });
    const rest = [
      offer({ retailerId: 'b', price: 45, wasPrice: 75 }),
      offer({ retailerId: 'c', price: 44, wasPrice: 72 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('corroborated');
  });

  it('measures against the highest other RRP, not their median', () => {
    const a = offer({ retailerId: 'a', price: 40, wasPrice: 100 });
    // Median other RRP is 72, which 100 exceeds by 1.39x; the highest is 90.
    const rest = [
      offer({ retailerId: 'b', price: 45, wasPrice: 72 }),
      offer({ retailerId: 'c', price: 44, wasPrice: 90 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('corroborated');
  });

  it('needs two other shops stating an RRP, not one', () => {
    const a = offer({ retailerId: 'a', price: 40, wasPrice: 200 });
    const rest = [
      offer({ retailerId: 'b', price: 45, wasPrice: 72 }),
      offer({ retailerId: 'c', price: 190 }),
    ];
    // Only one other shop states an RRP, so test two never runs; test one
    // passes it because the ceiling is £190.
    expect(judgeWasPrice([a, ...rest], a)).toBe('corroborated');
  });

  it('refutes at exactly MAX_RRP_EXCESS', () => {
    expect(MAX_RRP_EXCESS).toBe(1.25);
    const a = offer({ retailerId: 'a', price: 60, wasPrice: 100 });
    const rest = [
      offer({ retailerId: 'b', price: 65, wasPrice: 80 }),
      offer({ retailerId: 'c', price: 66, wasPrice: 80 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });
});

describe('judgeWasPrice — sizes, which must match', () => {
  /* EAN 6290171010456 in the live catalogue: Penthouse Windsor at Beautybase
     is 80ml at £15.00, at Perfume Click 100ml at £14.15. One EAN, two bottles. */
  it('never lets a different size refute a claim', () => {
    const a = offer({ retailerId: 'a', price: 60, wasPrice: 200, sizeMl: 100 });
    const rest = [
      offer({ retailerId: 'b', price: 15, sizeMl: 30 }),
      offer({ retailerId: 'c', price: 16, sizeMl: 30 }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('unchecked');
  });

  it('uses only the same-size offers when a product mixes sizes', () => {
    const a = offer({ retailerId: 'a', price: 60, wasPrice: 200, sizeMl: 100 });
    const rest = [
      offer({ retailerId: 'b', price: 15, sizeMl: 30 }),
      offer({ retailerId: 'c', price: 55, sizeMl: 100 }),
      offer({ retailerId: 'd', price: 58, sizeMl: 100 }),
    ];
    // Ceiling from the 100ml pair is £58; the claimed saving is £140.
    expect(judgeWasPrice([a, ...rest], a)).toBe('refuted');
  });

  it('cannot judge an offer whose own size could not be read', () => {
    const a = offer({ retailerId: 'a', price: 60, wasPrice: 500, sizeMl: null });
    const rest = [offer({ retailerId: 'b', price: 55 }), offer({ retailerId: 'c', price: 58 })];
    expect(judgeWasPrice([a, ...rest], a)).toBe('unchecked');
  });

  it('does not treat an unreadable size as matching an unreadable size', () => {
    const a = offer({ retailerId: 'a', price: 60, wasPrice: 500, sizeMl: null });
    const rest = [
      offer({ retailerId: 'b', price: 55, sizeMl: null }),
      offer({ retailerId: 'c', price: 58, sizeMl: null }),
    ];
    expect(judgeWasPrice([a, ...rest], a)).toBe('unchecked');
  });
});

describe('sizesAgree', () => {
  it('is true for one size and for no offers at all', () => {
    expect(sizesAgree([])).toBe(true);
    expect(sizesAgree([offer({ retailerId: 'a', price: 1 })])).toBe(true);
  });

  it('is false when the sizes differ, and when any size is unknown', () => {
    expect(sizesAgree([
      offer({ retailerId: 'a', price: 1, sizeMl: 80 }),
      offer({ retailerId: 'b', price: 1, sizeMl: 100 }),
    ])).toBe(false);
    expect(sizesAgree([
      offer({ retailerId: 'a', price: 1, sizeMl: null }),
      offer({ retailerId: 'b', price: 1, sizeMl: null }),
    ])).toBe(false);
  });
});

describe('auditWasPrices', () => {
  const products = [
    // Refuted: the claimed saving is bigger than the bottle costs anywhere.
    {
      offers: [
        offer({ retailerId: 'shouty', price: 12, wasPrice: 59 }),
        offer({ retailerId: 'b', price: 11 }),
        offer({ retailerId: 'c', price: 10.5 }),
      ],
    },
    // Corroborated.
    {
      offers: [
        offer({ retailerId: 'shouty', price: 27, wasPrice: 40 }),
        offer({ retailerId: 'b', price: 30 }),
        offer({ retailerId: 'c', price: 35 }),
      ],
    },
    // Unchecked: one shop, no market.
    { offers: [offer({ retailerId: 'lonely', price: 20, wasPrice: 60 })] },
    // Mixed sizes, counted and never compared across.
    {
      offers: [
        offer({ retailerId: 'shouty', price: 15, wasPrice: 90, sizeMl: 80 }),
        offer({ retailerId: 'b', price: 14, sizeMl: 100 }),
        offer({ retailerId: 'c', price: 13, sizeMl: 100 }),
      ],
    },
    // Refuted by the house alone: nobody else stocks it, so no market test
    // could run and this would otherwise be unchecked.
    {
      offers: [
        offer({ retailerId: 'shouty', price: 20, wasPrice: 60 }),
        house({ retailerId: 'h', price: 30 }),
      ],
    },
    // Corroborated by the house alone, on the same absent market.
    {
      offers: [
        offer({ retailerId: 'quiet', price: 20, wasPrice: 28 }),
        house({ retailerId: 'h', price: 30 }),
      ],
    },
  ];

  const { audit, verdicts } = auditWasPrices(products);

  it('counts every claim exactly once, under one verdict', () => {
    expect(audit.refuted).toBe(2);
    expect(audit.corroborated).toBe(2);
    expect(audit.unchecked).toBe(2);
    expect(verdicts.size).toBe(6);
  });

  it('attributes refutations to the shop that made the claim', () => {
    expect([...audit.refutedByShop].sort()).toEqual([['shouty', 2]]);
  });

  it('reports the denominator, so a rate can be read off the log', () => {
    expect(audit.checkedByShop.get('shouty')).toBe(3);
    expect(audit.checkedByShop.has('lonely')).toBe(false);
  });

  it('reports brand-direct evidence separately from the market’s', () => {
    // Two products carry a house offer; both claims on them are anchored.
    expect(audit.brandAnchored).toBe(2);
    expect(audit.refutedByBrand).toBe(1);
    // Neither had two other shops, so both are coverage the market could not
    // have reached — one withheld, one earned.
    expect(audit.brandOnlyEvidence).toBe(2);
  });

  it('notices a product whose offers disagree about bottle size', () => {
    expect(audit.productsWithMixedSizes).toBe(1);
  });

  it('says nothing at all about offers that claim no reduction', () => {
    const plain = products[0]!.offers[1]!;
    expect(verdicts.has(plain)).toBe(false);
  });
});
