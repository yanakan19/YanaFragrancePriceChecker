# Size review, 14 Oct 2026

Owner reports: Emirates Oud shows Swiss Arabian Shaghaf as 100ml; Paco Perfumerias UK shows CK One 300ml.

## Settled

- **Emirates Oud, Shaghaf Oud Marine and Shaghaf Nectar Blush.** The shop's own title and copy say 100ml, so the crawl read them correctly; the shop is wrong. swissarabian.com's product list (read 14 Oct, robots allow) sells every Shaghaf in 75 ML (25 ML minis); none in 100ml. The shop's £49.99 and £44.99 are 75ml prices, six other shops state Nectar Blush 75ml, and Emirates Oud had already fixed its Vanilla Toffee page from 100ml to 75ml. Both are now read at 75ml through `SIZE_CORRECTIONS_REVIEWED` (`src/catalogue/sizeReview.ts`), the way a size outvoted by a barcode is.
- **Paco, CK One 300ml: genuine, left alone.** Its page title, h1 and structured data say 300ml; barcode 3607347821441 is the 300ml CK One (upcitemdb; Superdrug lists it too). The page's size swatch only links the 100ml and 200ml siblings, which is why it looked absent. The listing is out of stock.

## Rule and guard

`findHouseSizeContradictions`: a size only one shop states that the house's reviewed list lacks (vials up to 10ml and sets ignored). `tests/sizeReviewData.test.ts` fails on any such listing that is neither corrected nor pending, and cannot fire on a genuine new size (two shops stating it is enough to clear it).

## Measured, report only

- Cross-shop rule (a size one shop states, 3+ other shops list the fragrance at other sizes, and it is 1.5x the largest other and 150ml or more): 59 listings with a fetchable page. 30 pages read (10 Paco, 20 other shops, PriceSniffsBot, robots checked, 3s apart): all 30 still state the size in their own title or page. These are genuine large formats (150/200/250ml), mostly out of stock at Paco. Too noisy to act on, so no auto rule.
- Same rule without the size floor: 814 one-shop sizes, nicchia-luxury-uk 223, perfume-direct 81, parfumdreams-uk 70, paco 53, beaute-boulevard 51 (mostly shops carrying sizes others do not).
- House lists compared (Swiss Arabian live, Afnan uk.afnan.com live, Armaf, Al Haramain and Rasasi from their own stores in our data): Swiss Arabian 2 contradictions (both fixed). Lattafa, Ajmal, Arabian Oud: no readable product list (lattafa.com not a Shopify store, Ajmal 404, arabianoud.com empty), not checked.

## For the owner (not guessed)

1. Justmylook "Swiss Arabian Shaghaf Tobacco 01 Extrait 50ml": the house sells Tobacco 01 (£68) but not as a Shaghaf, size unread. Parked in `SIZE_REVIEW_PENDING`.
2. Afnan Supremacy In Oud Extrait: house lists 150ml, ten shops list 100ml. Afnan 9PM 150ml (Beautybase only): house lists 100ml. Armaf Club De Nuit Milestone 200ml (4 shops) and 10ml (2 shops) against house 18/30/105ml; Jenny Glow Yours Truly 80ml (3 shops) against house 100ml; Armaf Fade Denim Edit 100 against house 80; Armaf Le Parfait Pour Homme 100 against house 200. Several shops agree, so these look like different editions, not slips.
