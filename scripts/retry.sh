#!/usr/bin/env bash
#
# Run a command, and run it again after a failure, with exponential backoff
# and jitter, for the network steps in the workflows (npm ci, the Chromium
# download) whose failures are almost always a registry or CDN blip:
#
#   scripts/retry.sh 3 npm ci
#
# Waits RETRY_BASE_SECONDS (default 10), then twice that, and so on, each plus
# a random extra of up to its own length so two runners that failed together
# do not retry together. The last failure's exit status is kept, so a step
# that keeps failing still fails, with the command named in the error.
#
# Only for commands that are safe to repeat: npm ci starts from an empty
# node_modules every time, and an install that half finished is redone whole.
set -uo pipefail

if [ "$#" -lt 2 ] || ! [[ "$1" =~ ^[1-9][0-9]*$ ]]; then
  echo "usage: $0 <attempts> <command> [args...]" >&2
  exit 2
fi

attempts="$1"
shift
base="${RETRY_BASE_SECONDS:-10}"
attempt=1
while true; do
  "$@"
  status=$?
  if [ "$status" -eq 0 ]; then exit 0; fi
  if [ "$attempt" -ge "$attempts" ]; then
    echo "::error::'$*' failed ${attempts} time(s), the last with exit status ${status}. Giving up." >&2
    exit "$status"
  fi
  wait_for=$(( base * (1 << (attempt - 1)) ))
  wait_for=$(( wait_for + RANDOM % (wait_for + 1) ))
  echo "::warning::'$*' failed with exit status ${status} (attempt ${attempt} of ${attempts}); trying again in ${wait_for}s." >&2
  sleep "$wait_for"
  attempt=$(( attempt + 1 ))
done
