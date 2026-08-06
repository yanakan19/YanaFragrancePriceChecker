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

**Script:**

> When I started PriceSniffs in August, I had one simple idea: write a script, fetch fragrance prices from retailers, display them on a website. Straightforward, right?
>
> Here's what actually happened. I ran a simple HTTP spike — just a basic request to twelve UK retailers to grab their prices. How many came back? Zero. Not, like, half. Not even one. Zero.
>
> [*Show SPIKE-RESULTS.md table*]
>
> Every single one was a 403 or 404 before I even got to the HTML. And that's because big retailers know exactly what a datacentre IP looks like. They block entire IP ranges — not because humans are coming to shop, but because scrapers are. I'd hit a wall before I'd even written the real code.
>
> Now, the obvious next move is the one I *didn't* take. Just… scrape harder. Find a proxy. Bypass the block. But that's where I had to stop and think about what I was actually building.
>
> [*Show retailer config file with 403 comments*]
>
> Because this is the moment — this exact moment — where a data project becomes a legal problem. The instant you start circumventing a site's refusal to talk to you, you've crossed a line. That's not a technical challenge anymore. That's a contract violation.
>
> So instead of scraping, I looked for something that actually worked: affiliate networks.
>
> [*Show Awin merchant dashboard*]
>
> Companies like Awin exist for one reason: retailers *want* their product data out there. They give you prices, they give you stock levels, they give you links that track sales. Why? Because every person you send to a shop is a potential customer, and affiliate programs make money when someone buys. It's win-win. No bypass. No legal grey area.
>
> I onboarded with Awin. Within a couple of days, I had Fragrance Click's feed — eight hundred ninety-three fragrances, updated daily. Then MyBeauty Boutique — eighty-nine hundred SKUs. Real data, from the retailer, sanctioned.
>
> But here's the problem: not every shop is on Awin. Some are, some aren't. And the ones that aren't… some will load in a browser, some won't, and some do crazy things with JavaScript. So I needed a strategy.
>
> I ended up with six different ways to retrieve a price. Plain HTTP request. Browser headers — sometimes that's enough to fool a server. Sitemap discovery — crawl the robot.txt, follow the sitemaps, since those often return data when other requests don't. A real browser session, if JavaScript is the issue. And then, as a last resort, a residential proxy — a real person's IP address, rented for roughly eight bucks per gigabyte.
>
> [*Show whiteboard sketch of six strategies*]
>
> Now, I could have just picked the most aggressive one and hammered every shop with a proxy. But that costs money. Real money. So instead, I built a learner. Every shop gets a score — which of these six methods actually works for you? And every time we run, we try the best method first. If it fails, we try the next one. We're not fighting the retailers; we're learning how to talk to each one in the language they speak.
>
> You know what I *didn't* do? I didn't build a neural network. I didn't train a model. Why? Because I have twelve shops and one attempt at each. That's not a training set. That's a single data point. A model trained on that would be garbage — and worse, it would be *wrong garbage that I couldn't explain*. And a comparison site cannot ship a price that's wrong for reasons nobody understands.
>
> Instead, it's a multi-armed bandit — a very fancy name for "try different things and remember what works." Dead simple. Explainable. Provably better than a guess.
>
> [*Pause. Show MAX_PROXIED_REQUESTS_PER_RUN constant in code*]
>
> And about that residential proxy budget — I hard-coded a ceiling right into the app. `MAX_PROXIED_REQUESTS_PER_RUN`. Not a config value I trust myself to remember. An actual constant, because I do not trust myself to log in and check whether the budget drifted. It's priced in code.
>
> That's how a price comparison site gets built legally without betting the company on a technology no one can explain.

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

**Script:**

> So now I had data. Real data. Thousands of fragrances pouring in. And I immediately discovered: I'd solved the wrong problem.
>
> The first version of PriceSniffs was a single page — a big list of every fragrance, sorted by price. It was, generously, not very useful. Scrolling through two thousand bottles looking for one is not browsing. It's suffering.
>
> [*Show flat list before screenshot*]
>
> I realized the issue isn't actually "find one fragrance." Sometimes you want to browse. Sometimes you want to shop by brand — "show me everything Dior makes." Sometimes you want to filter by price, or scent family, or whether it's on sale. Those are completely different questions, and they were all fighting each other on one screen.
>
> So I split the interface into five separate experiences.
>
> [*Navigate through Brands, Deals, Retailers, Notes, Search*]
>
> Brands, where you can explore what a perfume house has to offer. Deals, which is everything currently on sale. Retailers, to see what's available at your favorite shop. Notes — those are the scent families, like oud, vanilla, bergamot. And Search, for when you know exactly what you're looking for.
>
> Each one is a different question. Each one gets its own interface.
>
> But they all needed the same magic: faceted filtering. Think of how Amazon works — you look at laptops, and you see "Filter by Brand," "Filter by Price," "Filter by Processor." The trick is, not every option is available. If you filter for Gaming laptops under $500, you won't see "13-inch display" as an option — because no gaming laptop under $500 is 13 inches. It's not a button you can click; it's a grayed-out option or it's gone.
>
> [*Show filter interface*]
>
> I implemented the same thing, but with one rule that changes everything: a filter option only appears if at least one fragrance in the *current* result set actually has it. And the counts — those numbers next to each option — those count everything that has that property, except for the filters in that same group.
>
> So if I have filters for Volume and Concentration active, the price-band count shows me how many fragrances match those specific criteria. It doesn't count based on filters I haven't touched yet.
>
> [*Screen recording of counts updating as filters are ticked*]
>
> The magic of this: it is structurally impossible to filter yourself into an empty page. You can't click a combination that yields nothing, because that dead-end option was never shown to you. It's simple, but it saves a massive amount of bad UX.
>
> Now, two thousand bottles is also a lot to look at on a screen. So I added a density control. A slider — adjust the grid, and boom, more tiles, less tiles, whatever you want.
>
> [*Demonstrate tiles-per-row slider*]
>
> And here's a detail: every tile is the same height. Not by accident. I forced it. Because when you're scanning a shelf of fifty fragrance bottles, you want it to be *stable*. If one has a short name and another has a long name, and one has a "On Sale" badge on it, and the tiles are different heights, your eye jumps. It's exhausting.
>
> So every tile is the same height, regardless of what's in it. Your eye scans in a grid. That's what physical shelves feel like, and it's what this feels like.
>
> [*Show brand page*]
>
> Then there are brand pages. Every brand gets its own page — the official website link if there is one, every single fragrance that brand makes, and the current price at every shop that stocks it. Because a brand should be a place you can explore, not just a filter value.
>
> Same thing for scent families.
>
> [*Show note page*]
>
> Click on "Oud" or "Amber" or "Citrus," and you see every fragrance in that family, laid out the same way as the brand page.
>
> Now. About the product photos. I don't own any of these. I'm showing photos from retailers' own websites, linked directly from their servers — hot-linked, in the old terminology. I never copy and rehost. They own them, they serve them.
>
> But I don't hide that. Look at the retailer registry in the codebase.
>
> [*Show retailer config file with affiliate-terms, own-storefront, hotlink-unlicensed*]
>
> Every image has a reason next to it. Is this under an affiliate license? Is this from a retailer's own storefront? Or is this hot-linked with no explicit permission, reversible the moment they ask me to stop?
>
> That's not buried in some boolean. It's a named, visible field in code. Because boring details are trustworthy details. When someone opens the code and sees *why* we're showing each photo, the answer is there.

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

**Script:**

> August 3rd. I realized the name "ScentDay" didn't feel right. The project was about comparing prices, not about the ritual of using fragrance. It was about finding the right bottle at the right price.
>
> So I renamed it. PriceSniffs.
>
> [*Show git diff with ScentDay → PriceSniffs*]
>
> That happened at the same time I overhauled the entire visual design. Dark theme. Red accents. Everything changed in one day. Redesigning mid-build is risky — you can end up with a Frankenstein project that doesn't know what it is. But sometimes the name change clarifies the whole thing. Suddenly, the design made sense.
>
> By the same day, I also shipped it as an app. Not in the App Store. Not going through Apple's review process, waiting weeks. This is a web app.
>
> [*Explain on phone*]
>
> On iOS, on Android — you visit pricesniffs.space in a browser, you tap Share, you tap "Add to Home Screen." It installs like an app. It has an icon, it has a name, it launches fullscreen. And the browser never shows up. To the person using it, it's an app. To me, I deployed a website. No store, no review gate, no waiting.
>
> It's called a PWA — Progressive Web App. All it takes is a manifest file and a service worker. Under the hood, it's just web technology. In practice, it's an installable app.
>
> [*Demo live on phone if possible*]
>
> Now, about the domain. I started with `pricesniff.lol`. Which is… fun. But when I was actually ready to put this live, I moved to `pricesniffs.space`. Slightly less chaotic.
>
> [*Light laugh*]
>
> That required DNS, pointing the domain to GitHub Pages, and HTTPS certificates. Boring infrastructure stuff. But boring infrastructure is what keeps everything working. Every one of those steps is a minor ordeal. Register the domain, point the DNS, wait for propagation, set up the certificate, test it in a browser — it's not hard, but it's the part people skip in demos.
>
> Three hours, that took. Not complicated, just real.
>
> [*Show GitHub Actions workflow*]
>
> Once it's live, "live" only means something if the data actually updates. So I automated it.
>
> Every hour, a workflow fires. It runs the fragrance harvest — fetching from Awin, hitting retailers with whatever method works for each one, spidering sitemaps. All of it. Then it checks every single product image to make sure the link still works. Then it packages the new data and deploys it.
>
> But here's the detail: the deploy only publishes the new data if it actually succeeded. If the harvest failed partway through, it doesn't deploy incomplete garbage. It stages the data, checks it, and then — only then — publishes.
>
> [*Scrub through GitHub Actions run log*]
>
> You're looking at the site right now. The prices are current as of an hour ago, roughly. They're not from last week. They're not stale. They're live because there's a thing that runs automatically, every hour, to make that happen.
>
> That's what shipping looks like.

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

**Script (Multi-part, 60–90 seconds per bug):**

**Bug 1: Mass delisting from a sampled crawl**

> When I woke up on August 2nd, the catalogue had collapsed. Almost every fragrance disappeared. I looked at the logs and couldn't figure out why — nothing was erroring out. But the harvest just… stopped.
>
> Here's what happened: I was crawling retailers in parallel, and some of them have huge sitemaps. To save time, I'd written the reconciler to work on partial data. "If this fragrance isn't in the crawl result, assume it's been delisted." Sounds reasonable.
>
> Except when the crawl was only *partial* because it timed out partway through.
>
> [*Show reconciler code*]
>
> So the crawl grabbed the first few thousand fragrances, timed out, and the reconciler said, "You didn't see the rest. They're gone." Boom. The catalogue vanished.
>
> The fix: make every run explicitly say whether it finished. If a harvest is partial, mark it as partial. The reconciler doesn't touch anything if a partial result comes in. Done.
>
> Lesson: empty result and broken result should never look the same.

**Bug 2: A forty-minute harvest thrown away by a race**

> Two GitHub Actions runs fired at almost the same time — both tried to deploy. The first one did all the work, collected the data, and started writing. The second one started writing at the same time.
>
> The loser's version won the race to the filesystem and overwrite the winner's data. Forty minutes of crawling just… gone.
>
> [*Show GitHub Actions logs side-by-side*]
>
> This is a concurrency problem. I fixed it with a concurrency group: only one "catalogue-harvest" workflow can run at a time. If another one tries to start, it waits.
>
> Lesson: shared resources need locks, even in CI.

**Bug 3: Gzipped sitemaps that silently parsed to nothing**

> Some retailers serve their sitemaps gzipped. My code was fetching them correctly, but decompression was silently failing. Not erroring. Silently. The parsing came back with an empty result, no red flags, no warnings.
>
> [*Show logs with empty results*]
>
> An empty result looks exactly like "this retailer has no products." A broken result looks exactly like "this retailer has no products." Catastrophic.
>
> The fix: if a sitemap fetch succeeds but the result is empty, log a specific error. "Empty result, possible decompression failure." That way, if something is wrong, the logs scream at you.
>
> Lesson: silence is your enemy. Make failures loud.

**Bug 4: Nested affiliate redirects**

> When a retailer signs up with an affiliate network, sometimes the links come pre-transformed. Already have the tracking parameters baked in.
>
> But I was running every URL through the Awin redirect transform anyway. So some links got transformed twice.
>
> [*Show redirect transforms*]
>
> It actually worked — the redirect chain was harmless — but it was stupid. The code assumed every link needed the same transform. It didn't check whether it was already transformed.
>
> I added a check: if a URL is already an Awin redirect, leave it alone.
>
> Lesson: don't assume all data is in the same format unless you're sure.

**Bug 5: One brand, several spellings**

> I had YSL spelled five different ways. Yves Saint Laurent spelled four ways. Estee Lauder vs. Estée Lauder. ARMAF, Armaf, Armaff.
>
> [*Show duplicate brand pages*]
>
> My first attempt at fixing this was mechanical: normalize to ASCII, lowercase everything, collapse punctuation. That *should* have folded all the variants together.
>
> It did. Mostly. But some are genuine aliases — DKNY is not a misspelling of Donna Karan, it's a diffusion line. And "Estee" to "Estée" — the second one is not just capitalization, it's a different letter. The accent is real.
>
> [*Show KNOWN_ALIASES in code*]
>
> So I did it by hand. I built a map of aliases: Ysl maps to "Yves Saint Laurent." Estee maps to "Estée Lauder." I deliberately left Emporio Armani separate — it's a different product line, not a spelling variant.
>
> It's a few lines of code and eight carefully chosen aliases. Not a grand algorithm. Not a perfect system. Just: these are the ones that matter.
>
> Lesson: sometimes "good enough but explicit" beats "perfect but hidden."

**Bug 6: A hair-care product loose in a perfume catalogue**

> Balmain Hair Silk Perfume. It's a real product. It has the word "Perfume" in the name. So when I filtered for fragrances, it showed up.
>
> [*Show product in catalogue*]
>
> Except it's not a fragrance you wear. It's a hair treatment. It smells nice, but it's not something you spray on yourself.
>
> My filter checked: does the name contain "Perfume"? Yes. Does it have price and stock? Yes. It passed.
>
> [*Show NOT_A_FRAGRANCE regex*]
>
> The fix: add "hair" as a banned keyword. If a product name contains "hair" and "perfume," it's probably not a wearable fragrance.
>
> Did this break anything? I checked against the full live catalogue. No collisions. No real fragrances named with the word "hair."
>
> Lesson: your filters are only as smart as the language they understand. Sometimes language is weird, and you have to outsmart it by hand.

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

**Script (Template for once outreach begins):**

> PriceSniffs is live. It's showing real prices from real retailers. And I need to be honest about something.
>
> The product photos you're looking at — those aren't mine. I'm showing photos from retailer websites. Directly linked, not rehosted. For most of them, I don't have explicit permission to do that.
>
> [*Show retailer registry with photo categories*]
>
> But here's the thing: I'm not hiding it. Look at the code. Each retailer has a reason listed — is this under an affiliate license? From a retailer's own storefront? Or is this hot-linked without permission, reversible the moment they ask?
>
> Some retailers are already on board. Fragrance Click. MyBeauty Boutique. The Beauty Store UK. With them, I have real affiliate feeds. Permission, transparency, clear terms.
>
> But to make PriceSniffs actually sustainable, I need to fix the rest. And I'm doing it the right way: asking.
>
> [*Show outreach email template*]
>
> I'm contacting every retailer that doesn't yet have a licensed setup. The pitch is simple: can we join your affiliate programme? And can we use your product photos under the affiliate terms?
>
> Why would they say yes? Because every person I send to their site is a potential customer. No cost to them. They're already spending money on marketing — affiliate networks are a chunk of that budget. If I send them ten sales a week, they make those ten sales *plus* the affiliate commission comes from money they were already going to spend on customer acquisition.
>
> And the person looking at PriceSniffs never pays a different price. That's the deal: commission comes from the retailer's marketing budget, not from marking up the fragrance.
>
> [*Pause*]
>
> Now, some will say no. Some will say yes. And some will ask me to remove their images entirely. Which I will, immediately. Same standard I already apply.
>
> That's what this whole thing is built on. Honest about how it works, clear about the terms, and respecting everyone's wishes — retailers, readers, no surprises.
>
> [*Show running retailer tally: feed live / permission requested / no response / declined*]
>
> And yes, I'd like to make some money from this eventually. Not a secret. But there's exactly one way to do that ethically: commission on sales that were happening anyway, never a markup on the price shown to the reader.
>
> That's the whole model.

**Suggested visuals:** the actual outreach emails (redacted); a running
tally of retailers by status (feed live / permission requested / no
response / declined) — this could even become a real page on the site
itself, in the spirit of the Update History panel already there.

**Length:** TBD — film once there's real response data to show, not before.

*Note: This script is a template. Update it with real response data, real names, and real retailer feedback once the outreach campaign progresses. The beats stay the same, but fill in the actual outcomes.*

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
