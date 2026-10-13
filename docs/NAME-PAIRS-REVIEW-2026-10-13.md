# Name pairs review, 13 October 2026

The 12 Oct same-fragrance pass (`src/catalogue/audienceNames.ts`) merges a plain
name ("Maryam") with a labelled one ("Maryam for Women", "Pour Homme", "Unisex"
and so on) only on proof. This is the hand review of what it left open.

## Result

| | Before | After |
|---|---|---|
| UK pairs of a plain name against a labelled one, same size and strength, still two products | 614 (in 421 families) | 386 |
| of them with different barcodes | 144 | 145 |
| UK products | 33,198 | 32,998 (200 joined) |
| US products | 22,824 | 22,722 (102 joined) |
| India products | 15,509 | 15,488 (21 joined) |
| Old product addresses recorded as redirects (`data/id-aliases.json`, append only) | 17,266 | 17,505 (237 added) |

Counts come from `npx tsx scripts/name-pairs-report.ts` (run it again to list what is still open).
The pairs are counted per size and strength; the review below is per family (one house, one
name, every size and strength), so one decision settles every size at once.

Decisions: **191 families merged** (the plain spelling is the labelled one), **26 kept apart for
good**, **54 looked at and not joined** (different barcodes, or the shop pages disagree), and
**149 left for the owner** with the reason.

## How each family was decided

Evidence, strongest first. Nothing was merged on the words alone.

1. **The house's own store.** The crawl keeps a snapshot of each house storefront
   (`data/catalogue/<house>.json`, `data/houses/`), and for Afnan, Armaf and Al Haramain the public
   product list of the house's own Shopify store was read on 13 Oct 2026 (`/products.json`,
   robots.txt read first and allowing it, PriceSniffsBot identity, 2 second gaps, five requests in
   all; Zimaya's robots.txt answered 503, so it was not read). A house that sells a fragrance only under
   the labelled name, with no plain product and none for the other sex, has one product: the
   plain name is a reseller's shortening. Where the house's own tags say Men or Women
   (Afnan), that is cited.
2. **The shops' own pages for the plain name.** Their category (`productType`, for example
   "Women's Perfume"), the section of their address (`/women/`) and the wording of their descriptions.
   Pages that say the plain name is for the sex the label names, and none that say otherwise, join them.
3. **A shared address, notes or image** between the two names.
4. **Reviewer knowledge of the house's range**, only for well known houses where the range is
   certain, marked as such in the evidence and not re-read on the house's page. These are the
   weakest merges here; they are listed so the owner can strike any one.

A pair with two different barcodes was never joined without proof that the barcodes are one
product in two packagings or markets. None had such proof, so every one stays apart.

Where a house sells **both** a men's and a women's bottle under one name (Gucci Guilty, Burberry
Brit, Hugo Boss The Scent), the plain name was joined to the sex its own shop pages say, if they
agree, and the other stays a separate product; if the pages do not say, it is for the owner.

Traps found and kept apart on purpose: Calvin Klein Escape (the women's original) and Escape for Men,
L'Eau d'Issey Intense (women's) and Pour Homme Intense, Calvin Klein Euphoria (women's) and Euphoria Men.

## Where the lists live

`src/catalogue/audienceReviewed.ts`: `SAME_FRAGRANCE_REVIEWED` (merge list, one line of evidence each),
`KEEP_APART_REVIEWED` (blocks the weaker rules), `KEPT_APART_UNPROVEN` (reviewed, not joined; does not
block, so a shared barcode or the shops' own wording can still join them). The merge and keep apart
lists are read by `audienceNames.ts`. A keep apart family still joins on one shared barcode: it is the
one proof that outweighs the words. Tests: `tests/sameFragranceNames.test.ts`.


## Merged: the plain name is the labelled fragrance

| House | Plain name | Labelled name(s) | Evidence |
|---|---|---|---|
| Abercrombie & Fitch | Authentic Spirit | Authentic Spirit Man / Authentic Spirit Woman | the plain name's shop pages say women (category/address 2, description 0) and none say men; the men-labelled name stays a separate bottle |
| Abercrombie & Fitch | First Instinct Blue | First Instinct Blue Man | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Afnan | Lynked Forever | Lynked Forever Pour Femme | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Lynked Forever' and tags it Women, with no second women-labelled product; no other Afnan product of that name |
| Afnan | Lynked Freedom | Lynked Freedom Pour Homme | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Lynked Freedom' and tags it Men, with no second men-labelled product; no other Afnan product of that name |
| Afnan | Supremacy Collector's Edition | Supremacy Collectors Edition Pour Homme | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Supremacy Collector's Edition' and tags it Men, with no second men-labelled product; no other Afnan product of that name |
| Afnan | Supremacy Not Only Intense | Supremacy Not Only Intense Pour Homme | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Supremacy Not Only Intense' and tags it Men, with no second men-labelled product; no other Afnan product of that name |
| Afnan | Supremacy Pink | Supremacy Pink Pour Femme | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Supremacy Pink' and tags it Women, with no second women-labelled product; no other Afnan product of that name |
| Afnan | Supremacy Silver | Supremacy Pour Homme Silver | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Supremacy Silver' and tags it Men, with no second men-labelled product; no other Afnan product of that name |
| Afnan | Turathi Blue | Turathi Homme Blue | uk.afnan.com's own product list (read 13 Oct 2026, robots allow) names it 'Turathi Blue (turathi-blue-homme)' and tags it Men, with no second men-labelled product; no other Afnan product of that name |
| Ahmed Al Maghribi | Rose Noir | Rose Noir by Ahmed Al Maghribi for women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Ajmal | Shine | Shine for Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Areej Al Oud | Areej Al Oud for Men | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Areej Al Oud for Men', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Junoon Noir | Junoon Noir for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Junoon Noir for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | L'Aventure | L'Aventure Femme / L'Aventure for Men | the plain name's shop pages say men (category/address 1, description 1) and none say women; the women-labelled name stays a separate bottle |
| Al Haramain | L'Aventure Blanche | L'Aventure Blanche for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'L'Aventure Blanche for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | L'Aventure Gold | L'Aventure Gold for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'L'Aventure Gold for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | L'Aventure Knight | L'Aventure Knight for Men | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'L'Aventure Knight for Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Al Haramain | L'aventure Intense | L'Aventure Intense for Men | the house's own store (crawl snapshot) sells it only as 'L'Aventure Intense for Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Al Haramain | L'aventure Rose | L'Aventure Rose for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'L'Aventure Rose for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Manege Rouge | Manege Rouge for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Manege Rouge for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Maryam | Maryam for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Maryam for Women', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Musk Floral | Musk Floral for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Musk Floral for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Noora | Noora for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Noora for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Al Haramain | Signature Red | Signature Red for Women | the house's own site shows one page for both names; the house's own store (crawl snapshot) sells it only as 'Signature Red for Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Amouage | Love Hibiscus | Love Hibiscus Woman | the shops' own category or address for the plain name says women; no shop sells both names; no product of the other sex in the family |
| Arabiyat | Nyla Sherbet | Nyla Sherbet For Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Armaf | Arabia Amber Oud | Amber Arabia Oud Pour Homme | the shops' own category or address for the plain name says men; no shop sells both names; no product of the other sex in the family |
| Armaf | Art d'Amour | Art D'Amour Pour Femme | the house's own store (crawl snapshot) sells it only as 'Art D'Amour Pour Femme', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Armaf | Beau Acute | Beau Acute For Men | the house's own store (crawl snapshot) sells it only as 'Beau Acute For Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Club De Nuit Intense Non Alcoholic | Club De Nuit Intense Man Non-Alcoholic | the house's own store (crawl snapshot) sells it only as 'Club De Nuit Intense Man Non-Alcoholic', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Club De Nuit Sillage | Club de Nuit Sillage for Men | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Club de Nuit Urban | Club De Nuit Urban Man | Armaf's own store (uk list read 13 Oct 2026) sells it only under the men's name ('Club De Nuit Urban Man Elixir') and has no plain-name product and none for women; no shop sells both names |
| Armaf | Craze | Craze For Men | the house's own store (crawl snapshot) sells it only as 'Craze For Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Ego Exotic | Ego Exotic For Women | the house's own store (crawl snapshot) sells it only as 'Ego Exotic For Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Armaf | Ego Tigre | Ego Tigre For Men | the house's own store (crawl snapshot) sells it only as 'Ego Tigre For Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Excellus | Excellus For Women | the house's own store (crawl snapshot) sells it only as 'Excellus For Women', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Armaf | Hunter Intense | Hunter Intense For Men | the house's own store (crawl snapshot) sells it only as 'Hunter Intense For Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Hunter Jungle | Hunter Jungle For Men | the house's own store (crawl snapshot) sells it only as 'Hunter Jungle For Men', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Armaf | Miss Armaf Dazzling | Miss Armaf Woman Dazzling | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Armaf | Odyssey Mandarin Sky Limited Edition | Odyssey Homme Mandarin Sky Limited Edition | Armaf's own store (uk list read 13 Oct 2026) sells it only under the men's name ('Odyssey Homme Mandarin Sky Limited Edition') and has no plain-name product and none for women; no shop sells both names |
| Armaf | Odyssey Mega Limited Edition | Odyssey Mega Man Limited Edition | Armaf's own store (uk list read 13 Oct 2026) sells it only under the men's name ('Odyssey Homme Mega Men') and has no plain-name product and none for women; no shop sells both names |
| Armaf | Signature Night | Signature Night For Men | the house's own store (crawl snapshot) sells it only as 'Signature Night For Men', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Armaf | Tres Jour | Tres Jour For Women | the house's own store (crawl snapshot) sells it only as 'Tres Jour For Women', with no plain-name product and no product for the other sex; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Armaf | Venetian | Venetian For Men | the house's own store (crawl snapshot) sells it only as 'Venetian For Men', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Armaf | Venetian Gold | Venetian Gold For Men | the house's own store (crawl snapshot) sells it only as 'Venetian Gold For Men', with no plain-name product and no product for the other sex; no shop sells both names; no product of the other sex in the family |
| Boucheron | Serpent Bohème | Boucheron Serpent Boheme For Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Burberry | Hero | Hero for Men | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Burberry | Mr. | Burberry Mr Pour Homme - . | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Cacharel | Anaïs Anaïs L'Original | ANAIS ANAIS L'ORIGINAL FOR HER | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Calvin Klein | CK One / CK one | Unisex CK One | reviewer knowledge of the house range: it makes one fragrance of this name, for both; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Calvin Klein | Defy | DEFY For Him / Defy For Men / Defy Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Calvin Klein | Euphoria | Euphoria For Men / Euphoria For Women / Euphoria Men / Euphoria Women ... | the plain name's shop pages say women (category/address 3, description 5) and none say men; the men-labelled name stays a separate bottle |
| Carolina Herrera | 212 | 212 Femme / 212 Men | the plain name's shop pages say women (category/address 1, description 2) and none say men; the men-labelled name stays a separate bottle |
| Carolina Herrera | 212 Heroes | 212 Heroes for Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chanel | Allure | Allure Femme / Allure Homme | the plain name's shop pages say women (category/address 0, description 3) and none say men; the men-labelled name stays a separate bottle |
| Chanel | Égoïste | Egoiste Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Cedrus Intense | Atelier des Fleurs Cedrus Intense for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Chêne | Atelier des Fleurs Chêne for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Hysope | Atelier des Fleurs Hysope for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Immortelle | Atelier des Fleurs Immortelle for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Nuit d'Oranger | Atelier des Fleurs Nuit d'Oranger for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Orchidée de Minuit | Atelier des Fleurs Orchidée de Minuit for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Atelier des Fleurs Tubéreuse Lazuli | Atelier des Fleurs Tubéreuse Lazuli for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | L'eau De Parfum Intense / L’Eau de Parfum Intense | L’Eau de Parfum Intense for Women | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Chloé | Nomade Lumière d'Égypte | Nomade Lumière d'Égypte for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Chloé | Nomade Nuit d'Egypte | Nomade Nuit d’Egypte For Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Coach | Blue | For Men Blue | the shops' own category or address for the plain name says men; no shop sells both names; no product of the other sex in the family |
| Coach | Cherry | Woman Cherry | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Coach | Coach Dreams Sunset | DREAMS SUNSET For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Coach | Coach Green | Green For Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Coach | Floral | FLORAL For Her | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Coach | Floral Blush | FLORAL BLUSH For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Coach | Gold | Woman Gold | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Coach | Pure Platinum | Men Pure Platinum | the shops' own category or address for the plain name says men; no shop sells both names; no product of the other sex in the family |
| Davidoff | Adventure | Adventure For Him | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Davidoff | Cool Water Reborn | Cool Water for Men Reborn | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Diptyque | Eau des Sens | Eau des Sens Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Diptyque | Fleur de Peau | Fleur de Peau Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Dsquared2 | Green Wood | DSquared² Green Wood Pour Homme | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Dsquared2 | Red Wood | Red For Women Wood | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Dsquared2 | Wood | Wood Pour Femme / Wood Pour Homme | the plain name's shop pages say men (category/address 2, description 2) and none say women; the women-labelled name stays a separate bottle |
| Dunhill | Desire | Desire For Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Dunhill | Desire Black | Desire Black for Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Dunhill | Desire Blue | Desire Blue For Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Dunhill | Desire Blue Unboxed | Desire Blue for Men -unboxed | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Dunhill | Driven | DRIVEN For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Emporio Armani | Because It's You | Because It's You For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Emporio Armani | Power of You | Power Of You For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Emporio Armani | Stronger With You EDT | Stronger With You For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Giorgio Armani | Acqua Di Gio / Acqua Di Giò / Acqua di Gio | Acqua di Giò Femme / Acqua di Giò Homme | the plain name's shop pages say men (category/address 3, description 5) and none say women; the women-labelled name stays a separate bottle |
| Giorgio Armani | Acqua di Gio Intense | Acqua di Gio pour Homme Intense | the shops' own category or address for the plain name says men; no shop sells both names; no product of the other sex in the family |
| Giorgio Armani | Armani Code / Code | Armani Code For Woman / Code For Women / Code Homme / Code Pour Homme | the plain name's shop pages say men (category/address 17, description 19) and none say women; the women-labelled name stays a separate bottle |
| Giorgio Armani | Code Profumo | CODE PROFUMO For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Giorgio Armani | Emporio Armani In Love With You | Emporio Armani In Love With You for Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Giorgio Armani | Emporio Armani Stronger With You | Emporio Armani Stronger With You For Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Giorgio Armani | Emporio Armani Stronger With You Absolutely | Emporio Armani Stronger With You Absolutely For Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Giorgio Armani | Emporio Armani Stronger With You Intensely | Emporio Armani Stronger With You Intensely For Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Giorgio Armani | My Way Parfum | My Way Parfum For Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Goutal | Ambre Sauvage | Annick Goutal Ambre Sauvage For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Goutal | Le Temps des Reves | Le Temps des Rêves For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Goutal | Petite Chérie | Petite Chérie For Her | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Goutal | Rose Pompon | Rose Pompon For Her | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Goutal | Un Matin d'Orage | Un Matin d'Orage For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Gucci | Bloom | Bloom For Her | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Gucci | Bloom Intense | Bloom For Her Intense | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Gucci | Flora Gorgeous Gardenia | Flora Gorgeous Gardenia For Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Gucci | Flora Gorgeous Orchid | Flora Gorgeous Orchid for Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Gucci | Guilty | Gucci Guilty Pour Femme / Guilty For Her / Guilty For Him / Guilty Pour Femme ... | the plain name's shop pages say women (category/address 0, description 4) and none say men; the men-labelled name stays a separate bottle |
| Guess | Seductive | Guess Seductive Homme / Seductive Women / Seductive for Women | the plain name's shop pages say women (category/address 0, description 3) and none say men; the men-labelled name stays a separate bottle |
| Guess | by Marciano | Guess by Marciano Woman | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Guy Laroche | Drakkar Intense | Drakkar Intense Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Hugo Boss | Alive / BOSS Alive / Boss Alive | BOSS Alive For Her / Boss Alive For Her | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Hugo Boss | BOSS Bottled | Boss Bottled For Men | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Hugo Boss | BOSS Bottled Elixir Intense | BOSS Bottled Elixir Intense for Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Hugo Boss | BOSS The Scent Elixir Intense | BOSS The Scent Elixir Intense for Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Hugo Boss | Boss Ma Vie L'Eau | Ma Vie Pour Femme L'eau | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Hugo Boss | Boss The Scent Intense | BOSS The Scent Intense for Her / BOSS The Scent Intense for Him | the plain name's shop pages say men (category/address 0, description 4) and none say women; the women-labelled name stays a separate bottle |
| Hugo Boss | Hugo | HUGO Man / Hugo Man | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Hugo Boss | The Scent | BOSS The Scent For Her / BOSS The Scent For Him / Boss The Scent For Her / The Scent For Her ... | the plain name's shop pages say men (category/address 4, description 5) and none say women; the women-labelled name stays a separate bottle |
| Hugo Boss | The Scent Le Parfum | BOSS The Scent Le Parfum For Him | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Iceberg | Eau de Iceberg Amber | Eau De Iceberg Amber For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Issey Miyake | L'Eau D'Issey / L'Eau d'Issey | L'Eau D'Issey Pour Femme / L'Eau d'Issey Pour Femme / L’Eau d’Issey Pour Homme / L’Eau d’Issey pour Homme | the plain name's shop pages say women (category/address 13, description 5) and none say men; the men-labelled name stays a separate bottle |
| Jaguar | Evolution | For Men Evolution | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Jean Paul Gaultier | Classique | CLASSIQUE For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Jean Paul Gaultier | Scandal Gold | Scandal Gold For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Jean Paul Gaultier | Scandal Intense | Scandal Pour Femme Intense / Scandal Pour Homme Intense | the plain name's shop pages say women (category/address 0, description 3) and none say men; the men-labelled name stays a separate bottle |
| Jennifer Lopez | Glow | Glow for Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Jil Sander | Sun | Sun Men / Sun Women | the plain name's shop pages say women (category/address 2, description 3) and none say men; the men-labelled name stays a separate bottle |
| Jimmy Choo | Blossom Special Edition | BLOSSOM SPECIAL EDITION FOR HER | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Kenzo | KENZO WORLD / World | WORLD FOR HER | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Lacoste | L.12.12 Blanc | L.12.12 Blanc Pour Lui | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Lacoste | L.12.12 Noir | L.12.12 Noir Men | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Lalique | L'Amour | L'Amour For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Lancôme | Lancome Hypnose | Hypnose For Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Lanvin | Eclat D'Arpege | Eclat D'Arpege Pour Femme | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Lattafa | Asad Elixir | Asad Elixir For Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Lattafa | Hayaati | Hayaati for Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Lattafa | Yara Elixir | Yara Elixir for Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Loewe | 7 | 7 Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Loewe | 7 Cobalt | 7 Cobalt Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Loewe | Solo | Solo Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Loewe | Solo Cedro | Solo Cedro Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Loewe | Solo Vulcan | Solo Vulcan Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Maison Alhambra | Leonie | Léonie by Maison Alhambra - Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Michael Kors | Blue Dusk | Blue Dusk Pour Homme | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Michael Kors | Green Infinity | Green Infinity Pour Homme | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Michael Kors | Pink Horizon | Pink Horizon Pour Femme | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Michael Kors | Violet Sunset | Violet Sunset Pour Femme | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Miu Miu | L'Eau Bleue | L'Eau Bleue For Her | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Montblanc | Individuel Tonic | Individuel Tonic Homme | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Montblanc | Presence | Presence For Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Mugler | Angel Standing Star | Angel for Her - Standing Star | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Ouai | Dean Street | Dean Street Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Ouai | Melrose Place | Melrose Place Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Ouai | North Bondi | North Bondi Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Ouai | Rue St. Honoré | Rue St Honore Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Paloma Picasso | Minotaure | Minotaure Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Police | To Be Camouflage Special Edition | To Be Camouflage for Him - Special Edition | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Proenza Schouler | Arizona Collectors Edition | Arizona for Her - Collectors Edition | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Rabanne | Black XS / Black Xs | Black XS For Her / Black XS Him / Black XS Pour Elle | the plain name's shop pages say men (category/address 1, description 2) and none say women; the women-labelled name stays a separate bottle |
| Rabanne | Invictus Legend | INVICTUS LEGEND For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Rabanne | Million Gold Intense | Million Gold Intense for Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Rabanne | Pure XS Night | PURE XS NIGHT For Him | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Rabanne | Ultrared | Ultrared Man | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Ralph Lauren | Polo | POLO For Him | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Ralph Lauren | Polo Sport | Polo Sport Man | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Ralph Lauren | Polo Sport Fresh | Polo Sport Fresh Men | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Ralph Lauren | Romance | Romance For Women | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Rasasi | Hawas Pink | Hawas For Her Pink | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Rayhaan | Pacific Aura Perfume | Pacific Aura For Him | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Revlon | Charlie Red | Women's Perfume Charlie Red | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Roberto Cavalli | Just Cavalli | Just Cavalli For Her / Just Cavalli Man | the plain name's shop pages say women (category/address 4, description 2) and none say men; the men-labelled name stays a separate bottle |
| Salvatore Ferragamo | F by Ferragamo Black | F by Ferragamo Black pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Salvatore Ferragamo | FERRAGAMO Bright Leather | Bright Leather Pour Homme | reviewer knowledge of the house range: it makes one fragrance of this name, for men; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Salvatore Ferragamo | FERRAGAMO Intense Leather | Intense Leather Pour Homme | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Sarah Jessica Parker | Born Lovely Rollerball | Born Lovely Rollerball for Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Sergio Tacchini | Splendida | Splendida Pour Femme | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Tom Ford | Black Orchid | Black Orchid for Her | the shops' own category or address for the plain name says women; no shop sells both names; no product of the other sex in the family |
| Van Cleef & Arpels | Orchidee Vanille | Orchidée Vanille Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Van Cleef & Arpels | Santal Blanc | Santal Blanc Women | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Versace | Blue Jeans | Blue Jeans Man | the shops' own category or address for the plain name says men; the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Versace | Bright Crystal Absolu | Bright Crystal Absolu For Women | the shops' own category or address for the plain name says women; the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Versace | Eros | Eros Pour Femme / Eros Pour Homme / Eros pour Femme | the plain name's shop pages say men (category/address 9, description 11) and none say women; the women-labelled name stays a separate bottle |
| Victorinox Swiss Army | Classic Red Edition | Classic for Him - Red Edition | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Yardley London | English Lavender Stick | English Lavender Stick for Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Yves Saint Laurent | Cinema | CINEMA For Her | reviewer knowledge of the house range: it makes one fragrance of this name, for women; no shop sells both names; no product of the other sex in the family; not re-read on the house's own page |
| Yves Saint Laurent | Libre | LIBRE For Her | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |
| Yves Saint Laurent | Opium | Opium For Women / Opium Pour Homme | the plain name's shop pages say women (category/address 2, description 5) and none say men; the men-labelled name stays a separate bottle |
| Yves Saint Laurent | Y Intense | Y for Men Intense | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Yves Saint Laurent | Y Le Parfum | Men Y Le Parfum | the shops' descriptions of the plain name say men; no shop sells both names; no product of the other sex in the family |
| Zimaya | Fatima Velvet Love | Fatima Velvet Love Pour Femme | the shops' descriptions of the plain name say women; no shop sells both names; no product of the other sex in the family |

## Kept apart for good: different fragrances

| House | Plain name | Labelled name(s) | Reason |
|---|---|---|---|
| Al Haramain | OYUNY | Oyuny for Women | the house's own site has a separate page for each name |
| Avon Cosmetics | Purse | for Her Purse | the house's own store sells both names as separate products |
| Bond No 9 | The Scent of Peace | The Scent of Peace for Him | the house's own site has a separate page for each name |
| Calvin Klein | Escape | Escape For Men / Escape for Men | Calvin Klein sells two different fragrances: Escape (1991, for women) and Escape for Men (1993); the plain Escape pages are not the men's bottle (reviewer knowledge of the house range) |
| Calvin Klein | Eternity | Eternity For Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Calvin Klein | Eternity Intense Suede Essence | Eternity for Men Intense Suede Essence | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Calvin Klein | Euphoria Travel Spray | Euphoria Men Travel Spray | Calvin Klein's plain Euphoria is the women's fragrance; Euphoria Men is a different one, so Euphoria Men Travel Spray is not the plain travel spray (reviewer knowledge of the house range) |
| Carolina Herrera | CH | CH Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Creed | Aventus | Aventus For Her | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); the house's own site has a separate page for each name; every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Davidoff | Cool Water | Cool Water Woman | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); the house's own site has a separate page for each name; every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dolce & Gabbana | Devotion | Devotion Man | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dolce & Gabbana | Light Blue | Light Blue Pour Homme / Light Blue pour homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); the house's own site has a separate page for each name |
| Dolce & Gabbana | Light Blue Capri In Love | Light Blue Capri In Love Pour Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dolce & Gabbana | Light Blue Eau Intense | Light Blue Eau Intense Pour Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Dolce & Gabbana | The One | The One For Men / The One for Men / the one for men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); the house's own site has a separate page for each name |
| Dolce & Gabbana | The One Gold Intense | The One For Men Gold Intense | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); the house's own site has a separate page for each name; every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Issey Miyake | L'Eau D'Issey Intense | L'eau D'issey Pour Homme Intense | Issey Miyake sells two fragrances: L'Eau d'Issey Intense (for women) and L'Eau d'Issey Pour Homme Intense; the plain name is the women's one (reviewer knowledge of the house range) |
| Jean Paul Gaultier | Scandal Absolu | Scandal Absolu Pour Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Jean Paul Gaultier | Scandal Le Parfum | Scandal Pour Homme Le Parfum | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Lacoste | Lacoste Original | Original Pour Femme | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Lattafa | Rave Now | Rave Now Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); the house's own site has a separate page for each name |
| Miu Miu | L'Eau Rosee | L’Eau Rosée For Her | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Oscar de la Renta | Oscar | Oscar For Him | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Rabanne | Pure XS Perfume | Pure XS For Her | the house's own site has a separate page for each name |
| Rabanne | Ultraviolet | Ultraviolet Man | the house's own site has a separate page for each name |
| Salvatore Ferragamo | Ferragamo Sublime Leather | Sublime Leather Pour Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |

## Looked at, not joined: different barcodes or disagreeing pages

| House | Plain name | Labelled name(s) | Reason |
|---|---|---|---|
| Antonio Banderas | Blue Seduction | Blue Seduction Women / Blue Seduction for Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Antonio Banderas | The Icon | The Icon Pour Femme | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Ard Al Zaafaran | Dar Al Hae | Dar al Hae For Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Azzaro | Azzaro | Azzaro Pour Homme | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Boucheron | Jaipur Bracelet | Jaipur Bracelet Femme | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Burberry | Brit Rhythm | Brit Rhythm For Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Bvlgari | Omnia Crystalline | Omnia Crystalline For Her | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Calvin Klein | Free | Free for Men | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Calvin Klein | IN2U | IN2U Him | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Carolina Herrera | 212 NYC | 212 Men NYC | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Carolina Herrera | 212 Sexy | 212 Sexy Women | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Carolina Herrera | CH Pasion | CH Men Pasion | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| DKNY | Be Delicious | Be Delicious For Women | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Davidoff | Cool Water Intense | Cool Water Intense For Her | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Davidoff | Cool Water Reborn Intense | Cool Water Reborn Intense for Her | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Diesel | Loverdose | Loverdose For Women | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Diesel | Spirit Of The Brave | Spirit of The Brave For Men | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dior | Dune | Dune Pour Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dolce & Gabbana | DOLCE&GABBANA Intenso | Pour Homme Intenso | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dolce & Gabbana | Light Blue Forever | Light Blue Pour Homme Forever | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Dolce & Gabbana | The One Intense | The One For Men Intense | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Elizabeth Arden | Always Red Elizabeth Arden | Always Red Femme Elizabeth Arden | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Embark | My Passion | My Passion For Him | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Giorgio Armani | Acqua Di Gio Profondo | Acqua di Giò Homme - Profondo | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Giorgio Armani | Emporio Armani He | Emporio Armani He For Men | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Giorgio Armani | Emporio Armani She | Emporio Armani She For Women | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Giorgio Armani | My Way Intense | My Way Intense For Women | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Givenchy | Blue Label | Blue Label Pour Homme | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Gucci | Guilty Intense | Guilty Pour Femme Intense | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Guess | 1981 | 1981 for Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Guess | Dare | Dare for Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Guess | Guess | Guess Woman | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Guess | Iconic | Iconic For Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Hugo Boss | Energise | HUGO Energise For Him | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Issey Miyake | L'eau D'issey IGO Cap to Go | L'eau D'issey Pour Homme IGO Cap To Go | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Lacoste | Lacoste L.12.12 Rose Eau Fraiche | L.12.12 Pour Elle Eau Fraiche Rose | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Lacoste | Lacoste Red | Red For Men | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Lattafa | Fakhar | Fakhar Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Lattafa | The Kingdom | The Kingdom for Her | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Louis Cardin | Gold | Gold Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Lubin | Upper Ten | Upper Ten For Her | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Maison Francis Kurkdjian | À La Rose | HOMME A LA ROSE | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Mandarina Duck | Let's Travel to New York | Let's Travel To New York For Woman | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Nobile 1942 | Pontevecchio | Pontevecchio Woman | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Police | To Be Hyperverse | To Be Hyperverse Woman | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Police | To Be Tattooart | To Be Tattooart for Man | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Rasasi | Junoon Satin | Junoon Satin For Men | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Rave | Now | Now Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Rayhaan | Italia Perfume | Italia Pour Homme | every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Swiss Arabian | Shaghaf | Shaghaf Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| Tom Ford | Noir | Noir Pour Femme | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes); every pair at the same size carries two different barcodes and nothing shows they are one product in two packagings or markets |
| United Colors & Prestige Beauty | Sun Moon Stars | Sun Moon Stars Pour Homme | the plain name's own pages say women while the other name says men, so they are different bottles (a house selling the same name for both sexes) |
| Versace | Crystal Noir | Pour Femme Crystal Noir | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |
| Versace | Red Jeans | Red Jeans Women | the plain name's own pages say men while the other name says women, so they are different bottles (a house selling the same name for both sexes) |

## For the owner: could not be settled

| House | Plain name | Labelled name(s) | Why not |
|---|---|---|---|
| Abercrombie & Fitch | AUTHENTIC | Authentic Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Abercrombie & Fitch | AUTHENTIC MOMENT | Authentic Moment For Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Afnan | 9pm | 9PM pour Femme / 9pm for Men | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 0)) |
| Afnan | Modest Deux | Afnan Modest Deux Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ajmal | Amaze | Amaze For Her | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ajmal | Aristocrat | Aristocrat for Her / Aristocrat for Him | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Ajmal | Blu | BLU by AJMAL FOR MEN | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ajmal | Raindrops | Raindrops by Ajmal for women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ajmal | Sacred Love | Women's Sacred Love | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ajmal | Sacrifice | Sacrifice For Her | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Amouage | Guidance 46 | Guidance 46 Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Amouage | Honour | Honour Man / Honour Woman | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Amouage | Interlude | Interlude Man / Interlude Woman | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Amouage | Lilac Love | Lilac Love Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Amouage | Love Delight | Love Delight Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Amouage | Love Tuberose | Love Tuberose Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Antonio Banderas | Power Of Seduction Urban Limited Edition | Power Of Seduction Urban for Him- Limited Edition | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ard Al Zaafaran | Aroosat Al Emarat | Aroosat Al Emarat - for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ard Al Zaafaran | Bint Hooran | Bint Hooran - for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ard Al Zaafaran | Mousuf Daisy Perfume | Mousuf Daisy For Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Armaf | Club De Nuit | Club De Nuit Man / Club De Nuit Woman | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 1)) |
| Armaf | Club De Nuit Intense | Club De Nuit Intense Man / Club De Nuit Intense Woman / Club De Nuit Intense Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 2)) |
| Armaf | Club de Nuit Lionheart | Club De Nuit Lionheart Man / Club De Nuit Lionheart Woman | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Armaf | Legesi | Legesi Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Armaf | Odyssey Wild One Gold Edition | Odyssey Wild One Gold Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Burberry | Brit | Brit For Him / Brit Women's Perfume / Brit for Men / Burberry Brit for Her | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 0)) |
| Burberry | London | Burberry London for Men / London For Men / London For Women / London for Men | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 1)) |
| Burberry | Touch | Touch For Men / Touch For Women / Touch Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 2)) |
| Burberry | Weekend | Weekend For Men / Weekend For Women / Weekend for Men | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 1)) |
| Bvlgari | Aqva | Aqva Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Calvin Klein | CK In2u | CK IN2U Her / CK IN2U for Her / CK In2U For Her / CK In2u Him ... | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 1)) |
| Calvin Klein | CK One Shock | CK One Shock For Her / CK One Shock For Him / CK One Shock Him | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Calvin Klein | Eternity Air | Eternity Air Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Calvin Klein | Eternity Cologne | Eternity Men Cologne | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Calvin Klein | Eternity Eau Fresh | Eternity Eau Fresh Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Calvin Klein | Eternity Flame | Eternity Flame For Women / Eternity Flame Men / Eternity Flame for Men | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 1)) |
| Calvin Klein | Eternity Reflections | Eternity for Women Reflections | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Calvin Klein | Obsession | Obsession For Men / Obsession For Women / Obsession for Men / Obsession for Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (1, 0)) |
| Carolina Herrera | 212 VIP | 212 VIP For Her / 212 VIP Men | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 1)) |
| Carolina Herrera | Chic | Chic For Men / Chic Ladies | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Cerruti | 1881 | 1881 Femme / Cerruti 1881 pour homme | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Clinique | Happy | Happy For Men / Happy For Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 1)) |
| Cuba Paris | Cuba Touch | Touch For Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Cuba Paris | My Love | My Love For Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Cuba Paris | Prestige Black | Prestige Black For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Cuba Paris | Prestige Platinum | Prestige Platinum For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| DKNY | Energizing | Men Energizing / Women Energizing | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 2)) |
| Delroba | Black Musk | Black Musk For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Delroba | Cashmere Bouquet | Cashmere Bouquet For Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Delroba | Emerald Haze | Emerald Haze For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Delroba | Sweet Amber | Sweet Amber For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Desigual | Fresh Festival | Fresh Festival Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Diesel | Fuel For Life | Fuel For Life For Men / Fuel For Life Her | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 2), women (0, 0)) |
| Dolce & Gabbana | Blue Eau intense | Blue Eau Intense for Her | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Dolce & Gabbana | The One Rollerball | The One For Her Rollerball | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Dumont Paris | Nitro Platinum | Nitro Platinum Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Dumont Paris | Nitro Red | Nitro Red Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Escada | Sentiment | Sentiment Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Evaflor | Whisky | Whisky Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Evaflor | Whisky Vintage | Whisky Vintage For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Fcuk | FCUK 3 | 3 Her | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Fcuk | FCUK Connect | Connect Him | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Flavia | Koral | Koral Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Flavia | Zolo | Zolo Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Franck Olivier | Excellence | Excellence Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Franck Olivier | Oud Vanille | Oud Vanille for Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Franck Olivier | Sun Java White | Sun Java White Woman | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Giorgio Beverly Hills | Giorgio Beverly Hills Red / Red | Red For Women / Red for Him | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (1, 1), women (0, 2)) |
| Gisada | Ambassador | Ambassador Men / Ambassador Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 2)) |
| Goutal | Eau d'Hadrien | Annick Goutal Eau d'Hadrien For Her / Eau d'Hadrien For Men | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Gucci | Intense Oud | Oud Intense For Her and For Him | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Hugo Boss | BOSS The Scent Magnetic | BOSS The Scent Magnetic For Her / BOSS The Scent Magnetic For Him / BOSS The Scent Magnetic for Him | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Hugo Boss | HUGO Extreme | HUGO Man Extreme / HUGO Woman Extreme / Hugo Woman Extreme / Woman Extreme | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Hugo Boss | Hugo Boss | BOSS Man for Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Hugo Boss | Hugo Jeans | HUGO Jeans For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Hugo Boss | Nuit | NUIT POUR FEMME | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Israel Philip | Avignon | Avignon Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Israel Philip | L'orient | L'orient Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Issey Miyake | L'Eau D'Issey Eau and Cèdre Intense | L'Eau d'Issey pour Homme Intense Eau & Cèdre / L'eau D'issey Pour Homme Eau & Cedre Intense | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Jean Patou | Voyager | Voyager Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Jenny Glow | Wild Orchid | Wild Orchid Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Joop! | WOW! | Joop Wow Homme / Joop Wow Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Kajal | II | Homme II | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Karl Lagerfeld | Classic | Classic for Men / Lagerfeld Classic Femme | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Karl Lagerfeld | Karl Hamburg Alster | Karl Hamburg Alster Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Kenzo | Aqua | Aqua Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Khadlaj | Shiyaaka Silver | Shiyaaka Silver For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Khadlaj | Shiyaaka Sky | Shiyaaka Sky for Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Khadlaj | Titan | Titan Perfume For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Korres | Achillea Bergamot Leather | Achillea Mens Bergamot Leather | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Korres | Achillea Vetiver & Spices | Achillea Mens Vetiver & Spices | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lanvin | Oxygene | Oxygene Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Emaan | Emaan for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Haya | Haya for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Hayaati Al Maleky | Hayaati Al Maleky Perfume for Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Jouri | Jouri Perfume For Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Mashrabya | Mashrabya for Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Mayar Intense | Mayar intense for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | QIMMAH | Qimmah For Men / Qimmah Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Lattafa | Shahd | Shahd by Lattafa - Perfume for women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Sherif | Sherif for Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lattafa | Yara Rollerball | Yara Rollerball for Her | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Laura Biagiotti | Roma | Roma Donna / Roma for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Loewe | Esencia | Esencia Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Loewe | Esencia Elixir | Esencia Elixir Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Lomani | AB Spirit Millionaire | AB Spirit Millionaire Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Louis Cardin | Compassion 2 Irresistible | Compassion 2 Irresistible for Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Louis Cardin | Oud Forever | Louis Cardin Oud Forever For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Maison Alhambra | Candid | Candid Femme EDP | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Maison Alhambra | Delilah | Delilah Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Mayfair | Pagan | Pagan for Women Perfume | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Mercedes-Benz | Ultimate | For Men Ultimate | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Milton Lloyd | Colour Me Volt | Colour Me Homme Volt | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Missoni | Wave | Wave Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Montblanc | Presence Cool | Presence Cool Homme EDT | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Moschino | Moschino | Uomo Moschino | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Narciso Rodriguez | Bleu Noir | Bleu Noir for Him / For Him Bleu Noir | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Narciso Rodriguez | Musc Noir Rose | For Her Musc Noir Rose | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Narciso Rodriguez | Pure Musc | For Her Pure Musc | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Narciso Rodriguez | Santal Musc Intense | For Him Musc Santal Intense | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| New Brand | Douceur | Douceur For Women | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| New Brand | Extreme Power | Extreme Power For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| New Brand | Golf Red | Golf Red For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Cherish | Cherish Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Elation Collection Ambit | Elation Collection Ambit Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Elation Collection Dion | Elation Collection Dion Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Elation Collection Eloise | Elation Collection Eloise Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Elation Collection Forever | Elation Collection Forever Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Elation Collection Harvey | Elation Collection Harvey Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Elation Collection Lazuli | Elation Collection Lazuli Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Heritage | Heritage Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orchid | Treasure | Treasure Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Orientica | Deen Sahir | DEEN SAHIR FEMME | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Rabanne | Xs | XS Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ralph Lauren | Safari | Safari For Men | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Rayhaan | Nocturno Perfume | Nocturno Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Reebok | Iconic Statement Blue | Iconic Statement Blue For Him | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Reebok | Iconic Statement Red | Iconic Statement Red For Him | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Reebok | Move Your Spirit | Move Your Spirit Men / Move Your Spirit for Women | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Roger & Gallet | Jean-Marie Farina | Jean Marie Farina for Him / Jean-Marie Farina for Unisex | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Ted Baker | X20 Extraordinary | X20 Extraordinary For Men / X20 Extraordinary Womens | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 0), women (0, 0)) |
| Tom Prune | Golden Wood | Golden Wood For Man | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Ulric de Varens | UDV Silver Limited Edition | UDV Silver For Him - Limited Edition | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| United Colors & Prestige Beauty | Sun Moon Stars Mania | Sun Moon Stars Mania Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| United Colors & Prestige Beauty | Sun Moon Stars Oro | Sun Moon Stars Oro Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Yves Saint Laurent | Y | Y For Her / Y For Him / Y For Men / Y Pour Homme ... | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 11), women (0, 1)) |
| Zimaya | Awatif | Awatif Pour Femme / Awatif Pour Homme | the house sells a men's and a women's bottle under this name; the plain name's pages do not settle which one it is (sections/descriptions: men (0, 1), women (0, 0)) |
| Zimaya | Fatima | Fatima Pour Femme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
| Zimaya | Ilham Al Oud | Ilham Al Oud Pour Homme | no shop page, house page or barcode says who the plain name is for, and the house may also make an opposite-sex bottle of that name |
