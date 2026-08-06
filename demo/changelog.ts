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
    version: 'v3.1.0',
    date: '6 Aug 2026',
    title: 'Cleanup and correctness pass',
    points: [
      'Created KNOWN_ALIASES map for brand names: YSL→Yves Saint Laurent, Estee→Estée Lauder, Donna Karan→DKNY, and others (8 alias pairs)',
      'Verified and corrected retailer URLs via live browser testing: Allbeauty, LOOKFANTASTIC, John Lewis (4 sections), Notino, and others',
      'Added word-boundary filter to exclude hair products (hair + perfume = hair treatment, not wearable fragrance)',
      'Rewrote legal pages (Terms, Privacy, About) as complete, finished documents with no placeholder text',
    ],
  },
  {
    version: 'v3.0.0',
    date: '4 to 5 Aug 2026',
    title: 'Explore navigation, brands, and faceted filters',
    points: [
      'Split single-page demo into Explore with five navigation routes: Brands, Deals, Retailers, Notes, Search',
      'Implemented faceted filtering (volume, concentration, price band, type, on sale, in stock) with the no-empty-results rule: filter options only show if at least one result actually has that property',
      'Added tiles-per-row density control (literal zoom slider) plus uniform tile heights to prevent visual jumping',
      'Created individual profile pages for every brand and scent note (oud, citrus, vanilla, etc.) showing all related products and live prices across all retailers',
      'Brought on additional UK retailers and Middle Eastern fragrance houses for broader geographic coverage',
    ],
  },
  {
    version: 'v2.0.0',
    date: '3 Aug 2026',
    title: 'PriceSniffs goes live — domain live, PWA, rebrand',
    points: [
      'Rebranded from ScentDay to PriceSniffs with full visual redesign (dark theme, red accents)',
      'Shipped as Progressive Web App: "Add to Home Screen" on iOS and Android, no app store review required',
      'Deployed to pricesniffs.space via GitHub Pages with HTTPS, DNS, and certificate setup',
      'Set up hourly CI/CD pipeline: catalogue harvest → image-link health checks → data validation → deploy (only if successful)',
      'Added explicit affiliate-terms field to retailer registry: tracks whether each image is under affiliate license, retailer\'s own storefront, or hot-linked without permission',
      'First live affiliate feeds integrated (Fragrance Click: 893 SKUs, MyBeauty Boutique: 8,908 SKUs)',
    ],
  },
  {
    version: 'v1.0.0',
    date: '1 Aug 2026',
    title: 'First build: real prices, no invented numbers',
    points: [
      'Built retailer registry and price comparison engine from scratch with 12 UK beauty retailers',
      'Implemented 6 adaptive retrieval strategies ranked by live-updating success score per retailer: plain HTTP, browser headers, sitemap discovery, real browser session, residential proxy',
      'Ran Phase 0 spike test: 0% success rate with plain HTTP, discovered datacentre IP blocks at every major retailer',
      'Replaced placeholder numbers with real harvested prices via multiple retrieval methods; learned which strategy works for each shop',
      'Hard-coded MAX_PROXIED_REQUESTS_PER_RUN constant for residential proxy budget (~$8/GB) to prevent budget drift',
    ],
  },
  {
    version: 'v0.4.0',
    date: '2 Aug 2026',
    title: 'Adaptive retrieval and residential proxy setup',
    points: [
      'Implemented multi-armed bandit learner: each shop gets a score tracking which of 6 retrieval strategies succeed, algorithms tries best-performing first',
      'Added residential proxy integration via Apify for shops that block datacentre IPs; configured as absolute last resort with cost control',
      'Built retrieval strategy ranking system that updates live after each run, no model training required (12 shops + 1 attempt = not a training set)',
      'Solved silent failure problem: added explicit logging for empty results vs. broken results (empty should never look the same as broken)',
    ],
  },
  {
    version: 'v0.3.0',
    date: '1 to 2 Aug 2026',
    title: 'Awin affiliate feeds and legal pivot',
    points: [
      'Joined Awin affiliate network and onboarded with Fragrance Click (893 SKUs, daily feed) and MyBeauty Boutique (8,908 SKUs)',
      'Established: affiliate data is sanctioned, structured product feed from retailer (price, stock, links); commission from retailer\'s marketing budget, no markup to reader',
      'Pivoted data strategy away from scraping: scraping a site actively refusing you = legal problem, not just technical problem',
      'Added affiliate-feed as first-class adapter category in registry; scrapers moved to fallback-only with honest placeholder labels (NO_AFFILIATE_YET, awinPending)',
    ],
  },
  {
    version: 'v0.2.0',
    date: '1 Aug 2026',
    title: 'Phase 0 spike: the 0% discovery',
    points: [
      'Ran HTTP request spike against 12 UK beauty retailers (Boots, Selfridges, LOOKFANTASTIC, etc.)',
      'Result: 0% success rate. Every request returned 403/404 before any markup was served.',
      'Root cause: datacentre IP ranges are blocked by retailers before any content is even fetched; requests come from obvious scraper IP pools',
      'Added permanent spike-result comments to retailer config for transparency: actual 403/404 errors preserved as historical record',
      'Realization: the naive plan (fetch page, read price) will never work against real, defended retailers',
    ],
  },
  {
    version: 'v0.1.0',
    date: '1 Aug 2026',
    title: 'Initial scaffold: ScentDay skeleton and retailer registry',
    points: [
      'Created initial retailer registry with ~12 UK beauty retailers and their product URLs',
      'Built offer presentation core: price, stock, retailer, link structure',
      'Set up TypeScript build, demo bundling (esbuild), and testing infrastructure (vitest)',
      'Created first demo page showing fragrance listing (hardcoded, no real data yet)',
      'Started with working name "ScentDay" (later rebranded to PriceSniffs on Aug 3)',
    ],
  },
];
