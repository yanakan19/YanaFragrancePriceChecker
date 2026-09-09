/**
 * The subset of an offer pickImage actually needs. Kept narrow and
 * structural, rather than importing the build script's full `Offer`
 * interface, so this module carries no dependency on that script (or its
 * side effects) at all — see this file's sibling test for why that matters.
 */
export interface ImageCandidate {
  retailerId: string;
  imageUrl: string | null;
  fetchedAt: string;
}

/**
 * The three outcomes scripts/image-box-check.ts records for a photo it has
 * actually downloaded and looked at (see data/image-box-verdicts.json and
 * docs/IMAGE-PIPELINE.md). `boxed` means the shot showed the retail box
 * standing beside the bottle — exactly what PREFERRED_IMAGE_RETAILERS' own
 * header says mybeauty-boutique and beautybase serve a real minority of the
 * time. `unsure` is not `boxed`: a photo the checker could not confidently
 * call either way is never treated as a reason to demote it.
 */
export type ImageBoxVerdict = 'boxed' | 'bottle-only' | 'unsure';

/**
 * Looked-up-by-URL verdicts from a prior scripts/image-box-check.ts run.
 * Optional everywhere it is threaded through: a caller with no verdict file
 * (or an offer whose photo was never checked) gets exactly the pre-verdict
 * behaviour below — this is additive, not a new requirement on every caller.
 */
export type ImageBoxVerdicts = ReadonlyMap<string, ImageBoxVerdict>;

/**
 * Measured pixel size of one photo, keyed below by the URL as STORED on the
 * offer — the same key `imageBoxVerdicts` uses, and for the same reason: both
 * are looked up before upgradeImageResolution() rewrites anything, so an
 * upgrade never has to invalidate a measurement.
 */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Real pixel sizes recorded by scripts/image-box-check.ts alongside its
 * verdicts. Optional throughout, exactly like the verdict map: none of the
 * 29,711 entries written before 2026-09-09 carries a size, and a photo with no
 * measurement must behave precisely as it did before rather than be guessed
 * at. See isTooSmallToSwapTo() for what happens when a size is missing.
 */
export type ImageDimensionsByUrl = ReadonlyMap<string, ImageDimensions>;

/**
 * The long edge, in pixels, at or above which a photo is big enough to be
 * worth swapping another photo out for.
 *
 * Set from the measured shape of the catalogue's own photos, because that is
 * the question this constant is actually asked. Of the 15,707 photos now
 * carrying a size, 593 have a long edge under 600px, and they do not tail off
 * smoothly — they cluster:
 *
 *     50-99px      1        200-249px   16
 *     100-149px  112        250-299px    6
 *     150-199px   10        300-349px    8
 *                           350-399px   22
 *
 * The 123 under 200px are not small photographs, they are thumbnails, and they
 * are the whole of that population: 104 justmylook `_x100` files at exactly
 * 100x100, 13 perfume-click bgstatic files at 130-195, the 70x70 Awin "no
 * image" placeholder, and five strays. Nothing above 200px is one. So the
 * floor sits in that gap, where the data puts a real boundary, rather than at
 * a number reasoned out from CSS.
 *
 * It was 400 for one day, reasoned from what the page draws: the grid tile is
 * `.art-md { width: min(90%, 300px) }` and the detail hero `.art-lg
 * { max-width: 340px }` (demo/template.html), so 340 CSS pixels is the largest
 * a photo is ever rendered, and 400 cleared that at 1x. The reasoning was
 * sound and the number was still wrong, because it answers "will this look
 * sharp" when the question is "is this a real photograph or a thumbnail". It
 * disqualified the 52 photos between 200 and 400px, which render perfectly
 * well, and it cost a real product: Issey Miyake A Drop d'Issey Essentielle
 * (ean-3423222090937) lost a 370x370 shot of the bottle alone and gained a
 * 1920x1920 one with the box beside it, because at 400 the good photo counted
 * as a thumbnail and dropped out of the pool. Both were downloaded and viewed.
 *
 * Erring low is also the safer direction here. This number only decides
 * whether a photo may *displace* another one, so too high a bar blocks good
 * swaps and quietly promotes worse photos, while too low a one merely allows a
 * slightly soft photo to win a swap it would have won anyway before any of
 * this existed.
 */
const MIN_SWAPPABLE_LONG_EDGE = 200;

/**
 * Retailers whose photos are thumbnail-sized files. Consulted only for a photo
 * whose own size has never been measured — see isTooSmallToSwapTo() below,
 * which prefers the real measurement whenever the sweep has recorded one.
 *
 * perfume-click is the only entry, and 2026-09-09 re-measured it rather than
 * carrying the old "82x130" note forward on trust. 30 of its stored
 * `imageUrl`s, drawn evenly across the 10,402 distinct bgstatic.net URLs in
 * data/catalogue/perfume-click.json, were downloaded and opened with Pillow:
 * every one fits inside a 195x130 box — widths 41 to 195, heights 75 to 130,
 * not one long edge above 195, none within half of the floor above.
 *
 * That is the shop's ONLY size, which is the part that had never been checked.
 * bgstatic.net is a plain Google Cloud Storage bucket with no resize service
 * in front of it: a missing object returns `NoSuchKey`, not a rendered image,
 * and listing the bucket is denied. Eight plausible siblings of the `_ml`
 * suffix every one of these URLs carries — `_xl`, `_l`, `_lg`, `_big`,
 * `_large`, `_zoom`, `_xxl`, `_2x` — plus the bare unsuffixed name were tried
 * against all 30: 240 requests, 240 misses, 0 hits. Nor does the source feed
 * hold a bigger one. These listings arrive through Awin, and
 * src/catalogue/awinFeed.ts already takes `merchant_image_url` in preference
 * to `aw_image_url`; the only other image-shaped column in that feed's schema
 * is `aw_thumb_url`, which is smaller by definition. There is no larger
 * perfume-click photo to fetch, so this entry stays.
 *
 * A second, independent reason it stays, found the same day: perfume-click's
 * photos are cropped flush to the product, which is the one input
 * scripts/image-box-classify.py's whole method assumes it has (a plain ground
 * to threshold away). Its `bottle-only` calls on this shop were therefore
 * measuring the file's shape and nothing else — 0 of 12 such photos in the
 * live catalogue actually showed a bottle alone when downloaded and viewed.
 * The classifier now degrades those to `unsure` (see its own docstring), but
 * this rule is what has been holding the line in the meantime, and it is what
 * still holds it for the two of those 12 whose near-white product leaves a
 * hair of margin and so keeps a `bottle-only` call.
 *
 * What this list is NOT is the shape of the problem. Measuring the 15,707
 * photos held in .image-box-cache found 175 under the floor above, and only
 * 13 of them were perfume-click's; 104 were justmylook's. That is precisely
 * why the size question moved to the photo — see isTooSmallToSwapTo below.
 */
export const THUMBNAIL_IMAGE_RETAILERS: ReadonlySet<string> = new Set(['perfume-click']);

/**
 * Too small to be worth displacing another photo with.
 *
 * Asked of the PHOTO where the sweep has measured it, and only of the shop
 * where it has not. The per-retailer rule was always a stand-in for the real
 * question — scripts/image-box-check.ts downloads every photo it classifies,
 * so the pixels were knowable per photo all along — and it is a coarse one in
 * both directions: it condemns every perfume-click photo without looking, and
 * it lets a genuinely small photo from any other shop through unchallenged
 * (PREFERRED_IMAGE_RETAILERS' own header records a 350x350 mybeauty-boutique
 * photo, well under the floor above, among 26 it sampled).
 *
 * The fallback is not a transitional nicety, it is the correctness condition:
 * verdict entries written before 2026-09-09 carry no size at all, so until a
 * re-sweep has filled them in this function answers from the retailer list for
 * every existing photo and nothing whatsoever changes. A missing measurement
 * is never read as "big enough".
 *
 * ── A measurement of an UPGRADEABLE URL is a floor, not the answer ─────────
 * 2026-09-09, and this is the subtlety the whole justmylook `_x100` upgrade
 * below turns on. Sizes in data/image-box-verdicts.json are keyed on the URL
 * as STORED, and measure the file that URL returns. But the site does not
 * request the stored URL — it requests upgradeImageResolution(storedUrl), and
 * where those differ the recorded number describes a request this project no
 * longer makes. justmylook's 104 `_x100` URLs are exactly that case: the
 * stored URL really is 100x100, and the URL actually displayed really is
 * 1000x1000 (measured on all 104, see upgradeImageResolution).
 *
 * The obvious repair — look the size up on the upgraded URL, fall back to the
 * stored one — does not work, and it is worth writing down why so nobody
 * re-attempts it: the sweep only ever downloads STORED URLs, so an upgraded
 * URL is never a key in that map, the fallback always fires, and the 100x100
 * blocks the very swap the upgrade exists to enable.
 *
 * What is true instead is a one-sided fact. Both upgrades this file performs
 * only ever ask a resize service for MORE pixels, and neither service
 * upscales past the source file — so the stored measurement is a lower bound
 * on what will be displayed, never an upper one. A lower bound can prove a
 * photo big enough; it can never prove one too small. So:
 *
 *   - stored URL === displayed URL: the measurement is exact, and answers
 *     both ways. This is every non-upgradeable photo, i.e. almost all of them.
 *   - they differ, and the measurement already clears the floor: still a
 *     definite "big enough" — the upgrade cannot have made it smaller.
 *   - they differ, and it does not clear the floor: genuinely unknown. Treated
 *     exactly like a photo nobody has measured, which is what it is, and falls
 *     through to the retailer list below.
 *
 * That last branch is what lets justmylook's upgraded photos through
 * (justmylook is not a THUMBNAIL_IMAGE_RETAILER), and it leaves the Shopify
 * `width=` path exactly where it was: those files measure 2000x2000 and
 * clear the floor on the first branch.
 */
function isTooSmallToSwapTo(offer: ImageCandidate, dimensions: ImageDimensionsByUrl | undefined): boolean {
  const measured = offer.imageUrl === null ? undefined : dimensions?.get(offer.imageUrl);
  if (measured) {
    if (Math.max(measured.width, measured.height) >= MIN_SWAPPABLE_LONG_EDGE) return false;
    // Below the floor, and only conclusive when the measured URL is the one
    // that will actually be requested. See the header above.
    if (upgradeImageResolution(offer.imageUrl) === offer.imageUrl) return true;
  }
  return THUMBNAIL_IMAGE_RETAILERS.has(offer.retailerId);
}

function isVerifiedBoxed(imageUrl: string | null, verdicts: ImageBoxVerdicts | undefined): boolean {
  if (imageUrl === null || !verdicts) return false;
  return verdicts.get(imageUrl) === 'boxed';
}

/**
 * The checker looked at this exact photo and said it shows the bottle alone.
 *
 * Kept apart from "not boxed", which is a much weaker claim covering three
 * different situations: a confirmed bottle, a photo the checker could not
 * read, and a photo nobody has looked at. Only the first is evidence.
 */
function isVerifiedBottleOnly(imageUrl: string | null, verdicts: ImageBoxVerdicts | undefined): boolean {
  if (imageUrl === null || !verdicts) return false;
  return verdicts.get(imageUrl) === 'bottle-only';
}

/**
 * The checker looked and could not tell — a silhouette right on the boundary
 * between the two shapes (see BOXED_ASPECT/BOTTLE_ASPECT in
 * scripts/image-box-classify.py).
 *
 * Distinct from a photo with no verdict at all, and the distinction is what
 * the rule below turns on: an unchecked photo may well be a perfect bottle
 * shot nobody has got to yet, while an `unsure` one is a photo that has had
 * its turn and failed to convince. When a *confirmed* bottle-only shot of the
 * same product is available, the unsure one has nothing left to offer.
 */
function isUnsure(imageUrl: string | null, verdicts: ImageBoxVerdicts | undefined): boolean {
  if (imageUrl === null || !verdicts) return false;
  return verdicts.get(imageUrl) === 'unsure';
}

/**
 * Retailers whose product photo, when they have one, was actually looked at
 * — not assumed — and shows a bottle-only, face-on shot (no box) often
 * enough to prefer over a fresher photo from an unranked source.
 *
 * The owner believed The Beauty Store UK and Beautybase both "always" have
 * this shot first. Twenty photos were downloaded from each shop's stored
 * catalogue and viewed directly (sample recorded 2026-09-01):
 *
 *   - beautybase: 14 of 18 fragrance photos were bottle-only, no box (78%).
 *     Not "always", but a clear enough majority to rank.
 *   - the-beauty-store-uk: only 4 of 15 fragrance photos were bottle-only —
 *     most (11/15) showed the box standing beside the bottle. The premise
 *     does not hold here. It also cannot matter: this retailer carries no
 *     `imageBasis` (its Awin application was rejected and no other basis was
 *     ever read — see that entry's own comment in retailers.ts), so
 *     IMAGE_ALLOWED already excludes every one of its photos before this
 *     list is ever consulted. Adding it here would change nothing — it is
 *     never reached.
 *
 * ORDER matters — earlier wins a tie — and the list's own note used to say
 * the ordering was untested "until a second retailer clears the same bar: a
 * real sample, viewed, majority bottle-only. Do not add one on the strength
 * of its name or the owner's impression of it."
 *
 * ── 2026-09-02: fragrance-click added, ahead of beautybase, on licence ──────
 * A second retailer now clears that bar, and it is ranked first for a reason
 * that is not about photography at all.
 *
 * THE PROBLEM. Of the 14 retailers this project may show photos from
 * (IMAGE_ALLOWED in scripts/build-demo-catalogue.ts, i.e. those with any
 * `imageBasis` at all), thirteen carry `hotlink-unlicensed` — explicitly not
 * a licence, just a note that the image is hot-linked from the shop's own
 * server with no permission read. Exactly one carries a stronger basis:
 * fragrance-click, `affiliate-terms`. None carries `own-storefront`. Measured
 * against the 2026-09-02 catalogue, beautybase alone supplies the displayed
 * photo for 2,727 products, every one of them on that unlicensed footing.
 *
 * WHAT IS ACTUALLY AVAILABLE. Of those 2,727, only 265 — 9.7% — have a
 * fragrance-click photo to move to. The other 1,537 that have any alternative
 * at all have it only from another `hotlink-unlicensed` shop, which trades one
 * unlicensed hotlink for another and reduces nothing. So the honest ceiling on
 * this exposure is about a tenth of it, and that ceiling is the whole
 * available population rather than a first instalment: there is no second
 * licensed source to find.
 *
 * WHETHER THE PHOTOS ARE COMPARABLE, checked the way this list requires and
 * not assumed. Ten fragrance-click photos were downloaded from the products
 * that would actually move and viewed directly (Azzaro Wanted and Wanted By
 * Night, CK Sheer Beauty, Carolina Herrera Good Girl Blush, Clinique Happy,
 * Estée Lauder Youth Dew, Armani My Way, Givenchy Gentleman, Gucci Bloom,
 * Gucci Flora Gorgeous Magnolia). All ten are bottle-only, face-on, on a plain
 * white ground, with no box — 10 of 10, against beautybase's measured 14 of 18.
 * Comparable is an understatement; on this sample it is the better shot.
 *
 * SO IT GOES FIRST. The tie-break here is licence, not freshness or framing:
 * where both shops have a usable photo of the same bottle, the one this
 * project has a stated basis for wins. Measured effect on the live catalogue:
 * 276 products change photo, 265 of them off beautybase (2,727 -> 2,462) and
 * 11 off three other unlicensed shops, with fragrance-click going 441 -> 717.
 * Every one of the 276 moves from `hotlink-unlicensed` to `affiliate-terms`.
 * Nothing moves the other way.
 *
 * The bar for a third entry was unchanged through 2026-09-02: a real sample,
 * downloaded and viewed, majority bottle-only. A stronger `imageBasis` is a
 * reason to rank a shop ABOVE another that already qualifies — it is not a
 * reason to add one whose photography has never been looked at.
 *
 * ── 2026-09-03: mybeauty-boutique added third; emirates-oud sampled and rejected ──
 * The two biggest unsampled photo suppliers, both `hotlink-unlicensed` like
 * beautybase — no licensing question, only the photography question the bar
 * above asks. Both were actually sampled, downloaded and viewed for the
 * first time this pass, joined against the live catalogue via CRAWLED (not
 * the raw feed's own `ean` field, which is null on every listing either shop
 * publishes — these two are matched into catalogue products by title, not
 * barcode, so the feed's own EAN column has nothing to join on).
 *
 * mybeauty-boutique: pool of 2,311 products where its photo differs from
 * what is currently shown. 16 sampled evenly across that pool and viewed
 * directly (Cocoa Morado, Lovely, I Want Choo, DKNY Be Tempted, Silver
 * Scent, Impact Spark, Private Key, Chloé Rose Tangerine, My Passion, La
 * Rochelle, Lalique Amethyst, 4711 among them): 10 of 16 bottle-only,
 * face-on, no box (62.5%).
 *
 * That figure was then checked against a SECOND, independently drawn sample
 * of 10 (Club de Nuit Bling, Lempicka Homme, Eternity Cologne, Patou
 * Vacances, Moschino Funny, This Is Her! Undressed, La Panthère, Stronger
 * With You, Rumeur 2 Rose, Olympéa Flora), spread across the same pool but
 * chosen without reference to the first: 5 of 10 — exactly half, not a
 * majority. Pooled across both samples the honest figure is 15 of 26
 * (57.7%), and that is the number to trust: a real majority, but a thin one,
 * and well short of beautybase's 78%. Recorded here rather than quietly
 * keeping the flattering half, because a later reader deciding whether to
 * promote this shop needs the spread, not the best run.
 *
 * Resolution, measured on all 26 downloads: 191x500 up to 2312x2560. Nearly
 * all sit far above the ~400px floor this site's grid and detail views need,
 * but not every one — Moschino Funny came back 350x350, so the earlier
 * "every long edge at least 500px" was too strong. One in 26 under the floor
 * is a tolerable rate, not a clean sweep.
 *
 * Ranked THIRD on that evidence, and the ordering is what makes a 57.7% shop
 * safe to rank at all: it is reached only where neither fragrance-click nor
 * beautybase has a photo, and what it displaces is overwhelmingly
 * perfume-click — measured at ~26% bottle-only on thumbnail-sized files. The
 * gain is real because of what it replaces, not because this photography is
 * good. If a shop with a stronger measured rate ever appears, this one should
 * drop below it without hesitation. Its own image ages, measured
 * across all 4,475 products it supplies a photo for, are the tightest of any
 * ranked shop: every one is 10.4 hours old, a single feed-wide refresh like
 * fragrance-click's rather than beautybase's page-by-page crawl rhythm — the
 * shared 336-hour cap never binds for it either. Measured effect: 1,690
 * products change photo, 1,645 of them off perfume-click and 42 off
 * emirates-oud (the rest single digits off three smaller shops), and
 * mybeauty-boutique's own supply rises from 2,164 products (wherever it was
 * already the freshest available licensed photo, pre-ranking) to 3,854.
 * Nothing moves off fragrance-click or beautybase — both still outrank it.
 * The no-photo count is untouched at 3,036: ranking only reorders among
 * photos that already exist, it manufactures none.
 *
 * emirates-oud: pool of 314. 16 sampled evenly and viewed directly (Azzure
 * Aoud, Asad Bourbon, Al Nashama Caprice, Victoria, Club De Nuit Impériale,
 * Emeer, Faris Al Arab, Amber Oud Gold Edition, Hayaati Rose, Island Vanilla
 * Dunes, Jouri, Librae, Spirit Of Valencia, Club De Nuit Lionheart Man,
 * Karus Secret Musk, Coffee Blend): 0 of 16 bottle-only. Every single one
 * shows the retail box standing beside the bottle — worse than
 * the-beauty-store-uk's already-disqualifying 4/15, and decisive on a sample
 * this size. Resolution was never the question here — every download was
 * 1080px or larger on its short edge, 1600-2400px common — the photography
 * itself fails the bar outright. Not ranked. Nothing in
 * PREFERRED_IMAGE_RETAILERS changes for emirates-oud, and this file records
 * the finding for the same reason the-beauty-store-uk's and perfume-click's
 * rejections are recorded here: so a future pass does not re-spend the time
 * re-discovering it.
 *
 * The bar for a fourth entry is unchanged: a real sample, downloaded and
 * viewed, majority bottle-only, at a resolution that will not read as
 * upscaled on this site's own image sizes.
 *
 * ── 2026-09-03: "pick among a shop's several photos" investigated, and killed ──
 * The idea: shops usually publish more than one product photo, so instead of
 * ranking whole retailers, pick a bottle-only shot from among each listing's
 * own several. Checked against real harvested data before writing a line of
 * selection logic, as it should be: every listing in every one of the 14
 * IMAGE_ALLOWED shops' `data/catalogue/*.json` files carries exactly one
 * image-shaped field — a scalar `imageUrl`, string or null, nothing else
 * named image/photo/gallery/picture/thumb/media anywhere in the schema, and
 * no shop's `description` field smuggles a second photo URL either (checked
 * across all 14; the two matches found were noise, not a real second image).
 * The reason traces to src/catalogue/jsonld.ts's own `imageUrl()`, which
 * already discards every entry but the first when a page's schema.org
 * `image` property is an array — and even that branch turned out to be
 * defensive: live JSON-LD pulled from beautybase and allbeauty product pages
 * both publish `image` as a single string, not an array, so there was
 * nothing multi-valued to keep even at the source. There is exactly one
 * photo per listing throughout this pipeline, not several we were only
 * showing one of. Idea dead in its current form; no code follows from it.
 * (What DID follow from checking is the resolution finding below —
 * upgradeImageResolution() — found while running this investigation down.)
 */
export const PREFERRED_IMAGE_RETAILERS = ['fragrance-click', 'beautybase', 'mybeauty-boutique'];

/**
 * How much older a preferred retailer's photo may be than the freshest
 * available licensed photo before freshness overrides the preference.
 *
 * This reconciles the two policies rather than letting one replace the
 * other: ranking beautybase above every other source unconditionally would
 * occasionally serve a genuinely stale photo when a fresher, perfectly good
 * one from another licensed shop was sitting right there. So prefer the
 * ranked shop's bottle-only photo, but only within reach of its own normal
 * rhythm.
 *
 * "Normal rhythm" is measured, not guessed: beautybase's own image ages in
 * the 2026-09-01 snapshot ran median 177h (~7.4 days), 90th percentile 214h
 * (~8.9 days), oldest 732h (~30.5 days) — in the same range this registry's
 * own beautybase entry already recorded for price staleness (median 47.3h,
 * up to 265h at the 90th). 336h (14 days) sits a full week past that 90th
 * percentile, so a beautybase photo refreshed on its usual schedule is
 * always preferred outright, and only the stale tail — the crawl having
 * missed this listing for several cycles running — falls back to whichever
 * licensed offer is actually freshest.
 *
 * One threshold serves both ranked retailers, and it is worth saying why that
 * is safe rather than merely convenient. fragrance-click's rhythm is not
 * beautybase's; it is far tighter. Its photos arrive through an Awin product
 * feed rather than a page crawl, so they refresh wholesale — measured on the
 * 2026-09-02 catalogue, all 717 of its images share one age, 10.3 hours, and
 * not one is near this cap. The threshold therefore never binds for that shop
 * today. It is here so that a feed which stops syncing eventually stops being
 * preferred, rather than going on serving a photo of a bottle that may no
 * longer be the one on sale.
 */
export const PREFERRED_IMAGE_MAX_AGE_HOURS = 336;

/**
 * Picks the product-level photo from whichever licensed offer has one.
 *
 * The ranked retailers (see PREFERRED_IMAGE_RETAILERS above) are tried in
 * order, each one taken only if its photo is not stale by the shared standard
 * above; once none of them offers a fresh enough photo, the freshest licensed
 * photo wins instead, most recently fetched first — a stale licensed photo is
 * worse than none, so freshness is still the fallback.
 *
 * Callers are trusted to have already applied the licensing gate (see
 * IMAGE_ALLOWED in build-demo-catalogue.ts): this function ranks and dates
 * whatever `imageUrl`s it is handed, and does not itself decide whether a
 * retailer's photography may be shown at all.
 *
 * ── `imageBoxVerdicts` (2026-09-06): a verified box-beside-bottle photo loses
 * its place, at both tiers ────────────────────────────────────────────────
 * PREFERRED_IMAGE_RETAILERS' own header already says mybeauty-boutique and
 * beautybase are majority bottle-only, not unanimously — scripts/image-box-
 * check.ts downloads and classifies individual photos, and this is where
 * that verdict actually changes anything.
 *
 * A preferred retailer's offer whose `imageUrl` the verdict map calls
 * `boxed` is treated exactly like a stale one at that tier: skipped, so the
 * next ranked retailer gets a turn instead of this one winning on rank
 * alone. And the point of a demotion is to lose to something better, not
 * merely to change *why* the same photo wins — so the freshness fallback
 * below is boxed-aware too: it prefers the freshest offer among whichever
 * licensed offers are NOT confirmed boxed, and only reaches for a boxed one
 * when every licensed offer is. Skipping the preferred tier alone would not
 * have been enough on its own: a boxed photo that also happens to be the
 * single freshest licensed offer would otherwise win the fallback despite a
 * perfectly good, merely-less-fresh alternative sitting right there.
 *
 * Either way, a boxed photo is never discarded outright — a product with
 * only a boxed photo still gets that photo back, because a boxed photo is
 * worse than a bottle-only one but still better than no photo at all.
 *
 * ── `unsure` gives way to a confirmed bottle, and only to that (2026-09-08) ─
 * The reported photo was Azzure Aoud: Emirates Oud's shot shows the box, the
 * checker scored it 0.5 — the exact midpoint between the two shapes — and
 * called it `unsure`, so it kept the top-ranked slot while Beauty Base,
 * Manchester Ouds and Justmylook each had a photo the checker had confirmed
 * shows the bottle alone. Nothing here was broken; the demotion simply had
 * nothing to say about a verdict that is not `boxed`.
 *
 * It does now, but only in the one direction the evidence supports: an
 * `unsure` photo loses its place to a *confirmed* `bottle-only` one, at both
 * tiers, and never to anything weaker. The asymmetry is the point. `unsure`
 * means this photo has been looked at and failed to convince, so a photo that
 * has been looked at and did convince is strictly better evidence. A photo
 * with no verdict at all is a different thing — nobody has looked yet, and it
 * may well be the best shot on the product — so it keeps its place exactly as
 * before, which is also what keeps fragrance-click's deliberately unswept
 * feed (see SKIP_RETAILERS in scripts/image-box-check.ts) where it is.
 *
 * Held to the same too-small rule as the boxed demotion, for the same measured
 * reason: a sharp maybe-boxed photo beats a 195x130 blur, so the replacement
 * has to come from a full-sized source or the unsure photo stays.
 *
 * ── `imageDimensions` (2026-09-09): "too small to swap to" is now asked of the
 * photo, not of the shop ───────────────────────────────────────────────────
 * Every "is this a thumbnail" test below used to read THUMBNAIL_IMAGE_RETAILERS
 * directly. They now go through isTooSmallToSwapTo(), which prefers the real
 * measured size when the sweep has recorded one and falls back to that
 * retailer list when it has not. Purely additive, and inert until a re-sweep
 * writes sizes: no existing verdict entry carries one, so on today's data
 * every one of these calls still resolves through the retailer list to exactly
 * the answer it gave before.
 */
export function pickImage(
  offers: readonly ImageCandidate[],
  now: Date,
  imageBoxVerdicts?: ImageBoxVerdicts,
  imageDimensions?: ImageDimensionsByUrl,
): string | null {
  const licensed = offers.filter((o) => o.imageUrl !== null);
  if (licensed.length === 0) return null;

  // Whether this product has a photo the checker confirmed shows the bottle
  // alone, from a source whose files are big enough to be worth swapping to.
  // Computed once: both tiers below ask the same question of the same offers.
  const confirmedBottleAvailable = licensed.some(
    (o) => isVerifiedBottleOnly(o.imageUrl, imageBoxVerdicts) && !isTooSmallToSwapTo(o, imageDimensions),
  );

  for (const retailerId of PREFERRED_IMAGE_RETAILERS) {
    const preferred = licensed.find((o) => o.retailerId === retailerId);
    if (!preferred) continue;
    if (isVerifiedBoxed(preferred.imageUrl, imageBoxVerdicts)) {
      // A confirmed box-beside-bottle shot never wins this tier, no matter
      // how fresh — see the header above. The next ranked retailer (or,
      // failing all of them, the freshness fallback) gets a turn instead.
      continue;
    }
    if (confirmedBottleAvailable && isUnsure(preferred.imageUrl, imageBoxVerdicts)) {
      // Looked at, and it did not convince — while a photo of the same
      // product did. Azzure Aoud is this exact case; see the header.
      continue;
    }
    const ageHours = (now.getTime() - new Date(preferred.fetchedAt).getTime()) / 3_600_000;
    if (ageHours <= PREFERRED_IMAGE_MAX_AGE_HOURS) return upgradeImageResolution(preferred.imageUrl);
    // Stale: try the next ranked retailer before giving up on the ranking.
    //
    // This was `break` while the list held one entry, where it made no
    // difference — the loop ended either way. With a ranked list it would:
    // a stale first choice would skip every other ranked shop and hand the
    // decision straight to raw freshness, which is the one outcome the
    // ranking exists to avoid. The fallback still happens, just after the
    // ranking has actually been exhausted rather than abandoned at its
    // first miss.
    continue;
  }

  // licensed.length > 0 was already checked above, so `pool` always has an
  // element. With no boxed verdict in play this is the freshness fallback
  // it always was. When a boxed photo IS what brought us here, a
  // not-confirmed-boxed offer replaces it only if it is not a thumbnail:
  // measured on the first full run (2026-09-07), 204 of the 331 photos the
  // demotion changed had swapped a sharp boxed photo for one of
  // perfume-click's files, measured 2026-09-09 at 195x130 at the very
  // largest across a 30-photo sample, which on a tile reads as a blur. A box
  // beside the bottle at full size is the better of those two, so a boxed
  // photo gives way to a bottle-only one from a real-sized source, and is
  // otherwise kept rather than replaced by something worse.
  // The same demotion the ranked tier just applied, so an unsure photo cannot
  // walk back in through the fallback as the freshest of the pool. Narrower
  // than the boxed pool below on purpose: this keeps only the *confirmed*
  // bottles rather than everything that is not unsure, because the whole
  // reason for skipping the unsure photo was that a confirmed one exists.
  if (confirmedBottleAvailable && licensed.some((o) => isUnsure(o.imageUrl, imageBoxVerdicts))) {
    const confirmed = licensed.filter(
      (o) => isVerifiedBottleOnly(o.imageUrl, imageBoxVerdicts) && !isTooSmallToSwapTo(o, imageDimensions),
    );
    const freshestConfirmed = [...confirmed].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]!;
    return upgradeImageResolution(freshestConfirmed.imageUrl);
  }

  const boxedOffers = licensed.filter((o) => isVerifiedBoxed(o.imageUrl, imageBoxVerdicts));
  let pool = licensed;
  if (boxedOffers.length > 0) {
    const replacements = licensed.filter(
      (o) => !isVerifiedBoxed(o.imageUrl, imageBoxVerdicts) && !isTooSmallToSwapTo(o, imageDimensions),
    );
    // Every candidate is boxed (the thumbnail shops' photos are boxed at
    // the same rate as anyone's): keep the full-sized boxed photo over a
    // boxed thumbnail. Measured on the first run, 174 products had both
    // and, with identical harvest timestamps, the tie fell to whichever
    // offer came first — the thumbnail, more often than not.
    const fullSizedBoxed = boxedOffers.filter((o) => !isTooSmallToSwapTo(o, imageDimensions));
    pool = replacements.length > 0 ? replacements : fullSizedBoxed.length > 0 ? fullSizedBoxed : boxedOffers;
  }
  const freshest = [...pool].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]!;
  return upgradeImageResolution(freshest.imageUrl);
}

/**
 * The width this project asks a Shopify-hosted photo to be resized to, when
 * it asks at all. Not a guess: every native size actually measured while
 * investigating this (2026-09-03, see below) was at or under it, and
 * Shopify's own image service never upscales past a photo's real size — it
 * silently caps the response to whatever the source file actually is. So
 * asking for more than any of them need costs nothing and reaches whichever
 * of them needs it.
 */
const SHOPIFY_UPGRADE_WIDTH = 3000;

const SHOPIFY_CDN_WIDTH = /^(https?:\/\/[^/]*(?:cdn\.shopify\.com|\/cdn\/shop\/)[^\s]*[?&]width=)(\d+)(.*)$/;

/**
 * A Shopify CDN URL whose FILENAME carries a legacy `_x<n>` resize suffix,
 * captured as (everything before the suffix)(extension)(query string).
 *
 * Shopify's older image API encodes the requested size in the filename rather
 * than in a query parameter — `photo_x100.jpg` is a request for a 100px-tall
 * render of `photo.jpg`. Anchored to the same two Shopify markers as
 * SHOPIFY_CDN_WIDTH above, for the same reason: the suffix only means "resize
 * me" on a host that runs Shopify's image service, and on any other host it
 * could perfectly well be part of the real filename.
 */
const SHOPIFY_CDN_SIZE_SUFFIX =
  /^(https?:\/\/[^/]*(?:cdn\.shopify\.com|\/cdn\/shop\/)[^\s?]*)_x\d+(\.(?:jpe?g|png|webp|gif))(\?[^\s]*)?$/i;

/**
 * Requests the same photo at a larger size, when the stored URL is already
 * asking a Shopify CDN to shrink it and a bigger size is free for the asking.
 *
 * WHERE THIS CAME FROM. Investigating whether a shop's several product
 * photos could be picked among (2026-09-03) found no shop's harvested
 * listing carries more than one image URL in any field — see this file's
 * own commit for that finding, which killed the multi-photo idea outright.
 * But the search also turned up something smaller and safe to take: several
 * Shopify-hosted shops' own product pages already publish their photo URL
 * with a `width=` query parameter attached, and on every one of them
 * checked, that parameter asked for LESS than the file actually is —
 *
 *   - allbeauty:       stored width=1920, real file 2000x2000 (measured on
 *     the Lanvin Eclat d'Arpège listing's photo)
 *   - beautybase:      stored width=1920, real file 2000x2000 (measured on
 *     four listings' photos: Coach Cherry x2, Jimmy Choo, Lacoste L.12.12,
 *     Montblanc Legend Elixir — all four, not a cherry-picked one)
 *   - manchester-ouds: stored width=1920, real file 2048x2048 (measured on
 *     the Maroon Wish Set listing's photo)
 *
 * beautybase alone supplies the displayed photo for thousands of products
 * (see PREFERRED_IMAGE_RETAILERS' own header), so this is not a rounding
 * error — it is real pixels this project was leaving on the table on its
 * single most-used photo source. Two other shops checked the same way
 * turned up no gain to take: mybeauty-boutique's stored URLs carry no
 * `width` parameter at all and already return the native file (measured
 * 1000x1000 either way on a 4711 shower-gel listing), and fragrance-click's
 * host ignores the parameter outright — appending `?width=3000` to one of
 * its photo URLs still came back 750x750, so there is no bigger variant to
 * ask that shop for.
 *
 * Deliberately narrow: only a `width=<number>` parameter already present in
 * the URL is touched, and only on a URL that already looks like a Shopify
 * CDN link (`cdn.shopify.com`, or a shop's own domain serving through
 * `/cdn/shop/`). No parameter is ever added to a URL that lacks one — a
 * resize parameter implies a resize service on the other end, and this
 * project has only confirmed that for the shops named above, not for every
 * host that happens to look similar. A non-Shopify URL, or one with no
 * `width` parameter, is returned unchanged.
 *
 * ── 2026-09-09: the same job for Shopify's OTHER, older resize convention ──
 * The rule above reads "no parameter is ever added to a URL that lacks one".
 * That is still the rule, and this second branch does not break it: it only
 * adds `width=` to a URL that is *already* asking Shopify's image service to
 * resize the photo, just through the older filename suffix rather than a
 * query parameter. `…/photo_x100.jpg` means "render photo.jpg 100px tall".
 * The resize service is demonstrably there; only the spelling differs.
 *
 * WHAT WAS MEASURED. justmylook stores 1,974 distinct image URLs, all on
 * `www.justmylook.com/cdn/shop/…`. 1,870 of them already carry a `width=`
 * parameter and are handled by the branch above. The remaining 104 carry an
 * `_x100` filename suffix and no `width` parameter at all — the two sets are
 * disjoint, checked, 0 overlap — and every one of those 104 measured exactly
 * 100x100, which is a quarter of the 400px floor MIN_SWAPPABLE_LONG_EDGE
 * needs and reads as a visible blur on a 300px grid tile.
 *
 * All 104 were then re-requested with the suffix dropped and `width=3000`
 * added, and measured with Pillow — not a sample, the whole set, because the
 * one real hazard here is a filename that genuinely ends in `_x100`, which
 * would 404. 104 of 104 returned a real image at or above 400px: 103 at
 * 1000x1000 and one at 1056x1065. Zero failures, zero fallbacks.
 *
 * Six of the upgraded photos were then downloaded beside their originals and
 * viewed directly (CK Be, Estée Lauder Sensuous, Sabon soap bar, Clinique
 * Happy For Men, Aramis, Michael Kors Gorgeous) to confirm the upgrade
 * returns the SAME photograph and not a different shot or a placeholder: all
 * six are pixel-for-pixel the same composition, the same bottle, the same
 * crop, at ten times the resolution.
 *
 * `_x\d+` rather than `_x100` literally: the digits name the size being
 * asked for and are thrown away by the rewrite either way, so matching only
 * the one value observed today would leave an `_x200` sibling silently
 * unhandled for no benefit. Only `_x100` occurs in this project's data
 * (104 listings, no other suffix value on any retailer) — that much is
 * measured; the generalisation is of the mechanism, not of the evidence.
 *
 * This is the only non-`width=` upgrade in this file, and it stays that way
 * until another is measured the same way: exhaustively, and looked at.
 */
export function upgradeImageResolution(url: string | null): string | null {
  if (url === null) return null;

  const sized = url.match(SHOPIFY_CDN_SIZE_SUFFIX);
  if (sized) {
    // The suffix goes and `width=` replaces it. The rest of the query string
    // is kept — justmylook's URLs all carry Shopify's `?v=` cache-buster, and
    // dropping it would change which cached rendition is served — but any
    // `width` already in there is dropped first rather than duplicated. No
    // URL in this project's data has both (the 104 `_x100` URLs and the 1,870
    // `width=` ones are disjoint, counted 2026-09-09), so this is belt and
    // braces; it is here because a URL carrying both would be asking for the
    // small rendition in the filename and a large one in the query, and the
    // filename would win.
    const kept = (sized[3] ?? '')
      .replace(/^\?/, '')
      .split('&')
      .filter((p) => p !== '' && !/^width=/i.test(p));
    return `${sized[1]}${sized[2]}?${[...kept, `width=${SHOPIFY_UPGRADE_WIDTH}`].join('&')}`;
  }

  const match = url.match(SHOPIFY_CDN_WIDTH);
  if (!match) return url;
  const requested = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(requested) || requested >= SHOPIFY_UPGRADE_WIDTH) return url;
  return `${match[1]}${SHOPIFY_UPGRADE_WIDTH}${match[3]}`;
}
