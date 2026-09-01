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
 * So this list holds one entry, not two. ORDER matters — earlier wins a tie
 * — but the ordering is untested until a second retailer clears the same
 * bar: a real sample, viewed, majority bottle-only. Do not add one on the
 * strength of its name or the owner's impression of it.
 */
export const PREFERRED_IMAGE_RETAILERS = ['beautybase'];

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
 */
export const PREFERRED_IMAGE_MAX_AGE_HOURS = 336;

/**
 * Picks the product-level photo from whichever licensed offer has one.
 *
 * A verified bottle-only retailer (see PREFERRED_IMAGE_RETAILERS above) wins
 * first, provided its photo is not stale by its own normal standard; failing
 * either condition, the freshest licensed photo wins instead, most recently
 * fetched first — a stale licensed photo is worse than none, so freshness is
 * still the fallback whenever no ranked retailer has a fresh enough offer.
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
    break; // this retailer's photo exists but is stale; freshness decides instead
  }

  // licensed.length > 0 was already checked above, so this always has an element.
  const freshest = [...licensed].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]!;
  return freshest.imageUrl;
}
