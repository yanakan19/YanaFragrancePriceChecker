/**
 * Update history, shown on the home page. Newest first.
 *
 * Written for shoppers, from the real git log: only things that happened.
 *
 * One entry per day (owner request, 6 Oct 2026). Never two entries for the
 * same date: a new major change goes into today's entry, under the heading
 * that fits it best, and the entry's version moves up to that release. Only
 * changes a visitor would notice get a line; tests, docs, pipeline work and
 * rebuilds get none.
 *
 * Rules (tests/changelog.test.ts checks them): one to four headed groups per
 * entry, a heading of at most 24 characters, one to eight points per group
 * and at most twelve per entry, each point at most 50 characters (the home
 * page cuts longer lines short), no hyphens or dashes, and a date such as
 * "6 Oct 2026". Entries from 1 Oct 2026 on cover a single day; the older
 * ones written before the rule may cover a range, such as "27 to 31 Aug 2026".
 */

export interface ChangelogGroup {
  heading: string;
  points: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  groups: ChangelogGroup[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3.105.0',
    date: '9 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Glossier UK, with its fragrances priced in pounds',
          'New UK shops: Rowlands, Lloyds, Beauté Boulevard',
          'Also Scent Warehouse, Roullier White, Scented',
          'More guides: shops, notes, matching and deals',
          'New Notes page: groups, icons and search',
        ],
      },
      {
        heading: 'Products and Matching',
        points: ['Notes tidied: one name per ingredient'],
      },
    ],
  },
  {
    version: 'v3.104.0',
    date: '8 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Ten new shops: Fenwick, Liberty, Opulensi',
          'Also Perfumoi, PerfumeUK, Direct Cosmetics',
          'And Saad, Sainte Cellier, Perfume Closet, Rasasi',
          'Plus Gorgeous Shop, Beauty Flash, Scentsational',
          'More sizes listed at some shops',
        ],
      },
    ],
  },
  {
    version: 'v3.103.0',
    date: '7 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: ['A footer with About, Contact and Privacy links', 'New guides and price checking page'],
      },
    ],
  },
  {
    version: 'v3.102.0',
    date: '6 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Filters: tick several at once, shown as chips',
          'All Fragrances tab; Oils and Sets filter and sort',
          'Search shows bottles; Sets and Oils a tap away',
          'Brands show a real logo, or an initials tile',
          'A shorter About page and a Legal Notice page',
          'Privacy notice covers our cookieless visit count',
          'Each shop row shows how long ago it was checked',
          'Brand names now sit in a neat pill on each tile',
        ],
      },
      {
        heading: 'Products and Matching',
        points: [
          '3,011 Perfume Direct bottles now match exactly',
          '273 more of its bottles compare with other shops',
          'About 1,600 Perfume Click photos are now larger',
          'Bulgari and Bvlgari are now one brand page',
        ],
      },
    ],
  },
  {
    version: 'v3.88.0',
    date: '5 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Oils and Sets tabs under Explore',
          'Share from a product page or your wishlist',
          'Product links now read like /creed_aventus_100ml',
          'Country and currency menu in the top bar',
          'Logos for 41 more fragrance houses',
          'Every sort reads Sort By, Notes get Z to A',
        ],
      },
      {
        heading: 'Products and Matching',
        points: [
          'Gift sets list each item and its size',
          'The same gift set at two shops is one page',
          'Nearly 12,000 more products show a photo',
          'More perfume oils found and moved to Oils',
        ],
      },
      {
        heading: 'Fixes',
        points: [
          'Fragrantica links open the right page',
          'Saved fragrances follow product merges',
        ],
      },
    ],
  },
  {
    version: 'v3.72.0',
    date: '4 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Account menu with profile, wishlist and alerts',
          'Profile photo, and Suggestions in the menu',
          'See All lists every fragrance as you scroll',
          'Preorders sit on their own under Sold Out',
        ],
      },
      {
        heading: 'Shops and Prices',
        points: [
          'Ten shops taken off for now, 42 UK shops remain',
          'Prices not checked for a week are hidden',
          'Debenhams delivery is 99p over £30, else £2.99',
        ],
      },
      {
        heading: 'Products and Matching',
        points: [
          'About 1,600 double listings now share one page',
          'One brand page per fragrance house',
          'Perfume Direct sizes and prices now line up',
          'Old links to merged products open the right page',
          'Cult Beauty grew from 130 to about 485 products',
        ],
      },
    ],
  },
  {
    version: 'v3.38.0',
    date: '3 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'A scrolling banner of key facts on the home page',
          'Every fragrance page now has a price graph',
          'Graph prices now include delivery',
          'Every price in one list, with its age',
          'Gift sets listed, compared only with the same set',
          'Every shop in a price list now shows a mark',
          'Three new shops, including Les Senteurs',
          'Menus and headings in Title Case, one search box',
        ],
      },
      {
        heading: 'Prices and Matching',
        points: [
          'MSRP and RRP savings now use the price shown',
          'Prices not checked for three weeks are hidden',
          'Empty bottles and barber colognes removed',
        ],
      },
    ],
  },
  {
    version: 'v3.30.0',
    date: '2 Oct 2026',
    groups: [
      {
        heading: 'Changes',
        points: [
          'Every bottle photo now fills its tile evenly',
          'We now say more than 30 UK shops',
          'The chat helper has been taken down',
        ],
      },
    ],
  },
  {
    version: 'v3.29.0',
    date: '1 Oct 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Prices sit in three groups, cheapest first',
          'Change your password or delete your account',
          'Direct links to the brand and Fragrantica pages',
          'Most Stocked shows one bottle per brand',
        ],
      },
      {
        heading: 'Speed and Accuracy',
        points: [
          'Pages open about a quarter faster',
          'Back keeps your filters and place in the list',
          'Delivery prices checked again for every shop',
        ],
      },
    ],
  },
  {
    version: 'v3.26.0',
    date: '7 to 12 Sep 2026',
    groups: [
      {
        heading: 'New',
        points: ['Logos for many shops and brands'],
      },
      {
        heading: 'Fixes',
        points: [
          'Bottles in a grid now look the same size',
          'Shop slogans taken out of product names',
        ],
      },
    ],
  },
  {
    version: 'v3.25.0',
    date: '6 Sep 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Links that earn commission say Affiliate link',
          'New cookies and refunds pages',
        ],
      },
    ],
  },
  {
    version: 'v3.19.0',
    date: '2 to 3 Sep 2026',
    groups: [
      {
        heading: 'New',
        points: ['Brand photos fill 656 empty picture spaces'],
      },
      {
        heading: 'Fixes',
        points: [
          'One more shop\'s listings now show up',
          'Three Avon perfumes no longer shown as one',
        ],
      },
    ],
  },
  {
    version: 'v3.17.0',
    date: '1 Sep 2026',
    groups: [
      {
        heading: 'Prices and Matching',
        points: ['Prices over 10 days old are never called cheapest'],
      },
      {
        heading: 'Fixes',
        points: [
          'Correct bottle photos for 1,497 fragrances',
          'A photo that fails to load shows a placeholder',
        ],
      },
    ],
  },
  {
    version: 'v3.16.0',
    date: '27 to 31 Aug 2026',
    groups: [
      {
        heading: 'Prices and Matching',
        points: [
          'Unknown bottle sizes are marked, not guessed',
          'French Avenue delivery charge added',
        ],
      },
      {
        heading: 'Fixes',
        points: ['A broken sign up email link now shows an error'],
      },
    ],
  },
  {
    version: 'v3.15.0',
    date: '25 to 26 Aug 2026',
    groups: [
      {
        heading: 'Prices and Matching',
        points: [
          'Deal savings checked against what shops charge',
          "The brand's own price shown beside the lowest",
        ],
      },
      {
        heading: 'Fixes',
        points: ['Shop names no longer shown as the brand'],
      },
    ],
  },
  {
    version: 'v3.13.0',
    date: '21 to 22 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Each fragrance links to its brand and Fragrantica',
          'One more shop now shows real prices',
        ],
      },
      {
        heading: 'Fixes',
        points: ['Brands spelt two ways now merged into one'],
      },
    ],
  },
  {
    version: 'v3.11.0',
    date: '20 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: [
          "Today's Deals has its own tab",
          'Sort results, including by bottle size',
          'Four new shops, including Avon and Perfumeo',
        ],
      },
    ],
  },
  {
    version: 'v3.10.0',
    date: '19 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: ['Price chart shows a week, month or year'],
      },
      {
        heading: 'Fixes',
        points: [
          'Photos now show for thousands more products',
          'Skincare no longer mixed in with fragrances',
        ],
      },
    ],
  },
  {
    version: 'v3.9.0',
    date: '18 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: ['Sign up and save fragrances to a wishlist'],
      },
      {
        heading: 'Fixes',
        points: ['About 50 duplicate listings merged'],
      },
    ],
  },
  {
    version: 'v3.8.0',
    date: '17 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: ['Each fragrance page can now be found in search'],
      },
      {
        heading: 'Fixes',
        points: ['Broken links show a Page not found screen'],
      },
    ],
  },
  {
    version: 'v3.6.0',
    date: '15 Aug 2026',
    groups: [
      {
        heading: 'Fixes',
        points: [
          'Garbled accents fixed in names like Hermès',
          'Bottle size no longer shown twice',
          "Escentual's delivery charge corrected",
        ],
      },
    ],
  },
  {
    version: 'v3.5.0',
    date: '13 to 14 Aug 2026',
    groups: [
      {
        heading: 'Fixes',
        points: ['Two shops paused over wrong currency prices'],
      },
    ],
  },
  {
    version: 'v3.3.0',
    date: '12 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'Calmer colours and buttons on every page',
          'Back now returns you to where you came from',
        ],
      },
      {
        heading: 'Fixes',
        points: ['MyBeauty.Boutique prices now read from its site'],
      },
    ],
  },
  {
    version: 'v3.2.0',
    date: '11 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: ['Emirates Oud now live with its delivery charge'],
      },
      {
        heading: 'Prices and Matching',
        points: [
          'Shops with no stated delivery never rank cheapest',
          'Price history shows one point per day',
        ],
      },
    ],
  },
  {
    version: 'v3.1.0',
    date: '4 to 6 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'New Explore menu: brands, deals, shops, notes',
          'Filter by size, strength, price and stock',
        ],
      },
    ],
  },
  {
    version: 'v2.0.0',
    date: '3 Aug 2026',
    groups: [
      {
        heading: 'New',
        points: [
          'ScentDay is renamed PriceSniffs, with a new look',
          'Live at pricesniffs.space',
          'Add it to your home screen, no app store needed',
        ],
      },
    ],
  },
  {
    version: 'v1.0.0',
    date: '1 to 2 Aug 2026',
    groups: [
      {
        heading: 'First Build',
        points: [
          'Started under the name ScentDay',
          'A first list of shops and a price layout',
          'Every placeholder price swapped for a real one',
          'Our first shops join as affiliate partners',
          'Partner prices are never marked up',
        ],
      },
    ],
  },
];
