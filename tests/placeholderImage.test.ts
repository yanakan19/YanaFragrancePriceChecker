import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_IMAGE_URLS,
  isPlaceholderImageUrl,
  rejectPlaceholderImage,
} from '../src/catalogue/placeholderImage.js';

/**
 * The URL pinned throughout this file is real, and is the whole reason the
 * module exists: Awin's own "No image available" graphic, downloaded
 * 2026-09-09 and opened — a 70x70 GIF, 959 bytes, a grey camera outline over
 * that wording. It was stored as the `imageUrl` of 1,237 of the 11,639
 * listings in data/catalogue/perfume-click.json, and was the *displayed*
 * product photo for 348 of the 12,871 catalogue products that had one.
 *
 * It is spelled out here rather than referred to through the exported set, so
 * that a change to that set has to change this test too. Silently widening
 * or narrowing what counts as "not a photograph" is the failure mode worth
 * catching: too narrow and the grey icon comes back, too wide and a real
 * bottle disappears.
 */
const AWIN_NO_IMAGE = 'https://images2.productserve.com/noimage.gif';

describe('isPlaceholderImageUrl', () => {
  it("recognises Awin's noimage.gif, the one placeholder actually found in this data", () => {
    expect(isPlaceholderImageUrl(AWIN_NO_IMAGE)).toBe(true);
  });

  it('folds case and trims, because a feed cell may carry either', () => {
    expect(isPlaceholderImageUrl(`  ${AWIN_NO_IMAGE.toUpperCase()}  `)).toBe(true);
  });

  it('treats a missing URL as absent, not as a placeholder', () => {
    // "no photo" is what this module CONVERTS a placeholder into, so the two
    // must not be conflated in the other direction — every caller already
    // handles null, and reporting null as a placeholder would make the
    // counts this module is judged by meaningless.
    expect(isPlaceholderImageUrl(null)).toBe(false);
    expect(isPlaceholderImageUrl(undefined)).toBe(false);
    expect(isPlaceholderImageUrl('')).toBe(false);
  });

  it('leaves a real retailer photo alone', () => {
    // A genuine perfume-click photo, from data/catalogue/perfume-click.json —
    // same shop, same feed, same host family as the placeholder above.
    expect(
      isPlaceholderImageUrl('https://images.bgstatic.net/products/12345_ml.jpg'),
    ).toBe(false);
  });

  it('does NOT match on the word "noimage" appearing in some other URL', () => {
    // Matching is by exact URL on purpose (see the module header): a filename
    // containing "noimage" is weak evidence, and a pattern rule here could
    // blank a real photograph. If a second placeholder ever turns up it gets
    // downloaded, looked at, and added to the list by hand.
    expect(isPlaceholderImageUrl('https://cdn.example.test/brand-noimage-collection.jpg')).toBe(false);
    expect(isPlaceholderImageUrl('https://images2.productserve.com/noimage.gif.jpg')).toBe(false);
  });

  it('does not match a different host serving the same filename', () => {
    // Awin numbers its image hosts (images1/images2/images3). Only images2
    // appears in this project's data — 1,237 listings, 0 elsewhere — so only
    // images2 is on the list, and this test states that limitation out loud
    // rather than leaving a future reader to discover it.
    expect(isPlaceholderImageUrl('https://images3.productserve.com/noimage.gif')).toBe(false);
  });
});

describe('rejectPlaceholderImage', () => {
  it('turns a placeholder into no photo at all', () => {
    // The owner's decision, 2026-09-09: a product with no photo is the
    // correct outcome. demo/photo.ts already draws the site's own fallback
    // for a null image, and showing nothing beats showing a grey camera icon.
    expect(rejectPlaceholderImage(AWIN_NO_IMAGE)).toBeNull();
  });

  it('passes a real photo through unchanged, byte for byte', () => {
    const real = 'https://images.bgstatic.net/products/12345_ml.jpg';
    expect(rejectPlaceholderImage(real)).toBe(real);
  });

  it('passes an already-null image through as null', () => {
    expect(rejectPlaceholderImage(null)).toBeNull();
    expect(rejectPlaceholderImage(undefined)).toBeNull();
  });

  it('does not normalise the URL it keeps', () => {
    // Verdicts in data/image-box-verdicts.json and the sizes beside them are
    // keyed on the URL exactly as stored. A rejection filter that lower-cased
    // or trimmed the URLs it lets through would silently break every one of
    // those lookups, so it returns the original string, not the folded form
    // it compared with.
    const oddButReal = 'https://IMG.example.test/Bottle.JPG';
    expect(rejectPlaceholderImage(oddButReal)).toBe(oddButReal);
  });
});

describe('PLACEHOLDER_IMAGE_URLS', () => {
  it('holds only URLs that have actually been downloaded and looked at', () => {
    // One entry today. This assertion is not about the number — it is a
    // tripwire: adding an entry means adding the evidence for it to the
    // module header, the way the existing entry records its 70x70 grey
    // camera icon. Update this test alongside, deliberately.
    expect([...PLACEHOLDER_IMAGE_URLS]).toEqual([AWIN_NO_IMAGE]);
  });

  it('is stored lower-cased, since that is the form lookups compare against', () => {
    for (const url of PLACEHOLDER_IMAGE_URLS) expect(url).toBe(url.toLowerCase());
  });
});
