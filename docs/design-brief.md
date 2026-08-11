# PriceSniffs — design revamp brief

Paste the block below into a Claude Design design-system project. Everything in
it is drawn from the live site, not invented: the palette values are the current
CSS custom properties in `demo/template.html`, and the type roles are the eight
roles inventoried in `docs/typography.md`.

Keep this file updated if the brief changes, so the design work and the repo
never drift apart.

---

## The prompt

> **Project: PriceSniffs — visual redesign of a UK fragrance price-comparison site**
>
> I want a complete visual revamp of an existing, working site. Build me a design
> system I can implement: tokens first, then components. Do not redesign the
> information architecture or invent new pages — the structure is settled and
> staying. This is a re-skin at a high level of craft, not a re-think.
>
> **The product.** pricesniffs.space compares fragrance prices across UK
> retailers. A visitor searches a bottle, sees every shop that sells it ranked by
> delivered price, and clicks through to buy. Pages: home (with a deals rail and
> an update history), an explore/browse grid, fragrance detail (price history
> chart, notes pyramid, available-at / not-available-at lists), brand pages,
> retailer pages, and settings/legal. Dense, data-heavy, mobile-first. It must
> read as trustworthy — people are making a purchase decision on these numbers.
>
> **Aesthetic direction.** Modern and futuristic, but clean and quiet rather than
> loud. Precision instrument, not neon cyberpunk. Generous negative space,
> confident type hierarchy, restrained use of the accent colour so it still means
> something when it appears. Smooth, purposeful motion — transitions that explain
> what just happened rather than decorate.
>
> **Colour — a hard constraint.**
> - Dark mode: **black and red**. True near-black grounds, red as the single
>   accent.
> - Light mode: **white and red**. Near-white grounds, the same red family,
>   darkened for contrast on light.
> - Red is the *only* accent. No secondary hue, no gradients between hues.
>   Neutrals do all the other work.
>
> For reference, the current palette is warmer and greyer than this and should
> move toward true black/white:
>
> | Token | Current dark | Current light |
> |---|---|---|
> | `--bg` | `#3A353C` | `#F3F1F2` |
> | `--surface` | `#47414A` | `#F8F6F7` |
> | `--surface-2` | `#524B55` | `#F0EDEF` |
> | `--ink` | `#F5F1F4` | `#17141A` |
> | `--ink-2` | `#CFC8CF` | `#55505A` |
> | `--faint` | `#A79DA8` | `#8A838F` |
> | `--line` | `#5A535D` | `#E7E3E7` |
> | `--line-firm` | `#6B6370` | `#D3CDD3` |
> | `--accent` | `#E8434C` | `#C62630` |
> | `--accent-on` | `#FFFFFF` | `#FFFFFF` |
> | `--accent-sf` (accent surface) | `#3A1519` | `#FCEDEE` |
> | `--bg-glass` | `rgba(58,53,60,.86)` | `rgba(243,241,242,.86)` |
>
> Give me a replacement value for **every** token above, keeping the same token
> names so they drop into the existing stylesheet. Add new tokens only where the
> design genuinely needs them, and name each one by role.
>
> **Typography — preserve the role structure exactly.** The site already has a
> defined set of text roles. Restyle them, but do not add, remove or merge roles,
> because every one is load-bearing in the markup:
>
> 1. **Page titles** — the h2 at the top of a view
> 2. **Section headings** — headings that introduce a block within a page
> 3. **Card / tile / row titles** — the name of a fragrance, brand or shop in a list
> 4. **Body copy** — paragraphs, descriptions, legal text
> 5. **Eyebrow / micro labels** — small uppercase labels above a group
> 6. **Captions and secondary meta** — the quiet grey line under a title
> 7. **Counts and numeric badges** — "1,204 fragrances", note counts
> 8. **Prices** — the number itself, in tiles and on detail pages
>
> These roles are currently inconsistent — the same role is implemented at
> several different sizes and weights across the site. Part of what I want from
> you is **one canonical size, weight, letter-spacing and colour token per role**,
> applied everywhere, so the drift is resolved rather than restyled. Specifically:
> the eyebrow/micro-label role is currently spread across 9.5–11.5px with eight
> different letter-spacing values; the card/row-title role has one size at four
> different weights; and there are three competing section-heading treatments.
> Collapse each of those into a single decision and state it explicitly.
>
> Use a system font stack, not a downloaded webfont — the whole site ships as a
> single self-contained HTML file and cannot fetch external assets.
>
> **Motion.** Specify a small, reusable motion vocabulary rather than per-element
> animations: standard durations and easing curves, what enters and how, what
> transitions on theme switch, hover/press feedback, and how list items stagger
> when a filter changes. Every motion spec must have a
> `prefers-reduced-motion: reduce` fallback. Motion must never delay someone
> reading a price.
>
> **Non-negotiables.**
> - Both themes must be fully specified. Light mode is not an afterthought.
> - Text must meet WCAG AA contrast in both themes; tell me the ratio for each
>   text-on-background pair you define.
> - Pure CSS. No JS-driven animation libraries, no external stylesheets, no
>   remote fonts or images.
> - Mobile-first; it must hold up from 360px to wide desktop.
> - Dense data must stay scannable. If a choice trades legibility of a price for
>   visual interest, legibility wins.
>
> **Deliver, in this order:**
> 1. A token sheet — every custom property, both themes, with the contrast ratios.
> 2. A type scale mapping each of the eight roles above to exact values.
> 3. A motion spec.
> 4. Components as individual preview files: buttons, form controls, the
>    search field, a fragrance tile, a retailer row, the price box, tabs/segmented
>    controls, chips/filters, the notes pyramid, the price-history chart frame,
>    section headers, and the bottom navigation.
> 5. One full-page mock each for home, browse and fragrance detail, in both
>    themes, assembled only from the components above.
>
> Start with the token sheet and the type scale, and stop for my review before
> building components.

---

## How to run it

**1. Open Claude Design.** Go to `claude.ai/design` and create a new project.
It must be created as a **design-system** project — that type is fixed at
creation and cannot be changed afterwards, so a regular project will not work
for syncing later.

**2. Paste the prompt above** and let it produce the token sheet and type scale
first. Review those two before letting it build components — everything
downstream inherits them, and correcting a token later means regenerating every
component that used it.

**3. Iterate on components.** Ask for revisions in place rather than
regenerating wholesale, so the parts you have approved stay stable.

**4. Bring it back into the repo.** In Claude Code, run `/design-sync` and point
it at the project. That skill syncs a component library against the Claude Design
project incrementally, one component at a time.

**5. Apply it to the site.** This is a separate step and worth being clear-eyed
about: the live site is not a component library. All of its CSS lives in one
hand-written `<style>` block in `demo/template.html`, and the markup is generated
by `demo/app.ts`. So the design system is the *source*, and translating it into
that stylesheet — token by token, role by role — is implementation work in this
repo, not something the sync performs by itself. Doing it in that order is the
point: the tokens and the eight type roles are what make the translation
mechanical rather than a redesign-by-hand.

**Do the typography consolidation first.** `docs/typography.md` lists seven
specific inconsistencies (section "Inconsistencies found"). Resolving those
against the new type scale before restyling anything else means each role is
changed in one place instead of the four or five places it is currently
duplicated across.
