import { PHOTO_SOURCES, isPhotoSourceId } from '../config/photoSources.js';

/**
 * data/better-photos.json: a bigger picture found for one shop listing, and
 * where it came from.
 *
 * Written by scripts/better-photos.ts, read by scripts/build-demo-catalogue.ts.
 * It is keyed by `<retailerId>:<retailerSku>`, the listing's own identity in
 * data/catalogue, so a product that merges, splits or renames keeps its photo.
 * A record names the feed image it was found for (`feedImage`, null when the
 * feed gave none): when the feed's image changes the record no longer applies,
 * because the shop has published a new picture of its own and that one wins.
 */
export interface BetterPhoto {
  /** The picture to show. Always on the shop's own image host, hot linked, never copied. */
  url: string;
  width: number;
  height: number;
  /** A key of PHOTO_SOURCES (src/config/photoSources.ts). Switching that source off ignores this record. */
  source: string;
  /** The address of the page the picture was read from, kept so a person can open it. */
  page: string;
  /** The image the feed gave for this listing when the record was made; null for none. */
  feedImage: string | null;
  checkedAt: string;
}

export interface BetterPhotosFile {
  /** Free text for people: how to read this file. */
  about: string;
  photos: Record<string, BetterPhoto>;
}

export const BETTER_PHOTOS_ABOUT =
  'Bigger shop pictures found by scripts/better-photos.ts, keyed by retailerId:retailerSku. ' +
  'A source is switched off in src/config/photoSources.ts. Hot linked only; nothing is copied.';

export function betterPhotoKey(retailerId: string, retailerSku: string): string {
  return `${retailerId}:${retailerSku}`;
}

/**
 * The picture to use for a listing instead of the feed's, or null for none.
 *
 * `mayShow` is the page's own gate (a shop with an `imageBasis`); a record of a
 * shop that has lost it is ignored, as is a record of a source that is switched
 * off, whose shop is not the listing's shop, or that was made for another feed
 * image than the one the listing carries now.
 */
export function betterPhotoFor(
  photos: Readonly<Record<string, BetterPhoto>>,
  retailerId: string,
  retailerSku: string,
  feedImage: string | null,
  mayShow: (retailerId: string) => boolean,
): BetterPhoto | null {
  const rec = photos[betterPhotoKey(retailerId, retailerSku)];
  if (!rec) return null;
  if (!isPhotoSourceId(rec.source)) return null;
  const source = PHOTO_SOURCES[rec.source];
  if (!source.enabled || source.retailerId !== retailerId) return null;
  if (!mayShow(retailerId)) return null;
  if ((rec.feedImage ?? null) !== (feedImage ?? null)) return null;
  return rec;
}
