/**
 * Fragrances the brand itself makes in SEVERAL strengths, checked against the
 * brand's own site on 20 Oct 2026 (docs/STRENGTH-REVIEW-2026-10-20.md).
 *
 * The owner's question was: which fragrances shown in more than one strength
 * are really one product that a shop mislabelled? The ones where the brand
 * makes one strength went to HOUSE_STRENGTH_EVIDENCE (houseStrengthEvidence.ts),
 * which relabels every shop's listing of that name and size. This list is the
 * other half: families the brand really sells as two or more products, which
 * must never be merged. tests/strengthReviewed.test.ts refuses an entry here
 * that is also settled to one strength there.
 *
 * Append only. An entry is never changed or removed; a family in this list is
 * not reopened without the owner. Each entry names the brand's own page and what
 * it shows.
 */
export interface SeveralStrengths {
  brand: string;
  /** The name as the catalogue shows it. */
  name: string;
  /** The strengths the brand sells under this name, in the display form concentration() returns. */
  strengths: readonly string[];
  /** The brand's own page. */
  source: string;
  /** What the page (or the brand's range) shows. */
  evidence: string;
  readAt: string;
}

const DAY = '2026-10-20';
const several = (
  brand: string,
  name: string,
  strengths: readonly string[],
  source: string,
  evidence: string,
): SeveralStrengths => ({ brand, name, strengths, source, evidence, readAt: DAY });

const EDP = 'Eau de Parfum';
const P = 'Parfum';
const X = 'Extrait de Parfum';

export const STRENGTHS_BRAND_MAKES_SEVERAL: readonly SeveralStrengths[] = [
  several('Tom Ford', 'Ombre Leather', [EDP, P], 'https://www.tomfordbeauty.co.uk/product/ombre-leather-parfum', 'separate pages "Ombre Leather Eau de Parfum" (50 ml, 112 pounds) and "Ombre Leather Parfum" (50 ml, 135 pounds)'),
  several('Tom Ford', 'Costa Azzurra', [EDP, P], 'https://www.tomfordbeauty.co.uk/product/costa-azzurra-parfum', 'separate pages "Costa Azzurra Eau de Parfum" and "Costa Azzurra Parfum" (100 ml, 189 pounds)'),
  several('Tom Ford', 'Soleil Blanc', [EDP, P], 'https://www.tomfordbeauty.com/products/soleil-blanc-eau-de-parfum', 'separate "Soleil Blanc Eau de Parfum" and "Soleil Blanc Parfum" (1.7 fl oz) pages'),
  several('Tom Ford', 'Private Blend Oud Wood', [EDP, P], 'https://www.tomfordbeauty.com/products/oud-wood-parfum', 'page "Oud Wood Parfum" beside the Oud Wood Eau de Parfum'),
  several('Tom Ford', 'Private Blend Neroli Portofino', [EDP, P], 'https://www.tomfordbeauty.com/products/neroli-portofino-parfum', 'page "Neroli Portofino Parfum" beside "Neroli Portofino Eau de Parfum" (tomfordbeauty.co.uk, 50 ml)'),
  several('Yves Saint Laurent', 'Libre', [EDP, P], 'https://www.yslbeauty.co.uk/fragrances/fragrances-for-her/libre/libre-le-parfum/WW-51020YSL.html', 'separate pages "Libre Eau de Parfum" and "Libre Le Parfum"'),
  several('Versace', 'Eros', [EDP, P], 'https://www.versace.com/us/en/men/accessories/fragrances-body-care/eros-collection/', 'collection lists Eros EDT, Eros EDP 100 ml and Eros Parfum 100 ml as three products'),
  several('Guerlain', 'La Petite Robe Noire', [EDP, P], 'https://www.guerlain.com/us/en-us/p/la-petite-robe-noire-parfum-P062229.html', 'page "La Petite Robe Noire Parfum" (30, 50, 100 ml) beside the Eau de Parfum'),
  several('Guerlain', "L'Homme Ideal", [EDP, P], 'https://www.guerlain.com/us/en-us/fragrance/man/', 'range lists L\'Homme Ideal Parfum beside the Eau de Parfum'),
  several('Guerlain', 'Habit Rouge', [EDP, P], 'https://www.guerlain.com/us/en-us/fragrance/man/collections/habit-rouge/', 'range lists Habit Rouge Eau de Parfum and Habit Rouge Parfum'),
  several('Calvin Klein', 'Eternity For Men', [EDP, P], 'https://www.calvinklein.us/en/men/fragrance/fragrance/eternity-parfum-for-men/3616303549756.html', 'separate pages "Eternity For Men Eau De Parfum" and "Eternity Parfum For Men"'),
  several('Burberry', 'Hero', [EDP, P], 'https://us.burberry.com/burberry-hero-eau-de-parfum-50ml-p40827891', 'Hero Eau de Parfum and Hero Parfum are separate products, both 50 ml'),
  several('Hugo Boss', 'BOSS Bottled', [EDP, P], 'https://www.hugoboss.com/boss-bottled-parfum-200ml/hbeu58114178_999.html', 'separate 200 ml pages "BOSS Bottled parfum" and "BOSS Bottled eau de parfum"'),
  several('Dior', 'Sauvage', [EDP, P], 'https://www.dior.com/en_int/beauty/fragrance/mens-fragrance/sauvage', 'range lists Sauvage Eau de Toilette, Eau de Parfum, Parfum and Elixir'),
  several('Maison Francis Kurkdjian', 'Oud Satin Mood', [EDP, X], 'https://www.franciskurkdjian.com/int-en/p/oud-satin-mood-extrait-de-parfum-RA142221.html', 'separate pages "OUD satin mood Extrait de parfum 70ml" and "OUD satin mood Eau de parfum"'),
  several('Maison Francis Kurkdjian', 'OUD SILK MOOD', [EDP, X], 'https://www.franciskurkdjian.com/int-en/p/oud-silk-mood-extrait-de-parfum-RA141721.html', 'page "OUD silk mood Extrait de parfum 70ml" beside the Eau de parfum'),
  several('Maison Francis Kurkdjian', 'OUD', [EDP, X], 'https://www.franciskurkdjian.com/int-en/p/oud--oud-satin-mood--oud-silk-mood-extraits-de-parfum-set-RA1CMOUD1.html', 'the OUD Extrait de parfum is sold beside the OUD Eau de parfum'),
  several('Dolce & Gabbana', 'Devotion For Men', [EDP, P], 'https://www.dolcegabbana.com/en-us/beauty/perfumes-for-him/devotion-for-men/devotion-male-parfum-100ml---158054754403138.html', 'separate pages "Devotion For Men Eau de Parfum" and "Devotion Male Parfum 100ML" (2025)'),
  several('Dolce & Gabbana', 'Devotion Pour Homme', [EDP, P], 'https://www.dolcegabbana.com/en-us/beauty/perfumes-for-him/devotion-for-men/', 'the same Devotion For Men range, sold under the shops\' "Pour Homme" name: Eau de Parfum and Parfum'),
  several('BDK Parfums', 'Rouge Smoking', [EDP, X], 'https://bdkparfums.com/products/rouge-smoking-extrait', 'house pages "Rouge Smoking - Eau de parfum" and "Rouge Smoking - Extrait de Parfum" (data/houses/bdk-parfums.json)'),
  several('BDK Parfums', 'Gris Charnel', [EDP, X], 'https://bdkparfums.com/products/gris-charnel-extrait', 'house pages "Gris Charnel - Eau de parfum" and "Gris Charnel - Extrait de Parfum" (data/houses/bdk-parfums.json)'),
  several('BDK Parfums', 'Pas ce Soir', [EDP, X], 'https://bdkparfums.com/products/pas-ce-soir-extrait', 'house pages "Pas ce Soir - Eau de parfum" and "Pas ce Soir - Extrait de Parfum" (data/houses/bdk-parfums.json)'),
  several('BDK Parfums', 'Velvet Tonka', [EDP, X], 'https://bdkparfums.com/products/velvet-tonka-extrait', 'house pages "Velvet Tonka - Eau de parfum" and "Velvet Tonka - Extrait de Parfum" (data/houses/bdk-parfums.json)'),
  several('Atelier des Ors', 'Pink Me Up', [EDP, X], 'https://atelierdesors.com/products/pink-me-up-extrait', 'brand shop lists "Pink Me Up" (Eau de Parfum) and "Pink Me Up Extrait" (Extrait de Parfum) as two products'),
  // Second batch, 20 Oct 2026 (docs/STRENGTH-REVIEW-2026-10-20.md, "Second batch"). Matiere Premiere: the brand shop
  // lists each as two products, product type "Eau de Parfum" and "Extrait de Parfum", with two barcodes per size.
  ...['Crystal Saffron', 'Radical Rose', 'Encens Suave', 'Falcon Leather', 'Santal Austral', 'Vanilla Powder'].map((name) =>
    several('Matière Première', name, [EDP, X], `https://matiere-premiere.com/products/${name.toLowerCase().replace(/ /g, '-')}-extrait${name === 'Vanilla Powder' ? '' : '-de-parfum'}`, 'the brand shop lists the name twice, as product type "Eau de Parfum" and as "Extrait de Parfum" (products.json read as PriceSniffsBot, 20 Oct 2026)'),
  ),
  several('Houbigant', "Quelques Fleurs l'Original", [EDP, X], 'https://houbigant-parfum.com/products/quelques-fleurs-l-original-extrait', 'the brand shop lists "Quelques Fleurs L\'Original" as Eau de Parfum (30, 50, 100 ml), as Extrait de Parfum (100 ml) and as Eau de Parfum Extreme (Collection Privee)'),
  several('Houbigant', 'Fougère Royale', [EDP, X], 'https://houbigant-parfum.com/products/fougere-royale-extrait', 'the brand shop lists "Fougere Royale Extrait de Parfum" (100 ml) and "Fougere Royale Eau de Parfum Extreme" (100 ml), the shops\' "Eau de Parfum"'),
  several('Escentric Molecules', 'Escentric 02', [X, 'Not stated'], 'https://www.escentric.com/products/escentric-02-extrait-de-parfum', 'the brand shop sells "Escentric 02 Extrait de Parfum 100ml" (30 percent) and, as another product, "Escentric 02 100ml" with no strength on the page'),
  several('Essential Parfums', 'Nice Bergamote', [EDP, X], 'https://www.essentialparfums.com/products/echantillon-extrait-nice-bergamote-2ml', 'the brand shop sells the 2 ml sample twice: "Echantillon Extrait Nice Bergamote 2ML" and "Echantillon Nice Bergamote 2ML" (Extrait 30 ml, Eau de Parfum 100 ml)'),
  several('Essential Parfums', 'The Musc', [EDP, X], 'https://www.essentialparfums.com/products/echantillon-extrait-the-musc-2ml', 'the brand shop sells the 2 ml sample twice: "Echantillon Extrait The Musc 2ML" and "Echantillon The Musc 2ML" (Extrait 30 ml, Eau de Parfum 100 ml)'),
  several('Essential Parfums', 'Bois Imperial', [EDP, X], 'https://www.essentialparfums.com/products/echantillon-extrait-bois-imperial-2ml', 'the brand shop sells the 2 ml sample twice: "Echantillon Extrait Bois Imperial 2ML" and "Echantillon Bois Imperial 2ML" (Extrait 30 ml, Eau de Parfum 100 ml)'),
  several('Dior', 'Miss Dior Roller-Pearl', [EDP, P], 'https://www.dior.com/en_int/beauty/products/miss-dior-parfum-roller-pearl-Y0997192.html', 'separate 20 ml pages "Miss Dior Eau de Parfum Roller-Pearl" (Y0997000) and "Miss Dior Parfum Roller-Pearl" (Y0997192)'),
  several('Dior', 'Sauvage - Limited Edition Case', [EDP, P], 'https://www.dior.com/en_int/beauty/products/sauvage-parfum---limited-edition-Y4001166.html', 'separate 100 ml limited edition pages "Sauvage Eau de Parfum - Limited Edition" (Y4001161) and "Sauvage Parfum - Limited Edition" (Y4001166)'),
  several('Dior', 'Sauvage Holiday Limited Edition Case', [EDP, P], 'https://www.dior.com/en_int/beauty/products/sauvage-parfum---limited-edition-Y4001166.html', 'separate 100 ml holiday case pages for the Eau de Parfum (Y4001161) and the Parfum (Y4001166)'),
  several('Yves Saint Laurent', "L'Homme", [EDP, P], 'https://www.yslbeauty.co.uk/fragrances/fragrances-for-him/l-homme/l-homme-le-parfum/WW-50565YSL.html', 'separate 100 ml pages "L\'Homme Eau de Parfum" (WW-50955YSL, 102 pounds) and "L\'Homme Le Parfum" (WW-50565YSL, 120 pounds)'),
  several('Balmain', 'Destin de Balmain', [EDP, P], 'https://www.balmainbeauty.com/destin-de-balmain', 'the brand site sells "Destin de Balmain Eau de Parfum" (10, 30, 50, 100 ml) and describes a separate "Destin de Balmain Parfum" (found through a search of balmainbeauty.com)'),
  // US and India batch, 20 Oct 2026 (docs/STRENGTH-REVIEW-2026-10-20.md, "US and India").
  several('Bvlgari', 'Man In Black', [EDP, P], 'https://www.bulgari.com/en-us/fragrances/bvlgari-man', 'the Bvlgari Man collection lists "Bvlgari Man In Black Eau De Parfum" (100 ml, 185 dollars) and a separate 100 ml Parfum (215 dollars)'),
  several('Tom Ford', 'Noir Extreme', [EDP, P], 'https://www.tomfordbeauty.com/products/noir-extreme-eau-de-parfum', 'separate pages "Noir Extreme Eau de Parfum" (1.7 fl oz, 165 dollars) and a Noir Extreme Parfum (205 dollars)'),
  several('Tom Ford', 'Grey Vetiver', [EDP, P], 'https://www.tomfordbeauty.com/products/grey-vetiver-parfum', 'separate pages "Grey Vetiver Eau de Parfum" and "Grey Vetiver Parfum"'),
  several('Tom Ford', 'Oud Wood', [EDP, P], 'https://www.tomfordbeauty.com/products/oud-wood-eau-de-parfum', 'separate pages "Oud Wood Eau de Parfum" and "Oud Wood Parfum" (the UK list holds it as Private Blend Oud Wood)'),
  several('Lattafa', 'Fakhar', [EDP, X], 'https://lattafa.com/product/fakhar-lattafa-extrait/', 'lattafa.com sells "Fakhar Lattafa Extrait" beside the Eau de Parfum Fakhar (data/houses/lattafa.json, read by the house crawl)'),
];
