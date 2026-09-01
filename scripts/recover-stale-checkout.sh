#!/usr/bin/env bash
#
# Recover the main checkout from the frozen-snapshot revert, and only from it.
#
#   scripts/recover-stale-checkout.sh
#
# ── Why this exists ──────────────────────────────────────────────────────────
# This branch's remote container restores its disk from a checkpoint frozen at
# 2026-08-12 ~23:13 UTC on (some) resumes — see docs/DECISIONS.md D10 and D12.
# Every such boot re-materialises the same two symptoms:
#
#   1. HEAD back at c9fc2b1 (2026-08-12 23:11:14), weeks behind origin;
#   2. one uncommitted diff in src/catalogue/awinFeed.ts — a 14-line comment
#      insertion about `merchant_deep_link` that was sitting uncommitted in
#      the working tree at the moment the checkpoint was taken. It was
#      committed 15 minutes later as 851bae4 and superseded by 5240fae the
#      next morning, so it is pure history replayed, not work.
#
# The Stop hook then sees "uncommitted changes" and asks for them to be
# committed and pushed — which would publish a two-week-old falsehood on top
# of a two-week-old HEAD. Through 2026-08-27 that was averted thirteen times
# by a human or agent reading the diff and recovering by hand. This script is
# that recovery, made automatic exactly as far as it can be made safe, and no
# further.
#
# ── The safety contract ──────────────────────────────────────────────────────
# The only destructive command here is `git checkout -- <one file>`, and it
# runs only when the working tree's entire dirty state is that one known file
# carrying exactly the known insertion — verified by hashing the diff's added
# lines, not by filename. A single extra changed file, a single staged change,
# a single untracked file, one added or removed line more: the script prints
# what it found and touches nothing. Real uncommitted work can never match,
# because the signature is the SHA-256 of a specific historical edit.
#
# Advancing is `git merge --ff-only`, nothing else: no reset --hard, no
# checkout --force, no clean, no stash, no force anywhere. A diverged
# checkout (any local commit origin lacks) is reported loudly and left
# exactly as it is. A fetch that fails or hangs warns once and exits 0 — a
# session start is never blocked on the network. Healthy checkout: silent
# no-op. The script is idempotent and safe to run on every boot.
#
# In a shallow repository, "any local commit origin lacks" is asked twice
# before it is trusted: once against the graph as fetched, and — only if
# that says no and only because `--is-shallow-repository` is true — once
# more after a single `git fetch --unshallow`, under the same fetch timeout
# as everything else here. This never widens what counts as safe: it only
# replaces an unprovable "no" (a shallow graph missing the link) with a
# provable one. A HEAD that is genuinely diverged is refused exactly as
# before, deepened or not (docs/DECISIONS.md D15).
#
# ── Parameters (all optional, env) ───────────────────────────────────────────
#   RECOVER_PHANTOM_FILE    path of the one file the phantom appears in
#   RECOVER_PHANTOM_SHA256  sha256 of the insertion's added lines, in order,
#                           newline-terminated, as `git diff` emits them
#                           (leading '+' stripped)
#   RECOVER_PHANTOM_LINES   how many added lines the insertion has
#   RECOVER_FETCH_TIMEOUT   seconds before the fetch is abandoned
#
# The defaults are the real signature, pinned from the frozen image itself:
# the added lines of `git diff c9fc2b1 -- src/catalogue/awinFeed.ts` against
# the snapshot's working copy hash to the value below (14 lines, 0 removals).
set -uo pipefail

# A session hook must never wedge startup: every exit from here is 0.
trap 'exit 0' ERR

PHANTOM_FILE="${RECOVER_PHANTOM_FILE:-src/catalogue/awinFeed.ts}"
PHANTOM_SHA256="${RECOVER_PHANTOM_SHA256:-7da5738ce7c17d57907ae941d2de9c4a9ea8982be5a3584e947861f540c8eee5}"
PHANTOM_LINES="${RECOVER_PHANTOM_LINES:-14}"
FETCH_TIMEOUT="${RECOVER_FETCH_TIMEOUT:-20}"

say() { printf '[recover-stale-checkout] %s\n' "$*"; }

repo="${CLAUDE_PROJECT_DIR:-}"
if [ -n "$repo" ]; then
  cd "$repo" 2>/dev/null || exit 0
fi

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Main checkout only. A linked worktree (git-dir != git-common-dir) is an
# agent's own throwaway branch with its own base; fast-forwarding it to
# origin would be wrong, so exit before touching anything.
if [ "$(git rev-parse --git-dir 2>/dev/null)" != "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
  exit 0
fi

# A branch checkout only. Detached HEAD is not this script's situation.
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || exit 0
[ -n "$branch" ] || exit 0

git remote get-url origin >/dev/null 2>&1 || exit 0

# Fetch with a hard timeout. The checkpointed boot this exists for has working
# networking, so a failure here means something else is wrong — say so once
# and get out of the way rather than holding the session's start hostage.
if ! timeout "$FETCH_TIMEOUT" git fetch --quiet origin "$branch" 2>/dev/null; then
  say "WARNING: could not fetch origin/$branch within ${FETCH_TIMEOUT}s — checkout may be stale, nothing was changed."
  exit 0
fi

remote="$(git rev-parse --quiet --verify FETCH_HEAD 2>/dev/null)" || exit 0
local_head="$(git rev-parse --quiet --verify HEAD 2>/dev/null)" || exit 0

# Divergence: any local commit origin does not have. This script has no
# business reconciling someone's unpushed commits, so it says so and stops.
#
# ── The shallow-clone false refusal (2026-08-31) ────────────────────────────
# `--is-ancestor` walks the LOCAL commit graph only. In a shallow repository
# that graph can be missing the link between an old, genuinely-shared HEAD
# and a since-advanced origin — not because the two disagree, but because a
# later shallow fetch grafted a new boundary ahead of HEAD, leaving two
# disconnected islands of history that happen to share no commit either
# walk can reach. Reproduced directly against a scratch repo: clone
# `--depth=3`, advance origin, `git fetch --depth=3` again (an ordinary
# re-shallow, not a bug) — `--is-ancestor` reports non-ancestor and
# `rev-list --count` reports a false, perfectly symmetric N-ahead/N-behind
# for a HEAD that is provably, actually behind and nothing else. On
# 2026-08-31 this produced exactly that shape on the real branch: "50
# commit(s) origin does not have (50 behind)" for a HEAD GitHub's own API
# confirmed was genuinely on origin's line. `git fetch --unshallow` against
# the same scratch repo — one call, gated on `--is-shallow-repository` so it
# is never attempted on a complete repo, and under the same fetch timeout as
# every other network call here — made the graph complete and both
# `merge-base` and `--is-ancestor` agree correctly afterwards; run again
# against a scratch repo that had *also* picked up a genuine local-only
# commit alongside the shallow artefact, the deepen still leaves
# `--is-ancestor` correctly refusing. So: never trust a shallow graph's "no"
# without first trying to complete it, but never let that attempt widen what
# counts as safe to act on.
if ! git merge-base --is-ancestor "$local_head" "$remote" 2>/dev/null; then
  if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
    say "Ancestry check failed on a shallow repository — deepening once before trusting it."
    if timeout "$FETCH_TIMEOUT" git fetch --quiet --unshallow origin "$branch" 2>/dev/null; then
      remote="$(git rev-parse --quiet --verify FETCH_HEAD 2>/dev/null)" || remote="$remote"
      if git merge-base --is-ancestor "$local_head" "$remote" 2>/dev/null; then
        say "Deepened: the shallow graph was hiding a real ancestor relationship. Proceeding."
      fi
    else
      say "WARNING: could not deepen the shallow history within ${FETCH_TIMEOUT}s. Treating the ancestry"
      say "check as unproven rather than trusting a shallow 'no' — nothing was changed."
      exit 0
    fi
  fi
fi

if ! git merge-base --is-ancestor "$local_head" "$remote" 2>/dev/null; then
  ahead="$(git rev-list --count "$remote..$local_head" 2>/dev/null || echo '?')"
  behind="$(git rev-list --count "$local_head..$remote" 2>/dev/null || echo '?')"
  say "REFUSING to act: '$branch' has $ahead commit(s) origin does not ($behind behind)."
  say "Those commits exist nowhere else. Reconcile by hand — nothing was changed."
  exit 0
fi

# ── The phantom check ────────────────────────────────────────────────────────
# Discard requires the tree's ENTIRE dirty state to be the one known file:
# nothing staged, nothing untracked, and `git status --porcelain` naming
# exactly that path as modified — then the diff itself must be insertion-only,
# with exactly the expected number of added lines, hashing to the expected
# value. Anything else is (or could be) real work, and real work is never
# adjudicated here: it is printed and left alone.
porcelain="$(git status --porcelain 2>/dev/null)"

if [ -n "$porcelain" ]; then
  if [ "$porcelain" = " M $PHANTOM_FILE" ] && git diff --cached --quiet 2>/dev/null; then
    diff_out="$(git diff HEAD -- "$PHANTOM_FILE" 2>/dev/null)"
    added="$(printf '%s\n' "$diff_out" | grep '^+' | grep -v '^+++' | sed 's/^+//')"
    added_count="$(printf '%s\n' "$diff_out" | grep -c '^+[^+]' || true)"
    removed_count="$(printf '%s\n' "$diff_out" | grep -c '^-[^-]' || true)"
    added_sha="$(printf '%s\n' "$added" | sha256sum | cut -d' ' -f1)"

    if [ "$removed_count" -eq 0 ] && [ "$added_count" -eq "$PHANTOM_LINES" ] && [ "$added_sha" = "$PHANTOM_SHA256" ]; then
      git checkout -- "$PHANTOM_FILE" 2>/dev/null
      say "Discarded the known snapshot phantom in $PHANTOM_FILE ($PHANTOM_LINES lines, sha256 verified)."
    else
      say "NOT the known phantom: $PHANTOM_FILE is modified but its diff does not match the pinned signature"
      say "(added=$added_count removed=$removed_count sha256=$added_sha). Treating it as real work — nothing was changed."
      exit 0
    fi
  else
    say "REFUSING to touch a dirty tree that is not exactly the known phantom. Found:"
    printf '%s\n' "$porcelain" | sed 's/^/    /'
    say "Nothing was changed. Review and recover by hand (see docs/DECISIONS.md D12)."
    exit 0
  fi
fi

# ── Advance ──────────────────────────────────────────────────────────────────
if [ "$local_head" = "$remote" ]; then
  # Healthy and level: stay silent so a clean boot logs nothing.
  exit 0
fi

behind="$(git rev-list --count "$local_head..$remote" 2>/dev/null || echo '?')"
if git merge --ff-only --quiet "$remote" 2>/dev/null; then
  say "Fast-forwarded '$branch' $behind commit(s) to origin (${remote:0:7})."
else
  say "Fast-forward to origin/$branch was refused; nothing was changed. Review 'git status' by hand."
fi

exit 0
