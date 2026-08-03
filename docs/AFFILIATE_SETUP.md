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
| *Fragrance Click UK* | Awin | applicant's own account shows it approved | **approved, not yet wired in — see below** |

Only the three marked *confirmed* have been verified against a network's own
merchant listing. The other nine are genuinely unresearched — they are not
recorded as "probably Awin", because a guess written into config becomes a fact
nobody re-checks.

### Fragrance Click UK — approved, waiting on two ids

The Awin "Your Advertisers" dashboard shows this programme approved (Product
Feed: Yes, Link Status: Promote), but it does not correspond to any of the
twelve retailer entries above by name — Awin programme names commonly differ
from the storefront's public brand, so it may be an existing retailer under a
different Awin name, or it may be a thirteenth stockist not yet in the
registry at all. Two things are needed before this can be wired up, and
neither can be guessed:

1. **Which storefront this actually is.** Open the programme in the Awin
   dashboard (click into "Fragrance Click UK" from Your Advertisers) — it will
   show the merchant's website. If it matches one of the twelve above, use
   that entry; if not, it needs a new `Retailer` entry in
   `src/config/retailers.ts` (domain, shipping rules, catalogue sections, the
   works) before affiliate wiring means anything.
2. **The merchant id (`awinmid`)** — on that same programme page, or in the
   "Get links" panel.
3. **Your publisher id (`awinaffid`)** — Account details in the Awin
   dashboard, the same value for every approved programme on this account.

Once those are known, use the `awinActive(merchantId, publisherId)` helper in
`src/config/retailers.ts` (sits next to `awinPending`) — it builds the
`active` affiliate config and the deeplink template in one call:

```ts
affiliate: awinActive('123456', 'YOUR_AWIN_AFFID'),
```

`buildOutboundLink` in `src/services/affiliate.ts` needs no changes — it
already produces a tracked link the moment `status` is `'active'` and both
ids are present.

**On product images:** being accepted onto the programme is not, by itself,
proof of what Fragrance Click UK's creative-usage terms say — most Awin
programmes do permit feed images for approved publishers, which is why the
feed carries them, but "most" is not "this one, confirmed". Read that
merchant's own Terms/Creative tab in the Awin dashboard, and only then set
`imageUsageConfirmed: true` on its `AffiliateConfig` (see the field's doc
comment in `src/types/retailer.ts`). Until that flag is set, the app's
generated bottle illustration stays the only image shown for that retailer's
listings — real product photography is gated behind this flag and must not
be displayed on the strength of programme approval alone.

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
