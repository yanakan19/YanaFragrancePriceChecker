# Refinement plan

Where the app actually stands, what to fix, and in what order.

House style below matches the app: no hyphens, no en dashes, no em dashes.

## Read this first

The app currently looks more finished than it is, and one number explains why:
**29 of 29 crawled listings carry an EAN.** That is not a property of UK retail,
it is a property of fixtures I wrote. Real catalogues are full of listings with
no GTIN in the markup, and matching is EAN only today, so every one of those
would fall on the floor.

Two more places where the fixtures flatter the app:

- **One size per fragrance.** The schema models variants properly, but nothing
  exercises it. Real shops list Sauvage at 30ml, 60ml, 100ml and 200ml, plus
  testers and gift sets. The comparison table has never had to keep those apart.
- **Six shops with data, twelve configured.** The other six return nothing,
  which currently reads as a quiet baseline rather than a problem.

So the honest priority is not polish. It is closing the gap between what the app
demonstrates and what it would do against real data.

## Track A: make it true

Nothing else matters until these land. All four are blocking.

**A1. Run the live spike.** Fetch one category page and one product page from
each of the twelve shops and record whether JSON-LD Product markup is present
and complete. This settles `adapter` for all twelve, which is `unknown` today,
and it validates the section URLs at the same time, which are a first pass and
unconfirmed. If eight of twelve parse cleanly, the plain fetch path is the
default and a managed scraper handles the rest. If only three do, the running
cost of the whole project changes and it is better to know now.
*Blocked here: this environment rejects all twelve retail domains at the proxy.*

**A2. Confirm twelve shipping rules.** Every one is marked `unverified` and the
delivered price is the headline number. A stale free delivery threshold produces
a wrong headline that looks authoritative, which is the worst error this app can
make. Selfridges is the known bad case: sources disagree between £100 and £150.
Half a day of reading delivery pages.

**A3. Build the matcher.** The Phase 1 work from the original plan, and the
single largest piece of remaining engineering. Parse brand, line and flight,
concentration and size out of every raw title, with an alias table for brands
and a controlled vocabulary for concentrations. Exclude testers, sets, refills,
travel sprays and decants from the main comparison rather than silently
comparing them against sealed bottles. Cascade: EAN exact, then normalised title
exact, then fuzzy with a confidence score, then the review queue. Build the two
hundred title test set first and treat 95 per cent as the gate.

**A4. Write price history on every crawl.** The table is in the schema and the
crawl does not populate it. This costs almost nothing to add now and cannot be
backfilled later, so every day it is missing is a day of history the flash deals
feature will not have. Do this before anything in Track B.

## Track B: the app itself

Ordered by how much each one improves the product per unit of work.

**B1. Sizes.** The biggest functional gap. A fragrance page should let you pick
100ml or 50ml and compare within that size, because a 50ml at £45 sitting next
to a 100ml at £62 is not a comparison, it is a trap. Needs a size selector on
the detail view and per variant comparison underneath.

**B2. Deep links.** There is no URL state at all, so a fragrance page cannot be
shared, bookmarked, or reached from search. For a price comparison site that is
not a polish item, it is most of how people would ever arrive.

**B3. Price context.** Once A4 has run for a month: show whether today's price is
the lowest in thirty days, and mark genuine drops. This is the feature that
turns a lookup into a reason to come back, and it is the honest version of a
flash deal because it is a claim about our own history rather than a fake
countdown.

**B4. Search that scales.** Autocomplete ranked by popularity, brand index, and
notes filtering. Ten items do not need it and ten thousand cannot work without
it. Notes need the controlled vocabulary of roughly three hundred canonical
notes with an alias table, built deliberately rather than accumulated.

**B5. Failure states.** Prices are baked into the bundle at build time, so the
app has no loading state, no stale state and no error state. The moment it talks
to an API it needs all three, plus the price age indicator doing real work.

**B6. Accessibility and real devices.** Everything so far has been verified in
headless Chromium at 390px. It needs a screen reader pass, a keyboard only pass,
and testing on actual iOS Safari and Android Chrome, where sticky headers and
safe area insets behave differently.

**B7. Official brand site row.** In the original registry table and never built.
Worth having as the authenticity reference point even when it is the dearest
option.

## Track C: production architecture

**C1. Replace the JSON store with Postgres.** `schema.sql` is already written and
the store mirrors it, so this replaces one file. Do it when the catalogue
outgrows a file per shop, which will be soon after A1 succeeds.

**C2. The API and live refresh.** The stale while revalidate design from the
original plan: serve cache instantly with a visible age, enqueue a refresh, and
stream updates in. Needs a cache floor and per shop circuit breakers so one slow
shop cannot block the other eleven.

**C3. Deploy, and let the daily job run for real.** The workflow exists and has
never fired against live shops.

## Track D: not code, still blocking

**D1. Fill the legal placeholders.** Registered name, company number, address,
ICO registration, real monitored mailboxes. The privacy notice cannot ship with
brackets in it. See `docs/LEGAL.md`.

**D2. Apply to the affiliate programmes**, after the site is live, since Awin
rejects applications pointing at holding pages. Boots, LOOKFANTASTIC and
Superdrug are confirmed Awin. Nine still need researching.

**D3. Register with the ICO** if you are processing personal data, which search
logging counts as.

## Recommended order

1. **A2** first. It is half a day, it needs no network, and it removes the
   largest source of silently wrong output.
2. **A4** next, same reason: cheap now, impossible to backfill.
3. **A1** as soon as you are somewhere the retail domains are reachable. Its
   result determines the shape of everything after it.
4. **A3**, the matcher, which is the real work and should not start before A1
   tells you what the raw titles actually look like.
5. **B1 and B2** together, since both touch the detail view.
6. Then C, then the rest of B.

Resist starting Track B before A3. A polished interface over a matcher that
mixes 50ml and 100ml looks finished and is worse than useless, because people
will believe it.

## Decisions still needed

These have been open since the original plan and now block specific work.

| Question | Blocks | Suggestion |
|---|---|---|
| Acceptable price staleness on a cache hit, and monthly scraping budget | C2 | 15 minutes, and a budget figure sets everything else |
| Flash deal window: detected within N hours, or expiring within N hours | B3 | Support both, default detection to 48 hours |
| Decant sellers in or out | A3 | Out for version one, they break the size axis |
| Selfridges free delivery threshold, £100 or £150 | A2 | Read it off their page |
| Show untrusted TikTok sellers with a warning, or exclude them | Phase 5 | Exclude, currently the default |
