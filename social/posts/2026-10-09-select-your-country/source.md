# Source

"Select your country" post, made 9 October 2026 for the owner to go with the US and India beta launches. One
3:4 picture (1080 x 1440) in the **standard black theme**, reel safe, built with `slide()` from
`scripts/socialSlides.ts`, plus its 9:16 TikTok version (`slide-1-9x16.png`, from `slide-1-3x4.html` by
`tiktokSlide`). The HTML beside this file is the source; the pictures are not committed (D28). Draw them with
`npm run social:render -- social/posts/2026-10-09-select-your-country`.

The three rows follow the welcome pop up (`demo/regionWelcome.ts`): flag tile from `demo/flags.ts`, region
name, currency symbol and code, in the order of `REGION_CONFIGS` (United Kingdom £ GBP, United States $ USD,
India ₹ INR). The US and India rows carry a BETA tag; the foot says "The US and India are in beta".

Decisions (nobody was asked, per the brief):

* **One slide**, not two: the three choices and the address say everything this post has to say.
* The dots are hidden (a single picture has nothing to swipe) and the foot line is centred.
* **No numbers and no shops**, so nothing here can go out of date when the crawl rebuilds the reports.
* **The caption says "from the menu", not "in a pop up"**: the welcome pop up is switched off until a second
  region is live and other lanes may change when it shows. The country menu is what the site has today.
* **No shop or bottle imagery** (photo rule D24 pending): the site's flags, mark, text and shapes only.
* **The address is on the picture**, because the owner's brief asked for it (see the launch posts' notes).
* Spelling is British English, no hyphens or dashes. The caption was screened with the yanaaidetection skill:
  100% human, Very Low band, no Stage 1 markers (short text, so a rough estimate).
