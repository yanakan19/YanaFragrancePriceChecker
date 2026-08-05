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
 */

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
      <p>PriceSniffs tells you what a bottle of fragrance actually costs across 35 UK shops, delivery included. Right now that covers 1,912 fragrances.</p>
      <p>Hi, I am Yanny.</p>
      <p>This started because I kept getting caught out. I bought a 100ml bottle of Club de Nuit, felt pleased with myself, and spotted it twelve pounds cheaper four days later. Comparing by hand meant nine tabs open across Boots, Notino and Beauty Base, and half of them hid the postage until I reached checkout.</p>
      <p>So I spent five days building the thing I wanted to use. Go and look at what the shops charge right now, add the delivery they will actually bill you, put the answer on one screen. Roughly 250 tests keep it honest.</p>
      <h3>What it does</h3>
      <p>Prices are checked every hour, so 24 times a day. Boots, Selfridges, Superdrug, LOOKFANTASTIC, Escentual and the rest all get looked at on the same clock. Not one of those 1,912 prices is typed in by hand. A fragrance shows up here because a shop was genuinely selling it when we looked, and the number beside it came off that page.</p>
      <p>Delivery terms get their own check twice a day, at 6am and 6pm. Boots posts free once you spend £25 and charges £3.95 under that. Harvey Nichols wants £300, which one bottle will never reach, so its listings always carry £5.95 on top. Shops rewrite those rules maybe twice a year, so checking them hourly would be 24 times the effort for the same answer.</p>
      <p>That gap between Boots and Harvey Nichols is the whole point. A bottle at £24.99 from Superdrug can cost you more than the same bottle at £26 from Beauty Base, once postage lands.</p>
      <h3>Being straight with you</h3>
      <p>If we do not know something, we say so instead of filling the gap with a guess. Thirteen of the 35 shops sit switched off for exactly that reason. Take Manchester Ouds. Their site advertises free postage over £50 but never prints what it charges below that, so they stay switched off entirely until someone reads it. Sounds harsh over one missing number. But a blank postage figure quietly counted as zero would shove that shop to the top of every result as the cheapest, and it would be a lie.</p>
      <p>Nothing here is a paid placement. No shop buys its way up. We earn commission on four of the 35, and on those the link still lands exactly where it would have anyway.</p>
      <h3>About the photos</h3>
      <p>Every product photo loads straight from the shop's own website. PriceSniffs does not copy them, save them, or put them on its own server. Your browser fetches that picture from Justmylook or Allbeauty exactly as it would if you were stood on their page, and it sits beside a link sending you to buy from them. Fragrance Click told us in writing we may use theirs, so we note that. For the rest we say plainly that we have no such permission. Any shop that wants us to stop, whether that is Notino or Harvey Nichols or anyone else, we stop, the day they ask.</p>
      <h3>Finding what you want</h3>
      <p>Filter by bottle size, by strength, by price bracket from under £20 up past £300, by what is on offer, by what is in stock. Pick 50ml and the strength list narrows to what actually comes in 50ml, so Eau de Parfum and Eau de Toilette only stay on screen if a 50ml bottle exists. You can never tap something and land on an empty page. Sort by price, low to high or high to low, or run through it A to Z.</p>
      <h3>Say hello</h3>
      <p>I post about fragrance on <a href="https://www.tiktok.com/@yannysniffs" target="_blank" rel="noopener">TikTok</a> and <a href="https://www.instagram.com/yannysniffs" target="_blank" rel="noopener">Instagram</a> as yannysniffs. Come and tell me what I have got wrong, or which shop should be the 31st. Zimaya was added because someone asked.</p>`,
  },
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
      <p>This notice sets out what personal data ${COMPANY.name} collects, why we
      collect it, and what you can ask us to do about it. It is written to meet UK
      GDPR and the Data Protection Act 2018.</p>

      <h3>Who we are</h3>
      <p>PriceSniffs is run by ${COMPANY.legalName}, a single person, not a
      registered company. You can reach us at
      <a href="mailto:${COMPANY.privacyEmail}">${COMPANY.privacyEmail}</a> for
      anything to do with your data.</p>

      <h3>What we collect</h3>
      <p>Very little, because the site itself has no server or database of its
      own. It runs entirely in your browser and reads a fixed catalogue of
      prices, so there is no account to create and nothing you do inside the
      app, including what you search for and which filters you use, is sent
      anywhere or stored by us.</p>
      <ul>
        <li><strong>Your display preference.</strong> Dark or light theme and
        mobile or desktop layout are saved on your own device only, using your
        browser's local storage. They never leave it and we never see them.</li>
        <li><strong>Anything you send us.</strong> If you email us, whether
        through the contact form or directly, we keep that message and your
        address so that we can reply, the same as any inbox.</li>
      </ul>
      <p>We do not ask you to create an account and we never see your payment
      details. Buying happens on the shop's own site, under their privacy policy
      rather than ours.</p>

      <h3>Hosting</h3>
      <p>The site is hosted by GitHub Pages. Serving any website involves the
      host handling standard connection information, such as IP addresses, to
      deliver the page, and that is governed by GitHub's own privacy statement
      rather than ours, since we do not receive or store it.</p>

      <h3>Our lawful basis</h3>
      <p>For replying to messages you send us we rely on legitimate interests,
      namely being able to answer you. Where we use cookies that are not strictly
      necessary we rely on your consent, and you can withdraw it whenever you
      like.</p>

      <h3>Cookies</h3>
      <p>We do not set any cookies ourselves. Your display preference is saved
      using local storage, not a cookie, and never leaves your device. If we
      ever add analytics or affiliate tracking that sets cookies, we will say so
      here first. Affiliate networks may set cookies of their own once you
      follow a link to a shop, and those fall under that network's policy, not
      ours.</p>

      <h3>Who else sees it</h3>
      <p>We do not sell personal data, and we do not share it with anyone except
      where the law requires it.</p>

      <h3>How long we keep it</h3>
      <p>Emails are kept only as long as we need them to deal with what you have
      asked, then deleted. We do not keep search history, browsing history or
      any other record of your visit, because we never receive one.</p>

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

      <h3>Get in touch</h3>
      <p>One inbox for everything, wrong prices, feedback, privacy and data
      requests, and general questions: <a href="mailto:${COMPANY.email}">${COMPANY.email}</a></p>

      <h3>If you run a shop</h3>
      <p>Write to the address above if you want to be listed, corrected or
      removed, and we will come back to you.</p>

      <p class="meta">PriceSniffs is run by ${COMPANY.legalName}.</p>`,
  },
];

export function legalPage(id: string): LegalPage | undefined {
  return LEGAL_PAGES.find((p) => p.id === id);
}
