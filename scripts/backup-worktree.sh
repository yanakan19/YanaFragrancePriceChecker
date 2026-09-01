#!/usr/bin/env bash
#
# Get a linked worktree's uncommitted and unpushed work onto origin, and only
# there — because origin is the one place docs/DECISIONS.md D12 established
# survives this container's disk. Never touches the worktree's own working
# tree, index, or HEAD; only reads them and pushes what it finds to
# dedicated, never-overwritten backup refs.
#
#   scripts/backup-worktree.sh
#
# ── Why this exists ──────────────────────────────────────────────────────────
# scripts/recover-stale-checkout.sh (D12) deliberately does nothing inside a
# linked worktree — see docs/DECISIONS.md D17 for the full reasoning. That
# guard is correct: a worktree's HEAD, branch and relationship to origin are
# its own, and fast-forwarding or discarding inside one on the main
# checkout's logic could destroy an agent's in-progress work. But every agent
# session on this project runs *inside* a linked worktree under
# .claude/worktrees/, so the checkouts most likely to be carrying hours of
# uncommitted work are exactly the ones the main-checkout recovery script
# refuses to touch.
#
# The danger in a worktree is the opposite of the danger in the main
# checkout: not a stale HEAD that should be fast-forwarded, but real work
# that could be lost if this container's disk reverts, or the container is
# simply killed and restarted, before that work is committed and pushed. D12
# already measured what survives a reverted boot: nothing written from
# inside the container. A local `git stash`, a local commit sitting only in
# this worktree's branch, a copy of the file elsewhere on disk — all exactly
# as vulnerable as the original, because they are all still just bytes on
# this same disk. Only what has reached origin is durable. So the only real
# move available here is: get the work onto origin, under a ref name that is
# never overwritten, before that window closes.
#
# ── The safety contract ──────────────────────────────────────────────────────
# Never touches the working tree, the index, or HEAD. Building a snapshot of
# uncommitted work uses a private, temporary GIT_INDEX_FILE that git reads
# the real working tree through but writes only to that temp file — the real
# .git/index for this worktree is never opened for writing, and nothing here
# ever runs `git add`, `git commit`, `git stash push`, `git checkout`, or any
# other command that would. Pushing an existing commit (HEAD itself) or a
# freshly built snapshot tree never rewrites or deletes anything on origin:
# every push targets a ref name unique to that push (a timestamp plus the
# object's own short SHA), so nothing here is ever force-pushed and nothing
# already on origin is ever at risk. A push that fails leaves the local
# worktree exactly as it was — the failure is only ever "this is not backed
# up yet," never "something was lost."
#
# Runs only inside a linked worktree (the mirror image of
# recover-stale-checkout.sh's own guard) with a branch checked out and an
# origin remote. Silent no-op when the worktree is clean and its HEAD is
# already reachable from some branch on origin — the common case, since most
# sessions end with everything pushed. A fetch or push that fails or hangs
# gets a loud, explicit warning instead of a silent shortfall: this script
# would rather say "this work is not backed up, go commit and push by hand"
# than let a session end believing it is protected when it is not.
#
# A private per-worktree marker (under this worktree's own git-dir, never the
# shared one) remembers the last HEAD and the last working-tree snapshot this
# script actually pushed, so an unchanged worktree does not grow a fresh
# backup ref on every single session start — only when there is something new
# to protect.
#
# ── Pruning ───────────────────────────────────────────────────────────────────
# refs/worktree-backup/<branch>/... never gets fast-forwarded or force-pushed
# (every push above targets a fresh, timestamped ref name), so with nothing
# removing old ones they accumulate on origin forever. prune_stale_backups
# below removes a ref only when BOTH hold:
#
#   1. It is older than BACKUP_PRUNE_DAYS (parsed from the epoch already
#      embedded in the ref name — no extra git calls needed to date it).
#   2. The work it protected is independently, already safe on some real
#      origin branch: a `commits/` ref only once its exact commit is an
#      ancestor of an origin branch tip, and a `wip/` ref only once some
#      commit reachable from an origin branch carries the identical tree —
#      i.e. that exact uncommitted snapshot really was committed and pushed
#      for real later, not merely superseded by different work.
#
# Both conditions must hold together. Age alone proves nothing (old and
# still unmerged is exactly the work this script exists to protect); safety
# alone is not enough either — a *recent* safe backup is kept too, since
# pruning it the moment it becomes redundant would leave no margin if origin
# itself needs to be rolled back. A ref this function cannot positively prove
# safe (a fetch that fails, an unrecognised ref shape) is left alone, always
# — the one hard rule this whole script already follows for its own pushes:
# never guess in the direction of data loss.
#
# ── Parameters (all optional, env) ───────────────────────────────────────────
#   BACKUP_FETCH_TIMEOUT   seconds before the confirmation fetch is abandoned
#   BACKUP_PUSH_TIMEOUT    seconds before a single backup push is abandoned
#   BACKUP_PRUNE_DAYS      age (days) a backup ref must clear before it is
#                          even considered for pruning (default 14)
#   BACKUP_PRUNE_TIMEOUT   seconds before a single prune git call is abandoned
set -uo pipefail

# A session hook must never wedge startup: every exit from here is 0.
trap 'exit 0' ERR

FETCH_TIMEOUT="${BACKUP_FETCH_TIMEOUT:-20}"
PUSH_TIMEOUT="${BACKUP_PUSH_TIMEOUT:-30}"
PRUNE_DAYS="${BACKUP_PRUNE_DAYS:-14}"
PRUNE_TIMEOUT="${BACKUP_PRUNE_TIMEOUT:-20}"

say() { printf '[backup-worktree] %s\n' "$*"; }

# Removes this branch's own backup refs once they are both old enough and
# already safe — see the "Pruning" section above for the full contract.
# Reads $branch from the caller's scope; never touches this worktree's own
# working tree, index or HEAD (only origin refs and a private scratch ref).
prune_stale_backups() {
  local listing now_epoch cutoff scratch_ref sha refname rest kind epoch_part
  local snap_sha snap_tree safe

  listing="$(timeout "$PRUNE_TIMEOUT" git ls-remote --refs origin \
    "refs/worktree-backup/${branch}/*" 2>/dev/null)" || return 0
  [ -n "$listing" ] || return 0

  now_epoch="$(date +%s)"
  cutoff=$(( now_epoch - PRUNE_DAYS * 86400 ))
  scratch_ref="refs/worktree-backup-prune-scratch/$$"

  while read -r sha refname; do
    [ -n "$refname" ] || continue
    # refname is refs/worktree-backup/<branch>/<kind>/<epoch>-<shortsha>,
    # always with this exact prefix since ls-remote above was scoped to it.
    rest="${refname#refs/worktree-backup/"$branch"/}"
    kind="${rest%%/*}"
    epoch_part="${rest#*/}"
    epoch_part="${epoch_part%%-*}"
    case "$epoch_part" in
      ''|*[!0-9]*) continue ;; # not this script's own naming — leave alone
    esac
    [ "$epoch_part" -lt "$cutoff" ] || continue # too recent — always keep

    # Fetch just this one ref's object into a private scratch ref, so
    # checking it never touches refs/remotes/origin/* or anything else this
    # worktree already relies on. A fetch failure means safety cannot be
    # confirmed, so the ref is left alone rather than guessed about.
    if ! timeout "$PRUNE_TIMEOUT" git fetch --quiet origin \
        "+${refname}:${scratch_ref}" 2>/dev/null; then
      continue
    fi

    safe=""
    if [ "$kind" = "commits" ]; then
      # Safe once this exact commit is an ancestor of some real origin
      # branch — the same containment test this script already applies to
      # its own HEAD above.
      snap_sha="$(git rev-parse --quiet --verify "$scratch_ref" 2>/dev/null)" || snap_sha=""
      if [ -n "$snap_sha" ] && git for-each-ref --contains="$snap_sha" \
          --format='%(refname)' refs/remotes/origin 2>/dev/null | grep -q .; then
        safe=1
      fi
    elif [ "$kind" = "wip" ]; then
      # A wip snapshot is a synthetic commit; it will not become an ancestor
      # of anything by ordinary history. What proves it safe is content, not
      # ancestry: some commit reachable from an origin branch carries the
      # identical tree, meaning this exact uncommitted state really was
      # committed and pushed for real afterwards.
      snap_tree="$(git rev-parse --quiet --verify "${scratch_ref}^{tree}" 2>/dev/null)" || snap_tree=""
      if [ -n "$snap_tree" ] && git log --remotes=origin --format='%T' 2>/dev/null \
          | grep -qx "$snap_tree"; then
        safe=1
      fi
    fi

    git update-ref -d "$scratch_ref" 2>/dev/null || true

    if [ -n "$safe" ]; then
      if timeout "$PRUNE_TIMEOUT" git push --quiet origin ":${refname}" 2>/dev/null; then
        say "Pruned stale backup origin:${refname} (older than ${PRUNE_DAYS}d and already safe on an origin branch)."
      fi
    fi
  done <<EOF
$listing
EOF
}

repo="${CLAUDE_PROJECT_DIR:-}"
if [ -n "$repo" ]; then
  cd "$repo" 2>/dev/null || exit 0
fi

git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# Linked worktree only — the mirror of recover-stale-checkout.sh's own guard.
# The main checkout has its own recovery path (fast-forward); this script has
# nothing to add there, and nothing here should ever run against it.
if [ "$(git rev-parse --git-dir 2>/dev/null)" = "$(git rev-parse --git-common-dir 2>/dev/null)" ]; then
  exit 0
fi

branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)" || exit 0
[ -n "$branch" ] || exit 0

git remote get-url origin >/dev/null 2>&1 || exit 0

git_dir="$(git rev-parse --git-dir 2>/dev/null)" || exit 0
marker="$git_dir/worktree-backup-last"
last_head_backed_up=""
last_wip_tree_backed_up=""
if [ -f "$marker" ]; then
  last_head_backed_up="$(grep -m1 "^last_head_backed_up=" "$marker" 2>/dev/null | cut -d"'" -f2)"
  last_wip_tree_backed_up="$(grep -m1 "^last_wip_tree_backed_up=" "$marker" 2>/dev/null | cut -d"'" -f2)"
fi

local_head="$(git rev-parse --quiet --verify HEAD 2>/dev/null)" || exit 0

# Best-effort: learn what origin actually has. A failure here does not stop
# the script — it only means the "already safe" check below falls back to
# whatever origin/* refs are already known locally, which can only make this
# script push (and warn) more than strictly necessary, never less.
if ! timeout "$FETCH_TIMEOUT" git fetch --quiet origin 2>/dev/null; then
  say "WARNING: could not reach origin within ${FETCH_TIMEOUT}s to confirm backup status."
fi

head_contained=""
if git for-each-ref --contains="$local_head" --format='%(refname)' refs/remotes/origin 2>/dev/null | grep -q .; then
  head_contained=1
fi

# Build the full current-state snapshot without touching the real index or
# working tree: a private temporary index, read against HEAD's tree, then
# `add -A` against the real files on disk (respecting .gitignore) writing
# only into that temp file. The real .git/index for this worktree is never
# named by any command below.
tmp_index="$(mktemp)" || exit 0
GIT_INDEX_FILE="$tmp_index" git read-tree HEAD 2>/dev/null || { rm -f "$tmp_index"; exit 0; }
GIT_INDEX_FILE="$tmp_index" git add -A 2>/dev/null || { rm -f "$tmp_index"; exit 0; }
snapshot_tree="$(GIT_INDEX_FILE="$tmp_index" git write-tree 2>/dev/null)" || { rm -f "$tmp_index"; exit 0; }
rm -f "$tmp_index"

head_tree="$(git rev-parse --quiet --verify "HEAD^{tree}" 2>/dev/null)" || exit 0
tree_clean=""
[ "$snapshot_tree" = "$head_tree" ] && tree_clean=1

nothing_to_back_up=""
if [ -n "$head_contained" ] && [ -n "$tree_clean" ]; then
  # Everything here already exists on origin under some branch, and there is
  # no uncommitted work on top of it. Nothing to protect. Pruning still runs
  # below — it is independent of whether this run has anything new to push
  # — but it stays silent unless it actually finds something stale and safe
  # to remove, so this remains the same silent no-op it always was.
  nothing_to_back_up=1
fi

epoch="$(date +%s)"
final_head_marker="$last_head_backed_up"
final_wip_marker="$last_wip_tree_backed_up"

if [ -z "$nothing_to_back_up" ] && [ -z "$head_contained" ] && [ "$local_head" != "$last_head_backed_up" ]; then
  ref="refs/worktree-backup/${branch}/commits/${epoch}-${local_head:0:12}"
  if timeout "$PUSH_TIMEOUT" git push --quiet origin "${local_head}:${ref}" 2>/dev/null; then
    say "Backed up HEAD ($branch, ${local_head:0:7}) to origin:${ref}."
    final_head_marker="$local_head"
  else
    say "WARNING: could not push HEAD ($branch, ${local_head:0:7}) to origin. This commit exists"
    say "WARNING: only in this worktree — commit and push it by hand as soon as you can."
  fi
fi

if [ -z "$nothing_to_back_up" ] && [ -z "$tree_clean" ] && [ "$snapshot_tree" != "$last_wip_tree_backed_up" ]; then
  snapshot_commit="$(git commit-tree "$snapshot_tree" -p "$local_head" \
    -m "Worktree backup snapshot: $branch @ ${local_head:0:7}, $(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null)" || snapshot_commit=""
  if [ -n "$snapshot_commit" ]; then
    ref="refs/worktree-backup/${branch}/wip/${epoch}-${snapshot_commit:0:12}"
    if timeout "$PUSH_TIMEOUT" git push --quiet origin "${snapshot_commit}:${ref}" 2>/dev/null; then
      say "Backed up uncommitted changes in $branch to origin:${ref} (working tree untouched)."
      final_wip_marker="$snapshot_tree"
    else
      say "WARNING: could not push uncommitted changes in $branch to origin. This work exists only"
      say "WARNING: on disk in this worktree — commit and push it by hand as soon as you can."
    fi
  else
    say "WARNING: could not build a snapshot of uncommitted changes in $branch (git identity not"
    say "WARNING: configured?) — those changes are not backed up. Commit and push them by hand."
  fi
fi

# Independent of everything above: whether or not this run pushed anything
# new, remove this branch's own old backup refs once they are both stale and
# already safe elsewhere. See the "Pruning" section near the top of this
# file for the exact contract; `|| true` matches this whole script's rule
# that a hook must never fail startup over best-effort maintenance.
prune_stale_backups || true

if [ "$final_head_marker" != "$last_head_backed_up" ] || [ "$final_wip_marker" != "$last_wip_tree_backed_up" ]; then
  {
    printf "last_head_backed_up='%s'\n" "$final_head_marker"
    printf "last_wip_tree_backed_up='%s'\n" "$final_wip_marker"
  } > "$marker" 2>/dev/null || true
fi

exit 0
