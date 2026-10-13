/**
 * The plain HTML a page carries inside <main id="view"> before the app runs:
 * what a visitor without JavaScript, or a crawler that does not run the
 * script, reads on the home page and on each prerendered product, brand, shop
 * and note page (scripts/leafPages.ts; docs/PRODUCT-URLS.md section 7).
 *
 * ── Why ─────────────────────────────────────────────────────────────────────
 * The AdSense application was refused on 13 Oct 2026 with no reason shown.
 * Every product, brand and shop address answered HTTP 404 with an empty
 * <main> (docs/ADVERTISING-PLAN.md, risks 1 and 3). A prerendered page answers
 * 200 and says, in plain HTML, what the app would show: the H1, the size and
 * strength, the cheapest price and shop with the day it was checked, every
 * shop's price, the affiliate disclosure in the site's own words, the notes,
 * and links on to the brand, the guides and the rest of the site.
 *
 * ── How it meets the app ────────────────────────────────────────────────────
 * Everything here sits in one <section class="static-intro">, which the page's
 * first inline script hides for a visitor with JavaScript (html.js, in
 * demo/template.html) before anything is painted, and which the app replaces
 * wholesale when it starts. So a visitor with the script sees exactly what
 * they saw before (the loading outline, then the app): no flash and nothing
 * shifts. The prices are worked out by the same code the product page uses
 * (buildComparison, bestOffer, offerGroups, shownPrice), from the same
 * catalogue, at build time.
 *
 * Pure apart from the catalogue it reads: each function takes what it shows
 * and returns markup, so a test can hold the page to its rules.
 */
import { CRAWLED, offersFor } from '../demo/catalogue.generated.js';
import { BY_POPULARITY, DEALS, DEMO_FRAGRANCES, fragrancesWithNote, listingCountAt, type DemoFragrance } from '../demo/data.js';
import { mostStockedRail } from '../demo/mostStocked.js';
import { availabilityHeading, offerGroups } from '../demo/offerGroups.js';
import { shownPrice } from '../demo/msrpComparison.js';
import { GUIDES, GUIDES_PATH, HOW_WE_CHECK, guidePath } from '../demo/guideList.js';
import { slugify } from '../demo/router.js';
import { SITE_URL } from '../demo/head.js';
import { bestOffer, buildComparison } from '../src/services/priceService.js';
import { formatMoney } from '../src/services/money.js';
import { enabledRetailers } from '../src/config/retailers.js';
import { noteSlug } from '../src/catalogue/noteName.js';
import type { PresentedOffer } from '../src/types/offer.js';
import type { Retailer } from '../src/types/retailer.js';

/** The marker in demo/template.html's static intro where the UK home page's extra content goes. */
export const HOME_STATIC_MARKER = '<!--__HOME_STATIC__-->';

/**
 * The site's affiliate disclosure, word for word as the home page's static
 * intro (demo/template.html) says it, with the same link.
 */
export const AFFILIATE_DISCLOSURE =
  'Some shop links are affiliate links: if you buy after following one, the shop may pay us a commission, at no extra cost to you. It never changes the order of results.';

/** How prices are checked, in one plain sentence (the long version is /about/how-we-check-prices). */
export const HOW_PRICES_ARE_CHECKED =
  'We read these prices from each shop\u2019s own public listings and feeds and check them daily. A price includes delivery where the shop states its delivery cost.';

/** The most a brand, shop or note page lists by name; the app shows the rest. */
export const LIST_CAP = 120;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "13 Oct 2026" for an ISO time, the site's way of writing a date. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Dior Sauvage 100ml": the product's name as its head tags and H1 say it. */
export function productName(f: Pick<DemoFragrance, 'brand' | 'name' | 'sizeMl'>): string {
  return `${f.brand} ${f.name}${f.sizeMl ? ` ${f.sizeMl}ml` : ''}`;
}

export const brandPath = (brand: string): string => `/brands/${encodeURIComponent(slugify(brand))}`;
export const shopPath = (id: string): string => `/retailers/${encodeURIComponent(id)}`;
export const notePath = (name: string): string => `/notes/${encodeURIComponent(noteSlug(name))}`;

/** The rows the product page lists, worked out as the page works them out (demo/app.ts rowsFor). */
export function rowsOf(f: DemoFragrance, now: Date = new Date()): PresentedOffer[] {
  return buildComparison(offersFor(f.id), { sortBy: 'delivered', now });
}

/** What a product page's static content says its lowest price is, and what the JSON-LD must agree with. */
export interface ProductPrices {
  rows: PresentedOffer[];
  best: PresentedOffer | null;
  /** The headline figure: the cheapest buyable row's shown price, or with nothing buyable the lowest last price. */
  lowest: number | null;
  lowestRow: PresentedOffer | null;
  highest: number | null;
  /** Shops listing it now (not pre-orders), as "across N shops" counts them. */
  shops: number;
  inStock: boolean;
}

export function productPrices(f: DemoFragrance, now: Date = new Date()): ProductPrices {
  const rows = rowsOf(f, now);
  const best = bestOffer(rows);
  const buyable = rows.filter((r) => r.isPurchasable);
  const pool = buyable.length > 0 ? buyable : rows;
  const shown = pool.map((r) => shownPrice(r).amountGbp);
  const lowestRow = best ?? [...pool].sort((a, b) => shownPrice(a).amountGbp - shownPrice(b).amountGbp)[0] ?? null;
  return {
    rows,
    best,
    lowest: lowestRow ? shownPrice(lowestRow).amountGbp : null,
    lowestRow,
    highest: shown.length ? Math.max(...shown) : null,
    shops: rows.filter((r) => r.stock !== 'preOrder').length,
    inStock: best !== null,
  };
}

/** The leafDetail the app gives headFor for a product (demo/app.ts headInputForState). */
export function productLeafDetail(p: ProductPrices): string | undefined {
  const best = p.best;
  return best && best.deliveredPriceGbp !== null && p.shops > 0
    ? `from ${formatMoney(best.deliveredPriceGbp)} delivered, across ${p.shops} ${p.shops === 1 ? 'shop' : 'shops'}`
    : p.shops > 0
      ? `stocked by ${p.shops} ${p.shops === 1 ? 'shop' : 'shops'} we track`
      : undefined;
}

/** "Incl. £2.95 Delivery", "Free Delivery", "+ Delivery": what a row's price holds, in the row's own words. */
function deliveryFact(r: PresentedOffer): string {
  if (r.delivery.costGbp === null) return '+ Delivery';
  const est = r.delivery.confirmed ? '' : 'Est. ';
  if (r.delivery.costGbp === 0) return r.delivery.confirmed ? 'Free Delivery' : 'Est. Free Delivery';
  return `Incl. ${est}${formatMoney(r.delivery.costGbp)} Delivery`;
}

function stockWord(r: PresentedOffer): string {
  if (r.stock === 'preOrder') return 'Preorder';
  if (!r.isPurchasable) return 'Sold Out, Last Price';
  if (r.stock === 'lowStock') return 'Low Stock';
  return 'In Stock';
}

function offerLine(r: PresentedOffer, isBest: boolean): string {
  const commissioned = r.retailer.affiliate.status === 'active';
  const facts = [deliveryFact(r), stockWord(r), ...(commissioned ? ['Affiliate Link'] : []), `Checked ${shortDate(r.fetchedAt)}`];
  return `<li><a href="${esc(r.outboundUrl)}" rel="nofollow noopener${commissioned ? ' sponsored' : ''}" target="_blank">${esc(r.retailer.name)}</a>${
    isBest ? ' (Cheapest)' : ''}: <strong>${formatMoney(shownPrice(r).amountGbp)}</strong> <span class="t-caption">${esc(facts.join(' \u00b7 '))}</span></li>`;
}

function disclosure(): string {
  return `<p class="t-body">${AFFILIATE_DISCLOSURE} Read the <a href="/about/legal#affiliate">affiliate disclosure</a>.</p>`;
}

function howChecked(): string {
  return `<h2 class="t-section">How We Check Prices</h2>
<p class="t-body">${HOW_PRICES_ARE_CHECKED} <a href="${HOW_WE_CHECK.path}">How we check prices</a>.</p>`;
}

function moreLinks(extra: { href: string; text: string }[]): string {
  const links = [
    ...extra,
    { href: '/deals', text: 'Today\u2019s Deals' },
    { href: GUIDES_PATH, text: 'Guides' },
    { href: '/brands', text: 'All Brands' },
    { href: '/retailers', text: 'All Shops' },
    { href: '/about', text: 'About PriceSniffs' },
    { href: '/about#contact', text: 'Contact' },
  ];
  return `<h2 class="t-section">More on PriceSniffs</h2>
<ul class="static-links">${links.map((l) => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('')}</ul>`;
}

const SECTION_OPEN = '<section class="static-intro" aria-labelledby="static-intro-title">';

/** The size and strength line: "Eau de Parfum, 100ml." */
function strengthLine(f: DemoFragrance): string {
  const parts = [f.concentration && f.concentration !== 'Not stated' ? f.concentration : '', f.sizeMl ? `${f.sizeMl}ml` : ''].filter(Boolean);
  const kind = f.giftSet ? 'Gift set' : '';
  const line = [kind, ...parts].filter(Boolean).join(', ');
  return line ? `<p class="t-body">${esc(line)}.</p>` : '';
}

/** A product page's static content. */
export function productStaticHtml(f: DemoFragrance, p: ProductPrices): string {
  const groups = offerGroups(p.rows);
  const heading = availabilityHeading(groups);
  const lowestLine = p.lowestRow && p.lowest !== null
    ? p.inStock
      ? `<p class="t-body" data-ps-lowest="${p.lowest.toFixed(2)}">Cheapest today: <strong>${formatMoney(p.lowest)}</strong>${shownPrice(p.lowestRow).delivered ? ' delivered' : ' plus delivery'} at ${esc(p.lowestRow.retailer.name)}, checked ${shortDate(p.lowestRow.fetchedAt)}.</p>`
      : `<p class="t-body" data-ps-lowest="${p.lowest.toFixed(2)}">Sold out at every shop we track right now. Last price: <strong>${formatMoney(p.lowest)}</strong> at ${esc(p.lowestRow.retailer.name)}, checked ${shortDate(p.lowestRow.fetchedAt)}.</p>`
    : '';
  const order = [...groups.delivered, ...groups.plusDelivery, ...groups.gone, ...groups.preOrder];
  const notes = f.notes;
  const layer = (label: string, list: readonly string[]): string =>
    list.length ? `<p class="t-body"><strong>${label}:</strong> ${list.map((n) => `<a href="${esc(notePath(n))}">${esc(n)}</a>`).join(', ')}</p>` : '';
  const notesHtml = notes && (notes.top.length || notes.middle.length || notes.base.length)
    ? `<h2 class="t-section">Notes</h2>
${layer('Top', notes.top)}${layer('Middle', notes.middle)}${layer('Base', notes.base)}`
    : '';
  return `${SECTION_OPEN}
<p class="t-caption"><a href="/">Home</a> \u203a <a href="${esc(brandPath(f.brand))}">${esc(f.brand)}</a></p>
<h1 class="t-page" id="static-intro-title">${esc(productName(f))}</h1>
${strengthLine(f)}${lowestLine}
<h2 class="t-section">${esc(heading || 'Prices')}</h2>
<ul class="static-offers">${order.map((r) => offerLine(r, r === p.best)).join('')}</ul>
${disclosure()}
${notesHtml}
${howChecked()}
${moreLinks([{ href: brandPath(f.brand), text: `All ${f.brand} Fragrances` }])}
</section>`;
}

/** Product + AggregateOffer JSON-LD, prices in GBP, matching the page's lowest shown price. */
export function productJsonLd(f: DemoFragrance, p: ProductPrices, canonical: string): Record<string, unknown> | null {
  if (p.lowest === null) return null;
  const pool = p.rows.filter((r) => r.isPurchasable);
  const ld: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productName(f),
    brand: { '@type': 'Brand', name: f.brand },
    url: canonical,
    ...(f.photoUrl && /^https:\/\//.test(f.photoUrl) ? { image: f.photoUrl } : {}),
    ...(f.ean && /^\d{13}$/.test(f.ean) ? { gtin13: f.ean } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'GBP',
      lowPrice: p.lowest.toFixed(2),
      highPrice: (p.highest ?? p.lowest).toFixed(2),
      offerCount: pool.length > 0 ? pool.length : p.rows.length,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };
  return ld;
}

/** A JSON-LD block for a page's head, tied to its address so the app drops it on leaving (demo/app.ts applyHead). */
export function jsonLdTag(ld: Record<string, unknown>, canonical: string): string {
  return `<script type="application/ld+json" data-page="${esc(canonical)}">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}

/** The cheapest shown price of a product, for a line in a list; null when nothing is listed now. */
function fromPrice(f: DemoFragrance, now: Date): number | null {
  return productPrices(f, now).lowest;
}

function productListItem(f: DemoFragrance, price: number | null, priced: (slug: string) => boolean): string {
  const name = esc(productName(f));
  const label = priced(f.slug) ? `<a href="/${esc(f.slug)}">${name}</a>` : name;
  return `<li>${label}${price !== null ? `: from ${formatMoney(price)}` : ''}</li>`;
}

/** A brand page's static content: its bottles, most widely stocked first. */
export function brandStaticHtml(brand: string, products: readonly DemoFragrance[], priced: (slug: string) => boolean, now: Date = new Date()): string {
  const shown = products.slice(0, LIST_CAP);
  return `${SECTION_OPEN}
<p class="t-caption"><a href="/">Home</a> \u203a <a href="/brands">Brands</a></p>
<h1 class="t-page" id="static-intro-title">${esc(brand)}</h1>
<p class="t-body">${products.length} ${esc(brand)} ${products.length === 1 ? 'fragrance is' : 'fragrances are'} stocked by the UK shops we track. Each one links to its prices at every shop, cheapest first.</p>
<h2 class="t-section">${esc(brand)} Fragrances</h2>
<ul class="static-links">${shown.map((f) => productListItem(f, fromPrice(f, now), priced)).join('')}</ul>
${products.length > shown.length ? `<p class="t-body">And ${products.length - shown.length} more: the full list opens with JavaScript on.</p>` : ''}
${disclosure()}
${howChecked()}
${moreLinks([])}
</section>`;
}

/** A shop page's static content: what it stocks, and its prices. */
export function shopStaticHtml(r: Retailer, products: readonly DemoFragrance[], priced: (slug: string) => boolean): string {
  const shown = products.slice(0, LIST_CAP);
  const commissioned = r.affiliate.status === 'active';
  const priceAt = (f: DemoFragrance): number | null => {
    const o = (CRAWLED[f.id] ?? []).filter((x) => x.retailerId === r.id).map((x) => x.price);
    return o.length ? Math.min(...o) : null;
  };
  return `${SECTION_OPEN}
<p class="t-caption"><a href="/">Home</a> \u203a <a href="/retailers">Shops</a></p>
<h1 class="t-page" id="static-intro-title">${esc(r.name)}</h1>
<p class="t-body">${listingCountAt(r.id).toLocaleString('en-GB')} fragrances listed at ${esc(r.name)} (<a href="${esc(r.homepage)}" rel="nofollow noopener" target="_blank">${esc(r.domain)}</a>), each shown next to every other UK shop we track.${
    commissioned ? ' Links to this shop are affiliate links.' : ''}</p>
<h2 class="t-section">Fragrances at ${esc(r.name)}</h2>
<ul class="static-links">${shown.map((f) => {
    const price = priceAt(f);
    const name = esc(productName(f));
    return `<li>${priced(f.slug) ? `<a href="/${esc(f.slug)}">${name}</a>` : name}${price !== null ? `: ${formatMoney(price)} before delivery` : ''}</li>`;
  }).join('')}</ul>
${products.length > shown.length ? `<p class="t-body">And ${products.length - shown.length} more: the full list opens with JavaScript on.</p>` : ''}
${disclosure()}
${howChecked()}
${moreLinks([])}
</section>`;
}

/** A note page's static content: the fragrances whose shops list the note. */
export function noteStaticHtml(note: string, products: readonly DemoFragrance[], priced: (slug: string) => boolean, now: Date = new Date()): string {
  const shown = products.slice(0, LIST_CAP);
  return `${SECTION_OPEN}
<p class="t-caption"><a href="/">Home</a> \u203a <a href="/notes">Notes</a></p>
<h1 class="t-page" id="static-intro-title">${esc(note)}</h1>
<p class="t-body">${products.length} ${products.length === 1 ? 'fragrance lists' : 'fragrances list'} ${esc(note)} among their notes, as the shops that stock them publish them.</p>
<h2 class="t-section">Fragrances with ${esc(note)}</h2>
<ul class="static-links">${shown.map((f) => productListItem(f, fromPrice(f, now), priced)).join('')}</ul>
${products.length > shown.length ? `<p class="t-body">And ${products.length - shown.length} more: the full list opens with JavaScript on.</p>` : ''}
<p class="t-body">Read <a href="${esc(guidePath('perfume-notes-explained'))}">how perfume notes work</a>.</p>
${howChecked()}
${moreLinks([{ href: '/notes', text: 'All Notes' }])}
</section>`;
}

/**
 * The UK home page's extra static content, after its short intro: today's top
 * deals and most stocked bottles, the guides and the shops, as plain links.
 * Links to a product only where its page is one that answers on its own
 * (every priced product is, while the budget allows; see scripts/leafPages.ts),
 * which is the case for every product here: they are the most stocked.
 */
export function homeStaticHtml(now: Date = new Date()): string {
  const deals = DEALS.slice(0, 12);
  const stocked = mostStockedRail(BY_POPULARITY, 12);
  const shops = enabledRetailers()
    .filter((r) => listingCountAt(r.id) > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  const dealLine = (d: (typeof DEALS)[number]): string =>
    `<li><a href="/${esc(d.fragrance.slug)}">${esc(productName(d.fragrance))}</a>: ${formatMoney(d.price)}${d.delivered ? ' delivered' : ''}, ${d.percentOff}% below ${d.kind === 'house' ? 'MSRP' : 'RRP'}</li>`;
  return `
      <h2 class="t-section">Today\u2019s Top Deals</h2>
      <ul class="static-links">${deals.map(dealLine).join('')}</ul>
      <h2 class="t-section">Most Stocked</h2>
      <ul class="static-links">${stocked.map((f) => {
    const price = fromPrice(f, now);
    return `<li><a href="/${esc(f.slug)}">${esc(productName(f))}</a>${price !== null ? `: from ${formatMoney(price)}` : ''}</li>`;
  }).join('')}</ul>
      <h2 class="t-section">Guides</h2>
      <ul class="static-links">${[{ href: HOW_WE_CHECK.path, title: HOW_WE_CHECK.title }, ...GUIDES.map((g) => ({ href: guidePath(g.slug), title: g.title }))]
    .map((g) => `<li><a href="${esc(g.href)}">${esc(g.title)}</a></li>`).join('')}</ul>
      <h2 class="t-section">The Shops We Compare</h2>
      <ul class="static-links">${shops.map((r) => `<li><a href="${esc(shopPath(r.id))}">${esc(r.name)}</a></li>`).join('')}</ul>
      <p class="t-body">${DEMO_FRAGRANCES.length.toLocaleString('en-GB')} fragrances, priced at ${shops.length} UK shops. ${HOW_PRICES_ARE_CHECKED}</p>`;
}

/** Products listing a note, most widely stocked first (the note page's own order is the app's). */
export function productsWithNote(note: string): DemoFragrance[] {
  const ids = new Set(fragrancesWithNote(note, 'any').map((f) => f.id));
  return BY_POPULARITY.filter((f) => ids.has(f.id));
}

export { SITE_URL };
