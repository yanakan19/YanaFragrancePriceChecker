#!/usr/bin/env bash
# Reads the branch's history of demo/catalogue.generated.ts and writes the two
# seed files the catalogue build accepts to start data/id-aliases.json from
# what earlier builds published (src/catalogue/idAliases.ts):
#
#   <dir>/ids.txt      every product id any past build held, one a line
#                      (npm run catalogue:demo -- --seed-ids <dir>/ids.txt)
#   <dir>/aliases.tsv  every id a past build folded into another product and the
#                      product that took it, "absorbed<TAB>survivor", oldest
#                      build first so a later fold wins
#                      (npm run catalogue:demo -- --seed-aliases <dir>/aliases.tsv)
#
# It reads only what was committed: nothing is invented, and an id whose
# product has since gone from every shop simply resolves to nothing in the
# build. Run it once, from the repository root, when the alias file is created
# or lost; the build keeps the file up to date from then on. About ten minutes.
#
#   scripts/id-alias-seed.sh <dir>
set -euo pipefail

dir="${1:?usage: scripts/id-alias-seed.sh <output dir>}"
mkdir -p "$dir"
file=demo/catalogue.generated.ts
: > "$dir/ids.raw"
: > "$dir/aliases.tsv"

for sha in $(git log --reverse --format=%h -- "$file"); do
  # Product ids, in either form the build has written (productIdsIn in
  # src/catalogue/idAliases.ts reads the same two): up to 2026-10-06 the
  # entries were indented JSON, each id its own four space indented "id" line;
  # since then each entry is one line starting {"id":"...".
  git show "$sha:$file" 2>/dev/null | grep -a -o -E '^(    "id": |\{"id":)"[^"]*"' | sed -E 's/^(    "id": |\{"id":)"//; s/"$//' >> "$dir/ids.raw" || true
  # HISTORY_ALIASES: survivor -> the ids it absorbed in that build.
  git show "$sha:$file" 2>/dev/null | grep -a '^export const HISTORY_ALIASES' | node -e '
    const text = require("node:fs").readFileSync(0, "utf8").trim();
    if (!text) process.exit(0);
    const json = text.slice(text.indexOf("= ") + 2).replace(/;$/, "");
    const map = JSON.parse(json);
    for (const [survivor, absorbed] of Object.entries(map)) for (const id of absorbed) console.log(id + "\t" + survivor);
  ' >> "$dir/aliases.tsv" || true
  if [ "$(wc -l < "$dir/ids.raw")" -gt 3000000 ]; then sort -u "$dir/ids.raw" -o "$dir/ids.raw"; fi
done

sort -u "$dir/ids.raw" > "$dir/ids.txt"
rm -f "$dir/ids.raw"
echo "$(wc -l < "$dir/ids.txt") ids, $(wc -l < "$dir/aliases.tsv") folds"
