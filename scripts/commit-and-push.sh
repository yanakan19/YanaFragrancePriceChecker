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
GENERATED_PATHS="demo/index.html demo/404.html demo/catalogue.generated.ts demo/priceHistory.generated.ts dist-demo/artifact.html"

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

# Resolve a rebase that stalled, but only when every conflicted file is a build
# artefact. Returns non-zero for anything else, so a genuine disagreement in
# source or data still stops the run loudly.
#
# Why this exists: the first version of this script treated every conflict as
# unresolvable. That was right in spirit and wrong in practice — the harvest
# commit touches demo/index.html and demo/catalogue.generated.ts, and so does
# any push that rebuilds the app, so an ordinary source change landing during a
# 40-minute crawl guaranteed a conflict in a file neither side actually
# disagreed about. Two consecutive runs died that way, each discarding a
# complete harvest, and the second had already gained 154 products.
resolve_generated_conflicts() {
  conflicted="$(git diff --name-only --diff-filter=U)"
  [ -n "$conflicted" ] || return 1

  for file in $conflicted; do
    if ! is_generated "$file"; then
      echo "Conflict in ${file}, which is not a generated file." >&2
      return 1
    fi
  done

  # Take the incoming side to get a clean tree, then rebuild from the merged
  # data so the artefact matches the inputs rather than either parent.
  for file in $conflicted; do
    git checkout --theirs -- "$file" 2>/dev/null || git checkout --ours -- "$file"
    git add -- "$file"
  done

  if ! sh -c "$REGENERATE"; then
    echo "::error::Could not rebuild generated files during conflict resolution." >&2
    return 1
  fi

  for file in $GENERATED_PATHS; do
    if [ -e "$file" ]; then git add -- "$file"; fi
  done

  GIT_EDITOR=true git rebase --continue
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
  # reliably leaves it dirty: `npm run demo` writes demo/404.html and
  # dist-demo/artifact.html whether or not the caller listed them, so anything
  # the caller did not name stays modified. That produced "cannot pull with
  # rebase: You have unstaged changes", which aborted the retry before it began
  # and cost a complete 40-minute harvest.
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
      echo "Conflicts were confined to generated files; rebuilt them and continued."
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
      echo "::error::in a file that is not generated. Refusing to guess which version wins." >&2
      echo "::error::Nothing was pushed; resolve by hand." >&2
      exit 1
    fi
  fi
done

echo "::error::Still could not push after 5 attempts. The commit exists locally on the runner but is not on the branch." >&2
exit 1
