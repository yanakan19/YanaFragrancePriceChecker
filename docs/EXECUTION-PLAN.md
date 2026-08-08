# PriceSniffs — Phased Execution Plan (Modules 1–9)

Status: **awaiting per-module approval. No production code written.**

Grounded in an audit of the repo at `a443cfd` (8 Aug 2026), not on assumption.
Every "current state" figure below was measured, not estimated.

---

## Audit findings that change the brief

Five things in the spec do not match this codebase. Reading these first will
save re-work later.

### A. Modules 2.2 and 2.3 describe UI that does not exist here

Measured navigation (`demo/app.ts:38-39`):

- Top nav: **Home · Explore · About · Settings**
- Explore tabs: **Brands · Deals · Retailers · Notes · Search**

There is **no bottom mobile navigation bar**, no **Ranks** tab, no **Blend**
tab, no **Wardrobe**, no **followers/following**, no user profiles and no
profile pictures. A grep for all of these returns nothing outside of product
names that happen to contain the word "Blend".

So 2.2 ("swap Ranks and Blend") and most of 2.3 cannot be *edits* — there is
nothing to edit. They are net-new features, and 2.3 in particular depends
entirely on Module 7 (accounts) existing first. Planned that way below.

### B. Module 1.4 reverses a deliberate legal decision already made in this repo

Two comments in the current code state the position explicitly:

- `demo/app.ts:638` — *"It is text, not a logo: reproducing a retailer's own
  mark is a trademark question this project has no licence to answer."*
- `demo/app.ts:1046` — *"Initials, drawn as a monogram. Deliberately not a
  copy of the shop's logo."*

Module 1.4 asks to extract, reformat, host and display every brand and
retailer logo, with no placeholders. That is rehosting third-party trademarks
at scale, and it contradicts the standard this whole project has been built
on: hotlink-never-rehost, affiliate-first, remove-on-request. It is also the
single highest legal-exposure item in the brief — higher than the scraping
question that reshaped the project back on 1 August.

I will build it if you confirm, and I have planned it in full. But I have also
planned a **lower-risk variant** (1.4-ALT) that gets most of the visual payoff
without rehosting marks. Pick one at approval time.

### C. Module 5.1 has no data to plot yet — but the history is recoverable

Measured: `data/catalogue/*.json` stores **one current price per listing**. No
time series. `runs` arrays hold 24 records total across 17 files, and none of
them carry per-listing prices.

So "plot the price from every crawler run" has nothing to read today. A chart
built now would show exactly one point per fragrance.

**However** — there are **39 harvest commits touching `data/catalogue`, back
to 1 Aug 2026**. Every one is a real, timestamped snapshot of real prices,
sitting in git. That history can be *reconstructed* by replaying those commits,
which yields genuine data points rather than invented ones. This is the
approach I recommend and have planned. It also happens to line up exactly with
the "starting from August 1" you asked for.

### D. Modules 6, 7 and 8 each require a backend. That is one decision, not three

PriceSniffs today is a pure static site on GitHub Pages: no server, no
database, £0 runtime cost, works offline as a PWA. Trustpilot (6), accounts and
wishlists (7), and the LLM proxy (8) all need a server, and 7 needs a database.

This is the largest architectural decision in the brief and it should be made
once, deliberately, before any of the three start. See **Decision Gate 0**.

### E. Two integrations have third-party terms problems

- **Trustpilot (6):** their ratings API is partner/paid-gated. Scraping star
  ratings instead breaches their terms and risks showing a stale rating next to
  a merchant's name, which is a defamation-shaped risk, not just a ToS one.
- **freellmapi (8):** the stated goal is stacking multiple providers' *free
  tiers* behind one endpoint to pool their limits. That is against most
  providers' terms of service. Separately, cloning an unvetted third-party
  proxy into a stack that will later hold user credentials (Module 7) is a
  supply-chain risk worth naming.

Alternatives planned for both. Neither is a refusal — both are your call.

---

## Decision Gate 0 — static, or static + backend?

Answer once; it determines 6, 7, 8 and part of 5.

| Option | What it buys | Cost | Modules unblocked |
|---|---|---|---|
| **Stay fully static** | £0, no ops, no user data to secure or breach | No accounts, no wishlists, no live chat | 1,2(partial),3,4,5,9 |
| **Static + serverless** (recommended) | Accounts, wishlists, chat, live ratings | ~£0–5/mo at this traffic; real auth/GDPR duties | All 9 |
| **Static + full server** | Most control | VPS + maintenance + patching burden | All 9 |

Recommendation: **static + serverless**, with the marketing site staying on
GitHub Pages exactly as it is. Only the dynamic slices move. Concretely:
Supabase (Postgres + auth + email verification + storage for avatars) behind
Cloudflare Workers. Free tiers cover this project's expected load, auth and
email verification are solved problems there rather than things to hand-roll,
and the static site keeps working untouched if the backend is ever down.

---

## Sequencing

Dependency-ordered, not spec-ordered. The spec's order would have us hand-add
brands that the ingestion fix would have supplied for free.

| Phase | Modules | Why here |
|---|---|---|
| 1 | **4** (OG tags) | Half a day, fixes a live public bug, zero dependencies |
| 2 | **1.1** (ingestion audit) | Must precede 1.3/1.4 — determines which brands are genuinely missing vs merely undiscovered |
| 3 | **1.2, 1.3, 1.5** | Taxonomy, brands, Emirates Oud crawler, retailer placeholders |
| 4 | **5.1 backfill + snapshots** | Start accumulating history immediately; every day of delay is a day of chart |
| 5 | **1.4** (logos) | After Decision B |
| 6 | **3** (notes + scrubber), **2.1** | Self-contained frontend work |
| 7 | **9** (admin console) | Makes everything after this easier to operate |
| 8 | **7** (auth) → **2.3** (profile UI) → **6** (Trustpilot) | Gated on Decision Gate 0 |
| 9 | **8** (AI consultant), **5.2** (decanters), **2.2** (bottom nav) | Largest and least certain; last |

---

# MODULE 1 — Catalogue, taxonomy, brands, assets, affiliates

**Sub-agents:** Data Ingestion Analyst · Taxonomy Specialist · Asset Processing Agent

## 1.1 Feed exhaustion audit — *Data Ingestion Analyst*

Measured current state, known listings per retailer:

```
justmylook       1070    allbeauty       116    john-lewis        8
beautybase       1069    lookfantastic    54    selfridges        7
fragrance-click   896    bellavita        24    fragrance-shop    7
oud-arabian       171    boots             9    perfume-shop      7
                         notino-uk         9    superdrug         6
                         harvey-nichols    4    escentual         0
                                                scentstore        0
```

Your instinct is right: Boots at 9 and Selfridges at 7 is not a real number.
Four concrete suspects, all measurable, in likely-impact order:

1. **The page budget is the ceiling, by design.** The workflow passes
   `--max=60`, and `selectUrlsToFetch` reserves 30% of that for refreshing
   prices we already hold. So a shop gains at most ~42 *new* products per run,
   and only if discovery surfaced that many unseen URLs.
2. **Sitemap discovery is capped at 12 fetches** (`crawlViaSitemap` calls
   `discover(options, 12)`). A retailer the size of Boots nests its product
   sitemaps several levels deep behind an index; 12 fetches can plausibly
   expire before ever reaching a fragrance product sitemap.
3. **URL-word matching may be finding nothing.** `discover` prefers URLs
   containing fragrance words, falling back to "any URL inside a
   product-named sitemap". Shops that use bare product IDs in paths satisfy
   neither branch.
4. **Extraction may be silently yielding zero.** Pages can fetch 200 OK and
   still produce no listing if the shop publishes no JSON-LD, or publishes it
   in a shape `parseListings` does not read. Escentual and ScentStore both sit
   at exactly 0 despite confirmed-correct URLs — that signature points here.

**Method.** Instrument rather than guess. Add a diagnostic mode
(`npm run harvest -- --explain --shop=boots`) reporting, per stage: sitemaps
reached, URLs discovered, URLs selected, pages fetched, pages parsed, listings
extracted, and *why* each drop-off happened. Run it against the five worst
retailers. Fix what the numbers actually indict — likely raising the discovery
budget, adding a paginated-listing-page fallback for shops whose sitemaps do
not expose products, and extending `parseListings` to read microdata and
embedded `__NEXT_DATA__`/JSON blobs where JSON-LD is absent.

Also audit the downstream filter: `scripts/build-demo-catalogue.ts` drops
non-fragrances, and 3,457 stored listings currently render as 4,551 demo
products (feeds contribute the difference) — the Analyst will reconcile that
gap explicitly so we know nothing is being silently discarded at the last step.

**Files:** `src/catalogue/sitemapCrawl.ts`, `src/catalogue/jsonld.ts`,
`scripts/catalogue-harvest.ts`, `scripts/build-demo-catalogue.ts`,
`src/config/retailers.ts`, new `docs/INGESTION-AUDIT.md`.

**Deliverable:** the audit doc with before/after counts per retailer. No
guessing — every claim carries a measured number.

## 1.2 Taxonomy rename — *Taxonomy Specialist*

Cheap and contained. `TIER_LABEL` at `demo/app.ts:153` is the single display
source: `mideast: 'Middle Eastern'` → `'Middle Eastern / Dupe Houses'`.

The internal key stays `mideast`. Renaming the key would churn
`RetailerTier`, every retailer record, stored JSON and the router for zero
user-visible gain; the label is the thing you see. Reclassifications
(`Afnan`, `French Avenue`, `Street Origins`, `Maison Asrar`, `Mykonos` →
mideast; `Kayali` → designer; `Amouage` → niche) land in the brand-tier map.

**Files:** `demo/app.ts`, `demo/data.ts`, `src/config/houses.ts`,
`src/types/retailer.ts` (doc comment only), `tests/registry.test.ts`.

## 1.3 Brand additions and universal storefronts — *Taxonomy Specialist*

54 brands listed. First step is a diff against what the catalogue already
knows, because many are certainly present already via the feeds — adding a
duplicate record for a brand the harvest supplies is how the duplicate-brand
bug from 5 Aug happened. Only genuinely absent brands get added.

Every brand gets a Brand Page with its official site link — the mechanism
already exists (`demo/brandSites.ts`, `officialSiteFor`), so this is
populating a verified map, not new architecture. Each link gets checked live
before it ships; a guessed brand URL is worse than none.

**One caveat to flag:** "extracted storefront data" for brands we hold no feed
for would mean crawling brand sites directly. Most designer houses (Chanel,
Dior, Hermès) run no affiliate programme and disallow it. Plan: brand pages
show the official link plus every UK retailer offer we legitimately hold.
Direct-storefront extraction stays limited to houses that permit it — the
`HOUSES` registry already encodes exactly that distinction for 29 houses.

## 1.4 Logos — *Asset Processing Agent* — **NEEDS YOUR DECISION**

**Option 1.4-FULL (as specified).** Source official logos, normalise to a
fixed max height (~28px in tiles, ~44px on brand/retailer pages), convert to
SVG where available and WebP otherwise, self-host under `demo/assets/logos/`,
render with monogram fallback. Delivers exactly what you asked for.
Risk: rehosting ~90 third-party trademarks without licence, reversing this
repo's documented position, on a site that is monetising via affiliate links.

**Option 1.4-ALT (recommended).** Keep marks off our servers. Where a
retailer's *affiliate terms* grant logo use — Awin partners supply logo assets
precisely for this, and Fragrance Click, MyBeauty Boutique and The Beauty Store
UK are already on those terms — use the licensed asset and record the grant in
the registry next to it, the same way `affiliate-terms` already records image
rights. Everywhere else, upgrade the monogram: real brand colour, proper
typography, consistent sizing. Visually cohesive, legally clean, and it keeps
the "the boring detail is the trustworthy detail" line in your own About page
true.

Both options share the same sizing pipeline and fallback logic, so switching
later is cheap. I need your call before this one starts.

## 1.5 Emirates Oud crawler and retailer placeholders — *Data Ingestion Analyst*

Emirates Oud is **not** in the registry today (one passing mention in a comment
at `retailers.ts:1246`). This is a clean build, and a legitimate one: the
GoAffPro ref code means you have an affiliate relationship, so this is
sanctioned data collection, not scraping — the distinction that has governed
this project since day one.

Standard sitemap harvest, plus one addition: append `?ref=YANAKANSIVAKUMAR1`
at URL-build time. It goes in the existing outbound-link layer alongside the
Awin transform, **not** baked into stored URLs — the 5 Aug nested-redirect bug
came from exactly that mistake, and a stored suffix double-appends the moment
anything re-processes the URL. Robots.txt gets checked and obeyed first.

The 29 placeholder retailers become registry entries with `enabled: false`,
real domains, real category URLs where known, and an honest
`NO_AFFILIATE_YET` / `awinPending` status. Their pages, logos and Trustpilot
slots exist and render as "not yet listed" rather than 404 — no invented
listing counts, no fake availability.

**Est:** 1.1 is 2–3 sessions · 1.2 half · 1.3 1–2 · 1.4 1–2 · 1.5 1–2.

---

# MODULE 2 — Navigation and UI polish

**Sub-agents:** Frontend UX Architect · UI Copywriter

- **2.1 "Trending Today"** — ships now. Header under the search bar, backed by
  a real signal (most-stocked / biggest movers from the catalogue), never a
  hardcoded list.
- **2.2 Bottom nav, swap Ranks/Blend** — cannot be done: none of it exists. If
  you want a bottom mobile nav bar plus Ranks and Blend features, that is a
  design conversation, not a swap. Tell me what Ranks and Blend should *do*
  and I will spec them properly.
- **2.3 "My Wardrobe" → "Wardrobe"** — nothing to rename yet; folds into
  Module 7 when accounts exist. **Row-click instead of a View button** is a
  real accessibility improvement and will be built that way (full row as the
  link target, ≥44px touch height, visible focus ring, one tab stop) as part
  of Module 7's profile UI.

**Est:** 2.1 half a session. Rest deferred into 7.

---

# MODULE 3 — Notes engine and iOS-style scrubber

**Sub-agents:** Component Interaction Designer · State Management Engineer

50/50 split: note-group grid on top, alphabetical browse below, sticky A–Z
scrubber pinned right on the bottom half.

The scrubber is the interesting part and the easiest to get wrong:

- `touchstart`/`touchmove`/`touchend` with `document.elementFromPoint` to track
  which letter the finger is over during a drag, plus tap-to-jump.
- `passive: false` only on the strip itself so the drag does not scroll the
  page behind it, and `touch-action: none` scoped to the strip alone.
- Live magnified letter bubble while dragging, mirroring iOS.
- Letters with no notes render dimmed and non-interactive rather than
  vanishing, so the strip does not reflow under the finger mid-drag.
- Hidden on desktop via the existing `:root[data-layout="desktop"]` mechanism —
  and hidden from screen readers there too, not merely `display:none`, with
  the alphabetical list remaining keyboard-navigable as the accessible path.

Note profile modals: focus trap, `Esc` to close, focus restored to the
invoking element, `aria-modal`, and a real URL so a note modal is linkable and
survives Back — this app already routes properly and the modal should not
break that.

**Files:** `demo/app.ts` (notes views), `demo/template.html`, `demo/router.ts`.

**Est:** 2–3 sessions.

---

# MODULE 4 — Open Graph cards

**Sub-agent:** SEO & Meta Tag Specialist

**Root cause confirmed:** `demo/template.html` contains **zero** `og:` or
`twitter:` tags. Nothing is missing or malformed — they were never there. The
black preview is Instagram falling back to nothing.

Fix: full OG and Twitter card set with **absolute** URLs
(`https://pricesniffs.space/...` — relative paths are the classic silent
failure here), a 1200×630 `og-preview.png` generated with Playwright from the
real homepage so it cannot drift from the actual branding, and per-page tags
for fragrance/brand/retailer routes so a shared deep link previews that
product rather than the homepage. Validated against Facebook's Sharing
Debugger and Twitter's Card Validator before it is called done.

**Est:** half a session. **Highest value-per-hour in the brief — recommend
shipping alongside Module 1.**

---

# MODULE 5 — Price history charting and decanters

**Sub-agents:** Data Visualization Architect · CSS Animation Specialist · Routing Engineer

## 5.1 The chart — two parts

**Part A, backfill (the part that makes this real).** Walk all 39 harvest
commits touching `data/catalogue`, read each snapshot, and emit
`data/price-history/<retailerId>.json` as `{listingId: [[iso, pence], ...]}`.
Every point is a real price that was really recorded at that time. Nothing is
interpolated and gaps stay gaps — a shop that was not sampled on a given run
gets no point, not a straight line pretending it held steady.

**Part B, ongoing.** The harvest appends one point per listing per run, so
history grows from here without a second mechanism.

**Rendering.** Hand-rolled inline SVG, not a charting library. The bundle is
already 2.5MB; Chart.js would add ~200KB for one sparkline, and the CSP on the
published artifact blocks external scripts anyway. An SVG polyline with a
`<circle>` per point is maybe 80 lines and fully themeable with the existing
tokens.

Per your spec: live point pulses via CSS keyframes on `r` and `opacity`
(wrapped in `prefers-reduced-motion: reduce` — the repo already respects that
globally and this must not be the exception); every point has a hover and
focus tooltip naming exact price, date and retailer. Touch gets tap-to-pin
since hover does not exist there. Positioned directly beneath the live prices,
above "Not available", as specified.

**Honest limitation to expect:** listings that first appeared recently will
show short lines, and any listing whose stored ID changed across runs will not
match up cleanly across the whole window. The Architect will report actual
coverage (how many fragrances get ≥5 points) rather than shipping a chart that
implies more history than exists.

## 5.2 `/decanters`

New route, same router pattern as `/brands`. Honest blocker up front: we hold
**no decant vendor data at all** today — no 2ml/5ml/10ml sizes, no decant
retailers in the registry. This is a data-sourcing problem before it is a page
problem, so it lands late and starts with identifying vendors and whether they
permit listing.

**Est:** 5.1 is 3–4 sessions · 5.2 is 2+ once data exists.

---

# MODULE 6 — Trustpilot

**Sub-agents:** Third-Party API Integrator · UI Component Specialist

Three routes, in order of preference:

1. **Official Trustpilot Business API** — correct, licensed, keeps ratings
   accurate. Requires a paid Trustpilot plan.
2. **Trustpilot's free embeddable widget** — their own script, their terms,
   zero scraping. Cheapest legitimate option. Downside: it is a third-party
   script, so it will not run inside the CSP-restricted published artifact and
   needs a loading strategy on the main site.
3. **Scraping ratings** — not recommended. Breaches their terms, and a stale
   or wrong star rating displayed next to a named merchant is a real
   reputational and legal risk to *them*, which lands on you.

Recommend starting at (2), upgrading to (1) if it matters. **Note also:**
Trustpilot rates *merchants*, so applying it to brand pages (as 6.1 asks) has
no source — most fragrance houses have no Trustpilot merchant profile. Brand
pages would need a different signal entirely; happy to propose one.

**Est:** 1–2 sessions after Decision Gate 0.

---

# MODULE 7 — Accounts, auth, wishlists

**Sub-agents:** Full-Stack Auth Engineer · Database Architect · Frontend Security Lead

Gated on Decision Gate 0. Assuming Supabase:

**Schema:** `profiles` (id → auth.users, display name, avatar path, created
at) · `wishlists` (user, fragrance id, added at, optional target price) ·
`follows` (follower, followed) if 2.3's social features are wanted.
Row-level security on every table from the first migration, not retrofitted.

**Flows:** email+password signup → verification email → confirmed before
access · password reset · avatar upload to Supabase Storage with type and size
validation and image re-encoding server-side (an uploaded "avatar" is an
arbitrary file until proven otherwise) · protected `/account` route ·
profile-picture click routes to `/account` everywhere.

**Things that must not be skipped:** rate limiting on auth endpoints, no user
enumeration in error copy ("if that address exists, we sent a link"), secrets
never in the client bundle, and a privacy policy update — you now hold personal
data, which brings real GDPR duties including deletion on request. The existing
legal pages were written for a site with no users; they will need revising.

**Est:** 4–6 sessions. Largest single module.

---

# MODULE 8 — AI consultant

**Sub-agents:** LLM Routing Architect · Multi-Agent Orchestrator · Chat UI Developer

**The freellmapi concern, stated plainly.** Pooling several providers' free
tiers behind one endpoint to exceed what any one tier allows is against most
of those providers' terms. Separately, an unvetted third-party proxy sitting in
the same stack as Module 7's user credentials is a supply-chain risk worth
naming out loud. If a provider enforces, the feature dies without warning.

**Alternative:** one provider on a paid key, with a documented fallback. At
realistic traffic (a few hundred chats/month, short answers) that is single-digit
pounds monthly and it cannot be switched off underneath you. The
mixture-of-agents idea still works — run 2–3 *models from the same provider*
in parallel, peer-score, synthesise. Same architecture, same output quality,
no terms problem.

**Mixture-of-agents design** (either way): fan out the same prompt to N models
→ each scores the others' answers blind against grounding, specificity and
usefulness → synthesiser merges the highest-scoring claims → response cites
which parts came from live catalogue data. Critically, the perfume knowledge
must be **grounded in our own catalogue**, not the model's memory: retrieve
matching fragrances from our data and pass them in context, so "Enquire a
Price" returns real prices from our database and not a hallucinated number.
That single constraint is what keeps this consistent with "no invented
numbers".

**UI:** floating bottom-right launcher, focus-trapped panel, `Esc` to close,
streaming responses, quick actions for "Enquire a Price" and "Find a new
Fragrance", full keyboard operation.

**Est:** 5–7 sessions. Recommend last.

---

# MODULE 9 — Offline admin console

**Sub-agent:** DevSecOps Engineer · Local Tooling Developer

`npm run admin` → local-only Express server on `127.0.0.1` (bound to loopback
explicitly, never `0.0.0.0`), serving a small UI over the on-disk catalogue.
Browse feed data, mute/remove/edit brands, retailers and products, with every
mutation written back as an editable overlay file rather than by rewriting
harvested data in place — so the next harvest cannot silently undo your edits,
and every manual override is auditable and reversible.

Genuinely useful earlier than its number suggests: it makes Modules 1.3 and
1.4 far faster to operate. Recommend pulling it forward if 1.x reveals a lot of
hand-correction.

**Est:** 2–3 sessions.

---

## Global verification, every module

Per your requirements, plus what this repo already enforces:

1. `npm run typecheck` — zero errors
2. `npm test` — currently 263 passing across 16 files; must stay green
3. `npm run demo` — builds clean
4. **Typography:** the repo has a documented house style (`demo/app.ts:19-21`)
   — no hyphens, en dashes or em dashes in user-facing copy. Every new string
   gets checked against it.
5. **Accessibility:** keyboard path, visible focus, ≥44px touch targets,
   `prefers-reduced-motion` respected — applied without needing to be asked,
   per your global design directive.
6. New tests alongside new logic, not after.

---

## Decisions needed from you

| # | Decision | Blocks |
|---|---|---|
| 0 | Static, or static + serverless backend? | 6, 7, 8 |
| B | Logos: 1.4-FULL or 1.4-ALT? | 1.4 |
| E1 | Trustpilot: paid API, free widget, or drop? | 6 |
| E2 | LLM: freellmapi as specified, or single paid provider? | 8 |
| — | What should Ranks and Blend actually do? | 2.2 |

Module 1 can start on the answer to **B** alone.
