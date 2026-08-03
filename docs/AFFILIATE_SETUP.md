# Affiliate setup

Nothing is monetised yet, and that is deliberate. Every outbound link currently
resolves to the plain retailer URL — the app works, it just earns nothing. This
is the right order to do it in: get the comparison honest first, then attach
revenue to it.

Run `npm run affiliate:status` at any point to see what is outstanding.

---

## Why this matters beyond the money

The plan calls affiliate feeds "first, scraping second", and the reasoning holds
up for three reasons that have nothing to do with commission:

1. **Image rights.** A product feed grants you licence to display the retailer's
   product images. Scraped images carry no such licence.
2. **EANs.** Feeds usually carry EAN/GTIN, which solves product matching — the
   hardest problem in the project — for free. Matching on EAN is exact; matching
   on `"Dior Sauvage EDP 100ml"` is a fuzzy-scoring problem with a manual review
   queue behind it.
3. **Legitimacy.** Being an approved publisher makes you a partner rather than a
   scraper, which changes how a retailer's bot-mitigation team treats you.

So the affiliate audit is not a monetisation chore to defer — it feeds directly
into the Phase 1 matcher.

---

## Current state

| Retailer | Network | Confirmed? | Status |
|---|---|---|---|
| Boots | Awin ([merchant 2041](https://ui.awin.com/merchant-profile/2041)) | yes | not applied |
| LOOKFANTASTIC | Awin ([merchant 2082](https://ui.awin.com/merchant-profile/2082)) | yes | not applied |
| Superdrug | Awin | yes | not applied |
| Allbeauty | — | — | not researched |
| Justmylook | — | — | not researched |
| Notino UK | — | — | not researched |
| The Fragrance Shop | — | — | not researched |
| The Perfume Shop | — | — | not researched |
| John Lewis | — | — | not researched |
| Beautybase | — | — | not researched |
| Selfridges | — | — | not researched |
| Harvey Nichols | — | — | not researched |
| *Fragrance Click UK* | Awin (merchant 124166) | ids confirmed | **active on Awin, no `Retailer` entry yet — domain + shipping still needed, see below** |

Only the three marked *confirmed* have been verified against a network's own
merchant listing. The other nine are genuinely unresearched — they are not
recorded as "probably Awin", because a guess written into config becomes a fact
nobody re-checks.

### Fragrance Click UK — ids confirmed, two things still needed

Both ids are now known, read straight off the account, not guessed:

- **Merchant id (`awinmid`): `124166`** — from the programme page (Fragrance
  Click UK, "Joined", ID 124166).
- **Publisher id (`awinaffid`): `3017443`** — this is the account id visible
  throughout the dashboard URLs (`ui.awin.com/awin/affiliate/3017443/...`)
  and on the Account Overview page ("ID | 3017443"). This is **not** the
  OAuth2 API token shown on the API Credentials page — that token
  authenticates programmatic API calls (e.g. pulling a feed) and is a
  different credential entirely, the same distinction that already exists
  between the Apify proxy password and an Apify API token (see
  `docs/INGESTION.md`). Never commit it or paste it anywhere it'll persist;
  if it's ever needed, it belongs in a secret store the same way
  `APIFY_PROXY_PASSWORD` does.

So the call is ready:

```ts
affiliate: awinActive('124166', '3017443'),
```

**What is not yet confirmed is which storefront this is.** The programme
description ("bestselling fragrances... prices well below the high street")
and a public lookup both point to **fragranceclick.co.uk**, operated by
Fragrance Click Ltd (Companies House 12092721) — but the "Website" field on
the Awin programme page itself was blank in what was shared, so this is a
strong match, not a confirmed one. Confirm it by opening the programme page's
own website link, or the "Get links" panel, before treating it as fact.

**The other blocker is delivery terms.** `ShippingRule.standardGbp` is a
required, real number — a wrong one produces a wrong delivered price, which
is the one error class this whole registry exists to prevent, so it will not
be filled with a placeholder. An automated fetch of fragranceclick.co.uk's
delivery page returned `403 Forbidden` just now, the same bot-mitigation
pattern already documented for eight other UK fragrance retailers. Until a
human reads the real number off the site (or off checkout), there is no
`Retailer` entry to add `awinActive(...)` to yet.

**Recommended route once the domain is confirmed:** don't build a scraper for
it. This merchant already exposes a live product feed — 895 products, updated
daily, visible under "My Product Feeds" on the programme page — and
`AdapterStrategy` already has `'affiliate-feed'` for exactly this case. A feed
pull (EAN, price, stock, deep link, image, all in one response) is more
reliable than parsing the storefront and is the ingestion route this project
has preferred since `docs/INGESTION.md` was written. That's a small new
module, similar in shape to `sitemapCrawl.ts`, and worth building once the
domain is confirmed — say the word and I'll scope it properly rather than
half-build it now.

**On product images — this is now confirmed, not inferred.** The programme's
own Terms tab states it plainly:

> Publishers may not alter any of the creative or text links available
> through the Affiliate network Interface. In order to prevent out of date
> content, affiliates may not hard code the creative into their sites.

Read plainly, that's a yes with two conditions: use the creative Awin serves
(the feed's `aw_image_url`), don't edit it, and don't take a static copy —
keep referencing it live so it stays current. That second condition is
already how this codebase treats images: `RawListing.imageUrl` has always
been a reference string pointed at the retailer's own hosted image, never a
downloaded file (`src/catalogue/jsonld.ts`), so nothing architectural needs
to change to comply with it.

That's enough to set `imageUsageConfirmed: true` for this retailer's entry
once it exists — quoting the actual Terms text is exactly the standard the
field's doc comment in `src/types/retailer.ts` asks for, not an inference
from programme approval. It still only applies to this one merchant; every
other retailer's entry keeps the generated bottle art until its own Terms
tab has been read the same way.

**How this compares to Fragrantica's bottle shots:** Fragrantica's clean,
background-free bottle renders come from a image library built up over
roughly two decades of curated and licensed submissions — there is no
approved-publisher shortcut to that. What a feed image realistically gets
this app is the retailer's own product photography as used on their site —
usually a clean studio shot on a plain background, sometimes with their own
logo or promotional badge overlaid, and not guaranteed uniform from one
product to the next. It's a real photo of the actual bottle, which is a
genuine upgrade over the generated art, but treat "as clean as Fragrantica"
as an aspiration the feed alone won't fully deliver — worth a quick look at
a handful of the 895 feed entries once it's pulled, before assuming every row
is gallery quality.

---

## How to set one up

### 1. Sign up as an Awin publisher

Most UK beauty programmes run on Awin, so start there — it covers at least three
of the twelve and likely more.

1. Register at <https://www.awin.com/gb/publishers>.
2. There is a **£5 refundable deposit** on signup, returned with your first
   payout. Expect it; it is not a scam signal.
3. You will need a live website with real content. This is the practical
   blocker: **apply after ScentDay is deployed and has something on it**, not
   before. An application pointing at a holding page gets rejected, and
   re-applying after rejection is harder than applying once at the right time.
4. Once approved, find your **publisher ID** in the Awin dashboard.

### 2. Apply to individual programmes

Publisher approval is not programme approval. Each merchant approves separately,
and approval times range from instant to a few weeks.

Two things worth knowing before you apply:

- **Superdrug excludes coupon, cashback and deal sites.** ScentDay is a price
  comparison site, which is adjacent enough that the question will come up. Lead
  the application with the editorial side — notes taxonomy, fragrance discovery —
  rather than "we show the cheapest price".
- **Describe the traffic honestly.** Comparison sites are valuable to merchants
  because the intent is high. That is a strength; do not undersell it.

### 3. Wire it into the registry

Once a programme is live, edit that retailer's entry in
[`src/config/retailers.ts`](../src/config/retailers.ts):

```ts
affiliate: {
  network: 'awin',
  verified: true,
  status: 'active',
  publisherId: '123456',
  deeplinkTemplate:
    'https://www.awin1.com/cread.php?awinmid=2041&awinaffid={{publisherId}}&ued={{url}}',
  signupUrl: 'https://ui.awin.com/merchant-profile/2041',
},
```

`{{publisherId}}` and `{{url}}` are substituted at link-build time, with the
target URL-encoded. Nothing downstream changes — `buildOutboundLink` starts
returning tracked links and `isAffiliateLink` flips to `true` on its own.

**Do not commit your publisher ID to a public repository.** Read it from an
environment variable once the repo is anything other than private.

### Awin deeplink format

```
https://www.awin1.com/cread.php?awinmid={MERCHANT_ID}&awinaffid={YOUR_ID}&ued={ENCODED_URL}
```

`awinmid` is per-merchant (Boots is 2041, LOOKFANTASTIC is 2082) and is baked
into that retailer's template. `awinaffid` is yours and is the same everywhere.

### Other networks

If a retailer turns out not to be on Awin, check in this order — this is roughly
the UK beauty market's distribution:

| Network | Deeplink shape |
|---|---|
| Rakuten Advertising | `https://click.linksynergy.com/deeplink?id={ID}&mid={MID}&murl={ENCODED}` |
| CJ Affiliate | `https://www.anrdoezrs.net/links/{ID}/type/dlg/{ENCODED}` |
| Partnerize | per-merchant tracking domain, generated in their dashboard |
| Tradedoubler | `https://clkuk.tradedoubler.com/click?p={MID}&a={ID}&url={ENCODED}` |

The template mechanism handles all of these — only the string changes.

---

## Disclosure is not optional

UK ASA/CAP rules require affiliate relationships to be disclosed clearly and
prominently. For a comparison site that means:

- a persistent statement that ScentDay may earn commission from retailer links;
- disclosure **before** the click, not buried in a footer policy page;
- and most importantly, **commission must never influence the ranking**.

That last point is worth being firm about. The entire value of ScentDay is that
the cheapest delivered price is genuinely at the top. The moment ordering is
sold, the product is worthless — and users detect it faster than you would
expect. Keep `buildComparison` sorting on price and stock only; if a
commercial placement is ever wanted, it belongs in a visually distinct slot that
is labelled as such and sits outside the sorted table.

---

## Reminders

- `npm run affiliate:status` — what is outstanding and the next step for each.
- `npm run shipping:staleness` — which delivery rules still need confirming.

Both are plain scripts with no dependencies, so they can be wired into CI or a
pre-deploy check later.
