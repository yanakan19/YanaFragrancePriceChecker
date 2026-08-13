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

  // Every sentence below is verbatim from data/shipping-discovery-report.json,
  // the first live run of this tool. Each one produced a wrong answer.
  describe('regressions from the first live run', () => {
    it('does not read a cart widget as a delivery charge', () => {
      // Manchester Ouds: this made £200 the "confirmed" standard rate.
      const r = readShippingTerms(
        '<p>Your order qualifies for free shipping You are £200 away from free shipping.</p>' +
          '<p>Standard shipping is free on orders over £50, while a nominal fee applies to orders below £50.</p>',
      );
      expect(r.standardGbp).not.toBe(200);
      expect(r.freeOverGbp).toBe(50);
    });

    it('does not read a header basket total as a delivery charge', () => {
      // Oud Arabian: "Hurry Up 0 0 / £0.00 ... Shipping policy ..." ranked
      // above the real figure because zero is the lowest candidate.
      const r = readShippingTerms(
        '<p>Hurry Up 0 0 / £0.00 New Releases Best Sellers Brands Contact Us Shipping policy We work with trusted third-party delivery companies.</p>' +
          '<p>Standard Delivery (3–5 Working Days): £3.99 Our standard delivery option ensures your order arrives within 3–5 working days.</p>',
      );
      expect(r.standardGbp).toBe(3.99);
    });

    it('picks the sentence that names the standard service over one that does not', () => {
      const r = readShippingTerms(
        '<p>A delivery charge of £1.50 may apply to certain postcodes.</p>' +
          '<p>Standard Delivery (3–5 Working Days): £3.99.</p>',
      );
      expect(r.standardGbp).toBe(3.99);
    });

    it('treats "spend over £X" as a threshold whatever the reward is', () => {
      // Al Haramain: "Half-Price Shipping when you spend over £150" became a
      // £150 standard rate.
      const r = readShippingTerms(
        '<p>We offer three shipping options: Standard Shipping, Discounted Shipping when you spend over £150, and Half-Price Shipping.</p>',
      );
      expect(r.standardGbp).toBeNull();
    });

    it('still reads the real rate off a page that also has cart chrome', () => {
      const r = readShippingTerms(
        '<p>0 items in your cart £0.00</p>' +
          '<p>Standard delivery £2.95, free on orders over £40.</p>',
      );
      expect(r.standardGbp).toBe(2.95);
      expect(r.freeOverGbp).toBe(40);
    });
  });

  describe('evidence', () => {
    it('quotes the sentence every candidate came from', () => {
      const claims = extractShippingClaims('<p>Standard UK delivery costs £3.95.</p>');
      expect(claims[0]!.evidence).toContain('£3.95');
    });
  });

  describe('delivery tables', () => {
    // The commonest layout in the whole problem domain, and the parser could
    // not read a single one of them: cells ended a sentence, so the row's
    // service name and its price landed in different chunks and the chunk with
    // the money in it no longer mentioned delivery.
    const TABLE = `<h1>Delivery</h1><table>
      <tr><th>Service</th><th>Time</th><th>Cost</th></tr>
      <tr><td>Standard Delivery</td><td>3-5 working days</td><td>&pound;3.95</td></tr>
      <tr><td>Next Day Delivery</td><td>1 working day</td><td>&pound;5.95</td></tr>
    </table>`;

    it('reads the standard row of a delivery table', () => {
      const r = readShippingTerms(TABLE);
      expect(r.standardGbp).toBe(3.95);
      expect(r.caveats).toEqual([]);
    });

    it('does not let the express row become the standard rate', () => {
      expect(readShippingTerms(TABLE).standardGbp).not.toBe(5.95);
    });

    it('keeps a row whole but still separates one row from the next', () => {
      const claims = extractShippingClaims(TABLE);
      expect(claims.some((c) => /Standard Delivery/.test(c.evidence) && /5\.95/.test(c.evidence))).toBe(false);
    });

    it('reads a rate broken across a line break inside one cell', () => {
      const r = readShippingTerms('<td>Standard delivery<br>&pound;2.95</td>');
      expect(r.standardGbp).toBe(2.95);
    });
  });

  describe('shops that publish no standard rate', () => {
    it('says so plainly when the page states terms and names no charge', () => {
      // Manchester Ouds' own wording, from data/shipping-discovery-report.json.
      const r = readShippingTerms(
        '<p>Standard shipping is free on orders over £50, while a nominal fee applies to orders below £50.</p>',
      );
      expect(r.standardGbp).toBeNull();
      expect(r.freeOverGbp).toBe(50);
      expect(r.standardRateNotStated).toBe(true);
      expect(r.thresholdEvidence.join(' ')).toContain('nominal fee');
    });

    it('does not claim a shop publishes nothing when it published a rate', () => {
      const r = readShippingTerms('<p>Standard delivery £3.95, free over £25.</p>');
      expect(r.standardRateNotStated).toBe(false);
    });

    it('does not claim it of a page that only priced an express service', () => {
      // The standard rate is probably somewhere we did not look. That is a gap
      // in the reading, not a fact about the shop.
      const r = readShippingTerms('<p>Next day delivery is £5.95.</p>');
      expect(r.standardRateNotStated).toBe(false);
    });

    it('does not claim it of a page that said nothing about delivery at all', () => {
      expect(readShippingTerms('<p>Our story began in 1994.</p>').standardRateNotStated).toBe(false);
    });
  });

  describe('on a page whose address already says delivery', () => {
    it('reads a threshold stated without repeating the word', () => {
      // "Free on orders over £25." under a "Delivery" heading is the single
      // most common phrasing there is, and the sentence itself never says
      // delivery.
      const html = '<h2>Delivery</h2><p>Free on all orders over £25.</p>';
      expect(readShippingTerms(html).freeOverGbp).toBeNull();
      expect(readShippingTerms(html, { deliveryPage: true }).freeOverGbp).toBe(25);
    });

    it('still refuses to take a bare number as a delivery charge', () => {
      // The relaxation admits thresholds and nothing else: a price list on a
      // delivery page is still a price list.
      const r = readShippingTerms('<h2>Delivery</h2><p>Gift boxes cost £4.50.</p>', { deliveryPage: true });
      expect(r.standardGbp).toBeNull();
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
