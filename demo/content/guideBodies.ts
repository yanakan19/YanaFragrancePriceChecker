/**
 * The words of the thirteen guides, written for this site.
 *
 * A lazy data file (LAZY_CONTENT_MODULES in scripts/dataFiles.ts): the build
 * compiles this module and writes GUIDE_BODIES out as JSON, which the page
 * fetches the first time a guide is opened (demo/contentPages.ts). Nothing in
 * the main bundle imports it. The slugs, titles and descriptions are in
 * demo/guideList.ts; tests/contentPages.test.ts holds the two together.
 *
 * The first five guides are about perfume in general. The eight after them
 * (from 'which-shops-we-compare') are about how this site works. Their figures
 * are worked out here, when the site is built, from the same records the rest
 * of the site reads, and never typed in: the shop list is counted by
 * shopFacts below (tests/contentPages.test.ts feeds it a made up list), the
 * days a price is shown for are HIDE_OFFER_AFTER_DAYS, and the size of a drop
 * that sends a price alert is DROP_FRACTION and DROP_MIN_GBP. A worked example
 * (a £26 bottle) says it is one, and tests/contentPages.test.ts runs its sum.
 *
 * Rules, all held by that test:
 *   - 300 to 500 words each, the opening line included, in short paragraphs
 *     under at least three headings;
 *   - plain British English, no hyphens or dashes in what a reader sees;
 *   - headings in Title Case, as everywhere on the site, and no colons in them;
 *   - original wording, and only claims that are true of perfume in general
 *     (hedged where they vary: "usually", "often", "roughly") or of this site,
 *     where each mention says what the code does;
 *   - no medical or legal advice, and no shop or brand named as bad;
 *   - links only to addresses the router knows and the catalogue has: a
 *     strength filter, a note, a size band, a tab, another guide.
 *
 * What the site claims about itself, and where the code makes it true:
 *   - an EDT is never compared with an EDP: matchKey, src/catalogue/productMatch.ts
 *     (house, size, strength and the words of the name must all agree);
 *   - delivery is included where the shop states it, and the row says what was
 *     added: offerRow in demo/app.ts;
 *   - a listing whose title says Tester is left out: NOT_A_FRAGRANCE,
 *     src/catalogue/fragranceId.ts; one marked Unboxed keeps the word in its
 *     name and so is never merged with the boxed bottle (rawTitlesAgree and
 *     matchKey, productMatch.ts);
 *   - notes are only those the shops publish: Notes in demo/catalogue.generated.ts;
 *   - the layer buttons count fragrances per layer: noteView in demo/app.ts;
 *   - the Oils tab shows and sorts by price per ml: oilTileLine in demo/app.ts,
 *     OIL_SORT_OPTIONS in demo/listSort.ts;
 *   - the terms say authenticity cannot be guaranteed: "The Shops We List",
 *     demo/legal.ts.
 *
 * And for the eight guides about the site itself:
 *   - Which Shops We Compare: the shop list, src/config/retailers.ts (enabled
 *     shops, singleBrandOnly, tiers, shipping, affiliate.status), counted by
 *     shopFacts; a house's own shop is left out of the Shops tab (retailersPanel,
 *     demo/app.ts) and off Today's Deals (SINGLE_BRAND_ONLY_IDS,
 *     scripts/build-deals.ts); a shop's page lists its delivery lines
 *     (deliveryLines, demo/deliveryFacts.ts); only standard delivery is
 *     modelled and membership perks are never counted (src/services/shipping.ts);
 *   - How We Tidy Perfume Notes: data/note-aliases.json, applied by the build
 *     (src/catalogue/noteAliases.ts, scripts/build-demo-catalogue.ts): six
 *     kinds of alias, a reviewed append only list, a keepApart list; an old
 *     address opens the note it became (NOTE_NAMES, demo/data.ts); notes are
 *     only those the shops publish (tidyNotes, demo/data.ts); the 16 groups,
 *     in order, and the one group of each note (data/note-groups.json,
 *     createNoteGrouper, src/catalogue/noteGroups.ts); the icons are original
 *     drawings (the author line of data/note-icons-manifest.json) and a note
 *     with none shows its group's (noteTile, demo/notesPage.ts); the sticky bar
 *     of group chips with counts, "See all", and a search that also reads
 *     other spellings (jumpBar, groupSection, noteMatches; demo/notesPage.ts,
 *     demo/notesData.ts). The page has no anchor for a group, so the guide
 *     links /notes only;
 *   - Why the Basket Price Can Differ: resolveDelivery and deliveredPrice,
 *     src/services/shipping.ts (a bottle on its own against the free delivery
 *     spend; a cheaper rate is never free); offerRow, rowStockMarks and
 *     STOCK_LABEL (Incl., Free Delivery, est., Last Price, Preorder, minimum
 *     order); offerGroups (Delivery Not Included, never Cheapest);
 *     offerAge and HIDE_OFFER_AFTER_DAYS;
 *   - How We Match the Same Bottle: matchKey, trustworthyEan, untrustworthyEans
 *     and settleBarcodeSizes, src/catalogue/productMatch.ts (size is compared
 *     as a number, so 100ml and 105ml differ; one vote a shop; a lone shop
 *     against two or more is read at their size; any other disagreement leaves
 *     the code out); resolveOunceListing, src/catalogue/ounceSizes.ts; a set's
 *     page names each shop's own title (shopTitleOf, demo/setPage.ts);
 *   - Sets and Oils Explained: SET_TITLE, NEVER_IN_A_SET, NOT_A_SET,
 *     src/catalogue/giftSet.ts; OIL_TITLE, NEVER_AN_OIL, OIL_STRENGTHS,
 *     src/catalogue/perfumeOil.ts; productKind, demo/productKind.ts; the tabs
 *     (itemsForTab, demo/app.ts); valueLine, demo/setPage.ts; giftSetBlock
 *     and oilBlock, demo/app.ts; the price per ml, oilTileLine;
 *   - How Deals Are Chosen: scripts/build-deals.ts (BUYABLE, SINGLE_BRAND_ONLY_IDS,
 *     bottles only, the cheapest qualifying offer), src/services/dealCandidates.ts
 *     (the maker's price first, a shop's own RRP otherwise, never above the
 *     maker's price), src/services/discount.ts (whole per cent, rounded down,
 *     nothing under one per cent, a countdown only from the shop's own closing
 *     time), bestDealPerScent, demo/oneScent.ts, dealsPanel and DEAL_SORT_OPTIONS
 *     (a photo is needed; three sorts);
 *   - Wishlists and Price Alerts: demo/wishlist.ts, demo/priceAlerts.ts,
 *     src/alerts/rules.ts (DROP_FRACTION, DROP_MIN_GBP, the baseline, the
 *     target), priceAlertsSectionHtml and wishlistListHtml, demo/app.ts, and
 *     the privacy notice in demo/legal.ts. No claim goes beyond that notice;
 *   - Reading the Price History Chart: demo/priceHistoryChart.ts (the line,
 *     HISTORY_SCOPES, the hollow, grey and square points, the caption, the y
 *     axis that does not start at zero).
 *
 * Percentages for the strengths are the rule of thumb the trade uses, said to
 * be a rule of thumb. No law fixes them, and the guide says so.
 */
import type { Block } from '../contentPages.js';
import type { Retailer } from '../../src/types/retailer.js';
import { RETAILERS } from '../../src/config/retailers.js';
import { HIDE_OFFER_AFTER_DAYS } from '../../src/services/offerAge.js';
import { DROP_FRACTION, DROP_MIN_GBP } from '../../src/alerts/rules.js';
import { DEFAULT_REGION } from '../../src/config/regions.js';
import { formatMoney, formatMoneyShort } from '../../src/services/money.js';

/**
 * Money as a shop states it in a sentence (£25 for a whole number, £3.95
 * otherwise), through the one money formatter in pounds: these guides are
 * written for UK readers, and tests/moneyGuard.test.ts allows no new typed £.
 */
const gbp = (v: number): string => formatMoneyShort(v, DEFAULT_REGION);
/** The same to the penny, as a row prints it: £4.00. */
const gbpExact = (v: number): string => formatMoney(v, DEFAULT_REGION);
const shopsOf = (n: number): string => `${n} ${n === 1 ? 'shop' : 'shops'}`;

/**
 * What 'which-shops-we-compare' says, counted from a shop list: the shops
 * switched on, how many are one house's own shop, which kinds of house a shop
 * is worth asking about, and the delivery rules (the same fields the shop
 * pages print, demo/deliveryFacts.ts). Passed the list so a test can change it.
 */
export function shopFacts(all: readonly Retailer[]) {
  const on = all.filter((r) => r.enabled);
  const free = on.filter((r) => r.shipping.standardGbp === 0);
  const unstated = on.filter((r) => r.shipping.standardGbp === null);
  const paid = on.filter((r) => r.shipping.standardGbp !== null && r.shipping.standardGbp > 0);
  const waived = paid.filter((r) => r.shipping.freeOverGbp !== null && r.shipping.freeOverGbp > 0);
  const range = (values: number[]) => ({ low: Math.min(...values), high: Math.max(...values) });
  return {
    shops: on.length,
    ownShops: on.filter((r) => r.singleBrandOnly).length,
    designer: on.filter((r) => r.tiers.includes('designer')).length,
    niche: on.filter((r) => r.tiers.includes('niche')).length,
    midEast: on.filter((r) => r.tiers.includes('mideast')).length,
    free: free.length,
    unstated: unstated.length,
    paid: paid.length,
    paidRange: paid.length > 0 ? range(paid.map((r) => r.shipping.standardGbp!)) : null,
    waived: waived.length,
    waivedRange: waived.length > 0 ? range(waived.map((r) => r.shipping.freeOverGbp!)) : null,
    members: on.filter((r) => r.shipping.membershipPerk).length,
    days: on.length > 0 ? { low: Math.min(...on.map((r) => r.shipping.estimatedDays[0])), high: Math.max(...on.map((r) => r.shipping.estimatedDays[1])) } : null,
    confirmed: on.filter((r) => r.shipping.confidence === 'confirmed').length,
    commission: on.filter((r) => r.affiliate.status === 'active').length,
  };
}

export function shopsGuide(all: readonly Retailer[]): Block[] {
  const f = shopFacts(all);
  const delivery: string[] = [];
  if (f.free > 0) delivery.push(`Free on every order: ${shopsOf(f.free)}.`);
  if (f.paidRange) {
    delivery.push(
      `A standard charge, from ${gbp(f.paidRange.low)} to ${gbp(f.paidRange.high)}: ${shopsOf(f.paid)}.` +
        (f.waivedRange ? ` Of those, ${f.waived} waive it once you spend between ${gbp(f.waivedRange.low)} and ${gbp(f.waivedRange.high)}, depending on the shop.` : ''),
    );
  }
  if (f.unstated > 0) {
    delivery.push(`No standard charge stated, or none we could establish: ${shopsOf(f.unstated)}. Their rows sit apart, under Delivery Not Included, and are never called Cheapest.`);
  }
  if (f.members > 0) {
    delivery.push(`A membership scheme with delivery perks: ${shopsOf(f.members)}. We note the perk but never count it, because you cannot use one without joining.`);
  }
  return [
    { t: 'h', x: 'The Shops Behind the Prices' },
    {
      t: 'p',
      x: `Our shop list has ${f.shops} UK ${f.shops === 1 ? 'shop' : 'shops'} switched on, and we ask each one for its prices. Nobody types that figure in. It is counted from the list whenever the site is built, so it moves as shops are added or switched off.`,
    },
    {
      t: 'p',
      x: 'Every shop is an established stockist that sells to UK customers and shows its prices in pounds. The [Shops tab](/retailers) lists those with a current price, and our page on [how we check prices](/about/how-we-check-prices) explains how each price is read.',
    },
    { t: 'h', x: 'Many Houses or Just One' },
    {
      t: 'p',
      x: `Of the ${f.shops}, ${f.shops - f.ownShops} sell many fragrance houses side by side. The other ${f.ownShops} are one house’s own shop, a maker selling its own range. Those are reached from the house’s own page, which you open from the [Brands page](/brands), not from the Shops tab. They are also kept off Today’s Deals, because a house discounting its own line is not a market comparison.`,
    },
    {
      t: 'p',
      x: `We also note which kinds of house a shop is worth asking about: ${f.designer} for designer houses, ${f.niche} for niche ones and ${f.midEast} for Middle Eastern ones. Many shops cover more than one.`,
    },
    { t: 'h', x: 'What Delivery Looks Like' },
    {
      t: 'p',
      x: 'Each shop sets its own terms, and we record only its standard UK delivery. Across the shops, that works out as:',
    },
    { t: 'ul', x: delivery },
    ...(f.days
      ? [
          {
            t: 'p' as const,
            x: `Delivery windows run from about ${f.days.low} to ${f.days.high} working days, depending on the shop. ${f.confirmed} of the ${f.shops} sets of terms have been confirmed from the shop itself. Where they have not, the row says est. beside its delivery.`,
          },
        ]
      : []),
    { t: 'h', x: 'Seeing One Shop’s Terms' },
    {
      t: 'p',
      x: 'Open any shop from the [Shops tab](/retailers) to read its delivery lines in full: the standard charge, the spend for free delivery, where we read its terms from and how long it usually takes. To see why a basket can still differ, read [why the basket price can differ](/guides/why-the-basket-price-can-differ).',
    },
    { t: 'h', x: 'Commission and Order' },
    {
      t: 'p',
      x: `We earn a commission when you buy after clicking through to ${f.commission} of the ${f.shops} shops. It never changes the order of results, which is stock first and then price.`,
    },
  ];
}

/** The worked example in 'why-the-basket-price-can-differ': a shop that charges £3.95 below a £30 spend, and a £26 bottle. */
const EXAMPLE_CHARGE = 3.95;
const EXAMPLE_SPEND = 30;
const EXAMPLE_BOTTLE = 26;

export const GUIDE_BODIES: Record<string, Block[]> = {
  'perfume-strengths-explained': [
    { t: 'h', x: 'What the Names Mean' },
    {
      t: 'p',
      x: 'A perfume’s strength, or concentration, is how much perfume oil is blended into the alcohol and water in the bottle. More oil usually means a scent that lasts longer, and a higher price for the same size. From lightest to strongest, the common names are:',
    },
    {
      t: 'ul',
      x: [
        'Eau de Cologne (EDC): roughly 2 to 5 per cent oil. Light and brief.',
        'Eau de Toilette (EDT): roughly 5 to 15 per cent. Bright and easy, often chosen for daytime and warm weather.',
        'Eau de Parfum (EDP): roughly 15 to 20 per cent. A popular choice for an everyday signature scent.',
        'Parfum or Extrait de Parfum: roughly 20 to 30 per cent. Rich, so a little is usually enough.',
      ],
    },
    {
      t: 'note',
      x: 'These figures are a rule of thumb. No law fixes them, and each house decides what to print on its box, so one house’s EDT can last longer than another’s EDP.',
    },
    { t: 'h', x: 'Two Strengths, Two Perfumes' },
    {
      t: 'p',
      x: 'The same name in two strengths is often a different composition, not the same scent turned up. Perfumers adjust a formula to suit the amount of oil, so the EDT and the EDP of one fragrance can smell quite different. If you love one, smell the other before you buy it.',
    },
    {
      t: 'p',
      x: 'Words such as Intense, Elixir or Absolu are a house’s own naming. They suggest a richer version but say nothing exact about the oil, so read the strength printed after the name.',
    },
    { t: 'h', x: 'Choosing a Strength' },
    {
      t: 'ul',
      x: [
        'For hot days, the office or a first try, an EDT or an EDC is a gentle start.',
        'For evenings, colder months or a long day, many people prefer an EDP.',
        'For special occasions, or if you like to wear only a touch, try a Parfum or an Extrait.',
      ],
    },
    {
      t: 'p',
      x: 'Your skin, the weather and how many sprays you use matter as much as the label.',
    },
    { t: 'h', x: 'Strength and Price' },
    {
      t: 'p',
      x: 'At the same size, a stronger version usually costs more, though you may need fewer sprays. The fair comparison is the same fragrance, in the same size and the same strength.',
    },
    {
      t: 'p',
      x: 'PriceSniffs lines shops up by that rule, so an EDT is never compared with an EDP. Our page on [how we check prices](/about/how-we-check-prices) explains the matching.',
    },
    { t: 'h', x: 'Browse by Strength' },
    {
      t: 'p',
      x: 'Each of these opens the full list with that strength already chosen: [Eau de Cologne](/fragrances?strength=edc), [Eau de Toilette](/fragrances?strength=edt), [Eau de Parfum](/fragrances?strength=edp) or [Parfum and Extrait](/fragrances?strength=parfum). Parfum and Extrait share one filter, because the two names mark the same level.',
    },
    {
      t: 'p',
      x: 'Perfume oils are a different format again and have their own [Oils tab](/oils). If you already know a house you like, open it from the [Brands page](/brands) and use the Concentration filter there.',
    },
  ],

  'perfume-notes-explained': [
    { t: 'h', x: 'Three Layers, One Scent' },
    {
      t: 'p',
      x: 'Perfumers describe a fragrance in notes. A note is a smell you can name, such as bergamot, rose or vanilla. Notes are usually grouped into three layers by how quickly they fade, so what you smell at the first spray is not what you smell a few hours later.',
    },
    {
      t: 'p',
      x: 'That gradual change is a large part of a perfume’s character, and it is why a scent is worth wearing for a while before you judge it.',
    },
    { t: 'h', x: 'Top Notes Come First' },
    {
      t: 'p',
      x: 'These are the light ingredients you notice straight away, such as citrus, fresh herbs and some fruits. They fade first, often within the first half hour. That is why a quick sniff from a paper strip can mislead: you have only met the opening. [Bergamot](/notes/bergamot?layer=top) is a classic top note.',
    },
    { t: 'h', x: 'Middle Notes Are the Heart' },
    {
      t: 'p',
      x: 'As the top fades, the heart comes through and stays for a few hours. Flowers, spices and green notes often sit here, such as [rose](/notes/rose?layer=middle) and jasmine. This is what most people mean when they describe what a perfume smells like.',
    },
    { t: 'h', x: 'Base Notes Stay Longest' },
    {
      t: 'p',
      x: 'Heavier ingredients such as woods, resins, musk, amber and [vanilla](/notes/vanilla?layer=base) last longest and can linger on clothes into the next day. They also give the lighter notes something to rest on, which is one reason a fragrance with a strong base tends to last.',
    },
    { t: 'h', x: 'Reading a Notes List' },
    {
      t: 'ul',
      x: [
        'A notes list is a guide, not a recipe. Brands often name the impression they want to create, not every ingredient.',
        'Shops do not always agree on which layer a note belongs to. On a note’s page here, the layer buttons show how many fragrances list it in each layer.',
        'A long list does not mean a better scent. Many well loved fragrances are built on a handful of notes.',
      ],
    },
    { t: 'h', x: 'Using Notes to Shop' },
    {
      t: 'p',
      x: 'If you love a scent, look at its notes and pick out the ones you enjoy most. Open [all notes](/notes), choose one, and pick a layer to find fragrances that open or finish that way. We show only the notes the shops themselves publish, and we never guess them.',
    },
    {
      t: 'note',
      x: 'Notes are a map, not a promise. How a scent wears depends on your skin and the weather, so trying a small amount first is often wise. See [decants, testers and miniatures](/guides/decants-and-testers).',
    },
  ],

  'compare-perfume-prices-per-ml': [
    { t: 'h', x: 'The One Sum' },
    {
      t: 'p',
      x: 'Divide the price by the size in millilitres. That gives the cost of each ml, and it is the fairest way to put a 50ml bottle beside a 100ml one.',
    },
    {
      t: 'p',
      x: 'Say a 50ml bottle costs £60. That is £1.20 per ml. A 100ml bottle of the same scent costs £85, which is £0.85 per ml. The larger bottle is cheaper for every ml, even though you pay £25 more at the till.',
    },
    { t: 'h', x: 'Add Delivery First' },
    {
      t: 'p',
      x: 'Work out the total you will pay, then divide. A £4 delivery charge hardly matters on a large bottle, but on a 10ml bottle at £26 it makes the total £30, or £3.00 per ml. Many shops deliver free above a set spend, so adding a second item can change the answer.',
    },
    {
      t: 'p',
      x: 'On PriceSniffs, each shop’s price includes its standard UK delivery where the shop states it, and the row says what was added.',
    },
    { t: 'h', x: 'Check It Is the Same Thing' },
    {
      t: 'ul',
      x: [
        'Same strength. The EDT and the EDP of one name are different perfumes. See [perfume strengths explained](/guides/perfume-strengths-explained).',
        'Same kind of item. A gift set, a miniature or an oil is not the same as a single boxed bottle, and a set may hold more than perfume.',
        'Same unit. Some shops give sizes in ounces: 1.7 oz is about 50ml and 3.4 oz is about 100ml.',
      ],
    },
    { t: 'h', x: 'When a Small Size Makes Sense' },
    {
      t: 'p',
      x: 'Small bottles usually cost more per ml, and that can be fine when you are not sure you will love a scent, you are travelling, or you like to rotate a few. A 10ml or 30ml bottle is a cheaper way to try before committing to 100ml.',
    },
    {
      t: 'p',
      x: 'Price per ml is a tool, not a rule. A bargain 200ml you never wear costs more than a 30ml you reach for every week.',
    },
    { t: 'h', x: 'Doing It on PriceSniffs' },
    {
      t: 'p',
      x: 'Use the Size filter to compare like with like, for example [30 to 70ml](/fragrances?size=30-70) or [70 to 120ml](/fragrances?size=70-120). Open any house from the [Brands page](/brands) to see every size it sells in one list.',
    },
    {
      t: 'p',
      x: 'Oils come in so many sizes that the [Oils tab](/oils?sort=ml-low) shows the price per ml at the cheapest shop on every tile, and can sort by it.',
    },
    {
      t: 'note',
      x: 'A quick check for any bottle: the price in pounds divided by the size in ml. Keep that figure in mind and offers become much easier to judge.',
    },
  ],

  'spot-fake-or-grey-market-perfume': [
    { t: 'h', x: 'Fake and Grey Market Are Different' },
    {
      t: 'p',
      x: 'A fake, or counterfeit, is made to look like a brand’s perfume without the brand’s involvement. Nobody can tell you what is in it or how it was made.',
    },
    {
      t: 'p',
      x: 'A grey market bottle is genuine, made by the brand, but sold outside the brand’s chosen channels, often bought abroad and imported by a third party. It is not a fake. Its box, language or batch may differ from the UK version, and the brand may not help if something is wrong with it.',
    },
    { t: 'h', x: 'Warning Signs Before You Buy' },
    {
      t: 'ul',
      x: [
        'A price far below every other shop. If most shops sit between £70 and £80 and one asks £30, ask why.',
        'Thin seller details: no company name, no UK address, no returns policy.',
        'A seller you cannot trace, such as an anonymous marketplace account or a social media post.',
        'Photos that are plainly not of the item, or look copied from elsewhere.',
      ],
    },
    { t: 'h', x: 'Checks When It Arrives' },
    {
      t: 'ul',
      x: [
        'The box. Look for sharp printing, correct spelling, neat cellophane and clean edges, and compare it with the pictures on the brand’s own website.',
        'The batch code. Most brands print a code on the box and on the bottle, and the two usually match. A missing or mismatched code is worth raising with the seller.',
        'The bottle. Look for even glass, a cap that fits well and a sprayer that gives a fine mist.',
        'The smell. A harsh opening or a scent that fades within minutes can be a sign, but it is the weakest test, because batches and skin vary.',
      ],
    },
    { t: 'h', x: 'Protect Your Money' },
    {
      t: 'ul',
      x: [
        'Buy from shops that name their company, give an address and have a clear returns policy.',
        'Paying by credit card can give you extra protection if something goes wrong. Citizens Advice explains when it applies.',
        'Keep the receipt and the packaging until you are happy.',
        'If you think you have a fake, contact the seller first, then your card provider. You can also report it to Trading Standards through Citizens Advice.',
      ],
    },
    { t: 'h', x: 'What We Can and Cannot Tell You' },
    {
      t: 'p',
      x: 'We compare prices from established UK shops that sell to UK customers, and we leave out marketplaces where the seller can change. But we never handle the bottles, and our terms say we cannot guarantee the authenticity of what a shop sells.',
    },
    {
      t: 'p',
      x: 'A very low price here is a reason to look closer, not a promise. See [how we check prices](/about/how-we-check-prices) and the [shops we compare](/retailers).',
    },
  ],

  'decants-and-testers': [
    { t: 'h', x: 'Three Ways to Try or Pay Less' },
    {
      t: 'ul',
      x: [
        'A tester is a bottle made for shop counters so customers can try the scent. It usually comes in a plain box or none, sometimes without a cap, and is often sold for less than the boxed bottle.',
        'A miniature is a small bottle made and sealed by the brand itself, sold on its own or as part of a set.',
        'A decant is a small amount poured from a full bottle into a vial or atomiser by someone other than the brand, and sold by an independent seller.',
      ],
    },
    { t: 'h', x: 'Buying a Tester' },
    {
      t: 'ul',
      x: [
        'Read the listing. A tester should say so, and say what comes with it.',
        'Read the returns policy. Some shops will not take back an unboxed bottle.',
        'Think about gifts. A tester without a retail box suits your own shelf better than a present.',
      ],
    },
    {
      t: 'p',
      x: 'On PriceSniffs, a listing whose title says Tester is left out, and one marked Unboxed is kept apart from the boxed bottle, so the two prices are never mixed up.',
    },
    { t: 'h', x: 'Decants Carry Risks' },
    {
      t: 'p',
      x: 'The brand has not made, checked or sealed a decant, so you are trusting the person who filled it. The label could be wrong, the source bottle could be old, or the liquid could have been spoiled by heat or light.',
    },
    {
      t: 'p',
      x: 'A decant also usually costs more per ml than the bottle it came from. What you save is the smaller total, not the price of each ml.',
    },
    {
      t: 'ul',
      x: [
        'Ask which bottle it came from, when it was filled and how it was stored.',
        'Buy from a seller with a track record and a returns policy.',
        'Keep it somewhere cool and dark.',
      ],
    },
    { t: 'h', x: 'A Safer Way to Sample' },
    {
      t: 'p',
      x: 'Some houses sell discovery sets: several small, sealed bottles of different scents. Open a house from the [Brands page](/brands) to see what it offers, look through the [Sets tab](/sets), which includes miniature and discovery sets, or browse [bottles under 15ml](/fragrances?size=0-15).',
    },
    {
      t: 'p',
      x: 'Before buying a full bottle, wear a sample for a whole day, since a scent changes over several hours (see [how perfume notes work](/guides/perfume-notes-explained)).',
    },
    {
      t: 'note',
      x: 'We compare prices for bottles, sets and oils from UK shops. We do not sell decants and we do not recommend any decant seller.',
    },
  ],

  // The eight guides about how this site works. Where a figure comes from the
  // shop list or a constant, it is worked out here (see the header).
  'which-shops-we-compare': shopsGuide(RETAILERS),

  'how-we-tidy-perfume-notes': [
    { t: 'h', x: 'One Ingredient, One Name' },
    {
      t: 'p',
      x: 'Shops write the same ingredient in many ways. One lists Cedarwood and another Cedar, one Cassis and another Blackcurrant, one Mandarin Orange and another Mandarin. Left alone, each spelling would be a note of its own, and a search for one would miss the fragrances filed under the other.',
    },
    {
      t: 'p',
      x: 'So we keep a reviewed list of spellings that mean the same ingredient, well over a thousand of them, and show each under one name everywhere. A fragrance that listed two spellings of one ingredient shows it once.',
    },
    { t: 'h', x: 'What Counts as the Same' },
    {
      t: 'ul',
      x: [
        'Plurals and word order. Musks is Musk, and Pepper Pink is Pink Pepper.',
        'Spellings. Cardamon is Cardamom, and Lavander is Lavender.',
        'Forms. Rose Absolute is Rose.',
        'Countries. Italy Lemon is Italian Lemon.',
        'Two names for one material. Cassis is Blackcurrant, and Oudh is Oud.',
      ],
    },
    {
      t: 'p',
      x: 'Each pair was reviewed first, and nothing is merged on a guess. The list only grows: an entry is never removed or pointed somewhere else. A saved link to Cedarwood still opens Cedar.',
    },
    { t: 'h', x: 'What We Keep Apart' },
    {
      t: 'p',
      x: 'Some notes look alike but are different materials, so they stay separate. Blackcurrant is the fruit and Blackcurrant Leaf is not. Musk and White Musk are different notes, and Orange is not Bitter Orange.',
    },
    { t: 'h', x: 'Sixteen Groups' },
    {
      t: 'p',
      x: 'On the [Notes page](/notes) every note sits in one group only, our own way of sorting what the shops publish. The 16 run roughly from the lightest scents to the heaviest:',
    },
    {
      t: 'ul',
      x: [
        'Fresh Air and Water: Salt, Sea Water.',
        'Citrus: Bergamot, Lemon.',
        'Herbs and Greens: Lavender, Mint.',
        'Fruits and Berries: Pear, Raspberry.',
        'Flowers: Rose, Iris.',
        'White Flowers: Jasmine, Tuberose.',
        'Spices: Cardamom, Saffron.',
        'Sweet and Gourmand: Vanilla, Coffee, Tea.',
        'Drinks and Spirits: Rum, Cognac.',
        'Woods: Sandalwood, Cedar.',
        'Earth and Moss: Patchouli, Vetiver.',
        'Resins and Incense: Benzoin, Frankincense.',
        'Musk and Amber: Musk, Ambergris.',
        'Leather and Smoke: Leather, Tobacco.',
        'Modern Accords and Aldehydes: Aldehydes, Hedione.',
        'More Notes: those we have not placed yet.',
      ],
    },
    { t: 'h', x: 'Our Own Drawings' },
    {
      t: 'p',
      x: 'Every icon is our own drawing, not a stock image or a picture from another site. A note without a drawing of its own shows its group’s icon.',
    },
    { t: 'h', x: 'Finding a Note' },
    {
      t: 'p',
      x: 'A bar of group chips stays in view as you scroll, and each chip counts the notes in its group. Tap one to jump to that group, or choose See all to open the whole group.',
    },
    {
      t: 'p',
      x: 'Type in the search box to narrow the tiles. It also finds a note by another spelling, so Cedarwood finds Cedar, and the chips then count only the matches.',
    },
    { t: 'h', x: 'Using Notes to Shop' },
    {
      t: 'p',
      x: 'Tidying changes the spelling, not the list. We show only the notes the shops publish, and we never add one. Browse [all notes](/notes), open [Cedar](/notes/cedar) or [Blackcurrant](/notes/blackcurrant), and read [how perfume notes work](/guides/perfume-notes-explained) for what top, middle and base mean.',
    },
  ],

  'why-the-basket-price-can-differ': [
    { t: 'h', x: 'What a Row Price Includes' },
    {
      t: 'p',
      x: `The price on a shop’s row is that shop’s price plus its standard delivery to a UK mainland address, wherever the shop states the charge. The line under it says what was added, for example Incl. ${gbp(EXAMPLE_CHARGE)} Delivery or Free Delivery.`,
    },
    {
      t: 'p',
      x: 'Where we have not confirmed a charge with the shop itself, the row says est. beside it. That is our best reading of the shop’s terms, not a figure anyone has promised you.',
    },
    { t: 'h', x: 'Free Delivery Depends on the Basket' },
    {
      t: 'p',
      x: 'We work out delivery for the bottle on its own. Most shops waive the charge once a basket passes a set spend, so a second item can change the answer.',
    },
    {
      t: 'p',
      x: `Say a shop charges ${gbp(EXAMPLE_CHARGE)} below ${gbp(EXAMPLE_SPEND)}. A ${gbp(EXAMPLE_BOTTLE)} bottle shows as ${gbp(EXAMPLE_BOTTLE + EXAMPLE_CHARGE)}. Add a second item, the basket passes ${gbp(EXAMPLE_SPEND)}, the delivery goes, and the bottle costs ${gbp(EXAMPLE_BOTTLE)}. A shop that looks dearer for one bottle can be cheaper for two.`,
    },
    {
      t: 'p',
      x: 'A lower delivery rate above a spend is still a charge, and we never show it as free. Where a shop sets a minimum order, the row says so when a bottle costs less than it.',
    },
    { t: 'h', x: 'When Delivery Is Not Included' },
    {
      t: 'p',
      x: 'Some shops publish no standard delivery charge. Their rows are listed apart, with the item price and + Delivery beside it. We never count a blank charge as nothing, so these rows can never be tagged Cheapest. Add the shop’s delivery in its own basket to see the total.',
    },
    { t: 'h', x: 'Sold Out and Last Price' },
    {
      t: 'p',
      x: 'A sold out row sits below the buyable ones, and its price is marked Last Price. That is the final price we saw, not one you can pay today. A Preorder row shows the shop’s current price for a bottle it has not started shipping. Neither is ever tagged Cheapest.',
    },
    { t: 'h', x: 'How Old a Price Can Be' },
    {
      t: 'p',
      x: `Every row ends with how long ago we last checked it, such as 9h or 1d. Prices change, and a shop can change one after our check. If a shop’s price has not been confirmed for more than ${HIDE_OFFER_AFTER_DAYS} days, we stop showing it.`,
    },
    {
      t: 'p',
      x: 'Members only rates and express options are left out, because not everyone has joined or wants to pay extra. Check the basket before you pay. For the rules in full, see [how we check prices](/about/how-we-check-prices).',
    },
    {
      t: 'note',
      x: 'Delivery changes the sums most on small bottles. See [comparing prices per ml](/guides/compare-perfume-prices-per-ml) for the one sum that sets two sizes side by side.',
    },
  ],

  'how-we-match-the-same-bottle': [
    { t: 'h', x: 'Why Matching Matters' },
    {
      t: 'p',
      x: 'A price comparison only works if the same bottle is compared with itself. Shops word their titles differently, put the words in another order or leave the size out, so two listings that look alike may be different products, and two that look different may be one.',
    },
    { t: 'h', x: 'Barcodes First' },
    {
      t: 'p',
      x: 'Shops often publish a barcode, called an EAN. When one passes the standard check, listings that share it are the same product. We ignore a code that fails the check, or that a shop prints on two different products, because it tells us nothing reliable.',
    },
    {
      t: 'p',
      x: 'If two listings each carry a real barcode and the codes differ, we never merge them, however alike they look. A barcode is the maker saying these are different articles, and that outranks our own reading of names.',
    },
    { t: 'h', x: 'Names and Sizes' },
    {
      t: 'p',
      x: 'With no barcode to go on, the brand, the size, the strength and the words of the name must all agree. Word order does not matter, because shops write one name in several orders.',
    },
    {
      t: 'p',
      x: 'Size is compared as a number. A 100ml and a 105ml bottle of one name are different products, and so are a 50ml and a 60ml. Both of the first pair sit in the [70 to 120ml](/fragrances?size=70-120) band, yet stay separate.',
    },
    {
      t: 'p',
      x: 'Some shops give ounces only. We convert to millilitres, and use the usual bottle size, 100ml for 3.4 oz, only where the same product is sold at that size elsewhere. Otherwise the plain conversion stands.',
    },
    { t: 'h', x: 'When Shops Disagree About Size' },
    {
      t: 'p',
      x: 'Now and then shops sell one barcode at different sizes. The size most shops state wins, each shop having one vote, and a shop alone against two or more is read at their size.',
    },
    {
      t: 'p',
      x: 'Any other disagreement, such as one shop against one, leaves the barcode out for that listing, and it is matched by name and size instead. We would rather leave a price unmatched than show it against a size its shop did not state, on one other shop’s word.',
    },
    { t: 'h', x: 'Why a Shop’s Title May Differ' },
    {
      t: 'p',
      x: 'The name on a product page is ours, tidied from what shops publish, so it may not match a shop’s own title word for word. A set sold by two or more shops shows how each lists it.',
    },
    {
      t: 'p',
      x: 'A listing marked Unboxed keeps that word in its name, so it never joins the boxed bottle, and a listing whose title says Tester is left out. A set is matched only with the same set, never with a single bottle.',
    },
    { t: 'h', x: 'If a Match Looks Wrong' },
    {
      t: 'p',
      x: 'A match can occasionally be wrong. Use Spotted a Wrong Price? Tell Us on the product page, or the form on the [About page](/about). The wider method is in [how we check prices](/about/how-we-check-prices).',
    },
  ],

  'sets-and-oils-explained': [
    { t: 'h', x: 'What Counts as a Set' },
    {
      t: 'p',
      x: 'A set is a listing that says it holds several things and includes a fragrance. Its title may say gift set, coffret, bundle, duo or trio, a number of pieces, or a count against a size such as 3x10ml, or it may join a fragrance to a companion such as a body wash. Miniature and discovery sets count too.',
    },
    {
      t: 'p',
      x: 'Testers, samples, decants, empty bottles, refill atomisers and candles never count. A scent that merely has the word in its name, such as Set Sail, is one bottle, and so is one sold with its presentation box.',
    },
    { t: 'h', x: 'What Counts as an Oil' },
    {
      t: 'p',
      x: 'An oil is a listing that says so in words, such as perfume oil, perfumed oil or roll on oil, and states a size. A shop’s own Attar category counts too. The bare word oil is not enough, because body, hair, face and bath oils use it too, and they are left out.',
    },
    {
      t: 'p',
      x: 'On an oil’s page, a format such as roll on or dropper, and alcohol free, appear only where a shop said so, and the page names that shop.',
    },
    { t: 'h', x: 'Kept Out of the Bottle Lists' },
    {
      t: 'p',
      x: 'Sets and oils have their own tabs, [Sets](/sets) and [Oils](/oils). The All Fragrances list and each brand’s page show bottles only, and the Most Stocked list leaves both out. A product that is both counts as a set.',
    },
    { t: 'h', x: 'Prices Within Their Own Kind' },
    {
      t: 'p',
      x: 'A set’s price is compared only with the same set at other shops, never with a single bottle. An oil is compared only with the same oil. Oils come in many sizes, so each tile on the [Oils tab](/oils?sort=ml-low) shows the price per ml at the cheapest shop, and the tab can sort by it.',
    },
    { t: 'h', x: 'The Value Line on a Set Page' },
    {
      t: 'p',
      x: 'Where a set’s main bottle is exactly one bottle in our list and one shop has both in stock, the set’s page gives two prices from that shop: the set, and the bottle alone. Both are item prices, so the shop’s own quirks cancel out.',
    },
    {
      t: 'p',
      x: 'It never works out a percentage or calls the gap a saving, because a set can cost more than the bottle alone. The page shows both figures and leaves you to judge what the extras are worth.',
    },
    { t: 'h', x: 'Reading What Is in a Set' },
    {
      t: 'p',
      x: 'A set’s contents are read from the shop’s title. Where the title does not spell them out, the page shows the shop’s own wording under As the shop lists it, not a guess. For small sizes, see [decants, testers and miniatures](/guides/decants-and-testers).',
    },
  ],

  'how-deals-are-chosen': [
    { t: 'h', x: 'What Counts as a Deal' },
    {
      t: 'p',
      x: 'A deal is a bottle with a genuine reduction at a shop that has it in stock. An offer is considered only if it is in stock or low stock. Sold out, preorder and unconfirmed rows never qualify, because a deal asks you to buy something you can buy today.',
    },
    { t: 'h', x: 'What a Saving Is Measured Against' },
    {
      t: 'p',
      x: 'If the maker also sells the fragrance here and a shop undercuts the maker’s own price, the saving is measured against the maker’s price, and the tile names the maker. Otherwise it is measured against the shop’s own published recommended retail price, shown as RRP.',
    },
    {
      t: 'p',
      x: 'A shop’s RRP counts only when the rest of the market backs it up, and never when it sits above the maker’s price for the same bottle. Neither figure is one we make up.',
    },
    { t: 'h', x: 'How the Percentage Is Worked Out' },
    {
      t: 'p',
      x: 'The saving is worked from the price the product page shows, with delivery included where the shop states it, and the percentage is rounded down. Less than one whole per cent is not shown as a deal. A tile that says Delivery Not Stated is working from the item price alone.',
    },
    { t: 'h', x: 'Which Offer and Which Size Win' },
    {
      t: 'p',
      x: 'For each bottle, the cheapest offer that qualifies is shown, rather than the deepest percentage. Where one scent comes in several sizes, the page keeps the best of them: the deepest saving, then the lower price, then the smaller bottle.',
    },
    { t: 'h', x: 'What Is Always Left Out' },
    {
      t: 'ul',
      x: [
        'Sets and oils. Only single bottles can be deals.',
        'A house’s own shop, because a house discounting its own line is not a market comparison.',
        'Fragrances with no photo we may show, since the page is built around pictures.',
        'Invented urgency. A countdown appears on a product page only when the shop has published a closing time.',
      ],
    },
    { t: 'h', x: 'How It Changes' },
    {
      t: 'p',
      x: 'The list is a snapshot, rebuilt whenever the catalogue is rebuilt after a crawl, so it does not reshuffle while you browse. Whether a shop pays us a commission plays no part in the choice. You pick the order: Best to Worst Saving, or by price, low to high or high to low.',
    },
    {
      t: 'p',
      x: 'A deal is not a promise. Prices change, so check the basket. Browse them on the [Deals page](/deals), and see [why the basket price can differ](/guides/why-the-basket-price-can-differ).',
    },
  ],

  'wishlists-and-price-alerts': [
    { t: 'h', x: 'An Account Is Optional' },
    {
      t: 'p',
      x: 'You can use PriceSniffs fully without an account. Making one takes an email address and a password, and a verification email confirms it. Once you are verified, the Save button on a product page adds a fragrance to your [wishlist](/account/wishlist).',
    },
    { t: 'h', x: 'What Your Wishlist Shows' },
    {
      t: 'p',
      x: `Each saved fragrance shows its cheapest delivered price today and the shop that has it. If we recorded a price on the day you saved it, the row also says how far the price has moved, for example Down ${gbpExact(4)} since saved at ${gbpExact(60)}. Where nothing is in stock, the row says so instead of a price.`,
    },
    {
      t: 'p',
      x: 'A saved fragrance that no shop lists right now is hidden until a shop lists it again, and nothing is deleted. You can sort the list, share a fragrance, and remove one at any time.',
    },
    { t: 'h', x: 'Price Alerts' },
    {
      t: 'p',
      x: 'Price Alerts are off until you tick the box on your [notifications page](/account/notifications). If the box is not there, the emails are not switched on yet. When they are on, we check once a morning and email you at most once a day.',
    },
    {
      t: 'p',
      x: `An email goes out when a saved fragrance’s cheapest delivered price has fallen by ${Math.round(DROP_FRACTION * 100)} per cent or ${gbp(DROP_MIN_GBP)}, whichever is more, since the last price we emailed you about or first noted, or when it reaches a target you set. Every email has a link that stops them at once.`,
    },
    { t: 'h', x: 'Target Prices' },
    {
      t: 'p',
      x: 'Once alerts are on, each wishlist row has an optional field for a target price. You are emailed when the price reaches it, having been above it before. A price that bounces up and down does not repeat the email, because we compare only with the last price we emailed you about.',
    },
    { t: 'h', x: 'What It Does Not Do' },
    {
      t: 'ul',
      x: [
        'It does not buy anything. You pay the shop, and we never see your card details.',
        'It does not promise that a price will fall or that a bottle will stay in stock.',
        'It skips a fragrance with nothing in stock, or whose best offer has no stated delivery cost, because there is no price to compare.',
        'Your searches and filters stay in your browser and are never sent to us.',
      ],
    },
    { t: 'h', x: 'Your Data' },
    {
      t: 'p',
      x: 'Your email, login, saved fragrances, target prices and alert choice are held by our account provider. You can download your data or delete your account from the account page. The [privacy notice](/about/legal#privacy) says what we keep and for how long.',
    },
  ],

  'reading-the-price-history-chart': [
    { t: 'h', x: 'What the Line Shows' },
    {
      t: 'p',
      x: 'Every product page has a Price History graph. The line follows the cheapest price recorded for that bottle, day by day, across the shops that have listed it. A new product has a short history, because the record starts when we first saw it.',
    },
    {
      t: 'p',
      x: 'Each point is a bottle price plus that shop’s delivery, worked out at today’s delivery rates. Delivery terms change, so an old point is the old bottle price delivered under today’s rule, not what delivery cost that day. The caption under the graph says the same.',
    },
    { t: 'h', x: 'Choosing a Range' },
    {
      t: 'p',
      x: 'The buttons above the graph show This Week, This Month and This Year. A fourth, All, appears only once a product’s own record runs to a year or more. The graph opens on the shortest range with a real trend in it, meaning two or more readings.',
    },
    {
      t: 'p',
      x: 'The price scale does not start at zero. The two labels at the side name the highest and lowest prices drawn, so a small move can look large. Read the labels before you read the slope.',
    },
    { t: 'h', x: 'What the Points Mean' },
    {
      t: 'ul',
      x: [
        'A single point is one reading, not a trend. A flat line after it means no change has been recorded since.',
        `A hollow point is an older price, from a shop we have not checked in the last ${HIDE_OFFER_AFTER_DAYS} days.`,
        'A grey point is the last price at a shop that was sold out. It appears only when nothing buyable is on record.',
        'A square point is an item price alone, because that shop states no delivery cost.',
        'A break in the line is a day with no price recorded. The line stops there instead of drawing a fall that never happened.',
      ],
    },
    { t: 'h', x: 'Using It Wisely' },
    {
      t: 'p',
      x: 'Touch or hover over a point to see its price, its shop and its date. Use the graph to judge whether today’s price is high or low for that bottle, not to guess what comes next. It records the past and predicts nothing.',
    },
    {
      t: 'p',
      x: 'To see why a shop’s total can still differ, read [why the basket price can differ](/guides/why-the-basket-price-can-differ), and for how prices are collected, [how we check prices](/about/how-we-check-prices).',
    },
  ],
};
