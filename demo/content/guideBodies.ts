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
 *   - 300 to 500 words each;
 *   - plain British English, no hyphens or dashes in what a reader sees;
 *   - original wording, and only claims that are true of perfume in general
 *     or of this site (each mention of the site says what the code does);
 *   - links only to addresses the router knows and the catalogue has: a
 *     strength filter, a note, a size band, a tab, another guide.
 *
 * Percentages for the strengths are the rule of thumb the trade uses, said to
 * be a rule of thumb. No law fixes them, and the guide says so.
 */
import type { Block } from '../contentPages.js';

export const GUIDE_BODIES: Record<string, Block[]> = {
  'perfume-strengths-explained': [
    { t: 'h', x: 'What the Letters Mean' },
    {
      t: 'p',
      x: 'A perfume’s strength, also called its concentration, is how much fragrance oil is mixed into the alcohol and water in the bottle. More oil usually means a richer scent that lasts longer and sits closer to the skin. It also usually means a higher price for the same size. The common names, from lightest to strongest, are:',
    },
    {
      t: 'ul',
      x: [
        'Eau de Cologne (EDC): roughly 2 to 5 per cent oil. Fresh and quick.',
        'Eau de Toilette (EDT): roughly 5 to 15 per cent. Bright and easy to wear, a favourite for daytime and warm weather.',
        'Eau de Parfum (EDP): roughly 15 to 20 per cent. The usual choice for a signature scent.',
        'Parfum or Extrait de Parfum: roughly 20 to 30 per cent. Rich, so a little goes a long way.',
      ],
    },
    {
      t: 'note',
      x: 'Those figures are a rule of thumb, not a rule. No law fixes them, and each house decides what to print on the box, so one house’s EDT can outlast another’s EDP.',
    },
    { t: 'h', x: 'Stronger Is Not Always Better' },
    {
      t: 'p',
      x: 'The same name in two strengths is often two different compositions, not one scent turned up. Perfumers rebalance a formula to suit the oil level, so an EDT and an EDP of one fragrance can smell noticeably different. If you love one, try the other before you buy it blind.',
    },
    {
      t: 'p',
      x: 'Words such as Intense, Elixir or Absolu are the house’s own naming. They hint at a bolder version but do not tell you a percentage, so always read the strength that follows the name.',
    },
    { t: 'h', x: 'Picking One' },
    {
      t: 'ul',
      x: [
        'For hot days, the office or a first try, choose an EDT or an EDC.',
        'For evenings, colder months, or a scent that has to last a long day, choose an EDP.',
        'For special occasions, or if you like to wear only a touch, choose a Parfum or Extrait.',
      ],
    },
    {
      t: 'p',
      x: 'Your skin, the weather and how many sprays you use matter as much as the label.',
    },
    { t: 'h', x: 'Strength and Price' },
    {
      t: 'p',
      x: 'At the same size, a stronger bottle costs more, but you may need fewer sprays. The fair way to compare prices is to compare the same fragrance, in the same size, in the same strength. This site follows the same rule when it lines shops up: an EDT is never set beside an EDP (see [how we check prices](/about/how-we-check-prices)).',
    },
    { t: 'h', x: 'Browse by Strength' },
    {
      t: 'p',
      x: 'Each of these opens the full list of bottles with that strength already chosen: [Eau de Toilette](/fragrances?strength=edt), [Eau de Parfum](/fragrances?strength=edp), [Parfum and Extrait](/fragrances?strength=parfum) and [Eau de Cologne](/fragrances?strength=edc). We keep Parfum and Extrait together because many houses use the two names for the same level. Perfume oils, which are sold differently from sprays, have their own [Oils tab](/oils). If you already know a house you like, start from the [Brands page](/brands) and use the Concentration filter there.',
    },
  ],

  'perfume-notes-explained': [
    { t: 'h', x: 'Three Layers, One Scent' },
    {
      t: 'p',
      x: 'Perfumers describe a fragrance as a pyramid of notes. A note is simply a scent you can name, such as bergamot, rose or vanilla. Notes are grouped by how quickly they fade, so the smell you get at the first spray is not the one you get three hours later. That slow change is the whole point of a good perfume.',
    },
    { t: 'h', x: 'Top Notes: the First Impression' },
    {
      t: 'p',
      x: 'These are the light, quick ingredients you notice straight away, such as citrus, fresh herbs and some fruit. They evaporate first, usually within the first half hour. They are why a spritz on a paper strip can mislead you: you have only met the opening. [Bergamot](/notes/bergamot?layer=top) is a classic top note.',
    },
    { t: 'h', x: 'Middle Notes: the Heart' },
    {
      t: 'p',
      x: 'As the top fades, the heart appears and lasts for a few hours. Flowers, spices and green notes live here, such as [rose](/notes/rose?layer=middle) and jasmine. This is the character of the scent and what most people mean when they say what a perfume smells like.',
    },
    { t: 'h', x: 'Base Notes: What Stays' },
    {
      t: 'p',
      x: 'Heavy, slow ingredients such as woods, resins, musk, amber and [vanilla](/notes/vanilla?layer=base) anchor the scent and linger longest, often into the next day on clothes. Base notes also hold the lighter ones in place, which is why a fragrance built on a strong base tends to last.',
    },
    { t: 'h', x: 'Reading a Notes List' },
    {
      t: 'ul',
      x: [
        'A list is a guide, not a recipe. Brands often name what they want you to imagine, not every ingredient.',
        'Shops do not always agree on which layer a note belongs to. The layer buttons on a note’s page on this site show how often shops file it under each one.',
        'A long list does not mean a better scent. Many loved fragrances are built on only a handful of notes.',
      ],
    },
    { t: 'h', x: 'Using Notes to Shop' },
    {
      t: 'p',
      x: 'If you love one scent, look at its notes and search for the ones that stand out to you. Open [all notes](/notes), pick one, and choose a layer to find fragrances that open, or finish, that way. We show only the notes the shops themselves publish, and we never guess them.',
    },
    {
      t: 'note',
      x: 'Notes are a map, not a promise. How a scent wears depends on your skin and the weather, so a small sample first is often wise. See [decants, testers and miniatures](/guides/decants-and-testers).',
    },
  ],

  'compare-perfume-prices-per-ml': [
    { t: 'h', x: 'The One Sum' },
    {
      t: 'p',
      x: 'Divide the price by the size in millilitres. That gives the cost of each ml, and it is the only fair way to put a 50ml bottle beside a 100ml one.',
    },
    {
      t: 'p',
      x: 'Say a 50ml bottle costs £60, which is £1.20 per ml. A 100ml bottle of the same scent costs £85, which is £0.85 per ml. The larger bottle is cheaper for every ml, though you pay £25 more at the till.',
    },
    { t: 'h', x: 'Add Delivery First' },
    {
      t: 'p',
      x: 'Work out the total you will pay, then divide. A £4 delivery charge hardly matters on a big bottle, but on a 10ml bottle at £26 it makes the total £30, or £3.00 per ml. Many shops waive delivery above a set spend, so adding a second item can change the answer. Prices on this site include standard UK delivery where the shop states it, and each row says what was added.',
    },
    { t: 'h', x: 'Make Sure It Is the Same Thing' },
    {
      t: 'ul',
      x: [
        'Same strength. An EDT and an EDP of one name are different perfumes. See [perfume strengths explained](/guides/perfume-strengths-explained).',
        'Same kind of item. A gift set, tester, miniature or oil is not the same as a boxed bottle, and a set may hold more than perfume.',
        'Same size in the same unit. Some shops list ounces: 1.7 oz is about 50ml and 3.4 oz is about 100ml.',
      ],
    },
    { t: 'h', x: 'When a Small Size Makes Sense' },
    {
      t: 'p',
      x: 'Small bottles cost more per ml, and that is fine when you are unsure you will love a scent, you are travelling, or you want a few to rotate. A 10ml or 30ml bottle is a cheap way to try before committing to 100ml. Price per ml is a tool, not a rule: a bargain 200ml you dislike costs more than a 30ml you wear every week.',
    },
    { t: 'h', x: 'Do It on PriceSniffs' },
    {
      t: 'p',
      x: 'Use the Size filter to compare like with like: [30 to 70ml](/fragrances?size=30-70) or [70 to 120ml](/fragrances?size=70-120). Open any house from the [Brands page](/brands) to see every size it sells in one list. On the [Oils tab](/oils?sort=ml-low), each tile shows the price per ml at the cheapest shop, and you can sort by it, because oils come in so many different sizes.',
    },
    {
      t: 'note',
      x: 'A quick check on any bottle: price in pounds divided by size in ml. Keep that number in your head and the offers soon sort themselves.',
    },
  ],

  'spot-fake-or-grey-market-perfume': [
    { t: 'h', x: 'Fake and Grey Market Are Different' },
    {
      t: 'p',
      x: 'A fake, or counterfeit, is made to pass as the brand without the brand’s involvement. Its contents are unknown, which matters because you put it on your skin.',
    },
    {
      t: 'p',
      x: 'A grey market bottle is the real thing, made by the brand, but sold outside the brand’s official supply, often bought abroad and imported by a third party. It is not a fake. Its box, language or batch may differ from the UK version, and the brand may not stand behind it.',
    },
    { t: 'h', x: 'Warning Signs Before You Buy' },
    {
      t: 'ul',
      x: [
        'A price far below every other shop. If most shops sit between £70 and £80 and one asks £30, ask yourself why.',
        'Thin seller details: no company name, no UK address, no returns policy.',
        'A social media post or an anonymous marketplace seller you cannot trace.',
        'Photos that are plainly not of the item, or look copied from elsewhere.',
      ],
    },
    { t: 'h', x: 'Checks When It Arrives' },
    {
      t: 'ul',
      x: [
        'The box. Sharp printing, correct spelling, tight cellophane and clean edges. Compare with the brand’s own website.',
        'The batch code. It should be on the box and printed or etched on the bottle, and the two should match. A missing or mismatched code is a red flag.',
        'The bottle. Even glass, a cap that fits cleanly, a sprayer that gives a fine mist, and liquid that is clear and level.',
        'The smell. A harsh opening or a scent that vanishes in minutes can be a sign, but it is the weakest test, because batches and skin vary.',
      ],
    },
    { t: 'h', x: 'Protect Your Money' },
    {
      t: 'ul',
      x: [
        'Buy from shops that name their company, give an address and have a clear returns policy.',
        'Pay by credit card where you can. For a single item costing between £100 and £30,000, Section 75 of the Consumer Credit Act makes the card company jointly responsible with the seller if something goes wrong.',
        'Keep the receipt and the packaging until you are happy.',
        'If you think you have a fake, contact the seller, then your card provider, and tell Trading Standards through Citizens Advice.',
      ],
    },
    { t: 'h', x: 'What We Can and Cannot Tell You' },
    {
      t: 'p',
      x: 'We compare prices from established UK shops that sell to UK customers, and we leave out marketplaces where the seller can change. But we cannot inspect a bottle, and our terms say we cannot guarantee the authenticity of what a shop sells. A very low price here is a reason to look closer, not a promise. See [how we check prices](/about/how-we-check-prices) and the [shops we compare](/retailers).',
    },
  ],

  'decants-and-testers': [
    { t: 'h', x: 'Three Ways to Try or Pay Less' },
    {
      t: 'ul',
      x: [
        'A tester is a genuine bottle made for shop counters so customers can try it. It usually comes in a plain box or none, and sometimes without a cap. It is often cheaper than the boxed bottle.',
        'A miniature is a small bottle made by the brand itself and sold sealed, often as part of a set.',
        'A decant is a small amount poured from a full bottle into a vial or atomiser by someone other than the brand, and sold by an independent seller.',
      ],
    },
    { t: 'h', x: 'Testers: What to Check' },
    {
      t: 'ul',
      x: [
        'Read the listing. A real tester says so, and says what comes with it. Expect a plain box or no box.',
        'Read the returns policy. Some shops will not take back an unboxed bottle.',
        'Think about gifts. A tester without a retail box is fine for you and a poor present.',
        'On this site, a listing with Tester or Unboxed in its name stays its own product and is never merged with the boxed bottle, so the two prices are never mixed up.',
      ],
    },
    { t: 'h', x: 'Decants: the Risks' },
    {
      t: 'p',
      x: 'The brand has not made, checked or sealed a decant, so you are trusting the person who filled it. Possible problems include a wrong label, an old bottle, a fill that was not clean, or liquid spoiled by heat and light. A decant also costs more per ml than the bottle it came from. What you save is the lower total, not the price of each ml.',
    },
    {
      t: 'ul',
      x: [
        'Ask which bottle it came from, when, and how it was stored.',
        'Prefer a spray atomiser to a screw top vial, which lets in air.',
        'Buy from a seller with a track record and a returns policy, not a stranger online.',
        'Keep it out of the sun and away from the bathroom.',
      ],
    },
    { t: 'h', x: 'A Safer Way to Sample' },
    {
      t: 'p',
      x: 'Many brands sell a discovery set: several small, sealed bottles of different scents. Pick a house from the [Brands page](/brands) to see what it offers, or look through the [Sets tab](/sets), which includes miniature and discovery sets, or browse [bottles under 15ml](/fragrances?size=0-15). Before you buy a full bottle, wear a sample for a whole day, since a scent can change a lot over several hours (see [how perfume notes work](/guides/perfume-notes-explained)).',
    },
    {
      t: 'note',
      x: 'We compare the prices of bottles, sets and oils from UK shops. We do not sell decants and we do not recommend decant sellers.',
    },
  ],
};
