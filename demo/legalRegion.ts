/**
 * The US and Indian versions of the legal pages (docs/INTERNATIONAL-PLAN.md
 * section 5; the `legal: 'us' | 'in'` hook in src/config/regions.ts). Public
 * beta since 9 October 2026. Plain and short on purpose: the owner has these
 * read by a lawyer before any money is earned in either country (owner
 * decision 8, docs/OWNER-STEPS.md), and until then nothing on these pages earns
 * anything: no shop link carries an affiliate code and no ad is personalised.
 *
 * The pages that change: the affiliate disclosure, the privacy notice, the
 * terms, refunds and returns, and How it works. The cookies page and the
 * contact page are the UK's own words, which hold in every country. Each page
 * keeps its UK id, so /us/about/legal#privacy opens the US privacy notice and
 * every anchor works the same in every region.
 *
 * Kept free of demo/legal.ts's own module (which reads this one when a page is
 * asked for), so the two never import each other at load time.
 */
import type { LegalVariant } from '../src/config/regions.js';

export interface RegionLegalPage {
  id: string;
  title: string;
  short: string;
  body: string;
}

/** What the UK pages already know, handed in by demo/legal.ts. */
export interface RegionLegalContext {
  companyName: string;
  legalName: string;
  email: string;
  /** The UK terms' business details, as HTML. */
  businessDetails: string;
  /** Shops listed today in this region. */
  shopCount: number;
  /** "more than 20": the rounded figure the site states (demo/head.ts shopsPhrase). */
  coverage: string;
}

/** When these words were last changed. */
export const REGION_LEGAL_UPDATED = '9 October 2026';

function usPages(c: RegionLegalContext): RegionLegalPage[] {
  const updated = `<p class="meta">Last updated ${REGION_LEGAL_UPDATED}. The US pages are in beta.</p>`;
  return [
    {
      id: 'how-it-works',
      title: 'How PriceSniffs Works in the US',
      short: 'How It Works',
      body: `
      <p>PriceSniffs compares fragrance prices across ${c.coverage} US shops, in
      dollars, so you can see what a bottle costs before you buy it. The US
      pages are in beta: fewer shops than the UK site for now.</p>
      <h2 class="t-section">Prices Are Checked Daily</h2>
      <p>We read each shop's own public listings once a day, and only where the
      shop allows it. No price is typed in by hand. Every listing says when we
      last looked.</p>
      <h2 class="t-section">Shipping Is Counted, Sales Tax Is Not</h2>
      <p>Where a shop publishes its standard shipping charge and the spend for
      free shipping, we add them to the price. Prices are shown before sales
      tax. Sales tax is added at checkout and depends on your state and ZIP code,
      so we do not guess it. Alaska, Hawaii and military addresses can cost more
      to ship.</p>
      <h2 class="t-section">What Cheapest Means</h2>
      <p>The lowest total, price plus standard shipping, among bottles in stock.
      A shop that does not state its shipping is never called cheapest.</p>
      <h2 class="t-section">Position Is Not for Sale</h2>
      <p>Results are ordered by stock and then by price. No shop can pay to
      appear higher.</p>`,
    },
    {
      id: 'affiliate',
      title: 'Affiliate Disclosure',
      short: 'Affiliate Disclosure',
      body: `
      <p>No US shop listed here pays us anything today. Every link to a US shop
      is the shop's own address, with no tracking code, and earns nothing.</p>
      <h2 class="t-section">If That Changes</h2>
      <p>If we join a shop's affiliate programme, every link to that shop will
      be marked "Affiliate Link" on the shop's row, next to the link, before you
      click, as the FTC's Endorsement Guides ask. It would cost you nothing and
      would never change the order of results, which is decided by stock and by
      price alone.</p>
      ${updated}`,
    },
    {
      id: 'privacy',
      title: 'Privacy Notice',
      short: 'Privacy',
      body: `
      <aside class="summary-box" aria-labelledby="privacy-summary">
        <h2 class="t-section" id="privacy-summary">In Short</h2>
        <ul>
          <li>While you browse we count page views and clicks through to shops:
          the page, the hour and your country, with no cookie and no IP address
          kept.</li>
          <li>Beyond that, only what you choose to send: your email and password
          if you open an account, the fragrances you save and any target price.</li>
          <li>We do not sell or share your personal information, and no ad on
          this site is personalised.</li>
        </ul>
      </aside>
      <h2 class="t-section">Who Is Responsible</h2>
      <p>${c.companyName} is run by ${c.legalName}, a sole trader in the United
      Kingdom. Write to <a href="mailto:${c.email}">${c.email}</a> about anything
      on this page, including a request to see, correct or delete your data.</p>
      <h2 class="t-section">California and Other States</h2>
      <p>This notice is our privacy policy for the California Online Privacy
      Protection Act. We do not track you across other sites, so a browser's Do
      Not Track signal changes nothing here, and we honour the Global Privacy
      Control signal as a request not to sell or share your data, which we do
      not do anyway. If we change what we collect, this page will say so first.</p>
      <h2 class="t-section">Children</h2>
      <p>The site is not aimed at children under 13 and we do not knowingly
      collect their data.</p>
      <h2 class="t-section">Where Data Is Kept</h2>
      <p>Pages are served by GitHub Pages. Accounts, saved fragrances and the
      visit counts are kept by Supabase. Price drop emails, if you ask for them,
      are sent by Resend.</p>
      ${updated}`,
    },
    {
      id: 'terms',
      title: 'Terms of Use',
      short: 'Terms',
      body: `
      <p>Using PriceSniffs means accepting these terms.</p>
      <h2 class="t-section">Who Runs This Site</h2>
      ${c.businessDetails}
      <h2 class="t-section">What PriceSniffs Is</h2>
      <p>An information service. We do not sell fragrance, take payments or ship
      parcels. A purchase is a contract between you and the shop, on its terms.</p>
      <h2 class="t-section">Prices</h2>
      <p>Prices are collected daily from ${c.shopCount} US shops and can change at
      any moment. They are shown before sales tax, which the shop adds at
      checkout. Shipping is worked out from each shop's published terms and may
      miss a promotion or a surcharge.
      <strong>Always check the price on the shop's own site before you buy.</strong></p>
      <p>We are not liable for losses caused by a price, shipping charge or stock
      figure being wrong or out of date, except where the law does not let us
      exclude liability. Nothing here limits your rights as a consumer.</p>
      <h2 class="t-section">The Shops We List</h2>
      <p>Listing a shop is not an endorsement. We cannot guarantee the
      authenticity of goods anyone else sells.</p>
      <h2 class="t-section">Photographs</h2>
      <p>The US pages show no shop's product photographs for now: a plain marker
      stands in their place.</p>
      <h2 class="t-section">Our Content and the Law</h2>
      <p>The design, wording and data compilations belong to ${c.legalName}.
      Brand and product names belong to their owners and identify products only.
      These terms are governed by the law of England and Wales, without taking
      away any right you have as a consumer where you live.</p>
      ${updated}`,
    },
    {
      id: 'refunds',
      title: 'Refunds and Returns',
      short: 'Refunds',
      body: `
      <p>PriceSniffs sells nothing, so there is nothing to refund here. The shop
      you buy from takes your money, ships the parcel and handles any return or
      refund, under its own returns policy and the consumer law of your state.
      Check a shop's returns policy before you open a bottle you may want to
      send back.</p>
      <p>If a price, shipping charge or stock figure shown here was wrong, tell us
      at <a href="mailto:${c.email}">${c.email}</a> and we will check it.</p>
      ${updated}`,
    },
  ];
}

function inPages(c: RegionLegalContext): RegionLegalPage[] {
  const updated = `<p class="meta">Last updated ${REGION_LEGAL_UPDATED}. The Indian pages are in beta.</p>`;
  return [
    {
      id: 'how-it-works',
      title: 'How PriceSniffs Works in India',
      short: 'How It Works',
      body: `
      <p>PriceSniffs compares fragrance prices across ${c.coverage} Indian shops, in
      rupees, so you can see what a bottle costs before you buy it. The Indian
      pages are in beta: fewer shops than the UK site for now.</p>
      <h2 class="t-section">Prices Are Checked Daily</h2>
      <p>We read each shop's own public listings once a day, and only where the
      shop allows it. No price is typed in by hand. Every listing says when we
      last looked.</p>
      <h2 class="t-section">GST, MRP and Delivery</h2>
      <p>Prices include GST, as every Indian shelf price does, and no shop may
      charge more than the MRP printed on the pack. Where a shop publishes its
      standard delivery charge and the spend for free delivery, we add them.
      Cash on delivery fees are never added to a price.</p>
      <h2 class="t-section">What Cheapest Means</h2>
      <p>The lowest total, price plus standard delivery, among bottles in stock.
      A shop that does not state its delivery is never called cheapest.</p>
      <h2 class="t-section">Position Is Not for Sale</h2>
      <p>Results are ordered by stock and then by price. No shop can pay to
      appear higher.</p>`,
    },
    {
      id: 'affiliate',
      title: 'Affiliate Disclosure',
      short: 'Affiliate Disclosure',
      body: `
      <p>No Indian shop listed here pays us anything today. Every link to an
      Indian shop is the shop's own address, with no tracking code, and earns
      nothing.</p>
      <h2 class="t-section">If That Changes</h2>
      <p>If we join a shop's affiliate programme, every link to that shop will
      be clearly labelled as a paid link on the shop's row before you click, as
      the ASCI code asks. It would cost you nothing and would never change the
      order of results.</p>
      ${updated}`,
    },
    {
      id: 'privacy',
      title: 'Privacy Notice',
      short: 'Privacy',
      body: `
      <aside class="summary-box" aria-labelledby="privacy-summary">
        <h2 class="t-section" id="privacy-summary">In Short</h2>
        <ul>
          <li>While you browse we count page views and clicks through to shops:
          the page, the hour and your country, with no cookie and no IP address
          kept.</li>
          <li>Beyond that, only what you choose to send: your email and password
          if you open an account, the fragrances you save and any target price.</li>
          <li>No ad on this site is personalised.</li>
        </ul>
      </aside>
      <h2 class="t-section">Who Is Responsible</h2>
      <p>${c.companyName} is run by ${c.legalName}, a sole trader in the United
      Kingdom. Write to <a href="mailto:${c.email}">${c.email}</a> to see, correct
      or erase your data, to withdraw your consent, or with a complaint. We
      answer every request.</p>
      <h2 class="t-section">The Digital Personal Data Protection Act</h2>
      <p>We use your personal data only for the purpose you gave it for: an
      email to sign in with and to send the price alerts you chose. Opening an
      account is your consent to that, and you can withdraw it at any time by
      deleting your account in Settings. If your data were ever exposed, we
      would tell you and the authorities as the Act requires.</p>
      <h2 class="t-section">Age</h2>
      <p>Accounts are for people aged 18 or over. Browsing needs no account.</p>
      <h2 class="t-section">Where Data Is Kept</h2>
      <p>Pages are served by GitHub Pages. Accounts, saved fragrances and the
      visit counts are kept by Supabase, outside India. Price drop emails, if you
      ask for them, are sent by Resend.</p>
      ${updated}`,
    },
    {
      id: 'terms',
      title: 'Terms of Use',
      short: 'Terms',
      body: `
      <p>Using PriceSniffs means accepting these terms.</p>
      <h2 class="t-section">Who Runs This Site</h2>
      ${c.businessDetails}
      <h2 class="t-section">What PriceSniffs Is</h2>
      <p>An information service. We do not sell fragrance, take payments or send
      parcels. A purchase is a contract between you and the shop, on its terms.</p>
      <h2 class="t-section">Prices</h2>
      <p>Prices are collected daily from ${c.shopCount} Indian shops and can change
      at any moment. They include GST. A shop's MRP is shown as the reference, and
      a price above MRP is never shown as a saving. Delivery is worked out from
      each shop's published terms; cash on delivery fees are not included.
      <strong>Always check the price on the shop's own site before you buy.</strong></p>
      <p>We are not liable for losses caused by a price, delivery charge or stock
      figure being wrong or out of date, except where the law does not let us
      exclude liability. Nothing here limits your rights as a consumer.</p>
      <h2 class="t-section">The Shops We List</h2>
      <p>Listing a shop is not an endorsement. We cannot guarantee the
      authenticity of goods anyone else sells.</p>
      <h2 class="t-section">Photographs</h2>
      <p>The Indian pages show no shop's product photographs for now: a plain
      marker stands in their place.</p>
      <h2 class="t-section">Our Content and the Law</h2>
      <p>The design, wording and data compilations belong to ${c.legalName}.
      Brand and product names belong to their owners and identify products only.
      These terms are governed by the law of England and Wales, without taking
      away any right you have as a consumer where you live.</p>
      ${updated}`,
    },
    {
      id: 'refunds',
      title: 'Refunds and Returns',
      short: 'Refunds',
      body: `
      <p>PriceSniffs sells nothing, so there is nothing to refund here. The shop
      you buy from takes your money, sends the parcel and handles any return or
      refund, under its own policy and the Consumer Protection Act 2019. Check a
      shop's returns policy before you open a bottle you may want to send back.</p>
      <p>If a price, delivery charge or stock figure shown here was wrong, tell us
      at <a href="mailto:${c.email}">${c.email}</a> and we will check it.</p>
      ${updated}`,
    },
  ];
}

/** The pages a region replaces, by id; empty for the UK, whose pages are demo/legal.ts's own. */
export function regionLegalPages(variant: LegalVariant, c: RegionLegalContext): RegionLegalPage[] {
  if (variant === 'us') return usPages(c);
  if (variant === 'in') return inPages(c);
  return [];
}
