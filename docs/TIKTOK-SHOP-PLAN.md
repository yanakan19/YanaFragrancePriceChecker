# TikTok Shop: the route in, and what is built so far

The owner asked for "a tiktok shop scraper" for sellers like Beauty Base,
PERFUMEO, YeahLive and Oud Arabian — including shipping and live deals — and
then asked for Beauty Base to be the pilot. This document is the route map:
every real way into TikTok Shop data, with evidence, the one that was chosen,
what got built against it, and exactly what cannot move until the owner has
credentials.

The word "scraper" in the ask is treated as "get the listings", not as an
instruction to scrape. Route 1 below explains why a literal scraper is the one
route this project refuses.

Research constraint, stated up front: this sandbox cannot reach tiktok.com or
any shop, so every claim here traces to a web-search result or to a source
that could actually be read (one SDK repository, cloned and read directly).
TikTok's own Partner Center documentation renders behind JavaScript; where a
fact could not be established from a citable source, this document says
"unverified" rather than guessing.

---

## 1. The scraping route — assessed honestly, and refused

What a literal TikTok Shop scraper would fetch: the public web storefront
(`shop.tiktok.com/gb/...` — a UK fragrance category exists at
`shop.tiktok.com/gb/c/fragrances/892552`) and per-product pages.

Three findings, each disqualifying on this project's own rules:

- **Terms of service.** TikTok's ToS prohibits using "any robot, spider,
  crawler, scraper, or other automated means or interface not provided by us
  to access the Services or extract data" without prior written permission
  ([tiktok.com/legal — Terms of Service](https://www.tiktok.com/legal/page/us/terms-of-service/en)).
  Fragrantica ratings were ruled off this site purely on ToS
  (docs/DECISIONS.md context, docs/LEGAL.md); the same line rules this out
  identically.
- **robots.txt.** TikTok's robots.txt disallows, among other paths,
  `/shop/view/product/` — the product-page path itself
  ([webscraping.ai's survey of TikTok's anti-scraping measures](https://webscraping.ai/faq/tiktok-scraping/what-measures-does-tiktok-have-in-place-to-prevent-scraping)).
  This project honours robots.txt everywhere (src/catalogue/robots.ts); a
  crawl of pages robots.txt disallows is not up for discussion.
- **Active defence.** TikTok runs a dedicated anti-scraping programme and
  says so publicly
  ([How We Combat Unauthorized Data Scraping](https://www.tiktok.com/privacy/blog/how-we-combat-scraping/en)).
  The old note in tiktokSellers.ts calling the platform "aggressively
  anti-bot" remains true.

Third-party "TikTok Shop scraper" actors exist on Apify and similar
platforms. Paying someone else to do the scraping does not move the ToS line;
those are not used either. The Awin comparison is exact: where this project
uses Apify, it is as transport (proxy/renderer) to pages whose robots.txt
permits the visit — not against a platform whose terms and robots.txt both
say no.

**Refused.** The official routes below carry the plan.

## 2. The official routes

TikTok Shop has a real API surface, and — the fact that changes the picture
since the Phase 5 scaffolding was written — it opened an **Affiliate
ecosystem to developers in 2024**, with three API families: Affiliate
Creator, Affiliate Seller, and Affiliate Partner
([TikTok for Developers blog, 2024](https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity)).

### 2a. Seller API (TikTok Shop Open Platform)

The full commerce API: Products, Orders, Promotions, Logistics, Finance
([Products API overview](https://partner.tiktokshop.com/docv2/page/650b23eef1fd3102b93d2326),
[API concepts overview](https://partner.tiktokshop.com/docv2/page/tts-api-concepts-overview)).
Confirmed from the [EcomPHP/tiktokshop-php](https://github.com/EcomPHP/tiktokshop-php)
SDK (cloned and read; it mirrors the official endpoints and cites the
official signing spec, partner.tiktokshop.com/doc/page/274638):

- products are keyed by `product_id` throughout — fetched
  (`GET /product/{version}/products/{product_id}`), priced
  (`POST .../prices/update`), activated/deactivated by id;
- the Promotion API models **activities with `begin_time` and `end_time`**
  (`POST /promotion/{version}/activities`, `activities/search`,
  `GET activities/{id}`) — flash-sale windows are first-class data with
  seller-published end times;
- Logistics exposes warehouses and delivery options.

The catch: it is authorised **per shop**. A third party only sees a seller's
data after that seller grants OAuth access to the third party's app
([Authorization overview](https://partner.tiktokshop.com/docv2/page/authorization-overview-202407)).
So this is not a route PriceSniffs can walk alone — but it is the natural
**upgrade path for a cooperating seller**: if Beauty Base authorised the
owner's app against their TikTok shop, everything above flows, including
promotion end times and stock. Worth asking; not the default plan.

### 2b. Affiliate Creator API — the chosen route

The owner is a TikTok creator (@yannysniffs, linked in the site footer). UK
creators join TikTok Shop's affiliate programme at **1,000+ followers, 18+,
account in good standing**
([WGY Edit UK guide](https://www.wegotyouagency.com/blog/tiktok-shop-affiliate-how-to-actually-earn-commission-as-a-uk-creator),
[Advertise Purple requirements update](https://www.advertisepurple.com/tiktok-shop-affiliate-requirements-2025-update/)).
The UK programme is live and documented from TikTok's own UK seller academy
([Open Collaboration walkthrough, seller-uk.tiktok.com](https://seller-uk.tiktok.com/university/essay?knowledge_id=2396648945288993&default_language=en-GB)).

The Affiliate Creator API "helps TikTok Shop Creator Affiliates manage their
collaborations and product showcases … while also tracking the conversion
from their marketing efforts"
([Affiliate Creator API overview](https://partner.tiktokshop.com/docv2/page/affiliate-creator-api-overview)).
Endpoints confirmed from the same SDK (`src/Resources/AffiliateCreator.php`,
category `affiliate_creator`, base `https://open-api.tiktokglobalshop.com`):

| Endpoint | What it is |
|---|---|
| `POST open_collaborations/products/search` | search products sellers have enrolled for any affiliate to promote |
| `GET showcases/products` | the creator's own showcase — the curated product list |
| `POST showcases/products/add` | add products (by `product_ids`) to the showcase — [officially documented at `affiliate_creator/202405/showcases/products/add`](https://partner.tiktokshop.com/docv2/page/add-showcase-products-202405) |
| `GET profiles` | the creator's own profile |
| `POST orders/search` | affiliate conversions |

Why this route wins:

- **It is authorised.** The owner's own credentials, TikTok's own API — the
  Awin pattern exactly. Creator authorization is OAuth
  ([Creator authorization guide](https://partner.tiktokshop.com/docv2/page/creator-authorization-guide));
  "Open Collaborations are available to creators, with the only requirement
  being that the creator has registered and is approved to be a TikTok Shop
  Creator Affiliate."
- **It matches the curation model.** D8's whole stance is hand-picked
  sellers, no open search. The showcase *is* a hand-curated product list: the
  owner adds the pilot sellers' products in the app (or via the add
  endpoint), and the pipeline reads the showcase back. Curation lives with
  the human; the pipeline only ever reads what was curated.
- **It monetises the click.** Affiliate commission on TikTok Shop is
  seller-set, 1%–80% allowed, with beauty commonly 15–30%
  ([Hamster Garage commission guide](https://www.hamstergarage.com/article/tiktok-shop-affiliate-commission-rates-fees-payouts)) —
  the same affiliate-link economics the rest of the site runs on.

What it costs / requires: developer registration on
[TikTok Shop Partner Center](https://partner.tiktokshop.com/) as an
**Affiliate app developer** (per the
[developer onboarding rules](https://partner.tiktokshop.com/docv2/page/tts-affiliate-creator-collaboration-developer-onboarding-termination-rules)
and the 2024 launch blog), app review (reported at ~2–3 business days in
[getphyllo's integration guide](https://www.getphyllo.com/post/tiktok-api-integration-guide-2026-setup-endpoints-common-pitfalls)),
then the owner authorising their own creator account through the app's OAuth
link.

### 2c. Affiliate Partner API

For agencies ("TikTok Affiliate Partners") running campaigns between sellers
and creators ([launch blog](https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity)).
Wrong shape for a one-creator comparison site; not pursued.

### 2d. Routes that look relevant and are not

- **Research API** (`developers.tiktok.com` Product Query): a TikTok Shop
  product query exists with fields like `product_id`, `product_price`
  ([spec page](https://developers.tiktok.com/doc/research-api-specs-query-tiktok-shop-products)),
  but it sits under the Research Tools terms — an academic programme, not a
  commercial price-comparison licence. Not pursued.
- **Third-party affiliate-network integration**: TikTok's 2025-era tie-ups
  with Amazon/Walmart/LTK/Rakuten et al. let creators put *outbound* links to
  those merchants inside TikTok
  ([Lindsey Gamble's write-up](https://www.lindseygamble.com/blog/why-tiktoks-new-integration-with-affiliate-networks-like-amazon-walmart-target-ltk-is-a-big-move-for-creators-brands)).
  That is the reverse direction — nothing there emits TikTok Shop listings.

## 3. The stale note, ruled on

`src/config/tiktokSellers.ts` claimed TikTok Shop has "no affiliate feed, no
stable product ids". Verdict, now recorded in that file's header:

- **"No stable product ids" — wrong.** `product_id` is the first-class key of
  the entire official API: products are fetched by it, priced by it, added to
  showcases by lists of them (§2a, §2b, all cited). Fixture-stable
  identifiers exist.
- **"No affiliate feed" — half right, and stale in the half that matters.**
  There is still no Awin-style downloadable datafeed. But since 2024 there is
  a queryable Affiliate Open API, which is the same job by other means.
- **"Aggressive anti-bot" — still true** (§1), and now an argument *for* the
  API route rather than against the whole venture.

## 4. Integration design

The honesty rules bite at six named points.

1. **A seller is not a `Retailer`.** `TikTokSeller` stays in its own file,
   its listings in their own data directory (`data/tiktok/`, not
   `data/catalogue/`), rendered — when the beta ever turns on — in their own
   section behind `TIKTOK_BETA_CONFIG.enabled` with the mandatory
   disclaimer. D8 unchanged: default off, untrusted sellers not rendered at
   all. New optional `retailerId` field links a seller to the same company's
   own-website registry entry; that linkage is the stated basis of every
   current trust decision and the anchor of the pilot cross-check.

2. **Currency.** TikTok Shop UK sells in sterling; the mapper
   (`mapTikTokCapture`) still refuses to put anything non-GBP into
   `priceGbp` — a non-GBP price lands in `nativePrice`, known-but-unpriced,
   exactly like the brand-direct storefronts. No exchange rate is ever
   invented.

3. **Shipping and vouchers.** TikTok shipping is basket- and
   voucher-resolved at checkout; there is no publishable flat standard rate,
   and free-shipping vouchers are conditional promotions
   ([Kixmon's free-shipping guide](https://kixmon.com/blog/how-to-get-free-shipping-on-tiktok-shop/)).
   So a TikTok seller carries **no `ShippingRule` at all**: its offers take
   the existing `costGbp: null` path — rendered "delivery not stated",
   `deliveredPriceGbp: null`, and *structurally barred from ranking
   cheapest* by the machinery D3 already has. A voucher may be displayed as
   a footnote, the way `membershipPerk` is (D4's logic: never price in a
   discount the reader may not get). Nothing about D3's delivered-price sort
   is weakened, because no shipping figure is ever invented to feed it.

4. **Flash deals and `promoEndsAt`.** TikTok flash sales carry genuine
   seller-set end times with an on-platform countdown
   ([Seller Flash Sale, seller university](https://seller-us.tiktok.com/university/essay?knowledge_id=6837877347124993&lang=en));
   the Promotion API models `begin_time`/`end_time` (§2a). Where a capture
   carries a platform-published end time, it flows into
   `RawListing.promoEndsAt` and the existing `canShowCountdown` does the
   rest. Where it does not, the field is null. The rule "a countdown must
   never be invented" is unchanged — TikTok is simply the first source
   expected to publish real ones.

5. **"Was" prices.** A TikTok strikethrough becomes `wasPriceGbp` only when
   genuinely above the selling price and in the same currency, and then gets
   **zero exemption** from wasPriceCredibility.ts downstream — same gates,
   same quorum, same house-anchor test as every shop. (TikTok's own
   flash-price rule — deal price must not exceed the lowest paid price of
   the last 30 days, per the seller university page above — is TikTok
   enforcing honesty on sellers; it does not exempt TikTok data from ours.)

6. **Trust and identity.** The three sellers entered so far are all the
   same businesses as registry retailers this site already compares
   (§5); their `trusted: true` rests on that documented identity, not on a
   vibe. YeahLive is *not* entered: no search result names its TikTok
   handle, and a guessed handle is exactly what the registry's own header
   forbids.

## 5. The seller registry, as populated

| Seller | Handle | Linked retailer | Sourcing |
|---|---|---|---|
| Beauty Base (pilot) | `@beautybase` | `beautybase` | [tiktok.com/@beautybase](https://www.tiktok.com/@beautybase) — 106K followers, account directs to www.beautybase.com; videos name its eight UK stores |
| PERFUMEO.UK | `@perfumeo.co.uk` | `perfumeo` | [tiktok.com/@perfumeo.co.uk](https://www.tiktok.com/@perfumeo.co.uk) — 28.9K followers, sells via PERFUMEO.co.uk |
| Oud Arabian | `@oud.arabian` | `oud-arabian` | [tiktok.com/@oud.arabian](https://www.tiktok.com/@oud.arabian) — 18.7K followers, names Telford / Milton Keynes / Essex / Guildford stores; [oudarabian.co.uk/pages/locations](https://oudarabian.co.uk/pages/locations) lists the same sites |
| YeahLive | **absent** | — | a "Yeah Live" fragrance shop exists ([shop.app storefront](https://shop.app/m/e30qgnd7u8/collections/shop_all)) but no result names its TikTok handle. Owner supplies the @handle from the app; it gets added with that provenance recorded. |

`TIKTOK_BETA_CONFIG.enabled` remains `false`. Nothing renders.

## 6. Owner's action list — in order

1. **Confirm creator-affiliate status** on @yannysniffs (Showcase icon on the
   profile, or Creator tools → TikTok Shop). UK bar: 1,000+ followers, 18+,
   good standing (§2b).
2. **Register as a developer** at
   [partner.tiktokshop.com](https://partner.tiktokshop.com/) and create an
   **Affiliate app** (Creator type). The app detail page shows the **App
   Key** and **App Secret** — copy both; they only need to be entered once
   (step 4). App review is reported at ~2–3 business days.
3. **Authorise your own creator account** through the app's authorization
   link (`auth.tiktok-shops.com/oauth/authorize?app_key=...`). The redirect
   hands back an `auth_code`; exchanging it (the app's auth page does this,
   or `GET auth.tiktok-shops.com/api/v2/token/get`) yields an
   **access token** (short-lived — one cited figure says 7-day default) and
   a **refresh token**. It is the refresh token this project needs — the
   probe derives its own access token from it on every run (step 6).
4. **Add three GitHub Actions secrets** to this repo — the Awin pattern,
   never committed — with these **exact names** (the probe checks for them
   verbatim and says which is missing if you typo one):
   - `TIKTOK_APP_KEY`
   - `TIKTOK_APP_SECRET`
   - `TIKTOK_REFRESH_TOKEN`

   Add them at **Settings → Secrets and variables → Actions → New repository
   secret** on this repo (the same screen `APIFY_PROXY_PASSWORD` already
   lives on — docs/INGESTION.md).
5. **Add the pilot's products to your showcase**: from @yannysniffs, add
   Beauty Base products (fragrances this site already lists) to your
   showcase in the app. The pipeline reads the showcase back; this is the
   curation step and it stays human.
6. **Dispatch the probe**: **Actions → Catalogue crawl → Run workflow →**
   tick the **`tiktok_probe`** checkbox → **Run workflow**. It runs
   `npm run tiktok:probe` (`scripts/tiktok-probe.ts`) and pushes whatever it
   wrote in a commit titled `TikTok probe: what the Affiliate API answered
   <date>`. Read `data/tiktok/probe-report.json` in that commit:
   - `refreshOutcome` — `"ok"` or the exact refusal TikTok gave;
   - `refreshTokenRotated` — `true` means TikTok issued a new refresh token
     on this call; go back to step 4 and replace the `TIKTOK_REFRESH_TOKEN`
     secret with the new value before the old one expires, or every
     following run will fail;
   - each entry in `calls` — `httpStatus`/`code`/`message` from TikTok, plus
     `rateLimited`/`retries` if the probe had to back off a 429 (bounded at
     3 retries; see scripts/tiktok-probe.ts);
   - `nextStep` — what to do with the raw payload once you have it.
7. Optional, later: ask Beauty Base whether they would authorise the app
   against their own shop (§2a). That unlocks promotion end times and stock
   directly from the source.

## 7. What is built, what runs where, and what waits

**Built and tested offline (this commit):**

- `src/config/tiktokSellers.ts` — three sellers with cited handles,
  documented trust bases, and the corrected header note. Flag still off.
- `src/catalogue/tiktokShop.ts` — `TikTokCaptureRow` (this project's own
  recording format — *not* TikTok's schema, see below),
  `mapTikTokCapture` → `RawListing` with every honesty rule of §4 enforced,
  and `crossCheckTikTokCapture`: the BeautyBase pilot harness that matches a
  capture against `data/catalogue/beautybase.json` (3,100+ own-site listings
  with EANs and sterling prices) EAN-first, title+size fallback, and reports
  price deltas — never comparing across currencies.
- `tests/tiktok.test.ts` — the mapper's refusals, the registry's
  self-documentation, and the cross-check running against the real
  beautybase.json snapshot.
- `scripts/tiktok-probe.ts` + the `tiktok_probe` dispatch input in
  catalogue-daily.yml — credential smoke test: refresh the token, two signed
  read-only calls (profile, showcase products), write a redacted raw report.
  Dispatch-only, never scheduled, exits cleanly with instructions when the
  secrets are absent. Each call retries a 429 up to 3 times, honouring
  `Retry-After` and falling back to bounded backoff otherwise, and the report
  flags a rotated refresh token rather than silently losing it.
  `tests/tiktokProbe.test.ts` covers the signature (checked against a
  from-scratch HMAC computed in the test, matching the algorithm re-read from
  EcomPHP/tiktokshop-php's `Client.php`), the redaction, the rotation flag,
  and the 429 retry — all against a mocked `fetch`, since no real credentials
  or TikTok egress exist in this sandbox.

**Deliberately not built: the response parser.** TikTok's response schemas
sit behind JavaScript-rendered documentation this project cannot cite, and a
parser written against an unseen schema is an invented schema. The probe
therefore captures raw; the `response → TikTokCaptureRow` translation gets
written from the first real captured response, and its fixtures are
transcriptions of that capture. This ordering is the point, not a gap.

**Runnable today from CI on a dispatch:** the probe — which, until the
secrets exist, does nothing but say exactly which secret is missing. With
secrets, it produces the first real payloads.

**What cannot be known until the owner has credentials:**

- the actual response shapes of `open_collaborations/products/search` and
  `showcases/products` — field names, price format, whether images/URLs/EANs
  are included, whether deal end times appear at all in affiliate-facing
  responses (if they do not, `promoEndsAt` stays null and no countdown
  shows; the §2a seller route is then the only source of end times);
- whether Beauty Base, PERFUMEO or Oud Arabian run open collaborations (their
  products are only searchable in the marketplace if enrolled; the showcase
  route works regardless);
- the actual numbers behind real rate limits — TikTok allocates QPS
  dynamically per app/shop and publishes no quota API
  ([getphyllo rate-limit guide](https://www.getphyllo.com/post/tiktok-api-rate-limits-in-2026-quotas-errors-workarounds)),
  so there is no number to size a smarter client against. What does not need
  those numbers is already built and tested: the probe retries a 429 up to
  3 times, honouring `Retry-After` when TikTok sends one and falling back to
  bounded backoff when it does not (`scripts/tiktok-probe.ts`'s `signedGet`,
  covered by `tests/tiktokProbe.test.ts` against a mocked 429 — this could
  not be exercised against TikTok's real limiter, only against the HTTP
  status code itself, which is standard regardless of TikTok's specific
  quota);
- refresh-token lifetime and whether it rotates on use — if it rotates, CI
  cannot update its own secret, and the probe flags rotation in its report so
  the owner refreshes the secret by hand until a better mechanism is chosen;
- whether affiliate responses expose voucher or shipping information in any
  form (expected: no; shipping stays "not stated" either way, per §4.3);
- commission rates per product (useful, not load-bearing).

**Phase after next** (once a real capture exists): response translation +
committed fixtures, per-seller capture files under `data/tiktok/`, and only
then the display work — its own section, its own disclaimer, behind the same
flag, per D8.
