# Source

`deal-video-9x16.mp4` is drawn by `scripts/social-video-deal.ts` from the shared video template
(`scripts/social-video-template.ts`; rules in `docs/SOCIAL-MEDIA-PLAN.md` section 9). The deal is
read from the site's own data at the time (`demo/deals.generated.ts`, built 2026-11-01T03:39:42.565Z);
nothing on screen is typed in. `check.json` holds the figures and the video's measured length.
The video is not committed (docs/DECISIONS.md D28). Draw it again from `check.json` with
`npm run social:render -- social/posts/2026-11-01-deal-video-zimaya-awatif-pour-femme-100ml`. The command that first made it:

    npx tsx scripts/social-video-deal.ts --id ean-6290171074946 --date 2026-11-01 --out social/posts/2026-11-01-deal-video-zimaya-awatif-pour-femme-100ml --checked-at 2026-11-01T03:37:34.619Z
