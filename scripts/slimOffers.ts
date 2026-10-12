/**
 * The offer fields the page's data file leaves out, because no code the page
 * runs reads them (audit of 2026-10-12, docs/SITE-AUDIT-2026-10-12.md 1c).
 *
 * The generated catalogue module (demo/catalogue.generated.ts, and each
 * region's) keeps every field: tests, the social scripts, the price alerts
 * and the region builds read it. Only the JSON the bundle publishes beside
 * the page is slimmed, in scripts/bundle-demo.ts and scripts/bundle-region.ts,
 * right after the removed brands are pruned (scripts/siteBuild.ts).
 *
 *   imageUrl     a shop's own photo of its listing. The picture a tile or a
 *                product page shows is the product's `image`, chosen at build
 *                time by src/catalogue/pickImage.ts. src/services/priceService.ts
 *                copies the field into the offer row and nothing reads it there.
 *                7.2 MB of the UK file's 48.7 (30,653 of 67,205 offers repeat
 *                the product's own picture).
 *   firstSeenAt  read by src/catalogue/newBadge.ts at build time only. 2.8 MB.
 *   isNew        the module's `isNewAt` helper reads it, and nothing calls the
 *                helper, so esbuild leaves both out of the bundle. 0.9 MB.
 *
 * Measured on the UK file: 48.67 → 37.77 MB raw, 5.93 → 4.53 MB gzipped, and
 * the rendered page byte for byte the same (the audit's section 9.2).
 * tests/slimOffers.test.ts holds this list to the bundle: a field the page
 * starts reading again must leave the list, or the test fails.
 */

/** Offer fields the page never reads, dropped from the published data file. */
export const PAGE_UNREAD_OFFER_FIELDS: readonly string[] = ['imageUrl', 'firstSeenAt', 'isNew'];

/** The names of the offer literals in a catalogue module (the UK's and a region's). */
const OFFER_LITERALS = /^(CRAWLED(_CHUNK_\d+)?|OLDER_OFFERS)$/;

function isOffer(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as { retailerId?: unknown }).retailerId === 'string';
}

/**
 * A copy of one offer without the unread fields. Anything that is not an
 * offer comes back as it is.
 */
export function slimOffer<T>(offer: T): T {
  if (!isOffer(offer)) return offer;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(offer)) if (!PAGE_UNREAD_OFFER_FIELDS.includes(k)) out[k] = v;
  return out as T;
}

/**
 * A `Record<id, offer[]>` literal with every offer slimmed. A value of another
 * shape comes back untouched, so a module whose offers move to another shape
 * is published whole rather than wrongly cut.
 */
export function slimOffersBlob(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [id, offers] of Object.entries(value as Record<string, unknown>)) {
    out[id] = Array.isArray(offers) ? offers.map((o) => slimOffer(o)) : offers;
  }
  return out;
}

/**
 * Slims the offer literals a catalogue module moved to the data file, in
 * place. `names` are the literals moved, in order; `blobs[start + i]` holds
 * the i-th. Returns how many offers lost a field, for the build's report.
 */
export function slimMovedBlobs(module: string, names: readonly string[], blobs: unknown[], start: number): number {
  if (module !== 'catalogue') return 0;
  let slimmed = 0;
  names.forEach((name, i) => {
    if (!OFFER_LITERALS.test(name)) return;
    const value = blobs[start + i];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
    for (const offers of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(offers)) for (const o of offers) if (isOffer(o) && PAGE_UNREAD_OFFER_FIELDS.some((f) => f in o)) slimmed++;
    }
    blobs[start + i] = slimOffersBlob(value);
  });
  return slimmed;
}
