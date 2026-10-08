/**
 * The words of the five guides, written for this site.
 *
 * A lazy data file (LAZY_CONTENT_MODULES in scripts/dataFiles.ts): the build
 * compiles this module and writes GUIDE_BODIES out as JSON, which the page
 * fetches the first time a guide is opened (demo/contentPages.ts). Nothing in
 * the main bundle imports it. The slugs, titles and descriptions are in
 * demo/guideList.ts; tests/contentPages.test.ts holds the two together.
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
 * Percentages for the strengths are the rule of thumb the trade uses, said to
 * be a rule of thumb. No law fixes them, and the guide says so.
 */
import type { Block } from '../contentPages.js';

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
};
