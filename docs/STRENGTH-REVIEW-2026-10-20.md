# Strength review, 20 Oct 2026

Owner request: for every fragrance shown in more than one strength (same brand and name, same size,
different label), check the brand's own site and, where the brand makes one strength, correct the shop's
label so the listings join the one real product.

## Why Cuoium was split again

The 4 Oct fix (`houseStrengthEvidence.ts`) settled Orto Parisi Cuoium 50 ml as a Parfum for Bloom
Perfumery and Nicchia. Roullier White was added on 9 Oct. Its Shopify vendor field says "PMD" (its
importer) on 16 Orto Parisi and Nasomatto bottles whose titles say "Orto Parisi - Cuoium (EdP) 50ml".
The build read "PMD" as the brand, so the bottle became "Pmd Orto Parisi - Cuoium", an Eau de Parfum of
a house called Pmd, and the reviewed entry (keyed on the brand Orto Parisi) never met it. Not a
regression of the old fix, a new shop with a new spelling. Fix: `vendorsNotBrands` on the Roullier White
registry entry (the vendor value is ignored and the brand is recovered from the title). All nine Orto
Parisi bottles of that shop now join their Parfum; Nasomatto had the same problem.

Two parser and rule fixes found on the way:

- "Eau de Perfume" (Clinique UK's own wording, also two small shops) read as Not stated; it is now Eau de
  Parfum. This joined Calvin Klein Eternity Moment.
- A hand-reviewed brand statement is no longer cancelled by the brand's own silent shop listing of the
  same name and size (Zimaya's shop writes "Sharaf The Club 100ml" with no strength; its page is tagged
  EDP). Two different stated strengths still cancel it.

## Method and numbers

All three catalogues (UK, US, India), 2,653 families with two or more strength labels. Most are real
(EDT beside EDP is nearly always two products), so the review kept the cases where one product could
have two labels: the same size under adjacent strengths (Eau de Parfum, Parfum, Extrait de Parfum, Not
stated, Disputed). That leaves 552 families (UK 226, US 261, India 65).

- 50 UK and 12 US families have two different barcodes, one per strength: two real products, kept
  apart, no site check needed.
- UK, 176 families without that proof: 35 settled to one strength (merged), 24 confirmed as genuinely
  several strengths, the rest unresolved below. The 35 plus Eternity Moment and Cuoium are 37 bottles.
- US and India (326 families): not reviewed in this batch.
- The 24 confirmed and all 35 merges are in code: merges in `HOUSE_STRENGTH_EVIDENCE`
  (`houseStrengthEvidence.ts`, plus two Rabanne barcodes in `CONCENTRATION_RESOLUTIONS`), kept families in
  `strengthReviewed.ts`. `tests/strengthReviewed.test.ts` checks that every merge has a brand page, a
  quote and a day, and that a family the brand makes in several strengths is never merged.

## Merged (brand makes one strength)

Clinique Happy, Happy Heart, Aromatics Elixir (Eau de Parfum). Zimaya Sharaf The Club, Sharaf Blend,
Fatima, Amber Is Great (Eau de Parfum, shop tags). Atelier des Ors Blue Madeleine, Noir By Night (Eau de
Parfum). Goldfield & Banks Silky Woods (Eau de Parfum; the extrait is the separate Silky Woods Elixir),
Tales of Amber (Extrait). Mykonos Inception, California Blue, Sorrento, Glitch, Inferno, Marbella,
Bonfire Vanilla, Imperium, Untamed (Extrait; house crawl). Versace Eros Najim, Parfums de Marly Layton
Exclusif and Pegasus Exclusif, Burberry My Burberry Black, Cartier Pasha de Cartier, Xerjoff Alexandria
II, Cruz del Sur I, Pikovaya Dama, Jean Paul Gaultier Scandal Absolu, Rabanne Olympea Absolu (Parfum or
Parfum Intense). Rabanne Lady Million Royal (Eau de Parfum). Kilian Angels' Share Paradis, Initio Lift Me
Up, Maison Crivelli Patchouli Magnetik, BDK Pas ce Soir Extrait (Extrait). Each with its page in the code.

## Confirmed as genuinely several strengths (stay split)

Tom Ford Ombre Leather, Costa Azzurra, Soleil Blanc, Oud Wood, Neroli Portofino. YSL Libre. Versace Eros.
Guerlain La Petite Robe Noire, L'Homme Ideal, Habit Rouge. Calvin Klein Eternity For Men. Burberry Hero.
Hugo Boss Bottled. Dior Sauvage. Maison Francis Kurkdjian Oud Satin Mood, Oud Silk Mood, Oud. Dolce &
Gabbana Devotion For Men. BDK Rouge Smoking, Gris Charnel, Pas ce Soir, Velvet Tonka. Atelier des Ors
Pink Me Up.

## For the owner (unclear, nothing changed)

- Ormonde Jayne Ormonde Man, Ormonde Woman, Ta'if, Ambre Royal: product pages say Eau de Parfum, the same
  pages say "now poured at Parfum strength". Which label do you want?
- Carolina Herrera Very Good Girl Glam: product page "Eau de Parfum", campaign text "concentrated parfum".
- Armani Acqua di Gio Profondo: official titles say Eau de Parfum, some copy says Parfum; a Profondo
  Parfum exists in the trade press but no official 50 ml page was found.
- Issey Miyake Nuit d'Issey (EDP or Parfum 75 ml): no official page found.
- YSL Libre L'Eau Nue: brand calls it "Parfum de Peau" (alcohol free), a category the catalogue has no
  value for.
- Tom Ford F***ing Fabulous: only an Eau de Parfum found.
- Tiziana Terenzi Delox, Draco, XIX March, Lillipur, Smeralda: brand text calls Draco an extrait;
  no per bottle page found.
- Cartier Pasha de Cartier Noir Absolu, Zimaya Oud Is Great and Sharaf Divine (not on the brand shop),
  Clinique Happy "Perfume Spray" listings whose name keeps a trademark sign (Beauty Flash, M&S).

## Not yet reviewed, for a later batch

About 100 further UK families (Ahmed Al Maghribi, Khadlaj, Matiere Premiere, Fugazzi, Ex Nihilo, Afnan,
Mancera, Houbigant, Israel Philip, Akro, French Avenue, Bharara, Riiffs, Thameen, Isabey, Trudon,
Molton Brown, Nobile 1942 and others), 261 US and 65 India families. At about 1,800 tokens a family
(one search per family, one brand site read per brand) that is roughly 200,000 tokens for the UK rest
and 600,000 for US and India. The US list also needs one owner decision first: US shops label 1,156 US
families "Eau de Cologne", which in American usage often means any men's fragrance, not a strength.
