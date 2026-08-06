# PriceSniffs: build-in-public video plan

A staged content plan for documenting how PriceSniffs got built, drawn
entirely from what actually happened — the git log (153 commits, 1 to 6
August 2026), `docs/ENGINEERING-STORY.md`'s stage-by-stage narrative, and
`docs/SPIKE-RESULTS.md`. Every beat below cites a real, dated event. Nothing
here is a hypothetical "and then I'd explain X" — if a stage says a spike
failed at 0%, that is the real number in the repo.

Six videos. Video 0 is done. The rest are ordered the way the actual build
happened, which turns out to already be a natural story arc: an idea, a wall,
a way through the wall, a working product, a public correction of your own
mistakes, and (once it happens) asking the internet's permission to make
money from it without charging the reader a penny more.

---

## Video 0 — Done
**"I bought a domain and built a page"**

Already made. For continuity: this covers 1 August, the very first commits —
`Add ScentDay retailer registry and offer presentation core`, then the first
self-contained demo page. The domain and the skeleton, nothing live yet.

---

## Video 1 — The legal wall, and the way through it
**Real basis:** `docs/SPIKE-RESULTS.md`; ENGINEERING-STORY Stages 2, 3 and 5;
commits `Record Phase 0 spike results...` and
`Add adaptive retrieval that learns from failed attempts` (both 1 Aug);
`Wire the Apify residential proxy...` (2 Aug); the Awin commits (3–4 Aug).

**The hook:** "The obvious plan — fetch the page, read the price — had a 0%
success rate against real UK retailers. Here's why, and what I did instead."

**Beats:**
1. **The naive plan and why it died fast.** A plain HTTP spike against twelve
   UK retailers returned nothing — not "some things," zero. Datacentre IP
   ranges get refused outright by most large UK beauty retailers before a
   single byte of the page is even read. Show the actual retailer config
   comments in `src/config/retailers.ts` — they still say things like *"Live
   spike 1 Aug 2026: HTTP 403 from a datacentre IP before any markup was
   served"* on more than a dozen shops, on purpose, as a permanent record.
2. **Why "just scrape harder" was the wrong next move.** This is the legal
   pivot point of the video: scraping a site that is actively refusing you
   is the point where a data project turns into a legal problem, not just a
   technical one. That's the real reason the registry has a `proxied` and an
   `affiliate-feed` adapter as *first-class, preferred* categories, and
   `NO_AFFILIATE_YET`/`awinPending` as honest placeholders rather than a
   silent scrape.
3. **Finding Awin.** Affiliate networks like Awin exist specifically to hand
   over structured product data — price, stock, a trackable link — because
   the retailer *wants* it distributed. That's a direct, sanctioned data feed
   instead of a scrape, and it's also the actual monetisation path: commission
   comes from the retailer's own marketing budget, on a sale that was going to
   happen anyway, so the price shown to the reader never moves because of it.
   Show the real numbers: Fragrance Click's feed (893 SKUs, daily), MyBeauty
   Boutique (8,908 SKUs) — both onboarded 3–4 Aug once the programme was
   actually joined, not assumed.
4. **What the technical answer to "shops fail unpredictably" turned out to
   be.** Six retrieval strategies, ranked by a live-updating score per shop —
   not a neural net, and the video should say why not: twelve shops and one
   attempt each is not a training set, and a comparison site cannot ship a
   model that gets a price wrong for reasons nobody can explain. The
   multi-armed-bandit framing is genuinely a better answer here, and it's a
   fun five minutes to explain on camera.
5. **The proxy as a last resort, priced in code.** For the handful of shops
   that refuse every free route, a residential proxy costs real money —
   roughly $8/GB — so the code enforces a hard request ceiling
   (`MAX_PROXIED_REQUESTS_PER_RUN`) rather than trusting a config value not to
   drift. A nice "here's a constant that exists because I do not trust myself
   to remember a budget" beat.

**Suggested visuals:** the actual `docs/SPIKE-RESULTS.md` table on screen; the
retailer config file scrolling past with real 403/404 comments; a real Awin
merchant dashboard screenshot (redact the account number) showing the feed
stats; a whiteboard-style sketch of the six strategies racing each other.

**Length:** 8–12 minutes — this is the densest, most "how does a real data
product actually get built legally" video of the series, and it's the one
most likely to travel.

---

## Video 2 — Making 2,500 fragrances findable
**Real basis:** commits `Restructure navigation into Explore...`,
`Add a tiles-per-row control and make every tile the same height`,
`Add Amazon-style faceted filters to every fragrance listing page`,
`Add a brand profile page`, `Lay out Notes like Brands` (all 4–5 Aug);
ENGINEERING-STORY Stage 7.

**The hook:** "Once real data started flowing in, the actual problem became:
how does anyone find one specific bottle inside a few thousand?"

**Beats:**
1. **From a flat list to Explore.** The original demo was one page. It became
   five: Brands, Deals, Retailers, Notes, Search — because "browse
   everything" and "find one thing" are different tasks that were fighting
   each other on one screen.
2. **Faceted filtering, and the one rule that makes it not lie.** Volume,
   concentration, price band, type, on sale, in stock — but an option only
   ever appears if at least one fragrance in the *current* list actually has
   it, and each group's count reflects every other active filter except
   itself. The payoff: it is structurally impossible to filter your way to an
   empty page, because that dead-end option was never shown to you in the
   first place. This is a great "look how a small rule prevents a whole class
   of bad UX" beat.
3. **Tiles per row — the "zoom" control.** A literal density slider for the
   grid, plus making every tile the same height regardless of title length or
   sale badge, so scanning a shelf of fifty bottles doesn't visually jump
   around.
4. **Brand and note pages.** Every brand got its own page — official site
   link, every fragrance it makes, live prices across every shop that stocks
   it — rather than a brand only existing as a filter value. Notes (the scent
   families — oud, vanilla, bergamot, etc.) got the same treatment, laid out
   like the brand list is.
5. **The honesty rule that survived the redesign.** Product photography is
   hot-linked, never rehosted, and the reason each retailer's photo is shown
   at all is a named field in the registry (`affiliate-terms`,
   `own-storefront`, `hotlink-unlicensed`) — visible in code, not a hidden
   boolean. Worth a screen share of that file; it's a good "the boring detail
   is the trustworthy detail" moment.

**Suggested visuals:** side-by-side before/after of the flat list vs. Explore;
screen recording of the filter counts updating live as facets are ticked; the
tiles-per-row slider in action; a brand page and a note page.

**Length:** 6–9 minutes.

---

## Video 3 — Going live
**Real basis:** commits `Rebrand ScentDay to PriceSniffs...`,
`Make the demo an installable PWA...`, `Add GitHub Pages deployment...`,
`Point deployment at pricesniffs.space...` (all 3 Aug); ENGINEERING-STORY
Stage 6.

**The hook:** "Renaming the project, shipping it as an installable app, and
putting it on a real domain — all in one day."

**Beats:**
1. **The rebrand.** ScentDay became PriceSniffs mid-build, with a full visual
   redesign (dark/red theme) landing the same day — a good moment to talk
   about naming a thing before you're sure it's the final name, and why that's
   fine.
2. **PWA, for free.** "Add to Home Screen" on iOS and Android with no app
   store, no review process — just a manifest and a service worker. Worth
   demoing live on a phone.
3. **The domain saga, briefly.** `pricesniff.lol` → `pricesniffs.space`, DNS,
   GitHub Pages, and the certificate dance — a short, honest "yes, the boring
   infrastructure part took real time too" segment rather than skipping
   straight to a working URL.
4. **The pipeline that makes "live" actually mean live.** Automate the whole
   thing: hourly harvest, image-link health checks, a deploy that only
   publishes the newest data instead of racing itself. This is the "here's
   why the site you're looking at right now has fresh prices" payoff.

**Suggested visuals:** the rebrand diff (ScentDay → PriceSniffs) in the repo;
installing the PWA on a real phone on camera; the GitHub Actions run log
showing the hourly cadence.

**Length:** 5–7 minutes — the lightest video in the series, a good palate
cleanser between Video 2 and the more technical Video 4.

---

## Video 4 — Getting it right, in public
**Real basis:** ENGINEERING-STORY's bug log (all six entries); commits
`Fold known brand aliases...`, `Exclude hair products from the fragrance
catalogue`, `Rewrite legal pages as real documents` (5–6 Aug, the most recent
work at the time of writing).

**The hook:** "A live site found six real bugs on its own. Here's what broke,
how it was caught, and what actually fixed it — including one from
yesterday."

**Beats — pick four to six of these, each is a self-contained 60–90 second
story with a clean symptom → cause → fix → lesson shape:**
1. **Mass delisting from a sampled crawl.** An hourly harvest marked almost
   the whole catalogue "gone" because the reconciler treated everything not
   seen in a partial sample as absent. Fixed by making a run explicitly say
   whether it actually finished.
2. **A forty-minute harvest thrown away by a race.** Two workflow runs wrote
   at once; the loser's work vanished. Fixed with a concurrency group.
3. **Gzipped sitemaps that silently parsed to nothing.** No error, no data —
   the worst kind of bug, because it hides. A good "empty result and broken
   result should never look the same" lesson.
4. **Nested affiliate redirects**, from assuming every URL needed the same
   transform when some already arrived pre-transformed.
5. **One brand, several spellings** — "ARMAF" vs. "Armaf" vs. "Dolce &
   Gabbana" three ways, up to ten such groups. This is the freshest material:
   the fix shipped again just yesterday (6 Aug), folding YSL into "Yves Saint
   Laurent," Estee into "Estée Lauder," and so on by hand, after the
   mechanical fix (casing/punctuation only) turned out to have a real blind
   spot for genuine aliases and accented letters.
6. **A hair-care product loose in a perfume catalogue.** "Balmain Hair Silk
   Perfume" passed every fragrance filter because it is, genuinely, a real
   product named with the word "Perfume" — just not one you'd wear. A nice
   "your filter is only as smart as the language it's fighting" story, caught
   6 Aug.

**Suggested visuals:** the actual code comments and doc-comment reasoning for
each fix (this codebase writes down *why*, not just *what* — great on-screen
material); a real screenshot of the duplicate "YSL" / "Yves Saint Laurent"
brand pages before the fix.

**Length:** 8–10 minutes, or split into two shorter videos if the bug-log
format works better as a series of quick hits than one long video.

---

## Video 5 — Asking permission (once it happens)
**Status:** not yet filmable — this is the next real milestone, not a past
one. Recorded here so the plan stays complete and gets updated rather than
rewritten when it lands.

**The hook:** "The prices are real. The photos are hot-linked with no
licence. Here's the plan to fix that — and maybe get paid for it."

**Beats:**
1. **Where the site stands today, honestly.** A handful of retailers
   (Fragrance Click, MyBeauty.Boutique, The Beauty Store UK) are on a real,
   permitted Awin feed. Several more retailers' product photos are shown on a
   "hot-linked, unlicensed, reversible the moment they object" basis — a
   real, named category in the code, not hidden.
2. **The actual ask.** Emails going out to every retailer not yet on a
   licensed footing: can we join your affiliate programme, and can we use
   your product photography under its terms — framed around the fact that
   every click sends a genuine potential sale their way at no cost to them,
   and the reader never pays a different price because of it.
3. **What "no" looks like, and why that's fine.** Any retailer that declines
   or asks to be removed gets removed, immediately, the same standard already
   applied to hot-linked images site-wide.
4. **The monetisation angle, stated plainly.** This is the natural
   "eventually I'd like to make some money from this" video — commission on
   a sale that was happening anyway, never a markup on the price shown, and
   why that distinction is the whole ethical basis of the business.

**Suggested visuals:** the actual outreach emails (redacted); a running
tally of retailers by status (feed live / permission requested / no
response / declined) — this could even become a real page on the site
itself, in the spirit of the Update History panel already there.

**Length:** TBD — film once there's real response data to show, not before.

---

## Notes on using this plan

- Every video above should open on the real artifact (a config file, a repo
  comment, a commit message, a spike-results table) rather than a talking
  head recapping from memory — the whole selling point of this series is that
  the receipts are real and sitting in the repo.
- Video 4 works well *because* it's honest about real bugs. Resist the urge
  to sand off the "this shipped broken and was fixed live" framing — that
  honesty is the same thing the app itself is built on (see: the "no invented
  numbers" line in the site's own About page), so it's on-brand, not
  embarrassing.
- Video 5 is deliberately left open. Update it — don't replace it — once the
  retailer outreach actually happens, the same way `demo/changelog.ts` gets a
  new entry rather than a rewritten one each time something real ships.
