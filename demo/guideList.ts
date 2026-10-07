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
 * The router, the head tags and the sitemap read this list and need no edit.
 *
 * House style, as for the Legal Notice: plain British English, no hyphens or
 * dashes in reader facing text. This file imports nothing, so a script or a
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
      'What EDT, EDP, Parfum and Extrait mean, roughly how strong each one is, and how to pick a strength for the weather, the occasion and your budget.',
  },
  {
    slug: 'perfume-notes-explained',
    title: 'How Perfume Notes Work',
    description:
      'Top, middle and base notes in plain language: what each layer does, how a scent changes over a few hours, and how to read a notes list before you buy.',
  },
  {
    slug: 'compare-perfume-prices-per-ml',
    title: 'Comparing Perfume Prices Per Ml',
    description:
      'A bigger bottle is not always the better deal. The one sum that compares any two sizes fairly, and why delivery changes the answer for small orders.',
  },
  {
    slug: 'spot-fake-or-grey-market-perfume',
    title: 'Spotting Fake and Grey Market Perfume',
    description:
      'The difference between a fake and a grey market bottle, the warning signs before you buy, the checks to make when it arrives, and how to protect your money.',
  },
  {
    slug: 'decants-and-testers',
    title: 'Decants, Testers and Miniatures',
    description:
      'What a tester, a miniature and a decant really are, what each one saves and risks, and the safest ways to try a scent before you buy a full bottle.',
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
    'Short, plain guides to buying fragrance in the UK: strengths, notes, price per ml, spotting fakes, and trying a scent before you commit to a bottle.',
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
