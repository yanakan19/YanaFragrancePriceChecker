# social

Everything for PriceSniffs social media posts.

| Folder or file | What is in it |
|---|---|
| `DESIGN-SYSTEM.md` | Colours, type, logo, layouts and wording rules. Read this first. |
| `templates/` | Blank layouts to copy for a new post. Vertical 9:16 is the default |
| `posts/` | One folder per post, named `YYYY-MM-DD-short-name`, holding the SVG source, the rendered PNG and `caption.txt` |
| `fonts/` | Liberation Sans, the logo's font, with its licence |

Make the PNGs with `npm run social:render` (every post) or
`npm run social:render -- social/posts/<folder>` (one post).

What to post, where and when: `docs/SOCIAL-MEDIA-PLAN.md`.

## Posts

| Date | Folder | Post |
|---|---|---|
| 2026-10-01 | `posts/2026-10-01-launch-welcome/` | Launch: "Welcome to the Page" (vertical 9:16) |
