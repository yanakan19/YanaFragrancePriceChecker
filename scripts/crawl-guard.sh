#!/usr/bin/env bash
#
# The catalogue crawl's guard: does this trigger run a real harvest?
# catalogue-daily.yml's `guard` job runs it on every tick and passes the answer
# to the `crawl` job. Prints `should-run=true|false`, and appends the same line
# to $GITHUB_OUTPUT when that is set. See catalogue-daily.yml's header for the
# measurements behind each rule.
#
# Rules, in order:
#   1. A dispatch is a person asking, and always runs, unless it says
#      SCHEDULED_TICK=true: an outside scheduler standing in for GitHub's cron
#      (docs/OWNER-STEPS.md), which is gated exactly like a scheduled tick.
#   2. A tick skips while an older run of this workflow is still going, so two
#      crawls never queue back to back and a tick cannot sit pending in the
#      `catalogue` concurrency group, where the next arrival would cancel it.
#      Older than this run, not just "another" run: two late ticks delivered
#      together would otherwise each wait for the other, or both crawl. A run
#      created more than four hours ago is ignored (the job's limit is two).
#   3. A tick runs once the last full sweep ("Harvest: real prices" commit of
#      data/harvest-cursor.json) is at least 150 minutes old.
# Any API read that fails runs the harvest rather than guess a skip.
#
# Environment: EVENT (github.event_name), SCHEDULED_TICK, RUN_ID, RUN_NUMBER,
# REPO, REF, GH_TOKEN. RUNS_JSON / COMMITS_JSON name files to read instead of
# calling the API, and NOW sets the clock, for tests.
set -uo pipefail

THRESHOLD=9000          # 150 minutes
STALE_RUN_SECONDS=14400 # 4 hours

answer() {
  echo "should-run=$1"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "should-run=$1" >> "$GITHUB_OUTPUT"; fi
  shift
  echo "$*"
  exit 0
}

api() {
  curl -sS --max-time 20 -H "Authorization: Bearer ${GH_TOKEN:-}" \
    -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${REPO}/$1"
}

if [ "${EVENT:-}" != "schedule" ] && [ "${SCHEDULED_TICK:-false}" != "true" ]; then
  answer true "Not a scheduled tick (event: ${EVENT:-unknown}) — runs in full."
fi

now="${NOW:-$(date -u +%s)}"

# ── 2. An older run still going ─────────────────────────────────────────────
if [ -n "${RUNS_JSON:-}" ]; then runs="$(cat "$RUNS_JSON" 2>/dev/null)" || runs=""
else runs="$(api "actions/workflows/catalogue-daily.yml/runs?per_page=30")" || runs=""; fi
older=$(printf '%s' "$runs" | jq -r --argjson me "${RUN_NUMBER:-0}" --argjson id "${RUN_ID:-0}" \
  --argjson now "$now" --argjson stale "$STALE_RUN_SECONDS" '
  [.workflow_runs[]?
    | select(.status != "completed" and .id != $id and .run_number < $me)
    | select(($now - (.created_at | fromdateiso8601)) < $stale)
  ] | sort_by(.run_number) | .[0] // empty | "#\(.run_number) (\(.event), \(.status) since \(.created_at))"' 2>/dev/null) || older=""
if [ -n "$older" ]; then
  answer false "An older crawl run is still going: ${older}. Skipping this tick; the next one checks again."
fi

# ── 3. The last full sweep's age ────────────────────────────────────────────
if [ -n "${COMMITS_JSON:-}" ]; then resp="$(cat "$COMMITS_JSON" 2>/dev/null)" || resp=""
else resp="$(api "commits?path=data/harvest-cursor.json&sha=${REF:-}&per_page=50")" || resp=""; fi
# Only a full sweep counts: one shop dispatches commit "Harvest: one shop
# (<shop>), real prices", and on 2026-10-03 they made two scheduled ticks skip.
last_iso=$(printf '%s' "$resp" | jq -r '[.[] | select(.commit.message | startswith("Harvest: real prices"))][0].commit.committer.date // empty' 2>/dev/null) || last_iso=""
if [ -z "$last_iso" ]; then
  echo "::warning::Could not read the last harvest commit's timestamp from the GitHub API — running in full rather than guessing a skip."
  answer true "Running in full."
fi
last_epoch=$(date -u -d "$last_iso" +%s 2>/dev/null) || last_epoch=0
age=$(( now - last_epoch ))
if [ "$age" -ge "$THRESHOLD" ]; then
  answer true "Last full harvest commit (data/harvest-cursor.json) was $(( age / 60 )) minutes ago — due, running in full."
fi
answer false "Last full harvest commit was $(( age / 60 )) minutes ago, under the 150 minute threshold — skipping this tick."
