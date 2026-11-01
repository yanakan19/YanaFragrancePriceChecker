# Source

`launch-us-2-9x16.mp4` is the second US launch video, for the full US site (`pricesniffs.space/us`), made 1 November 2026
at the owner's request ("we've now got US, India and Canada sites"; one of three, with `2026-11-01-launch-india-2` and
`2026-11-01-launch-canada`). The owner wrote the length as "(1s long0"; the earlier launch videos were 10 seconds, so
**10.00 seconds was assumed**: 300 frames, 1080 x 1920, H.264, no sound, about 1.5 MB. Not committed (docs/DECISIONS.md D28).
Draw it again with `npm run social:render -- social/posts/2026-11-01-launch-us-2`. First made with:

    npx tsx scripts/social-video-launch.ts --video us2 --date 2026-11-01

Angle: **a price drop story in dollars**. Blue accent (`#4DA3FF`) in the black theme, price tags with the dear price struck
through and a drop arrow to the cheap one. Scenes are in `scripts/social-video-launch-sites.ts` (`US_SITES_VIDEO`).

| From (s) | Scene | Shows |
|---|---|---|
| 0.0 | drop-a (still until 0.8) | "Over $100 less for the same perfume", Tom Ford Black Orchid Parfum 100ml, Dillard's over $250, Fragrance Market under $200, Save $100+ |
| 1.8 | dissolve to drop-b | "Same again. Another $100 off", Gucci Guilty Pour Homme Parfum 90ml, Ulta Beauty over $150, The Perfume Spot under $100, Save $100+ |
| 3.7 | swipe to numbers | 20+ US shops compared, 20,000+ products in dollars, "Prices before sales tax" |
| 5.5 | dissolve to sites | "We've now got US, India and Canada sites", the three flag tiles (US lit), "Tag your friends who'd love to use our site" |
| 7.4 | swipe to PriceSniffs | Mark, wordmark, `pricesniffs.space/us`, held to 9.0, then the 1 s fade |

## Claims and the data behind them (built 2026-10-31 for the US region, `data/regions/us/`)

Figures are rounded in the visitor's favour (counts down, "over" and "under" away from the real price, savings down), so they
stay true as shops reprice. Prices are shelf prices before sales tax, in stock, as the catalogue lists them.

| On screen | Data on 1 Nov 2026 |
|---|---|
| 20+ US shops | 21 shops with products (`report.json`; 23 priced) |
| 20,000+ products | 22,626 (`report.json` `products`) |
| Black Orchid Parfum 100ml, Dillard's over $250 | Dillard's 300 (Bluemercury 300, Perfumania 249.99) |
| Fragrance Market under $200 | Fragrance Market 159 |
| Save $100+ | 300 minus 159 = 141 |
| Guilty Pour Homme Parfum 90ml, Ulta over $150 | Ulta 202 |
| The Perfume Spot under $100 | The Perfume Spot 93.06 |
| Save $100+ | 202 minus 93.06 = 108.94 |
| Prices before sales tax | `US_TAX_NOTE` (`src/types/regionRetailer.ts`) |

`tests/socialLaunchVideosSites.test.ts` holds the words, the layout, the 10 s length and the caption;
`tests/socialLaunchVideosSitesData.test.ts` (in the crawl, soft) holds each figure to the data as a rule.
If the crawl stops supporting a claim it shows as a finding: re-check the video then.

## Decisions

* **No "beta"**: the site is a full version now. No shop logos or bottle photos (D24 is still open).
* **Two examples, different shops each** (Dillard's against Fragrance Market, Ulta against The Perfume Spot), Tom Ford and
  Gucci, so no bottle or shop repeats in the India and Canada videos.
* **Caption** (`caption.txt`): 257 characters including four hashtags and the address once, no dashes, no "link in bio",
  no platform named, the tag your friends line. Checked by `tests/socialSingleCaptions.test.ts`.
