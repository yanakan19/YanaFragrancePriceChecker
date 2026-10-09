# Notes tab and note pages: groups, pictures, redesign (plan)

Owner request, 9 Oct 2026. Three asks: (1) put notes into groups the way the
big fragrance database sites do, without copying them; (2) streamline the Notes
tab and note pages; (3) give each note a picture, larger and clearly visible.
Later the owner added, after seeing a screenshot of one of those sites (not
stored here, and it must not be): a **grid of landscape tiles**, picture on top
and the note name centred under it, under group headings, 4 across on desktop
and 2 on a phone.

**Status: plan only, nothing is built.** Section B (the group list) is
**APPROVED by the owner on 9 Oct 2026**, with tea and coffee placed in Sweet and Gourmand and patchouli and vetiver in Earth and Moss.

Numbers were measured on 9 Oct 2026 from the committed catalogue (`demo/data.ts`
`NOTE_INDEX`, 30,931 products) unless a section says otherwise.

---

## Decisions the owner must make

| # | Decision | Recommended |
|---|---|---|
| 1 | Approve the 16 groups in section B (names, order, one line descriptions) | Approve as listed, or edit |
| 2 | Picture path (section C) | Our own SVG illustrations: group motifs for all notes, hand finished art for the top 200 |
| 3 | Who draws the top 200 | An Opus agent draws flat SVGs in the set style; owner reviews a first batch of 20 before the rest. Commissioning an illustrator is the alternative (needs a quote) |
| 4 | Merge true synonyms and misspellings (Mandarin Orange into Mandarin, Cardamon into Cardamom) through a reviewed alias file | Yes, synonyms and misspellings only; origins such as Madagascan Vanilla stay their own note, listed under Vanilla as a kind of it |
| 5 | Product pages after an alias merge | Keep the shop's own spelling on the product page ("As published by"), link it to the merged note's page |
| 6 | Aroma molecules | Musk and amber molecules (Ambroxan, Ambrox, Cetalox, Habanolide) in Musk and Amber; every other named molecule and abstract accord in Modern Accords and Aldehydes |
| 7 | Prose that the parser read as a note ("setting the stage", "sophistication", "Parfum") | Hide it through a reviewed list and fix the parser, as the 6 Oct pass did for "Perfect for spring" |
| 8 | One line descriptions on note pages | Yes for the top 200 only, factual (what the material is and where it comes from), in our own words |
| 9 | Group page addresses | `/notes/group/<id>`, 16 fixed addresses that answer 200 and go in the sitemap |
| 10 | Keep every note address alive even when the note leaves the data | Yes: an append only address memory, a vanished note opens its group page |

---

## What is there now (measured, 9 Oct 2026)

**Data.** 5,746 notes on the Notes tab (about 7,300 raw spellings before the
existing case and punctuation merge in `src/catalogue/noteName.ts`). 12,495 of
30,931 products (40%) list notes, 102,764 note uses in all. The tail is long:

| used by | notes | share of notes |
|---|---|---|
| 1 product only | 2,736 | 48% |
| 2 or more | 3,010 | 52% |
| 5 or more | 1,199 | 21% |
| 10 or more | 668 | 12% |
| 50 or more | 223 | 4% |
| top 200 (61 or more) | 200 | 3.5%, but 79% of all note uses |
| top 500 (15 or more) | 500 | 87% of all note uses |

**Notes tab** (`notesPanel()`, `demo/app.ts`). A sort dropdown, a layer
dropdown, a row of layer chips, one sentence, then every note as a full width
text row with its count, A to Z dividers and a phone only letter strip.

What is clunky:

1. **All 5,746 rows render at once.** Every other long list uses `chunked()`;
   this one does not, so the tab builds about 23,000 elements in one go.
2. **Two controls do one job.** The layer dropdown and the layer chips both
   filter by top, middle or base.
3. **No search.** Finding "Pink Pepper" means scrolling or the letter strip.
4. **No grouping and no pictures.** A wall of words; nothing says that
   bergamot and lemon belong together.
5. **Variants listed apart**: Cedar (1,381) and Cedarwood (1,297), Mandarin
   (790) and Mandarin Orange (722), Tonka Bean and Tonka, Oud and Oudh (40),
   Cardamom and Cardamon (23), Lily of the Valley and Lilly of the Valley.
6. **Junk entries** a shop's prose left behind: "Fresh" (26), "setting the
   stage" (11), "sophistication" (8), "Parfum" (7), "Fragrance" (6).
7. **Half the list is notes used once**, given the same weight as Musk (4,085).
8. **Rows are buttons, not links**: no middle click, no copy link, nothing for
   a crawler to follow.

**Note page** (`noteView()`). Back button, the name, a count, layer chips, one
sentence, then the fragrance grid. No picture, no group, no description, no
related notes, and a tile does not say where in the pyramid the note sits.
Note pages are served by `404.html` (HTTP 404) and are not in the sitemap;
only `/notes` is.

---

## A. Legal and originality

### What is free and what is protected (UK, and the EU equivalent)

| Free to use | Protected |
|---|---|
| Facts: that bergamot is a citrus, that vetiver is a root | A site's **images** (copyright, artistic works, CDPA 1988) |
| Common perfumery words: citrus, floral, woody, gourmand, aldehydic, aquatic, musk, amber | A site's **descriptions** and other written text (copyright, literary works) |
| The idea of grouping notes into families | A **database** built with substantial investment: extracting or reusing a substantial part, or repeatedly taking small parts, is barred (UK Copyright and Rights in Databases Regulations 1997; EU Database Directive 96/9/EC) |
| A generic layout: a grid of tiles with a picture above a centred label, group headings, a jump bar | A database's **selection and arrangement** where it is the author's own intellectual creation (CDPA s.3A): their particular group list, order and naming taken as a set |
| Individual note to group facts arrived at independently | Their **note to group table taken wholesale**, which is extraction of the database |
| | Their **look**: header bars, colours, icons, wording (copyright in the artwork; passing off if it misleads) |

Our position: D26 stands. Fragrantica is not a source of data, search, notes,
groups or pictures; no agent fetches its pages or images, and its robots.txt
and CDN refuse our bot anyway (D23: a refusal is never worked around). The
owner viewing their page is fine: a layout idea is not protected. What must not
happen is transcription of what was seen.

### Clean room method

1. **Allowed sources, recorded per decision.** General perfumery vocabulary
   (family words common to textbooks and trade usage); ISO 9235 terms (essential
   oil, absolute, resinoid) only to strip such suffixes from names; Wikidata
   facts (CC0), such as "bergamot orange: subclass of citrus"; Wikipedia read for
   facts only, never copied (its text is CC BY-SA); and **our own data**: the
   head noun of each name and which notes appear together across our 12,495
   pyramids. An industry glossary (for example IFRA's) may be checked for a
   single fact, never copied for its structure.
2. **Our own list and order.** The 16 groups below were set by the owner on
   9 Oct 2026, ordered light to heavy (the order a scent fades, top to base),
   with our own names. They differ deliberately from any single site's list in
   count, order and wording, and include groups such sites do not have in this
   form (Fresh Air and Water, Modern Accords and Aldehydes).
3. **Our own words.** Every group line and note description is written fresh.
4. **Assignments from rules over our data**, then reviewed (section B), never
   from another site's table. The person or agent reviewing does not have
   another site's notes pages open.
5. **Provenance in the repo.** `data/note-groups.json` carries each group's id,
   name, order, description, author and date; every reviewed decision in
   `data/note-group-overrides.json` carries a `basis` (`head noun`, `lexicon`,
   `wikidata:Q…`, `owner`) and a date. The art manifest (section C) records the
   author and licence of every picture.

**Avoid:** their group list, labels or order; their descriptions; their note to
group assignments in bulk; their pictures, icons, header bars or colours; any
screenshot of their site in the repo; any request to their servers.

---

## B. Taxonomy: APPROVED (owner, 9 Oct 2026)

### The 16 groups (owner baseline, light to heavy)

| # | id | Name | One line (our words, draft) | Typical notes |
|---|---|---|---|---|
| 1 | `air-water` | Fresh Air and Water | Sea spray, rain, salt and clean air: the lightest notes of all. | Sea Salt, Marine Accord, Rain, Ozone, Calone |
| 2 | `citrus` | Citrus | Peel, zest and juice of lemons, oranges and their cousins. | Bergamot, Lemon, Grapefruit, Mandarin, Neroli |
| 3 | `herbs-greens` | Herbs and Greens | Cut leaves, grass, garden herbs and lavender. Crisp and cool. | Lavender, Clary Sage, Mint, Violet Leaf, Galbanum |
| 4 | `fruits` | Fruits and Berries | Orchard, berry and tropical fruit, from juicy to jammy. | Blackcurrant, Pear, Apple, Raspberry, Peach |
| 5 | `flowers` | Flowers | Rose, violet, iris and the rest of the flower garden. | Rose, Geranium, Violet, Iris, Peony |
| 6 | `white-flowers` | White Flowers | Jasmine, tuberose, orange blossom and other rich, heady blooms. | Jasmine, Orange Blossom, Tuberose, Gardenia, Ylang Ylang |
| 7 | `spices` | Spices | Warmth and bite from the spice rack. | Pink Pepper, Cardamom, Ginger, Cinnamon, Saffron |
| 8 | `sweet` | Sweet and Gourmand | Vanilla, tonka, caramel, honey, nuts, coffee and tea: good enough to eat and drink. | Vanilla, Tonka Bean, Caramel, Coffee, Tea |
| 9 | `drinks` | Drinks and Spirits | Rum, whisky, cognac, wine, champagne and cocktails. | Rum, Cognac, Whisky, Champagne, Gin |
| 10 | `woods` | Woods | Sandalwood, cedar, oud and other dry or creamy woods. | Sandalwood, Cedar, Oud, Guaiac Wood, Cashmeran |
| 11 | `earth-moss` | Earth and Moss | Patchouli, vetiver, oakmoss and the forest floor. | Patchouli, Vetiver, Oakmoss, Moss |
| 12 | `resins` | Resins and Incense | Benzoin, labdanum, myrrh and frankincense: warm and slow. | Benzoin, Incense, Labdanum, Myrrh, Styrax |
| 13 | `musk-amber` | Musk and Amber | Soft musks and ambers: the skin scent that lasts longest. | Musk, Amber, White Musk, Ambroxan, Ambergris |
| 14 | `leather-smoke` | Leather and Smoke | Leather, suede, tobacco, birch tar and smoky notes. | Leather, Tobacco, Suede, Birch Tar, Castoreum |
| 15 | `modern` | Modern Accords and Aldehydes | Sparkling aldehydes, lab made molecules and named accords. | Aldehydes, Hedione, Iso E Super, Solar Accord |
| 16 | `more` | More Notes | Notes we have not placed in a group yet. | fallback only |

Each note sits in **exactly one** group (its primary). A note that could sit in
two (Rose Water, Tobacco Leaf, Orris) gets one by the rule order below, and a
reviewed override where the rule is wrong. No secondary groups: one tile, one
place, one count. The note page may still say "often worn with" for related
groups (from co-occurrence), which is not a second membership.

### Merge and alias step (before grouping)

Three layers, each keeping today's rules intact:

1. **Mechanical merge (exists).** `noteMergeKey` joins spellings that differ in
   case, spaces, accents or punctuation. About 7,300 raw spellings become 5,746.
   Unchanged, and its "never merged" tests stay.
2. **Reviewed aliases (new), `data/note-aliases.json`.** Two kinds:
   - `same`: one material, two names or a misspelling. "Mandarin Orange" →
     Mandarin, "Cedarwood" → Cedar (owner to confirm which name leads), "Tonka"
     → Tonka Bean, "Oudh" → Oud, "Cardamon" → Cardamom, "Lavander" → Lavender,
     "Lilly of the Valley" → Lily of the Valley, "Black Current" → Blackcurrant,
     "Benjoin" → Benzoin, "Oilbanum" → Olibanum. The tile and the note page
     show the leading name; the counts add up.
   - `kindOf`: an origin or a grade of a note, kept as its own note and page but
     listed under its parent ("Kinds of Vanilla: Madagascan Vanilla, Bourbon
     Vanilla"). Keeps the 6 Oct rule that these are not the same note.
   Candidates come from a script (plural forms, "X Orange" against "X", one
   letter typos in names of 6 letters or more, the same head noun with an origin
   word in front) and are **never applied without review**. The file is
   **append only**, like `data/id-aliases.json`: never delete or repoint an entry.
3. **Not a note (new), `data/note-not-a-note.json`.** Reviewed prose debris
   hidden from the tab and the product page, with a parser fix for the shape
   that produced it.

**Built 9 Oct 2026 (the merge half).** `data/note-aliases.json` exists and is
applied in `scripts/build-demo-catalogue.ts`, so every product carries one name
per ingredient and the Notes tab went from 5,746 notes to 4,603. It differs
from the draft above in two ways: the kinds are `plural`, `order`, `form`
(absolute, essence, oil, extract, concrete, CO2, resinoid, supplier labels),
`country` (Italy Lemon, Italian Lemon), `spelling` and `synonym`; and
`kindOf` is not a kind. Origins, parts and accords simply stay their own notes
and the file's `keepApart` list names the pairs most likely to be mistaken for
one (Blackcurrant Leaf, Blackcurrant Bud, White Musk, Bitter Orange, Pink
Pepper, Green Apple). A merged spelling's address (`/notes/<slug>`) opens the
canonical note, from the build's `NOTE_ALIASES` list. The icon manifest and the
alias file are checked against each other by `tests/noteAliases.test.ts`.
Grouping (the rest of this section) is not built.

### How every note gets its group

Rules run in this order; the first that answers wins:

1. **Override** from `data/note-group-overrides.json` (reviewed, with basis).
2. **Alias**: a `same` alias takes its leading note's group; a `kindOf` takes
   its parent's.
3. **Exact phrase lexicon**: two word names whose head would mislead
   ("Orange Blossom" → White Flowers, "Pink Pepper" → Spices, "Rose Water" →
   Flowers, "Tobacco Leaf" → Leather and Smoke, "Salted Caramel" → Sweet).
4. **Named molecule list** (decision 6).
5. **Head noun**: the last word of an English name ("Apple Leaf" → leaf →
   Herbs and Greens; "Black Peony" → Flowers); for "X de Y", "X of Y" the first
   part ("Bois de Santal"). Suffixes such as essence, absolute, oil, accord,
   resinoid, CO2 are stripped first.
6. **Any keyword in the name**, right to left, or a keyword at the end or start
   of a compound ("Pepperwood", "Peppercorn"): **suggested only**, written to a
   review queue, not applied.
7. Otherwise **More Notes**.

Code: a pure `src/catalogue/noteGroups.ts` with the lexicon, run at build time,
writing the group of every note into the Notes data (section E). Rule data
lives in `data/note-groups.json` (groups, lexicon) so a review changes data, not
code.

### Coverage measured with a draft rule set

A throwaway draft of these rules (a keyword lexicon of about 600 words over a
group list very close to the baseline; run once during planning, not
committed) placed:

| | placed | of |
|---|---|---|
| all notes | 4,712 (82%) | 5,746 |
| all note uses | 97.5% | 102,764 |
| top 200 notes | 200 (100%) | 200 |
| notes used by 10 or more | 637 (95%) | 668 |
| notes used by 5 or more | 1,082 (90%) | 1,199 |

Spot checks: the head noun and phrase rules looked right about 24 times in 25;
the compound and stem guesses (185 notes) about 20 in 25 (Benzyl Cinnamate
read as "mate", Grapfruit as fruit, Tuberrose as Flowers), which is why rule 6
only suggests. To be measured again against the approved list in phase 1.

**The 1,034 left over** (630 used by one product, 117 by five or more), and
what happens to them:

- Real notes missing from the lexicon (add about 150 words): Angelica (50),
  Cassia (43), Hawthorn (28), Mignonette (25), Beeswax (24), Mirabelle (24),
  Amyris (22), Pelargonium (21), Sesame (19), Datura (17), Rangoon Creeper (17),
  Nagarmotha (13), Broom (12), Timur (12), Tamarind, Linden, Fenugreek.
- Misspellings, to the alias file: Oudh (40), Cardamon (23), Oilbanum (10),
  Hiacynth (9), Lavander (9), Lilly of the Valley (8), Black Current (7),
  Benjoin (7), Ambregis (6).
- Accords and abstract words, to Modern Accords and Aldehydes or by their key
  word: Solar Accord (15), Iced Accord (8), Vegetal Accord (8), love accord (6),
  Fresh (26), Oriental (7).
- Prose debris, to the not a note list: setting the stage (11), sophistication
  (8), Parfum (7), Fragrance (6), "warm up", "ensures the fragrance".
- The rest, mostly single use oddities ("Oiselet de Chypre", "Nutella"), to
  More Notes.

**Targets after review:** no top 500 note in More Notes; More Notes under 10%
of notes and under 1% of note uses. More Notes is shown last and collapsed.

### Tests (`tests/noteGroups.test.ts`, `tests/noteAliases.test.ts`)

- Every note in `NOTE_INDEX` has exactly one group, and it is one of the 16 ids.
- The group list matches the approved ids, names and order exactly.
- Group lines: at most 90 characters, no hyphens or dashes, British English.
- Every override names a real group and carries a basis and a date.
- No top 500 note in More Notes; More Notes under the two limits above.
- The same input always gives the same groups.
- Alias file: append only against `HEAD` (same pattern as the id alias test),
  no chains or cycles, a `same` alias never points at a `kindOf`.
- Not a note list: every entry is reviewed (has a date), and no top 500 note is
  on it.

---

## C. Pictures

### Options, ranked

| Rank | Option | Licence safety | Cost | Look |
|---|---|---|---|---|
| 1 | **Our own SVG illustrations** | Highest: we own them | Agent time; or an illustrator's quote for the top 200 | One consistent style, sharp at any size, light, themeable for dark mode |
| 2 | Wikimedia Commons, CC0 and public domain only | Good if every file's licence is checked and recorded | Free | Mixed photos of uneven quality; no picture for accords or molecules; heavier raster files |
| 3 | Stock or licensed icon packs | Depends on terms: many forbid redistribution as a set or require credit; per seat subscriptions | Subscription | Few packs cover vetiver, labdanum or ambergris; several artists means several styles |
| 4 | AI generated art | Unclear: in the UK a computer generated work's author is whoever made the arrangements (CDPA s.9(3)), but whether it is protected and whether the model's training infringed others is unsettled and disputed in court; provider terms vary; in the US purely generated images have no copyright, so anyone may copy ours | Low | Hard to hold one style over 200 or more images; stray text and odd shapes; photographic output is heavy raster |

### Recommended: our own SVG set

**How to cover about 5,700 notes sensibly:**

1. **16 group motifs** and about **40 subject motifs** (a citrus slice, a
   berry cluster, a leaf, a sprig, a petal bloom, a white star flower, a pod, a
   bean, a cup, a glass, a log end, a moss tuft, a resin drop, a smoke curl, a
   wave, a droplet, a flask). Flat shapes, two or three fills, one stroke
   weight, a 3:2 frame (viewBox 0 0 300 200), drawn by hand as SVG source.
2. **Long tail, per note tinting.** A note with no art of its own uses the
   subject motif its head noun names (leaf, berry, flower, wood, bean) or else
   its group motif, coloured from its group's palette with a fixed shift worked
   out from its slug (hue within about 12 degrees, lightness within a small
   band), so a row of tiles in one group is related but not identical. No file
   per note: the tile draws `<svg><use href="motifs.<hash>.svg#leaf"/></svg>`
   and sets colours through CSS custom properties.
3. **Top 200 by product count, hand finished.** Each gets its own SVG in the
   same style (a lemon looks like a lemon, a vanilla pod like a pod). These 200
   cover 79% of note uses, so most tiles a visitor sees are bespoke.
4. **Generation script** `scripts/build-note-art.ts`: reads the committed
   sources, minifies them, checks the rules (viewBox, no scripts, no external
   references, no embedded raster, no text), and writes hashed files through
   `writeGenerated`.

**Files and the generated-files rules:**

| Path | What | Policy |
|---|---|---|
| `art/notes/motifs/*.svg`, `art/notes/hand/*.svg` | Hand made sources | committed source, never written by a build |
| `art/notes/manifest.json` | Every picture: file, note or motif, author, licence ("own work, PriceSniffs"), date, tool | committed source |
| `demo/note-art/motifs.<hash>.svg`, `demo/note-art/<slug>.<hash>.svg` | Minified, hashed output | `deploy`: a line in `scripts/generated-files.txt` and `.gitignore` in the same commit; built by `npm run demo` |

The service worker already treats hashed files as cache first; the build adds
the `note-art` folder to that rule.

**Sizes.**

| Where | Rendered picture area (3:2) |
|---|---|
| Notes tab, 320 px wide (2 across) | about 140 x 93 |
| Notes tab, 390 px wide (2 across) | about 170 x 113 |
| Notes tab, 1280 px wide (4 across) | about 280 x 187 |
| Note page hero | full column on a phone (up to 428 x 285); 480 x 320 on desktop |
| Related notes on the note page | 120 x 80 |

SVG needs no size variants. If any hand art ever has to be raster, it ships as
WebP at 600 x 400 (2x the desktop tile), at most 25 KB.

**Weight budget.**

- Home first load: **plus 0 bytes**. The current 4.3 MB by first tiles
  (`docs/GIFT-SETS-AND-OILS-PLAN.md`, phase 10) must not grow; the proposed
  limit for later work is 2% heavier and 5% slower.
- Group data and aliases: a lazy data file (`LAZY_DATA_MODULES` in
  `scripts/dataFiles.ts`), fetched when Notes or a note page opens. Estimate
  about 40 KB gzipped.
- Notes tab, first screen: at most **150 KB gzipped** of art (one motif sprite,
  at most 60 KB, plus the hand art in view, at most 6 KB each).
- Note page: at most **30 KB** of art.
- Every `<img>` below the first screen is `loading="lazy" decoding="async"`
  with width and height set so nothing shifts.
- Per file at most 6 KB raw for hand art, 60 KB for the sprite, 1.5 MB for the
  folder in all; a test holds these (the brand logo test is the model).

### If Commons photos are wanted later

For a note with no art at all: take the Wikidata item's image (P18), read the
licence from the Commons API, accept only CC0 or public domain, store the file
with its source page, author, licence and sha256 in `art/notes/commons.json`,
and list each on an "Image credits" section of `/about/legal`. Mixing photos
with the illustrated set would look uneven, so this is not recommended.

---

## D. Page redesign

### Notes tab, `/notes`

Group sizes and layer splits in the wireframes are illustrative; the per note
totals (Bergamot 3,660, Lemon 1,290) are today's.

```
Desktop, 1280 px                                           (content max 1200 px)
┌──────────────────────────────────────────────────────────────────────────────┐
│ Notes                                                              5,746     │
│ [ Search notes                         ]  Sort: Most used ▾   Layer: Any ▾   │
│ Groups are our own way of sorting the notes shops publish.                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ STICKY: Fresh Air and Water 120 · Citrus 422 · Herbs and Greens 475 · …  ›   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Citrus  · 422 notes                                                          │
│ Peel, zest and juice of lemons, oranges and their cousins.                   │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                           │
│ │ [ art ]  │ │ [ art ]  │ │ [ art ]  │ │ [ art ]  │   tile 3:2 picture,       │
│ │          │ │          │ │          │ │          │   name centred below,     │
│ │ Bergamot │ │  Lemon   │ │Grapefruit│ │ Mandarin │   "3,660 fragrances"      │
│ │  3,660   │ │  1,290   │ │   925    │ │  1,512   │   under it                │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                           │
│ … 12 tiles per group on desktop …                                            │
│                                         [ See all 422 Citrus notes → ]       │
│ Herbs and Greens · 475 notes                                                 │
│ …                                                                            │
│ More Notes · 610 notes                              [ Show ▾ ] (collapsed)   │
└──────────────────────────────────────────────────────────────────────────────┘

Phone, 390 px (320 px the same, narrower tiles)
┌───────────────────────────────┐
│ Notes                  5,746  │
│ [ Search notes            ]   │
│ Sort ▾        Layer ▾         │
├───────────────────────────────┤
│ STICKY ‹ Citrus 422 · Herbs … │  scrolls sideways
├───────────────────────────────┤
│ Citrus · 422 notes            │
│ ┌───────────┐ ┌───────────┐   │
│ │  [ art ]  │ │  [ art ]  │   │
│ │ Bergamot  │ │   Lemon   │   │
│ │   3,660   │ │   1,290   │   │
│ └───────────┘ └───────────┘   │
│ … 8 tiles per group …         │
│ [ See all 422 Citrus notes ]  │
└───────────────────────────────┘
```

- **Tile.** A link (`<a href="/notes/bergamot">`), not a button. `--surface`
  card, the radius of a fragrance tile, picture area on a ground tinted from the
  group colour mixed with `--surface`, name in the title style centred, the
  count in the count style under it, both wrapping to two lines at most. The
  whole tile is the target (well over 44 px).
- **Hover and focus.** On devices with hover: the border goes to `--ink-2` and
  the picture grows 3%, no motion under reduced motion. Keyboard: the
  standard `--focus` ring. Pressed: the existing pressed style.
- **Group header.** `<h2>` with the group name and "422 notes", and the one line
  under it. `scroll-margin-top` clears the sticky bar.
- **Sticky jump bar.** `<nav aria-label="Note groups">` of group chips with
  counts, sticky under the site header; sideways scroll on a phone with faded
  edges; the group in view is marked (`aria-current="true"`). Tapping scrolls to
  the group.
- **Search.** A labelled input at the top. Narrows the tiles as you type (from
  the first letter, 100 ms pause), matching the start of any word of the clean
  name and of its aliases (typing "mandarine" finds Mandarin). Groups with no
  match hide, their chips dim, a polite live region says "34 notes match".
  Escape clears. The query goes in the address (`/notes?q=rose`) with
  `replaceState`, like sort.
- **Sort.** Most used (default) or A to Z, within each group. The A to Z letter
  dividers and the letter strip go: groups and search replace them.
- **Layer.** One dropdown (Any, Top, Middle, Base). The duplicate chip row goes.
- **First render.** 12 tiles per group on desktop, 8 on a phone (about 190
  tiles instead of 5,746 rows); "See all" opens the group page, where the grid
  uses `chunked()`. Search covers every note.
- **Dark mode.** Every colour is a token with a light and a dark value; the 16
  group colours get a ground and an ink token each, in both palettes, and
  `tests/paletteContrast.test.ts` holds the motif against its ground at 3:1.
- **Layout.** Mobile layout is 2 columns, desktop 4 (`data-layout`, not a
  width breakpoint, as DESIGN-SYSTEM 5.1 says the app works).

### Group page, `/notes/group/citrus`

The same header, sticky bar and search, one group, every note in the grid
(chunked), then "Notes often worn with citrus": the groups that most often
share a pyramid with it, from our data.

### Note page, `/notes/bergamot`

```
Desktop 1280                                    Phone 390
┌──────────────────────────────────────────┐    ┌──────────────────────────┐
│ ‹ Notes / Citrus                         │    │ ‹ Citrus                 │
│ ┌──────────────┐  Bergamot               │    │ ┌──────────────────────┐ │
│ │              │  [Citrus]  (group chip) │    │ │        [ art ]       │ │
│ │   [ art ]    │  The peel oil of a      │    │ │       3:2, full      │ │
│ │  480 x 320   │  small bitter citrus.   │    │ └──────────────────────┘ │
│ │              │  In 3,660 fragrances:   │    │ Bergamot                 │
│ └──────────────┘  Top 3,120 · Middle 410 │    │ [Citrus]                 │
│                   · Base 130  (chips)    │    │ The peel oil of a small  │
│                   Also published as:     │    │ bitter citrus.           │
│                   Bergamot Oil, …        │    │ In 3,660 fragrances      │
│ Kinds of Bergamot: Calabrian Bergamot …  │    │ Top · Middle · Base      │
│ Often found with: [Lemon] [Neroli]       │    │ Often found with  ›      │
│   [Lavender] [Vetiver] … (small tiles)   │    │ Sort ▾  Filter ▾         │
│ Sort ▾  Filter ▾                         │    │ ┌────┐ ┌────┐            │
│ ┌────┐┌────┐┌────┐┌────┐┌────┐           │    │ │Top │ │Base│ fragrance  │
│ │Top ││Mid ││Top ││Base││Top │ tiles     │    │ └────┘ └────┘ tiles      │
│ └────┘└────┘└────┘└────┘└────┘ with tier │    └──────────────────────────┘
└──────────────────────────────────────────┘
```

- **Picture** large, alt text empty (the heading names it).
- **Group chip** links to the group page. **Description** only where one has
  been written and reviewed (decision 8); otherwise nothing, never a filler.
- **Position**: the existing layer chips stay (they filter); each fragrance tile
  gains a small "Top", "Middle" or "Base" tag (several if the shop lists it in
  more than one).
- **Related notes**: the 8 notes that share the most pyramids with this one,
  ranked by lift (shared products against what chance would give), at least 3
  shared products, from our own data.
- **Breadcrumb** replaces the bare Back button.

### Addresses, redirects, SEO

- `/notes/<slug>` stays exactly as now (`noteSlug`). Every address that works
  today keeps working: the computed address map stays, and an alias adds the
  old spelling's address pointing at the leading note (the page then rewrites
  the address, as today).
- **Address memory (decision 10):** `data/note-slugs.json`, append only, every
  note address ever published and the note or group it now opens. A note that
  leaves the data opens its group page instead of "not found" (409 addresses
  were lost that way on 6 Oct). A `rebuild` file: a line in
  `scripts/generated-files.txt`, written through `writeGenerated`.
- `/notes/group/<id>`: 16 new fixed addresses. The router checks this pattern
  before `/notes/<slug>`, and a test fails if any note's slug is `group`.
  `scripts/build-route-pages.ts` writes a page for each so they answer 200
  (about 15 MB more in the deploy, the cost the 16 existing fixed pages carry),
  each with its own title and description in `demo/head.ts`
  ("Citrus notes in perfume", "422 citrus notes, from bergamot to yuzu").
- **Sitemap:** add the 16 group pages. Single note pages stay out while they are
  served with a 404 status (ROUTING-PLAN 3, option (c) is what would fix that for
  all leaf pages).

### Accessibility

Real links and headings; the jump bar is a `nav` with a label; the search has a
visible label and a live count; focus order runs search, sort, layer, jump bar,
groups; decorative pictures have empty alt; text in tiles meets AA in both
palettes; reduced motion removes the hover growth and smooth scroll;
`npm run a11y` and `tests/accessibility.test.ts` cover `/notes`, one group page
and one note page.

---

## E. Build plan

Nothing starts before decision 1. Each phase is one commit or a short series,
with tests in the same commit, and follows CLAUDE.md (no generated file by
hand, stage by name, fetch and merge before pushing).

| Phase | Work | Effort | Agent | Tests | Owner |
|---|---|---|---|---|---|
| 0 | Approve the groups and decisions 2 to 10 | | | | Yes |
| 1 | Taxonomy: `src/catalogue/noteGroups.ts`, `data/note-groups.json` (groups, lexicon, provenance), alias and not a note files with the candidate script, overrides file. Review the top 1,200 notes (about 90% of uses) and every suggested placement | 1 day code, 1 to 2 sessions review | Sonnet for code; **Opus** for the review | `noteGroups`, `noteAliases` tests; coverage report against the targets | Confirm leading names for the first 30 alias pairs (Cedar or Cedarwood) |
| 2 | Data: group, aliases and related notes into a lazy data file; `NOTE_INDEX` gains group and aliases; address memory `data/note-slugs.json`; parser fix for the prose shapes | 0.5 day | Sonnet | data file weight test; every current address resolves; home first load unchanged | |
| 3 | Notes tab: tile grid, group headers, sticky jump bar, search, show all, one layer control; remove the duplicate chips and letter strip. Changelog line | 1 day | Sonnet, Opus review | Playwright: 2 columns at 320 and 390, 4 at 1280; search narrows; jump bar; axe in both themes | Look over it on a phone |
| 4 | Group pages and note page: routes, route pages, sitemap, head titles, breadcrumb, related notes, tier tags | 1 day | Sonnet | router tests; route page and sitemap tests; axe | |
| 5a | Art set: 16 group and about 40 subject motifs, palette tokens, `build-note-art.ts`, manifest, tinting; tiles switch from a plain coloured ground to motifs | 1 to 2 days | **Opus** (drawing), Sonnet (script) | art manifest and budget tests; contrast tests; `perf:images` | Approve the style on the first 20 |
| 5b | Hand finished art for the top 200 | 2 to 3 sessions | Opus, or an illustrator | same | Choose agent or illustrator (decision 3) |
| 6 | Descriptions for the top 200, factual, our words, from Wikidata facts with the Q id recorded | 1 session | Opus | length and style test, every description has a source id | Spot check 20 (decision 8) |
| 7 | Measure: `perf:load`, `perf:images`, `a11y`; record against the budgets here | 0.5 day | Sonnet | budgets | |

Phases 3 and 4 can ship before the art: tiles show the group colour ground and
the name until 5a lands, so the grouping and the streamlining reach visitors
first.

What the owner must provide: the approval of section B, decisions 2 to 10, a
look at the art style before the 200 are drawn, and, only if decision 3 goes to
an illustrator, a quote and a written assignment of copyright to PriceSniffs.

---

## F. Note icons on each product's own notes (plan only, 9 Oct 2026)

Owner request: the note icons (`demo/note-icons/`, built 9 Oct 2026, see
`docs/NOTE-ICONS.md`) should appear on each product listing, under that
product's own notes: the Top, Middle and Base notes on the product page and
possibly on product tiles. **Nothing here is built.**

### What the page has today, and what the data now allows

- `notesBlock()` in `demo/app.ts` draws three labelled tiers, each a centred,
  wrapping row of `button.note-chip` pills (12.5px text, `--surface-2`, 1px
  `--line` border). A pill opens the note's page. Nothing else.
- Product tiles (`fragranceTile()`) show no notes at all.
- After the alias merge (`data/note-aliases.json`) a product carries one name
  per ingredient, so the icon lookup is a plain match on the note's merge key.
  Measured on 9 Oct 2026 (4,603 notes after the merge, 102,652 note uses):
  831 notes have their own icon (name or alias), and they cover **92.1% of all
  note uses**. The top 20 notes are 43% of uses, the top 40 are 56%, the top
  100 are 74%, the top 200 are 83%. A product with notes shows 8 notes at the
  median, 13 at the 90th percentile, 20 at the 99th, 36 at most.

### Layout

An icon **above** the name, in the same button, so the whole thing stays one
tap target and one accessible name.

| | 320 px | 390 px | 1280 px |
|---|---|---|---|
| Item (button) | 66 wide, icon 36, name 12px, 2 lines max | 76 wide, icon 44, name 12.5px | 84 wide, icon 52, name 13px |
| Gap | 6 | 8 | 10 |
| Per row (content width = screen minus two 16px gutters; 288, 358, up to 560 in the notes block) | 4 (4 x 66 + 3 x 6 = 282) | 4 (4 x 76 + 3 x 8 = 328) | 6 to 7, centred |
| Row alignment | centred per row, as the chips are today, so a short last row sits under the middle | same | same |

- The item is a rounded 12px tile on `--surface-2` with the existing 1px line,
  accent border on hover and focus, `.on` state unchanged. A tile (not bare
  icons on the page ground) is what lets one icon set read on both themes:
  the icons were drawn for a dark tile (`#1B1B1F`) and a light one, and
  `--surface-2` is `#1A1A1D` dark and `#F2F2F4` light.
- The name wraps to two lines, then clips with an ellipsis; the full name is the
  button text so nothing is lost for a reader or a screen reader. Long names
  ("Burgundy Blackcurrant Buds Absolute") rely on this.
- Item height is fixed per breakpoint (icon box plus two text lines), so a row
  never jumps when an icon loads or fails.
- Fallback to the plain pill (icon beside the name, 24px) is kept as the
  narrowest layout only if a 4 up row at 320 fails the visual check; the first
  build uses the stacked item at every width.

### Notes without an icon

Fallback chain, first hit wins:

1. The note's own icon (name or alias, matched on the merge key, after the
   alias merge so a merged spelling can never miss its canonical's icon).
2. The note's **group icon** (`demo/note-icons/groups/<id>.svg`, 16 of them),
   from the approved group of the note (section B; Phase 1 and 2 of section E
   give every note a group by rule).
3. The `more` group icon, for a note the rules cannot place.

Until the group map exists the chain stops at step 3 for the long tail, which
is 8% of uses. A group icon is shown at 70% opacity with no extra mark, so a
reader can tell "this family" from "this exact note"; the name is always the
text. Prose the parser read as a note (decision 7) gets no icon and, once
hidden by the not-a-note list, no pill either.

### Loading cost

The home page's first load must not grow, so nothing icon related is imported
by the first bundle.

- **Icons are files, requested lazily.** `<img src="/note-icons/…svg" alt=""
  width height loading="lazy" decoding="async">`. A product page has its notes
  block well below the price table, so nothing is requested until it nears the
  viewport. Typical cost: 8 icons of about 1.5 KB (12 KB); the 99th percentile
  product 20 icons (about 30 KB); never more than the 36 of the busiest
  product. Every icon is under 2.5 KB; the whole set is about 270 KB and is
  never downloaded as a set.
- **Lookup table is a lazy data file**, not code in the bundle:
  `noteIcons.<hash>.json` (name key to icon file, plus note to group id once
  section E lands), registered in `LAZY_DATA_MODULES` (`scripts/dataFiles.ts`)
  the way the dormant products are, fetched the first time a product page with
  notes opens. About 831 notes plus their aliases: roughly 40 KB, 10 KB gzipped.
- **Cache.** GitHub Pages sends a short `Cache-Control` and we cannot change
  headers, so `demo/sw.js` gets a cache-first rule for `/note-icons/` into its
  own cache (`pricesniffs-icons-v1`): filled on first use, never precached at
  install, so the install cost is unchanged. To make cache-first safe, the
  build writes the icons under **content-hashed names**
  (`musk.3f9a1c2b.svg`, like the data files) and the lookup file names the
  hashed file; a redrawn icon is a new URL. That makes the hashed copies a
  `deploy` generated file: a line in `scripts/generated-files.txt` and
  `.gitignore` in the same commit as the build script
  (`scripts/build-note-icons.ts`, run by `npm run demo`).
- **Inline sprite: not in the first version.** A sprite of the top 40 notes
  would cover 56% of uses but costs about 60 KB uncompressed (about 20 KB
  gzipped) in whichever file carries it, and HTTP/2 on Pages makes a dozen
  1.5 KB files cheap. If measurement (section E, Phase 7) shows request count
  hurting the product page, ship the sprite **inside the lazy lookup file**, so
  the cost is paid with the notes and never at home page load; do not put it in
  the main bundle or `template.html`.
- **Budget to hold** (checked in tests below): home page first load requests no
  icon and its byte count is unchanged; product page with the median 8 notes
  makes at most 8 icon requests plus the one lookup file, total under 20 KB.

### Accessibility

- The icon is **decorative**: `alt=""`, no `title`, no `aria-label`. The
  button's accessible name is the note's name, exactly as today. The SVG's own
  `<title>` is not exposed when the file is used through `<img>`.
- Nothing is told by the picture alone: the tier label (Top, Middle, Base) and
  the note name stay as text, in the same document order.
- Tap target: the item is at least 66 x 76 px, over the 44 px minimum.
- Focus ring on the whole item (`:focus-visible`, the existing 2px accent
  outline). No animation, so nothing to reduce.
- If an icon fails to load, `onerror` hides the image and the tile keeps its
  size, name and border; offline, the cached icons still show.
- Text on the tile keeps the contrast the pill has now (ink on `--surface-2`);
  the icon colours were checked on both tiles when drawn.

### Product tiles

**Nothing changes on tiles in the first version.** A grid page has 24 to 60
tiles; three icons on each would add 70 to 180 image requests to the pages
visitors use most, and make the tile taller in a grid that is tuned for price
first. If the owner still wants them:

- Only on the larger tile density (`demo/tileDensity.ts`), never on the compact
  one, and only for products that have notes (41% of them).
- A single line of the product's **top three notes by tier order** as 20 px
  icons, `alt=""`, the names in the tile's visually hidden "Notes:" text so
  the accessible name gains them, lazy and from the same cache.
- Hidden below 360 px wide, and measured first (Phase 4 below) against the
  tile image budget.
- No new data: `DEMO_FRAGRANCES[i].notes` is already in memory.

### Tests

- `tests/noteIconLookup.test.ts` (unit): the lookup returns the icon of the
  canonical for every alias variant; every file it names exists; every note in
  the top 200 resolves to its own icon; a note with none gets its group icon,
  never nothing; hashed names match the file contents.
- `tests/noteIconsBlock.test.ts` (render): the markup of `notesBlock()` has one
  `img` with `alt=""` and `loading="lazy"` per note, the name as button text,
  the tiers in order, no icon for "Notes unavailable".
- Playwright at 320, 390 and 1280, light and dark: no horizontal page scroll,
  items per row as the table says, no item wider than its row, the row height
  fixed before and after the images load (layout shift under 0.01), axe clean
  in both themes.
- Network: the home page requests no `/note-icons/` file and its first-load
  bytes are unchanged (`perf:load` budget); the median product page requests at
  most 8 icons and 1 lookup file; a second visit is served from the icon cache;
  with `/note-icons/*` blocked the names, borders and sizes are intact.
- `tests/workflowRules` and `tests/generatedFiles` stay green with the new
  deploy file listed.

### Phases and estimate

| Phase | Work | Effort | Agent | Depends on |
|---|---|---|---|---|
| F0 | Owner: confirm icon above the name, tiles yes or no | minutes | owner | |
| F1 | `build-note-icons.ts` (hashed copies, lookup file, generated-files and `.gitignore` lines), `LAZY_DATA_MODULES` entry, `sw.js` icon cache rule | 0.5 to 1 day | Sonnet | merged aliases (done) |
| F2 | `notesBlock()` markup and CSS, fallback chain, lazy lookup load, `onerror` | 0.5 day | Sonnet | F1; the group map for step 2 of the fallback (section E, Phases 1 and 2), else step 3 only |
| F3 | Tests above, three widths and two themes | 0.5 day | Sonnet | F2 |
| F4 | Measure (`perf:load`, `a11y`), look at the page on a phone, decide on the sprite and on tiles | 0.5 day | Sonnet, owner look | F3 |
| F5 (optional) | Tile strip of three icons, only if asked | 0.5 day | Sonnet | F4 |

About 2 to 2.5 days of agent work for the product page, owner look at F4. The
risk to watch is conflicts: `demo/app.ts` and `demo/template.html` are edited
by other work (international formatting), so F2 should land in one short
commit after a fresh merge.
