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
 * The bar for a third entry is unchanged and still applies: a real sample,
 * downloaded and viewed, majority bottle-only. A stronger `imageBasis` is a
 * reason to rank a shop ABOVE another that already qualifies — it is not a
 * reason to add one whose photography has never been looked at.
 */
export const PREFERRED_IMAGE_RETAILERS = ['fragrance-click', 'beautybase'];

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
 */
export function pickImage(offers: readonly ImageCandidate[], now: Date): string | null {
  const licensed = offers.filter((o) => o.imageUrl !== null);
  if (licensed.length === 0) return null;

  for (const retailerId of PREFERRED_IMAGE_RETAILERS) {
    const preferred = licensed.find((o) => o.retailerId === retailerId);
    if (!preferred) continue;
    const ageHours = (now.getTime() - new Date(preferred.fetchedAt).getTime()) / 3_600_000;
    if (ageHours <= PREFERRED_IMAGE_MAX_AGE_HOURS) return preferred.imageUrl;
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

  // licensed.length > 0 was already checked above, so this always has an element.
  const freshest = [...licensed].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]!;
  return freshest.imageUrl;
}
