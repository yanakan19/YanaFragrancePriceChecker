# Source

`launch-us-9x16.mp4` is the video for the US launch (`pricesniffs.space/us`, beta since 9 October 2026), made
10 October 2026 at the owner's request: a short video saying PriceSniffs has launched in the US too, and one
caption that asks viewers to tag their friends. It is drawn by `scripts/social-video-launch.ts` from the shared
video template (`scripts/social-video-template.ts`; rules in `docs/SOCIAL-MEDIA-PLAN.md` section 9), so it moves
exactly like the 8 October videos. 11.80 seconds, 354 frames, 1080 x 1920, H.264, no sound, about 1.2 MB.
The video is not committed (docs/DECISIONS.md D28). Draw it again with
`npm run social:render -- social/posts/2026-10-10-launch-us-video`. The command that first made it:

    npx tsx scripts/social-video-launch.ts --date 2026-10-10

The 9 October carousel (`social/posts/2026-10-09-launch-us/`) has no video and no call to tag friends; this post
adds both. It does not replace the carousel, and the carousel's caption is unchanged.

## Scenes (seconds)

| From | Scene | Shows |
|---|---|---|
| 0.0 | Launch (still until 0.8) | Wordmark, the US flag tile (`flagSvg('US')`, the same tile as the country menu), BETA tag, "We've launched in the US" |
| 2.1 | Dissolve to compare | "Compare perfume prices from 20+ US shops", "22,000+ products, in dollars", "Prices before sales tax" |
| 4.6 | Swipe to shops | "Some of the shops": Ulta Beauty, Bluemercury, Perfumania, Luckyscent, Beauty Encounter, Ministry of Scent, "And more. This is a beta." |
| 6.9 | Dissolve to tag | An @ in a red ring, "Tag your friends who'd love this" |
| 9.2 | Swipe to PriceSniffs | The mark, the wordmark and `pricesniffs.space/us`, held to 10.8, then the one second fade to the background at 11.8 |

Owner's rules, all from the template: a still start (nothing moves for 0.8 s, so the first frame is a finished
cover), dissolves 0.5 s and swipes 0.4 s (none over half a second) with a slow zoom on every scene, the PriceSniffs
mark at the end with a 1 s fade, all text inside the safe box (x 110 to 970, y 380 to 1460; the renderer measures
it after the zoom and refuses to draw otherwise). The lowest text sits at about y 1305. Black theme, Liberation
Sans, no hyphens or dashes, British English.

## Numbers (from `data/regions/us/report.json`, built 2026-10-10T14:43:01Z)

| On screen | Report field | Value on 10 Oct |
|---|---|---|
| 20+ US shops | shops in `shops` with products (`shopsPriced` and `shopsEnabled` are 22) | 20 (22) |
| 22,000+ products | `products` | 23,229 |

Shop names (each is enabled in `src/config/retailers.us.ts` and has products in the report): Ulta Beauty (1,134),
Bluemercury (645), Perfumania (4,197), Luckyscent (1,320), Beauty Encounter (5,079), Ministry of Scent (1,623).

`tests/socialLaunchVideo.test.ts` holds the claims to those two sources: at least 20 shops with products, at
least 22,000 products, every named shop switched on and present in the report, no switched off shop named
(Jomashop, Dillard's, eCosmetics, Nordstrom), and the caption's figures equal to the video's.

## Decisions (nobody was asked, per the brief)

* **Same figures as the carousel: "20+" and "22,000+".** Both are still true today (the report now holds 23,229
  products), so the video and the carousel agree. They are rounded down so they stay true as the crawl moves.
  "20+" is the shops with products, as on the carousel; the two priced shops with no kept listing (Imaginary
  Authors, Boy Smells) are not counted.
* **Six shop names, not the carousel's eight.** Aedes and Twisted Lily are left out so the screen stays easy to read
  in about two seconds; the six shown are the larger ones. All eight were checked on 9 October and the six are
  checked again by the test. "And more" instead of a count.
* **"Prices before sales tax" and "This is a beta."** on screen: the site's own tax wording (`US_TAX_NOTE`) in short
  form, and BETA on the cover as on every carousel slide. No price is compared and no shop is called cheapest.
* **No shop logos and no bottle photos** (photo rule D24 is still open for US shops): only the flag tile, the site
  mark, text and shapes. The test fails if a scene holds an image or an address to load.
* **The address is on the end card**, as the owner asked, and in the caption once, as `pricesniffs.space/us`
  (DESIGN-SYSTEM section 5 rule for videos from 8 October: no "link in bio").
* **9:16 only.** The template is one 1080 x 1920 canvas with its own safe box; a 4:5 or 3:4 version would need a
  second canvas, safe box and layout, so it was not made. The safe box (y 380 to 1460) also sits inside the centre
  crops the feed and the profile grid take (4:5 shows y 285 to 1635, 3:4 shows y 240 to 1680), so nothing is cut when
  the platforms crop it.
* **"Tag your friends who'd love this"** on screen, in the template's headline type, with "friends" as the one red
  word. The @ in a ring is a plain shape, the same weight as the mark's ring.
* **A new picture type, "launch-video"**, rather than squeezing this into the informative videos (those must be 20 to
  30 seconds and red). `VIDEO_TEMPLATE.launch` holds 10 to 12 seconds and the black theme; `render-social.ts`,
  `socialPictures.ts` and their tests know the new type.

## Caption (`caption.txt`)

One caption for every platform, as the owner's rule says (DESIGN-SYSTEM section 5): 257 characters including the
hashtags and the address, four hashtags (`#perfume #fragrance #pricesniffs #perfumeusa`), the address
`pricesniffs.space/us` once, no "link in bio", no platform named, no hyphens or dashes, and the call to action
"Tag your friends who'd love to use our site." `tests/socialSingleCaptions.test.ts` checks it (every post dated
9 October 2026 or later is found by name) and `tests/socialLaunchVideo.test.ts` checks its figures and tag line.
It was screened with the yanaaidetection skill: 96% human, Very Low band, no Stage 1 markers (short text, so a
rough estimate).
