#!/usr/bin/env bash
#
# Try to land the *already-staged* change as a GitHub-signed commit, through
# the API, instead of `git commit` + `git push`.
#
#   scripts/signed-commit.sh "<commit message>" <branch>
#
# Exit codes, and they are the whole contract:
#
#   0  the commit is on the branch, signed. The caller must resync its own
#      checkout to the new remote head and stop.
#   3  NOT ATTEMPTED. Nothing was sent, nothing changed anywhere. The caller
#      must carry on down its ordinary git path exactly as if this script did
#      not exist.
#   1  attempted and failed. Nothing landed — the mutation is a single atomic
#      compare-and-swap, so a failure leaves the branch untouched — and the
#      caller must fall back the same way it does for 3.
#
# 3 and 1 are distinguished for the run log only. Every caller treats them
# identically: fall back. That is the property this whole design turns on.
#
# ── Why this exists, and why in this shape ───────────────────────────────────
# docs/DECISIONS.md D16 and D18 refused this three times. Read both before
# changing anything here; the short version is that D16 established the
# mechanism (a commit created through the GitHub API with the workflow's own
# token is GPG-signed by GitHub and comes back Verified, which a `git commit`
# on a runner never is) and then refused to land it for four reasons, and D18
# re-confirmed that three of the four survive scoping the change to small
# payloads.
#
# This script is written to answer those three, not to route around them:
#
#   D16 reason 1, FILE SIZE. Not attempted at all when the staged set touches
#   any of the three oversized generated files. See OVERSIZED_PATHS, and
#   MAX_PAYLOAD_BYTES for the belt-and-braces total cap. The four call sites
#   that carry those files never reach the API at all; they are byte-for-byte
#   on the path they are on today.
#
#   D16 reason 2 / D18 reason 1, NO API EQUIVALENT FOR THE RETRY AND CONFLICT
#   LOGIC. Correct, and this script does not attempt one. It refuses to run at
#   all unless the local HEAD is already exactly the remote head — i.e. unless
#   the push it is replacing would have been a plain fast-forward with no
#   rebase to do. The moment there is anything to rebase, this returns 3 and
#   commit-and-push.sh's own loop does the whole job, unmodified. Nothing here
#   re-derives a three-way merge against the Git Data API's primitives, which
#   is the specific thing D16 called the larger risk.
#
#   D18 reason 2, ONE SHARED SCRIPT SPLIT INTO TWO MECHANISMS DOUBLES THE
#   INCIDENT SURFACE. This is the reason that cannot be argued away, only
#   bounded, and the bound is that the second mechanism can only ever *add* an
#   outcome, never remove one. It runs before `git commit`, so on any failure
#   the tree is exactly as it was and the ordinary path proceeds untouched.
#   There is no code path in which a harvest is lost because this script
#   existed and misbehaved: the worst it can do is waste one HTTPS round trip.
#
#   D16 reason 4 / D18 reason 3, IDENTITY. Real and unavoidable: a commit
#   created with the workflow token is authored by `github-actions[bot]`, not
#   `pricesniffs-bot`. That is inherent to the mechanism — the signature *is*
#   GitHub signing on behalf of the token's identity, so there is no version
#   of this that keeps the old committer and gains the badge. It is the one
#   consequence the owner has to actually want, which is what the off switch
#   below is for.
#
# ── The off switch, which needs no code change ───────────────────────────────
# SIGNED_COMMITS, read from the environment, which the workflows populate from
# the repository variable of the same name (Settings → Secrets and variables →
# Actions → Variables). Set it to `off`, `false`, `0` or `no` and every call
# here returns 3 immediately, restoring today's behaviour exactly. Unset means
# on, so the variable only ever needs to exist in order to turn this off.
#
# ── What could not be verified from where this was written ───────────────────
# No live Actions run. This script's gating, payload construction and fallback
# are covered by tests/signedCommit.test.ts against real scratch repositories,
# and its refusal paths are exercised end to end through commit-and-push.sh —
# but whether GitHub's own API accepts these payloads and returns a Verified
# commit is a fact only a real run can establish. That is precisely why the
# design's safety property is "cannot make anything worse" rather than "is
# known to work": the first real run either produces a signed commit or falls
# back to the path that has been running all along, and the run log says which.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <commit-message> <branch>" >&2
  exit 2
fi

message="$1"
branch="$2"

not_attempted() {
  echo "[signed-commit] not attempted: $1"
  exit 3
}

# ── Gate 1: the off switch ───────────────────────────────────────────────────
case "$(printf '%s' "${SIGNED_COMMITS:-on}" | tr '[:upper:]' '[:lower:]')" in
  off|false|0|no) not_attempted "SIGNED_COMMITS is set to '${SIGNED_COMMITS}'" ;;
esac

# ── Gate 2: the things the API needs and a local shell may not have ──────────
# GH_TOKEN is checked first so a caller can override the workflow token
# deliberately; GITHUB_TOKEN is what the workflows actually set. Neither being
# present is the normal case outside CI (a developer running this script by
# hand), and it must be a quiet fallback rather than an error.
token="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
[ -n "$token" ] || not_attempted "no GH_TOKEN/GITHUB_TOKEN in the environment"
[ -n "${GITHUB_REPOSITORY:-}" ] || not_attempted "GITHUB_REPOSITORY is not set"
command -v curl >/dev/null 2>&1 || not_attempted "curl is not available"
command -v node >/dev/null 2>&1 || not_attempted "node is not available"

# ── Gate 3: the oversized generated files ────────────────────────────────────
# demo/catalogue.generated.ts is 19.3 MB; demo/index.html and demo/404.html are
# 18.3 MB each. Base64 in a JSON request body inflates each about 1.37x, and
# D16 established that whether GitHub's API reliably accepts a request of that
# shape is unknown — real-world reports describe 422s well under the
# documented ceiling. Unknown is not a thing to find out on the branch a cron
# is pushing to, so these are simply never sent. A staged set containing any
# of them falls back before a single byte is read.
OVERSIZED_PATHS="demo/catalogue.generated.ts demo/index.html demo/404.html"

# A whole-payload ceiling as well, because the deny list above names today's
# three known-large files and cannot know about tomorrow's. 4 MB of raw content
# is roughly 5.5 MB of base64, comfortably inside anything GitHub is reported
# to accept, and comfortably above every payload the four small call sites
# actually produce (the largest, "Harvest: real prices", is the data/catalogue
# snapshots — hundreds of kB).
MAX_PAYLOAD_BYTES=4194304

staged="$(git diff --cached --name-only)"
[ -n "$staged" ] || not_attempted "nothing is staged"

for path in $staged; do
  for big in $OVERSIZED_PATHS; do
    if [ "$path" = "$big" ]; then
      not_attempted "the staged set includes ${big}, which is never sent through the API"
    fi
  done
done

# ── Gate 4: this must be a fast-forward, or it is not ours to do ─────────────
# The single most important gate in this file. `createCommitOnBranch` is an
# atomic compare-and-swap against an expected head; it has no rebase, and
# reimplementing commit-and-push.sh's conflict handling against it is exactly
# what D16 and D18 refused. So this only ever runs when there is nothing to
# rebase: local HEAD identical to the freshly-fetched remote head. Anything
# else — the branch moved, we are behind, we are ahead with an unpushed commit
# — falls straight back to the loop that knows how to handle it.
if ! git fetch -q origin "$branch" 2>/dev/null; then
  not_attempted "could not fetch origin/${branch}"
fi
remote_head="$(git rev-parse FETCH_HEAD 2>/dev/null || true)"
local_head="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$remote_head" ] && [ -n "$local_head" ] || not_attempted "could not resolve both heads"
if [ "$remote_head" != "$local_head" ]; then
  not_attempted "origin/${branch} is at ${remote_head} and HEAD is at ${local_head} — there is a rebase to do, which is commit-and-push.sh's job"
fi

# ── Build the payload ────────────────────────────────────────────────────────
# Additions carry base64 content; deletions carry a path. Read from the index
# rather than the working tree (`git show :path`) so what is sent is exactly
# what was staged, even if a later build step has since rewritten the file on
# disk — the same distinction commit-and-push.sh's own "discard build output"
# steps exist to keep straight.
#
# Assembled by node rather than by shell string concatenation because this is
# JSON containing arbitrary file bytes: a shell here-doc would mangle quotes,
# backslashes and newlines in exactly the files most likely to contain them.
additions=""
deletions=""
while IFS=$'\t' read -r status path; do
  [ -n "${path:-}" ] || continue
  case "$status" in
    D) deletions="${deletions}${path}"$'\n' ;;
    *) additions="${additions}${path}"$'\n' ;;
  esac
done < <(git diff --cached --name-status --no-renames)

payload_file="$(mktemp)"
trap 'rm -f "$payload_file"' EXIT

if ! ADDITIONS="$additions" DELETIONS="$deletions" MESSAGE="$message" \
     BRANCH="$branch" REPO="$GITHUB_REPOSITORY" EXPECTED_OID="$local_head" \
     MAX_BYTES="$MAX_PAYLOAD_BYTES" node "$(dirname "$0")/signed-commit-payload.mjs" > "$payload_file"; then
  not_attempted "payload could not be built (see the message above)"
fi

# ── Send it ──────────────────────────────────────────────────────────────────
# --fail-with-body is deliberate: a non-2xx must be a non-zero exit here AND
# still print what GitHub said, because "it did not work" is far less useful in
# a run log than "it did not work, and here is the error". GraphQL also returns
# HTTP 200 for a failed mutation, so the body is checked for an `errors` array
# regardless of status.
response_file="$(mktemp)"
trap 'rm -f "$payload_file" "$response_file"' EXIT

http_status="$(curl -sS -o "$response_file" -w '%{http_code}' \
  -X POST https://api.github.com/graphql \
  -H "Authorization: bearer ${token}" \
  -H 'Content-Type: application/json' \
  --max-time 120 \
  --data-binary "@${payload_file}" || echo 000)"

if [ "$http_status" != "200" ]; then
  echo "[signed-commit] API returned HTTP ${http_status}; falling back to the git path." >&2
  head -c 600 "$response_file" >&2 || true
  echo >&2
  exit 1
fi

if grep -q '"errors"' "$response_file"; then
  echo "[signed-commit] API reported an error; falling back to the git path." >&2
  head -c 600 "$response_file" >&2 || true
  echo >&2
  exit 1
fi

new_oid="$(node -e '
  const fs = require("node:fs");
  try {
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const oid = body?.data?.createCommitOnBranch?.commit?.oid;
    if (typeof oid === "string" && oid.length > 0) process.stdout.write(oid);
  } catch { /* no oid: the caller treats an empty answer as a failure */ }
' "$response_file")"

if [ -z "$new_oid" ]; then
  echo "[signed-commit] API answered 200 but named no commit; falling back to the git path." >&2
  head -c 600 "$response_file" >&2 || true
  echo >&2
  exit 1
fi

echo "[signed-commit] ${new_oid} created on ${branch} through the GitHub API (signed by GitHub)."
exit 0
