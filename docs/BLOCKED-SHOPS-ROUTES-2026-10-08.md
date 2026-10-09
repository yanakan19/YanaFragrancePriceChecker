# Blocked shops: every lawful route, 2026-10-08

The owner asked whether there is any way around the blocks on The Fragrance
Shop, The Perfume Shop, Selfridges, Harvey Nichols, Zara, Notino UK, Riiffs
Perfumes and Perfume Shopping, and what the alternatives are for Boots and
Superdrug. This file answers with lawful routes only. The measurements behind
each block are in `docs/SHOP-PROBES-2026-10-08.md` (tables and "Diagnosis");
this file does not repeat them.

Nothing went live today. No lawful route that needs no owner works now (the
section "Did anything go live?" at the end says why, shop by shop). No code,
registry entry, workflow or generated file was changed; only this file and
the outreach drafts of the eight shops. Boots and Superdrug get the
"alternatives" part only: their registry entries and outreach drafts were not
touched (other agents are re-measuring them), and neither were Gorgeous Shop,
Beauty Flash, Scentsational or Beauty The Shop UK.

## The lines that do not move (D23)

Every route below keeps these. Where a suggestion that circulates online would
cross one, it is named and refused in "Tricks that cross the line".

- PriceSniffsBot is the only identity
  (`PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)`).
- robots.txt is read first and obeyed; an unreadable one means nothing is asked.
- No fingerprint spoofing, no browser user agent, no captcha solving, no getting
  past a bot challenge, a WAF block or a geo or region block, no residential or
  rotating proxy aimed at a refusal. The Apify tiers stay off.

How this research was done: web searches, and fetches of third party pages
(Cloudflare, Akamai, Awin, Kelkoo, FlexOffers documentation and profiles).
None of the eight shops' own domains was fetched with WebFetch or any other
client today: each already refuses PriceSniffsBot, and reading it under a
different user agent would be a way round that refusal. Where a shop's own
page is quoted, it is from a search engine's extract. DNS was read through
`dns.google` (no request to the shop). One request was made as PriceSniffsBot
to an enabled shop (`https://www.armaf.uk/robots.txt`, 301, `server:
cloudflare`, a `cf-ray` header) to confirm that Shopify shops reach us through
Cloudflare.

## Summary table

| Shop | Edge and block | Best realistic route | First action | Who |
|---|---|---|---|---|
| The Fragrance Shop | Cloudflare managed challenge, zone wide | Rakuten Advertising, advertiser 43488, "fully automated daily product feed" | Rakuten publisher account, apply to 43488, ask for Product Catalog access | Owner |
| The Perfume Shop | Akamai "Access Denied" (AS Watson rule) | Its own affiliate programme; network unconfirmed (Rakuten GB listed open, Tradedoubler and Awin closed) | Open theperfumeshop.com/affiliates in a browser, read the join link's network, apply | Owner |
| Selfridges | Cloudflare WAF block page | Partnerize (since May 2022); feed not confirmed for affiliates | Partnerize partner account, apply to Selfridges, ask for the feed and whether comparison sites are accepted | Owner |
| Harvey Nichols | Akamai edge resets robots.txt | Rakuten Advertising ("Harvey Nichols & Co Ltd", GB, open); FlexOffers lists Harvey Nichols UK | Search the same Rakuten account for Harvey Nichols, apply | Owner |
| Zara | Akamai "Access Denied" | None with a feed; permission only | Send last, if at all (single brand, never compared) | Owner |
| Notino UK | Cloudflare managed challenge; robots.txt allows us | CJ Affiliate, Notino UK (VIVnetworks), XML feed | CJ publisher account, apply to Notino UK; email the same day | Owner |
| Riiffs Perfumes | SiteGround captcha, intermittent | Already reachable as PriceSniffsBot when not challenged; switched off by the owner | Owner decides whether it comes back; email for reliability | Owner |
| Perfume Shopping | Cloudflare region rule | Awin merchant 5901, applied 2026-08-11, not accepted | Chase 5901 in the Awin dashboard | Owner |
| Boots (alternatives) | Imperva (incapdns) | Awin merchant 2041 (excludes Chanel, Dior, Jo Malone) | Apply on Awin, same pitch | Owner |
| Superdrug (alternatives) | Akamai (AS Watson rule) | Awin "Superdrug UK" (profile 127687) | Apply on Awin, same pitch | Owner |

Project wide, second in line: register PriceSniffsBot with Cloudflare's
Verified Bots programme and Akamai's bot directory using one Web Bot Auth key
(section B). It needs an owner decision, a Cloudflare account and a small
build. It cannot reach Selfridges' block page or Perfume Shopping's region rule
unless those shops choose to let verified bots through, and it does not touch
Boots (Imperva) or Riiffs (SiteGround).

## Tricks that cross the line (refused)

Named so that nobody "helpfully" tries them later.

- **A UK self-hosted runner or UK cloud machine for Perfume Shopping.** It would
  still send PriceSniffsBot, but its only purpose would be to get past a region
  rule that refuses us. That is a geo block workaround, which D23 and this
  brief exclude. Allowed only if Perfume Shopping itself says yes.
- **Having a person solve the SiteGround captcha for Riiffs.** SiteGround's own
  blog says a solved captcha allowlists the address or agent that solved it.
  Solving it by hand to unlock the crawler is captcha solving by another name.
- **Residential or rotating proxies, Apify's actor or Web Unlocker, "stealth"
  browsers, anti-bot bypass services.** They exist to defeat a refusal.
- **A browser user agent, client hints or a copied browser fingerprint.**
  Impersonation; `assertBotIdentity` refuses it in code.
- **The shops' mobile app APIs or internal endpoints** (for example Notino's
  `/api/`, which its robots.txt disallows). Not public, and an app is a
  different identity.
- **Reading the same shop's data from somewhere it did not offer it to us:**
  Google Shopping results (Google's robots.txt disallows `/search`), a cached
  copy (Common Crawl, the Wayback Machine), a feed file a feed management
  service hosts for the shop's Google account, or another publisher's copy of an
  affiliate feed. Each takes what the shop refused us by another door, has no
  licence for our use, and is usually stale.
- **Asking a shop to allowlist our user agent alone and calling it done.** Not a
  line, but a weak ask: a user agent can be forged, and security teams know it.
  The emails now offer signed requests on request instead (section B).

## A. Affiliate networks: the route that gives a feed

A network programme is the shop's own, standing permission to publish its
products, with a feed and a tracked link. It is the only route here that
reliably gives price, stock and EAN on a schedule. The project already runs one
(Awin, `scripts/awin-feed-sync.ts`): Fragrance Click's feed in
`data/catalogue/fragrance-click.json` has 1,070 listings, every one with an
EAN, a price, a stock flag and a tracked deep link beside the shop's own URL. Two approvals are needed every time: the network admits
the publisher, then each shop admits it to its programme.

What a small new site needs, from the networks' own words where found:

| Network | Publisher approval | Programme approval | Feed to publishers | Shops here |
|---|---|---|---|---|
| Rakuten Advertising | Free. The sign up asks for company details, the primary website (name, URL, date established, business model, monthly unique visitors) and a tax form (non US publishers choose W-8 status); the Publisher Membership Agreement was updated 2026-01-08. No published traffic minimum found. | Each advertiser approves; may set its own conditions. | Product Catalog: publisher must be set up for it, then approved by each advertiser; delivered by SFTP as XML or pipe delimited text, with header, product lines and trailer. Third party specs list price, sale price, availability and GTIN; exact columns per programme. | The Fragrance Shop (43488), Harvey Nichols, likely The Perfume Shop |
| CJ Affiliate | Free. The Publisher Service Agreement requires a privacy policy on the site; a network profile describes the site and promotional methods. Third party guides' traffic figures (10K a month, US/Canada) are old and do not fit a UK site; none is in CJ's own terms found. | VIVnetworks approves Notino UK by hand; can hold a small site. | Product feed export (CSV or XML, or a GraphQL product search with a personal token); third party guides show price, sale price, availability, GTIN. | Notino UK |
| Partnerize | Free account; the UK partner terms (v1.8, 2025-03-31) say each brand approves partners "in that Advertiser's sole discretion" and may add campaign conditions. | Selfridges approves. | Brands can publish product feeds to partners on their campaign; whether Selfridges does is not confirmed. | Selfridges |
| Awin | Refundable sign up fee of 1 GBP (Awin's help pages; older pages said £5); Awin aims to approve publishers within two working days. Account 3017443 already exists. | Up to about ten working days per programme (older Awin FAQ). | Awin feed or Google format feed; columns include `price`, `availability`, `gtin`, `shipping`, `aw_deep_link`. A merchant without a feed cannot work with comparison partners, Awin says. | Perfume Shopping (5901), Boots (2041), Superdrug (127687) |
| FlexOffers (a sub network) | Free, "100% free to join"; reputedly easier for small sites; pays in US dollars. | Re-offers other networks' programmes. | One aggregated feed, XML or CSV, by API or FTP, refreshed daily for price and stock (FlexOffers' own claim). Listed: The Fragrance Shop (1.6%, 30 days), Harvey Nichols UK (1.6 to 9.6%, 14 days), Notino UK (0.4%, 1 day, "product feeds" listed). Not offering The Perfume Shop. | Back up for The Fragrance Shop, Harvey Nichols, Notino UK |

What every application should show, since all of them are judged by hand:
a live site with real content (it has: about 26,000 products, guides, notes),
a privacy notice and an affiliate disclosure before the click (it has:
`/about/legal`, ASA/CAP wording in `docs/AFFILIATE_SETUP.md`), the promotional
method stated plainly ("price comparison"), and the honest fact that traffic is
small and growing. Superdrug is known to exclude coupon, cashback and deal
sites, so lead with "independent price comparison with delivery included", not
"deals". The shared pitch is in "This week" below.

On approval an agent builds what is missing: a Rakuten Product Catalog reader
(SFTP pull, header and trailer checked), a CJ export reader, a Partnerize feed
reader. Each is built against the first real file, never guessed columns, on
the pattern of `src/catalogue/awinFeedIngest.ts` (refuse zero rows, reconcile,
`source: 'live'`), with a sync workflow that commits through
`scripts/commit-and-push.sh` in the crawl's concurrency group. An Awin
acceptance needs no code at all.

## B. Identity programmes: letting an honest crawler be recognised

These do not get past anything. They let a shop's own CDN recognise
PriceSniffsBot for what it is, and the shop's own settings then decide.

### Cloudflare Verified Bots (The Fragrance Shop, Selfridges, Notino UK, Perfume Shopping)

What Cloudflare asks (its pages updated 2026-07-01, and the policy text):

- Honest self identification: a Web Bot Auth signature, or a published IP list
  with a stable user agent, or reverse DNS.
- Non abusive behaviour: obeys robots.txt and crawl directives, reasonable
  request rates.
- "The minimum traffic should have more than 1,000 requests per day across
  multiple domains"; "a bot crawling one site is not valid".
- A user agent or signature of at least five characters, no special
  characters, not another verified service's; publicly documented behaviour.
- "Domains should only be crawled with the explicit or implicit consent of the
  zone's owner or terms of use."
- Removed from the allowlist on a breach, for example "a set of IPs that are
  not solely used by" the service, or no traffic seen for a period.
- Applied for in the Cloudflare dashboard (Manage Account, Configurations, Bot
  Submission Form; Verification Method "Request Signature"; the key directory
  URL in Validation Instructions). A Cloudflare post says approval usually
  takes a few weeks.

How PriceSniffsBot measures against it:

| Requirement | Today | Gap |
|---|---|---|
| Traffic over 1,000 a day across many Cloudflare zones | The harvest of 2026-10-08 01:23Z read 553 pages from 26 shops served through Cloudflare (24 Shopify shops, whose storefronts answer `server: cloudflare`, plus ScentStore and Home Bargains), robots.txt and platform reads not counted. Five harvests landed on 2026-10-07, so roughly 2,700 pages a day. | Met, on these figures (an estimate; Cloudflare's own sampling decides). |
| Self identification | A stable user agent only. The crawl runs on GitHub's hosted runners, whose addresses are shared Azure ranges, so an IP list is impossible ("not solely used by" us) and there is no reverse DNS of ours. | **Web Bot Auth is the only way.** Needs a key, a key directory and signing in the clients. |
| Public documentation | `/about/bot` states the user agent, robots.txt obeyed with crawl delay, one request at a time at least a second apart, a few visits a day, no login or basket, how to block it, a contact. | Add, once signing is live: the key directory URL, that requests are signed (Web Bot Auth), that requests come from GitHub's cloud runners with no fixed addresses. |
| robots.txt obeyed | Yes, in code (`src/catalogue/robots.ts`, RFC 9309; a challenge at robots.txt counts as a refusal since today). | None. |
| Consent | Shops that refuse us are left alone. | None. |

What has to be built for Web Bot Auth (an agent's work, after the owner says
yes, about one to two days):

1. An Ed25519 key pair. The private key only in a GitHub Actions secret, never
   in a file or a chat.
2. A key directory at `/.well-known/http-message-signatures-directory`, served
   over HTTPS with content type `application/http-message-signatures-directory+json`,
   a JWKS of the public key, and the response itself signed (`Signature` and
   `Signature-Input` with `tag="http-message-signatures-directory"`, the key's
   JWK thumbprint as `keyid`, `created`, `expires`, and `@authority`).
   **GitHub Pages cannot serve this**: it sets no custom headers and gives an
   extensionless file a generic content type. The site's DNS is at Namecheap
   (`dns1.registrar-servers.com`) and the pages are on GitHub's addresses
   (185.199.108.153 and the rest). The simplest host is a free Cloudflare
   Worker on a subdomain such as `bot.pricesniffs.space`, which needs the zone
   moved to Cloudflare's free DNS with the existing GitHub Pages records left
   as DNS only (not proxied), so the site itself is served exactly as now.
3. Signing in every shared client (`src/catalogue/botIdentity.ts` and the
   clients that call `withBotIdentity`): `Signature-Agent:
   "https://bot.pricesniffs.space"`, `Signature-Input` covering `@authority`
   and `signature-agent` with `tag="web-bot-auth"`, `keyid`, `created`, a short
   `expires` and a `nonce`, and `Signature`. `assertBotIdentity` already allows
   such headers; a test would check that every request is signed and that the
   user agent is unchanged.
4. The owner submits the Bot Submission Form with the directory URL and the
   user agent, category **Data Collection** ("Price scraping, competitive
   intelligence gathering, and third-party analytics", Cloudflare's own
   category for this kind of bot).

Honest expectations. Verified status is not a pass. Cloudflare says verified
bots have "historically" been excluded from default bot configurations; a
zone's own WAF custom rules still apply unless the zone skips verified bots
(Cloudflare's own example rule does exactly that, first). Our category is
"Data Collection", which is precisely what a retailer may choose to block.
Per shop: **Notino UK** is the best fit (its robots.txt already allows us; a
managed challenge is the kind of default that exempts verified bots);
**The Fragrance Shop** possible (managed challenge, but zone wide including
robots.txt, which looks deliberate); **Selfridges** unlikely (a WAF block page
is a custom rule); **Perfume Shopping** no (a region rule, unless the shop
exempts verified bots). Likelihood overall: low to medium per shop, but one
build serves every Cloudflare shop, now and later, and also feeds Akamai below.

### Akamai bot directory (The Perfume Shop, Zara, Harvey Nichols, Superdrug)

Akamai has a "Verify Your Bot or AI Agent" form that asks the operator to
"declare your agent identity, provide your User-Agent string and public key"
so its edge can verify traffic and route it "through the Akamai Bot
Directory". Akamai has supported Web Bot Auth at its edge since November 2025,
so **the same key and directory** as Cloudflare's serve here. Eligibility,
cost and timing are not published. A listed bot is placed in a category and
each Akamai customer's policy decides what that category gets, so this is
recognition, not admission. The Perfume Shop and Superdrug deny before
robots.txt (one AS Watson rule), Zara likewise, and Harvey Nichols resets the
connection; recognition could change those only if the shops' policies allow
the category. Likelihood: low, but nearly free once the Cloudflare work exists.

### Imperva (Boots) and SiteGround (Riiffs)

No public good bot submission form was found for Imperva; each site has its own
good and bad bot lists, changed by the site's team or Imperva support with the
bot's user agent and source details. So for Boots the route is Boots' own team.
SiteGround's anti-bot system has no site owner allowlist in Site Tools that was
found; SiteGround says to contact its support when a captcha keeps appearing,
and only SiteGround can lift a block. For Riiffs the route is Riiffs asking its
host. Neither can be done by us.

## C. Feeds the shops already syndicate elsewhere

- **Google Merchant Center / Google Shopping.** A merchant's feed goes to
  Google's account, not to a public URL, and Google does not license Shopping
  results for reuse (its robots.txt disallows `/search`). Not a route.
- **PriceRunner, idealo, PriceSpy.** They receive shops' feeds; they do not pass
  them on. PriceRunner's terms forbid scraping and data mining and the use of
  its content on any other site; its data API is sold case by case to
  businesses. idealo and PriceSpy terms on reuse were not found, and nothing
  suggests a publisher feed. Not a route.
- **Kelkoo Group publisher feeds (exploratory, worth one sign up).** Kelkoo's
  publisher Shopping API has an offers feed per country and per merchant with
  `price`, `deliveryCost`, `availabilityStatus`, `code.ean` and `code.gtin`,
  merchant id and name, the landing URL and a tracked `goUrl`, refreshed from
  merchants who pay per click; publishers sign up online and Kelkoo reviews
  their traffic, starting them in two or three countries. Merchants can exclude
  referrer sites. Kelkoo is headquartered in London and has a UK entity, but
  **which UK fragrance shops are on it is unknown until an account can read the
  merchant list**; none of the eight is confirmed. If any is there, it is a
  lawful, licensed feed with delivery cost included. Owner signs up; an agent
  reads the merchant list.
- **FlexOffers** (section A) aggregates other networks' feeds; listed for The
  Fragrance Shop, Harvey Nichols UK and Notino UK.
- **Skimlinks, Sovrn Commerce.** Link monetisation. Skimlinks once had a
  product API (2013 to 2014 sources); nothing current shows a product feed for
  these shops. Useful later for commission on links, not for prices.
- **Awin, CJ, Rakuten data feeds** are section A. Their terms let an approved
  publisher show the feed on its own site; that is what they are for.
- **eBay.** No official eBay store of The Fragrance Shop or The Perfume Shop
  was found, and eBay's Buy APIs are limited release. Not a route.

## D. Sitemaps and structured data

No route today. Seven of the eight refuse robots.txt or the sitemap itself.
Notino UK's robots.txt allows `/sitemap.xml` and product pages, but the
sitemap answers the same Cloudflare challenge. Riiffs serves its sitemap and
WooCommerce catalogue when SiteGround does not challenge. The existing
harvest reads any of them the moment a shop answers.

## Per shop

Each: routes ranked by realism; owner and agent parts; effort and likelihood.
"Likelihood" is a judgement from the facts above, not a measurement.

### 1. The Fragrance Shop

1. **Rakuten Advertising, advertiser 43488.** The shop's affiliates page
   (search extract, also on `pay.thefragranceshop.co.uk/affiliates`) says to
   join Rakuten, search for "The Fragrance Shop" or ID 43488 and apply, and
   offers "a fully automated daily product feed" and a 30 day cookie. The shop
   has an in house affiliate team (it advertises an Affiliate and Partnerships
   Manager). Owner: Rakuten publisher account, apply, ask for Product Catalog
   access; 30 minutes, then days to weeks. Agent: Rakuten catalog reader on the
   first real file (about a day), sync workflow. Likelihood: **medium to high**
   (an open programme that advertises a feed; a small site may be asked about
   traffic).
2. **FlexOffers** (1.6%, 30 day cookie; feed not stated on the listing).
   Owner signs up if Rakuten declines. Likelihood of a usable feed: low to
   medium.
3. **Permission email** to `affiliates@thefragranceshop.co.uk` (the address on
   the affiliates page as extracted by a search engine; not confirmed live),
   after applying. Draft refreshed: `docs/outreach/the-fragrance-shop.md`.
   Likelihood of an allowlist: low; of help with the application: medium.
4. **Cloudflare Verified Bot** (section B). Possible, not likely.

### 2. The Perfume Shop

1. **Its own affiliate programme** (`theperfumeshop.com/affiliates`, UK and
   Ireland pages: CPA on confirmed sales, 30 day cookie). Network unconfirmed:
   Tradedoubler was exclusive from December 2018; aggregators list
   Tradedoubler and Awin closed and Rakuten Advertising GB open; Lasso lists
   2.01% and approval "typically a few days"; FlexOffers does not offer it.
   Owner: open the page in an ordinary browser, follow the join link, apply on
   that network (likely the same Rakuten account), ask for the feed. Agent: the
   reader for that network. Likelihood: **medium**, once the network is known.
2. **Group level permission** (AS Watson: The Perfume Shop and Superdrug share
   one Akamai rule). One yes from the group's e-commerce team could open both.
   Draft: `docs/outreach/the-perfume-shop.md`. Likelihood: low.
3. **Akamai bot directory** (section B). Low.

### 3. Selfridges

1. **Partnerize.** PerformanceIN (18 May 2022) reported Selfridges consolidating
   onto Partnerize and retiring Awin and Rakuten. Aggregators also list
   Skimlinks (10 to 15%) and Sovrn (8.84%), which pay on links but give no
   feed. No current source confirms a product feed for affiliates (its 2024
   product data news was Criteo retail media). Owner: Partnerize partner
   account, find the Selfridges campaign, apply, ask for the beauty and
   fragrance feed and whether comparison sites are accepted. Agent: Partnerize
   feed reader on approval; the page parser (`selfridgesRsc.ts`) stays.
   Likelihood: **low to medium** (luxury brands often decline comparison
   sites; the feed is unconfirmed).
2. **Permission email** through Customer Services, asking for the affiliate
   or e-commerce team. Draft: `docs/outreach/selfridges.md`. Low.
3. **Cloudflare Verified Bot**: unlikely to pass a WAF block page unless
   Selfridges adds a skip for verified bots.

### 4. Harvey Nichols

1. **Rakuten Advertising** ("Harvey Nichols & Co Ltd", GB, open, on affi.io).
   Harvey Nichols' affiliate manager spoke at Partnerize's PI Live Europe 2024,
   and its US and APAC programmes are on Partnerize, so the UK network must be
   read off the Rakuten directory, not assumed. Owner: search the Rakuten
   account (same as The Fragrance Shop), apply, ask for the catalog. Agent:
   the same Rakuten reader serves it. Likelihood: **medium**.
2. **FlexOffers, Harvey Nichols UK** (1.6 to 9.6%, 14 day cookie; feed not
   stated). Backup.
3. **Permission email** (help pages). Draft refreshed:
   `docs/outreach/harvey-nichols.md`. Low.
4. **Akamai bot directory.** Low: the edge resets the connection before
   robots.txt, so even recognition may not change it.

### 5. Zara

1. **Permission from Inditex**, last if at all. No affiliate programme with a
   feed: sources describe an invitation only creator scheme through LTK and
   Captiv8 with a 24 hour cookie, and one says Zara has no active programme.
   A sister brand, Stradivarius, once ran a UK programme on Awin, so an Inditex
   programme is not impossible later. Zara sells only its own perfumes, so its
   listings are never compared with another shop. Draft:
   `docs/outreach/zara.md`. Likelihood: very low; value: low.
2. **Akamai bot directory.** Very low.

### 6. Notino UK

1. **CJ Affiliate, Notino UK (VIVnetworks, now part of CJ).** Notino's own
   French affiliate page points to CJ sign up; VIVnetworks' catalogue lists
   "XML feed: yes". Commission figures conflict (4 to 6% on CJ by one source,
   0.4% and a 1 day cookie on FlexOffers' re-offer). Owner: CJ publisher
   account (privacy policy on the site: yes), apply to Notino UK, ask for the
   feed. Agent: CJ export reader on the real file (`docs/NOTINO-PLAN.md`
   step 3). Likelihood: **medium**.
2. **Cloudflare Verified Bot.** The best fit of any shop: robots.txt already
   allows us and the block is a managed challenge. Likelihood: medium, if the
   owner chooses section B.
3. **Permission email, same day as the CJ application.** Draft refreshed:
   `docs/outreach/notino-uk.md`. Low to medium.
4. **FlexOffers, Notino UK**, "product feeds" listed. Backup.
5. **Owner saved pages** (built, `npm run notino:import`). A bridge only.

### 7. Riiffs Perfumes

1. **It already works as PriceSniffsBot when SiteGround does not challenge**
   (probe run #78, 2026-10-08 03:11Z: 141 of 141 re-priced in 3 requests). It
   is off because the owner switched it off on 2026-10-04 with nine other
   shops (commit ff68d662), not because it is unreachable. Switching it back on
   is the owner's call: `enabled: true`, remove it from the switched off lists
   in `tests/registry.test.ts` and `tests/switchedOffShops.ts`,
   `npm run rebuild`, a changelog line. A challenged run now costs one request.
2. **Permission email** asking Riiffs to have SiteGround let PriceSniffsBot
   through (only SiteGround can). Draft refreshed: `docs/outreach/riiffs.md`.
   Likelihood: medium (a small brand shop gains free listings).
3. No affiliate programme or feed was found (Sterling Perfumes Industries,
   Dubai). Its perfumes stay listed through FragranceHub and Perfume Click.

### 8. Perfume Shopping

1. **Awin merchant 5901.** Awin's public profile (read today): "Perfume Shopping
   Affiliate Programme", perfumeshopping.com, 5% starting rate (7% launch
   incentive; cashback, voucher and discount sites 5%), attribution 30 days
   (the description says 28), average order £24.03; no product feed or
   publisher criteria stated. Applied 2026-08-11; not among the five accepted
   advertisers on 2026-10-08. Owner: read its status in the dashboard, message
   the advertiser through Awin with the pitch, or re-apply. Agent: on
   acceptance, `awinActive('5901', '3017443')` and `adapter: 'affiliate-feed'`;
   no code. If Perfume Shopping has no feed on Awin, ask it to add one (Awin
   says comparison partners need one). Likelihood: **medium**; it has sat two
   months, so a nudge matters.
2. **Permission email** through the Awin advertiser contact. Draft refreshed:
   `docs/outreach/perfume-shopping.md`. The only lawful way past the region
   rule is the shop exempting PriceSniffsBot (or verified bots) itself.
3. A UK runner is **not** a route (see "Tricks that cross the line").

### Boots (alternatives only)

1. **Awin merchant 2041**, "Boots.com Affiliate Programme": category based
   commission (mostly 2%), 14 day cookie, deep links to the UK site only, brand
   bidding forbidden, and **Chanel, Dior and Jo Malone may not be promoted
   without the brand's permission** (with baby milk, Dyson, Fitbit, Apple and
   prescriptions excluded). For a fragrance site that removes some of the most
   searched brands from any Boots feed use; the application should ask how a
   comparison site should treat those lines. No product feed is mentioned on
   the profile. Owner applies (the registry shows Awin `pending`); likelihood
   medium.
2. **Permission email** to the press office (draft exists, not changed here).
3. Imperva has no public bot form; recognition is Boots' own decision.

### Superdrug (alternatives only)

1. **Awin "Superdrug UK Affiliate Programme"**, profile 127687 (read today;
   30 day attribution; no commission or exclusions stated on the public
   profile). Superdrug is known to exclude coupon, cashback and deal sites, so
   lead with comparison and editorial content. Owner applies; likelihood
   medium.
2. **Group permission** with The Perfume Shop (AS Watson), and the Akamai
   directory as for The Perfume Shop.

## This week: the single highest leverage thing

**Make the affiliate applications in one sitting, with one pitch.** One
afternoon covers six of the eight shops and both alternatives:

| Network | Account | Apply to |
|---|---|---|
| Rakuten Advertising (UK) | new | The Fragrance Shop (43488), Harvey Nichols, The Perfume Shop if its join link goes there |
| CJ Affiliate | new | Notino UK |
| Partnerize | new | Selfridges |
| Awin | existing (3017443) | chase Perfume Shopping (5901); apply Boots (2041), Superdrug (127687) |
| Kelkoo Group (optional) | new | none yet; an agent reads its UK merchant list afterwards |

Steps, the same on each network:

1. Sign up as a publisher with `https://pricesniffs.space` as the site, in the
   name the site is run under (YannySniffs, run by the owner), category "price
   comparison" or "comparison shopping", UK as the main market. State monthly
   visitors honestly.
2. Paste the pitch below into the site description and into each programme
   application (change the shop name).
3. In each application, ask in one line for product feed access (Rakuten:
   "Product Catalog"; CJ: product feed; Partnerize: product feed; Awin: the
   shop's feed).
4. On the same day, send that shop's permission email
   (`docs/outreach/<shop>.md`); it mentions the application.
5. Tell an agent each outcome and each advertiser ID. Never paste a password,
   API key or SFTP credential into a chat or a file: they go into GitHub
   Actions secrets.

The pitch (under 150 words, fits every form):

> PriceSniffs (https://pricesniffs.space) is an independent UK fragrance price
> comparison site. For each perfume it shows the price at every UK shop that
> sells it, with delivery included, so shoppers see the real total, and every
> listing links straight to the shop's own product page. It lists about 26,000
> products from more than 45 UK shops and adds fragrance notes and buying
> guides. Ranking is by delivered price and stock only, never by commission,
> and affiliate links are disclosed before the click. Prices that cannot be
> kept current are removed rather than shown stale. We are a small, growing
> site and would like to send [SHOP]'s shoppers to you through tracked links.
> We would use your product feed to keep prices, stock and links accurate.
> Contact: yannysniffs@gmail.com.

Second, for the owner to decide this week: **say yes or no to Web Bot Auth and
the Cloudflare and Akamai registrations** (section B). If yes, the owner: makes
a free Cloudflare account, moves the pricesniffs.space DNS to Cloudflare with
the GitHub Pages records left DNS only (about 30 minutes; an agent can list the
exact records first), and later submits the two forms. An agent: generates the
key (private part straight into a secret), builds the Worker for
`bot.pricesniffs.space`, signing in the clients with tests, and the `/about/bot`
additions. This would also be a new owner decision to record next to D23.

## Did anything go live?

No. Each candidate for a route that needs no owner and works now:

- **A public, robots allowed feed of one of these shops.** None found. Seven
  refuse robots.txt or the sitemap; Notino's allowed sitemap is behind a
  challenge. Feed copies hosted elsewhere are refused above.
- **Riiffs.** Reachable today when not challenged, but switched off by the
  owner. Re-enabling it is the owner's decision, not a route an agent may take
  alone.
- **Network data with no sign up.** Every feed found (Rakuten, CJ, Partnerize,
  Awin, FlexOffers, Kelkoo) needs an account the owner must open.

So no dispatch was made, no registry entry changed, nothing was rebuilt and no
changelog line was added.

## Boots relaunch, findings of 2026-10-09

Owner asked for Boots to be relaunched. Result: **no lawful route works today; nothing added to the site.**

One polite request each, PriceSniffsBot/0.2 identity, 2 second gaps, nothing retried:

| Request | Answer |
| --- | --- |
| `https://www.boots.com/robots.txt` | 200. Only search, checkout, account, CMS and tracking paths are disallowed; fragrance and product pages are allowed. One `Sitemap:` line (`sitemap_11352.xml`). |
| `https://www.boots.com/sitemap_11352.xml` | 200 (gzip index, lists `uk-product-sitemap.xml`, lastmod 2026-09-22). |
| `https://www.boots.com/` | 403, Imperva (Incapsula) challenge page. |
| `.../uk-product-sitemap.xml` | 403, the same Imperva challenge. |

So robots.txt allows the pages but Imperva refuses the bot on the pages and the product
sitemap. Under D23 that is a refusal, not worked around (no browser headers, proxy, headless
render or challenge solving), and no product page was asked for after it.

Awin (merchant 2041): `data/awin-feed-sync-state.json` lists only Fragrance Click, MyBeauty
Boutique, Nicchia Luxury UK and Perfume Click. The registry entry still reads
`awinRequested('2041')` (applied 2026-08-11), no Awin feed key is available in this sandbox,
and no evidence of acceptance exists in the repo. I did not dispatch the `awin_memberships`
run of `catalogue-daily.yml` because a crawl was in progress and it shares that concurrency
group. Even if accepted, the programme excludes Chanel, Dior and Jo Malone.

Next, owner only: dispatch `catalogue-daily.yml` with `awin_memberships: true` (reads only)
and read the `2041  boots` line. If joined, set `adapter: 'affiliate-feed'` and
`affiliate: awinActive('2041', <publisherId>)`; `scripts/awin-feed-sync.ts` then picks the feed
up. If not joined, chase the application or send the Boots press office permission request
(draft in `docs/outreach/`). Delivery terms stay unset until a Boots page is readable.

## Sources

Read 2026-10-08.

- Cloudflare: [Verified bots](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/),
  [policy](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/policy/),
  [Web Bot Auth](https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/),
  [categories](https://developers.cloudflare.com/bots/reference/verified-bot-categories),
  [signed agents](https://developers.cloudflare.com/bots/concepts/bot/signed-agents),
  [challenge bad bots (skip verified bots rule)](https://developers.cloudflare.com/waf/custom-rules/use-cases/challenge-bad-bots/index.md).
- Akamai: [Verify your bot or AI agent](https://www.akamai.com/lp/bot-agent-registration),
  [Redefine trust with Web Bot Authentication (2025-11)](https://www.akamai.com/blog/security/2025/nov/redefine-trust-web-bot-authentication).
- Imperva: [how to block good bots traffic](https://community.imperva.com/blogs/ankit-sharma/2023/07/17/how-to-block-good-bots-traffic).
  SiteGround: [new anti-bot AI](https://www.siteground.co.uk/blog/new-anti-bot-ai),
  [mysites.guru on SiteGround captcha](https://mysites.guru/blog/siteground-captcha-blocking-mysites-guru/).
- GitHub Pages headers: [community discussion 84963](https://github.com/orgs/community/discussions/84963).
- Rakuten: [publisher product feed attachment](https://pubhelp.rakutenadvertising.com/hc/en-us/article_attachments/22365119792013),
  [Rakuten review (requirements summary)](https://content.dash.fi/blog/rakuten-affiliate-advertising-program-review-2023).
- The Fragrance Shop: [affiliates page](https://www.thefragranceshop.co.uk/affiliates) and
  [pay. copy](https://pay.thefragranceshop.co.uk/affiliates) (search extracts),
  [affi.io](https://affi.io/m/the-fragrance-shop),
  [careers: Affiliate and Partnerships Manager](https://www.careers.thefragranceshop.co.uk/job/affiliate-and-partnerships-manager),
  [FlexOffers](https://www.flexoffers.com/affiliate-programs/fragrance-shop-affiliate-program/).
- The Perfume Shop: [affiliates page](https://www.theperfumeshop.com/affiliates) (search extract),
  [Tradedoubler 2018](https://www.tradedoubler.com/en/blog/advertiser-spotlight-the-perfume-shop/),
  [Lasso](https://getlasso.co/affiliate/the-perfume-shop/), [affilitizer](https://www.affilitizer.com/programs/theperfumeshop.com).
- Selfridges: [PerformanceIN 2022](https://performancein.com/news/2022/05/18/selfridges-chooses-partnerize-to-consolidate-its-global-affiliate-programme/),
  [Affilimate](https://affilimate.com/programs/selfrigdes-affiliate-program/), [affi.io](https://affi.io/m/selfridges),
  [Criteo 2024](https://www.criteo.com/news/press-releases/2024/09/selfridges-partners-with-criteo-to-offer-brands-premium-spaces-to-connect-with-luxury-shoppers/).
- Partnerize: [UK publisher terms v1.8](https://partnerize.com/20250331-partnerize-publisher-terms-and-conditions-1-8-uk-entity-min),
  [PI Live Europe 2024 recap](https://partnerize.com/resources/blog/recap-pi-live-europe-2024-with-harvey-nicols-charlotte-tilbury-on-affiliate-partnerships-driving-success-through-diversification-collaboration),
  [GoDataFeed: Partnerize feed](https://help.godatafeed.com/hc/en-us/articles/360004240012-Feed-Publishing-Ascend-by-Partnerize-feed).
- Harvey Nichols: [affi.io](https://affi.io/m/harvey-nichols-and-co-ltd),
  [FlexOffers UK](https://www.flexoffers.com/affiliate-programs/harvey-nichols-uk-affiliate-program/).
- Zara: [creator-hero review](https://www.creator-hero.com/de/blog/zara-affiliate-program-in-depth-review-pros-and-cons),
  [toptut](https://toptut.com/zara-affiliate-program-all-you-need-to-know/?amp=1).
- Notino: [notino.fr affiliate page](https://www.notino.fr/programme-affiliation/) (search extract),
  [referly](https://www.referly.so/affiliate-programs/notino),
  [FlexOffers UK](https://www.flexoffers.com/affiliate-programs/notino-co-uk-affiliate-program/),
  [VIVnetworks into CJ](https://onlinemarketing.de/unternehmensnews/publicis-groupe-erwirbt-vivnetwork),
  [CJ publisher service agreement](https://www.lawinsider.com/contracts/6gRW15RYpHO).
- Awin: [Perfume Shopping 5901](https://ui.awin.com/merchant-profile/5901),
  [Boots 2041](https://ui.awin.com/merchant-profile/2041),
  [Superdrug 127687](https://ui.awin.com/merchant-profile/127687),
  [Enhanced feeds publisher columns](https://help.awin.com/developers/docs/enhanced-feeds-publisher-faq),
  [How to join Awin as a publisher](https://success.awin.com/articles/en_US/Knowledge/How-do-I-join-Awin-as-a-Publisher),
  [product feed](https://help.awin.com/docs/product-feed.md).
- FlexOffers: [product feeds](https://www.flexoffers.com/publishers/product-feeds).
- Kelkoo Group: [publisher docs](https://docs.kelkoogroup.com/for-publishers),
  [offers feed fields](https://docs.kelkoogroup.com/for-publishers/shopping-api-feeds/feeds-offers/offers-feeds-fields),
  [offers feed request](https://docs.kelkoogroup.com/for-publishers/shopping-api-feeds/feeds-offers/offers-feeds-request),
  [merchant restrictions](https://docs.kelkoogroup.com/for-publishers/shopping-api-feeds/feeds-merchants-restrictions).
- PriceRunner: [terms](https://www.pricerunner.com/info/terms). Skimlinks:
  [TechCrunch on its API](https://techcrunch.com/?p=522909). eBay:
  [Buy APIs overview](https://developer.ebay.com/api-docs/buy/static/buy-overview.html).
