import { describe, expect, it } from 'vitest';
import {
  cheapestVariant,
  parseRates,
  QUOTE_POSTCODE,
  shouldAttemptCheckoutQuote,
} from '../src/catalogue/shippingQuote.js';

describe('shipping rate quotes', () => {
  describe('picking what to quote against', () => {
    it('picks the cheapest available variant', () => {
      const got = cheapestVariant([
        { title: 'Expensive', variants: [{ id: 1, price: '300.00', available: true }] },
        { title: 'Cheap', variants: [{ id: 2, price: '12.50', available: true }] },
      ]);
      expect(got).toEqual({ id: 2, title: 'Cheap', price: 12.5 });
    });

    it('ignores out-of-stock variants, which cannot be quoted against', () => {
      const got = cheapestVariant([
        { title: 'Sold out', variants: [{ id: 1, price: '5.00', available: false }] },
        { title: 'In stock', variants: [{ id: 2, price: '40.00', available: true }] },
      ]);
      expect(got?.id).toBe(2);
    });

    it('ignores free or zero-priced variants', () => {
      // A £0 line is usually a sample or a gift-with-purchase, and quoting
      // against it can produce a rate no real basket would ever see.
      const got = cheapestVariant([
        { title: 'Freebie', variants: [{ id: 1, price: '0.00', available: true }] },
        { title: 'Real', variants: [{ id: 2, price: '9.99', available: true }] },
      ]);
      expect(got?.id).toBe(2);
    });

    it('returns null when nothing is purchasable', () => {
      expect(cheapestVariant([{ title: 'X', variants: [{ id: 1, price: '10', available: false }] }])).toBeNull();
    });

    it('why cheapest: an expensive bottle clears the free-delivery threshold', () => {
      // Quoting against a £300 bottle returns £0 at almost every shop, which is
      // the one answer that tells us nothing about the standard rate.
      const got = cheapestVariant([
        { title: 'Flagship', variants: [{ id: 1, price: '300.00', available: true }] },
        { title: 'Rollerball', variants: [{ id: 2, price: '14.00', available: true }] },
      ]);
      expect(got!.price).toBe(14);
    });
  });

  describe('reading the response', () => {
    it('parses rates cheapest first', () => {
      const body = JSON.stringify({
        shipping_rates: [
          { name: 'Express', price: '7.99', currency: 'GBP' },
          { name: 'Standard Delivery', price: '3.99', currency: 'GBP' },
        ],
      });
      const rates = parseRates(body);
      expect(rates.map((r) => r.priceGbp)).toEqual([3.99, 7.99]);
      expect(rates[0]!.name).toBe('Standard Delivery');
    });

    it('keeps the shop\'s own currency rather than assuming sterling', () => {
      const body = JSON.stringify({ shipping_rates: [{ name: 'Std', price: '5.00', currency: 'USD' }] });
      expect(parseRates(body)[0]!.currency).toBe('USD');
    });

    it('reads a free rate as a real zero, not as missing', () => {
      // £0.00 from the estimator is the shop stating delivery is free on this
      // basket, which is a genuine answer — unlike a £0.00 scraped out of prose.
      const body = JSON.stringify({ shipping_rates: [{ name: 'Free Delivery', price: '0.00', currency: 'GBP' }] });
      expect(parseRates(body)[0]!.priceGbp).toBe(0);
    });

    it('returns nothing for a non-JSON body', () => {
      expect(parseRates('<html>Not found</html>')).toEqual([]);
    });

    it('returns nothing when the shop offers no rates', () => {
      expect(parseRates(JSON.stringify({ shipping_rates: [] }))).toEqual([]);
    });
  });

  it('quotes against a real UK mainland postcode', () => {
    // Not a Highlands or islands postcode, which would carry a surcharge that
    // is not what most buyers pay.
    expect(QUOTE_POSTCODE).toBe('SW1A 1AA');
  });

  describe('shouldAttemptCheckoutQuote', () => {
    // Zero clean findings covers every shape of "the page did not settle it":
    // nothing usable at all; Emirates Oud's own shipping-policy page ("the
    // final price is calculated at checkout" — an absence claim, not a clean
    // rate); and KAYALI's refund-policy page, which names delivery terms with
    // no flat rate and disagrees with the registry's stored £5.50. None of
    // those is a clean rate, so all of them still get asked — the checkout
    // estimator does not require the page's finding to agree with the
    // registry first, only that it fell short of a clean answer.
    it('attempts the quote whenever the page produced no clean rate', () => {
      expect(shouldAttemptCheckoutQuote(0)).toBe(true);
    });

    it('skips the quote once the page already answered cleanly', () => {
      expect(shouldAttemptCheckoutQuote(1)).toBe(false);
      expect(shouldAttemptCheckoutQuote(2)).toBe(false);
    });
  });
});
