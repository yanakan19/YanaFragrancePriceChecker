# Microcopy inventory — 2026-08-21

A report, not an edit. No copy was changed to produce this. It walks every
page type on the current site and lists every piece of descriptive or
explanatory text that isn't a label, a price, or a raw data value — the kind
of copy an owner might cull for a more minimal feel — with its exact wording
(or opening clause, for long paragraphs) and where it lives in the source.
Mark each row Keep or Cut yourself; nothing here has been acted on.

**Method.** Read `demo/app.ts` (5,013 lines) function by function for every
page-rendering view, plus `demo/legal.ts` in full for About/legal pages, on
the branch tip as re-cloned and built at the start of this session (commit
`8b7b1a1`, after this session's own `www.` bug fix and Trustpilot commits
landed). Line numbers are exact as of that commit; both are generated pages
in a single file, so a future edit anywhere above a given line will shift the
numbers below it — re-grep the quoted text if a line number stops matching.

Not included: button/control labels with no explanatory content ("Back",
"Save", "Sort brands"), aria-only text, and `demo/app.ts`'s `designView()` —
the internal design-system reference page, not a reader-facing page type.

**A Keep/Cut column is provided empty for the owner to fill in.**

---

## Home

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 1 | "by YannySniffs" | demo/app.ts:1051 | |
| 2 | "The only tool you need to find the best price on any fragrance." | demo/app.ts:1053 | |
| 3 | "Delivery Costs Reflected" / "Real and Live Prices" / "No Promoted Listings" (three value-prop chips) | demo/app.ts:1055-1057 | |
| 4 | "Got an idea?" (section heading) | demo/app.ts:1075 | |
| 5 | "Tell us what you would like to see. There is no server behind this page, so sending opens your own email app with this addressed and ready to go." | demo/app.ts:1076-1077 | |
| 6 | Placeholder "What should we add or change?" | demo/app.ts:1081 | |
| 7 | "(optional)" / "(optional, if you would like a reply)" (field hints) | demo/app.ts:1084, 1088 | |
| 8 | Placeholder "So we know who to thank" | demo/app.ts:1085 | |
| 9 | Placeholder "you@example.com" | demo/app.ts:1089 | |
| 10 | "Update History" (section heading) | demo/app.ts:1097 | |

## Browse (Most Stocked / search results / brand filter)

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 11 | "Ranked by how many of our {N} shops carry each one, then by brand and name where that ties. Oils are not listed here. This is stock breadth, not a measure of what sells: nothing here counts views or purchases, so it is never presented as if it did." | demo/app.ts:1157-1159 | |
| 12 | "The {N} most stocked fragrances, in the order you chose. Oils are not listed here." | demo/app.ts:1161-1162 | |
| 13 | "Nothing here matches that search." (empty state) | demo/app.ts:1169 | |

## Fragrance detail

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 14 | "Cheapest" / "Lowest total" / "Lowest item price" (price-box superlative, chosen by evidence) | demo/app.ts:1195-1198 | |
| 15 | "from {shop}, incl. delivery" | demo/app.ts:1792 | |
| 16 | "Too close to call: the {gap} gap to {shop} is smaller than the delivery charge we have not yet confirmed with {shop}." | src/services/deliveryConfidence.ts:177-180 | |
| 17 | "from {shop} — delivery not stated, so this is not a delivered price" | demo/app.ts:1810 | |
| 18 | "Sold out everywhere" / "no shop has it in stock right now" | demo/app.ts:1812 | |
| 19 | "delivery included where the shop states it" / "delivery included" | demo/app.ts:1825-1826 | |
| 20 | "Delivery not stated" (offer row) | demo/app.ts:1224 | |
| 21 | "Free delivery (not confirmed with the shop)" | demo/app.ts:1226 | |
| 22 | "plus {£X} delivery (not confirmed with the shop)" | demo/app.ts:1227 | |
| 23 | "{£X} more for free postage" | demo/app.ts:1230 | |
| 24 | "Available at" / "Sold out" / "Not available" (offer-group headings) | demo/app.ts:1818, 1834, 1843 | |
| 25 | "Price history" (section heading) | demo/app.ts:1504 | |
| 26 | "Not enough recorded prices in this range" (disabled-tab tooltip) | demo/app.ts:1492 | |
| 27 | "No price recorded, {date}" (no-data dot label) | demo/app.ts:1593 | |
| 28 | "unchanged since {date}" (carried-price dot label) | demo/app.ts:1612 | |
| 29 | "Notes unavailable for this fragrance." | demo/app.ts:1658 | |
| 30 | "As published by the retailer listing it." | demo/app.ts:1679 | |
| 31 | "Sign in to save" (wishlist button, signed out) | demo/app.ts:1742 | |
| 32 | "Saved" / "Save" (wishlist toggle) | demo/app.ts:1747 | |

## Brand

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 33 | "Official site not yet confirmed" (fallback when no verified brand site) | demo/app.ts:2206 | |
| 34 | "Sells direct in the UK, and its own price is compared below like any other shop's." | demo/app.ts:2208-2210 (enabled branch) | |
| 35 | "Sells direct in the UK, but its delivery terms are not confirmed yet, so its price is not compared." | demo/app.ts:2208-2211 (disabled branch) | |
| 36 | "Nothing from this brand has been harvested yet." (empty state, two call sites) | demo/app.ts:2224, 2226 | |
| 37 | "{N} direct from {brand}" / "not part of the UK comparison" (house-products section) | demo/app.ts:2231-2232 | |
| 38 | "No brands match that filter yet." (Brands tab empty state) | demo/app.ts:1877 | |

## Retailer

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 39 | "Delivery not stated. This shop publishes no standard delivery cost, so its prices here are item prices only and it is never ranked as cheapest" | demo/app.ts:2003 | |
| 40 | "Delivery not stated. We have not established this shop's standard delivery cost, so its prices here are item prices only and it is never ranked as cheapest" | demo/app.ts:2004 | |
| 41 | "Free standard delivery on every order" | demo/app.ts:2006 | |
| 42 | "Read from this shop's own delivery page on {date}" | demo/app.ts:2014 | |
| 43 | "Confirmed against this shop's own delivery page" | demo/app.ts:2015 | |
| 44 | "Not yet confirmed with the shop. These delivery terms came from research, not from their own delivery page" | demo/app.ts:2016 | |
| 45 | "Free once you spend {£X}" / "No spend based free delivery" | demo/app.ts:2019, 2021 | |
| 46 | "Arrives in about {N} working days" / "Arrives in about {N} to {M} working days" | demo/app.ts:2024 | |
| 47 | "Nothing from this shop matches that filter." (empty state) | demo/app.ts:2157 | |
| 48 | Long doc-comment explaining why brand-direct shops are excluded from the Retailers directory — not reader-facing, listed for completeness only | demo/app.ts:2043-2056 | n/a |

## Note

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 49 | "No notes recorded for that layer yet." | demo/app.ts:2311 | |
| 50 | "Only notes a shop has explicitly published. {N} of {M} fragrances list them." | demo/app.ts:2339 | |
| 51 | "Fragrances listing {note}" / "as a {layer} note" (note detail sub-heading) | demo/app.ts:2387 | |
| 52 | "Nothing matches that filter." (note detail empty state) | demo/app.ts:2389 | |

## Search

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 53 | Placeholder "Search by brand, name or concentration" | demo/app.ts:2413 | |
| 54 | "Type to search all {N} fragrances." (pre-query empty state) | demo/app.ts:2400 | |
| 55 | "Filtered to {brand}." (search-scoped-to-brand note) | demo/app.ts:2418 | |
| 56 | "Nothing matches that search." | demo/app.ts:2405 | |

## Deals

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 57 | "No shop is publishing a reference price right now." | demo/app.ts:1939 | |
| 58 | "No discounted fragrance has a shop-licensed photo right now." | demo/app.ts:1942 | |
| 59 | "No deal matches that filter." | demo/app.ts:1945 | |
| 60 | "Savings are against the shop's own published recommended retail price." | demo/app.ts:1956 | |

## About

The About page (`demo/legal.ts:80-106`) is the longest single piece of
descriptive copy on the site — twelve paragraphs of first-person prose under
five subheadings, several sentences long each. Logged here as one row per
paragraph/section rather than word-for-word (all are well over the "long"
threshold); every figure inside them is computed from the live registry and
catalogue at load time, not typed by hand (see the file's own header
comment), so the *numbers* are not candidates for cutting even where the
*prose carrying them* might be.

| # | Text (opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 61 | "PriceSniffs tells you what a bottle of fragrance actually costs across {N} UK shops, delivery included..." | demo/legal.ts:86 | |
| 62 | "Hi, I am Yanny." | demo/legal.ts:87 | |
| 63 | "This started because I kept getting caught out. I bought a 100ml bottle of Club de Nuit..." | demo/legal.ts:88 | |
| 64 | "So I spent five days building the thing I wanted to use..." | demo/legal.ts:89 | |
| 65 | "What it does" (subheading) + "Prices are checked every two hours, so 12 times a day..." | demo/legal.ts:90-91 | |
| 66 | "Delivery terms sit on a slower clock than prices do..." | demo/legal.ts:92 | |
| 67 | "That gap between Boots and Harvey Nichols is the whole point..." | demo/legal.ts:93 | |
| 68 | "Which delivery charges we have actually checked" (subheading) + "Of the {N} shops switched on today..." | demo/legal.ts:94-95 | |
| 69 | "That matters because delivery decides the ranking..." | demo/legal.ts:96 | |
| 70 | "Being straight with you" (subheading) + "If we do not know something, we say so instead of filling the gap with a guess..." | demo/legal.ts:97-98 | |
| 71 | "Nothing here is a paid placement. No shop buys its way up..." | demo/legal.ts:99 | |
| 72 | "About the photos" (subheading) + "Every product photo loads straight from the shop's own website..." | demo/legal.ts:100-101 | |
| 73 | "Finding what you want" (subheading) + "Filter by bottle size, by strength, by price bracket..." | demo/legal.ts:102-103 | |
| 74 | "Say hello" (subheading) + "I post about fragrance on TikTok and Instagram as yannysniffs..." | demo/legal.ts:104-105 | |

## Settings

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 75 | "Your preference will be remembered on this device." | demo/app.ts:2523 | |
| 76 | Placeholder "Tell us what is going on" (contact form) | demo/app.ts:2535 | |
| 77 | "© {year} {company}." (footer legal line) | demo/app.ts:2558 | |

## Account (reached from Settings; not in the owner's named list, logged for completeness)

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 78 | "Accounts are not switched on for this deployment yet. Check back soon." | demo/app.ts:2587 | |
| 79 | "Loading." (account page) | demo/app.ts:2592 | |
| 80 | "Loading." (wishlist section, before it loads) | demo/app.ts:1688 | |
| 81 | "Nothing saved yet. Tap Save on a fragrance to add it here." | demo/app.ts:1695 | |
| 82 | "Signed in as {email}." | demo/app.ts:2602 | |
| 83 | "We sent a link to {email}. Follow it to finish setting up your account, then come back here." | demo/app.ts:2614-2616 | |
| 84 | "If that address has an account, a reset link is on its way." | demo/app.ts:2662 | |

## Other legal/policy pages (not in the owner's named list, logged for completeness)

Full text of these five pages already lives in `demo/legal.ts:107-353`
(How PriceSniffs Works, Affiliate disclosure, Privacy notice, Terms of use,
Contact and feedback) — each several paragraphs under subheadings, in the
same first-person, plain-language house style as About. Not reproduced
paragraph-by-paragraph here since these are policy documents the owner is
unlikely to want trimmed for a "minimal feel" pass the way marketing/hero
copy would be, but flagged in case the pass is meant to reach them too.

| # | Page | File:line | Keep/Cut |
|---|---|---|---|
| 85 | How PriceSniffs works (5 sections) | demo/legal.ts:108-153 | |
| 86 | Affiliate disclosure (3 sections) | demo/legal.ts:156-181 | |
| 87 | Privacy notice (9 sections) | demo/legal.ts:184-274 | |
| 88 | Terms of use (8 sections) | demo/legal.ts:277-333 | |
| 89 | Contact and feedback (2 sections) | demo/legal.ts:336-352 | |

## Not found (reached from any dead link; not in the owner's named list, logged for completeness)

| # | Text (or opening clause) | File:line | Keep/Cut |
|---|---|---|---|
| 90 | "Nothing on this site answers to {address}. It may have been a fragrance or a shop that has since been delisted." | demo/app.ts:2692-2694 | |
| 91 | "Search the catalogue, or start from one of these:" | demo/app.ts:2695 | |

---

## Summary

91 instances catalogued across 11 page groupings (the owner's nine named
types plus Search, Account, Not found, and the other legal pages, logged for
completeness). The heaviest concentrations are the About page (14 rows, all
first-person narrative prose) and the fragrance-detail page (19 rows, mostly
short explanatory fragments tied to delivery/price confidence rather than
marketing copy). Nothing has been changed; this file is the input to the
owner's own Keep/Cut pass.
