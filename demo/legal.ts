/**
 * Legal and company pages.
 *
 * ── READ THIS BEFORE PUBLISHING ──────────────────────────────────────────────
 * These are working drafts, not legal advice, and they are not signed off. Every
 * `[SQUARE BRACKET]` below is a placeholder that must be replaced with real
 * details before the site goes live — a privacy notice naming a company that
 * does not exist, or omitting a real contact address, is itself a UK GDPR
 * compliance failure rather than a harmless stub.
 *
 * What you must supply:
 *   - registered company name, number and registered office (or your trading
 *     name and address if you operate as a sole trader);
 *   - a monitored contact email address;
 *   - your ICO registration number — most UK organisations processing personal
 *     data must register and pay the data protection fee;
 *   - the actual analytics/hosting processors you end up using, since the
 *     cookie and third-party sections below list only what this codebase
 *     currently implies.
 *
 * Have someone qualified review these before launch. The affiliate disclosure
 * in particular carries ASA/CAP exposure if it is wrong.
 */

export const COMPANY = {
  name: 'ScentDay',
  legalName: '[REGISTERED COMPANY NAME]',
  number: '[COMPANY NUMBER]',
  address: '[REGISTERED OFFICE ADDRESS]',
  email: 'hello@scentday.example',
  feedbackEmail: 'feedback@scentday.example',
  privacyEmail: 'privacy@scentday.example',
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
    <strong>Draft.</strong> This document contains placeholders and has not been
    reviewed by a solicitor. It must not be relied on until the bracketed details
    are completed and it has been signed off.
  </p>`;

export const LEGAL_PAGES: LegalPage[] = [
  {
    id: 'how-it-works',
    title: 'How ScentDay works',
    short: 'How it works',
    body: `
      <p>ScentDay compares fragrance prices across UK retailers so you can see
      what a bottle actually costs before you buy it.</p>

      <h3>We show the delivered price</h3>
      <p>Every price in a comparison includes standard delivery to a UK mainland
      address, and accounts for whether your order clears that retailer's
      free-delivery threshold. A cheaper bottle is often the dearer purchase once
      postage is added, so the headline figure is the one you would actually pay.</p>

      <h3>Discounts come from the retailer</h3>
      <p>Where you see a “was” price and a percentage saving, that is the
      retailer's own published reference price — never a figure we worked out
      ourselves. Percentages are rounded down, so a 19.6% saving is shown as 19%.
      A countdown appears only when the retailer has published an end time for the
      promotion; we never invent one.</p>

      <h3>Membership prices are not the headline</h3>
      <p>Several retailers offer cheaper delivery to loyalty scheme members. We
      note where a scheme exists, but we never use a members-only rate in the
      headline price, because it is not a price you can pay unless you have
      joined.</p>

      <h3>Out of stock stays out of the running</h3>
      <p>Listings a retailer has marked unavailable are grouped at the bottom and
      can never be shown as the cheapest option, however low the price is.</p>

      <h3>Ranking is not for sale</h3>
      <p>Results are ordered by availability and price. Nothing else. No retailer
      can pay to appear higher, and commission never moves a row. See our
      <a href="#" data-page="affiliate">affiliate disclosure</a>.</p>`,
  },
  {
    id: 'affiliate',
    title: 'Affiliate disclosure',
    short: 'Affiliate disclosure',
    body: `
      ${draftBanner}
      <p>ScentDay intends to earn commission when you buy through some of the
      links on this site. This does not change the price you pay.</p>

      <h3>Current status</h3>
      <p>No affiliate programme is live at the time of writing. Every outbound
      link currently goes directly to the retailer and earns us nothing. This page
      will be updated when that changes, and links that carry tracking will be
      identifiable.</p>

      <h3>What commission does not affect</h3>
      <p>Commission has no influence on the order of results, which retailers are
      included, or the prices shown. Ranking is determined by stock status and
      delivered price alone. We will not accept payment for placement inside the
      comparison. If we ever carry a paid placement, it will sit outside the
      results and be labelled as advertising.</p>

      <h3>Why we disclose this</h3>
      <p>UK advertising rules (the CAP Code, enforced by the ASA) require
      affiliate relationships to be made clear before you click, not buried in a
      policy page. We also flag it in the site footer for that reason.</p>`,
  },
  {
    id: 'privacy',
    title: 'Privacy notice',
    short: 'Privacy',
    body: `
      ${draftBanner}
      <p>This notice explains what personal data ${COMPANY.name} collects, why,
      and what rights you have. It is written to meet UK GDPR and the Data
      Protection Act 2018.</p>

      <h3>Who we are</h3>
      <p>The data controller is ${COMPANY.legalName} (company number
      ${COMPANY.number}), registered at ${COMPANY.address}. Our ICO registration
      number is ${COMPANY.ico}. You can contact us at
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a>.</p>

      <h3>What we collect</h3>
      <ul>
        <li><strong>Search terms.</strong> What you type into the search box, so
        we can rank popular fragrances. Stored without any identifier that links
        it to you.</li>
        <li><strong>Technical data.</strong> IP address, browser type and pages
        visited, collected in server logs for security and troubleshooting.</li>
        <li><strong>Messages you send us.</strong> If you email feedback, we keep
        the message and your address so we can reply.</li>
      </ul>
      <p>We do not ask for an account, and we do not collect payment details —
      purchases happen on the retailer's own site under their privacy policy, not
      ours.</p>

      <h3>Why we can use it</h3>
      <p>We rely on <em>legitimate interests</em> for search analytics and
      security logging: operating and improving a price comparison service, in a
      way we consider you would reasonably expect and which has minimal privacy
      impact. Where we use non-essential cookies we rely on your
      <em>consent</em>, which you can withdraw at any time.</p>

      <h3>Cookies</h3>
      <p>We use cookies strictly necessary to make the site work. If we add
      analytics or affiliate tracking cookies, we will ask for your consent first
      and list them here. Affiliate networks may set their own cookies when you
      follow a link to a retailer; those are governed by that network's policy.</p>

      <h3>Sharing</h3>
      <p>We do not sell personal data. We share it only with service providers
      acting on our instructions — currently [HOSTING PROVIDER] — and where we are
      required to by law.</p>

      <h3>How long we keep it</h3>
      <p>Server logs are kept for [RETENTION PERIOD, e.g. 90 days]. Aggregated
      search counts are kept indefinitely because they contain no personal data.
      Correspondence is kept for [RETENTION PERIOD] after the matter is closed.</p>

      <h3>Your rights</h3>
      <p>You can ask for a copy of your data, ask us to correct or erase it,
      object to or restrict our processing, and ask for it in a portable format.
      Email <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a>
      and we will respond within one month.</p>
      <p>If you are unhappy with how we have handled your data you can complain to
      the Information Commissioner's Office at
      <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>
      or on 0303 123 1113.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'terms',
    title: 'Terms of use',
    short: 'Terms',
    body: `
      ${draftBanner}
      <p>By using ScentDay you accept these terms.</p>

      <h3>What ScentDay is</h3>
      <p>ScentDay is an information service. We do not sell fragrance, hold stock,
      process payments or fulfil orders. Any purchase is a contract between you
      and the retailer, on their terms.</p>

      <h3>Accuracy of prices</h3>
      <p>We take care to show accurate prices, but they are collected
      periodically and can change at any time. Delivery charges and thresholds are
      modelled from each retailer's published terms and may not reflect
      promotions, regional surcharges or basket-level rules. <strong>Always check
      the price on the retailer's own site before you buy.</strong> Each listing
      shows when we last checked it.</p>
      <p>We are not liable for losses arising from a price, delivery cost or stock
      status being out of date or incorrect, except where the law does not allow
      us to exclude liability.</p>

      <h3>Retailers we list</h3>
      <p>Inclusion is not an endorsement of any retailer, and exclusion is not a
      criticism. We list established UK stockists; we do not verify individual
      shipments or guarantee authenticity of goods sold by third parties.</p>

      <h3>Acceptable use</h3>
      <p>Do not scrape, overload or attempt to disrupt the service, or reproduce
      substantial parts of the site without permission.</p>

      <h3>Our content</h3>
      <p>Site design, text and data compilations belong to ${COMPANY.legalName}.
      Brand names, product names and trade marks belong to their owners and are
      used only to identify products. Product illustrations on this site are our
      own drawings and are not photographs supplied by any brand.</p>

      <h3>Changes and governing law</h3>
      <p>We may change these terms; the current version always appears here. These
      terms are governed by the law of England and Wales.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'contact',
    title: 'Contact & feedback',
    short: 'Contact',
    body: `
      <p>We would rather hear about a wrong price than not. If something looks
      off, tell us which fragrance and which retailer and we will check it.</p>

      <h3>Feedback and corrections</h3>
      <p><a href="mailto:${COMPANY.feedbackEmail}">${COMPANY.feedbackEmail}</a></p>

      <h3>General enquiries</h3>
      <p><a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h3>Privacy and data requests</h3>
      <p><a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a></p>

      <h3>Retailers</h3>
      <p>If you run a shop and want to be listed, corrected or removed, email
      ${COMPANY.email} and we will come back to you.</p>

      <p class="meta">${COMPANY.legalName} · Company number ${COMPANY.number}<br />
      ${COMPANY.address}</p>`,
  },
];

export function legalPage(id: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.id === id);
}
