import { rejectPlaceholderImage } from '../src/catalogue/placeholderImage.js';

/**
 * Why a tile has no photo: the question behind the owner's report of
 * 2026-10-05 ("many tiles show NO IMAGE AVAILABLE"), answered the same way
 * every time by scripts/photo-coverage.ts.
 *
 * A product shows a photo only when some offer of it carries an image URL that
 * is stored, is not a feed's placeholder graphic, and belongs to a shop whose
 * registry entry records an `imageBasis` (IMAGE_ALLOWED in
 * scripts/build-demo-catalogue.ts), or is a house's own photo of its own
 * bottle. So an offer without a photo is exactly one of three things, and the
 * three call for different remedies:
 *
 *   no-image-url      the shop gave none (an empty Shopify `images[]`, a feed
 *                     row with no image column). Nothing to read.
 *   placeholder       the shop gave its platform's "no image" graphic, which
 *                     is rejected as if it had given none.
 *   shop-not-allowed  an image is stored and would load, but the shop has no
 *                     `imageBasis`. Only a licence, an affiliate creative term
 *                     that was read, or the owner's decision changes this.
 */
export type OfferPhotoState = 'has-photo' | 'no-image-url' | 'placeholder' | 'shop-not-allowed';

/**
 * The state of one offer's photo, from the URL its listing stored and whether
 * its shop may show photos.
 */
export function offerPhotoState(storedImageUrl: string | null | undefined, shopMayShowPhotos: boolean): OfferPhotoState {
  if (!storedImageUrl) return 'no-image-url';
  if (rejectPlaceholderImage(storedImageUrl) === null) return 'placeholder';
  return shopMayShowPhotos ? 'has-photo' : 'shop-not-allowed';
}

/**
 * Why a product that shows no photo shows none, from the states of all of its
 * offers: the first of these that any offer is in, in order of how much could
 * be done about it. A product with no offers is never in the catalogue.
 */
export function productNoPhotoReason(states: readonly OfferPhotoState[]): Exclude<OfferPhotoState, 'has-photo'> {
  if (states.includes('shop-not-allowed')) return 'shop-not-allowed';
  if (states.includes('placeholder')) return 'placeholder';
  return 'no-image-url';
}
