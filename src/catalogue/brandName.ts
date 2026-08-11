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
 *
 * ── Known aliases: the mechanical grouping's real blind spot ─────────────────
 * `brandKey` catches decoration — casing, spacing, punctuation. It cannot
 * catch two spellings that are letters-and-digits-different: an abbreviation
 * ("Ysl" against "Yves Saint Laurent"), a retired name ("Paco Rabanne" against
 * "Rabanne", the house dropped "Paco" from its branding in 2023), a shortened
 * form ("Armani" against "Giorgio Armani"), a suffix variant ("Dunhill London"
 * against "Dunhill"), or an accent a shop's feed stripped ("Estee Lauder"
 * against "Estée Lauder", "Lancome" against "Lancôme", "Hermes" against
 * "Hermès" — `brandKey` is ASCII only, so it deletes rather than folds an
 * accented letter, and the two spellings hash to different keys). None of
 * that is decoration `brandKey` can see, so it needs to be told, once, by
 * hand — the same discipline as everywhere else here: a fact recorded because
 * someone checked it, not a rule general enough to guess it.
 *
 * "DKNY" is where Donna Karan's diffusion line is sold and searched for, so
 * "Donna Karan" is folded into it rather than the other way round. Every
 * other pair keeps whichever name is the house's own current one.
 *
 * "Emporio Armani" is deliberately not folded into "Giorgio Armani" here.
 * It is Giorgio Armani's diffusion line, but it is bottled, marketed and
 * searched for under its own name, the same way Emporio Armani fragrances
 * are catalogued as their own line everywhere they are sold — treating it as
 * a mere spelling of "Armani" would be merging two things that happen to
 * share a parent company, not two spellings of one name. Plain "Armani" is
 * different: nothing sells fragrance under the bare word "Armani" as its own
 * line, so where it appears here it is shorthand for the main house, and it
 * is folded into "Giorgio Armani".
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

/** See the "Known aliases" section of the module doc above. */
const KNOWN_ALIASES: Record<string, string> = {
  [brandKey('Ysl')]: 'Yves Saint Laurent',
  [brandKey('Yves Saint Laurent')]: 'Yves Saint Laurent',
  [brandKey('Donna Karan')]: 'DKNY',
  [brandKey('Paco Rabanne')]: 'Rabanne',
  [brandKey('Rabanne')]: 'Rabanne',
  [brandKey('Armani')]: 'Giorgio Armani',
  [brandKey('Giorgio Armani')]: 'Giorgio Armani',
  [brandKey('Dunhill London')]: 'Dunhill',
  [brandKey('Estee Lauder')]: 'Estée Lauder',
  [brandKey('Estée Lauder')]: 'Estée Lauder',
  [brandKey('Lancome')]: 'Lancôme',
  [brandKey('Lancôme')]: 'Lancôme',
  [brandKey('Hermes')]: 'Hermès',
  [brandKey('Hermès')]: 'Hermès',

  // Added 2026-08-11 after a live-catalogue sweep for the same "generic
  // descriptor word appended to an otherwise identical name" shape as the
  // pairs above — 'Al Haramain' / 'Al Haramain Perfumes' was reported
  // directly, and checking the rest of the catalogue for the same pattern
  // turned up sixteen more. Each pair below is a real, sourced call about
  // that house's own trading name, the same discipline as the rest of this
  // table — not a mechanical "strip the suffix" rule, which is exactly what
  // this module's own doc warns against (Emporio Armani is not Armani).
  // A few candidates the sweep also found were held out rather than guessed
  // at: 'Dumont' / 'Dumont Paris' / 'Dumont Perfumes UAE' is not folded here
  // because there was not enough confidence they are the same house rather
  // than two or three.
  [brandKey('Afnan Perfumes')]: 'Afnan',
  [brandKey('Afnan')]: 'Afnan',
  [brandKey('Al Haramain Perfumes')]: 'Al Haramain',
  [brandKey('Al Haramain')]: 'Al Haramain',
  // Sold internationally under its full name; "Cuba" alone is the same
  // Fragluxe line, not a different, unrelated house called just "Cuba".
  [brandKey('Cuba')]: 'Cuba Paris',
  [brandKey('Cuba Paris')]: 'Cuba Paris',
  // The London perfumer's own name since 1730 is "Floris London" — "Floris"
  // alone is the same house's name shortened, not a different one.
  [brandKey('Floris')]: 'Floris London',
  [brandKey('Floris London')]: 'Floris London',
  [brandKey('Gres Parfums')]: 'Gres',
  [brandKey('Gres')]: 'Gres',
  [brandKey('Gulf Orchid Fragrances')]: 'Gulf Orchid',
  [brandKey('Gulf Orchid')]: 'Gulf Orchid',
  [brandKey('Khadlaj Perfumes')]: 'Khadlaj',
  [brandKey('Khadlaj')]: 'Khadlaj',
  // The house's own trading name is "Lattafa Perfumes", but "Lattafa" alone
  // is overwhelmingly how it is marketed, searched for and sold — the same
  // "Rabanne" call above, made for the same reason.
  [brandKey('Lattafa Perfumes')]: 'Lattafa',
  [brandKey('Lattafa')]: 'Lattafa',
  // Real UK dupe-fragrance house trading name is "Laurelle Parfums"; the
  // 10-to-1 split toward the fuller spelling in the live catalogue supports
  // this the same way it supported "Lattafa" the other direction.
  [brandKey('Laurelle')]: 'Laurelle Parfums',
  [brandKey('Laurelle Parfums')]: 'Laurelle Parfums',
  [brandKey('Mancera Paris')]: 'Mancera',
  [brandKey('Mancera')]: 'Mancera',
  // British niche house's own name is "PAIRFUM London".
  [brandKey('Pairfum')]: 'Pairfum London',
  [brandKey('Pairfum London')]: 'Pairfum London',
  [brandKey('Ralph Lauren Fragrances')]: 'Ralph Lauren',
  [brandKey('Ralph Lauren')]: 'Ralph Lauren',
  // Neither observed spelling of this UAE house is mixed case on its own —
  // "REEF" is all caps and never appears any other way in the data — so
  // "Reef Perfumes" is picked as the display form for the same reason
  // pickBrandName below would pick it: it is the one spelling that is not
  // shouting.
  [brandKey('Reef')]: 'Reef Perfumes',
  [brandKey('Reef Perfumes')]: 'Reef Perfumes',
  [brandKey('Rayhaan Perfumes')]: 'Rayhaan',
  [brandKey('Rayhaan')]: 'Rayhaan',
  [brandKey('Surrati Perfumes')]: 'Surrati',
  [brandKey('Surrati')]: 'Surrati',
  // Yardley's own global trading name is "Yardley London".
  [brandKey('Yardley')]: 'Yardley London',
  [brandKey('Yardley London')]: 'Yardley London',

  // Reported directly, both on 2026-08-11.
  //
  // 'Arabiyat' / 'Arabiyat Prestige': told explicitly to fold these into one
  // rather than treat 'Prestige' as marking a genuinely separate line the
  // way 'Emporio Armani' does for Armani — noted here as instruction rather
  // than independently verified the way the rest of this table is, in case
  // that call ever needs revisiting. 'Arabiyat' picked as the shorter,
  // plainer form, the same direction as Al Haramain and Lattafa above.
  [brandKey('Arabiyat Prestige')]: 'Arabiyat',
  [brandKey('Arabiyat')]: 'Arabiyat',

  // 'BV UK' and 'BellaVita Luxury (UK)' are the same house under two
  // different shop-feed spellings; told to use 'Bellavita UK' as the display
  // form specifically, overriding what pickBrandName would otherwise choose.
  // 'Bellavita' and 'BELLAVITA' included defensively for the same casing
  // variants this house's own feeds are already known to use elsewhere (see
  // cannotCarryBrand's test coverage for this exact retailer).
  [brandKey('BV UK')]: 'Bellavita UK',
  [brandKey('BellaVita Luxury (UK)')]: 'Bellavita UK',
  [brandKey('Bellavita')]: 'Bellavita UK',
  [brandKey('Bellavita UK')]: 'Bellavita UK',

  // Kilian Hennessy's house rebranded from "By Kilian" to plain "Kilian" in
  // 2021 — the same shape as the Rabanne call above, a real name change
  // rather than decoration. NOT the same brand as "By Terry" (Terry de
  // Gunzburg's separate house), which is left untouched: "By" is part of
  // that name, not a prefix to strip, and the two houses are unrelated.
  [brandKey('By Kilian')]: 'Kilian',
  [brandKey('Kilian')]: 'Kilian',
};

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
  for (const [key, variants] of groups) {
    const chosen = KNOWN_ALIASES[key] ?? pickBrandName(variants);
    for (const spelling of variants.keys()) canon.set(spelling, chosen);
  }
  return canon;
}
