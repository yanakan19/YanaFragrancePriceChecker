# Decisions

Decisions that shaped the code, so the reasoning is recoverable later. Where a
plan question is still open, it says so rather than pretending it was settled.

---

## D1 — There is no `trusted` flag

**Decided.** The per-retailer `trusted` boolean was dropped rather than renamed.

The original registry marked Selfridges and Harvey Nichols untrusted. Both are
beyond reproach on authenticity, so the flag could not have meant what its name
said — it was silently encoding something closer to "good value". A flag whose
name and meaning disagree cannot be maintained, because nobody dares change it.

The decision taken: **all twelve retailers are legitimate and all are fine to
send a customer to.** What separates a good listing from a bad one is not the
retailer's identity but whether we tell the truth about the offer:

1. the genuine price being charged right now;
2. the was/now pair and discount percentage, when the retailer is running a real
   promotion;
3. the delivery cost that will actually appear at checkout, including whether
   this order clears the free-delivery threshold;
4. the stock state, with out-of-stock listings pushed to the bottom.

Those obligations are universal, so they live in `src/services/` rather than in
a per-retailer boolean. `enabled` remains as the single per-retailer switch and
means only "do we fetch from here".

Per-seller trust **is** still modelled for TikTok Shop, where counterfeits are a
real risk and the flag has a concrete meaning.

---

## D2 — Beautybase is in

**Decided.** Included, enabled, tiers `designer` + `niche`. It is a legitimate UK
stockist with genuine niche depth (Creed, Xerjoff, Amouage). Under D1 there is no
trust flag for it to fail.

---

## D3 — Headline sort is delivered price

**Decided**, and directly implied by the requirement to factor in free-delivery
minimums.

Shipping routinely exceeds the price gap on fragrance, and thresholds vary from
£25 to £300 across the registry. Sorting on item price would put a listing at the
top that is not actually the cheapest — see the regression test in
`tests/priceService.test.ts`: Boots at £24.99 has the lowest item price but
misses its £25 threshold by a penny and ends up **£2.95 dearer** than a £26
listing that ships free.

`sortBy: 'item'` is available for a UI toggle, but `'delivered'` is the default
and should stay that way.

---

## D4 — Membership prices are never the headline

**Decided.** Boots Advantage, MYTFS, LOOKFANTASTIC Premier, Superdrug Beautycard,
Selfridges+ and allbeauty myDelivery all offer better delivery than the modelled
rate.

None are applied to the delivered price. Quoting a members-only price to a
non-member is showing a number they cannot pay. They are recorded as
`membershipPerk` and surface as a footnote — genuinely useful information,
just not the headline.

Superdrug is the concrete case: £20 free-delivery threshold for cardholders,
£25 without. The registry carries £25.

---

## D5 — `unknown` stock is not `outOfStock`

**Decided.** Three sort tiers only: `inStock`/`lowStock`/`preOrder` share the
top tier, then `unknown`, then `outOfStock`.

A page we failed to parse is not evidence a product is unavailable. Demoting it
to the bottom would misrepresent the retailer; letting it compete on price would
overstate what we know. It sits between, above only the explicit out-of-stock
signal.

**Revised 2026-08-01.** The first version gave `lowStock` its own tier below
`inStock`. That buried a cheaper low-stock listing beneath a dearer in-stock one
— the demo surfaced John Lewis at £108 above Boots at £105, which reads as a
broken table. Low stock is still stock, so every positive availability signal
now shares one tier and price decides between them. Only an explicit
out-of-stock signal reaches the bottom, which is also what the brief asked for.

Only `outOfStock` sets `isPurchasable: false`, and `bestOffer()` never returns an
unbuyable row however cheap it is.

---

## D6 — Discounts come from the retailer, never from us

**Decided.** `buildDiscount` returns a was/now pair only when the retailer itself
published a reference price above what it is charging.

Three specific refusals:

- **No inferred "was" price** from our own price history. That figure would be
  ours, not the retailer's, and presenting it as theirs is a UK CPR pricing-claims
  problem, not just a modelling one. This is distinct from the §4 *derived* flash
  deal signal, which is ours to state — "15% below its 30-day median here" is a
  claim we can make, "was £100" is not.
- **No rounding up.** 19.6% displays as 19%. Overstating a discount is the one
  rounding error with regulatory consequences.
- **No invented countdowns.** `canShowCountdown` is true only for a
  retailer-published future end time. A fabricated deadline is pressure selling
  and an ASA exposure, and it is the fastest way to lose a comparison user.

---

## D7 — Notino has no spend-based free delivery

**Decided**, and worth recording because it looks like missing data.

Notino gates free postage on specific products and periodic sitewide promotions
rather than basket value. `freeOverGbp: null` is correct; a threshold would
systematically understate its delivered price. Per-product free delivery belongs
on the offer, not the retailer.

---

## D8 — TikTok Shop is excluded by default, not badged

**Provisional** — flip `showUntrustedSellers` if you disagree.

Untrusted TikTok sellers are not rendered at all. A warning badge still gives a
counterfeit listing a shelf next to genuine stock, and the badge is doing more
work than a badge can do. The section is off entirely
(`TIKTOK_BETA_CONFIG.enabled === false`), the seller list is empty and manual,
and the whole thing lives in a separate file from the retailer registry so that
TikTok breaking cannot affect core comparison.

The seller list was left **empty rather than seeded**. Inventing plausible-looking
handles for a site whose entire value is authenticity would be worse than having
no list.

---

## Still open

These need numbers from you and are not answerable from the code:

| # | Question | Why it is blocking |
|---|---|---|
| 1 | Cache staleness floor (suggest 15 min) and monthly scraping budget | Together these set `N` in the stale-while-revalidate design. Without them, "update on every search" is an unbounded cost commitment. |
| 2 | Flash deal window — detected-within-N-hours, expiring-within-N-hours, or both | Changes the filter semantics. Suggest supporting both, defaulting `deal_detected_since` to 48h. |
| 3 | Decant sellers — in or out | They break the size axis and need their own condition handling. Leaning out for v1. |
| 4 | Selfridges free-delivery threshold: £100 or £150 | Sources conflict. Affects the delivered price for every Selfridges row. |

All twelve shipping rules are marked `unverified` and need confirming against
each retailer's own delivery page before the delivered-price sort is trusted in
production. `npm run shipping:staleness` lists them.

---

## D9 — Decants are out

**Decided 2026-08-01.** Decant sellers do not enter the price comparison, in any
form. They break the size axis: a 10ml decant of Aventus at £22 sitting beside a
100ml bottle at £284 is not a cheaper option, it is a different product, and any
sort that puts them in the same table is lying about what it is comparing.

### The idea that is still open

A separate main page section listing **trusted decant sellers ranked by their
Trustpilot rating**. This is a good instinct and it works precisely because it is
separate: it is a directory of sellers, not a price comparison of bottles, so
nothing has to be normalised against a 100ml.

If it gets built, three things decide whether it is worth doing:

1. **Trustpilot terms.** Scraping their ratings is against their terms of use.
   There is a Business API, but it generally serves a business its own reviews
   rather than letting a third party publish other companies' scores. Check what
   is actually permitted before designing around the number, because "ranked by
   Trustpilot" is not a feature you can quietly reverse once people rely on it.
2. **A rating is not authenticity.** A decanter with 4.8 stars for fast postage
   has not been verified as decanting genuine juice. If the section ships, the
   rating should be labelled as what it is, a service score, with authenticity
   handled separately or not claimed at all.
3. **Curated, like TikTok.** A hand kept seller list, not an open search. Same
   reasoning as `tiktokSellers.ts`: an open list of people selling decanted
   fragrance is how counterfeits reach the page.

Treat it as a sibling of the TikTok beta rather than part of the comparison: its
own table, its own flag, its own disclaimer, and a kill switch.
