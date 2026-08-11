/**
 * Update history, shown on the home page.
 *
 * Hand curated from the real commit history rather than generated from every
 * commit message, because most commits are the hourly harvest committing
 * fresh prices ("Harvest: real prices", "Catalogue: 2026-08-05") and would
 * drown out anything worth a reader's attention. Every entry below still
 * corresponds to real, dated work — nothing here is invented, only put in
 * plain, general language a reader outside the engineering side of this
 * project can actually use. See the project's own git log for the
 * unabridged, implementation-level version.
 *
 * Deliberately general rather than technical: earlier entries named internal
 * details (constant names, exact SKU counts, algorithm labels) that mean
 * nothing to someone comparing fragrance prices and read like an engineering
 * log rather than a changelog for them. Redrafted 11 Aug 2026 to describe
 * what changed for a reader of the site, not how it was built.
 *
 * Versioning: 0.x.x for pre-launch development (before domain went live on Aug 3),
 * 1.x.x and up for live releases. Each bump marks a real inflection point
 * (a rebrand, a navigation rebuild, a legal correctness pass), not per commit.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  points: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3.2.0',
    date: '11 Aug 2026',
    title: 'More retailers, a steadier price history, and "Top Deals Today"',
    points: [
      'Applied to join a wide batch of new UK retailer and brand partner programmes, several already added as placeholders ready to go live once approved',
      'Renamed Deals to "Top Deals Today", now refreshed on a fixed schedule a few times a day rather than reshuffling constantly',
      'Rewrote this update history itself in plain language instead of engineering shorthand',
      'Price history now plots one point per day, with an unchanged price carried forward as a flat line instead of leaving a gap',
      'Fixed the price history chart\'s dots so they stay perfectly round at any screen width, and added date labels along the bottom',
      'Added a proper "Available at" heading above current listings, matching the site\'s other section headings',
    ],
  },
  {
    version: 'v3.1.0',
    date: '6 Aug 2026',
    title: 'Cleanup and correctness pass',
    points: [
      'Improved brand matching, so common alternate names and abbreviations point to the same fragrance instead of splitting into duplicates',
      'Re-checked and corrected a number of retailer links across the site',
      'Tightened filtering so household products no longer show up alongside fragrances',
      'Rewrote the legal pages in full, with no placeholder text remaining',
    ],
  },
  {
    version: 'v3.0.0',
    date: '4 to 5 Aug 2026',
    title: 'Explore navigation, brands, and filters',
    points: [
      'Added a proper Explore section: Brands, Deals, Retailers, Notes and Search',
      'Added filters for size, concentration, price, type, sale status and stock — a filter only appears when it would actually return a result',
      'Added a density control and more consistent card sizing for smoother browsing',
      'Added a dedicated page for every brand and scent note, showing everywhere it is stocked and at what price',
      'Brought on more retailers, widening geographic and brand coverage',
    ],
  },
  {
    version: 'v2.0.0',
    date: '3 Aug 2026',
    title: 'PriceSniffs goes live',
    points: [
      'Renamed from ScentDay to PriceSniffs, with a full visual redesign',
      'Launched as an installable app — add it to your home screen on iOS or Android, no app store needed',
      'Went live at pricesniffs.space',
      'Set up automatic price updates that run around the clock',
      'Started keeping an honest record of which product photos we actually have the right to show',
      'Brought on our first live retail partners',
    ],
  },
  {
    version: 'v1.0.0',
    date: '1 Aug 2026',
    title: 'First build: real prices, no invented numbers',
    points: [
      'Built the price comparison engine and the first list of retailers from scratch',
      'Tried several different ways of reading prices from each shop and kept whichever actually worked',
      'Found that a lot of requests were being blocked before any content loaded, and worked out why',
      'Replaced every placeholder figure with a real, checked one',
      'Put limits in place to keep running costs predictable',
    ],
  },
  {
    version: 'v0.4.0',
    date: '2 Aug 2026',
    title: 'Smarter, more resilient price checking',
    points: [
      'Built a system that learns over time which method works best for each retailer',
      'Added a fallback route for shops that block ordinary requests',
      'Made sure an empty result never quietly looks the same as a broken one',
    ],
  },
  {
    version: 'v0.3.0',
    date: '1 to 2 Aug 2026',
    title: 'First retail partnerships',
    points: [
      'Joined an affiliate network and onboarded our first retail partners',
      'Confirmed that partner pricing data comes from the retailer at no cost to readers — nothing is marked up',
      'Moved away from reading pages directly wherever a retailer had not agreed to it',
      'Started clearly labelling which retailers we do and do not yet have a live partnership with',
    ],
  },
  {
    version: 'v0.2.0',
    date: '1 Aug 2026',
    title: 'An early, honest setback',
    points: [
      'Tested the simplest possible approach against a dozen retailers',
      'None of it worked — every request was blocked before any content loaded',
      'Worked out why, and kept a record of it rather than papering over it',
      'Realised the simple approach would never work against real, well-defended sites, and planned around that instead',
    ],
  },
  {
    version: 'v0.1.0',
    date: '1 Aug 2026',
    title: 'Initial scaffold',
    points: [
      'Built the first retailer list and price comparison layout',
      'Set up the development and testing tools behind the site',
      'Built a first demo page with placeholder data, before any prices were real',
      'Started under the working name ScentDay, later renamed PriceSniffs',
    ],
  },
];
