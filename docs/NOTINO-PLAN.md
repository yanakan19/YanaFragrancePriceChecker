# Notino UK: plan to bring it back

Written 2026-10-06. Plan only; nothing here is built yet.

## Where things stand

- `notino-uk` in `src/config/retailers.ts`: `enabled: false` (owner, 2026-10-04),
  `renderRefused: 'local'`, `adapter: 'headless'`. Every request since
  2026-09-11 gets a Cloudflare managed challenge (HTTP 403), home page included
  (recheck 2026-10-03). The 95 stored offers (newest 2026-09-09) are past the
  7 day rule (`HIDE_OFFER_AFTER_DAYS`, `src/services/offerAge.ts`) and hidden.
- robots.txt (read 2026-09-10 and 2026-10-03) allows product pages, `/fragrance/`
  and the sitemap. The block is Cloudflare, not robots.txt.
- `affiliate` is already recorded as `network: 'cj'`, `verified: true`,
  `status: 'not-applied'`, via VIVnetworks
  (vivnetworks.com/en/affiliate-catalog/notinocom/, "XML feed: yes").
- `docs/outreach/notino-uk.md` holds a permission email, drafted 2026-10-03,
  not sent.

Ground rules that do not move: PriceSniffsBot identity only (D23), robots.txt
obeyed, and no way past bot protection: no spoofed headers, proxies, headless
evasion or captcha solving. A 403 is an answer.

## 1. Lawful routes, ranked

| # | Route | What it gives | Who acts | Verdict |
|---|---|---|---|---|
| 1 | **CJ Affiliate feed (Notino UK via VIVnetworks)** | Full catalogue, prices, stock, EAN, image licence, commission | Owner applies; we build CJ ingest | **Recommended** |
| 2 | Ask Notino directly | Allowlisting PriceSniffsBot, or a feed by email/URL | Owner sends the draft | Do in parallel, free |
| 3 | Owner imports saved pages | 24 to 48 products a page, real EANs, as fresh as the owner's last save | Owner saves pages; we build importer | Bridge only |
| 4 | Sitemap plus JSON-LD as PriceSniffsBot | Everything, if the block lifts | Nobody (blocked) | Closed; recheck monthly |
| 5 | Official public API | n/a | n/a | None found |

**1. CJ Affiliate.** Web listings (CJ, VIVnetworks, FlexOffers, Referly)
agree: Notino runs CPS programmes on CJ, roughly 4 to 6% default on Notino
UK, 15 day cookie, XML product feeds available. Notino is **not on Awin**
(checked 2026-09-10). There are two approvals:
1. *CJ publisher account*: free. CJ wants a live site with real content, a
   privacy policy and a stated promotional method ("price comparison"). It does
   not set a published traffic minimum, so a small site can join.
2. *Notino UK programme*: the advertiser (VIVnetworks for Notino) approves or
   declines each publisher by hand. Low traffic is a common reason to decline
   or "hold", and a comparison site may be asked how it shows prices. Expect
   days to weeks. If declined, reapply after traffic grows, or ask
   VIVnetworks direct (their page lists a contact).

Feed format once approved: CJ serves advertiser product catalogues through
its Product Feed (scheduled export in XML/CSV, or the Product Search GraphQL
API with a personal access token). Typical fields: `id`/`sku`, `title`,
`link` (CJ tracking URL), `price`, `sale-price`, `availability`, `gtin`,
`image-link`, `brand`. Exact columns must be read from the first real file,
not assumed.

**2. Ask Notino.** Send `docs/outreach/notino-uk.md`. Add one line asking
whether they already supply a feed to comparison sites (Google Shopping,
idealo, PriceRunner) that we could receive on the same terms. If they
allowlist PriceSniffsBot, the existing harvest works with no new code: drop
`renderRefused`, set `adapter: 'json-ld'`, re-enable.

**3. Owner imports saved pages.** The owner opens Notino as an ordinary
customer, saves a brand or search results page (24 to 48 products) or a
product page, and drops the file in. Lawful as personal browsing, but note:
Notino's terms may forbid systematic copying of its database, and UK database
right protects substantial extraction. Keep it small and occasional and stop
if Notino objects. Prices drop off after 7 days, so it only stays visible if
the owner re-saves weekly. Good for proving matching and keeping Notino on the
site while route 1 or 2 is pending; not a lasting source.

**4. Sitemap.** Allowed by robots.txt but answers a challenge. Keep the
existing polite one pass recheck (as on 2026-10-03), once a month at most.

**5. API.** Notino publishes no public product API. Do not use its internal
`/api/` or GraphQL endpoints: robots.txt disallows `/api/`.

## 2. How it fits the code

**Feed retailers today.** Awin shops set `adapter: 'affiliate-feed'`; the
harvest skips them, and `src/catalogue/awinFeedIngest.ts` (parse, refuse on
zero rows, `reconcile`, `store.write` as `source: 'live'`) is shared by
`scripts/catalogue-feed.ts` (a file handed over) and `scripts/awin-feed-sync.ts`
(scheduled download). Copy that shape:

- `src/catalogue/cjFeed.ts`: parse a CJ XML/CSV export to `RawListing[]`
  (`url` = CJ tracking link, `merchantUrl` = Notino product page, `ean` from
  `gtin`, price, stock, image).
- `src/catalogue/cjFeedIngest.ts`: same contract as `ingestAwinFeedCsv`.
  Better: lift the shared core into `feedIngest.ts` taking a parser.
- `scripts/catalogue-feed.ts` gains `--format=cj`; a later `cj-feed-sync.ts`
  plus workflow (must use `scripts/commit-and-push.sh` and share the crawl's
  concurrency group, see `tests/workflowRules.test.ts`).
- Registry: `adapter: 'affiliate-feed'`, `affiliate.status: 'active'`, a
  `deeplinkTemplate` for CJ, `enabled: true`.

**Saved page importer** (route 3): `scripts/notino-import.ts` plus
`src/catalogue/notinoSavedPage.ts`.
- Reads only JSON-LD `Product`/`ItemList` and the Apollo state's product
  nodes. Keeps an allow list of fields: name, brand, variant URL, EAN
  (`gtin13`/`eanCode`), sku, size, concentration, gender, price, stock flag,
  image URL, 30 day lowest price. Everything else (cookies, account, basket,
  scripts, any login data) is discarded and never written.
- `fetchedAt` = the date the owner saved the page (from the file's
  `saved from` comment or file time, else asked for), never the import date.
- RRP marked "Converted" is ignored: it is not a price Notino charged, so it
  must not feed a "was" price or a deal (see `wasPriceCredibility.ts`).
- Refuses a file that is a challenge page, or whose host is not
  `notino.co.uk`. Merges with the stored snapshot via `reconcile` with
  `complete: false`, so one saved page never delists the rest.

**Matching by EAN.** Notino gives a real per variant EAN (the feed and the
JSON-LD both). `productMatch.ts` keys on a checked GTIN where present, so a
Notino offer joins the existing product with the same barcode.

**105 ml vs 100 ml.** `matchKey` compares `sizeMl` exactly, so a Notino
"105 ml" never merges with another shop's "100 ml" by name. Do not round
sizes globally: 105 ml is often the true fill (and some brands sell both).
Rule: when the EAN is the same as a product other shops list as 100 ml, join
on the EAN and show Notino's own label ("105 ml") on its offer row; with no
EAN agreement, keep 105 ml as its own size. Add a test for both cases.

**Price history.** Feed or import listings flow through the normal store, so
`npm run catalogue:history` picks them up with no change. Imported points
carry the saved date.

**Staleness.** The 7 day rule applies unchanged. For imported offers show
"Price read on 6 Oct" on the offer row (the existing offer age text, if it
already shows; otherwise a small label for `source` = owner import). No
extended lifetime for imports.

**Delivery.** Keep `shipping` as is (Evri £2.99, no spend threshold). The
saved page confirms Evri/DPD and no free threshold; record that as the read
with its date, still `confidence: 'unverified'` until the page itself is
read in full by the owner.

## 3. What to build first

1. **Owner applies to CJ and the Notino UK programme** (no code). Send the
   outreach email the same day.
2. **Saved page importer** (about 1 day): parser, allow list, refusal of
   challenge pages, `reconcile` merge, CLI. Tests: the owner's saved page as a
   fixture with login and cookie data stripped first (exact price £25.50 for
   105 ml and £9.70 for 10 ml, EAN read, RRP "Converted" ignored, nothing
   outside the allow list in the output), a challenge page refused, wrong host
   refused, EAN join with a 100 ml product, no join on size alone.
3. **CJ feed ingest** (about 1 day once a real feed file exists; do not build
   against guessed columns): parser, shared ingest core, `--format=cj`, tests
   from a trimmed real export. Then the scheduled sync (half a day).
4. Re-enable `notino-uk` when either route has fresh prices; update the
   changelog then (a visitor notices a shop returning).

**Risks.** CJ or VIVnetworks declines a low traffic site (fallback: route 2,
reapply later). Feed EANs may be missing or invalid (the GTIN check in
`productMatch.ts` already guards). Imports go stale within a week if the owner
stops. Notino may object to imports: stop at once and record it. A saved page
may contain personal data: the importer must never store it, and the raw file
is never committed.

## 4. What only the owner can do

Suggested text for `docs/OWNER-STEPS.md`:

> ### Notino: get its prices back (20 minutes, then waiting for approval)
>
> 1. Make a free publisher account at cj.com. Give pricesniffs.space as the
>    site and "price comparison" as how you promote shops.
> 2. In CJ, search for "Notino UK" and apply. Notino's partner agency
>    (VIVnetworks) decides; it can take a few weeks.
> 3. When accepted, send me your CJ publisher id. Do not paste any password or
>    access token into a chat or a file; if one is needed it goes in GitHub
>    secrets.
> 4. Send the email in `docs/outreach/notino-uk.md` through
>    notino.co.uk/contact. Tell me if they reply.
> 5. Optional, until then: open a Notino brand page in your browser while
>    logged out, save it ("Save page as", complete), and give me the file. I
>    keep only product details and the date you saved it. Prices show for 7
>    days, so this only helps if you repeat it weekly.

## Recommendation

Go for the **CJ Affiliate feed**. First step: the owner opens a CJ publisher
account and applies to Notino UK this week, and sends the outreach email the
same day. Build the saved page importer meanwhile as the bridge and as test
data for EAN and 105 ml matching; build CJ ingest only when a real feed
file is in hand.

Sources: vivnetworks.com/en/affiliate-catalog/notinocom/ (read 2026-09-10),
flexoffers.com/affiliate-programs/notino-co-uk-affiliate-program/,
referly.so/affiliate-programs/notino (read 2026-10-06).
