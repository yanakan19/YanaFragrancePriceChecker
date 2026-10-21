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

## Second batch (UK, 20 Oct 2026)

100 more UK families from the 552 list, the ones with two or more shops and the well known houses first. The
method is the first batch's: barcodes first, then the brand's own site (its shop's `products.json` read as
PriceSniffsBot after robots.txt, 2 s apart, at most 4 requests a host, or a search of the brand's own domain),
a merge only with a quote and a day (`HOUSE_STRENGTH_EVIDENCE`), a family the brand makes in several
strengths kept apart (`strengthReviewed.ts`). Result: 31 merged, 17 confirmed several on a brand page, 18 kept
apart on retailer evidence only, 34 unresolved. (Guerlain L'Homme Ideal was already confirmed.)

### Merged (brand makes one strength)

Afnan 9pm Elixir and 9pm Night Out (Extrait de Parfum: the shop's variant reads "Extrait De Parfum / 100 ML /
Unisex"). Ahmed Al Maghribi Rose Noir, Oud & Roses, Oud Lavender, Laathani, Black Fume, Opaline Wave (Eau de
Parfum: the brand shop titles end "EDP", no Extrait listed). Laurent Mazzone Vol d'Hirondelle and Tauer L'Air du
Jardin Cache ("Eau de parfum, concentrated at 25%"), J.U.S Bloomastral, Israel Philip Avignon and L'Orient (Eau
de Parfum). Amouage Remain, Lustre and Reasons Essence (Parfum: the house's "Essence de Parfum", 30 percent),
Amouage Love Delight (Eau de Parfum). Xerjoff Fars, XXY, Tony Iommi Monkey Special, NeoRio Orange and Pink
(Parfum, product address and one product). French Avenue Noble Cedar and X Aromatix Carnal Desire (Extrait: the
brand shop writes ExDP). Armani Stronger With You Absolutely, Bharara Viking Rio and Viking Kashmir (Parfum
pages), Orebella Blooming Fire, Nightcap, Salted Muse, Window2Soul (Parfum; the catalogue files them under the
brand "Unbranded", the entries are keyed on that).

### Confirmed as several strengths on a brand page (stay split)

Matiere Premiere Crystal Saffron, Radical Rose, Encens Suave, Falcon Leather, Santal Austral, Vanilla Powder (two
barcodes per size; the shop lists Eau de Parfum and Extrait as two products). Houbigant Quelques Fleurs
L'Original (Eau de Parfum, Extrait, Eau de Parfum Extreme) and Fougere Royale (Extrait, Eau de Parfum Extreme).
Escentric Molecules Escentric 02 (Extrait beside the plain 100 ml). Essential Parfums Nice Bergamote, The Musc,
Bois Imperial (2 ml sample of the Extrait and of the Eau de Parfum). Dior Miss Dior Roller-Pearl, Sauvage Limited
Edition Case, Sauvage Holiday Limited Edition Case (separate Eau de Parfum and Parfum pages). YSL L'Homme (Le
Parfum 120 pounds, Eau de Parfum 102 pounds). Balmain Destin de Balmain.

### Kept apart on retailer evidence only (brand site not reached)

Two retailers list the Eau de Parfum and the Extrait as separate product pages, so nothing was merged:
Fugazzi Angel Dust, Orange Crush, Vanilla Haze (Bloom Perfumery, Nicchia Luxury; Sephora sells the Extrait at
30 percent). Isabey Gardenia, Lys Noir, La Route d'Emeraude (Les Senteurs). Nobile 1942 Cafe Chantant, La Danza
delle Libellule, Pontevecchio, Pontevecchio Woman (Nicchia). Pana Dora Onyx Black, Majestic Amber, Opuluxe (a
barcode on the Eau de Parfum plus a Nicchia Extrait page). Room 1015 Cherry Punk, Akro Glow and East, Laboratorio
Olfattivo Vanagloria (Bloom, Nicchia). Ex Nihilo The Hedonist (two barcodes).

### For the owner (unclear, nothing changed)

- Joop! Homme: joop.com sells 75 and 125 ml as "Homme Le Parfum", shops write Eau de Parfum; the page does not say
  which strength "Le Parfum" is.
- Kajal Kolada: the brand page is titled "XDP" and its address says extrait, but the tag says EDP.
- Swiss Arabian Rose 01 (50 ml): text says "Extrait de Parfum", address says EDP, three shops say EDP. Musk 01:
  the page names no strength.
- Trudon Mortel Noir: filed under Eaux de Parfum, described as 27 percent. Azzaro Chrome (the brand sells Chrome
  as Eau de Toilette and Chrome Extreme as Eau de Parfum). YSL Y Elixir. Armaf Club De Nuit Intense Man Limited
  Edition (the shop has V1 and a "Pure Parfum V2" at 105 ml). Chantecaille Tiare and Fragrance du Bois Milano,
  Secret Tryst (the brand names no strength). Molton Brown Wild Mint & Lavandin (the brand makes both an Eau de
  Toilette and an Eau de Parfum, so the unstated listings cannot be assigned). Escentric Molecule 01 + Cistus
  (the brand page names no strength; Nicchia calls it Eau de Toilette). Dior Sauvage for the Wild Limited
  Edition and Miss Dior Holiday Limited Edition Case (no page found). Xerjoff NeoRio Yellow and Green (page does
  not say). Ex Nihilo Blue Talisman and Outcast Blue (robots.txt of ex-nihilo-paris.com disallows our bot, so not
  read).
- Not reached, brand site unreachable or silent: Khadlaj Panache Angel Dust, Cloud Candy, Biscotti Date Toffee;
  Mancera Red Tobacco Intense, Intense Cedrat Boise (pages exist, strength not stated in the search text);
  Riiffs Zenith, Freeze; Thameen Diadem, The Hope (thameenlondon.com disallows our bot); Arabian Oud Kalemat,
  Resala; Nikos Sculpture; Bujairami Miss Vanilla, Maison Asrar X Cal Cologne III Thriller, Rayhaan X Valhalla
  (house crawl holds no strength).

Cost: about 330,000 tokens for the 100 families (roughly 3,300 a family, because most brand sites answer only
through a search and the rest needed their shop file read). 70 UK families still show two strengths at one size: the ones kept apart and the unresolved.

## US and India (20 Oct 2026)

Owner decision, 20 Oct 2026: Eau de Cologne is a strength of its own. It stays separate, it is never "unknown" and
never folded into Eau de Toilette or Eau de Parfum. A shop's "Eau de Cologne" is corrected only where the
brand's own site shows the product is not made as one (page, quote and day, the same rule as any merge).

### How the region catalogues decide strength

`src/catalogue/regionCatalogue.ts` reads each listing's strength with the UK reader (`concentrationOfListing`)
and joins bottles of the same brand, name, size and strength. Until today none of the UK's reviewed answers
reached it: `HOUSE_STRENGTH_EVIDENCE` (brand pages) and `CONCENTRATION_RESOLUTIONS` (barcodes) were applied only
in `build-demo-catalogue.ts`. `applyReviewedStrengths` now applies both to the US and India builds. Brand
evidence settles a bottle whatever a shop called it, Eau de Cologne included; a barcode resolution never
replaces "Eau de Cologne". A shop's "For Men" or "For Women" after a name is read as a shelf label, except
where the marked name is another bottle (Clinique Happy For Men is a cologne; Happy is the women's Eau de
Parfum). Rebuilt with `build-region-catalogue.ts --region=us|in` (what the region crawls run; no crawl was run):
27 US and 40 India bottles took the reviewed strength, 52 US and 13 India products joined another.

### Size of the check

- Adjacent strengths at one size (Eau de Parfum, Parfum, Extrait, Not stated): 261 US and 65 India families; 12 US
  families carry two barcodes, one per strength (two real products).
- Eau de Cologne: about 4,800 US listings read as cologne, 3,812 of them from two shops (Perfumania, Fragrance
  Outlet) that write "Cologne" on any men's bottle ("Boss Bottled Night Cologne", "Millesime Imperial Cologne").
  1,134 US families (and 4 India) show an Eau de Cologne beside another strength at one size; 875 have two or more
  shops on the cologne side, 279 have two or more shops on both sides.
- Each cologne label needs the brand's page. At about 3,300 tokens a family (a search of the brand's own domain, one page read), the 875
  families with two or more shops are about 2.9 million tokens and the other 260 about 0.9 million; the 249 US
  and 65 India adjacent families about 1.0 million. A brand whose own shop is a Shopify store answers all its
  families at once (one polite read of `products.json`), which is why a brand by brand order is cheaper.

### Done in this batch (about 40 families)

Corrected from the brand's own page (entries in `houseStrengthEvidence.ts`, `REVIEWED_REGION_BATCH`): Al Haramain
L'Aventure Knight, Opulent Saffron, Amber Oud Rouge (60 ml) and Rasasi Shuhrah Pour Homme, La Yuqawam Tobacco
Blaze, Hawas Black, La Yuqawam (Eau de Parfum, from the brands' UK shops, which the crawl already holds); Hamidi
Addicted Silver (Eau de Parfum); Parfums de Marly Pegasus, Percival, Layton (Eau de Parfum, the Parfum is the
separate Exclusif); Tom Ford Tuscan Leather; Bvlgari Man Glacial, Terrae and Rain Essence; Montale Arabians and
Arabians Tonka (Eau de Parfum); Jimmy Choo Man, Man Intense and Dior Homme Sport (Eau de Toilette). Those shops'
"Cologne" labels on these bottles now read as the brand's strength and join the other shops' listings.

Confirmed several strengths on a brand page, kept apart (`strengthReviewed.ts`): Bvlgari Man In Black, Tom Ford
Noir Extreme, Grey Vetiver and Oud Wood (Eau de Parfum and Parfum), Lattafa Fakhar (Eau de Parfum and Extrait).
Eau de Cologne labels on those four stay as they are; the brand's several strengths do not say which one a shop
meant.

Settled by house crawl or the UK lists with no new reading: Orto Parisi, Zimaya, Ahmed Al
Maghribi, Xerjoff, Mykonos, Laurent Mazzone and the rest of the second batch now apply in both regions.

### Unresolved (nothing changed)

- Creed Aventus, Original Vetiver, Green Irish Tweed, Millesime Imperial, Virgin Island Water, Silver Mountain
  Water: shops split between Eau de Cologne and Eau de Parfum, and creedboutique.com does not write the strength
  on the product (type "Men's Fragrance"; the text calls Original Vetiver "cologne-like").
- Escentric Molecules Cologne One: the brand writes Eau de Cologne itself, so the cologne label is right.
- Everything else with Eau de Cologne beside Eau de Toilette or Eau de Parfum (Calvin Klein, Hugo Boss, Dior
  Homme, Givenchy, Dunhill, Ralph Lauren, Guess, Coach and the rest) and the adjacent families of India
  (Roja, Dior vials, Ralph Lauren, Gucci and others): not yet read, see the estimate above.

## Cologne at Perfumania and Fragrance Outlet (21 Oct 2026)

Owner decision: Eau de Cologne stays a strength of its own, except at the two US shops that write "Cologne" on every
men's bottle. Their registry entries carry `cologneWordIsNotAStrength: true`
(`RegionRetailer`, `src/config/retailers.us.ts`); the region build (`withoutColognePlaceholder`,
`regionCatalogue.ts`) takes the word out of those shops' titles, so the listing reads strength not stated unless the
title states another strength (EDT, EDP, Parfum), which wins. The name loses the word too, so the bottle meets the
other shops' listing of the same name. A future shop is flagged the same way. Rule test:
`tests/regionColognePlaceholder.test.ts`.
