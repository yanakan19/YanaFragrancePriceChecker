#!/usr/bin/env bash
#
# Commit the given paths and push, surviving a concurrent push to the branch.
#
#   scripts/commit-and-push.sh "Harvest: real prices 2026-08-04" data/catalogue demo/index.html
#
# ── Why this exists ──────────────────────────────────────────────────────────
# The workflow's push steps were a bare `git push`. The branch moves under a
# forty-minute harvest more or less routinely — a scheduled run is nearly
# always in flight, so any push by a person or an agent lands mid-run — and a
# bare push answers that with:
#
#     ! [rejected] ... (fetch first)
#
# which fails the step and throws away the entire harvest. That is not a
# hypothetical: runs 15 and 17 both died exactly this way within three hours,
# losing about an hour of real crawling between them. The workflow's
# `concurrency` group only stops two *workflow runs* colliding; it does nothing
# about a push from anywhere else.
#
# So: rebase our commit onto whatever arrived and try again. The harvest's
# commit only ever touches generated data, while the pushes that race it are
# almost always source changes, so the rebase is nearly always trivial.
#
# ── What it will not do ──────────────────────────────────────────────────────
# It never force-pushes and it never auto-resolves a conflict. A genuine
# conflict means two sources disagree about the same generated file, and
# picking a winner silently could publish the older of two price snapshots.
# That case aborts the rebase and fails loudly with the branch untouched.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <commit-message> <path> [path...]" >&2
  exit 2
fi

message="$1"
shift

# The manifest of generated files (scripts/generated-files.txt): which paths a
# conflict may rebuild, which take the incoming side. See GENERATED_PATHS below.
# shellcheck source=scripts/generated-files.sh
. "$(dirname "$0")/generated-files.sh"
if ! GENERATED_PATHS="$(manifest_paths rebuild)" || [ -z "$GENERATED_PATHS" ]; then
  echo "::error::Could not read the rebuild paths from scripts/generated-files.txt. Nothing was committed." >&2
  exit 1
fi

git config user.name 'pricesniffs-bot'
git config user.email 'bot@users.noreply.github.com'

# demo/index.html fetches its prices from demo/data/<module>.<hash>.json (see
# scripts/build-demo.ts), and every build deletes the files the previous one
# wrote. A page committed without that folder points at files the branch does
# not have, and the site shows no prices at all. So naming the page names the
# folder, whether or not the caller remembered to. Every add below is `-A`,
# which is what stages the old files' deletions along with the new files.
for path in "$@"; do
  if [ "$path" = "demo/index.html" ]; then
    named_data=0
    for p in "$@"; do if [ "$p" = "demo/data" ]; then named_data=1; fi; done
    if [ "$named_data" -eq 0 ]; then set -- "$@" demo/data; fi
    break
  fi
done

# Paths that do not exist yet are skipped rather than fatal: the house harvest
# only writes its files once a storefront has actually returned something.
staged_any=0
wants_fresh_demo=0
for path in "$@"; do
  if [ -e "$path" ]; then
    git add -A -- "$path"
    staged_any=1
  fi
  if [ "$path" = "demo/index.html" ]; then wants_fresh_demo=1; fi
done

if [ "$staged_any" -eq 0 ]; then
  echo "None of the given paths exist yet. Nothing to commit."
  exit 0
fi

if git diff --cached --quiet; then
  echo "Nothing changed."
  exit 0
fi

# ── GitHub's file size limit, checked before anything is committed ──────────
# GitHub refuses a push that carries any file over 100 MiB ("GH001: Large
# files detected") and warns above 50 MiB. Without this check the refusal
# would read to the retry loop below as "the branch moved": eight rebases and
# four minutes later it would fail with a message about attempts, not size.
# demo/catalogue.generated.ts grew from 22 MB to 35.5 MB between 2026-10-02
# and 2026-10-04, so this is a when, not an if, for the page's biggest files.
MAX_FILE_BYTES="${MAX_FILE_BYTES:-99614720}"    # 95 MiB: refuse
WARN_FILE_BYTES="${WARN_FILE_BYTES:-52428800}"  # 50 MiB: warn
oversize=""
while IFS= read -r staged_file; do
  [ -n "$staged_file" ] || continue
  staged_bytes="$(git cat-file -s ":${staged_file}" 2>/dev/null || echo 0)"
  if [ "$staged_bytes" -gt "$MAX_FILE_BYTES" ]; then
    oversize="${oversize} ${staged_file} ($(( staged_bytes / 1048576 )) MiB)"
  elif [ "$staged_bytes" -gt "$WARN_FILE_BYTES" ]; then
    echo "::warning::${staged_file} is $(( staged_bytes / 1048576 )) MiB. GitHub warns above 50 MiB and refuses any file over 100 MiB; split or shrink it before it gets there (see docs/PIPELINE-FAILURE-MODES.md)."
  fi
done < <(git diff --cached --name-only --diff-filter=AM)
if [ -n "$oversize" ]; then
  git reset -q
  echo "::error::Refusing to commit:${oversize} over $(( MAX_FILE_BYTES / 1048576 )) MiB. GitHub refuses any file over 100 MiB, so this push could never land." >&2
  echo "::error::Nothing was committed or pushed. Split or shrink the file (see docs/PIPELINE-FAILURE-MODES.md)." >&2
  exit 1
fi

# ── Never commit a page that is stale against the source beside it ──────────
# demo/index.html is not source; it is the source, already built, and it
# carries a stamp of exactly which source it was built from (see
# scripts/demoInputsHash.ts). A caller that names it is promising that the
# page on disk matches the *.ts and template on disk. Runs #388–#395
# (2026-09-04/05) are what happens when that promise is broken by accident:
# the rebuild step timed out before `npm run demo` ran, the caller committed
# a new demo/catalogue.generated.ts beside the old page regardless, the
# freshness test then failed on every later run, and — because that test
# gates every harvest — no prices moved for over a day. The workflow now
# refuses to reach this script after a rebuild that did not finish; this is
# the second lock on the same door, for whichever caller forgets the first.
#
# Checked here, before anything is committed, and again after every rebase
# below — a clean rebase onto someone else's source change leaves our page
# just as stale as a timeout does, and until now nothing looked.
# Overridable like REGENERATE, and self-skipping outside this app (the
# checker exits 0 wherever there is no tsconfig.demo.json to check against).
FRESHNESS_CHECK="${FRESHNESS_CHECK:-npx tsx \"$(dirname "$0")/check-demo-freshness.ts\"}"

demo_is_fresh() {
  if [ "$wants_fresh_demo" -eq 0 ]; then return 0; fi
  sh -c "$FRESHNESS_CHECK"
}

if ! demo_is_fresh; then
  git reset -q
  echo "::error::Refusing to commit demo/index.html: it was built from different source than is on" >&2
  echo "::error::disk now (see the check above). Run \`npm run demo\` and commit the result. Nothing was" >&2
  echo "::error::committed or pushed; the branch is exactly as it was." >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"

# ── The signed-commit attempt, added 2026-09-02 ───────────────────────────────
# A commit made the ordinary way below — `git commit` on a runner, then
# `git push` — carries no signature GitHub can verify, which is why every one
# of this pipeline's commits shows as unverified. A commit created through
# GitHub's own API with the workflow token is signed by GitHub and comes back
# Verified. docs/DECISIONS.md D16 and D18 established that mechanism and then
# refused to land it three times; read both before touching this.
#
# What is different this time is the *shape*, not the appetite for risk. This
# is not a conversion of this script to the API. Everything below this block —
# the commit, the retry budget, the rebase, resolve_generated_conflicts, every
# named incident encoded in them — is byte-for-byte what it was, and it is
# still what runs on every path but one narrow, self-refusing case:
#
#   * signed-commit.sh refuses unless local HEAD is already exactly the remote
#     head, i.e. unless this push would have been a plain fast-forward with no
#     rebase to do. The instant there is anything to rebase it declines and
#     this script does the whole job. Nothing re-derives a three-way merge
#     against the Git Data API, which is the specific thing D16 called the
#     larger risk and D18 re-confirmed.
#   * It refuses outright for the four call sites carrying the oversized
#     generated files, so D16's size question is not merely unanswered here,
#     it is never asked.
#   * It runs BEFORE `git commit`, so a failure of any kind leaves the tree
#     exactly as it was and execution continues into the ordinary path. There
#     is no outcome in which this block loses a harvest; the worst it can cost
#     is one HTTPS round trip.
#   * `SIGNED_COMMITS=off` in the environment turns it off with no code change.
#
# On success the branch already carries our content, so the local checkout is
# resynced to it and we stop. `--hard` is safe here for the same reason the
# discard further down is: at this point everything not staged is reproducible
# build output, and everything staged is what the remote now has.
signed_commit_script="$(dirname "$0")/signed-commit.sh"
if [ -f "$signed_commit_script" ]; then
  # `if <cmd>; then` rather than `set +e` around it: this must not disable -e
  # even briefly, and a non-zero exit from the helper is an ordinary, expected
  # answer here rather than an error to be trapped.
  if bash "$signed_commit_script" "$message" "$branch"; then
    git fetch -q origin "$branch"
    git reset -q --hard FETCH_HEAD
    echo "Landed as a signed commit through the GitHub API; nothing to push."
    exit 0
  fi
  echo "Continuing on the ordinary git commit-and-push path."
fi

git commit -m "$message"

# ── A commit that could not be pushed does not outlive this script ──────────
# Every failure below used to leave our commit on the runner's local branch.
# The workflow's next commit step then carried it along, met the same
# conflict, and failed too: a shipping report that could not land cost the
# harvest commit after it. On any failing exit from here on, the commit is
# undone and its changes are left in the working tree, unstaged, for a later
# step to commit or discard. A "manual" file (machine-written source, see
# scripts/generated-files.txt) is put back to the branch's version instead,
# so an edit that could not be pushed is neither bundled into a page build nor
# committed by a later step that never asked for it.
committed_unpushed=1
undo_unpushed_commit() {
  status=$?
  if [ "$status" -ne 0 ] && [ "${committed_unpushed:-0}" -eq 1 ]; then
    if [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
      git rebase --abort 2>/dev/null || true
    fi
    if git reset -q --mixed HEAD~1; then
      for undo_path in "${CALLER_PATHS[@]}"; do
        if [ "$(manifest_policy "$undo_path")" = manual ]; then
          git checkout -q HEAD -- "$undo_path" 2>/dev/null || true
        fi
      done
      echo "::warning::The unpushed commit was undone; its changes are uncommitted in the working tree, for a later step to commit or discard." >&2
    else
      echo "::warning::Could not undo the unpushed commit; it is still on the runner's local branch." >&2
    fi
  fi
  return "$status"
}
trap undo_unpushed_commit EXIT

# ── The retry budget ─────────────────────────────────────────────────────────
# Five attempts with a plain doubling backoff (2s, 4s, 8s, 16s — 30 seconds of
# waiting in total) from this script's first version until 2026-09-01. That
# was tuned for the case in the header above: one scheduled run racing the
# occasional push from a person, where the branch moves once and the first
# rebase wins.
#
# Run #366 (2026-09-01) was the other case. Five agents were pushing to the
# branch at once; the harvest lost every one of its five attempts and died
# with "Still could not push after 5 attempts. The commit exists locally on
# the runner but is not on the branch." An hour of real price data was
# discarded, having already been crawled.
#
# Two things were wrong for a burst rather than a single collision. The budget
# was too short: 30 seconds does not outlast a group of agents that each take
# longer than that to prepare a push. And the backoff was deterministic, which
# is worse than it looks — every loser of a race waits the same 2s, then the
# same 4s, so a burst does not spread out, it re-collides in lockstep at each
# step. That is the classic thundering herd, and the classic fix is jitter.
#
# So: eight attempts, exponential to a 30s cap, each wait plus a random extra
# of up to its own length (2-4s, 4-8s, 8-16s, 16-32s, then 30-60s), which
# spreads racers apart instead of resynchronising them. The seven waits sum to
# 120s of base, so the budget is 2-4 minutes of waiting before giving up
# against the 30 seconds it was — set against a job that has often just spent
# an hour crawling, that is cheap insurance for the thing it insures.
#
# What is deliberately unchanged: the set of files committed, and how a
# conflict is resolved (resolve_generated_conflicts above, unchanged, and
# still a loud abort for anything that is neither generated nor a raw
# snapshot). A push that cannot be made honestly is still not made.
max_attempts=8
delay_cap=30
delay=2

# Files that are built, never authored. A conflict in one of these is not two
# sources disagreeing about a fact — it is two runs having built the same
# artefact at different moments, and the answer is to rebuild it from the
# merged inputs rather than to pick a side.
#
# Deliberately NOT here: dist-demo/artifact.html. It used to be, and that was
# a real bug (run #236, 2026-08-18): no caller of this script has ever passed
# it to be committed — it is gitignored build output, never tracked — yet it
# was listed here and so got blindly `git add`-ed after every regenerate.
# That add always failed ("paths are ignored by one of your .gitignore
# files"), and because bash suppresses -e for commands run inside a function
# whose result feeds an `if` (resolve_generated_conflicts does, below), the
# failure did not stop the script — it just meant this function could reach
# `git rebase --continue` having silently skipped a step it assumed had
# worked. Fixed by removing the path rather than trusting that quirk; see
# also the explicit exit-code checks below, added so a future mistake here
# fails loudly instead of vanishing the same way.
#
# data/price-history-checkpoint.json is the replay's own resume point (see
# scripts/priceHistoryReplay.ts) and belongs in this list for the same reason
# priceHistory.generated.ts does: it is a deterministic function of the
# catalogue commits and nothing else. On a conflict the incoming side is
# checked out first, like every path here, and the regenerate then *resumes
# from that* — so a conflict costs a replay of the few commits since the
# incoming checkpoint, never the ten-minute-and-growing replay from the first
# commit that a checkpoint left with conflict markers would force.
#
# demo/data is the page's data, written by the same build as
# demo/data/<module>.<hash>.json. Content-hashed names mean two runs can only
# ever disagree about which files exist, never about what one contains, so it
# is listed as the folder: the rebuild below writes the merged build's files
# and deletes the rest, and staging the folder with -A records both.
#
# demo/sitemap.xml was missing, and run #592 (2026-10-04, job 111345364820)
# is what that cost. `npm run demo` ends in `tsx scripts/build-sitemap.ts`, so
# the sitemap is written by the very REGENERATE below, from the same
# catalogue, in the same breath as demo/index.html. It was left out when no
# caller named it (see the runs #266/#268 note further down); since then three
# call sites in catalogue-daily.yml have started naming it ("Commit synced
# Awin feeds", "Commit rebuilt app", "Commit what changed"), so whenever two
# builds of the page raced, the sitemap conflicted beside index.html and this
# script refused it as "neither a generated file nor a raw harvest snapshot".
# #592 had pushed its harvest by then (1028a0b) but lost its rebuilt page,
# its price history and its replay checkpoint over a file it rebuilds anyway.
# Listing it here does not widen anyone's commit: after a regenerate only the
# paths the caller named are re-staged (see named_by_caller below), so a
# caller that does not pass the sitemap still never commits it.
#
# ── One list, 2026-10-04 ─────────────────────────────────────────────────────
# This used to be a list typed out here, a second one in is_raw_snapshot, and
# a third and fourth in the workflows' commit steps, and #592 was those lists
# disagreeing. They are now all read from scripts/generated-files.txt: the
# "rebuild" lines are GENERATED_PATHS, the "incoming" lines are what
# is_raw_snapshot accepts, and the build scripts refuse to write a committed
# file that is not listed there (scripts/generatedFiles.ts). The incident
# notes below stay, because they explain why each entry is in the category it
# is; the entries themselves live only in the manifest. GENERATED_PATHS is
# read near the top of this script, before anything is staged, so an
# unreadable manifest stops the script with the branch untouched.

# The paths this invocation was asked to commit, after the demo/data expansion
# above. A path may be a folder (data/catalogue, demo/data).
CALLER_PATHS=("$@")

named_by_caller() {
  for p in "${CALLER_PATHS[@]}"; do
    if [ "$1" = "$p" ]; then return 0; fi
    case "$1" in "$p"/*) return 0 ;; esac
  done
  return 1
}

# How to rebuild them. Overridable so this script does not hard-code knowledge
# of the app's build for callers that generate something else.
#
# priceHistory.generated.ts is a deterministic replay of the catalogue commits
# in git, never a diff against its own previous content — so unlike a
# hand-maintained file, there is no real ambiguity to a conflict in it: both
# sides are trying to say the same thing from the same source of truth, and
# rebuilding it fresh is not picking a winner, it is the only correct answer
# either side could have given.
# `npm run rebuild` is catalogue:demo, deals:build, catalogue:history and demo,
# in that order (package.json), the same command "Rebuild the app from
# harvested prices" runs, so the two can never disagree about what a rebuild is.
REGENERATE="${REGENERATE:-npm run rebuild}"

is_generated() {
  [ "$(manifest_policy "$1")" = rebuild ]
}

# Raw per-retailer/per-house harvest snapshots — data/catalogue/<id>.json,
# data/houses/<id>.json, and the small standalone report files a scan step
# writes. These are not rebuildable the way GENERATED_PATHS is: nothing
# regenerates data/catalogue/allbeauty.json from some other input, it IS the
# input. A conflict here is two runs each having genuinely harvested the same
# retailer at two different moments, not a disagreement to adjudicate — every
# case below matches scripts/catalogue-harvest.ts, scripts/houses-harvest.ts,
# scripts/awin-feed-sync.ts, scripts/shipping-discover.ts and
# scripts/image-link-check.ts's own write targets.
#
# demo/deals.generated.ts used to be listed here, deliberately not in
# GENERATED_PATHS: a rebuild mid-conflict would have rebuilt it alone,
# against whichever catalogue was on disk, splitting the pair it forms with
# demo/catalogue.generated.ts (see scripts/build-deals.ts's header). But
# taking the incoming side split the pair too, the other way round: the
# regenerate rebuilds the catalogue from the merged inputs, our harvest
# included, and the incoming deals were built from the catalogue before it.
# That path was never reached while the sitemap conflict beside it stopped
# every such rebase (run #592 had both); with that fixed it would have been.
# It is now in GENERATED_PATHS, and REGENERATE runs `deals:build` straight
# after `catalogue:demo`, exactly as "Rebuild the app from harvested prices"
# does, so the pair is rebuilt together from the same merged catalogue.
#
# The *-marker.txt / *-state.json entries are the cadence-gate bookkeeping
# the workflow's periodic steps (shipping discovery, Awin sync) read to
# decide "have I run recently enough" — see catalogue-daily.yml's MARKER=
# lines. Machine-written timestamps, never hand-edited, same category as the
# report files above. Deals used to have one; it went with the cadence.
#
# Why some of the "incoming" lines in scripts/generated-files.txt are there:
#
#   - docs/DELIVERY-RECHECK.md: scripts/delivery-recheck.ts's monthly output.
#     It lives under docs/ but is regenerated whole every run, like the JSON
#     beside it.
#   - data/harvest-report.json, data/harvest-cursor.json,
#     data/metered-harvest-marker.txt: the harvest's own three, and they were
#     missing once. Every scheduled harvest rewrites them, so they conflict
#     the moment two runs overlap, and refusing a harvest that already
#     happened over a bookkeeping file is the wrong answer.
#   - data/render-capture/: one capture_render_shop dispatch writes one
#     shop's own folder (src/catalogue/renderCapture.ts), so a conflict is at
#     most two dispatches for two shops racing.
#   - demo/testCount.generated.ts: written by scripts/testCountReporter.ts as
#     a side effect of a full `npm test`, never by REGENERATE, so it cannot be
#     rebuilt here, and need not be: our commit changes only generated data,
#     never a test, so the incoming side counted the suite the merged branch
#     holds. Left out of the page's freshness stamp (HASH_EXCLUDED_INPUTS in
#     scripts/demoInputsHash.ts).
#   - The fragrance links, image and verification reports: each written by
#     one daily or weekly workflow; the next run writes them again.
is_raw_snapshot() {
  [ "$(manifest_policy "$1")" = incoming ]
}

# Resolve a rebase that stalled, but only when every conflicted file is a
# build artefact or a raw harvest snapshot. Returns non-zero for anything
# else, so a genuine disagreement in actual source still stops the run loudly.
#
# Why this exists: the first version of this script treated every conflict as
# unresolvable. That was right in spirit and wrong in practice — the harvest
# commit touches demo/index.html and demo/catalogue.generated.ts, and so does
# any push that rebuilds the app, so an ordinary source change landing during a
# 40-minute crawl guaranteed a conflict in a file neither side actually
# disagreed about. Two consecutive runs died that way, each discarding a
# complete harvest, and the second had already gained 154 products.
#
# The raw-snapshot half of this (data/catalogue/*.json etc.) was added after
# runs #124 and #126 both died the same way for a reason this first version
# never covered: the demo/*.ts files it already handled rebuilt cleanly, but
# the underlying data/catalogue/allbeauty.json and a dozen data/houses/*.json
# files conflicted too, and "not generated" was true but not the right
# category for them — they needed "take the incoming side, no rebuild step,"
# not the demo files' "take it and then regenerate."
resolve_generated_conflicts() {
  conflicted="$(git diff --name-only --diff-filter=U)"
  [ -n "$conflicted" ] || return 1

  needs_regenerate=0
  for file in $conflicted; do
    if is_generated "$file"; then
      needs_regenerate=1
    elif ! is_raw_snapshot "$file"; then
      if [ "$(manifest_policy "$file")" = manual ]; then
        echo "Conflict in ${file}, machine-written source (\"manual\" in scripts/generated-files.txt) that a person must merge." >&2
      else
        echo "Conflict in ${file}, which is neither a generated file nor a raw harvest snapshot (not in scripts/generated-files.txt)." >&2
      fi
      return 1
    fi
  done

  # Take the incoming side for everything conflicted. Rebuildable views get
  # regenerated from the merged inputs below so they stay internally
  # consistent; raw snapshots do not need that — each is independently valid
  # on its own, and this run's own freshly harvested delta for whichever
  # retailer or house conflicted is a one-cycle loss the next scheduled
  # harvest naturally supersedes, not a permanent one.
  #
  # "Incoming side" is --ours here, not --theirs. `git rebase` flips the
  # usual merge meaning: while a commit is being replayed, --ours is the
  # branch we are rebasing onto (the already-pushed, incoming side) and
  # --theirs is the commit currently being applied (our own local harvest
  # commit) — the reverse of `git merge`. An earlier version of this script
  # had that backwards, which happened to be harmless for GENERATED_PATHS
  # (regenerated fresh below regardless) but meant every raw-snapshot
  # conflict silently kept our own commit's copy instead of the incoming
  # one this comment says it keeps. Fixed; verified locally against a
  # scratch repo (checkout --ours/--theirs content dumped directly).
  #
  # Every checkout/add below is checked explicitly rather than trusted to
  # propagate its exit code, on purpose: this function is called as
  # `if resolve_generated_conflicts; then …`, and bash suppresses `-e` for
  # commands run inside a function invoked as an `if` condition. A command
  # that fails here would otherwise fail silently and let execution reach
  # `git rebase --continue` having skipped a step — which is exactly how
  # run #236 (2026-08-18) went unnoticed for as long as it did.
  for file in $conflicted; do
    # A content-hashed demo/data file both sides deleted, each replacing it
    # with a different, similar one, is a rename/rename conflict: the old path
    # is listed as unmerged but neither side has it, so neither checkout
    # below can succeed. Run #592 would have died on exactly this the moment
    # it got past the sitemap. Removing it is the merged answer both sides
    # agree on (neither kept it), and the regenerate below writes whatever
    # the merged build needs. Only for generated paths: a raw snapshot both
    # sides deleted is not something to settle without a person.
    if is_generated "$file" &&
       ! git cat-file -e ":2:${file}" 2>/dev/null && ! git cat-file -e ":3:${file}" 2>/dev/null; then
      if ! git rm -q --cached --ignore-unmatch -- "$file"; then
        echo "::error::Could not drop ${file}, deleted on both sides of the conflict." >&2
        return 1
      fi
      rm -f -- "$file"
      continue
    fi
    if ! git checkout --ours -- "$file" 2>/dev/null && ! git checkout --theirs -- "$file"; then
      echo "::error::Could not check out either side of the conflict in ${file}." >&2
      return 1
    fi
    if ! git add -- "$file"; then
      echo "::error::git add failed for ${file} while resolving its conflict." >&2
      return 1
    fi
  done

  if [ "$needs_regenerate" -eq 1 ]; then
    if ! sh -c "$REGENERATE"; then
      echo "::error::Could not rebuild generated files during conflict resolution." >&2
      return 1
    fi

    # Only what the caller named: a conflicted file was in our commit, so it is
    # always under one of the caller's paths, and anything else the build
    # rewrote is collateral, discarded below.
    for file in $GENERATED_PATHS; do
      if ! named_by_caller "$file"; then continue; fi
      if [ -e "$file" ] && ! git add -A -- "$file"; then
        echo "::error::git add failed for regenerated file ${file}." >&2
        return 1
      fi
    done

    # The regenerate writes more tracked files than GENERATED_PATHS names, and
    # whatever it writes that nobody stages stops the rebase dead. This is the
    # bug that killed runs #266 and #268 (both 2026-08-20, jobs 96398950549
    # and 96452805773): two complete harvests, 10:46:58→11:58:02 and
    # 14:02:07→15:12:19 by their own step timestamps, discarded at the last
    # step with every conflict already correctly resolved.
    #
    # The file was demo/sitemap.xml. `npm run demo` ends in
    # `tsx scripts/build-sitemap.ts`, which writes it; it is tracked; and it is
    # named by none of the eight call sites in catalogue-daily.yml, nor by the
    # ninth in price-verify.yml, so it is never staged here — no invocation of
    # this script anywhere in .github/workflows/ passes it. Grepping the
    # workflows for "sitemap" returns only references to the *harvest route* of
    # that name, never the file. Both runs logged it rewritten before they
    # died — "demo/sitemap.xml  14727 URLs" at 12:02:13.49 in #266, and
    # "demo/sitemap.xml  15257 URLs" at 15:16:44.87 in #268, 0.45s and 0.35s
    # respectively before the failure.
    #
    # (That was true in August. Three call sites now do name the sitemap, and
    # for those it is staged above like the rest of the page — see
    # GENERATED_PATHS and run #592. For every caller that does not, it is
    # still exactly the collateral this paragraph describes.)
    #
    # What git then says is a lie, and it cost two investigations:
    #
    #     You must edit all merge conflicts and then
    #     mark them as resolved using git add
    #
    # There were no unmerged entries. `git rebase --continue` prints that exact
    # text for an *unstaged change to a tracked file*, which is a different
    # condition entirely. The runs' own logs prove the index was clean: the
    # next line they printed was "Could not start a rebase", and the branch
    # below that emits it is reachable only when `git diff --diff-filter=U`
    # returns nothing at all.
    #
    # Discarding rather than staging is deliberate, and it is the same
    # judgement — for the same reason — as the pre-rebase discard further down:
    # everything unstaged at this point is build output reproducible from the
    # inputs already committed, and demo/sitemap.xml in particular is never
    # part of a commit whose caller did not name it. Staging it would also clear the rebase,
    # but it would quietly widen every caller's committed set to whatever the
    # build happens to touch, which is how a file nobody chose ends up in the
    # history. Restoring from the index instead keeps the resolved content for
    # everything staged above and reverts only the collateral. Written against
    # `git diff --name-only`, not `git status --porcelain`, because at this
    # point every file resolved above is legitimately staged and porcelain
    # would report those too — the question here is only what is unstaged.
    if [ -n "$(git diff --name-only)" ]; then
      echo "Discarding build output the regenerate wrote outside the committed set."
      if ! git checkout -- .; then
        echo "::error::Could not discard the regenerate's uncommitted build output." >&2
        return 1
      fi
    fi
  fi

  if ! GIT_EDITOR=true git rebase --continue; then
    # Dump both states rather than trusting git's message. The message is what
    # sent runs #266 and #268 looking for a conflict that did not exist, so the
    # next reader gets the two facts that actually distinguish the cases:
    # unmerged paths mean a resolution above was genuinely missed, unstaged
    # paths mean the regenerate wrote something outside the set staged here.
    echo "::error::git rebase --continue failed after conflicts appeared resolved." >&2
    echo "::error::Still unmerged: [$(git diff --name-only --diff-filter=U | tr '\n' ' ')]" >&2
    echo "::error::Still unstaged: [$(git diff --name-only | tr '\n' ' ')]" >&2
    return 1
  fi
}

attempt=0
while [ "$attempt" -lt "$max_attempts" ]; do
  attempt=$(( attempt + 1 ))

  if git push origin "$branch"; then
    echo "Pushed on attempt ${attempt}."
    exit 0
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then break
  fi

  # Jitter is the whole point of this line — see the retry-budget comment
  # above. Up to a full extra delay, uniformly, so two racers that lost the
  # same push do not wake at the same instant and lose the next one together.
  wait_for=$(( delay + (RANDOM % (delay + 1)) ))
  echo "Push rejected — the branch moved. Rebasing and retrying in ${wait_for}s (attempt ${attempt}/${max_attempts})."
  sleep "$wait_for"
  delay=$(( delay * 2 ))
  if [ "$delay" -gt "$delay_cap" ]; then delay="$delay_cap"; fi

  # The sleep is before the fetch-rebase below, not after it, and that
  # ordering matters under contention: we want the freshest possible base at
  # the moment we push, so the wait belongs on the far side of the rebase from
  # the push, not between them.

  # A rebase will not start at all while the tree is dirty, and the build
  # reliably leaves it dirty: `npm run demo` writes demo/404.html (and other
  # tracked generated files) whether or not the caller listed them, so
  # anything the caller did not name stays modified. That produced "cannot
  # pull with rebase: You have unstaged changes", which aborted the retry
  # before it began and cost a complete 40-minute harvest. (dist-demo/ is
  # gitignored, so its build output never shows up here regardless — see the
  # GENERATED_PATHS comment above for why it is not listed there either.)
  #
  # Discarding them is safe and is not a judgement call: everything still
  # uncommitted at this point is build output, reproducible from the inputs that
  # were just committed. Restricted to tracked files so nothing unknown is
  # touched, and deliberately not a `git stash` — there is nothing worth
  # restoring, and a stash left behind on a runner is just litter.
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "Discarding uncommitted build output before rebasing."
    git checkout -- .
  fi
  # The one place a build leaves *untracked* output: a new
  # demo/data/<module>.<hash>.json from a rebuild nobody committed. Left
  # there, it would stop the rebase the moment the incoming commit adds the
  # same file ("untracked working tree files would be overwritten"), which it
  # does whenever the other run built the same prices. Same judgement as above.
  if [ -n "$(git ls-files --others --exclude-standard -- demo/data)" ]; then
    echo "Discarding uncommitted data files before rebasing."
    git clean -fq -- demo/data
  fi

  if ! git pull --rebase origin "$branch"; then
    if resolve_generated_conflicts; then
      echo "Conflicts were confined to generated files and raw harvest snapshots; resolved and continued."
    elif [ -z "$(git diff --name-only --diff-filter=U)" ]; then
      # No conflicted paths, so this is not a disagreement about a file. It is
      # one of two different failures, and they need different words.
      #
      # Either the rebase never started — a dirty tree, a network failure, a
      # detached HEAD — or it started, stopped on conflicts, and something went
      # wrong while resolving them. Saying "conflicts in a file that is not
      # generated" for the first case would be a lie, and it was: that is
      # exactly what this printed when the real message underneath was "cannot
      # pull with rebase: You have unstaged changes", sending the next reader
      # after a conflict that did not exist.
      #
      # Telling the two apart by asking git whether a rebase is in progress,
      # rather than assuming: runs #266 and #268 (2026-08-20) landed in the
      # second case and were reported as the first, so their logs said the
      # rebase had never started when in fact it had reached
      # `git rebase --continue` with every conflict resolved. That single wrong
      # word is most of why the cause took as long to find as it did.
      if [ -d "$(git rev-parse --git-path rebase-merge)" ] ||
         [ -d "$(git rev-parse --git-path rebase-apply)" ]; then
        git rebase --abort 2>/dev/null || true
        echo "::error::A rebase onto origin/${branch} started and stopped on conflicts, but could" >&2
        echo "::error::not be carried through. Nothing is unmerged, so this is not a file" >&2
        echo "::error::disagreement — see the errors above for what actually failed." >&2
      else
        echo "::error::Could not start a rebase onto origin/${branch}. See the git error above." >&2
      fi
      echo "::error::Nothing was pushed." >&2
      exit 1
    else
      # Unmerged paths remain, but not always because a file is outside the
      # manifest: run #566 (2026-10-03) reached here after failing to check
      # out either side of a demo/data rename, and this used to say "neither
      # generated nor a raw harvest snapshot" about a file that was both. The
      # line above this one names the real reason; this one names the files.
      unmerged="$(git diff --name-only --diff-filter=U | tr '\n' ' ')"
      git rebase --abort || true
      echo "::error::Could not rebase onto origin/${branch}: the conflict in [${unmerged% }] could not be" >&2
      echo "::error::settled automatically (the reason is in the line above). Refusing to guess which version wins." >&2
      echo "::error::Nothing was pushed; resolve by hand." >&2
      exit 1
    fi
  fi

  # The rebase succeeded — cleanly, or with conflicts confined to generated
  # files and resolved above. Either way our commit now sits on top of
  # whatever landed while we were building, and if that included a change to
  # a bundled source file, the page in our commit was built without it and is
  # stale on arrival. The conflict path already regenerates; the clean path
  # never did, and it is the more common one. Same check as before the first
  # commit, same remedy as the conflict path: rebuild from the merged inputs,
  # re-stage exactly the caller's own set (no widening — anything else the
  # build wrote is discarded, as resolve_generated_conflicts does), and fold
  # it into our commit. That commit is local and unpushed — the push was just
  # rejected — so amending it rewrites nothing anyone has seen.
  if ! demo_is_fresh; then
    echo "The rebase brought in a source change; rebuilding the page so it is not pushed stale."
    if ! sh -c "$REGENERATE"; then
      echo "::error::Could not rebuild the page after rebasing. Nothing was pushed." >&2
      exit 1
    fi
    for path in "$@"; do
      if [ -e "$path" ] && ! git add -A -- "$path"; then
        echo "::error::git add failed for ${path} after the post-rebase rebuild." >&2
        exit 1
      fi
    done
    if [ -n "$(git diff --name-only)" ]; then
      echo "Discarding build output the rebuild wrote outside the committed set."
      git checkout -- .
    fi
    git commit -q --amend --no-edit
    if ! demo_is_fresh; then
      echo "::error::The page is still stale after a rebuild — something outside this script is wrong." >&2
      echo "::error::Nothing was pushed." >&2
      exit 1
    fi
  fi
done

echo "::error::Still could not push after ${max_attempts} attempts. Nothing is on the branch; the changes are left uncommitted on the runner." >&2
exit 1
