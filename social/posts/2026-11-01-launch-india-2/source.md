# Source

`launch-india-2-9x16.mp4` is the second India launch video, for the full Indian site (`pricesniffs.space/in`), made 1 November
2026 at the owner's request ("we've now got US, India and Canada sites"; one of three, with `2026-11-01-launch-us-2` and
`2026-11-01-launch-canada`). The owner wrote the length as "(1s long0"; the earlier launch videos were 10 seconds, so
**10.00 seconds was assumed**: 300 frames, 1080 x 1920, H.264, no sound, about 1.4 MB. Not committed (docs/DECISIONS.md D28).
Draw it again with `npm run social:render -- social/posts/2026-11-01-launch-india-2`. First made with:

    npx tsx scripts/social-video-launch.ts --video in2 --date 2026-11-01

Angle: **a rupee story, MRP against the cheapest price**, with local shops. Saffron accent (`#FF9933`) in the black theme,
price bars against MRP and an MRP stamp. The rupee sign is drawn as a shape (Liberation Sans has no ₹). Scenes are in
`scripts/social-video-launch-sites.ts` (`IN_SITES_VIDEO`).

| From (s) | Scene | Shows |
|---|---|---|
| 0.0 | mrp (still until 0.8) | "Why pay MRP?", Azzaro Chrome For Him EDT 100ml, bar MRP over ₹6,500, bar Perfume Network under ₹4,000, Save 45%+ |
| 1.9 | swipe to shops | "Compare 12+ Indian shops", 18,000+ products GST included, Perfume Network, FridayCharm, Perfume Palace, Nykaa, Scentira, AAR Fragrances |
| 3.7 | dissolve to stamp | MRP stamp, Montblanc Legend For Men EDP 100ml, over ₹10,000 struck through, Perfume Network under ₹6,500, Save 40%+ |
| 5.6 | swipe to tag | An @ in a ring, "We've now got US, India and Canada sites", three flag tiles (India lit), "Tag your friends who'd love to use our site" |
| 7.4 | swipe to PriceSniffs | Mark, wordmark, `pricesniffs.space/in`, held to 9.0, then the 1 s fade |

## Claims and the data behind them (built 2026-11-01 for the India region, `data/regions/in/`)

Rounded in the visitor's favour (counts down, MRP "over" and prices "under" away from the real figure, savings down).
MRP is the shop's own stated reference price as the deals file keeps it (`wasPrice`, `referencePriceName` "MRP").

| On screen | Data on 1 Nov 2026 |
|---|---|
| 12+ Indian shops | 13 shops with products (`report.json`) |
| 18,000+ products | 18,336 (`report.json` `products`) |
| Chrome For Him: MRP over ₹6,500 | Perfume Network MRP 6,900 (`deals.json` `wasPrice`) |
| Perfume Network under ₹4,000 | 3,600 (cheapest of 5 shops) |
| Save 45%+ | 47% off (`percentOff`) |
| Legend For Men: MRP over ₹10,000 | Perfume Network MRP 11,100 |
| Perfume Network under ₹6,500 | 6,105 (cheapest of 3 shops) |
| Save 40%+ | 45% off |
| GST included | `IN_TAX_NOTE` ("Price includes GST.") |

Named shops are enabled in `src/config/retailers.in.ts` and have products in the report. `tests/socialLaunchVideosSites.test.ts`
holds the words, layout, length and caption; `tests/socialLaunchVideosSitesData.test.ts` (in the crawl, soft) holds each figure
to the data as a rule.

## Decisions

* **No "beta"**, no shop logos, no bottle photos (D24 is still open for Indian shops).
* **Shop list differs from the 11 October video** (Scentira added, Bella Vita Organic left out) and the first scene is a price
  story, not the flag.
* **Caption** (`caption.txt`): 257 characters including four hashtags and the address once, no dashes, no "link in bio", no
  platform named, the tag your friends line.
