/**
 * Legal and company pages.
 *
 * This is a one person operation trading under the PriceSniffs name, not a
 * registered company, so there is no company number, registered office or
 * ICO registration to state. Every fact below is one that is actually true
 * today. Nothing here is filled in with a placeholder, and nothing states a
 * detail (a company number, an address, a retention period in days) that has
 * not actually been decided, because a specific sounding fact that is not
 * real is worse than a plain one that is.
 *
 * House style for every string in this file: no hyphens, no en dashes and no em
 * dashes anywhere in reader facing text. Where a compound would normally take a
 * hyphen, reword it.
 *
 * ── Why the numbers below are computed, not typed ────────────────────────────
 * Every count on the About page is derived from the registry and the built
 * catalogue at load time. They were hardcoded until 2026-08-12, and by then
 * every one of them had drifted: the page told readers the site covered "35 UK
 * shops" and "1,912 fragrances" when it was 29 enabled shops and 15,448
 * fragrances, and claimed prices were checked "every hour, so 24 times a day"
 * after the harvest schedule had moved to every two hours. A page whose whole
 * argument is that this site does not misstate things cannot itself carry
 * seven stale figures, and a number typed by hand will always drift again.
 * The test count used to be the one exception, because nothing in the browser
 * bundle can run the test suite to count it — it was hand-checked against
 * `npm test` whenever this file was touched, and it drifted anyway, reading
 * 772 against a real 1,364 on 2026-08-26, then drifting again the same
 * evening as more tests landed. It is no longer hand-written: it is imported
 * from demo/testCount.generated.ts, which scripts/testCountReporter.ts
 * rewrites as a side effect of every real `vitest run`, so the number here is
 * whatever the suite actually contained the last time anyone ran it, not
 * whatever a maintainer last remembered to type. See that reporter's own
 * header comment for the full mechanism.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { DEMO_FRAGRANCES } from './data.js';
import { TEST_COUNT } from './testCount.generated.js';

const n = (v: number) => v.toLocaleString('en-GB');

/** Shops we actually fetch from today, as opposed to entries in the registry. */
const ENABLED = RETAILERS.filter((r) => r.enabled);
/** Researched but not switched on, usually pending a delivery cost or a route. */
const SWITCHED_OFF = RETAILERS.filter((r) => !r.enabled);
/** Programmes actually approved, so a link genuinely earns commission. */
const COMMISSIONED = RETAILERS.filter((r) => r.affiliate.status === 'active');
/**
 * Enabled shops whose standard delivery cost is not established. These are
 * shown with delivery not stated and can never rank as cheapest — see
 * buildComparison. Naming them here keeps the About page's example honest
 * even as the list changes.
 */
const DELIVERY_UNSTATED = ENABLED.filter((r) => r.shipping.standardGbp === null);
/**
 * Split by how the delivery figure was obtained: read off that shop's own
 * delivery page, or sourced indirectly and never checked against it.
 *
 * This page used to quote delivery charges as settled fact, which they mostly
 * are not, and the split was invisible to a reader even though the registry has
 * always recorded it. Computed here for the same reason every other count on
 * this page is computed: a number typed by hand drifts, and this one moves
 * every time a shop is confirmed.
 */
const DELIVERY_CONFIRMED = ENABLED.filter((r) => r.shipping.confidence === 'confirmed');
const DELIVERY_UNCONFIRMED = ENABLED.filter((r) => r.shipping.confidence === 'unverified');

export const COMPANY = {
  name: 'PriceSniffs',
  legalName: 'YannySniffs',
  email: 'yannysniffs@gmail.com',
  feedbackEmail: 'yannysniffs@gmail.com',
  privacyEmail: 'yannysniffs@gmail.com',
  updated: '1 August 2026',
} as const;

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
      <h3 class="t-section">What it does</h3>
      <p>Prices are checked every three hours, so 8 times a day. Boots, Selfridges, Superdrug, LOOKFANTASTIC, Escentual and the rest all get looked at on the same clock. Not one of those ${n(DEMO_FRAGRANCES.length)} prices is typed in by hand. A fragrance shows up here because a shop was genuinely selling it when we looked, and the number beside it came off that page.</p>
      <p>Delivery terms sit on a slower clock than prices do. Shops rewrite them maybe twice a year, so checking them every three hours would be a great deal of effort for the same answer. Boots posts free once you spend £25 and charges £3.95 under that. Harvey Nichols wants £300, which one bottle will never reach, so its listings always carry £5.95 on top.</p>
      <p>That gap between Boots and Harvey Nichols is the whole point. A bottle at £24.99 from Superdrug can cost you more than the same bottle at £26 from Beauty Base, once postage lands.</p>
      <h3 class="t-section">Which delivery charges we have actually checked</h3>
      <p>Of the ${ENABLED.length} shops switched on today, ${DELIVERY_CONFIRMED.length} have had their delivery charge read off their own delivery page: ${DELIVERY_CONFIRMED.map((r) => r.name).join(', ')}. The other ${DELIVERY_UNCONFIRMED.length} carry a figure that came from research and has not yet been checked against the shop itself. Every listing from those ${DELIVERY_UNCONFIRMED.length} says so, in the same line as the charge.</p>
      <p>That matters because delivery decides the ranking. So the word cheapest is now withheld whenever the gap between first place and second is smaller than a delivery charge we have not confirmed. Those listings still appear, still in price order, and the leader is still marked. It is labelled lowest total instead, because on figures like that we do not actually know which of the two is cheaper, and saying we do would be the whole problem in one word.</p>
      <h3 class="t-section">Being straight with you</h3>
      <p>If we do not know something, we say so instead of filling the gap with a guess. ${SWITCHED_OFF.length} of the ${RETAILERS.length} shops researched so far sit switched off, most of them waiting on a delivery cost or on a way to read their listings at all. Take Manchester Ouds. Their site advertises free postage over £50 but never prints what it charges below that. They are switched on, and their listings carry the words delivery not stated instead of a made up number, which also means they can never come out cheapest however low the bottle price is. ${DELIVERY_UNSTATED.length} shops sit in that state today: ${DELIVERY_UNSTATED.map((r) => r.name).join(', ')}. Sounds fussy over one missing figure. But a blank postage cost quietly counted as zero would shove a shop to the top of every result as the cheapest, and it would be a lie.</p>
      <p>Nothing here is a paid placement. No shop buys its way up. We earn commission on ${COMMISSIONED.length} of them, and on those the link still lands exactly where it would have anyway.</p>
      <h3 class="t-section">About the photos</h3>
      <p>Every product photo loads straight from the shop's own website. PriceSniffs does not copy them, save them, or put them on its own server. Your browser fetches that picture from Justmylook or Allbeauty exactly as it would if you were stood on their page, and it sits beside a link sending you to buy from them. Fragrance Click told us in writing we may use theirs, so we note that. For the rest we say plainly that we have no such permission. Any shop that wants us to stop, whether that is Notino or Harvey Nichols or anyone else, we stop, the day they ask.</p>
      <h3 class="t-section">Finding what you want</h3>
      <p>Filter by bottle size, by strength, by price bracket from under £20 up past £300, by what is on offer, by what is in stock. Pick 50ml and the strength list narrows to what actually comes in 50ml, so Eau de Parfum and Eau de Toilette only stay on screen if a 50ml bottle exists. You can never tap something and land on an empty page. Sort by price, low to high or high to low, or run through it A to Z.</p>
      <h3 class="t-section">Say hello</h3>
      <p>I post about fragrance on <a href="https://www.tiktok.com/@yannysniffs" target="_blank" rel="noopener">TikTok</a> and <a href="https://www.instagram.com/yannysniffs" target="_blank" rel="noopener">Instagram</a> as yannysniffs. Come and tell me what I have got wrong, or which shop should be the 31st. Zimaya was added because someone asked.</p>`,
  },
  {
    id: 'how-it-works',
    title: 'How PriceSniffs works',
    short: 'How It Works',
    body: `
      <p>PriceSniffs compares fragrance prices across UK shops so you can see what a
      bottle really costs before you buy it.</p>

      <h3 class="t-section">Delivery is counted</h3>
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

      <h3 class="t-section">Reductions come from the shop</h3>
      <p>When you see a previous price and a percentage saving, that figure is the
      shop's own. We never calculate one ourselves. Percentages round down, so a
      saving of 19.6 per cent shows as 19 per cent and never as 20. A countdown
      appears only when the shop has published a closing time for the offer. We
      never invent one.</p>

      <h3 class="t-section">Membership rates are not the headline</h3>
      <p>Superdrug posts free at £20 for Health and Beautycard holders and at £25
      for everyone else, so we quote £25. The Perfume Shop, The Fragrance Shop,
      Selfridges and LOOKFANTASTIC all run schemes of their own. We mention them,
      but we never build a members only rate into the headline price, because it
      is not a price you can pay unless you have already joined.</p>

      <h3 class="t-section">Sold out stays at the bottom</h3>
      <p>Listings a shop has marked unavailable sit at the end of the results and
      can never be shown as the cheapest option, however low the price. Where we
      could not read the stock figure at all we say so rather than guess, and that
      listing drops below the ones we could confirm.</p>

      <h3 class="t-section">Position is not for sale</h3>
      <p>Results are ordered by availability and then by price. Nothing else. No
      shop can pay to appear higher, and commission never moves a listing. Read
      our <a href="#" data-page="affiliate">affiliate disclosure</a>.</p>`,
  },
  {
    id: 'affiliate',
    title: 'Affiliate disclosure',
    short: 'Affiliate Disclosure',
    body: `
      <p>PriceSniffs intends to earn commission when you buy through some of the
      links on this site. It costs you nothing and does not change the price you
      pay.</p>

      <h3 class="t-section">Where things stand today</h3>
      <p>No affiliate programme is running yet. All twelve shops we list pay us
      nothing, and every link goes straight to the shop. Boots, LOOKFANTASTIC and
      Superdrug run their programmes through Awin and we have applied to none of
      them so far. We will update this page when that changes, and links carrying
      tracking will be identifiable.</p>

      <h3 class="t-section">What commission does not touch</h3>
      <p>Commission has no bearing on the order of results, on which shops we
      include, or on the prices we show. Position is decided by stock and by
      delivered price. We will not take payment for placement inside the results.
      If we ever run a paid placement it will sit outside the results and be
      labelled as advertising.</p>

      <h3 class="t-section">Why we tell you this</h3>
      <p>UK advertising rules require affiliate relationships to be obvious before
      you click, not buried in a policy page. That is why the note also appears at
      the bottom of every screen.</p>`,
  },
  {
    id: 'privacy',
    title: 'Privacy notice',
    short: 'Privacy',
    body: `
      <p>This notice sets out what personal data ${COMPANY.name} collects, why we
      collect it, and what you can ask us to do about it. It is written to meet UK
      GDPR and the Data Protection Act 2018.</p>

      <h3 class="t-section">Who we are</h3>
      <p>PriceSniffs is run by ${COMPANY.legalName}, a single person, not a
      registered company. You can reach us at
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> for
      anything to do with your data.</p>

      <h3 class="t-section">What we collect</h3>
      <p>The site itself has no server or database of its own: it runs
      entirely in your browser and reads a fixed catalogue of prices, and
      nothing you do inside the app, including what you search for and which
      filters you use, is sent anywhere or stored by us. Creating an account
      is optional and is the one exception, described below.</p>
      <ul>
        <li><strong>Your display preference.</strong> Dark or light theme and
        mobile or desktop layout are saved on your own device only, using your
        browser's local storage. They never leave it and we never see them.</li>
        <li><strong>Anything you send us.</strong> If you email us, whether
        through the contact form or directly, we keep that message and your
        address so that we can reply, the same as any inbox.</li>
        <li><strong>If you create an account.</strong> Signing up is optional
        and takes your email address, which our account provider (Supabase,
        see below) uses to create your login and send you a verification
        email. Once verified, you can save fragrances to a wishlist, which
        stores which fragrance you saved, when, and an optional target price
        you typed in yourself — never one we set. You can use the site's price
        comparison fully without ever creating an account.</li>
      </ul>
      <p>We never see your payment details. Buying happens on the shop's own
      site, under their privacy policy rather than ours.</p>

      <h3 class="t-section">Hosting and account storage</h3>
      <p>The site is hosted by GitHub Pages. Serving any website involves the
      host handling standard connection information, such as IP addresses, to
      deliver the page, and that is governed by GitHub's own privacy statement
      rather than ours, since we do not receive or store it.</p>
      <p>If you create an account, your email address, login and wishlist are
      held by Supabase, a hosted database and authentication provider, rather
      than by us directly — we do not run a server of our own. Row-level
      security on that database means only you, signed in as yourself, can
      read or change your own account data; we cannot read your password, and
      no PriceSniffs code path ever asks for one.</p>

      <h3 class="t-section">Our lawful basis</h3>
      <p>For replying to messages you send us we rely on legitimate interests,
      namely being able to answer you. For account data — your email, login
      and wishlist — we rely on contract: creating and maintaining the account
      you asked for. Where we use cookies that are not strictly necessary we
      rely on your consent, and you can withdraw it whenever you like.</p>

      <h3 class="t-section">Cookies</h3>
      <p>We do not set any cookies ourselves. Your display preference is saved
      using local storage, not a cookie, and never leaves your device. If we
      ever add analytics or affiliate tracking that sets cookies, we will say so
      here first. Affiliate networks may set cookies of their own once you
      follow a link to a shop, and those fall under that network's policy, not
      ours.</p>

      <h3 class="t-section">Who else sees it</h3>
      <p>We do not sell personal data, and we do not share it with anyone except
      where the law requires it. If you create an account, Supabase (see
      Hosting and account storage, above) processes your account data on our
      behalf, to run the login and database this feature needs — it does not
      use it for its own purposes.</p>

      <h3 class="t-section">How long we keep it</h3>
      <p>Emails are kept only as long as we need them to deal with what you have
      asked, then deleted. We do not keep search history, browsing history or
      any other record of your visit, because we never receive one. Account
      data — your email, login and wishlist — is kept for as long as your
      account exists, and deleted when you ask us to close it.</p>

      <h3 class="t-section">Your rights</h3>
      <p>You can ask for a copy of your data, ask us to correct or delete it,
      object to what we are doing with it, ask us to restrict it, or ask for it in
      a portable format. Write to
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> and we
      will reply within one month.</p>
      <p>If you are unhappy with how we have handled your data you can complain to
      the Information Commissioner's Office at
      <a href="https://ico.org.uk" rel="noopener" target="_blank">ico.org.uk</a>
      or by calling 0303 123 1113.</p>

      <p class="meta">Last updated 18 August 2026.</p>`,
  },
  {
    id: 'terms',
    title: 'Terms of use',
    short: 'Terms',
    body: `
      <p>Using PriceSniffs means accepting these terms.</p>

      <h3 class="t-section">What PriceSniffs is</h3>
      <p>PriceSniffs is an information service. We do not sell fragrance, hold stock,
      take payments or send parcels. Any purchase is a contract between you and
      the shop, on their terms.</p>

      <h3 class="t-section">How accurate the prices are</h3>
      <p>We work hard to show accurate prices, but we collect them periodically
      and they can change at any moment. Postage costs and the order values needed
      for free delivery are modelled from the published terms of all twelve shops,
      and may not capture every promotion, Highlands surcharge or basket rule.
      <strong>Always check the price on the shop's own site before you buy.</strong>
      Every listing carries the time we last looked, down to the minute.</p>
      <p>We are not liable for losses caused by a price, postage cost or stock
      figure being wrong or out of date, except where the law does not let us
      exclude liability.</p>

      <h3 class="t-section">The shops we list</h3>
      <p>Appearing here is not an endorsement, and being absent is not a
      criticism. We list established UK shops. We do not inspect individual
      parcels and we cannot guarantee the authenticity of goods sold by anyone
      else.</p>

      <h3 class="t-section">Fair use</h3>
      <p>Please do not scrape the site, overload it, try to disrupt it, or copy
      substantial parts of it without asking us first.</p>

      <h3 class="t-section">Our content</h3>
      <p>The design, wording and data compilations belong to ${COMPANY.legalName}.
      Brand names, product names and trade marks belong to their owners and appear
      here only to identify products.</p>

      <h3 class="t-section">Product images</h3>
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

      <h3 class="t-section">Changes and governing law</h3>
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

      <h3 class="t-section">Get in touch</h3>
      <p>One inbox for everything, wrong prices, feedback, privacy and data
      requests, and general questions: <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h3 class="t-section">If you run a shop</h3>
      <p>Write to the address above if you want to be listed, corrected or
      removed, and we will come back to you.</p>

      <p class="meta">PriceSniffs is run by ${COMPANY.legalName}.</p>`,
  },
];

export function legalPage(id: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.id === id);
}
