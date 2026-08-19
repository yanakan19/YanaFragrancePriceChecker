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
    version: 'v3.9.0',
    date: '18 Aug 2026',
    title: 'Accounts and wishlists go live, and duplicate listings merged',
    points: [
      'Accounts went live — sign up, verify your email, and save fragrances to a wishlist, built earlier and switched on now',
      'Rewrote the privacy notice to honestly explain what creating an account involves, since it previously said flatly that there was no account to create',
      "Found that one shop had been publishing its own internal stock numbers in the barcode field, which was wrongly stopping genuinely identical bottles at different shops from being shown as one product — around 50 duplicate listings are now merged, and 40 more products now show more than one shop's price",
      'The Deals page no longer advertises a discount on a fragrance we have no real photo of; the same deal still appears everywhere else on the site',
    ],
  },
  {
    version: 'v3.8.0',
    date: '17 Aug 2026',
    title: "Fragrance pages now show up in search, and Virtual Yanny learns who a scent is for",
    points: [
      "Fixed a bug that told search engines every one of the site's fragrance pages was a duplicate of the homepage, so none of them could be found on their own in a search result — each page now says clearly what it actually is",
      'A broken or outdated link now shows a proper "page not found" screen with a working search box, instead of silently showing the homepage as if nothing were wrong',
      'Added a skip-to-content link, a back-to-top button, a print-friendly layout for fragrance pages, and a working show/hide button on the password field when creating an account',
      'Virtual Yanny now understands "perfume oil" as a genuine strength rather than losing those listings, and no longer describes an ungraded fragrance as though "Not stated" were a real kind of perfume',
      'Virtual Yanny can now answer who a fragrance is marketed for — women\'s, men\'s or unisex — read from the product\'s own title, and says plainly how much of the catalogue actually states this rather than guessing at the rest',
    ],
  },
  {
    version: 'v3.7.0',
    date: '16 Aug 2026',
    title: 'Virtual Yanny understands how people actually ask',
    points: [
      'Virtual Yanny now answers plainly typed requests like "whats a good perfume for a man" or "something sweet" from the real catalogue, instead of falling back on a general reply',
      'Virtual Yanny now takes every part of a request into account at once, so asking for a perfume for a woman under £30 that smells sweet is answered on all three counts rather than on the price alone',
      'Everyday scent words like "sweet" now match the notes the catalogue really uses, instead of turning up almost nothing',
      'Virtual Yanny now works out who a fragrance is for even when you do not spell it out with the word "for"',
      'Budget wording like "30 quid" or "something £30ish" is now understood',
      'Added a stop button that genuinely cuts an answer off, in place of send while one is on its way',
      'Your conversation now survives closing and reopening the chat and refreshing the page, with a Clear chat button for when you want it gone',
      'Virtual Yanny no longer waits on its slowest source before replying, so one slow answer can no longer hold up the rest',
      'Virtual Yanny starts waking up the moment you reach for the chat button, so there is less waiting after a quiet spell',
      'Fixed suggestion questions being answered from the site\'s own pages instead of from real listings',
    ],
  },
  {
    version: 'v3.6.0',
    date: '15 Aug 2026',
    title: "Cleaner product names, and Escentual's real delivery cost",
    points: [
      'Fixed the garbled accented characters still left in some product names, including several Hermès and Lancôme fragrances',
      'Product names no longer show the bottle size twice, once in the name and again on the label beside it',
      'Accented and corrupted text is now cleaned the moment a shop\'s data arrives, and everything already stored has been repaired too',
      'Price checking can now ask a shop for its UK price list, rather than accepting whatever currency it happens to be offered',
      'Corrected Escentual\'s delivery charge, which was more than a pound below what the shop\'s own delivery page states',
      'Cleared Escentual\'s wrong-currency prices from our stored data again, after an automatic price update had quietly put back the ones removed on 13 August',
    ],
  },
  {
    version: 'v3.5.0',
    date: '14 Aug 2026',
    title: 'Virtual Yanny learns to answer almost anything',
    points: [
      'Virtual Yanny now answers stock, scent-note and bottle-size questions by reading the real catalogue instead of guessing',
      'Virtual Yanny now answers delivery, deals, budget, comparison, brand and coverage questions the same way',
      "Virtual Yanny's note-based suggestions now take your whole request into account instead of just the first scent note it spotted",
      'Virtual Yanny now says plainly when it has nothing to go on, instead of recommending a fragrance that is not actually listed',
      'Improved how Virtual Yanny works out what you are actually asking, fixing cases like a plain "any discounts?" being misread',
    ],
  },
  {
    version: 'v3.4.0',
    date: '13 Aug 2026',
    title: 'Virtual Yanny goes live, two retailers taken offline over currency',
    points: [
      'Virtual Yanny, a chatbot that can answer questions about the site, went live',
      'Found that Escentual\'s entire price list was on the wrong scale — around 44% too high across the board — fixed the underlying bug, and took the shop offline until its real prices can be reconfirmed',
      'Took Nicchia Luxury UK offline too, after being unable to establish that it actually charges in pounds',
      'Delivery costs that have never been verified are now clearly labelled as such, and a listing can no longer be shown as "Cheapest" when an unverified delivery figure is what decides it',
      'Fixed Virtual Yanny denying knowledge of a fragrance the site\'s own data clearly had',
      'Sped up how quickly Virtual Yanny answers a straightforward price question',
      'Made Virtual Yanny\'s suggestions read more naturally and stopped it repeating the same note recommendation more than once',
      'Removed Virtual Yanny\'s "pick a category first" buttons — it now works out what you are asking directly',
      'Fixed Virtual Yanny showing raw matching percentages instead of a plain answer',
      'Fixed products showing as sold out when other shops genuinely had them in stock',
      'Fixed multi-bottle gift sets being priced as though they were a single small bottle',
      'Fixed air fresheners and body sprays from certain ranges being listed alongside actual perfume',
      'Fixed garbled accented characters appearing in some product names',
      'Fixed duplicated wording on product cards, where a fragrance\'s own name repeated its brand, size and strength back at you',
      'Fixed more scheduling bugs in the automatic price updates, so a run that times out no longer throws away prices it had already gathered',
    ],
  },
  {
    version: 'v3.3.0',
    date: '12 Aug 2026',
    title: "New look, and MyBeauty.Boutique's prices corrected",
    points: [
      'Found that MyBeauty.Boutique\'s affiliate price feed had been showing wrong — usually too high — prices on most of its listings, and switched that shop over to reading its real prices straight from its own website',
      'Refreshed the site\'s colours, backgrounds and shared building blocks — buttons, fields, tabs, section headings, filter chips — for a calmer, more consistent look across every page',
      'Escentric Molecules is now a confirmed UK retailer with a real delivery charge, and confirmed delivery costs for two more retailers that had not been checked before',
      'Fixed Middle Eastern-exclusive fragrances that were genuinely in stock and priced but were not appearing anywhere in the comparison',
      'Fixed a bug where a retailer\'s own shop name was showing as the fragrance brand instead of the real brand, on Emirates Oud and Oud Arabian',
      'Fixed three separate bugs that were quietly creating duplicate listings for the same fragrance',
      'Fixed a bug that was dropping real products from the catalogue because of accented characters and corrupted text in retailer data feeds',
      'Fixed Glorious Beauty\'s Buy buttons, which were pointing at a broken page on our own site instead of the retailer\'s',
      'Top Deals Today no longer advertises a saving on something that is actually out of stock',
      'The back button now returns you to where you actually came from, instead of always landing in the same place',
      'Fixed retailer initials that were hard to read against their background colour in light mode',
      'Corrected several outdated figures on the About page',
      'Fixed a scheduling problem that was cutting some automatic price-update runs short before they finished',
    ],
  },
  {
    version: 'v3.2.0',
    date: '11 Aug 2026',
    title: 'Emirates Oud live, honest delivery labelling, and a cleaner catalogue',
    points: [
      'Emirates Oud is now fully live, with a confirmed standard delivery charge read from their own policy pages',
      'Applied to join a wide batch of new UK retailer and brand partner programmes, several already added as placeholders ready to go live once approved, including a new confirmed partnership with Nicchia Luxury UK',
      'A handful of retailers whose exact delivery charge is not published are now shown with delivery clearly marked "not stated" rather than hidden entirely — and such a shop can never appear as the cheapest option, since that price is not the whole story',
      'Fixed a bug where fragrance names starting with "Oud" — a very common word in Middle Eastern perfumery — were losing their first word and being mislabelled by concentration instead of by name',
      'Merged a wide batch of brands that were showing as separate entries purely from spelling differences (Al Haramain, Lattafa, Arabiyat, Kilian and more), so a brand page always shows everything from that house together',
      'Cleaned up leftover junk fragments and duplicate spellings in the notes section',
      'Sold-out products no longer show a shop name underneath them, since that shop is not actually where you would buy it',
      'Added an "In stock only" filter on retailer pages, and a combined "All Notes" view alongside the existing top/middle/base picker',
      'Renamed Deals to "Top Deals Today", now refreshed on a fixed schedule a few times a day rather than reshuffling constantly, and now publishing right on the hour instead of running late',
      'Retailer and price data now refreshes on a real six-hourly cadence, after fixing a scheduling bug that was silently discarding a full hour of freshly gathered prices',
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
