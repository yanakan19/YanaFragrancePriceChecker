# PriceSniffs: how it was built

A UK fragrance price comparison site that harvests live prices from real
retailers every hour and publishes a static app from what it found. Solo-built
in TypeScript over five days, 113 commits, ~7,900 lines of application code and
~2,450 lines of tests across 15 suites.

This document is the engineering narrative: what problem each stage solved, why
each decision went the way it did, and — importantly — the bugs that were found
in use and what fixing them taught. It is written to be read by an engineer
deciding whether the author can build and reason about a real system.

---

## Stage 1 — Model the domain before fetching anything

**Problem.** A price comparison site is only as good as its claim to be telling
the truth about a price. That claim has to be structural, not aspirational.

**What was built.** A typed retailer registry and an offer-presentation core,
with no network code at all. The interesting work was in what the types refuse
to express.

The registry originally carried a per-retailer `trusted` boolean. It was
deliberately deleted, and the reasoning is recorded in the type file: the flag
had no stated criterion, so it could not be maintained. Selfridges and Harvey
Nichols were marked untrusted despite being beyond reproach on authenticity —
which meant the field was silently encoding "good value" while being named for
something else. What replaced it was a set of obligations that apply to every
retailer equally (show the real price, the real was/now pair, the delivery cost
actually charged, the real stock state), enforced in the offer pipeline rather
than as a per-retailer opinion.

**The decision that shaped everything after it.** `ShippingRule.standardGbp` is
`number | null`, and `null` is meaningfully different from `0`. Zero says "this
shop always ships free", which is a claim. A retailer whose delivery cost is
unknown must be `enabled: false` — enforced by a test — because delivered price
is the default sort key, so an unknown cost silently treated as zero would make
that shop win the comparison every time. This one rule is why several retailers
added later are present but disabled, and it is the single most load-bearing
constraint in the codebase.

---

## Stage 2 — Discover that the obvious approach does not work

**Problem.** Fetch product pages, parse them, done.

**What actually happened.** A Phase 0 spike against twelve UK retailers with
plain HTTP returned nothing. Not "some things" — a 0% success rate, recorded in
`docs/SPIKE-RESULTS.md`. Datacentre IP ranges are refused outright by most large
UK beauty retailers.

**Why this stage matters.** The result was written down rather than worked
around quietly, and the failed code path was kept and explicitly excluded from
the schedule with a comment explaining that it has never once succeeded live.
Knowing which of your approaches does not work, and being able to prove it, is
worth more than the approach that does.

---

## Stage 3 — Adaptive retrieval: a bandit, not a neural network

**Problem.** Different shops fail for different reasons, and the reasons change.
A fixed strategy per shop goes stale.

**What was built.** Six retrieval strategies per retailer — plain fetch, browser
headers, sitemap discovery, on-site search, JSON-LD homepage probe, paid
residential proxy — each carrying a per-shop score built from how often it
worked and how much it returned. Order follows score, so a strategy that fails
sinks and one that works rises. Exploration keeps a single bad night from
writing a strategy off permanently.

**The decision worth defending.** The brief asked for a neural network that
learns from failed attempts. It was not built, and the reasoning is in the
source file. A network needs thousands of labelled examples; there are twelve
shops and one attempt each, and the entire goal is to stop failing quickly, so
the training set will never exist. Worse, when a net picks wrong you cannot ask
it why — and "Boots is empty today" is exactly the failure that has to be
explainable, because the alternative is silently publishing wrong prices.

What was actually being asked for — try something, notice it failed, try
something different next time, remember — is a multi-armed bandit over a handful
of discrete strategies. It works from the first observation, every decision is
inspectable, and it is a few hundred lines instead of a model to host.

*Choosing the boring correct tool over the fashionable one, and being able to
justify it in writing, is the point of this stage.*

**The result.** The sitemap route, which the bandit surfaced, is where every
listing in the catalogue has come from since. The guessed-URL crawler it
replaced has still never succeeded.

---

## Stage 4 — Reconciliation: the invariants that prevent silent corruption

**Problem.** A crawl is a snapshot. Turning a sequence of snapshots into
trustworthy state ("this product is new", "this one is gone") is where
comparison sites quietly become wrong.

**What was built.** A reconciler with three rules that exist because the naive
version of each is a real bug:

1. **The first crawl is a baseline.** Every listing from a never-before-crawled
   retailer is recorded but marked ineligible for the NEW badge — otherwise
   launch day flags the entire catalogue as new, which tells the reader nothing
   and trains them to ignore the badge permanently.
2. **`firstSeenAt` never moves.** A listing that vanishes for a fortnight and
   returns is not a new product. It gets `relistedAt` instead, so a restock can
   be surfaced without lying about age.
3. **A failed crawl must not delist anything.** Absence is only evidence when
   the crawl actually succeeded. Callers pass `complete: false` after a partial
   run and nothing is marked gone.

Rule 3 was written *after* rule 3's absence caused a production incident — see
the bug log below.

---

## Stage 5 — Cost engineering as a code constraint

**Problem.** Some shops refuse every free route. Residential proxy traffic
solves that and costs roughly $8/GB.

**What was built.** An Apify proxy client that fetches only category and listing
pages, never one request per product — the difference between roughly £20–25 a
month and over £1,000. `MAX_PROXIED_REQUESTS_PER_RUN` is a hard ceiling in code,
not configuration: a bug that loops cannot spend past it.

**The honesty detail.** The module's header states plainly that it has never
been run against Apify's real infrastructure, that the request-building and
gating logic is unit tested with a fake transport, and that the handshake can
only be proven with a real password. Distinguishing "tested with a fake
transport" from "proven in production" is a habit worth having in writing.

---

## Stage 6 — Automate the whole pipeline

**What was built.** An hourly GitHub Actions workflow: run tests → harvest via
sitemap → harvest brand storefronts direct → rebuild the app → verify every
product image still resolves → commit.

Design choices worth noting:

- **Tests gate the crawl.** A broken reconciler corrupts `firstSeenAt` for every
  listing and cannot be recovered by a later run, so the crawl does not start if
  the suite is red.
- **Commits are the audit trail.** Every price change is a diffable commit.
- **Failure is isolated, not swallowed.** A brand storefront refusing us is
  `continue-on-error` so it cannot discard a retailer harvest that already
  succeeded — but the job still fails loudly if the harvest itself breaks,
  because a crawler that quietly stops working leaves stale prices up, which is
  worse than showing nothing.
- **Concurrency-guarded**, after a race condition destroyed a completed harvest.

---

## Stage 7 — The interface, and the ideas it has to carry

A static app is generated from the harvested data. The parts that required real
thought:

- **Faceted filtering, Amazon-style.** Volume, concentration, price band, type,
  on-sale and in-stock, on every listing page. The rule: an option only appears
  if at least one fragrance in the current list has it, and its count reflects
  every *other* active facet but never its own group — so ticking a second
  volume is additive rather than self-defeating, while narrowing volume still
  correctly prunes the concentrations on offer. Filtering to something empty is
  impossible because that option is never rendered.
- **Images are hot-linked, never rehosted**, and the grounds for showing each
  retailer's photography are named in the registry (`affiliate-terms`,
  `own-storefront`, `hotlink-unlicensed`) rather than hidden behind a boolean.
  An hourly health check reports any image that stops resolving.
- **Affiliate links fail open.** If a programme is not live or a template is
  incomplete, the link falls back to the plain retailer URL — a broken tracking
  link loses a sale, an untracked link only loses commission.

---

## Bug log: found in use, diagnosed, fixed

These are the ones worth talking about in an interview, because each one has a
root cause that is more interesting than the symptom.

### 1. Mass delisting from a sampled crawl
**Symptom.** An hourly harvest marked almost the entire catalogue as gone.
**Cause.** The harvest samples a budget of product pages per shop; the
reconciler treated everything not seen in that sample as delisted. Sampling and
absence-as-evidence are incompatible.
**Fix.** `complete: false` for partial runs, suppressing delisting entirely.
Absence only counts when the walk actually finished. *Lesson: a function that
consumes a snapshot needs to know how complete the snapshot is.*

### 2. A concurrent push discarding a forty-minute harvest
**Symptom.** A completed harvest vanished.
**Cause.** Two workflow runs writing snapshots raced; the loser's work was
thrown away on conflict.
**Fix.** A concurrency group, plus rebuilding generated files on conflict
instead of discarding the harvest.

### 3. Gzipped sitemaps silently never parsed
**Cause.** Sitemaps served `.xml.gz` were fetched and handed to the XML parser
as compressed bytes, which produced no URLs and no error.
**Fix.** Decompress before parsing. *Lesson: a parser that returns "nothing
found" for malformed input hides the bug; it should distinguish empty from
unreadable.*

### 4. Nested affiliate redirects
**Cause.** Product URLs from Awin's datafeed are *already* complete tracking
redirects. Wrapping them in the deeplink template again produced one Awin
redirect nested inside another.
**Fix.** Feed-sourced URLs pass through untouched, still flagged as affiliate.
*Lesson: "apply the transform to every URL" is wrong when some URLs arrive
pre-transformed.*

### 5. One brand appearing several times
**Cause.** Retailer feeds disagree about casing and punctuation — "ARMAF" and
"Armaf", "Dolce & Gabbana" three ways. Ten such groups across 166 brand strings.
**Fix.** Group on letters and digits only, then pick the display spelling by
preferring ordinary mixed case over shouting, with frequency only breaking ties
*within* that. Frequency alone picks wrong: "ARMAF" appears 195 times to
"Armaf"'s 12, because one large-catalogue shop shouts its vendor field, and
shouting is not authority. It never invents a spelling, so DKNY and YSL keep
their capitals rather than becoming "Dkny".

### 6. "Not available" claimed about shops that could never stock it
**Symptom.** A Dior fragrance page listed Armaf's own UK storefront under "Not
available", identically to Boots.
**Cause.** The page listed every registry entry it had no offer from, treating
two different situations as one. Boots stocks many houses and does not have this
one — true and useful. Armaf's own shop was never going to sell a Dior bottle —
so the statement is about what kind of shop it is, not about availability.
**Fix.** A `singleBrandOnly` field, and a separate, explained group on the page.
A single-brand shop missing *its own* house's fragrance stays in the ordinary
list, because there the absence is real. Both directions covered by tests.

### 7. Brand storefronts presented as places to browse
**Cause.** Armaf, French Avenue and four others were listed in the Retailers
directory beside Boots and Selfridges. Opening one expecting a shop and finding
a single brand is the wrong promise.
**Fix.** They remain in the retailer registry — that is what a source of a
sterling price with a UK delivery rule *is* here, and it is what lets their
prices appear at all — but they are presented on the brand instead, which is the
only place "buy direct from Armaf" means anything. *Being a price source and
being a destination worth browsing are two different jobs.*

### 8. The same bottle listed twice, at two prices
**Symptom.** Afnan Supremacy In Extrait De Parfum, Oud, 100ml appeared in search
twice — £38.99 from Justmylook and £50.00 from Beauty Base — as though they were
different fragrances.
**Cause.** Products were keyed on EAN where a shop published one and on the
shop's own SKU where it did not, so the identical bottle became two products
whenever only one shop carried the barcode.
**Fix.** A matcher on house, size, concentration and the *set* of words in the
name — word set rather than order, because "Supremacy Pour Homme Silver" and
"Supremacy Silver Pour Homme" are one bottle written twice. It refuses where two
published barcodes disagree, because that is the manufacturer stating these are
different articles, which outranks a name comparison.
**Impact.** 225 listings folded into an existing product; products stocked by
more than one shop went from 144 to 332 — comparisons the catalogue could
already have made and was not. *This is the failure a price comparison exists to
prevent: two products shown, no comparison made, and the cheaper one reading as
a different item.*

### 9. Shipping discovery: wrong answers caught by design
**Context.** Eight retailers sit disabled because their flat delivery rate is
unknown. Research reliably finds the free-over threshold (shops advertise it)
and almost never the rate below it. A tool was built to read each shop's own
policy page and *report candidates with the sentence they came from* — never to
write the registry.
**What the first live run produced.** Three wrong answers, each instructive:
£150 for Al Haramain (from "Half-Price Shipping when you spend over £150" — a
condition, not a charge), £200 for Manchester Ouds (from "You are £200 away from
free shipping" — a live cart widget), and £0.00 for Oud Arabian (a header basket
total, which ranked above the correct £3.99 because the lowest candidate won).
**Root cause of the third.** Block-level HTML boundaries collapsed into one run
of text, so nav chrome and the real delivery paragraph became a single sentence
— discarding the chrome discarded the answer with it.
**Fix.** Block boundaries become explicit separators; cart-widget phrasing and
spend-conditions are excluded; £0.00 is never a rate; and a sentence that names
the *standard* service outranks one that merely mentions a number near the word
delivery. Each of the three failures is now a regression test using the verbatim
sentence that caused it.
**The point.** The tool reports and quotes; a human confirms and types the
number. That division is why three wrong answers cost nothing. Had it been
allowed to write `standardGbp` directly, it would have set £150 as a delivery
charge on a live comparison. *Automate the gathering, not the asserting, when
the cost of being confidently wrong is high.*

---

## What the codebase demonstrates

- **Systems thinking over library-reaching.** A bandit instead of a neural
  network, justified against the actual constraints in writing.
- **Data-integrity discipline.** Explicit invariants — immutable timestamps,
  baseline detection, absence-only-counts-when-complete, null-is-not-zero — that
  prevent silent corruption in an unattended pipeline.
- **Cost engineering.** Hard runtime ceilings on metered calls, not budget
  alerts after the fact.
- **Calibrated honesty.** Unverified data is labelled unverified; "tested with a
  fake transport" is distinguished from "proven in production"; retailers whose
  terms are unconfirmed stay disabled rather than being guessed into service.
- **Debugging from symptom to root cause.** Every entry in the bug log above
  names a cause that is more general than the symptom, and most produced a test
  that pins the behaviour.
- **End-to-end ownership.** Crawler, reconciler, matcher, affiliate layer,
  static site generation, CI/CD, deployment — with tests gating each stage.
