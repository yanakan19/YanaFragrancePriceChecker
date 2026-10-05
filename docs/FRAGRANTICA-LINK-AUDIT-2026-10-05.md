# Fragrantica link audit, 5 October 2026

Owner request: check that every "Fragrantica" link on a product page goes straight
to that product's own Fragrantica page and not to a Fragrantica search, one by one.

The per product result is `data/fragrantica-link-audit.json` (id, brand, name, size,
concentration, gender, class, URL, how found, verdict; one product per line). It is
written by `npx tsx scripts/audit-fragrantica-links.ts --write` and needs no network.
The reviewed facts the audit relies on are in `data/fragrantica-link-review.json`.

## Short answer

- 26,571 products on the built page. Every one shows a Fragrantica link.
- **1,047 showed a direct page, 25,524 showed a search link, none was malformed.**
- Of the 1,047 direct links, **67 were not that product's page** (37 distinct product
  and page pairs). They are fixed: 36 links now go to the right page, 26 fall back to the
  search link, and 5 are the Frédéric Malle page under the address Fragrantica itself
  uses (the stored one differed in the case of one letter).
- After the fix: **1,048 direct, 25,523 search, 0 wrong.** 27 products gained a
  direct page and 40 moved from the main page to the page of their own strength.
- The search links are not wrong, but the pill said "Fragrantica" over them. It now
  says **Search Fragrantica** over a search link and **Fragrantica** only over a page.

## 1. Fragrantica robots.txt and the live check

- `https://www.fragrantica.com/robots.txt`, fetched as PriceSniffsBot
  (`src/catalogue/botIdentity.ts`): 200, 2,097 lines. There is no group for
  PriceSniffsBot, so the `User-agent: *` group applies. It does **not** disallow
  `/perfume/`. It disallows `/search` (only `/search/` with nothing after it is
  allowed), `/admin`, `/ajax`, `/goto.php`, `/social` and a few others. No Crawl-delay
  anywhere. (ClaudeBot, GPTBot, CCBot and PerplexityBot are blocked by name; the bot
  is none of those.)
- robots.txt therefore allows the product pages, so one request was made to a product
  page (`/perfume/Dior/Sauvage-31861.html`) to see whether the bot is let in.
  **Answer: HTTP 403, `cf-mitigated: challenge`, a "Just a moment..." Cloudflare page.**
  That is a refusal, so no Fragrantica product page was requested again, and nothing was
  worked around (no browser user agent, no rendered browser, no proxy). One
  robots.txt request and one page request in total, no parallel requests.
- So the live check was done as the task says for a refusal: **web search**, in
  "standard" mode, several searches per turn. For each page the search result was read
  for its title and address only: does the result for that perfume and designer name
  this exact Fragrantica page, and who is it for (women, men, women and men). No text,
  rating or note was taken from Fragrantica.

## 2. Counts (current catalogue, 26,571 products)

| | before | after |
|---|---|---|
| products | 26,571 | 26,571 |
| direct page | 1,047 | 1,048 |
| search link | 25,524 | 25,523 |
| malformed or other | 0 | 0 |
| direct, wrong for the product | 67 | 0 |
| direct, to review by eye | 14 | 19 |
| distinct Fragrantica pages used | 333 | 368 |
| brands with a direct link | 80 | 80 |

"Before" is the committed data read with the new rule, which is the only way to say how
many were wrong: the old pipeline flagged none of them.

How the direct links were found (the `method` fields in `data/fragrance-links.json`):

| | before | after |
|---|---|---|
| search result matched when searched (`bing-search`) | 800 | 740 |
| URL seen in an earlier search, matched again (`bing-seen`) | 247 | 308 |
| match quality `exact` (page names the strength) | 140 | 237 |
| match quality `base` (page names no strength) | 899 | 811 |
| match quality `loose` (strength unknown) | 8 | 0 |

The 19 review verdicts after the fix are all explained: a designer folder spelled
differently on Fragrantica (Arabiyat-Prestige, Floris, BellaVita, Maison-Martin-Margiela,
Frederic-Malle-Editions-de-Parfums), and Tom Ford Ombré Leather, whose page carries
"2018" (the 2018 Eau de Parfum is the one on sale; the later ones have "Parfum",
"Eau d'" and "Reserve" in their names). Each was read in a search result.

### Search links, and why they remain

25,523 products show a search link. For them no direct page has been found and
checked yet. The daily job (`Fragrance links daily`) works through them 30 minutes a day
by search engine result, never by fetching Fragrantica, and many perfumes have no page
on Fragrantica at all (shop own brands, bundles, oils). A search link cannot be wrong
(it never names a page), so it stays the fallback, and is now labelled as a search.

## 3. What was wrong, and how it was found

### Step 2: name, designer, strength, gender

Offline, for each of the 1,047 direct links: the designer folder against the brand, the
perfume name in the page address against the product name (accents, case, sizes,
"for Women and Men", edition words ignored), the strength the page names against the
product's, and the product's gender against the page's. The stored links had all passed
the old rule (same designer, same name, no contradicting Eau de Parfum against Eau de
Toilette). They failed on two things that rule did not look at.

**A page that names no strength was accepted for every strength.** Fragrantica's main
page, `Sauvage-31861`, is the Eau de Toilette. Fragrantica has separate pages for the
Parfum, the Extrait, the Cologne and the Eau Fraiche of the same perfume, and for many
Eau de Parfum. Under the old rule `Black Orchid Parfum`, `Eros Parfum`, `Aventus
Cologne`, `Sauvage Parfum` and 30 more were sent to the page of the original. That is
a different version, so it is wrong in a way that matters. The new rule keeps a base
page for an Eau de Toilette, an Eau de Parfum or an unknown strength and refuses it for
a Parfum, an Extrait, a Cologne, an Eau Fraiche, and for a product whose own name says
so. A page that states "Eau Fraiche" is compared on both sides (`White Tea` is not
`White Tea Eau Fraiche`).

**A page for one gender was shown for the other.** The catalogue name often drops
"for Men" ("Club De Nuit Intense Man" is sold as "Club De Nuit Intense"), and Fragrantica
keeps a men's and a women's page. `Armaf/Club-de-Nuit-Intense-27656` is the women's page and
was shown for the 105ml men's Eau de Toilette; `Burberry/London-813` and
`Calvin-Klein/Eternity-257` are women's pages shown for men's products.

All 67 wrong links, grouped (old page, then what the product shows now):

| Brand | Product | Strength | Was | Now | Links |
|---|---|---|---|---|---|
| Armaf | Club De Nuit Intense | Eau de Parfum | Armaf/Club-de-Nuit-Intense-27656 | search | 3 |
| Armaf | Club De Nuit Intense | Eau de Toilette | Armaf/Club-de-Nuit-Intense-27656 | search | 1 |
| Armaf | Club De Nuit Intense | Parfum | Armaf/Club-de-Nuit-Intense-27656 | search | 1 |
| Burberry | Hero | Parfum | Burberry/Hero-68627 | Burberry/Hero-Parfum-90069 | 1 |
| Burberry | London | Eau de Toilette | Burberry/London-813 | search | 2 |
| Calvin Klein | Eternity | Eau de Toilette | Calvin-Klein/Eternity-257 | search | 4 |
| Calvin Klein | Eternity | Parfum | Calvin-Klein/Eternity-257 | search | 1 |
| Calvin Klein | Eternity Cologne | Eau de Toilette | Calvin-Klein/Eternity-257 | search | 3 |
| Calvin Klein | Eternity Cologne for Men | Eau de Toilette | Calvin-Klein/Eternity-For-Men-258 | Calvin-Klein/Eternity-Cologne-For-Men-62323 | 1 |
| Calvin Klein | Eternity for Men | Parfum | Calvin-Klein/Eternity-For-Men-258 | Calvin-Klein/Eternity-Parfum-For-Men-75798 | 2 |
| Creed | Aventus Cologne | Disputed | Creed/Aventus-9828 | Creed/Aventus-Cologne-51692 | 2 |
| Creed | Viking Cologne | Eau de Parfum | Creed/Viking-41698 | Creed/Viking-Cologne-67039 | 1 |
| Creed | Viking Cologne Unisex | Eau de Parfum | Creed/Viking-41698 | Creed/Viking-Cologne-67039 | 1 |
| Davidoff | Cool Water | Parfum | Davidoff/Cool-Water-507 | search | 2 |
| Dior | Sauvage | Extrait de Parfum | Dior/Sauvage-31861 | search | 1 |
| Dior | Sauvage | Parfum | Dior/Sauvage-31861 | search | 4 |
| Dolce & Gabbana | The One For Men | Parfum | Dolce-Gabbana/The-One-for-Men-2056 | search | 2 |
| Elizabeth Arden | White Tea Eau Fraiche | Eau de Toilette | Elizabeth-Arden/White-Tea-42439 | Elizabeth-Arden/White-Tea-Eau-Fraiche-79933 | 2 |
| Escentric Molecules | Escentric 02 | Not stated | Escentric-Molecules/Escentric-02-Extrait-112764 | Escentric-Molecules/Escentric-02-3607 | 1 |
| Frédéric Malle | Portrait Of A Lady | Eau de Parfum | Frederic-Malle-Editions-de-parfums/Portrait-of-a-Lady-10464 | Frederic-Malle-Editions-de-Parfums/Portrait-of-a-Lady-10464 | 1 |
| Frédéric Malle | Portrait of a Lady | Eau de Parfum | Frederic-Malle-Editions-de-parfums/Portrait-of-a-Lady-10464 | Frederic-Malle-Editions-de-Parfums/Portrait-of-a-Lady-10464 | 4 |
| Giorgio Armani | Acqua Di Gio Parfum | Eau de Parfum | Giorgio-Armani/Acqua-di-Gio-410 | Giorgio-Armani/Acqua-di-Gio-Parfum-81508 | 4 |
| Gucci | Bloom | Parfum | Gucci/Gucci-Bloom-44894 | Gucci/Gucci-Bloom-Parfum-102753 | 2 |
| Guerlain | La Petite Robe Noire | Parfum | Guerlain/La-Petite-Robe-Noire-14681 | Guerlain/La-Petite-Robe-Noire-Parfum-121210 | 1 |
| Kilian | Good Girl Gone Bad Eau Fraîche | Not stated | By-Kilian/Good-Girl-Gone-Bad-15924 | By-Kilian/Good-Girl-Gone-Bad-Eau-Fraiche-59813 | 1 |
| Lattafa | Fakhar Lattafa Extrait | Eau de Parfum | Lattafa-Perfumes/Fakhar-Lattafa-30864 | search | 1 |
| Maison Francis Kurkdjian | Baccarat Rouge 540 | Extrait de Parfum | Maison-Francis-Kurkdjian/Baccarat-Rouge-540-33519 | Maison-Francis-Kurkdjian/Baccarat-Rouge-540-Extrait-de-Parfum-46066 | 3 |
| Rabanne | 1 Million Parfum | Eau de Parfum | Rabanne/1-Million-3747 | Rabanne/1-Million-Parfum-60035 | 1 |
| Rabanne | Invictus | Parfum | Rabanne/Invictus-18471 | Rabanne/Invictus-Parfum-90433 | 3 |
| Ralph Lauren | Polo Blue | Parfum | Ralph-Lauren/Polo-Blue-1198 | Ralph-Lauren/Polo-Blue-Parfum-73299 | 1 |
| Ralph Lauren | Polo Red | Parfum | Ralph-Lauren/Polo-Red-18598 | Ralph-Lauren/Polo-Red-Parfum-79161 | 2 |
| Ralph Lauren | Polo Red Parfum | Eau de Parfum | Ralph-Lauren/Polo-Red-Eau-de-Parfum-61990 | Ralph-Lauren/Polo-Red-Parfum-79161 | 1 |
| Tom Ford | Black Orchid Parfum | Eau de Parfum | Tom-Ford/Black-Orchid-1018 | Tom-Ford/Black-Orchid-Parfum-62199 | 1 |
| Tom Ford | Noir Extreme Parfum | Eau de Parfum | Tom-Ford/Noir-Extreme-29675 | Tom-Ford/Noir-Extreme-Parfum-75489 | 2 |
| Versace | Crystal Noir | Parfum | Versace/Crystal-Noir-631 | Versace/Crystal-Noir-Parfum-92276 | 2 |
| Versace | Eros Parfum | Eau de Parfum | Versace/Eros-16657 | Versace/Eros-Parfum-70090 | 1 |
| Versace | Pour Homme Eau Fraiche | Eau de Toilette | Versace/Versace-Pour-Homme-2318 | search | 1 |

"search" means no right page for that product was seen, so it shows the search link.
Two cases are worth saying out loud. `Versace Pour Homme Eau Fraiche` has no Fragrantica
page of that name (the page that exists is `Versace Man Eau Fraiche`, a different
name), and `Lattafa Fakhar Lattafa Extrait` is on Fragrantica as `Fakhar Extrait`, a name
the rule cannot tell is the same perfume. Neither was guessed at.

### Step 3: the live check by search

- Every one of the 54 flagged or reviewable cases (37 wrong, the rest to review) was covered by a search.
- A sample across brands: **206 of the 333 stored pages (755 of 1,047 links, 73 of the
  80 brands)** were each searched, and the result named that exact Fragrantica page
  for that perfume and designer (title and address), with the page's gender read.
  Beyond the 67 above, **no further wrong page was found**, apart from the two
  cases the review file records: the lower case spelling of the Malle folder (the
  address Fragrantica itself shows is `Editions-de-Parfums`), and the women's
  `Club-de-Nuit-Intense-27656` shown for the men's.
- The 127 stored pages not searched are not shown to be wrong. They pass the rule and
  carry the same risk as the sample, which was found to be nil outside the cases above.

What the search also gave, honestly used: the pages of the right strength (Parfum,
Cologne, Extrait, Eau de Toilette, Eau de Parfum) that the searches listed were added to
`data/fragrance-links-seen.json` (32 URLs), which is the list of addresses a search
engine has returned. The ordinary matching then took the exact page for 40 product
links that had been on the main page, and gave 27 products a page for the first time.
Nothing was constructed from a name and no id was invented: every address is one a
search result returned.

## 4. What changed in the pipeline

- `src/catalogue/fragranceLinkMatch.ts`: `matchFragranticaUrl` refuses a base page for a
  strength Fragrantica lists separately (`baseMayStandFor`), compares "Eau Fraiche" on both
  sides, and refuses a loose page that is a Parfum or Cologne for a product whose
  strength is unknown and name does not say so.
- `src/catalogue/fragranticaReview.ts` and `data/fragrantica-link-review.json`: what a
  person established about particular pages: pages rejected for a brand and name
  (`wrong`), pages confirmed to be the perfume's only page (`singlePage`, which let a
  base page stand for an Extrait: Afnan Stardust, Khadlaj Island, French Avenue
  Obsidian and others), and who each reviewed page is for (`pageGender`).
  `matchFragranticaChecked` is the rule a stored link must pass.
- `src/catalogue/fragranticaAudit.ts`: link shape (`classifyFragranticaUrl`: direct,
  search, malformed) and the offline audit (`auditFragranticaLink`).
- `scripts/resolve-fragrance-links.ts`: accepts a candidate only by
  `matchFragranticaChecked`; at the start of every run drops a stored Fragrantica
  link that no longer passes (36 entries went on the first run); and marks a product
  whose sibling's main page is not fit for it (`fragranticaRefused`), so it shows a
  search rather than a borrowed page. The daily workflow runs this script, so a wrong
  link cannot be written again and cannot survive a run.
- `src/catalogue/fragranceLinkStore.ts`: the page lookup no longer lends the main page
  to a Parfum, an Extrait, a Cologne or an Eau Fraiche, and honours the refusal marker.
- `demo/fragranceLinks.ts` and `demo/app.ts`: the pill reads "Search Fragrantica" over a
  search link (changelog entry).
- Tests: `tests/fragranticaLinkData.test.ts` holds every stored Fragrantica link to the
  rule (direct shape on www.fragrantica.com, designer, name, strength, gender, nothing
  the review rejected) and every other link to the search shape and the honest label;
  `tests/fragranticaAudit.test.ts` pins the rule, the review and the audit.

## 5. What is not covered

- **Gender of a page not in the review.** The page's gender is known for 203 pages
  (read from search result titles). A new link the daily job finds for a product whose
  name omits "for Men" or "for Women" could land on the other gender's page; the
  strength and name rules cannot see that. The remedy is to read the gender off the
  search result title when a page is first seen and store it with the address. It is
  a follow up, not done here.
- **Two pages of one name and strength.** Fragrantica has, for example, two Eau de
  Parfum pages for Armani Code (2021 and 2024), and a 2025 "Light Blue Eau de Toilette"
  beside the 2001 original that is also an Eau de Toilette. The matcher takes the first
  address in its list, and cannot tell which release a shop sells.
- **Names that differ.** A product whose Fragrantica page has a different name
  ("Fakhar Lattafa Extrait" against "Fakhar Extrait") stays a search link.
- Fragrantica itself was not fetched, so a page that has since been removed or
  redirected is not detected. The page titles come from search results as they stood
  on 5 October 2026.
