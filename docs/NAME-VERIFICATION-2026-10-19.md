# Name verification, 19 Oct 2026 (pilot: families on 3 or more shops)

Scope: products listed by 3 or more shops whose name has the house in it, a noise word or a
trailing connector (97 families). Method: shop titles and barcodes first, stored links, then at most
2 web searches per family. Decisions are in `src/catalogue/nameReviewed.ts` (append only).

- Verified (renamed, words deleted only): 20
- Kept (the house or line is part of the real name, or the name is house plus audience): 70
- Unresolved (owner decision, nothing changed): 14

## Unresolved for the owner

| House | Current name | Proposed name | Why unresolved |
|---|---|---|---|
| Abercrombie & Fitch | Authentic Man / Homme | Authentic Man | "Authentic Man / Homme": the other shops write "Authentic", "Authentic For Men" or "Authentic Man"; no source names the line |
| Lionel Richie | Lionel Richie Hello Men | Hello Men | shops write "Hello" with a separate "for Men"; the audience wording differs, so the deletion is not certain |
| Mugler | Thierry Mugler Cologne Blow It Up | Cologne Blow It Up | only two shops agree and the house line "Thierry Mugler Cologne" may be the name |
| Chloé | Chloe Signature by Parfums Chloe Le Parfum | Signature Le Parfum | shops disagree: "Chloe Signature", "Chloe Le Parfum" and "Chloe by Chloe" may be three bottles |
| Goutal | Annick Goutal Tenue de Soirée | Tenue de Soirée | only one shop agrees; the house is listed as Goutal while shops write Annick Goutal |
| Mugler | Thierry Mugler Cologne Run Free | Cologne Run Free | only one shop agrees and the house line "Thierry Mugler Cologne" may be the name |
| Ahmed Al Maghribi | Ahmed Al Maghribi Blue | Blue | only two shops agree and one writes "Blue By Ahmed" (a credit) |
| Chloé | Chloe Signature by Parfums Chloe Purse | Signature Purse | shops disagree: "Chloe Signature", "Chloe Le Parfum" and "Chloe by Chloe" may be three bottles |
| Jaguar | Jaguar For Men Gold in Black | For Men Gold in Black | deleting the house leaves an audience label in front; the line may be "Jaguar For Men" |
| Lattafa | Lujain Perfume Niche Emarati | Lujain Niche Emarati | one shop only; "Perfume" is probably a shop word but no second source |
| Rochas | Girl Life Rochas Good Feel Good | Girl Life Good Feel Good | one shop shows the short name; the others add Rochas inside it |
| Ungaro | Metallic Acqua Ungaro Man | Metallic Acqua Man | no shop agrees; shops write Men, Man or nothing |
| Scent Organix | Scent-Organix I Am Bright | I Am Bright | only one independent domain gives the name without the house; the other listings are affiliate redirects |
| Scent Organix | Scent-Organix I Am Radiant | I Am Radiant | only one independent domain gives the name without the house; the other listings are affiliate redirects |

## Kept, with the reason

The house, or a line such as Flower by Kenzo, Terre d'Hermes, Miss Dior, My Burberry, Pasha de Cartier
or L'Eau Kenzo, is part of the fragrance's name, or the name is the house plus an audience label
(Dolce & Gabbana Pour Homme, Miu Miu For Her). Deleting the house would leave an audience label or a
broken name. Spelling faults that only an addition could fix (Tutti Twilly d Hermes, Twilly Dhermes) are
left for the owner, as a rename may only delete words.

| House | Name kept |
|---|---|
| Narciso Rodriguez | Narciso Rodriguez For Her |
| Dolce & Gabbana | Dolce & Gabbana Pour Femme |
| Dolce & Gabbana | Dolce & Gabbana Pour Homme |
| Michael Kors | Michael Kors Pour Femme |
| Michael Kors | Michael Kors Pour Homme |
| Dolce & Gabbana | Q by Dolce&Gabbana Intense |
| Hermès | Terre d'Hermès Eau Intense Vetiver |
| Karl Lagerfeld | Karl Lagerfeld For Her |
| Karl Lagerfeld | Karl Lagerfeld Pour Homme |
| Hermès | Terre d'Hermès Eau Givrée |
| Hermès | Twilly d'Hermès Eau Poivrée |
| Burberry | Burberry Brit For Her |
| Cerruti | Cerruti 1881 Pour Homme |
| Hermès | Twilly d'Hermès Eau Ginger |
| Juliette Has a Gun | Not a Perfume Superdose |
| Kenzo | FLOWER BY KENZO La Récolte Parisienne |
| Kenzo | FLOWER BY KENZO Poppy Bouquet |
| Kenzo | Flower by Kenzo Poppy Bouquet |
| Miu Miu | Miu Miu For Her |
| Cartier | Pasha de Cartier Edition Noire Sport |
| Ed Hardy | Ed Hardy For Men |
| Ed Hardy | Ed Hardy For Women |
| Guerlain | Mon Guerlain Sparkling Bouquet |
| Joop! | Joop Homme Neon Edition |
| Oscar de la Renta | Oscar de la Renta Pour Lui |
| Replay | Jeans Original For Him |
| Armaf | Miss Armaf Voce Viva |
| Bvlgari | BVLGARI MAN In Black |
| Cartier | Pasha de Cartier Edition Noire |
| Cerruti 1881 | Cerruti 1881 Pour Femme |
| Dior | Miss Dior Blooming Bouquet |
| Gloria Vanderbilt | Gloria Vanderbilt For Women |
| Gucci | Gucci Guilty Pour Homme Elixir |
| Guerlain | L'Instant De Guerlain Pour Homme |
| Guerlain | L'Instant de Guerlain Pour Homme |
| Kenzo | Flower By Kenzo Ikebana |
| Kenzo | Flower by Kenzo L'Absolue |
| Kenzo | Flower by Kenzo Légère |
| Lacoste | Original Pour Femme Intense |
| Pepe Jeans | Pepe Jeans For Him |
| Rochas | Mademoiselle Rochas in Black |
| Abercrombie & Fitch | Authentic Moment For Men |
| Burberry | My Burberry Black For Her |
| Burberry | My Burberry For Her |
| Dior | Miss Dior Rose N'Roses |
| Givenchy | LES PARFUMS MYTHIQUES Givenchy III |
| Gucci | Gucci Flora Intense Gorgeous Orchid |
| Gucci | Gucci Guilty Pour Homme Absolu |
| Gucci | Gucci Guilty Pour Homme Absolute |
| Hermès | Terre d'Hermes Eau Givree |
| Hermès | Tutti Twilly d Hermes |
| Iceberg | Eau de Iceberg Amber |
| Kenzo | L'Eau Kenzo Boisee Homme |
| Kenzo | L'Eau Kenzo Pour Femme |
| Kenzo | L'Eau Kenzo Pour Homme |
| Kenzo | L'Eau Kenzo Pour Homme Hyper Wave |
| Rochas | L'Homme Rochas Aromatic Touch |
| Tiffany & Co | Tiffany & Co Intense |
| Burberry | Burberry by Burberry For Women |
| Kenneth Cole | Kenneth Cole For Her |
| Hermès | Terre D'Hermes For Men |
| Dior | Miss Dior Absolutely Blooming |
| Prada | La Femme Prada Leau |
| Prada | La Femme Prada Intense |
| Hermès | Twilly Dhermes Eau Poivree |
| Panama Jack | Panama Jack For Her |
| Tommy Bahama | Tommy Bahama For Her |
| Burberry | My Burberry Blush For Women |
| Burberry | Mr Burberry For Men |
| Creed | Original Vetiver For Unisex |

## Renamed

| House | Before | After |
|---|---|---|
| Jimmy Choo | Jimmy Choo Rose Passion | Rose Passion |
| Sabrina Carpenter | Sweet Tooth by Sabrina Carpenter Cherry Baby | Sweet Tooth Cherry Baby |
| Calvin Klein | My Euphoria Calvin Klein | My Euphoria |
| Lacoste | Lacoste L.12.12 Rose Sparkling | L.12.12 Rose Sparkling |
| Jaguar | Jaguar Classic Electric Sky | Classic Electric Sky |
| Sabrina Carpenter | Sabrina Carpenter Lemon Pie | Lemon Pie |
| Elie Saab | Girl of Now Elie Saab Shine Edition | Girl of Now Shine |
| Emanuel Ungaro | Heavenly Petals Emanuel Ungaro Femme | Heavenly Petals Femme |
| Sabrina Carpenter | Sabrina Carpenter Caramel Dream | Caramel Dream |
| Zadig & Voltaire | This is Him Zadig & Voltaire Vibes of Freedom | This is Him Vibes of Freedom |
| Azzaro | Wanted Girl Tonic Azzaro | Wanted Girl Tonic |
| Bond No 9 | Bond No. 9 New York Gardenia | New York Gardenia |
| Dolce & Gabbana | The One Dolce & Gabbana D&G | The One |
| Escada | Show Me Love Escada | Show Me Love |
| Giorgio Beverly Hills | Giorgio Beverly Hills Red | Red |
| Lacoste | Lacoste L.12.12 Rose Intense | L.12.12 Rose Intense |
| Laura Biagiotti | Roma Rosa Femme Laura Biagiotti | Roma Rosa Femme |
| Lolita Lempicka | So Sweet Lolita Lempicka | So Sweet |
| Moschino | Fresh Couture Pink Moschino | Fresh Couture Pink |
| Swiss Arabian | Swiss Arabian Shaghaf Amber Infusion | Shaghaf Amber Infusion |

## Band 2: families listed by 2 or more shops (second pass, 19 Oct 2026)

Order followed: rules first, data second, search last. The queue was recomputed on the build made after the new rules (UK from the catalogue, US and India from the region catalogues): 734 flagged families (house name inside the name, a noise word, a trailing connector), 286 of them with a shorter candidate that only deletes words.

Rules added (productName.ts, nameConsensus.ts, the catalogue build):
- A product's name is now chosen by the shops: three shops or more, a strict majority gives the same name, the name must be one a shop produced, must still hold every word of the current one (apart from the house at either end and Perfume, Fragrance, Spray) and must not add an audience word or part of the house. Reviewed families are never reopened.
- "House Name House" in one shop's title: the repeated house at the end goes (Direct Cosmetics), unless the name would be one word, ends in a word that needs the house (Mon, de, d) or the house is Calvin Klein.
- A lone "Miss", "Mon", "My", "Ma", "Mes" before the house is not a name: "Miss Dior", "Mon Guerlain", "My Burberry" keep the house (they were shown as "Miss", "Mon", "My").
- "Pocket Perfume", "Not a Perfume", "I Don't Know What Pocket Perfume", "Memoirs of a Perfume Collector" keep Perfume (after pocket, my, your, the, this, that, a).
- "Mood Unisex Fragrance", "Brit Women's Perfume": the generic noun after the audience word goes.

Settled by data: 134 families kept (no shop other than Direct Cosmetics writes a shorter name), recorded in NAME_KEPT.
Verified by search (two domains each, 7 searches): Rayhaan Pacific Aura, Italia, Pharaoh; Al Rehab Bakhour, Soft (all lose "Perfume"); Afnan Rare Passion (loses the leading house). Recorded in NAME_VERIFIED.

### Decision: a name only Direct Cosmetics gives is not evidence (owner, 19 Oct 2026)

33 of the 39 families that were unresolved because of Direct Cosmetics are settled as kept and moved to NAME_KEPT (reason: "only Direct Cosmetics differs; owner decision 19 Oct: one shop's noisy title is not evidence"; entries carry `decision`, so they need no web source). Nothing displayed changes: the names stay as they were. The one move the lists allow is from unresolved to the list of the decision, so a family stays in one list only.

What was checked in the data first: in most of these families it is the long name (house inside) that comes from Direct Cosmetics, and the shorter one from one other shop (Debenhams for the five Head families, Le Jardin d'Amour and Mexx Summer Bliss) or from none. One shop against Direct Cosmetics is not evidence either way, so the name stays.

Six families stay unresolved, for the owner, because the reverse also holds: the long name is Direct Cosmetics only and three or more other shops write the shorter one. A rename would be the right answer if the shorter name is a real name:

| House | Name now | Shorter name the other shops write | Shops writing it |
|---|---|---|---|
| David Beckham | Instinct David Beckham | Instinct | 4 |
| Chantal Thomass | Chantal Thomass Pink | Pink | 3 (and "Pink" alone is a generic word) |
| Gres | Cabotine de Gres | Cabotine | 6 |
| Lacoste | Lacoste L.12.12 Rose Eau Fraiche | L.12.12 Rose Eau Fraiche | 4 |
| Roberto Cavalli | Florence Roberto Cavalli | Florence | 10 |
| Rabanne | Paco Rabanne | Paco | 7 (the house is Paco Rabanne, so "Paco" alone is not a name) |

Code: `consensusName` (nameConsensus.ts) now refuses a winning name that only `direct-cosmetics` gives (`NOISY_TITLE_SHOP`); the count already made that impossible (a winner needs a strict majority of three shops at least), the check keeps it so. The "House Name House" rule only trims the repeated house from the title of the shop that wrote it; it adds nothing and sets no name by itself, and a product listed by Direct Cosmetics and one other shop that disagree still takes the first listing's name (the other shop's name is not preferred, since one shop is not evidence either way). Tests: tests/nameConsensus.test.ts, tests/nameReviewed.test.ts.

### Renamed

| House | Before | After |
|---|---|---|
| Rayhaan | Pacific Aura Perfume | Pacific Aura |
| Rayhaan | Italia Perfume | Italia |
| Rayhaan | Pharaoh Perfume | Pharaoh |
| Al Rehab | Bakhour Perfume | Bakhour |
| Al Rehab | Soft Perfume | Soft |
| Afnan | Afnan Rare Passion | Rare Passion |

### Unresolved (76 families, nothing changes for them)

Most are Direct Cosmetics (which writes the house in its titles) against one other shop, or a house plus one generic word where the house is probably part of the name. Where the correct name needs words moved (Lattafa Pride "Nebras Perfume Lattafa Pride" should be "Pride Nebras"; Fragrance World "Hibiscus Magic Artisan Perfumery"; French Avenue "An Equestrian Series Della"), a deletion only rename cannot reach it.

| House | Name now | Proposed (words deleted) | Why unresolved |
|---|---|---|---|
| Burberry | Burberry London | London | the shops split between the long and the short name; no source settles it |
| Ted Baker | Ted Baker M | M | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Azzaro | Azzaro Pour Elle | Pour Elle | the shops split between the long and the short name; no source settles it |
| Louis Cardin | Louis Cardin Silver | Silver | the shops split between the long and the short name; no source settles it |
| Baldessarini | Baldessarini Black | Black | the shops split between the long and the short name; no source settles it |
| Franck Olivier | Miss Franck Olivier | Miss | the shops split between the long and the short name; no source settles it |
| Guess | Guess Seductive | Seductive | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Kenzo | Kenzo Jungle Homme | Jungle Homme | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Montana | Montana Blu | Blu | the shops split between the long and the short name; no source settles it |
| Guess | Guess Night | Night | the shops split between the long and the short name; no source settles it |
| Guess | Guess Seductive Homme | Seductive Homme | the shops split between the long and the short name; no source settles it |
| Jenny Glow | Jenny Glow Cologne | Cologne | the shops split between the long and the short name; no source settles it |
| Chloé | Chloe by Chloe Rollerball | Chloe Rollerball | the shops split between the long and the short name; no source settles it |
| Coach | Coach Dreams Sunset | Dreams Sunset | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Coach | Coach Platinum | Platinum | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| David Beckham | Instinct David Beckham | Instinct | only Direct Cosmetics gives this name and no other shop writes the same words; the house may be part of the name |
| Diesel | Diesel D | D | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Fcuk | FCUK 3 | 3 | the shops split between the long and the short name; no source settles it |
| Fcuk | FCUK Connect | Connect | the shops split between the long and the short name; no source settles it |
| Guess | Guess by Marciano | Marciano | the shops split between the long and the short name; no source settles it |
| Jenny Glow | Jenny Glow Blue | Blue | the shops split between the long and the short name; no source settles it |
| Jenny Glow | Jenny Glow Noir | Noir | the shops split between the long and the short name; no source settles it |
| Lalique | L'Amour Lalique | L'Amour | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Lancaster | Eau de Lancaster | Eau | the shops split between the long and the short name; no source settles it |
| Mustang | Mustang Blue | Blue | the shops split between the long and the short name; no source settles it |
| Police | Police Sport | Sport | the shops split between the long and the short name; no source settles it |
| Rochas | Byzance Rochas | Byzance | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Rochas | L'Homme Rochas | L'Homme | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Rochas | Mademoiselle Rochas | Mademoiselle | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Ahmed Al Maghribi | Marj Perfume | Marj | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Aigner | Aigner No 1 | No 1 | the shops split between the long and the short name; no source settles it |
| Antonio Banderas | Mediterraneo Antonio Banderas | Mediterraneo | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Bond No 9 | Bond No.9 Madison Square Park | Madison Square Park | the shops split between the long and the short name; no source settles it |
| BWFH by Drake | Better World Fragrance House Summer Mink | Better World House Summer Mink | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Chantal Thomass | Chantal Thomass Pink | Pink | only Direct Cosmetics gives this name and no other shop writes the same words; the house may be part of the name |
| Charlie | Charlie Blue | Blue | the shops split between the long and the short name; no source settles it |
| DKNY | DKNY Gold | Gold | the shops split between the long and the short name; no source settles it |
| Dolce & Gabbana | DOLCE&GABBANA Intenso | Intenso | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Elizabeth Arden | Green Tea Summer Fragrance | Green Tea Summer | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Fragrance World | Artisan Perfume Arabian Incense | Artisan Arabian Incense | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Fragrance World | Artisan Perfume Hibiscus Magic | Artisan Hibiscus Magic | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| French Avenue | Della Equestrian Series Perfume | Della Equestrian Series | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Gres | Cabotine de Gres | Cabotine | only Direct Cosmetics gives this name and no other shop writes the same words; the house may be part of the name |
| Guess | Guess Girl | Girl | the shops split between the long and the short name; no source settles it |
| Guess | Guess Marciano | Marciano | the shops split between the long and the short name; no source settles it |
| Gulf Orchid | Gulf Orchid Sweet Heaven | Sweet Heaven | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Hackett London | Hackett London Absolute | Absolute | the shops split between the long and the short name; no source settles it |
| Hugo Boss | Hugo Boss The Collection Daring Saffiano | The Collection Daring Saffiano | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Lacoste | Lacoste L.12.12 Rose Eau Fraiche | L.12.12 Rose Eau Fraiche | only Direct Cosmetics gives this name and no other shop writes the same words; the house may be part of the name |
| Lattafa | Affection Perfume Lattafa Pride | Affection Lattafa Pride | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Lattafa | Al Areeq Gold Perfume By Lattafa Pride | Al Areeq Gold By Lattafa Pride | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Lattafa | Nebras Perfume Lattafa Pride | Nebras Lattafa Pride | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Lattafa | Queen of Arabia Perfume Lattafa Pride | Queen of Arabia Lattafa Pride | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Lattafa | Vintage Radio Perfume by Lattafa Pride | Vintage Radio by Lattafa Pride | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Lattafa | Yara Pink Perfume - Women | Yara Pink - Women | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Le Falcone | Risala For You Perfume Niche Collection | Risala For You Niche Collection | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Lolita Lempicka | Sweet Lolita Lempicka | Sweet | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Madonna | Bloom Madonna | Bloom | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Moroccanoil | Fragrance L'Originale | L'Originale | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Moschino | Uomo Moschino | Uomo | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Nicole Miller | Nicole Miller Black | Black | the shops split between the long and the short name; no source settles it |
| Prada | Prada La Femme Water | La Femme Water | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Rayhaan | Divine Perfume | Divine | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Rayhaan | Nocturno Perfume | Nocturno | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Rayhaan | Valhalla Perfume | Valhalla | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Recipe For Men | Signature Fragrance Mountains | Signature Mountains | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Roberto Cavalli | Florence Roberto Cavalli | Florence | only Direct Cosmetics gives this name and no other shop writes the same words; the house may be part of the name |
| Scent Organix | Scent-Organix Rise And Shine | Rise And Shine | the shops split between the long and the short name; no source settles it |
| Scent Organix | Scent-Organix So Serene | So Serene | the shops split between the long and the short name; no source settles it |
| Ted Baker | Mia Ted Baker | Mia | only one independent shop gives the shorter name and the longer one comes from Direct Cosmetics or one other shop; the house may be part of the name |
| Vanderbilt | Miss Vanderbilt | Miss | the shops split between the long and the short name; no source settles it |
| Juliette Has a Gun | Not a Perfume For Women | Not a For Women | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Tous | Leau De Perfume | Leau | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Rabanne | Paco Rabanne | Paco | only Direct Cosmetics gives this name and no other shop writes the same words; the house may be part of the name |
| Unique’e Luxury | Unique'e Luxury Kutay | Kutay | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
| Unique’e Luxury | Unique'e Luxury Chocolate Makes Me Happy For Unisex | Chocolate Makes Me Happy For Unisex | "Perfume" or "Fragrance" is probably the shop's template word, but no second independent source was found |
