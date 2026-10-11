# Source

`launch-india-9x16.mp4` is the video for the India launch (`pricesniffs.space/in`, beta since 9 October 2026), made
11 October 2026 at the owner's request. It is the India twin of the US video (`social/posts/2026-10-10-launch-us-video/`),
which was made first; the India one had not been made. A short video saying PriceSniffs has launched in India too,
and one caption that asks viewers to tag their friends. It is drawn by `scripts/social-video-launch.ts` (the India
variant, `IN_LAUNCH_VIDEO`, added beside the US one, not a fork) from the shared video template
(`scripts/social-video-template.ts`; rules in `docs/SOCIAL-MEDIA-PLAN.md` section 9). 11.80 seconds, 354 frames,
1080 x 1920, H.264, no sound, about 1.2 MB. The video is not committed (docs/DECISIONS.md D28). Draw it again with
`npm run social:render -- social/posts/2026-10-11-launch-india-video`. The command that first made it:

    npx tsx scripts/social-video-launch.ts --video in --date 2026-10-11

The 9 October carousel (`social/posts/2026-10-09-launch-india/`) has no video and no call to tag friends; this post
adds both. It does not replace the carousel, and the carousel's caption is unchanged.

## Scenes (seconds)

| From | Scene | Shows |
|---|---|---|
| 0.0 | Launch (still until 0.8) | Wordmark, the Indian flag tile (`flagSvg('IN')`, the same tile as the country menu), BETA tag, "We've launched in India" |
| 2.3 | Dissolve to compare | "Compare perfume prices from 10+ Indian shops", "14,000+ products, in rupees", "GST included" |
| 4.7 | Swipe to shops | "Some of the shops": Nykaa, Perfume Palace, FridayCharm, Perfume Network, AAR Fragrances, Bella Vita Organic, "And more. This is a beta." |
| 7.0 | Dissolve to tag | An @ in a red ring, "Tag your friends who'd love this" (the same scene as the US video) |
| 9.2 | Swipe to PriceSniffs | The mark, the wordmark and `pricesniffs.space/in`, held to 10.8, then the one second fade to the background at 11.8 |

Owner's rules, all from the template: a still start (nothing moves for 0.8 s, so the first frame is a finished
cover), dissolves 0.5 s and swipes 0.4 s (none over half a second) with a slow zoom on every scene, the PriceSniffs
mark at the end with a 1 s fade, all text inside the safe box (x 110 to 970, y 380 to 1460; the renderer measures
it after the zoom and refuses to draw otherwise; the lowest text sits at about y 1305). Black theme, Liberation
Sans, no hyphens or dashes, British English. Checked by extracting frames at the start, in each scene and at the end.

## Numbers (from `data/regions/in/report.json`, built 2026-10-11T00:18:43Z)

| On screen | Report field | Value on 11 Oct |
|---|---|---|
| 10+ Indian shops | shops in `shops` with products (`shopsPriced` and `shopsEnabled` are 13) | 10 (13) |
| 14,000+ products | `products` | 15,793 |

Shop names (each is enabled in `src/config/retailers.in.ts` and has products in the report): Nykaa (1,544),
Perfume Palace (6,481), FridayCharm (6,271), Perfume Network (1,891), AAR Fragrances (2,228), Bella Vita Organic (127).

`tests/socialLaunchVideoIn.test.ts` holds the claims to those two sources: at least 10 shops with products, at least
14,000 products, every named shop switched on and present in the report, no switched off shop named (Purplle, Mirah
Belle, Kannauj Attar) and none of the three priced shops with no listing kept (Bombay Perfumery, Pilgrim, Gulab Singh
Johrimal), and the caption's figures equal to the video's.

## Decisions (nobody was asked, per the brief)

* **Same figures as the carousel: "10+" and "14,000+".** Both are still true today (the report now holds 15,793
  products, so "15,000+" would also be true), but the video and the carousel agree and the figures are rounded down
  so they stay true as the crawl moves. "10+" is the shops with products; the three priced shops with no kept
  listing are not counted or named, so a visitor never finds a promised shop empty.
* **Six shop names, the first six of the carousel's eight.** Wild Stone and The Man Company are left out so the
  screen stays easy to read in about two seconds. "And more" instead of a count.
* **"GST included" and "This is a beta."** on screen: the site's own tax wording (`IN_TAX_NOTE`) in short form, and
  BETA on the cover as on every carousel slide. No price is compared and no shop is called cheapest.
* **No shop logos and no bottle photos** (photo rule D24 is still open for Indian shops): only the flag tile, the
  site mark, text and shapes. The test fails if a scene holds an image or an address to load.
* **The address is on the end card** and in the caption once, as `pricesniffs.space/in` (DESIGN-SYSTEM section 5:
  no "link in bio").
* **9:16 only**, as the US video: one 1080 x 1920 canvas with its own safe box (y 380 to 1460), inside the centre
  crops the feed and profile grid take.
* **The tag scene is the US video's own scene**, reused, so the two videos cannot drift apart.
* **`--video us|in` on the script** (default `us`), so making one video never writes the other's folder.

## Caption (`caption.txt`)

One caption for every platform (DESIGN-SYSTEM section 5): 258 characters including the hashtags and the address,
four hashtags (`#perfume #fragrance #pricesniffs #perfumeindia`), the address once, no "link in bio", no platform
named, no hyphens or dashes, and the call to action "Tag your friends who'd love to use our site."
`tests/socialSingleCaptions.test.ts` checks it and `tests/socialLaunchVideoIn.test.ts` checks its figures and tag
line.
