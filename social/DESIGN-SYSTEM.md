# PriceSniffs social design system

The rules every PriceSniffs post follows, so any post made later (by the
owner, a friend or Claude) looks like it came from the same place. The
website's own design system is in `docs/DESIGN-SYSTEM.md`; this file is the
social version of it and borrows its colours and its logo.

## 1. Colours

| Name | Hex | Use |
|---|---|---|
| Black | `#0A0A0B` | Every background. Never pure `#000`. |
| White | `#F7F7F8` | Headlines and the "Price" half of the wordmark |
| Red | `#FF3B41` | Accents only: "Sniffs", the last word of a headline, the logo mark, the call to action pill |
| Grey | `#B9B9C0` | Body text |

Red is an accent. One red word per headline at most, one red button at most.

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
60%. Notes show at most 5 per tier, then "+N more". `tests/dealOfDayLayout.test.ts`
renders very long names, brands, shop names and note lists and fails if
anything leaves the picture or crosses the margins.

## 3. Logo

The mark (magnifying glass, red, with a white bottle in the lens) and the
wordmark ("Price" white, "Sniffs" red) come from `docs/brand/`. Never recolour
them, never stretch them, never put them on anything but the black.

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

## 5. Words

These apply to all post copy: the image text and the caption.

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
7. A faint centre crosshair marking where the link sticker goes. **No web
   address on the image.** The link goes on the sticker and in the caption.
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
The link is checked on the live site before anything is written.

**Every run reports** the perfume, prices and saving, and gives the product
link as a plain https address in a copyable box, ready to paste into the
link sticker.
