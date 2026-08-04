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

git config user.name 'scentday-bot'
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

  if ! git pull --rebase origin "$branch"; then
    git rebase --abort || true
    echo "::error::Could not rebase onto origin/${branch}: the incoming change conflicts with this commit." >&2
    echo "::error::Refusing to guess which version wins. Nothing was pushed; resolve by hand." >&2
    exit 1
  fi
done

echo "::error::Still could not push after 5 attempts. The commit exists locally on the runner but is not on the branch." >&2
exit 1
