# PriceSniffs social design system

The rules every PriceSniffs post follows, so any post made later (by the
owner, a friend or Claude) looks like it came from the same place. The
website's own design system is in `docs/DESIGN-SYSTEM.md`; this file is the
social version of it and borrows its colours and its logo.

## 1. Colours

There are two themes, built from the same four colours.

| Theme | Used for | Background | Type and icons | Accent |
|---|---|---|---|---|
| **Standard** | Every daily post (Deal of the Day, How much could you save?) and the logo itself | Black `#0A0A0B` | White `#F7F7F8`, grey `#B9B9C0` for body text | Red `#FF3B41` |
| **Inverted** | Every one off post: launches, explainers, carousels, announcements | Red `#FF3B41` | Black `#0A0A0B` (icons, logo mark, headlines, body text at 78% black) | White, for large type only ("Sniffs") |

The inverted theme makes one off posts stand out from the daily deals in
the grid. In it, the logo mark is all black, the "Link in bio" pill is black
with red text, and the wordmark reads "Price" black, "Sniffs" white. Cards
(lists, the price table) are near black `#141416` with a soft shadow so they
pop off the red, and inside a card the standard theme comes back: white
titles, grey `#B9B9C0` details, red ticks, a red bar for the cheapest price.
Black on this red is about 6:1 contrast, so small text on the red stays
black; white is only for large type.

| Name | Hex | Standard theme | Inverted theme |
|---|---|---|---|
| Black | `#0A0A0B` | Background. Never pure `#000`. | Icons, logo mark, all text |
| White | `#F7F7F8` | Headlines, "Price" in the wordmark | "Sniffs" and large type only |
| Red | `#FF3B41` | Accents: "Sniffs", the last word of a headline, logo mark, call to action pill | Background |
| Grey | `#B9B9C0` | Body text | Not used (black at 78% instead) |

In the standard theme red is an accent: one red word per headline at most,
one red button at most. The theme tokens live in `THEMES` in
`scripts/socialSlides.ts`, with the shared slide frame; use them for any new carousel.

## 2. Type

**Liberation Sans**, the font the logo wordmark is set in (metrically the same
as Arial). Both weights live in `social/fonts/` under the SIL Open Font
Licence, and the render script embeds them, so a post renders the same on any
machine.

**Default format: vertical 9:16, 1080 x 1920.** Every post is made in this
size unless a platform needs another one.

| Role | Weight | Size on the 1080 x 1920 canvas | Letter spacing |
|---|---|---|---|
| Headline | Bold 700 | 92px, **one line**, centred | -2.5 |
| Wordmark | Bold 700 | 56px | -1.5 |
| Body | Regular 400 | 46px, three lines at most, about 28 characters a line, centred | 0 |
| Call to action | Bold 700, white | 46px, two lines at most, centred. Default: "Click below or check the link in the bio." | 0 |

For the 16:9 landscape layout, use the sizes in its template file.

**Smooth edges:** every picture is drawn at twice its size and scaled down
with high quality smoothing (`scripts/socialRender.ts`), so letters have soft,
natural edges rather than hard pixel ones. Headlines use a light negative
letter spacing (-1px at most) so letters never look pinched.

**Long text never breaks the layout.** Each text line has a limit, and text
that would go past it shrinks first, down to a minimum size, and only then is
cut with "…" as a last resort:

| Text | Limit | Smallest size |
|---|---|---|
| Headline | 1 line | 30px |
| Perfume name | 2 lines | 34px |
| Brand | 1 line | 20px |
| Prices in the boxes | 1 line | 30px |
| Shop name in the box | 1 line | 18px |
| Checked time, notes source | 1 line | 16px |

If the whole picture still does not fit (for example a long name plus many
notes), the photo, note chips and gaps shrink together, step by step, down to
60%. Notes show at most 5 per tier, then "+N more". The SAVE badge always
has clear space above the photo card, so it never touches the brand or name. `tests/dealOfDayLayout.test.ts`
renders very long names, brands, shop names and note lists and fails if
anything leaves the picture or crosses the margins.

## 3. Logo

The mark (magnifying glass, red, with a white bottle in the lens) and the
wordmark ("Price" white, "Sniffs" red) come from `docs/brand/`. Never recolour
them, never stretch them, never put them on anything but the black.

**Highlight covers** (`social/highlights/`, 1080 x 1080): the same build as
the logo mark, one simple icon in a thick red outline with solid white shapes
inside, on the black, about the logo's size and well inside the central circle
Instagram crops to. Render with `npm run social:render -- social/highlights`.

## 4. Layouts

Every vertical layout has the same skeleton, top to bottom and centred:
wordmark, the large mark, the one line headline, body, call to action. No
buttons and no web address on the image: the call to action points to the
link below the post or in the bio. Margins are at least 90px at the sides.

**Safe zone:** keep everything between y 250 and y 1670. Instagram and TikTok
draw their own name bar over the top 250px of a story and their reply bar
and buttons over the bottom 250px.

| Template | Size | Use for |
|---|---|---|
| `templates/announcement-9x16.svg` | 1080 x 1920 | **Default.** TikTok, Instagram and Facebook stories and reels, YouTube Shorts, Snapchat |
| `templates/announcement-16x9.svg` | 1920 x 1080 | Only where a platform needs landscape: X, LinkedIn, YouTube banners |

Add new templates (for example 1080 x 1350 for an Instagram feed post) to
`templates/` with the same skeleton, and list them here.

**Reel safe 3:4 slides.** A carousel may later be turned into a reel (for
example in Instagram's Edits app). Edits fills the 9:16 frame with the 3:4
slide and cuts its sides, keeping only the middle 810px of the width; the
feed then shows the reel cut to 4:5 and the profile grid cuts it to 3:4. So
on carousel slides (`slide(..., reelSafe = true)` in
`scripts/socialSlides.ts`) everything, wordmark and dots included, sits in
the box x 150 to 930, y 230 to 1210 of the 1080 x 1440 slide, and the rest
is plain background. The savings carousels always use it.

**TikTok versions (9:16).** Every savings slide is also rendered as
`slide-N-9x16.png` (1080 x 1920) for a TikTok photo post: the same slide on
a taller canvas of the same background, shown a little larger (scale 0.86,
box x 110 to 970, y 380 to 1460), clear of TikTok's tabs at the top, its
caption and buttons at the bottom and its icons down the right. Post them
with `tiktok-caption.txt`.

## 5. Words

**Stories and posts:** a 9:16 picture is a **story**. It has no caption; its
link goes on a link sticker. A 3:4 picture is a feed **post**. It needs a
caption (`caption.txt` in the post's folder), and since feed posts cannot hold
a clickable link, the picture says "Link in bio" and the caption points there
too.

These rules apply to all post copy: the image text and the caption.

1. **No hyphens and no dashes of any kind** (no `-`, no `–`, no `—`). Use a
   full stop, a comma or a new sentence instead. `tests/socialPosts.test.ts`
   fails the build if one gets in.
2. **Check every caption with the yanaaidetection skill** before posting
   (`/anthropic-skills:yanaaidetection`). Aim for the Low or Very Low band,
   with no Stage 1 markers. Fix flags by adding real detail (a number, a shop,
   a price), never by deleting words and leaving the sentence empty.
3. Plain British English. Prices as `£27.00`.
4. Every price claim must be true on the day it is posted, and follow the UK
   advertising rules in `docs/SOCIAL-MEDIA-PLAN.md`.
5. The address is always `pricesniffs.space`, lower case.
6. **At most 5 hashtags per caption**, on the last line. `tests/socialPosts.test.ts`
   fails the build if a caption has more.
7. **TikTok captions** go in `tiktok-caption.txt` beside `caption.txt`. They
   give the address (pricesniffs.space) instead of "link in bio", since a new
   TikTok account cannot put a link in its bio yet, and use TikTok's own tags:
   `#perfumetok #fragrancetok #perfume #perfumedeals #pricesniffs`.

## 6. Checklist for a new post

1. Copy `templates/announcement-9x16.svg` into
   `social/posts/YYYY-MM-DD-short-name/` as `post-9x16.svg` (another template
   only if the platform needs it).
2. Replace the placeholder text. Keep to the line limits in section 2.
3. Write `caption.txt` beside it and run the yanaaidetection check on it.
4. Run `npm run social:render` to make the PNG beside the SVG.
5. Run `npx vitest run tests/socialPosts.test.ts`.
6. Look at the PNG, then commit the folder.

## 7. Deal of the Day (automatic, every day at 12:00 UK)

**Read this whole document before making or changing any post.** The daily
routine does so first on every run.

`npm run social:deal` makes the post in `social/posts/YYYY-MM-DD-deal-of-the-day/`:
`post-9x16.png` (story, 1080 x 1920), `post-3x4.png` (feed, 1080 x 1440),
`notes-3x4.png` (the scent profile, 1080 x 1440), their HTML sources,
`caption.txt` and `check.json`.

The two deal pictures have the same layout, top to bottom and centred. The 3:4 one is
the same design set slightly denser (smaller type and gaps), never a
different one.

1. Wordmark (the full magnifying glass, never cropped)
2. The date in a grey pill, e.g. "FRIDAY, 2 OCTOBER 2026"
3. Headline with the UK flag
   * 9:16 story: "Our Deal of the Day today is…" on ONE line (it shrinks to
     fit the margins rather than wrap)
   * 3:4 feed: "Deal of the Day"
4. Perfume name and size, then the brand underneath in smaller grey capitals
5. The product photo used on the site, on a white card, with a red round
   badge on its corner: "SAVE 59%"
6. The red MSRP box and the green cheapest price box, exactly as the product
   page shows them
7. Where the link goes. **No web address on the image.**
   * 9:16 story: a faint centre crosshair marking where the link sticker goes
   * 3:4 post: a small "Link in bio" pill (feed posts cannot hold stickers)
8. When the price was checked, in small grey

**The scent profile picture** (`notes-3x4.png`, same wordmark, date pill and
type as the others): headline "The Scent Profile", the perfume name and brand,
a red "RECOMMENDED FOR" pill (Men, Women or Everyone), then the notes tree:
TOP (first impression), HEART (after an hour), BASE (what lingers), up to 5
notes each as chips on a vertical line, and a small line naming the shop the
notes came from.

How the recommendation and notes are made safe:
* **Gender:** from the perfume's own name; if it says nothing, from most of the
  shops' own listings ("for men", "for women"); if nobody states one, Everyone.
* **Notes are checked before use.** A note must be a short ingredient (at most
  4 words, no numbers, sizes, prices, links or the perfume's own name).
  Repeats are removed and hyphens become spaces ("Ylang Ylang"). The whole set
  is rejected if more than 30% of entries fail, a tier has over 15 notes, or
  fewer than 3 usable notes remain.
* **Fallbacks, in order:** this bottle's notes, then the same perfume in
  another size, then a card that says "The notes for this one are not
  published yet" (gender still shown). Never invent notes.
* If the notes pass the checks but are plainly wrong for the perfume, rerun
  with `--no-notes` to show the fallback card instead.

**Which perfume:** the day's top deal, meaning the biggest saving against
the brand's own current price (MSRP), among perfumes whose product page shows
both boxes, with a fresh price, delivery stated and the cheapest shop
confirmed. A perfume is never posted twice: if the top deal has been posted
before, it moves on to the next deal down (`social/deal-of-the-day-history.json`).
**A brand rests for 7 days** (the owner's rule, 4 Oct 2026: a new brand every
week): a brand posted on a day is not posted again until 7 days later, so any
seven days in a row name seven different brands. If the top deal's brand is
resting, the run moves on to the next deal down from another brand. If no deal
from a brand that is not resting qualifies, the run says so, writes nothing
(no folder, no history entry) and exits with code 3; it never breaks the rule to
fill the day. `--dry-run` shows the pick without writing. A chosen perfume
(`--id`) answers to the same rule; `--allow-brand-repeat` is the one deliberate
way round it, and is recorded in `check.json`. The link is checked on the live
site before anything is written.

**How it is posted:** the 9:16 goes up as a story with the link sticker on
the crosshair (no caption). The two 3:4 pictures go up together as one feed
post (a carousel: deal first, then the scent profile) with `caption.txt` as
its caption.

**Every run reports** the perfume, prices and saving, gives the product link
as a plain https address in a copyable box for the story's link sticker, and
gives the feed post caption in its own copyable box.

## 8. How much could you save? (automatic, two a day, made at 18:00 UK)

**Read this whole document first**, as with Deal of the Day.

Two a day. `npm run social:savings` makes the first in
`social/posts/YYYY-MM-DD-savings/`, and `npm run social:savings -- --slot 2`
the second in `social/posts/YYYY-MM-DD-savings-2/`, always a different
perfume. Post them a few hours apart. Each folder also holds the six
`slide-N-9x16.png` TikTok versions.

Each is a six slide 3:4 feed post (a carousel) in the
**standard black theme**, reel safe (section 4), in `social/posts/YYYY-MM-DD-savings/`: six
`slide-N-3x4.png` with their HTML sources, `caption.txt` and `check.json`.

1. "A real example: How much could you save?" with the product photo, name
   and brand
2. "Same bottle, two shops": the well known shop's bottle price beside the
   cheapest shop PriceSniffs found ("CHEAPEST WE FOUND")
3. "Then comes delivery: We add it in for you": bottle, delivery and what you
   pay at each shop, with the reason delivery is charged (for example "Free
   delivery only on orders over £25"). When both shops deliver free it says
   "And delivery? Free at both shops" instead
4. "Your saving on one bottle": the saving in pounds, a "N% less" pill, both
   totals
5. "Buy one a month": the saving over 12 months, marked "at today's prices"
6. "Find your own savings": Search any perfume, Link in bio

**How the example is picked, so it is always fair and true:**
* The cheap side is the product page's own cheapest offer, in stock, with
  delivery stated, and the page is sure it is the cheapest.
* The dear side is the dearest in stock listing from a well known shop
  (John Lewis, LOOKFANTASTIC and Allbeauty, the well known shops that are on
  the site; Selfridges, Superdrug, Harvey Nichols, Boots, The Perfume Shop,
  The Fragrance Shop and Notino were switched off by the owner on 2026-10-04,
  so none of them can be the dear side until they are switched back on).
* The perfume is worth over £60: the well known shop's bottle price, before
  delivery, is above £60.
* Both prices were checked in the last 4 days. The saving is at least £5 and
  10%. Examples where the well known shop adds delivery come first.
* Where a shop's product data can be read live, its price must still match,
  or the example is skipped. Shops that block automated reads are flagged
  "unreadable" in `check.json`: check those by hand before posting.
* No perfume repeats within 30 days (`social/savings-history.json`). If
  nothing qualifies, nothing is made that day.
* The wording is always "cheapest we found", never "cheapest in the UK":
  PriceSniffs does not compare every shop.
