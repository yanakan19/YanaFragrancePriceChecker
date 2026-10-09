# Guess the Fragrance: plan

Written 2026-10-09. **Plan only: no code, nothing posted.** The owner lifted
the social pause for this planning task alone.

The idea: an engagement post. A picture titled "Guess the Fragrance" hides a
perfume house and name as a word puzzle (first letter of each word, one blank
per other letter) and gives the notes and the strength as clues. A second
picture, 24 hours later, reveals the answer, the bottle and today's cheapest
price.

It reuses what exists: the black "standard" theme and Liberation Sans
(`social/DESIGN-SYSTEM.md`), the renderer (`scripts/socialRender.ts`), the
video template (`scripts/social-video-template.ts`, rules in
`docs/SOCIAL-MEDIA-PLAN.md` section 9), the notes checks (`cleanNotes` in
`scripts/social-deal-of-day.ts`) and the render-from-text rule for pictures
(`social/DESIGN-SYSTEM.md` section 10, `docs/OWNER-STEPS.md` 7d).

---

## 1. Visual spec

### 1.1 Formats

| File (in the post folder) | Size | Use |
|---|---|---|
| `guess-9x16.png` | 1080 x 1920 | Default. TikTok photo post, Story, Reel cover |
| `guess-1x1.png` | 1080 x 1080 | Instagram and Facebook feed |
| `guess-video-9x16.mp4` | 1080 x 1920, 10 s | Optional. TikTok, Reels, Shorts |
| `reveal-9x16.png`, `reveal-1x1.png` | as above | The follow up, a separate folder (section 3.2) |

Standard black theme only (`#0A0A0B`, white `#F7F7F8`, grey `#B9B9C0`, red
`#FF3B41` as the one accent), Liberation Sans, no hyphens or dashes in any
visible text, plain British English. The inverted red theme is for one off
posts, not a series.

### 1.2 Safe areas

* **9:16:** everything inside the TikTok box, x 110 to 970, y 380 to 1460, as
  the savings TikTok slides and every video already do. One picture then works
  on TikTok, Reels and Stories (the Story zone, y 250 to 1670, is wider).
* **1:1:** everything inside x 135 to 945, y 90 to 990. Instagram's profile
  grid shows a square as a 3:4 centre crop (middle 810 px), so the logo and
  puzzle must not sit nearer the sides.
* No web address on the picture (existing rule). The call to action is
  "Comment your guess".

### 1.3 Logo and name, top right (a new placement)

Every current post centres the wordmark at the top (`DESIGN-SYSTEM.md` section
4; `brandline` in the video template). The owner wants top right for this
series, so it becomes a documented variant, **corner**: the mark (58 px on
the picture, 62 px in the video, as today) plus "Price" white and "Sniffs"
red, Bold, 44 px (50 px in the video), 14 px gap, right edge on the right
edge of the safe box, top edge on its top. Never recoloured, stretched or
cropped. The video's PriceSniffs end card stays centred, as the template
requires. Left of the same row sits a grey pill "PUZZLE 7" (series number,
30 px, same style as the date pill on Deal of the Day).

### 1.4 Wireframe, 9:16 (typical case; sizes shrink only as the fit rules below say)

```
x110                                              x970
y380  [PUZZLE 7]                  (mark) PriceSniffs     row 1, 62 px, logo flush right
y500        Guess the Fragrance                          84 px bold, one line, "Fragrance" red
y590  THE HOUSE                                          30 px bold caps, letter spacing 5, #FF6A6E
y640  J___ P___ G_______                                 house: 64 px letters
y760  THE FRAGRANCE                                      kicker as above
y810  Le M___                                            name: 88 px, the main puzzle, up to 3 lines
y960  ( STRENGTH   Eau de Toilette )                     red outlined pill, as "Recommended for"
y1050 THE NOTES
      TOP    [chip] [chip] [chip] [chip]                 tier label 26 px caps, chips 30 px
      HEART  [chip] [chip] [chip]                        up to 4 chips a tier, then "+N more"
      BASE   [chip] [chip] [chip] [chip]
y1370 Comment your guess.                                46 px bold white
y1420 Answer in 24 hours.                                46 px regular grey
y1460
```

The title is 836 px wide at 84 px (measured with the bundled font), so it fits
the 860 px box on one line; the standard 92 px headline would not.

**1:1 (the same design, denser, as the 3:4 Deal post is):** logo row y 90;
title 64 px at y 180 (637 px wide); house at 56 px, name at 72 px; pill; notes
as three one line rows with at most 3 chips each; one line call to action at
40 px, "Comment your guess. Answer in 24 hours." If a puzzle does not fit the
square at its minimum sizes it is made as 9:16 only and the script says so.

### 1.5 How a blank is drawn

A hidden letter is **not a character**. Each word is a row of cells: the first
letter as text, then one empty `<i>` per hidden letter whose bottom border is
the dash (rounded, stroke max(6 px, 10% of the letter size), colour `#B9B9C0`,
70% of the cell width, sitting on the baseline). Reasons: `tests/socialPosts.test.ts`
fails the build on any dash or hyphen character in a post's visible text, and
a drawn bar is identical on every machine.

* Cell width is 0.75 em for every blank, so word length reads as a count. The
  first letter gets its own width plus 4 px (an M or W is wider than a cell).
* Word gap: 0.6 em of empty space. Never a bar between words.
* Size is chosen per block (house, name), largest first: 72 px (house) or 88 px
  (name) down to a **floor of 52 px** (1:1: 44 px). Wrap between words only,
  at most 2 lines for the house and 3 for the name; all lines of a block share
  one size. A puzzle that needs less than the floor is not eligible (it is
  skipped, never cut).
* On a 390 pt phone the picture is scaled by about 0.36, so a 52 px letter is
  19 pt and a 6 px bar is 2 pt: legible, and it is why the floor exists.

### 1.6 The dash rule

Applied to the house and to the fragrance name, word by word (split on spaces):

1. **Hyphens become spaces first** (`undash`, the post rule), so
   "Never-ending" is two words. Typographic quotes and apostrophes
   (`'` `’` `‘`) are normalised to `'`. Quote marks wrapping the whole name
   are removed (the catalogue has `''Le Male''`).
2. **A word that stays fully visible:** a small word from this list, any word
   that contains a digit, `&` and `+`, and punctuation on its own.
   Small words: a, an, the, of, and, or, in, on, at, to, for, by, with, from,
   de, du, des, del, della, dei, di, da, la, le, les, el, al, il, lo, las, los,
   der, den, von, van, et, y, e, no, pour, eau. They are shown in lower case
   unless first in the name. "Eau de" therefore always shows.
3. **Every other word:** its first letter (upper case, accent kept) then one
   blank per remaining letter. A letter is one grapheme (`Intl.Segmenter`), so
   "Privés" and "Lancôme" count the é and ô once, and an accent on a hidden
   letter is never revealed. Punctuation inside a word stays in place.
4. **Apostrophes split a word into parts.** A part of 1 or 2 letters next to the
   apostrophe stays visible (L', D', 's, 't, 'e, 'll); a longer part follows
   rule 3.
5. **Eligibility:** the name needs at least 4 letters, at most 32, at most 6
   words; the house and name together at least 3 hidden letters. Names with
   brackets, a trailing apostrophe ("Terre D'" is in the data) or a repeated
   word ("Elixir Elixir") are data slips and are skipped. A name that begins
   with the house ("Lancome La Vie Est Belle") has the house removed first.
   A trailing strength phrase in the name ("Eau de Parfum", "Eau de Toilette",
   "Eau de Cologne", "Extrait de Parfum", EDP, EDT) is removed first too,
   since the strength is shown as a clue. Other uses stay: "Le Parfum" is part
   of real names, and "Eau de Pamplemousse Rose" keeps its "Eau de".

Edge cases, produced by a prototype of this rule on the real catalogue names
(`_` here stands for the drawn bar):

| Input | Shown | Why |
|---|---|---|
| Dior / Sauvage | `D___` / `S______` | plain rule |
| Aventus (one word) | `A______` | one word is fine |
| L'INTERDIT | `L'I_______` | elision stays, next part masked, data casing fixed |
| L'eau D'issey | `L'eau D'I____` | L', eau, D' all stay |
| `''Le Male''` | `Le M___` | wrapping quotes removed, "Le" is small |
| Eau de Pamplemousse Rose | `Eau de P___________ R___` | "Eau de" shows |
| Juliette Has a Gun | `J_______ H__ a G__` | "a" is small |
| Dolce & Gabbana | `D____ & G______` | ampersand stays |
| Club De Nuit Intense Man | `C___ de N___ I______ M__` | "de" lower case |
| Baccarat Rouge 540 | `B_______ R____ 540` | digits stay (they are the name) |
| 1 Million | `1 M______` | digit word stays |
| 212 VIP Men | `212 V__ M__` | abbreviations are just words |
| L.12.12 Blanc Eau Intense | `L.12.12 B____ eau I______` | digit word stays |
| Eilish No.2 | `E_____ No.2` | "No." with a digit |
| Ralph's Club | `R____'s C___` | 's stays |
| Replica Never-ending Summer | `R______ N____ E_____ S_____` | hyphen becomes a space, so 4 words |
| Maison Francis Kurkdjian | `M_____ F______ K________` | 22 letters; wraps to two lines at 72 px ("Maison Francis" / "Kurkdjian") |
| Initio Parfums Privés | `I_____ P______ P_____` | é counted once |
| Blu Mediterraneo Arancia Di Capri | `B__ M___________ A______ di C____` | 30 letters, two lines at 56 px |

Rule 5's limits come from the catalogue: of 653 candidate names, 181 are one
word, and the longest sensible ones have 5 to 7 words.

### 1.7 Notes and strength

* Strength is the product's `concentration` field in the red outlined pill used
  for "Recommended for" on the scent profile card. Only five values are used
  (section 2).
* Notes use the scent profile card's chip style and its tier names **Top,
  Heart, Base** (the site's wording; the owner wrote "middle", see section 5).
  At most 4 per tier, then "+N more". Chips are 30 px text on `#18181B`.
* The small line "Notes as published by <shop>" is kept in `check.json`, not on the
  picture (it costs a line of space and gives nothing to guess from).
* Gender is not shown (it would give away too much); the optional hint is in
  section 4.

### 1.8 Legibility and accessibility

Colour pairs (WCAG ratios, computed with the project's own formula):

| Pair | Ratio | Use |
|---|---|---|
| `#F7F7F8` on `#0A0A0B` | 18.5 | first letters, title, notes |
| `#B9B9C0` on `#0A0A0B` | 10.1 | blank bars, grey text |
| `#FF6A6E` on `#0A0A0B` | 7.1 | kickers |
| `#F7F7F8` on `#18181B` | 16.6 | chips |
| `#8A8A93` on `#0A0A0B` | 5.8 | fine print only |

All clear 4.5:1; the bars need only 3:1. Nothing is below 26 px except fine
print, and no text sits on the photo. The picture's meaning is also given as
text: `alt.txt` in the folder (for the platform's alt text box), for example
"A perfume puzzle. House: three words, J, P, G. Name: two words, Le, M. Eau
de Toilette. Notes: ...". It lists lengths and first letters only, never the
answer.

### 1.9 The 10 second video

Built from the template with its rules unchanged (opening still, then
dissolve and swipe, none longer than 0.5 s, a slow 5% zoom on every scene,
the PriceSniffs end card, then the 1 s fade). It uses the black theme and the
corner logo on scenes 1 to 3; the end card is the template's centred one.

| From | Scene | Shows |
|---|---|---|
| 0.0 | Puzzle (still until 0.8) | the whole picture without the notes: logo, title, house, name, strength |
| 2.6 | Swipe (0.4 s) to Clues | Top, Heart, Base notes, larger |
| 5.3 | Dissolve (0.5 s) to Ask | "Comment your guess. Answer in 24 hours." |
| 7.4 | Swipe (0.4 s) to PriceSniffs | wordmark held to 9.0, fade to the background by 10.0 |

Scene lengths are 3.0, 3.2, 2.5, 2.6 s. Worked through with `buildTimeline`'s
arithmetic: starts 0.0, 2.6, 5.3, 7.4; ends 3.0, 5.8, 7.8, 10.0; the end card
is fully on screen from 7.8 to 9.0 (1.2 s, the minimum); total exactly 10.0 s,
300 frames. The first frame is a finished picture, so it works as the cover.

---

## 2. Data: choosing the fragrance

Source: `DEMO_FRAGRANCES` (`demo/data.ts`, built from `demo/catalogue.generated.ts`),
the same selectors the Deal of the Day uses (`eligibleForBottlePosts`,
`offersFor`, `buildComparison`, `bestOffer`, `cheapestVerdict`, `cleanNotes`).
A puzzle is a **product** (brand, name, strength, all sizes together); the
size is chosen only for the reveal.

### 2.1 Hard rules (all must pass)

1. A single bottle (`eligibleForBottlePosts`): no gift sets or oils.
2. Strength is one of Eau de Parfum, Eau de Toilette, Extrait de Parfum,
   Parfum, Eau de Cologne. Not "Disputed" (75 products), "Not stated" or
   "Aftershave".
3. **Notes you can trust:** `cleanNotes` passes (its 30% and 15 note limits),
   **top, heart and base each have at least 2 notes and at least 6 in all**
   (a 1/1/1 pyramid such as Mugler Alien is too thin to play), a known
   source shop, and where two sizes both carry notes they share at least 60%
   of them. No note repeats a word of the house or name.
4. **Guessable:** at least 6 shops stock it (the catalogue's `popularity`, best
   size), or the product is on an owner kept list of famous exceptions
   (`social/guess-fragrance-famous.json`, empty at the start; Baccarat Rouge
   540 stands at 5).
5. **Real brand:** not Commodity (its names are generic words and its notes are
   empty) and a brand with at least 5 products in the catalogue.
6. The name passes the eligibility rules in 1.6 and the blank layout fits.
7. A photo exists (the reveal needs it) and a purchasable, delivery stated
   cheapest offer exists today (`bestOffer`, `cheapestVerdict(rows).decided`).
8. Not used in the last **60 days** (product key = brand, name, strength, in
   lower case without punctuation, so another size never repeats it), and
   its brand not in the last 14 days of this history or the Deal of the Day
   brand of the same or the previous day.

Size of the pool on the 2026-10-08 build (distinct products with clean notes:
6,897): rule 3 and 4 leave about **650 products from 99 brands** (357 from
68 brands if popularity must be 8). Two a week for 60 days needs about 17.
Mix of that pool: womens 262, mens 177, not stated 179, unisex 35; designer
566, Middle Eastern 54, niche 33.

### 2.2 Variety (soft rules, ranked)

After the hard rules, the pick scores each candidate: +3 gender bucket
(men, women, unisex or not stated) different from the last two puzzles; +2
tier (designer, niche, Middle Eastern) different from the last puzzle; +2
budget band different from the last puzzle (under £40, £40 to £100, over £100,
by today's cheapest delivered price); plus the log of the shop count so
well known names win ties; ties by id so a rerun picks the same one. Over any
week the two puzzles differ in at least two of the three. `--id` forces a
choice but still answers to the hard rules (`--allow-repeat` is the one way
round, recorded in `check.json`, as `--allow-brand-repeat` is for deals).

### 2.3 History

`social/guess-fragrance-history.json`, committed text like
`social/deal-of-the-day-history.json`:

```
{ "date": "2026-10-13", "no": 1, "id": "ean-3508441001114", "key": "creedaventuseaudeparfum",
  "brand": "Creed", "gender": "mens", "tier": "niche", "band": "over100", "revealed": null }
```

Written by the real (not `--dry-run`) run, replacing the same day's entry so a
rerun is safe; the reveal run sets `revealed` to its date. `--dry-run` shows
the pick and the picture's text without writing. No candidate means no folder,
no entry and exit code 3, as the Deal script does.

### 2.4 The reveal's price (real price today only)

Drawn **at reveal time**, not copied from the day before:

* The product page's own cheapest offer for the chosen size: `bestOffer` of
  `buildComparison(offersFor(id), { sortBy: 'delivered' })`, purchasable,
  delivery stated, `cheapestVerdict(rows).decided`, and its `fetchedAt` within
  the last 24 hours. The live link check runs as for the Deal.
* Shows "Cheapest price", the delivered amount, "from <shop>", "Price includes
  delivery", and the checked time. **No MSRP, no "save N%", no "was" price**
  (94% of products have no brand price, and a claim that only some reveals
  can make would make the series uneven).
* If no offer is fresh enough, the script refuses to draw the price. The
  fallback is a reveal without the price box and with "See today's price at
  pricesniffs.space", chosen by the owner's `--no-price`, never silently.
* The size shown is the size priced (the most stocked size with a decided
  cheapest offer).

---

## 3. The generator

### 3.1 Where it fits

New files, following the Deal script's layout:

| File | Does |
|---|---|
| `scripts/social-guess-mask.ts` | The dash rule and the blank layout planner. Pure, no imports, so tests load it cheaply (the way `social-video-template.ts` is kept) |
| `scripts/social-guess-fragrance.ts` | The CLI and the exports: pick, history, puzzle HTML, reveal HTML, captions, `check.json`, `alt.txt`, `pictures.json` |
| `scripts/social-video-guess.ts` | `GUESS_VIDEO` (the timeline in 1.9) and `guessScenes`, using `videoDocument` and the template's checks |
| `package.json` | `social:guess` and `social:guess:video` |

```
npm run social:guess                        # today's puzzle: picks, writes the folder, history, prints the text
npm run social:guess -- --id <id>           # a chosen product (still answers to the rules)
npm run social:guess -- --dry-run           # the pick, the dashed text and the caption; writes nothing
npm run social:guess -- --reveal            # the reveal for the latest unrevealed puzzle
npm run social:guess -- --video             # also the 10 second video
```

It reuses: `renderSmooth` (2x then smooth scale) and `FIT_SCRIPT`/`data-fit`
shrink rules, `THEMES.standard` and `MARK` from `socialSlides.ts`,
`launchChromium`, `photoDataUri` and `liveCheck` (reveal only), `tiktokCaption`
is **not** used (one caption), `recordPictures` for `pictures.json`,
`renderVideo` and `videoDocument` for the video.

### 3.2 Output

Two folders per round, neither named after the answer:

* `social/posts/2026-10-13-guess-fragrance-01/`: `guess-9x16.html/.png`,
  `guess-1x1.html/.png`, optional `guess-video-9x16.mp4`, `caption.txt`,
  `alt.txt`, `check.json` (the answer, what is shown, the notes and their
  source, every rule's result, the pick's scores), `pictures.json`,
  `source.md`.
* `social/posts/2026-10-14-guess-fragrance-01-reveal/`: `reveal-9x16.*`,
  `reveal-1x1.*`, `caption.txt`, `check.json` (figures, shop, checked time,
  live check, photo address), `pictures.json`.

Pictures are never committed (D28). `pictures.json` lists each with
`make: "html"` for the PNGs (the file names `guess-9x16.html` map straight
through `sourceOf`) and a new `make: "guess-video"` for the video, drawn again
from `check.json` by a new branch in `scripts/render-social.ts`. The Social
pictures workflow already draws any changed folder under `social/posts/`, so it
needs no change. Two small additions: `MAKES` in `tests/socialPictures.test.ts`
and the `PictureMake` type. No new generated file type, so
`scripts/generated-files.txt` and `.gitignore` do not change (PNG and MP4 under
`social/` are already listed).

The repository is public, so `check.json` holds the answer from the moment it
is pushed: commit and push the puzzle folder only when posting, with a commit
message that names no fragrance ("Guess the Fragrance 1").

### 3.3 Captions

One `caption.txt` per post, working unchanged on every platform: **at most 280
characters including tags and address** (what a free X account allows), at
most 5 hashtags on the last line, the address `pricesniffs.space`, no "link in
bio", no platform names, no hyphens or dashes. Passed through the
yanaaidetection check as `social/DESIGN-SYSTEM.md` section 5 asks. No
`tiktok-caption.txt` (it would be a second caption).

Puzzle (252 characters): "Guess the Fragrance! Can you name this perfume?
The house and the name are hidden. The notes and the strength are your clues.
Comment your guess. Answer tomorrow, with today's price. pricesniffs.space
#guessthefragrance #perfume #fragrance #pricesniffs"

Reveal (257 characters for Aventus): "The answer: Creed Aventus Eau de Parfum
100ml. Cheapest price today: £259.00 delivered from Perfumoi, checked 9 Oct
2026. Prices change, so check before you buy. Affiliate links.
pricesniffs.space/creed_aventus_100ml #guessthefragrance #perfume
#pricesniffs"

(The price above is the 8 October crawl, for length only.) A long answer can
overrun: the builder shortens in this order and stops at the first that fits:
the product address becomes the bare `pricesniffs.space`, then hashtags are
dropped one at a time down to three, then it refuses and asks for `--name`.
The Maison Francis Kurkdjian example is 322 characters and fits after the first
step.

### 3.4 Tests

| Test file | Holds |
|---|---|
| `tests/guessFragranceMask.test.ts` | Every row of the edge case table in 1.6, plus invariants: hidden blanks = letters minus shown letters; nothing but a first letter, a small word, a digit word or a short apostrophe part is ever shown; no `-` `_` or dash character in the output; accents count once; a name that is only small words is refused |
| `tests/guessFragrancePick.test.ts` | Each hard rule; 60 day product and 14 day brand rest; same product in another size is blocked; variety scoring; same input gives the same pick; no candidate writes nothing and exits 3 |
| `tests/guessFragranceLayout.test.ts` | Renders the worst cases (3 word house, 6 word name of 32 letters, 2 note tiers, 4 chip tiers) in both formats with Chromium, as `dealOfDayLayout.test.ts` does. Fails if anything leaves the safe box, the logo is not flush top right, any text is under the minimum size, or any two blocks overlap. **Legibility:** reads each text and its background from the rendered page's computed styles and fails below `AA_TEXT` (4.5) for text and 3 for the bars, using `contrastBetween` from `demo/contrast.ts` |
| `tests/guessFragranceCaptions.test.ts` | For every `*-guess-fragrance-*` folder (found by name, not a fixed list like `socialSingleCaptions.test.ts`): exactly one caption file; at most 280 characters; at most 5 tags; address present; no dashes, "bio" or platform names; the puzzle caption, `alt.txt` and HTML (text and attributes) contain no word of the answer in `check.json`; the reveal caption carries the price, shop, "Prices change" and "Affiliate links" from `check.json` |
| existing tests | `socialPosts` already fails dashes in HTML text and captions (this is why blanks are drawn); add `guess-video` to `socialPictures`'s `MAKES`; add `GUESS_VIDEO` to `socialVideoTemplate` (no `timelineProblems`, 300 frames) |

---

## 4. Engagement

* **Call to action:** "Comment your guess. Answer in 24 hours." on the picture
  and in the caption. The reveal asks "Did you get it?" in its caption only
  where there is room.
* **Series name:** keep **Guess the Fragrance**, numbered ("Puzzle 7"), tag
  `#guessthefragrance`. Numbering is the series' memory and costs nothing.
* **Cadence (suggestion):** two puzzles a week, Tuesday and Friday at 17:00 UK
  (the Deal posts at 12:00 and the savings carousels at 18:00 stay clear), each
  revealed 24 hours later. Raise to three only if comments beat the Deal posts
  after a month. Judge by the plan's own rule (`SOCIAL-MEDIA-PLAN.md` section
  8): stop or change what moves nothing after 60 days. Measure comments per
  post, shares, and video completion.
* **Stories:** post the 9:16 as a Story with Instagram's Questions sticker
  ("Your guess?") and answer in the reveal Story. Stickers are added by hand in
  the app. A highlight "Guess" with a cover in the existing highlight style
  (`social/highlights/`) keeps the series together. The Story zone is wider than
  the TikTok box, so no new crop is needed.
* **Optional hint after 12 hours:** a Story giving the recommended-for line
  ("For Men") or the number of notes, by hand. Not built.
* **Weekly leaderboard, minimal:** every Sunday the owner posts one Story or
  comment, "Sharpest noses this week", naming the public handles that guessed
  correctly in public comments, first correct one first. One point per right
  guess, tallied by hand in the owner's own notes. No forms, no direct
  messages, no spreadsheet and **nothing in the repository** (it is public).
  Remove a name on request. **No prize**: a prize turns it into a promotion
  with its own advertising rules.
* **Reuse:** the reveal's bottle and price also make a Deal style Story; the
  puzzle picture can head a "5 puzzles this month" carousel later.

### Risks

| Risk | Handling |
|---|---|
| **Too much given away** | Only first letters and lengths, strength and at most 4 notes a tier; no gender, no size, no bottle shape. Rule 3 rejects notes that contain a word of the answer. Famous names are still fine: the game is recognising them |
| **Too hard or unfair** | Popularity floor, and the 6 note minimum, so there is something to reason from |
| **Wrong notes** | Only products with a complete pyramid (2+ notes in each tier, 6+ in all), source shop recorded, sizes agreeing at 60%. Shop notes have slips (Le Male lists "Carraway"), so the dry run prints the notes for a human glance and a short fix list handles known spellings. Never invent notes (existing rule) |
| **Wrong strength** | The field is used only when not "Disputed"; sibling sizes must agree |
| **Answer leaks early** | Public repository: push the folder only when posting; commit message without names (3.2) |
| **Bottle photo copyright** | See below |
| **Stale price** | Reveal prices at reveal time, 24 hour freshness, live link check, "Prices change" line and "Affiliate links" in the caption |
| **UK advertising** | The puzzle has no affiliate link and needs no label. The reveal carries the Deal posts' wording ("Affiliate links."). `SOCIAL-MEDIA-PLAN.md` section 5 says the label belongs at the start; the Deal captions put it near the end, so the reveal follows them unless the owner decides to change both |
| **Brand marks** | Text only; no brand logos (`SOCIAL-MEDIA-PLAN.md` 2b) |

**Photo policy (needs the owner).** `docs/IMAGE-PIPELINE.md` and D24: the site
hot links shop photos so the visitor's browser shows them beside a buy link;
that licenses display, and the pipeline says rehosting is a different legal
question. A reveal picture copies the photo into our own picture, as the Deal
of the Day pictures already do, which sits uneasily with "use your own photos"
(`SOCIAL-MEDIA-PLAN.md` section 5). The plan: the reveal uses the same photo
source and gate as the Deal of the Day (`photoUrl`, so nothing new is
decided); `--no-photo` draws the reveal with a large answer card and the mark
instead, with no photo; and the owner chooses (section 5) whether the default is
the Deal posts' practice or "own photo or no photo".

---

## 5. Build phases, samples, decisions

### 5.1 Phases (one Sonnet agent is enough throughout; review by the owner at A)

| Phase | Work | Effort |
|---|---|---|
| **A. Look first** | Five sample puzzles and one sample reveal, drawn as 9:16 and 1:1 stills from throwaway HTML using the real fonts and theme, to approve the look, the corner logo and the blanks. Nothing committed but a review set | 0.5 day |
| **B. Mask and pick** | `social-guess-mask.ts`, pool, hard and soft rules, history, `--dry-run`, mask and pick tests | 1 day |
| **C. Puzzle post** | HTML builders for both sizes, fit rules, `alt.txt`, caption, `check.json`, `pictures.json`, layout, legibility and caption tests | 1 day |
| **D. Reveal** | Price rules, photo and `--no-photo`, caption ladder, live check, reveal tests | 0.5 day |
| **E. Video** | `social-video-guess.ts`, `guess-video` in `render-social.ts` and the picture tests, timeline test, one render checked | 0.5 day |
| **F. Docs and routine** | `social/DESIGN-SYSTEM.md` new section (corner logo, blanks, rule), `SOCIAL-MEDIA-PLAN.md` section, `social/README.md` row, the scheduled routine for Tuesday and Friday and its reveals | 0.5 day |

About 4 days of agent time. Nothing here changes the website, so `demo/changelog.ts`
is not touched (`CLAUDE.md`: scripts, tests and docs get no line).

### 5.2 Five sample puzzles to approve (phase A)

Taken from the 2026-10-08 build of the catalogue; all pass the rules. Notes
are as the shops publish them; prices are that crawl's, for illustration
only, and the real ones are read on the day. `_` is the drawn bar.

| # | House shown | Name shown | Strength | Top / Heart / Base clues | Answer (private) | Illustrative reveal |
|---|---|---|---|---|---|---|
| 1 | `C____` | `A______` | Eau de Parfum | Apple, Blackcurrant, Pineapple, Italian Bergamot / Rose, Dry Birch, Moroccan Jasmine, Patchouli / Oakmoss, Musk, Ambergris, Vanilla | Creed Aventus 100ml (men, niche, over £100) | £259.00, Perfumoi |
| 2 | `L______` | `K______` | Eau de Parfum | Cinnamon, Nutmeg, Bergamot / Dates, Praline, Tuberose, Mahonial / Vanilla, Tonka Bean, Amberwood, Myrrh +2 | Lattafa Khamrah 100ml (unisex, Middle Eastern, under £40) | £28.99, Justmylook |
| 3 | `G_______` | `L'I_______` | Eau de Parfum | Pear, Bergamot / Orange Blossom, Jasmine, Tuberose / Patchouli, Vetiver, Vanilla, Ambroxan | Givenchy L'Interdit 80ml (women, designer, £40 to £100) | £68.95, Fragrance Click |
| 4 | `J___ P___ G_______` | `Le M___` | Eau de Toilette | Mint, Lavender, Artemisia, Bergamot +1 / Carraway (sic), Orange Blossom, Cinnamon / Vanilla, Sandalwood, Tonka Bean, Amber +1 | Jean Paul Gaultier Le Male 125ml (men, designer, £40 to £100) | £63.70, Perfume Market UK |
| 5 | `D____ & G______` | `L____ B___` | Eau de Toilette | Sicilian Lemon, Apple, Cedar, Bellflower / Bamboo, Jasmine, White Rose / Cedar, Musk, Amber | Dolce & Gabbana Light Blue 100ml (women, designer, £40 to £100) | £45.95, Fragrance Click |

They cover an apostrophe (3), a small word and a dirty catalogue name (4), an
ampersand (5), a one word name (1, 2), a three word house (4), and a spread of
gender, tier and price. Phase A also draws the long brand case
(Maison Francis Kurkdjian, `M_____ F______ K________`, wrapped) and the digit
case (Baccarat Rouge 540, `B_______ R____ 540`) as stress samples. Sample 4
shows the shop's spelling "Carraway" on purpose, so the owner sees the slip
that the fix list in section 4 would correct to "Caraway".

### 5.3 What the owner must decide

1. **Logo top right.** It departs from the centred wordmark on every other
   post. Confirm, with the video end card staying centred.
2. **Square versus 4:5 or 3:4.** Instagram's grid is 3:4, so a 1:1 loses its
   sides there (handled by the 135 px margin). A 4:5 feed picture would use the
   space better; say if you want it instead of the square.
3. **"Middle" or "Heart".** The site and scent profile say Heart. Recommended: Heart.
4. **Reveal photo.** Same practice as the Deal posts (recommended, nothing new
   to decide) or own photo or none.
5. **Affiliate wording.** Deal style ("Affiliate links." near the end), or
   "Ad" first for the reveal and the Deals together.
6. **Cadence and times.** Tuesday and Friday 17:00, reveals 24 hours later, or
   other days.
7. **Leaderboard.** Yes or no; if yes, by hand, handles only, no prize.
8. **Famous exceptions.** A starting list for `guess-fragrance-famous.json`
   (Baccarat Rouge 540, Chanel No 5, and so on) or leave it empty.
9. **Start.** Approve phase A first; nothing is posted until you say so.
