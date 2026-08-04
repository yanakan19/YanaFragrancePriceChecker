/**
 * Legal and company pages.
 *
 * READ THIS BEFORE PUBLISHING.
 * These are working drafts, not legal advice, and nobody qualified has signed
 * them off. Every [SQUARE BRACKET] below is a placeholder that must be replaced
 * with real details before launch. A privacy notice naming a company that does
 * not exist is itself a UK GDPR compliance failure rather than a harmless stub.
 *
 * See docs/LEGAL.md for the full checklist.
 *
 * House style for every string in this file: no hyphens, no en dashes and no em
 * dashes anywhere in reader facing text. Where a compound would normally take a
 * hyphen, reword it.
 */

export const COMPANY = {
  name: 'PriceSniffs',
  legalName: '[REGISTERED COMPANY NAME]',
  number: '[COMPANY NUMBER]',
  address: '[REGISTERED OFFICE ADDRESS]',
  email: 'hello@pricesniffs.example',
  feedbackEmail: 'pricesniffs@gmail.com',
  privacyEmail: 'privacy@pricesniffs.example',
  ico: '[ICO REGISTRATION NUMBER]',
  updated: '1 August 2026',
} as const;

export interface LegalPage {
  id: string;
  title: string;
  /** Short label used in the footer. */
  short: string;
  body: string;
}

const draftBanner = `
  <p class="draft">
    <strong>Draft.</strong> This document still contains placeholders and no
    solicitor has reviewed it. Do not rely on it until the bracketed details are
    filled in and someone qualified has approved it.
  </p>`;

export const LEGAL_PAGES: LegalPage[] = [
  {
    id: 'how-it-works',
    title: 'How PriceSniffs works',
    short: 'How It Works',
    body: `
      <p>PriceSniffs compares fragrance prices across UK shops so you can see what a
      bottle really costs before you buy it.</p>

      <h3>Delivery is counted</h3>
      <p>Every price includes standard delivery to a UK mainland address, and we
      work out whether your order is large enough to qualify for free postage.
      Boots posts free once you spend £25 and charges £3.95 below that. Harvey
      Nichols wants £300, which one bottle will never reach, so its listings
      always carry £5.95 on top. That is why a bottle priced at £24.99 can cost
      you more than one priced at £26.</p>

      <h3>Reductions come from the shop</h3>
      <p>When you see a previous price and a percentage saving, that figure is the
      shop's own. We never calculate one ourselves. Percentages round down, so a
      saving of 19.6 per cent shows as 19 per cent and never as 20. A countdown
      appears only when the shop has published a closing time for the offer. We
      never invent one.</p>

      <h3>Membership rates are not the headline</h3>
      <p>Superdrug posts free at £20 for Health and Beautycard holders and at £25
      for everyone else, so we quote £25. The Perfume Shop, The Fragrance Shop,
      Selfridges and LOOKFANTASTIC all run schemes of their own. We mention them,
      but we never build a members only rate into the headline price, because it
      is not a price you can pay unless you have already joined.</p>

      <h3>Sold out stays at the bottom</h3>
      <p>Listings a shop has marked unavailable sit at the end of the results and
      can never be shown as the cheapest option, however low the price. Where we
      could not read the stock figure at all we say so rather than guess, and that
      listing drops below the ones we could confirm.</p>

      <h3>Position is not for sale</h3>
      <p>Results are ordered by availability and then by price. Nothing else. No
      shop can pay to appear higher, and commission never moves a listing. Read
      our <a href="#" data-page="affiliate">affiliate disclosure</a>.</p>`,
  },
  {
    id: 'affiliate',
    title: 'Affiliate disclosure',
    short: 'Affiliate Disclosure',
    body: `
      ${draftBanner}
      <p>PriceSniffs intends to earn commission when you buy through some of the
      links on this site. It costs you nothing and does not change the price you
      pay.</p>

      <h3>Where things stand today</h3>
      <p>No affiliate programme is running yet. All twelve shops we list pay us
      nothing, and every link goes straight to the shop. Boots, LOOKFANTASTIC and
      Superdrug run their programmes through Awin and we have applied to none of
      them so far. We will update this page when that changes, and links carrying
      tracking will be identifiable.</p>

      <h3>What commission does not touch</h3>
      <p>Commission has no bearing on the order of results, on which shops we
      include, or on the prices we show. Position is decided by stock and by
      delivered price. We will not take payment for placement inside the results.
      If we ever run a paid placement it will sit outside the results and be
      labelled as advertising.</p>

      <h3>Why we tell you this</h3>
      <p>UK advertising rules require affiliate relationships to be obvious before
      you click, not buried in a policy page. That is why the note also appears at
      the bottom of every screen.</p>`,
  },
  {
    id: 'privacy',
    title: 'Privacy notice',
    short: 'Privacy',
    body: `
      ${draftBanner}
      <p>This notice sets out what personal data ${COMPANY.name} collects, why we
      collect it, and what you can ask us to do about it. It is written to meet UK
      GDPR and the Data Protection Act 2018.</p>

      <h3>Who we are</h3>
      <p>The data controller is ${COMPANY.legalName}, company number
      ${COMPANY.number}, registered at ${COMPANY.address}. Our ICO registration
      number is ${COMPANY.ico}. You can reach us at
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a>.</p>

      <h3>What we collect</h3>
      <ul>
        <li><strong>Search terms.</strong> Whatever you type into the search box,
        so we can tell which fragrances are popular. Stored with nothing attached
        that would link it back to you.</li>
        <li><strong>Technical data.</strong> Your IP address, browser type and the
        pages you visited, kept in server logs for security and for fixing
        faults.</li>
        <li><strong>Anything you send us.</strong> If you email us, we keep your
        message and your address so that we can reply.</li>
      </ul>
      <p>We do not ask you to create an account and we never see your payment
      details. Buying happens on the shop's own site, under their privacy policy
      rather than ours.</p>

      <h3>Our lawful basis</h3>
      <p>For search counts and security logging we rely on legitimate interests,
      namely running and improving a price comparison service in a way we believe
      you would expect and which carries very little privacy risk. Where we use
      cookies that are not strictly necessary we rely on your consent, and you can
      withdraw it whenever you like.</p>

      <h3>Cookies</h3>
      <p>At present we set only the cookies needed to make the site work. If we
      add analytics or affiliate tracking we will ask you first and list those
      cookies here. Affiliate networks may set cookies of their own once you
      follow a link to a shop, and those fall under that network's policy.</p>

      <h3>Who else sees it</h3>
      <p>We do not sell personal data. We share it only with suppliers acting on
      our instructions, currently [HOSTING PROVIDER], and where the law requires
      us to hand it over.</p>

      <h3>How long we keep it</h3>
      <p>Server logs are held for [RETENTION PERIOD, for example 90 days]. Search
      counts are kept indefinitely because they hold no personal data. Emails are
      kept for [RETENTION PERIOD] after the matter is closed.</p>

      <h3>Your rights</h3>
      <p>You can ask for a copy of your data, ask us to correct or delete it,
      object to what we are doing with it, ask us to restrict it, or ask for it in
      a portable format. Write to
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> and we
      will reply within one month.</p>
      <p>If you are unhappy with how we have handled your data you can complain to
      the Information Commissioner's Office at
      <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>
      or by calling 0303 123 1113.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'terms',
    title: 'Terms of use',
    short: 'Terms',
    body: `
      ${draftBanner}
      <p>Using PriceSniffs means accepting these terms.</p>

      <h3>What PriceSniffs is</h3>
      <p>PriceSniffs is an information service. We do not sell fragrance, hold stock,
      take payments or send parcels. Any purchase is a contract between you and
      the shop, on their terms.</p>

      <h3>How accurate the prices are</h3>
      <p>We work hard to show accurate prices, but we collect them periodically
      and they can change at any moment. Postage costs and the order values needed
      for free delivery are modelled from the published terms of all twelve shops,
      and may not capture every promotion, Highlands surcharge or basket rule.
      <strong>Always check the price on the shop's own site before you buy.</strong>
      Every listing carries the time we last looked, down to the minute.</p>
      <p>We are not liable for losses caused by a price, postage cost or stock
      figure being wrong or out of date, except where the law does not let us
      exclude liability.</p>

      <h3>The shops we list</h3>
      <p>Appearing here is not an endorsement, and being absent is not a
      criticism. We list established UK shops. We do not inspect individual
      parcels and we cannot guarantee the authenticity of goods sold by anyone
      else.</p>

      <h3>Fair use</h3>
      <p>Please do not scrape the site, overload it, try to disrupt it, or copy
      substantial parts of it without asking us first.</p>

      <h3>Our content</h3>
      <p>The design, wording and data compilations belong to ${COMPANY.legalName}.
      Brand names, product names and trade marks belong to their owners and appear
      here only to identify products.</p>

      <h3>Product images</h3>
      <p>Every product image here is the retailer's or the brand's own
      photograph, loaded by your browser directly from their own servers. We do
      not copy, host, crop, recolour or otherwise alter any of them, and each
      one sits beside a link to buy that product from the shop it came from.</p>
      <p>Each image remains the property of whoever created it. We show them on
      one of three grounds, recorded per shop: that shop's affiliate terms
      permit it, or the picture comes from the brand's own shop, or we are
      linking to the shop's own image without a licence having been granted.
      Where a shop has given us no image we can use, we show a plain marker
      saying so rather than substituting a picture of something else.</p>
      <p>If you are a retailer or brand and would rather we did not show your
      photography, tell us and we will stop for your shop.
      <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h3>Changes and governing law</h3>
      <p>We may revise these terms, and the current version always sits here.
      These terms are governed by the law of England and Wales.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'contact',
    title: 'Contact and feedback',
    short: 'Contact',
    body: `
      <p>We would far rather hear about a wrong price than not hear about it. Send
      us the fragrance, the bottle size, the shop and the figure you saw on their
      site, and we will go and check it the same day.</p>

      <h3>Feedback and corrections</h3>
      <p><a href="mailto:${COMPANY.feedbackEmail}">${COMPANY.feedbackEmail}</a></p>

      <h3>General enquiries</h3>
      <p><a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h3>Privacy and data requests</h3>
      <p><a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a></p>

      <h3>If you run a shop</h3>
      <p>Write to ${COMPANY.email} if you want to be listed, corrected or removed,
      and we will come back to you.</p>

      <p class="meta">${COMPANY.legalName}. Company number ${COMPANY.number}.<br />
      ${COMPANY.address}</p>`,
  },
];

export function legalPage(id: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.id === id);
}
