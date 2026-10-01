import { describe, expect, it } from 'vitest';
import {
  WRONG_PRICE_PROBLEMS, checkedAt, priceShown, wrongPriceEmail, wrongPriceMailto,
  type ReportedOffer, type WrongPriceReport,
} from '../demo/wrongPrice.js';

/**
 * The "Spotted a wrong price? Tell us" report (demo/wrongPrice.ts): what the
 * email says, and that the mailto link carries it intact.
 */
const offer: ReportedOffer = {
  shop: 'Perfume Click',
  itemPriceGbp: 24.05,
  deliveredPriceGbp: 27,
  deliveryCostGbp: 2.95,
  isPurchasable: true,
  fetchedAt: '2026-10-01T08:12:00Z',
};

const report = (over: Partial<WrongPriceReport> = {}): WrongPriceReport => ({
  product: 'Dior Sauvage 100ml',
  productUrl: 'https://pricesniffs.space/fragrance/ean-3348901250153',
  offer,
  problem: 'price',
  note: '',
  replyTo: '',
  ...over,
});

/** The subject and body a mail client would read back out of the link. */
function decode(href: string): { to: string; subject: string; body: string } {
  const [to, qs] = href.replace(/^mailto:/, '').split('?') as [string, string];
  const params = new Map(qs.split('&').map((kv) => {
    const [k, v] = kv.split('=') as [string, string];
    return [k, decodeURIComponent(v)] as const;
  }));
  return { to, subject: params.get('subject')!, body: params.get('body')! };
}

describe('wrong price email', () => {
  it('names the product, size and shop in the subject', () => {
    expect(wrongPriceEmail(report()).subject).toBe('Wrong price: Dior Sauvage 100ml at Perfume Click');
  });

  it('carries the page, the shop, the price shown, when it was checked and the problem', () => {
    const { body } = wrongPriceEmail(report({ problem: 'delivery' }));
    expect(body).toContain('Page: https://pricesniffs.space/fragrance/ean-3348901250153');
    expect(body).toContain('Shop: Perfume Click');
    expect(body).toContain('Price shown: £27.00 including £2.95 delivery');
    // 08:12 UTC is 09:12 in London in October (BST).
    expect(body).toContain('Checked: 1 Oct 2026, 09:12 UK time');
    expect(body).toContain('Problem: The delivery cost is different');
  });

  it('quotes the price the way the row showed it', () => {
    expect(priceShown({ ...offer, deliveredPriceGbp: 24.05, deliveryCostGbp: 0 })).toBe('£24.05 including free delivery');
    expect(priceShown({ ...offer, deliveredPriceGbp: null, deliveryCostGbp: null })).toBe('£24.05 plus delivery');
    expect(priceShown({ ...offer, isPurchasable: false })).toBe('£27.00 including £2.95 delivery, shown as sold out');
  });

  it('adds the note and reply address only when given', () => {
    const bare = wrongPriceEmail(report()).body;
    expect(bare).not.toContain('Note:');
    expect(bare).not.toContain('Reply to:');
    const full = wrongPriceEmail(report({ note: '  It is £31 now  ', replyTo: 'me@example.com' })).body;
    expect(full).toContain('Note:\nIt is £31 now');
    expect(full).toContain('Reply to: me@example.com');
  });

  it('handles a shop not listed on the page', () => {
    const { subject, body } = wrongPriceEmail(report({ offer: null, problem: 'link' }));
    expect(subject).toBe('Wrong price: Dior Sauvage 100ml at another shop');
    expect(body).toContain('Shop: Other, not listed on the page');
    expect(body).not.toContain('Price shown');
    expect(body).not.toContain('Checked');
  });

  it('never says "not known" for a real time, and does for a missing one', () => {
    expect(checkedAt('2026-01-15T12:00:00Z')).toBe('15 Jan 2026, 12:00');
    expect(checkedAt('')).toBe('not known');
  });

  it('keeps hyphens and dashes out of the reader facing words (the URL aside)', () => {
    const dash = /[-‐-―]/;
    for (const p of WRONG_PRICE_PROBLEMS) expect(p.label).not.toMatch(dash);
    for (const r of [report(), report({ offer: null }), report({ offer: { ...offer, deliveredPriceGbp: null } })]) {
      const { subject, body } = wrongPriceEmail(r);
      expect(subject).not.toMatch(dash);
      for (const line of body.split('\n').filter((l) => !l.startsWith('Page: '))) expect(line).not.toMatch(dash);
    }
  });
});

describe('wrong price mailto link', () => {
  it('goes to the address given and round trips the subject and body exactly', () => {
    const r = report({ note: 'Says £31 & "free" delivery?\nSee #basket = 100%', replyTo: 'a+b@example.com' });
    const href = wrongPriceMailto('yannysniffs@gmail.com', r);
    const got = decode(href);
    expect(got.to).toBe('yannysniffs@gmail.com');
    expect(got).toMatchObject(wrongPriceEmail(r));
  });

  it('leaves nothing in the link that could end a field early', () => {
    const href = wrongPriceMailto('x@example.com', report({ note: 'a&b=c?d#e f\ng+h%' }));
    const query = href.split('?').slice(1).join('?');
    // Exactly the two fields, and no raw space, newline, hash or plus.
    expect(query.split('&')).toHaveLength(2);
    expect(query).not.toMatch(/[ \n#+]/);
    expect(href).toContain('%0A');
    expect(href).toContain('%C2%A3');
  });
});
