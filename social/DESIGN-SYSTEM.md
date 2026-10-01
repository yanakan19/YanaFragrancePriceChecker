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

| Role | Weight | Size on a 1920 wide canvas | Letter spacing |
|---|---|---|---|
| Headline | Bold 700 | 150px, two lines at most | -4 |
| Wordmark | Bold 700 | 56px | -1.5 |
| Body | Regular 400 | 46px, two lines at most, about 45 characters a line | 0 |
| Button and address | Bold 700 | 40px | 0 |

For other canvas sizes, scale every number by the canvas width over 1920.

## 3. Logo

The mark (magnifying glass, red, with a white bottle in the lens) and the
wordmark ("Price" white, "Sniffs" red) come from `docs/brand/`. Never recolour
them, never stretch them, never put them on anything but the black.

## 4. Layouts

Every layout has the same skeleton: wordmark top left, headline, body, call to
action, and the large mark on the right. Margins are 120px on a 1920 canvas.

| Template | Size | Use for |
|---|---|---|
| `templates/announcement-16x9.svg` | 1920 x 1080 | X, LinkedIn, Facebook, YouTube community, website banners |

Add new templates (for example 1080 x 1080 square or 1080 x 1920 story) to
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

1. Copy the closest template into `social/posts/YYYY-MM-DD-short-name/` as
   `post-16x9.svg` (or the size you need).
2. Replace the placeholder text. Keep to the line limits in section 2.
3. Write `caption.txt` beside it and run the yanaaidetection check on it.
4. Run `npm run social:render` to make the PNG beside the SVG.
5. Run `npx vitest run tests/socialPosts.test.ts`.
6. Look at the PNG, then commit the folder.
