# Microcopy inventory — 2026-08-21, with a recommendation pass — 2026-08-25

The original file (21 Aug) was a report: it walked every page type and listed
every piece of descriptive or explanatory text that isn't a label, a price or a
raw data value, with an empty Keep/Cut column for the owner to fill in. It sat
unactioned. This revision keeps every one of those 91 rows exactly as
catalogued and adds two things:

- **Rec** — a recommendation for every row, one of **Keep**, **Cut** or
  **Owner**, with a one-line reason. Nothing was left blank.
- **Line** — the line number *as of today*, re-resolved by matching each row's
  own anchor text against the current source rather than trusting the 21 Aug
  numbers. `demo/app.ts` has grown from 5,013 lines to 5,148 since, and eight
  rows have moved file entirely (5,150 once this pass's own three cuts and
  their comments land).
  Stale entries are called out under
  "What changed since 21 Aug" below.

**Only the Cut rows were acted on, and only three of them.** That is the
honest result of the pass, not a failure of nerve: this site's copy turned out
to be load-bearing almost everywhere it appears. The reason is structural.
PriceSniffs' entire claim is that it never misstates a price, and the way that
claim is honoured on screen is by *saying* the things a price comparison
normally leaves unsaid — that a delivery figure was not confirmed with the
shop, that a number excludes postage, that the site does not know something.
Strip those and the site does not become minimal; it becomes an ordinary price
comparison that happens to be quieter about what it is guessing.

So the split used here is:

- **Cut** — copy that restates what is already on screen beside it, or that
  reassures without carrying a fact. Three rows qualified outright.
- **Keep** — anything that is a correctness or honesty statement, anything
  that names an absence the reader cannot otherwise see, and anything where
  the decorative-or-load-bearing question was genuinely close. Where it was
  close it was kept and flagged, per the brief.
- **Owner** — where minimalism and clarity genuinely trade off and the call is
  a taste or positioning one rather than a correctness one. Nine rows, plus
  one clause inside a tenth that is otherwise non-negotiable — all gathered
  again in one list at the bottom so they can be decided together.

---

## Home

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 1 | "by YannySniffs" | demo/app.ts:1164 | Keep | Attribution, not explanation — the shortest line in the hero and the only one naming who is behind the site. |
| 2 | "The only tool you need to find the best price on any fragrance." | demo/app.ts:1166 | Owner | The site's tagline. A superlative rather than a fact, but cutting a wordmark's strapline is a positioning decision, not a copy edit. |
| 3 | "Delivery Costs Reflected" / "Real and Live Prices" / "No Promoted Listings" | demo/app.ts:1168 | Owner | All three are true and all three are argued properly on About; as chips they are the marketing compression of the honesty position, which is exactly the trade-off the owner asked to be shown. |
| 4 | "Got an idea?" (section heading) | demo/app.ts:1188 | Keep | Section heading; without it the form has no subject. |
| 5 | "Tell us what you would like to see. There is no server behind this page, so sending opens your own email app…" | demo/app.ts:1196 | **Cut (partial, done)** | First sentence restated the heading above and the "Your suggestion" label below; the mailto behaviour is not inferable from the form and stays. |
| 6 | Placeholder "What should we add or change?" | demo/app.ts:1201 | Keep | Form affordance; a bare textarea invites nothing. |
| 7 | "(optional)" / "(optional, if you would like a reply)" | demo/app.ts:1205, 1208 | Keep | Says which fields may be left blank — a fact about the form, not decoration. |
| 8 | Placeholder "So we know who to thank" | demo/app.ts:1205 | Keep | Same as 6. |
| 9 | Placeholder "you@example.com" | demo/app.ts:1209 | Keep | Format hint on an email field. |
| 10 | "Update History" (section heading) | demo/app.ts:1217 | Keep | Section heading over the changelog list. |

## Browse (Most Stocked / search results / brand filter)

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 11 | "Ranked by how many of our {N} shops carry each one… This is stock breadth, not a measure of what sells: nothing here counts views or purchases, so it is never presented as if it did." | demo/app.ts:1277 | Keep | The last clause is the honesty statement that stops "Most stocked" being read as a popularity chart — the single most misreadable page on the site. (Its closing "so it is never presented as if it did" is the one arguably self-congratulatory half-sentence in it; see Owner list.) |
| 12 | "The {N} most stocked fragrances, in the order you chose. Oils are not listed here." | demo/app.ts:1281 | Keep | "in the order you chose" looks like it restates the sort dropdown, but it is doing real work: the cap is applied *before* the sort (see browseView's own comment), so this is what tells a reader sorting by price that they are seeing the cheapest of fifty, not of the catalogue. |
| 13 | "Nothing here matches that search." (empty state) | demo/app.ts:1289 | Keep | An empty region with no text reads as a bug. |

## Fragrance detail

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 14 | "Cheapest" / "Lowest total" / "Lowest item price" (offer-row tag, chosen by evidence) | demo/app.ts:1318 | Keep | Non-negotiable. The whole delivery-confidence mechanism exists to choose between these three words; they are the mechanism's output. |
| 15 | "from {shop}, incl. delivery" | demo/app.ts:1936 | Keep | Non-negotiable. Says what the hero number contains. |
| 16 | "Too close to call: the {gap} gap to {shop} is smaller than the delivery charge we have not yet confirmed with {shop}." | src/services/deliveryConfidence.ts:178 | Keep | Non-negotiable, and the clearest single sentence of the site's positioning anywhere on it. |
| 17 | "from {shop} — delivery not stated, so this is not a delivered price" | demo/app.ts:1954 | Keep | Non-negotiable. Named in the brief as load-bearing, and it is. |
| 18 | "Sold out everywhere" / "no shop has it in stock right now" | demo/app.ts:1961 | **Cut (partial, done)** | The second line was the first line in different words, stacked directly beneath it, with the shop count below saying it a third time. |
| 19 | "delivery included where the shop states it" / "delivery included" | demo/app.ts:1974 | Keep | Non-negotiable. A claim about every row underneath, made only when true of every row underneath. |
| 20 | "Delivery not stated" (offer row) | demo/app.ts:1344 | Keep | Non-negotiable. This is the row that can never rank cheapest, and this is why. |
| 21 | "Free delivery (not confirmed with the shop)" | demo/app.ts:1346 | Keep | Non-negotiable. The parenthesis is the entire difference between a sourced fact and a researched one. |
| 22 | "plus {£X} delivery (not confirmed with the shop)" | demo/app.ts:1347 | Keep | As 21. Roughly two thirds of live listings are in this state, so this is the ordinary case rather than a rare caveat. |
| 23 | "{£X} more for free postage" | demo/app.ts:1350 | Keep | Actionable arithmetic the reader would otherwise do by hand. |
| 24 | "Available at" / "Sold out" / "Not available" (offer-group headings) | demo/app.ts:1967 | Keep | Three lists of shops that look identical without them. |
| 25 | "Price history" (section heading) | demo/app.ts:1637 | Keep | Section heading over a chart. |
| 26 | "Not enough recorded prices in this range" (disabled-tab tooltip) | demo/app.ts:1625 | Keep | Explains a disabled control. A dead tab with no reason given reads as broken. |
| 27 | "No price recorded, {date}" (no-data dot label) | demo/app.ts:1726 | Keep | Names a gap in the data instead of letting the line imply continuity. Honesty copy in a chart. |
| 28 | "unchanged since {date}" (carried-price dot label) | demo/app.ts:1745 | Keep | Distinguishes a re-observed price from a carried one — the same fact as 27 from the other side. |
| 29 | "Notes unavailable for this fragrance." | demo/app.ts:1791 | Keep | Absence stated rather than an empty panel. |
| 30 | "As published by the retailer listing it." | demo/app.ts:1816 | Keep | Attribution for notes we did not write and do not vouch for. |
| 31 | "Sign in to save" (wishlist button, signed out) | demo/app.ts:1885 | Keep | Button label; also the only thing saying why the button will not just work. |
| 32 | "Saved" / "Save" (wishlist toggle) | demo/app.ts:1890 | Keep | Button label with no explanatory content — arguably out of scope for this inventory at all. |

## Brand

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 33 | "Official site not yet confirmed" (fallback when no verified brand site) | demo/app.ts:2324 | Keep | Non-negotiable. This is `demo/brandSites.ts`'s "absent rather than invented" rule made visible; today it is what 403 of 697 houses show. |
| 34 | "Sells direct in the UK, and its own price is compared below like any other shop's." | demo/app.ts:2330 | Keep | An anti-favouritism statement about a shop with an obvious interest — exactly the kind of claim that has to be made out loud or not at all. |
| 35 | "Sells direct in the UK, but its delivery terms are not confirmed yet, so its price is not compared." | demo/app.ts:2331 | Keep | Non-negotiable. Explains a visible omission the reader would otherwise read as an oversight. |
| 36 | "Nothing from this brand has been harvested yet." (two call sites) | demo/app.ts:2345, 2347 | Keep | "Harvested" is the honest word: nothing found, rather than nothing exists. |
| 37 | "{N} direct from {brand}" / "not part of the UK comparison" | demo/app.ts:2353 | Keep | Marks products that are deliberately outside the ranking. Cutting it would leave them looking like ordinary compared listings. |
| 38 | "No brands match that filter yet." (Brands tab empty state) | demo/app.ts:2022 | Keep | As 13. |

## Retailer

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 39 | "Delivery not stated. This shop publishes no standard delivery cost, so its prices here are item prices only and it is never ranked as cheapest" | demo/deliveryFacts.ts:32 | Keep | Non-negotiable. Note the file move — see staleness below. |
| 40 | "Delivery not stated. We have not established this shop's standard delivery cost…" | demo/deliveryFacts.ts:33 | Keep | Non-negotiable, and the weaker of two claims that used to share one wording. The distinction between 39 and 40 is precisely what this project means by honesty. |
| 41 | "Free standard delivery on every order" | demo/deliveryFacts.ts:35 | Keep | A fact about the shop. |
| 42 | "Read from this shop's own delivery page on {date}" | demo/deliveryFacts.ts:43 | Keep | Provenance and date for a figure that decides rankings. |
| 43 | "Confirmed against this shop's own delivery page" | demo/deliveryFacts.ts:44 | Keep | As 42, where no read date was recorded. |
| 44 | "Not yet confirmed with the shop. These delivery terms came from research, not from their own delivery page" | demo/deliveryFacts.ts:45 | Keep | Non-negotiable. Said once per shop rather than against every number, which is already the minimal treatment of it. |
| 45 | "Free once you spend {£X}" / "No spend based free delivery" | demo/deliveryFacts.ts:48, 50 | Keep | The negative half is the load-bearing one: it distinguishes "no threshold" from "we have not looked". |
| 46 | "Arrives in about {N} working days" / "…{N} to {M} working days" | demo/deliveryFacts.ts:53 | Keep | A fact about the shop, hedged with "about" because that is what shops publish. |
| 47 | "Nothing from this shop matches that filter." (empty state) | demo/app.ts:2266 | Keep | As 13. |
| 48 | Long doc-comment on why brand-direct shops are excluded from the Retailers directory | demo/app.ts (comment) | n/a | Not reader-facing. Listed for completeness on 21 Aug and still not a candidate. |

## Note

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 49 | "No notes recorded for that layer yet." | demo/app.ts:2432 | Keep | As 13. |
| 50 | "Only notes a shop has explicitly published. {N} of {M} fragrances list them." | demo/app.ts:2460 | Keep | States the coverage of a whole feature, with the real numerator and denominator. Cutting it would let a partial index read as a complete one. |
| 51 | "Fragrances listing {note}" / "as a {layer} note" | demo/app.ts:2508 | Keep | Sub-heading; it is what says which filter produced this list. |
| 52 | "Nothing matches that filter." (note detail empty state) | demo/app.ts:2510 | Keep | As 13. |

## Search

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 53 | Placeholder "Search by brand, name or concentration" | demo/app.ts:2534 | Keep | Names the three fields actually matched, which is not guessable. |
| 54 | "Type to search all {N} fragrances." (pre-query empty state) | demo/app.ts:2521 | Owner | Closest thing on the site to a row that both restates the placeholder above it and carries a real figure. Kept and flagged rather than cut. |
| 55 | "Filtered to {brand}." (search-scoped-to-brand note) | demo/app.ts:2539 | Keep | Says why results are missing, and carries the Clear control. |
| 56 | "Nothing matches that search." | demo/app.ts:2526 | Keep | As 13. |

## Deals

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 57 | "No shop is publishing a reference price right now." | demo/app.ts:2088 | Keep | Names the precise reason the page is empty, which is different from 58 and from 59. |
| 58 | "No discounted fragrance has a shop-licensed photo right now." | demo/app.ts:2091 | Keep | As 57 — and it is the photo-licensing position showing through, which is a rights question, not a styling one. |
| 59 | "No deal matches that filter." | demo/app.ts:2094 | Keep | As 13. |
| 60 | "Savings are against the shop's own published recommended retail price." | demo/app.ts:2105 | Keep | Non-negotiable. Defines what every percentage on the page means, and whose claim it is. |

## About

Fourteen rows of first-person prose, logged one per paragraph/section. Every
figure inside them is computed from the live registry and catalogue at load
time, not typed by hand, so the *numbers* were never candidates for cutting
even where the *prose carrying them* might be.

The recommendation for this page is deliberately uniform and deliberately not
mine: **Owner** for the narrative, **Keep** for the honesty sections. About is
the one page whose job *is* prose, so "minimal feel" means something different
here than it does on a results page. Cutting it is defensible; cutting it a
paragraph at a time by an agent's taste is not.

| # | Text (opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 61 | "PriceSniffs tells you what a bottle of fragrance actually costs across {N} UK shops…" | demo/legal.ts:86 | Keep | The page's one-sentence answer to what the site is; also carries two live figures. |
| 62 | "Hi, I am Yanny." | demo/legal.ts:87 | Owner | Four words. Sets the whole page's voice, which is the thing under review. |
| 63 | "This started because I kept getting caught out…" | demo/legal.ts:88 | Owner | Origin story. Longest purely narrative paragraph on the site. |
| 64 | "So I spent five days building the thing I wanted to use…" | demo/legal.ts:89 | Owner | As 63. |
| 65 | "What it does" + "Prices are checked every two hours, so 12 times a day…" | demo/legal.ts:90-91 | Keep | States the refresh cadence and that no price is typed by hand — both verifiable claims a reader is entitled to. |
| 66 | "Delivery terms sit on a slower clock than prices do…" | demo/legal.ts:92 | Keep | Explains why one number is fresher than another. Pre-empts the obvious objection to the whole method. |
| 67 | "That gap between Boots and Harvey Nichols is the whole point…" | demo/legal.ts:93 | Owner | Worked example. Persuasive rather than informative, but it is what makes 66 land. |
| 68 | "Which delivery charges we have actually checked" + "Of the {N} shops switched on today…" | demo/legal.ts:94-95 | Keep | Non-negotiable. Names the confirmed shops individually, from live data. |
| 69 | "That matters because delivery decides the ranking…" | demo/legal.ts:96 | Keep | Non-negotiable. The full statement of the withheld-superlative rule that rows 14 and 16 are the on-screen shorthand for. |
| 70 | "Being straight with you" + "If we do not know something, we say so…" | demo/legal.ts:97-98 | Keep | Non-negotiable. The site's actual thesis, with the Manchester Ouds worked example and a live list of delivery-unstated shops. |
| 71 | "Nothing here is a paid placement. No shop buys its way up…" | demo/legal.ts:99 | Keep | Non-negotiable — affiliate disclosure. Named in the brief; it is also a regulatory statement, not only an ethical one. |
| 72 | "About the photos" + "Every product photo loads straight from the shop's own website…" | demo/legal.ts:100-101 | Keep | Non-negotiable. A rights position, including the standing offer to stop on request. |
| 73 | "Finding what you want" + "Filter by bottle size, by strength…" | demo/legal.ts:102-103 | Owner | A feature tour. The only About section carrying no correctness claim, and so the first candidate if this page is trimmed at all. |
| 74 | "Say hello" + "I post about fragrance on TikTok and Instagram as yannysniffs…" | demo/legal.ts:104-105 | Owner | Contact and voice. Owner's own social presence — plainly their call. |

## Settings

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 75 | "Your preference will be remembered on this device." | demo/app.ts:2644 | Keep | A statement about where data goes. Short, and the reader cannot see it any other way. |
| 76 | Placeholder "Tell us what is going on" (contact form) | demo/app.ts:2656 | Keep | Form affordance. |
| 77 | "© {year} {company}." (footer legal line) | demo/app.ts:2679 | Keep | Legal notice. |

## Account

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 78 | "Accounts are not switched on for this deployment yet. Check back soon." | demo/app.ts:2713 | **Cut (partial, done)** | "Check back soon" is a promise about a date nobody has committed to. The sentence before it is the whole honest answer. |
| 79 | "Loading." (account page) | demo/app.ts:2718 | Keep | One word, and the alternative is a blank page mid-request. |
| 80 | "Loading." (wishlist section, before it loads) | demo/app.ts:1831 | Keep | As 79. |
| 81 | "Nothing saved yet. Tap Save on a fragrance to add it here." | demo/app.ts:1838 | Keep | Empty state plus the one instruction that fills it. |
| 82 | "Signed in as {email}." | demo/app.ts:2728 | Keep | Tells the reader which account they are acting as. |
| 83 | "We sent a link to {email}. Follow it to finish setting up your account, then come back here." | demo/app.ts:2740 | Keep | Instruction for a flow that leaves the site. "then come back here" is the weakest clause on the page but it is genuinely the next step. |
| 84 | "If that address has an account, a reset link is on its way." | demo/app.ts:2788 | Keep | Non-negotiable, and for a reason the row does not show: the conditional is deliberate, so the form cannot be used to discover whether an address is registered. |

## Other legal/policy pages

| # | Page | File | Rec | Why |
|---|---|---|---|---|
| 85 | How PriceSniffs works (5 sections) | demo/legal.ts | Keep | Method disclosure; it is the long form of what rows 14-22 assert in three words each. |
| 86 | Affiliate disclosure (3 sections) | demo/legal.ts | Keep | Non-negotiable — named in the brief, and a regulatory document. |
| 87 | Privacy notice (9 sections) | demo/legal.ts | Keep | Legal document. Not a minimalism candidate at any length. |
| 88 | Terms of use (8 sections) | demo/legal.ts | Keep | As 87. |
| 89 | Contact and feedback (2 sections) | demo/legal.ts | Keep | Shortest of the five; nothing to gain. |

## Not found

| # | Text (or opening clause) | Line (25 Aug) | Rec | Why |
|---|---|---|---|---|
| 90 | "Nothing on this site answers to {address}. It may have been a fragrance or a shop that has since been delisted." | demo/app.ts:2818 | Keep | The second sentence is the useful one: on a catalogue that delists constantly, a 404 usually is a delisting rather than a typo, and saying so stops it reading as a broken site. |
| 91 | "Search the catalogue, or start from one of these:" | demo/app.ts:2821 | Keep | Introduces the links below it. |

---

## What was actually cut

Three rows, all partial — a clause each, never a whole statement:

1. **Row 18**, `demo/app.ts` — the `.hero-at` sub-line "no shop has it in
   stock right now" removed from the sold-out hero, leaving "Sold out
   everywhere". The now-unused `.hero-at` rule was removed from
   `demo/template.html` with it.
2. **Row 5**, `demo/app.ts` — "Tell us what you would like to see." removed
   from the suggestion form's note. The mailto sentence stays.
3. **Row 78**, `demo/app.ts` — "Check back soon." removed from the
   accounts-not-configured state.

No honesty, correctness, provenance or attribution statement was touched, and
no figure was touched. Each cut carries an inline comment at its site saying
what went and why, so the next person to read that code does not restore it.

## Left to the owner

Nine rows marked Owner above, plus one clause inside row 11 which is kept.
Grouped, because some of them only make sense decided together:

- **The hero block — rows 2, 3.** The tagline and the three value chips. This
  is one decision, not two: chips without a tagline read as a feature list,
  and a tagline without chips is an unsupported superlative. Cutting both
  would take the home page from a pitch to an index, which is a real and
  defensible "minimal feel" but is a repositioning.
- **Row 11's closing clause.** "…so it is never presented as if it did" is the
  one place the site describes its own virtue rather than stating a fact. The
  sentence still works without it: "This is stock breadth, not a measure of
  what sells: nothing here counts views or purchases." Kept only because it
  sits inside a paragraph that is otherwise non-negotiable.
- **Row 54.** "Type to search all {N} fragrances." above a placeholder that
  already says what to type. The figure is the only thing it adds.
- **About's narrative — rows 62, 63, 64, 67, 73, 74.** Six paragraphs with no
  correctness claim in them: the introduction, the origin story, the worked
  Boots/Harvey Nichols example, the feature tour, and the sign-off. Removing
  all six leaves About as a method-and-honesty document (rows 61, 65, 66, 68,
  69, 70, 71, 72) and roughly halves its length. Row 73, the feature tour, is
  the one that costs least — it describes controls the reader can already see.

## What changed since 21 Aug (staleness in the original)

Re-read against the current source rather than trusted. Six findings:

1. **Rows 39-46 have moved file.** They are no longer in `demo/app.ts` at all;
   they were extracted to `demo/deliveryFacts.ts` so they could be unit tested
   without app.ts's import-time `init()`. `brandView()` now reuses the same
   function, so those eight strings render on brand pages as well as retailer
   pages — one more reason they are not cuttable in isolation.
2. **Rows 20-23 have gained a sibling line the inventory does not know about.**
   `demo/priceDeliveryNote.ts` (new) now prints "Includes £2.99 delivery" /
   "Includes free delivery" / "Plus delivery" directly under each row's price,
   beside the facts line the inventory catalogued. Where a delivery figure *is*
   confirmed, the two lines carry the same figure in the same words, which is
   the only genuine new duplication this pass found anywhere on the site. It
   was **not** cut: the "(not confirmed with the shop)" qualifier lives on the
   facts line only, and that treatment was landed today by a concurrent
   session with its own reasoning attached. Flagged for the owner rather than
   unpicked by a second agent the same afternoon.
3. **Row 14 conflates two different pieces of copy.** The offer-row tag reads
   "Cheapest" / "Lowest total" / "Lowest item price" (`cheapestTag`); the hero
   price-box label reads "Cheapest price" / "Lowest total price" / "Lowest item
   price". Both exist, both are evidence-chosen, and the inventory catalogued
   them as one row at the price box's line number.
4. **Every line number below app.ts:1160 has moved**, mostly by the ~135 lines
   `demo/tileDensity.ts`'s landing added above them. The Line column here is
   re-resolved as of 25 Aug; it will drift again the same way.
5. **Row 51's anchor text has changed shape.** It is now built as
   `Fragrances listing {Note}` + an optional ` as a {layer} note`, at
   demo/app.ts:2508.
6. **Row 33's scope is larger than it looks.** "Official site not yet
   confirmed" is what 403 of the live catalogue's 697 houses currently render
   (measured 25 Aug against `demo/catalogue.generated.ts`), so it is one of the
   most-shown strings on the site rather than a rare fallback.

## Summary

91 rows: 3 Cut (all partial, all acted on), 78 Keep, 9 Owner, 1 n/a (row 48,
a code comment rather than reader-facing text). One further clause, inside the
kept row 11, is flagged in the owner's list without being marked Cut.

That distribution is the finding. A pass looking for copy to remove from this
site finds very little, because most of what looks like explanatory text is
the site saying what it does not know — and a price comparison that stops
saying that has not become minimal, it has become a different product.
