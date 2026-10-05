import { describe, expect, it } from 'vitest';
import { shareLinks, shareProductName, shareText, shareUrl, type ShareProduct } from '../demo/share.js';
import { routeToPath } from '../demo/router.js';

const SAUVAGE: ShareProduct = { id: 'ean-3348901486251', brand: 'Dior', name: 'Sauvage', sizeMl: 100, giftSet: false };

describe('the share link', () => {
  it('is the canonical product address, built through routeToPath', () => {
    expect(shareUrl(SAUVAGE.id)).toBe(`https://pricesniffs.space${routeToPath({ name: 'fragrance', param: SAUVAGE.id, query: {} })}`);
  });

  it('is on the product path with no query string, fragment or tracking', () => {
    const url = new URL(shareUrl(SAUVAGE.id));
    expect(url.origin).toBe('https://pricesniffs.space');
    expect(url.pathname.startsWith('/fragrance/')).toBe(true);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('encodes an id with characters that need it, once', () => {
    expect(shareUrl('a b/c')).toBe(`https://pricesniffs.space${routeToPath({ name: 'fragrance', param: 'a b/c', query: {} })}`);
    expect(shareUrl('a b/c')).toContain('a%20b%2Fc');
  });
});

describe('the product name', () => {
  it('is brand, name and size', () => {
    expect(shareProductName(SAUVAGE)).toBe('Dior Sauvage 100ml');
  });

  it('leaves the size out when it is not confirmed', () => {
    expect(shareProductName({ ...SAUVAGE, sizeMl: null })).toBe('Dior Sauvage');
  });

  it('says Gift Set for a gift set', () => {
    expect(shareProductName({ ...SAUVAGE, giftSet: true })).toBe('Dior Sauvage Gift Set');
  });

  it('tidies stray spaces', () => {
    expect(shareProductName({ ...SAUVAGE, brand: ' Dior ', name: 'Eau   Sauvage' })).toBe('Dior Eau Sauvage 100ml');
  });
});

describe('the share text', () => {
  it('names the delivered price and the shop', () => {
    expect(shareText(SAUVAGE, { gbp: 62.5, delivered: true, shop: 'The Perfume Shop' })).toBe(
      'Dior Sauvage 100ml, from £62.50 delivered at The Perfume Shop on PriceSniffs',
    );
  });

  it('shows two decimal places', () => {
    expect(shareText(SAUVAGE, { gbp: 30, delivered: true, shop: 'Boots' })).toContain('from £30.00 delivered at Boots');
  });

  it('leaves the price part out entirely when there is no current price', () => {
    const text = shareText(SAUVAGE, null);
    expect(text).toBe('Dior Sauvage 100ml on PriceSniffs');
    expect(text).not.toMatch(/£|from|delivered/);
  });

  it('does not call an item price delivered when delivery is not stated', () => {
    const text = shareText(SAUVAGE, { gbp: 45, delivered: false, shop: 'Boots' });
    expect(text).toBe('Dior Sauvage 100ml, £45.00 at Boots with delivery not stated, on PriceSniffs');
    expect(text).not.toContain('delivered');
  });

  it('keeps special characters in names as they are', () => {
    const p: ShareProduct = { id: 'x', brand: "Maison Francis Kurkdjian", name: "L'Homme & Cie \"Noir\" 100% <b>", sizeMl: 50, giftSet: false };
    expect(shareText(p, { gbp: 1, delivered: true, shop: "Fragrance Direct & Co" })).toBe(
      "Maison Francis Kurkdjian L'Homme & Cie \"Noir\" 100% <b> 50ml, from £1.00 delivered at Fragrance Direct & Co on PriceSniffs",
    );
  });

  it('has no hyphens or dashes of its own', () => {
    const text = shareText(SAUVAGE, { gbp: 62.5, delivered: true, shop: 'The Perfume Shop' });
    expect(text).not.toMatch(/[-‐‑‒–—―−]/);
  });
});

describe('the share targets', () => {
  const url = shareUrl(SAUVAGE.id);
  const text = shareText(SAUVAGE, { gbp: 62.5, delivered: true, shop: 'The Perfume Shop' });
  const links = shareLinks(url, text);

  it('builds the WhatsApp link from the text and the link', () => {
    expect(links.whatsapp.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(links.whatsapp.slice('https://wa.me/?text='.length))).toBe(`${text} ${url}`);
  });

  it('builds the X link with the text and the link as separate parts', () => {
    const u = new URL(links.x);
    expect(`${u.origin}${u.pathname}`).toBe('https://twitter.com/intent/tweet');
    expect(u.searchParams.get('text')).toBe(text);
    expect(u.searchParams.get('url')).toBe(url);
    expect([...u.searchParams.keys()].sort()).toEqual(['text', 'url']);
  });

  it('builds the Snapchat link from the link alone', () => {
    const u = new URL(links.snapchat);
    expect(`${u.origin}${u.pathname}`).toBe('https://www.snapchat.com/scan');
    expect(u.searchParams.get('attachmentUrl')).toBe(url);
  });

  it('encodes the pound sign, spaces, ampersands and quotes so nothing leaks into the query', () => {
    const odd = shareText(
      { id: 'x', brand: 'A&B', name: 'Q=1 #2 "x"', sizeMl: null, giftSet: false },
      { gbp: 9.99, delivered: true, shop: 'Shop & Sons' },
    );
    const l = shareLinks(shareUrl('x'), odd);
    expect(new URL(l.x).searchParams.get('text')).toBe(odd);
    expect(l.x).not.toMatch(/£|#|"| /);
    expect(l.whatsapp).not.toMatch(/£|#|"| /);
    expect(decodeURIComponent(new URL(l.whatsapp).searchParams.get('text')!)).toBe(`${odd} ${shareUrl('x')}`);
  });

  it('never contains an affiliate link or tracking parameter', () => {
    for (const href of Object.values(links)) {
      expect(href).not.toMatch(/awin|utm_|clickref|affiliate|tag=|ref=/i);
    }
  });
});
