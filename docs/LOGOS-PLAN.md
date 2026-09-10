# Retailer and brand logos

Written 2026-09-10 against the tree at `e5b32175`. Everything measured here was
measured on that day, from this sandbox, with the commands quoted beside each
number. This is a plan to be executed, not a discussion — the decisions are
made below and the checklist in §5 is the whole job.

**A note on the network.** `docs/IMAGE-PIPELINE.md` says outbound connections
to retailer and CDN domains 403 at the proxy, and that was true when it was
written. It is no longer true: this research fetched 38 retailer homepages and
40 brand homepages for real. Where a fetch failed it failed at the *retailer's*
end (403/429/503 from their WAF), and that is recorded as such rather than as
an absence of a logo. One host is still blocked by this environment's own
egress policy — `logo.clearbit.com` — and that is called out where it matters.

---

## 1. What we are doing and why

The site names 33 shops and 692 fragrance houses in plain text, and a reader
scanning a grid of tiles has to read "from The Beauty Store UK" instead of
recognising it. Logos are recognition at a glance, and on the two surfaces that
already reserve a square box for exactly this — the Shops directory row and the
shop/brand profile hero — the box is currently filled with generated initials.
We are going to fill those boxes with the real mark where we have a defensible
basis for one, keep the initials everywhere else, and record why every mark is
shown the same way `imageBasis` already records why every photograph is shown.

---

## 2. Findings

### 2a. Where a name is currently rendered, and what should happen there

Read off `demo/app.ts` and `demo/template.html`. Sizes are the CSS as shipped.

| # | Surface | Code | Rendered size | Verdict |
|---|---|---|---|---|
| 1 | Shops directory row | `retailersPanel`, `app.ts:2694` | `.monogram` 42×42px + `.shop-row-name` 15px | **Logo.** Already a square box with a fallback in it. |
| 2 | Shop profile hero | `retailerView`, `app.ts:2801` | `.org-hero .monogram` 56×56px | **Logo.** Same box, one per page. |
| 3 | Brand profile hero | `brandView`, `app.ts:2856` | `.org-hero .monogram` 56×56px | **Logo.** Same box, one per page. |
| 4 | Offer row on a fragrance page | `offerRow`, `app.ts:1506` | `.shop` at `t-title` 15px | **Logo, phase 2.** ~8 rows per page; a 20px mark left of the name is legible and cheap. |
| 5 | "from Justmylook" balloon on every tile | `fragranceTile`, `app.ts:1118`; `.sold-by`, `template.html:1080` | `600 12px/1`, padding 6px 10px, ellipsised | **Text.** 12px is below the size at which a wordmark resolves, and a browse grid puts 60+ of these on screen at once. |
| 6 | Brand pill on every tile | `brandButton`, `app.ts:1038`; `.phead-brand`, `template.html:748` | `t-eyebrow` = 11px uppercase, padding 3px 10px | **Text.** Worse than #5 on both counts. |
| 7 | Brands directory row | `brandsPanel`, `app.ts:2503` | `.brand-row` at `t-title` 15px, no box | **Generated monogram only, no network fetch.** 692 rows; see §2b. |
| 8 | Today's Deals | `dealsPanel`, `app.ts:2561` | reuses `fragranceTile` | Inherits #5/#6. Nothing extra. |
| 9 | Search results | `searchResultsHtml`, `app.ts:3092` | reuses `fragranceTile` | Inherits #5/#6. Nothing extra. |
| 10 | Detail-page price box | `lowestPriceBox`, `app.ts:2342` | `t-caption` 13px prose | **Text.** It is a sentence, not a label. |
| 11 | "Not available at …" | `unavailableShopsLine`, `app.ts:1700` | plain buttons | **Text.** A logo beside "not available" reads as a recommendation. |
| 12 | Notes attribution | `notesBlock`, `app.ts:2029` | `t-caption` link | **Text.** Same reason as #10. |
| 13 | Virtual Yanny answers | `yannyThreadHtml`, `app.ts:4199` | `esc(item.text)` | **Text, and structurally so.** Every bubble is HTML-escaped plain text. A logo there means changing the message model, and nothing about a chat answer is improved by one. |

So: three surfaces now (#1–#3), one later (#4), nine stay as they are. Both of
the first three already draw a square tile at a fixed size with a working
fallback inside it, which is why they are the ones to do — no layout changes,
no new empty states, and if a logo is missing the page is exactly what it is
today.

**Wordmarks do not fit a square.** Of the retailer logos actually fetched, the
`Organization.logo` a site declares is usually a wide lockup — Justmylook
236×37 (6.4:1), Beauty Base 204×66 (3.1:1), French Avenue 500×133 (3.8:1),
FragranceHub 500×100 (5:1) — while `apple-touch-icon` and the favicon are
square by definition. A 6.4:1 wordmark letterboxed into a 42px box renders
about 7px tall. Hence the two-slot rule in §4.

### 2b. Scale

Measured on 2026-09-10 (scripts in the scratchpad; each is a few lines over
`RETAILERS` and `CATALOGUE`, and reproducing them takes a minute).

- **77 retailers** in `src/config/retailers.ts`, **38 enabled**, **14** of
  those single-brand storefronts kept out of the Shops directory by
  `retailersPanel`'s own filter. *(This moved under this research: the count
  was 79 at `abfe2915` and 77 at `e5b32175`, after very.co.uk and Wowcher were
  removed. Re-measure before quoting it.)*
- **33 retailers carry at least one listing** in the shipped catalogue.
  Ordered by listing count the top eight are perfume-click 5,197,
  mybeauty-boutique 4,477, beautybase 2,818, emirates-oud 2,225,
  the-beauty-store-uk 2,089, justmylook 1,728, perfumeo 1,437,
  fragrance-click 686.
- **692 distinct brand strings** across **14,967 products** in
  `demo/catalogue.generated.ts`. 12,605 products carry a photo.
- The brand tail is the whole story: **166 brands have exactly one product**,
  158 have 2–4, 91 have 5–9, 198 have 10–49, and 79 have 50 or more.
- Concentration cuts the other way: the top 25 brands cover 36.2% of products,
  the top 50 cover 50.9%, the **top 100 cover 68.7%**, the top 200 cover 85.5%.
- `demo/brandSites.ts` already holds a verified official website for **394 of
  the 692 brands (56.9%)**, and those brands account for **93.6% of products**.
  That file is the domain source for the brand side; nothing needs re-deriving.

**Hand-sourcing all 692 is not on.** At five minutes a brand it is 58 hours,
and the bottom 324 brands are 1–4 products each. Hand-sourcing the **top 100**
is about eight hours and reaches 68.7% of products. That is the shape of the
job: annotate the top 100 brands and all 38 enabled retailers, and let the
other 592 brands render the tile that is already there.

### 2c. What this repo's licensing position already is, and where a logo sits inside it

The position is written down in four places and is consistent across all of
them:

- `src/types/retailer.ts` — `imageBasis` names *why* a picture may be shown,
  and exists because a boolean "could only say yes or no, so turning images on
  for a shop meant asserting a licence that had not been obtained".
- `demo/photo.ts` header — "In every case the image is referenced, never
  copied … nothing is downloaded or rehosted here."
- `docs/IMAGE-PIPELINE.md` §5 — committing someone's imagery into this git
  repo is "the single least reversible form of 'hard coding the creative'",
  and rehosting "is a new licensing conversation per retailer, not a technical
  migration."
- `demo/legal.ts`, Terms → Product images — "We do not copy, host, crop,
  recolour or otherwise alter any of them, and each one sits beside a link to
  buy that product from the shop it came from."

The one affiliate programme whose creative terms have actually been read says,
quoted in `src/config/retailers.ts:2331`: *"Publishers may not alter any of the
creative… may not hard code the creative into their sites."* That single
sentence decides two things for us below — no recolouring, and no committed
copies.

**A logo is not a photograph, and the difference is trademark.** Two questions,
not one:

1. *Copyright in the artwork.* Handled by the rule already in force: reference,
   never copy. A hot-linked `<img src>` pointed at the owner's own server is
   the same act `productArt` already performs 12,605 times.
2. *Trademark.* The UK statute is the Trade Marks Act 1994, section 11(2)(c),
   which says a registered trade mark is not infringed by *"the use of the
   trade mark for the purpose of identifying or referring to goods or services
   as those of the proprietor of that trade mark"*, subject to the condition in
   the closing words of s.11(2): *"provided the use is in accordance with
   honest practices in industrial or commercial matters."* (Read from
   [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/1994/26/section/11),
   2026-09-10.)

Identifying whose price this is, and whose bottle this is, is exactly what
s.11(2)(c) describes. The site already makes that claim in words: the Terms
page says *"Brand names, product names and trade marks belong to their owners
and appear here only to identify products."* A logo beside a link to that
shop's own product page is the same statement in a different typeface.

**Where the line is.** This is not advice, and nothing here is a licence. It is
what the repo's own standard requires before anything is shown, and the
standard is "record the reason, then show it". The reason for a logo has four
conditions attached, all of which are things we control:

- **It must be referential, never decorative or promotional.** A logo appears
  in the box that identifies that shop or that house, beside a link to them.
  It never appears in a marketing block, a hero, a testimonial, or anywhere it
  could read as endorsement — which is the specific reason surfaces #10 and
  #11 above stay as text.
- **It must not be altered.** No recolouring, no `currentColor` substitution,
  no cropping, no trimming whitespace, no adding a border to the artwork
  itself. This is the same clause the photographs already run under, and it is
  what rules out the neatest-sounding theme fix (see §2d).
- **Non-affiliation must be stated.** The Terms need one added sentence; the
  wording is in §4f.
- **An opt-out must be offered and honoured on request**, the same as the
  existing image opt-out — and honoured the same way, by unsetting the field.

The existing CSS comment at `template.html:1076` says *"no comparison site has
a licence to reproduce a retailer's trademark, so this is a plain text tag
using the name instead"*. That is right that we hold no licence and wrong that
a licence is the only lawful route; s.11(2)(c) is the other one. The comment
must be rewritten when `.sold-by` is touched, or it will contradict the code
beside it. `monogramHue`'s comment (`app.ts:2640`) makes the same claim about
colour and should be narrowed to what it is actually protecting: the monogram
tint is deliberately *not* the brand's real colour, which stays true whether or
not a logo is shown elsewhere on the page.

### 2d. Theme

The page renders under `[data-mode]` with two full palettes (`template.html:10`
and `:110`): dark ground `--bg #0A0A0B` / pill `--surface-2 #1A1A1D`, light
ground `--bg #FCFCFD` / pill `--surface-2 #F2F2F4`.

Eight real retailer logos were downloaded and measured pixel by pixel — for
each, the share of opaque ink under a 3:1 contrast ratio against each ground:

| logo | transparent | fails on dark | fails on light |
|---|---|---|---|
| al-haramain | 84% | **100%** | 0% |
| french-avenue | 85% | **100%** | 0% |
| mybeauty-boutique | 89% | **100%** | 0% |
| armaf | 42% | **71%** | 26% |
| fragrance-click | 73% | **50%** | 0% |
| fragrancehub | 73% | 0% | **100%** |
| allbeauty | 17% | 9% | **89%** |
| the-beauty-store-uk | 0% | 8% | **91%** |

**Every one of the eight fails one of the two themes.** Six have transparent
backgrounds and are illegible on exactly one ground; the other two carry their
own near-white background and would drop a white rectangle onto the dark theme
— which is the identical problem `.art`'s white tile already solves for feed
photography (`photo.ts`, "On the white tile").

Recolouring is out: it is the alteration the creative terms forbid, and it does
not even work mechanically. Beauty Base's SVG is 14 paths carrying five
`fill="#19975D"` and nine `fill="white"`; forcing `currentColor` through it
turns a two-colour mark into a silhouette. Justmylook's is a single
`fill="#252525"` path that *would* take `currentColor` cleanly — one of eight —
which is not a strategy.

**So the logo goes on its own tile, and the tile's ground is chosen per logo
from a measurement, not per theme.** Same tile in both themes, so the mark is
identical on both and neither is a special case. Three values, described in
§4c.

---

## 3. Sourcing: what was tested, and what it returned

All coverage figures below are from real requests made on 2026-09-10.

### Ranked

**1. The party's own website — declared icon, `apple-touch-icon`, or
schema.org `Organization.logo`. Chosen for both retailers and brands.**

No third party, no key, no terms to accept, and it is the same act the site
already performs for photographs. The probe reads the homepage, collects
`<link rel="icon">`, `<link rel="apple-touch-icon">` and any
`Organization.logo` in a JSON-LD block, then fetches each candidate.

*Retailers — all 38 enabled, probed individually:*

- **18 publish a logo-grade asset** (≥128px raster, an SVG, or an `.ico`
  carrying a ≥128px entry): justmylook (SVG 236×37), beautybase (SVG 204×66),
  mybeauty-boutique (PNG 500×209), fragrance-click (PNG 512×512), scentstore
  (SVG wordmark + SVG 128×128), french-avenue (PNG 500×133), al-haramain (PNG
  709×709), perfumeo (PNG 1254×1254), escentric-molecules (two SVGs),
  fragrancehub (PNG 500×100), morrisons (SVG 207×92), bm-stores (PNG 180×180),
  home-bargains (PNG 180×180), armaf (PNG 787×787), ibraq (PNG 834×834), boots
  (`favicon.ico` carrying a 192×192 entry), the-fragrance-counter
  (`favicon.ico` carrying 256×256), notino-uk (`apple-touch-icon` 180×180).
- **12 publish only a small icon** (16–96px): allbeauty 32, lookfantastic 96,
  glorious-beauty 96, oud-arabian 32×10, the-beauty-store-uk 32, zimaya 27,
  perfume-click 16, avon 32, emirates-oud 32, the-perfume-shop 48, john-lewis
  64, zara 48.
- **8 returned nothing usable to a datacentre IP**: the-fragrance-shop (403 on
  everything), superdrug (403/404), selfridges (403 on everything),
  harvey-nichols (404/503), bellavita-luxury (429), kayali (404),
  riiffs (202 bot-challenge shell), manchester-ouds (404).

**That last group is a statement about automation, not about the shops.** A
person opening selfridges.com in a browser sees the logo immediately. Those
eight are the manual rows.

*Brands — 40 sampled, spanning the largest designer houses and the
Middle-Eastern houses that are the bulk of this catalogue:*

- **15 of 40 gave a logo-grade asset**: Al Haramain (709px), Fragrance World
  (180), Armaf (787), French Avenue (500), Maison Alhambra (500), Afnan (180),
  Paris Corner (512), Rasasi (`.ico` 256), Orchid (180), Bujairami (152),
  Hugo Boss (180), Prada (150), Burberry (400), Chanel (192), Hermès (180).
- 8 gave only a small icon: Ard Al Zaafaran 32, Khadlaj 100, Zimaya 27,
  Jean Paul Gaultier 32, Carolina Herrera 16, Rabanne 96, Narciso Rodriguez 48,
  Elizabeth Arden 57.
- 15 were blocked at their own WAF: Lattafa (429), Mykonos (503), Calvin Klein
  (503), Giorgio Armani, YSL, Versace, Gucci, Tom Ford, Dior, Givenchy,
  Lancôme, Jimmy Choo, Lacoste (403), Marc Jacobs (503), Police (connection
  refused).
- 2 were reachable and declared nothing usable: Louis Cardin, Dolce & Gabbana.

**The result inverts the expectation, and it is the most useful thing in this
document.** Split the sample by house type:

- **Middle-Eastern / long-tail houses (16 sampled): 10 gave a logo-grade
  asset — 63%.** They run Shopify storefronts, and a Shopify storefront
  declares `Organization.logo` in its JSON-LD as a matter of course.
- **Designer houses (24 sampled): 5 gave one — 21%.** The maisons sit behind
  Akamai and Cloudflare and hand a datacentre IP a 403.

The long tail this site actually lives on is the *well-covered* half. That is
the opposite of what every third-party logo service is optimised for.

A second Shopify property matters: `?width=N` on a `cdn/shop/files/...` URL
returns that width. Armaf's 787px / 388 KB logo comes back at `?width=96` as
16.9 KB; French Avenue's as 3.4 KB; MyBeauty.Boutique's as 2.2 KB. So a
hot-linked Shopify logo costs single-digit kilobytes at the size we draw it.
(SVG ignores the parameter and returns the same file.)

**2. Wikimedia Commons, via Wikidata property P154. Chosen as the *second*
source, for designer houses only.**

Tested against 38 brand names through `wbsearchentities` → `wbgetentities`:
**11 of 38 have a P154 logo**, and all 11 are designer houses. **Zero of the 16
Middle-Eastern houses have one.** Exactly complementary to source 1.

The licence position is good and was read from the Commons API's own
`extmetadata`, not assumed. All ten checked designer logos —
Calvin Klein, Dolce & Gabbana, Hugo Boss, Gucci, Prada, Burberry, Chanel, Dior,
Carolina Herrera, Rabanne — return `LicenseShortName: "Public domain"` with
`Restrictions: "trademarked"`. That is Commons' PD-textlogo position: the
wordmark is below the threshold of originality so there is no copyright to
infringe, and the trademark is untouched by that and is governed by §2c. Files
are small SVGs, 1,423–13,812 bytes, median 2,881.

**The name-matching is dangerous and must not be automated.** In the same run,
"Police" resolved to Q178095, *The Police*, the band; "Givenchy" to Q366425,
*Givenchy-en-Gohelle*, a commune in Pas-de-Calais; "Louis Cardin" to Q579553,
*Lucien Cardin*, a Canadian politician; "Rasasi" to *Rasasienka*. Four false
positives in 38. Every Wikidata QID goes in the annotation by hand, with the
QID recorded, and is eyeballed before it ships.

**3. Brandfetch — rejected.** Its own guidelines say *"To use Logo API, you
must include your client ID with every request"*, and *"Programmatic access to
logo images is not permitted… Scraping logos will also lead to a block"*, with
logo links required to be embedded directly
([docs.brandfetch.com/logo-api/guidelines](https://docs.brandfetch.com/logo-api/guidelines),
read 2026-09-10). Free tier is generous and needs no attribution. It fails here
for one structural reason: this site is a single static HTML file, committed to
this public repo (`demo/index.html`, and an identical `demo/404.html`), so a
client ID embedded in the page is a credential committed to a public repo. A
build secret does not help — the built artefact *is* the committed file.

**4. logo.dev — rejected, same reason.** HubSpot's own changelog points
Clearbit users here. Its README (`logo-dev/logo-api`, read 2026-09-10) shows
the integration as `img.logo.dev/<domain>?token=LOGO_DEV_PUBLISHABLE_KEY`; a
request without a valid token returns 401 (tested). It also requires, on the
free plan, *"On the free plan, commercial use requires a visible link back"* —
`<a href="https://logo.dev">Logos provided by Logo.dev</a>`. Free tier 500K
requests/month. Same token-in-a-public-file problem, plus a permanent footer
obligation on a site that has spent real effort keeping its footer honest.

**5. Clearbit Logo API — dead. Do not build on it.** HubSpot's changelog
"Upcoming Sunset of Clearbit's Free Logo API": *"Effective today, the Clearbit
Logo API (logo.clearbit.com) is officially deprecated"*, *"The API will shut
down on December 8, 2025"*, and *"After the service is shut down, requests to
logo.clearbit.com will fail to connect and no logos will be returned."* That
date is nine months past. Separately, `logo.clearbit.com` is blocked by this
environment's egress policy, so nothing here tested it live — the changelog is
the citation, not a probe.

**6. Google's favicon endpoint (`www.google.com/s2/favicons?domain=`) —
rejected.** It works: 6 of 6 sampled domains returned an image, no key needed.
Three problems. It is an undocumented, unsupported endpoint with no published
terms, and "no published terms" is not a basis this repo can record. Size is
not honoured — `justmylook.com` at `sz=128` returns the same 32×32 PNG as
`sz=64`; nothing in the sample exceeded 64×64. And its failure mode is the
exact bug fixed on 2026-09-09: a request for a domain that does not exist
returns HTTP 404 with a 726-byte 16×16 generic-globe PNG in the body, which a
browser will happily paint. Commit `a52f32e0` removed 348 grey "No image
available" icons from this site; this would put a grey globe back.

**7. DuckDuckGo's `icons.duckduckgo.com/ip3/<domain>.ico` — rejected.** Same
shape, same objections: 6 of 6 sampled domains returned ~32×32, no published
terms of use for third-party embedding.

**8. Simple Icons — rejected on coverage.** CC0-1.0 repository, 3,400+ icons,
and its `DISCLAIMER.md` is unusually honest: *"Simple Icons is released under
CC0 - though that doesn't mean to imply that all icons within the project are
also CC0"*, and *"Simple Icons cannot be held responsible for any legal
activity raised by a brand"*. Coverage against this catalogue is the killer:
of 12 tested slugs, **2 exist** (`dior`, `boots`). `gucci`, `prada`, `chanel`,
`versace`, `burberry`, `lattafa`, `armaf`, `calvinklein`, `hugoboss` and
`lacoste` all 404. It is a developer-tool icon set, not a fashion-house one.

### Chosen

**Source 1 (the party's own site) for retailers and for Middle-Eastern and
independent houses; source 2 (Commons PD) for designer houses where source 1 is
behind a WAF.** Everything else gets the monogram. No third-party logo service,
now or later, unless it can be used with no key in the shipped page.

---

## 4. The decisions

### 4a. Reference, never copy — with one narrow exception

Logos from source 1 are **hot-linked** from the owner's own server, exactly as
photographs are. No file is downloaded, no file is committed. This inherits the
whole existing position, needs no new legal analysis, and costs the repo zero
bytes.

The one exception is **source 2**: a Commons PD SVG is public domain by its own
licence template, so copying it is permitted by copyright, and hot-linking
`upload.wikimedia.org` from a commercial site is worse practice than hosting
the 3 KB ourselves. Those files — and only those — are committed, to
`demo/logos/`, each with its Commons file page and licence recorded.

### 4b. Storage and size budget

`demo/` is published wholesale to GitHub Pages (`.github/workflows/deploy-pages.yml`,
`path: demo`), so a file at `demo/logos/x.svg` is served at `/logos/x.svg` as
its own request and costs the HTML nothing.

The distinction that decides this: `demo/index.html` is 19,956,277 bytes
(19.03 MiB) with the whole bundle inlined, and `demo/404.html` is a
byte-identical copy of it. **Anything imported by `demo/app.ts` is paid twice
in the repo and re-committed on every rebuild.** Concretely, 692 brand SVGs at
the measured median of 2,881 bytes:

- **As separate files under `demo/logos/`:** ~2.0 MB on disk, committed once,
  and a visitor downloads only the two or three logos on screen.
- **Inlined as data URIs in the bundle:** ~2.7 MB after base64, ×2 for the two
  HTML copies = **+5.4 MB per rebuild commit**, on top of a page that is
  already 19 MB, every byte of it delivered to every visitor before the first
  tile paints.

**Decision: never inline logo bytes.** What goes in the bundle is the manifest
only — brand or retailer key, source URL or local path, shape, ink, basis, date.
At ~90 bytes an entry that is under 40 KB for all 692, ×2 = 80 KB, which is
0.4% of the page and buys the whole feature.

Budgets, enforced by the checklist in §5:
- Any committed logo file: **≤ 8 KB**. Nine of the ten Commons SVGs measured
  are under 5 KB; the tenth is 13.8 KB and should be re-exported or skipped.
- Total `demo/logos/`: **≤ 400 KB**. That is ~100 files, which matches the
  top-100 plan.
- Any hot-linked logo: request it at the size drawn. On Shopify append
  `&width=96`; on WordPress use the `-150x150`/`-300x300` variant the site
  already generates. Do not point a 42px tile at Perfumeo's 847 KB PNG.

### 4c. Format, shape and theme handling

Two slots, because a wordmark does not fit a square (§2a):

- **Slot A — the 42px directory row and the 56px hero, square.** Takes a
  `shape: 'square'` asset only: `apple-touch-icon`, a square favicon ≥128px, or
  a square SVG. A brand or shop with only a wordmark gets the monogram in
  slot A.
- **Slot B — the hero, when a wordmark is all there is.** A flexible box,
  `height: 56px; max-width: 200px; object-fit: contain`, in place of the square.
  One per page, so the layout can afford to be told which shape it is getting.

Theme is handled by a per-logo ground recorded once from a measurement, not by
a per-theme asset:

- `ink: 'dark'` — dark artwork on transparency (al-haramain, french-avenue,
  mybeauty-boutique, armaf, fragrance-click). Draw it on a **light tile**,
  identical in both themes.
- `ink: 'light'` — light artwork on transparency (fragrancehub). Draw it on a
  **dark tile**, identical in both themes.
- `ink: 'own'` — opaque, carries its own background (the-beauty-store-uk,
  allbeauty). Draw it with **no tile**, clipped to the box radius.

The tile is our container, styled by us; the artwork inside it is untouched.
That is the same construction, and the same justification, as the white tile
behind feed photography in `.art`. `demo/contrast.ts` and
`tests/paletteContrast.test.ts` already exist for pinning the tile colours
against both palettes.

### 4d. Fallback — the monogram, which already exists and already works

`monogram()` (`app.ts:2657`) draws two initials on a hue hashed from the name
by `monogramHue()`. It is drawn at 42×42/11px radius in the directory and
56×56/15px in the hero, tinted by `--mono-bg-l` (20% dark / 93% light),
`--mono-fg-l` (78% / 30%) and `--mono-border-l` (42% / 55%), and
`docs/DESIGN-SYSTEM.md` §1.3 records that `--mono-fg-l` was set at the highest
lightness clearing AA "at every one of the 360 hues the monogram tint can
take". It is contrast-tested by `tests/contrast.test.ts` and needs no work.

**The rule: the monogram is the default, and the logo is the override.**
Render order is monogram-unless-logo, never logo-with-a-fallback-behind-it, so
there is no state in which both or neither exists. On top of that, every logo
`<img>` carries the same `onerror` `productArt` has carried since photography
went hot-linked — remove the image, mark the container, let CSS draw the
monogram — because a shop that turns on hot-link protection does not warn
anyone first. `tests/imageFallback.test.ts` exists precisely to pin that
invariant across image surfaces and must be extended to this one; its header
already says the invariant is pinned there "rather than the one call site, so
the next image surface added has to carry it too". This is that surface.

**There is never a broken image, never an empty box, and never a third state.**

### 4e. How a logo and its basis are recorded

Mirrors `imageBasis`: nothing is displayed without a recorded reason.

A new type in `src/types/retailer.ts`:

```ts
/** Where a logo comes from and why we may show it. */
export interface LogoRef {
  /** Hot-linked URL on the owner's own server, or a repo path under /logos/. */
  src: string;
  /** Which slot it may fill — see docs/LOGOS-PLAN.md §4c. */
  shape: 'square' | 'wordmark';
  /** Measured, not eyeballed: which ground it needs. */
  ink: 'dark' | 'light' | 'own';
  basis: LogoBasis;
  /** The page the declaration was read off, so anyone can re-read it. */
  source: string;
  /** ISO-8601 date it was read and measured. */
  readAt: string;
}

export type LogoBasis =
  /**
   * Declared by the owner on their own site — <link rel="icon">,
   * apple-touch-icon, or schema.org Organization.logo — and hot-linked from
   * their server. Referential use under the conditions in
   * docs/LOGOS-PLAN.md §2c. Unset it the moment they object.
   */
  | 'own-site-declared'
  /**
   * Wikimedia Commons, whose licence template states public domain (a
   * wordmark below the threshold of originality). `source` is the Commons
   * file page; the Wikidata QID goes in a comment beside the entry, because
   * name matching to Wikidata mis-resolves — see §3 source 2.
   */
  | 'commons-public-domain'
  /**
   * That merchant's own affiliate creative terms have been read and permit
   * its logo. Strongest available; today nothing holds it.
   */
  | 'affiliate-creative';
```

- **Retailers:** a `logo?: LogoRef` field on `Retailer` itself, not inside
  `affiliate` — a shop's mark is not an affiliate matter, and 46 of 77 entries
  have never been researched for affiliate at all.
- **Brands:** a new file `demo/brandLogos.ts`, keyed exactly as `BRAND_SITES`
  is, exporting `BRAND_LOGOS: Record<string, LogoRef>` and `logoFor(brand)`.
  A new file rather than an addition to `demo/brandSites.ts` because that file
  is already 146 KB and is under concurrent edit; keying it identically keeps
  the two joinable.

Unset means monogram. There is no boolean anywhere in this design.

### 4f. Notice wording

Two small edits to `demo/legal.ts`, in the voice of what is already there.

Extend the existing sentence under **Our content**:

> Brand names, product names and trade marks belong to their owners and appear
> here only to identify products. Where we show a shop's or a house's logo, it
> is for the same reason and on the same terms: to say whose price or whose
> bottle you are looking at. We are not affiliated with, endorsed by or
> sponsored by any of them.

And a short section after **Product images**, computed from the registry the
way the image counts already are:

> **Logos.** A shop's or a house's logo appears beside a link to them, to
> identify them. Most are loaded by your browser directly from that owner's own
> servers; a small number are files whose published licence puts them in the
> public domain, and those we host. We do not crop, recolour or otherwise alter
> any of them, and where we have no logo we can use we draw our own initials
> tile instead. If you would rather we did not show yours, tell us and we will
> stop. yannysniffs@gmail.com

`tests/legalPages.test.ts` already exists and should get an assertion that the
logo paragraph is present whenever any `LogoRef` is set.

---

## 5. Implementation checklist

Ordered. Each step is verifiable on its own; do not start a step before the one
above it is green. `npm run test` and `npx tsc -p tsconfig.json --noEmit` must
pass at every step. The demo is rebuilt with `npm run demo`, and
`tests/demoBuildFreshness.test.ts` will fail if you change `demo/app.ts` or
`demo/template.html` and forget.

### Step 1 — Types and the empty registry
Add `LogoRef` and `LogoBasis` to `src/types/retailer.ts` with the doc comments
in §4e. Add `logo?: LogoRef` to `Retailer`. Create `demo/brandLogos.ts`
exporting an empty `BRAND_LOGOS` and a `logoFor(brand)` that returns
`LogoRef | null`.
**Test:** `npx tsc -p tsconfig.json --noEmit` clean; `npm run test` unchanged.
Nothing renders yet.

### Step 2 — The probe script, which reports and never edits
`scripts/logo-probe.ts`, wired as `npm run logo:probe`. Follow the shape of
`scripts/brand-site-probe.ts` exactly: it reports, it never rewrites a registry,
it names the request behind every line, and it takes `--retailer=`, `--brand=`
and `--limit=`. For each target it fetches the homepage, collects
`<link rel="icon">`, `<link rel="apple-touch-icon">`, `<link rel="mask-icon">`
and any `Organization.logo` from JSON-LD, then fetches each candidate and
reports content type, byte size, pixel dimensions, transparent-pixel share, and
the share of ink failing 3:1 against each of the two grounds — which is what
fills `ink`. Throttle to one request per host per 2s: an unthrottled sweep in
this research produced eight false 429s that a throttled retry cleared.
**Test:** `npm run logo:probe -- --retailer=justmylook` prints the SVG at
`cdn/shop/files/JML-logo.svg` and classifies it `wordmark` / `ink: 'dark'`.
Nothing is written.

### Step 3 — Render the logo in the two monogram slots
In `demo/app.ts`, add `orgMark(name, logo)` beside `monogram()`: returns the
logo `<img>` when a `LogoRef` is present and `shape` fits the slot, and
`monogram(name)` otherwise. The `<img>` carries `loading="lazy"`,
`decoding="async"`, `referrerpolicy="no-referrer"`, `alt=""` (the name is
already text beside it) and the same `onerror` as `productArt`. Call it from
`retailersPanel`, `retailerView` and `brandView`. Add `.org-mark` and
`.org-mark--light` / `--dark` / `--own` to `demo/template.html`, sized 42px and
56px to match `.monogram` exactly.
**Test:** with an empty registry every page is pixel-identical to today. Then
hand-add one entry (Justmylook) and confirm the Shops row and its profile page
both change, in both themes, and that deleting the URL by hand returns the
monogram.

### Step 4 — Pin the invariants
Extend `tests/imageFallback.test.ts` to assert `orgMark`'s `<img>` carries the
`onerror` fallback, the same way it already asserts it for `productArt` and
`houseCard`. Add `tests/brandLogos.test.ts` asserting: every `LogoRef` has a
non-empty `basis`, `source` and `readAt`; every `basis: 'commons-public-domain'`
entry has a `src` starting `/logos/`; every other basis has an absolute `https:`
`src`; no committed file under `demo/logos/` exceeds 8 KB and the directory
totals under 400 KB.
**Test:** the new tests fail if you delete any field, and pass on the one real
entry from step 3.

### Step 5 — The retailer pass (38 rows, one sitting)
Run `npm run logo:probe` over the enabled retailers and fill
`src/config/retailers.ts` from the report. Prove it first on these fifteen,
which are the exact rows this research measured and the ones that exercise
every branch:

| retailer | what to expect |
|---|---|
| justmylook | SVG wordmark from `Organization.logo`; `shape: 'wordmark'`, `ink: 'dark'` |
| beautybase | SVG wordmark, two-colour — confirms no recolouring |
| fragrance-click | 512×512 square PNG; the one `affiliate-creative` candidate |
| french-avenue | 500×133 wordmark, 100% of ink fails on dark |
| al-haramain | 709×709, 100% of ink fails on dark |
| armaf | 787×787; use `&width=96` (388 KB → 16.9 KB) |
| fragrancehub | 500×100, 100% of ink fails on **light** — the `ink: 'light'` case |
| the-beauty-store-uk | fully opaque — the `ink: 'own'` case |
| allbeauty | 32×32 only — too small for slot A, record nothing |
| perfumeo | 1254×1254 / 847 KB — must use the WordPress `-300x300` variant |
| boots | nothing declared; `favicon.ico` holds a 192×192 entry. Confirm by eye which entry the browser paints before shipping it |
| notino-uk | homepage 403s; `/apple-touch-icon.png` returns 180×180 |
| selfridges | 403 on everything — the manual row. Open it in a browser |
| emirates-oud | 32×32 JPEG only — record nothing |
| zimaya | 27×27 — record nothing |

**Test:** `npm run logo:probe -- --require-all-ok` on the annotated set; every
recorded `src` returns 200 with the recorded content type and dimensions.
Screenshot the Shops directory in both themes and read every row.

### Step 6 — The brand pass (top 100 by product count)
Work `BY_POPULARITY` top-down. For each brand: take the domain from
`BRAND_SITES` (394 of 692 already have one), run the probe, record what it
finds. Where the site 403s and the house is a designer maison, fall back to
Commons: resolve the Wikidata entity **by hand**, record the QID in a comment,
confirm `extmetadata.LicenseShortName` is `Public domain`, commit the SVG to
`demo/logos/<brand-key>.svg` and set `basis: 'commons-public-domain'`.

Prove it on these thirty first — sixteen Middle-Eastern and independent houses,
fourteen designer, chosen to cover every outcome this research actually saw:

*Own site, expected to work:* Al Haramain, Fragrance World, Armaf, French
Avenue, Maison Alhambra, Afnan, Paris Corner, Rasasi, Orchid, Bujairami,
Hugo Boss, Prada, Burberry, Chanel, Hermès.
*Own site, small icon only — expect to record nothing:* Ard Al Zaafaran,
Khadlaj, Zimaya, Jean Paul Gaultier, Carolina Herrera, Rabanne,
Narciso Rodriguez, Elizabeth Arden.
*Own site blocked, expect the Commons route:* Calvin Klein, Dolce & Gabbana,
Gucci, Dior, Lancôme.
*Expect no logo at all, monogram stands:* Lattafa (429 twice; retry from CI
before giving up — it is the single largest house at 483 products),
Louis Cardin.

Four of these are the named Wikidata traps: **Police** resolves to the band,
**Givenchy** to a French commune, **Louis Cardin** to a Canadian politician,
**Rasasi** to "Rasasienka". Do not accept a QID you have not opened.

**Test:** `npm run demo`, then open the Brands directory and the profile page
for each of the thirty in both themes. Ten of the top hundred should be spot-
checked against the shop's real homepage in a browser, side by side.

### Step 7 — Health check and the notice
Extend `scripts/image-link-check.ts` (`npm run images:check`) to sweep every
recorded `LogoRef.src` alongside the photo URLs, scoped the same way — a logo
whose CDN path has churned should surface in the same daily report a dead photo
does. Then make the two `demo/legal.ts` edits in §4f and add the
`tests/legalPages.test.ts` assertion.
**Test:** `npm run images:check -- --shop=justmylook` includes the logo URL;
the Terms page renders both new paragraphs; `npm run test` green.

### Step 8 — Offer rows (only after 1–7 have shipped and settled)
Add a 20px square mark left of `.shop` in `offerRow`, square assets only, same
`orgMark` helper. Roughly eight rows per detail page.
**Test:** a fragrance stocked at eight shops shows marks for those with one and
nothing at all — not a monogram, not a gap — for those without, since at 20px
beside a 15px name an initials tile is noise.

### What must not be done

- **No API key, token or client ID in this repo or in the shipped page.**
  `demo/index.html` is committed and public, and it *is* the deployment. This
  rules out Brandfetch and logo.dev regardless of how good their coverage is.
- **No hot-linking from a source whose terms are unclear.** Google's and
  DuckDuckGo's favicon endpoints are undocumented and publish no terms of use.
  "Everyone does it" is not a `basis` value.
- **No logo without a recorded basis, source URL and read date.** If you cannot
  say where it came from and when you looked, it does not ship. Same rule as
  `imageBasis`.
- **No altering a logo.** No recolouring, no `currentColor`, no cropping, no
  trimming, no adding a stroke to the artwork. Style the container instead.
  This is the clause the one read affiliate agreement actually contains.
- **No downloaded copy of a logo that is not `commons-public-domain`.**
  Hot-link it or leave it out.
- **No broken image, no empty box, no "no logo" icon, ever.** Monogram is the
  default and the logo is the override; every `<img>` carries the `onerror`.
  Commit `a52f32e0` removed 348 grey placeholder icons from this site nine days
  ago. Do not reintroduce the genre.
- **Do not guess a Wikidata entity from a name.** Four in thirty-eight were
  wrong.
- **Do not put a logo on `.sold-by` or `.phead-brand`.** 12px and 11px, dozens
  per screen.

---

## 6. Open questions for the owner

Two, and only one of them blocks anything.

1. **Does the owner accept the referential-use basis for showing a mark, in the
   same way the `hotlink-unlicensed` image basis was accepted?** §2c sets out
   the statute and the four conditions the design satisfies. This is the same
   kind of standing decision `docs/LEGAL.md` already records under "Still needs
   the owner" for image licensing — a known, bounded position rather than a
   bug. **Nothing in §5 should ship without a yes.**

2. **Is `demo/logos/` at up to 400 KB of committed Commons SVGs acceptable?**
   It is the only place this plan copies a file rather than referencing one,
   the licence for each is public domain and recorded, and the alternative is
   that roughly fifteen of the largest designer houses keep the monogram. Not a
   blocker for steps 1–5, which touch no committed file.
