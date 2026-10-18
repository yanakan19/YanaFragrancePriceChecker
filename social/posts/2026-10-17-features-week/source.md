# Source

Features of the week, 17 October 2026, made at the owner's request: six black 3:4 slides and a 15.3 second 9:16
video where real screenshots of the built site (390 px wide, taken by `scripts/social-features-week.ts`) slide in
and out. One caption for every platform in `caption.txt`.

Each feature was checked against the live build on 18 October 2026 before it went in: the country menu offers the
United Kingdom, the United States (Beta) and India (Beta); a product page shows its notes with icons; the search
"CK Man" finds Calvin Klein Man; `/in/deals` and `/us/deals` exist; Most Stocked is on every country's home page.
Nothing is claimed about a price. The screenshots show no account data (signed out), only public pages.

| Slide | Feature | Screenshot of |
|---|---|---|
| 1 | Now in the US and India | The country menu open on the US home page |
| 2 | Notes with icons | The Calvin Klein Man page, Notes |
| 3 | Search that gets it | Results for "CK Man" |
| 4 | Deals everywhere | The India Deals page |
| 5 | Most Stocked picks | The India home page, Most Stocked |
| 6 | Try it today | The mark and `pricesniffs.space` |

Video (`features-video-9x16.mp4`, video template, black theme): still cover to 0.8 s, dissolves with a slight zoom
(0.5 s), swipes (0.4 s), PriceSniffs end card held and faded out over 1 s.

Pictures and videos are not committed (docs/DECISIONS.md D28). Draw them again with
`npm run social:render -- social/posts/2026-10-17-features-week` (builds the page if missing, takes the shots,
then slides and video), or by hand: `npx tsx scripts/social-features-week.ts --shots --slides --video`.
