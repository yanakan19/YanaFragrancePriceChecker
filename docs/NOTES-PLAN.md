# Scent notes: cleanup and fuller pyramids

Owner request, 6 Oct 2026. Two parts: the Notes tab and note pages should read
and sort cleanly, and a product should show the fullest note pyramid any shop
publishes for it. Numbers below were measured on 6 Oct 2026 from the committed
catalogue (`data/catalogue/*.json`, 48,213 distinct stored descriptions) and the
generated `demo/catalogue.generated.ts` (26,593 products).

## What exists

- `src/catalogue/notesParse.ts` reads labelled notes ("Top notes:", "Middle or
  Heart notes:", "Base notes:") out of a shop's own product copy. It never
  infers a note from a name or a house style. Only note names are kept, never
  the prose around them.
- `scripts/build-demo-catalogue.ts` (`pickNotes`) chose the notes of the most
  recently fetched offer that parsed at all, and recorded which shop it was, so
  the product page can say "As published by <shop>" and link to it.
- `demo/data.ts` built the Notes list (`NOTE_INDEX`) from those names, joining
  only spellings that differed in case. `demo/listSort.ts` sorted by the raw
  name. A note page address is `/notes/<slug>`.

## What was wrong (measured)

Part 1, names:

- 6,780 distinct raw note names, 5,505 once case is folded, which is what the
  Notes tab listed.
- 16 of those started with something other than a letter and so sorted out of
  place: eleven with an emoji ("🍋 Lemon", "🌸 Orange Blossom"), three with a
  list bullet ("__ marshmallow"), a quote and a brace. In all 65 raw names
  carried debris that showed in the name: those 16, and 49 more with a zero
  width space, a trademark sign, a stray quote or leftover HTML ("Dragon
  fruit>br>").
- 131 notes were listed under two or more entries for the same note: "Oak
  Moss", "Oakmoss" and "O ak moss", "Maté" and "Mate", "Lily-of-the-Valley" and
  "Lily of the Valley", "Passion Fruit" and "Passionfruit".

Part 2, pyramids:

- 10,865 products (41%) had notes; 9,982 of them a base tier.
- 2,949 of those had two or more shops publishing notes, and the newest fetch
  won whatever it held. Mugler Alien 30ml EDP showed only "Top: Sambac Jasmine,
  Middle: Cashmere" from Perfume Direct. Two causes: Perfume Direct writes
  "Base notes: White Amber Launched: 2005." and the trailing "Launched: 2005"
  made the whole base tier fail the shape check (this hit 103 of its distinct
  descriptions, and the same shape at other shops), and Perfume Market UK, with
  a full pyramid, lost only because it was fetched earlier.

## Part 1 rules

The functions are in `src/catalogue/noteName.ts`, pure, with tests in
`tests/noteName.test.ts`.

- **Displayed name** (`cleanNoteName`): Unicode normalised; emoji, zero width
  and other invisible characters, trademark signs, list bullets, quotes, braces
  and leftover HTML removed; every other symbol becomes a space; spaces
  collapsed; stray hyphens and apostrophes at either end trimmed. A name of one
  character is dropped.
- **Sort key** (`noteSortKey`): the clean name with case and accents folded and
  only letters, digits and single spaces left. The A to Z and Z to A order, and
  the letter dividers, use it. A tie falls back to the plain code unit order so
  Z to A is exactly A to Z reversed.
- **Merge rule** (`noteMergeKey`, `sameNote`): two names are one note only if
  they differ in case, spacing, symbols, emoji, accents or obvious punctuation
  (hyphen, apostrophe). Mechanically: fold case and accents, drop everything
  that is not a letter or digit, compare. Nothing is fuzzy, nothing is looked up.
- **Never merged**: "Madagascan Vanilla" and "Vanilla"; "Sambac Jasmine" and
  "Jasmine"; "Tonka Bean" and "Tonka Beans" (a plural is another word); "Jasmine
  Sambac" and "Sambac Jasmine" (word order is the shop's own); "Blackcurrant
  Bud" and "Blackcurrant Buds". The tests spell these out.
- **Which spelling is shown** for a merged note: the clean spelling used by the
  most fragrances, then a mixed case one, then the first in code unit order, so
  the choice is the same on every build.
- **Addresses stay stable.** The note page address is `/notes/<slug>`, the
  slug being the clean name with accents folded (`noteSlug`; the router's own
  `slugify` drops an accented letter, so "Maté" was `mat`). Every address a
  note has had (the router slug of each raw spelling it was published under,
  the cleaned one) is mapped to the note now showing, so an old link opens the
  note and the page then rewrites the address to the note's own. A merged
  duplicate redirects to its survivor the same way. This is computed from the
  raw names at load, so it needs no memory file.

Result: the Notes list went from 5,505 entries to 5,234 (after the parser
change too), with no entry starting with a symbol. Of 5,445 old note
addresses, 5,036 still resolve (110 of them to a note under its cleaned or
merged name) and 409 do not: those are notes a shop no longer supplies to any
product (a thinner pyramid now loses to a fuller one, and junk such as "nbsp"
is gone). None of the 409 is a note still in the data.

## Part 2 rules

1. **Candidates**: every offer of a product whose stored description parses to
   at least one note (`parseNotes`). Only the description we already store is
   read.
2. **Winner** (`src/catalogue/notesPick.ts`), first difference decides:
   more tiers filled; then more notes in all; then source order.
3. **Source order**: a fragrance house's own storefront first; then the shops
   whose labelled lists parsed most cleanly in the measurement (Perfume Direct,
   Emirates Oud, Justmylook, Beautybase, Les Senteurs, Al Haramain, Perfume
   Market UK, Avon, Ibraq, Manchester Ouds, Beauty Bay, FragranceHub, Niche
   Beauty UK, Escentual, Fragrance Click, LookFantastic, John Lewis); then any
   other shop by id.
4. **One shop's whole pyramid** is shown, never a mix, so "As published by
   <shop>" is true of every note on the page, and the shop and its page are
   credited as before.
5. Notes are facts: only names are stored. No description text is copied.

### Parser fixes that make more pyramids complete

Measured by parsing every distinct stored description with the old and the new
parser (810 of 48,213 change, 760 gain notes, 201 gain a tier, 29 lose notes
that were prose or junk such as "Perfect for spring" read as notes):

- A closed list of field headings ends the last note list: "Launched:",
  "Fragrance Type/Family/Profile/Character:", "Size:", "Recommended for:",
  "Dry Down:", "Why You'll Love It" and the like, also when glued on to the last
  note with the line break lost ("AmberFragrance Profile").
- "Head notes" is read as top notes (Parfumdreams).
- A lead-in such as "A combination of bergamot, mandarin" or "Spicy accents of
  black pepper" is dropped from the first note.
- A second pass reads "for" as the start of a clause about the note
  ("Jasmine sambac for a bright, floral opening"), only after the first pass
  found nothing, so a prose mention can never hide the real list.
- A twice encoded "&amp;amp;" is one "&" (it surfaced as a note named "amp").

## Result

| | before | after |
|---|---|---|
| products with notes | 10,865 | 10,938 |
| with a base tier | 9,982 | 10,240 |
| with all three tiers | 9,177 | 9,509 |
| notes shown in all | 86,613 | 91,442 |

Of the 26,593 products: 76 gain notes where there were none, 303 gain a base
tier (or notes, from none), 443 gain at least one tier, 1,860 show more notes,
40 show fewer (prose or junk dropped, or another shop's pyramid with more tiers
but fewer notes), and 1,677 now credit a different shop. Mugler Alien 30ml
EDP (`mugler_alien_edp_30ml`) went from Top "Sambac Jasmine", Middle "Cashmere"
to Top "Sambac Jasmine", Middle "Cashmere", Base "White Amber", as published by
Perfume Direct. Perfume Market UK publishes the same three tiers (Jasmine Sambac,
Cashmere Wood, White Amber); the two tie on tiers and note count, so the source
order picks Perfume Direct.

## Shops with no stored description (assessed, not changed)

Of the 51 shops with stored data, these store no usable description, so they can contribute no notes:

- **Perfume Click** (11,105 active listings, the biggest): an Awin feed, and
  the feed carries no description column (0 of 13,585 rows). Its own site
  answered HTTP 403 to every candidate path on six consecutive runs
  (`src/config/retailers.ts`), and the harvest never fetches an Awin tracking
  link for an unearned click, so a product page crawl is not a low risk way in.
  Not implemented.
- **Selfridges, Superdrug, The Perfume Shop, Boots, Harvey Nichols, The
  Fragrance Shop, Zara**: disabled or fixtures only, so they are not crawled.
- **Notino UK** (47 character placeholders), **Beauty Pie, Home Bargains,
  Kayali, French Avenue, Space NK, Zimaya, Perfumeo, Riiffs, Marks and
  Spencer**: descriptions are stored but carry no labelled notes (marketing
  copy only).

Reading unlabelled prose ("opens with jasmine sambac... as it settles, white
amber") was considered and rejected: it needs a note vocabulary and judgement
about which clause is which tier, and a wrong note shown as a published fact is
worse than a missing one. If wanted later, the safe route is a vocabulary of
notes already confirmed from labelled lists.

## Limits

- A product whose only notes are in prose, or whose shops do not label them,
  still has none (about 59% of products).
- Two shops that tie are credited by the fixed source order, not by any
  judgement of which is more accurate.
- When the fuller pyramid replaces a thinner one, a note that only the thinner
  one carried (and no other product has) disappears from the Notes tab, and its
  old page address no longer opens (409 addresses on 6 Oct 2026).

## Reviewed aliases (9 Oct 2026)

The mechanical merge above never joined a plural, a word order, a synonym or a
typo. `data/note-aliases.json` (`src/catalogue/noteAliases.ts`) now does, from a
reviewed, append only list: 1,143 spellings folded into their notes, so the
Notes tab went from 5,746 notes to 4,603. The build writes every product's notes
with the aliases applied (`pickNotes` in `scripts/build-demo-catalogue.ts`), so
the page, the Notes tab, note pages, filters and deals agree, and any region
that reads the catalogue gets the same names. The "never merged" examples in
Part 1 above (Tonka Bean and Tonka Beans, Jasmine Sambac and Sambac Jasmine)
are superseded by that file; `noteMergeKey` itself is unchanged and its tests
stand. Distinct notes stay distinct: origins, parts (leaf, bud, blossom, wood,
flower) and accords, listed as `keepApart` pairs the tests protect. An old
`/notes/<slug>` of a folded spelling opens the canonical note (the build's
`NOTE_ALIASES`, read by `noteForAddress`). Adding a pair: append to the file,
run `tests/noteAliases.test.ts`, then `npm run catalogue:demo` and commit the
rebuilt `demo/catalogue.generated.ts`.
