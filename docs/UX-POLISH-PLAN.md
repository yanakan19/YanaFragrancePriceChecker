# UX polish plan (10 Oct 2026)

Owner request, in their words: go through all parts of the website and make
it smooth, with minimal text that does not read as AI written; nice simple
transitions and animations throughout; live touches such as a moving
gradient, used minimally, on prominent tiles.

This file is the plan (phase 1) and, once built, the record (phase 2, the
"Done" notes and the measurements at the end).

## 1. How the pages were walked

Built with `npm run demo`, served by the repository's own static server
(`startDemoServer` in `scripts/a11y-audit.ts`: a plain static server like
`python3 -m http.server`, plus the fallback GitHub Pages gives a deep link, so
`/fragrance/...` and `/about` open as they do live), and driven with
Playwright in Chromium (`/opt/pw-browsers/chromium`) at 320, 390 and 1280
wide, light and dark. 29 page types: home, search results, a product with 19
offers (Mugler Alien) and one with 2 (4711 Freesia and Musk), brand (Lattafa),
shop (Fragrance Click), Shops, Deals, Explore (All Fragrances), Notes, a note
group (Woods), a note (Vanilla), Sets, Oils, Brands, the guides index and two
guides, About, How We Check Prices, Legal Notice, Cookies, Account (signed
out), Settings, Suggestions, the not found page, and the US and India homes
and a product page each. Screenshots: `social/_today/ux-before/` (not
committed; the folder is gitignored). The visible text of every page was
dumped beside them (`_text.json`) and read for the copy pass.

Product photos are hot linked from the shops and do not load in the sandbox,
so every picture well in the shots is empty. That is also what a visitor on a
slow connection sees for a moment, which is one of the findings below.

Sideways scroll: none on any page at any width. Clipped text: none (the only
hits were the screen reader only labels, which are meant to be clipped).

## 2. What feels abrupt today (site wide)

1. **The first visit shows an empty page.** With JavaScript on, the static
   intro is hidden (`html.js .static-intro`) and `<main>` stays blank until
   the 5.8 MB (gzipped) catalogue has arrived and parsed: 1.3 s locally,
   several seconds on a phone. Then the whole page appears at once and the
   footer jumps from the top of the screen to the bottom.
2. **Photos pop in.** A picture well is a plain white square until the
   shop's server answers, then the photo appears with no transition. On a
   slow shop server a grid of white squares looks broken rather than loading.
3. **Tiles barely answer the pointer.** Hover moves the border one grey step
   and nothing else; keyboard focus draws the ring on the inner button only.
   The owner now asks for a 2px lift and a border or shadow change, which
   replaces the "no lift" rule of 17 Aug (`docs/DESIGN-SYSTEM.md` 3).
4. **No hover at all** on the top bar tabs (`.navbtn`), the Explore tabs
   (`.subnavbtn`), the Back link, the shop rows on Shops, the offer rows on a
   product page, the guide cards, or the About cards.
5. **Menus and dialogs snap open.** The account menu, the country menu and
   the "wrong price" dialog appear in one frame. (The Filters sheet already
   slides up.)
6. **The price history graph pops in** when its data arrives and when the
   range changes (This Week, This Month, This Year).
7. **Two animations break the "transform and opacity only" rule**: the live
   dot on the graph pulses by animating `width` and `height`
   (`history-pulse`), and every graph dot grows on hover by transitioning
   `width` and `height`. Both are layout properties.
8. **Durations drift**: `.tile-body` (`.12s ease`) and `.shop-row`
   (`.12s ease`) still carry literal timings from before the motion tokens.
9. **The home page arrives as one block.** The hero, banner, rail and the
   lower section all rise together; a short stagger reads as calmer.
10. **The primary button** (Send, Sign In, dialog OK) darkens on hover to
    `--accent-press`, which in the dark theme drops its text to 4.0:1 (below
    AA 4.5:1).

What already works and stays: the view rise on every navigation
(`.ps-rise`, 6px over 240ms), the theme cross fade, the Filters sheet, the
press scale on buttons, the rail's scroll snap with smooth scrolling, and the
marquee (which already stops and wraps under reduced motion).

## 3. Per page: copy and motion

Copy findings quote the page as it reads today. "Keep" means it was read and
is already plain and short. Legal pages, the affiliate disclosure and the
owner's own words on About are kept word for word (section 6).

| Page | Wordy or machine sounding (quoted) | Abrupt | Change |
|---|---|---|---|
| Home | Hero "See what a fragrance really costs across more than 60 UK shops, delivery included." Keep. | One block rise; empty page while data loads; photo pop in; tiles flat on hover | Hero becomes the title tile with the drifting gradient (section 5); sections stagger 0 to 120ms; load skeleton; photo shimmer; tile lift |
| Search results | Keep ("Results for", "1 Oil also matches: See Oils") | Tiles flat | Tile lift and focus lift |
| Product (many and few offers) | "No shop we check has confirmed a price for this in the last 7 days, so none is shown, and the graph below keeps the prices we recorded." The graph caption ("Each point is a bottle price plus that shop's delivery, worked out at today's delivery rates.") is quoted word for word by the Reading the Price History Chart guide, so it stays | Offer rows have no hover; graph pops in; dot pulse animates size | Empty line: "No shop has confirmed a price for this in the last 7 days, so none is shown. The graph below keeps the prices we recorded." Offer row hover tint; graph line draws in left to right (transform only), dots fade in after it; pulse and hover by `scale` |
| Brand | Keep | Tiles flat | Tile lift |
| Shop | Shop blurbs are the shops' own descriptions (registry data): out of scope | Tiles flat | Tile lift |
| Shops list | Keep | Rows have no hover | Row hover: background step and the arrow nudges 2px |
| Deals | "Savings are against the shop's own published recommended retail price. Where the maker also sells the fragrance here, they are against the maker's own price. Prices include delivery where the shop states it. Each perfume shows its best deal across its sizes." (4 sentences) | Top deal looks like every other tile | "Savings are against the shop's own published RRP, or the maker's own price where the maker sells it here. Prices include delivery where the shop states it. One deal per perfume, at its best size." The first deal (default sort, best saving) gets the gradient ring. (RRP, not the words in full, so the US and India pages still swap it for MSRP and MRP) |
| Explore (All Fragrances) | "Every perfume we track, one line for each size. Sets and oils have their own tabs." | Tabs no hover | "Every bottle we track, one line per size. Sets and oils have their own tabs." Tab hover colour |
| See All (Most Stocked) | "Ranked by how many of our 63 shops stock each one, then by brand and name. A brand's own store does not count. Sets and oils are not listed here, they have their own tabs under Explore, and each perfume is listed once, in its most stocked size. This shows how widely a fragrance is stocked, not how well it sells: we do not count views or purchases." | | "Ranked by how many of our 63 shops stock each one, then by brand and name. A brand's own store does not count. One line per perfume, in its most stocked size; sets and oils have their own tabs under Explore. This shows how widely a fragrance is stocked, not how well it sells." |
| Notes | "Groups are our own way of sorting the notes shops publish. 14,887 of 34,739 products list them." | Note tiles already lift their icon | "We sort the notes shops publish into our own groups. 14,887 of 34,739 products list notes." |
| Note group, note | Keep (the group and note descriptions are short, written per note) | | Tile lift on the product list |
| Sets | "Gift sets, miniature and discovery sets, and bundles of full size bottles. A set is compared only with the same set at another shop, never with a single bottle." | | "Gift sets, minis, discovery sets and bundles of full size bottles. Each is compared only with the same set at other shops, never with a single bottle." |
| Oils | "Perfume oils, sold in small bottles and rollers rather than sprays. An oil is compared only with the same oil at another shop, never with a spray." | | "Perfume oils in small bottles and rollers. Each is compared only with the same oil at other shops, never with a spray." |
| Brands | Keep | Rows have no hover beyond colour | Keep colour hover, add press |
| Guides index | "Short, plain guides to buying fragrance in the UK, and to how PriceSniffs works: shops, matching, delivery, deals, sets, oils, alerts and price history." Each card repeats the guide's 25 to 30 word search description. "Curious where our prices come from? Read how we check prices." | Cards have no hover | A short lead ("Plain guides to buying perfume in the UK, and to how this site works.") and a one line summary per card (10 to 14 words, new `summary` field), so the page is a list you can scan. The search descriptions stay as they are (100 to 155 characters, the opening line of each guide). Footer: "Where do our prices come from? Read how we check prices." Card hover lift |
| Guide pages | The 13 guides are 300 to 500 words each by test, and the AdSense review's commonest refusal is "low value content" (`docs/ADVERTISING-PLAN.md` risk 2). Bodies keep their length; only lines that break the copy rules change | | Reading width and the rise are already right |
| About | Owner's own words in "Why I Built This" (kept verbatim). Cards are short | Cards no hover | Card hover border only (they are not links) is skipped: a hover on something that does nothing invites a click. Keep |
| How We Check Prices | Opening line is the search description: "How PriceSniffs collects prices from shop websites and affiliate feeds, how often, how delivery and size are handled, and how affiliate links earn money." Body: "as explained below", "A price comparison is only useful if the same bottle is compared with itself.", "the likeliest reason for it is that", and many passive sentences ("is ignored", "are listed apart", "is turned into") | | Visible lead: "Where our prices come from, how often we check them, and how we make money." Body: the repeated clauses cut, "as explained below" replaced by the fact itself (once they are more than 7 days old), six passive sentences made active; every fact and the affiliate section kept |
| Legal Notice, Cookies | Legal wording | | Unchanged (section 6). Contents row chips get the shared hover |
| Account (signed out) | Keep; the sign up note is the consent statement `docs/LEGAL.md` requires | Sign In button | Primary button hover gradient |
| Settings | Keep ("Your choice is saved on this device.") | | Segmented control press already present |
| Suggestions | "Send opens your own email app with your message ready to go. Nothing goes to a server of ours." | | "Send opens your own email app with your message ready. Nothing goes to a server of ours." ("own" stays: it is the privacy point; the line under it is kept) |
| Not found | "Nothing on this site answers to /x. It may have been a fragrance or a shop that has since been delisted." "Search the catalogue, or start from one of these:" | | "There is nothing at /x. It may be a fragrance or a shop we no longer list." "Try one of these." |
| No JavaScript note | "PriceSniffs needs it to search and compare live prices. The pages below explain what the site does, and turning JavaScript on in your browser settings brings the prices back." ("live" is a claim `docs/LEGAL.md` already had removed elsewhere) | | "PriceSniffs needs it to search and compare prices. Turn it on in your browser settings to see them; the page below explains what the site does." |
| US and India home | Region words come from region code owned by the parallel rails agent: not touched | | Same hero gradient and motion as the UK |
| US and India product | as UK | | as UK |

## 4. The motion system

Tokens, added to the theme independent `:root` block in `demo/template.html`
and shown on `/design`:

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Everything arriving, lifting or drawing |
| `--dur-fast` | 150ms | Hover, focus, press release, menus |
| `--dur` | 220ms | Page and section enter, list settle |
| `--dur-slow` | 400ms | Graph draw in, skeleton fade |

The older `--dur-2` and `--dur-3` are pointed at `--dur-fast` and `--dur`
(160 to 150ms, 240 to 220ms), so the site has one scale. `--dur-1` (90ms,
press) and `--dur-4` (320ms, theme cross fade) stay.

Allowed effects, and nothing else:

1. **Enter**: fade plus a 6px rise, `--dur` on `--ease-out`, once per view
   (`.ps-rise`, existing). On Home the top level blocks stagger by 30ms
   (0 to 90ms) instead (`.ps-stagger` on the home wrapper only, so nothing is nested).
2. **Lift**: tiles and cards that are links rise 2px, border to
   `--line-firm`, and a soft shadow fades in (a pseudo element's opacity, so
   no shadow is animated). On hover with a fine pointer, and on keyboard
   focus inside the tile. `--dur-fast`.
3. **Press**: scale 0.98 on primary and secondary buttons, existing .985 on
   rows and tiles kept.
4. **Rails**: `scroll-snap-type: x proximity` and smooth scroll (existing),
   with the lift kept inside the rail's 2px top padding so a lifted tile is
   never clipped.
5. **Skeletons**: a page skeleton while the data loads (static markup in
   `<main>`, replaced by the first render; shown only with JavaScript), and a
   soft sweep across each photo well until its photo has loaded (a class set
   from one captured `load` listener; it waits 250ms before showing, so a
   cached photo never flashes it, and stops when the photo has loaded or
   failed; the page skeleton sweeps 6 times at most).
6. **Graph draw in** (behaviour 10 in the stylesheet): the line and band are revealed left to right by a clip
   rectangle scaled from 0 to 1 (transform), dots fade in after.
7. **Menus and dialogs**: a dropdown fades in with a 4px drop; a phone
   sheet and a dialog only fade, in the place they will sit, `--dur-fast`.
   (A rise and a 0.98 scale were tried first: the account, country, share
   and welcome tests measure the sheet and the dialog the moment they open,
   and found them 6px low or 1px small. Nothing on screen should be
   anywhere but its place when it is first there to be read.)
8. **The moving gradient**: section 5.

Rules:

- Transform and opacity only, for every keyframe and transition, except
  colour and border colour transitions. No width, height, top, left or
  box-shadow is animated. The two graph rules that animate size today move to
  `scale`.
- No layout shift: every entering element keeps its box from the first frame
  (the hidden state lives in the keyframes with `both`, never in the base
  rule, per `docs/DESIGN-SYSTEM.md` 3.1). The page skeleton holds at least
  the height of the screen, so the footer no longer jumps on first load.
- No third party library.
- Reduced motion: the existing block at the top of the motion section sets
  every animation and transition to 1ms, one iteration, no delay, so each
  ends at once in its final, visible state. Named animations that loop
  (gradient drift, shimmer, live dot pulse, marquee) are also set to
  `animation: none` by name in that block, so nothing moves at all.
- Nothing animates a price.

`tests/motion.test.ts` holds these: tokens present; every `@keyframes` step
and every `transition` limited to transform, opacity, colour and border
colour; a reduced motion block that names each looping animation; the
gradient class used only on the allowed tiles.

## 5. The moving gradient

Three places only, and never behind body text:

1. **Home title tile** (`.intro`): the hero becomes a rounded tile with a
   hairline border. Behind it, a layer three times its width carries a three
   stop gradient (`--bg`, `--accent-sf`, `--surface-2`) and drifts sideways
   over 18s, alternating, `ease-in-out`. Each line of the greeting (the
   wordmark, the line under it, a region's "last checked" line) carries the
   plain `--bg` ground with a soft 22px edge, so the words never sit on the
   gradient and keep exactly today's contrast; the colour moves round them.
   (A first version used one still oval over the middle; on a 320 wide phone
   the text reached past it and the accent "Sniffs" fell from 5.7:1 to
   5.2:1, so it was replaced.)
2. **The top deal** (first tile on Deals in the default sort): a 2px ring of
   the same drift around the tile (the gradient layer behind, the tile's own
   `--surface` card inside). The tile's text sits on its usual card.
3. **Primary buttons on hover** (`.contact-send`, the accent rank: Send,
   Sign In, Save; a dialog's OK button is the ink rank and is left alone):
   a drift between two new tokens, `--accent-hover-1` and `--accent-hover-2`,
   12s a pass. Dark: `#FF3B41` to `#FF6A6E`, near black text at 5.5 to
   7.3:1, where the old hover (`--accent-press`) dropped it to 4.0:1. Light:
   `#9E0C22` to `#8A0A1E`, white text at 8.3 to 9.8:1, never below the old
   hover's 8.3:1. `tests/motion.test.ts` holds both.

There is no Deal of the Day or Guess the Fragrance tile on the site (both
are social pictures), so nothing else qualifies. The drift is transform
only (`translate3d`), on its own composited layer, 18s per pass (16s on the
ring, coprime with the marquee's 30s and 38s), and stops entirely under
reduced motion. The class `ps-drift` may appear only on these three; the
motion test enforces it.

## 6. Copy rules

Applied to every visible string changed in this pass, and checked by
`tests/copyRules.test.ts` across the copy sources:

- Plain British English. Short sentences. Say a thing once.
- None of: "Discover", "Elevate", "Explore our curated", "Seamless",
  "Unlock", "Whether you are", "In today's".
- No colon used as a title gimmick ("Prices: Explained"). A colon that
  introduces a list stays.
- No em or en dashes, and no hyphen used as a dash. No exclamation marks.
- Numbers as digits.
- A shop's name, or "shop", where a visitor would say shop; "retailer" only
  where it is a term of art (the Affiliate Disclosure).
- Every fact stays true: prices, delivery rules, the 7 day rule, the
  affiliate disclosure, the legal statements.
- **Kept word for word:** the Legal Notice and its six sections
  (`demo/legal.ts` LEGAL_PAGES), the About cards that state the affiliate
  terms, the footer disclosure ("Some shop links earn us a commission, at no
  cost to you. It never changes the order of results."), the "Affiliate Link"
  marker on offer rows, the sign up consent note, the privacy lines under
  both email forms, the owner's own "Why I Built This". `docs/LEGAL.md` names
  each of these places; the copy test checks they are still there.
- Words owned by region code (`src/services/regionText.ts`,
  `demo/regionSwitch.ts`, `demo/regionWelcome.ts`) are left to the agent
  working on the region rails today. Strings passed through `localWords`
  keep the words it swaps (delivery, RRP, UK shops), so the US and India
  pages still read right.

The rewritten About, How We Check Prices and guides index text is run
through the `yanaaidetection` check; the result is recorded in section 9.

## 7. Weight and speed budget

Measured before (390 wide, local server, Chromium, median of 3):

| Measure | Before |
|---|---|
| `demo/index.html` | 1,074,106 bytes, 303,918 gzipped |
| Inline stylesheet | 211,108 bytes, 58,217 gzipped |
| First contentful paint | 104 ms |
| Largest contentful paint | 1,452 ms |
| App content in (`data-app-ready`) | 1,310 ms |
| Frame rate, Home idle, CPU 4x | 60 fps, 0 frames over 34ms |
| Frame rate, Most Stocked rail scrolling, CPU 4x | 60 fps, 0 frames over 34ms |
| Frame rate, Deals idle, CPU 4x | 61 fps |

There is no test that pins the home page's total bytes; the nearest is
`tests/footerLinks.test.ts`, which keeps the static intro, its styles and the
footer under 5,000 bytes (3,453 today; the skeleton markup counts against
it). The budget for this pass: at most 2 KB gzipped added to the page. If the
gradient drops frames on the throttled run it is made smaller or slower, or
removed.

## 8. Order of work

1. This plan, pushed on its own.
2. Motion tokens and effects in `demo/template.html`; the hero title tile
   and its gradient; the home stagger; the load skeleton and photo shimmer;
   tile lift; `tests/motion.test.ts`. Pushed as one batch.
3. Then the rest, a commit per page or effect: product page (graph draw in,
   offer rows, dot scale), Deals (top deal ring, note), lists and tabs, the
   guides index summaries, How We Check Prices lead, the intros, the not
   found page, primary button hover, menus and dialogs, `tests/copyRules.test.ts`,
   the changelog line. Pushed as the last batch.

Each batch: merge the live branch, `npx tsc --noEmit`, `npm run demo`, the
touched tests file by file, then push. Screenshots after each page go to
`social/_today/ux-after/`.

## 9. Results (10 Oct 2026)

### Measured

Before and after built from the same catalogue (only the files this pass
touched swapped back), 390 wide, Chromium, local server, median of 3 loads,
two rounds each, alternating:

| Measure | Before | After |
|---|---|---|
| `demo/index.html` | 1,074,346 bytes, 304,001 gzipped | 1,083,463 bytes, 306,218 gzipped (+9.1 KB, +2.2 KB gzipped) |
| of which styles | 211,108, 58,217 gzipped | 218,354, 59,888 gzipped (+1.7 KB gzipped, after cutting the new comments to one line each) |
| of which script | 852,476, 241,902 gzipped | 854,099, 242,308 gzipped (+0.4 KB: the guide summaries, the copy) |
| First contentful paint | 84 and 100 ms | 88 and 104 ms |
| Largest contentful paint | 1,512 and 1,436 ms | 1,352 and 1,524 ms |
| App content in | 1,438 and 1,361 ms | 1,268 and 1,412 ms |
| Home idle (title tile drifting, marquee), CPU 4x | 60 fps, 0 frames over 34ms | 60 fps, 0 frames over 34ms |
| Most Stocked rail scrolling, CPU 4x | 60 fps, 0 frames over 34ms | 60 fps, 0 frames over 34ms |
| Deals idle (top deal ring drifting), CPU 4x | 61 fps | 60 fps, 0 frames over 34ms |

The paint and load times are within run to run noise of each other. The
gradient did not drop a frame on the throttled run, so it stays as built
(18s and 16s a pass). Throttling slows the main thread; the drift is a
transform on its own layer, so it runs on the compositor and costs the main
thread nothing.

Contrast of the title tile's words, measured under the glyphs themselves
(screenshots with and without the text) at 320, 390 and 1280 wide, both
themes, at the start, middle and end of the drift: light 18.9:1 (ink) and
5.7:1 (the red "Sniffs"), dark 18.5:1 and 5.6:1, the same as on the plain
page. The Send and Sign In hover rises from 4.0:1 to at least 5.5:1 in
dark and stays at or above 8.3:1 in light.

Reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })` and the
context option): no animation is running on Home, Deals, a product page, the
guides, Shops or About (`document.getAnimations()` empty of running ones);
the marquee stops and wraps as before. Without it, the only running
animations at rest are the title tile drift, the marquee, the top deal ring,
the live price dot and the sweep on photo wells still loading.

No page scrolls sideways at 320, 390 or 1280, light or dark, and no text is
clipped (`social/_today/ux-shoot.ts` measures both on every page).

Keyboard focus: a focused tile lifts and keeps its 2px accent ring; a guide
card draws the ring round the whole card.

### Tests

New: `tests/motion.test.ts` (11) and `tests/copyRules.test.ts` (17).
Changed on purpose: the guides index test reads the summaries, the cross
links test and the Sets tab test read the shorter notes.

The whole suite, run in 15 chunks of 20 files after the last merge: 300
files, 7,475 tests. Every failure was traced. The ones this pass caused (the account
and country sheets and three dialogs measured mid animation, the Sets note,
a 320 wide set page) were fixed and those files rerun green, with
tsc, `npm run demo`, layout consistency, accessibility, contrast, footer
links, changelog, content pages, region pages, suggestions, share, set
page, list filters and the build freshness check. Two failures are not
from this pass and are left to their owners: `tests/perfumeDirectNames.test.ts`
(today's harvest has no Davidoff Cool Water women's bottle from Perfume
Direct) and `tests/regionRails.test.ts` (it finds region data read by
`scripts/social-video-launch.ts`, the US launch video script merged today).

### The AI writing check

`yanaaidetection`, run on the rewritten words (a risk estimate, not proof):

| Text | Human writing confidence | Stage 1 markers |
|---|---|---|
| Guides index (lead, 13 titles and summaries, footer line) | 96%, Very Low | none |
| About (the owner's own paragraph and the four cards, unchanged) | 92%, Low | none |
| How We Check Prices (lead and body) | 86%, Moderate | none |

The method page was at 85% with passive voice flagged; six passive
sentences were made active and the passive flag cleared. What remains is a
low unique word ratio and high compressibility, which is what 1,100 words
about one subject look like; cutting them would mean cutting facts the page
was asked to state (tests/contentPages.test.ts).

### Deliberately not done

- **Guide bodies keep their length.** Each is 300 to 500 words by test, and
  "low value content" is the AdSense review's commonest refusal. Their words
  already pass the same dash and tone rules; only the index was shortened.
- **The Legal Notice, the cookies page and the affiliate disclosure are
  word for word as they were.** `tests/copyRules.test.ts` holds the
  statements `docs/LEGAL.md` requires in their places.
- **The graph caption** stays: the Reading the Price History Chart guide
  quotes it, and a test holds the two together.
- **Region words** (`demo/regionSwitch.ts`, `demo/regionWelcome.ts`,
  `src/services/regionText.ts`) were left to the agent working on the
  country switch today; the US and India pages get the same motion.
- **No settle animation on a filter change.** The in place redraw that a
  filter triggers also follows a wishlist tap, so a list that re-animated
  would do so on every heart.
- **No fade on a photo arriving.** An in place redraw recreates every
  picture from the cache, so a fade would make every photo blink on a tap;
  the sweep behind the well does the job without that.
- **Shop descriptions** on a shop page are the shops' own words from the
  registry, not copy of ours.
- Found in passing, not fixed here: some shops send brand names with a
  literal `&amp;`, so Brands lists "Dolce &amp; Gabbana" beside "Dolce &
  Gabbana" (suggested as a separate task).

Screenshots: `social/_today/ux-before/` and `social/_today/ux-after/`
(gitignored), 390 and 1280 wide in both themes for every page type, 320 in
the before set.
