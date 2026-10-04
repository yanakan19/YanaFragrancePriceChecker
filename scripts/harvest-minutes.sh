#!/usr/bin/env bash
#
# How many minutes the harvest may run, given how much of the crawl job's
# time limit the steps before it already used. Prints the number, or exits 3
# when too little is left for a harvest worth committing.
#
#   RUN_MINUTES=$(scripts/harvest-minutes.sh)
#
# ── Why ──────────────────────────────────────────────────────────────────────
# The harvest used to get a fixed 56 minutes. The job's limit is 120, and the
# periodic stages before the harvest (shipping discovery, the Awin sync with
# its own rebuild) took 9 and 23 minutes in run #592, 18 in #593. Add the
# setup and tests and the harvest's "Commit harvested prices" landed around
# minute 85 of 120; a slower day for those stages pushes it past 120, and a job
# timeout cancels the commit with every price on disk, which is run #180's
# loss. Measuring the time actually left keeps the harvest's commit inside the
# limit whatever ran before it.
#
# Environment:
#   JOB_STARTED_AT   epoch seconds the job began (the workflow's first step
#                    records it); without it the full 56 minutes are given,
#                    as before
#   JOB_LIMIT_MIN    the job's timeout-minutes (120)
#   RESERVE_MIN      what must still fit after the harvest: houses (15, its
#                    step cap), the harvest commit and a margin (22)
#   MAX_MIN, MIN_MIN the usual deadline (56) and the shortest harvest worth
#                    running (10)
#   NOW              epoch seconds, for tests
set -euo pipefail

limit="${JOB_LIMIT_MIN:-120}"
reserve="${RESERVE_MIN:-22}"
max="${MAX_MIN:-56}"
min="${MIN_MIN:-10}"
now="${NOW:-$(date -u +%s)}"
started="${JOB_STARTED_AT:-}"

case "$started" in
  ''|*[!0-9]*)
    echo "::warning::JOB_STARTED_AT is not set; giving the harvest its usual ${max} minutes." >&2
    echo "$max"
    exit 0
    ;;
esac

elapsed=$(( (now - started) / 60 ))
left=$(( limit - elapsed - reserve ))
if [ "$left" -ge "$max" ]; then
  echo "$max"
elif [ "$left" -ge "$min" ]; then
  echo "::warning::The steps before the harvest used ${elapsed} of the job's ${limit} minutes, so the harvest gets ${left} minutes instead of ${max}." >&2
  echo "$left"
else
  echo "::error::The steps before the harvest used ${elapsed} of the job's ${limit} minutes, leaving ${left} after the ${reserve} the commit needs: too little for a harvest. Skipping it; the next run starts with the shops this one did not reach." >&2
  exit 3
fi
