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
 *
 * Also folds accents mechanically, since 2026-08-26. `"Chloé".toLowerCase()`
 * keeps the é; the old version of this function then deleted it outright as
 * "not a letter", the same treatment punctuation gets — so "Chloe" and
 * "Chloé" hashed to different keys and needed a hand-written KNOWN_ALIASES
 * pair to ever meet. This module's own doc used to call that out as the
 * mechanical grouping's "real blind spot": every accent-only pair below
 * (Chloe/Chloé, Estee Lauder/Estée Lauder, Lancome/Lancôme, Hermes/Hermès,
 * Courreges/Courrèges, Frederic Malle/Frédéric Malle, Salle Privee/Salle
 * Privée, Le Falconé/Le Falcone) exists only because nobody had taught the
 * key function the one rule that covers all of them: an accent changes how a
 * word looks, never which word it is. `normalize('NFKD')` splits a composed
 * accented letter into its plain base plus a separate combining mark
 * (Unicode general category Mn, "nonspacing mark"), which `\p{Mn}` strips
 * explicitly rather than leaving to the existing non-alnum strip — a
 * combining mark is already outside `[a-z0-9]` so the two would collide to
 * the same effect, but stripping it by name says what is actually being
 * discarded and doesn't depend on that coincidence continuing to hold.
 *
 * Checked, not assumed: run over the then-697 canonical houses in the live
 * catalogue (2026-08-26), this folds exactly one further pair beyond what
 * KNOWN_ALIASES already listed by hand — "DSquared2" and "DSquared²" (the
 * superscript 2 is a compatibility decomposition, not a combining mark, but
 * NFKD unpacks it to a plain "2" the same way) — and both spellings already
 * resolved to the same site under demo/brandSites.ts's own, separate
 * normalizeBrand() (which strips digits entirely), so nothing about any
 * brand's resolved site or display name moved. It does NOT fold everything
 * accent-related: NFKD only decomposes letters built from a base plus a
 * diacritic. A letter that is its own thing in Unicode — ø, æ, œ, ß, ł — has
 * no decomposition to fall back to, so "Kanøn"/"Kanon" still needed, and
 * still has, an explicit KNOWN_ALIASES pair below.
 */
export function brandKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
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

  // Found 2026-08-12 by the same "generic descriptor word appended" sweep
  // that produced the 2026-08-11 batch above, and confirmed the same way:
  // checked for products appearing under both spellings with the identical
  // fragrance name, not merged on the name pattern alone. "Ambre des
  // Abysses" and "Bois Mystique" each appear once as "Houbigant" and once as
  // "Houbigant Paris" in the live catalogue; "Blue Lili" appears once as
  // "Orlov" and once as "Orlov Paris" — the same bottle, split by which
  // retailer's feed added the city. Shorter form kept, the same direction as
  // Rabanne, Gres and Mancera above.
  //
  // 'Essential Parfums' / 'Essential Perfumes' and 'New Brand Parfums' /
  // 'New Brand Perfumes' fit the same surface shape and were checked against
  // the same standard, but held out: 'Essential Parfums' carries niche
  // French names (Divine Vanille, Patchouli Mania) and 'Essential Perfumes'
  // carries a completely different, Middle-Eastern-style range (Azlaan,
  // Essence Of Arabia) — no shared fragrance name anywhere, which reads as
  // two unrelated houses that happen to share a common English word, not one
  // house split by translation. 'New Brand Parfums' and 'New Brand Perfumes'
  // have no shared fragrance name either ('Golf Blue'/'Golf Red' against
  // 'Gold Women Prestige'/'Prestige Gold'), so there is no in-catalogue
  // evidence either way and this is left unmerged rather than guessed at.
  [brandKey('Houbigant Paris')]: 'Houbigant',
  [brandKey('Houbigant')]: 'Houbigant',
  [brandKey('Orlov Paris')]: 'Orlov',
  [brandKey('Orlov')]: 'Orlov',

  // Found 2026-08-17 during a full audit of the 639 live brand strings,
  // checking each single-product brand's product name against the rest of
  // the catalogue rather than against the shape of the string (see the
  // module doc's caution about "4711", "100 Bon" etc. — a pattern rule would
  // have deleted those too). Each pair below has an in-catalogue fact behind
  // it, not a guess:
  //
  // 'D&G' carried exactly one product, "Dolce & Gabbana Blue Eau intense" —
  // the retailer's own product title names the house in full, so this is
  // the abbreviation, not a different brand. Does not collide with "Dolce &
  // Gabbana" on brandKey because '&' becomes nothing rather than 'and' here.
  [brandKey('D&G')]: 'Dolce & Gabbana',
  // 'Mon Guerlain' carried exactly one product, itself named "Mon Guerlain" —
  // that is a Guerlain fragrance line (French for "My Guerlain"), not a
  // second house; "Guerlain" already has 66 products in the catalogue.
  [brandKey('Mon Guerlain')]: 'Guerlain',
  // 'Aqua Kenzo' carried exactly one product, "Kenzo Pour Femme" — the
  // retailer's title names the real house; "Kenzo" already has 67 products.
  [brandKey('Aqua Kenzo')]: 'Kenzo',
  // 'Cinnabar' carried exactly one product, itself named "Cinnabar" — a
  // long-running Estée Lauder fragrance, not an independent house; "Estée
  // Lauder" already has 50 products.
  [brandKey('Cinnabar')]: 'Estée Lauder',
  // 'Rance' (one product, "1795 Eau Duc de Berry") and 'Rance 1795' (two
  // products, "Helene" and "Pres de Toi") are the same 18th-century French
  // house — the lone 'Rance' product's own name repeats "1795", the year
  // that is already part of the fuller spelling. Longer form kept as canon
  // since it is the house's actual trading name (unlike the Lattafa-style
  // pairs above, where the shorter form is what shops sell under).
  [brandKey('Rance')]: 'Rance 1795',
  [brandKey('Rance 1795')]: 'Rance 1795',
  // 'Puig' (one product, "Antonio Puig Quorum") and 'Quorum' (one product,
  // "Aqua Quorum") are both the same house feed-mangled two different ways;
  // "Antonio Puig" already has 8 products under its full trading name.
  [brandKey('Puig')]: 'Antonio Puig',
  [brandKey('Quorum')]: 'Antonio Puig',
  [brandKey('Antonio Puig')]: 'Antonio Puig',
  // 'MyPerfumeShop' carried exactly one product, "Burberry Brit For Him" —
  // a retailer's own storefront name landed in the brand field, not a
  // fragrance house; "Burberry" already has 116 products.
  [brandKey('MyPerfumeShop')]: 'Burberry',
  // 'Health Pharm' carried exactly one product, "Jovan Musk" — again a
  // retailer name in the brand field; "Jovan" already has 16 products.
  [brandKey('Health Pharm')]: 'Jovan',
  // 'Blue Stratos' and 'Parfums Bleu Limited' each carried exactly one
  // product, both named identically "Blue Stratos" — the same bottle, one
  // feed crediting the manufacturer's legal name instead of the product's
  // own long-standing brand name. Shorter, market-facing form kept as canon,
  // the same direction as the Lattafa/Rabanne pairs above.
  [brandKey('Blue Stratos')]: 'Blue Stratos',
  [brandKey('Parfums Bleu Limited')]: 'Blue Stratos',

  // Found 2026-08-21: one feed puts the product line in the brand field
  // instead of the house name, producing "Armaf - Club De Nuit",
  // "Armaf - Derby", "Armaf - Ego" and so on as 51 separate brand strings —
  // measured by filtering demo/catalogue.generated.ts's own CATALOGUE brand
  // list for /^Armaf\s*-\s*/i, 51 distinct matches across 178 products, none
  // holding more than 52 (Club De Nuit is Armaf's best-known line). This is
  // the same "canon-fold" shape as the rest of this table, not a new
  // mechanism, and it is safe on the evidence actually available:
  //
  //   - Plain "Armaf" already carries 255 real products, several of them
  //     the exact same lines split above ("Club De Nuit Bling",
  //     "Club De Nuit Maleka" among them) — a different retailer's feed
  //     tags the identical house correctly, which is what confirms these
  //     51 strings are a feed artefact rather than 51 genuinely separate
  //     houses that happen to share a five-letter prefix.
  //   - Every one of the 51 lines' sample product names was read by hand
  //     before writing this table (Bucephalus, Checkmate, Lion's Club,
  //     Miss Armaf and the rest are all real, documented Armaf sub-lines,
  //     not a coincidental name collision with an unrelated house).
  //
  // What this fold does NOT do, flagged rather than fixed: for roughly a
  // quarter of the 178 products (Delicacy's 2, Delights' 4, Landi's 11,
  // Oros Pure's 6, and 1 of Le Parfait's 4 — measured against each
  // product's own `name` field, not guessed), the line word appears ONLY in
  // the brand string being folded away here, nowhere in the product name
  // itself ("Cotton Candy" under Delicacy, "Affecte" under Oros Pure). This
  // fold loses that sub-line context for those products the same way it
  // would if the brand string had simply been deleted — folding the brand
  // is still correct (Armaf is genuinely the house), but reattaching the
  // line name to the product's own `name` field is a separate, larger
  // question (what format, whether it duplicates what other lines already
  // repeat in their own name, whether it belongs here or in fragranceId.ts)
  // that this narrow canon-fold commit deliberately leaves for its own task
  // rather than guessing an answer here.
  [brandKey('Armaf - Arabia')]: 'Armaf',
  [brandKey('Armaf - Art')]: 'Armaf',
  [brandKey('Armaf - Beach Party')]: 'Armaf',
  [brandKey('Armaf - Beau')]: 'Armaf',
  [brandKey('Armaf - Bucephalus')]: 'Armaf',
  [brandKey('Armaf - Checkmate')]: 'Armaf',
  [brandKey('Armaf - Club De Nuit')]: 'Armaf',
  [brandKey('Armaf - Connoisseur')]: 'Armaf',
  [brandKey('Armaf - Craze')]: 'Armaf',
  [brandKey('Armaf - Delicacy')]: 'Armaf',
  [brandKey('Armaf - Delights')]: 'Armaf',
  [brandKey('Armaf - Derby')]: 'Armaf',
  [brandKey('Armaf - Effects')]: 'Armaf',
  [brandKey('Armaf - Ego')]: 'Armaf',
  [brandKey('Armaf - Eter')]: 'Armaf',
  [brandKey('Armaf - Eternia')]: 'Armaf',
  [brandKey('Armaf - Excellus')]: 'Armaf',
  [brandKey('Armaf - Fade')]: 'Armaf',
  [brandKey('Armaf - Hunter')]: 'Armaf',
  [brandKey('Armaf - Infinity')]: 'Armaf',
  [brandKey("Armaf - L'Homme")]: 'Armaf',
  [brandKey('Armaf - La Rosa')]: 'Armaf',
  [brandKey('Armaf - Landi')]: 'Armaf',
  [brandKey('Armaf - Le Femme')]: 'Armaf',
  [brandKey('Armaf - Le Parfait')]: 'Armaf',
  [brandKey('Armaf - Legasi')]: 'Armaf',
  [brandKey('Armaf - Lionheart')]: 'Armaf',
  [brandKey('Armaf - Lions Club')]: 'Armaf',
  [brandKey('Armaf - Miss Armaf')]: 'Armaf',
  [brandKey('Armaf - Niche')]: 'Armaf',
  [brandKey('Armaf - Nomad')]: 'Armaf',
  [brandKey('Armaf - Ombre')]: 'Armaf',
  [brandKey('Armaf - Oros Pure')]: 'Armaf',
  [brandKey('Armaf - Perle')]: 'Armaf',
  [brandKey('Armaf - Private Key')]: 'Armaf',
  [brandKey('Armaf - Provenzano')]: 'Armaf',
  [brandKey('Armaf - SHK')]: 'Armaf',
  [brandKey('Armaf - Scentasy')]: 'Armaf',
  [brandKey('Armaf - Shades')]: 'Armaf',
  [brandKey('Armaf - Signature Night')]: 'Armaf',
  [brandKey('Armaf - Space Age')]: 'Armaf',
  [brandKey('Armaf - Spartacus')]: 'Armaf',
  [brandKey('Armaf - Tag')]: 'Armaf',
  [brandKey('Armaf - Tennis')]: 'Armaf',
  [brandKey('Armaf - The Inventor')]: 'Armaf',
  [brandKey('Armaf - The Pride')]: 'Armaf',
  [brandKey('Armaf - Tres')]: 'Armaf',
  [brandKey('Armaf - Uniq')]: 'Armaf',
  [brandKey('Armaf - Venetian')]: 'Armaf',
  [brandKey('Armaf - Ventana')]: 'Armaf',
  [brandKey('Armaf - Voyage')]: 'Armaf',

  // Found 2026-08-22 from a live-site Brands-directory screenshot showing
  // "Abercrombie & Fitch" and "Abercrombie and Fitch" side by side, and a
  // follow-up full sweep of the catalogue's 721 distinct raw brand strings
  // (buildBrandCanon run over demo/catalogue.generated.ts's own CATALOGUE)
  // for the same shapes. Three distinct shapes, each verified separately:
  //
  // (1) "&" vs "and" is a real, mechanical gap in `brandKey` itself: the key
  // function deletes "&" (it is not a letter or digit) but keeps "and" as
  // three literal letters, so "X & Y" and "X and Y" hash to different keys
  // even though they are the same name written two ways. Five pairs found;
  // every "and"-spelled group was confirmed by its own product names, which
  // spell the house's name out in full inside the fragrance title (e.g. one
  // of the 17 "Viktor and Rolf" products is literally named "Viktor & Rolf
  // BonBon") — the same self-identifying evidence the D&G/Mon Guerlain/Aqua
  // Kenzo entries above rely on, not a guess from the shape of the string:
  [brandKey('Viktor and Rolf')]: 'Viktor & Rolf',
  [brandKey('Dolce and Gabbana')]: 'Dolce & Gabbana',
  [brandKey('Abercrombie and Fitch')]: 'Abercrombie & Fitch',
  [brandKey('Tiffany and Co.')]: 'Tiffany & Co',
  [brandKey('Roger and Gallet')]: 'Roger & Gallet',

  // (2) A trailing "UK" storefront qualifier that names the same house, not
  // a different one. "ARMAF UK" (5 products: Armaf Infusion, Cloud 9,
  // Dunescape, Luna, Old Money) is all-caps shouting the same way "ARMAF"
  // itself was before the 2026-08-21 fold — and three of its five products
  // ("Infusion", "Dunescape", "Old Money") already appear as identically-
  // named products under plain "Armaf" (359 products), the same cross-feed
  // confirmation the 2026-08-21 Armaf commit used. Reported directly by the
  // owner as a named pair to check, confirmed on this evidence, not folded
  // on the owner's say-so alone. "French Avenue UK" (109 products) checked
  // the same way against plain "French Avenue" (209 products): 78 of its
  // 109 product names — Amber Empire, Azzure Aoud, Cocoa Morado and 75
  // more — are byte-identical to a product already listed under "French
  // Avenue", a 72% overlap that leaves no real doubt these are one feed
  // splitting one house by whether it appended "UK" to the brand field:
  [brandKey('ARMAF UK')]: 'Armaf',
  [brandKey('French Avenue UK')]: 'French Avenue',

  // (3) More instances of the "generic descriptor word appended" shape the
  // 2026-08-11/12 sweeps above already found sixteen of, located by the same
  // full-catalogue sweep and confirmed the same way — an in-catalogue fact
  // for each, not the shape of the string:
  //
  //   - 'Ahmed Al Maghribi Perfumes' (16 products, e.g. "Ignite Oud by Ahmed
  //     Al Maghribi", "Kaaf Noir by Ahmed Al Maghribi") against plain 'Ahmed
  //     Al Maghribi' (64 products): 11 of the 16 either repeat a product
  //     name already listed under the bare form ("Ignite Oud", "Kaaf Noir",
  //     "Laathani", "Marj", "Rose Noir", "Summer Oud" among them) or name
  //     the house in full inside the product title, the same shape as the
  //     screenshot's own second example pair. This is the exact pair the
  //     screenshot that started this task showed side by side.
  //   - 'JO MALONE LONDON' (2 products: Sea Salt & Bergamot, Velvety
  //     Butternut) against 'Jo Malone' (35 products). "Jo Malone London" is
  //     the house's own real trading name (confirmed by WebSearch: Velvety
  //     Butternut Cologne is a genuine 2026 Jo Malone London release sold
  //     under that exact name at jomalone.com, Harrods and Nordstrom), the
  //     same "generic-looking suffix that is actually the real name" shape
  //     as Yardley London and Floris London above — but no shop in this
  //     catalogue ever published a mixed-case "Jo Malone London" spelling to
  //     promote to canon (only the all-caps shouting form exists), and this
  //     module's own rule is to never invent a spelling nobody published, so
  //     the existing mixed-case "Jo Malone" is kept as canon instead.
  //   - 'Laurelle London' (2 products) against the house already canonised
  //     as 'Laurelle Parfums' above: one of the 15 products already listed
  //     under 'Laurelle Parfums' is itself named "Laurelle London Always
  //     Forever", which names the "Laurelle London" spelling inside a
  //     product already grouped under the established canon — the same
  //     embedded-name evidence as the D&G pair.
  //   - 'Delroba Parfums' (6 products) against 'Delroba' (6 products): all
  //     six pair up one-to-one on name alone (Cashmere Bouquet, Emerald
  //     Haze, Rose Musk, Sweet Amber match after only "For Men"/"For Woman"
  //     is dropped; "Mystique Mirage" matches byte-for-byte with no edit at
  //     all) — the strongest form of evidence available, the same shape as
  //     the Armaf Club De Nuit cross-check.
  //   - 'Korloff Paris' (1 product, "Cuir Mythique") against 'Korloff' (2
  //     products, one of which is the identical "Cuir Mythique") — the
  //     product name matches byte-for-byte across both spellings.
  //   - 'NOTEBOOK Fragrances' (1 product, "Notebook Bergamot & Sandal Wood
  //     for Him") against 'Notebook' (1 product, "White Flowers Vanilla") —
  //     the product's own title names the house in full, the same shape as
  //     'MyPerfumeShop' and 'Health Pharm' above.
  //   - 'New Brand Parfums' (28 products) against plain 'New Brand' (46
  //     products): 7 product names are shared byte-for-byte after stripping
  //     the repeated "New Brand" prefix ("World Champion", "Free Man" and
  //     "Ohhh Light" among them), and a direct check confirmed none of those
  //     three names appears under any OTHER brand anywhere in the catalogue
  //     — ruling out generic dupe-fragrance naming coincidence. This is a
  //     narrower, evidenced call than the existing 'New Brand Perfumes' and
  //     'New Brand Prestige' holdouts immediately below, which is exactly
  //     why they stay separate: checked against 'New Brand' and against each
  //     other, zero shared product names in either direction, so they are
  //     left unmerged rather than swept in on the strength of sharing the
  //     words "New Brand".
  [brandKey('Ahmed Al Maghribi Perfumes')]: 'Ahmed Al Maghribi',
  [brandKey('JO MALONE LONDON')]: 'Jo Malone',
  [brandKey('Laurelle London')]: 'Laurelle Parfums',
  [brandKey('Delroba Parfums')]: 'Delroba',
  [brandKey('Korloff Paris')]: 'Korloff',
  [brandKey('NOTEBOOK Fragrances')]: 'Notebook',
  [brandKey('New Brand Parfums')]: 'New Brand',

  // (4) Accent-stripped spellings the same sweep turned up, the identical
  // blind spot the module doc already names for Estee Lauder/Lancome/Hermes
  // (`brandKey` is ASCII-only, so an accented letter is deleted rather than
  // folded, and the two spellings hash to different keys). Each pair below
  // is the same word sequence with only diacritics differing — not a
  // judgement call about whether two names are the same house, since an
  // accent cannot change which house a name refers to:
  //
  //   - 'Chloe' / 'Chloé': the fashion house's own name is accented; "Love
  //     Story" and "Nomade" both already appear, byte-identical, under each
  //     spelling.
  //   - 'Courreges' / 'Courrèges': "Seconde Peau" appears under both, and
  //     one of 'Courreges' two products is itself titled "Courrèges Seconde
  //     Peau" — the accented spelling named inside the unaccented group.
  //   - 'Parfums Grès' (1 product, "Gres Cabochard") against 'Gres' (9
  //     products, including "Cabochard" twice) — a third spelling of the
  //     house already partly folded above via 'Gres Parfums' -> 'Gres';
  //     kept on the same un-accented canon already chosen there rather than
  //     introducing a second, competing canon for one house.
  //   - 'Le Falconé' / 'Le Falcone': every one of the 12 "Le Falconé"
  //     products is itself titled with the unaccented "Le Falcone" prefix
  //     ("Le Falcone Bonita Hot Pink", "Le Falcone Muharib" and so on), and
  //     "Muharib" and "Juman Precious" both already appear under plain "Le
  //     Falcone" (22 products) — no independently known "correct" spelling
  //     for this house the way Chloé or Frédéric Malle have one, so the
  //     more common, unaccented form is kept as canon.
  //   - 'Frederic Malle' / 'Frédéric Malle': the niche perfumer's own name
  //     is accented (Editions de Parfums Frédéric Malle); "Carnal Flower",
  //     "Lipstick Rose", "Musc Ravageur" and "Portrait of a Lady" all appear
  //     under both spellings.
  //   - 'Maurer & Wirtz' (1 product, "Tabac") / 'Mäurer & Wirtz' (56
  //     products): the German house's own name carries an umlaut, and it
  //     is the maker of both Tabac and 4711, which is exactly what the 56
  //     products under the accented spelling are.
  //   - 'Salle Privee' / 'Salle Privée': "Illegal", "Legal" and "Rialto" all
  //     appear under both spellings.
  [brandKey('Chloe')]: 'Chloé',
  [brandKey('Courreges')]: 'Courrèges',
  [brandKey('Parfums Grès')]: 'Gres',
  [brandKey('Le Falconé')]: 'Le Falcone',
  [brandKey('Frederic Malle')]: 'Frédéric Malle',
  [brandKey('Maurer & Wirtz')]: 'Mäurer & Wirtz',
  [brandKey('Salle Privee')]: 'Salle Privée',

  // Checked against the same sweep and held out, not merged:
  //
  //   - 'Acqua Di Parisis' (1 product, "Essenza Intensa Musk Sultan"),
  //     'Acqua Di Pino' (1 product, "Pino Silvestre Acqua Di Pino
  //     Fougere" — itself Pino Silvestre's own line), 'Acqua Di Parma' (71
  //     products, an unrelated major luxury house) and 'Acqua Colonia 4711'
  //     (1 product, a Mäurer & Wirtz line, see above) are four genuinely
  //     different houses that merely share the words "Acqua Di"/"Acqua
  //     Colonia" — no product name is shared between any two of them. A
  //     prefix-shaped rule would have folded these; checking each one's own
  //     products is what stopped it.
  //   - 'Avon Cosmetics' (4 products: Cozy Cola, Dragon Fruit Delight,
  //     Blueberry Party, Pistachio Talk) and 'Avon Kids' (2 products,
  //     including one literally named "Avon Kids") were reported directly
  //     for this check. WebSearch confirms Avon Kids is a real, separately
  //     marketed line — dermatologist- and ophthalmologist-tested cologne
  //     formulated for ages 6-9, sold at its own avon.uk.com/products/avon-
  //     kids-* pages — while Cozy Cola, Dragon Fruit Delight and Blueberry
  //     Party are 2025-launch fragrances Fragrantica lists as ordinary Avon
  //     releases "for women and men", sold as plain Avon products rather
  //     than under the Kids label. That is a genuine distinct line, the
  //     same shape as Emporio Armani against Armani above, not decoration
  //     to fold away.
  //   - 'New Brand Perfumes' (2 products) and 'New Brand Prestige' (33
  //     products): checked against plain 'New Brand', against 'New Brand
  //     Parfums' (folded above) and against each other — zero shared
  //     product names in every direction. No in-catalogue evidence either
  //     way, so both stay separate rather than being swept in on the
  //     strength of sharing the words "New Brand".

  // Found 2026-08-26 auditing the 354 canonical houses demo/brandSites.ts
  // could not resolve a site for, looking for spelling splits rather than
  // missing links: for every pair of houses sharing an exact, non-generic
  // product name (excluding single common words like "Red" or "Sport",
  // which dupe-fragrance houses reuse constantly and which produced dozens
  // of false leads — Alfa Romeo/Izod/Mustang all sell a scent called "Red"
  // without being related), checked the shared name and both houses' full
  // product lists by hand before folding anything. Two candidates the same
  // sweep raised were checked and rejected: 'The One' carries "Dolce
  // Gabbana The One Pour Homme" but is Dolce & Gabbana's own famous,
  // independently-marketed fragrance line, the same shape as Emporio Armani
  // against Armani; 'London Fragrances' shares "Blackberry & Bay" with 'Jo
  // Malone' but that name is a real, distinctive Jo Malone London scent —
  // exactly the shape of a budget house naming its own product after a
  // famous one to be found by the same search, not evidence of common
  // ownership, so it stays separate rather than being folded on one
  // matching title alone.
  //
  // 'Oros' (8 products: Pour Homme, Oros Donna, Sacre Bleu, four "Pure
  // <name>" scents) against plain 'Armaf' (360 products): every one of the
  // 8 has a byte-identical or "Oros "-prefixed match already listed under
  // Armaf ("Oros Donna", "Oros Pure Affecte", "Oros Pure Sacre Bleu" and the
  // rest) — the same sub-line Armaf's own 2026-08-21 fold above already
  // canonised as 'Armaf - Oros Pure', reached here by a feed that dropped
  // the "Armaf - " prefix rather than the "Pure" word.
  // 'Whisky' (8 products, all data/catalogue/mybeauty-boutique.json: Black,
  // Black Op, Homme Sport, Origin, Red, Silver, Sugar Skull, Vntage For Men)
  // is not a house — it is EVAFLORPARIS's own men's fragrance line, and
  // mybeauty-boutique's Awin feed put the line name in the brand field
  // instead of the manufacturer. Every one of the 8 rawTitles opens
  // "Evaflor Whisky ..." (the retailer's own product title naming the real
  // house in full, the same shape as 'Drakkar'/'So Poudree' above), and a
  // second retailer scraping the identical fragrances — data/catalogue/
  // perfume-click.json's "Evaflor Whisky Black", "...Homme Sport", "...Red"
  // and "...Vintage" — already carries rawBrand "Evaflor" for the same
  // bottles, cross-confirming which field was wrong. WebSearch confirms
  // Evaflor Paris (evaflorparis.com, trading since 1991) publishes its own
  // dedicated "Whisky" collection page (evaflor.com/en/collections/whisky,
  // "WHISKY ORIGIN" among its listed products), and Fragrantica's designer
  // page for "Evaflor" lists "Whisky", "Whisky Silver" and "Whisky Vintage"
  // as that house's own fragrances — not a different, unrelated brand that
  // happens to be called Whisky. Folding this brand string only, not the
  // bare word "Whisky" wherever else it might appear in a product's own
  // name, the same way 'Drakkar' below is Guy Laroche's line and not a
  // blanket rule about the word "Drakkar".
  [brandKey('Whisky')]: 'Evaflor',
  [brandKey('Oros')]: 'Armaf',
  // 'Drakkar' carried exactly one product, "Guy Laroche Drakkar Noir" — the
  // retailer's own title names the real house in full, the same shape as
  // 'D&G' and 'Mon Guerlain' above; 'Guy Laroche' already has 14 products,
  // including three more "Drakkar Noir" listings.
  [brandKey('Drakkar')]: 'Guy Laroche',
  // 'So Poudree' carried exactly one product, "Lattafa So Poudree Musk" —
  // again the title names the real house; 'Lattafa' already has its own
  // entry above and a verified site in demo/brandSites.ts.
  [brandKey('So Poudree')]: 'Lattafa',
  // 'Eden Classic' (1 product, bare "Mandate"), 'Eden Classics' (1 product,
  // "Eden Classic Mandate") and 'Mandate' (1 product, bare "Mandate") are
  // one fragrance under three brand-field spellings: the "Eden Classics"
  // listing's own product name spells out "Eden Classic" (singular) as the
  // line, which is what settles the singular over the plural as canon, and
  // the plain "Mandate" listing is a feed that put the fragrance's own name
  // in the brand field, the same shape as 'MyPerfumeShop' and 'Health Pharm'
  // above.
  [brandKey('Eden Classic')]: 'Eden Classic',
  [brandKey('Eden Classics')]: 'Eden Classic',
  [brandKey('Mandate')]: 'Eden Classic',
  // 'Kanøn' (1 product) and 'Kanon' (2 products) share a byte-identical
  // "Nordic Elements Air" — the same Scandinavian aftershave house under a
  // stylised-ø spelling and a plain one. `brandKey`'s accent fold (above)
  // does not reach this pair: NFKD has no decomposition for ø, it is its
  // own letter rather than a base letter plus a combining mark, so this
  // still needs its own entry the way ø always will. Fragrantica's own
  // listing for the house's 1966 original uses "Kanøn"; every current
  // retailer selling the Nordic Elements line (Perfume.com, FragranceX,
  // FragranceNet) spells it "Kanon" — picked as canon on the same "no
  // independently known correct spelling, more common form wins" basis as
  // Le Falconé above, not because the ø spelling is wrong.
  [brandKey('Kanøn')]: 'Kanon',
  [brandKey('Kanon')]: 'Kanon',
  // 'Victorinox' (1 product), 'Swiss Army' (6), 'Swiss Army Victorinox' (7)
  // and 'Victorinox Swiss Army' (2) are one house's cologne line spelled
  // four ways, caught by products that repeat the *other* spelling's words
  // inside their own name in both directions: 'Swiss Army' carries
  // "Victorinox Black Steel" and "Victorinox Forget Me Not" while 'Swiss
  // Army Victorinox' carries plain "Swiss Army Black Steel" and "Swiss Army
  // Forget Me Not" — the same fragrances, cross-named — and 'Victorinox'
  // alone's one product, "Swiss Army Victorinox Morning Dew", matches
  // 'Swiss Army Victorinox''s own "Morning Dew" exactly. WebSearch confirms
  // Fragrantica's own designer page lists this house as "Victorinox Swiss
  // Army", which is picked as canon over the more frequent "Swiss Army
  // Victorinox" for that reason, not on frequency.
  [brandKey('Victorinox')]: 'Victorinox Swiss Army',
  [brandKey('Swiss Army')]: 'Victorinox Swiss Army',
  [brandKey('Swiss Army Victorinox')]: 'Victorinox Swiss Army',
  [brandKey('Victorinox Swiss Army')]: 'Victorinox Swiss Army',

  // Found 2026-08-26 auditing demo/brandSites.ts's own "eleven strings that
  // are not brands at all" list, which named seven of these eight as reading
  // like Avon's own fragrance lines on product-title shape alone ("Attraction
  // | Game for Her", the repeated Avon-only "Purse" spray size) but stopped
  // short of folding them, in its own words, because "that is a strong
  // pattern, not a confirmation". data/catalogue/avon.json — the raw scrape
  // of avon.uk.com itself, not a cross-reference — settles it: every one of
  // these eight is a `rawBrand` avon.uk.com uses for its own products, at
  // URLs on its own domain (avon.uk.com/products/attraction-for-her-...,
  // /products/black-suede-secret, /products/imari-queen-..., and so on for
  // all eight). That is the house naming its own line, not a pattern.
  //
  // The eighth, "Perfect Nonsense" (avon.uk.com/products/perfect-nonsense-
  // peppery-peaches-...), was not on that list at all — demo/brandSites.ts
  // had grouped it with "Designer Collection" and "Scent Favourites" instead,
  // on the strength of also reading like a retailer's own generic collection
  // name. Checked against data/catalogue, "Designer Collection" and "Scent
  // Favourites" never appear in avon.json — one is an Awin dupe-fragrance
  // feed (Designer Collection Super Age Pour Homme / One Dollar Pour Homme,
  // wordplay on famous fragrances, not a house), the other is bmstores.co.uk's
  // own private label (Scent Favourites Crimson Reign, Day Dreams — B&M's
  // in-house range) — but "Perfect Nonsense" is avon.uk.com's own product
  // line exactly like the other seven, just missed by the pattern-only check
  // that flagged them. Folded here alongside them rather than left on a list
  // it does not belong on.
  //
  // Canon is 'Avon Cosmetics', the spelling avon.uk.com's own feed actually
  // publishes for its ordinary, no-named-line releases (347 products in
  // data/catalogue/avon.json) — never observed as bare "Avon" anywhere in the
  // data, so that is not available to pick as canon without inventing a
  // spelling nobody published. See demo/brandSites.ts's own 'avon cosmetics'
  // entry (added alongside this fold) for why this now resolves to a site
  // rather than just moving the "356 unresolved" count around.
  [brandKey('Attraction')]: 'Avon Cosmetics',
  [brandKey('Black Suede')]: 'Avon Cosmetics',
  [brandKey('Full Speed')]: 'Avon Cosmetics',
  [brandKey('Little Black Dress')]: 'Avon Cosmetics',
  [brandKey('Imari')]: 'Avon Cosmetics',
  [brandKey('Perceive')]: 'Avon Cosmetics',
  [brandKey('Incandessence')]: 'Avon Cosmetics',
  [brandKey('Perfect Nonsense')]: 'Avon Cosmetics',
  [brandKey('Avon Cosmetics')]: 'Avon Cosmetics',

  // Found 2026-08-26, a third pass this day, checking demo/brandSites.ts's
  // worklist for mis-splits before any web search — the same method the
  // 'Whisky'/Avon-lines folds above already used, applied to two more
  // worklist entries the ranking turned up:
  //
  // 'Eve' (6 products: Confidence, One, Privé Purse, Truth, Truth For Her,
  // Truth Purse) is another avon.uk.com fragrance line reached the same way
  // "Perfect Nonsense" was above: every one of the 6 is a `rawBrand`
  // data/catalogue/avon.json uses for its own products, at URLs on its own
  // domain (avon.uk.com/products/eve-one-for-her-purse-spray-10ml,
  // /products/eve-truth-eau-de-parfum-50ml, /products/avon-eve-confidence-
  // purse-spray-10ml and so on for all 6, including the repeated "Purse"
  // spray-size naming this table's own Avon-lines comment above already
  // flags as an Avon-only shape). Not a coincidental one-word brand name;
  // the house's own scrape names it.
  [brandKey('Eve')]: 'Avon Cosmetics',

  // 'Bottega Veneta Beauty' (1 product, "Good Morning Midnight Parfum Travel
  // Spray") is not a second, unrelated house — it is the same manufacturer
  // as the existing 'Bottega Veneta' group (2 products: Illusione Bois Nu,
  // Illusione for Him) under the current name its 2023 fragrance relaunch
  // trades under. data/catalogue/selfridges.json, the only feed carrying
  // either spelling, uses "BOTTEGA VENETA BEAUTY" as rawBrand at its own
  // /bottega-veneta-beauty-*/ URL slugs (Good Morning Midnight, Ricordami,
  // a Discovery set) — the retailer's own site naming the current business,
  // the same relationship the 'valentino'/'valentino beauty' pair in
  // demo/brandSites.ts already records for a different house that
  // rebranded its fragrance arm the same way. Folded into the shorter,
  // already-established spelling rather than the reverse, since 'Bottega
  // Veneta' already carries this file's real products and 'Beauty' is the
  // division name, not a second trading name shops search for.
  [brandKey('Bottega Veneta Beauty')]: 'Bottega Veneta',

  // Checked the same sweep and confirmed real rather than folded: "CRM"
  // (5 products: Armani Si Passione Red Mask, AZZARO THE MOST WANTED
  // PARFUM, JULIETTE HAS A GUN LILI FANTASY, TIFFANY SHEER, Yves Saint
  // Laurent Libre L'Eau Naturelle) is not a house at all — every one of the
  // 5 is a different, unrelated, already-real fragrance house, and
  // data/catalogue/the-beauty-store-uk.json's own raw scrape shows "CRM" as
  // the rawBrand on Biotherm and Rituals skincare listings too (filtered out
  // here as not fragrance), the same across-many-houses shape as
  // "Unbranded" — a feed field the-beauty-store-uk.com fills with some
  // internal code rather than the actual vendor for a subset of its
  // catalogue. Not fixable by a fold the way a mis-filed single-house line
  // is: there is no one house to fold it into, so it is left alone here and
  // documented in demo/brandSites.ts's own "not a brand" notes instead, the
  // same treatment "Unbranded" already gets.
};

/**
 * The Armaf sub-line a raw brand string named before the fold above — 'Armaf
 * - Landi' -> 'Landi', 'Armaf - Oros Pure' -> 'Oros Pure' — for exactly the
 * 51 strings the block above already reviewed and blessed as real, documented
 * Armaf sub-lines, never for a superficially similar 'Armaf - <line>' string
 * a future feed might introduce that nobody has checked yet.
 *
 * This is what lets scripts/build-demo-catalogue.ts reattach a sub-line name
 * to a product's own `name` field for the ~24 of the 178 products (see the
 * comment on the alias block above) where that line word appeared only in
 * the brand string the fold throws away, nowhere in the product's own name —
 * "Cotton Candy" under Delicacy, "Affecte" under Oros Pure. It deliberately
 * reads the same KNOWN_ALIASES table the fold itself uses, rather than
 * re-deriving "which strings count" from a fresh regex over the shape of the
 * string: the two must never be able to drift apart, one folding a brand
 * this function does not also recognise as a reviewed Armaf line.
 *
 * Returns null for anything not in that reviewed set, including bare 'Armaf'
 * (no ' - ' at all) and an unrelated brand that merely starts with the same
 * five letters ('Armaf Online Shop' has no ' - ' either, so it never reaches
 * the KNOWN_ALIASES check at all).
 */
export function armafLineName(rawBrand: string | null | undefined): string | null {
  if (!rawBrand) return null;
  const trimmed = rawBrand.trim();
  const m = /^Armaf\s*-\s*(.+)$/i.exec(trimmed);
  if (!m) return null;
  if (KNOWN_ALIASES[brandKey(trimmed)] !== 'Armaf') return null;
  return m[1]!.trim();
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
  for (const [key, variants] of groups) {
    const chosen = KNOWN_ALIASES[key] ?? pickBrandName(variants);
    for (const spelling of variants.keys()) canon.set(spelling, chosen);
  }
  return canon;
}
