#!/bin/bash
#
# SessionStart hook — bring the checkout up to origin before anyone edits it,
# and never, under any circumstance, throw away work to do it.
#
# ── Why this exists ────────────────────────────────────────────────────────
#
# On 2026-08-25 this branch's container came up three times holding the tree as
# it stood at c9fc2b1 ("Never subtract one currency from another and report the
# difference in pounds", 2026-08-12 23:11), thirteen days behind origin, with
# `git status` clean so nothing looked wrong. The damage that nearly followed
# was not lost work — origin was intact every time — but the reverse: the stale
# tree carries an older src/catalogue/awinFeed.ts whose header calls
# `merchant_deep_link` an unmapped "known gap", which stopped being true on
# 2026-08-13 when 5240fae mapped it. Committing that tree republishes a
# documented falsehood into the file whose job is recording what was verified,
# and the Stop hook actively asks for uncommitted changes to be pushed.
#
# The cause is underneath the repo, not in it. The container's disk image is a
# checkpoint frozen at 2026-08-12 23:11:14 — the whole root filesystem holds no
# file with an mtime anywhere in the thirteen days between then and 2026-08-25,
# and the newest pre-restore file on it is .git/COMMIT_EDITMSG at exactly that
# second. Nothing written since has ever been persisted back into it, so every
# resume starts from that same commit. This hook cannot fix that, and does not
# pretend to. It is the guard for the case it *can* reach: a session that boots
# on a checkout behind origin, which is also the ordinary condition here, since
# the harvest job pushes to this branch roughly every two hours.
#
# ── Why it cannot destroy work ─────────────────────────────────────────────
#
# The only command here that writes to the working tree is `git merge --ff-only`.
# There is no reset, no checkout --force, no clean, no stash, no restore.
#
#   1. Local commits. A fast-forward is refused by git unless HEAD is already an
#      ancestor of the target, so it can never drop a commit; and this script
#      tests that ancestry itself first and exits without touching anything if
#      it fails. A checkout that has diverged from origin is left exactly as it
#      is, because a hook has no business deciding how someone's unpushed
#      commits get reconciled.
#   2. Uncommitted edits. `--ff-only` runs the same "would this overwrite local
#      changes" check as checkout: if a modified file stands in the way, git
#      aborts and leaves the tree untouched. Modified files the incoming
#      commits do not touch are carried across unchanged.
#   3. Untracked and ignored files are never removed. Nothing calls git clean.
#
# So the worst outcome available to this script is that it declines to advance
# and says so. That asymmetry is deliberate: being stale is recoverable in one
# command, and losing someone's afternoon is not.
#
# ── The one judgement it refuses to make ───────────────────────────────────
#
# A stale-snapshot phantom diff and real uncommitted work are the same thing to
# `git status`, and no rule that guesses between them is safe to run unattended
# — guessing wrong deletes real work, which is far worse than the staleness it
# would be fixing. So this hook never adjudicates. It reports instead, using
# the one signal that is actually evidence: if a modified file's current
# contents hash to a blob this same path genuinely had at an earlier commit,
# that is a replay of old content rather than something newly written, because
# new work does not coincidentally reproduce a historical revision byte for
# byte. That finding is printed for a human or the agent to act on. It is never
# acted on here.

set -uo pipefail

# Never wedge session startup. Every path below ends at exit 0.
trap 'exit 0' ERR

say() { printf '%s\n' "$*"; }

# Web sessions are the ones that come up on a restored container. A local
# checkout is the developer's own, and a hook has no business fetching into it.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

repo="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$repo" ]; then
  repo="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
fi
cd "$repo" 2>/dev/null || exit 0

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Only ever act on the main checkout. Agent worktrees under .claude/worktrees
# are on their own throwaway branches with their own bases; fast-forwarding one
# of those to origin would be meaningless at best.
if [ "$(git rev-parse --git-dir 2>/dev/null)" != "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
  exit 0
fi

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || branch=""
if [ -z "$branch" ]; then
  say "[session-start] Detached HEAD — leaving the checkout alone."
  exit 0
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  exit 0
fi

if ! git fetch --quiet origin "$branch" 2>/dev/null; then
  say "[session-start] Could not fetch origin/$branch. The checkout may be behind; check before committing."
  exit 0
fi

remote="$(git rev-parse --quiet --verify FETCH_HEAD 2>/dev/null)" || remote=""
local_head="$(git rev-parse --quiet --verify HEAD 2>/dev/null)" || local_head=""
if [ -z "$remote" ] || [ -z "$local_head" ]; then
  exit 0
fi

# Name any modified file whose contents are a byte-for-byte replay of a revision
# this path genuinely had before. Read-only, and it runs whatever the branch
# state is: the lone phantom diff seen through 2026-08-25 turned up on a
# checkout that was already level with origin, so a scan gated on being behind
# would have missed the case it exists for.
report_stale_replays() {
  local f cur sha old when suspects=""
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] || continue
    cur="$(git hash-object -- "$f" 2>/dev/null)" || continue
    while IFS= read -r sha; do
      [ -n "$sha" ] || continue
      old="$(git rev-parse --quiet --verify "$sha:$f" 2>/dev/null)" || continue
      if [ "$old" = "$cur" ]; then
        when="$(git log -1 --format='%ad' --date=short "$sha" 2>/dev/null)"
        suspects+="    $f — byte-identical to its content at ${sha:0:7} ($when)"$'\n'
        break
      fi
    done < <(git log --format='%H' -n 40 "$1" -- "$f" 2>/dev/null | tail -n +2)
  done < <(git diff --name-only HEAD 2>/dev/null)

  [ -n "$suspects" ] || return 0
  say "[session-start] These modified files reproduce an earlier committed revision of themselves exactly:"
  printf '%s' "$suspects"
  say "[session-start] Freshly written work does not coincidentally match an old revision byte for byte,"
  say "[session-start] so treat that as restored stale content until you have read it. Nothing was reverted"
  say "[session-start] here — confirm which it is, then keep it or check it out, by hand."
}

report_stale_replays "$remote"

if [ "$local_head" = "$remote" ]; then
  say "[session-start] Checkout is level with origin/$branch (${remote:0:7})."
elif ! git merge-base --is-ancestor "$local_head" "$remote" 2>/dev/null; then
  # Ahead or diverged: at least one commit here exists nowhere else. Touch nothing.
  ahead="$(git rev-list --count "$remote..$local_head" 2>/dev/null || echo '?')"
  behind="$(git rev-list --count "$local_head..$remote" 2>/dev/null || echo '?')"
  say "[session-start] Branch '$branch' has $ahead commit(s) origin does not have (and is $behind behind)."
  say "[session-start] Nothing was changed. Reconcile by hand — do not reset, those commits exist nowhere else."
else
  behind="$(git rev-list --count "$local_head..$remote" 2>/dev/null || echo '?')"
  if git merge --ff-only --quiet "$remote" 2>/dev/null; then
    say "[session-start] Fast-forwarded '$branch' $behind commit(s) to origin (${remote:0:7})."
  else
    say "[session-start] Checkout is $behind commit(s) behind origin/$branch, and the fast-forward was refused"
    say "[session-start] because uncommitted changes are in the way. Nothing was changed and nothing was lost."
    say "[session-start] Review 'git status' and 'git diff', then fast-forward once the tree is clear."
  fi
fi

# Dependencies, but only when they are actually absent.
#
# The reflex here is to run `npm install` every session. That would be wrong in
# this repo, and harmfully so. package-lock.json has not changed once across the
# range this staleness spans, so an install has nothing to add; what it can do
# is normalise the lockfile, leave a modified tracked file behind, and hand the
# Stop hook a diff to demand be committed at the end of every session. A hook
# that manufactures the exact class of phantom diff it was written to warn about
# is worse than no hook. So: install only when node_modules is missing or the
# lockfile has moved under it, and never let npm write the lockfile.
needs_install=""
if [ -f package.json ]; then
  if [ ! -d node_modules ]; then
    needs_install="node_modules is absent"
  elif [ -f package-lock.json ] && [ package-lock.json -nt node_modules/.package-lock.json ]; then
    needs_install="package-lock.json is newer than the installed tree"
  fi
fi

if [ -n "$needs_install" ]; then
  say "[session-start] Installing dependencies ($needs_install)."
  lock_before="$(git hash-object -- package-lock.json 2>/dev/null || true)"
  if ! npm ci --no-audit --no-fund >/dev/null 2>&1; then
    npm install --no-audit --no-fund --no-package-lock >/dev/null 2>&1 ||
      say "[session-start] Dependency install failed — run npm ci by hand before trusting a test run."
  fi
  lock_after="$(git hash-object -- package-lock.json 2>/dev/null || true)"
  if [ -n "$lock_before" ] && [ "$lock_before" != "$lock_after" ]; then
    say "[session-start] Note: package-lock.json was rewritten by the install. That diff is npm's, not yours."
  fi
fi

exit 0
