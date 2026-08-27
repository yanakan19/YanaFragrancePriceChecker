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
