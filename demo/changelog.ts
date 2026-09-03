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
    version: 'v3.23.0',
    date: '3 Sep 2026',
    title: 'Pictures back on hundreds of a brand’s own products',
    points: [
      'Looked into the roughly 3,000 fragrances showing a blank photo well and found most are a genuine gap — no shop we track has published a picture of that bottle at all — but 656 of them were a brand selling its own fragrance on its own website, with a perfectly good photo of it that the site just was not allowed to use yet',
      'Those 656 now show the brand’s own photo of its own bottle — the clearest kind of picture to trust, since it comes straight from the maker — without changing anything about photos from any other shop',
    ],
  },
  {
    version: 'v3.22.0',
    date: '3 Sep 2026',
    title: 'Sharper photos from a few shops, at no extra cost',
    points: [
      "Looked into whether shops publish several photos per product we could pick a better one from — they don't; every shop we harvest from gives us exactly one picture per listing, so that idea went nowhere and nothing changed because of it",
      "Along the way found that a few shops' own product pages were quietly asking for a smaller copy of the photo than they actually have on file — we now ask for the size they really have instead, so photos from those shops (Beauty Base among them) come through a little larger and crisper without any shop doing anything differently",
    ],
  },
  {
    version: 'v3.21.0',
    date: '3 Sep 2026',
    title: 'Better product pictures for thousands more fragrances',
    points: [
      "Checked two more shops' photos by hand before trusting either of them, the same way we already had for two shops on the site — one of the two passed and now supplies the picture for around 3,850 fragrances, up from about 2,160",
      'About 1,690 products now show a clearer, more consistent photo as a result, most of them moving off a shop whose pictures were smaller and blurrier up close',
    ],
  },
  {
    version: 'v3.19.0',
    date: '3 Sep 2026',
    title: 'A more honest "Most Stocked" ordering',
    points: [
      'The "Most Stocked" list is now ordered by the same count it always claimed to be ranked by, instead of a larger one that included every offer',
    ],
  },
  {
    version: 'v3.20.0',
    date: '3 Sep 2026',
    title: 'Tidier product tiles',
    points: [
      'Removed the shop-count line from every tile in the grid and the home rail — it repeated the ordering rather than adding to it, and the count is still shown on each fragrance’s own page under "Available at"',
      'Closed the gap that used to sit between a perfume’s name and its size/strength line, so every tile in a row lines up the same way whether the name takes one line or two',
    ],
  },
  {
    version: 'v3.18.0',
    date: '2 Sep 2026',
    title: 'Untangled duplicate Avon listings, and a wider rollout of brand price comparisons',
    points: [
      'Fixed three separate Avon perfumes that were wrongly being shown as a single product',
      "The brand's own price comparison, first added for French Avenue, now shows wherever there's a reliable price to compare against",
      'Fixed a hosting problem that could break the photos for 276 products with a properly licensed picture',
    ],
  },
  {
    version: 'v3.17.0',
    date: '1 Sep 2026',
    title: "A stricter \"cheapest\" badge, corrected photos, and honester sold-out pages",
    points: [
      'A price more than 10 days old can no longer be shown as the cheapest option',
      'Corrected product photos for 1,497 fragrances to show a confirmed picture of the actual bottle rather than a guess',
      "A fragrance that's sold out everywhere no longer shows a recommended price the page doesn't actually state",
      'A product photo that fails to load now shows a placeholder instead of a broken image',
      "Delivery notes now say \"Delivery not included\" instead of the vaguer \"Plus delivery\"",
    ],
  },
  {
    version: 'v3.16.0',
    date: '27 to 31 Aug 2026',
    title: 'Honest bottle sizes, a sign-up fix, and more brands linked to their own sites',
    points: [
      "When a bottle size can't be confirmed, the site now says so plainly instead of guessing at a number that could be wrong",
      "Confirmed and added French Avenue's delivery charge for the first time",
      "Resolved more disputes over a fragrance's concentration (EDP, EDT and so on) using the perfume house's own stated word instead of leaving them unclear",
      'Connected 21 more brands to their own website, and untangled four that had been wrongly split apart',
      'Fixed a broken email confirmation link during sign-up being silently ignored instead of telling you something went wrong',
    ],
  },
  {
    version: 'v3.15.0',
    date: '26 Aug 2026',
    title: 'Fairer reference prices on deals, and cleaner duplicate listings',
    points: [
      "A deal's reference price is now taken from the brand itself rather than from shops copying each other, and only shown as a saving when what other shops actually charge backs it up",
      "The brand's own price is now shown alongside the lowest price found, colour-coded to show whether you're paying more or less",
      'Fragrance notes are now read correctly from more of the ways shops describe them, including multi-word notes like Lily of the Valley that were being broken apart',
      "Multiple listings for the exact same fragrance at one shop are now shown as a single entry instead of several a reader couldn't tell apart",
      'The price history chart now explains plainly when there is nothing to show instead of leaving blank space, and only plots prices you could actually have paid at the time',
    ],
  },
  {
    version: 'v3.14.0',
    date: '25 Aug 2026',
    title: 'Corrected brand names on the site, and a fairer check on deal prices',
    points: [
      "Fixed three retailers' own shop names, and a generic default label, that were wrongly showing up as the fragrance brand",
      "Connected 47 more brands to their own website, and marked the nine that don't have one",
      'Fixed fragrance names in browsing and search grids being cut down to only the part every product on the page shared',
      'Added scent notes for 524 more listings, read from information the shops had already published',
      "Stopped showing an inflated \"was\" price on a deal once what other shops are actually charging shows it isn't real",
    ],
  },
  {
    version: 'v3.13.0',
    date: '22 Aug 2026',
    title: 'Every fragrance links out to its house and to Fragrantica, and duplicate brands merged',
    points: [
      'Every fragrance page now links straight to the brand\'s own official site and to its Fragrantica page, instead of only offering that from the brand directory',
      'Merged 21 more pairs of brands that were showing twice purely from spelling — "Abercrombie & Fitch" beside "Abercrombie and Fitch", accented spellings beside unaccented ones — so a house always has one page',
      'Armaf products now show their sub-line again (Club De Nuit, Derby, Delicacy and the rest), which had been lost when the 51 separate "Armaf - …" entries were merged into the one real house',
      'Connected 26 more brands to their official website, and corrected 14 links that pointed at an international storefront when the house has a UK one',
      'Zara now shows real prices rather than only appearing in listings',
      'Fixed two bugs that were throwing away fragrance notes the shops had already published — marketing copy mentioning "top notes" was being read instead of the real list, and mood words were being recorded as if they were notes',
      'Browser tab titles are now consistent across the whole site: plain "PriceSniffs" on the home page, and "PriceSniffs: …" everywhere else',
    ],
  },
  {
    version: 'v3.12.0',
    date: '21 Aug 2026',
    title: 'An honest note where a retailer has no Trustpilot rating hooked up',
    points: [
      'Retailer pages with no Trustpilot rating connected now say so plainly, instead of just leaving that part of the page blank',
    ],
  },
  {
    version: 'v3.11.0',
    date: '20 Aug 2026',
    title: "Today's Deals gets its own tab, and four new retailers go live",
    points: [
      "Today's Deals moved out of the Explore menu and into its own tab in the main navigation, between Home and Explore",
      'Added a sort menu to search and browse results, including a way to sort by bottle size',
      'Bottle size filtering now groups into five simple ranges instead of a separate option for every exact millilitre',
      'Four more retailers went live: Avon, Riiffs Perfumes, Perfumeo and FragranceHub',
      "Fixed several UK brand website links that were wrongly labelled as international, and connected 7 more brands to their official site",
    ],
  },
  {
    version: 'v3.10.0',
    date: '19 Aug 2026',
    title: 'Product photos are back, and the price chart gets a range picker',
    points: [
      'Photos are now showing for thousands of products that had none before — roughly half the catalogue was missing a picture the shop had actually published all along',
      "Fixed two separate bugs that were splitting or wrongly merging listings for the same fragrance, including Swiss Arabian's Shaghaf Oud and Jimmy Choo's I Want Choo Le Parfum",
      'The price history chart on a fragrance page can now be switched between this week, this month and this year, and starts from when that fragrance was first tracked instead of opening with empty space',
      'Brand website links now say upfront whether they lead to a UK site or an international one',
      'Skincare items like face and eye serums no longer show up mixed in with fragrances',
    ],
  },
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
