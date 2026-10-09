/**
 * The price drop email itself: subject, plain text and HTML, from a list of
 * drops. One email per reader per day lists every drop that day.
 *
 * Copy rules (the same as the site's): plain British English, and no hyphens
 * or dashes anywhere in the words we write. tests/priceAlerts.test.ts checks
 * the rendered text with every URL taken out, because URLs and product ids
 * legitimately contain hyphens and are not copy.
 *
 * Product names are printed as the catalogue holds them. They are data, not
 * copy, and rewriting a shop's product name is not this file's business.
 */
import { formatMoney } from '../services/money.js';
import type { AlertReason } from './rules.js';

export interface AlertLine {
  /** "Brand Name Concentration Size", as the site would name it. */
  name: string;
  /** Absolute link to the product page on the site. */
  url: string;
  /** Today's cheapest delivered price. */
  price: number;
  /** The shop offering it. */
  shop: string;
  /** The baseline it dropped from, or null on a first sighting. */
  from: number | null;
  /** The reader's target, or null when they did not set one. */
  target: number | null;
  reason: AlertReason;
}

export interface AlertEmailInput {
  lines: readonly AlertLine[];
  /** One click unsubscribe link, carrying the reader's token. */
  unsubscribeUrl: string;
  /** The account page, where alerts and targets can be changed. */
  accountUrl: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function alertSubject(lines: readonly AlertLine[]): string {
  if (lines.length === 1) return `Price drop: ${lines[0]!.name} is now ${formatMoney(lines[0]!.price)}`;
  return `Price drop: ${lines.length} fragrances on your wishlist are cheaper today`;
}

/** The sentence under a product name. */
export function alertDetail(line: AlertLine): string {
  const now = `Now ${formatMoney(line.price)} delivered at ${line.shop}`;
  const parts: string[] = [];
  if (line.from !== null && line.from > line.price) {
    parts.push(`${now}, down from ${formatMoney(line.from)}. You save ${formatMoney(line.from - line.price)}.`);
  } else {
    parts.push(`${now}.`);
  }
  if (line.reason === 'target' && line.target !== null) {
    parts.push(`That is at or below your target of ${formatMoney(line.target)}.`);
  }
  return parts.join(' ');
}

export const INTRO = 'Good news. Something on your PriceSniffs wishlist is cheaper today.';
export const INTRO_MANY = 'Good news. Some fragrances on your PriceSniffs wishlist are cheaper today.';
export const CAVEAT = 'Prices change through the day, so check the price on the shop before you buy.';
export const WHY = 'You are getting this because you asked us to email you when a saved fragrance gets cheaper. We send one email a day at most.';
export const STOP = 'Stop these emails with one click:';
export const MANAGE = 'Change targets or turn alerts back on from your account:';

export function renderAlertEmail({ lines, unsubscribeUrl, accountUrl }: AlertEmailInput): RenderedEmail {
  if (lines.length === 0) throw new Error('renderAlertEmail needs at least one line');
  const intro = lines.length === 1 ? INTRO : INTRO_MANY;
  const subject = alertSubject(lines);

  const text = [
    'Hello,',
    '',
    intro,
    '',
    ...lines.flatMap((l) => [l.name, alertDetail(l), l.url, '']),
    CAVEAT,
    '',
    WHY,
    `${STOP} ${unsubscribeUrl}`,
    `${MANAGE} ${accountUrl}`,
    '',
    'PriceSniffs',
  ].join('\n');

  const item = (l: AlertLine) => `
      <tr><td style="padding:12px 0;border-top:1px solid #e6e1da">
        <a href="${escapeHtml(l.url)}" style="color:#1f1b16;font-weight:700;text-decoration:none">${escapeHtml(l.name)}</a>
        <div style="color:#4a443c;margin-top:4px">${escapeHtml(alertDetail(l))}</div>
        <div style="margin-top:6px"><a href="${escapeHtml(l.url)}" style="color:#9a4a1d">See all prices</a></div>
      </td></tr>`;

  const html = `<!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#faf8f5">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font:16px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f1b16">
    <p style="margin:0 0 12px">Hello,</p>
    <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${lines.map(item).join('')}
    </table>
    <p style="margin:16px 0;color:#4a443c">${escapeHtml(CAVEAT)}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#6b645b">${escapeHtml(WHY)}
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b645b">Stop these emails</a>.
      Change targets or turn alerts back on from <a href="${escapeHtml(accountUrl)}" style="color:#6b645b">your account</a>.</p>
    <p style="margin:16px 0 0;font-size:13px;color:#6b645b">PriceSniffs</p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
