#!/usr/bin/env bash
#
# Runs test files in chunks, each chunk its own vitest process, and exits
# non zero if any chunk failed.
#
#   scripts/run-tests-chunked.sh --set data            the files of a set in scripts/test-sets.txt
#   scripts/run-tests-chunked.sh tests/a.test.ts 'tests/region*.test.ts'
#   scripts/run-tests-chunked.sh --chunk 10 --set code  chunk size (default 20)
#   scripts/run-tests-chunked.sh --set code --shard 2/4  every 4th file from the 2nd (a job of a matrix)
#   npm test                                         both sets (this script; since 2026-10-12)
#
# Why chunks: the whole suite in one vitest process is killed for memory on the
# 7 GB runner (several files import the 35 MB catalogue), and one crash then
# loses every result. Each chunk runs `--pool=forks --poolOptions.forks.singleFork`
# (one process at a time), so a chunk that dies loses only its own files, is
# named at the end, and does not stop the chunks after it.
#
# Each chunk's Node processes run with a heap ceiling (TEST_HEAP_MB, default
# 4096 MB, through NODE_OPTIONS --max-old-space-size): a test that runs away
# then fails with "heap out of memory" naming its file, instead of the kernel
# killing the whole chunk and the runner with it (2026-10-12 audit).
#
# Stopping a run: this script prints `kill <pid>` at its start. That stops this
# run and only this run (the chunk's vitest goes with it). Never `pkill vitest`
# or `pkill node`: on a shared machine that kills other agents' runs too, which
# happened twice on 11 and 12 October 2026.
#
# Arguments are test files or patterns (a pattern is expanded here, relative to
# the repository root), and `--set NAME` adds the files of that set. A pattern
# that matches nothing, a file that does not exist and an empty list are errors:
# a typo must not pass as "nothing failed".
#
# At the end it prints one line per chunk with its time, the files that failed,
# and, when GITHUB_STEP_SUMMARY is set, the same as a summary on the run's page.
# The testCountReporter leaves demo/testCount.generated.ts alone for a partial
# run, so chunking never writes a wrong count (`npm run tests:count` counts).
set -uo pipefail

cd "$(dirname "$0")/.."

chunk_size=20
heap_mb="${TEST_HEAP_MB:-4096}"
if ! [[ "$heap_mb" =~ ^[1-9][0-9]*$ ]]; then echo "TEST_HEAP_MB must be a positive number of megabytes" >&2; exit 2; fi
shard=""
files=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --chunk) chunk_size="${2:-}"; shift 2 ;;
    --shard) shard="${2:-}"; shift 2 ;;
    --set)
      set_name="${2:-}"; shift 2
      list=$(awk -v s="$set_name" '$1 == s { print $2 }' scripts/test-sets.txt)
      if [ -z "$list" ]; then echo "::error::scripts/test-sets.txt has no files in set '$set_name'" >&2; exit 2; fi
      while IFS= read -r f; do files+=("$f"); done <<< "$list"
      ;;
    --) shift ;;
    *)
      shopt -s nullglob
      # shellcheck disable=SC2206
      matched=( $1 )
      shopt -u nullglob
      if [ "${#matched[@]}" -eq 0 ]; then echo "::error::No test file matches '$1'" >&2; exit 2; fi
      files+=("${matched[@]}"); shift ;;
  esac
done

if ! [[ "$chunk_size" =~ ^[1-9][0-9]*$ ]]; then echo "chunk size must be a positive number" >&2; exit 2; fi
if [ "${#files[@]}" -eq 0 ]; then echo "::error::No test files given" >&2; exit 2; fi
for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "::error::Test file $f does not exist" >&2; exit 2; }
done

# The sorted, de-duplicated list; with --shard I/N, every Nth file from the Ith,
# so the shards of a matrix together run each file exactly once.
list=$(printf '%s\n' "${files[@]}" | sort -u)
if [ -n "$shard" ]; then
  if ! [[ "$shard" =~ ^[1-9][0-9]*/[1-9][0-9]*$ ]] || [ "${shard%/*}" -gt "${shard#*/}" ]; then
    echo "::error::--shard wants I/N with I from 1 to N, got '$shard'" >&2; exit 2
  fi
  list=$(printf '%s\n' "$list" | awk -v i="${shard%/*}" -v n="${shard#*/}" 'NR % n == i % n')
  if [ -z "$list" ]; then echo "::error::Shard $shard holds no test files" >&2; exit 2; fi
fi

work=$(mktemp -d)
chunk_pid=""
# Stopped by Ctrl-C or `kill <this pid>`: the running chunk's whole process
# group goes with it (setsid below makes each chunk a group of its own), so
# no vitest or node of this run is left behind, and nobody else's is touched.
stop_run() {
  if [ -n "$chunk_pid" ]; then kill -- -"$chunk_pid" 2>/dev/null || kill "$chunk_pid" 2>/dev/null; fi
  rm -rf "$work"
  exit 130
}
trap stop_run INT TERM
trap 'rm -rf "$work"' EXIT
printf '%s\n' "$list" | split -l "$chunk_size" -d - "$work/chunk-"

total=$(printf '%s\n' "$list" | wc -l)
chunks=$(ls "$work" | grep -c '^chunk-')
echo "Running $total test files in $chunks chunks of up to $chunk_size, each chunk with a ${heap_mb} MB Node heap ceiling"
echo "To stop this run and only this run: kill $$"

# One chunk: vitest in a process group of its own (setsid, where there is one),
# its output shown and kept, the exit status vitest's.
run_chunk() {
  local log="$1"
  shift
  local script='set -o pipefail; export NODE_OPTIONS="--max-old-space-size='"$heap_mb"'${NODE_OPTIONS:+ $NODE_OPTIONS}"; npx vitest run --pool=forks --poolOptions.forks.singleFork "$@" 2>&1 | tee "$0"'
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -c "$script" "$log" "$@" &
  else
    bash -c "$script" "$log" "$@" &
  fi
  chunk_pid=$!
  wait "$chunk_pid"
  local status=$?
  chunk_pid=""
  return "$status"
}

failed_chunks=()
failed_files=()
summary=()
n=0
started=$(date +%s)
for chunk in "$work"/chunk-*; do
  n=$((n + 1))
  mapfile -t members < "$chunk"
  echo "::group::Chunk $n of $chunks (${#members[@]} files)"
  t0=$(date +%s)
  run_chunk "$chunk.log" "${members[@]}"
  code=$?
  secs=$(( $(date +%s) - t0 ))
  echo "::endgroup::"
  if [ "$code" -eq 0 ]; then
    summary+=("chunk $n: ok, ${#members[@]} files, ${secs}s")
  else
    failed_chunks+=("$n")
    summary+=("chunk $n: FAILED (exit $code), ${#members[@]} files, ${secs}s")
    # The files vitest names as failed; when the process died without naming
    # any (killed for memory), the whole chunk is listed.
    # The runner colours its output (FORCE_COLOR), so the codes come out first.
    named=$(sed 's/\x1b\[[0-9;]*m//g' "$chunk.log" | grep -E '^[[:space:]]*(FAIL|❯)[[:space:]]+tests/' | grep -oE 'tests/[A-Za-z0-9_.-]+\.test\.ts' | sort -u)
    if [ -z "$named" ]; then
      named=$(printf '%s\n' "${members[@]}")
      summary+=("  chunk $n ended without naming a failed file (a crash or a kill): all its files count as failed")
    fi
    while IFS= read -r f; do failed_files+=("$f"); done <<< "$named"
    echo "::error::Chunk $n failed (exit $code): $(echo "$named" | tr '\n' ' ')"
  fi
done

echo
echo "Test chunks, $(( $(date +%s) - started ))s in all:"
printf '  %s\n' "${summary[@]}"
if [ "${#failed_files[@]}" -gt 0 ]; then
  echo "Failed files:"
  printf '  %s\n' "${failed_files[@]}" | sort -u
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Test chunks (${total} files)"
    printf -- '- %s\n' "${summary[@]}"
    if [ "${#failed_files[@]}" -gt 0 ]; then
      echo
      echo "Failed files:"
      printf -- '- `%s`\n' "${failed_files[@]}" | sort -u
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi

[ "${#failed_chunks[@]}" -eq 0 ]
