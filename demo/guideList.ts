/**
 * The guides and the "How we check prices" page: what the page knows about
 * them before their words have arrived.
 *
 * ── Why this is separate from the words ──────────────────────────────────────
 * The words of a guide (demo/content/guideBodies.ts) and of the method page
 * (demo/content/methodBody.ts) are lazy data files, fetched only when one of
 * those pages is opened (LAZY_CONTENT_MODULES in scripts/dataFiles.ts), so the
 * first load does not grow by the length of five articles. What every visit
 * does need is small and lives here: each page's address, its title and its
 * description, which feed the head tags (demo/head.ts), the guides index, the
 * sitemap (scripts/build-sitemap.ts) and the heading and opening line the page
 * shows while its words are on the way.
 *
 * ── Adding a guide ───────────────────────────────────────────────────────────
 * One entry here and one in GUIDE_BODIES (same slug). tests/contentPages.test.ts
 * holds the two together, and the length, the links and the wording rules.
 * The router, the head tags, the sitemap and the page of each guide's own
 * address (scripts/build-route-pages.ts) read this list and need no edit.
 *
 * The first five guides are about perfume in general. The eight after them are
 * about how this site works and are written from the code and the shop list
 * (the claims and where each is true are in demo/content/guideBodies.ts).
 *
 * House style, as for the Legal Notice: plain British English, no hyphens or
 * dashes in reader facing text, titles in Title Case. Each title is under 60
 * characters with the "PriceSniffs: " prefix and each description is 100 to
 * 155 characters and ends with a full stop, so search engines show both whole
 * (tests/contentPages.test.ts). This file imports nothing, so a script or a
 * test can read it without the catalogue.
 */

export interface GuideInfo {
  /** The last part of the address, /guides/<slug>: lower case letters and hyphens. */
  slug: string;
  /** The page's heading and its name in lists. */
  title: string;
  /** The meta description, and the opening line of the page. */
  description: string;
}

export const GUIDES: readonly GuideInfo[] = [
  {
    slug: 'perfume-strengths-explained',
    title: 'Perfume Strengths Explained',
    description:
      'What EDT, EDP, Parfum and Extrait mean, roughly how strong each one is, and how to choose a strength for the season, the occasion and your budget.',
  },
  {
    slug: 'perfume-notes-explained',
    title: 'How Perfume Notes Work',
    description:
      'Top, middle and base notes in plain words: what each layer does, how a scent changes over a few hours, and how to read a notes list before you buy.',
  },
  {
    slug: 'compare-perfume-prices-per-ml',
    title: 'Comparing Perfume Prices Per Ml',
    description:
      'A bigger bottle is not always the better buy. The one sum that compares any two sizes fairly, and why delivery can change the answer on small orders.',
  },
  {
    slug: 'spot-fake-or-grey-market-perfume',
    title: 'Spotting Fake and Grey Market Perfume',
    description:
      'How a fake differs from a grey market bottle, the warning signs before you buy, the checks to make when it arrives, and how to protect your money.',
  },
  {
    slug: 'decants-and-testers',
    title: 'Decants, Testers and Miniatures',
    description:
      'What a tester, a miniature and a decant really are, what each one saves and risks, and the safer ways to try a scent before buying a full bottle.',
  },
  {
    slug: 'which-shops-we-compare',
    title: 'Which Shops We Compare',
    description:
      'How many shops PriceSniffs reads today, how they differ, and what their delivery rules look like. The figures are counted from our shop list, not typed in.',
  },
  {
    slug: 'how-we-tidy-perfume-notes',
    title: 'How We Tidy Perfume Notes',
    description:
      'Why Cedar and Cedarwood show as one note, which look alike notes stay apart, and how the 16 groups, drawn icons, jump bar and search work.',
  },
  {
    slug: 'why-the-basket-price-can-differ',
    title: 'Why the Basket Price Can Differ',
    description:
      'Why a shop’s basket can show a different total from the price here: delivery, free delivery spends, sold out rows and how old a price can be.',
  },
  {
    slug: 'how-we-match-the-same-bottle',
    title: 'How We Match the Same Bottle',
    description:
      'How listings from different shops become one product: barcodes, names, sizes, what happens when shops disagree, and why 100ml and 105ml stay apart.',
  },
  {
    slug: 'sets-and-oils-explained',
    title: 'Sets and Oils Explained',
    description:
      'What counts as a set and what counts as an oil, why neither appears among the bottles, and how a set’s page compares it with the bottle alone.',
  },
  {
    slug: 'how-deals-are-chosen',
    title: 'How Deals Are Chosen',
    description:
      'What makes a fragrance a deal on PriceSniffs: the reference price a saving is measured against, which offer wins, and what is always left out.',
  },
  {
    slug: 'wishlists-and-price-alerts',
    title: 'Wishlists and Price Alerts',
    description:
      'What an account does here: saving fragrances, setting a target price, the price drop emails and when they are sent, and what the account does not do.',
  },
  {
    slug: 'reading-the-price-history-chart',
    title: 'Reading the Price History Chart',
    description:
      'How to read the graph on a product page: what the line and the points mean, the date ranges, and why a flat line or a lone point is not a trend.',
  },
];

export const GUIDES_PATH = '/guides';
export const guidePath = (slug: string): string => `${GUIDES_PATH}/${slug}`;

/** The guide with this slug, or undefined. Own keys only: "constructor" is not a guide. */
export function guideBySlug(slug: string): GuideInfo | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/** The guides index page: its heading and its description. */
export const GUIDES_INDEX = {
  title: 'Perfume Guides',
  description:
    'Short, plain guides to buying fragrance in the UK, and to how PriceSniffs works: shops, matching, delivery, deals, sets, oils, alerts and price history.',
};

/** The page that says how prices are collected: /about/how-we-check-prices. */
export const HOW_WE_CHECK = {
  path: '/about/how-we-check-prices',
  title: 'How We Check Prices',
  description:
    'How PriceSniffs collects prices from shop websites and affiliate feeds, how often, how delivery and size are handled, and how affiliate links earn money.',
};

/**
 * Every address this module owns, in the order the sitemap lists them. The one
 * list a build step needs to know these pages exist (the sitemap reads it; so
 * does anything that writes a file per page).
 */
export const CONTENT_PATHS: readonly string[] = [
  GUIDES_PATH,
  ...GUIDES.map((g) => guidePath(g.slug)),
  HOW_WE_CHECK.path,
];
