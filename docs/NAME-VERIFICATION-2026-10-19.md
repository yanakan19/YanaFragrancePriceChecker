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
