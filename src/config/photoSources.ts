/**
 * Where a better product photo can come from, and whether each source is on.
 *
 * A photo in data/better-photos.json names the source that found it. The page
 * build (scripts/build-demo-catalogue.ts) uses a record only while its source
 * is `enabled: true` here and the shop it belongs to still has an `imageBasis`
 * in src/config/retailers.ts, so one source is switched off by setting its
 * `enabled` to false and rebuilding: the products it served go back to the
 * photo their shops' feeds give, with nothing to delete in the data file.
 *
 * Every source here shows a shop's own picture of its own listing, hot linked
 * from the shop's own image host (docs/DECISIONS.md D24, D25). No source is a
 * search engine, another shop's page for the same product or a brand site: see
 * D25 for what was measured and why they are not here.
 */
export interface PhotoSource {
  /** Off means the build ignores every record of this source. */
  enabled: boolean;
  /** The shop whose own page or image host the photo comes from. */
  retailerId: string;
  /** One line for people: what the source reads. */
  reads: string;
}

export const PHOTO_SOURCES = {
  'perfume-click-page': {
    enabled: true,
    retailerId: 'perfume-click',
    reads: "the picture in the box of the shop's own product page (merchantUrl), robots.txt respected",
  },
} as const satisfies Record<string, PhotoSource>;

export type PhotoSourceId = keyof typeof PHOTO_SOURCES;

export function isPhotoSourceId(id: string): id is PhotoSourceId {
  return Object.prototype.hasOwnProperty.call(PHOTO_SOURCES, id);
}
