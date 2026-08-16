# Design system

> **The tokens and the type scale now live on the site itself, at
> [/design](https://pricesniffs.space/design).** That page reads every value
> out of the live stylesheet as it renders: the swatches are painted with the
> tokens rather than with copies of them, the type samples are real elements
> carrying the real classes, and the contrast ratios are computed in the
> browser for whichever theme is showing. It cannot disagree with the
> stylesheet, because it has no copy of it to disagree with.
>
> **Where this document and that page differ, the page is right.** This file
> is a transcription, and a transcription is only true on the day it is made.
> Sections 1.1 to 1.6 below were refreshed against the real CSS on
> 2026-08-16; everything from section 2 onward is still the component audit
> taken at commit `9e43083`, and parts of it have aged — §1.5's `--card` /
> `--muted` bug, for one, no longer exists (`grep -c 'var(--card)'
> demo/template.html` returns 0). Read those sections as a record of what was
> found then, not as a claim about today.

What is actually built in `demo/template.html` and `demo/app.ts`. Every
token, component and animation below is transcribed from the real CSS, not
proposed. Where something is missing, wrong, or duplicated, it is called out
explicitly rather than silently fixed — this document does not implement
anything.

Line references point at `demo/template.html` unless stated otherwise. The
served page `demo/index.html` is a generated artifact (see its header) that
carries the same styles verbatim, so a fix belongs in `template.html`, never
in `index.html` directly.

---

## 1. Design tokens

### 1.1 How theming works

Colour is entirely custom-property driven, set on `:root` and switched by an
attribute the app writes at runtime: `data-mode="dark" | "light" | "system"`
(`demo/app.ts`, `applyMode`/`loadMode`/`setMode`). `system` mode adds a second
layer: it follows `prefers-color-scheme` when nothing else has opinions, and
separately follows `data-theme` if a *host* page stamps that attribute on
`<html>`, so an embedding shell's own theme toggle keeps working.

That means there are **five** near-duplicate colour blocks in the file, not
four as this document previously said:

| Selector | What it covers |
|---|---|
| `:root, :root[data-mode="dark"]` | The dark default |
| `:root[data-mode="light"]` | The light theme, chosen in Settings |
| `@media (prefers-color-scheme: light) { :root[data-mode="system"] }` | "Match my device", device prefers light |
| `:root[data-mode="system"][data-theme="light"]` | A host page forcing light |
| `:root[data-mode="system"][data-theme="dark"]` | A host page forcing dark |

All the dark blocks agree and all the light blocks agree. That is no longer
an observation: `tests/contrast.test.ts` asserts that **every one of the five
blocks declares exactly the same set of token names** as the dark block, so a
token added to one and forgotten in another fails the build rather than
silently falling back to whatever it inherited. The duplication itself
remains — a `light-dark()` or a single palette block referenced by all five
selectors would remove it — but it can no longer drift unnoticed.

Layout (`data-layout="mobile" | "desktop"`) is a **separate** attribute from
colour mode on purpose — a fixed bug is recorded in the CSS history: an
earlier build put layout and theme on the same attribute and
`closest('[data-mode]')` click handling matched whichever came first. Keep
them apart.

### 1.2 Colour tokens

Both palettes, as declared today. Read live, with contrast measured for the
current theme, at [/design](https://pricesniffs.space/design).

| Token | Dark (default) | Light | Role |
|---|---|---|---|
| `--bg` | `#0A0A0B` | `#FCFCFD` | The page itself |
| `--surface` | `#121214` | `#FFFFFF` | A card or a control, one step up |
| `--surface-2` | `#1A1A1D` | `#F2F2F4` | A second step up: chips, pills, segments |
| `--ink` | `#F7F7F8` | `#0D0D0F` | Primary text |
| `--ink-2` | `#C2C2C7` | `#4A4A52` | Secondary text |
| `--faint` | `#8A8A92` | `#6B6B74` | Meta, captions, placeholders |
| `--line` | `#26262A` | `#E6E6EA` | Default hairline |
| `--line-firm` | `#3A3A40` | `#CFCFD6` | A firmer divider |
| `--accent` | `#FF3B41` | `#C8102E` | The brand red, as a fill |
| `--accent-on` | `#0B0405` | `#FFFFFF` | Text painted on that fill |
| `--accent-sf` | `#1E0709` | `#FDECEE` | A tinted ground under accent text |
| `--accent-ink` | `#FF6A6E` | `#A80C25` | The accent as text on the page ground |
| `--accent-press` | `#D42B31` | `#9E0C22` | An accent fill, pressed |
| `--focus` | `#FF3B41` | `#C8102E` | The focus ring, named apart from `--accent` |
| `--chart-grid` | `#1F1F23` | `#EDEDF1` | Price history gridlines |
| `--chart-band` | `rgba(255,59,65,.10)` | `rgba(200,16,46,.08)` | Fill under the live price line |
| `--ok` | `#4FB47B` | `#17724B` | In stock, a saving, new |
| `--warn` | `#D8A24C` | `#8A5A00` | Low stock, a countdown |
| `--shadow` | `0 1px 3px rgba(0,0,0,.4)` | `0 1px 3px rgba(0,0,0,.18)` | The one drop shadow |
| `--shadow-lift` | `0 1px 0 #26262A` | `0 1px 2px rgba(13,13,15,.06), 0 8px 24px rgba(13,13,15,.05)` | Card lift |
| `--bg-glass` | `rgba(10,10,11,.72)` | `rgba(252,252,253,.72)` | Translucent bar ground |
| `--glow-1` | `rgba(255,59,65,.22)` | `rgba(200,16,46,.13)` | Ambient glow, nearer |
| `--glow-2` | `rgba(255,59,65,.13)` | `rgba(200,16,46,.08)` | Ambient glow, further |
| `--mono-bg-l` | `20%` | `93%` | Monogram ground lightness |
| `--mono-fg-l` | `78%` | `30%` | Monogram ink lightness |
| `--mono-border-l` | `42%` | `55%` | Monogram border lightness |
| `--gender-women` | `#FF8FB3` | `#A81B5E` | Venus mark, unselected pill |
| `--gender-women-on` | `#A81B5E` | `#FF8FB3` | Venus mark, selected pill |
| `--gender-men` | `#7FBBFF` | `#17569E` | Mars mark, unselected pill |
| `--gender-men-on` | `#17569E` | `#7FBBFF` | Mars mark, selected pill |

Theme-independent, declared once on a plain `:root`: `--sans` / `--font-sans`,
`--font-num`, `--col`, `--sheet-col`, `--mono-sat`, `--gutter` (16px, 28px
from 900px wide), `--bar-h`, `--dur-1` to `--dur-4`, `--ease-standard` and
`--ease-exit`.

### 1.3 What the colour rules actually are

**The accent is the brand colour, so it can never also mean "bad."** A sold
out listing goes grey (`--faint`), never red; only positive states carry
colour. A "price rise" or "error" state added later must not reach for
`--accent` either.

**Both ambient glows are the brand red and nothing else.** The violet and
teal that used to sit either side of it (`--orb-b`, `--orb-c` in an earlier
version of this document) were removed: on a site whose whole job is one red
accent, three brands' worth of colour behind the greeting is a claim it
should not be making. Light-theme alphas run at roughly half the dark
value — a wash that reads as ambient on a dark ground turns muddy on a light
one.

**Two values for anything painted on an inverting ground.** `--accent-on`
against `--accent`, and the four gender tokens against a facet pill that
inverts to `--ink` when selected. The `-on` suffix is the convention.

**Contrast is measured, not assumed.** `--mono-fg-l` sits at 30% in the light
theme because that is the highest lightness clearing AA against `--mono-bg-l`
at every one of the 360 hues the monogram tint can take; at 33% the worst hue
came out 4.23:1. The eight gender-mark combinations are quoted in the
stylesheet and asserted against the real token values by
`tests/contrast.test.ts`, worst case 6.30:1. Live ratios for whichever theme
you are in are on [/design](https://pricesniffs.space/design).

### 1.4 The un-themed second palette: `.tile` and its white-ground children

This is the single most important thing to understand about the colour
system, and it doesn't show up if you only read the `:root` blocks.

`.tile` is **hard-coded white in both themes** (`template.html:494-513`),
with its own comment explaining why: catalogue photography is shot on a
white ground, so a white tile lets card and photo disappear into one
another; because that decouples the tile from `--surface`, its text can no
longer use the theme ink tokens (dark mode's `--ink` is pale, meant for a
dark ground, and would be nearly invisible on the always-white tile).

What the comment does not say, and what close reading of the actual hex
values shows, is that this "tile-only" palette is not an invented one — it
is the **light-theme token values, copied as literal hex**:

| Fixed value used inside `.tile` / `.art-empty` | Equals light-theme token | Where |
|---|---|---|
| `#17141A` | `--ink` (light) | `.tile` text colour, 505 |
| `#8A838F` | `--faint` (light) | `.art-empty`, `.tile .phead-brand`/`.phead-meta`, `.tile-price .amt.none`, `.was`, 462/513/549/551 |
| `#E7E3E7` | `--line` (light) | `.tile` / `.art-empty` border, 461/504 |
| `#D3CDD3` | `--line-firm` (light) | `.tile:hover` border/glow, 511 |
| `#17724B` | `--ok` (light) | `.tile-price .off`, 545 |
| `#F0EDEF` | `--surface-2` (light) | `.sold-by` background, 562 |
| `#55505A` | `--ink-2` (light) | `.sold-by` text, 562 |

**Finding:** these seven values are a duplicated, unnamed "always-light"
palette. Today they happen to match `light` exactly, but nothing enforces
that — if the light theme's `--ok` or `--faint` is ever retuned, these
seven literals will silently drift out of sync with it and nobody editing
the theme block would know to look inside `.tile`. The fix that fits the
existing system (not proposed as an implementation, just named): add
theme-invariant tokens once, e.g. `--ink-on-light`, `--faint-on-light`,
`--line-on-light`, `--line-firm-on-light`, `--ok-on-light`,
`--surface-2-on-light`, `--ink-2-on-light`, defined identically in every
`data-mode` block (i.e. genuinely constant), and have `.tile`, `.art-empty`,
and the newer `.house-img`/white-ground contexts reference those names
instead of repeating hex.

### 1.5 A second, unrelated colour bug: undefined tokens on `.house-card`

> **Fixed since.** `grep -c 'var(--card)\|var(--muted)' demo/template.html`
> returns 0 as of 2026-08-16. Kept below as the record of a real bug and how
> it was reasoned about, not as a description of the file today.

The Houses block (`template.html:977-1019`, added in commit `9e43083`) uses
`var(--card)` and `var(--muted)` — **neither token is defined anywhere in
this file**, in any `data-mode` block. Confirmed with a repo-wide search:
only `--surface`/`--surface-2` and `--faint`/`--ink-2` exist; `--card` and
`--muted` do not appear in any `:root` selector.

```css
/* template.html:980-985 */
.house-note {
  ...
  background: color-mix(in srgb, var(--card) 70%, transparent);
  color: var(--muted);
}
```

Per CSS custom-property fallback rules, an undefined `var()` with no second
argument makes the *property* using it invalid at computed-value time. For a
non-inherited property (`background`) that resolves to the property's
initial value — effectively no background paint. For an inherited property
(`color`) it resolves to the inherited value, i.e. whatever colour the
parent supplies. Practically: **`.house-note`, `.house-count`, `.house-card
a`, and `.house-caveat` currently render with no distinct card background
and inherited (not muted) text colour** — the card looks unstyled/flat
rather than like a card. This also silently defeats part of the stated
design intent for Houses ("must remain visually distinct... so they are
never mistaken for an actionable offer", per brief) — right now the visual
distinction from a comparison tile is thinner than intended, because the
card ground isn't painting at all.

This is reproduced identically in the built `demo/index.html`
(`grep -n "var(--card)\|var(--muted)" demo/index.html`), so it is not a
template-vs-build drift, it is the same bug in both places.

Unlike §1.4, this doesn't look like an intentional "always-light" pattern —
`.house-img` already gets its own white ground independently
(`background: #fff`, line 1009), so `.house-card a`'s own background was
never meant to be a fixed white; it reads as a plain themed surface that
should track `--surface` (or `--surface-2`, to sit one step above
`--bg`) and `--faint` (or `--ink-2`), most likely renamed from a different
token vocabulary (`--card`/`--muted` is a common shadcn/Tailwind-adjacent
naming pair) during a copy/adapt and never reconciled with this file's
actual token names.

**Recommendation for whoever implements:** rename `var(--card)` →
`var(--surface)` and `var(--muted)` → `var(--faint)` (or `--ink-2` for the
caveat text, which sits directly on the card and wants slightly more
contrast than `--faint` gives against `--surface`). Verify contrast in both
themes once changed — this doc does not implement it.

### 1.6 Type scale

There is still no `--font-size-*` scale: sizes are literal `px` on the rule
that uses them. What there is, and what this section previously predated, is
**eight named type roles**, one canonical size, weight and tracking each,
declared together near the top of `template.html`. They are what collapsed
the drift the table further down this section catalogued — three competing
treatments for section headings, four weights at one size for card titles,
eight letter-spacings for eyebrows.

| Role | Font | Tracking | Colour | Used for |
|---|---|---|---|---|
| `.t-page` | 700 26px/1.15 (32px from 900px) | -.022em | `--ink` | The one title at the top of a view |
| `.t-section` | 600 15px/1.25 | -.005em | `--ink` | A heading introducing a block |
| `.t-title` | 600 15px/1.3 | -.01em | `--ink` | A card or row title |
| `.t-body` | 400 14px/1.55 | — | `--ink-2` | Running text |
| `.t-eyebrow` | 600 11px/1, uppercase | .08em | `--faint` | Small caps label |
| `.t-caption` | 400 13px/1.4 | — | `--faint` | Caption, meta |
| `.t-count` | 600 12px/1, tabular | .01em | `--ink-2` | A count in a column |
| `.t-price` | 700 20px/1.1, tabular (`--price--hero`: 34px) | -.02em | `--ink` | A price |

11px is the floor for `.t-eyebrow`: below it, uppercase tracking stops being
readable at 360px wide. `.t-count` and `.t-price` are the two roles on
`--font-num` with `font-variant-numeric: tabular-nums`, so a column of
figures lines up.

Rendered at their real sizes, with the computed spec read off each sample,
on [/design](https://pricesniffs.space/design).

Sizes outside those eight roles are still literal `px` scattered across the
stylesheet, and `docs/typography.md` holds the exhaustive per-selector
inventory of them.

### 1.7 Spacing

Same situation as type: no `--space-*` scale, only literal `px`. The
observed values across `gap`/`padding`/`margin` cluster tightly (1, 2, 3, 4,
5, 6, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 20, 24, 26, 28, 30, 34px) —
closer to a 1px-granular "whatever looked right" rhythm than a strict 4/8pt
grid, though 4/8/12/16 do recur most often as the anchors. No inconsistency
to fix, but nothing to enforce it either — a new component has no scale to
snap to short of matching a neighbour by eye.

### 1.8 Radii

| Radius | Used for |
|---|---|
| 3px | focus-visible outline-radius on text buttons (`.brandmark`, `.link-btn`, `.back`) |
| 4px | `.tag` |
| 8px | `.seg-btn` |
| 9px | `.brand-opt` (dead component, see §2.8), `.doc .draft` |
| 10px | `.art`, `input[search]`, `.control`, `.house-img` |
| 11px | `.monogram`, `.seg` |
| 12px | `.search-big`, `.house-note` |
| 14px | `.tile`, `.house-card a` |
| 15px | `.org-hero .monogram` |
| 16px | `.price-box`, `.sheet` top corners (dead component) |
| 999px | every pill: `.subnavbtn`, `.chip` (dead, §2.8), `.note-chip`, `.sold-by`, `.house-count` |

No `--radius-*` tokens either. A rough tier does exist by eye (control-level
~10px, card-level ~14–16px, pill = 999px) but again nothing declares it.

### 1.9 Elevation

There is effectively **one** elevation value in the whole system:
`--shadow`, and it is used exactly once, on `.medal`
(`template.html:472`). Everything else that reads as "raised" — `.tile`,
`.price-box`, `.house-card` — achieves it with a **border**, not a shadow
(`.tile { border: 1px solid #E7E3E7 }`, `.price-box { border: 1px solid
var(--accent) }`), plus in `.price-box`'s case a colour-tinted glow:

```css
/* template.html:731 */
box-shadow: 0 0 30px 2px color-mix(in srgb, var(--accent) 32%, transparent);
```

So "elevation" in this system is really two unrelated things wearing one
name: a flat single-value drop shadow for medals, and a bespoke accent glow
for the one card that most needs to draw the eye (the price). There is no
elevation *scale* (e.g. resting/raised/overlay tiers) to extend — a new
"raised" component should look at whether it wants the medal shadow, the
price-box glow pattern, or (as most cards do) just a themed border, rather
than assuming a shadow tier exists to slot into.

---

## 2. Component inventory

For each: what it is, its states, and gaps against the other components in
the same family.

### 2.1 `.tile` — fragrance tile (`template.html:502-513`, built by
`fragranceTile()` in `demo/app.ts:386-411`)

The single shared shape for every fragrance list in the app: home rail,
browse/search/deals grid, retailer/brand/note results.

| State | Implemented | Notes |
|---|---|---|
| Default | Yes | Always-white card, §1.4 |
| Hover | Yes, `@media (hover: hover) and (pointer: fine)` only (510-512) | Correctly excluded on touch — no hover state to get stuck open on a phone |
| Focus-visible | Yes (508) | `outline: 2px solid var(--accent)` |
| Active/press | Yes (509) | `transform: scale(.97)` |
| Sold out | Yes, same tile shape | Fixed in commit `cb028a1` — badge always renders (falls back to cheapest known retailer even if unpurchasable) specifically so a sold-out tile is not shorter than its in-stock row-neighbours; see §3 for the animation-adjacent version of this rule |
| Empty (no photo) | Yes | `.art-empty` placeholder, fixed hex regardless of theme (§1.4) |
| Empty (zero offers ever) | Yes, deliberately degraded | Invisible `visibility:hidden` `.sold-by` spacer only, per the same commit — "should not happen in real data" |

Gap: none found for this component specifically — it is the most complete
component in the set, likely because it is the one two separate bug-fix
commits have already hardened.

### 2.2 `.phead` — product head (`template.html:414-428`, `productHead()`
in `demo/app.ts:352-363`)

Brand + name left, size/concentration right, shared verbatim across tile,
detail hero, and (implicitly) nowhere else.

| State | Implemented | Notes |
|---|---|---|
| One-line name | Yes | `.phead-name-wrap { min-height: 2.5em }` reserves 2-line room regardless |
| Two-line name (clamped) | Yes, `-webkit-line-clamp: 2` | Bug fixed in `6e42710`: `-webkit-box` does not centre its own content (`-webkit-box-pack: center` verified ignored in Chromium), so centring was moved one level up onto a plain flex wrapper (`.phead-name-wrap`) instead |
| Three-line variant (detail hero) | Yes | `.hero .phead-name { -webkit-line-clamp: 3 }` (720) |
| Overflow name (brand) | Yes | `.phead-brand` gets `text-overflow: ellipsis` |

No interactive states — `.phead` itself is never a button, only ever a
child of one (`.tile`) or static (`.hero`). No gap.

### 2.3 `.price-box` — the detail page's headline price
(`template.html:727-741`)

| State | Implemented | Notes |
|---|---|---|
| Has a price | Yes | Accent border + tinted glow, §1.9 |
| Sold out everywhere | Yes, different component | Falls to `.hero-price.none` (743), not a "sold out" state of `.price-box` itself — deliberately a plain, un-boxed line so the absence of a price is not dressed up to look like a price |

No hover/focus states — it is not interactive (a static summary, the real
CTAs are the offer rows below it). No gap; the "no price" case is correctly
a different, quieter component rather than a muted version of the same one,
consistent with the file's stated rule that red/accent must not be diluted
into meaning something else.

### 2.4 `.offer` / offer row (`template.html:752-797`, `offerRow()` in
`demo/app.ts:498-532`)

| State | Implemented | Notes |
|---|---|---|
| Best / cheapest | Yes | `.tag` "Cheapest" badge |
| New (< 7 days at this shop) | Yes | `.tag.new`, deliberately a *different* colour (`--ok`) from `.tag`'s accent, so it is never confused with "cheapest" — stated in a code comment (766-768) |
| Has a discount | Yes | Was/now price stacked vertically, never side by side — comment (536-538) explains this is deliberate: a struck-through number beside the real one invites misreading which is the actual charge |
| Countdown-eligible discount | Yes, conditionally | Only rendered when `canShowCountdown(d)` is true (`app.ts:526`) — see §4 |
| Unavailable but was seen | Yes | `.offer.unavail { opacity: .5 }` |
| Never seen at this shop | Yes, visually distinct from the above | `.offer.unavail-elsewhere { opacity: .4 }`, no link (`cursor: default`), tighter padding — deliberately quieter than `.unavail`: "that shop is at least confirmed to carry the bottle, this one has never been seen selling it" (comment 787-790) |
| Focus-visible | Yes (758) | On `.offer-link` |
| Stock detail (in/low/preorder/unknown/sold out) | Yes | Coloured `.dot` (779-782), text label from `STOCK_LABEL` |

This is the most state-rich component in the app and every state is
deliberately distinguished — no gaps found.

### 2.5 `.org-hero` — retailer/brand profile header
(`template.html:648-654`)

Shared verbatim by `retailerView()` and `brandView()` in `demo/app.ts`.

| State | Implemented | Notes |
|---|---|---|
| Has a blurb | Yes | `.org-hero-blurb` |
| No blurb | Yes | Conditionally omitted (`app.ts:785`, `r.blurb ? ... : ''`) rather than rendering empty |
| Has a confirmed official site (brand only) | Yes | Real link |
| No confirmed official site (brand only) | Yes | `.org-hero-domain.dimmer`, text "Official site not yet confirmed" instead of guessing a domain — matches the project's stated no-fabrication rule |

No gap. Not interactive itself.

### 2.6 `.subnav` / `.subnavbtn` — Explore's second-level tabs
(`template.html:251-268`)

| State | Implemented | Notes |
|---|---|---|
| Active | Yes | `.on`, accent border + tinted background |
| Hover | Not gated behind `(hover: hover)` | Unlike `.tile`/`.brand-row`/`.note-chip`, `.subnavbtn` has no hover rule at all — consistent, not a gap, just worth noting it is the one nav control with zero hover treatment |
| Focus-visible | Yes (267) | |
| Active/press | Yes (268) | `scale(.95)` |
| Hidden (outside Explore) | Yes | `[hidden]` attribute, not a CSS class — toggled via `subnav.hidden = !inExplore` in `app.ts:1139-1140`. **This is exactly the kind of hidden state the reduced-motion rule warns about — worth double-checking it stays a plain attribute toggle and never migrates onto an `opacity`/`animation` base rule**, since `[hidden]` is a hard `display:none`, immune to the reduced-motion stripping in §3.6 by construction. No bug today; flagged because it is the pattern to keep. |

### 2.7 `.control` / `.dropdown` — sort/filter control
(`template.html:580-594`)

| State | Implemented | Notes |
|---|---|---|
| Default | Yes | |
| Focus-within (i.e. the inner `<select>` has focus) | Yes | `.control:focus-within { border-color: var(--accent) }` (587) |
| The `<select>`'s own `:focus-visible` | **Explicitly suppressed** | `.dropdown:focus-visible { outline: none }` (594) |

**Gap worth flagging:** the native `<select>` focus ring is deliberately
removed with no `outline` replacement on the element itself — the *only*
focus feedback is the parent `.control`'s border colour change to
`--accent`, a 1px border on a ~34px-tall pill. That is a real, working
substitute (many design systems do exactly this), but it is worth an
explicit accessibility check the rest of the file already gets: does a 1px
border colour change on this control meet the non-text contrast guidance
(WCAG 2.4.11 / former 1.4.11, effectively ~3:1 against both the pill's own
fill and the page background) in **both** themes, at the sizes actually
shipped? Every other focus-visible ring in the file is a 2px accent
outline with offset — `.dropdown` is the one exception, and it should be
either verified as sufficient or given the same 2px outline treatment
(applied to `.control:focus-within` instead of relying on border-color
alone) for consistency.

### 2.8 Dead components: `.chip`, and the brand-filter sheet

Two styled, markup-present components have **zero live callsites** in
`demo/app.ts`:

- `.chip` (`template.html:282-288`) — fully styled (focus-visible included)
  but `grep -rn '"chip"' demo/app.ts` returns nothing. No code ever renders
  an element with this class.
- The brand-filter bottom sheet — `.sheet-back`, `.sheet`, `.sheet-title`,
  `.brand-opt` (`template.html:884-903`), plus its own dedicated width
  token `--sheet-col` (99-103) and its own DOM mount point,
  `<div id="sheet-host">` (`template.html:1044`) — has no JS anywhere that
  populates `#sheet-host`, toggles the sheet open, or sets `.brand-opt.on`.
  Brand filtering today happens entirely through `.control`/`.dropdown`
  (§2.7) and `.brand-row` in the Brands list — a different, already-working
  mechanism.

Both read as leftovers from an earlier brand-filter design (a modal sheet
of brand choices) that was superseded by the current dropdown/list
approach and never removed. Not a bug — dead CSS costs nothing to load
that matters at this file size — but worth flagging per the brief's "find
inconsistencies" mandate: `--sheet-col` in particular looks like a live
token in §1's variable list until you check whether anything still reads
it.

### 2.9 `.house-card` — Houses tab card (`template.html:995-1019`, built by
`housesPanel()` in `demo/app.ts:972-1020`)

| State | Implemented | Notes |
|---|---|---|
| Default | Broken today, see §1.5 | Undefined `--card`/`--muted` tokens |
| Hover | Yes (`hover:hover` **not** gated) | `.house-card a:hover { border-color: var(--accent) }` (1006) — unlike `.tile`/`.brand-row`/`.note-chip`, this is **not** wrapped in `@media (hover: hover) and (pointer: fine)`. Minor inconsistency: on a touch device this hover rule can "stick" after a tap until the next touch elsewhere, the exact class of bug the `(hover: hover)` guard exists elsewhere in this file to prevent. |
| Focus-visible | **Missing** | No `:focus-visible` rule targets `.house-card a` at all. Every other primary navigable card/row in the app (`.tile`, `.brand-row`, `.shop-row`, `.note-chip`, `.offer-link`) has an explicit accent focus ring; `.house-card a` falls through to the browser default outline, which is not styled to match the rest of the app (colour, offset, radius) and — depending on UA default — may sit flush against the rounded card corner rather than reading as consistent with the accent-outline language used everywhere else. This is the one clear focus-visible gap in the component inventory. |
| No image | Yes | `.house-img-none`, plain `background: var(--line)` block, no icon/pattern — the plainest empty-image treatment in the app (contrast with `.art-empty`, which centres a wordmark/icon) |
| No native price published | Yes | Text "Price not published" in place of the amount (`app.ts:1009`) |
| Empty (a house with zero products) | Effectively unreachable given current data, but the *panel-level* empty state exists | See next point |

**Empty-state class-name bug:** the whole-panel empty state (no house
storefront returned anything) is:

```ts
// demo/app.ts:974
return `<p class="empty">No house storefront has returned listings yet.</p>`;
```

Every other empty state in the app uses `.empty-note`
(`template.html:567`, `color: var(--ink-2); font-size: 14.5px; padding: 30px
2px; text-align: center;`) — `browseView()`, `fragranceList()`,
`brandsPanel()`, `notesPanel()`, `retailerView()`, `brandView()`,
`noteView()`, `searchPanel()` all use it. `housesPanel()` alone uses class
`.empty`, and **no `.empty` rule exists anywhere in `template.html`** —
confirmed by search. If this branch is ever hit (currently it is not, per
the commit message: 336 house products are already committed), the message
renders with no styling at all: default paragraph margins, body text
colour, left-aligned, no padding — visually broken next to every other
empty state in the app. One-word fix (`empty` → `empty-note`), not applied
here per the "specify, don't implement" instruction, but flagged as the
clearest, cheapest fix in this whole review.

---

## 3. Animation and transition specification

This section documents what exists today as a coherent system, then states
the rule for anything added later.

### 3.1 The hard rule (do not weaken this)

> Hidden/entrance state must live inside the `@keyframes`, never in the
> base rule.

Proven necessary by the file's own comment (`template.html:314-324`): the
global reduced-motion rule (§3.6) strips `animation` and `transition`
entirely. If a component's *base* CSS rule sets `opacity: 0` (intending the
animation to bring it to `1`), a reduced-motion user gets that opacity
frozen at `0` forever — permanently invisible content, with no way to
recover it, because the mechanism that was supposed to reveal it has just
been switched off. The fix pattern already in use everywhere: give the
element a normal, fully-visible base state, and let `animation: ... backwards`
supply the *from* state only for users who get to see it animate. Every
entrance animation in the file (`.hero-wordmark`, `.hero-by`,
`.hero-mission`, `.intro-points li`, `.view-fade`) follows this
correctly today — `backwards` is doing exactly the job described. **Any
new entrance animation must follow the same shape**, and this is the one
rule in the whole document explicitly called out as non-negotiable, per
the task brief.

### 3.2 Inventory of what exists

| Name | Element(s) | Duration | Easing | Trigger | Loops |
|---|---|---|---|---|---|
| `drift-a`/`b`/`c` | `.orb-a`/`b`/`c` (ambient bg) | 41s / 59s / 47s | `ease-in-out` | Page load, always running | Infinite |
| `scan` | `.bar::after` (top-edge sweep) | 7s | `linear` | Page load, always running | Infinite |
| `breathe` | `.hero-logo::before` (glow behind wordmark) | 9s | `ease-in-out` | Page load, always running, home view only | Infinite |
| `rise` | `.hero-wordmark`, `.hero-by`, `.hero-mission`, `.intro-points li` | .75s | `cubic-bezier(.22,1,.36,1)` | Home view mount, staggered via `animation-delay` (0, .08, .16, .26, .34, .42s) | Once (`backwards` fill only) |
| `viewIn` | `.view-fade` wrapper around every route's rendered HTML | .32s | `cubic-bezier(.16,.8,.4,1)` | Every navigation (`render()` wraps the fresh markup fresh each time, so it "just plays" on insert — no JS retrigger logic, `app.ts:1132-1134`) | Once per navigation |
| various `transition`s | `.navbtn`, `.subnavbtn`, `.tile`, `.chip`(dead), `.brand-row`, `.shop-row`, `.note-chip`, `.seg-btn`, `.contact-send` | .12s–.15s | `ease` | hover/focus/active | n/a |

### 3.3 Durations and easing as a system

Two families, used consistently:

- **Micro-interactions** (hover/focus/active feedback): `.12s`–`.15s`,
  plain `ease`. Consistently short — nothing in this tier exceeds .15s.
  Principle to keep: state feedback should read as instantaneous, never as
  something the user waits on.
- **Entrances / view changes**: `.32s`–`.75s`, both using a custom
  `cubic-bezier`, not `ease`/`ease-out`. `viewIn`'s curve
  (`.16,.8,.4,1`) is a fast-out, gentle-settle curve suited to a full-view
  swap; `rise`'s curve (`.22,1,.36,1`) overshoots slightly less and is
  tuned for a small vertical settle (14px) rather than a full-screen
  transition. Keep this distinction if a third kind of entrance is added —
  don't reach for `viewIn`'s curve on a small in-place reveal or vice
  versa.
- **Ambient loops** (orbs, scan line, glow breathe): 7s–59s, always
  `ease-in-out` or `linear`, always `infinite`. The three orb durations are
  *deliberately* coprime-ish (41/59/47) so the three loops drift in and out
  of phase for minutes rather than visibly resynchronising — documented
  reasoning at `template.html:145-149`. **Any additional ambient loop
  should pick a duration that shares no small common factor with 41, 47,
  or 59** (avoid e.g. 42, since 42 and 41 nearly-but-not-quite avoid
  resonance for a while but a duration like 82 or 94 would resonate
  cleanly with an existing one) — this is a real constraint on future
  ambient elements, not just trivia about the current three.

### 3.4 When *not* to animate (the implicit principle, made explicit)

Reading the whole file for what never animates is as informative as what
does:

- **Price and count values never animate.** `.tile-price`, `.price-box-
  amount`, `.count`, `.now` all render as plain static text on each
  render, with no transition even on value change. A number that
  represents money should not visually "tween" between two real prices —
  that reads as a graphic effect on data the user needs to trust, not a
  flourish. Keep this for any freshness/countdown UI added under §4: the
  *label* around a price (e.g. "updated 2h ago") may transition; the price
  figure itself should not.
- **Layout-affecting properties are never animated**, only `transform`,
  `opacity`, `background-color`/`border-color`/`color` (all compositor- or
  paint-only). No animated `width`/`height`/`top`/`left` anywhere in the
  file — consistent with the ambient-orb comment's explicit reasoning
  about avoiding main-thread repaint cost (`template.html:139-143`,
  "`filter: blur()` on a viewport-sized element is one of the most
  expensive things you can ask a compositor to redo every frame"). This is
  a real, enforced constraint, not an accident: extend it to any new
  animation.
- **Nothing loops fast.** The fastest infinite loop in the file is 7s
  (`scan`). Nothing here does a sub-second pulse/blink repeatedly — the
  hero glow's `breathe` is explicitly described as "well under the
  threshold of anything you would call blinking" (comment,
  `template.html:299-301`). A countdown "urgency" treatment (§4.2) should
  respect this: no fast blinking red text as a countdown nears zero, even
  though that is a common pattern elsewhere — it would break this file's
  own established restraint and risks a seizure-safety concern WCAG 2.3.1
  already covers at >3 flashes/second, which a naive countdown pulse could
  approach if implemented carelessly.

### 3.5 Skeleton / loading states

**None exist today.** Confirmed by search — no `skeleton`, `shimmer`,
`spinner`, or `loading` class anywhere in `template.html`. This is
consistent with the data model: everything is baked in at build time
(§4), so there is no client-side fetch-and-wait moment for a skeleton to
cover during normal use — the HTML for the current route is synchronous
`innerHTML` assignment inside `render()` (`app.ts:1112-1134`), not an
awaited network call.

If a skeleton state is added later (e.g. to mask the image `loading="lazy"`
pop-in already present on `.house-img`, `template.html:1002`, or a future
data refresh), it should follow the two established patterns rather than
invent a third: (a) a plain `background-color` pulse using the
`transition`-tier duration/easing family (§3.3, not the ambient-loop
family — a skeleton is feedback, not ambience), and (b) the §3.1 rule
applies to it exactly as to any other animation: the skeleton's *resting*
unrevealed state must not be the base rule if a reduced-motion user could
otherwise get stuck looking at a permanent grey block instead of content
that has actually finished loading. Given data is static per page load,
a lazy-loaded `<img>` already has a graceful fallback (the white `#fff`
ground behind it, `.house-img { background: #fff }`) — a skeleton here is
a nice-to-have, not a correctness requirement.

### 3.6 Reduced motion (the global override)

```css
/* template.html:1020, the last rule in the file */
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

Blanket, `!important`, applies to every element. This is why §3.1's rule
matters so much — this line has no exceptions and cannot have exceptions
carved into it component-by-component without every future author
remembering to re-add the reduced-motion opt-out per component, which is
exactly the kind of thing that gets missed. Keep the pattern where reduced
motion is handled once, globally, and every component is authored so that
"animation stripped" always still equals "fully visible, fully usable" —
never author a component that *requires* its animation to reach a usable
end state.

---

## 4. Live elements: freshness, countdowns, filters, sort

### 4.1 What "live" actually means here (read this before designing anything)

There is no server, no client-side polling, and no API. Confirmed by
reading the pipeline: `scripts/build-demo-catalogue.ts` runs as part of
the GitHub Actions workflow `.github/workflows/catalogue-daily.yml`, which
— despite its filename — runs on cron `'0 * * * *'`
(`catalogue-daily.yml:16`), i.e. **hourly**, not daily; the name is stale
and worth a rename in a separate housekeeping pass, not this one. Each run
crawls the configured retailers, writes `data/catalogue`, and regenerates
`demo/catalogue.generated.ts`, which is then committed and deployed as a
static file (`deploy-pages.yml`). The browser never talks to a retailer,
an API, or a database at runtime — `buildComparison()`
(`src/services/priceService.ts`) runs entirely over the array baked into
`catalogue.generated.ts` at build time.

**So "real-time price updates" in the traditional sense (a client polling
a live endpoint) is not achievable on this architecture, full stop, and
should not be designed as if it were.** What *is* honestly achievable, and
what the data already supports:

1. **Data-freshness display**, driven by real captured timestamps.
2. **Promotion countdowns**, driven by a real retailer-published end time
   that already exists in the data (never invented).
3. **Client-side filtering and sorting**, which is genuinely
   instantaneous because it operates over the array already in memory —
   this is the one part of "live" that is unambiguously real and already
   partly built.

### 4.2 Data freshness

Two granularities already exist in the codebase, at different levels, and
they should stay distinct rather than being collapsed into one number:

**Per-offer age** — `PresentedOffer.ageSeconds`
(`src/types/offer.ts:94`, computed in `src/services/priceService.ts:89-91`
as `now - Date.parse(offer.fetchedAt)`, in whole seconds, floored at 0).
Already surfaced in the UI today via the `age()` helper
(`demo/app.ts:260-264`):

```ts
function age(seconds: number): string {
  if (seconds < 90) return 'just now';
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)}h ago`;
}
```

...rendered once per fragrance detail view as "checked {age}" against the
*newest* offer's age (`detailView()`, `app.ts:582`, `Math.min(...ages)` —
correctly the freshest, not the average or oldest, since a reader deciding
"is this price still good" cares about the best available evidence).

**Build-wide freshness** — `CRAWLED_AT`
(`demo/catalogue.generated.ts:53968`, `export const CRAWLED_AT =
"2026-08-04T19:00:21.352Z"`), computed in `scripts/build-demo-catalogue.ts`
as the max `fetchedAt` across every offer in the crawl (lines ~413-416).
**This constant is exported but currently unused — `demo/app.ts` never
imports or renders `CRAWLED_AT` anywhere.** It is exactly the value a
whole-app freshness indicator would need (e.g. a small "prices last
checked {age(CRAWLED_AT)}" line near the nav or on Home) and it already
exists, computed correctly, sitting unused. This is the cleanest gap in
the entire live-elements area — the data pipeline already produced the
thing the UI is missing.

**Spec for a freshness indicator**, given the above:

- **Source of truth:** `CRAWLED_AT` for a global/whole-catalogue
  statement ("Prices checked as of..."), `PresentedOffer.ageSeconds` (via
  the existing `age()` helper) for a per-fragrance or per-offer statement.
  Never invent a third figure — no client-side `Date.now()` diffed against
  anything except one of these two real captured timestamps.
- **Refresh cadence to communicate:** hourly, matching the real crawl
  cadence (`catalogue-daily.yml`'s cron). The copy should say "prices
  update roughly every hour" or similar — honest about the mechanism
  (batch crawl, not live polling) rather than implying real-time.
- **Tick interval, if the relative string ("2h ago") is kept live on
  screen without a page reload:** a `setInterval` no more frequent than
  **once per 60 seconds** is enough — `age()`'s own granularity bottoms
  out at "just now" for anything under 90 seconds and reports whole
  minutes after that, so re-computing more often than once a minute
  recomputes a string that cannot have changed. This is the only
  "polling" that belongs anywhere in this app, and it polls the **clock**,
  never a server.
- **Staleness escalation:** the underlying crawl can, and per the git
  history has, gone stale for real operational reasons (see
  `55ef6c2 "Stop a concurrent push throwing away a forty-minute harvest"`,
  `bad3ea2 "Stop the hourly harvest delisting everything it did not
  sample"` — both are hard-won reliability fixes to the actual pipeline).
  A freshness indicator should therefore have a **stale threshold**, e.g.
  past ~3 hours since `CRAWLED_AT` (three missed hourly runs), switch its
  colour token from `--faint` (normal) to `--warn` (stale) — reusing the
  existing warn token rather than introducing a new one, and never
  reaching for `--accent`/red (§1.3's "red only ever means brand or
  positive" rule).
- **Reduced motion:** the freshness string is plain text that updates via
  a `textContent` replacement on a timer, not a CSS animation — nothing in
  §3.6 applies to it directly, but *if* a future version wants a subtle
  "just updated" flash on tick, that flash must follow §3.1 (base state =
  fully visible, keyframe supplies the *from* state) exactly like every
  other animated reveal in the file.

### 4.3 Promotion countdowns

Already substantially built, and already correctly constrained against
fabrication. The relevant code:

```ts
// src/services/discount.ts:47-51
export function canShowCountdown(discount: DiscountDisplay | null, now = new Date()): boolean {
  if (!discount?.endsAt) return false;
  const ends = Date.parse(discount.endsAt);
  return Number.isFinite(ends) && ends > now.getTime();
}
```

`endsAt` traces back to `offer.promoEndsAt`
(`src/services/discount.ts:35`), which is **only ever populated from a
retailer's own published data** — confirmed across every catalogue
adapter: `src/catalogue/jsonld.ts:203` reads `priceValidUntil` from
JSON-LD (a real schema.org field retailers publish themselves);
`src/catalogue/awinFeed.ts:220` and `src/catalogue/shopifyJson.ts:251`
both hard-set it to `null` with a comment stating why — "no such column
exists and a countdown must never be invented." The code comment on
`canShowCountdown` itself states the reasoning plainly: "An invented
countdown is the fastest way to lose a price-comparison user's trust, and
pressure-selling on a fabricated deadline is an ASA/CPR exposure."

Current rendering (`demo/app.ts:266-269, 525-529`):

```ts
function countdown(iso: string): string {
  const h = Math.floor((Date.parse(iso) - Date.now()) / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)}d left` : `${h}h left`;
}
```

...rendered once, at page-render time, inside `.ends` (`template.html:784`,
`color: var(--warn)`). It does not currently tick — it is computed once
per `render()` call and stays static until the next navigation
re-renders the offer row.

**Spec for extending this (still no implementation):**

- **Never widen `canShowCountdown`'s source.** It must stay gated on
  `promoEndsAt` from the retailer feed alone. Do not add a fallback that
  invents an end time from, say, "this discount has been active N days,
  assume it ends soon" — that is exactly the fabrication the existing
  function was written to prevent.
- **Tick interval, if made live:** once per minute is sufficient — the
  display granularity is whole hours until under 24h, and the existing
  `Math.floor` at the hour level means anything faster than 60s of
  recompute produces no visible change. (If a future finer-grained
  "under 1 hour: show minutes" tier is added, that tier alone could tick
  at 15–30s; the hour-granularity tier should stay at 60s+ to avoid
  needless recomputation.)
- **Expiry behaviour:** once `canShowCountdown` flips false (the promo's
  own end time has passed), the `.ends` line must disappear — it already
  does, because the conditional is evaluated fresh on every `render()`
  call and a stale/expired offer simply won't satisfy `d && canShowCountdown(d)`
  (`app.ts:526`) on the next re-render. If a live tick is added
  without a re-render (e.g. a `setInterval` that only rewrites the
  countdown text node), that same interval must also handle the boundary
  by removing/hiding the `.ends` element itself once expired — a ticking
  countdown that reaches "0h left" and just sits there is worse than
  today's static-until-navigation version, since it visibly asserts an
  offer is still time-limited after the retailer's own deadline has
  passed.
- **No urgency animation** — see §3.4's explicit reasoning against fast
  pulsing/blinking treatments; a countdown nearing zero should communicate
  urgency through the existing `--warn` colour and text alone, consistent
  with how the rest of the app already treats "low stock"/"caution"
  states with the same token and no motion.
- **Reduced motion:** if a live tick is added, it is a `textContent`
  update on a timer, not a CSS transition/animation, so §3.6's blanket
  rule does not strip it — which is correct, since a reduced-motion user
  still needs the countdown's *information* even though it can't animate.
  Do not gate the timer itself behind a `prefers-reduced-motion` check —
  that media query is about motion, not about whether numbers are allowed
  to update.

### 4.4 Client-side filtering and sorting

This is already real and already fast — it is the one "live" feature that
needs no honesty caveat, because it genuinely runs entirely in the
browser over data already in memory. Current inventory, all in
`demo/app.ts`:

| Surface | Sort options | Filter options | State key(s) |
|---|---|---|---|
| Brands | A–Z / Z–A | tier (all/designer/niche/mideast) | `brandSort`, `brandFilter` |
| Deals | biggest saving / lowest price / highest price | — | `dealSort` |
| Notes list | most common / A–Z | layer (any/top/middle/base) | `noteSort`, `noteLayer` |
| An individual note's fragrance list | A–Z / Z–A / price low / price high | tier | `noteDetailSort`, `noteDetailFilter` |
| A brand's own fragrance list | A–Z / Z–A / price low / price high | — (deliberately no tier filter — every fragrance from one brand shares its tier, so a tier filter there could only ever show everything or nothing, per the `cb028a1` commit message) | `brandDetailSort` |
| A retailer's own fragrance list | A–Z / Z–A / price low / price high | tier | `retailerDetailSort`, `retailerDetailFilter` |
| Quick search (nav bar) + full Search panel | — | free text against `brand + name + concentration`, case-insensitive substring | `query` |
| Desktop tiles-per-row | — | 3 / 5 / 8 / 10 columns | `perRow`, persisted to `localStorage` |

State management pattern (consistent throughout): a single mutable
`state` object (`app.ts:57-80`), mutated by DOM event handlers
(`change`/`input`/`click` delegated at `document` level,
`app.ts:1191-1319`), followed by a full `render()` call that regenerates
the affected panel's HTML string and reassigns `innerHTML`. No virtual
DOM, no framework, no diffing — a deliberate choice consistent with "no
CSS-in-JS, no framework" from the brief. One documented exception: the
full-Search input specifically avoids a full `render()` on every
keystroke, because that would tear out the focused `<input>` and drop
focus mid-type; instead it patches only `.search-results` in place
(`app.ts:1279-1295`, comment explains why). **This is the pattern to
follow for any future live-updating region** (e.g. the freshness
indicator's tick, §4.2): patch the smallest node that needs to change,
not a full re-render, whenever the region sits behind or beside a
focused input.

Filtering/sorting is synchronous and needs no loading state, debounce, or
skeleton — the dataset (per the crawl comment at `app.ts:481`, an "879
row wall") is well within instant client-side filter range; no
specification changes needed here beyond what already exists. If the
catalogue grows an order of magnitude, revisit — not a current concern.

---

## 5. Responsive behaviour

### 5.1 There are no CSS width breakpoints

This is the single most important, easy-to-miss fact about how this app
"responds." A full search of `template.html` for `@media` turns up
exactly four rules, and **none of them test viewport width**:

```
@media (prefers-color-scheme: light) { ... }        /* colour, not layout */
@media (hover: hover) and (pointer: fine) { ... }    /* × 3, capability, not size */
@media (prefers-reduced-motion: reduce) { ... }      /* motion, not layout */
```

Layout switching between "mobile" and "desktop" is **not** a fluid,
resize-driven CSS breakpoint. It is a discrete, JS-decided,
user-persisted mode:

```ts
// demo/app.ts:174-182
function detectDefaultLayout(): Layout {
  try {
    const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const isWide = window.innerWidth >= 900;
    return hasMouse && isWide ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
}
```

This runs **once**, on load, only when `localStorage` has no saved
`pricesniffs.layout` preference for that device (`loadLayout()`,
`app.ts:188-197`). It requires **both** a real pointing device (`hover:
hover` and `pointer: fine` — genuinely excludes touch, including a touch
laptop with no mouse attached) **and** `innerWidth >= 900`. After that
first decision, the choice is written to `localStorage` and used on every
subsequent visit regardless of window size — and it is also directly
overridable by the reader at any time via the Settings segmented control
(`.seg-btn[data-set-layout]`, `settingsView()`). **Resizing the browser
window after load does not change the layout** — there is no `resize`
listener anywhere in `app.ts`. This is a deliberate design (comment at
`template.html:106-111`: desktop is "chosen once on first load from a real
device signal... then remembered per visitor once they pick for
themselves"), not an oversight, but it means "responsive" here means
"adapts once, to the device, on first encounter" rather than "adapts
continuously to the viewport," and that distinction should be stated
plainly to anyone extending this system — a new component that assumes a
live `resize`-driven breakpoint will behave differently from everything
else in the app.

The one place actual fluid, width-driven reflow *does* happen is the tile
grid itself, and it uses CSS Grid auto-fill rather than a breakpoint:

```css
/* mobile / narrow layout, template.html:489-493 */
.tile-grid {
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  grid-auto-rows: 1fr; gap: 12px;
}
```

This genuinely does respond continuously to width — as the viewport
narrows or widens, the number of 148px-minimum columns that fit changes
smoothly, no JS involved. It's the mobile/base layout's *only* continuously
responsive layout mechanic; everything else in the mobile layout is a
single fixed column (`--col: 460px`, centred).

### 5.2 The two layouts, concretely

| Aspect | Mobile (`data-layout="mobile"`, default) | Desktop (`data-layout="desktop"`) |
|---|---|---|
| Page width | `--col: 460px`, centred, fixed | `--col: none` — fills the browser window (`template.html:115`) |
| Fragrance grid columns | `auto-fill, minmax(148px, 1fr)` — fluid, however many fit | `repeat(var(--per-row, 5), minmax(0, 1fr))` — a fixed count the reader chooses (3/5/8/10, default 5), equal tracks (`template.html:948-950`) |
| Tiles-per-row control | Not offered — `perRowControl()` returns `''` when `state.layout !== 'desktop'` (`app.ts:414-415`), with the reasoning stated in the commit message: "ten columns on a phone is not a smaller tile but an unusable one" | Offered, via `.control` dropdown |
| Home hero | `.hero-wordmark` 38px | 46px (`template.html:932`) |
| `.intro-points` | Stacked column | 3-column grid, capped at `max-width: 900px` (937-940) |
| `.hero-mission` | No cap beyond `--col` | Capped at `max-width: 640px` even though the page itself runs full width — a full-width line of prose stops being readable, so this opts back into a narrow measure on purpose (comment 933-935) |
| Detail page | Single column, art → head → price → notes → offers, in document order | Two-column CSS grid (`.detail-grid`, 961-965): left column art/head/price/notes, right column offers, **each with its own independent scroll** (`height: calc(100vh - 96px); overflow-y: auto` on both sides, 966-974) rather than one sticky column — this replaced an earlier sticky-hero pattern once the notes block was moved into the hero column and could run long (documented in commit `6e42710`) |
| `.doc` (settings/legal pages) | Full column width | Capped at `640px`, centred — read top-to-bottom, not scanned, so it keeps a comfortable line length rather than stretching page-wide (953-954) |

### 5.3 Touch target sizing

No explicit `min-height`/`min-width` touch-target rule exists anywhere in
the file — sizing is a byproduct of `font-size` + `padding`, computed per
component rather than guaranteed by a shared rule. Approximate rendered
heights (font-size × ~1.5 line-height + vertical padding, both sides):

| Control | Approx. height | Meets 44px (iOS HIG) / 48dp (Material) guidance? |
|---|---|---|
| `.tile` (whole card) | Large (whole grid cell) | Yes, comfortably |
| `.brand-row`, `.shop-row` | ~45–47px+ (shop-row also carries a 42px monogram) | Yes |
| `.navbtn` | ~35–37px (6px padding, 15.5px text) | **Below** guidance |
| `.subnavbtn` | ~33–35px (7px padding, 14px text) | **Below** guidance |
| `.seg-btn` | ~34–36px (8px padding, 13px text) | **Below** guidance |
| `.note-chip` | ~29px (5px padding, 12.5px text) | **Below** guidance (chip pattern, arguably acceptable given density, but still worth naming) |
| `.link-btn` | Line-height only, **no padding at all** (`padding: 0`) | **Below** guidance — the smallest tap target in the app; "See top 50", "Clear" filter, and every legal-page footer link all use this |
| `.dropdown`/`.control` | ~34px pill (8px padding, 13px text) | **Below** guidance |

This is a real, systemic pattern rather than a one-off: the app's whole
visual language is dense and text-scaled, and most secondary controls
land somewhere in the high-20s to mid-30s px range, under the ~44px
target most touch-accessibility guidance recommends for a primary tap
target. `.link-btn` in particular has literally zero padding.

This is not necessarily wrong — Apple's own HIG explicitly allows a
visually smaller control to carry an invisibly larger *hit area* (e.g.
via negative-margin pseudo-elements or padding that doesn't affect visual
size), and a dense, information-forward comparison UI trades some target
size for density on purpose. But no such hit-slop technique is currently
applied anywhere in this file — the visual size **is** the tap target
size today. Flagging as worth an explicit audit/decision (either add
invisible hit-slop to the worst offenders — `.link-btn`, `.note-chip`,
`.subnavbtn` — or consciously accept the smaller targets as a deliberate
density trade-off), not silently fixing it here.

### 5.4 What else changes narrow → wide, summarised

Beyond the grid/hero differences already tabulated in §5.2: `main`
padding goes from `4px 16px 56px` (mobile, fixed) to `padding-inline: 32px`
added on top (desktop, `template.html:930`); `.pop-item` (home rail card)
widens from 172px to 168px, i.e. barely changes (942) — worth noting as
the one desktop override that looks like it may be a leftover from before
a shared value was settled on, since 172→168 is too small a difference to
read as an intentional design choice and close enough that unifying to
one value (whichever measured better) would remove a line of CSS with no
visible cost. Not fixing it here, since it's genuinely marginal and not
clearly a bug — just noting it for completeness since the brief asked for
duplicated values to be flagged.
