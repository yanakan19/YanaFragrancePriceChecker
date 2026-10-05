/**
 * Update history, shown on the home page. Newest first.
 *
 * Written for shoppers, from the real git log: only things that happened.
 * Rules (tests/changelog.test.ts checks them): a title of at most 45
 * characters, one to three points of at most 50 characters each (the home
 * page cuts longer lines short), no hyphens or dashes, and a date such as
 * "1 Oct 2026" or "27 to 31 Aug 2026".
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  points: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v3.85.0',
    date: '5 Oct 2026',
    title: 'Many more products now show a photo',
    points: [
      'Nearly 12,000 more products show a shop photo',
      'Each photo loads from the shop selling it',
      'Small ScentStore photos now show at full size',
    ],
  },
  {
    version: 'v3.84.0',
    date: '5 Oct 2026',
    title: 'Fragrantica links check who it is for',
    points: [
      'A men\'s product no longer opens the women\'s page',
      'A name shared by both uses the search link',
    ],
  },
  {
    version: 'v3.83.0',
    date: '5 Oct 2026',
    title: 'New: Oils and Sets under Explore',
    points: [
      'Two new tabs after Notes, each with its own search',
      'Sets are compared only with the same set',
      'Old Gift Sets links now open the Sets tab',
    ],
  },
  {
    version: 'v3.82.0',
    date: '5 Oct 2026',
    title: 'Saved fragrances follow product merges',
    points: [
      'Merged products keep their price on your wishlist',
      'Price alert emails now cover them too',
      'Gone products say No longer listed, with Remove',
    ],
  },
  {
    version: 'v3.81.0',
    date: '5 Oct 2026',
    title: 'Share moves off the tiles',
    points: [
      'Tiles are back to how they were, no Share button',
      'Share stays on each product page beside Save',
      'New: Share on each row of your wishlist',
    ],
  },
  {
    version: 'v3.80.0',
    date: '5 Oct 2026',
    title: 'Every product has a readable address',
    points: [
      'Like pricesniffs.space/creed_aventus_100ml',
      'Old product links still work and move over',
      'Share and email links use the new address',
    ],
  },
  {
    version: 'v3.79.0',
    date: '5 Oct 2026',
    title: 'Fragrantica links go to the right page',
    points: [
      'A search link now says Search Fragrantica',
      'Parfum and Cologne no longer use the main page',
      'Some men and women pages were mixed up, fixed',
    ],
  },
  {
    version: 'v3.78.0',
    date: '5 Oct 2026',
    title: 'A country and currency menu in the top bar',
    points: [
      'Sits just left of the account button',
      'The UK and GBP are active, five more coming soon',
      'Choosing nothing changes nothing, no cookies',
    ],
  },
  {
    version: 'v3.77.0',
    date: '5 Oct 2026',
    title: 'Fewer split products, bundles are sets',
    points: [
      'Edition wording and US ounce sizes no longer split',
      'Bundles, duos and trios now sit under Gift Sets',
      'MYSLF Le Parfum no longer says Aftershave',
    ],
  },
  {
    version: 'v3.76.0',
    date: '5 Oct 2026',
    title: 'Share any fragrance with a friend',
    points: [
      'A Share button on every tile and product page',
      'Copy the link or send it by WhatsApp, X and more',
      'Nothing is sent until you choose where to share',
    ],
  },
  {
    version: 'v3.75.0',
    date: '5 Oct 2026',
    title: 'A cleaner Notes list with Z to A',
    points: [
      'Notes can now be sorted from Z to A',
      'The extra headings above the list are gone',
      'Layer filters use the same chips as note pages',
    ],
  },
  {
    version: 'v3.74.0',
    date: '5 Oct 2026',
    title: 'Every sort now says Sort By',
    points: [
      'Each sort reads Sort By, then its order',
      'Best to Worst Saving, Highest to Lowest Price',
      'The wishlist and Explore sorts follow suit',
    ],
  },
  {
    version: 'v3.73.0',
    date: '5 Oct 2026',
    title: 'Logos for 41 more fragrance houses',
    points: [
      'Brand pages show the house logo from its own site',
      'Every logo was checked by eye before it went in',
      'Houses with no usable logo keep their initials',
    ],
  },
  {
    version: 'v3.72.0',
    date: '4 Oct 2026',
    title: 'Suggestions moved to the account menu',
    points: [
      'Got an Idea is gone from the home page',
      'Suggestions sits under Settings for everyone',
      'It opens the same form on its own page',
    ],
  },
  {
    version: 'v3.71.0',
    date: '4 Oct 2026',
    title: 'Lists now keep going as you scroll',
    points: [
      'See All opens every fragrance, most stocked first',
      'Sorting and filters now cover the whole list',
      'Long lists stay quick on a phone',
    ],
  },
  {
    version: 'v3.70.0',
    date: '4 Oct 2026',
    title: 'Logos for eight more shops',
    points: [
      'Four now show their logo beside their prices',
      'Four wordmarks show on the shop page',
      'Manchester Ouds shows its name in plain type',
    ],
  },
  {
    version: 'v3.69.0',
    date: '4 Oct 2026',
    title: 'Trustpilot links on more shop pages',
    points: [
      '11 more shops link to their Trustpilot page',
      'Each address was checked by hand',
    ],
  },
  {
    version: 'v3.68.0',
    date: '4 Oct 2026',
    title: 'Ten shops taken off the site for now',
    points: [
      'Their prices, pages and deals are gone',
      '115 offers and 62 bottles no longer listed',
      'The site now covers 42 UK shops',
    ],
  },
  {
    version: 'v3.67.0',
    date: '4 Oct 2026',
    title: 'Most Stocked is easier to browse',
    points: [
      'On a phone it swipes all the way to the end',
      'On a computer all twelve sit in a centred grid',
      'The link now reads See All',
    ],
  },
  {
    version: 'v3.66.0',
    date: '4 Oct 2026',
    title: 'More niche perfumes now show their strength',
    points: [
      'Strength is read from the brand\'s own page',
      'Creed, Discothèque, Charlotte Tilbury and more',
      '75 more shop listings now appear',
    ],
  },
  {
    version: 'v3.65.0',
    date: '4 Oct 2026',
    title: 'Perfume Direct prices now compared',
    points: [
      '2,000 more Perfume Direct rows meet other shops',
      "Women's and Men's labels no longer split a bottle",
      'Men and women versions of one name stay apart',
    ],
  },
  {
    version: 'v3.64.0',
    date: '4 Oct 2026',
    title: 'Kayali sets and tidier perfume names',
    points: [
      'Kayali duos and trios now show as sets',
      'Kayali bottles at two shops share one page',
      'Foreign script subtitles removed from names',
    ],
  },
  {
    version: 'v3.63.0',
    date: '4 Oct 2026',
    title: 'One bottle, one page, any strength name',
    points: [
      'Shops naming a strength differently now merge',
      'Only where the brand or a barcode agrees',
      'Orto Parisi Cuoium 50ml is now one page',
    ],
  },
  {
    version: 'v3.62.0',
    date: '4 Oct 2026',
    title: 'More LOOKFANTASTIC fragrances',
    points: [
      'Its own fragrance pages are now read',
      'Each size is read as its own bottle',
      'New perfumes appear as pages are read',
    ],
  },
  {
    version: 'v3.61.0',
    date: '4 Oct 2026',
    title: 'Cult Beauty prices are rechecked daily',
    points: [
      'Each Cult Beauty price is rechecked once a day',
      'More time now goes to finding new perfumes',
    ],
  },
  {
    version: 'v3.60.0',
    date: '4 Oct 2026',
    title: 'More Cult Beauty perfumes now show',
    points: [
      'Strength is now read from the Cult Beauty page',
      'Creed Eladaria and Byredo Alto Astral now show',
      'They appear as each page is next rechecked',
    ],
  },
  {
    version: 'v3.59.0',
    date: '4 Oct 2026',
    title: 'Double listings now share one page',
    points: [
      'About 1,600 duplicate pages became one each',
      'Different strengths and sizes stay separate',
      'Seven duplicate brand names were merged',
    ],
  },
  {
    version: 'v3.58.0',
    date: '4 Oct 2026',
    title: 'Perfume Direct sizes now match their prices',
    points: [
      'Each size now sits on the page for that size',
      'A 100ml price no longer shows as a 30ml price',
      'About 1,300 Perfume Direct prices moved',
    ],
  },
  {
    version: 'v3.57.0',
    date: '4 Oct 2026',
    title: 'Old product links open the right page',
    points: [
      'A product that was merged keeps its old link',
      'The old link opens the page it merged into',
      'Your address bar changes to the new link',
    ],
  },
  {
    version: 'v3.56.0',
    date: '4 Oct 2026',
    title: 'Far more Cult Beauty fragrances',
    points: [
      'Cult Beauty went from 130 to about 485 products',
      'Its whole fragrance range is now being read',
      'Prices are rechecked through the day',
    ],
  },
  {
    version: 'v3.55.0',
    date: '4 Oct 2026',
    title: 'Account button on the right, and photos',
    points: [
      'The account button now sits at the top right',
      'Add a profile photo on your profile page',
      'It shows on any device you sign in on',
    ],
  },
  {
    version: 'v3.54.0',
    date: '4 Oct 2026',
    title: 'Pages stay for products with no prices',
    points: [
      'A product page now shows No Current Prices',
      'It keeps the photo, name and price history',
      'These stay out of lists, Deals and search',
    ],
  },
  {
    version: 'v3.53.0',
    date: '4 Oct 2026',
    title: 'Preorder dates removed from names',
    points: [
      'Emirates Oud names no longer carry dispatch dates',
      'Hawas Boa now joins its other shops on one page',
      'Preorder bottles still sit under Preorder',
    ],
  },
  {
    version: 'v3.52.0',
    date: '4 Oct 2026',
    title: 'Refills no longer priced as bottles',
    points: [
      'Escentric Molecules 30ml refills are left out',
      'They no longer sit beside Nicchia\'s £92 bottle',
      'Anything a shop labels a refill stays out',
    ],
  },
  {
    version: 'v3.51.0',
    date: '4 Oct 2026',
    title: 'Beauty Pie Le Smash Santal now shows',
    points: [
      'It is a £59 Eau de Parfum, 50ml',
      'Beauty Pie types it as a fragrance',
      'Its other perfumes all say Eau de Parfum',
    ],
  },
  {
    version: 'v3.50.0',
    date: '4 Oct 2026',
    title: 'Travel sprays at more shops',
    points: [
      '29 single travel sprays now have their own page',
      'They sit apart from the full size bottle',
      'Sets and refills stay out',
    ],
  },
  {
    version: 'v3.49.0',
    date: '4 Oct 2026',
    title: 'One brand page per fragrance house',
    points: [
      'Kayali UK and 48 more split brands now merged',
      '160 bottles sold under both names now share a page',
      'Old brand addresses open the merged brand',
    ],
  },
  {
    version: 'v3.48.0',
    date: '4 Oct 2026',
    title: 'Same size rows now say which is which',
    points: [
      'Kayali 10ml rows say Miniature or Travel Spray',
      'Works for any shop with two rows of one size',
      'The label is the shop\'s own wording',
    ],
  },
  {
    version: 'v3.47.0',
    date: '4 Oct 2026',
    title: 'Debenhams delivery is 99p over £30',
    points: [
      'Debenhams charges 99p on orders over £30',
      'Below that it is still £2.99, and never free',
      '43 Debenhams prices are now £2 lower',
    ],
  },
  {
    version: 'v3.46.0',
    date: '4 Oct 2026',
    title: 'Clearer Deals and Reviews wording',
    points: [
      'Deals now say what they are measured against',
      'Shop pages link to Trustpilot once confirmed',
      'Unconfirmed shops no longer show a review note',
    ],
  },
  {
    version: 'v3.45.0',
    date: '4 Oct 2026',
    title: 'Debenhams delivery uses its cheapest rate',
    points: [
      'Debenhams Supersaver delivery is £2.99 per order',
      'It replaces the £3.99 Standard rate we used',
      'Every Debenhams total price is £1 lower',
    ],
  },
  {
    version: 'v3.44.0',
    date: '4 Oct 2026',
    title: 'Escentric Molecules at Cult Beauty',
    points: [
      'Cult Beauty Escentric Molecules bottles now show',
      "They sit beside the brand's own shop",
      'Extrait no longer mixed with Eau de Toilette',
    ],
  },
  {
    version: 'v3.43.0',
    date: '4 Oct 2026',
    title: 'Preorders are shown on their own',
    points: [
      'A shop preorder now sits under Sold Out',
      'A preorder is never cheapest or counted in stock',
      'Read from Bloom Perfumery and Emirates Oud',
    ],
  },
  {
    version: 'v3.42.0',
    date: '4 Oct 2026',
    title: 'An account menu and a fuller About page',
    points: [
      'Account menu at the top left of every page',
      'Profile, wishlist and alerts on their own pages',
      'Contact Us and legal links moved to About',
    ],
  },
  {
    version: 'v3.41.0',
    date: '4 Oct 2026',
    title: 'Gift sets are now a Size filter option',
    points: [
      'Gift Sets is now an option under Size',
      'The Gift Sets section is gone from home',
      'The old Gift Sets link opens that filter',
    ],
  },
  {
    version: 'v3.40.0',
    date: '4 Oct 2026',
    title: 'Only prices from the last week are shown',
    points: [
      'Prices not checked for a week are now hidden',
      'Shops with no recent prices leave the Shops list',
      'Graphs no longer carry an old price forward',
    ],
  },
  {
    version: 'v3.39.0',
    date: '4 Oct 2026',
    title: 'Minis sit with their perfume',
    points: [
      'A mini is now one size of its perfume',
      'Kayali strengths read from its own pages',
      'Kayali travel sprays now listed',
    ],
  },
  {
    version: 'v3.38.0',
    date: '3 Oct 2026',
    title: 'A scrolling banner on the home page',
    points: ['Key facts about the site scroll under the title'],
  },
  {
    version: 'v3.37.0',
    date: '3 Oct 2026',
    title: 'Tidier labels and brand names',
    points: [
      'Menus, buttons and headings now in Title Case',
      'Brand names in capitals now read normally',
      'Deals in the menu, and one search box',
    ],
  },
  {
    version: 'v3.36.0',
    date: '3 Oct 2026',
    title: 'Every shop gets a mark',
    points: ['Every shop in a price list now shows a mark'],
  },
  {
    version: 'v3.35.0',
    date: '3 Oct 2026',
    title: 'Delivered price graph and gift sets section',
    points: [
      'Graph prices now include delivery',
      'Every price back in one list, age on each row',
      'Gift sets on the home page, one of each perfume',
    ],
  },
  {
    version: 'v3.34.0',
    date: '3 Oct 2026',
    title: 'Gift sets get their own category',
    points: [
      'Gift sets now listed, under Size in filters',
      'A set is only compared with the same set',
      'Gift sets are left out of Most stocked',
    ],
  },
  {
    version: 'v3.33.0',
    date: '3 Oct 2026',
    title: 'Fairer price comparisons',
    points: ['MSRP and RRP savings now use the price shown'],
  },
  {
    version: 'v3.32.0',
    date: '3 Oct 2026',
    title: 'Older prices move to the price graph',
    points: [
      'Older prices sit below today\'s, not above',
      'Every fragrance page now has a price graph',
      'Older prices are plotted on the graph',
    ],
  },
  {
    version: 'v3.31.0',
    date: '3 Oct 2026',
    title: 'Three new shops and tidier lists',
    points: [
      'Three new shops, including Les Senteurs',
      'Prices not checked for three weeks are hidden',
      'Empty bottles and barber colognes removed',
    ],
  },
  {
    version: 'v3.30.0',
    date: '2 Oct 2026',
    title: 'Bottle photos all the same size',
    points: [
      'Every bottle photo now fills its tile evenly',
      'We now say more than 30 UK shops',
      'The chat helper has been taken down',
    ],
  },
  {
    version: 'v3.29.0',
    date: '1 Oct 2026',
    title: 'Clearer prices and a better account page',
    points: [
      'Prices sit in three groups, cheapest first',
      'Errors now show in a pop up box',
      'Change your password or delete your account',
    ],
  },
  {
    version: 'v3.28.0',
    date: '1 Oct 2026',
    title: 'Delivery checked again, direct brand links',
    points: [
      'Delivery prices checked again for every shop',
      'Direct links to the brand and Fragrantica pages',
    ],
  },
  {
    version: 'v3.27.0',
    date: '1 Oct 2026',
    title: 'A faster site that keeps your place',
    points: [
      'Pages open about a quarter faster',
      'Back keeps your filters and place in the list',
      'Most stocked shows one bottle per brand',
    ],
  },
  {
    version: 'v3.26.0',
    date: '7 to 12 Sep 2026',
    title: 'Logos and tidier bottle photos',
    points: [
      'Logos for many shops and brands',
      'Bottles in a grid now look the same size',
      'Shop slogans taken out of product names',
    ],
  },
  {
    version: 'v3.25.0',
    date: '6 Sep 2026',
    title: 'Marked affiliate links',
    points: [
      'Links that earn commission say Affiliate link',
      'New cookies and refunds pages',
    ],
  },
  {
    version: 'v3.19.0',
    date: '2 to 3 Sep 2026',
    title: 'Better photos and a missing shop found',
    points: [
      'Brand photos fill 656 empty picture spaces',
      'One more shop\'s listings now show up',
      'Three Avon perfumes no longer shown as one',
    ],
  },
  {
    version: 'v3.17.0',
    date: '1 Sep 2026',
    title: 'A stricter cheapest label',
    points: [
      'Prices over 10 days old are never called cheapest',
      'Correct bottle photos for 1,497 fragrances',
      'A photo that fails to load shows a placeholder',
    ],
  },
  {
    version: 'v3.16.0',
    date: '27 to 31 Aug 2026',
    title: 'Honest bottle sizes and a sign up fix',
    points: [
      'Unknown bottle sizes are marked, not guessed',
      'French Avenue delivery charge added',
      'A broken sign up email link now shows an error',
    ],
  },
  {
    version: 'v3.15.0',
    date: '25 to 26 Aug 2026',
    title: 'Fairer deal prices and correct brand names',
    points: [
      'Deal savings checked against what shops charge',
      "The brand's own price shown beside the lowest",
      'Shop names no longer shown as the brand',
    ],
  },
  {
    version: 'v3.13.0',
    date: '21 to 22 Aug 2026',
    title: 'Links to brand sites and Fragrantica',
    points: [
      'Each fragrance links to its brand and Fragrantica',
      'Brands spelt two ways now merged into one',
      'One more shop now shows real prices',
    ],
  },
  {
    version: 'v3.11.0',
    date: '20 Aug 2026',
    title: "A Today's Deals tab and four new shops",
    points: [
      "Today's Deals has its own tab",
      'Sort results, including by bottle size',
      'Four new shops, including Avon and Perfumeo',
    ],
  },
  {
    version: 'v3.10.0',
    date: '19 Aug 2026',
    title: 'Photos are back',
    points: [
      'Photos now show for thousands more products',
      'Price chart shows a week, month or year',
      'Skincare no longer mixed in with fragrances',
    ],
  },
  {
    version: 'v3.9.0',
    date: '18 Aug 2026',
    title: 'Accounts and wishlists go live',
    points: [
      'Sign up and save fragrances to a wishlist',
      'Privacy notice rewritten to cover accounts',
      'About 50 duplicate listings merged',
    ],
  },
  {
    version: 'v3.8.0',
    date: '17 Aug 2026',
    title: 'Fragrance pages show up in search engines',
    points: [
      'Each fragrance page can now be found in search',
      'Broken links show a Page not found screen',
    ],
  },
  {
    version: 'v3.6.0',
    date: '15 Aug 2026',
    title: 'Cleaner product names',
    points: [
      'Garbled accents fixed in names like Hermès',
      'Bottle size no longer shown twice',
      "Escentual's delivery charge corrected",
    ],
  },
  {
    version: 'v3.5.0',
    date: '13 to 14 Aug 2026',
    title: 'Two shops paused over currency',
    points: [
      'Two shops paused over wrong currency prices',
    ],
  },
  {
    version: 'v3.3.0',
    date: '12 Aug 2026',
    title: 'New look and fixed MyBeauty.Boutique prices',
    points: [
      'MyBeauty.Boutique prices now read from its site',
      'Calmer colours and buttons on every page',
      'Back now returns you to where you came from',
    ],
  },
  {
    version: 'v3.2.0',
    date: '11 Aug 2026',
    title: 'Emirates Oud live and clearer delivery',
    points: [
      'Emirates Oud now live with its delivery charge',
      'Shops with no stated delivery never rank cheapest',
      'Price history shows one point per day',
    ],
  },
  {
    version: 'v3.1.0',
    date: '4 to 6 Aug 2026',
    title: 'Explore, brands and filters',
    points: [
      'New Explore menu: brands, deals, shops, notes',
      'Filter by size, strength, price and stock',
      'Legal pages rewritten in full',
    ],
  },
  {
    version: 'v2.0.0',
    date: '3 Aug 2026',
    title: 'PriceSniffs goes live',
    points: [
      'ScentDay is renamed PriceSniffs, with a new look',
      'Live at pricesniffs.space',
      'Add it to your home screen, no app store needed',
    ],
  },
  {
    version: 'v1.0.0',
    date: '1 to 2 Aug 2026',
    title: 'First build with real prices',
    points: [
      'Every placeholder price swapped for a real one',
      'Our first shops join as affiliate partners',
      'Partner prices are never marked up',
    ],
  },
  {
    version: 'v0.1.0',
    date: '1 Aug 2026',
    title: 'Started under the name ScentDay',
    points: [
      'A first list of shops and a price layout',
      'A demo page with sample prices',
    ],
  },
];
