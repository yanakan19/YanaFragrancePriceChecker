#!/usr/bin/env bash
#
# The safety net for the two destructive jobs the owner has allowed
# (.claude/settings.json): deleting remote branches and rewriting the live
# branch's history. Run it FIRST; the guard hook (.claude/hooks/require-backup.sh)
# refuses either job until its result is on origin.
#
#   scripts/backup-before-destructive.sh rewrite
#       Pushes the live branch's exact current tip to a new, never overwritten
#       branch  backup/pre-rewrite-YYYYMMDD-HHMM  (the whole pre-rewrite history
#       stays reachable from it, the way backup/pre-rewrite-2026-10-06 did).
#
#   scripts/backup-before-destructive.sh delete <branch> [<branch> ...]
#       For each branch, pushes a tag  archive/<branch>-YYYYMMDD  at its tip
#       (so its commits stay reachable after the branch is deleted), then
#       prints the one line that restores the branch.
#
# Both verify the ref is really on origin and print the recovery command.
# Add the printed lines to docs/OWNER-STEPS.md 7d in the same commit as the job.
# Never force pushes, never deletes anything.
set -euo pipefail

LIVE=claude/scentday-retailer-registry-h92tth
STAMP=$(date -u +%Y%m%d-%H%M)
DAY=$(date -u +%Y%m%d)

usage() { sed -n '3,22p' "$0"; exit 2; }
[ $# -ge 1 ] || usage
mode=$1; shift

case "$mode" in
  rewrite)
    git fetch -q origin "$LIVE"
    tip=$(git rev-parse "origin/$LIVE")
    ref="backup/pre-rewrite-$STAMP"
    git push -q origin "$tip:refs/heads/$ref"
    got=$(git ls-remote origin "refs/heads/$ref" | cut -f1)
    [ "$got" = "$tip" ] || { echo "backup NOT confirmed on origin ($got vs $tip)" >&2; exit 1; }
    echo "backup ok: origin/$ref = $tip"
    echo "restore:   git push --force-with-lease=$LIVE:<current tip> origin $tip:refs/heads/$LIVE"
    ;;
  delete)
    [ $# -ge 1 ] || usage
    for b in "$@"; do
      [ "$b" != "$LIVE" ] || { echo "refusing: $LIVE is the live branch" >&2; exit 1; }
      case "$b" in backup/*|archive/*) echo "refusing: $b is itself a backup" >&2; exit 1;; esac
      git fetch -q origin "$b"
      tip=$(git rev-parse "origin/$b")
      tag="archive/$b-$DAY"
      git push -q origin "$tip:refs/tags/$tag"
      got=$(git ls-remote origin "refs/tags/$tag" | cut -f1)
      [ "$got" = "$tip" ] || { echo "archive tag NOT confirmed for $b" >&2; exit 1; }
      echo "archived: $b = $tip as tag $tag"
      echo "restore:  git push origin $tip:refs/heads/$b"
    done
    ;;
  *) usage ;;
esac
