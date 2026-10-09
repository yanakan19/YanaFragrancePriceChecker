# Source

Launch post for the US beta (`pricesniffs.space/us`), made 9 October 2026 for the owner. A four slide 3:4
carousel (1080 x 1440) in the **standard black theme**, reel safe, built with `slide()` from
`scripts/socialSlides.ts`, plus the 9:16 TikTok version of the cover (`slide-1-9x16.png`, from
`slide-1-3x4.html` by `tiktokSlide`). The HTML beside this file is the source of every picture; the
pictures are not committed (D28). Draw them with `npm run social:render -- social/posts/2026-10-09-launch-us`.

1. Cover: the US flag (`flagSvg('US')` from `demo/flags.ts`, the same tile as the country menu), BETA tag,
   "PriceSniffs is now in the US", the address.
2. The numbers.
3. Eight of the enabled US shops, as plain text names.
4. End slide: the PriceSniffs mark and the address.

## Numbers (from `data/regions/us/report.json`, built 2026-10-09T07:09:59Z)

| On the slide | Report field | Value |
|---|---|---|
| 20+ US shops compared | shops in `shops` with products, `shopsPriced` is 22 | 20 (22) |
| 22,000+ products listed | `products` | 22,512 |
| 30,000+ shop prices | `listingsKept` | 30,534 |

Decisions (nobody was asked, per the brief):

* **"20+", not 22.** `shopsPriced` counts 22 shops, but two of them (Imaginary Authors, Boy Smells) have no
  listing kept in the catalogue, so the report's per shop list holds 20. "20+" is true on either count and a
  visitor never finds a promised shop empty.
* **Products rounded down** to the thousand, as asked. The crawl rebuilds the report, so the site's own
  counts may differ later.
* **Shop names** are enabled in `src/config/retailers.us.ts` AND have products in the report: Ulta Beauty
  (639), Bluemercury (648), Perfumania (4,195), Luckyscent (1,061), Aedes (705), Beauty Encounter (5,079),
  Twisted Lily (181), Ministry of Scent (1,624), each count being the report's own `products`.
  No shop that is off (Jomashop, Dillard's, eCosmetics,
  Nordstrom) is named. "And more" instead of a count, so the line stays true when shops are added.
* **No shop or bottle imagery** (photo rule D24 is pending for US shops): only the site's flag tile, mark,
  text and shapes.
* **"Prices in $, before sales tax"** is the site's own tax wording (`US_TAX_NOTE`). "Beta" is on the cover,
  the numbers slide, the shops slide and the end slide.
* **The address is on the pictures** (cover and end slide), because the owner's launch brief asked for it.
  DESIGN-SYSTEM section 5 keeps it off the daily posts; this one uses the 8 October rule instead: one
  caption, with the address written out and no "link in bio".
* Spelling is British English, no hyphens or dashes. No price claim and no shop is named as cheapest.
* The caption was screened with the yanaaidetection skill: 93% human, Low band, no Stage 1 markers (short
  text, so a rough estimate).
