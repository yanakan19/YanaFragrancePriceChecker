#!/usr/bin/env bash
#
# PreToolUse guard for Bash (wired in .claude/settings.json). The owner allowed
# two destructive jobs without a prompt (deleting remote branches, rewriting the
# live branch's history) on the condition that a fall back copy of the whole
# repository exists first. This hook enforces the condition: it blocks the job
# (exit 2, the message goes back to the agent) unless the copy is on origin.
#
#   force push of the live branch  -> a branch  backup/pre-rewrite-YYYYMMDD-HHMM
#                                     made in the last 24 hours must exist on origin
#   git push origin --delete <b>   -> a tag or branch  archive/<b>-YYYYMMDD  at (or containing) the tip of b must exist on origin
#   git filter-repo / git replace  -> same as the force push (a rewrite)
#
# scripts/backup-before-destructive.sh makes both. Everything else passes.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)
    print((d.get("tool_input") or {}).get("command", ""))
except Exception:
    print("")')
[ -n "$cmd" ] || exit 0

LIVE=claude/scentday-retailer-registry-h92tth
block() { echo "BLOCKED by .claude/hooks/require-backup.sh: $1 Run scripts/backup-before-destructive.sh first (see CLAUDE.md, Destructive jobs)." >&2; exit 2; }

is_rewrite=0
is_force=0
case "$cmd" in
  *"git filter-repo"*|*"git filter-branch"*) is_rewrite=1 ;;
esac
if printf '%s' "$cmd" | grep -Eq 'git +push\b.*(--force|--force-with-lease|-f( |$))'; then is_force=1; fi
# a forced push of anything but the live branch (a scratch branch of an agent) is not a rewrite of the repository
if [ "$is_force" = 1 ] && ! printf '%s' "$cmd" | grep -q "$LIVE"; then is_force=0; fi

if [ "$is_rewrite" = 1 ] || [ "$is_force" = 1 ]; then
  now=$(date -u +%s)
  ok=0
  for ref in $(git ls-remote --heads origin 'backup/pre-rewrite-*' 2>/dev/null | awk '{print $2}' | sed 's#refs/heads/##'); do
    s=${ref#backup/pre-rewrite-}            # YYYYMMDD-HHMM
    t=$(date -u -d "${s:0:4}-${s:4:2}-${s:6:2} ${s:9:2}:${s:11:2}" +%s 2>/dev/null) || continue
    [ $((now - t)) -le 86400 ] && [ $((now - t)) -ge 0 ] && ok=1
  done
  [ "$ok" = 1 ] || block "no backup/pre-rewrite-* branch from the last 24 hours on origin."
fi

if printf '%s' "$cmd" | grep -Eq 'git +push\b.*(--delete|-d )' || printf '%s' "$cmd" | grep -Eq 'git +push +[a-z]+ +:[^ ]'; then
  # every branch named after --delete (or a :branch refspec) must have an archive tag
  branches=$(printf '%s' "$cmd" | python3 -c 'import sys,re
c = sys.stdin.read()
out = []
m = re.search(r"git\s+push\s+\S+\s+(?:--delete|-d)\s+(.*)", c)
if m:
    out += [w for w in re.split(r"[\s;&|]+", m.group(1)) if w and not w.startswith("-")]
for m in re.finditer(r"git\s+push\s+\S+\s+:(\S+)", c):
    out.append(m.group(1))
print(" ".join(out))')
  for b in $branches; do
    [ "$b" != "$LIVE" ] || block "$LIVE is the live branch and is never deleted."
    # the archive is a tag OR a branch (a tag push from the cloud session answers 403, so it may be made as a
    # branch through the GitHub MCP create_branch tool); it must be at the branch's tip or at a commit containing it
    tip=$(git ls-remote --heads origin "refs/heads/$b" 2>/dev/null | awk '{print $1}' | head -1)
    [ -n "$tip" ] || block "branch $b is not on origin."
    ok=0
    while read -r sha ref; do
      [ -n "$sha" ] || continue
      if [ "$sha" = "$tip" ]; then ok=1; break; fi
      git cat-file -e "$sha^{commit}" 2>/dev/null || git fetch -q origin "$ref" 2>/dev/null || true
      if git merge-base --is-ancestor "$tip" "$sha" 2>/dev/null; then ok=1; break; fi
    done < <(git ls-remote origin "refs/tags/archive/$b-*" "refs/heads/archive/$b-*" 2>/dev/null)
    [ "$ok" = 1 ] || block "no archive/$b-* tag or branch on origin at (or containing) the tip of branch $b."
  done
fi
exit 0
