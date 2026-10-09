# Source

Launch post for the India beta (`pricesniffs.space/in`), made 9 October 2026 for the owner. A four slide 3:4
carousel (1080 x 1440) in the **standard black theme**, reel safe, built with `slide()` from
`scripts/socialSlides.ts`, plus the 9:16 TikTok version of the cover (`slide-1-9x16.png`, from
`slide-1-3x4.html` by `tiktokSlide`). The HTML beside this file is the source of every picture; the
pictures are not committed (D28). Draw them with `npm run social:render -- social/posts/2026-10-09-launch-india`.

1. Cover: the Indian flag (`flagSvg('IN')` from `demo/flags.ts`, the same tile as the country menu), BETA
   tag, "PriceSniffs is now in India", the address.
2. The numbers.
3. Eight of the enabled Indian shops, as plain text names.
4. End slide: the PriceSniffs mark and the address.

## Numbers (from `data/regions/in/report.json`, built 2026-10-09T07:08:12Z)

| On the slide | Report field | Value |
|---|---|---|
| 10+ Indian shops compared | shops in `shops` with products, `shopsPriced` is 13 | 10 (13) |
| 14,000+ products listed | `products` | 14,693 |
| 16,000+ shop prices | `listingsKept` | 16,624 |

Decisions (nobody was asked, per the brief):

* **"10+", not 13.** `shopsPriced` counts 13 shops, but three of them (Bombay Perfumery, Pilgrim, Gulab Singh
  Johrimal) have no listing kept in the catalogue, so the report's per shop list holds 10. "10+" is true on
  either count and a visitor never finds a promised shop empty.
* **Products rounded down** to the thousand, as asked. The crawl rebuilds the report, so the site's own
  counts may differ later.
* **Shop names** are enabled in `src/config/retailers.in.ts` AND have products in the report: Nykaa (941),
  Perfume Palace (6,482), FridayCharm (6,260), Perfume Network (1,891), AAR Fragrances (1,087), Bella Vita
  Organic (127), Wild Stone (104), The Man Company (80), each count being the report's own `products`.
  No shop that is off (Purplle, Mirah Belle, Kannauj
  Attar) is named. "And more" instead of a count.
* **No shop or bottle imagery** (photo rule D24 is pending for Indian shops): only the site's flag tile,
  mark, text and shapes.
* **"Prices in ₹, GST included. MRP is the reference price"** follows the region config (`taxModel`
  `gst-included-mrp`, `referencePriceName` `MRP`) and `IN_TAX_NOTE`. "Beta" is on the cover, the numbers
  slide, the shops slide and the end slide.
* **The address is on the pictures** (cover and end slide), because the owner's launch brief asked for it.
  DESIGN-SYSTEM section 5 keeps it off the daily posts; this one uses the 8 October rule instead: one
  caption, with the address written out and no "link in bio".
* Spelling is British English, no hyphens or dashes. No price claim and no shop is named as cheapest.
* The caption was screened with the yanaaidetection skill: 96% human, Very Low band, no Stage 1 markers
  (short text, so a rough estimate).
