/**
 * What each route says about itself in <head>.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Every route used to ship the same four lines: one title, one description,
 * and — the costly one — `<link rel="canonical" href="https://pricesniffs.space/">`
 * hardcoded in scripts/build-demo.ts. A canonical tag is not a hint, it is an
 * instruction: it tells a search engine "the page you asked for is a
 * duplicate, index this other one instead". Every fragrance page on the site
 * was pointing at the homepage, so the honest reading is that none of them
 * were eligible to be indexed on their own terms. The catalogue is the whole
 * product and it was asking not to be found.
 *
 * ── What this can and cannot fix ──────────────────────────────────────────
 * The site is one static document. GitHub Pages serves demo/404.html for
 * every in-app path, and that file is byte-identical to demo/index.html, so
 * the HTML a crawler receives for /fragrance/ean-123 is the same HTML it
 * receives for /. There is no server to render a per-route <head>.
 *
 * So these tags are applied by the browser, from applyHead() below, on every
 * render. That is enough for search engines that execute JavaScript before
 * indexing, which is the traffic this is for.
 *
 * It is NOT enough for social link scrapers. Facebook's, Twitter's, Slack's
 * and WhatsApp's card fetchers read the raw HTML and never run the script, so
 * a shared link to any page will show the site-level og:title and og:image
 * baked in at build time, whatever this module computes at runtime. Fixing
 * that needs prerendered HTML per route, which needs the bundle to stop being
 * inlined — a build change, deliberately not made here. The build-time tags
 * stay accurate as a site-level fallback rather than being removed, because a
 * shared link showing the site's real name and description is a good outcome;
 * it is only the per-page precision that is missing.
 *
 * Stated plainly so nobody later reads "per-route Open Graph" in a commit
 * message and believes shared links are per-page. They are not, yet.
 *
 * ── Why there is no DOM in this file ──────────────────────────────────────
 * Writing the tags into the document lives in demo/app.ts (applyHead). This
 * module computes and returns them and touches nothing, so tests/head.test.ts
 * can run it under Node with no DOM at all — which is what lets the sitemap
 * be checked against the noindex rules in the same test run.
 */
import { productPath, type Route } from './router.js';
import { ADS_ON } from './ads.js';

/** One source of truth for the origin. scripts/build-demo.ts imports this. */
export const SITE_URL = 'https://pricesniffs.space';

export interface HeadTags {
  title: string;
  description: string;
  canonical: string;
  /** True when the route should not be indexed at all. */
  noindex: boolean;
}

/**
 * Facts a route needs to describe itself, resolved by the caller.
 *
 * Passed in rather than read from app state so this module stays pure and
 * testable: given the same input it returns the same tags, with no DOM and no
 * catalogue import.
 */
export interface HeadInput {
  route: Route;
  /** The leaf's display name: "Dior Sauvage", "Boots", "Vanilla". */
  leafName?: string | undefined;
  /** A short, already-true phrase about the leaf. Never invented by this module. */
  leafDetail?: string | undefined;
  productCount?: number | undefined;
  retailerCount?: number | undefined;
  /**
   * True when the leaf has nothing to show: a shop none of whose prices is
   * recent enough to display (HIDE_OFFER_AFTER_DAYS), or a fragrance with no
   * current price anywhere. Such a page is kept off search engines rather than
   * indexed as a thin page; it is also left out of the sitemap and the Shops
   * list.
   */
  leafEmpty?: boolean | undefined;
  /**
   * True while the address bar still holds the old /fragrance/<id> address of a
   * product, before the page rewrites it to the product's own address
   * (docs/PRODUCT-URLS.md). The canonical is the new address either way; this
   * keeps the old one out of search engines for the moment it is showing.
   */
  legacyAddress?: boolean | undefined;
}

/** Search engines cut the title around here; longer is wasted, not harmful. */
const TITLE_MAX = 60;

/**
 * ── Why the fixed-route titles name the page rather than describe it ───────
 *
 * They used to describe: /deals was "PriceSniffs: fragrance price drops
 * today", /retailers was "PriceSniffs: UK fragrance shops we compare". The
 * owner's objection, with a screenshot, was that a browser tab then reads
 * "PriceSniffs: fragrance price drops t…" while the page it belongs to is
 * headed "Today's Deals" — the tab and the page disagree about what the page
 * is called, and the tab is the one that gets truncated.
 *
 * A tab title is read at a glance, in a strip a few characters wide, next to
 * a dozen other tabs. It is a label, not a summary. So each of these now
 * matches the heading the page actually shows — "Deals", "Brands",
 * "Retailers", "Notes" — taken from the same words demo/app.ts renders in its
 * own `t-page` heading and top-bar nav.
 *
 * The tradeoff is real and worth stating rather than pretending away: the old
 * titles carried keywords ("UK fragrance shops", "price drops") that a short
 * label does not, and <title> is a genuine ranking signal. The keywords have
 * not been deleted, they have moved to `description`, which is where a longer
 * phrase can be read in full instead of being cut at 60 characters. If search
 * traffic to these five fixed routes measurably falls, this is the change to
 * look at first.
 *
 * Entity routes (a fragrance, a brand, a shop, a note) are untouched: their
 * titles were already the thing's own name, which is already what their
 * heading says.
 */
/** The window search engines usually render in full. */
const DESC_MIN = 140;
const DESC_MAX = 160;

/**
 * Trim to a length without cutting a word in half, and without leaving a
 * dangling comma or hyphen where the cut landed.
 */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–]+$/, '');
  return kept;
}

/**
 * Pad a description toward the readable window with a true sentence, never
 * with filler. Every clause added here is a fact about this site that holds
 * on every page, so nothing is invented to hit a character count. If the
 * result is still short, it ships short: a true 90-character description
 * beats a padded 150-character one.
 */
function describe(core: string, tail: string): string {
  if (core.length >= DESC_MIN) return clamp(core, DESC_MAX);
  const joined = `${core} ${tail}`;
  return clamp(joined, DESC_MAX);
}

/**
 * How the site states its coverage to shoppers: "more than 30", rounded down
 * to the ten below the number of shops that actually show prices. The owner
 * chose a rounded figure on 2026-10-02 so the claim stays true as shops come
 * and go.
 */
export const shopsPhrase = (count: number): string =>
  count > 10 ? `more than ${Math.floor((count - 1) / 10) * 10}` : String(count);

const SITE_TAIL = 'Real prices read from the shops themselves, checked daily.';

export function headFor(input: HeadInput): HeadTags {
  const { route, leafName, leafDetail, productCount, retailerCount, leafEmpty, legacyAddress } = input;
  // Query strings are filter state, not separate documents: /brands?tier=niche
  // and /brands are the same page in a different mood, and giving them
  // different canonicals would split one page's standing across many URLs.
  const canonical = `${SITE_URL}${pathOf(route)}`;

  const products = productCount ? productCount.toLocaleString('en-GB') : null;
  const shops = retailerCount ? shopsPhrase(retailerCount) : null;

  switch (route.name) {
    case 'home':
      return {
        // The owner's own instruction: the tab should say the brand name and
        // nothing else here. Every other route earns a "PriceSniffs: " prefix
        // plus a page-specific part; home is just the part before the colon.
        title: 'PriceSniffs',
        description: describe(
          products && shops
            ? `Compare ${products} fragrances across ${shops} UK shops, sorted by the price you actually pay including delivery.`
            : 'Compare fragrance prices across UK shops, sorted by the price you actually pay including delivery.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'fragrance':
    case 'product':
      return {
        title: clamp(
          leafName ? `PriceSniffs: ${leafName} price comparison` : 'PriceSniffs: fragrance price comparison',
          TITLE_MAX,
        ),
        description: describe(
          leafName
            ? `${leafName}: ${leafDetail ?? 'every UK shop we track that stocks it, with delivery included in the price shown'}.`
            : 'Every UK shop we track that stocks this fragrance, with delivery included in the price shown.',
          SITE_TAIL,
        ),
        canonical,
        // A product with no current prices keeps its page but is a thin one:
        // no shop has a price for it, so it is kept off search engines and
        // out of the sitemap, like a shop with nothing to show.
        noindex: leafEmpty === true || legacyAddress === true,
      };

    case 'brand':
      return {
        title: clamp(
          leafName ? `PriceSniffs: ${leafName} fragrances, price compared` : 'PriceSniffs: brand fragrances',
          TITLE_MAX,
        ),
        description: describe(
          leafName
            ? `Every ${leafName} fragrance stocked by the UK shops we track${leafDetail ? `, ${leafDetail}` : ''}.`
            : 'Every fragrance from this brand stocked by the UK shops we track.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'retailer':
      return {
        // Not `PriceSniffs: ${leafName}: fragrance prices` — a second colon
        // right after the brand one reads as a broken title, so the shop
        // name drops straight into the phrase instead of introducing one.
        title: clamp(
          leafName ? `PriceSniffs: ${leafName} fragrance prices` : 'PriceSniffs: retailer fragrance prices',
          TITLE_MAX,
        ),
        description: describe(
          leafName
            ? `What ${leafName} charges for the fragrances they stock${leafDetail ? `, ${leafDetail}` : ''}, next to every other UK shop we track.`
            : 'What this shop charges, next to every other UK shop we track.',
          SITE_TAIL,
        ),
        canonical,
        noindex: leafEmpty === true,
      };

    case 'note':
      return {
        title: clamp(
          leafName ? `PriceSniffs: ${leafName} fragrances` : 'PriceSniffs: fragrances by note',
          TITLE_MAX,
        ),
        description: describe(
          leafName
            ? `Fragrances whose shops list ${leafName} among their notes${leafDetail ? `, ${leafDetail}` : ''}.`
            : 'Fragrances listed under this note by the shops that stock them.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'brands':
      return {
        title: 'PriceSniffs: Brands',
        description: describe(
          'Every fragrance brand stocked by the UK shops we track, with how many bottles each one has on the site.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'retailers':
      return {
        title: 'PriceSniffs: Retailers',
        description: describe(
          shops
            ? `The ${shops} UK shops whose prices this site reads, what each one charges for delivery, and how those figures were checked.`
            : 'The UK shops whose prices this site reads, what each charges for delivery, and how those figures were checked.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'notes':
      return {
        title: 'PriceSniffs: Notes',
        description: describe(
          'Browse by the notes the shops themselves publish, from vanilla and oud to iris and vetiver, never notes we guessed at.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'deals':
      return {
        title: 'PriceSniffs: Deals',
        description: describe(
          // What scripts/build-deals.ts really compares: the cheapest buyable
          // offer against the shop's own reference price (its previous price)
          // or the brand's own price, never this site's price history.
          'Bottles you can buy now for less than the shop’s own previous price, or less than the brand’s own price for it. Delivery counts where the shop states it.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'about':
      return {
        // Not "PriceSniffs: About PriceSniffs" — the brand name would land
        // twice in five words.
        title: 'PriceSniffs: About',
        description: describe(
          'How this site gets its prices, what it earns from affiliate links, and the rule it holds to: never publish a number nobody checked.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };

    case 'legal': {
      // Two of legal.ts's own page titles already say "PriceSniffs" ("About
      // PriceSniffs", "How PriceSniffs works"), so prefixing those verbatim
      // would land the brand name twice in one title. Swapped for the part
      // that still reads correctly after "PriceSniffs: " once said once;
      // every other legal page title has no such collision and passes
      // straight through.
      const legalPart =
        leafName === 'About PriceSniffs' ? 'about'
        : leafName === 'How PriceSniffs works' ? 'how it works'
        : leafName;
      return {
        title: clamp(legalPart ? `PriceSniffs: ${legalPart}` : 'PriceSniffs: terms and privacy', TITLE_MAX),
        description: describe(
          leafName === 'Privacy'
            ? ADS_ON
              ? 'What this site collects, which is almost nothing, and how the ads Google shows on some pages ask for your consent first.'
              : 'What this site collects, which is almost nothing: no analytics, no tracking cookies, and a display preference kept on your own device.'
            : 'The terms this site is offered under, including what its prices are and are not a promise of.',
          SITE_TAIL,
        ),
        canonical,
        noindex: false,
      };
    }

    case 'design':
      return {
        title: 'PriceSniffs: Design system',
        description: describe(
          'The colours, type scale and icons this site is built from, rendered live from the same tokens the pages themselves use.',
          SITE_TAIL,
        ),
        canonical,
        // A reference page for whoever maintains the site, not something a
        // shopper should ever meet in a search result for a perfume.
        noindex: true,
      };

    case 'search':
      return {
        title: 'PriceSniffs: Search',
        description: describe(
          'Search the catalogue by brand, fragrance name or concentration.',
          SITE_TAIL,
        ),
        canonical,
        // The results depend entirely on a query string this canonical drops,
        // so indexing it would offer searchers an empty page.
        noindex: true,
      };

    // The account's pages are one reader's own and never a search result:
    // all noindex, and none of them is in the sitemap (scripts/build-sitemap.ts
    // lists only what it names, and tests/accountPages.test.ts checks it).
    // /account is the profile once signed in and the sign in form before
    // that, so app.ts passes the heading actually on screen as `leafName`
    // and the tab says the same thing as the page.
    case 'account':
      return {
        title: leafName === 'My Profile' ? 'PriceSniffs: My Profile' : 'PriceSniffs: Account',
        description: describe('Sign in to save fragrances to your wishlist and choose your price alerts.', SITE_TAIL),
        canonical,
        noindex: true,
      };

    case 'accountWishlist':
      return {
        title: 'PriceSniffs: My Wishlist',
        description: describe('The fragrances you saved, with the cheapest delivered price for each one today.', SITE_TAIL),
        canonical,
        noindex: true,
      };

    case 'accountNotifications':
      return {
        title: 'PriceSniffs: My Notifications',
        description: describe('Choose whether we email you when a fragrance you saved gets cheaper.', SITE_TAIL),
        canonical,
        noindex: true,
      };

    case 'settings':
      return {
        title: 'PriceSniffs: Settings',
        description: describe('Choose how this site looks on this device: the theme and the layout.', SITE_TAIL),
        canonical,
        noindex: true,
      };

    case 'suggestions':
      return {
        title: 'PriceSniffs: Suggestions',
        description: describe('Tell us what to add or change on this site.', SITE_TAIL),
        canonical,
        noindex: true,
      };

    case 'notFound':
      return {
        title: 'PriceSniffs: Page not found',
        description: 'That address does not match anything on this site.',
        canonical,
        noindex: true,
      };
  }
}

/**
 * The tags with noindex forced on while the ad layout preview is on
 * (`?adpreview=1`, demo/ads.ts): a page drawn with placeholder frames is never
 * for a search engine. The canonical address is left as it is, the path alone,
 * so it never carries the parameter either.
 */
export function withPreviewNoindex(tags: HeadTags, preview: boolean): HeadTags {
  return preview && !tags.noindex ? { ...tags, noindex: true } : tags;
}

/**
 * The canonical path for a route: the path alone, with the query dropped.
 *
 * Deliberately not routeToPath(), which preserves query state so the back
 * button and shared in-app links keep filters. A canonical URL wants the
 * opposite.
 */
function pathOf(route: Route): string {
  const p = encodeURIComponent(route.param);
  switch (route.name) {
    case 'home': return '/';
    case 'search': return '/search';
    case 'brands': return '/brands';
    case 'brand': return `/brands/${p}`;
    case 'deals': return '/deals';
    case 'retailers': return '/retailers';
    case 'retailer': return `/retailers/${p}`;
    case 'notes': return '/notes';
    case 'note': return `/notes/${p}`;
    case 'fragrance': return productPath(route.param);
    case 'product': return `/${p}`;
    case 'about': return '/about';
    case 'settings': return '/settings';
    case 'suggestions': return '/suggestions';
    case 'account': return '/account';
    case 'accountWishlist': return '/account/wishlist';
    case 'accountNotifications': return '/account/notifications';
    case 'design': return '/design';
    case 'legal': return `/legal/${p}`;
    case 'notFound': return '/404';
  }
}
