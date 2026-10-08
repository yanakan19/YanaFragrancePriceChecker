# Source

`deal-video-9x16.mp4` is drawn by `scripts/social-video-deal.ts` from the shared video template
(`scripts/social-video-template.ts`; rules in `docs/SOCIAL-MEDIA-PLAN.md` section 9). The deal is
read from the site's own data at the time (`demo/deals.generated.ts`, built 2026-10-08T02:15:23.894Z);
nothing on screen is typed in. `check.json` holds the figures and the video's measured length.

    npx tsx scripts/social-video-deal.ts --id ean-5060103310609 --date 2026-10-08 --out social/posts/2026-10-08-deal-video-escentric-molecules-molecule-05-100ml --checked-at 2026-10-08T01:23:01.700Z
