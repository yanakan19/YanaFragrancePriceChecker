# PriceSniffs — Information Architecture & SPA Routing Blueprint

Status: **specification only, nothing in this document has been implemented.**
Scope: `demo/app.ts` (the single-file client), deployed as one self-contained
`index.html` to GitHub Pages (static hosting, no server, no rewrites).

Every claim below about current behaviour was checked against the source
files listed at the end of this document, not assumed.

---

## 0. Ground truth (what exists today)

Read directly from `demo/app.ts`, `demo/template.html`, `demo/sw.js`,
`.github/workflows/deploy-pages.yml`, `demo/catalogue.generated.ts`,
`demo/data.ts`, `demo/legal.ts`, `src/config/retailers.ts`,
`demo/manifest.webmanifest`.

- **No routing exists.** `state.view: View` and `state.tab: ExploreTab` are
  plain in-memory fields (`app.ts:57-80`). `go()` and `openExplore()`
  (`app.ts:1152-1161`) only mutate `state` and call `render()`. Nothing ever
  touches `location`, `history`, or a hash. The browser Back button does
  nothing inside the app; it leaves the page entirely.
- **One HTML document, no server.** `scripts/build-demo.ts` inlines the
  bundled JS into `demo/template.html` to produce `demo/index.html`. That is
  the only page GitHub Pages serves — `deploy-pages.yml` uploads the whole
  `demo/` directory (`index.html`, `sw.js`, `manifest.webmanifest`, icons,
  `CNAME` = `pricesniffs.space`) as-is via `actions/upload-pages-artifact`.
  There is no build step that emits one HTML file per route today.
- **Service worker is network-first for navigations** (`demo/sw.js:39-50`):
  every `mode: 'navigate'` request goes to the network first and only falls
  back to the cached `./index.html` when the network fails. Non-navigation
  requests (assets) are cache-first. This matters directly for the deep-link
  fix (§3).
- **Views today:** `home | explore | browse | detail | retailer | brand |
  note | legal | settings` (`app.ts:36`). Explore has sub-tabs `brands |
  deals | retailers | houses | notes | search` (`app.ts:37`).
- **Data shapes that decide slug rules** (verified against
  `demo/catalogue.generated.ts` and `demo/data.ts` by actually loading and
  inspecting the generated arrays, not guessing):
  - `CATALOGUE.length === 1772`, all ids unique. Every id is either
    `ean-<digits>` (from the product's EAN) or `<retailer-id>-<sku>`
    (fallback for listings with no EAN, e.g. `justmylook-acq0001`) —
    already lower-case, hyphenated, URL-safe. **No slugification needed for
    fragrance ids**, they can be used as the URL segment verbatim.
  - `HOUSE_PRODUCTS.length === 336`, ids like `armaf-7859` — also already
    URL-safe, and product-level (not house-level).
  - House names are exactly two values: `"Armaf"` and `"French Avenue"`.
  - `RETAILERS` in `src/config/retailers.ts` has **13** entries, every `id`
    already a clean kebab-case slug (`allbeauty`, `justmylook`, `notino-uk`,
    `boots`, `the-fragrance-shop`, `the-perfume-shop`, `john-lewis`,
    `beautybase`, `lookfantastic`, `superdrug`, `selfridges`,
    `harvey-nichols`, `fragrance-click`). **No slugification needed for
    retailer ids either.**
  - `LEGAL_PAGES` in `demo/legal.ts` has 5 entries, ids already slugs:
    `how-it-works`, `affiliate`, `privacy`, `terms`, `contact`.
  - **Brand names are not clean** — see §2.2, this is a real landmine.
  - **Note names are 120 distinct strings**, mostly clean; two carry a
    stray middot artifact from extraction (`"Petitgrain ·"`,
    `"Tuberose ·"`). No case collisions among the 120. These need
    slugification (§2.2) since they contain spaces and one has a
    non-alphanumeric character.

- **A dead field found while reading `app.ts`:** `state.brand` (`app.ts:65`,
  distinct from `state.brandProfile`) is read in three places
  (`visibleFragrances`, `browseView`'s title, the "Filtered to X · Clear"
  line in `searchPanel`) but **is never assigned a non-null value anywhere
  in the file.** It is set to `null` three times (`goHome`, the
  `data-browse` handler, `data-clear-brand`) and never set to a string. This
  is vestigial state from a removed "filter search results by brand" chip.
  It should not be carried into the URL scheme as-is; see §1.2 and §6.

---

## 1. Information architecture

### 1.1 Section tree

```
Home                                    /
├─ Brands (directory)                   /brands
│  └─ Brand profile                     /brands/:brandSlug
├─ Deals                                /deals
├─ Retailers (directory)                /retailers
│  └─ Retailer profile                  /retailers/:retailerId
├─ Houses (directory, non-comparison)   /houses
│  └─ House group (anchor, not a page)  /houses/:houseSlug
├─ Notes (directory)                    /notes
│  └─ Note detail                       /notes/:noteSlug
├─ Search / most-stocked list           /search
├─ Fragrance detail                     /fragrance/:id
├─ Settings                             /settings
└─ Legal                                /legal/:pageSlug
```

This is the same two-tier promise the code comment at the top of `app.ts`
already states in prose ("Nothing is ever more than two taps from Home") —
the routing design keeps that invariant literally true of the URL depth
too: every URL is either depth 1 (`/brands`) or depth 2
(`/brands/dior`), nothing deeper.

`Explore` itself stops being a URL segment. Today it is a `View` value
(`state.view === 'explore'`) that exists only to host the sub-tab switcher;
under real routing each sub-tab becomes its own top-level path
(`/brands`, `/deals`, `/retailers`, `/houses`, `/notes`, `/search`) and the
sub-tab bar (`#subnav`, `app.ts:1136-1145`) is driven by *which section the
current URL belongs to*, not by a `state.view === 'explore'` check. This is
a rename of the URL surface only — the same `#subnav` markup, the same six
tabs, the same panels — `exploreView()`'s dispatch on `state.tab`
(`app.ts:939-953`) does not need to change internally, only what sets
`state.tab` does.

### 1.2 Where the current structure is weak

1. **`browse` vs `explore > search` is one feature wearing two URLs' worth
   of UI**, and today it doesn't even have URLs to tell them apart —
   only in-memory state does.
   - The top bar's quick-search input (`#search`, wired at
     `app.ts:1173-1177`) sets `state.query` and jumps to the full-page
     `browse` view.
   - `browse` (`browseView()`, `app.ts:475-494`) is *also* what "See top
     50" on Home opens (`data-browse`, unfiltered, capped list titled
     "Most stocked") and what a non-empty top-bar query renders (titled
     `Results for "…"`).
   - `explore > search` (`searchPanel()`, `app.ts:906-926`) is a
     **different, parallel** UI for conceptually the same query: its own
     big search input, live-updated via a dedicated `input` listener
     (`app.ts:1279-1295`) that patches `.search-results` in place instead
     of calling `go()`, so it never leaves the `explore` view or touches
     the URL bar even in spirit.
   - Both read `visibleFragrances()` (`app.ts:466-473`), which filters on
     `state.query` and the never-set `state.brand`. They are the same
     result set rendered by two different shells with two different Back
     targets (`data-back-home` vs the subnav).
   - **Recommendation:** collapse both into one canonical route, `/search`.
     No `q` → today's "Most stocked" top-50 ranking (what `browseView()`
     shows when `isTop` is true). `?q=…` → today's results list. The
     top-bar quick-search becomes "always writes to `/search?q=…`,
     wherever you currently are" (see §5's search-typing row); the
     Explore tab strip keeps a `Search` tab that *is* `/search` rather than
     a second implementation of the same list.
2. **`state.brand` is dead code** (§0). Before wiring a `?brand=` query
   param onto `/search` (as sketched in the target URL map), someone needs
   to decide what it was for and either resurrect the intended interaction
   (a brand-filter chip on search results) or drop the field. Routing
   should not invent behaviour for a parameter nothing currently sets.
3. **Houses has no detail view to route to.** `housesPanel()`
   (`app.ts:972-1020`) renders both houses inline as `<section
   class="house-group">` blocks on one page; every product card links
   straight out to the house's own storefront (`target="_blank"`, real
   external URL). There is no internal "one house's page" the way
   `retailerView()` or `brandView()` exist for retailers and brands. §2.3
   treats `/houses/:houseSlug` as a same-page anchor for this reason, not
   a new page — inventing a house detail view is out of scope for a
   routing spec.
4. **`brand` (profile) and the dead `state.brand` filter are two
   different concepts that share the English word "brand".** `brandView()`
   is the org-hero profile page reached from the Brands directory
   (`data-brand`, sets `state.brandProfile`). The dead `state.brand` field
   was clearly meant to be a *narrower* filter layered on top of search
   results, not the same thing. Keep these conceptually and, once wired,
   structurally separate: `/brands/:slug` is the profile;
   `/search?brand=X` (if resurrected) is a filter on the general list.
5. **Sort/filter selections are UI state with no representation
   anywhere** (`brandSort`, `brandFilter`, `dealSort`, `noteSort`,
   `noteLayer`, `*DetailSort`, `*DetailFilter` — ten fields in `state`).
   None of them currently survive a reload or are shareable. §4.4 makes
   these optional query params with sane defaults, added via
   `replaceState` so choosing a sort never grows history.

---

## 2. URL map

### 2.1 Table

| URL | View state it maps to | Renders (existing function) |
|---|---|---|
| `/` | `view:'home'` | `homeView()` |
| `/search` | `view:'explore', tab:'search'` (see §1.2 — this *is* the merged browse/search) | `browseView()`/`searchPanel()` merged, see §1.2 |
| `/search?q=aventus` | same, `state.query = 'aventus'` | — |
| `/search?brand=…` | same, `state.brand` (**currently dead**, §1.2 item 2) | — |
| `/brands` | `view:'explore', tab:'brands'` | `brandsPanel()` |
| `/brands/:brandSlug` | `view:'brand', state.brandProfile = <brand name>` | `brandView()` |
| `/deals` | `view:'explore', tab:'deals'` | `dealsPanel()` |
| `/retailers` | `view:'explore', tab:'retailers'` | `retailersPanel()` |
| `/retailers/:retailerId` | `view:'retailer', state.retailerId` | `retailerView()` |
| `/houses` | `view:'explore', tab:'houses'` | `housesPanel()` |
| `/houses/:houseSlug` | same as `/houses`, plus scroll to `#house-<slug>` (§1.2 item 3 — not a distinct view) | `housesPanel()` + scroll |
| `/notes` | `view:'explore', tab:'notes'` | `notesPanel()` |
| `/notes/:noteSlug` | `view:'note', state.noteName = <note string>` | `noteView()` |
| `/fragrance/:id` | `view:'detail', state.fragranceId` | `detailView()` |
| `/settings` | `view:'settings'` | `settingsView()` |
| `/legal/:pageSlug` | `view:'legal', state.legalId` | `legalView()` |
| *(anything unmatched)* | 404 → redirect to `/` (see §3) | `homeView()` |

Optional query params, all non-load-bearing (safe defaults exist, never
required to reach content), written via `replaceState` only (§4.4):

`brandSort`, `brandFilter` on `/brands` · `dealSort` on `/deals` ·
`noteSort`, `noteLayer` on `/notes` · `sort`, `filter` on
`/brands/:slug`, `/retailers/:id`, `/notes/:slug` (mapping to the four
`*DetailSort`/`*DetailFilter` state pairs) · `perRow` — **not** put in the
URL; it is a device preference (already persisted to `localStorage` under
`PER_ROW_KEY`) not page content, so it stays local-only, same as `mode`
and `layout`.

### 2.2 Slug generation rules

**Fragrance ids, house-product ids and retailer ids need no
transformation** — verified above, they are already lower-case,
hyphen-separated and ASCII. Use them verbatim as URL segments.

**Note names need real slugification** (120 distinct values, spaces and
one punctuation artifact):

```
slugifyNote(name) =
  name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')   // "Petitgrain ·" -> "petitgrain-"
      .replace(/^-+|-+$/g, '')       // -> "petitgrain"
```
Checked against all 120 real note strings from `NOTE_INDEX`: zero
collisions. To resolve `/notes/:slug` back to the exact string
`fragrancesWithNote()` expects (`data.ts:201-208`, an exact
`.toLowerCase()` match), build the slug→original map once at startup by
running this function over `NOTE_INDEX` and keeping the first (only)
original for each slug — do not try to reverse the slug algorithmically.

**Brand names are the one place slugification is genuinely risky**, and
this was verified by running a standard slugify function over the real 144
distinct brand strings in `CATALOGUE`, not assumed:

```
slugifyBrand(name) =
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '')  // strip accents
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
```

Running that over the real catalogue produces **11 collisions** out of 144
brands — i.e. distinct strings in `CATALOGUE` that the app today treats as
different brands (exact string equality throughout `data.ts` and `app.ts`)
collapse onto the same slug:

| slug | colliding source strings |
|---|---|
| `estee-lauder` | "Estée Lauder", "Estee Lauder" |
| `hugo-boss` | "HUGO BOSS", "Hugo Boss" |
| `dolce-and-gabbana` | "Dolce & Gabbana", "Dolce&Gabbana", "DOLCE&GABBANA" |
| `givenchy` | "Givenchy", "GIVENCHY" |
| `gucci` | "GUCCI", "Gucci" |
| `joop` | "JOOP!", "Joop", "Joop!" |
| `lancome` | "Lancôme", "Lancome" |
| `afnan` | "Afnan", "AFNAN" |
| `creed` | "Creed", "CREED" |
| `dsquared2` | "Dsquared2", "DSquared2" |
| `hermes` | "Hermes", "Hermès" |

This is a pre-existing **data-quality bug**, not something routing
introduces: `BRANDS` (`app.ts:99`) already lists these as separate rows in
the Brands directory today (`"Dolce & Gabbana"`, `"Dolce&Gabbana"` and
`"DOLCE&GABBANA"` are three different buttons a reader can click, each
showing a different subset of Dolce & Gabbana's own products). Slugifying
naively would either silently merge three directory entries into one URL
(masking the bug, and only two of the three brand strings would still be
reachable) or, if the merge is refused, produce broken 404s for whichever
brand loses the collision.

**Decision for the routing layer:** do not try to fix the underlying
catalogue duplication here — that is a data pipeline task
(`scripts/build-demo-catalogue.ts` / brand normalisation), out of scope for
this spec. The router's job is only to make every existing brand string
reachable by a stable URL:

```
slugMap = new Map()
for (brand of BRANDS sorted for determinism) {
  base = slugifyBrand(brand)
  slug = slugMap.has(base) ? `${base}-${countOfBaseSoFar + 1}` : base
  slugMap.set(brand, slug)          // brand -> slug, for generating links
  reverseMap.set(slug, brand)       // slug -> brand, for resolving a URL
}
```
So `/brands/dolce-and-gabbana`, `/brands/dolce-and-gabbana-2`,
`/brands/dolce-and-gabbana-3` — ugly, but stable (sorted order is
deterministic build-to-build as long as `BRANDS`'s source order doesn't
change) and never loses a reachable brand. Flag this in the PR that
implements it: the real fix is normalising brand casing/formatting once at
the catalogue-build step (`demo/data.ts` or the harvester), which would
make this whole disambiguation table unnecessary.

**Legal page ids and house names** are already-known, already-clean, small
enumerations (5 and 2 respectively) — hand-map them, no slugify function
needed: `LEGAL_PAGES` ids are used as-is; houses become `armaf` and
`french-avenue` (the latter via the same `slugifyBrand`-style space→hyphen
rule, trivially, with no collision risk given only two values).

### 2.3 Houses is an anchor, not a page

Per §1.2 item 3, `/houses/:houseSlug` does not correspond to a distinct
`render()` branch. It resolves to the same route as `/houses`
(`view:'explore', tab:'houses'`) and, after render, calls
`document.getElementById('house-' + houseSlug)?.scrollIntoView()`. This
requires `housesPanel()` to grow an `id="house-${slugifyBrand(house)}"` on
each `.house-group` section — a one-line change, not a new view.

---

## 3. The static-hosting deep-link problem

**The problem, concretely:** GitHub Pages serves files from disk. A
visitor who requests `https://pricesniffs.space/brands/dior` directly (a
bookmark, a shared link, a search-engine crawl) gets Pages' actual 404
response, because no file exists at that path — there is exactly one file,
`index.html`, at the root, per `deploy-pages.yml`'s `path: demo` upload.
`pushState`-only routing only rewrites the URL for navigations that
*originate inside* the already-loaded app; it does nothing for the initial
HTTP request.

### 3.1 The three standard options

**(a) 404.html redirect trick.** Add `demo/404.html` that GitHub Pages
serves for any unmatched path. It captures the requested path and either
(i) `location.replace('/?p=' + encodeURIComponent(path))` and has the real
`index.html` read that `?p=` param and call `history.replaceState` to
restore the clean URL once the app boots, or (ii) more simply, since this
app is client-rendered anyway, just re-issue the *same* path back to
`index.html`'s content directly. The well-known version of this
(spa-github-pages) round-trips through a query string; a simpler variant
here: since `404.html` and `index.html` can be **byte-identical** (both are
just the shell + bundle — `demo/index.html` already *is* the whole app),
GitHub Pages can literally serve the same file for both. No redirect,
no query-string relay, no flash of a different page. The router's own
`popstate`/boot-time route match then reads `location.pathname` and
renders directly. This works because the app has no server-rendered
content to differ between the two entry points — the entire page is one
client-side bundle either way.

**(b) Hash routing** (`#/brands/dior`). Everything after `#` is never sent
to the server, so `index.html` is always what loads, at any depth, with
zero extra files and zero 404 configuration. Cost: URLs are permanently
uglier (`pricesniffs.space/#/brands/dior`), and — the sharper cost for this
project — **search engines and most link-preview/social-card scrapers do
not index content that only exists behind a `#` route**; Google stopped
supporting the old `#!` escaped-fragment convention years ago and
generally will not render fragment-only routes distinctly. For a price
comparison site whose entire value proposition is being *found* for
"[brand] price UK", losing per-brand and per-fragrance indexability is a
real cost, not a cosmetic one.

**(c) Pre-rendering a static file per route.** Generate
`brands/dior/index.html`, `fragrance/ean-.../index.html`, etc. at build
time — genuinely real files, so no 404 trick is needed at all and it's the
best possible SEO outcome (each URL is real, crawlable, server-rendered
HTML). Cost: at this catalogue's scale — **144 brand pages + 1772
fragrance pages + 13 retailer pages + 120 note pages ≈ 2000+ generated
HTML files**, each currently ~1.1 MB today's single `index.html` is
(because the entire bundle, including all 1772 products' data, is inlined
into every page — see `scripts/build-demo.ts`, there is one bundle, no
route-level code splitting). Multiplying that by 2000 files is a multi-GB
build artifact and a real regression from "one self-contained HTML
document" as an explicit design goal stated in `app.ts`'s own header
comment ("Bundled unchanged, so the demo cannot drift from what ships").
Making this viable would require splitting the data bundle out of the HTML
shell first (a genuinely bigger architectural change than routing), so
it's not a same-sprint option even though it's the "correct" long-term
answer.

### 3.2 Decision: (a), the identical-file 404 trick — with a path to (c) later

Serve `demo/404.html` as a copy of `demo/index.html` (the build script can
just write both files with the same content, the same way it already
writes both `demo/index.html` and `dist-demo/artifact.html` from one
`body` string). No query-string relay, no extra redirect hop, no visible
flash — GitHub Pages' 404 handler and the normal `/` request literally
serve the same bytes, and the in-page router (§4) takes it from there by
reading `location.pathname` on boot exactly the same way it does for a
same-app navigation.

Reasoning, weighed directly against the alternatives:

- Against (b) hash routing: preserves clean, indexable, shareable URLs —
  the entire point of adding routing to a price-comparison site is that
  `/brands/dior` and `/fragrance/ean-xxxx` are things people can find via
  search and share via link preview. A hash route can't do either well.
- Against (c) pre-rendering: ships this sprint without first splitting the
  data bundle out of the HTML shell, which is real, separate,
  higher-risk work. (a) is the only option that fits inside "design the
  routing, don't rewrite the app" from this task's brief.
- Cost accepted: a **crawler that respects standard HTTP status codes and
  nothing else** technically receives a 404 status for `/brands/dior`
  (Pages always returns 404 for the custom-404-page mechanism, it just
  also returns content). Googlebot in particular has explicitly said for
  years that it treats 404-status pages with substantial content as soft
  errors and generally still avoids indexing them reliably. **This is the
  real, honest tradeoff of option (a) and it is not free** — it is
  materially worse for SEO than (c), just cheaper to ship now. If organic
  search traffic to individual brand/fragrance pages becomes a stated
  product goal, (c) (or a hybrid: pre-render only the ~2000 leaf pages
  with a trimmed per-page data slice, keep `/` as the full interactive
  app) should be revisited — flagged here as a deliberate, named,
  short-term tradeoff, not an oversight.
- **Service worker interaction:** `demo/sw.js`'s navigate handler
  (`fetch(event.request).then(...).catch(() => caches.match('./index.html'))`)
  is unaffected by this choice as long as `404.html` and `index.html`
  stay byte-identical — an offline visitor navigating to any in-app route
  falls back to the cached shell either way, and the shell contains the
  full router and full data, so it renders the requested route correctly
  from cache. No change needed to `sw.js` itself. One thing to add:
  `sw.js`'s `SHELL` precache list (`app.ts` — actually `sw.js:13-20`)
  should **not** be expanded to include deep-link paths (`./brands/dior`
  etc.) — there's nothing there to precache, they're not real files, and
  attempting `cache.addAll()` on a nonexistent server path is exactly the
  kind of thing that fails `install` for the whole worker.

---

## 4. Router design

### 4.1 Route table (pattern matching, not a framework)

A tiny ordered array of `{ pattern, toState }` pairs, checked top to
bottom, first match wins — no dependency needed for ~14 static routes.

```ts
type RouteMatch = { view: View; tab?: ExploreTab; params: Record<string,string> };

const ROUTES: { pattern: RegExp; keys: string[]; build: (p: Record<string,string>) => Partial<typeof state> & { view: View } }[] = [
  { pattern: /^\/$/,                      keys: [],           build: () => ({ view: 'home' }) },
  { pattern: /^\/search\/?$/,             keys: [],           build: () => ({ view: 'explore', tab: 'search' }) },
  { pattern: /^\/brands\/?$/,             keys: [],           build: () => ({ view: 'explore', tab: 'brands' }) },
  { pattern: /^\/brands\/([^/]+)\/?$/,    keys: ['slug'],     build: (p) => ({ view: 'brand', brandProfile: resolveBrandSlug(p.slug) }) },
  { pattern: /^\/deals\/?$/,              keys: [],           build: () => ({ view: 'explore', tab: 'deals' }) },
  { pattern: /^\/retailers\/?$/,          keys: [],           build: () => ({ view: 'explore', tab: 'retailers' }) },
  { pattern: /^\/retailers\/([^/]+)\/?$/, keys: ['id'],       build: (p) => ({ view: 'retailer', retailerId: p.id }) },
  { pattern: /^\/houses\/?$/,             keys: [],           build: () => ({ view: 'explore', tab: 'houses' }) },
  { pattern: /^\/houses\/([^/]+)\/?$/,    keys: ['slug'],     build: (p) => ({ view: 'explore', tab: 'houses', scrollTo: 'house-' + p.slug }) },
  { pattern: /^\/notes\/?$/,              keys: [],           build: () => ({ view: 'explore', tab: 'notes' }) },
  { pattern: /^\/notes\/([^/]+)\/?$/,     keys: ['slug'],     build: (p) => ({ view: 'note', noteName: resolveNoteSlug(p.slug) }) },
  { pattern: /^\/fragrance\/([^/]+)\/?$/, keys: ['id'],       build: (p) => ({ view: 'detail', fragranceId: p.id }) },
  { pattern: /^\/settings\/?$/,           keys: [],           build: () => ({ view: 'settings' }) },
  { pattern: /^\/legal\/([^/]+)\/?$/,     keys: ['slug'],     build: (p) => ({ view: 'legal', legalId: p.slug }) },
];
// No match -> notFound() -> redirect('/', { replace: true })
```

Query params (`?q=`, `?sort=`, …) are parsed separately from
`location.search` after the path match, merged onto the same partial-state
object — they never participate in path matching itself.

### 4.2 Core functions

```ts
/** Path (+ query) the app is currently showing, or should show for a given
 *  state — the two directions of the same mapping, kept as one pair of
 *  pure functions so they can't drift from each other. */
function urlFor(view: View, s: typeof state): string { /* inverse of ROUTES.build, table-driven the same way */ }
function stateFromUrl(path: string, search: string): Partial<typeof state> & { view: View } { /* match ROUTES, fall back to home */ }

/** Every in-app navigation goes through this — replaces go()/openExplore(). */
function navigate(path: string, opts: { push?: boolean; scroll?: boolean } = {}): void {
  const { push = true, scroll = true } = opts;
  const matched = stateFromUrl(path, new URL(path, location.origin).search);
  Object.assign(state, matched);               // same mutation shape go() already does
  render();
  const url = path;
  if (push) history.pushState({ view: state.view }, '', url);
  else history.replaceState({ view: state.view }, '', url);
  if (scroll) restoreScroll(matched);
  focusMain();
}

window.addEventListener('popstate', (e) => {
  // Back/forward: the URL has already changed, just resync state + render.
  // Never push here — that would fight the browser's own history stack.
  const matched = stateFromUrl(location.pathname, location.search);
  Object.assign(state, matched);
  render();
  restoreScroll(matched, e.state);
  focusMain();
});
```

`go(view)` and `openExplore(tab)` become thin wrappers that compute the
canonical path for the target state and call `navigate(path)` — every
existing `data-*` click handler in `init()`'s delegated listener
(`app.ts:1191-1277`) keeps calling `go('detail')` etc., they just resolve
to a URL now. This is the low-risk seam described in §6.

### 4.3 Scroll restoration

`history.scrollRestoration = 'manual'` set once at boot (otherwise the
browser's own automatic restoration on `popstate` races the app's
`render()`, which replaces `#view`'s content and would leave the browser
trying to restore a scroll offset against DOM that has already been torn
down and rebuilt).

- **Forward navigation** (`push: true`): always scroll to top — this is
  what `go()` already does today (`window.scrollTo({ top: 0 })`,
  `app.ts:1155`), keep it.
- **Back/forward navigation** (`popstate`): restore the scroll offset the
  page had when the user left it. Store `{ scrollY }` in the state object
  passed to `pushState`/`replaceState` (already threading `history.state`
  through above) — `history.state.scrollY` is populated on the way *out*
  of a page (a `scroll`-end listener updates the current history entry's
  state via `history.replaceState({ ...history.state, scrollY:
  window.scrollY }, '', location.href)`, throttled), and read back on the
  way *in* via `popstate`'s own `event.state`.
- **`/houses/:slug`**: scroll-to-anchor overrides the above — after
  `render()`, scroll the named house group into view instead of to either
  the top or a restored offset.

### 4.4 Query-string state: debounce + replaceState, never pushState

Two different inputs write `state.query` today (`app.ts:1173-1177` and
`1279-1295`) and both currently just mutate state + re-render with no URL
at all. Under routing:

```ts
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

function onSearchInput(value: string): void {
  state.query = value;
  // If we're not already on /search, get there first — a real navigation,
  // pushed once, so Back from a fresh search lands where the user actually
  // came from rather than mid-keystroke on the previous route.
  if (state.view !== 'explore' || state.tab !== 'search') {
    navigate(urlFor('explore-search', state), { push: true, scroll: false });
  }
  renderSearchResultsOnly();  // exactly today's in-place patch, app.ts:1286-1294, no full render()
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const url = `/search${state.query ? `?q=${encodeURIComponent(state.query)}` : ''}`;
    history.replaceState({ view: 'explore', tab: 'search' }, '', url);
  }, 400);
}
```

The 400ms debounce means keystrokes never touch `history` individually —
only the URL bar's *displayed* value updates live is wrong to say; rather,
the URL is silently rewritten under the user a beat after they stop
typing, via `replaceState`, so it never grows the history stack and Back
never has to step through fifteen single-character entries to leave a
search. `pushState` is reserved for the one real navigational event (first
arriving at `/search`), matching the task brief's explicit instruction.

Same `replaceState`-only rule applies to every sort/filter `<select>`
(`app.ts`'s `change` listener, `1297-1319`) — choosing "Z to A" updates
`?sort=za` in place, no history entry, because it's a view of the same
page, not a new page.

### 4.5 Focus management (accessibility)

Today `render()` (`app.ts:1112-1150`) replaces `#view`'s entire subtree and
never moves focus, which means a screen-reader user who activates a link
has no announcement that the page changed and keyboard focus is left on a
now-detached button. Add, inside `navigate()` and the `popstate` handler,
after `render()`:

```ts
function focusMain(): void {
  const view = document.getElementById('view')!;
  // A short-lived tabindex, not a permanent one: #view should not sit in
  // the normal tab order, only receive focus once, programmatically, right
  // after a navigation.
  view.setAttribute('tabindex', '-1');
  view.focus({ preventScroll: true });   // scrolling is handled separately, §4.3
  view.addEventListener('blur', () => view.removeAttribute('tabindex'), { once: true });
}
```
And give `<main id="view">` (`template.html:1041`) an `aria-live="polite"`
region is *not* right here — a live region would announce the entire new
page's text on every navigation, which is noisy for a 1000-word legal
page. Instead add a visually-hidden `<h1 id="route-announce"
aria-live="polite">` that each `render()` branch sets to a one-line summary
("Dior, brand profile", "Aventus, fragrance details") — small, deliberate,
per-view text rather than dumping the whole DOM into a live region.

---

## 5. Navigation flow and back-button semantics

Decision for every transition the app currently has, plus the ones routing
adds. "Push" = new `history` entry (Back returns to the previous page).
"Replace" = same entry, URL swapped underneath it (Back skips over it).

| Transition | Decision | Reasoning |
|---|---|---|
| Home → fragrance detail (`data-frag`) | **Push** | Real content change, a bookmark-worthy destination (`/fragrance/:id`). Back must return to Home. |
| Detail → Back | **Browser Back** (`history.back()`), not a synthetic `go('home')` | Today's `data-back` handler (`app.ts:1262-1265`) guesses the return target (`browse` if a query/brand was set, else `home`) — with real history, the correct return target is *whatever was actually on the stack*, which `history.back()` gets right by construction and the current heuristic cannot (e.g. arriving at detail from a retailer page or a note page today incorrectly falls back to home/browse instead of retailer/note). This is a genuine bug fix that routing buys for free. |
| Explore tab switch (Brands → Deals → Retailers…) | **Push** | Each tab is now its own top-level URL (`/brands`, `/deals`, …) per §1.1 — that is a real place, shareable and bookmarkable, so leaving it belongs on the stack. A user who taps through three tabs then hits Back three times landing back on each previous tab in turn is the expected browser behaviour for three different pages, which is what these now are. |
| Explore tab switch, if the tab is re-tapped (already active) | **No-op** | `openExplore()` already re-renders unconditionally today; add a guard — if `state.tab === tab && state.view === 'explore'`, do nothing. No point pushing an identical URL onto the stack. |
| Retailer/brand/note list → its detail page (`data-retailer`, `data-brand`, `data-note`) | **Push** | Same reasoning as Home → detail: real destination, `/retailers/boots`, `/brands/dior`, `/notes/bergamot` are all things worth bookmarking or sharing. |
| Detail-page Back (`data-back-explore`) from retailer/brand/note profile | **Browser Back** | Same fix as the detail-page row above — `data-back-explore`'s current hardcoded `go('explore')` (`app.ts:1257-1260`) loses which tab you actually came from if `state.tab` was mutated elsewhere in between; real history doesn't have that problem. |
| Quick top-bar search, typing | **Replace, debounced** (§4.4) | Explicit brief requirement. Every keystroke is not a new page. |
| Quick top-bar search, first character typed (arriving at `/search` from elsewhere) | **Push once** | The *arrival* at Search is a real navigation (Back should leave Search, not step back through individual keystrokes that never separately existed on the stack). |
| Explore ▸ Search panel, typing (`#search-full`, `app.ts:1279-1295`) | **Replace, debounced**, same as top-bar search — this is the unification from §1.2 | Same feature, same rule. Two inputs, one canonical URL/history behaviour. |
| Sort/filter `<select>` changes (brand sort, deal sort, note layer, per-detail sort/filter) | **Replace** | A refinement of the current page, not a new page — matches the task brief's implicit framing (only search gets called out for debounce+replace because it's the one that *feels* like new pages arriving; selects are the same category of "don't spam history" without needing a debounce, since a `change` event already only fires once per selection). |
| Home rail "See top 50" (`data-browse`) | **Push**, target `/search` (unification, §1.2) | Real destination change from the compact rail to the full ranked list. |
| Nav bar Home / brand-mark click (`goHome`) | **Push**, target `/` | Explicit "take me to the front page" action a user chose; belongs on the stack like any other top-level navigation. Also clears `state.query`/`state.brand` as it does today. |
| Nav bar Settings click | **Push**, target `/settings` | Same category as Home. |
| Legal page open (`data-page`, from Settings) | **Push**, target `/legal/:slug` | Real, shareable destination (privacy policy, terms — these are exactly the pages most likely to be linked to from outside the app). |
| Legal / Settings Back (`data-back`) | **Browser Back** | Same fix as detail-page Back. |
| Mode/layout toggles (dark/light, mobile/desktop), per-row selector | **No history interaction at all** | Device preferences, already persisted to `localStorage` (`MODE_KEY`, `LAYOUT_KEY`, `PER_ROW_KEY`) — not page content, must never appear in the URL or the history stack. Keep exactly as-is. |
| Note chip click from a fragrance's detail page (`data-note`, inside `notesBlock()`) | **Push**, target `/notes/:slug` | Same as any other detail navigation — a genuine destination change away from the fragrance page. |
| "Clear" brand filter link in Search (`data-clear-brand`) | **Replace** | Refines the current `/search` results in place (assuming `?brand=` is resurrected per §1.2 item 2 — until then this is moot, the control is currently unreachable dead code). |
| Contact form submit (`mailto:` handoff) | **No history interaction** | Never changes the visible page — it hands off to the OS mail client and shows an inline confirmation. Nothing to route. |
| Offer row click (external retailer link, `rel="nofollow noopener" target="_blank"`) | **No history interaction** | Leaves the app entirely in a new tab; out of scope for in-app routing by construction. |
| House product card click (external house storefront link) | **No history interaction** | Same as above — always external, never an internal route (§1.2 item 3, §2.3). |
| Direct load / deep link (`/brands/dior` typed or clicked from outside) | **Replace on boot** (there is nothing to push onto — it's the first entry) | `stateFromUrl()` runs once at `init()`, matching `location.pathname` instead of hardcoding `state.view = 'home'`. Uses `history.replaceState`, not `pushState`, purely to attach the parsed `{view, ...}` object to the existing (browser-created) history entry rather than creating a duplicate one for the page that's already loaded. |

---

## 6. Migration plan and risk

The task brief is explicit: specify, do not implement. This section is
the sequencing a future implementation PR should follow, and the risk of
each step, so that PR can be reviewed against a plan rather than invented
live.

1. **Introduce `navigate()`/`stateFromUrl()`/`urlFor()` alongside the
   existing `go()`/`openExplore()`, without deleting them yet.** Lowest-risk
   entry point: `go(view)` becomes `navigate(urlFor(view, state))`
   internally; every one of the ~15 call sites in `init()`'s delegated
   click listener keeps its exact current call (`go('detail')`,
   `openExplore('brands')`, etc.) unmodified, because the wrapper functions
   keep the same signatures. This is the seam that lets routing land
   without touching `render()`, `homeView()`, `detailView()`, or any of the
   panel functions at all — they stay pure functions of `state`, exactly
   as now.
2. **Add the route table and boot-time resolution** (`stateFromUrl` called
   once in `init()` before the first `render()`, replacing the hardcoded
   `view: 'home' as View` default only for the very first paint — the
   `state` object's declared defaults stay as they are, they're just
   overridden by whatever the URL parsed to before first render).
3. **Wire `popstate`.** This is the step that actually makes Back work —
   everything before this point could ship "changes the URL bar" without
   yet "responds to Back," which is an incomplete but shippable
   intermediate state if the work needs to be split across PRs.
4. **Debounced `replaceState` for search input and selects** (§4.4) —
   additive, does not change any existing rendering path, only when
   `history` is touched.
5. **Scroll restoration + focus management** (§4.3, §4.5) — purely
   additive event listeners, no existing function signatures change.
6. **`404.html` + build script change** (§3.2) — a `scripts/build-demo.ts`
   edit to also write `demo/404.html` with the same `standalone` string it
   already writes to `demo/index.html` (`build-demo.ts:59`, one extra
   `writeFileSync` call), plus updating `deploy-pages.yml`'s watched
   `paths:` filter if needed (it already watches `demo/**`, so no change
   required there). This step can land independently of 1-5 — the 404
   trick is only load-bearing once real paths exist to deep-link *into*,
   but shipping it early is harmless and de-risks the last, most
   deploy-specific piece separately from the in-app router logic.
7. **Brand/note slug resolution tables** (§2.2) — pure data derivation
   functions (`resolveBrandSlug`, `resolveNoteSlug` and their inverses),
   independently testable against the real `BRANDS`/`NOTE_INDEX` arrays
   before being wired into the route table, exactly the way this document
   verified them (§2.2's collision table) rather than trusting the
   algorithm by inspection alone.

**Biggest actual risk in the whole plan:** the brand slug collision table
(§2.2) is derived from `CATALOGUE` **as it exists in the repository right
now**. `catalogue.generated.ts`'s own header says "Generated by
`scripts/build-demo-catalogue.ts` … Regenerate: `npm run harvest && npm run
catalogue:demo`" — this file is rebuilt from live retailer data on a
schedule (see `catalogue-daily.yml`, referenced in `deploy-pages.yml`'s own
comments). A brand string that doesn't collide today could start colliding
after tomorrow's harvest if a retailer changes how they format a brand
name in their feed, or a *new* collision could appear if a 145th brand is
newly harvested. The disambiguation-suffix scheme in §2.2 handles this
automatically (it's computed from whatever `BRANDS` looks like at build
time, not hardcoded against today's 144), but it means a brand's slug is
not guaranteed stable release-to-release if its position in the sorted
collision order changes — a real, if narrow, link-rot risk worth a code
comment at the point of implementation, and a strong argument for actually
fixing the brand-name normalisation at the data layer rather than
permanently living with the disambiguation table.

---

## Files read to produce this document

- `demo/app.ts` (full, 1349 lines)
- `demo/template.html` (full)
- `scripts/build-demo.ts` (full)
- `demo/sw.js` (full)
- `.github/workflows/deploy-pages.yml` (full)
- `demo/CNAME`
- `demo/data.ts` (full)
- `demo/legal.ts` (LEGAL_PAGES ids/shape)
- `demo/catalogue.generated.ts` (interfaces + loaded/executed the real
  `CATALOGUE` and `HOUSE_PRODUCTS` arrays to verify counts, id formats,
  brand-string collisions and note-string collisions against real data,
  not sampled by eye)
- `src/config/retailers.ts` (`RETAILERS` ids)
- `demo/manifest.webmanifest` (`start_url`/`scope`, relevant to whether the
  404 strategy affects installed-PWA deep links — it doesn't, `scope: "."`
  already covers any subpath)
