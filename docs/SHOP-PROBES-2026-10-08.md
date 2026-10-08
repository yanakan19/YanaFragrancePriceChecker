# Shop probes, 2026-10-08

Measurements only. No adapter, registry entry or workflow was changed and no
shop was enabled. Eight shops, all `enabled: false` in `src/config/retailers.ts`:
The Fragrance Shop, The Perfume Shop, Selfridges, Harvey Nichols, Zara,
Notino UK, Riiffs Perfumes, Perfume Shopping. Boots, Superdrug, Gorgeous Shop,
Beauty Flash, Scentsational and Beauty The Shop UK were not touched.

Everything below was read off a response or a job log on 2026-10-08. Where a log
does not print a figure (for example the byte size of a 403) the table says
"not logged" rather than guessing.

## Rules applied (docs/DECISIONS.md D23, registry comments)

- Identity: `PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)`
  and the `accept` / `accept-language` headers of `BOT_HEADERS` in
  `src/catalogue/botIdentity.ts`, nothing else. No browser user agent, no
  fingerprint changes, no cookies carried between requests, no challenge or
  captcha followed, no redirect followed, no retry against a refusal.
- Local requests: `curl 8.5.0 --compressed`, HTTP/2 negotiated, one request per
  URL, at least the registry's `minRequestGapMs` between two requests to one
  host. They left this machine through the session's egress proxy. "Bytes" in
  the local tables is the decoded body size; the compressed size on the wire
  was smaller for the gzip/brotli responses.
- robots.txt rule, as the project's own parser applies it
  (`src/catalogue/robots.ts`, RFC 9309): robots.txt read first; a 4xx means no
  restrictions stated; a 5xx, a timeout or a network error means nothing else
  may be asked. Harvey Nichols is the only shop where robots.txt was unreadable
  in that sense, so nothing else was requested from it. Notino UK's robots.txt
  was read and applied (`isAllowed` from `src/catalogue/robots.ts` returned true
  for the section and the sitemap).
- Metered tiers (Apify proxy and actor) are off in code
  (`METERED_TIERS_ENABLED = false`) and `allow_metered` was passed as `false`.
- Notino UK has `adapter: 'owner-import'`, which `scripts/catalogue-harvest.ts`
  filters out (`r.adapter !== 'owner-import'`). As instructed it got a plain
  robots.txt request and one section request from this machine, and no dispatch.

## Which workflow was dispatched, and why

The brief named a `harvest_shop` dispatch. `catalogue-daily.yml` with
`harvest: true, harvest_shop: <id>` runs `npm run harvest -- ... --shop=<id>`
without `--dry-run`, and `scripts/catalogue-harvest.ts` only admits a disabled
shop when `--shop` is combined with `--dry-run`
(`askingAboutOneNamedShop = onlyShop !== null && dryRun`, then
`(r.enabled || askingAboutOneNamedShop)`; commit 920f1ecf lines 422 to 436). By that code a
`harvest_shop` dispatch for any of these eight selects no shop, takes the crawl's
concurrency group and runs the full test, rebuild and commit steps. That workflow
was not dispatched, so this is read from the code and not confirmed by a run.

`harvest-one-shop.yml` ("Harvest probe (one shop)") runs the same script as
`npm run harvest -- --shop=<id> --max=20 --dry-run`, writes nothing, and has no
concurrency group. It was dispatched once per shop, one at a time, with
`shop=<id>`, `harvest_max=20`, `allow_metered=false`, on ref
`claude/scentday-retailer-registry-h92tth`. Immediately before each dispatch
the GitHub tools showed no `catalogue-daily.yml` run with status `in_progress`
(`total_count: 0`). The last full crawl before the first dispatch, run #790,
completed at 02:16:49Z; the first dispatch was at 02:17:30Z. Run #770 (event
`schedule`, created 2026-10-07T16:53:40Z) showed status `queued` with no jobs when
checked at 02:07Z and was not treated as a crawl in progress.

Two consequences, both from the files and logs:

- `data/harvest-report.json` is not written by a dry run (every log ends
  "That is the probe's answer; nothing was written."). The committed copy
  (commit 61e815e8, 2026-10-07T22:13:59Z, `endedReason: swept-every-shop`)
  lists 39 shops and none of these eight, so the job logs are the only source.
- `harvest-one-shop.yml` has no step that installs Chromium
  (`catalogue-daily.yml` has "Install Chromium for the local render tier").
  In none of today's seven logs was a page rendered ("local browser pages
  rendered this run: 0 of 12 budgeted"), so no render tier request was made
  today. The same workflow's run of 2026-10-03 (Perfume Shopping, job
  111092664586) did try a render and logged, for both section URLs,
  `HTTP 0, 0 bytes, local browser unavailable: browserType.launch: Executable doesn't exist at /home/runner/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`.

Runs #72 and #73 in the workflow's run list are other dispatches and are not
used here. Only the runs in the table below were used, each
checked by the `SHOP:` value and the `--shop=` argument printed in its own log.

| Shop | Run | Job | Created (UTC) | Job started to completed | Conclusion | Commit |
|---|---|---|---|---|---|---|
| The Fragrance Shop | [#66](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717143266) 37717143266 | [113116117730](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717143266/job/113116117730) | 02:17:30Z | 02:17:33Z to 02:17:55Z | success | f0f2512f |
| The Perfume Shop | [#67](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717225999) 37717225999 | [113116386630](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717225999/job/113116386630) | 02:18:32Z | 02:19:13Z to 02:19:40Z | success | f0f2512f |
| Selfridges | [#68](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717339147) 37717339147 | [113116748477](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717339147/job/113116748477) | 02:19:58Z | 02:20:03Z to 02:20:29Z | success | f0f2512f |
| Harvey Nichols | [#69](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717419673) 37717419673 | [113116999655](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717419673/job/113116999655) | 02:20:54Z | 02:20:58Z to 02:24:43Z | success | f0f2512f |
| Zara | [#70](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717758185) 37717758185 | [113118100955](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717758185/job/113118100955) | 02:25:05Z | 02:25:09Z to 02:25:36Z | success | f0f2512f |
| Notino UK | not dispatched (adapter `owner-import`) | - | - | - | - | - |
| Riiffs Perfumes | [#71](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717839522) 37717839522 | [113118354454](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37717839522/job/113118354454) | 02:26:01Z | 02:26:06Z to 02:26:43Z | success | f0f2512f |
| Perfume Shopping | [#74](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37718652518) 37718652518 | [113120946482](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37718652518/job/113120946482) | 02:35:56Z | 02:35:59Z to 02:36:23Z | success | da8eb74e |

Every run ended `success` because `harvest-one-shop.yml` turns the harvest's
"nothing harvested" exit code 3 into a warning and exits 0.

## Summary

Local probe window: 02:07:46Z to 02:11:22Z. Harvest dispatches: 02:17:30Z to 02:36:23Z.

| Shop | Last recorded blocker (registry) | Blocker as measured 2026-10-08 |
|---|---|---|
| The Fragrance Shop | 2026-10-03: robots.txt HTTP 403, Cloudflare "Just a moment..." challenge | Cloudflare challenge on all 5 local requests (robots.txt, 3 sections, sitemap); CI sitemap.xml HTTP 403, render tier skipped; 0 urls, 0 priced |
| The Perfume Shop | 2026-10-03: robots.txt HTTP 403, Akamai "Access Denied" | AkamaiGHost "Access Denied" HTTP 403 on all 7 local requests (388 to 454 bytes); CI sitemap.xml HTTP 403, render tier skipped; 0 urls, 0 priced |
| Selfridges | 2026-10-03 (run #577): section pages 2 to 5 refused, page 1 gave 60; plain fetch 403 (2026-10-01) | Cloudflare block page "Attention Required! \| Cloudflare" HTTP 403 on all 4 local requests; CI sitemap.xml HTTP 403; 0 urls, 0 priced |
| Harvey Nichols | 2026-10-03: robots.txt HTTP/2 stream reset, HTTP/1.1 retry 0 bytes in 25 s | robots.txt gives no response (www: HTTP/2 INTERNAL_ERROR reset, then an HTTP/1.1 timeout after 30 s with 0 bytes; apex: HTTP/2 INTERNAL_ERROR reset); CI: "robots.txt could not be read, so nothing may be fetched"; nothing else requested |
| Zara | 2026-10-03: robots.txt HTTP 403, Akamai "Access Denied" | Akamai "Access Denied" HTTP 403 on all 5 local requests (375 to 476 bytes); CI sitemap.xml HTTP 403, render tier skipped; 0 urls, 0 priced |
| Notino UK | 2026-10-03: robots.txt 200, home page 403 Cloudflare challenge; 2026-10-06 adapter set to `owner-import` | robots.txt HTTP 200 (2,552 bytes, section allowed); section `/fragrance/?f=1-1-55544` HTTP 403 Cloudflare challenge (5,680 bytes); harvest skips this adapter, not dispatched |
| Riiffs Perfumes | 2026-10-03: robots.txt HTTP 202 SiteGround captcha redirect | SiteGround captcha (HTTP 202, `sg-captcha: challenge`) on robots.txt, sitemap_index.xml and a product page; CI sitemap.xml HTTP 202 captcha, "stopped early"; 0 urls, 0 priced; registry has `catalogue: null` |
| Perfume Shopping | 2026-10-03: robots.txt HTTP 403 Cloudflare "not available in your region"; CI sitemap.xml 403 | Cloudflare region refusal HTTP 403, 90 byte text/plain body, on all 4 local requests; CI sitemap.xml HTTP 403; 0 urls, 0 priced |

No request returned product markup, a sitemap or a product page. The only HTTP 200
of the day was Notino UK's robots.txt, which is also what the registry recorded on
2026-09-10 and 2026-10-03.

## 1. The Fragrance Shop (`the-fragrance-shop`)

**Registry** (`src/config/retailers.ts` line 888): domain `thefragranceshop.co.uk`,
`enabled: false` (owner, 2026-10-04), `adapter: 'proxied'`,
`renderRefused: 'local'`, sections `https://www.thefragranceshop.co.uk/fragrance/l?page={page}`,
`/womens-fragrance?page={page}`, `/mens-fragrance?page={page}`,
`minRequestGapMs: 1500`. Stored snapshot `data/catalogue/the-fragrance-shop.json`:
7 listings, source `fixtures`, newest `lastSeenAt` 2026-08-01T21:11:31Z, URLs are
search pages only.

**Last recorded blocker**: Phase 5 recheck 2026-10-03 01:37:33Z, robots.txt
HTTP 403, Cloudflare "Just a moment..." challenge, nothing else requested. Before
that: the free local renderer got HTTP 403 at 27,487 to 27,573 bytes on all
three sections in six attempts on 2026-08-25 and 2026-08-26; the 2026-08-10
probe got 403 on every free strategy.

**Known product page**: none (the registry and the snapshot hold no product URL).

**robots.txt**: not served. The response is the Cloudflare challenge page (row 1).
By the project rule a 4xx states no restrictions, so each section and the
sitemap were asked once.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:07:46 | `https://www.thefragranceshop.co.uk/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 403 | 5639 | Cloudflare challenge: title 'Just a moment...', header cf-mitigated: challenge, cf-chl markup and challenges.cloudflare.com script; no robots/sitemap/product content |
| 2 | 02:08:08 | `https://www.thefragranceshop.co.uk/fragrance/l?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 5699 | Cloudflare challenge: title 'Just a moment...', header cf-mitigated: challenge, cf-chl markup and challenges.cloudflare.com script; no robots/sitemap/product content |
| 3 | 02:08:10 | `https://www.thefragranceshop.co.uk/womens-fragrance?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 5714 | Cloudflare challenge: title 'Just a moment...', header cf-mitigated: challenge, cf-chl markup and challenges.cloudflare.com script; no robots/sitemap/product content |
| 4 | 02:08:12 | `https://www.thefragranceshop.co.uk/mens-fragrance?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 5708 | Cloudflare challenge: title 'Just a moment...', header cf-mitigated: challenge, cf-chl markup and challenges.cloudflare.com script; no robots/sitemap/product content |
| 5 | 02:08:15 | `https://www.thefragranceshop.co.uk/sitemap.xml` | plain fetch, local, curl as PriceSniffsBot | 403 | 5642 | Cloudflare challenge: title 'Just a moment...', header cf-mitigated: challenge, cf-chl markup and challenges.cloudflare.com script; no robots/sitemap/product content |

### Harvest dispatch (run #66, job 113116117730)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings (2 errors)`. Tiers
tried: sitemap route, one request, HTTP 403. Render tier skipped by
`renderRefused`, 0 of 12 render pages used. Metered tiers off. Listings parsed: 0
(no page was fetched). Bytes: not logged.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://www.thefragranceshop.co.uk/sitemap.xml` | sitemap route, CI runner, shared HTTP client as PriceSniffsBot | 403 | not logged (the log prints only 'HTTP 403') | not logged; the same URL from this machine returned the Cloudflare challenge (local row 5) |
| 2 | section pages (3 URLs) | render tier (local headless browser), CI runner | not asked | 0 | '[actor] skipped: ... has answered every real render attempt on file with a refusal' (registry `renderRefused: 'local'`) |

### Error messages

```text
2026-10-08T02:17:53.2347146Z ##[warning]the-fragrance-shop refused PriceSniffsBot: https://www.thefragranceshop.co.uk/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:17:53.2365809Z   The Fragrance Shop       0 urls    0 fetched    0 priced listings  (2 errors)
2026-10-08T02:17:53.2367446Z       [actor] skipped: The Fragrance Shop has answered every real render attempt on file with a refusal (see its registry entry in src/config/retailers.ts for the dated evidence) — skipping the render tier rather than spending a page confirming that again
2026-10-08T02:17:53.2368827Z       https://www.thefragranceshop.co.uk/sitemap.xml: HTTP 403
2026-10-08T02:17:53.2374058Z refused this address: the-fragrance-shop (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:17:53.2548076Z ##[warning]the-fragrance-shop yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:17:52.3140503Z > tsx scripts/catalogue-harvest.ts --shop=the-fragrance-shop --max=20 --dry-run
2026-10-08T02:17:53.0676713Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:17:53.0682326Z the-fragrance-shop is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:17:53.0690920Z Sitemap harvest
2026-10-08T02:17:53.0691791Z shops    1, longest-unasked first
2026-10-08T02:17:53.0692309Z budget   20 product pages each
2026-10-08T02:17:53.0693174Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:17:53.0694071Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:17:53.0694620Z mode     dry run, nothing written
2026-10-08T02:17:53.2347146Z ##[warning]the-fragrance-shop refused PriceSniffsBot: https://www.thefragranceshop.co.uk/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:17:53.2365157Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:17:53.2365809Z   The Fragrance Shop       0 urls    0 fetched    0 priced listings  (2 errors)
2026-10-08T02:17:53.2367446Z       [actor] skipped: The Fragrance Shop has answered every real render attempt on file with a refusal (see its registry entry in src/config/retailers.ts for the dated evidence) — skipping the render tier rather than spending a page confirming that again
2026-10-08T02:17:53.2368827Z       https://www.thefragranceshop.co.uk/sitemap.xml: HTTP 403
2026-10-08T02:17:53.2371608Z 0 of 1 shops yielded real priced listings
2026-10-08T02:17:53.2372151Z 0 listings total
2026-10-08T02:17:53.2372624Z zero this run: the-fragrance-shop
2026-10-08T02:17:53.2374058Z refused this address: the-fragrance-shop (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:17:53.2375550Z never once live: the-fragrance-shop — still on fixtures, excluded from the site
2026-10-08T02:17:53.2376658Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:17:53.2377490Z Report: data/harvest-report.json
2026-10-08T02:17:53.2548076Z ##[warning]the-fragrance-shop yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** Cloudflare managed challenge (HTTP 403, `cf-mitigated: challenge`, "Just a moment...") on robots.txt, all three sections and the sitemap from this machine, and HTTP 403 on /sitemap.xml from the CI runner; 0 urls, 0 priced.

## 2. The Perfume Shop (`the-perfume-shop`)

**Registry** (line 979): domain `theperfumeshop.com`, `enabled: false` (owner,
2026-10-04), `adapter: 'proxied'`, `renderRefused: 'local'`, sections
`/womens/womens-perfume/c/W2001?page={page}`, `/mens/mens-fragrance/c/M2001?page={page}`,
`/offers/all-offers/fragrance-offers/c/W30050?page={page}`,
`/products/gift-sets/c/GS2001?page={page}`, `minRequestGapMs: 1500`. Stored
snapshot: 74 listings, source `live`, `lastSeenAt` 2026-08-20T09:22:10Z to
2026-08-22T04:26:13Z.

**Last recorded blocker**: Phase 5 recheck 2026-10-03 01:37:32Z, robots.txt HTTP
403, Akamai "Access Denied" with an errors.edgesuite.net reference. By hand on
2026-09-02: /robots.txt 403 (390 bytes), /sitemap.xml 403 (389), /womens/womens-perfume/c/W2001
403 (419). Crawl run #371 (job 100062672226) logged
`https://www.theperfumeshop.com/sitemap.xml: HTTP 403`.

**Known product page**: `https://www.theperfumeshop.com/dior/miss-dior/eau-de-parfum-spray/p/170710EDPJU`
(from the snapshot).

**robots.txt**: not served (row 1, Access Denied). By the project rule a 4xx
states no restrictions, so every URL below was asked once.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:08:30 | `https://www.theperfumeshop.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 403 | 388 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |
| 2 | 02:08:37 | `https://www.theperfumeshop.com/womens/womens-perfume/c/W2001?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 424 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |
| 3 | 02:08:39 | `https://www.theperfumeshop.com/mens/mens-fragrance/c/M2001?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 422 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |
| 4 | 02:08:41 | `https://www.theperfumeshop.com/offers/all-offers/fragrance-offers/c/W30050?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 446 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |
| 5 | 02:08:44 | `https://www.theperfumeshop.com/products/gift-sets/c/GS2001?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 422 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |
| 6 | 02:08:48 | `https://www.theperfumeshop.com/sitemap.xml` | plain fetch, local, curl as PriceSniffsBot | 403 | 389 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |
| 7 | 02:08:50 | `https://www.theperfumeshop.com/dior/miss-dior/eau-de-parfum-spray/p/170710EDPJU` | plain fetch, local, curl as PriceSniffsBot | 403 | 454 | AkamaiGHost 'Access Denied' page (errors.edgesuite.net reference); no content |

### Harvest dispatch (run #67, job 113116386630)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings [74 due for a page
re-read] (3 errors)`. Tiers tried: sitemap route, one request, HTTP 403. Render
tier skipped by `renderRefused`, 0 of 12 render pages used. Metered tiers off.
Listings parsed: 0. Bytes: not logged.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://www.theperfumeshop.com/sitemap.xml` | sitemap route, CI runner, shared HTTP client as PriceSniffsBot | 403 | not logged (the log prints only 'HTTP 403') | not logged; the same URL from this machine returned AkamaiGHost 'Access Denied' (local row 6) |
| 2 | section pages (4 URLs) | render tier (local headless browser), CI runner | not asked | 0 | '[actor] skipped: ... has answered every real render attempt on file with a refusal' (registry `renderRefused: 'local'`) |
| 3 | 74 stored product pages | page re-read | not asked | 0 | 'not re-reading 74 stored page(s): the shop refused its sitemap' |

### Error messages

```text
2026-10-08T02:19:37.3136559Z ##[warning]the-perfume-shop refused PriceSniffsBot: https://www.theperfumeshop.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:19:37.3158506Z   The Perfume Shop         0 urls    0 fetched    0 priced listings  [74 due for a page re-read]  (3 errors)
2026-10-08T02:19:37.3161202Z       [actor] skipped: The Perfume Shop has answered every real render attempt on file with a refusal (see its registry entry in src/config/retailers.ts for the dated evidence) — skipping the render tier rather than spending a page confirming that again
2026-10-08T02:19:37.3162976Z       https://www.theperfumeshop.com/sitemap.xml: HTTP 403
2026-10-08T02:19:37.3163778Z       not re-reading 74 stored page(s): the shop refused its sitemap
2026-10-08T02:19:37.3168842Z refused this address: the-perfume-shop (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:19:37.3351254Z ##[warning]the-perfume-shop yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:19:34.6691870Z > tsx scripts/catalogue-harvest.ts --shop=the-perfume-shop --max=20 --dry-run
2026-10-08T02:19:35.4137514Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:19:35.4143238Z the-perfume-shop is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:19:35.4154369Z Sitemap harvest
2026-10-08T02:19:35.4154961Z shops    1, longest-unasked first
2026-10-08T02:19:35.4155614Z budget   20 product pages each
2026-10-08T02:19:35.4156715Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:19:35.4158512Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:19:35.4159307Z mode     dry run, nothing written
2026-10-08T02:19:37.3136559Z ##[warning]the-perfume-shop refused PriceSniffsBot: https://www.theperfumeshop.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:19:37.3157411Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:19:37.3158506Z   The Perfume Shop         0 urls    0 fetched    0 priced listings  [74 due for a page re-read]  (3 errors)
2026-10-08T02:19:37.3161202Z       [actor] skipped: The Perfume Shop has answered every real render attempt on file with a refusal (see its registry entry in src/config/retailers.ts for the dated evidence) — skipping the render tier rather than spending a page confirming that again
2026-10-08T02:19:37.3162976Z       https://www.theperfumeshop.com/sitemap.xml: HTTP 403
2026-10-08T02:19:37.3163778Z       not re-reading 74 stored page(s): the shop refused its sitemap
2026-10-08T02:19:37.3166185Z 0 of 1 shops yielded real priced listings
2026-10-08T02:19:37.3166688Z 0 listings total
2026-10-08T02:19:37.3167391Z zero this run: the-perfume-shop
2026-10-08T02:19:37.3168842Z refused this address: the-perfume-shop (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:19:37.3170253Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:19:37.3171091Z Report: data/harvest-report.json
2026-10-08T02:19:37.3351254Z ##[warning]the-perfume-shop yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** AkamaiGHost "Access Denied" HTTP 403 (388 to 454 bytes) on robots.txt, four sections, sitemap and the known product page from this machine, and HTTP 403 on /sitemap.xml from the CI runner; 0 urls, 0 priced, 74 stored pages not re-read.

## 3. Selfridges (`selfridges`)

**Registry** (line 2496): domain `selfridges.com`, `enabled: false` (owner,
2026-10-04), `adapter: 'proxied'`, no `renderRefused`, one section
`https://www.selfridges.com/GB/en/cat/beauty/fragrance/?pn={page}`,
`minRequestGapMs: 2500`. Stored snapshot: 299 listings, source `live`,
`lastSeenAt` 2026-08-21T22:17:17Z to 2026-10-04T15:38:35Z.

**Last recorded blocker**: 2026-10-03, run #577: `renderPages` 5 was tried, pages
2 to 5 were refused ("refused 4 page(s)"), page one still gave its 60 listings.
2026-10-01: selfridges.com answers 403 to a plain fetch and to WebFetch. 2026-08-20: the actor tier received HTTP 200,
949,307 bytes of the section page while every plain request got 403.

**Known product page**: `https://www.selfridges.com/GB/en/product/jo-malone-london-christmas-kist-advent-calendar-worth-595_R04695891/`
(from the snapshot, `lastSeenAt` 2026-10-04T15:38:35Z).

**robots.txt**: not served (row 1, Cloudflare block page). By the project rule a
4xx states no restrictions, so each URL below was asked once.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:08:54 | `https://www.selfridges.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 403 | 4550 | Cloudflare block page 'Attention Required! \| Cloudflare' ('Sorry, you have been blocked'); not an interactive challenge; no content |
| 2 | 02:09:05 | `https://www.selfridges.com/GB/en/cat/beauty/fragrance/?pn=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 5487 | Cloudflare block page 'Attention Required! \| Cloudflare' ('Sorry, you have been blocked'); not an interactive challenge; no content |
| 3 | 02:09:08 | `https://www.selfridges.com/sitemap.xml` | plain fetch, local, curl as PriceSniffsBot | 403 | 5487 | Cloudflare block page 'Attention Required! \| Cloudflare' ('Sorry, you have been blocked'); not an interactive challenge; no content |
| 4 | 02:09:11 | `https://www.selfridges.com/GB/en/product/jo-malone-london-christmas-kist-advent-calendar-worth-595_R04695891/` | plain fetch, local, curl as PriceSniffsBot | 403 | 5488 | Cloudflare block page 'Attention Required! \| Cloudflare' ('Sorry, you have been blocked'); not an interactive challenge; no content |

The robots.txt body is 4,550 bytes and the other three bodies are 5,487 to 5,488
bytes; all four have the title "Attention Required! | Cloudflare" and the text
"Sorry, you have been blocked ... You are unable to access selfridges.com".

### Harvest dispatch (run #68, job 113116748477)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings [299 due for a page
re-read] (2 errors)`. Tiers tried: sitemap route, one request, HTTP 403. No
render line; 0 of 12 render pages used. Metered tiers off. Listings parsed: 0.
Bytes: not logged.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://www.selfridges.com/sitemap.xml` | sitemap route, CI runner, shared HTTP client as PriceSniffsBot | 403 | not logged (the log prints only 'HTTP 403') | not logged; the same URL from this machine returned the Cloudflare 'Attention Required!' block page (local row 3) |
| 2 | section page (1 URL) | render tier (local headless browser), CI runner | not asked | 0 | no render line in the log; 'local browser pages rendered this run: 0 of 12 budgeted'. The log says 'Not retried any other way.' |
| 3 | 299 stored product pages | page re-read | not asked | 0 | 'not re-reading 299 stored page(s): the shop refused its sitemap' |

### Error messages

```text
2026-10-08T02:20:27.5214689Z ##[warning]selfridges refused PriceSniffsBot: https://www.selfridges.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:20:27.5229117Z   Selfridges               0 urls    0 fetched    0 priced listings  [299 due for a page re-read]  (2 errors)
2026-10-08T02:20:27.5230452Z       https://www.selfridges.com/sitemap.xml: HTTP 403
2026-10-08T02:20:27.5231472Z       not re-reading 299 stored page(s): the shop refused its sitemap
2026-10-08T02:20:27.5239557Z refused this address: selfridges (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:20:27.5391772Z ##[warning]selfridges yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:20:22.6420273Z > tsx scripts/catalogue-harvest.ts --shop=selfridges --max=20 --dry-run
2026-10-08T02:20:23.3665061Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:20:23.3669965Z selfridges is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:20:23.3692539Z Sitemap harvest
2026-10-08T02:20:23.3692922Z shops    1, longest-unasked first
2026-10-08T02:20:23.3693390Z budget   20 product pages each
2026-10-08T02:20:23.3694232Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:20:23.3695753Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:20:23.3696555Z mode     dry run, nothing written
2026-10-08T02:20:27.5214689Z ##[warning]selfridges refused PriceSniffsBot: https://www.selfridges.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:20:27.5227243Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:20:27.5229117Z   Selfridges               0 urls    0 fetched    0 priced listings  [299 due for a page re-read]  (2 errors)
2026-10-08T02:20:27.5230452Z       https://www.selfridges.com/sitemap.xml: HTTP 403
2026-10-08T02:20:27.5231472Z       not re-reading 299 stored page(s): the shop refused its sitemap
2026-10-08T02:20:27.5234561Z 0 of 1 shops yielded real priced listings
2026-10-08T02:20:27.5235202Z 0 listings total
2026-10-08T02:20:27.5235658Z zero this run: selfridges
2026-10-08T02:20:27.5239557Z refused this address: selfridges (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:20:27.5241380Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:20:27.5242262Z Report: data/harvest-report.json
2026-10-08T02:20:27.5391772Z ##[warning]selfridges yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** Cloudflare block page ("Attention Required! | Cloudflare", "Sorry, you have been blocked") HTTP 403 on robots.txt, the section, the sitemap and the known product page from this machine, and HTTP 403 on /sitemap.xml from the CI runner; 0 urls, 0 priced, 299 stored pages not re-read.

## 4. Harvey Nichols (`harvey-nichols`)

**Registry** (line 2779): domain `harveynichols.com`, `enabled: false` (owner,
2026-10-04), `adapter: 'headless'`, no `renderRefused`, one section
`https://www.harveynichols.com/beauty/fragrance/?page={page}`,
`minRequestGapMs: 2500`. Stored snapshot: 4 listings, source `fixtures`,
`lastSeenAt` 2026-08-01T21:11:31Z (search URLs only).

**Last recorded blocker**: Phase 5 recheck 2026-10-03: robots.txt over HTTP/2
reset (INTERNAL_ERROR) at 01:37:36Z, one HTTP/1.1 retry at 01:38:56Z received 0
bytes in 25 seconds, nothing else asked. 2026-08-20: robots.txt HTTP 503, four
attempts (two hostnames, two user agents). 2026-08-10: HTTP 200 with zero
listings on the free strategies.

**Known product page**: none (the registry and the snapshot hold search URLs only).

**robots.txt**: not served. Under the project rule (RFC 9309, 5xx or network
error means nothing may be asked) no section, sitemap or product URL was requested
from this machine.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:09:21 | `https://www.harveynichols.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | none | 0 | no HTTP response: curl (92) HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR (err 2), after 0.53s |
| 2 | 02:09:28 | `https://www.harveynichols.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | none | 0 | no HTTP response: curl (28) Operation timed out after 30002 milliseconds with 0 bytes received (retry forced to HTTP/1.1) |
| 3 | 02:10:06 | `https://harveynichols.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | none | 0 | no HTTP response: curl (92) HTTP/2 stream 1 was not closed cleanly: INTERNAL_ERROR (err 2), after 0.62s |

Row 1 was the default request, row 2 the single HTTP/1.1 retry (`--http1.1`), row
3 the apex host. Each failed in curl, so there is no status line, header or body.

### Harvest dispatch (run #69, job 113116999655)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings (1 errors)`. Tiers
tried: robots.txt read on both hosts, nothing past it. The harvest logged
"robots.txt did not connect; asking once more in 30s" at 02:22:10Z and gave up at
02:24:40Z. Render tier: "[actor] robots.txt unreachable, so no section URL may
be rendered", 0 of 12 render pages used. Metered tiers off. Listings parsed: 0.
Bytes: 0.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://www.harveynichols.com/robots.txt` | robots.txt read, CI runner | none (HTTP 0) | 0 | 'AbortError: This operation was aborted'; first attempt logged 'did not connect; asking once more in 30s' at 02:22:10Z |
| 2 | `https://harveynichols.com/robots.txt` | robots.txt read, CI runner | none (HTTP 0) | 0 | 'AbortError: This operation was aborted' |
| 3 | section page and sitemap | - | not asked | 0 | 'robots.txt could not be read, so nothing may be fetched'; '[actor] robots.txt unreachable, so no section URL may be rendered' |

### Error messages

```text
2026-10-08T02:22:10.8900054Z       Harvey Nichols: robots.txt did not connect; asking once more in 30s
2026-10-08T02:24:40.9205095Z       Harvey Nichols: robots.txt could not be read, so nothing may be fetched:
2026-10-08T02:24:40.9206806Z         https://www.harveynichols.com/robots.txt: HTTP 0 — AbortError: This operation was aborted
2026-10-08T02:24:40.9208116Z         https://harveynichols.com/robots.txt: HTTP 0 — AbortError: This operation was aborted
2026-10-08T02:24:40.9222328Z   Harvey Nichols           0 urls    0 fetched    0 priced listings  (1 errors)
2026-10-08T02:24:40.9223243Z       [actor] robots.txt unreachable, so no section URL may be rendered
2026-10-08T02:24:40.9449254Z ##[warning]harvey-nichols yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:21:20.0808851Z > tsx scripts/catalogue-harvest.ts --shop=harvey-nichols --max=20 --dry-run
2026-10-08T02:21:20.8807924Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:21:20.8812232Z harvey-nichols is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:21:20.8820507Z Sitemap harvest
2026-10-08T02:21:20.8821062Z shops    1, longest-unasked first
2026-10-08T02:21:20.8821673Z budget   20 product pages each
2026-10-08T02:21:20.8822611Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:21:20.8823583Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:21:20.8824269Z mode     dry run, nothing written
2026-10-08T02:22:10.8900054Z       Harvey Nichols: robots.txt did not connect; asking once more in 30s
2026-10-08T02:24:40.9205095Z       Harvey Nichols: robots.txt could not be read, so nothing may be fetched:
2026-10-08T02:24:40.9206806Z         https://www.harveynichols.com/robots.txt: HTTP 0 — AbortError: This operation was aborted
2026-10-08T02:24:40.9208116Z         https://harveynichols.com/robots.txt: HTTP 0 — AbortError: This operation was aborted
2026-10-08T02:24:40.9222328Z   Harvey Nichols           0 urls    0 fetched    0 priced listings  (1 errors)
2026-10-08T02:24:40.9223243Z       [actor] robots.txt unreachable, so no section URL may be rendered
2026-10-08T02:24:40.9232389Z 0 of 1 shops yielded real priced listings
2026-10-08T02:24:40.9232933Z 0 listings total
2026-10-08T02:24:40.9233402Z zero this run: harvey-nichols
2026-10-08T02:24:40.9234635Z never once live: harvey-nichols — still on fixtures, excluded from the site
2026-10-08T02:24:40.9235814Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:24:40.9237165Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:24:40.9256802Z Report: data/harvest-report.json
2026-10-08T02:24:40.9449254Z ##[warning]harvey-nichols yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** robots.txt gets no HTTP response on either host, from this machine (curl 92 HTTP/2 INTERNAL_ERROR reset, curl 28 timeout after 30 s with 0 bytes) and from the CI runner (HTTP 0, AbortError), so nothing else may be requested; 0 urls, 0 priced.

## 5. Zara (`zara`)

**Registry** (line 4968): domain `zara.com`, `enabled: false` (owner,
2026-10-04), `adapter: 'headless'`, `renderRefused: 'local'`,
`singleBrandOnly: 'Zara'`, sections
`https://www.zara.com/uk/en/woman-beauty-perfumes-l1415.html?page={page}` and
`https://www.zara.com/uk/en/man-accessories-perfumes-l551.html?page={page}`,
`minRequestGapMs: 2000`. Stored snapshot: 8 listings, source `live`,
`lastSeenAt` 2026-08-22T00:51:44Z.

**Last recorded blocker**: Phase 5 recheck 2026-10-03 01:37:40Z, robots.txt HTTP
403, Akamai "Access Denied", nothing else requested. The free local renderer got
HTTP 403 at 325 to 331 bytes in four attempts on 2026-08-25 and 2026-08-26; the
actor tier (now off) got HTTP 200 at 2.76 to 2.94 MB on 2026-08-20 to 2026-08-22.

**Known product page**: `https://www.zara.com/uk/en/fashionably-london-edp-100-ml---3-38-oz-p20210888.html`
(registry comment).

**robots.txt**: not served (row 1, Access Denied). By the project rule a 4xx
states no restrictions, so every URL below was asked once.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:10:11 | `https://www.zara.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 403 | 378 | Akamai 'Access Denied' page (errors.edgesuite.net reference; no Server header; akamai-cache-status: Error from child); no content |
| 2 | 02:10:18 | `https://www.zara.com/uk/en/woman-beauty-perfumes-l1415.html?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 427 | Akamai 'Access Denied' page (errors.edgesuite.net reference; no Server header; akamai-cache-status: Error from child); no content |
| 3 | 02:10:21 | `https://www.zara.com/uk/en/man-accessories-perfumes-l551.html?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 433 | Akamai 'Access Denied' page (errors.edgesuite.net reference; no Server header; akamai-cache-status: Error from child); no content |
| 4 | 02:10:24 | `https://www.zara.com/sitemap.xml` | plain fetch, local, curl as PriceSniffsBot | 403 | 375 | Akamai 'Access Denied' page (errors.edgesuite.net reference; no Server header; akamai-cache-status: Error from child); no content |
| 5 | 02:10:26 | `https://www.zara.com/uk/en/fashionably-london-edp-100-ml---3-38-oz-p20210888.html` | plain fetch, local, curl as PriceSniffsBot | 403 | 476 | Akamai 'Access Denied' page (errors.edgesuite.net reference; no Server header; akamai-cache-status: Error from child); no content |

### Harvest dispatch (run #70, job 113118100955)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings [8 due for a page
re-read] (3 errors)`. Tiers tried: sitemap route, one request, HTTP 403. Render
tier skipped by `renderRefused`, 0 of 12 render pages used. Metered tiers off.
Listings parsed: 0. Bytes: not logged.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://www.zara.com/sitemap.xml` | sitemap route, CI runner, shared HTTP client as PriceSniffsBot | 403 | not logged (the log prints only 'HTTP 403') | not logged; the same URL from this machine returned Akamai 'Access Denied' (local row 4) |
| 2 | section pages (2 URLs) | render tier (local headless browser), CI runner | not asked | 0 | '[actor] skipped: ... has answered every real render attempt on file with a refusal' (registry `renderRefused: 'local'`) |
| 3 | 8 stored product pages | page re-read | not asked | 0 | 'not re-reading 8 stored page(s): the shop refused its sitemap' |

### Error messages

```text
2026-10-08T02:25:34.0436047Z ##[warning]zara refused PriceSniffsBot: https://www.zara.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:25:34.0443588Z   Zara                     0 urls    0 fetched    0 priced listings  [8 due for a page re-read]  (3 errors)
2026-10-08T02:25:34.0445168Z       [actor] skipped: Zara has answered every real render attempt on file with a refusal (see its registry entry in src/config/retailers.ts for the dated evidence) — skipping the render tier rather than spending a page confirming that again
2026-10-08T02:25:34.0446146Z       https://www.zara.com/sitemap.xml: HTTP 403
2026-10-08T02:25:34.0447108Z       not re-reading 8 stored page(s): the shop refused its sitemap
2026-10-08T02:25:34.0449704Z refused this address: zara (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:25:34.0620130Z ##[warning]zara yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:25:31.0681659Z > tsx scripts/catalogue-harvest.ts --shop=zara --max=20 --dry-run
2026-10-08T02:25:31.6020051Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:25:31.6022245Z zara is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:25:31.6027703Z Sitemap harvest
2026-10-08T02:25:31.6027954Z shops    1, longest-unasked first
2026-10-08T02:25:31.6028259Z budget   20 product pages each
2026-10-08T02:25:31.6028571Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:25:31.6028929Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:25:31.6029143Z mode     dry run, nothing written
2026-10-08T02:25:34.0436047Z ##[warning]zara refused PriceSniffsBot: https://www.zara.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:25:34.0442964Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:25:34.0443588Z   Zara                     0 urls    0 fetched    0 priced listings  [8 due for a page re-read]  (3 errors)
2026-10-08T02:25:34.0445168Z       [actor] skipped: Zara has answered every real render attempt on file with a refusal (see its registry entry in src/config/retailers.ts for the dated evidence) — skipping the render tier rather than spending a page confirming that again
2026-10-08T02:25:34.0446146Z       https://www.zara.com/sitemap.xml: HTTP 403
2026-10-08T02:25:34.0447108Z       not re-reading 8 stored page(s): the shop refused its sitemap
2026-10-08T02:25:34.0448494Z 0 of 1 shops yielded real priced listings
2026-10-08T02:25:34.0448890Z 0 listings total
2026-10-08T02:25:34.0449115Z zero this run: zara
2026-10-08T02:25:34.0449704Z refused this address: zara (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:25:34.0450336Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:25:34.0450774Z Report: data/harvest-report.json
2026-10-08T02:25:34.0620130Z ##[warning]zara yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** Akamai "Access Denied" HTTP 403 (375 to 476 bytes, errors.edgesuite.net reference) on robots.txt, both sections, the sitemap and the known product page from this machine, and HTTP 403 on /sitemap.xml from the CI runner; 0 urls, 0 priced, 8 stored pages not re-read.

## 6. Notino UK (`notino-uk`)

**Registry** (line 347): domain `notino.co.uk`, `enabled: false` (owner,
2026-10-04), `adapter: 'owner-import'` (set 2026-10-06; "the harvest and probe skip
this adapter"), `renderRefused: 'local'`, one section
`https://www.notino.co.uk/fragrance/?f={page}-1-55544` (`renderPages: 1`),
`minRequestGapMs: 1500`. Stored snapshot: 95 listings, source `live`,
`lastSeenAt` 2026-08-28T15:20:45Z to 2026-09-09T14:36:49Z.

**Last recorded blocker**: Phase 5 recheck 2026-10-03: robots.txt HTTP 200 at
01:37:35Z, home page HTTP 403 Cloudflare "Just a moment..." at 01:38:23Z, no
product page asked. 2026-09-12: five scheduled renders, all four pages HTTP 403
at 28.7 to 28.8 KB. 2026-09-10: robots.txt HTTP 200 (2,552 bytes), sitemap HTTP
403 (5,567 bytes) and a product page HTTP 403 (5,846 bytes), both the Cloudflare
challenge.

**Known product page**: `https://www.notino.co.uk/aramis/aramis-eau-de-toilette-for-men/`
(from the snapshot). Not requested, per the brief (robots.txt and one section only).

**Harvest**: not dispatched. `scripts/catalogue-harvest.ts` filters the shop out
(`r.adapter !== 'owner-import'`, line 433), so a dispatch has nothing to ask.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:10:31 | `https://www.notino.co.uk/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 200 | 2552 | real robots.txt (text/plain), Sitemap line plus per-agent groups |
| 2 | 02:10:47 | `https://www.notino.co.uk/fragrance/?f=1-1-55544` | plain fetch, local, curl as PriceSniffsBot | 403 | 5680 | Cloudflare challenge: title 'Just a moment...', header cf-mitigated: challenge, cf-chl markup; no products |

### robots.txt (HTTP 200, 2,552 bytes, `content-type: text/plain; charset=utf-8`)

There is no `PriceSniffsBot` group; the `User-agent: *` group applies. The file
also has named groups for MJ12bot, psbot, Curious George, TurnitinBot, NPBot,
SeznamBot, bingbot, yandexbot and MegaIndex.ru. No `Crawl-delay` in the `*`
group. `isAllowed()` from `src/catalogue/robots.ts` returned `true` for
`/fragrance/?f=1-1-55544`, `/sitemap.xml` and the known product path. The
Sitemap line and the `*` group, verbatim:

```text
Sitemap: https://www.notino.co.uk/sitemap.xml

User-agent: *
Disallow: /*.jpg$
Disallow: /*.jpeg$
Disallow: /*.png$
Disallow: /*.gif$
Disallow: /order.asp*
Disallow: /order-multistep.asp*
Disallow: /order-summary.asp*
Disallow: /orderFrame.asp*
Disallow: /detailsend.asp*
Disallow: /addvote.asp*
Disallow: /newpassword.asp*
Disallow: /myaccount.asp*
Disallow: /mynotino/*
Disallow: /try-and-buy/error*
Disallow: /cart/*
Disallow: /upselling*
Disallow: /checkout*
Disallow: /.well-known*
Disallow: /api/
Disallow: /productDetail
Disallow: /thankyou*
Disallow: /delivery-and-payment*
Disallow: /summary*
Disallow: /cdn-cgi/
Disallow: /googletaggatewayspecific/
Disallow: /googletaggatewayall/
Allow: /.well-known/assetlinks.json
Allow: /api/beautyblog
Allow: /api/faqs
```

### Error messages

No harvest was run. The only refusal is row 2 of the table above: HTTP 403, body
title `Just a moment...`, header `cf-mitigated: challenge`.

**Blocker as measured:** robots.txt is readable (HTTP 200, section and sitemap allowed for `*`) but the section `https://www.notino.co.uk/fragrance/?f=1-1-55544` answers a Cloudflare managed challenge (HTTP 403, 5,680 bytes, "Just a moment..."); the harvest skips `owner-import`, so no dispatch was made.

## 7. Riiffs Perfumes (`riiffs`)

**Registry** (line 3868): domain `uk.riiffsperfumes.com`, `enabled: false` (owner,
2026-10-04), `adapter: 'unknown'`, `sitemapHarvestConfirmed: true`,
`catalogue: null` (no section URLs in the entry, so there are none to request).
Stored snapshot: 142 listings, source `live`, `lastSeenAt` 2026-09-14T04:56:20Z to
2026-10-04T21:43:49Z.

**Last recorded blocker**: Phase 5 recheck 2026-10-03 01:37:42Z, robots.txt HTTP
202 with a SiteGround captcha redirect (meta refresh to `/.well-known/sgcaptcha/`);
`riiffsperfumes.com/robots.txt` the same at 01:47:18Z; nothing else requested. The
registry also records that the last run to price anything started
2026-09-14T04:56Z and that 26 runs from 2026-09-14T10:47Z to 2026-10-02T15:51Z
discovered 0 URLs.

**Known product pages**: `https://uk.riiffsperfumes.com/product/raheeq/` (snapshot,
used here), also `/product/gladius/` and `/product/aswaar/` (registry comments).

**robots.txt**: not served (row 1 is a captcha redirect, not a robots file). The
body contains no User-agent, Disallow or Allow line. The sitemap index and one
product page were each asked once, and no captcha was followed.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:10:55 | `https://uk.riiffsperfumes.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 202 | 179 | SiteGround captcha: HTTP 202, header sg-captcha: challenge, body is a meta refresh to /.well-known/sgcaptcha/; no content |
| 2 | 02:11:05 | `https://uk.riiffsperfumes.com/sitemap_index.xml` | plain fetch, local, curl as PriceSniffsBot | 202 | 186 | SiteGround captcha: HTTP 202, header sg-captcha: challenge, body is a meta refresh to /.well-known/sgcaptcha/; no content |
| 3 | 02:11:08 | `https://uk.riiffsperfumes.com/product/raheeq/` | plain fetch, local, curl as PriceSniffsBot | 202 | 188 | SiteGround captcha: HTTP 202, header sg-captcha: challenge, body is a meta refresh to /.well-known/sgcaptcha/; no content |

The three bodies are a single `<meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=<path>&y=ipr:<egress address>:<timestamp>">` element. The egress address inside it is not recorded here.

### Harvest dispatch (run #71, job 113118354454)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings [141 due for a page
re-read] (2 errors)`. Tiers tried: sitemap route, one request to
`https://uk.riiffsperfumes.com/sitemap.xml`, HTTP 202 captcha, then "stopped
early". No render line; 0 of 12 render pages used. Metered tiers off. Listings
parsed: 0. Bytes: not logged. The summary row says "(2 errors)" and two error
lines follow it; both are in the block below.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://uk.riiffsperfumes.com/sitemap.xml` | sitemap route, CI runner, shared HTTP client as PriceSniffsBot | 202 | not logged | 'a SiteGround captcha challenge instead of the page (refused, not empty)'; then 'stopped early: the shop answered with a captcha' |
| 2 | 141 stored product pages | page re-read | not asked | 0 | '[141 due for a page re-read]' in the summary row; no page was read |

### Error messages

```text
2026-10-08T02:26:40.9974748Z   Riiffs Perfumes          0 urls    0 fetched    0 priced listings  [141 due for a page re-read]  (2 errors)
2026-10-08T02:26:40.9977082Z       https://uk.riiffsperfumes.com/sitemap.xml: HTTP 202, a SiteGround captcha challenge instead of the page (refused, not empty)
2026-10-08T02:26:40.9984558Z       stopped early: the shop answered with a captcha
2026-10-08T02:26:41.0222392Z ##[warning]riiffs yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:26:31.9437319Z > tsx scripts/catalogue-harvest.ts --shop=riiffs --max=20 --dry-run
2026-10-08T02:26:32.7137494Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:26:32.7141756Z riiffs is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:26:32.7157312Z Sitemap harvest
2026-10-08T02:26:32.7157913Z shops    1, longest-unasked first
2026-10-08T02:26:32.7158575Z budget   20 product pages each
2026-10-08T02:26:32.7159621Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:26:32.7160844Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:26:32.7161598Z mode     dry run, nothing written
2026-10-08T02:26:40.9974748Z   Riiffs Perfumes          0 urls    0 fetched    0 priced listings  [141 due for a page re-read]  (2 errors)
2026-10-08T02:26:40.9977082Z       https://uk.riiffsperfumes.com/sitemap.xml: HTTP 202, a SiteGround captcha challenge instead of the page (refused, not empty)
2026-10-08T02:26:40.9984558Z       stopped early: the shop answered with a captcha
2026-10-08T02:26:40.9987845Z 0 of 1 shops yielded real priced listings
2026-10-08T02:26:40.9988238Z 0 listings total
2026-10-08T02:26:40.9988616Z zero this run: riiffs
2026-10-08T02:26:40.9989272Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:26:40.9989933Z Report: data/harvest-report.json
2026-10-08T02:26:40.9990666Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:26:41.0222392Z ##[warning]riiffs yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** SiteGround captcha (HTTP 202, `sg-captcha: challenge`, meta refresh to `/.well-known/sgcaptcha/`) on robots.txt, sitemap_index.xml and a product page from this machine, and the same captcha on /sitemap.xml from the CI runner ("stopped early: the shop answered with a captcha"); 0 urls, 0 priced; the registry entry has `catalogue: null`.

## 8. Perfume Shopping (`perfume-shopping`)

**Registry** (line 3427): domain `perfumeshopping.com`, `enabled: false`,
`adapter: 'unknown'`, sections `https://www.perfumeshopping.com/en/collection/women?page={page}`
and `https://www.perfumeshopping.com/en/collection/men?page={page}`,
`minRequestGapMs: 1500`. Awin applied 2026-08-11 (`awinRequested()`). No stored
snapshot (`data/catalogue/perfume-shopping.json` does not exist).

**Last recorded blocker**: 2026-10-03 (phase 4): local robots.txt HTTP 403 from
Cloudflare with the body "We are sorry, this service is not available in your
region."; from a CI runner, probe run 37084776932 job 111092664586, /sitemap.xml
HTTP 403, 0 priced. Earlier: 2026-08-12 HTTP 403 on the homepage, robots.txt and
a policy page; 2026-08-19 robots.txt gave no response at all.

**Known product page**: none (the registry and data hold none).

**robots.txt**: not served (row 1, 90 byte region refusal). By the project rule a
4xx states no restrictions, so each URL below was asked once.

### Requests from this machine

| # | UTC | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|---|
| 1 | 02:11:12 | `https://www.perfumeshopping.com/robots.txt` | plain fetch, local, curl as PriceSniffsBot | 403 | 90 | Cloudflare refusal, text/plain body 'We are sorry, this service is not available in your region.'; no content |
| 2 | 02:11:18 | `https://www.perfumeshopping.com/en/collection/women?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 90 | Cloudflare refusal, text/plain body 'We are sorry, this service is not available in your region.'; no content |
| 3 | 02:11:20 | `https://www.perfumeshopping.com/en/collection/men?page=1` | plain fetch, local, curl as PriceSniffsBot | 403 | 90 | Cloudflare refusal, text/plain body 'We are sorry, this service is not available in your region.'; no content |
| 4 | 02:11:22 | `https://www.perfumeshopping.com/sitemap.xml` | plain fetch, local, curl as PriceSniffsBot | 403 | 90 | Cloudflare refusal, text/plain body 'We are sorry, this service is not available in your region.'; no content |

All four bodies are 90 bytes: whitespace followed by the sentence "We are sorry, this service is not available in your region.", `content-type: text/plain`, `server: cloudflare`.

### Harvest dispatch (run #74, job 113120946482)

Outcome from the log: `0 urls, 0 fetched, 0 priced listings (1 errors)`. Tiers
tried: sitemap route, one request, HTTP 403. No render line; 0 of 12 render pages
used. Metered tiers off. Listings parsed: 0. Bytes: not logged.

| # | URL | Tier | Status | Bytes | Shape |
|---|---|---|---|---|---|
| 1 | `https://www.perfumeshopping.com/sitemap.xml` | sitemap route, CI runner, shared HTTP client as PriceSniffsBot | 403 | not logged (the log prints only 'HTTP 403') | not logged; the same URL from this machine returned a 90 byte Cloudflare text/plain region refusal (local row 4) |
| 2 | section pages (2 URLs) | render tier (local headless browser), CI runner | not asked | 0 | no render line in the log; 'local browser pages rendered this run: 0 of 12 budgeted'. The log says 'Not retried any other way.' |

### Error messages

```text
2026-10-08T02:36:22.1645366Z ##[warning]perfume-shopping refused PriceSniffsBot: https://www.perfumeshopping.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:36:22.1654813Z   Perfume Shopping         0 urls    0 fetched    0 priced listings  (1 errors)
2026-10-08T02:36:22.1655470Z       https://www.perfumeshopping.com/sitemap.xml: HTTP 403
2026-10-08T02:36:22.1659517Z refused this address: perfume-shopping (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:36:22.1852494Z ##[warning]perfume-shopping yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

<details><summary>Harvest lines of the job log, verbatim (timestamps kept; blank lines and the empty freshness table omitted)</summary>

```text
2026-10-08T02:36:21.1369196Z > tsx scripts/catalogue-harvest.ts --shop=perfume-shopping --max=20 --dry-run
2026-10-08T02:36:21.9266562Z Local browser render available (free). Shops still yielding nothing get a real-browser render, capped at 12 pages and 360s of rendering for the whole run, 120s of it per shop.
2026-10-08T02:36:21.9271097Z perfume-shopping is disabled in the registry; asking anyway because this is a dry run that writes nothing.
2026-10-08T02:36:21.9278024Z Sitemap harvest
2026-10-08T02:36:21.9278576Z shops    1, longest-unasked first
2026-10-08T02:36:21.9279169Z budget   20 product pages each
2026-10-08T02:36:21.9280178Z due      every shown listing older than 12h is re-read, oldest first (a shop may set its own age)
2026-10-08T02:36:21.9281356Z lanes    1 shop(s) at a time, never two on the same host
2026-10-08T02:36:21.9282068Z mode     dry run, nothing written
2026-10-08T02:36:22.1645366Z ##[warning]perfume-shopping refused PriceSniffsBot: https://www.perfumeshopping.com/sitemap.xml: HTTP 403. Not retried any other way.
2026-10-08T02:36:22.1654091Z Nothing harvested. Not writing anything rather than showing an empty app.
2026-10-08T02:36:22.1654813Z   Perfume Shopping         0 urls    0 fetched    0 priced listings  (1 errors)
2026-10-08T02:36:22.1655470Z       https://www.perfumeshopping.com/sitemap.xml: HTTP 403
2026-10-08T02:36:22.1657067Z 0 of 1 shops yielded real priced listings
2026-10-08T02:36:22.1657378Z 0 listings total
2026-10-08T02:36:22.1657758Z zero this run: perfume-shopping
2026-10-08T02:36:22.1659517Z refused this address: perfume-shopping (bot refused) — a wall or an HTTP refusal, not an empty catalogue; nothing here is retried
2026-10-08T02:36:22.1660878Z never once live: perfume-shopping — still on fixtures, excluded from the site
2026-10-08T02:36:22.1661562Z local browser pages rendered this run: 0 of 12 budgeted, 0s of 360s spent rendering
2026-10-08T02:36:22.1662066Z Report: data/harvest-report.json
2026-10-08T02:36:22.1852494Z ##[warning]perfume-shopping yielded no priced listing on this probe (see the log above for what it answered). That is the probe's answer; nothing was written.
```

</details>

**Blocker as measured:** Cloudflare region refusal (HTTP 403, 90 byte text/plain "We are sorry, this service is not available in your region.") on robots.txt, both sections and the sitemap from this machine, and HTTP 403 on /sitemap.xml from the CI runner; 0 urls, 0 priced.

## What the logs and tables do not show

- The harvest log prints no byte count for a refused sitemap, only `HTTP 403`
  (or `HTTP 202` for Riiffs). Byte counts for CI requests are therefore not
  available; the local tables are the only byte measurements.
- The harvest log does not print a robots.txt request or its status for the six
  other dispatched shops, so what the CI runner received for their robots.txt is
  not recorded (only Harvey Nichols logs robots.txt, because it failed).
- No render-tier request was made today for any shop (see the workflow note
  above), so today's logs say nothing new about the local browser tier; the last
  render evidence is in the registry entries and the 2026-10-03 job log quoted above.
- Local requests went through the session proxy, which presented several
  addresses of one range (the three Riiffs captcha URLs carried three different
  ones). A different network, region or time of day was not tried.

## Diagnosis

Added 2026-10-08, one shop at a time in the order below, after the
measurements above. Each answers: why it is not possible, whether any part is
our side and fixable, what lawful route exists, and what to do. Rules as above
(PriceSniffsBot only, robots.txt obeyed, nothing worked round). The Apify
tiers are off by owner decision (docs/DECISIONS.md D23, `METERED_TIERS_ENABLED
= false`), so `allow_metered` does nothing; where they once got through, they
did it by rendering as a visitor from a residential address, which is exactly
what D23 and these rules exclude. The free local render is never tried after
a refusal.

### 1. The Fragrance Shop

- **Why not:** Cloudflare managed challenge. HTTP 403 with `cf-mitigated:
  challenge` and the "Just a moment..." page on robots.txt, all three sections
  and /sitemap.xml from this machine; HTTP 403 on /sitemap.xml from the CI
  runner (run #66). Because robots.txt itself is challenged, the rule covers
  the whole zone, not one path.
- **Our side?** Checked, and nothing reaches past it:
  - URL or section: not the cause; robots.txt, which has no section, is
    challenged the same way.
  - User agent: PriceSniffsBot, as required. Changing it would be
    impersonation.
  - Timeout: no; every answer came back in under a second.
  - Parser or adapter: no markup was served, so there is nothing to parse.
  - Render tier: never tried after a refusal; six local renders on
    2026-08-25/26 were 403 at 27,487 to 27,573 bytes (`renderRefused:
    'local'`).
  - Apify proxy and actor: never run against this shop; off by D23, and here
    they could only work round the challenge.
  - Workflow: `harvest-one-shop.yml` did not install Chromium (found above).
    **Fixed in this commit**: it now installs it as `catalogue-daily.yml`
    does, pinned to the same `ubuntu-24.04` image. That makes the probe
    representative of the crawl; it does not change this shop's answer.
  - Missing reader: only an Awin feed reader exists
    (`scripts/awin-feed-sync.ts`); a Rakuten one would be needed (below).
- **Lawful route:** Rakuten Advertising. The shop's own affiliates page
  (`https://www.thefragranceshop.co.uk/affiliates`, read through a search
  engine extract on 2026-10-08, since the domain refuses us) says to join
  Rakuten and apply to "The Fragrance Shop", **advertiser ID 43488**, and
  offers "a fully automated daily product feed". Aggregator listings (affi.io)
  show its Awin programme closed and its Webgains programme closing. Rakuten's
  Product Catalog feed comes by SFTP as XML or pipe delimited text after both
  Rakuten and the advertiser approve. A secondary, project wide option:
  Cloudflare's Verified Bots programme (identification by Web Bot Auth
  signature or IP list, robots.txt obeyed, applied for in a Cloudflare
  dashboard); whether a verified bot passes depends on each shop's own rules.
- **Recommendation:** stays off. Registry `affiliate` now records Rakuten,
  `not-applied`, `verified: false` (not yet seen on Rakuten's own listing).
  Owner applies to programme 43488 and asks for feed access; on approval an
  agent builds the Rakuten reader and sets `adapter: 'affiliate-feed'`.
  Permission email kept as the fallback (`docs/outreach/the-fragrance-shop.md`).
- **After the workflow fix:** one probe on the fixed workflow, run
  [#76](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37719860005)
  (job 113124796199, commit 220e4092, `allow_metered: false`), 02:50:46Z.
  "Install Chromium for the local render tier" succeeded in 31 s on
  `ubuntu-24.04`; the shop's answer did not change:
  `the-fragrance-shop refused PriceSniffsBot: https://www.thefragranceshop.co.uk/sitemap.xml: HTTP 403. Not retried any other way.`
  and `0 urls, 0 fetched, 0 priced listings (2 errors)`.

### 2. The Perfume Shop

- **Why not:** Akamai edge deny. AkamaiGHost "Access Denied", HTTP 403, 388
  to 454 bytes with an errors.edgesuite.net reference, on robots.txt, all four
  sections, /sitemap.xml and the known product page from this machine; HTTP
  403 on /sitemap.xml from the CI runner (run #67). The deny is served before
  robots.txt, so it is a rule about the requester, not a path. It is the same
  block shape Superdrug returns from the same Akamai host (both AS Watson
  brands), which reads as one group wide rule.
- **Our side?** Nothing to fix:
  - URL or section: the four category paths were confirmed in a browser on
    2026-08-06, and robots.txt is refused the same way, so the paths are not
    the cause.
  - User agent: PriceSniffsBot, as required.
  - Timeout: no; answers in under a second.
  - Parser or adapter: no markup served.
  - Render tier: never tried after a refusal; five local renders on
    2026-08-25/26 were 403 at 326 to 344 bytes (`renderRefused: 'local'`).
  - Apify tiers: off by D23 (the 74 stored offers date from 2026-08-20 to
    2026-08-22, the window in which the shared Apify credit ran out on
    2026-08-21, before D23); turning them on would only work round the deny.
  - Stored pages: the 74 are correctly not re-read once the sitemap refuses;
    they are past the 7 day rule and not shown.
  - Workflow: the probe now installs Chromium (shop 1), which does not change
    a refused shop.
- **Lawful route:** the shop's own affiliate programme at
  `https://www.theperfumeshop.com/affiliates` (refused to us). The network is
  not confirmed: Tradedoubler's blog says it became the exclusive network in
  December 2018; affi.io shows that Tradedoubler listing and an Awin listing
  closed, and a **Rakuten Advertising** GB listing open; affsignal lists
  Rakuten Advertising. The owner's browser can read the join link in a minute.
  Fallback: permission email to the customer service page; as an AS Watson
  brand sharing Superdrug's edge rule, a group level yes could cover both.
- **Recommendation:** stays off. Registry `affiliate` now records Rakuten,
  `not-applied`, `verified: false` (likely network). Owner confirms the
  network on the affiliates page and applies, asking for the product feed
  (`docs/outreach/the-perfume-shop.md`).

### 3. Selfridges

- **Why not:** Cloudflare WAF block. "Attention Required! | Cloudflare",
  "Sorry, you have been blocked ... You are unable to access selfridges.com",
  HTTP 403, on robots.txt (4,550 bytes), the section, /sitemap.xml and the
  known product page (5,487 to 5,488 bytes) from this machine; HTTP 403 on
  /sitemap.xml from the CI runner (run #68). This is a block page, not an
  interactive challenge: there is nothing to pass, by browser or otherwise.
- **What changed since it last priced:** `data/harvest-report.json` in
  commit c6d07f18 records the last priced Selfridges harvest at
  2026-10-04T15:38:54Z: `tier: "render"`, `renderer: "local browser"`, 1 page,
  60 priced. The PriceSniffsBot only rule landed at 17:35Z that day
  (3f565184). Since then the bot is blocked at the edge, and the render, which
  never runs after a refusal, is not reached. The 2026-10-03 run (#577) had
  already seen pages 2 to 5 refused.
- **Our side?** Nothing to fix:
  - URL: the section was confirmed in a browser on 2026-08-06; robots.txt is
    blocked as well, so the URL is not the cause.
  - Parser: present and tested (`src/catalogue/selfridgesRsc.ts` reads the
    RSC flight stream; price and markdown semantics settled 2026-08-22).
  - Identity: PriceSniffsBot, as required. Timeout: no.
  - Render tier: correctly not tried after the refusal.
  - Apify: the actor rendered the section (HTTP 200, 949,307 bytes) on
    2026-08-20; off by D23, and it would be a route round a WAF block.
  - Workflow: the probe now installs Chromium (shop 1); not relevant here.
- **Lawful route:** **Partnerize.** PerformanceIN (18 May 2022) reported
  Selfridges consolidating its affiliate programme onto Partnerize and retiring
  Awin and Rakuten; aggregators still list a Partnerize programme, and affi.io
  shows the Awin listing closed. Partnerize lets a brand offer product feeds to
  the partners on its campaign. Registry already records `partnerize`,
  `verified: true`, `not-applied`. Fallback: permission email through the
  contact page's Customer Services (no affiliate address found).
- **Recommendation:** stays off. Owner signs up at partnerize.com/partners,
  applies to Selfridges, asks for the product feed and whether comparison
  sites are accepted (`docs/outreach/selfridges.md`, new today). A Partnerize
  feed reader would be needed on approval. The 299 stored listings age out
  under the 7 day rule.

### 4. Harvey Nichols

- **Why not:** connection level refusal at an Akamai edge. robots.txt gets no
  HTTP response: HTTP/2 stream reset (`curl (92) ... INTERNAL_ERROR`) in 0.53
  and 0.62 s on www and the apex, one HTTP/1.1 try with 0 bytes in 30 s, and
  `HTTP 0 — AbortError` on both hosts from the CI runner (run #69). A DNS
  lookup made today (no request to the shop) shows `www.harveynichols.com` as
  a CNAME to `sdpremium.edgekey.net` and `e28400.dscksd.akamaiedge.net`, and
  `harveynichols.com` on Akamai addresses (2.21.240.66, 2a02:26f0:...). The
  same edge answered HTTP 503 in under a second to both a bot and a browser
  user agent from CI on 2026-08-20, and HTTP 200 (with an empty, script drawn
  grid) on 2026-08-10. So the shop moved from answering, to a 503, to
  resetting or stalling the connection; which Akamai action produces a reset
  and a stall cannot be read from outside.
- **Our side?** Nothing to fix:
  - robots.txt rule: RFC 9309 and `src/catalogue/robots.ts` treat a
    robots.txt that cannot be read as "ask nothing"; the harvest asked once
    more after 30 s and stopped. Correct.
  - Timeout: the HTTP/1.1 try got no byte in 30 s; a longer wait would only
    sit on a stall.
  - URL: the section was confirmed in a browser on 2026-08-06; never reached.
  - Identity: PriceSniffsBot. Render: never reached (robots.txt first).
  - Workflow: before today the one shop probe could not render (no Chromium),
    which mattered most for this `headless` shop; now fixed (shop 1). It would
    only show something if the edge starts answering.
  - Apify: the actor was refused by Apify itself (permission approval) and the
    proxy failed on every shop in August; both off by D23.
- **Lawful route:** **Rakuten Advertising**, likely: affi.io lists
  "Harvey Nichols & Co Ltd" on Rakuten Advertising, GB, open, and on
  FlexOffers, GB, open (a sub network). affi.io's "Harvey Nichols" page also
  lists US programmes on Partnerize, Sale Gains and FlexOffers. No affiliates
  page on harveynichols.com was found to confirm. Registry `affiliate` now
  records Rakuten, `not-applied`, `verified: false`.
- **Recommendation:** stays off. Owner searches the Rakuten publisher
  directory for Harvey Nichols (same account as The Fragrance Shop), applies
  and asks for the product feed; permission email as the fallback
  (`docs/outreach/harvey-nichols.md`).

### 5. Zara

- **Why not:** Akamai edge deny. "Access Denied", HTTP 403, 375 to 476 bytes,
  errors.edgesuite.net reference, `akamai-cache-status: Error from child`, on
  robots.txt, both sections, /sitemap.xml and the known product page from
  this machine; HTTP 403 on /sitemap.xml from the CI runner (run #70). A DNS
  lookup today shows `www.zara.com` as a CNAME to `zara.com.edgekey.net` and
  `e101087.dscx.akamaiedge.net`. The deny is served before robots.txt.
- **Our side?** Nothing to fix:
  - URL: both sections are real category pages; robots.txt is denied the
    same way.
  - Parser: the JSON-LD parser priced 8 of 8 listings on a render of the
    women's section (2026-08-22), so there is no parser gap.
  - Identity: PriceSniffsBot. Timeout: no.
  - Render tier: the free local render got 403 at 325 to 331 bytes four times
    on 2026-08-25/26 (`renderRefused: 'local'`), and is never tried after a
    refusal anyway.
  - Apify: the actor reached the page from a residential address (HTTP 200,
    2.76 to 2.94 MB, 2026-08-20 to 2026-08-22). That is precisely a route
    round the deny; off by D23.
  - Workflow: the probe now installs Chromium (shop 1); not relevant here.
- **Lawful route:** none with a feed. No open affiliate programme was found;
  sources describe an invitation only creator "Ambassador" scheme, reported
  to run through LTK, which pays creators and gives no product feed. The only
  lawful route is permission from Zara (Inditex).
- **Recommendation:** stays off, lowest priority. Zara sells only its own
  perfumes (`singleBrandOnly`), so its listings are never compared with
  another shop's. Permission email refreshed (`docs/outreach/zara.md`), to send
  last if at all.

### 6. Notino UK

- **Why not:** Cloudflare managed challenge. The section
  `/fragrance/?f=1-1-55544` answered HTTP 403, 5,680 bytes, `cf-mitigated:
  challenge`, "Just a moment...", while robots.txt answered HTTP 200 and its
  `User-agent: *` group allows that section, `/sitemap.xml` and product pages
  (`isAllowed` true). A DNS lookup today shows `www.notino.co.uk` on a
  Cloudflare address (172.64.147.195). So the shop's own crawl policy admits
  PriceSniffsBot and its Cloudflare bot rule does not: a bot management
  verdict, not a robots.txt refusal. The same challenge met the sitemap and a
  product page on 2026-09-10 and the home page on 2026-10-03.
- **Our side?** Nothing broken:
  - Harvest: not dispatched, because `adapter: 'owner-import'` is skipped by
    the harvest on purpose (owner, 2026-10-06), so re-enabling the shop can
    never start a crawl. A dispatch would ask nothing; that is a decision, not
    a workflow gap.
  - URL and pagination: `?f=<page>-1-55544` is the shop's own (read off its
    `rel="next"` link, 2026-08-27).
  - Parser: reads its CollectionPage `mainEntity` JSON-LD (fixed 2026-08-27,
    tested on a real fixture).
  - Saved page importer: built (`npm run notino:import`,
    `docs/OWNER-STEPS.md` section 9).
  - Render tier: refused on all four pages in five runs, 2026-09-11/12
    (`renderRefused: 'local'`), and never tried after a refusal.
  - Apify: never run here; off by D23.
  - Missing: a CJ feed reader. Built only against a real feed file
    (`docs/NOTINO-PLAN.md` step 3).
- **Lawful route:** **CJ Affiliate**, Notino UK programme run by VIVnetworks
  (Publicis Groupe); VIVnetworks' own catalogue page lists "XML feed: yes"
  (registry `cj`, `verified: true`, `not-applied`). Not on Awin. In parallel,
  the permission email; and, because robots.txt already allows us,
  Cloudflare's Verified Bots programme (an honest, verifiable PriceSniffsBot)
  is the one identity route that could change the challenge, if Notino's zone
  admits verified bots. Unproven, and an owner decision for the whole project.
- **Recommendation:** stays off. Owner opens a CJ publisher account, applies
  to Notino UK and sends the refreshed email the same day
  (`docs/outreach/notino-uk.md`, now with the "same terms as your comparison
  feeds" line the plan asked for); optional weekly saved pages meanwhile.

### 7. Riiffs Perfumes

- **Why not:** SiteGround captcha. HTTP 202 with `sg-captcha: challenge` and
  a single `<meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/...">`
  on robots.txt, sitemap_index.xml and `/product/raheeq/` from this machine,
  and on /sitemap.xml from the CI runner (run #71: "HTTP 202, a SiteGround
  captcha challenge instead of the page (refused, not empty)", "stopped early:
  the shop answered with a captcha"). Captchas are never solved or followed.
  The last run to price anything began 2026-09-14T04:56Z (66 priced).
- **Our side?** One gap, **fixed in this commit**:
  - `readRobotsResponse` in `src/catalogue/robotsSource.ts` treated any 2xx
    with a body as a robots file. The captcha page has no User-agent line, so
    it parsed to no rules, which `isAllowed` reads as "nothing forbidden". With
    141 stored live listings, the harvest then asked the shop's Shopify check
    and WooCommerce Store API (`refreshFromPlatform`) and its sitemap, each
    answered by the same captcha, before the sitemap walk's own captcha check
    stopped it. That is up to three requests after the shop had refused at
    robots.txt, against the owner's rule that a bot wall is a refusal and the
    shop is left alone.
  - Now a 2xx robots.txt whose body carries a known challenge marker
    (SiteGround `sgcaptcha`, Cloudflare `_cf_chl_opt` or
    `/cdn-cgi/challenge-platform/`, `_Incapsula_Resource`, DataDome
    `captcha-delivery.com`, `px-captcha`) and no robots directive is a
    refusal: `probeRobots` stops at that address, records "a captcha or
    challenge page instead of robots.txt (refused; nothing else asked)", and
    the shop is held off like an unreachable robots.txt. A 4xx keeps its
    RFC 9309 meaning. Tests: `tests/robotsSource.test.ts`, on the measured
    SiteGround body with the egress address replaced by 192.0.2.1.
  - Effect: one request to this shop per run instead of up to four. It
    cannot yield a priced listing; every route the shop has is behind the
    captcha.
  - Not gaps: `catalogue: null` (the sitemap route needs no section URLs,
    `sitemapHarvestConfirmed: true`); the render tier (never after a
    refusal); Apify (off by D23).
- **Lawful route:** no affiliate programme, network listing or feed was
  found; the brand belongs to Sterling Perfumes Industries (Dubai). Only the
  shop, through its host's bot settings, can let PriceSniffsBot through, so the
  route is a permission email (`docs/outreach/riiffs.md`, refreshed). Its
  perfumes are also sold by FragranceHub and Perfume Click, which stay listed.
- **After the fix, one probe (and a surprise):** run
  [#78](https://github.com/yanakan19/YanaFragrancePriceChecker/actions/runs/37721515661)
  (job 113130005757, commit 0816f1a9, 03:11Z, `allow_metered: false`) was
  **not challenged**: robots.txt read, then
  `Riiffs Perfumes: woocommerce catalogue re-priced 141 of 141 stored listings in 3 request(s)`
  and `Riiffs Perfumes        145 urls   14 fetched   13 priced listings  [+141 re-priced from woocommerce catalogue]`.
  Run #71, 45 minutes earlier, was challenged. The committed harvest report
  of 2026-10-04 (c92b1cf0, run started 21:43:50Z) also shows a clean read:
  142 URLs, 41 priced, 141 re-priced from WooCommerce. The owner switched the
  shop off at 23:41Z that day (ff68d662), while it was answering. So the
  captcha is **intermittent**: SiteGround challenges some requests or
  addresses and not others, and the route as PriceSniffsBot works whenever it
  is not challenged. Nothing is solved, followed or retried either way.
- **Recommendation:** stays off for now, as an owner decision rather than a
  blocker. It was taken off while readable, and it carried 8 offers on the
  site then (ff68d662's own count). Our fix did not
  make it answer; it makes a challenged run cost one request. Switching it
  back on is safe whenever the owner wants it: `enabled: true`, take `riiffs`
  out of the switched-off lists (`tests/registry.test.ts`,
  `tests/switchedOffShops.ts`), `npm run rebuild` (the price history replays,
  because the enabled set is in its checkpoint fingerprint), and a changelog
  line. The permission email would make it reliable rather than intermittent.
