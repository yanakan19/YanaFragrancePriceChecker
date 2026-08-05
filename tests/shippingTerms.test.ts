import { describe, expect, it } from 'vitest';
import {
  extractShippingClaims, readShippingTerms, textFromHtml, SHIPPING_PAGE_PATHS,
} from '../src/catalogue/shippingTerms.js';

describe('shipping terms extraction', () => {
  describe('textFromHtml', () => {
    it('drops markup and decodes the entities that carry the figures', () => {
      const html = '<div><style>p{}</style><p>Standard delivery is &pound;3.95.</p></div>';
      expect(textFromHtml(html)).toBe('Standard delivery is £3.95.');
    });

    it('does not let script contents leak in as prose', () => {
      const html = '<script>var shipping = "£99.99 delivery";</script><p>Delivery £2.99.</p>';
      expect(textFromHtml(html)).not.toContain('99.99');
    });
  });

  describe('the number we actually need', () => {
    it('reads a flat standard rate stated on its own', () => {
      const r = readShippingTerms('<p>Standard UK delivery costs £3.95 and takes 2-4 working days.</p>');
      expect(r.standardGbp).toBe(3.95);
    });

    it('reads the rate and the threshold when one sentence states both', () => {
      const r = readShippingTerms('<p>UK delivery is £4.50, free on all orders over £22.</p>');
      expect(r.standardGbp).toBe(4.5);
      expect(r.freeOverGbp).toBe(22);
    });

    it('does not mistake the free-over threshold for the cost', () => {
      // This is the exact failure the whole module exists to avoid: reading
      // "free over £50" and recording £50 as what delivery costs.
      const r = readShippingTerms('<p>Enjoy free UK delivery on all orders over £50.</p>');
      expect(r.standardGbp).toBeNull();
      expect(r.freeOverGbp).toBe(50);
    });
  });

  describe('refusing to be confidently wrong', () => {
    it('ignores a price attached to a named express service', () => {
      const r = readShippingTerms('<p>Next day delivery is £5.95.</p>');
      expect(r.standardGbp).toBeNull();
      expect(r.caveats.join(' ')).toMatch(/express/i);
    });

    it('keeps the standard rate when express is named in a separate sentence', () => {
      const r = readShippingTerms(
        '<p>Standard delivery £2.95. Next day delivery is £5.95.</p>',
      );
      expect(r.standardGbp).toBe(2.95);
    });

    it('ignores returns, customs and international charges', () => {
      const html = `<p>Returns postage is £3.99.</p>
        <p>International shipping to Europe starts at £12.00.</p>
        <p>Customs duty may add £20 to delivery.</p>`;
      expect(readShippingTerms(html).standardGbp).toBeNull();
    });

    it('ignores numbers in sentences that are not about delivery at all', () => {
      expect(readShippingTerms('<p>Spend £30 to get 10% off your first order.</p>').standardGbp).toBeNull();
    });

    it('flags a page naming several different charges rather than picking silently', () => {
      const r = readShippingTerms('<p>Delivery £2.95. Delivery to Scotland is £6.95.</p>');
      expect(r.caveats.join(' ')).toMatch(/different delivery charges/i);
      // It still reports a candidate, but the caveat is what stops it being trusted.
      expect(r.standardGbp).toBe(2.95);
    });

    it('will not record zero from an unconditional free claim on its own', () => {
      const r = readShippingTerms('<p>We offer free delivery on every order.</p>');
      expect(r.standardGbp).toBeNull();
      expect(r.caveats.join(' ')).toMatch(/confirm it is unconditional/i);
    });

    it('says plainly when a page carried no delivery terms', () => {
      const r = readShippingTerms('<p>About our company and our history.</p>');
      expect(r.claims).toHaveLength(0);
      expect(r.caveats.join(' ')).toMatch(/no delivery terms recognised/i);
    });
  });

  describe('evidence', () => {
    it('quotes the sentence every candidate came from', () => {
      const claims = extractShippingClaims('<p>Standard UK delivery costs £3.95.</p>');
      expect(claims[0]!.evidence).toContain('£3.95');
    });
  });

  describe('candidate paths', () => {
    it("leads with Shopify's canonical policy URL", () => {
      expect(SHIPPING_PAGE_PATHS[0]).toBe('/policies/shipping-policy');
    });

    it('covers the real paths these shops were seen using', () => {
      // Observed on armaf.uk and alharamainperfumes.co.uk respectively.
      expect(SHIPPING_PAGE_PATHS).toContain('/pages/shipping-details');
      expect(SHIPPING_PAGE_PATHS).toContain('/pages/delivery-information');
    });
  });
});
