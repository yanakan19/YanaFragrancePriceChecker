/**
 * The words of /about/how-we-check-prices.
 *
 * A lazy data file (LAZY_CONTENT_MODULES in scripts/dataFiles.ts), like the
 * guides: the build compiles this module and writes METHOD_BODY out as JSON,
 * and the page fetches it when the page is opened. Nothing in the main bundle
 * imports it, so the figures below are worked out when the site is built, from
 * the same records the rest of the site reads, and cannot drift from them:
 *   - how many shops, and how many pay commission: src/config/retailers.ts;
 *   - how long a price is shown for: HIDE_OFFER_AFTER_DAYS, src/services/offerAge.ts;
 *   - the crawler's name and user agent: src/catalogue/botIdentity.ts.
 *
 * Every claim is one the code makes true; the comment above each block says
 * where. House style as for the Legal Notice: plain British English, no
 * hyphens or dashes in what a reader sees (tests/contentPages.test.ts).
 */
import type { Block } from '../contentPages.js';
import { RETAILERS } from '../../src/config/retailers.js';
import { HIDE_OFFER_AFTER_DAYS } from '../../src/services/offerAge.js';
import { BOT_NAME, BOT_USER_AGENT } from '../../src/catalogue/botIdentity.js';
import { COVERAGE } from '../legal.js';

const ENABLED = RETAILERS.filter((r) => r.enabled);
const COMMISSIONED = ENABLED.filter((r) => r.affiliate.status === 'active');

export const METHOD_BODY: Block[] = [
  // Legal.ts, How it works: "No price is typed in by hand ... Every listing says when we last looked."
  { t: 'h', x: 'Where the Prices Come From' },
  {
    t: 'p',
    x: `Every price on PriceSniffs was read from a shop. Nobody types one in. We compare ${COVERAGE} UK shops, and we read them in two ways: from the shop’s own public product pages and sitemaps, and, for some shops, from the product feed the shop publishes through an affiliate network. A fragrance appears here because a shop was selling it when we looked, and each row on a product page says how long ago that was.`,
  },
  {
    t: 'p',
    x: 'We list established UK shops that sell to UK customers and show their prices in pounds. We leave out marketplaces where the seller can change, because no single delivery policy could be attached to their prices.',
  },

  // src/catalogue/botIdentity.ts and the /about/bot page.
  { t: 'h', x: `Who We Are When We Visit: ${BOT_NAME}` },
  {
    t: 'p',
    x: `Every request we make to a shop says who we are. Our crawler is called ${BOT_NAME}, and this is the exact line it sends: ${BOT_USER_AGENT}. It never pretends to be a web browser, and the code refuses to send a request that does.`,
  },
  {
    t: 'p',
    x: 'It reads a shop’s robots.txt before anything else and follows it, including any crawl delay the shop asks for. It makes one request at a time, at least 1.5 seconds apart, and it never logs in, fills a basket or checks out. If a shop says no, we do not look for a way round: its prices simply stop updating and, as explained below, leave the site. A shop that wants to slow us down or stop us can do so in a line of robots.txt, and the [PriceSniffsBot page](/about/bot) shows how.',
  },

  // Legal.ts, How it works: "once a day" and "Shops change their delivery terms far less often".
  { t: 'h', x: 'How Often We Check' },
  {
    t: 'p',
    x: 'We aim to read every shop’s prices again at least once a day. Each shop row on a product page shows how long ago its price was last confirmed, so you can judge for yourself. Delivery terms change far less often than prices, so those are checked less often.',
  },

  // src/services/offerAge.ts: HIDE_OFFER_AFTER_DAYS, one rule for every place a price is shown or counted.
  { t: 'h', x: `Prices Older Than ${HIDE_OFFER_AFTER_DAYS} Days Are Hidden` },
  {
    t: 'p',
    x: `If a shop’s price has not been confirmed for more than ${HIDE_OFFER_AFTER_DAYS} days, we stop showing it. That covers product pages, lists, search, deals and the Cheapest label alike. A price that old is no longer good evidence of what the shop charges today, and the likeliest reason for it is that the shop has stopped answering us. A fragrance with no price left inside that window is kept out of the lists and out of search engines until a shop confirms one again.`,
  },

  // src/services/shipping.ts, demo/app.ts offerRow, demo/offerGroups.ts.
  { t: 'h', x: 'Delivery Is Counted, and Shown' },
  {
    t: 'p',
    x: 'The price on a shop row is the price plus standard delivery to a UK mainland address, wherever the shop states that charge. The row says what was added, for example Incl. £3.95 Delivery or Free Delivery, and marks the figure as an estimate when it has not been confirmed from the shop’s own delivery page. We also work out whether the bottle takes the order over the shop’s spend for free delivery.',
  },
  {
    t: 'p',
    x: 'Some shops publish no standard delivery charge at all. Their rows are listed apart, under Delivery Not Included, with the item price only, and they can never be called Cheapest, because a blank charge counted as zero would put them at the top of every list unfairly. We do not build members only rates into a price either, since you cannot pay one unless you have already joined.',
  },

  // src/catalogue/productMatch.ts, fragranceId.ts.
  { t: 'h', x: 'How We Decide Two Listings Are One Bottle' },
  {
    t: 'p',
    x: 'A price comparison is only useful if the same bottle is compared with itself. Two listings are treated as one product in one of two ways.',
  },
  {
    t: 'ul',
    x: [
      'By barcode. When shops publish a barcode (an EAN) that passes the standard check, listings that share it are the same product. A barcode that fails the check, or that a shop prints on two different products, is ignored.',
      'By name. Otherwise the brand, the size, the strength and the words of the name must all agree. Word order does not matter, because shops write the same name in different orders.',
    ],
  },
  {
    t: 'p',
    x: 'If two listings each carry a real barcode and the barcodes differ, we never merge them, however alike they look. A barcode is the maker saying these are different articles, and that outranks our own guesswork. A listing with Tester or Unboxed in its name stays apart from the boxed bottle for the same reason.',
  },

  // src/catalogue/fragranceId.ts (sizeMl, sizeConflict), ounceSizes.ts, giftSet.ts, perfumeOil.ts.
  { t: 'h', x: 'Size Rules' },
  {
    t: 'ul',
    x: [
      'Size is part of what a product is. A 50ml bottle and a 100ml bottle of one scent are different products and are never merged, so you never compare the price of two different amounts.',
      'Sizes are read from the shop’s title or product page. A title that gives ounces only is turned into the size of the bottle that is really sold, where another source confirms it.',
      'A title that states two sizes and disagrees with itself is left without a size rather than guessed, and a listing with no size is never matched to one that has.',
      'Gift sets are compared only with the same set at other shops, and oils only with the same oil, never with a spray or a single bottle.',
    ],
  },

  // The reductions paragraph of How it works.
  { t: 'h', x: 'Reductions Come From the Shop' },
  {
    t: 'p',
    x: 'A previous price and a percentage saving are the shop’s own figures. We never work one out ourselves, and a countdown appears only when the shop has published a closing time for the offer.',
  },

  // Affiliate disclosure: ENABLED, COMMISSIONED, order of results.
  { t: 'h', x: 'How Affiliate Links Earn Money' },
  {
    t: 'p',
    x: `PriceSniffs earns a small commission when you buy after clicking through from here to ${COMMISSIONED.length} of the ${ENABLED.length} shops listed today. It does not cost you anything and it does not change the price. The price we show is the price the shop shows, and we do not add to it or take from it. The shop pays the commission, not you.`,
  },
  {
    t: 'p',
    x: 'Commission never decides the order of results. Results are ordered by stock and then by price, and nothing else. No shop can pay for a better place. A link to a shop that pays us is marked Affiliate Link on its row before you click, and is tagged as sponsored for search engines. Links to the other shops carry no tracking and earn us nothing. The full wording is in the [Legal Notice](/about/legal#affiliate).',
  },

  { t: 'h', x: 'What We Cannot Promise' },
  {
    t: 'ul',
    x: [
      'A shop can change a price between our last look and your click. Check the basket before you pay.',
      'We cannot guarantee the authenticity of what a shop sells. Our [guide to fake and grey market perfume](/guides/spot-fake-or-grey-market-perfume) explains what to look for.',
      'A match can occasionally be wrong. If a price or a product looks wrong, use Spotted a Wrong Price on the product page, or the Contact Us form on the [About page](/about), and we will look at it.',
    ],
  },
];
