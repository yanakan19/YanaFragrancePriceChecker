# Typography inventory

An exhaustive read of every text-style rule in `demo/template.html`'s
`<style>` block (the only stylesheet the app has — `demo/app.ts` renders
markup into it but declares no styles of its own), organised by the visual
**role** an element plays rather than alphabetically by selector. The point
is to let you see, at a glance, which elements are meant to look like peers
and where their actual CSS has drifted apart.

This is a read-only audit. Nothing here changes any CSS — see
"Inconsistencies found" at the bottom for a punch list of what to go fix,
with a suggested unified value for each.

All line numbers below refer to `demo/template.html` as it stood on
2026-08-11. `--ink`, `--ink-2`, `--faint` etc. are the theme tokens defined at
the top of the same file (`:root` / `[data-mode]` blocks); their actual
colours flip between the light and dark palettes, but which *token* an
element uses is itself a design decision worth tracking here.

---

## 1. Page titles

The heading at the very top of a full page — one of these appears at most
once per screen.

| Selector | Where it appears | font-size | weight | letter-spacing | color |
|---|---|---|---|---|---|
| `.hero-wordmark` (:1364) | "PriceSniffs" wordmark on the Home screen | 38px (46px on desktop, :1385) | 800 | -.035em | `--ink` (with `<em>` in `--accent`) |
| `.page-head h2` (:729) | The heading atop Browse, Search results, Deals, Brands, Retailers, Notes, etc. — e.g. "Browse all" | 22px | 700 | -.025em | `--ink` (inherited) |
| `.doc h2` (:1222) | The `<h2>` at the top of a Settings/legal document page (About, Privacy, Terms) | 25px | 700 | -.025em | `--ink` (inherited) |
| `.org-hero-name` (:846) | The shop or brand's own name at the top of a retailer profile or brand profile page | 21px | 700 | -.02em | `--ink` (inherited) |
| `.brandmark` (:244) | "PriceSniffs" button in the sticky top bar (present on every page, not just Home) | 21px (19.5px ≤560px, 18px ≤430px) | 800 | -.03em | `--ink` (with `<em>` in `--accent`) |

## 2. Section headings

Headings that introduce a block of content within a page, not the page
itself.

| Selector | Where it appears | font-size | weight | letter-spacing | color |
|---|---|---|---|---|---|
| `.suggest-section h3`, `.updates-section h3` (:443) | "Got an idea?" and "Update History" headings side by side at the bottom of Home | 18px | 700 | normal | `--ink` (inherited) |
| `.house-group h3` (:1446) | The house name heading above a grid of house-direct listings (e.g. "Armaf") on the Houses page | 17px | **not set** — falls through to the browser's default bold `<h3>`, which most engines render around 700 | normal | `--ink` (inherited) |
| `.doc h3` (:1223) | A subheading inside a Settings/legal document, e.g. a numbered clause title | 14px | 650 | -.01em | `--ink-2` (inherited from `.doc p`'s sibling context, actually inherits `--ink` since `.doc h3` itself sets no color — see note below) |

> Note: `.doc h3` has no `color` rule of its own, so it renders in whatever
> ambient `color` is in scope (`--ink`, since nothing overrides it between
> `.doc` and the `<h3>`) — different from `.doc p`/`.doc li`, which
> explicitly set `--ink-2`. Worth confirming that's deliberate: a heading
> in full ink and its own body text one shade dimmer is a common pattern,
> but nothing in the CSS states it as a rule the way the price/name rules
> do elsewhere.

## 3. Card, tile and row titles

The primary, "this is the thing" text inside a repeated list item — a
product tile, a shop row, a brand row.

| Selector | Where it appears | font-size | weight | letter-spacing | color |
|---|---|---|---|---|---|
| `.phead-name` (:550) | Product name inside `.phead` — used in every tile, list row, and rail card | 14px | 600 | -.012em | `--ink` (inherited) |
| `.hero .phead-name` (:1061) | Product name override on a fragrance detail page's hero | 22px | 600 (inherited, unchanged) | -.022em | `--ink` (inherited) |
| `.shop` (:1120) | Retailer name on one offer row inside a fragrance detail page's offer list | 15.5px | 600 | -.012em | `--ink` (inherited) |
| `.shop-row-name` (:819) | Retailer name in the Retailers directory list, and in the wishlist list | 15.5px | 600 | -.012em | `--ink` (inherited) |
| `.brand-row` (:770) | Brand name in the Brands directory list | 15.5px | **500** | none | `--ink` |
| `.brand-opt` (:1352) | Brand name inside the brand-filter bottom sheet | 15.5px | **not set** (normal, 400) — `.on` bumps it to 650 | none | `--ink` |
| `.house-name` (:1477) | House-direct product name on a house card | 13px | 600 | none | inherited (`.house-card a` sets `color: inherit`) |

## 4. Body copy

Multi-word descriptive prose, not a label.

| Selector | Where it appears | font-size | weight | line-height | color |
|---|---|---|---|---|---|
| `body` (:139) | App-wide base | 16px | 400 | 1.5 | `--ink` |
| `.hero-mission` (:373) | The italic-free mission line under the Home wordmark ("Real prices…") | 17px | 600 | inherited (1.5) | `--ink` |
| `.doc p`, `.doc li` (:1224) | Paragraph and list text inside a Settings/legal document | 14px | 400 | 1.62 | `--ink-2` |
| `.org-hero-blurb` (:850) | The one-paragraph description on a retailer or brand profile page | 13.5px | 400 | 1.5 | `--ink-2` |
| `.hero-blurb` (:1064) | Short blurb under a fragrance's name on its detail page | 13.5px | 400 | inherited (1.5) | `--faint` |
| `.house-note` (:1440) | The caveat paragraph above a house grid ("prices shown in the house's own currency…") | 14px | 400 | 1.45 | `--ink-2` |
| `.intro-points span` (:392) | The three italic phrases under the Home mission line | 14px | 500 | inherited | `--ink-2` |
| `.account-note` (:1293) | Explanatory line on the Account entry point in Settings | 13.5px | 400 | inherited | `--ink-2` |
| `.foot-line` (:1359) | Body line inside the condensed "About" settings panel | 13.5px | 400 | inherited | `--ink-2` |
| `.group-note` (:1165) | Explains why a group of shops is listed on a detail page (e.g. "also sold by, unconfirmed") | 12.5px | 400 | 1.5 | `--faint` |
| `.panel-note` (:734) | Note under a `.page-head`, e.g. explaining a list's sort order | 12.5px | 400 | 1.55 | `--faint` |
| `.empty-note` (:723) | "No results" placeholder text | 14.5px | 400 | inherited | `--ink-2` |

## 5. Eyebrow / micro labels

Small, bold, letter-spaced, usually uppercase tags that introduce a block or
mark a pill/badge. This is the single largest and most fragmented role in
the file — see the inconsistencies section below.

| Selector | Where it appears | font-size | weight | letter-spacing | uppercase? |
|---|---|---|---|---|---|
| `.hero-by` (:368) | "BY YANNYSNIFFS" under the Home wordmark | 11.5px | 700 | .16em | yes |
| `.section-head h3` (:484) | Eyebrow above a home-page rail, e.g. "POPULAR NOW" | 11.5px | 700 | .11em | yes |
| `.gone-head` (:1155) | "No longer stocked" divider above delisted offers on a detail page | 11px | 700 | .11em | yes |
| `.sheet-title` (:1346) | Title inside the brand-filter bottom sheet | 11px | 700 | .11em | yes |
| `.seg-label` (:1250) | Label above a segmented control in Settings (e.g. "Appearance") | 11px | 700 | .1em | yes |
| `.section-label` (:905) | Generic section eyebrow, e.g. above the notes-groups row | 11px | 700 | .08em | yes |
| `.note-layer-name` (:900) | "TOP / HEART / BASE" pyramid label on the Notes page | 11px | 700 | .08em | yes |
| `.facet-group legend` (:1014) | Legend above a facet-pill group (e.g. "Concentration") in the filters panel | 10.5px | 700 | .07em | yes |
| `.price-box-label` (:1094) | "LOWEST PRICE" label above the big price on a detail page | 10.5px | 700 | .1em | yes |
| `.tile-price .off` (:701) | Percent-off badge inside a tile's price block | 10.5px | 700 | .06em | yes |
| `.phead-brand` (:537) | Brand pill above a product name (tile/list context) | 10px | 700 | .05em | yes |
| `.hero .phead-brand` (:1062) | Same pill, enlarged on the fragrance detail hero | 11px | 700 (inherited) | .12em | yes |
| `.from` (:710) | "FROM" label preceding a tile's price | 10px | **600** | .08em | yes |
| `.tag` (:1121) | "NEW" badge on an offer row | 9.5px | 700 | .07em | yes |

## 6. Captions and secondary meta

Small, quiet text riding alongside a title — dates, domains, counts as
prose, sub-labels.

| Selector | Where it appears | font-size | weight | color |
|---|---|---|---|---|
| `.org-hero-count` (:847) | "128 fragrances" under a retailer/brand profile name | 14px | 500 | `--faint` |
| `.phead-meta` (:554) | Size/concentration riding beside a product name in `.phead` | 10px | 600 | `--faint` |
| `.hero .phead-meta` (:1063) | Same, enlarged on the fragrance detail hero | 11.5px | 600 (inherited) | `--faint` |
| `.shop-row-meta` (:820) | Domain/blurb line under a retailer name in the Retailers list | 12.5px | 400 | `--faint` |
| `.org-hero-domain` (:848) | Domain link under a retailer/brand profile name | 12.5px | 400 | `--faint` |
| `.update-date` (:468) | Date beside a version number in Update History | 11px | 500 | `--faint` |
| `.house-caveat` (:1483) | "priced in USD" caveat under a house card's price | 11px | 400 | `--faint` |
| `.yanny-head-sub` (:1582) | Subtitle under the Virtual Yanny chat panel's title | 11.5px | 400 | `--faint` |
| `.notes-source` (:1033) | Attribution line under the notes browser | 11.5px | 400 | `--faint` |
| `.foot-legal` (:1362) | Legal boilerplate at the bottom of the condensed About panel | 11.5px | 400 (line-height 1.65) | `--faint` |
| `.settings-note` (:1268) | Note under a Settings control | 12px | 400 | `--faint` |
| `.note-group-label` (:931) | Label under a note-group card's count on the Notes page | 12px | 400 | `--faint` |
| `.facts` (:1137) | "50ml · In stock" meta line on an offer row | 12.5px | 400 | `--ink-2` |
| `.results-head` (:1108) | "12 shops, sorted by price" line above an offers list | 12px | 400 | `--ink-2` |
| `.fact-list li` (:872) | Delivery/policy fact rows on a retailer profile | 13px | 400 | `--ink-2` |
| `.history-tip span` (:1210) | Secondary line inside the price-history hover tooltip | inherited (12px) | 400 | `--faint` |
| `.history-xlabel` (:1217) | Date label under the price-history chart | 10.5px | 400 | `--faint` |

## 7. Counts and numeric badges

Standalone numerals, always `font-variant-numeric: tabular-nums` where the
number might update live.

| Selector | Where it appears | font-size | weight | color |
|---|---|---|---|---|
| `.count` (:730) | Result count beside a `.page-head` heading, e.g. "1,204" | 12px | 700 | `--faint` |
| `.note-row-count` (:892) | Count beside a note name in the Notes A–Z list | 13px | 700 | `--faint` |
| `.house-count` (:1450) | Pill count of listings beside a house group heading | 12px | 600 | `--faint` |
| `.note-group-count` (:930) | Big number on a note-group card, e.g. "42" | 20px | 800 | `--ink` (inherited) |
| `.facets-badge` (:1005) | Count badge on the "Filters" toggle when facets are active | 10px | 700 | `--accent-on` on `--accent` |
| `.medal` (:601) | Rank number (1/2/3) on a popularity medal | 11px | 800 | per-medal (gold/silver/bronze) |
| `.db-count` (:400) | "Tracking N fragrances" line on Home | 12.5px | 600 | `--faint` |
| `.alpha-scrubber-letter` (:963) | Index-strip letters beside the Notes A–Z list | 9.5px | 700 | `--faint` |

## 8. Prices

| Selector | Where it appears | font-size | weight | color |
|---|---|---|---|---|
| `.price-box-amount` (:1097) | The large "lowest price" figure on a fragrance detail page | 34px | 800 | `--accent` |
| `.hero-price.none` (:1103) | "Price unavailable" state in the same spot, when no price exists | 19px | 600 | `--ink-2` |
| `.now` (:1132) | Price on one offer row, detail page | 17px | 700 | `--ink` (inherited); `.sale` → `--ok` |
| `.tile-price .amt` (:704) | Price inside a tile's price block | 15.5px | 700 (inherited) | `--accent` |
| `.tile-price` (:695) | Base rule the two above build on | 14.5px | 700 | `--accent` |
| `.tile-price .amt.none` (:705) | "N/A" state inside a tile | 13.5px | 600 | `#8A838F` (fixed, tile is always white) |
| `.house-price` (:1482) | Price on a house card | 13px | 700 | `--ink` (inherited) |
| `.was` (offer row, :1131) | Struck-through reference price on an offer row | 12.5px | 400 | `--faint` |
| `.tile-price .was` (:706) | Struck-through reference price inside a tile | 11px | 600 | `#8A838F` |

---

## Inconsistencies found

Grouped by which role above they belong to. Each entry names the elements
that are supposed to read as peers and shows where the CSS actually
disagrees, with a suggested single value to converge on.

### A. Eyebrow / micro-label sizing is the biggest source of drift

Fourteen selectors all play the identical "small bold letter-spaced label"
role (§5), and no two of them fully agree:

- **Font sizes in play:** 9.5px (`.tag`), 10px (`.phead-brand`, `.from`),
  10.5px (`.facet-group legend`, `.price-box-label`, `.tile-price .off`),
  11px (`.gone-head`, `.sheet-title`, `.seg-label`, `.section-label`,
  `.note-layer-name`), 11.5px (`.hero-by`, `.section-head h3`).
- **Letter-spacing in play:** .05em, .06em, .07em, .08em, .1em, .11em,
  .12em, .16em — eight different values for what is meant to read as one
  typographic gesture ("this is a quiet label"), not eight.
- **Weight:** thirteen of the fourteen use `font-weight: 700`. `.from`
  (:710) is alone at `600` — nothing about its role (a "FROM" price
  qualifier) explains why it should be lighter than the "PERCENT OFF" badge
  sitting right next to it in the same tile.

**Suggested unified value:** `font-size: 11px; font-weight: 700;
letter-spacing: .09em; text-transform: uppercase;` as the one eyebrow-label
style, with a single deliberate exception kept only where there's a real
functional reason for a different size (the biggest one, `.hero-by` at
11.5px, is arguably fine to keep since it sits alone under a 38–46px
wordmark and needs slightly more presence — but that should be a stated
choice, not an accident of fourteen near-identical rules never having been
consolidated).

### B. Three different "section heading" styles for one role

`.suggest-section h3` / `.updates-section h3` (18px/700, explicitly unified
by a comment in the CSS itself acknowledging this exact problem once
before — see `template.html:438-442`), `.house-group h3` (17px, **no
font-weight set at all**), and `.doc h3` (14px/650) are three different
answers to "how does a level-3 heading look," despite all three living one
step below a page title.

- `.house-group h3` is the one genuine bug here, not just a size
  mismatch: it never sets `font-weight`, so it renders at whatever the
  browser's UA stylesheet gives an `<h3>` (bold, ~700 in every current
  engine) rather than a value this file actually controls. If a future
  reset or base-style change ever touches heading weights, this is the one
  heading in the app that would silently move.
- **Suggested fix:** give `.house-group h3` an explicit `font-weight: 700`
  to match its 18px cousins (or drop it to the `.doc h3` treatment if it's
  meant to be a lighter secondary heading — but pick one on purpose).

### C. One 15.5px row-title size, four different weights

`.shop` (offer row), `.shop-row-name` (retailer directory row) both use
`600` weight and `-.012em` letter-spacing — consistent with each other.
`.brand-row` (brand directory row) uses the same 15.5px size but weight
`500` and no letter-spacing. `.brand-opt` (brand-picker sheet) uses the same
15.5px size with **no weight set** (browser default 400) unless `.on`,
which jumps it to `650`.

All four are "the name of a thing, in a tappable list row" — the same
role `.phead-name` fills for products. Right now a brand row reads
visibly lighter than a shop row of the identical size sitting one tab away.

**Suggested unified value:** `font-size: 15.5px; font-weight: 600;
letter-spacing: -.012em;` across all four, reserving a weight bump (the
existing `.brand-opt.on` pattern) only for genuinely selected/active states.

### D. `.doc h3` has no explicit color

Every other text rule in `.doc` (`p`, `li`, `.meta`) sets its own color
explicitly. `.doc h3` (:1223) does not, so it inherits whatever `color` is
in scope rather than stating one — currently harmless (it resolves to
`--ink`, which is probably the intended look) but worth adding
`color: var(--ink);` explicitly so it isn't accidentally dependent on
context the way `.house-group h3`'s weight is.

### E. Caption/meta text has five near-duplicate sizes doing one job

Section §6 lists eleven selectors that are all "quiet secondary text in
`--faint`, sitting under or beside a title." Their sizes cluster into five
barely-distinguishable steps with no apparent rule for which gets which:
10.5px (`.history-xlabel`, off on its own), 11px (`.update-date`,
`.house-caveat`), 11.5px (`.yanny-head-sub`, `.notes-source`,
`.foot-legal`), 12px (`.settings-note`, `.note-group-label`), and 12.5px
(`.shop-row-meta`, `.org-hero-domain`).

**Suggested unified value:** collapse this cluster to two steps —
`11px` for the quietest captions (dates, domains, tooltips) and `12.5px`
for meta that sits closer to body copy (offer facts, results-head) — rather
than five sizes a reader cannot actually tell apart at these scales.

### F. `.org-hero-count` breaks its own row's pattern

Still in the caption cluster: `.org-hero-count` (14px/500) sits directly
beside `.org-hero-domain` (12.5px/400) in the same `.org-hero-text` column,
but is noticeably larger and heavier than every other caption-role element
nearby, including the domain line right under it. If the intent was to make
the fragrance count read as more prominent than the domain, that's a
reasonable call — but at 14px it's now closer in size to `.org-hero-name`'s
sibling `.org-hero-count`... it just reads like an accidental in-between
size rather than a deliberate third tier. Worth either pulling it down into
the caption cluster (12.5px) or explicitly deciding it's a distinct
"secondary metric" tier and applying that tier consistently elsewhere too
(it currently has no siblings at 14px/500/`--faint`).

### G. Price sizes are fragmented context-by-context

Six different rules render "the price of a listing" (§8): 34px
(`.price-box-amount`), 19px (`.hero-price.none`), 17px (`.now`), 15.5px
(`.tile-price .amt`), 14.5px (`.tile-price` base), 13px (`.house-price`).
Some of this is legitimately purposeful — the detail page's headline price
should dominate its card, and a house card genuinely carries less weight
than a comparable UK offer — but two pairs look like drift rather than
design:

- `.now` (offer row, 17px) vs `.tile-price .amt` (tile, 15.5px): both are
  "the price of one specific offer," one in a list row and one in a grid
  tile, yet they differ by 1.5px with no stated reason.
- `.tile-price` base (14.5px) vs its own child `.tile-price .amt`
  (15.5px): the base rule sets a size that every actual price text then
  immediately overrides via `.amt` — the 14.5px value on `.tile-price`
  itself is dead weight that only `.tile-price .off` and `.tile-price
  .was` fall back toward, which is confusing to read as a single unit.
  Worth a comment at minimum, if not restructuring so the base rule only
  carries the properties every child actually shares (color, alignment,
  `flex`) and each visible number states its own size directly.

**Suggested unified value:** no single number fits every context here, but
picking two explicit tiers — a "headline price" tier (used only by
`.price-box-amount`) and a "row/tile price" tier at one shared size
(propose 16px, splitting the difference between the current 17px and
15.5px) — would remove the two accidental mismatches above without
flattening the genuinely different roles.
