import { describe, expect, it } from 'vitest';
import {
  auditWasPrices,
  judgeWasPrice,
  sizesAgree,
  MIN_REFERENCE_SHOPS,
  MAX_RRP_EXCESS,
  type CredibilityOffer,
} from '../src/catalogue/wasPriceCredibility.js';

/** An offer with everything the check reads, defaulting to a plain 100ml listing. */
function offer(p: Partial<CredibilityOffer> & { retailerId: string; price: number }): CredibilityOffer {
  return { wasPrice: null, sizeMl: 100, ...p };
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
  ];

  const { audit, verdicts } = auditWasPrices(products);

  it('counts every claim exactly once, under one verdict', () => {
    expect(audit.refuted).toBe(1);
    expect(audit.corroborated).toBe(1);
    expect(audit.unchecked).toBe(2);
    expect(verdicts.size).toBe(4);
  });

  it('attributes refutations to the shop that made the claim', () => {
    expect([...audit.refutedByShop]).toEqual([['shouty', 1]]);
  });

  it('reports the denominator, so a rate can be read off the log', () => {
    expect(audit.checkedByShop.get('shouty')).toBe(2);
    expect(audit.checkedByShop.has('lonely')).toBe(false);
  });

  it('notices a product whose offers disagree about bottle size', () => {
    expect(audit.productsWithMixedSizes).toBe(1);
  });

  it('says nothing at all about offers that claim no reduction', () => {
    const plain = products[0]!.offers[1]!;
    expect(verdicts.has(plain)).toBe(false);
  });
});
