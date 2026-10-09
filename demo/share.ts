/**
 * The Share button's link, wording and targets.
 *
 * Kept apart from demo/app.ts so the encoding can be tested under Node with no
 * page, the same split demo/wrongPrice.ts makes for the wrong price email.
 *
 * What is built here is only ever text and addresses. Nothing is sent to us or
 * to anyone else until the reader taps a share target, which opens the chosen
 * app or site in a new tab or hands the link to the phone's own share sheet.
 *
 * The link is the product's canonical address (routeToPath with no query, on
 * SITE_URL) and never carries a tracking parameter or an affiliate link: the
 * shops' own links live on the offer rows and are not used here at all. It is
 * built through routeToPath, never by hand, so it follows the address scheme
 * wherever that goes.
 */
import { formatMoney } from '../src/index.js';
import { routeToPath } from './router.js';
import { SITE_URL } from './head.js';

/** The facts of a product the share text names. */
export interface ShareProduct {
  id: string;
  brand: string;
  name: string;
  /** Bottle size in ml, or null where it is not confirmed. */
  sizeMl: number | null;
  /** A gift set is named as one instead of by a size. */
  giftSet: boolean;
}

/** The cheapest price the product page shows, or none when it has none. */
export interface SharePrice {
  gbp: number;
  /** True when the figure includes delivery; false when delivery is not stated. */
  delivered: boolean;
  shop: string;
}

/** The share targets that open a page: each is a plain link. */
export interface ShareLinks {
  whatsapp: string;
  x: string;
  snapchat: string;
}

/** The product's canonical address, with no query string and no tracking. */
export function shareUrl(id: string): string {
  return `${SITE_URL}${routeToPath({ name: 'fragrance', param: id, query: {} })}`;
}

const tidy = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** "Dior Sauvage 100ml": brand, name and size as a shopper would say it. */
export function shareProductName(p: ShareProduct): string {
  const size = p.giftSet ? 'Gift Set' : p.sizeMl ? `${p.sizeMl}ml` : '';
  return tidy(`${p.brand} ${p.name} ${size}`);
}

/**
 * The plain sentence shared with the link. The price part is left out whole
 * when the product has no current price, and says so when the figure is an
 * item price whose delivery the shop does not state.
 */
export function shareText(p: ShareProduct, price: SharePrice | null): string {
  const name = shareProductName(p);
  if (!price) return `${name} on PriceSniffs`;
  const shop = tidy(price.shop);
  if (price.delivered) return `${name}, from ${formatMoney(price.gbp)} delivered at ${shop} on PriceSniffs`;
  return `${name}, ${formatMoney(price.gbp)} at ${shop} with delivery not stated, on PriceSniffs`;
}

/** The three web share addresses, every part encoded. */
export function shareLinks(url: string, text: string): ShareLinks {
  const enc = encodeURIComponent;
  return {
    whatsapp: `https://wa.me/?text=${enc(`${text} ${url}`)}`,
    x: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
    snapchat: `https://www.snapchat.com/scan?attachmentUrl=${enc(url)}`,
  };
}
