/**
 * One display name per brand, chosen from the spellings shops actually use.
 *
 * Retailer feeds disagree about casing and punctuation for the same house, and
 * the catalogue carried every variant as a separate brand: "ARMAF" and "Armaf"
 * were two entries in the Brands list, as were "Hugo Boss" and "HUGO BOSS", and
 * "Dolce & Gabbana" was three. Ten such groups across 166 brand strings.
 *
 * ── The rule, and why it is not "most common wins" ───────────────────────────
 * Frequency alone picks the wrong answer here. "ARMAF" appears 195 times and
 * "Armaf" only 12, because one shop with a large catalogue shouts its vendor
 * field. Shouting is not authority. So a spelling that uses ordinary mixed case
 * beats one that is all capitals or all lowercase, and frequency only breaks
 * ties within that.
 *
 * ── What it will not do ──────────────────────────────────────────────────────
 * It never invents a spelling. The chosen name is always one a shop actually
 * published, which means a genuinely capitalised brand keeps its capitals:
 * DKNY, YSL and CK have no mixed-case variant anywhere in the data, so there is
 * nothing to prefer over them and they are left exactly as they are. Title
 * casing them automatically would produce "Dkny", which is simply wrong.
 *
 * It also never merges two brands that are actually different. Grouping is on
 * letters and digits only, so it joins spellings of one name and nothing else —
 * "Dolce&Gabbana" and "Dolce & Gabbana" collapse, "Armaf" and "ARMAF Online
 * Shop" do not, because they are not the same string with different decoration
 * and deciding they are the same house would be a guess.
 */

/**
 * Group key for one brand: letters and digits, lowercased.
 *
 * Deliberately loses spaces, ampersands, hyphens and punctuation, since those
 * are exactly what shops disagree about. Everything else is preserved, so two
 * genuinely different names can never collide on it.
 */
export function brandKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** True when a string uses ordinary mixed case rather than shouting or whispering. */
function isMixedCase(name: string): boolean {
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length === 0) return false;
  return letters !== letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * Pick the display spelling for one group of variants.
 *
 * `variants` maps each observed spelling to how many listings used it.
 */
export function pickBrandName(variants: ReadonlyMap<string, number>): string {
  const entries = [...variants.entries()];
  if (entries.length === 0) return '';

  return entries.sort((a, b) => {
    // Mixed case first — this is what stops "ARMAF" beating "Armaf" on volume.
    const mixed = Number(isMixedCase(b[0])) - Number(isMixedCase(a[0]));
    if (mixed !== 0) return mixed;
    // Then whichever spelling shops used more often.
    if (b[1] !== a[1]) return b[1] - a[1];
    // Then alphabetical, purely so the build is deterministic.
    return a[0].localeCompare(b[0]);
  })[0]![0];
}

/**
 * Build a lookup from every observed spelling to the one chosen for its group.
 *
 * Pass every brand string in the catalogue, including repeats — the counts are
 * what break ties.
 */
export function buildBrandCanon(allBrandStrings: readonly string[]): Map<string, string> {
  const groups = new Map<string, Map<string, number>>();

  for (const raw of allBrandStrings) {
    const name = raw.trim();
    if (!name) continue;
    const key = brandKey(name);
    if (!key) continue;
    const variants = groups.get(key) ?? new Map<string, number>();
    variants.set(name, (variants.get(name) ?? 0) + 1);
    groups.set(key, variants);
  }

  const canon = new Map<string, string>();
  for (const [, variants] of groups) {
    const chosen = pickBrandName(variants);
    for (const spelling of variants.keys()) canon.set(spelling, chosen);
  }
  return canon;
}
