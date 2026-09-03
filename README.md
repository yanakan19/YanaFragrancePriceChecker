# PriceSniffs — price comparison core

Retailer registry and offer-presentation layer for the PriceSniffs UK fragrance
price comparison site.

This is Phase 1 groundwork: the twelve-retailer registry, shipping rules, and the
logic that turns a captured offer into a comparison row you can trust. There is
no fetching layer yet — that is the Phase 0 spike (JSON-LD vs managed scraper per
domain), and `adapter` is `'unknown'` on every retailer until it lands.

## Owner action needed: force this repo's cloud environment cache to rebuild

This branch's remote container has a standing bug: on some resumes its disk
comes back from a frozen checkpoint dated **2026-08-12 ~23:13 UTC**, weeks
behind whatever origin actually has. Confirmed at least thirteen times by
2026-08-27 (D12's own count, from the container's reflog and mtimes — not a
guess), and the same underlying container instability has kept costing real
work since: a finished, uncommitted worktree diff killed and recovered only
because a human happened to notice it on disk, and separately three agent
worktrees killed at once with that work lost outright (D17) — full diagnosis
in [`docs/DECISIONS.md` D10, D12, D17](docs/DECISIONS.md#d10--the-checkout-can-come-up-thirteen-days-stale-and-the-guard-is-a-guard).
Every mitigation inside this repo (`scripts/recover-stale-checkout.sh`,
`scripts/backup-worktree.sh`, the session-start hook) is a seatbelt, not the
fix — nothing written from inside the container survives that revert, so no
in-repo change can reach it.

**The actual fix, and it takes a few minutes.** An earlier version of this
section told the owner to "recreate (re-provision) the environment". That
control does not exist, and the attempt to follow it on 2026-09-03 found
nothing of the kind under Edit Environment. Anthropic's own documentation
([Configure cloud environments → Environment
caching](https://code.claude.com/docs/en/cloud-environments#environment-caching))
describes the real mechanism, and it is precisely this bug:

> The setup script runs the first time you start a session in an
> environment. After it completes, Anthropic snapshots the filesystem and
> reuses that snapshot as the starting point for later sessions.

That snapshot **is** the 2026-08-12 checkpoint. The documented way to throw
it away is to invalidate the cache:

> The setup script runs again to rebuild the cache when you change the
> environment's setup script or allowed network hosts, and when the cache
> reaches its expiry after roughly seven days.

So: in [claude.ai/code](https://claude.ai/code) → this repository's
**Environment** → Edit, make any change to the **setup script** (a single
added comment line is enough) or to the **allowed network hosts**, and save.
The next session then starts from a freshly built filesystem instead of the
stale one. Deleting the environment is not an option the product offers —
"You can't delete an environment, only archive it" — so if a setup-script
edit does not take, the fallback is to **Archive** this environment and
create a new one.

One thing that does not add up and is worth reporting upstream if the revert
survives the cache bust: the cache is documented to expire on its own after
about seven days, but this checkpoint was still being served on 2026-09-03,
twenty-two days after its date. Either the expiry is not firing for this
environment or something keeps re-pinning it.

Once the cache is rebuilt, a boot of the **main checkout** fast-forwards itself
from wherever it lands via `scripts/recover-stale-checkout.sh`; a boot into
a **linked worktree** (`.claude/worktrees/...`, where every agent session
actually runs) gets a different protection instead —
`scripts/backup-worktree.sh` pushes its own uncommitted and unpushed work to
origin rather than fast-forwarding, because a worktree's branch is its own
and is never something to catch up to origin (see D17 for why those are
different problems with different fixes). Until the cache is rebuilt, expect
the underlying staleness to keep recurring for both kinds of checkout.

```bash
npm install
npm test                      # the full suite; it prints and stamps the count
npm run typecheck
npm run affiliate:status      # what's still unmonetised, and the next step
npm run shipping:staleness    # which delivery rules need confirming
npm run demo                  # rebuild demo/index.html, then open it
```

## Owner action optional: register a commit-signing key to fix the "Unverified" badge

Purely cosmetic, unlike the environment bug above — nothing is broken, and
skipping this changes nothing about the pipeline. It only affects whether
commits made under `urkoppan@gmail.com` (rather than the session default,
`noreply@anthropic.com`) show GitHub's green "Verified" badge instead of no
badge at all. Full diagnosis, including what was and was not testable from
inside a session, is in
[`docs/DECISIONS.md` D16](docs/DECISIONS.md#d16--unverified-is-a-missing-signature-problem-not-an-identity-problem-fixed-forward-for-interactive-commits-refused-for-ci-and-the-nag-was-already-narrower-than-assumed).

**What's confirmed:** every commit an interactive Claude Code session makes
here is already SSH-signed automatically (the harness's own
`commit.gpgsign=true` config) — the badge is missing only because no GitHub
account has this container's signing key registered against a verified
email that matches the commit's committer email. `noreply@anthropic.com`
resolves to an Anthropic-controlled account, not this repo owner's, so that
default identity's badge is not something she can fix. `urkoppan@gmail.com`
is different: it is a real, already-occurring session identity (not
hypothetical), and she does control that account's verified emails.

**To fix it for commits made under her own identity:** GitHub → **Settings**
→ **SSH and GPG keys** → **New SSH key** → set **Key type** to **"Signing
Key"** → paste this exact public key (recovered by decoding a real signature
this container produced, not generated for this purpose — an SSH signing
public key is not secret) → **Add SSH key**:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKy87HxSEheG8vEPhSs9u2KZCtVErAQfpmprtUJCZ2w7
```

Two caveats D16 could not resolve from inside a session: (1) this fixes only
commits actually made as `urkoppan@gmail.com`, not the `noreply@anthropic.com`
default most sessions use; (2) whether this exact key stays stable across a
future container was not established — if the harness ever rotates it, the
badge would go back to missing and there is no way from inside a session to
detect that it happened.

Re-checked 2026-09-01: the key above is still the one this container signs
with, and the default identity is still `noreply@anthropic.com`. Verified by
decoding the SSHSIG blob out of commit `413ac81d` on this branch rather than
by re-reading D16 — same `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKy87Hx…` key,
byte for byte. That is one more data point for caveat (2), not an answer to
it: it says the key survived within this environment, not that it survives a
fresh one.

Re-checked again 2026-09-02, the same way, against commit `93d0367b`: same
key, byte for byte, and the default identity is still `noreply@anthropic.com`.
The same limit applies and is worth restating rather than letting the count of
re-checks imply more than it shows — this container has been alive across both
checks, so what has been established is that the key is stable *within* one
environment's lifetime, which was never the open question. Caveat (2) is
unchanged.

**The CI half of this is a separate thing, and as of 2026-09-02 it is
attempted rather than refused.** This section is only about commits an
interactive session makes. The pipeline's own ~582 scheduled commits go
through `scripts/commit-and-push.sh`, which D16 and D18 twice declined to
route through GitHub's API for the badge. `scripts/signed-commit.sh` now makes
that attempt for the four small-payload call sites (`Harvest: real prices`,
`Image links`, `Shipping terms`, `Price verification: measured drift`), in a
shape that declines rather than risks anything — full reasoning in
[`docs/DECISIONS.md` D19](docs/DECISIONS.md#d19---ci-commit-signing-fourth-attempt-landed-as-an-additive-attempt-that-can-only-decline).

Two things about it are the owner's, not this repo's, and neither is claimed
done here. It is **not verified to work**: no live Actions run was available
when it was written, so the first real scheduled run is what decides whether
GitHub accepts the payload or the existing `git push` path quietly carries on
as before (the run log says plainly which). And it changes the committer on
those commits from `pricesniffs-bot` to `github-actions[bot]`, which is
inherent to the mechanism — the signature is GitHub signing on behalf of the
token. **To switch it off, no code change needed:** GitHub → **Settings** →
**Secrets and variables** → **Actions** → **Variables** → **New repository
variable** → name `SIGNED_COMMITS`, value `off`.

## Demo

`demo/index.html` is a single self-contained page — open it straight from disk.
It compiles `src/` and inlines the bundle, so the demo runs the real modules
rather than a reimplementation and cannot drift from what ships.

It is a build artefact, not source: edit `demo/app.ts`, `demo/template.html`,
or anything else `tsconfig.demo.json` bundles, and `npm run demo` must run
again before you commit. `tests/demoBuildFreshness.test.ts` enforces this —
it fails `npm test` if `demo/index.html`'s stamped build hash (see
`scripts/demoInputsHash.ts`) does not match the source tree.

**Its prices are invented**, because there is no fetching layer yet. The page
says so in a banner. Each of the six sample fragrances exercises a specific
rule — the penny-under-threshold case, round-down discount percentages, a
countdown that only appears because the retailer published an end time, tier
filtering withholding retailers, and a fragrance where nothing is buyable.

## The idea

Every retailer here is a legitimate UK stockist and every one is fine to send a
customer to. There is no `trusted` flag — see [D1](docs/DECISIONS.md#d1--there-is-no-trusted-flag)
for why the old one was dropped rather than renamed.

What actually separates a good listing from a bad one is whether we tell the
truth about it:

- **The genuine price**, as charged right now.
- **The retailer's own was/now and discount %**, when there is a real promotion —
  never a figure we derived, never rounded up, never a countdown we invented.
- **The delivery cost that will appear at checkout**, including whether this
  order clears that retailer's free-delivery threshold.
- **The stock state**, with explicitly out-of-stock listings grouped at the
  bottom rather than mixed in.

Those are enforced in `src/services/`, not left to whoever builds the UI.

## Usage

```ts
import { buildComparison, bestOffer, formatGbp } from './src/index.js';

const rows = buildComparison(capturedOffers, { sortBy: 'delivered' });

for (const row of rows) {
  console.log(
    row.retailer.name,
    formatGbp(row.deliveredPriceGbp),
    row.delivery.isFree ? 'free delivery' : formatGbp(row.delivery.costGbp),
    row.discount ? `${row.discount.percentOff}% off` : '',
    row.isPurchasable ? '' : 'out of stock',
  );
}
```

`buildComparison` returns rows already ordered — buyable first, then by delivered
price. `purchasableOffers` / `outOfStockOffers` split them into the two visual
groups; `bestOffer` returns the cheapest row a customer can actually buy from.

## Why delivered price is the default sort

Shipping regularly exceeds the price gap on fragrance, and thresholds across the
registry run from £25 to £300.

The regression test for this: **Boots at £24.99 has the cheapest item price in
the table and the most expensive delivered price** — it misses its own £25 free
delivery threshold by a penny, so it lands £2.95 above a £26 listing that ships
free. Sorting on item price would have put it first.

## Layout

```
src/
  types/retailer.ts        Registry types + why there's no trust flag
  types/offer.ts           Raw and presented offer shapes
  config/retailers.ts      ← the registry
  config/tiktokSellers.ts  TikTok beta, isolated and off by default
  services/
    priceService.ts        Comparison assembly, ordering, grouping
    shipping.ts            Delivery resolution and thresholds
    discount.ts            Was/now/% and countdown eligibility
    affiliate.ts           Outbound links + the setup reminder
    money.ts               Pence rounding, GBP formatting
docs/
  DECISIONS.md             What was decided, why, and what's still open
  AFFILIATE_SETUP.md       How to set the programmes up when you're ready
```

## Data quality caveat

**All twelve shipping rules are marked `unverified`.** They were sourced from
search results, not read off each retailer's delivery page, and delivery terms
change without notice. A stale free-delivery threshold produces a wrong delivered
price, which is the most damaging error this app can make — it is invisible to
the user and looks authoritative.

`DeliveryDisplay.confirmed` is `false` for all of them; surface that caveat in
the UI until they have been checked. Selfridges is the worst case: sources
disagree on whether free delivery starts at £100 or £150.

## Affiliate

Nothing is monetised. Every link resolves to the plain retailer URL, which is
correct and clickable, just unpaid. Boots, LOOKFANTASTIC and Superdrug are
confirmed Awin merchants; the other nine need researching.

When you are ready, [`docs/AFFILIATE_SETUP.md`](docs/AFFILIATE_SETUP.md) has the
process. The one thing worth applying early: **apply after the site is live**, as
Awin rejects applications pointing at holding pages, and re-applying after a
rejection is harder than applying once at the right moment.

## Next

Phase 0 spike, before more app code: test a plain `fetch` + JSON-LD parse against
all twelve domains. If `schema.org/Product` covers eight of them, that path is
~50ms and free and a managed scraper becomes the fallback for the awkward four
rather than the default — which roughly halves the running cost of the whole
project.

Then Phase 1: the matcher and its ~200 hand-labelled title test set. Nothing else
should be built until that clears 95%.
