# Source

`launch-canada-9x16.mp4` is the Canada launch video, for the full Canadian site (`pricesniffs.space/ca`), made 1 November 2026
at the owner's request ("we've now got US, India and Canada sites"; one of three, with `2026-11-01-launch-us-2` and
`2026-11-01-launch-india-2`). The owner wrote the length as "(1s long0"; the earlier launch videos were 10 seconds, so
**10.00 seconds was assumed**: 300 frames, 1080 x 1920, H.264, no sound, about 1.1 MB. Not committed (docs/DECISIONS.md D28).
Draw it again with `npm run social:render -- social/posts/2026-11-01-launch-canada`. First made with:

    npx tsx scripts/social-video-launch.ts --video ca --date 2026-11-01

Angle: **a loud reveal, then Canadian dollars**. The opening is a huge hook that fills the frame (owner request, 1 Nov 2026): the still first frame is the thumbnail, the 0.8 s still is kept, then a 0.5 s punch (`punchAt`, drawn through the renderer's `extra`) lands it. The brand red accent in the black theme, the Canadian flag tile opening, a price
ladder (cheapest at the top) for one bottle across shops. It does not say "first": nothing in the data shows it. Scenes are
in `scripts/social-video-launch-sites.ts` (`CA_SITES_VIDEO`).

| From (s) | Scene | Shows |
|---|---|---|
| 0.0 | hello-ca (still until 0.8, then a 0.5 s red sweep and lift) | The Canadian flag, "HELLO, CANADA" in capitals, "PriceSniffs Canada is here" |
| 1.9 | dissolve to sites | "Three sites now", the three flag tiles (Canada lit), "We've now got US, India and Canada sites" |
| 3.8 | swipe to ladder | "One bottle, 5 shops", Gucci Rush EDT 75ml, Discount Fragrances under $60, Fragrance Online Co. under $90, Maximum Fragrance over $130 |
| 5.6 | swipe to tag | 10 Canadian shops, 25,000+ products, an @ in a ring, "Tag your friends who'd love to use our site", "Prices before tax" |
| 7.4 | swipe to PriceSniffs | Mark, wordmark, `pricesniffs.space/ca`, held to 9.0, then the 1 s fade |

## Claims and the data behind them (built 2026-10-31 for the Canada region, `data/regions/ca/`)

Rounded in the visitor's favour. Prices are before tax, in Canadian dollars, in stock, as the catalogue lists them.

| On screen | Data on 1 Nov 2026 |
|---|---|
| 10 Canadian shops | 10 shops with products (`report.json`; 10 enabled and priced; the smallest has 2 products) |
| 25,000+ products | 26,688 (`report.json` `products`) |
| 5 shops | 5 shops list Gucci Rush 75ml in stock (6 list it, 1 is out of stock) |
| Discount Fragrances under $60 | 56.75 |
| Fragrance Online Co. under $90 | 84.95 |
| Maximum Fragrance over $130 | 134.92 |
| Prices before tax | `CA_TAX_NOTE` (`src/types/regionRetailer.ts`) |

The ladder's bars are in the order of the prices, not to scale. `tests/socialLaunchVideosSites.test.ts` holds the words,
layout, length and caption; `tests/socialLaunchVideosSitesData.test.ts` (in the crawl, soft) holds each figure to the data as a
rule. "10 Canadian shops" is exact today, not rounded down: if a shop drops out the check shows a finding, so change the
claim then.

## Decisions

* **No "beta"**, no shop logos or bottle photos, no "first of its kind" claim.
* **Caption** (`caption.txt`): 263 characters including four hashtags and the address once, no dashes, no "link in bio", no
  platform named, the tag your friends line.
