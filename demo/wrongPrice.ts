/**
 * "Spotted a wrong price? Tell us": the email a shopper's report becomes.
 *
 * There is no server behind this site, so a report is not submitted anywhere.
 * It is handed to the reader's own email app as a prefilled `mailto:` to
 * COMPANY.feedbackEmail, exactly as the contact and suggestion forms already
 * do (see the submit handler in demo/app.ts, and the privacy notice in
 * demo/legal.ts, which already says the forms open the reader's own email
 * app). Kept apart from app.ts so the wording and the encoding can be tested
 * under Node without a page.
 *
 * Everything in the subject and body is reader facing, so the house style
 * applies: plain British English, no hyphens or dashes. The product URL is
 * the one exception, being an address rather than prose.
 */
import { formatGbp } from '../src/index.js';

/** What can be wrong with a row, in the order the select offers them. */
export const WRONG_PRICE_PROBLEMS = [
  { value: 'price', label: 'The price is different' },
  { value: 'delivery', label: 'The delivery cost is different' },
  { value: 'stock', label: 'It is out of stock' },
  { value: 'product', label: 'Wrong product or size' },
  { value: 'link', label: 'The link is broken' },
] as const;

export type WrongPriceProblem = (typeof WRONG_PRICE_PROBLEMS)[number]['value'];

/** The shop select's value for a shop not listed on the page. */
export const OTHER_SHOP = 'other';

/** The few facts of one offer row the report quotes back. */
export interface ReportedOffer {
  shop: string;
  itemPriceGbp: number;
  deliveredPriceGbp: number | null;
  deliveryCostGbp: number | null;
  isPurchasable: boolean;
  /** True for a row the page shows as Preorder rather than Sold Out. Absent reads as false. */
  isPreOrder?: boolean;
  /** ISO time the price was captured. */
  fetchedAt: string;
}

export interface WrongPriceReport {
  /** Brand, name and size, as a shopper would say it: "Dior Sauvage 100ml". */
  product: string;
  /** The product page's own address. */
  productUrl: string;
  /** The row being reported, or null for a shop not listed on the page. */
  offer: ReportedOffer | null;
  problem: WrongPriceProblem;
  note: string;
  replyTo: string;
}

/** "£27.00 including £2.95 delivery", exactly what the row showed. */
export function priceShown(o: ReportedOffer): string {
  let text: string;
  if (o.deliveredPriceGbp === null || o.deliveryCostGbp === null) {
    text = `${formatGbp(o.itemPriceGbp)} plus delivery`;
  } else if (o.deliveryCostGbp === 0) {
    text = `${formatGbp(o.deliveredPriceGbp)} including free delivery`;
  } else {
    text = `${formatGbp(o.deliveredPriceGbp)} including ${formatGbp(o.deliveryCostGbp)} delivery`;
  }
  if (o.isPurchasable) return text;
  return o.isPreOrder ? `${text}, shown as preorder` : `${text}, shown as sold out`;
}

/** "1 Oct 2026, 09:12", UK time, whatever zone the reader's device is in. */
export function checkedAt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return 'not known';
  return t.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Europe/London',
  });
}

function problemLabel(p: WrongPriceProblem): string {
  return WRONG_PRICE_PROBLEMS.find((x) => x.value === p)?.label ?? WRONG_PRICE_PROBLEMS[0].label;
}

/** The subject and body, as plain text before any encoding. */
export function wrongPriceEmail(r: WrongPriceReport): { subject: string; body: string } {
  const shop = r.offer ? r.offer.shop : 'another shop';
  const subject = `Wrong price: ${r.product} at ${shop}`;
  const note = r.note.trim();
  const replyTo = r.replyTo.trim();
  const lines = [
    `Product: ${r.product}`,
    `Page: ${r.productUrl}`,
    r.offer ? `Shop: ${r.offer.shop}` : 'Shop: Other, not listed on the page',
    ...(r.offer
      ? [`Price shown: ${priceShown(r.offer)}`, `Checked: ${checkedAt(r.offer.fetchedAt)} UK time`]
      : []),
    `Problem: ${problemLabel(r.problem)}`,
    ...(note ? ['', 'Note:', note] : []),
    ...(replyTo ? ['', `Reply to: ${replyTo}`] : []),
  ];
  return { subject, body: lines.join('\n') };
}

/**
 * A `mailto:` link to `to` carrying this report. Subject and body are each
 * passed through encodeURIComponent, so an ampersand, a question mark, a
 * hash or a line break in a note cannot end the field early or start a new
 * one (RFC 6068).
 */
export function wrongPriceMailto(to: string, r: WrongPriceReport): string {
  const { subject, body } = wrongPriceEmail(r);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
