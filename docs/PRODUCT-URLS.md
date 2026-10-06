# Product addresses

Status: design written 2026-10-05 before the build. The "Measured" section at
the end is filled in from the real catalogue once the build exists.

Owner request (5 Oct 2026): a product lives at `pricesniffs.space/<PRODUCT>`
where PRODUCT is `BRAND_NAME_VOLUME`, for example `/creed_aventus_100ml`,
instead of `/fragrance/<id>` where the id is `ean-6290171075189`,
`justmylook-mfk0004`, `cult-beauty-global-10547300` and so on.

## The rule in one line

```
slug = BRAND _ NAME _ [STRENGTH _] [VERSION _] VOLUME
```

Every part is lower case `a` to `z` and `0` to `9`. The only separator is one
underscore. There are no hyphens, dots or other characters, and no leading,
trailing or doubled underscore. Multi word brands and names are joined with the
same single underscore, so `/maison_francis_kurkdjian_baccarat_rouge_540_35ml`
is brand `maison_francis_kurkdjian`, name `baccarat_rouge_540`, volume `35ml`.
The boundary between brand and name is not recoverable from the text and is not
meant to be (see "Direction of the mapping").

## 1. How the text is built

Brand is the catalogue's display brand (`brand`), name is the display name
(`name`, which already had the strength, edition and shop label cleaning of
`src/catalogue/productName.ts` applied), volume comes from `sizeMl`. The same
fields the product page shows.

Folding a piece of text (`fold`), in order:

1. Unicode NFKD, then the combining marks are removed: `Estée Lauder` becomes
   `estee lauder`, `Chloé` `chloe`, `Lancôme` `lancome`.
2. Letters NFKD leaves alone are mapped by hand: `ß` to `ss`, `æ` to `ae`,
   `œ` to `oe`, `ø` to `o`, `đ` to `d`, `ł` to `l`, `ð` to `d`, `þ` to `th`,
   `ı` to `i`.
3. Lower case.
4. Apostrophes are dropped, not turned into a separator: `L'Interdit` becomes
   `linterdit`, `Men's` becomes `mens`. The straight apostrophe, the curly ones
   (`’` `‘`), the backtick and the acute accent `´` count.
5. `&` is the word `and`: `Dolce & Gabbana` becomes `dolce_and_gabbana`.
6. Every other run of characters outside `a-z0-9` (spaces, hyphens, dots,
   slashes, brackets, `°`, `+`, `%`, any letter with no Latin form) becomes one
   `_`. Leading and trailing `_` are cut. `N°5` becomes `n_5`.

The name part drops a leading copy of the brand when something is left after
it (`Lacoste | Lacoste Red` is `lacoste_red_...`, not `lacoste_lacoste_red_...`).

A part that folds to nothing (a brand or a name entirely in a script with no
Latin form) is written `brand` or `product`, so every slug has three parts.

### Volume part

| Product | Volume part | Example |
|---|---|---|
| Whole number of ml | `<n>ml` | `100ml`, `7ml` |
| Fraction of a ml | the point is the letter `p` | `7.5ml` is `7p5ml`, `4.5ml` is `4p5ml` |
| Gift set (`giftSet` is set, `sizeMl` is null) | `set` | `.._shower_gel_set` |
| No size: the shop titles state two conflicting sizes (`sizeMl` null, not a gift set) | `nosize` | `.._nosize` |

A gift set has no single size, and what is in it is in its name, so its volume
part is the word `set`. A trailing `gift set` or `set` in the name is dropped
before the volume part is added so the slug does not end `set_set`. The name of
a gift set that is nothing but those words is written `gift`.

The volume part is always the last part. `^(\d+(p\d+)?ml|set|nosize)$` on the
last part is what makes a slug recognisable as a product address.

### Length

The brand and name together are cut at a part boundary to 80 characters (the
first part of the name is always kept, so a slug is never only a brand). Long
gift set names are the reason: the longest brand plus name in the catalogue is
222 characters. A cut can make two products collide, which the next section
handles like any other collision.

## 2. Collisions

Two different products can give the same brand, name and volume: Eau de Toilette
against Eau de Parfum, an edition, a gender version, a travel spray against a
bottle, a tester or a set version that the name does not tell apart, or two
long gift set names cut to the same 80 characters.

When two or more products would take the same slug in one build:

1. **Strength.** The strength token goes in front of the volume, on every one
   of them: `creed_aventus_edt_100ml` and `creed_aventus_edp_100ml`. The token
   comes from the product's `concentration`:

   | concentration | token |
   |---|---|
   | Eau de Parfum | `edp` |
   | Eau de Toilette | `edt` |
   | Extrait de Parfum | `extrait` |
   | Parfum | `parfum` |
   | Eau de Cologne | `cologne` |
   | Perfume Oil | `oil` |
   | Aftershave | `aftershave` |
   | Eau Fraiche | `fraiche` |
   | Attar | `attar` |
   | Not stated | `unstated` |
   | Disputed | `disputed` |
   | anything else | the folded text |

2. **Version, as a last resort.** If products still share a slug (same strength
   as well), they are ordered by product id. The first keeps the slug with the
   strength, the next ones add `v2`, `v3` and so on in front of the volume:
   `creed_aventus_edp_v2_100ml`. Ordered by product id so the result does not
   depend on the order the catalogue happens to be listed in.

The prompt this was built from said to append the strength after the volume.
It goes in front of it instead, because the owner's other rule is that the
volume is always the last part, and the routing proof below depends on the
last part being a volume.

### Collisions with a slug already given

A slug is never reassigned (next section). So when a product arrives in a later
build and its plain slug is already held by another product, the new product
takes the strength form (and then a version if that is held too) and the older
product keeps the plain slug. "Strength on both" therefore holds for products
that arrive together, which is the first build for everything in the catalogue
today, and not for one that arrives later.

## 3. A slug is never reassigned

The assigned slugs are in `data/product-slugs.json`, committed, one entry per
product id ever given a slug:

```json
{ "slugs": { "ean-3348901486183": "creed_aventus_100ml", "...": "..." } }
```

`npm run catalogue:demo` reads its own last copy of the file and, for each
product, in this order:

1. keeps the slug the product already has, whatever its name, size or strength
   is now (a rename in the catalogue does not move a published address);
2. otherwise builds a slug by the rules above, avoiding every slug in the file,
   including the slugs of products that have since left the catalogue or been
   merged away;
3. writes the file back, sorted by id.

New products are given slugs in order of their id, so a rebuild of the same
inputs writes the same file.

The file is listed in `scripts/generated-files.txt` as `rebuild`: the crawl
commits it with the other rebuilt files, and on a merge conflict it is rebuilt
and not merged by hand (CLAUDE.md). It must be committed, not rebuilt at deploy
time, because the deploy builds from committed sources only and an address must
come out the same on every build. The slug is also written onto each catalogue
entry (`slug` in `demo/catalogue.generated.ts`) and each page with no current
prices (`demo/dormant.generated.ts`), which is what the deploy build and the
page read.

### Merged products

When the catalogue merges a product into another (`data/id-aliases.json`), the
absorbed product's slug stays in `data/product-slugs.json` and becomes an alias
of the survivor: the old address opens the survivor and the address bar is
rewritten to the survivor's slug. The aliases ride in the lazy dormant data file
with the id aliases (`SLUG_ALIASES`), so the first load does not grow by them.
A slug that belonged to a product that is gone and was never merged answers Page
Not Found, as its old id address does.

**A shop's barcode arriving (Perfume Direct, 2026-10-05).** A listing that gains a
barcode changes id (`perfume-direct-17448pd` becomes `ean-0783320411175`; a gift
set's `set-<title>` becomes `set-ean-<ean>`), so the product it was is folded into
the product of that barcode, which is a new product when no other shop sold the
barcode. That product is given its own address by the rules above, and because
the old product's plain address is still held (never reassigned) it usually takes
the strength form. The old id and the old address both open it: the id through
`data/id-aliases.json` (`listingIdForms` lists the SKU form, the barcode form and,
for a set, the title form), the address through `SLUG_ALIASES`. Checked on the
rebuilt data after the first barcodes: every id and address Perfume Direct's 3,094
products held before them still opens a page. The cost is that those products'
published address moves once, and the old one redirects.

### Both memory files are append only

`data/id-aliases.json` and `data/product-slugs.json` only grow. A key is never
dropped and its value is never changed (measured 2026-10-06 over the last 60
commits: the old build had lost 50 id aliases and re-pointed about 950).

- **The file is the record, the page gets a flat map.** The record keeps chains
  (`old -> old target -> survivor`) as they happened. The build resolves each
  chain to the page that holds the id now and ships that one hop map
  (`ID_ALIASES`, `SLUG_ALIASES`) in the lazy dormant file.
- **A product folded again** adds one key (the old target to the new survivor);
  the earlier key keeps its value. A target that vanished before this build
  learned where its id went gets a key of its own pointing at the survivor.
- **An alias key that is a live product again:** the live product wins, the
  address opens the product, not a redirect. The key stays in the record, so if
  that product is folded away again the old address redirects once more.
- **A key whose product is gone from every shop** stays recorded, is not
  served, and its address answers the existing Page Not Found. (6 on
  2026-10-06; they are listed in `tests/fixtures/id-aliases-reference.json`.)
- **Guards:** `settleIdAliases` and `assignSlugs` throw rather than return a
  smaller or rewritten set, and the build checks the result against the file on
  disk before writing. `tests/idAliasesAppendOnly.test.ts` checks the committed
  file against the stored reference keys. To raise the reference, append keys to
  the fixture; never remove one.

## 4. Routing: no clash with the site's own routes

The site's own routes are single words: `/search`, `/deals`, `/brands`,
`/retailers`, `/notes`, `/about`, `/settings`, `/suggestions`, `/account`,
`/design`, `/legal`, `/gift-sets` (an alias), `/fragrance` (the old product
address, which always has a second segment) and the files in `demo/` (`sw.js`,
`robots.txt`, `sitemap.xml`, `ads.txt`, `manifest.webmanifest`, `favicon.svg`,
`CNAME`, `icons/`, `data/`, `logos/`). `/oils` and `/sets` are not routes today
but are reserved too.

A slug always has at least two underscores (brand, name and volume are three
parts) and no route or file above has an underscore, so no slug can equal one.
That is true by construction and tests/productSlug.test.ts proves it three
ways: every slug in the committed map is checked against the product pattern
and against the list of reserved words, every route name read from the router's
own tables is checked not to match the product pattern, and every entry of
`demo/` is checked the same way. `assignSlugs` also refuses to hand out a slug
that is a reserved word or does not have the product shape, so a bug in the
folding cannot ship one.

`matchRoute` treats a single path segment as a product address only when it
matches `^[a-z0-9]+(_[a-z0-9]+){2,}$` and its last part is a volume. Any other
single segment is Page Not Found as before. A segment with capital letters that
folds to a slug (someone retyped it) is accepted and the address bar is
rewritten to the lower case form.

## 5. Old addresses

`/fragrance/<id>` keeps working forever:

- the product opens and the address bar is rewritten to the new address with
  `history.replaceState` (no history entry, Back does not return to the old one);
- the canonical is the new address, and the page says `noindex` while the old
  address is in the bar (it is the same pattern the absorbed id redirect uses);
- an id that a merge absorbed (`data/id-aliases.json`) opens the survivor and
  lands on the survivor's new address;
- the wishlist and account keep storing ids. Nothing stored is rewritten, and a
  saved id works however it is opened;
- price alert emails link to the new address;
- the old address in a shared link, a bookmark, an old email or an old social
  post is answered by the redirect.

## 6. Everywhere an address is built

`routeToPath` in `demo/router.ts` is the one builder. The router has no
catalogue, so the page registers the id to slug lookup at start up
(`setProductSlugLookup`) from the catalogue entries and, once the lazy file is
in, from the pages with no current prices. For a product route it returns the
new address; for an id it does not know it falls back to the old address, which
redirects. Everything that builds a product link goes through it: the address
bar (`syncUrl`), the canonical and Open Graph address (`demo/head.ts`), the
Share button (`demo/share.ts`), the wrong price email, structured data and
canonicals.

Outside the page: the sitemap (`scripts/build-sitemap.ts`), price alert emails
(`src/alerts/run.ts`, `scripts/price-alerts.ts`), and the social post scripts
(`scripts/social-deal-of-day.ts`, `scripts/social-savings.ts`) read the slug
from the catalogue or from `data/product-slugs.json`.

The service worker has no path based deep link handling: a navigation is
network first with the cached `index.html` as the offline fallback, for any
path. A new address needs nothing in it, and a test registers the worker from a
product address to check.

## 7. The static host, honestly

GitHub Pages has one HTML file for the whole app. For a path with no file it
serves `demo/404.html` (an identical copy of `index.html`) **with HTTP status
404**. That is true of `/fragrance/<id>` today and it is true of every new
address. Nothing here changes it, and nothing here claims to:

- A person sees the page normally. A script that fetches the address gets the
  full app and a 404 status. The social scripts' live link check already
  accepts 200 or 404 with the catalogue data file named in the page, and the
  new addresses pass the same check.
- Search engines that run the page see the product and the new canonical, but a
  crawler that trusts the status code sees a 404 for every product address.
  That is the cost of a static host with one HTML file, as it was for the old
  address, and the address change makes it neither better nor worse. Fixing it
  needs either a server or a real HTML file per product (about 26,000 files,
  each carrying the whole app), neither of which this change adds.
- The sitemap lists the new addresses and names no old ones.

## 8. Direction of the mapping

Slug to product id is a lookup in the committed map (and its aliases). It is
deliberately not computed back from the text: the text is lossy (accents,
punctuation, cut length, the strength and version that a collision added). The
other direction, from a product to its slug, is the stored entry, so the
address of a product does not depend on how the rules might change later.

## Measured

From the catalogue as built on 2026-10-05 (`npm run catalogue:demo` with no
earlier `data/product-slugs.json`, so every product was given its slug in the
same batch). 26,571 products, none with a page with no current prices at that
moment.

**Collisions.** 889 groups of products wanted the same brand, name and volume,
1,904 products in all (7.2%); the largest group had 5.

| Outcome | Products |
|---|---|
| Plain `brand_name_volume` | 24,667 |
| Strength added (`_edp_`, `_edt_` and so on) | 1,660 |
| Strength and a version added (`_edp_v2_` and so on) | 244 (217 `v2`, 24 `v3`, 6 `v4`) |

The strength suffixes handed out: `edp` 735, `edt` 560, `parfum` 195,
`extrait` 94, `aftershave` 25, `cologne` 18, `unstated` 18, `fraiche` 8,
`disputed` 6, `oil` 1. (A product that took a version had its strength added
too; they are counted in the third row, not in this list.)

**Shapes.** 2,692 gift sets end `_set`, 1 product ends `_nosize`, 532 have a
fractional size (`7p5ml`). Mean slug length 36.9 characters. The longest is 95:

```
maurer_and_wirtz_4711_acqua_colonia_lychee_and_white_mint_gift_set_50ml_edc_75ml_cologne_v2_set
```

The four after it are 91 and 92 characters, all gift sets. No slug is
invalid, reserved or duplicated (tests/productSlugMap.test.ts).

**Size added.**

| File | Before | After | Added |
|---|---|---|---|
| `data/product-slugs.json` (committed, not shipped) | none | 2.0 MB, 380 KB gzipped | 2.0 MB |
| `demo/catalogue.generated.ts` (committed) | 37.2 MB | 38.6 MB | 1.4 MB |
| Catalogue array inside the first load data file | 10.5 MB | 11.8 MB | 1.25 MB raw, 225 KB gzipped (1.46 MB to 1.69 MB) |
| Lazy dormant file | 0.61 MB | 0.61 MB | the `slug` of each dormant page and `SLUG_ALIASES` (empty at first, one line per merged product with a slug later) |

The first load grows by about 225 KB gzipped, the cost of carrying a slug on
every catalogue entry so a link can be built for a tile with no lookup. The map
file grows by about 75 bytes per new product, and never shrinks.

## Checked on the live site

2026-10-05, after the deploy of the commit that listed the new addresses in the
sitemap (the push started the deploy; no workflow was dispatched by hand). The
live pages were loaded in Chromium with every request to pricesniffs.space
fetched over the verified proxy channel and handed to the page unchanged.

| Address | HTTP status | In the browser |
|---|---|---|
| `/dior_dune_100ml` | 404 with the app (853,206 bytes) | opens Dior Dune 100ml, address kept, canonical `https://pricesniffs.space/dior_dune_100ml`, no noindex |
| `/fragrance/ean-3348900103870` (old) | 404 with the app | opens the same product, bar rewritten to `/dior_dune_100ml`, same canonical, no noindex once rewritten |
| `/fragrance/al-haramain-ahp1756` (absorbed id) | 404 with the app | opens Al Haramain Mystique for Women 100ml, bar rewritten to `/al_haramain_mystique_for_women_100ml` |

The sitemap lists 27,646 URLs: 26,571 product addresses of the form
`/brand_name_volume`, none of them `/fragrance/<id>`, and `/dior_dune_100ml` is
among them. The 404 status is the host's (section 7), as it was for the old
address.
