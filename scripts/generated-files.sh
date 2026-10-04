#!/usr/bin/env bash
#
# Reads scripts/generated-files.txt, the one list of files the pipeline writes
# and commits. Sourced by scripts/commit-and-push.sh, and runnable on its own:
#
#   scripts/generated-files.sh paths rebuild     # the rebuild paths, space separated
#   scripts/generated-files.sh classify <path>   # rebuild | incoming | manual | none
#
# The workflows' "commit the rebuilt app" steps call the first form, so a new
# generated file is committed by adding one line to the manifest, and never by
# remembering every call site (run #592 was a call site and the conflict
# handler disagreeing about demo/sitemap.xml).
#
# Matching is the same as scripts/generatedFiles.ts, and
# tests/generatedFiles.test.ts holds the two to each other: a pattern ending in
# / is a folder, `*` matches any run of characters (/ included, as in a bash
# `case` pattern), anything else is an exact path.

GENERATED_FILES_MANIFEST="${GENERATED_FILES_MANIFEST:-$(dirname "${BASH_SOURCE[0]}")/generated-files.txt}"

# "policy pattern" lines, comments and blanks dropped.
manifest_entries() {
  if [ ! -r "$GENERATED_FILES_MANIFEST" ]; then
    echo "::error::Cannot read the generated files manifest at ${GENERATED_FILES_MANIFEST}." >&2
    return 1
  fi
  local policy pattern rest
  while read -r policy pattern rest || [ -n "$policy" ]; do
    case "$policy" in ''|'#'*) continue ;; esac
    printf '%s %s\n' "$policy" "$pattern"
  done < "$GENERATED_FILES_MANIFEST"
}

# The paths with a given policy, space separated, a folder without its
# trailing slash (so it can be staged with `git add -A -- demo/data`).
manifest_paths() {
  local want="$1" policy pattern out=""
  while read -r policy pattern; do
    [ "$policy" = "$want" ] || continue
    out="${out:+$out }${pattern%/}"
  done < <(manifest_entries)
  printf '%s\n' "$out"
}

# The policy of one repository-relative path, or "none". First match wins.
manifest_policy() {
  local file="$1" policy pattern
  while read -r policy pattern; do
    case "$pattern" in
      */)
        # The folder itself (demo/data) or anything under it (demo/data/x.json).
        case "$file/" in "$pattern"*) echo "$policy"; return 0 ;; esac
        ;;
      *)
        # Unquoted on purpose: the manifest's * is a glob, as in `case`.
        # shellcheck disable=SC2254
        case "$file" in $pattern) echo "$policy"; return 0 ;; esac
        ;;
    esac
  done < <(manifest_entries)
  echo none
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  set -euo pipefail
  case "${1:-}" in
    paths)
      [ "$#" -eq 2 ] || { echo "usage: $0 paths <rebuild|incoming|manual>" >&2; exit 2; }
      manifest_entries > /dev/null
      manifest_paths "$2"
      ;;
    classify)
      [ "$#" -ge 2 ] || { echo "usage: $0 classify <path> [path...]" >&2; exit 2; }
      manifest_entries > /dev/null
      shift
      for p in "$@"; do manifest_policy "$p"; done
      ;;
    *)
      echo "usage: $0 paths <policy> | classify <path> [path...]" >&2
      exit 2
      ;;
  esac
fi
