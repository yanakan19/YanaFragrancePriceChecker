# Product image pipeline

How a photo gets from a retailer's own server onto a PriceSniffs tile, why it
is never copied, where it breaks, and what to do about the breakage. Written
against the code as it stands and the real CI run of 2026-08-04
(`data/image-link-report.json`).

**Scope note on how this was researched.** This sandbox blocks outbound
connections to retailer and CDN domains (the proxy 403s on CONNECT), so
nothing here was verified by actually fetching a live image. Every claim below
is either read directly off the repo (code, checked-in data, the real
`image-link-report.json`) or marked as a hypothesis that needs a CI run to
confirm. Nothing was fabricated to fill a gap — where the evidence runs out,
this says so.

---

## 1. Architecture: where a URL comes from and where it can die

There is no image storage anywhere in this project. `imageUrl` is a string
that is copied from a source payload into the catalogue and, eventually, into
an `<img src>` attribute. Three sources feed it, and each has its own break
points.

### 1a. Sitemap walk → JSON-LD `image` (UK retailers)

```
retailer PDP  --HTTP GET-->  schema.org/Product JSON-LD  --parse-->  imageUrl
```

This is the `json-ld` / `headless` / `proxied` adapter path in
`src/types/retailer.ts`. The harvester reads whatever URL the retailer's own
`Product.image` field contains and stores it verbatim in
`data/catalogue/<retailer>.json` as `listing.imageUrl`. Nothing about the URL
is validated, normalised, or resolved to an origin at harvest time — it is
carried as-is.

**Break points:**
- Retailer changes their PDP template and stops emitting `image`, or emits a
  relative path this project's parser does not resolve to absolute (not
  observed in the current report, but nothing here guards against it).
- Retailer reshuffles their CDN (new bucket, new path convention, CDN
  migration) and the old URL 404s. This is the ordinary way a hot-linked image
  dies and there is no way to detect it except polling the URL later.
- Retailer's CDN or WAF blocks the requester (bot mitigation, geofencing,
  referer checks) — indistinguishable from a dead link without deeper probing
  (see §4).

### 1b. Shopify `/products.json` → `images[].src` (houses, and some retailers)

```
storefront /products.json  --parse (src/catalogue/shopifyJson.ts:imageOf)-->  imageUrl
```

`imageOf()` (`src/catalogue/shopifyJson.ts:133`) takes the *first* image in
the product's `images[]` array and nothing else — no fallback to a variant's
own `featured_image`, no second choice if the first entry is missing a `src`.
This is the route for the Middle Eastern houses (Armaf, French Avenue — see
`data/houses/*.json`, both `cdn.shopify.com/s/files/...`) and also for at
least three UK retailers whose storefronts happen to run Shopify
(`allbeauty.com/cdn/shop/files/...`, `www.beautybase.com/cdn/shop/files/...`,
`www.justmylook.com/cdn/shop/files/...`).

**Break points:** same CDN-churn and bot-mitigation risks as 1a, plus:
a product can exist with an empty `images[]` (out of stock, photography not
yet uploaded) and `imageOf` correctly returns `null` for it — that is not a
break, that is the "no photo yet" state working as designed.

### 1c. Affiliate feed → feed's own image field (Fragrance Click)

```
Awin merchant feed  --field mapping-->  imageUrl (fragranceclick.co.uk/media/catalog/product/...)
```

Only one retailer runs this route today. The feed is a Magento-style catalog
export; the image path has no size parameters (`?width=` etc. are absent),
unlike the Shopify and THG routes — see §3 for what that costs.

### From `imageUrl` to the page

Regardless of source, every `imageUrl` funnels through one of two identical
but separately-implemented rendering paths:

| Path | Function | File |
|---|---|---|
| UK retailer catalogue tiles/hero | `productArt()` | `demo/photo.ts:63` |
| House storefront cards | inline `<img>` | `demo/app.ts:1002` |

**This is a real inconsistency worth flagging**, not treating as fine: the
house card path does not carry `decoding="async"` or `referrerpolicy`, both of
which `productArt()` sets. It is the same kind of hot-linked `<img>` doing the
same job for a different data source, and it should get the same attributes
(see §3's snippet). Nothing catastrophic follows from the gap today — no
observed incident traces to it — but it is drift, and drift in a two-path
system is exactly how one path quietly falls behind the other's fixes.

### The licensing gate — where a URL is allowed to reach the page at all

Having an `imageUrl` does not mean it gets shown. `scripts/build-demo-catalogue.ts`
computes:

```ts
const IMAGE_LICENSED = new Set(
  RETAILERS.filter((r) => r.affiliate.imageUsageConfirmed === true).map((r) => r.id),
);
...
imageUrl: IMAGE_LICENSED.has(l.retailerId) ? l.imageUrl : null,
```

Today exactly **one** UK retailer has `imageUsageConfirmed: true` —
Fragrance Click, and only because someone actually read that merchant's Terms
tab in the Awin dashboard (`src/config/retailers.ts:531`, comment quotes the
clause). Every other UK retailer's photo is discarded at build time and the
product renders the "NO IMAGE AVAILABLE" SVG mark instead
(`demo/photo.ts:43`), never a placeholder photo, never a stand-in stock image
— the type comment in `src/types/retailer.ts:94-109` is explicit that a
product is in exactly one of two states, licensed photo or no photo, "never a
third invented one."

**The gate does not apply to houses.** `HouseProduct.image` in
`build-demo-catalogue.ts:390` is set unconditionally from `l.imageUrl`, with
no `IMAGE_LICENSED` check — the comment there reads "a house's own photography
of its own bottle, hot-linked exactly like every other image here." That
asymmetry is deliberate and, on its face, legally sound: Armaf showing its own
photo of its own product needs no third-party licence, so there is nothing for
a `imageUsageConfirmed`-style flag to confirm. But it is worth naming
explicitly rather than leaving implicit, because it means two different legal
bases are living behind one `image: string | null` field shape, gated by two
different code paths that happen to look similar. A reviewer skimming
`build-demo-catalogue.ts` should not have to rediscover this from first
principles.

**A stale legal claim this surfaced.** `docs/LEGAL.md` and the live terms text
in `demo/legal.ts:219-220` currently say: *"The bottle images on this site are
our own drawings. They are not photographs supplied by any brand."* That was
true when written and is no longer true — Fragrance Click's real photography,
and both houses' real photography, are live on the site today, hot-linked
exactly as this document describes. `docs/LEGAL.md` already flags this as an
open item ("When real feed imagery replaces them, that clause must change"),
but it has not been actioned. **This is a live discrepancy between what the
Terms of Use say and what the app does, and closing it is a documentation/copy
fix, not an image-pipeline change** — noted here because this investigation is
what surfaced it, not because fixing it is this document's job.

---

## 2. Should hot-linking stay? Yes — with eyes open

### What hot-linking buys

- **Zero storage/bandwidth cost.** The entire site is one static HTML file on
  GitHub Pages (`docs/DEPLOYMENT.md`). There is no server to run an image
  proxy or resize pipeline from, and no budget line for CDN egress. Every
  image byte a visitor sees is served and paid for by the retailer, not this
  project.
- **No copyright copy exists.** This is the sharper point, and it is why
  `imageUsageConfirmed` is written the way it is (`src/types/retailer.ts:94-109`):
  a hot-link is a *reference* to the retailer's photo, not a reproduction of
  it. Downloading and rehosting the same JPEG would be making a copy of
  someone else's copyrighted product photography, which needs its own
  licence regardless of whether the *display* of it is licensed. Never making
  the copy is what keeps the compliance question to "may we display this,"
  rather than adding "and did we have the right to duplicate the file."
- **Always current, until it isn't.** A hot-link to the retailer's live CDN
  path shows whatever photo the retailer currently has up — new packaging, a
  reshoot, a corrected image — with zero effort on this project's side. The
  failure mode of that same property is §2's next paragraph.

### What it costs

- **Referrer/hotlink protection.** Some CDNs actively block requests whose
  `Referer` header doesn't match an allow-list (their own site). This project
  already defends against the *opposite* problem — leaking the *user's*
  browsing to the retailer, not being blocked — via `referrerpolicy="no-referrer"`
  in `productArt()`. That is the right privacy choice, but it means if a CDN
  ever starts requiring a referer to serve the image, this project cannot
  supply one without abandoning the privacy protection. No evidence in the
  current report that anyone is doing this today (see §4 — the observed
  failures don't look like referer blocks), but it is a real risk class, not a
  hypothetical one, for any hot-linking strategy.
- **CDN churn.** Documented directly in `scripts/image-link-check.ts`'s own
  header comment: "the retailer reshuffles their CDN, deletes the product, or
  changes the path, and the tile silently starts rendering a broken image."
  This is not a risk to hedge against, it is an ongoing fact the health check
  exists to surface.
- **Layout shift** would ordinarily be a real cost of not controlling the
  source image's dimensions — but it is already mitigated here: both render
  paths reserve a fixed CSS box (`aspect-ratio: 1 / 1` on the container,
  `object-fit: contain` on the `<img>`) before any image bytes arrive, so an
  unpredictably-sized retailer photo never shifts the page. See §3 for the
  confirmed detail.
- **Privacy: user IP leaks to the retailer on every page view.** Loading an
  `<img src>` from `www.beautybase.com` means the visitor's browser makes a
  direct connection to Beauty Base's CDN, which sees the visitor's IP,
  User-Agent, and (absent the current `referrerpolicy="no-referrer"`) would
  see that they came from pricesniffs.space and which product they were
  looking at. `referrerpolicy="no-referrer"` already suppresses the
  second-order leak (which page, which product) but the IP-level connection
  to a third party is inherent to hot-linking and cannot be suppressed without
  a proxy — which is exactly the rehosting-with-cost tradeoff §5 evaluates.
  Worth naming plainly in a privacy notice; `docs/LEGAL.md` does not currently
  mention third-party image hosts as a data-sharing category, which is arguably
  a gap the eventual "real feed imagery" legal-copy fix (above) should close
  too.
- **No control over availability.** If a retailer's CDN has an outage, is
  slow, or geoblocks the visitor's country, that failure is invisible to this
  project until a user reports a blank tile or the next scheduled
  `images:check` run catches it — which, per the daily workflow, is once a
  day at most.

### Recommendation

**Keep hot-linking. Do not rehost.** The zero-cost, zero-copy properties are
not just conveniences, they are what makes the `imageUsageConfirmed` gate a
tractable compliance model at all — the whole reason that gate can be a
boolean rather than a licence-terms parser is that the only thing being
licensed is *display*, never *reproduction*. Rehosting even one retailer's
photos would mean re-deriving the legal analysis for that retailer from
scratch (see §5), for a benefit — resilience to CDN churn — that can mostly be
bought more cheaply with the resilience techniques in §3 and the false-failure
fix in §4.

---

## 3. Caching and resilience, without rehosting

None of this downloads or alters a single byte of a retailer's image. It is
all attribute-level hardening of the existing `<img>` tags.

### Already in place (`demo/photo.ts:68-71`)

```html
<img class="art-img" src="..." alt="..."
  loading="lazy" decoding="async" referrerpolicy="no-referrer" />
```

- `loading="lazy"` — defers off-screen images, cutting the number of
  simultaneous hot-link requests a page load fires at retailer CDNs (also
  politeness towards the CDNs this project doesn't control).
- `decoding="async"` — decode work doesn't block the main thread.
- `referrerpolicy="no-referrer"` — the privacy protection described in §2.

The house-card path (`demo/app.ts:1002`) has **none of these three**. Same
recommendation applies to it as to any new `<img>` here: match `productArt()`'s
attribute set.

### Status of each remaining technique

**1. Explicit `width`/`height` or `aspect-ratio`, to kill layout shift —
already done, confirmed by reading `demo/index.html`'s stylesheet.** Both
rendering paths already reserve a fixed box before the network response
lands, via CSS rather than per-image `width`/`height` attributes:

```css
/* demo/index.html:452-453, 469 — the retailer tile path */
.art { aspect-ratio: 1 / 1; ... }
.art-img { width: 100%; height: 100%; object-fit: contain; }

/* demo/index.html:1022-1025 — the house-card path */
.house-img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; ... }
```

Since the container is fixed-size and the `<img>` fills it at `100%/100%`
with `object-fit: contain`, the source image's own intrinsic dimensions never
matter to layout — a 400×400 photo, a 600×800 photo, and a slow-loading image
all reserve the identical box the instant CSS applies, before any bytes of
the image itself arrive. No further work needed here; this section is
recorded so a future change to either stylesheet block doesn't accidentally
regress it.

**2. `onerror` fallback to the placeholder mark.** Nothing today rewires a
`<img>` that fails to load back to the "NO IMAGE AVAILABLE" SVG — a dead
hot-link today just renders the browser's broken-image icon inside the tile.
`scripts/image-link-check.ts`'s own header comment says as much: "wiring a
broken link into demo/photo.ts's 'no image available' placeholder is a
follow-up, not done here." Since the whole page is one generated static HTML
file with no client-side framework, the cheapest fix is a same-markup inline
handler rather than a new JS module:

```html
<img class="art-img" src="${escapeAttr(photoUrl)}" alt="${escapeAttr(label)}"
  loading="lazy" decoding="async" referrerpolicy="no-referrer"
  onerror="this.replaceWith(/* the noImageMark(size) SVG string, inlined */)" />
```

In practice this means `productArt()` should emit the `noImageMark(size)`
markup as a sibling `<template>` (or inline it into the `onerror` string
directly, escaped) so a failed load swaps to *exactly* the same visual state
as a genuinely absent photo — same box, same accessible label — never a
generic browser broken-image glyph. This is a one-file change confined to
`demo/photo.ts` and does not touch data or licensing.

**3. `srcset` where the CDN already exposes a size parameter.** Two of the
three source families already carry resize params in the URLs that are
already in the catalogue today — nothing new to source, only a template to
build:

- **Shopify (`?width=`)** — every Shopify-backed source in the current data
  (`allbeauty.com/cdn/shop/files/...`, `beautybase.com/cdn/shop/files/...`,
  `cdn.shopify.com/s/files/...` for the houses) already carries `&width=1920`
  or similar. A `srcset` can be built by swapping that one query param:
  ```html
  <img src="https://…/file.jpg?v=…&width=600"
       srcset="https://…/file.jpg?v=…&width=300 300w,
               https://…/file.jpg?v=…&width=600 600w,
               https://…/file.jpg?v=…&width=1200 1200w"
       sizes="(max-width: 480px) 150px, 300px" ... />
  ```
  This is a pure string-substitution on the query param this project already
  stores — no new fetch, no new licence question (still the same CDN, same
  URL family, just a different `width` value the retailer's own image server
  already understands and already serves for other consumers of that
  storefront).
- **THG (`?format=webp&width=&height=&fit=`)** — `lookfantastic`'s
  `main.thgimages.com/?url=…&format=webp&width=1500&height=1500&fit=cover`
  is a full image-proxy service, not a bare CDN; `width`/`height` are proxy
  parameters, same substitution approach applies.
- **Fragrance Click's Magento feed path
  (`fragranceclick.co.uk/media/catalog/product/...`) has no size parameters
  at all** — no `srcset` is possible there without a second, differently-sized
  URL the feed itself would have to supply. Since this is the one retailer
  actually licensed to display photography today, that is a real, load-bearing
  gap, not a nice-to-have: this is the retailer that matters most for `srcset`
  and the one it cannot currently be built for. Worth raising with the Awin
  feed mapping (`docs/AFFILIATE_SETUP.md`) — does the feed carry a
  `image_small`/`image_large` pair anywhere that isn't currently mapped in?
  Unknown from this repo alone.

None of the above alters, crops, re-encodes or watermarks the image itself —
`?width=` and `?format=webp` are the retailer's own CDN doing its own resizing
of its own asset on request, the same as if a browser navigated there
directly. It is not a transformation this project performs.

---

## 4. The 78 failures: what's real, what's noise

`data/image-link-report.json` (2026-08-04T19:44:48Z, 2142 URLs checked, 78
broken) breaks down like this by retailer:

| Retailer | Broken | Retailer's `data/catalogue/*.json` `source` |
|---|---:|---|
| beautybase | 20 | `live` |
| boots | 9 | `fixtures` |
| notino-uk | 9 | `fixtures` |
| john-lewis | 8 | `fixtures` |
| selfridges | 7 | `fixtures` |
| the-fragrance-shop | 7 | `fixtures` |
| the-perfume-shop | 7 | `fixtures` |
| superdrug | 6 | `fixtures` |
| harvey-nichols | 4 | `fixtures` |
| justmylook | 1 | `live` |

**57 of the 78 (73%) are not real failures at all — they're fixture data.**
Every one of those eight retailers' catalogue files is checked in with
`"source": "fixtures"`, and their URLs are placeholders that were never real
CDN paths to begin with — e.g. `https://boots.com/images/boo-sauvage.jpg` (bare
apex domain, not `www.boots.com`; a made-up filename, not anything a real
Boots PDP would emit). These retailers all run the `proxied` adapter
(`src/config/retailers.ts`) — Boots, Notino, John Lewis, Selfridges, The
Fragrance Shop, The Perfume Shop, Superdrug, Harvey Nichols all show
`adapter: 'proxied'` or `'unknown'` — meaning they refuse a datacentre address
outright and have never actually been harvested live (`docs/SPIKE-RESULTS.md`
records the 0% live success rate against these). Their catalogue files remain
seed/fixture stubs pending a residential-proxy or affiliate-feed route.

`scripts/build-demo-catalogue.ts` already knows to ignore fixture data — its
very first filter is `if (snapshot.source !== 'live') continue;` — so **none
of these 57 broken URLs can ever reach a real page.** They are not a
resilience risk to a visitor. They are noise in the health-check report,
caused by `scripts/image-link-check.ts` reading every file under
`data/catalogue/*.json` indiscriminately, with no `source === 'live'` filter
matching the one `build-demo-catalogue.ts` already applies.

**Concrete fix:** teach `image-link-check.ts` the same filter:

```ts
const data = JSON.parse(readFileSync(resolve(catalogueDir, file), 'utf8')) as CatalogueFile;
if (data.source !== 'live') continue;   // fixtures were never real URLs
```

(`CatalogueFile`'s interface in that script would need a `source` field added
to read it — currently only `retailerId` and `listings` are typed.) This one
change removes 57 of 78 entries from the next report and makes the remaining
count an honest measure of live-link health.

### The real 21: beautybase (20) and justmylook (1)

Both are `source: "live"` retailers, both are Shopify-backed
(`cdn/shop/files/` paths), and every one of the 21 failures has the *same*
error shape: `"TypeError: fetch failed"` for beautybase (all 20), and the
identical error for the one justmylook URL — not an HTTP status, a
network-level failure caught before any response arrived. Two other error
shapes appear in the fixture noise but not here: `403` (bot-mitigation
response with a body) and `404`/`AbortError` (also fixture noise, John
Lewis's `AbortError` cluster is the 15s timeout firing against a domain that
was never live to begin with).

**Working hypothesis on `TypeError: fetch failed` (UNVERIFIED — needs a CI run
against the real domains to confirm, which this sandbox cannot do):**

`checkOne()` in `scripts/image-link-check.ts:63-86` sends *no headers at
all* beyond the implicit ones Node's `fetch` adds — no `User-Agent`, no
`Accept`, no `Referer`. A bare `fetch()` from Node/undici typically identifies
itself with a generic or absent User-Agent, which is exactly the fingerprint a
storefront's bot-mitigation layer (Shopify itself, or a Cloudflare layer in
front of it) uses to drop the *connection* rather than answer with an HTTP
status — which is precisely what surfaces in Node as `TypeError: fetch
failed` wrapping a lower-level `ECONNRESET`/socket error, rather than as a
`403` with a body (contrast with the `403`s seen against `superdrug.com`,
`theperfumeshop.com` etc. in the fixture set, which are real HTTP responses
from a WAF that *did* answer).

Three plausible causes exist, and all three predict the same observed
symptom, so the report alone cannot distinguish them:

1. **Bot-mitigation on missing headers** (User-Agent/Accept) — most likely
   given all 21 failures share one domain family (Shopify) and one error
   shape.
2. **Rate limiting from the check's own concurrency** — `CONCURRENCY = 8`
   means up to 8 simultaneous requests to a handful of retailer origins.
   Beautybase alone contributed 20 of the checked URLs; if several of its 8
   concurrent slots landed on beautybase.com in the same window, a per-IP or
   per-minute rate limit on that storefront could plausibly answer with a
   connection reset rather than a `429` once tripped. This is the task's
   stated working hypothesis and is **not ruled out**, but is not obviously
   *more* likely than (1) from the evidence alone — a WAF blocking a
   suspicious User-Agent produces the identical externally-visible symptom.
3. **Genuinely dead links** — the least likely of the three given 20 URLs on
   one domain failing identically and simultaneously (a batch of genuinely
   dead links from one CDN, all failing with a network error rather than a
   404, would be an unusual coincidence — a 404 is what a CDN normally returns
   for a path that no longer exists, not a connection reset).

**How to actually tell these apart (concrete, runnable on a CI machine with
open egress — cannot be run from this sandbox):**

- **Add a realistic `User-Agent` and `Accept: image/*` header** to `checkOne`'s
  fetch calls and re-run. If the beautybase/justmylook failures disappear,
  that confirms (1) and rules out (2)/(3) — a rate limit or a dead link would
  not care about the request's headers.
- **Re-check just the 21 failed URLs, serially (concurrency 1), with a delay
  between requests, some time after the full 2142-URL run finishes** (e.g. the
  next scheduled run, or a manual one-off). If they resolve fine in isolation,
  that is strong evidence for (2) — the bulk run's concurrency or aggregate
  request volume tripped something that clears once the pressure is gone. If
  they still fail identically alone, that rules out simple rate-limiting and
  points back to (1) or (3).
- **Capture `err.cause`, not just `String(err)`.** The script currently
  truncates the error to `String(err).slice(0, 160)`
  (`scripts/image-link-check.ts:82`), which is enough to see the outer
  `TypeError: fetch failed` but discards the wrapped cause (undici typically
  attaches a `cause` with the real socket-level reason — `ECONNRESET`,
  `ETIMEDOUT`, `ECONNREFUSED`, or a TLS error each imply a different root
  cause). Logging `err.cause?.code ?? err.cause` alongside the message would
  make the next report self-diagnosing without needing a second run.
- **A genuinely dead link should also fail from a browser**, which this
  sandbox cannot check but a maintainer with open egress can: open one of the
  20 beautybase URLs directly. A real 404 there settles (3) outright.

None of these fixes have been applied to the script in this pass — this
document specifies them; it does not implement them, since implementing and
re-running against blocked domains would produce results this sandbox cannot
verify.

---

## 5. If hot-linking ever becomes untenable: cost-free rehosting options

Only relevant if a retailer's CDN starts reliably blocking this project
specifically (not the transient failures in §4), or the false-failure noise
in §4 turns out, after the header/isolation tests above, to be genuine and
persistent breakage this project cannot fix from its own side. **The
licensing question comes first, every time — it is not a detail to check after
picking a hosting option.**

### The legal point, stated plainly

Hot-linking a `<img src>` to a retailer's own CDN is *displaying a reference*
to their file. Downloading that file and serving the bytes from
`pricesniffs.space` — regardless of which free host does the serving — is
*making and distributing a copy* of the retailer's copyrighted product
photography. Those are different acts under copyright law, and the second one
needs its own permission even where the first is already licensed. This is
exactly why `imageUsageConfirmed` is worded the way it is
(`src/types/retailer.ts:94-108`): it records confirmation of *display* rights
("publishers may not... hard code the creative into their sites" — quoted from
Fragrance Click's own Terms, `src/config/retailers.ts:526-527`), which the
current architecture satisfies by construction because nothing is ever hard
coded — every image is a live reference. **Rehosting would violate the exact
clause that confirmation was read against**, for the one retailer that has
actually been checked, and would be an *unresearched* violation for every
other retailer whose `imageUsageConfirmed` is unset. Any rehosting plan is a
new licensing conversation per retailer, not a technical migration.

With that ordering established, here is what each free option would cost
technically, for the retailers where a licence to duplicate the file was
separately obtained:

| Option | Cost | Storage limit | Bandwidth limit | Licensing implication |
|---|---|---|---|---|
| **GitHub Pages** (current host) | Free | Soft ~1GB repo guidance, no hard enforced cap found in this research — **unverified, needs GitHub's current docs, not assumed here** | Soft ~100GB/month guidance, same caveat | Committing retailer JPEGs into this git repo is an explicit, permanent copy in version-control history — the single least reversible form of "hard coding the creative" the Fragrance Click clause explicitly forbids. Worst option on the licensing axis even though it is the "already there" option technically. |
| **jsDelivr on GitHub** | Free (fronts any public GitHub repo as a CDN) | Same as GitHub Pages, since it serves out of a GitHub repo | jsDelivr's own free-tier fair-use policy — **unverified specifics, needs jsDelivr's current terms, not assumed here** | Same problem as GitHub Pages: jsDelivr does not remove the requirement to first commit the file into a repo it fronts. It only ever solves a bandwidth/edge-caching problem, never the "do we have the right to hold a copy" problem. |
| **Cloudflare (free tier — Pages/Workers/Images/R2)** | Free tier exists for each, with real limits — **specific current numbers unverified, needs Cloudflare's current pricing page, not assumed here** | Varies by product | Varies by product | Same problem again: any of Cloudflare's free products that *cache* rather than *proxy* a retailer's own live URL (e.g. Cloudflare Images ingesting and storing a copy) makes a duplicate. A Cloudflare Worker configured as a pure *reverse proxy* — fetching the retailer's live URL on each request and streaming it through, never storing it — is closer to hot-linking in spirit (still a live reference, not a copy) but adds a server-shaped component this project's static-HTML architecture does not otherwise have, and does not remove the referrer-leak/availability risks in §2, only relocates them from the retailer's CDN to Cloudflare's edge. |

**The only version of "rehosting" that does not immediately fail the
licensing test is a true reverse proxy that never persists a copy** — fetch
on demand, stream through, discard — and even that only helps with the
CDN-hotlink-protection risk in §2 (proxy fetches server-to-server, no browser
Referer to block), not with the "may we display this at all" question, which
remains exactly as gated by `imageUsageConfirmed` as it is today. It also
reintroduces a live server dependency this project has deliberately avoided
(`docs/DEPLOYMENT.md`: "There is no server"), trading a static-file deployment
model for an edge-compute one, for a benefit that only matters if §4's
false-failure investigation concludes the beautybase-class failures are real
and persistent rather than a header/rate-limit artefact.

**Recommendation:** do not build any of this now. Fix the header/User-Agent
gap and the fixture-noise filter in §4 first — both are cheap, both are
concrete, and both may fully explain the current 78-broken number without
touching the hosting model at all. Revisit rehosting only if a specific
retailer's images become reliably, persistently unservable through a plain
hot-link *and* that retailer's own terms are separately confirmed to permit a
cached copy — which is a different, harder confirmation than
`imageUsageConfirmed` currently performs.

---

## Summary of concrete, unimplemented recommendations

Nothing in this document has been coded — it is a specification, per the
brief. In priority order:

1. **`scripts/image-link-check.ts`: filter to `source === 'live'`** before
   checking, matching `build-demo-catalogue.ts`'s own rule. Removes 57 of the
   78 currently-reported failures, all of which are fixture placeholder URLs
   that can never reach a real page.
2. **Add a `User-Agent`/`Accept` header to the health-check's fetch calls**
   and re-run, to test the leading hypothesis for the remaining 21
   (beautybase/justmylook) failures.
3. **Log `err.cause`, not just the outer error string**, so the next report is
   self-diagnosing between a network-level reset and an HTTP-level rejection.
4. **Re-check the 21 real failures in isolation** (concurrency 1, some time
   after the bulk run) to separate a rate-limit artefact from a persistent
   block.
5. **Add `onerror` fallback to the placeholder mark** in `demo/photo.ts`'s
   `productArt()`, and bring `demo/app.ts`'s house-card `<img>` up to the same
   `loading`/`decoding`/`referrerpolicy` attribute set `productArt()` already
   has.
6. **Build `srcset` for the Shopify- and THG-sourced images**, using the
   `?width=` / `?format=webp&width=&height=` parameters already present in
   stored URLs — pure string substitution on data already in hand, no new
   fetch.
7. **Flag to whoever owns `docs/LEGAL.md`/`demo/legal.ts`** that the
   "our own drawings, not photographs supplied by any brand" clause is now
   false for Fragrance Click and both houses, and needs updating before it is
   read as an accurate representation of what the site does — `docs/LEGAL.md`
   already names this as an open item, it just hasn't happened yet.

None of 1–4 requires touching production data or the licensing gate. None of
5–6 alters a single retailer image byte. 7 is a copy fix, not a code fix, and
is out of scope for this document to perform — named here because this
investigation is what surfaced it.
