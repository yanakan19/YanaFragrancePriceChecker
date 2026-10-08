# Getting the data in, after the spike failed

The 1 August spike returned zero listings from all twelve shops. Six answered
HTTP 403 before serving markup. This is what the incumbents do instead, and what
it would cost us to route around it.

## Who asks, and what a refusal is (4 October 2026)

The owner decided that every shop is read as PriceSniffsBot: the user agent in
`src/catalogue/botIdentity.ts` (one string, written in one place) and honest
headers, in the harvest, the probe, the feed reads, the logo probe, the price,
delivery and image checks, and anything else that asks a shop for something. The
browser header set, the second ask for robots.txt in a browser's clothes and the
`botIdentityOnly` registry flag are gone. Every shared HTTP client refuses to
send a request that would pass for a browser (`assertBotIdentity`), and
`tests/botIdentity.test.ts` fails if a source file carries a browser user agent.

A shop that answers the bot is read. A shop that refuses it (HTTP 401, 403, 407
or 429, a bot wall, a robots.txt that will not be served or disallows the path)
is recorded as refused and left alone: nothing is retried through a proxy or a
rendered browser, nothing is read from it, and its prices go stale and come off
the site after seven days. A refusal is never worked around.

What that closed: the Apify residential proxy and the Apify browser actor are
off (`METERED_TIERS_ENABLED`), because a residential address exists to get past a
refusal and the actor builds its own browser fingerprint and cannot be shown to
carry the bot's name. The free local browser render stays, as PriceSniffsBot with
no client hints, and only for a shop that answered but draws its grid with
JavaScript; it is never tried after a refusal. Turning the paid tiers back on is
the owner's decision, not a rewrite.

## How PriceRunner actually does it

Not by scraping. **Retailers hand them the data.**

PriceRunner runs a merchant onboarding programme: a shop registers, submits a
product feed, and PriceRunner imports it, [automatically at least once a day and
more often for many retailers](https://www.pricerunner.com/info/faq-prices).
Their own guidance to retailers is blunt about the incentive: shops that
[supply a feed get almost all of the traffic](https://www.pricerunner.com/info/getting-started),
and a richer feed ranks higher and appears more often.

Two details matter more than the headline:

1. **They import "the price file or site".** So a crawl path exists for shops
   that have not onboarded, and they state that they
   [show prices whether or not a retailer is a customer](https://www.pricerunner.com/info/faq-prices).
   Scraping is their fallback, not their engine.
2. **The relationship runs the other way round from ours.** Retailers submit to
   PriceRunner because appearing there sells product. PriceRunner does not have
   to ask.

### The uncomfortable part

That second point is the whole problem. **We have no traffic, so we have no
leverage to ask twelve shops for a feed.** PriceRunner's model is not available
to us on day one; it is what you graduate into.

Worth noting that pricerunner.com returned 403 to our own request while
researching this. The incumbent is behind the same protection that blocked us,
which tells you how normal this posture now is.

## The way in: affiliate feeds are the same thing under another name

An Awin product feed carries what a PriceRunner merchant feed carries: product
name, price, availability, deep link, image, and usually the EAN. The difference
is that **the affiliate network has already done the onboarding for us.** A shop
that runs an Awin programme has already agreed to publish a feed to approved
publishers. We do not need leverage, only approval.

That reframes the affiliate work completely:

| Before the spike | After |
|---|---|
| Monetisation, do it later | The primary ingestion route |
| Nice to have EANs and images | The only free source of both |
| Apply when convenient | Apply first, everything waits on it |

Boots, LOOKFANTASTIC and Superdrug are confirmed Awin merchants. All three
blocked or 404ed us. Getting approved solves those three outright.

## Apify, for whatever feeds cannot cover

Some shops will have no programme, or will reject us. Those need a scraper that
can get past bot protection, which means residential addresses rather than a
datacentre one.

### Candidate actors

These are **candidates to benchmark, not recommendations.** The Apify store
carries a lot of thinly maintained actors, several of these are from small
publishers, and I have run none of them. Treat the list as a shortlist to test
against three of our blocked shops before committing.

| Actor | What it claims | Note |
|---|---|---|
| [`h4sh/anti-bot-bypass`](https://apify.com/h4sh/anti-bot-bypass) | Cloudflare, PerimeterX and DataDome, about $15 per 1,000 requests | Priced per request, which makes budgeting predictable |
| [`ecomscrape/cloudflare-web-scraper`](https://apify.com/ecomscrape/cloudflare-web-scraper) | Cloudflare protected pages, CSS selector extraction | Selector based, so it breaks when markup changes |
| [`xtech/cloudflare-scraper-pro`](https://apify.com/xtech/cloudflare-scraper-pro) | Captcha handling, proxy rotation, JS execution | |
| [`lentic_clockss/stealth-web-scraper`](https://apify.com/lentic_clockss/stealth-web-scraper) | Stealth browser for protected pages | |
| Apify Web Unlocker | Proxy service doing browser level handling, returns HTML | Fits us best: we keep our own parser and only outsource retrieval |

**Web Unlocker is the closest fit to what we have built.** Our JSON-LD parser is
written, tested and working. We do not need an actor that also extracts data and
imposes its own schema; we need something that hands us the HTML the shop would
serve a real browser. That keeps `parseListings` as the single source of parsing
truth and makes swapping providers cheap.

### What it would cost

Two figures from Apify's own pricing: residential proxy traffic runs
[around $8 per GB](https://use-apify.com/blog/apify-proxy-configuration-guide),
and datacentre proxies are far cheaper but are exactly what just got us blocked.

The number that decides the budget is **how many pages you fetch, and our
current design already gets this right.**

- **Reading prices off category pages**, which is what the crawl does today: a
  listing page carries roughly 60 products at once. Six blocked shops with
  perhaps 2,000 fragrance products each is around 35 pages per shop, so **about
  210 pages a day**. At roughly 0.5 MB a page that is near 3 GB a month, so
  **about £20 to £25 a month in proxy traffic**, or about £75 a month on the
  per request actor.
- **Visiting each product page instead** would be 12,000 fetches a day, about
  180 GB a month, and **well over £1,000 a month.**

That sixty to one difference is the single most important cost decision in the
project, and it is already made correctly: `crawlRetailer` walks section pages
and parses every product from the grid. **Do not let anyone "improve" it into a
per product crawler.** If a category page turns out not to carry prices for a
given shop, that shop is a feed candidate, not a per product crawl candidate.

## Recommended order

1. **Apply to Awin now.** It is free, it fixes three confirmed shops, and it
   brings EANs and licensed images that scraping never can.
2. **Audit the other nine programmes.** Rakuten, CJ, Partnerize and Tradedoubler
   cover most of what is not Awin. Every shop with a feed is one we never have
   to fight.
3. **Fix the two 404s.** John Lewis and LOOKFANTASTIC just have wrong section
   URLs. Free.
4. **Check the four silent shops in a browser.** If the JSON-LD is present and
   only the grid is script rendered, a plain headless browser is enough and no
   paid proxy is needed.
5. **Only then buy proxy capacity**, for whatever is genuinely left. Benchmark
   two actors against three shops on a small budget before committing to either.

The honest summary: **most of this problem is solved by paperwork rather than
engineering**, and the engineering we would otherwise pay for is the expensive,
brittle half.

## A note on posture

Feeds are not just cheaper, they are the only route where the retailer has
agreed. Six shops have now actively refused our requests. Continuing to hammer
them from rotating residential addresses is technically possible and is the sort
of thing that reads badly in a dispute, particularly for a site whose entire
pitch is that it can be trusted. Where a shop offers a feed, take the feed.

## What is actually built (2 August update)

The plan above is implemented, not just researched. `src/catalogue/apifyProxy.ts`
routes our own tested JSON-LD parser through Apify's residential proxy, so
retrieval is outsourced but parsing never is — the architectural point made
above, now code rather than intent.

### How to turn it on

1. Sign up at [apify.com](https://apify.com) if you have not already.
2. In the Apify console, go to **Proxy** and copy the **Proxy password**.
   This is *not* the same as an Apify API token — the two are different
   credentials and the proxy will reject the wrong one silently confusingly.
3. Add it as a GitHub Actions secret named `APIFY_PROXY_PASSWORD` on the
   repository (Settings → Secrets and variables → Actions).
4. Run the harvest workflow with **both** `harvest: true` and
   `allow_metered: true`.

With those set, `npm run harvest -- --allow-metered` retries through the proxy
**only** for shops the free sitemap route returned nothing for. It never
touches the four shops that already work for free, and it never fetches
per-product pages — same category-page-only design as the free path, so the
cost stays in the tens-of-pounds-a-month range calculated above rather than
the four figure per-product number.

### What has not been verified

I do not have an Apify account and cannot create one on your behalf, so
**nothing here has run against Apify's real infrastructure.** The gating logic
(budget cap, fallback-only-on-failure, never confusing proxy credentials with
API tokens) is unit tested against a fake transport in
`tests/apifyProxy.test.ts`. The actual proxy handshake — whether
`proxy.apify.com:8000` accepts the credentials and actually returns the
blocked shops' pages — can only be confirmed by running it with a real
password. Treat the first live run with `allow_metered: true` as that
verification step, and read its output rather than assuming it worked.

### Cost control in the code, not just in a spreadsheet

- `MAX_PROXIED_REQUESTS_PER_RUN` (40) is a hard ceiling inside
  `apifyProxyHttp` itself. Even a bug that loops cannot spend past it in one
  run, independent of any caller remembering to check.
- The harvest only invokes the proxy for a shop **after** the free sitemap
  route has already returned zero priced listings for it. Working shops are
  never retried through paid infrastructure.
- Robots.txt is re-fetched through the proxy for the retry, not assumed. A
  shop that blocks the free route usually blocks that too, and treating an
  unreachable robots.txt as permission would be the same category of mistake
  already caught once in `src/catalogue/robots.ts`.

## A second tier below the proxy: real-browser rendering (19 August update)

The proxy above answers one failure: a shop that refuses a datacentre IP.
Auditing the eight enabled retailers that had never once gone live (`boots`,
`superdrug`, `harvey-nichols`, `john-lewis`, `notino-uk`, `selfridges`,
`the-fragrance-shop`, `the-perfume-shop` — see `docs/INGESTION-AUDIT.md`)
against `data/strategy-memory.json`'s most recent probe found a second,
distinct failure the proxy cannot touch: Harvey Nichols and John Lewis return
HTTP 200 with zero listings on *every* strategy, proxied or not, because the
product grid is drawn by client-side script and the response genuinely
carries no markup until JavaScript runs. Boots shows a mix of both shapes.
No residential IP fixes an empty response — the page itself has nothing to
parse.

`src/catalogue/apifyActor.ts` is the tool for that case: one Apify actor run
per shop (`apify/puppeteer-scraper`, real headless Chromium, the same
GB-residential proxy config as above) renders each configured catalogue
section's first page and hands back the resulting HTML. Extraction is still
`parseListings()` and nothing else — the module's own header restates the
"outsource retrieval, not understanding" principle this file already settled
on, one layer further down the stack (rendering, not just retrieval). Wired
as a new `browser-render` strategy (`src/catalogue/strategy.ts`,
`src/catalogue/attempt.ts`) and as a third harvest tier
(`scripts/catalogue-harvest.ts`), each only tried after every cheaper tier
before it has already returned zero.

A third, separate credential: `APIFY_TOKEN`, an Apify **API token** from the
console's Integrations page — not the Apify Proxy password above, and not
interchangeable with it. Same fail-soft shape: absent, the tier is skipped
with a clear log line and every other strategy runs exactly as before.

**Cost is materially higher per page.** Apify's own published compute-unit
rate is $0.13-$0.20/CU (1 CU = 1 GB-RAM-hour) depending on plan, and
independent benchmarking of Puppeteer/Playwright-class actors puts the
all-in cost at roughly $2-5 per 1,000 pages once browser CPU/memory overhead
is counted — both figures estimates gathered from public pricing pages in
August 2026, not a quote for this account's plan. `MAX_ACTOR_PAGES_PER_RUN`
(10) is sized well below the proxy's own 40-page ceiling for that reason —
not to hold spend exactly equal (the per-page cost gap is roughly tenfold,
the budget gap fourfold), but as a conservative starting point sized to this
file's enabled-but-dark shops rather than derived from the cost ratio — see
`apifyActor.ts`'s own header for the full reasoning and sourcing.

**Nothing here has run against Apify's real infrastructure either.** Same
caveat as the proxy above, restated rather than assumed still true: no
Apify account exists in this environment, request-building and budget
gating are unit tested against a fake transport
(`tests/apifyActor.test.ts`, `tests/attempt.test.ts`), and the first real
run with `APIFY_TOKEN` set is the verification step, not this document.

## Switched-off shops: diagnosis, 8 October 2026

Measured in `docs/SHOP-PROBES-2026-10-08.md` (exact error lines there), and
diagnosed one shop at a time under the rules above: PriceSniffsBot only,
robots.txt obeyed, no proxy, fingerprint, captcha or challenge worked round.
What holds for all of them:

- **The Apify tiers stay off** (D23). Where they once worked (the actor on
  Selfridges and Zara in August) they worked by rendering as a visitor from a
  residential address, which is the way round a refusal this project no
  longer takes. `allow_metered` is accepted and does nothing.
- **The free local render is never tried after a refusal**, so it cannot help
  a shop that refuses robots.txt or its sitemap.
- **Our side, fixed:** the one shop probe (`harvest-one-shop.yml`) did not
  install Chromium, so it could not show the render tier the crawl has. It
  now installs it as the crawl does. No refused shop changes because of it.
- **Our side, open:** only an Awin feed reader exists. A shop whose programme
  is on Rakuten Advertising (The Fragrance Shop, probably The Perfume Shop)
  or Partnerize (Selfridges) needs a reader for that network's product feed
  once a programme approves us. Build it against a real approved feed, not
  before.
- **One project wide honest route, not tried:** Cloudflare's Verified Bots
  programme. A bot that identifies itself verifiably (a Web Bot Auth
  signature, or a published IP list with a stable user agent) and obeys
  robots.txt can be listed, and many Cloudflare zones let verified bots past
  their bot rules. Four of the eight are on Cloudflare (The Fragrance Shop,
  Selfridges, Notino UK, Perfume Shopping), and Notino's robots.txt already
  allows us. Whether a given zone admits verified bots is the shop's setting,
  and a WAF block or a region rule would still stand. An owner decision:
  it needs a Cloudflare account, an application, and request signing in
  `src/catalogue/botIdentity.ts`'s clients.

### The Fragrance Shop

- **Blocker:** Cloudflare managed challenge (HTTP 403, `cf-mitigated:
  challenge`) on robots.txt, the three sections and the sitemap; HTTP 403 on
  the sitemap from a GitHub runner. Zone wide, robots.txt included.
- **Our side:** nothing that reaches past it. Identity, URLs and timeouts are
  not the cause; no markup is served, so no parser or adapter can help.
- **Lawful route:** Rakuten Advertising, The Fragrance Shop, advertiser ID
  43488, with a daily product feed (the shop's own affiliates page, read
  through a search engine extract). Awin closed, Webgains closing.
- **Recommendation:** off. Owner applies on Rakuten
  (`docs/outreach/the-fragrance-shop.md`); then build the Rakuten feed reader.

### The Perfume Shop

- **Blocker:** Akamai edge deny (AkamaiGHost "Access Denied", HTTP 403) on
  robots.txt, the four sections, the sitemap and a known product page; HTTP
  403 on the sitemap from a GitHub runner. The same group wide rule as
  Superdrug (both AS Watson).
- **Our side:** nothing. Identity, URLs and timeouts are not the cause; the
  74 stored pages are rightly not re-read after the sitemap refusal.
- **Lawful route:** the shop's affiliate programme (its own /affiliates
  page). Network unconfirmed: Tradedoubler (exclusive from 2018) and Awin
  are listed closed, Rakuten Advertising GB listed open by aggregators.
- **Recommendation:** off. Owner reads the join link on the affiliates page
  and applies, most likely on the same Rakuten account
  (`docs/outreach/the-perfume-shop.md`).

### Selfridges

- **Blocker:** Cloudflare block page ("Attention Required!", "Sorry, you
  have been blocked", HTTP 403) on robots.txt, the section, the sitemap and a
  product page; HTTP 403 on the sitemap from a GitHub runner. A WAF block,
  not a challenge.
- **Our side:** nothing to fix. URL and parser (`selfridgesRsc.ts`) are
  right. The last priced run (60 listings, 2026-10-04 15:38Z) was the free
  local render, two hours before the PriceSniffsBot only rule; the render now
  rightly stops at the refusal.
- **Lawful route:** Partnerize (Selfridges moved there from Awin and Rakuten
  in 2022); Partnerize lets a brand give its partners a product feed.
- **Recommendation:** off. Owner signs up on Partnerize and applies, asking
  for the feed and whether comparison sites are accepted
  (`docs/outreach/selfridges.md`).

### Harvey Nichols

- **Blocker:** no HTTP response to robots.txt on either host: an HTTP/2
  stream reset (INTERNAL_ERROR) or a stall with 0 bytes, from the sandbox and
  a GitHub runner. DNS puts both hosts on Akamai (www via
  sdpremium.edgekey.net), so it is a connection level refusal at the Akamai
  edge. An unreachable robots.txt means nothing may be asked (RFC 9309).
- **Our side:** nothing to fix; the robots rule is applied correctly and a
  longer timeout would only wait on a stall. The probe's new Chromium step
  matters here only if the shop ever answers (its grid is drawn by script).
- **Lawful route:** Rakuten Advertising (affi.io: "Harvey Nichols & Co Ltd",
  GB, open). Unconfirmed; no affiliates page found on the shop's domain.
- **Recommendation:** off. Owner searches Rakuten for the programme and
  applies (`docs/outreach/harvey-nichols.md`).

### Zara

- **Blocker:** Akamai edge deny ("Access Denied", HTTP 403) on robots.txt,
  both sections, the sitemap and a product page; HTTP 403 on the sitemap from
  a GitHub runner. Only the Apify actor on a residential address ever got the
  page (August), and the free local render got 403.
- **Our side:** nothing to fix; the parser already prices its render.
- **Lawful route:** no affiliate programme or feed (an invitation only
  creator scheme through LTK is not a feed). Permission from Zara (Inditex)
  only.
- **Recommendation:** off, lowest priority: a single brand shop is never
  compared with another shop here (`docs/outreach/zara.md`).

### Notino UK

- **Blocker:** Cloudflare managed challenge (HTTP 403, `cf-mitigated:
  challenge`) on the section; robots.txt answers 200 and allows the section,
  product pages and the sitemap. The shop's crawl policy admits us; its
  Cloudflare zone does not.
- **Our side:** nothing broken. The harvest skips `owner-import` on purpose;
  the URL, pagination, parser and saved page importer are in place. Missing:
  a CJ feed reader, to build against a real feed (`docs/NOTINO-PLAN.md`).
- **Lawful route:** CJ Affiliate, Notino UK programme run by VIVnetworks,
  "XML feed: yes". Also the permission email, and the Verified Bots route
  above, which fits best here because robots.txt already allows us.
- **Recommendation:** off. Owner applies on CJ and sends the email the same
  day (`docs/outreach/notino-uk.md`); weekly saved pages are an optional
  bridge.

### Riiffs Perfumes

- **Blocker:** SiteGround bot captcha (HTTP 202, `sg-captcha: challenge`) on
  robots.txt, the sitemap and product pages, from the sandbox and a GitHub
  runner.
- **Our side, fixed:** a 2xx captcha served in place of robots.txt used to
  parse as an empty robots file ("nothing forbidden"), so the harvest asked
  the shop's platform endpoints and sitemap after it had already refused.
  `src/catalogue/robotsSource.ts` now reads a bot wall at robots.txt as a
  refusal and asks nothing else, for every shop. More polite; prices nothing.
- **Lawful route:** no affiliate programme or feed found. Permission from the
  shop, which can have its host let PriceSniffsBot through.
- **Intermittent, proved after the fix:** probe run #78 (03:11Z) was not
  challenged: WooCommerce re-priced 141 of 141 stored listings in 3 requests,
  13 new pages priced. The crawl had also read it cleanly on 2026-10-04,
  two hours before the owner switched it off. So the route works whenever
  SiteGround does not challenge.
- **Recommendation:** off for now as the owner's choice, not a blocker; safe
  to switch back on whenever the owner wants (a challenged run now costs one
  request). The email (`docs/outreach/riiffs.md`) would make it reliable.
