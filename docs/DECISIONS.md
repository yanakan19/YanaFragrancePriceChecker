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

---

## D10 — The checkout can come up thirteen days stale, and the guard is a guard

**Diagnosed 2026-08-25.** Three times in one session, this container's checkout
was found at `c9fc2b1` ("Never subtract one currency from another and report the
difference in pounds", 2026-08-12 23:11) with `git status` clean, thirteen days
behind origin, working-tree files included.

### It is the container image, and that is established

Four things were read off the machine, not inferred:

1. **No file anywhere on the root filesystem has an mtime between 2026-08-13 and
   2026-08-25.** `find / -xdev -newermt "2026-08-13" ! -newermt "2026-08-25"`
   returns nothing at all. A thirteen-day hole in an entire disk's write history
   is not something a git command can produce.
2. **The newest pre-restore file on the disk is `.git/COMMIT_EDITMSG`, mtime
   2026-08-12 23:11:14** — the same second `c9fc2b1` was written, and its commit
   object carries the same timestamp. The image was frozen immediately after
   that commit.
3. **`git reflog` shows the same hole.** It runs to `c9fc2b1` on 2026-08-12
   23:11:14 and then jumps straight to a manual `reset` on 2026-08-25. Every
   commit between — `5240fae`, `d35b464`, `bdc252c`, `df0122a`, the harvests —
   was made somewhere else and reached this checkout only through `origin`. The
   reflog is a file on that same disk, so it was restored along with everything
   else.
4. **The container had been up twelve minutes** when this was read, on a
   Firecracker guest whose `/opt/env-runner` and session hooks had all been
   rewritten minutes earlier at provisioning time.

So nothing reverted. This disk has simply never contained the work of the last
thirteen days: it is a checkpoint captured at 2026-08-12 23:11 and re-applied on
every resume, and writes made after it have never been persisted back. Claude
Code's own session-hook documentation describes container state being cached
after the startup hook completes; this is that cache, stuck.

Two consequences follow, and the second is the dangerous one. Work is never
lost, because origin always has it. But the restored tree carries the older
`src/catalogue/awinFeed.ts`, whose header calls `merchant_deep_link` an unmapped
"known gap" — untrue since `5240fae` mapped it on 2026-08-13. Committing that
tree would republish a documented falsehood into the file whose purpose is
recording what has been verified, and the Stop hook asks for uncommitted changes
to be pushed. Staleness here is a correctness problem, not a convenience one.

### What is *not* established

Why the checkpoint stopped being refreshed on 2026-08-12, and whether it is this
branch's container or the environment as a whole. Both are outside this
repository and cannot be seen from inside it. **It needs raising with whoever
owns the environment — no change in this repo can fix it.**

### The honest limit of the mitigation

`.claude/hooks/session-start.sh` fetches and fast-forwards at session start. It
cannot rescue the worst case, and it should not be described as if it can: a
session that boots on the 2026-08-12 image is looking at a tree from *before*
the hook was committed, so the hook is not on disk to run. Nothing committed
here can reach a boot that predates the commit. That is the plain shape of it.

What the hook does cover is real and worth having anyway:

- every session that starts from a checkout at or after this commit, which is
  every session once the checkpoint is refreshed;
- the ordinary drift, which is not exotic at all — the harvest job pushes to
  this branch roughly every two hours, so any checkout more than a couple of
  hours old is already behind. The hook fast-forwarded one such commit on its
  first live run;
- the lone phantom diff. When a modified file's contents hash to a blob that
  same path genuinely had at an earlier commit, the hook says so by name and
  date. New work does not reproduce an old revision byte for byte, so that is
  evidence rather than a guess.

### Why it cannot destroy work

The only command in it that writes to the working tree is `git merge --ff-only`.
No reset, no `checkout --force`, no clean, no stash.

- A fast-forward is refused by git unless HEAD is already an ancestor of the
  target, so no commit can be dropped; the hook tests that ancestry itself and
  exits without touching anything when it fails. A diverged checkout is left
  exactly as it is.
- `--ff-only` runs the same overwrite check as checkout: an uncommitted edit in
  the way aborts the merge and leaves the tree alone. Edits to files the
  incoming commits do not touch are carried across.
- Untracked and ignored files are never removed.

The one judgement it deliberately refuses to make is which of a phantom diff and
real uncommitted work it is looking at. `git status` cannot tell them apart, and
a rule that guesses would eventually guess wrong and delete an afternoon's work
— far worse than the staleness it was fixing. So it reports and stops. The worst
outcome available to the hook is that it declines to advance and says why.

`npm install` is deliberately *not* run every session. `package-lock.json` has
not changed once across the range this staleness spans, so an install has
nothing to add, and it can normalise the lockfile and leave a modified tracked
file behind — a hook that manufactures the exact class of phantom diff it exists
to warn about. It installs only when `node_modules` is missing or the lockfile
has moved under it, and never lets npm write the lockfile.

---

## D11 — `bdc252c` is mislabelled, and it stays that way

**Decided 2026-08-25.** Commit `bdc252c` is titled "Say what the price contains,
on every row, and only where it is true". It does not do that. Its diff is
`demo/head.ts` and `tests/head.test.ts` — browser tab titles.

Its message is `d35b464`'s message verbatim, plus a trailer block; the two were
compared byte for byte. `d35b464`, immediately before it, is the genuine
price-note commit (`demo/priceDeliveryNote.ts` and three others) and is fine. The
cause was `git commit --amend` in a checkout being worked by more than one
session at once, retitling a commit the amending session had not written. The
title it should carry, recovered from a reflog in the session where it happened
and recorded here on that session's word rather than on anything verifiable from
this checkout, was **"Browser tab titles name the page instead of describing
it"**.

**Nothing is missing.** The content on origin is correct and complete. Only the
message is wrong.

It is not being corrected, and the reason is arithmetic rather than principle.
Changing a published commit message means rewriting every commit after it and
force-pushing. On this branch that is four commits, three of them harvest
commits from a job that pushes roughly every two hours, plus four live agent
worktrees currently sitting on descendants of it. A force-push races that job:
lose the race and a harvest push is rejected or re-merges the old chain, and
every worktree is stranded on a commit that no longer exists. The cost of the
mislabel is that `git log --oneline` shows one title twice in a row — which is
itself the tell that something went wrong, and takes seconds to resolve by
looking at the diff. Trading a live branch and four working sessions for that is
not a good trade.

**If the owner wants it fixed anyway**, it is `git rebase -i d35b464` (or
`git filter-repo --message-callback`) to reword `bdc252c`, then
`git push --force-with-lease`. It must be done when the harvest job is not due
and no agent sessions are live, and every worktree branch has to be rebased onto
the new SHAs afterwards. That is the owner's call to make, not an agent's.

The general lesson is the one `df0122a` already reaches for in its closing note:
**`git commit --amend` is not safe in a shared checkout.** Stage by name, commit
by name, and never amend a commit you did not just write.

---

## D12 — The snapshot revert recurs on every provisioned boot, recovery is now automatic, and the environment needs recreating

**Diagnosed 2026-08-27, extending D10.** D10 established that the container's
disk is a checkpoint frozen on 2026-08-12 and re-applied on resume. Since then
the revert has recurred roughly eleven more times through 2026-08-26 and again
overnight into 2026-08-27, each occurrence recovered by hand: read the diff,
discard the phantom, fetch, move to origin. This morning's boot (07:43 UTC) came
up reverted once more, and at 07:52:19 a session agent performed manual recovery
number thirteen — the main checkout's reflog shows `reset: moving to
origin/claude/scentday-retailer-registry-h92tth` at that second, jumping
straight from `c9fc2b1` (2026-08-12 23:11:14) to `ae354a8` (2026-08-27). This
entry records what the 2026-08-27 examination added to D10, what is now
automatic, and the one action that actually fixes it.

### The freeze is at ~23:13, not 23:11 — and that explains the phantom

D10 dated the checkpoint to the second of `c9fc2b1`. A full mtime sweep of
`/root` and `/home` on the freshly booted container sharpens that: exactly
fifteen paths carry an mtime between 2026-08-12 23:12 and this morning's boot,
and every one of them sits in the two minutes 23:12:27–23:13:51 — npm debug
logs (23:12:27, 23:12:42), MCP logs (23:13:50),
`~/.claude/backups/.claude.json.backup.1786576431798` (23:13:51), and
`src/catalogue/awinFeed.ts` itself. The checkpoint was captured **about two
and a half minutes after `c9fc2b1` was committed**, and at that moment the
14-line `merchant_deep_link` comment was sitting **uncommitted** in the working
tree. That is the whole mystery of the "phantom diff": it is not manufactured
by anything, it is a real edit of 2026-08-12 that the snapshot preserves
mid-flight, re-materialised byte-for-byte on every restore.

Its provenance is now fully traced. The frozen working copy hashes to blob
`62d642cb` — byte-identical to the file as committed fifteen minutes **after**
the checkpoint in `851bae4` ("Record why an affiliate feed listing cannot be
price verified", 2026-08-12 23:28:09), and superseded the next morning by
`5240fae` (2026-08-13 09:51), which mapped `merchant_deep_link` and rewrote the
very paragraph the phantom adds. So committing the phantom today would (a)
recommit content history already has at `851bae4`, (b) republish as current a
"known gap" that closed on 2026-08-13, and (c) do it on a HEAD two weeks
behind origin — while the Stop hook's "uncommitted changes — commit and push"
prompt actively invites exactly that. Thirteen recoveries in, the diff has been
read correctly every time; the automation below removes the need to keep being
right.

### What survives a reverted boot: nothing writable from inside

The same sweep answers where a recovery hook could live. On this morning's
boot, `~/.claude/launcher-settings.json`, `stop-hook-git-check.sh`,
`session-start-git-identity.sh` and their companions were all re-stamped at
07:43:48–59 — they are provisioned by the harness **from outside the image at
every boot**, and `launcher-settings.json` is where this environment's
SessionStart and Stop hooks are actually registered. Everything else under
`~/.claude` (`projects/` Aug 1, `uploads/` Aug 4, `skills/` Aug 12 22:09)
predates the freeze, meaning it is simply part of the frozen image — the
apparent "survival" of old directories is not selective persistence, it is the
snapshot itself. Between the freeze and this boot the disk holds nothing.

The consequence is stated plainly rather than optimistically: **no file
written from inside the container — repo-committed or under `~/.claude` —
exists on a boot restored from the 2026-08-12 image.** The repo's own
`.claude/settings.json` and hooks postdate the freeze (`ca81313`, 2026-08-25),
so the reverted tree does not contain them; a user-level
`~/.claude/settings.json` written today is wiped by the same restore. The
harness-owned files fire every boot but are not ours to edit. There is no
in-container vector that reaches the boots that matter, and none is claimed.

### What is now automatic anyway

`scripts/recover-stale-checkout.sh` performs the recovery that was manual, under
a contract that it can never destroy real work:

- main checkout only — it exits untouched inside any linked worktree or on a
  detached HEAD;
- fetch under a hard timeout; on failure, one warning line and out — a session
  start is never blocked on the network;
- it acts only when `git merge-base --is-ancestor` proves HEAD is behind with
  no divergence; any local commit origin lacks gets a loud refusal and no
  action;
- the phantom is discarded **only on a byte-exact match**: the tree's entire
  dirty state must be that one file, unstaged, nothing else modified, staged
  or untracked, and the diff must be insertion-only with exactly 14 added
  lines whose SHA-256 equals the pinned signature (`7da5738c…`), taken from
  the frozen image itself. One line more, one file more, one removal: it
  prints what it found and touches nothing;
- advancing is `git merge --ff-only` and nothing else; healthy checkouts are a
  silent no-op, and the script is idempotent.

The signature is parameterised (`RECOVER_PHANTOM_FILE` / `_SHA256` / `_LINES`),
and `tests/recoverStaleCheckout.test.ts` exercises the contract against real
scratch repositories in the same style as `tests/commitAndPush.test.ts`: full
recovery from a simulated revert, refusal on a real edit, refusal on any extra
dirty file, refusal on staged state, divergence refusal, healthy no-op,
plain fast-forward, the level-checkout phantom, fetch failure, and the
worktree exit. `.claude/hooks/session-start.sh` now runs it first, so on any
boot where the hook exists on disk the revert heals before the first prompt;
it has also been installed at `~/.claude/hooks/recover-stale-checkout.sh` with
a minimal `~/.claude/settings.json` registering it, which costs nothing and
covers same-container restarts — while the previous paragraph says exactly why
neither copy reaches a boot restored from the 2026-08-12 image.

### The actual fix is outside this repository

Every path above is a seatbelt. The defect is that this environment's
checkpoint has not been refreshed since 2026-08-12 23:13 — fourteen days of
sessions, none persisted back — and that is platform state, invisible and
unwritable from inside the container. **The owner should recreate (or
re-provision) this environment in the claude.ai/code environment settings, so
that a fresh base image is captured.** A fresh image taken from current origin
contains `.claude/settings.json`, the session-start hook and the recovery
script, at which point every subsequent boot — including any future stale
restore — heals itself at start. Until that is done, every provisioned boot of
this container will keep starting from 2026-08-12, and the first thing any
session should trust is `git fetch`, not the tree it woke up on.

---

## D13 — The catalogue cron was missing most of its ticks, and firing hourly at minute 0 was the reason

**Decided, 2026-09-01.** `.github/workflows/catalogue-daily.yml` was
`cron: '0 */3 * * *'`. Observed behaviour was far short of what that
promises — gaps between consecutive `schedule`-event runs of 5, 6, 7 and once
~14 hours, reported by the owner across 2026-08-27 → 2026-08-31. A prior
investigation had already tested and ruled out the `concurrency: { group:
catalogue, cancel-in-progress: false }` block as the cause — idle at 5 of 6
sampled missing-tick times, the 6th inconsistent with GitHub's own documented
queueing behaviour. That investigation is not recorded in this file and was
not rerun here; it is taken as given, per the brief that reopened this. What
follows is new measurement, not a repeat of it.

### The real numbers

Every `schedule`-event run of `catalogue-daily.yml` since the three-hourly
cron itself took effect (`1b009d0c`, 2026-08-26T09:46:55Z), read from the
GitHub Actions API:

- **Window measured:** run #339 (2026-08-26T12:53:27Z) through run #364
  (2026-09-01T00:25:12Z) — 131.7 hours.
- **Delivered:** 21 schedule-triggered runs.
- **Expected:** ~44 ticks at a strict 3-hourly cadence over that span.
- **Delivery rate: ~48%.** Roughly half of every scheduled tick in this
  window produced no run at all.
- **Gaps between consecutive delivered runs** (20 gaps): 2h34m
  (#359→#360) to 14h43m (#349→#350), mean 6h35m, median 5h03m — both close
  to double the nominal 3h.
- **Run durations** (the 20 that completed): 76m56s to 96m34s, mean 86m44s
  — confirming the header comment's own "80-95 minutes" and, independently
  of the prior concurrency finding, arguing against overlap as the cause:
  even the longest run leaves ~83 minutes of slack behind a 180-minute
  cron.

### What matches GitHub's own documented behaviour

["Events that trigger workflows"](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows),
under the `schedule` heading, GitHub Docs (fetched 2026-09-01): "The
`schedule` event can be delayed during periods of high loads of GitHub
Actions workflow runs. High load times include the start of every hour. If
the load is sufficiently high enough, some queued jobs may be dropped."

`cron: '0 */3 * * *'` fires at minute 0 on every single tick — literally
every one of the ~44 expected ticks in the measured window landed on the
exact instant GitHub's own docs name as the worst time to ask. The other two
scheduled workflows in this repo already avoid it (`image-check.yml` at
`:20`, `price-verify.yml` at `:40`); this one did not. The measured 48%
delivery rate, the gap sizes, and the drift in when runs actually land are
all consistent with that documented mechanism and with nothing else found —
this is confirmation, not a new hypothesis.

### The mitigation, and why it was implemented rather than declined

The candidate evaluated: fire far more often (hourly, at a non-zero minute)
and add a guard that only lets a real harvest run once enough time has
genuinely passed since the last one committed. The measurement supports it —
the drop pattern is load-shaped exactly as GitHub's docs describe, so more
attempts at a less contested instant should catch a much larger share of
them, and a dropped tick now costs at most the wait to the next hourly
attempt instead of 3+ hours, sometimes 14.

Implemented in `catalogue-daily.yml`:

- `cron: '15 * * * *'` — hourly, 15 minutes past.
- A new `guard` job, outside the `catalogue` concurrency group and without a
  checkout, that reads the commit timestamp of `data/harvest-cursor.json`
  (written by "Commit harvested prices" on every harvest attempt, truncated
  or not) via the GitHub commits API and outputs whether it is ≥150 minutes
  old. `crawl` now carries `needs: guard` and only runs when that output is
  `true` — except for anything that is not a `schedule` trigger, which
  `guard` always waves through regardless of the commit history, and which
  `crawl`'s own `if:` honours even if `guard` fails outright (`always()`,
  deliberately not relying on the implicit success-gate `needs` adds). A
  `workflow_dispatch`, including the `capture_render_shop` debug path,
  always runs in full.
- The guard reads git history, not a marker file, on purpose — every other
  age-gated step in this job (shipping discovery, Awin sync, Top Deals) uses
  a marker file, and that shape is right for a step gating itself inside a
  job already committed to running. It is the wrong shape for a gate that
  decides whether the job runs at all: the marker would not even be checked
  out yet, and one more committed-but-fragile state file to depend on is the
  same class of thing D10 and D12 above already are. Commit history cannot
  drift out of sync with what happened.
- Threshold 150 minutes, not 180: the gate reads the *previous* harvest's
  commit time, which is necessarily its completion, not its start (the file
  is written once, at the end). So the achieved start-to-start interval is
  threshold plus that run's own duration — ~150 + 87 ≈ 237 minutes in the
  common case, closer to the original 3-hour design than 180 would produce
  (~267 minutes), while staying safely above the measured 76-97 minute run
  range so the guard does not fire while a run it should wait on is likely
  still going.
- A failed API read runs the harvest in full rather than guessing a skip.

The full reasoning, including the cost accounting below, is written into the
workflow file itself (`catalogue-daily.yml`, the dated section above its
`on:` block) rather than only here, following this repo's own convention
that a workflow's operational decisions live beside the workflow.

### The cost, and why it stays inside the existing budget

`guard` adds ~24 billable minutes/day at GitHub's 1-minute floor — a runner
boot and one `curl` call, 24 times a day, no checkout. `crawl` itself is now
capped by the 150-minute guard rather than by whichever ticks happen to
land, so its ceiling is real: at most one harvest every ~237 minutes if
every hourly attempt after the threshold landed, ~6.1/day. That is below the
8/day this cron was already provisioned and budgeted for at the 2026-08-26
three-hourly move (see that move's own comment, `1b009d0c`), and above what
it has actually delivered this window (21 runs / 5.49 days ≈ 3.8/day). The
worst case does not exceed the budget already committed to; the realistic
case is a recovery toward it, not past it.

Nothing here changes Apify spend. The actor tier's own 20-hour marker gate
(`data/metered-harvest-marker.txt`) and the independent age gates on
shipping discovery, Awin sync and Top Deals all cap themselves on elapsed
time already, regardless of how often the outer job runs — only the
sitemap/houses harvest steps run more often, and only up to the ceiling
above.

### What was deliberately left alone

The harvest budget parameters (`--max=70`, `--refresh-share=0.4`,
`--run-minutes=56`) are unchanged — this is a scheduling fix, not a
re-tuning of what one run does, and there is no evidence here that they need
to move. The job's own 120-minute timeout and the per-step caps inside it
are unchanged for the same reason. The concurrency group's cancellation
behaviour (documented in the workflow's own comment: a third tick cancels a
second one still queued) is unchanged in kind; scoping it to the `crawl` job
only, rather than the whole workflow, keeps it from ever applying to
`guard`, which is the point, not a behaviour change for `crawl` itself.
---

## D14 — "Unverified" commits are mostly genuine CI-bot commits; the fix is forward-only, not a history rewrite

**Diagnosed 2026-09-01.** A stop-hook reported that many commits on this
branch show as "Unverified" on GitHub because the committer identity is
`bot@users.noreply.github.com` rather than `noreply@anthropic.com`, and
suggested `git rebase --root --exec "git commit --amend --no-edit
--reset-author"` followed by a force-push to fix it. **That remedy was not
run.** Both of its stated reasons were checked against the repository rather
than assumed, and both held up.

### The measured breakdown

The working checkout was a shallow clone (`git rev-parse
--is-shallow-repository` → `true`, 59 commits reachable). `git fetch
--unshallow` against `origin/claude/scentday-retailer-registry-h92tth`
brought in the full history — 1126 commits total, more than the 360-odd this
branch carried when this task was written, itself a small extra data point
for "an active cron keeps pushing here." Every commit's author was counted
with `git log --format='%ae|%an' | sort | uniq -c`:

| author email | name | commits |
|---|---|---|
| `bot@users.noreply.github.com` | `pricesniffs-bot` | 598 |
| `bot@users.noreply.github.com` | `scentday-bot` | 331 |
| `noreply@anthropic.com` | `Claude` | 148 |
| `urkoppan@gmail.com` | `Yana` | 44 |
| `urkoppan@gmail.com` | `Claude` | 5 |

929 of 1126 commits (82%) carry the bot identity the stop-hook flagged.
Grepping those 929 subjects for the exact six templates
`catalogue-daily.yml`'s harvest jobs write (`scripts/commit-and-push.sh`
hard-codes `pricesniffs-bot <bot@users.noreply.github.com>` as the committer
— see that script) found:

| message template | count |
|---|---|
| `Harvest: real prices …` | 256 |
| `Rebuild demo: … harvest` | 18 |
| `Awin feed sync: …` | 72 |
| `Top Deals Today: …` | 71 |
| `Image links: …` | 117 |
| `Shipping terms: …` | 48 |
| **subtotal** | **582** |

A further 36 match other mechanical, clearly-automated templates the same
workflows and their sibling scripts write (`Probe: what the crawler learned
…` 7, `Catalogue: …` 7, `Rebuild demo bundle to match current source hash` 3,
`Shipping discovery: …` 2, `Price verification: …` 2, `Price history: …` 3,
`Catalogue crawl: …` 2, `Regenerate demo/…` 8, `Update history: …` 2) — 618
of 929 bot-identity commits (67%) are report/rebuild output from a scheduled
job, not authored prose.

The remaining 311 bot-identity commits were sampled rather than assumed away:
subjects like "Virtual Yanny: a declined suggest resolver must keep its own
grounding" (22 commits, 2026-08-10–16), "Design system: two red glows behind
the page, and nothing else moving" (8 commits, all 2026-08-12), and
individually-authored entries like `sizeMl:`, `brandName:`, `marketOf:`,
`testCountReporter:`, `wasPriceCredibility:` read as genuine hand/agent
narrative development commits, not job output — they were committed under
the bot identity rather than under `noreply@anthropic.com`, evidently because
whatever ran them left `scripts/commit-and-push.sh`'s `git config user.*`
in place for interactive work too. `noreply@anthropic.com` commits span the
same window (2026-08-01 to 2026-08-20), so this was inconsistent practice
within the period, not a clean "before/after" switch.

At the moment this was read, `.github/workflows/catalogue-daily.yml`
scheduled `cron: '0 */3 * * *'` — every three hours — confirming the second
reason not to force-push: any rewrite of 1126 commits races a job that
pushes to this exact branch on that cadence, on top of
`scripts/commit-and-push.sh`'s own retry-and-rebase logic existing
specifically because two ordinary pushes colliding here has already lost
real harvest data (see that script's own header, runs #15/#17, #124/#126,
#236, #266/#268). D13 above, landing on this same branch while this entry
was being written, moves that cron to hourly at `:15` with a completion
guard — a *tighter* cadence in the worst case (as often as every ~150
minutes) — so the conclusion here is unaffected: whichever schedule is
current, it is active and it is not "every few hours in theory, dormant in
practice."

### Why the rebase was refused

1. **Most flagged commits are genuinely CI output, correctly unverified.**
   At minimum 618 of 929 (67%) are scheduled-job commits with no human or
   agent author behind the specific keystrokes — `--reset-author` would
   stamp them as authored by whoever ran the rebase, which is false for
   all of them. GitHub showing a bot-committed, unsigned automation commit
   as "Unverified" is not a bug to fix; it is the correct signal.
2. **`--reset-author` cannot correctly attribute the other third either.**
   Even the ~311 commits that read as hand/agent work were not necessarily
   written by whoever would run the rebase — reassigning authorship on
   1126 historical commits based on a message-pattern guess is exactly the
   kind of "adjudicate a diff by guessing" move D10 and D12 already refuse
   to make for working-tree state, for the same reason: guessing wrong is
   worse than the problem being fixed, and here it cannot be checked
   without asking whoever actually ran each of those hundreds of sessions.
3. **The force-push itself is the more dangerous part.** `rebase --root`
   rewrites every one of 1126 commits' SHAs; the push would need
   `--force` (or `--force-with-lease`, still racing the same window) against
   a branch a 3-hourly cron pushes to and that D11 already documented as
   unsafe to rewrite even four commits deep, for the same reason: a losing
   race strands `commit-and-push.sh`'s in-flight rebase, every live agent
   worktree based on the old SHAs, and possibly the harvest data itself.

### What was done instead — forward-looking only

- **Local git identity, set explicitly.** `git config user.email
  noreply@anthropic.com` and `git config user.name Claude`, run against this
  worktree's `.git/config`. Because this worktree was not created with
  `extensions.worktreeConfig` enabled, `git rev-parse --git-common-dir`
  resolves to the main checkout's own `.git`, so this write lands in the
  same shared config file the main checkout reads — there is no per-worktree
  override to reconcile separately. `git config --show-origin --get
  user.email` already returned `file:/root/.gitconfig` with the correct
  address before this change: the harness provisions a
  `session-start-git-identity.sh` companion from outside the image at every
  boot (named in D12's mtime sweep, re-stamped 07:43:48–59 alongside
  `launcher-settings.json`), which is a global (not repo-local) fix and
  explains why interactive commits since roughly 2026-08-20 already carry
  the right identity. This change adds an explicit repo-local value as a
  second, independent copy of the same fact.
- **Honest limit: this is not durable on its own.** `git config`, local or
  global, is a write to the container's filesystem. Per D12, nothing written
  from inside the container survives a boot restored from the frozen
  2026-08-12 image — a config value set today is exactly the kind of write
  that boot silently discards. Only two things are durable here: the
  harness's own external provisioning (outside this repo's control) and
  whatever this repository has actually committed.
- **The one thing that is durable: `.claude/hooks/session-start.sh`.**
  Following the exact pattern D12 already established for
  `recover-stale-checkout.sh` (a harness-provisioned copy plus a
  repo-committed fallback that self-heals once the environment image is
  refreshed), the main-checkout-only branch of the session-start hook now
  sets `user.email`/`user.name` locally, but only when neither is already
  set — so it can never override a deliberately different identity, and it
  is a pure no-op on every boot where the harness's own copy has already
  done the job. No new test file: `session-start.sh` has never been under
  `tests/` (it is exercised the same way the rest of the hook always has
  been, by running at session start), unlike `recover-stale-checkout.sh`,
  which does have its own suite and is unaffected by this change.

### What remains only the owner can decide

Nothing here rewrites, relabels, or hides the 929 bot-identity commits.
Reattributing history — if ever wanted — is the same operation and the same
risk D11 already declined for a single commit, at roughly 280x the blast
radius: `git rebase --root`, a force-push racing a 3-hourly cron, and every
live agent worktree stranded on SHAs that stop existing. That trade was not
this task's to make, and the measurement above is the reason, not an
assertion.

---

## D15 — The stale-checkout guard's ancestry test can be wrong in a shallow repository, and now deepens once before trusting a "no"

**Diagnosed 2026-08-31, fixed 2026-09-01.** `scripts/recover-stale-checkout.sh`
(D12) and `.claude/hooks/session-start.sh` (D10) both refuse to advance a
checkout unless `git merge-base --is-ancestor HEAD origin/<branch>` proves
HEAD is genuinely behind with no divergence. On 2026-08-31 that check
produced a false refusal on the real branch:

- The session-start hook printed: `REFUSING to act: 'claude/…' has 50
  commit(s) origin does not (50 behind)`.
- `git branch -vv` agreed: `ahead 50, behind 50`.
- HEAD was `ece56a9` ("Rebuild demo: 2026-08-27 harvest"), a real, dated
  commit.
- `git merge-base HEAD origin/<branch>` returned `ece56a9` itself — which,
  by definition, means HEAD *is* an ancestor of origin.
- `git merge-base --is-ancestor ece56a9 origin/<branch>` exited 1 (false),
  directly contradicting the line above.
- `git rev-parse --is-shallow-repository` was `true`.
- Cross-checked against GitHub's own API rather than the local clone:
  `ece56a9` and its predecessors are genuinely part of origin's linear
  history. There was no real divergence — the "50 ahead" was an artefact of
  the shallow clone's truncated commit graph.

### Reproduced, with one detail not matched

The general defect — a shallow repository's local graph making a genuine
ancestor look diverged — was reproduced directly against scratch repos,
following the same style as `tests/recoverStaleCheckout.test.ts`'s existing
fixtures (see that file, `setupShallowAncestor`, and its own comment):
shallow-clone a worker at `--depth=3` (from a `file://` remote — plain paths
silently ignore `--depth`, per git's own warning), advance the origin by
more commits than the clone depth, then re-shallow the worker at that same
fixed depth against the new tip. That re-shallow severs the local graph:
the new shallow boundary lands strictly after the old HEAD, so HEAD and the
new tip end up as two islands that share no commit either walk can reach,
even though they are the same linear history. After that: `git merge-base
--is-ancestor HEAD origin/master` → exit 1, `git rev-list --count
origin/master..HEAD` → a false "3 ahead" for a HEAD that is provably nothing
but 5 commits behind — the same symmetric ahead/behind shape as the real
incident's "50/50". An ordinary `git fetch` with no `--depth` — exactly what
the script itself calls — neither causes this on its own nor repairs an
already-severed graph; it was confirmed empirically that only an *explicit*
re-shallow (the same fixed depth applied again against a moved tip)
produces the severed state, and that a plain fetch afterwards leaves
`.git/shallow` untouched.

**Not reproduced:** the real incident's `git merge-base` (without
`--is-ancestor`) returning `ece56a9` itself — i.e. finding the correct
answer — while `--is-ancestor` on the very same two commits returned false.
Every reproduction here had `merge-base` and `--is-ancestor` agreeing (both
wrong) before the fix and both agreeing (both right) after it; the plain
`merge-base` call never independently found the right answer on a graph
`--is-ancestor` had already failed on. That asymmetry may be a more specific
git internal (a stale commit-graph generation number, or a different git
version's behaviour) than the general severed-graph shape reproduced here.
It is recorded as unreproduced rather than asserted away — the fix below
does not depend on it: whatever the precise mechanism, the underlying claim
this repo can act on is the one that was actually demonstrated — **a
shallow repository's local graph can misreport a genuine ancestor as
diverged** — and that is what the fix addresses.

### The fix — deepen once, only when shallow, only when the check has already failed

`scripts/recover-stale-checkout.sh`: when `--is-ancestor` says no, the
script now checks `git rev-parse --is-shallow-repository` before believing
it. Only if that is true does it attempt one `timeout "$FETCH_TIMEOUT" git
fetch --quiet --unshallow origin "$branch"`, under the same hard timeout
every other network call in this script already uses, and only then does it
re-ask the same question. Three outcomes, each covered by a new test in
`tests/recoverStaleCheckout.test.ts`:

1. **Genuinely just shallow.** The deepen completes, `--is-ancestor` now
   agrees with the real history, and the checkout fast-forwards exactly as
   it would have if the repo had never been shallow. Verified against the
   scratch fixture: `git rev-parse --is-shallow-repository` is `false`
   afterwards and HEAD lands on `origin/master`.
2. **Genuinely diverged, shallow or not.** The deepen still runs — shallowness
   alone does not tell you which case you are in — but `--is-ancestor` still
   correctly says no afterwards, because the divergence is real, not a graph
   artefact. The script refuses exactly as before. Verified with a fixture
   that adds one genuine local-only commit on top of the same severed-graph
   setup.
3. **The deepen itself fails** (network trouble, timeout). The script never
   trusts an unproven ancestry check either way: it warns and leaves the
   checkout untouched, the same fail-safe shape as every other network
   failure in this script. Verified with a `git` shim on `PATH` that fails
   only the `--unshallow` fetch and passes everything else through to the
   real binary, confirming the script's own preceding ordinary fetch still
   succeeds and only the deepen attempt is what's simulated as broken.

What this does **not** change: the contract itself. `--unshallow` is
attempted at most once, gated strictly on `is-shallow-repository` being
true and the plain check having already failed — it is never run on a
non-shallow repo (where it would simply error), never run when the ordinary
check already succeeds, and its result is re-checked with the exact same
`--is-ancestor` call as before, not assumed. Nothing here widens what counts
as safe to act on; it only replaces an unprovable local "no" with a proven
one wherever that is possible within the existing timeout, and fails
exactly as before wherever it isn't.

### What was deliberately left alone

`.claude/hooks/session-start.sh`'s own, separate `--is-ancestor` check
(used for the ordinary fast-forward-and-report path, not the phantom-diff
recovery) was not given the same deepen step. `recover-stale-checkout.sh`
already runs first on every boot (per D12) and, after this fix, leaves the
repository unshallowed whenever it successfully deepens — so by the time
`session-start.sh`'s own check runs, a shallow repository that could be
deepened already has been, and one that could not already produced a
warning. Duplicating the deepen logic there would be exercising the same
fix twice for no case it would newly cover; if that assumption turns out
wrong in practice, the fix belongs in the same place, not copied.

---

## D16 — Unverified is a missing-signature problem, not an identity problem; fixed forward for interactive commits, refused for CI, and the nag was already narrower than assumed

**Diagnosed and partly fixed 2026-09-01, as the direct follow-on to D14.** D14
established *who* the 929 bot-identity commits are (mostly genuine scheduled
CI output) and refused to rewrite history to relabel them. It did not
explain why GitHub shows commits "Unverified" in the first place, and
changing `user.name`/`user.email` — everything D14 actually changed — cannot
fix that: identity and signature are different fields entirely.

### The real mechanism, confirmed against GitHub's own docs

GitHub's own definitions ([About commit signature
verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)):
"Verified" means "the commit is signed and the signature was successfully
verified"; a commit with no signature at all gets no verification badge (not
"Unverified" as a distinct status, just absent) — so every commit landing
here as literally *Unverified* rather than badge-less is more precisely a
"signed but the signature could not be verified" case, per [Checking your
commit and tag signature verification
status](https://docs.github.com/en/authentication/troubleshooting-commit-signature-verification/checking-your-commit-and-tag-signature-verification-status).
Three signature types are accepted: GPG, SSH, and S/MIME. For verification
to succeed, GitHub's own troubleshooting guidance is explicit that the
committer email must be "an email address that is verified for your GitHub
account" — the key alone is not enough; the account holding the key must
also own the exact committer email as a verified address on that account.

For automation specifically, the crux the task asked to confirm: commits
made **through the GitHub API** (REST Contents API, REST Git Data API, or
the `createCommitOnBranch` GraphQL mutation) using a workflow's
`GITHUB_TOKEN` are automatically GPG-signed by GitHub itself and come back
Verified — this is corroborated by GitHub's changelog for
`createCommitOnBranch` ("Commits authored using the new API are
automatically GPG signed and are marked as verified in the GitHub UI") and
is the entire premise behind the Marketplace actions that exist solely to
convert `git commit`/`git push` workflows to API-based commits for this
reason (`verified-bot-commit`, `push-signed-commits`, and similar). A commit
made the ordinary way — `git commit` on a runner, then `git push` — carries
no signature GitHub adds on its own; that mechanism is what
`scripts/commit-and-push.sh` uses today, unconditionally, for all 582+
counted CI commits.

### What was tested directly, not just read

Rather than trust the docs alone, this was checked against the actual
container:

- `git config --show-origin --list` shows the harness (`/root/.gitconfig`)
  already sets `commit.gpgsign=true`, `gpg.format=ssh`, and
  `gpg.ssh.program=/tmp/code-sign` (a symlink to
  `/opt/env-runner/environment-manager`) — SSH commit signing infrastructure
  already exists for interactive sessions, independent of anything D14 or
  this entry changed.
- A throwaway commit in a scratch repo (`/tmp/.../sigtest/repo`, never
  pushed anywhere) confirmed this is not inert config: `git commit` there
  produced a real `gpgsig` trailer, an SSH signature, not an empty one.
  `git log --show-signature` itself reported "no signature" — but that is a
  *local display* limitation (`gpg.ssh.allowedSignersFile` isn't configured
  in this container, so git can't verify locally), not evidence the
  signature is missing; `git cat-file -p` on the raw commit object shows the
  `gpgsig` block directly, and the same is true of this branch's own recent
  `noreply@anthropic.com` commits (e.g. `471459d0`, `4a775289` — both carry
  a real `gpgsig` trailer, confirmed the same way).
- The public key itself isn't readable from disk —
  `/home/claude/.ssh/commit_signing_key.pub`, the path `user.signingkey`
  points at, is a 0-byte placeholder; `/tmp/code-sign` doesn't read it, it
  signs via whatever the environment-manager holds and only takes the path
  as a label. The actual key was recovered by parsing the real SSHSIG
  wire format (`SSHSIG` magic, version, length-prefixed publickey/namespace/
  reserved/hash-alg/signature fields — the same structure two independent
  test commits both decoded to) out of a produced signature:
  `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKy87HxSEheG8vEPhSs9u2KZCtVErAQfpmprtUJCZ2w7`.
  Two commits made minutes apart in this container decoded to the exact same
  key, so it is stable at least within one container's lifetime; whether it
  is stable across a fresh container/session was not testable from here and
  is not claimed.
- `mcp__github__get_commit` on `471459d0` (a `noreply@anthropic.com` commit
  already on `origin/claude/scentday-retailer-registry-h92tth`) resolves
  `author.login` / `committer.login` to a real GitHub account: `claude` (id
  `81847`, https://github.com/claude). That account is not this repo's
  owner's — `noreply@anthropic.com` is not a mailbox `urkoppan@gmail.com`
  can receive mail at or verify on her own account. The GitHub REST API's
  raw `commit.verification` object (which would state the exact
  verified/reason for this commit) was not retrievable: direct
  `api.github.com` calls are blocked by this environment's proxy ("GitHub
  access is not enabled for this session... connect the Claude GitHub App"),
  and the MCP `get_commit`/`list_commits` tools available here don't surface
  that field. So the *exact* GitHub-stated reason for Unverified on this
  specific commit could not be read — but every fact that can be checked
  points at the same explanation the docs give: the commit is genuinely
  signed, with a real and stable key, under an email that resolves to a
  real but not owner-controlled GitHub account, and GitHub's own
  requirement is that the account with the matching verified email must
  also hold the signing key.

### What this means for each of the three commit paths

**Interactive Claude-session commits (`noreply@anthropic.com`, 148+ commits
per D14's table).** Signing already happens, automatically, on every commit
this session makes — nothing needed changing here technically. What is
missing is registration: the SSH public key above needs to be added, as a
*signing* key, to whichever GitHub account's verified emails include
`noreply@anthropic.com`. That is `github.com/claude` (id 81847) — an
Anthropic-controlled account, not this repo owner's. **This is not an action
the repo owner can take.** She cannot verify `noreply@anthropic.com` on her
own account (she doesn't control that mailbox), and without that no key
registered anywhere makes these specific commits Verified.

There is one path that *is* in the owner's control, evidenced by D14's own
table: 5 of the sampled interactive commits already carry
`urkoppan@gmail.com` (name "Claude") rather than `noreply@anthropic.com`,
alongside 44 under her own name — meaning a session identity of
`urkoppan@gmail.com` is a real, already-occurring configuration, not a
hypothetical. Because the signing key is provisioned per-container by the
harness regardless of which `user.email` is configured (the key comes from
`/tmp/code-sign`, not from the email), any future commit made under
`urkoppan@gmail.com` would be signed with the same mechanism. If she adds
this exact key —

    ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKy87HxSEheG8vEPhSs9u2KZCtVErAQfpmprtUJCZ2w7

— to her own GitHub account as a **signing** key (Settings → SSH and GPG
keys → New SSH key → Key type: "Signing Key" → paste the line above → Add
SSH key), then any commit made under `urkoppan@gmail.com` in a container
carrying this key would come back Verified. Two things she should know
before doing this: (1) it applies only to commits actually made as
`urkoppan@gmail.com`, not the `noreply@anthropic.com` default — worth
confirming with whoever configures session identity policy whether that's
the intended default identity to standardize on; (2) whether this exact key
is stable across every future container was not established here (see
above) — if the harness rotates it per-container, the key would need
re-adding whenever that happens, and there is no way from inside a session
to detect that it changed other than commits reverting to Unverified again.

**CI harvest commits (`bot@users.noreply.github.com`, 582+ commits, the
large majority of D14's count).** No signing infrastructure exists for this
path at all today — `scripts/commit-and-push.sh` runs a plain `git commit` +
retry-loop `git push` on a self-hosted Actions runner, with no
`gpgsign`/key configured. The theoretical fix — route these commits through
the GitHub API (REST Git Data API: blob/tree/commit/ref, or
`createCommitOnBranch`) using the workflow's own `GITHUB_TOKEN` — was
investigated, and **deliberately not landed.** Reasons, weighed against this
being the pipeline that was down for ~12 hours today and unblocked only an
hour before this task began:

1. **File sizes make the naive per-call-site swap unsafe for 4 of 9 call
   sites.** `demo/catalogue.generated.ts` is 19.3 MB and
   `demo/index.html`/`demo/404.html` are 18.3 MB each (measured directly,
   `ls -la demo/`). GitHub's Git Data API blob endpoint is documented to
   support blobs "up to 100 megabytes" for retrieval; creation isn't
   separately size-documented but is presumed to share the same underlying
   100 MiB object ceiling `git`/GitHub enforce everywhere else (["About
   large files on
   GitHub"](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github):
   "GitHub blocks files larger than 100 MiB"). These files are individually
   under that, but base64 inflates each ~1.37x for the request body (~26 MB
   for the largest), multiplied across however many of the 4-5 files a
   given call site touches, in a single Actions job. Whether GitHub's API
   actually accepts a request that shape reliably was not established —
   real-world reports for the simpler single-file Contents `PUT` endpoint
   describe 422s in the 50 MB range in practice even though the documented
   ceiling is higher, and no equivalent field data exists for the
   multi-blob Git Data API. **Testing this against the real production
   branch to find out is exactly the kind of gamble the task setup warned
   against.**
2. **The retry/conflict logic has no API equivalent, and reimplementing it
   blind is the larger risk.** `commit-and-push.sh`'s rebase-and-retry loop
   exists because of specific, named incidents (runs #15/#17, #124/#126,
   #236, #266/#268 — see that script's own comments) and encodes real
   lessons: which conflicts are safe to auto-resolve
   (`is_generated`/`is_raw_snapshot`), which direction `--ours`/`--theirs`
   means inside a rebase, and how to tell a stalled rebase from a dirty
   tree. The Git Data API's model is a single atomic compare-and-swap
   (`update-ref` with an expected parent SHA) with no rebase primitive at
   all — porting this script's behavior means re-deriving the equivalent of
   a three-way tree merge against the Git Data API's primitives from
   scratch, with no prior incident history to have already shaken the bugs
   out of it, on the exact branch that a 3-hourly (per D14/D13) cron is
   actively pushing to.
3. **The 9 call sites are not uniform.** Grep found `commit-and-push.sh`
   invoked from `catalogue-daily.yml` (7 sites), `image-check.yml`, and
   `price-verify.yml`, each committing a different subset of paths.
   `Harvest: real prices` (256, the single largest template),
   `Image links` (117), and `Shipping terms` (48) — 421 of the 582 counted
   mechanical commits, 72% — never touch the oversized `demo/*` files at
   all, so file size isn't actually a blocker for the majority of commit
   *volume*. But `Awin feed sync` (72), `Top Deals Today` (71), and
   `Rebuild demo` (18) all do, and `commit-and-push.sh` is one shared,
   already-hardened script; splitting it into two commit mechanisms
   (API for small payloads, git for large ones) doubles the surface a
   future incident can come from, on a script whose entire documented
   history is incidents.
4. **Bonus finding, unprompted:** converting would also change the CI
   committer identity from `pricesniffs-bot`/`bot@users.noreply.github.com`
   to `github-actions[bot]` (the identity the API/`GITHUB_TOKEN` commits
   under) — a visible attribution change beyond just the badge, worth the
   owner deciding on deliberately rather than as a side effect.

If this is ever revisited, the safe order is: prototype against a disposable
scratch branch first (never this production branch), starting with the
three small-file call sites where size is a non-issue (72% of volume, zero
of the size risk), and leave the four large-file call sites on the git path
until the Git Data API's actual behavior at ~20 MB blobs has been observed
directly rather than inferred from documentation and forum reports.

**The stop-hook (`/root/.claude/stop-hook-git-check.sh`).** This entry's
task description said the hook "flags immutable historical commits... on
every single run" and proposes a full-history rebase. Reading the actual
installed script does not match that: it scopes to `git rev-list HEAD --not
--remotes` — commits reachable from local HEAD but from no remote-tracking
ref, i.e. never-yet-pushed commits only — and separately reports commits
ahead of upstream. It never walks full project history, and its rebase
advice (`git commit --amend` / `git rebase --exec ... $rebase_onto`, where
`$rebase_onto` is always a boundary inside the *unpushed* range) never
touches a commit already on `origin`, so it never actually recommends a
force-push despite this task's framing suggesting it does. Run directly
against this session's real, clean, fully-pushed worktree
(`echo '{"stop_hook_active": false}' | bash
/root/.claude/stop-hook-git-check.sh`), it exits 0 with no output — it does
not cry wolf here today. Whatever produced the "every single run" framing
this task started from was evidently a different or earlier state of this
file (its own comments cite specific fixed issues, e.g.
`anthropics/claude-code#69586`, so it is an actively maintained piece of
harness infrastructure, not a static artifact).

The one real, evidenced gap: this hook's `--not --remotes` computation never
checks `git rev-parse --is-shallow-repository` before trusting it, unlike
D15's fix to `recover-stale-checkout.sh` in this same repo — and D15 proved
directly, by reproduction, that a shallow repository's local graph can
misreport genuinely-published commits as locally-diverged. In principle the
same pathology could make this hook over-count "local-only" commits and
recommend amending/rebasing commits that are secretly already public. This
was not reproduced against this specific script (it is not part of this
repo's test suite, and this task's scope did not extend to building a
harness-level repro for a script this repo does not own). It is very
plausibly already covered in practice, for the same reason D15 gave for not
duplicating its own deepen fix into `session-start.sh`'s separate check:
`recover-stale-checkout.sh` runs at the start of every session (per D12) and
unshallows the repo whenever it finds one, before this Stop hook ever runs
later in the same session — so by the time this hook's ancestry check runs,
the shallow-graph pathology D15 fixed has typically already been cleared.
The residual case D15 itself did not close either: a checkout that becomes
shallow again *after* `recover-stale-checkout.sh` has already run in the
same session.

**No change was made to `stop-hook-git-check.sh`.** Two independent reasons,
both sufficient alone: (1) nothing here was actually observed to misfire —
inventing a fix for an unreproduced bug is exactly the "guess and hope" move
D10/D12/D14 already refuse; and (2) per D12's established finding, this file
lives outside the repo (`/root/.claude/`), is provisioned by the harness,
and is not durable across a container rebuild regardless — the same honest
limit already recorded for the SessionStart identity fix in D14 applies
here without needing to be re-derived.

### What was actually changed

Nothing in this repository's runtime code. This entry is documentation only:
the mechanism, what was verified directly against this container and
against GitHub's API, and the reasoning for not landing the CI-path
conversion or hand-editing harness-owned infrastructure. No key material,
generated or otherwise, was added to the repository — the public key quoted
above was recovered by decoding an already-produced signature, not
generated here, and only the public half is quoted, which is safe to record
(an SSH signing public key is not a secret; it's the thing meant to be
published to an account's key list).

### What remains only the owner can decide

- **Registering the interactive-path key is not owner-actionable for the
  default identity.** `noreply@anthropic.com` resolves to an
  Anthropic-controlled account (`github.com/claude`), not
  `urkoppan@gmail.com`'s. Only whoever controls that account can register a
  signing key against it.
- **Registering it for `urkoppan@gmail.com` is owner-actionable in minutes**
  (steps above), but only fixes commits actually made under that identity,
  and depends on the signing key being stable across containers — unverified
  here.
- **Whether to convert any of the CI path to API-based commits, and in what
  order, is the owner's call**, informed by the size/retry/identity findings
  above — not something this entry decided for her, on a pipeline that had
  just come back from a 12-hour outage.
