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
 *     for what the site actually collects, which as of 2026-09-06 includes
 *     the Virtual Yanny chat (messages leave the browser) and optional
 *     accounts (Supabase). Earlier versions said nothing left the browser;
 *     that stopped being true on 2026-08-13 when the chat backend went live.
 *   - PECR regulation 6 (cookies and similar storage): the cookies page lists
 *     every key this site writes, and none is written without an action of
 *     the reader's that asks for it, so no consent banner is shown — there is
 *     nothing it would be consenting to.
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
 * and a number typed by hand will always drift again. The test count is
 * imported from demo/testCount.generated.ts for the same reason — see
 * scripts/testCountReporter.ts.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { DEMO_FRAGRANCES } from './data.js';
import { TEST_COUNT } from './testCount.generated.js';

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
/** Researched but not switched on, usually pending a delivery cost or a route. */
const SWITCHED_OFF = RETAILERS.filter((r) => !r.enabled);
/** Programmes actually approved, so a link genuinely earns commission. */
const COMMISSIONED = RETAILERS.filter((r) => r.affiliate.status === 'active');
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
const DELIVERY_CONFIRMED = ENABLED.filter((r) => r.shipping.confidence === 'confirmed');
const DELIVERY_UNCONFIRMED = ENABLED.filter((r) => r.shipping.confidence === 'unverified');
/** Shops whose photographs are shown on a stated licence or their own storefront, versus a bare hotlink. */
const IMAGE_SHOPS = RETAILERS.filter((r) => r.affiliate.imageBasis != null);
const IMAGE_LICENSED = IMAGE_SHOPS.filter((r) => r.affiliate.imageBasis !== 'hotlink-unlicensed');
const IMAGE_HOTLINKED = IMAGE_SHOPS.filter((r) => r.affiliate.imageBasis === 'hotlink-unlicensed');

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
  /** Where the site is served from, and who runs the chat backend and accounts. */
  hosting: 'GitHub Pages',
  chatHost: 'Cloudflare',
  chatProvider: 'Groq or Google',
  accountsProvider: 'Supabase',
  updated: '6 September 2026',
} as const;

/** Storage this site writes in the reader's browser, listed on the cookies page. */
export const STORAGE_KEYS = [
  { key: 'pricesniffs.display', kind: 'local storage', when: 'when you choose dark, light or system in Settings', holds: 'that choice' },
  { key: 'pricesniffs.layout', kind: 'local storage', when: 'when you choose the mobile or desktop layout in Settings', holds: 'that choice' },
  { key: 'pricesniffs.perrow', kind: 'local storage', when: 'when you change how many tiles show per row', holds: 'that number' },
  { key: 'pricesniffs.yanny.thread', kind: 'session storage', when: 'when you send a message to Virtual Yanny', holds: 'the conversation shown in the chat window, so it survives moving between pages, and is gone when the tab closes' },
  { key: 'a key beginning sb', kind: 'local storage', when: 'when you sign in to an account', holds: 'your sign in token, written by the Supabase library so you stay signed in' },
] as const;

/** A definition list of the business details, with an honest line for each absent one. */
function businessDetails(): string {
  const row = (term: string, value: string) => `<div class="biz-row"><dt>${term}</dt><dd>${value}</dd></div>`;
  return `<dl class="biz-details">
    ${row('Site', COMPANY.name)}
    ${row('Run by', COMPANY.operator ? `${COMPANY.operator}, trading as ${COMPANY.legalName}` : `one person, trading as ${COMPANY.legalName}. A personal name has not yet been published on this site; it will be supplied on request by email.`)}
    ${row('Email', `<a href="mailto:${COMPANY.email}">${COMPANY.email}</a>`)}
    ${row('Postal address', COMPANY.postalAddress ?? 'not yet published on this site. UK service provider rules ask for one, and it will be supplied on request by email and published here once settled.')}
    ${row('Company number', 'none. This is not a registered company.')}
    ${row('VAT number', 'none. Not VAT registered.')}
    ${row('ICO registration', COMPANY.icoRegistration ?? 'no registration number is published here. Whether one is required is being checked against the ICO self assessment; see the privacy notice for what is actually processed.')}
  </dl>`;
}

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
    body: `
      <p>PriceSniffs tells you what a bottle of fragrance actually costs across ${ENABLED.length} UK shops, delivery included. Right now that covers ${n(DEMO_FRAGRANCES.length)} fragrances.</p>
      <p>Hi, I am Yanny.</p>
      <p>This started because I kept getting caught out. I bought a 100ml bottle of Club de Nuit, felt pleased with myself, and spotted it twelve pounds cheaper four days later. Comparing by hand meant nine tabs open across Boots, Notino and Beauty Base, and half of them hid the postage until I reached checkout.</p>
      <p>So I spent five days building the thing I wanted to use. Go and look at what the shops charge right now, add the delivery they will actually bill you, put the answer on one screen. ${TEST_COUNT} tests keep it honest.</p>
      <h2 class="t-section">What it does</h2>
      <p>Prices are checked every three hours, so 8 times a day. Boots, Selfridges, Superdrug, LOOKFANTASTIC, Escentual and the rest all get looked at on the same clock. Not one of those ${n(DEMO_FRAGRANCES.length)} prices is typed in by hand. A fragrance shows up here because a shop was genuinely selling it when we looked, and the number beside it came off that page.</p>
      <p>Delivery terms sit on a slower clock than prices do. Shops rewrite them maybe twice a year, so checking them every three hours would be a great deal of effort for the same answer. Boots posts free once you spend £25 and charges £3.95 under that. Harvey Nichols wants £300, which one bottle will never reach, so its listings always carry £5.95 on top.</p>
      <p>That gap between Boots and Harvey Nichols is the whole point. A bottle at £24.99 from Superdrug can cost you more than the same bottle at £26 from Beauty Base, once postage lands.</p>
      <h2 class="t-section">Which delivery charges we have actually checked</h2>
      <p>Of the ${ENABLED.length} shops switched on today, ${DELIVERY_CONFIRMED.length} have had their delivery charge read off their own delivery page: ${DELIVERY_CONFIRMED.map((r) => r.name).join(', ')}. The other ${DELIVERY_UNCONFIRMED.length} carry a figure that came from research and has not yet been checked against the shop itself. Every listing from those ${DELIVERY_UNCONFIRMED.length} says so, in the same line as the charge.</p>
      <p>That matters because delivery decides the ranking. So the word cheapest is now withheld whenever the gap between first place and second is smaller than a delivery charge we have not confirmed. Those listings still appear, still in price order, and the leader is still marked. It is labelled lowest total instead, because on figures like that we do not actually know which of the two is cheaper, and saying we do would be the whole problem in one word.</p>
      <h2 class="t-section">Being straight with you</h2>
      <p>If we do not know something, we say so instead of filling the gap with a guess. ${SWITCHED_OFF.length} of the ${RETAILERS.length} shops researched so far sit switched off, most of them waiting on a delivery cost or on a way to read their listings at all. Take Manchester Ouds. Their site advertises free postage over £50 but never prints what it charges below that. They are switched on, and their listings carry the words delivery not stated instead of a made up number, which also means they can never come out cheapest however low the bottle price is. ${DELIVERY_UNSTATED.length} shops sit in that state today: ${DELIVERY_UNSTATED.map((r) => r.name).join(', ')}. Sounds fussy over one missing figure. But a blank postage cost quietly counted as zero would shove a shop to the top of every result as the cheapest, and it would be a lie.</p>
      <p>Nothing here is a paid placement. No shop buys its way up. We earn commission on ${COMMISSIONED.length} of them, and on those the link still lands exactly where it would have anyway. Those links are marked, and our <a href="#" data-page="affiliate">affiliate disclosure</a> names the shops.</p>
      <h2 class="t-section">About the photos</h2>
      <p>Every product photo loads straight from the shop's own website. PriceSniffs does not copy them, save them, or put them on its own server. Your browser fetches that picture from Justmylook or Allbeauty exactly as it would if you were stood on their page, and it sits beside a link sending you to buy from them. Fragrance Click told us in writing we may use theirs, so we note that. For the rest we say plainly that we have no such permission. Any shop that wants us to stop, whether that is Notino or Harvey Nichols or anyone else, we stop, the day they ask.</p>
      <h2 class="t-section">Finding what you want</h2>
      <p>Filter by bottle size, by strength, by price bracket from under £20 up past £300, by what is on offer, by what is in stock. Pick 50ml and the strength list narrows to what actually comes in 50ml, so Eau de Parfum and Eau de Toilette only stay on screen if a 50ml bottle exists. You can never tap something and land on an empty page. Sort by price, low to high or high to low, or run through it A to Z.</p>
      <h2 class="t-section">Say hello</h2>
      <p>I post about fragrance on <a href="https://www.tiktok.com/@yannysniffs" target="_blank" rel="noopener">TikTok</a> and <a href="https://www.instagram.com/yannysniffs" target="_blank" rel="noopener">Instagram</a> as yannysniffs. Come and tell me what I have got wrong, or which shop should be the ${ordinal(ENABLED.length + 1)}. Zimaya was added because someone asked.</p>`,
  },
  {
    id: 'how-it-works',
    title: 'How PriceSniffs works',
    short: 'How It Works',
    body: `
      <p>PriceSniffs compares fragrance prices across UK shops so you can see what a
      bottle really costs before you buy it.</p>

      <h2 class="t-section">Delivery is counted</h2>
      <p>Every price includes standard delivery to a UK mainland address, and we
      work out whether your order is large enough to qualify for free postage.
      Boots posts free once you spend £25 and charges £3.95 below that. Harvey
      Nichols wants £300, which one bottle will never reach, so its listings
      always carry £5.95 on top. That is why a bottle priced at £24.99 can cost
      you more than one priced at £26.</p>
      <p>Not every one of those charges has been read off the shop's own
      delivery page. ${DELIVERY_CONFIRMED.length} of the ${ENABLED.length} shops
      we fetch from have been; the remaining ${DELIVERY_UNCONFIRMED.length} carry
      a researched figure instead, and every listing of theirs is marked not
      confirmed with the shop. Where the difference between the top two prices is
      smaller than one of those unconfirmed charges, we do not call either of
      them the cheapest, because we would be guessing at which one is.</p>

      <h2 class="t-section">Reductions come from the shop</h2>
      <p>When you see a previous price and a percentage saving, that figure is the
      shop's own. We never calculate one ourselves. Percentages round down, so a
      saving of 19.6 per cent shows as 19 per cent and never as 20. A countdown
      appears only when the shop has published a closing time for the offer. We
      never invent one.</p>

      <h2 class="t-section">Membership rates are not the headline</h2>
      <p>Superdrug posts free at £20 for Health and Beautycard holders and at £25
      for everyone else, so we quote £25. The Perfume Shop, The Fragrance Shop,
      Selfridges and LOOKFANTASTIC all run schemes of their own. We mention them,
      but we never build a members only rate into the headline price, because it
      is not a price you can pay unless you have already joined.</p>

      <h2 class="t-section">Sold out stays at the bottom</h2>
      <p>Listings a shop has marked unavailable sit at the end of the results and
      can never be shown as the cheapest option, however low the price. Where we
      could not read the stock figure at all we say so rather than guess, and that
      listing drops below the ones we could confirm.</p>

      <h2 class="t-section">Ratings are the shop's own</h2>
      <p>Where a star rating appears beside a shop's price, it is the rating that
      shop publishes on its own product page, read from there and shown as is. We
      do not write reviews, collect them, or combine one shop's rating with
      another's. Where a shop publishes none, none is shown.</p>

      <h2 class="t-section">Position is not for sale</h2>
      <p>Results are ordered by availability and then by price. Nothing else. No
      shop can pay to appear higher, and commission never moves a listing. Read
      our <a href="#" data-page="affiliate">affiliate disclosure</a>.</p>`,
  },
  {
    id: 'affiliate',
    title: 'Affiliate disclosure',
    short: 'Affiliate Disclosure',
    body: `
      <p>PriceSniffs earns commission when you buy through some of the links on
      this site. It costs you nothing and does not change the price you pay.</p>

      <h2 class="t-section">Which links earn commission</h2>
      <p>${COMMISSIONED.length} of the ${ENABLED.length} shops listed today pay
      us commission on a purchase made after clicking through from here:
      ${COMMISSIONED.map((r) => r.name).join(', ')}. Those programmes run through
      ${NETWORKS.join(' and ')}. Every link to one of those shops is marked
      <span class="tag affiliate">Affiliate link</span> beside the shop's name,
      on the page, before you click, and is also flagged to search engines as
      sponsored. Links to every other shop carry no tracking and earn nothing.</p>
      <p>This list is generated from the same registry that decides which shops
      appear at all, so it changes the moment a programme is approved or
      withdrawn rather than whenever someone remembers to update this page.</p>

      <h2 class="t-section">What happens when you click</h2>
      <p>A commissioned link takes you to the shop by way of the affiliate
      network, which records that you came from PriceSniffs so that a purchase
      can be matched to us. The network may set a cookie on its own or the
      shop's site to do that; those cookies are the network's and the shop's,
      governed by their policies, and PriceSniffs never sees them. Nothing is
      set on this site. See our <a href="#" data-page="cookies">cookies page</a>.</p>

      <h2 class="t-section">What commission does not touch</h2>
      <p>Commission has no bearing on the order of results, on which shops we
      include, or on the prices we show. Position is decided by stock and by
      delivered price. We will not take payment for placement inside the results.
      If we ever run a paid placement it will sit outside the results and be
      labelled as advertising.</p>

      <h2 class="t-section">Why we tell you this</h2>
      <p>UK advertising rules, the CAP Code administered by the Advertising
      Standards Authority, require affiliate relationships to be obvious before
      you click, not buried in a policy page. That is why the marker sits on the
      link itself and a note also appears at the bottom of every screen.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'privacy',
    title: 'Privacy notice',
    short: 'Privacy',
    body: `
      <p>This notice sets out what personal data ${COMPANY.name} collects, why we
      collect it, who processes it for us, and what you can ask us to do about
      it. It is written to meet UK GDPR and the Data Protection Act 2018.</p>

      <h2 class="t-section">Who we are</h2>
      <p>PriceSniffs is run by ${COMPANY.operator ? `${COMPANY.operator}, one person` : 'one person'} trading as ${COMPANY.legalName}, not a
      registered company. You can reach us at
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> for
      anything to do with your data. Our full business details are on the
      <a href="#" data-page="terms">terms page</a>.</p>

      <h2 class="t-section">The short version</h2>
      <p>Browsing, searching and filtering happen entirely in your browser
      against a fixed catalogue, and none of it is sent to us or stored by us.
      Three things do leave your browser, each only when you choose to use it:
      messages you type to Virtual Yanny, the details you give when you create
      an account, and anything you email us. Nothing on this site tracks you,
      profiles you or shows you advertising.</p>

      <h2 class="t-section">What we collect, and why</h2>
      <ul>
        <li><strong>Your display preferences.</strong> Dark or light theme,
        mobile or desktop layout and tiles per row are saved on your own device
        only, using your browser's local storage. They never leave it and we
        never see them. Listed in full on the <a href="#" data-page="cookies">cookies page</a>.</li>
        <li><strong>Virtual Yanny, the chat.</strong> Questions about prices,
        stock, sizes, notes, delivery, deals and budgets are answered inside
        your browser from the catalogue the page already holds; nothing you
        type for those leaves your device. An open question, such as a
        request for something that smells a certain way, is sent with the
        catalogue extract it needs to our chat service, which runs on
        ${COMPANY.chatHost}, and from there to an AI provider,
        ${COMPANY.chatProvider}, which writes the answer. Our chat service does
        not store your messages and keeps no record of the conversation; the
        copy you see is held in your browser's session storage and is gone
        when the tab closes, or the moment you press Clear. The AI provider
        handles what it receives under its own terms, and we cannot control
        that, so please do not type personal details, yours or anyone else's,
        into the chat. Nothing is sent until you press send.</li>
        <li><strong>Anything you send us.</strong> If you email us, whether
        through the contact form or directly, we keep that message and your
        address so that we can reply, the same as any inbox. The forms on this
        site open your own email app; nothing is submitted to a server of ours.</li>
        <li><strong>If you create an account.</strong> Signing up is optional
        and takes your email address and a password, which our account
        provider, ${COMPANY.accountsProvider}, uses to create your login and
        send you a verification email. Once verified, you can save fragrances
        to a wishlist, which stores which fragrance you saved, when, and an
        optional target price you typed in yourself, never one we set. You can
        use the price comparison fully without ever creating an account.</li>
        <li><strong>Trustpilot reviews.</strong> On a shop's page you may see
        a button offering that shop's Trustpilot rating. Nothing loads from
        Trustpilot until you press it; when you do, your browser fetches their
        widget from their servers under Trustpilot's own privacy policy.</li>
      </ul>
      <p>We never see your payment details. Buying happens on the shop's own
      site, under their privacy policy rather than ours.</p>

      <h2 class="t-section">Who processes it for us</h2>
      <ul>
        <li><strong>${COMPANY.hosting}</strong> serves the site. Serving any
        website involves the host handling standard connection information,
        such as IP addresses, to deliver the page. That is governed by GitHub's
        own privacy statement; we do not receive or store it.</li>
        <li><strong>${COMPANY.chatHost}</strong> hosts the chat service, and
        <strong>${COMPANY.chatProvider}</strong> writes the answers to open
        chat questions, as described above. Catalogue questions never reach
        either.</li>
        <li><strong>${COMPANY.accountsProvider}</strong> holds account data,
        your email, login and wishlist, if you create an account. We do not run
        a server of our own. Row level security on that database means only
        you, signed in as yourself, can read or change your own account data;
        we cannot read your password, and no PriceSniffs code path ever asks
        for one.</li>
        <li><strong>Affiliate networks</strong> receive nothing from this site.
        Once you click a commissioned link, the network records that you came
        from here on its own or the shop's site. See the
        <a href="#" data-page="affiliate">affiliate disclosure</a>.</li>
      </ul>
      <p>We do not sell personal data, and we do not share it with anyone else
      except where the law requires it.</p>

      <h2 class="t-section">Our lawful basis</h2>
      <p>For replying to messages you send us we rely on legitimate interests,
      namely being able to answer you. For the chat we rely on legitimate
      interests too, namely answering the question you chose to ask; you are in
      control of whether to send anything at all. For account data, your email,
      login and wishlist, we rely on contract: creating and maintaining the
      account you asked for. Where anything not strictly necessary would be
      stored in your browser we rely on your consent, given by the action that
      asks for it, and you can withdraw it whenever you like by clearing it.</p>

      <h2 class="t-section">Cookies and storage</h2>
      <p>We set no cookies. What we do store in your browser, and when, is listed
      key by key on the <a href="#" data-page="cookies">cookies page</a>.</p>

      <h2 class="t-section">How long we keep it</h2>
      <p>Emails are kept only as long as we need them to deal with what you have
      asked, then deleted. Chat messages are not kept by us at all. We do not
      keep search history, browsing history or any other record of your visit,
      because we never receive one. Account data is kept for as long as your
      account exists, and deleted when you ask us to close it.</p>

      <h2 class="t-section">Your rights</h2>
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
    title: 'Cookies and storage',
    short: 'Cookies',
    body: `
      <p>PriceSniffs sets no cookies. This page lists everything the site does
      store in your browser, exactly when it is written, and what third parties
      may set once you leave this site or ask for their content.</p>

      <h2 class="t-section">Why there is no cookie banner</h2>
      <p>UK rules, the Privacy and Electronic Communications Regulations, require
      consent before storing anything on your device that is not strictly
      necessary for a service you have asked for. Nothing below is written until
      you take the action that needs it: choosing a theme, sending a chat
      message, signing in. There is no analytics, no advertising and no tracking
      of any kind, so there is nothing a banner would be asking you to accept.
      If that ever changes, consent will be asked for before anything is set,
      not after.</p>

      <h2 class="t-section">What this site stores, key by key</h2>
      <dl class="biz-details">
        ${STORAGE_KEYS.map(
          (s) => `<div class="biz-row"><dt><code>${s.key}</code></dt><dd>${s.kind}, written ${s.when}. Holds ${s.holds}.</dd></div>`,
        ).join('')}
      </dl>
      <p>Local storage stays until you clear it. Session storage is discarded
      when the tab closes. None of it is readable by us or by anyone else; it
      lives in your browser and is read back only by this site on your device.</p>

      <h2 class="t-section">Third parties</h2>
      <ul>
        <li><strong>Trustpilot.</strong> A shop's page may offer a button to
        show that shop's Trustpilot rating. Nothing is fetched from Trustpilot
        until you press it. When you do, their widget loads from their servers
        and may set cookies of its own, under Trustpilot's policy.</li>
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
        referrer with it.</li>
      </ul>

      <h2 class="t-section">Clearing it</h2>
      <p>Signing out removes the sign in token. Pressing Clear in the chat
      removes the conversation. Everything else is cleared from your browser's
      own settings, under site data for pricesniffs.space, and the site keeps
      working without any of it.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'refunds',
    title: 'Refunds and returns',
    short: 'Refunds',
    body: `
      <p>PriceSniffs does not sell anything, so there is nothing to refund or
      return here. Every purchase you make after clicking through is a contract
      between you and that shop, on that shop's terms, and it is the shop that
      takes your money, sends the parcel and handles any refund.</p>

      <h2 class="t-section">Where your rights actually lie</h2>
      <p>Your rights are against the seller and they come from UK consumer law,
      not from us. For most goods bought online from a UK business you can
      cancel within fourteen days of receiving them without giving a reason,
      under the Consumer Contracts Regulations 2013. That right can be lost for
      sealed goods that are unsealed after delivery for hygiene reasons, which a
      shop may apply to an opened fragrance, so check the shop's own returns
      policy before you open a bottle you may want to send back. Goods that are
      faulty, not as described or not fit for purpose are covered separately by
      the Consumer Rights Act 2015, which gives you a right to a refund, repair
      or replacement from the seller.</p>
      <p>Independent guidance on all of this is available from
      <a href="https://www.citizensadvice.org.uk" rel="noopener" target="_blank">Citizens Advice</a>.
      This page is a plain summary, not legal advice.</p>

      <h2 class="t-section">What we can and cannot do</h2>
      <p>We cannot process, arrange or chase a refund, because we are not party
      to the sale and never hold your money. What we can do is fix our side: if
      a price, delivery charge or stock figure shown here was wrong, tell us the
      fragrance, the bottle size, the shop and the figure you saw, and we will
      check it the same day. <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h2 class="t-section">Prices can move</h2>
      <p>Prices are collected every few hours and can change between our check
      and your visit to the shop. Every listing shows when we last looked. The
      price you pay is the one on the shop's site at checkout, which is why we
      say on every page to check it there before you buy.</p>

      <p class="meta">Last updated ${COMPANY.updated}.</p>`,
  },
  {
    id: 'terms',
    title: 'Terms of use',
    short: 'Terms',
    body: `
      <p>Using PriceSniffs means accepting these terms.</p>

      <h2 class="t-section">Who runs this site</h2>
      ${businessDetails()}

      <h2 class="t-section">What PriceSniffs is</h2>
      <p>PriceSniffs is an information service. We do not sell fragrance, hold stock,
      take payments or send parcels. Any purchase is a contract between you and
      the shop, on their terms. See our
      <a href="#" data-page="refunds">refunds and returns page</a> for where
      your rights as a buyer actually lie.</p>

      <h2 class="t-section">How accurate the prices are</h2>
      <p>We work hard to show accurate prices, but we collect them periodically
      and they can change at any moment. Postage costs and the order values needed
      for free delivery are modelled from the published terms of the
      ${ENABLED.length} shops we fetch from, and may not capture every promotion,
      Highlands surcharge or basket rule.
      <strong>Always check the price on the shop's own site before you buy.</strong>
      Every listing carries the time we last looked, down to the minute.</p>
      <p>We are not liable for losses caused by a price, postage cost or stock
      figure being wrong or out of date, except where the law does not let us
      exclude liability. Nothing in these terms limits your statutory rights
      as a consumer.</p>

      <h2 class="t-section">Virtual Yanny</h2>
      <p>The chat answers from this site's own data and can still be wrong. It
      is not advice of any kind, and a price it quotes is only ever the price a
      listing on this site showed at the time. Check the listing, and then the
      shop, before relying on anything it says.</p>

      <h2 class="t-section">The shops we list</h2>
      <p>Appearing here is not an endorsement, and being absent is not a
      criticism. We list established UK shops. We do not inspect individual
      parcels and we cannot guarantee the authenticity of goods sold by anyone
      else.</p>

      <h2 class="t-section">Fair use</h2>
      <p>Please do not scrape the site, overload it, try to disrupt it, or copy
      substantial parts of it without asking us first.</p>

      <h2 class="t-section">Our content</h2>
      <p>The design, wording and data compilations belong to ${COMPANY.legalName}.
      Brand names, product names and trade marks belong to their owners and appear
      here only to identify products.</p>

      <h2 class="t-section">Product images</h2>
      <p>Every product image here is the retailer's or the brand's own
      photograph, loaded by your browser directly from their own servers. We do
      not copy, host, crop, recolour or otherwise alter any of them, and each
      one sits beside a link to buy that product from the shop it came from.</p>
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

      <h2 class="t-section">Changes and governing law</h2>
      <p>We may revise these terms, and the current version always sits here.
      These terms are governed by the law of England and Wales, and the courts
      of England and Wales have jurisdiction, without taking away any right you
      have as a consumer to bring a claim where you live.</p>

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

      <h2 class="t-section">Get in touch</h2>
      <p>One inbox for everything, wrong prices, feedback, privacy and data
      requests, and general questions: <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h2 class="t-section">If you run a shop</h2>
      <p>Write to the address above if you want to be listed, corrected or
      removed, and we will come back to you.</p>

      <h2 class="t-section">Business details</h2>
      ${businessDetails()}`,
  },
];

export function legalPage(id: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.id === id);
}
