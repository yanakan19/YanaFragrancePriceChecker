# Getting the data in, after the spike failed

The 1 August spike returned zero listings from all twelve shops. Six answered
HTTP 403 before serving markup. This is what the incumbents do instead, and what
it would cost us to route around it.

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
