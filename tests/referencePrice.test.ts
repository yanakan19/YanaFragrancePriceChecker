import { describe, expect, it } from 'vitest';
import { pickReferencePrice, type ReferenceCandidateOffer } from '../demo/referencePrice.js';

const offer = (wasPriceGbp: number | null, isHouseOffer = false): ReferenceCandidateOffer => ({
  wasPriceGbp,
  isHouseOffer,
});

describe('pickReferencePrice', () => {
  it('picks the house price outright when one is set, ignoring every retailer offer', () => {
    // Even a higher corroborated retailer figure loses: the two are not the
    // same kind of evidence, and the house's own word wins regardless — see
    // this file's own header on why a house mid-sale is not thereby a weaker
    // claim than a shop's RRP.
    expect(pickReferencePrice(30, [offer(45)])).toEqual({ tier: 'house', amountGbp: 30 });
  });

  it('falls back to the highest corroborated retailer price when there is no house price', () => {
    expect(pickReferencePrice(null, [offer(45), offer(50), offer(48)])).toEqual({
      tier: 'retailerRrp',
      amountGbp: 50,
    });
  });

  it('never reads an offer with no corroborated wasPrice', () => {
    // null is the shape an uncorroborated or refuted claim takes by the time
    // it reaches this file (build-demo-catalogue.ts already nulled it), and
    // a claiming-nothing offer must never be mistaken for a zero reference.
    expect(pickReferencePrice(null, [offer(null), offer(null)])).toBeNull();
  });

  it('returns null with no offers and no house price', () => {
    expect(pickReferencePrice(null, [])).toBeNull();
  });

  it('excludes the fragrance house\'s own offer from the retailer tier', () => {
    // The house's own storefront reselling this bottle is not "a retailer
    // claim" — it is exactly the evidence that would have set houseCeiling,
    // had it size-matched. Counting it again here would misattribute the
    // manufacturer's own word as a retailer's guess.
    expect(pickReferencePrice(null, [offer(60, true), offer(40)])).toEqual({
      tier: 'retailerRrp',
      amountGbp: 40,
    });
  });

  it('returns null when every candidate is the house\'s own excluded offer', () => {
    expect(pickReferencePrice(null, [offer(60, true), offer(70, true)])).toBeNull();
  });

  it('ignores a non-positive wasPrice rather than treating it as a real reference', () => {
    expect(pickReferencePrice(null, [offer(0), offer(-5)])).toBeNull();
  });

  it('treats a house ceiling of 0 the same as no house ceiling at all', () => {
    // houseCeilingGbp is 0 or null in practice never a real "free" ceiling —
    // see houseCeilings in build-demo-catalogue.ts, which only ever records a
    // positive figure. Guarding here anyway keeps this function correct on
    // its own terms rather than trusting the caller never to pass one.
    expect(pickReferencePrice(0, [offer(40)])).toEqual({ tier: 'retailerRrp', amountGbp: 40 });
  });
});
