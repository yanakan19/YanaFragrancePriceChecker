/**
 * Update history, shown on the home page.
 *
 * Hand curated from the real commit history rather than generated from every
 * commit message, because most commits are the hourly harvest committing
 * fresh prices ("Harvest: real prices", "Catalogue: 2026-08-05") and would
 * drown out anything worth a reader's attention. Every entry below still
 * corresponds to real, dated work — nothing here is invented, only grouped
 * and put in plain language. See the project's own git log for the
 * unabridged version.
 *
 * Versioning is date ordered major.minor, bumped at a real inflection point
 * (a rebrand, a navigation rebuild, a correctness pass), not per commit.
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  points: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3.1.0',
    date: '6 Aug 2026',
    title: 'Cleanup and correctness pass',
    points: [
      'Folded duplicate brand spellings into one name each (YSL, Estée Lauder, Rabanne and more)',
      'Corrected or added real crawl targets for over a dozen retailers',
      'Excluded hair care products that were slipping into the fragrance catalogue',
      'Rewrote every legal page as a finished document, no placeholders left',
    ],
  },
  {
    version: 'v3.0.0',
    date: '4 to 5 Aug 2026',
    title: 'Explore, brands and filters',
    points: [
      'Rebuilt navigation into Explore: Brands, Deals, Retailers, Notes, Search',
      'Added a profile page per brand and per note, with Amazon-style faceted filtering',
      'Brought on more UK retailers and Middle Eastern houses',
      "Replaced guessed delivery costs with each shop's own published terms",
    ],
  },
  {
    version: 'v2.0.0',
    date: '3 Aug 2026',
    title: 'PriceSniffs goes live',
    points: [
      'Rebranded from ScentDay to PriceSniffs with a full visual redesign',
      'First real affiliate integration, with an explicit rule for when a product photo may be shown',
      'Shipped as an installable app and deployed live on its own domain',
    ],
  },
  {
    version: 'v1.0.0',
    date: '1 Aug 2026',
    title: 'First build: real prices, no invented numbers',
    points: [
      'Built the retailer registry and price comparison engine from nothing',
      'Adaptive retrieval that learns which way of reaching a shop actually works',
      'Replaced every early placeholder number with a real harvested price',
    ],
  },
];
