#!/usr/bin/env bash
#
# Point the site's chat widget at a deployed Virtual Yanny backend.
#
#   bash deploy/set-yanny-api-base-url.sh https://pricesniffs-yanny.fly.dev
#
# This is the single line that changes once the backend is actually live:
# demo/virtualYanny.ts's VIRTUAL_YANNY_API_BASE_URL, which ships blank on
# purpose. The script edits it, then rebuilds the static site so the change
# reaches the bundle that readers load.
#
# ── Why it refuses to run without checking the URL first ─────────────────
# A wrong or hopeful value here is worse than the blank it replaces. Blank
# is honest: the widget renders, reports itself unavailable once, and stops.
# A URL that does not answer makes every reader who opens the chat wait for
# a timeout and get a failure instead. So this script will not write a URL
# it has not just seen report itself healthy — the value has to come from a
# real deployment, never a guess. There is deliberately no override flag.
#
# Run it from anywhere; it locates the repo itself.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_FILE="${REPO_ROOT}/demo/virtualYanny.ts"

usage() {
  cat <<'USAGE'
Usage: bash deploy/set-yanny-api-base-url.sh <https://your-backend-host>

  <https://your-backend-host>  Origin of a deployed, healthy Virtual Yanny
                               backend. No trailing slash, no path. With
                               Fly.io this is https://<app>.fly.dev, where
                               <app> is the `app` name in
                               YanaFreeAPIMerger/fly.toml.

Example:
  bash deploy/set-yanny-api-base-url.sh https://pricesniffs-yanny.fly.dev

After it finishes, commit demo/virtualYanny.ts together with the rebuilt
demo/index.html and demo/404.html, and push.
USAGE
}

if [ "$#" -ne 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  usage
  exit 1
fi

BASE_URL="$1"

# HTTPS is not a style preference: the widget runs on an HTTPS page, and a
# browser blocks a plain-HTTP API call from one as mixed content, silently.
case "${BASE_URL}" in
  https://*) ;;
  *)
    echo "ERROR: the base URL must start with https:// — got '${BASE_URL}'." >&2
    echo "The widget runs on an HTTPS page; browsers block plain-HTTP calls from it as mixed content." >&2
    exit 1
    ;;
esac

case "${BASE_URL}" in
  */)
    echo "ERROR: drop the trailing slash — got '${BASE_URL}'." >&2
    echo "The code appends paths like /api/health directly, so a trailing slash produces '//api/health'." >&2
    exit 1
    ;;
esac

if [ ! -f "${TARGET_FILE}" ]; then
  echo "ERROR: ${TARGET_FILE} not found." >&2
  exit 1
fi

# ── Gate: the backend has to be real and healthy right now ───────────────
echo "Checking ${BASE_URL}/api/health ..."
HEALTH_BODY="$(curl -sS --max-time 20 "${BASE_URL}/api/health" || true)"

if [ -z "${HEALTH_BODY}" ]; then
  echo "ERROR: no response from ${BASE_URL}/api/health — nothing was changed." >&2
  echo "Deploy the backend first (see docs/VIRTUAL-YANNY-DEPLOY.md), then re-run this." >&2
  exit 1
fi

# Parsed without jq so this works on a bare machine. The endpoint always
# answers HTTP 200, even when reporting failure, so the body is the only
# thing worth reading — see server/index.js.
read_flag() {
  printf '%s' "${HEALTH_BODY}" | tr -d ' ' | sed -n "s/.*\"$1\":\([a-z]*\).*/\1/p"
}

OK_FLAG="$(read_flag ok)"
CONFIGURED_FLAG="$(read_flag configured)"
REACHABLE_FLAG="$(read_flag freellmapiReachable)"

echo "Health response: ${HEALTH_BODY}"

if [ "${CONFIGURED_FLAG}" != "true" ]; then
  echo "ERROR: that backend reports configured:false — it is running but has no API key or base URL set." >&2
  echo "Set the FREELLMAPI_API_KEY secret and redeploy. Nothing was changed." >&2
  exit 1
fi

if [ "${REACHABLE_FLAG}" != "true" ]; then
  echo "ERROR: that backend cannot reach the FreeLLMAPI router right now." >&2
  echo "Either the key is wrong, or the shared free-tier router is rate-limited/down." >&2
  echo "Nothing was changed — a widget pointed at it would fail on every question." >&2
  exit 1
fi

if [ "${OK_FLAG}" != "true" ]; then
  echo "ERROR: that backend reports ok:false. Nothing was changed." >&2
  exit 1
fi

echo "Backend is healthy."

# ── The edit ─────────────────────────────────────────────────────────────
# Matches the declaration whatever it currently holds, so re-pointing an
# already-configured build at a new host works the same as the first run.
MATCHES="$(grep -c "^const VIRTUAL_YANNY_API_BASE_URL = '.*';$" "${TARGET_FILE}" || true)"
if [ "${MATCHES}" != "1" ]; then
  echo "ERROR: expected exactly one VIRTUAL_YANNY_API_BASE_URL declaration in ${TARGET_FILE}, found ${MATCHES}." >&2
  echo "The file has changed shape; edit it by hand instead." >&2
  exit 1
fi

# BASE_URL is already known to match https://... with no trailing slash, so
# it cannot contain a quote or a sed delimiter.
sed -i.bak "s|^const VIRTUAL_YANNY_API_BASE_URL = '.*';\$|const VIRTUAL_YANNY_API_BASE_URL = '${BASE_URL}';|" "${TARGET_FILE}"
rm -f "${TARGET_FILE}.bak"

echo "Updated: $(grep '^const VIRTUAL_YANNY_API_BASE_URL' "${TARGET_FILE}")"

# ── Rebuild, or the change never reaches a reader ────────────────────────
# demo/index.html and demo/404.html are generated files with the whole
# bundle inlined; editing the .ts alone changes nothing that gets served.
echo "Rebuilding the static site (npm run demo) ..."
cd "${REPO_ROOT}"
npm run demo

cat <<DONE

Done. The widget now points at ${BASE_URL}.

Next: commit and push these together —
  git add demo/virtualYanny.ts demo/index.html demo/404.html
  git commit -F <a file containing your message>
  git push

Pushing to the site's deploy branch publishes it.
DONE
