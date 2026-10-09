# social

Everything for PriceSniffs social media posts.

| Folder or file | What is in it |
|---|---|
| `DESIGN-SYSTEM.md` | Colours, type, logo, layouts and wording rules. Read this first. |
| `templates/` | Blank layouts to copy for a new post. Vertical 9:16 is the default |
| `posts/` | One folder per day's set, named `YYYY-MM-DD-short-name`: the sources of its 9:16 stories (no caption, link sticker) and 3:4 feed posts, `caption.txt` (the feed post's caption) and `pictures.json` (the pictures, which are drawn, not committed) |
| `highlights/` | Story highlight covers (1080 x 1080, shown as a circle): `deals-cover` for the Deals highlight |
| `fonts/` | Liberation Sans, the logo's font, with its licence |

Deal of the Day posts are made automatically every day at 12:00 UK
(`npm run social:deal`, see DESIGN-SYSTEM.md section 7), and two "How much
could you save?" carousels every day at 18:00 UK (`npm run social:savings`,
section 8).

**Pictures and videos are not committed** (from 8 October 2026,
`docs/DECISIONS.md` D28). Each post folder keeps the text they are drawn
from and `pictures.json`, which lists them. Draw them with
`npm run social:render -- social/posts/<folder>` (one post, beside its text)
or `npm run social:render` (every post); `--from-history` restores a post
made before 8 October exactly as it was committed. A push that changes a post
starts the **Social pictures** workflow, which draws them and keeps them as a
private artifact for 90 days (Actions, Social pictures, the run named after
the commit, Artifacts). DESIGN-SYSTEM.md section 10 has the details.

Guess the Fragrance puzzles and their reveals are made by `npm run social:guess`
(`-- --dry-run` to look first, `-- --reveal` for the answer post; plan:
`docs/GUESS-THE-FRAGRANCE-PLAN.md` section 6). A puzzle folder's `check.json`
holds the answer and the repository is public, so commit and push the folder
(and `guess-fragrance-history.json`) only when posting, with a commit message
that names no fragrance.

Videos come from one template (`scripts/social-video-template.ts`): `npm run social:video -- --id <id>` for a
Deal of the Day video and `npm run social:video:explainers` for the informative ones. Rules: `docs/SOCIAL-MEDIA-PLAN.md`
section 9.

What to post, where and when: `docs/SOCIAL-MEDIA-PLAN.md`.

## Posts

| Date | Folder | Post |
|---|---|---|
| 2026-10-01 | `posts/2026-10-01-launch-welcome/` | Launch: "Welcome to the Page" (9:16 story, 3:4 post) |
| 2026-10-02 | `posts/2026-10-02-deal-of-the-day/` | Deal of the Day: Zimaya Yaa Umree (9:16 and 3:4) |
| 2026-10-03 | `posts/2026-10-03-deal-of-the-day/` | Deal of the Day: Zimaya Rabab Pulp (9:16 story, 3:4 post and scent profile) |
| 2026-10-04 | `posts/2026-10-04-deal-of-the-day/` | Deal of the Day: Zimaya Night Shadow (9:16 story, 3:4 post and scent profile) |
| 2026-10-04 | `posts/2026-10-04-savings/` | Savings: Baccarat Rouge 540 35ml, Selfridges against Les Senteurs (3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-savings-2/` | Savings: Acqua di Parma Zafferano 180ml, John Lewis against Fragrance Click (3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-how-prices-work/` | How our prices work: six red explainer slides (3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-explainer-deal-of-the-day/` | Explainer: how we pick the Deal of the Day (five red slides, 3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-explainer-price-graph/` | Explainer: how to read the price graph (five red slides, 3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-explainer-same-perfume/` | Explainer: same perfume, different bottle (five red slides, 3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-explainer-how-we-make-money/` | Explainer: how PriceSniffs makes money (five red slides, 3:4 and 9:16) |
| 2026-10-04 | `posts/2026-10-04-explainer-missing-shop/` | Explainer: why a shop might be missing (five red slides, 3:4 and 9:16) |
| 2026-10-05 | `posts/2026-10-05-deal-of-the-day/` | Deal of the Day: Armaf Private Key To My Life (9:16 story, 3:4 post and scent profile) |
| 2026-10-08 | `posts/2026-10-08-deal-video-escentric-molecules-molecule-05-100ml/` | Deal of the Day video: Escentric Molecules Molecule 05 100ml, £75.00 at John Lewis against £125.00 (exactly 10 seconds, 9:16 MP4, video template) |
| 2026-10-08 | `posts/2026-10-08-deal-video-french-avenue-nectare-extradose-100ml/` | Deal of the Day video: French Avenue Nectare Extradose 100ml, £28.98 at Emirates Oud against £45.00 (exactly 10 seconds, 9:16 MP4, video template) |
| 2026-10-08 | `posts/2026-10-08-explainer-video-perfume-strengths/` | Informative video: Perfume strengths explained (EDC, EDT, EDP, Parfum; about 26 seconds, 9:16 MP4, red theme) |
| 2026-10-08 | `posts/2026-10-08-explainer-video-perfume-notes/` | Informative video: What are perfume notes? (top, middle, base and how a scent unfolds; about 26 seconds, 9:16 MP4, red theme) |
| 2026-10-09 | `posts/2026-10-09-launch-us/` | Launch: "PriceSniffs is now in the US (beta)" (four black slides, 3:4, and a 9:16 cover; one caption) |
| 2026-10-09 | `posts/2026-10-09-launch-india/` | Launch: "PriceSniffs is now in India (beta)" (four black slides, 3:4, and a 9:16 cover; one caption) |
| 2026-10-09 | `posts/2026-10-09-select-your-country/` | "One site, three countries": the three country choices (one black picture, 3:4 and 9:16; one caption) |
| 2026-10-05 | `posts/2026-10-05-hurry-deal-video/` | Hurry deal video: Dolce & Gabbana The One for Men 150ml, £59.95 against RRP £153 (10 second 9:16 MP4, real site UI) |
| 2026-10-02 | `posts/2026-10-02-what-is-pricesniffs/` | Intro carousel: "What is PriceSniffs?" (4 slides, 3:4 post). Remake with `npx tsx scripts/social-intro-slides.ts` |
| 2026-10-02 | `posts/2026-10-02-savings-example/` | Savings example carousel: Miss Dior, Selfridges vs Justmylook (6 slides, 3:4 post). Remake with `npx tsx scripts/social-savings-example.ts` (inverted theme, hand picked figures, reel safe) |
| 2026-10-02 | `posts/2026-10-02-savings/` | How much could you save?: Creed Acqua Fiorentina, Allbeauty vs MyBeauty.Boutique (6 slides, 3:4 post) |
| 2026-10-09 | `posts/YYYY-MM-DD-guess-fragrance-NN/` and `posts/YYYY-MM-DD-guess-fragrance-NN-reveal/` | Guess the Fragrance: a puzzle (black picture, house and name as blanks, notes and strength as clues, 3:4 and 9:16) and its reveal (answer, bottle, today's cheapest price); one caption each. Made by `npm run social:guess`; folders are added only when posting |
