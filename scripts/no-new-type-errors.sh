#!/usr/bin/env bash
#
# Passes when an edited file adds no type error the branch did not already
# have. Used by catalogue-daily.yml's "Discover shipping terms" step to verify
# its own edit to src/config/retailers.ts before committing it:
#
#   scripts/no-new-type-errors.sh src/config/retailers.ts
#
# ── Why not `npm run typecheck` ──────────────────────────────────────────────
# That step used to run `npm run typecheck || revert`. The whole-repo
# typecheck has failed on the branch since 2026-10-01 for reasons unrelated to
# the registry (six errors in tests/wrongPriceBrowser.test.ts), so from then on
# every registry edit shipping discovery made was reverted, silently: the run
# stayed green and the "Shipping terms" commits carried only the report. Any
# unrelated type error anywhere would do the same again.
#
# So this compares like with like: the type errors with the edit against the
# type errors with the file as the branch has it (HEAD). Any error line in the
# first set that is not in the second fails. An error inside the edited file
# whose line number moved counts as new, which can only fail safe. A compiler
# that dies without printing type errors fails too.
#
# TSC overrides the compiler command (tests point it at a scratch project).
set -uo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <edited file>" >&2
  exit 2
fi
file="$1"
TSC="${TSC:-npx tsc -p tsconfig.json --noEmit}"

if git diff --quiet HEAD -- "$file"; then
  echo "${file} is unchanged from HEAD; nothing to check."
  exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -- "$file" "$work/edited"

sh -c "$TSC" > "$work/after.txt" 2>&1
after_status=$?
if ! git show "HEAD:${file}" > "$work/base" 2>/dev/null; then
  # A file new on this run: everything it adds is new.
  : > "$work/base"
fi
cp -- "$work/base" "$file"
sh -c "$TSC" > "$work/before.txt" 2>&1
cp -- "$work/edited" "$file"

if [ "$after_status" -ne 0 ] && ! grep -q 'error TS' "$work/after.txt"; then
  echo "::error::The type checker failed without reporting type errors; treating the edit to ${file} as unverified:" >&2
  tail -20 "$work/after.txt" >&2
  exit 1
fi

grep 'error TS' "$work/before.txt" | sort -u > "$work/before.err" || true
grep 'error TS' "$work/after.txt" | sort -u > "$work/after.err" || true
new_errors="$(comm -13 "$work/before.err" "$work/after.err")"
if [ -n "$new_errors" ]; then
  echo "::error::The edit to ${file} adds type errors the branch does not have:" >&2
  printf '%s\n' "$new_errors" >&2
  exit 1
fi
echo "The edit to ${file} adds no type error ($(wc -l < "$work/before.err" | tr -d ' ') already on the branch)."
