/**
 * Legal and company pages.
 *
 * This is a one person operation trading under the PriceSniffs name, not a
 * registered company. Every fact below is one that is actually true today.
 * Nothing here is filled in with a placeholder, and nothing states a detail
 * (a company number, an address, a retention period in days) that has not
 * actually been decided, because a specific sounding fact that is not real is
 * worse than a plain one that is. Where a fact the law expects is genuinely
 * absent, the page says it is absent rather than inventing it; `COMPANY`
 * below carries those as `null` with the sentence that renders in their
 * place, so supplying one is a single edit and the sentence disappears.
 *
 * House style for every string in this file: no hyphens, no en dashes and no em
 * dashes anywhere in reader facing text. Where a compound would normally take a
 * hyphen, reword it.
 *
 * ── What the law asks these pages to carry, and where it is met ────────────
 * Written against UK law as it applies to a UK site run from the UK:
 *   - The Electronic Commerce (EC Directive) Regulations 2002, regulation 6,
 *     and the Provision of Services Regulations 2009: a service provider must
 *     make available its name, a geographic address and an email address. The
 *     email is on every page; the geographic address is the one item not yet
 *     published (see COMPANY.postalAddress), and the pages say so.
 *   - UK GDPR and the Data Protection Act 2018: the privacy notice, written
 *     for what the site actually collects: optional accounts (Supabase),
 *     price drop emails (Resend) and email you send us. The chat assistant,
 *     which sent open questions to an AI service, was removed on
 *     2026-10-02, and with it everything the notice said about it.
 *   - PECR regulation 6 (cookies and similar storage): the cookies page lists
 *     every key this site writes, and none is written without an action of
 *     the reader's that asks for it, so no consent banner of ours is shown —
 *     there is nothing it would be consenting to. Display ads, once switched
 *     on (demo/ads.ts), bring Google's own certified consent message with
 *     them, and adsPolicy below adds the advertising wording to these pages.
 *   - The CAP Code (ASA) on affiliate marketing: the disclosure page, the
 *     footer line, and a marker on every commissioned link at the point of
 *     click, not only in a policy page.
 *   - Consumer law (the Consumer Contracts Regulations 2013, the Consumer
 *     Rights Act 2015) applies to the shops, not to this site, which sells
 *     nothing. The refunds page exists to say exactly that and to point a
 *     reader at where their rights actually lie.
 * None of this is a substitute for a solicitor's review; see docs/LEGAL.md.
 *
 * ── Why the numbers below are computed, not typed ────────────────────────────
 * Every count on these pages is derived from the registry and the built
 * catalogue at load time. They were hardcoded until 2026-08-12, and by then
 * every one of them had drifted: the About page told readers the site covered
 * "35 UK shops" and "1,912 fragrances" when it was 29 enabled shops and 15,448
 * fragrances. The affiliate disclosure then drifted the same way: it said "no
 * affiliate programme is running yet" and "all twelve shops pay us nothing"
 * for weeks after six programmes had gone live. A page whose whole argument is
 * that this site does not misstate things cannot itself carry stale figures,
 * and a number typed by hand will always drift again. The delivery examples
 * (Boots, Harvey Nichols) are read from the registry for the same reason.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { DEMO_FRAGRANCES } from './data.js';
import { BRAND_LOGOS } from './brandLogos.js';
import { SHOP_COUNT } from './catalogue.generated.js';
import { shopsPhrase } from './head.js';
import { ADS_ON, ADS_SWITCHED_ON } from './ads.js';

const n = (v: number) => v.toLocaleString('en-GB');
/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st: the English rule, not a lookup. */
const ordinal = (v: number): string => {
  const tens = v % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][v % 10] ?? 'th');
  return `${v}${suffix}`;
};

/** Shops we actually fetch from today, as opposed to entries in the registry. */
const ENABLED = RETAILERS.filter((r) => r.enabled);
/** The same count, for the home page's one sentence about what the site covers. */
export const ENABLED_SHOP_COUNT = ENABLED.length;
/** Coverage as shoppers see it ("more than 30"): shops that show prices today, rounded down. */
export const COVERAGE = shopsPhrase(Math.min(ENABLED.length, SHOP_COUNT));
/** Researched but not switched on, usually pending a delivery cost or a route. */
const SWITCHED_OFF = RETAILERS.filter((r) => !r.enabled);
/** Programmes actually approved, so a link genuinely earns commission. */
const COMMISSIONED = ENABLED.filter((r) => r.affiliate.status === 'active');
/** The networks those programmes run through, named once each. */
const NETWORKS = [...new Set(COMMISSIONED.map((r) => r.affiliate.network ?? 'direct'))].map((net) =>
  net === 'awin' ? 'Awin' : net === 'direct' ? 'the shop directly' : net,
);
/**
 * Enabled shops whose standard delivery cost is not established. These are
 * shown with delivery not stated and can never rank as cheapest — see
 * buildComparison. Naming them here keeps the About page's example honest
 * even as the list changes.
 */
const DELIVERY_UNSTATED = ENABLED.filter((r) => r.shipping.standardGbp === null);
/** Money as a shop states it: £25 for a whole number, £3.95 otherwise. */
const gbp = (v: number) => (Number.isInteger(v) ? `£${v}` : `£${v.toFixed(2)}`);
/**
 * The two delivery examples the About and How it works pages use, read from
 * the registry so a re-checked charge changes the sentence with it. The
 * About page typed "£5.95" for Harvey Nichols by hand and it had drifted.
 * Both are enabled shops (a shop switched off, as ten were on 2026-10-04,
 * cannot be the example on a page that says what the site shows): if either
 * stops being one, or loses its figures, the generic sentence is used.
 */
const enabledShop = (id: string) => ENABLED.find((r) => r.id === id);
const LOOKFANTASTIC = enabledShop('lookfantastic');
const FRAGRANCE_COUNTER = enabledShop('the-fragrance-counter');
const deliveryExample = (): string => {
  const a = LOOKFANTASTIC?.shipping;
  const b = FRAGRANCE_COUNTER?.shipping;
  return a && b && a.freeOverGbp != null && a.standardGbp != null && b.freeOverGbp != null && b.standardGbp != null
    ? `${LOOKFANTASTIC!.name} posts free once you spend ${gbp(a.freeOverGbp)} and charges ${gbp(a.standardGbp)} below that.
      ${FRAGRANCE_COUNTER!.name} wants ${gbp(b.freeOverGbp)}, so a single bottle under that carries
      ${gbp(b.standardGbp)} on top.`
    : 'Each shop sets its own delivery charge and its own spend for free delivery.';
};
const deliveryExampleFull = (): string => `${deliveryExample()}${cheaperRateExample()}`;
/**
 * Shops that charge a cheaper, still paid, rate above a spend (Debenhams), said
 * from the registry so a re-read rate changes the sentence with it. Never
 * called free: the cheaper rate is a charge like any other.
 */
const cheaperRateExample = (): string => {
  const parts = ENABLED.filter((r) => r.shipping.cheaperRateOver && r.shipping.standardGbp !== null).map((r) => {
    const c = r.shipping.cheaperRateOver!;
    const rate = c.costGbp < 1 ? `${Math.round(c.costGbp * 100)}p` : gbp(c.costGbp);
    return `${r.name} charges ${gbp(r.shipping.standardGbp!)}, or ${rate} on orders ${c.inclusive ? 'of' : 'over'} ${gbp(c.overGbp)}${c.inclusive ? ' or more' : ''}`;
  });
  return parts.length ? ` ${parts.join('. ')}, which is still a charge, so we add it to the price.` : '';
};
/**
 * The membership paragraph on How it works, from the registry. The example is
 * an enabled shop that records a scheme and a non member free delivery spend
 * (LOOKFANTASTIC today); the schemes named afterwards are every enabled shop
 * that records one. A shop switched off is never named: ten were on
 * 2026-10-04, Superdrug among them, and its Beautycard example went with it.
 */
const MEMBERSHIP_SHOPS = ENABLED.filter((r) => r.shipping.membershipPerk != null);
const membershipExample = (): string => {
  const example = MEMBERSHIP_SHOPS.find((r) => r.id === 'lookfantastic' && r.shipping.freeOverGbp != null);
  const perk = example?.shipping.membershipPerk;
  const lead =
    example && perk
      ? `${example.name} posts free delivery at ${gbp(example.shipping.freeOverGbp!)} for everyone, and also sells ${perk.scheme}
      (${perk.description.replace(/\.$/, '')}), so we quote ${gbp(example.shipping.freeOverGbp!)}.`
      : 'Where a shop runs a membership scheme, we quote the rate anyone can pay.';
  const names = MEMBERSHIP_SHOPS.map((r) => r.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  return names.length > 0 ? `${lead} ${list} ${names.length > 1 ? 'all run' : 'runs'} schemes of their own. We mention them.` : lead;
};
const DELIVERY_CONFIRMED = ENABLED.filter((r) => r.shipping.confidence === 'confirmed');
const DELIVERY_UNCONFIRMED = ENABLED.filter((r) => r.shipping.confidence === 'unverified');
/** Shops whose photographs are shown on a stated licence or their own storefront, versus a bare hotlink. */
const IMAGE_SHOPS = ENABLED.filter((r) => r.affiliate.imageBasis != null);
const IMAGE_LICENSED = IMAGE_SHOPS.filter((r) => r.affiliate.imageBasis !== 'hotlink-unlicensed');
const IMAGE_HOTLINKED = IMAGE_SHOPS.filter((r) => r.affiliate.imageBasis === 'hotlink-unlicensed');

/** Computed the same way IMAGE_SHOPS above is, for the Logos paragraph —
 *  see docs/LOGOS-PLAN.md §4f. A retailer's own `logo` field plus every
 *  brand in demo/brandLogos.ts, split by whether we host the file ourselves
 *  (commons-public-domain, under demo/logos/) or hot-link it from the
 *  owner's own server (everything else). */
const LOGO_RETAILERS = ENABLED.filter((r) => r.logo != null);
const LOGO_BRANDS = Object.values(BRAND_LOGOS);
const LOGO_TOTAL = LOGO_RETAILERS.length + LOGO_BRANDS.length;
const LOGO_PUBLIC_DOMAIN =
  LOGO_RETAILERS.filter((r) => r.logo!.basis === 'commons-public-domain').length +
  LOGO_BRANDS.filter((l) => l.basis === 'commons-public-domain').length;
/** Files the owner of this site sent us, which we host (docs/LOGOS-PLAN.md section 7). */
const LOGO_SUPPLIED =
  LOGO_RETAILERS.filter((r) => r.logo!.basis === 'owner-supplied').length +
  LOGO_BRANDS.filter((l) => l.basis === 'owner-supplied').length;
/** A shop with no logo of its own, whose name is shown in plain type instead, if it is on the site. */
const PLAIN_TYPE_SHOP = ENABLED.find((r) => r.id === 'manchester-ouds' && r.logo?.basis === 'owner-supplied');

/**
 * What the privacy, cookie and affiliate pages say about display advertising,
 * generated from the same switch that shows the ads (ADS_ON in demo/ads.ts),
 * so these pages can never claim ads that do not run, nor leave out ads that
 * do. With ads off every string is the wording these pages carried before
 * advertising existed, word for word. tests/ads.test.ts renders both.
 */
export function adsPolicy(on: boolean) {
  return {
    /** Privacy summary, the end of the "Why" point. */
    summary: on
      ? 'We do not track or profile you ourselves. Google shows ads on some pages, personalised only if you agree to it.'
      : 'There is no\n          tracking, no profiling and no advertising.',
    /** Privacy notice, the end of the first paragraph under "What We Collect". */
    collect: on
      ? `Nothing of ours tracks you or profiles you. Google shows ads on some
      pages, as set out below.`
      : `Nothing on this site tracks you,
      profiles you or shows you advertising.`,
    /** Privacy notice, an extra item in the "What We Collect" list. */
    collectItem: on
      ? `<li><strong>Advertising.</strong> Some pages show ads from Google
        AdSense, each labelled Advertisement. Google's ad code reads your
        device and connection details, such as your IP address, to choose and
        count ads. In the UK and the EEA, Google first asks whether you agree to
        cookies and personalised ads. If you do not agree, or do not answer,
        the ads you see are not personalised. Ads never change which shops we
        list or the order of any results.</li>`
      : '',
    /** Privacy notice, an extra item in "Who Processes It for Us". */
    processorItem: on
      ? `<li><strong>Google</strong> serves the ads on pages that show them,
        through Google AdSense, as an independent controller under Google's own
        privacy policy. Google explains
        <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">how it uses
        information from sites that show its ads</a>. We receive only totals of
        ads shown and earnings, never data about you.</li>`
      : '',
    /** Privacy notice, an extra sentence under "Our Lawful Basis". */
    basis: on
      ? ` For advertising cookies and personalised ads we rely on your consent,
      asked for by Google's consent message before any is set, and changed
      whenever you like from its privacy settings link.`
      : '',
    /** Privacy notice, the "Cookies and Storage" paragraph. */
    privacyCookies: on
      ? `<p>We set no cookies of our own. Google may set advertising cookies on
      pages that show ads, once you agree to them. What we store in your
      browser, and when, is listed key by key on the
      <a href="#" data-page="cookies">cookies page</a>.</p>`
      : `<p>We set no cookies. What we do store in your browser, and when, is listed
      key by key on the <a href="#" data-page="cookies">cookies page</a>.</p>`,
    /** Cookies page, the opening sentence. */
    cookiesIntro: on
      ? 'PriceSniffs sets no cookies of its own. Google, which shows the ads on some pages, may set advertising cookies once you agree to them.'
      : 'PriceSniffs sets no cookies.',
    /** Cookies page, the section on consent. */
    cookiesConsent: on
      ? `<h2 class="t-section">Advertising and Your Consent</h2>
      <p>UK rules, the Privacy and Electronic Communications Regulations, require
      consent before storing anything on your device that is not strictly
      necessary for a service you have asked for. Nothing of ours below is
      written until you take the action that needs it: choosing a theme or
      signing in. The ads on some pages come from Google AdSense, and in the UK
      and the EEA Google's own consent message asks you first whether Google
      may use cookies and show personalised ads. If you say no, or do not
      answer, the ads are not personalised. You can change your answer at any
      time from the privacy settings link that message leaves on the page. We
      run no analytics and no tracking of our own.</p>`
      : `<h2 class="t-section">Why There Is No Cookie Banner</h2>
      <p>UK rules, the Privacy and Electronic Communications Regulations, require
      consent before storing anything on your device that is not strictly
      necessary for a service you have asked for. Nothing below is written until
      you take the action that needs it: choosing a theme or signing in. There is no analytics, no advertising and no tracking
      of any kind. So there is nothing a banner would ask you to accept. If that
      ever changes, we will ask for consent before anything is set, not after.</p>`,
    /** Cookies page, an extra item under "Third Parties". */
    cookiesThirdParty: on
      ? `<li><strong>Google AdSense.</strong> Pages that show an ad load Google's
        ad code from Google's servers. With your agreement Google may set
        cookies to personalise and measure ads; without it the ads are not
        personalised. See
        <a href="https://policies.google.com/technologies/ads" rel="noopener" target="_blank">how Google uses
        cookies in advertising</a>.</li>`
      : '',
    /** Affiliate page, the end of "What Commission Does Not Touch". */
    affiliate: on
      ? `Display ads from Google appear on some pages, outside the results, each
      labelled Advertisement. They have no effect on which shops we list or the
      order of anything.`
      : `If
      we ever run a paid placement, it will sit outside the results and be
      labelled as advertising.`,
  };
}

const ADS_TEXT = adsPolicy(ADS_ON);

/**
 * The business behind the site. `null` means "not yet published", and every
 * page that would show the value shows an honest sentence instead. Filling
 * one in is the whole edit.
 */
export const COMPANY = {
  name: 'PriceSniffs',
  /** The trading name the site is run under. */
  legalName: 'YannySniffs',
  /**
   * The person who runs it, published 2026-09-06 at the owner's request. UK
   * service provider rules expect the provider's name to be available
   * alongside the trading name. `null` here renders "a personal name has not
   * yet been published" on every page that would show it.
   */
  operator: 'Ur Koppan' as string | null,
  /**
   * A geographic (postal) address. Required of a UK service provider by
   * regulation 6 of the Electronic Commerce Regulations 2002 and by the
   * Provision of Services Regulations 2009. Not yet published: none has been
   * supplied for publication. A service address is acceptable; it does not
   * have to be a home address.
   */
  postalAddress: null as string | null,
  /**
   * ICO registration number, if the operator has paid the data protection
   * fee. Null: no registration has been reported. Whether one is needed
   * depends on the processing (accounts holding email addresses may well
   * mean it is) and is for the operator to settle with the ICO's own
   * self assessment tool.
   */
  icoRegistration: null as string | null,
  email: 'yannysniffs@gmail.com',
  feedbackEmail: 'yannysniffs@gmail.com',
  privacyEmail: 'yannysniffs@gmail.com',
  /** Where the site is served from, and who runs accounts and emails. */
  hosting: 'GitHub Pages',
  accountsProvider: 'Supabase',
  /** Sends price drop emails to readers who opted in (queue item 4.1). */
  emailProvider: 'Resend',
  /**
   * The day these pages last changed. When ads switch on, their advertising
   * sections appear, so the date moves to ADS_SWITCHED_ON (demo/ads.ts).
   */
  updated: ADS_ON && ADS_SWITCHED_ON ? ADS_SWITCHED_ON : '5 October 2026',
} as const;

/** Storage this site writes in the reader's browser, listed on the cookies page. */
export const STORAGE_KEYS = [
  { key: 'pricesniffs.display', kind: 'local storage', when: 'when you choose dark, light or system in Settings', holds: 'that choice' },
  { key: 'pricesniffs.layout', kind: 'local storage', when: 'when you choose the mobile or desktop layout in Settings', holds: 'that choice' },
  { key: 'pricesniffs.perrow', kind: 'local storage', when: 'when you change how many tiles show per row', holds: 'that number' },
  { key: 'a key beginning sb', kind: 'local storage', when: 'when you sign in to an account', holds: 'your sign in token, written by the Supabase library so you stay signed in' },
] as const;

/** A definition list of the business details, with an honest line for each absent one. */
function businessDetails(): string {
  const row = (term: string, value: string) => `<div class="biz-row"><dt>${term}</dt><dd>${value}</dd></div>`;
  return `<dl class="biz-details">
    ${row('Site', COMPANY.name)}
    ${row('Run By', COMPANY.operator ? `${COMPANY.operator}, trading as ${COMPANY.legalName}` : `one person, trading as ${COMPANY.legalName}. A personal name has not yet been published on this site; it will be supplied on request by email.`)}
    ${row('Email', `<a href="mailto:${COMPANY.email}">${COMPANY.email}</a>`)}
    ${row('Postal Address', COMPANY.postalAddress ?? 'not yet published on this site. UK service provider rules ask for one, and it will be supplied on request by email and published here once settled.')}
    ${row('Company Number', 'none. This is not a registered company.')}
    ${row('VAT Number', 'none. Not VAT registered.')}
    ${row('ICO Registration', COMPANY.icoRegistration ?? 'no registration number is published here. Whether one is required is being checked against the ICO self assessment; see the privacy notice for what is actually processed.')}
  </dl>`;
}

/**
 * The About page's copy, in pieces, so /about can lay it out as a page (a
 * mission line, four cards, a short FAQ) while /legal/about keeps the same
 * words as one document. Every figure is computed from the registry or the
 * catalogue, like the rest of this file; the live numbers at the top of
 * /about come from liveCounts() in demo/data.ts.
 *
 * "Checked daily" is the wording the quick fixes of 2026-10-04 made true, and
 * it is always "every shop that lets us read its pages": a shop that refuses
 * us is never described as checked.
 */
export const ABOUT = {
  mission: 'PriceSniffs shows what a bottle of fragrance really costs at UK shops, delivery included.',
  story: `<p>Hi, I am Yanny. I built this after I bought a 100ml Club de Nuit and saw it twelve pounds cheaper four days later. Checking by hand meant nine tabs across different shops, and half of them hid the postage until checkout.</p>`,
  checks: [
    {
      title: 'Delivery Included',
      body: `Every price includes the delivery the shop will charge you. ${deliveryExampleFull()} If we do not know a delivery charge, the listing says so and can never be called cheapest.`,
    },
    {
      title: 'Checked Daily',
      body: 'Every shop that lets us read its pages is checked daily. No price is typed in by hand.',
    },
    {
      title: 'No Paid Placements',
      body: 'No shop can pay to rank higher. Results are ordered by stock, then by price.',
    },
    {
      title: 'Real Price History',
      body: 'Product pages chart the prices we actually recorded, so you can see whether today’s price is really low. An old price is never carried forward to fill a gap.',
    },
  ],
  method: `<p>The full method, including which delivery charges we have checked with each shop, is on <a href="#" data-page="how-it-works">How it works</a>.</p>`,
  money: `<p>${COMMISSIONED.length} shops pay us commission when you buy through our link. It costs you nothing and never changes the order of results. Those links are marked Affiliate link, and our <a href="#" data-page="affiliate">affiliate disclosure</a> names the shops.</p>`,
  whoRuns: `<p>${COMPANY.operator ? `${COMPANY.operator} runs PriceSniffs, trading as ${COMPANY.legalName}.` : `One person runs PriceSniffs, trading as ${COMPANY.legalName}.`} It is not a company. Email <a href="mailto:${COMPANY.email}">${COMPANY.email}</a> about a wrong price, or a shop that should be the ${ordinal(ENABLED.length + 1)}. Zimaya was added because someone asked.</p>
      <p>I also post about fragrance on <a href="https://www.tiktok.com/@yannysniffs" target="_blank" rel="noopener">TikTok</a> and <a href="https://www.instagram.com/yannysniffs" target="_blank" rel="noopener">Instagram</a> as yannysniffs. Full business details are on the <a href="#" data-page="contact">contact page</a>.</p>`,
  /**
   * Only questions the site's own pages already answer, in their words: How
   * it works, the affiliate disclosure and the sign up form. Nothing here is
   * a new promise.
   */
  faq: [
    {
      q: 'Do the prices include delivery?',
      a: 'Yes. Every price includes standard delivery to a UK mainland address, and we work out whether your order reaches the shop’s spend for free delivery. Where a shop does not say what it charges, the listing says delivery not stated and can never come out cheapest.',
    },
    {
      q: 'How often are prices checked?',
      a: 'Once a day, at every shop that lets us read its pages. Every listing says when we last looked.',
    },
    {
      q: 'Can a shop pay to appear higher?',
      a: 'No. Results are ordered by stock and then by price, and commission never moves a listing.',
    },
    {
      q: 'Why is a shop I use missing?',
      a: `We have looked at ${RETAILERS.length} shops so far. ${SWITCHED_OFF.length} of them are switched off for now, some of them waiting on a delivery charge or on a way to read their listings at all. Email us to suggest one.`,
    },
    {
      q: 'Do you show members only prices?',
      a: 'Not as the headline. Where a shop runs a membership scheme we mention it, but the price we quote is one anyone can pay.',
    },
    {
      q: 'Are the savings worked out by you?',
      a: 'No. A previous price and a percentage saving are the shop’s own figures, and percentages round down.',
    },
    {
      q: 'Do I need an account?',
      a: 'No. Searching and comparing prices works without one. An account saves fragrances to a wishlist and lets you choose price alert emails.',
    },
  ],
};

export interface LegalPage {
  id: string;
  title: string;
  /** Short label used in the footer. */
  short: string;
  body: string;
}

export const LEGAL_PAGES: LegalPage[] = [
  {
    id: 'about',
    title: 'About PriceSniffs',
    short: 'About',
    // /about lays these same pieces out as a page (aboutView in demo/app.ts);
    // this is the plain document form, kept so /legal/about still answers
    // and so the words have one source.
    body: `
      <p>PriceSniffs shows what a bottle of fragrance really costs at ${COVERAGE} UK shops, delivery included. It covers ${n(DEMO_FRAGRANCES.length)} fragrances today.</p>
      ${ABOUT.story}
      <h2 class="t-section">How Prices Are Checked</h2>
      <ul>
        ${ABOUT.checks.map((c) => `<li>${c.body}</li>`).join('\n        ')}
      </ul>
      ${ABOUT.method}
      <h2 class="t-section">How the Site Makes Money</h2>
      ${ABOUT.money}
      <h2 class="t-section">Who Runs It</h2>
      ${ABOUT.whoRuns}`,
  },
  {
    id: 'how-it-works',
    title: 'How PriceSniffs Works',
    short: 'How It Works',
    body: `
      <p>PriceSniffs compares fragrance prices across ${COVERAGE} UK shops, so you can
      see what a bottle really costs before you buy it.</p>

      <h2 class="t-section">Prices Are Checked Daily</h2>
      <p>We look at every shop that lets us read its pages once a day. No price
      is typed in by hand. A fragrance shows up here because a shop was selling it when we
      looked, and the price came off that page. Every listing says when we last
      looked.</p>
      <p>Shops change their delivery terms far less often, maybe twice a year. So
      we check those less often than prices.</p>

      <h2 class="t-section">Delivery Is Counted</h2>
      <p>Every price includes standard delivery to a UK mainland address. We also
      work out whether your order reaches the shop's spend for free delivery.
      ${deliveryExampleFull()} That is why a bottle priced at £24.99 can cost you
      more than one priced at £26.</p>

      <h2 class="t-section">Which Delivery Charges We Have Checked</h2>
      <p>Of the ${ENABLED.length} shops switched on today, ${DELIVERY_CONFIRMED.length}
      have had their delivery charge read off their own delivery page or checked
      by hand in their own basket:
      ${DELIVERY_CONFIRMED.map((r) => r.name).join(', ')}.</p>
      <p>The other ${DELIVERY_UNCONFIRMED.length} carry a figure from our research
      that the shop has not confirmed yet. Every listing from those shops says
      so, in the same line as the charge. Delivery decides the ranking. So when
      the gap between first and second place is smaller than an unconfirmed
      charge, we do not use the word cheapest. The leader is labelled lowest
      total instead, because we cannot be sure which of the two is cheaper.</p>
      <p>Some shops publish no standard delivery charge at all. Manchester Ouds,
      for example, posts free over £50 but never says what it charges below
      that. Below a shop's free delivery spend, its listings say delivery not
      stated, and they can never come out cheapest however low the bottle price
      is. At or above that spend, delivery is free in the shop's own words.
      ${DELIVERY_UNSTATED.length} shops are in that state today:
      ${DELIVERY_UNSTATED.map((r) => r.name).join(', ')}. A blank charge counted
      as zero would push a shop to the top of every result, and it would be
      wrong.</p>
      <p>We have looked at ${RETAILERS.length} shops so far. ${SWITCHED_OFF.length}
      of them are switched off for now, some of them waiting on a delivery
      charge or on a way to read their listings at all.</p>

      <h2 class="t-section">Reductions Come From the Shop</h2>
      <p>A previous price and a percentage saving are the shop's own figures. We
      never work one out ourselves. Percentages round down, so a saving of 19.6
      per cent shows as 19 per cent, never 20. A countdown appears only when the
      shop has published a closing time for the offer. We never invent one.</p>

      <h2 class="t-section">Membership Rates Are Not the Headline</h2>
      <p>${membershipExample()} We never build a members only rate into the
      headline price, because you cannot pay it unless you have already
      joined.</p>

      <h2 class="t-section">Sold Out and Preorder Stay at the Bottom</h2>
      <p>Listings a shop has marked unavailable sit at the end and can never be
      shown as cheapest, however low the price. Where we could not read the
      stock at all, we say so rather than guess. That listing drops below the
      ones we could confirm.</p>
      <p>Some shops sell a bottle before it is shipping and label it preorder.
      You cannot get one today, so it sits under the sold out listings with a
      Preorder label. It is never shown as cheapest and never counted as in
      stock, in a deal, in a price drop email or on the price graph. We only
      say preorder when the shop itself does, on its own page or in its own
      feed. We do not guess it from a date or a missing figure.</p>

      <h2 class="t-section">Reviews</h2>
      <p>We do not write reviews, collect them, or mix one shop's rating with
      another's. Where we have checked that a shop has its own page on
      Trustpilot, that shop's page here links to it, so you can read what
      customers say before you buy. It is a plain link to Trustpilot's own
      site, not an affiliate link, and we do not copy any score, star rating or
      review count from it. Where we could not confirm a shop's Trustpilot
      page, we show no link rather than guess one. A shop's page may also offer
      that shop's Trustpilot rating, which loads only when you press the
      button.</p>

      <h2 class="t-section">Photos</h2>
      <p>Every product photo loads straight from the shop's own website. We do
      not copy it, save it or put it on our own server. Your browser fetches it
      from Justmylook or Allbeauty just as it would on their own page, and it
      sits beside a link to buy from them. Fragrance Click told us in writing we
      may use theirs. For the rest we say plainly that we have no such
      permission. If a shop wants us to stop, we stop the day it asks. The
      <a href="#" data-page="terms">terms</a> say which grounds apply to how
      many shops.</p>

      <h2 class="t-section">Finding What You Want</h2>
      <p>Filter by bottle size, strength, price from under £20 to over £300,
      offers and stock. Pick 50ml and the strength list shows only strengths
      that come in 50ml. So a filter never leads to an empty page. Sort by price
      either way, or A to Z.</p>

      <h2 class="t-section">Position Is Not for Sale</h2>
      <p>Results are ordered by stock and then by price. Nothing else. No shop
      can pay to appear higher, and commission never moves a listing. Read our
      <a href="#" data-page="affiliate">affiliate disclosure</a>.</p>`,
  },
  {
    id: 'affiliate',
    title: 'Affiliate Disclosure',
    short: 'Affiliate Disclosure',
    body: `
      <p>PriceSniffs earns commission when you buy through some of the links on
      this site. It costs you nothing and does not change the price you pay.</p>

      <h2 class="t-section">Which Links Earn Commission</h2>
      <p>${COMMISSIONED.length} of the ${ENABLED.length} shops listed today pay
      us commission on a purchase made after clicking through from here:
      ${COMMISSIONED.map((r) => r.name).join(', ')}. Those programmes run through
      ${NETWORKS.join(' and ')}. Every link to one of those shops is marked
      "Affiliate link" on the shop's row, under its name, so you see it before
      you click. Search engines are told the link is sponsored too. Links to
      every other shop carry no tracking and earn nothing.</p>
      <p>This list comes from the same records that decide which shops appear
      at all. So it changes the moment a programme is approved or withdrawn,
      not when someone remembers to edit this page.</p>

      <h2 class="t-section">What Happens When You Click</h2>
      <p>A commissioned link takes you to the shop by way of the affiliate
      network. The network records that you came from PriceSniffs, so a
      purchase can be matched to us. To do that it may set a cookie on its own
      or the shop's site. Those cookies belong to the network and the shop,
      under their policies, and PriceSniffs never sees them. Nothing is set on
      this site. See our <a href="#" data-page="cookies">cookies page</a>.</p>

      <h2 class="t-section">What Commission Does Not Touch</h2>
      <p>Commission has no effect on the order of results, on which shops we
      include, or on the prices we show. Position is decided by stock and by
      delivered price. We will not take payment for a place in the results. ${ADS_TEXT.affiliate}</p>

      <h2 class="t-section">Why We Tell You This</h2>
      <p>UK advertising rules, the CAP Code run by the Advertising Standards
      Authority, say affiliate links must be obvious before you click, not
      buried in a policy page. That is why the marker sits on the link itself,
      and a note also appears at the bottom of every screen.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'privacy',
    title: 'Privacy Notice',
    short: 'Privacy',
    body: `
      <aside class="summary-box" aria-labelledby="privacy-summary">
        <h2 class="t-section" id="privacy-summary">In Short</h2>
        <ul>
          <li><strong>What we collect.</strong> Nothing while you browse,
          search or filter; that stays in your browser. Only what you choose to
          send: your email and password if you
          sign up, the fragrances on your Wishlist with any target price you
          type, whether you want price drop emails, a profile photo if you add
          one, and any email you write to us.</li>
          <li><strong>Why.</strong> To answer your question, run your account
          and Wishlist, and reply to you. Under UK GDPR that rests on contract
          for accounts and legitimate interests for email. ${ADS_TEXT.summary}</li>
          <li><strong>Who processes it.</strong> ${COMPANY.accountsProvider}
          holds your email, login, wishlist and any profile photo. ${COMPANY.emailProvider} sends
          price drop emails if you ask for them. ${COMPANY.hosting} serves
          the pages. We never see card details; you pay the shop.</li>
          <li><strong>How long.</strong> Settings such
          as Dark or Light stay in your browser until you clear them. Account data
          stays until you delete the account. Emails are deleted once we have
          dealt with them.</li>
          <li><strong>How to delete it.</strong> Press Delete account on the
          Account page, or email
          <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a>
          and we will do it within one month. Signing out removes the sign in
          token from your browser. To stop price drop emails, untick the box on
          the Account page or use the link in any of them. To remove your
          photo, press Remove Photo on your profile.</li>
        </ul>
      </aside>

      <p>This notice sets out what personal data ${COMPANY.name} collects, why we
      collect it, who processes it for us, and what you can ask us to do about
      it. It is written to meet UK GDPR and the Data Protection Act 2018.</p>

      <h2 class="t-section">Who We Are</h2>
      <p>PriceSniffs is run by ${COMPANY.operator ? `${COMPANY.operator}, one person` : 'one person'} trading as ${COMPANY.legalName}, not a
      registered company. You can reach us at
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> for
      anything to do with your data. Our full business details are on the
      <a href="#" data-page="terms">terms page</a>.</p>

      <h2 class="t-section">What We Collect, and Why</h2>
      <p>Browsing, searching and filtering happen entirely in your browser
      against a fixed catalogue. None of it is sent to us or stored by us.
      Two things do leave your browser, each only when you choose to use it:
      the details you give when you create an account, and anything you email
      us. ${ADS_TEXT.collect}</p>
      <ul>
        <li><strong>Your display preferences.</strong> Dark or light theme,
        mobile or desktop layout and tiles per row are saved on your own device
        only, using your browser's local storage. They never leave it and we
        never see them. Listed in full on the <a href="#" data-page="cookies">cookies page</a>.</li>
        <li><strong>Anything you send us.</strong> If you email us, whether
        through the contact form or directly, we keep that message and your
        address so that we can reply, the same as any inbox. The forms on this
        site open your own email app; nothing is submitted to a server of ours.</li>
        <li><strong>If you create an account.</strong> Signing up is optional.
        It takes your email address and a password, which our account
        provider, ${COMPANY.accountsProvider}, uses to create your login and
        send you a verification email. Once verified, you can save fragrances
        to a wishlist. It stores which fragrance you saved, when, and an
        optional target price you typed in yourself, never one we set. You can
        use the price comparison fully without ever creating an account.</li>
        <li><strong>A profile photo, if you add one.</strong> Optional. Before
        it leaves your browser, the photo is cut to a small square (256 pixels
        at most) and saved afresh, which drops everything else the original
        file carried, such as the camera, the time it was taken and where. That
        one small image is stored with ${COMPANY.accountsProvider}, in private
        storage only your own signed in account can read, so we can show it on
        your account button and profile on any device you sign in on. Nobody
        else is shown it. Press Remove Photo on your profile to delete it at
        any time; deleting your account deletes it too.</li>
        <li><strong>Price drop emails.</strong> Off unless you tick "Email me
        when a saved fragrance gets cheaper" on the Account page. Once a
        morning we compare your saved fragrances with that day's prices and, if
        one has dropped or reached your target, email you about it, once a day
        at most. For that we keep your choice, a random code that makes the
        stop link in each email work, the day we last emailed you, and the last
        price we told you about for each saved fragrance, so the same drop is
        never sent twice. Untick the box or press the stop link in any email and
        they end straight away.</li>
        <li><strong>Trustpilot reviews.</strong> On a shop's page you may see
        a button offering that shop's Trustpilot rating. Nothing loads from
        Trustpilot until you press it; when you do, your browser fetches their
        widget from their servers under Trustpilot's own privacy policy.</li>
        <li><strong>Share buttons.</strong> The Share button on a fragrance
        opens a small window with its link. Nothing is sent to us or to anyone
        else until you choose one of the apps or sites in it, or More. Copy
        only puts the link on your own clipboard. A share choice opens the
        app or site you chose, or your phone's own share sheet, and what
        happens next is under their privacy policy.</li>${ADS_TEXT.collectItem}
      </ul>
      <p>We never see your payment details. Buying happens on the shop's own
      site, under their privacy policy rather than ours.</p>

      <h2 class="t-section">Who Processes It for Us</h2>
      <ul>
        <li><strong>${COMPANY.hosting}</strong> serves the site. Serving any
        website involves the host handling standard connection information,
        such as IP addresses, to deliver the page. That is governed by GitHub's
        own privacy statement; we do not receive or store it.</li>
        <li><strong>${COMPANY.accountsProvider}</strong> holds account data,
        your email, login, wishlist and any profile photo, if you create an
        account. We do not run
        a server of our own. Row level security on that database means only
        you, signed in as yourself, can read or change your own account data.
        The one exception is our morning price alert job, which reads the
        address and saved fragrances of readers who switched price drop emails
        on, and nobody else's. We cannot read your password, and no PriceSniffs code ever asks for
        one.</li>
        <li><strong>${COMPANY.emailProvider}</strong> sends price drop emails,
        only to readers who switched them on. It receives your email address and
        what each email says, nothing else, and handles them under its own data
        processing terms.</li>
        <li><strong>Affiliate networks</strong> receive nothing from this site.
        Once you click a commissioned link, the network records that you came
        from here on its own or the shop's site. See the
        <a href="#" data-page="affiliate">affiliate disclosure</a>.</li>${ADS_TEXT.processorItem}
      </ul>
      <p>We do not sell personal data, and we do not share it with anyone else
      except where the law requires it.</p>

      <h2 class="t-section">Our Lawful Basis</h2>
      <p>For replying to messages you send us, we rely on legitimate interests:
      being able to answer you. You decide whether to send anything at all. For
      account data, your email, login, wishlist and any profile photo, we
      rely on contract: creating and running the account you asked for. For
      price drop emails we rely on your consent, given when you tick the box,
      and withdrawn whenever you untick it or press the stop link. Where
      anything not strictly necessary would be stored in your browser, we rely
      on your consent, given by the action that asks for it. You can withdraw
      it whenever you like by clearing it.${ADS_TEXT.basis}</p>

      <h2 class="t-section">Cookies and Storage</h2>
      ${ADS_TEXT.privacyCookies}

      <h2 class="t-section">How Long We Keep It</h2>
      <p>Emails are kept only as long as we need them to deal with what you have
      asked, then deleted. We do not
      keep search history, browsing history or any other record of your visit,
      because we never receive one. Account data is kept for as long as your
      account exists, and deleted when you delete your account from the Account
      page or ask us to close it. The last price we emailed you about for a
      fragrance goes when you remove it from your wishlist. A profile photo
      is kept until you press Remove Photo or delete your account.</p>

      <h2 class="t-section">Your Rights</h2>
      <p>You can ask for a copy of your data, ask us to correct or delete it,
      object to what we are doing with it, ask us to restrict it, or ask for it in
      a portable format. Write to
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> and we
      will reply within one month.</p>
      <p>If you are unhappy with how we have handled your data you can complain to
      the Information Commissioner's Office at
      <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>
      or by calling 0303 123 1113. If you are in the EU or EEA, the rights above
      apply to you in the same way, and you may also complain to your own data
      protection authority.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'cookies',
    title: 'Cookies and Storage',
    short: 'Cookies',
    body: `
      <p>${ADS_TEXT.cookiesIntro} This page lists everything the site does
      store in your browser, and exactly when. It also says what third parties
      may set once you leave this site or ask for their content.</p>

      ${ADS_TEXT.cookiesConsent}

      <h2 class="t-section">What This Site Stores, Key by Key</h2>
      <dl class="biz-details">
        ${STORAGE_KEYS.map(
          (s) => `<div class="biz-row"><dt><code>${s.key}</code></dt><dd>${s.kind}, written ${s.when}. Holds ${s.holds}.</dd></div>`,
        ).join('')}
      </dl>
      <p>Local storage stays until you clear it. Session storage is discarded
      when the tab closes. None of it is readable by us or by anyone else. It
      lives in your browser and is read back only by this site on your device.</p>

      <h2 class="t-section">Third Parties</h2>
      <ul>
        <li><strong>Trustpilot.</strong> A shop's page may offer a button to
        show that shop's Trustpilot rating. Nothing is fetched from Trustpilot
        until you press it. When you do, their widget loads from their servers
        and may set cookies of its own, under Trustpilot's policy.</li>
        <li><strong>Share targets.</strong> The Share window on a fragrance
        only builds links. Nothing is sent until you choose one of the apps or
        sites in it, or More, which opens that app or site, or your phone's
        own share sheet, under its own policy and cookies.</li>
        <li><strong>Affiliate networks.</strong> Clicking a link marked
        Affiliate link takes you to the shop by way of the network, which may
        set a cookie on its own or the shop's site to match a purchase to us.
        That happens after you have left PriceSniffs and is governed by the
        network's and the shop's policies. See the
        <a href="#" data-page="affiliate">affiliate disclosure</a>.</li>
        <li><strong>${COMPANY.accountsProvider}.</strong> If you sign in, its
        library keeps your sign in token in local storage as listed above, so
        that you stay signed in. It is removed when you sign out.</li>
        <li><strong>The shops themselves.</strong> Product photographs load
        directly from each shop's own servers, so those servers see the ordinary
        request your browser makes for an image. We send no identifying
        referrer with it.</li>${ADS_TEXT.cookiesThirdParty}
      </ul>

      <h2 class="t-section">Clearing It</h2>
      <p>Signing out removes the sign in token. Everything else is cleared from your browser's
      own settings, under site data for pricesniffs.space, and the site keeps
      working without any of it.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'refunds',
    title: 'Refunds and Returns',
    short: 'Refunds',
    body: `
      <p>PriceSniffs does not sell anything, so there is nothing to refund or
      return here. Every purchase you make after clicking through is a contract
      between you and that shop, on that shop's terms. The shop takes your
      money, sends the parcel and handles any refund.</p>

      <h2 class="t-section">Where Your Rights Actually Lie</h2>
      <p>Your rights are against the seller and they come from UK consumer law,
      not from us. For most goods bought online from a UK business you can
      cancel within fourteen days of receiving them without giving a reason,
      under the Consumer Contracts Regulations 2013. That right can be lost for
      sealed goods that are unsealed after delivery for hygiene reasons. A shop
      may apply that to an opened fragrance. So check the shop's own returns
      policy before you open a bottle you may want to send back. Goods that are
      faulty, not as described or not fit for purpose are covered separately by
      the Consumer Rights Act 2015, which gives you a right to a refund, repair
      or replacement from the seller.</p>
      <p>Independent guidance on all of this is available from
      <a href="https://www.citizensadvice.org.uk" rel="noopener" target="_blank">Citizens Advice</a>.
      This page is a plain summary, not legal advice.</p>

      <h2 class="t-section">What We Can and Cannot Do</h2>
      <p>We cannot process, arrange or chase a refund, because we are not party
      to the sale and never hold your money. What we can do is fix our side. If
      a price, delivery charge or stock figure shown here was wrong, tell us the
      fragrance, the bottle size, the shop and the figure you saw. We will check
      it the same day. <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h2 class="t-section">Prices Can Move</h2>
      <p>Prices are collected daily and can change between our check
      and your visit to the shop. Every listing shows when we last looked. The
      price you pay is the one on the shop's site at checkout, which is why we
      say on every page to check it there before you buy.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'terms',
    title: 'Terms of Use',
    short: 'Terms',
    body: `
      <p>Using PriceSniffs means accepting these terms.</p>

      <h2 class="t-section">Who Runs This Site</h2>
      ${businessDetails()}

      <h2 class="t-section">What PriceSniffs Is</h2>
      <p>PriceSniffs is an information service. We do not sell fragrance, hold stock,
      take payments or send parcels. Any purchase is a contract between you and
      the shop, on their terms. See our
      <a href="#" data-page="refunds">refunds and returns page</a> for where
      your rights as a buyer actually lie.</p>

      <h2 class="t-section">How Accurate the Prices Are</h2>
      <p>We work hard to show accurate prices. But we collect them daily,
      and they can change at any moment. Postage costs, and the spend
      needed for free delivery, are worked out from the published terms of the
      ${ENABLED.length} shops we fetch from. They may miss a promotion, a
      Highlands surcharge or a basket rule.
      <strong>Always check the price on the shop's own site before you buy.</strong>
      Every listing carries the time we last looked, down to the minute.</p>
      <p>We are not liable for losses caused by a price, postage cost or stock
      figure being wrong or out of date, except where the law does not let us
      exclude liability. Nothing in these terms limits your statutory rights
      as a consumer.</p>

      <h2 class="t-section">The Shops We List</h2>
      <p>Appearing here is not an endorsement, and being absent is not a
      criticism. We list established UK shops. We do not inspect individual
      parcels and we cannot guarantee the authenticity of goods sold by anyone
      else.</p>

      <h2 class="t-section">Fair Use</h2>
      <p>Please do not scrape the site, overload it, try to disrupt it, or copy
      substantial parts of it without asking us first.</p>

      <h2 class="t-section">Our Content</h2>
      <p>The design, wording and data compilations belong to ${COMPANY.legalName}.
      Brand names, product names and trade marks belong to their owners and appear
      here only to identify products. Where we show a shop's or a house's logo, it
      is for the same reason and on the same terms: to say whose price or whose
      bottle you are looking at. We are not affiliated with, endorsed by or
      sponsored by any of them.</p>

      <h2 class="t-section">Product Images</h2>
      <p>Every product image here is the retailer's or the brand's own
      photograph, loaded by your browser directly from their own servers. We do
      not copy, host, crop, recolour or otherwise alter any of them. Each one
      sits beside a link to buy that product from the shop it came from.</p>
      <p>Each image remains the property of whoever created it. We show them on
      one of three grounds, recorded per shop: that shop's affiliate terms
      permit it, or the picture comes from the brand's own shop, or we are
      linking to the shop's own image without a licence having been granted.
      Today ${IMAGE_LICENSED.length} of the ${IMAGE_SHOPS.length} shops whose
      photographs appear fall under the first two, and ${IMAGE_HOTLINKED.length}
      under the third. Where a shop has given us no image we can use, we show a
      plain marker saying so rather than substituting a picture of something
      else.</p>
      <p>If you are a retailer or brand and would rather we did not show your
      photography, tell us and we will stop for your shop.
      <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h2 class="t-section">Logos</h2>
      <p>A shop's or a house's logo appears beside a link to them, to identify
      them. Most are loaded by your browser directly from that owner's own
      servers. Some are files we host ourselves: a small number whose published
      licence puts them in the public domain, and some that the person who runs
      PriceSniffs supplied to us. We do not recolour any of them. The supplied
      files are set on a plain white background, trimmed of empty space and
      resized; the others are shown as they are.${PLAIN_TYPE_SHOP ? ` ${PLAIN_TYPE_SHOP.name} has no logo of its own, so we show its name in plain type.` : ''}
      Where we have no logo we can use we draw our own initials tile instead.
      Today ${LOGO_TOTAL} shops and houses carry a logo we show, ${LOGO_PUBLIC_DOMAIN}
      of them a file in the public domain that we host, ${LOGO_SUPPLIED} a file
      supplied to us that we host, and the rest loaded directly from that
      owner's own site.</p>
      <p>If you would rather we did not show yours, tell us and we will stop.
      <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h2 class="t-section">Changes and Governing Law</h2>
      <p>We may revise these terms, and the current version always sits here.
      These terms are governed by the law of England and Wales, and the courts
      of England and Wales have jurisdiction, without taking away any right you
      have as a consumer to bring a claim where you live.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'contact',
    title: 'Contact and Feedback',
    short: 'Contact',
    body: `
      <p>Seen a wrong price? Please tell us. Send the fragrance, the bottle size,
      the shop and the figure you saw on their site, and we will check it the
      same day.</p>

      <h2 class="t-section">Get in Touch</h2>
      <p>One inbox for everything: wrong prices, feedback, privacy and data
      requests, and general questions. <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h2 class="t-section">If You Run a Shop</h2>
      <p>Write to the address above if you want to be listed, corrected or
      removed, and we will come back to you.</p>

      <h2 class="t-section">Business Details</h2>
      ${businessDetails()}`,
  },
];

export function legalPage(id: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.id === id);
}
