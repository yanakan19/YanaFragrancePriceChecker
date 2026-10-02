# social

Everything for PriceSniffs social media posts.

| Folder or file | What is in it |
|---|---|
| `DESIGN-SYSTEM.md` | Colours, type, logo, layouts and wording rules. Read this first. |
| `templates/` | Blank layouts to copy for a new post. Vertical 9:16 is the default |
| `posts/` | One folder per day's set, named `YYYY-MM-DD-short-name`: 9:16 stories (no caption, link sticker), 3:4 feed posts and `caption.txt` (the feed post's caption) |
| `highlights/` | Story highlight covers (1080 x 1080, shown as a circle): `deals-cover` for the Deals highlight |
| `fonts/` | Liberation Sans, the logo's font, with its licence |

Deal of the Day posts are made automatically every day at 12:00 UK
(`npm run social:deal`, see DESIGN-SYSTEM.md section 7).

Make the PNGs with `npm run social:render` (every post) or
`npm run social:render -- social/posts/<folder>` (one post).

What to post, where and when: `docs/SOCIAL-MEDIA-PLAN.md`.

## Posts

| Date | Folder | Post |
|---|---|---|
| 2026-10-01 | `posts/2026-10-01-launch-welcome/` | Launch: "Welcome to the Page" (9:16 story, 3:4 post) |
| 2026-10-02 | `posts/2026-10-02-deal-of-the-day/` | Deal of the Day: Zimaya Yaa Umree (9:16 and 3:4) |
