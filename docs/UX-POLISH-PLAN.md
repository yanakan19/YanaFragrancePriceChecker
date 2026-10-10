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
| Product (many and few offers) | Graph caption "Each point is a bottle price plus that shop's delivery, worked out at today's delivery rates." "No shop we check has confirmed a price for this in the last 7 days, so none is shown, and the graph below keeps the prices we recorded." | Offer rows have no hover; graph pops in; dot pulse animates size | Caption: "Each point is a bottle price plus that shop's delivery, at today's rates." Empty line: "No shop has confirmed a price in the last 7 days, so none is shown. The graph keeps the prices we recorded." Offer row hover tint; graph line draws in left to right (transform only), dots fade in after it; pulse and hover by `scale` |
| Brand | Keep | Tiles flat | Tile lift |
| Shop | Shop blurbs are the shops' own descriptions (registry data): out of scope | Tiles flat | Tile lift |
| Shops list | Keep | Rows have no hover | Row hover: background step and the arrow nudges 2px |
| Deals | "Savings are against the shop's own published recommended retail price. Where the maker also sells the fragrance here, they are against the maker's own price. Prices include delivery where the shop states it. Each perfume shows its best deal across its sizes." (4 sentences) | Top deal looks like every other tile | "Savings are against the shop's own published RRP, or the maker's own price where the maker sells it here. Prices include delivery where the shop states it. One deal per perfume, at its best size." The first deal (default sort, best saving) gets the gradient ring |
| Explore (All Fragrances) | "Every perfume we track, one line for each size. Sets and oils have their own tabs." | Tabs no hover | "Every bottle we track, one line per size. Sets and oils have their own tabs." Tab hover colour |
| See All (Most Stocked) | "Ranked by how many of our 63 shops stock each one, then by brand and name. A brand's own store does not count. Sets and oils are not listed here, they have their own tabs under Explore, and each perfume is listed once, in its most stocked size. This shows how widely a fragrance is stocked, not how well it sells: we do not count views or purchases." | | "Ranked by how many of our 63 shops stock each one, then by brand and name. A brand's own store does not count. One line per perfume, in its most stocked size; sets and oils have their own tabs. This shows how widely a fragrance is stocked, not how well it sells." |
| Notes | "Groups are our own way of sorting the notes shops publish. 14,887 of 34,739 products list them." | Note tiles already lift their icon | "We sort the notes shops publish into our own groups. 14,887 of 34,739 products list notes." |
| Note group, note | Keep (the group and note descriptions are short, written per note) | | Tile lift on the product list |
| Sets | "Gift sets, miniature and discovery sets, and bundles of full size bottles. A set is compared only with the same set at another shop, never with a single bottle." | | "Gift sets, minis, discovery sets and bundles. Each set is compared only with the same set at other shops, never with a single bottle." |
| Oils | "Perfume oils, sold in small bottles and rollers rather than sprays. An oil is compared only with the same oil at another shop, never with a spray." | | "Perfume oils in small bottles and rollers. Each oil is compared only with the same oil at other shops, never with a spray." |
| Brands | Keep | Rows have no hover beyond colour | Keep colour hover, add press |
| Guides index | "Short, plain guides to buying fragrance in the UK, and to how PriceSniffs works: shops, matching, delivery, deals, sets, oils, alerts and price history." Each card repeats the guide's 25 to 30 word search description. "Curious where our prices come from? Read how we check prices." | Cards have no hover | A short lead ("Plain guides to buying perfume in the UK, and to how this site works.") and a one line summary per card (10 to 14 words, new `summary` field), so the page is a list you can scan. The search descriptions stay as they are (100 to 155 characters, the opening line of each guide). Footer: "Where do our prices come from? Read how we check prices." Card hover lift |
| Guide pages | The 13 guides are 300 to 500 words each by test, and the AdSense review's commonest refusal is "low value content" (`docs/ADVERTISING-PLAN.md` risk 2). Bodies keep their length; only lines that break the copy rules change | | Reading width and the rise are already right |
| About | Owner's own words in "Why I Built This" (kept verbatim). Cards are short | Cards no hover | Card hover border only (they are not links) is skipped: a hover on something that does nothing invites a click. Keep |
| How We Check Prices | Opening line is the search description: "How PriceSniffs collects prices from shop websites and affiliate feeds, how often, how delivery and size are handled, and how affiliate links earn money." Body: "as explained below", "A price comparison is only useful if the same bottle is compared with itself." | | Visible lead: "Where our prices come from, how often we check them, and how we make money." Light trims in the body where a clause repeats; every fact and the affiliate section kept |
| Legal Notice, Cookies | Legal wording | | Unchanged (section 6). Contents row chips get the shared hover |
| Account (signed out) | Keep; the sign up note is the consent statement `docs/LEGAL.md` requires | Sign In button | Primary button hover gradient |
| Settings | Keep ("Your choice is saved on this device.") | | Segmented control press already present |
| Suggestions | "Send opens your own email app with your message ready to go. Nothing goes to a server of ours." | | "Send opens your email app with your message ready. Nothing goes to a server of ours." (the privacy line under it is kept) |
| Not found | "Nothing on this site answers to /x. It may have been a fragrance or a shop that has since been delisted." "Search the catalogue, or start from one of these:" | | "There is nothing at /x. It may be a fragrance or shop we no longer list." "Try one of these." |
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
   (`.ps-rise`, existing). On Home the four top level blocks stagger by 40ms
   instead (`.ps-stagger` on the home wrapper only, so nothing is nested).
2. **Lift**: tiles and cards that are links rise 2px, border to
   `--line-firm`, and a soft shadow fades in (a pseudo element's opacity, so
   no shadow is animated). On hover with a fine pointer, and on keyboard
   focus inside the tile. `--dur-fast`.
3. **Press**: scale 0.98 on primary and secondary buttons, existing .985 on
   rows and tiles kept.
4. **Rails**: `scroll-snap-type: x proximity` and smooth scroll (existing),
   now with `scroll-snap-stop: normal` and the lift inside the rail clear of
   its top edge.
5. **Skeletons**: a page skeleton while the data loads (static markup in
   `<main>`, replaced by the first render; shown only with JavaScript), and a
   soft sweep across each photo well until its photo has loaded (a class set
   from one captured `load` listener; it waits 250ms before showing, so a
   cached photo never flashes it, and stops after 6 sweeps).
6. **Graph draw in**: the line and band are revealed left to right by a clip
   rectangle scaled from 0 to 1 (transform), dots fade in after.
7. **Menus and dialogs**: fade plus a 4px rise (menus) or scale from 0.98
   (dialogs), `--dur-fast`.
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
   over 18s, alternating, `ease-in-out`. A static radial wash of `--bg` sits
   over the middle, so the wordmark and the line under it stay on the plain
   ground and their contrast is exactly what it is today; the colour shows
   at the tile's edges only.
2. **The top deal** (first tile on Deals in the default sort): a 2px ring of
   the same drift around the tile (the gradient layer behind, the tile's own
   `--surface` card inside). The tile's text sits on its usual card.
3. **Primary buttons on hover** (`.contact-send`, `.ps-dialog-btn.primary`):
   a drift between `--accent` and `--accent-ink`, which lifts the text
   contrast in both themes (dark: near black on `#FF6A6E` 7.3:1, light: white
   on `#A80C25` 7.6:1) where today's hover drops it to 4.0:1 in dark.

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

## 9. Results

Filled in as the work lands.
