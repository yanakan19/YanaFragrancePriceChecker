#!/usr/bin/env bash
#
# Commit the given paths and push, surviving a concurrent push to the branch.
#
#   scripts/commit-and-push.sh "Harvest: real prices 2026-08-04" data/catalogue demo/index.html
#
# ── Why this exists ──────────────────────────────────────────────────────────
# The workflow's push steps were a bare `git push`. The branch moves under a
# forty-minute harvest more or less routinely — a scheduled run is nearly
# always in flight, so any push by a person or an agent lands mid-run — and a
# bare push answers that with:
#
#     ! [rejected] ... (fetch first)
#
# which fails the step and throws away the entire harvest. That is not a
# hypothetical: runs 15 and 17 both died exactly this way within three hours,
# losing about an hour of real crawling between them. The workflow's
# `concurrency` group only stops two *workflow runs* colliding; it does nothing
# about a push from anywhere else.
#
# So: rebase our commit onto whatever arrived and try again. The harvest's
# commit only ever touches generated data, while the pushes that race it are
# almost always source changes, so the rebase is nearly always trivial.
#
# ── What it will not do ──────────────────────────────────────────────────────
# It never force-pushes and it never auto-resolves a conflict. A genuine
# conflict means two sources disagree about the same generated file, and
# picking a winner silently could publish the older of two price snapshots.
# That case aborts the rebase and fails loudly with the branch untouched.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <commit-message> <path> [path...]" >&2
  exit 2
fi

message="$1"
shift

git config user.name 'pricesniffs-bot'
git config user.email 'bot@users.noreply.github.com'

# Paths that do not exist yet are skipped rather than fatal: the house harvest
# only writes its files once a storefront has actually returned something.
staged_any=0
for path in "$@"; do
  if [ -e "$path" ]; then
    git add "$path"
    staged_any=1
  fi
done

if [ "$staged_any" -eq 0 ]; then
  echo "None of the given paths exist yet. Nothing to commit."
  exit 0
fi

if git diff --cached --quiet; then
  echo "Nothing changed."
  exit 0
fi

git commit -m "$message"

branch="$(git rev-parse --abbrev-ref HEAD)"
delay=2

# Files that are built, never authored. A conflict in one of these is not two
# sources disagreeing about a fact — it is two runs having built the same
# artefact at different moments, and the answer is to rebuild it from the
# merged inputs rather than to pick a side.
#
# Deliberately NOT here: dist-demo/artifact.html. It used to be, and that was
# a real bug (run #236, 2026-08-18): no caller of this script has ever passed
# it to be committed — it is gitignored build output, never tracked — yet it
# was listed here and so got blindly `git add`-ed after every regenerate.
# That add always failed ("paths are ignored by one of your .gitignore
# files"), and because bash suppresses -e for commands run inside a function
# whose result feeds an `if` (resolve_generated_conflicts does, below), the
# failure did not stop the script — it just meant this function could reach
# `git rebase --continue` having silently skipped a step it assumed had
# worked. Fixed by removing the path rather than trusting that quirk; see
# also the explicit exit-code checks below, added so a future mistake here
# fails loudly instead of vanishing the same way.
GENERATED_PATHS="demo/index.html demo/404.html demo/catalogue.generated.ts demo/priceHistory.generated.ts"

# How to rebuild them. Overridable so this script does not hard-code knowledge
# of the app's build for callers that generate something else.
#
# priceHistory.generated.ts is a full deterministic replay of every catalogue
# commit in git, never a diff against its own previous content — so unlike a
# hand-maintained file, there is no real ambiguity to a conflict in it: both
# sides are trying to say the same thing from the same source of truth, and
# rebuilding it fresh is not picking a winner, it is the only correct answer
# either side could have given.
REGENERATE="${REGENERATE:-npm run catalogue:demo && npm run catalogue:history && npm run demo}"

is_generated() {
  for known in $GENERATED_PATHS; do
    if [ "$1" = "$known" ]; then return 0; fi
  done
  return 1
}

# Raw per-retailer/per-house harvest snapshots — data/catalogue/<id>.json,
# data/houses/<id>.json, and the small standalone report files a scan step
# writes. These are not rebuildable the way GENERATED_PATHS is: nothing
# regenerates data/catalogue/allbeauty.json from some other input, it IS the
# input. A conflict here is two runs each having genuinely harvested the same
# retailer at two different moments, not a disagreement to adjudicate — every
# case below matches scripts/catalogue-harvest.ts, scripts/houses-harvest.ts,
# scripts/awin-feed-sync.ts, scripts/shipping-discover.ts and
# scripts/image-link-check.ts's own write targets.
#
# demo/deals.generated.ts belongs here too, deliberately not in
# GENERATED_PATHS, even though scripts/build-deals.ts could technically
# rebuild it from data already on disk: the whole point of that file is that
# it changes on its own 6-hourly schedule regardless of what else lands in
# between, not on every conflict a rebuild would silently trigger.
# Regenerating it mid-conflict would defeat the one thing it exists to do.
#
# The *-marker.txt / *-state.json entries are the cadence-gate bookkeeping
# the workflow's periodic steps (shipping discovery, Awin sync, deals
# refresh) read to decide "have I run recently enough" — see
# catalogue-daily.yml's MARKER= lines. Machine-written timestamps, never
# hand-edited, same category as the report files above.
is_raw_snapshot() {
  case "$1" in
    data/catalogue/*.json|data/houses/*.json) return 0 ;;
    data/house-sourcing-report.json|data/shipping-discovery-report.json) return 0 ;;
    data/image-link-report.json|data/awin-feed-sync-state.json|data/strategy-memory.json) return 0 ;;
    data/price-verification-report.json|data/storefront-reprice-report.json) return 0 ;;
    data/shipping-discover-marker.txt|data/shipping-discover-state.json) return 0 ;;
    data/feed-sync-marker.txt|data/deals-refresh-marker.txt) return 0 ;;
    demo/deals.generated.ts) return 0 ;;
    *) return 1 ;;
  esac
}

# Resolve a rebase that stalled, but only when every conflicted file is a
# build artefact or a raw harvest snapshot. Returns non-zero for anything
# else, so a genuine disagreement in actual source still stops the run loudly.
#
# Why this exists: the first version of this script treated every conflict as
# unresolvable. That was right in spirit and wrong in practice — the harvest
# commit touches demo/index.html and demo/catalogue.generated.ts, and so does
# any push that rebuilds the app, so an ordinary source change landing during a
# 40-minute crawl guaranteed a conflict in a file neither side actually
# disagreed about. Two consecutive runs died that way, each discarding a
# complete harvest, and the second had already gained 154 products.
#
# The raw-snapshot half of this (data/catalogue/*.json etc.) was added after
# runs #124 and #126 both died the same way for a reason this first version
# never covered: the demo/*.ts files it already handled rebuilt cleanly, but
# the underlying data/catalogue/allbeauty.json and a dozen data/houses/*.json
# files conflicted too, and "not generated" was true but not the right
# category for them — they needed "take the incoming side, no rebuild step,"
# not the demo files' "take it and then regenerate."
resolve_generated_conflicts() {
  conflicted="$(git diff --name-only --diff-filter=U)"
  [ -n "$conflicted" ] || return 1

  needs_regenerate=0
  for file in $conflicted; do
    if is_generated "$file"; then
      needs_regenerate=1
    elif ! is_raw_snapshot "$file"; then
      echo "Conflict in ${file}, which is neither a generated file nor a raw harvest snapshot." >&2
      return 1
    fi
  done

  # Take the incoming side for everything conflicted. Rebuildable views get
  # regenerated from the merged inputs below so they stay internally
  # consistent; raw snapshots do not need that — each is independently valid
  # on its own, and this run's own freshly harvested delta for whichever
  # retailer or house conflicted is a one-cycle loss the next scheduled
  # harvest naturally supersedes, not a permanent one.
  #
  # "Incoming side" is --ours here, not --theirs. `git rebase` flips the
  # usual merge meaning: while a commit is being replayed, --ours is the
  # branch we are rebasing onto (the already-pushed, incoming side) and
  # --theirs is the commit currently being applied (our own local harvest
  # commit) — the reverse of `git merge`. An earlier version of this script
  # had that backwards, which happened to be harmless for GENERATED_PATHS
  # (regenerated fresh below regardless) but meant every raw-snapshot
  # conflict silently kept our own commit's copy instead of the incoming
  # one this comment says it keeps. Fixed; verified locally against a
  # scratch repo (checkout --ours/--theirs content dumped directly).
  #
  # Every checkout/add below is checked explicitly rather than trusted to
  # propagate its exit code, on purpose: this function is called as
  # `if resolve_generated_conflicts; then …`, and bash suppresses `-e` for
  # commands run inside a function invoked as an `if` condition. A command
  # that fails here would otherwise fail silently and let execution reach
  # `git rebase --continue` having skipped a step — which is exactly how
  # run #236 (2026-08-18) went unnoticed for as long as it did.
  for file in $conflicted; do
    if ! git checkout --ours -- "$file" 2>/dev/null && ! git checkout --theirs -- "$file"; then
      echo "::error::Could not check out either side of the conflict in ${file}." >&2
      return 1
    fi
    if ! git add -- "$file"; then
      echo "::error::git add failed for ${file} while resolving its conflict." >&2
      return 1
    fi
  done

  if [ "$needs_regenerate" -eq 1 ]; then
    if ! sh -c "$REGENERATE"; then
      echo "::error::Could not rebuild generated files during conflict resolution." >&2
      return 1
    fi

    for file in $GENERATED_PATHS; do
      if [ -e "$file" ] && ! git add -- "$file"; then
        echo "::error::git add failed for regenerated file ${file}." >&2
        return 1
      fi
    done
  fi

  if ! GIT_EDITOR=true git rebase --continue; then
    echo "::error::git rebase --continue failed after conflicts appeared resolved." >&2
    return 1
  fi
}

for attempt in 1 2 3 4 5; do
  if git push origin "$branch"; then
    echo "Pushed on attempt ${attempt}."
    exit 0
  fi

  if [ "$attempt" -eq 5 ]; then break
  fi

  echo "Push rejected — the branch moved. Rebasing and retrying in ${delay}s (attempt ${attempt}/5)."
  sleep "$delay"
  delay=$(( delay * 2 ))

  # A rebase will not start at all while the tree is dirty, and the build
  # reliably leaves it dirty: `npm run demo` writes demo/404.html (and other
  # tracked generated files) whether or not the caller listed them, so
  # anything the caller did not name stays modified. That produced "cannot
  # pull with rebase: You have unstaged changes", which aborted the retry
  # before it began and cost a complete 40-minute harvest. (dist-demo/ is
  # gitignored, so its build output never shows up here regardless — see the
  # GENERATED_PATHS comment above for why it is not listed there either.)
  #
  # Discarding them is safe and is not a judgement call: everything still
  # uncommitted at this point is build output, reproducible from the inputs that
  # were just committed. Restricted to tracked files so nothing unknown is
  # touched, and deliberately not a `git stash` — there is nothing worth
  # restoring, and a stash left behind on a runner is just litter.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Discarding uncommitted build output before rebasing."
    git checkout -- .
  fi

  if ! git pull --rebase origin "$branch"; then
    if resolve_generated_conflicts; then
      echo "Conflicts were confined to generated files and raw harvest snapshots; resolved and continued."
    elif [ -z "$(git diff --name-only --diff-filter=U)" ]; then
      # No conflicted paths means the rebase never started — a dirty tree, a
      # network failure, a detached HEAD. Saying "conflicts in a file that is
      # not generated" here would be a lie, and it was: that is exactly what
      # this printed when the real message underneath was "cannot pull with
      # rebase: You have unstaged changes", sending the next reader after a
      # conflict that did not exist.
      git rebase --abort 2>/dev/null || true
      echo "::error::Could not start a rebase onto origin/${branch}. See the git error above." >&2
      echo "::error::Nothing was pushed." >&2
      exit 1
    else
      git rebase --abort || true
      echo "::error::Could not rebase onto origin/${branch}: the incoming change conflicts" >&2
      echo "::error::in a file that is neither generated nor a raw harvest snapshot. Refusing to" >&2
      echo "::error::guess which version wins." >&2
      echo "::error::Nothing was pushed; resolve by hand." >&2
      exit 1
    fi
  fi
done

echo "::error::Still could not push after 5 attempts. The commit exists locally on the runner but is not on the branch." >&2
exit 1
