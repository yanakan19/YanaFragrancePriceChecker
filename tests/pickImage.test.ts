import { describe, expect, it } from 'vitest';
import {
  pickImage,
  upgradeImageResolution,
  PREFERRED_IMAGE_RETAILERS,
  PREFERRED_IMAGE_MAX_AGE_HOURS,
  THUMBNAIL_IMAGE_RETAILERS,
  type ImageCandidate,
  type ImageBoxVerdict,
  type ImageDimensions,
} from '../src/catalogue/pickImage.js';
import { RETAILERS } from '../src/config/retailers.js';

const NOW = new Date('2026-09-01T00:00:00.000Z');

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3_600_000).toISOString();
}

/** A minimally valid offer, with only the fields a test cares about overridden. */
function offer(overrides: Partial<ImageCandidate> & { retailerId: string }): ImageCandidate {
  return {
    fetchedAt: hoursAgo(1),
    imageUrl: `https://${overrides.retailerId}.example/photo.jpg`,
    ...overrides,
  };
}

describe('pickImage', () => {
  it('returns null when no offer carries a licensed image', () => {
    const offers = [
      offer({ retailerId: 'the-beauty-store-uk', imageUrl: null }),
      offer({ retailerId: 'escentual', imageUrl: null }),
    ];
    expect(pickImage(offers, NOW)).toBeNull();
  });

  it('prefers a fresh beautybase photo over a fresher photo from an unranked retailer', () => {
    const offers = [
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(48) }),
    ];
    // perfume-click's offer is fresher, but beautybase is ranked and well
    // within its normal refresh rhythm (see PREFERRED_IMAGE_MAX_AGE_HOURS),
    // so it wins the tie instead of freshness alone deciding.
    expect(pickImage(offers, NOW)).toBe('https://beautybase.example/photo.jpg');
  });

  it('falls back to the freshest licensed offer once the preferred retailer is stale', () => {
    const offers = [
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(10) }),
      offer({
        retailerId: 'beautybase',
        fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 1),
      }),
    ];
    // beautybase's own photo is older than its normal rhythm allows, so a
    // stale ranked photo does not beat a fresh unranked one — freshness
    // takes back over exactly as it did before this retailer was ranked.
    expect(pickImage(offers, NOW)).toBe('https://perfume-click.example/photo.jpg');
  });

  it('treats a beautybase photo exactly at the bound as still fresh enough', () => {
    const offers = [
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(1) }),
      offer({
        retailerId: 'beautybase',
        fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS),
      }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://beautybase.example/photo.jpg');
  });

  it('falls back to freshness when no offer is from a preferred retailer', () => {
    const offers = [
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(48) }),
      offer({ retailerId: 'justmylook', fetchedAt: hoursAgo(2) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://justmylook.example/photo.jpg');
  });

  it('ranks mybeauty-boutique behind beautybase but ahead of an unranked retailer', () => {
    // mybeauty-boutique is the third entry added 2026-09-03, on a real but
    // thinner majority (10 of 16, 62.5%) than beautybase's 78% — so it must
    // still lose to a fresh beautybase photo, and still beat a fresher photo
    // from a shop that was never sampled at all.
    const offers = [
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'mybeauty-boutique', fetchedAt: hoursAgo(2) }),
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(48) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://beautybase.example/photo.jpg');
  });

  it('falls through to mybeauty-boutique once fragrance-click and beautybase are both stale', () => {
    const offers = [
      offer({ retailerId: 'fragrance-click', fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 1) }),
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 2) }),
      offer({ retailerId: 'mybeauty-boutique', fetchedAt: hoursAgo(3) }),
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(1) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://mybeauty-boutique.example/photo.jpg');
  });

  it('falls back to freshness among licensed offers when the preferred retailer has no offer at all', () => {
    const offers = [
      offer({ retailerId: 'the-beauty-store-uk', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(5) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://the-beauty-store-uk.example/photo.jpg');
  });

  it('ignores a preferred-retailer offer that has no image, deferring to freshness', () => {
    // A stocked-but-imageless beautybase offer must not blank out the pick —
    // pickImage only ever consults offers that already cleared IMAGE_ALLOWED
    // (see that gate below), and a null imageUrl here stands in for exactly
    // that: this retailer's photo was never licensed for this offer.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: null, fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(5) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://perfume-click.example/photo.jpg');
  });

  it('holds exactly the three retailers whose photos were sampled and viewed, licence first', () => {
    // See this constant's own doc comment for all three halves. the-beauty-store-uk
    // and emirates-oud were both sampled and found majority box-and-bottle, so
    // neither belongs here regardless of size or impression. fragrance-click
    // was sampled on 2026-09-02 — ten photos downloaded from the products that
    // would actually move and viewed, ten of ten bottle-only on white — and is
    // ranked FIRST because of its licence, not its framing: it is the one
    // retailer in the whole registry carrying `affiliate-terms` rather than
    // `hotlink-unlicensed`. mybeauty-boutique was sampled on 2026-09-03 — 16
    // photos downloaded from products that would actually move and viewed, 10
    // of 16 bottle-only (62.5%) at resolutions well above this site's upscaling
    // floor — a real but thinner majority than beautybase's 78%, so it ranks
    // last of the three.
    expect(PREFERRED_IMAGE_RETAILERS).toEqual(['fragrance-click', 'beautybase', 'mybeauty-boutique']);
  });

  it('prefers the licensed retailer over the unlicensed one when both have a fresh photo', () => {
    // The whole point of the reordering: 265 products currently showing a
    // hot-linked beautybase photo have a fragrance-click photo of the same
    // bottle, and this is what moves them.
    const offers = [
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'fragrance-click', fetchedAt: hoursAgo(20) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://fragrance-click.example/photo.jpg');
  });

  it('falls through to the next ranked retailer when the first one is stale, not straight to freshness', () => {
    // The `break` this loop used to end on was harmless while the list held
    // one entry and is not harmless now: a stale first choice would skip every
    // other ranked shop and hand the decision to raw freshness, which is the
    // one outcome the ranking exists to prevent. Here beautybase's photo is
    // fresh and bottle-only, and must win over an unranked shop's fresher one.
    const offers = [
      offer({ retailerId: 'fragrance-click', fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 1) }),
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(48) }),
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(1) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://beautybase.example/photo.jpg');
  });

  it('still reaches freshness once every ranked retailer is stale', () => {
    const offers = [
      offer({ retailerId: 'fragrance-click', fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 1) }),
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 2) }),
      offer({ retailerId: 'perfume-click', fetchedAt: hoursAgo(1) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://perfume-click.example/photo.jpg');
  });

  it('leaves a product with no licensed alternative exactly where it was', () => {
    // The honest limit of this change, pinned so it is not mistaken for a
    // fix to the whole exposure: only 265 of the 2,727 beautybase-sourced
    // photos have a fragrance-click counterpart at all. The other 2,462 are
    // unchanged, and swapping them to another `hotlink-unlicensed` shop would
    // trade one unlicensed hotlink for another and reduce nothing.
    const offers = [
      offer({ retailerId: 'beautybase', fetchedAt: hoursAgo(3) }),
      offer({ retailerId: 'justmylook', fetchedAt: hoursAgo(1) }),
    ];
    expect(pickImage(offers, NOW)).toBe('https://beautybase.example/photo.jpg');
  });
});

describe('the licence ranking reflects the registry rather than a preference', () => {
  it('fragrance-click is the only image-allowed retailer with a basis stronger than a bare hotlink', () => {
    // The measurement the reordering rests on, asserted against the registry
    // itself so it fails if that ever stops being true — which is the case
    // worth knowing about, in either direction. If a second retailer gains
    // `affiliate-terms` or `own-storefront`, this ranking should be revisited;
    // if fragrance-click loses its basis, it must leave the list entirely.
    const allowed = RETAILERS.filter((r) => r.affiliate.imageBasis != null);
    const stronger = allowed.filter((r) => r.affiliate.imageBasis !== 'hotlink-unlicensed').map((r) => r.id);
    expect(stronger).toEqual(['fragrance-click']);
    expect(PREFERRED_IMAGE_RETAILERS[0]).toBe('fragrance-click');
  });
});

describe('the licensing gate still governs every retailer named in PREFERRED_IMAGE_RETAILERS', () => {
  it('every preferred retailer actually carries an imageBasis in the registry', () => {
    // A ranking that outran the licensing gate would be worse than no
    // ranking: pickImage only ever sees offers IMAGE_ALLOWED already let
    // through (see build-demo-catalogue.ts), so this is a sanity check on
    // the registry itself, not on pickImage's own logic above.
    for (const retailerId of PREFERRED_IMAGE_RETAILERS) {
      const retailer = RETAILERS.find((r) => r.id === retailerId);
      expect(retailer, `${retailerId} is not a known retailer`).toBeDefined();
      expect(
        retailer!.affiliate.imageBasis,
        `${retailerId} is in PREFERRED_IMAGE_RETAILERS but carries no imageBasis, so ` +
          `IMAGE_ALLOWED would exclude its photos before pickImage ever sees them`,
      ).toBeDefined();
    }
  });

  it('the-beauty-store-uk — the other shop the owner asked about — is not licensed', () => {
    // Confirms the finding this whole change rests on: the-beauty-store-uk
    // has no imageBasis (its Awin application was rejected — see that
    // entry's own comment in retailers.ts), so its photos never reach
    // pickImage regardless of how good they look, and it must never appear
    // in PREFERRED_IMAGE_RETAILERS.
    const retailer = RETAILERS.find((r) => r.id === 'the-beauty-store-uk');
    expect(retailer).toBeDefined();
    expect(retailer!.affiliate.imageBasis).toBeUndefined();
    expect(PREFERRED_IMAGE_RETAILERS).not.toContain('the-beauty-store-uk');
  });
});

describe('upgradeImageResolution', () => {
  // Real URLs, real measured native sizes (2026-09-03) — see this function's
  // own doc comment in pickImage.ts for how each was checked.
  it('bumps a beautybase width parameter up to the upgrade width', () => {
    expect(
      upgradeImageResolution(
        'https://www.beautybase.com/cdn/shop/files/Coach_Cherry_30ml_1.jpg?v=1778147740&width=1920',
      ),
    ).toBe('https://www.beautybase.com/cdn/shop/files/Coach_Cherry_30ml_1.jpg?v=1778147740&width=3000');
  });

  it('bumps an allbeauty width parameter the same way', () => {
    expect(upgradeImageResolution('https://allbeauty.com/cdn/shop/files/5608.jpg?v=1766138711&width=1920')).toBe(
      'https://allbeauty.com/cdn/shop/files/5608.jpg?v=1766138711&width=3000',
    );
  });

  it('bumps a manchester-ouds width parameter the same way', () => {
    expect(
      upgradeImageResolution(
        'https://manchesterouds.com/cdn/shop/files/maroon-wish-set-3x75ml-ibrahim-al-qurashi-ibraq-5833834.webp?v=1784480613&width=1920',
      ),
    ).toBe(
      'https://manchesterouds.com/cdn/shop/files/maroon-wish-set-3x75ml-ibrahim-al-qurashi-ibraq-5833834.webp?v=1784480613&width=3000',
    );
  });

  it('leaves a Shopify CDN URL with no width parameter alone', () => {
    // mybeauty-boutique's stored URLs are exactly this shape and already
    // return the native file — measured 1000x1000 either way on a real
    // download, so there is nothing to add a parameter for.
    const url = 'https://cdn.shopify.com/s/files/1/0621/6541/8121/files/613cHTxqsgL.jpg?v=1709545694';
    expect(upgradeImageResolution(url)).toBe(url);
  });

  it('leaves a non-Shopify URL alone even if it happens to carry a width parameter', () => {
    // fragrance-click's own host ignores this parameter outright (measured:
    // appending ?width=3000 to a real photo URL still came back 750x750) —
    // and more importantly, this project has only confirmed the resize
    // behaviour for a Shopify CDN, not for every host in general.
    const url = 'https://www.fragranceclick.co.uk/media/catalog/product/8/5/85715163035_bottle.jpg?width=100';
    expect(upgradeImageResolution(url)).toBe(url);
  });

  it('never lowers a width parameter that already meets or exceeds the upgrade width', () => {
    const url = 'https://cdn.shopify.com/s/files/1/x/y.jpg?width=4000';
    expect(upgradeImageResolution(url)).toBe(url);
  });

  it('passes null through unchanged', () => {
    expect(upgradeImageResolution(null)).toBeNull();
  });

  it('applies through pickImage itself, on the offer it actually selects', () => {
    const offers: ImageCandidate[] = [
      {
        retailerId: 'beautybase',
        imageUrl: 'https://www.beautybase.com/cdn/shop/files/x.jpg?v=1&width=1920',
        fetchedAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
      },
    ];
    expect(pickImage(offers, new Date('2026-09-01T01:00:00.000Z'))).toBe(
      'https://www.beautybase.com/cdn/shop/files/x.jpg?v=1&width=3000',
    );
  });
});

/**
 * justmylook's `_x100` thumbnails — Shopify's OTHER resize convention.
 *
 * Every URL and every size below was measured on 2026-09-09, and exhaustively
 * rather than by sample: all 104 `_x100` URLs in data/catalogue/justmylook.json
 * were requested with the suffix dropped and `width=3000` added, and all 104
 * came back at or above the 400px floor (103 at 1000x1000, one at 1056x1065).
 * Six were downloaded beside their originals and viewed to confirm the same
 * photograph comes back, not a different shot. The exhaustive check was the
 * point: the only real hazard in dropping a filename suffix is a file whose
 * name genuinely ends that way, which would 404, and zero of 104 did.
 */
describe('upgradeImageResolution — justmylook _x100 (Shopify filename size suffix)', () => {
  it('drops the suffix and asks for the upgrade width, keeping the ?v= cache-buster', () => {
    // Real stored URL; the result is the exact string that was fetched and
    // measured at 1000x1000 (the original measures 100x100).
    expect(
      upgradeImageResolution(
        'https://www.justmylook.com/cdn/shop/files/calvin-klein-be-eau-de-toilette-100ml-p20027-96604_image_x100.jpg?v=1721322156',
      ),
    ).toBe(
      'https://www.justmylook.com/cdn/shop/files/calvin-klein-be-eau-de-toilette-100ml-p20027-96604_image.jpg?v=1721322156&width=3000',
    );
  });

  it('works on a .png too, not only .jpg', () => {
    // Real stored URL; the upgraded form was fetched and measured 1000x1000.
    expect(upgradeImageResolution('https://www.justmylook.com/cdn/shop/files/EST0027_x100.png?v=1762190965')).toBe(
      'https://www.justmylook.com/cdn/shop/files/EST0027.png?v=1762190965&width=3000',
    );
  });

  it('opens a query string with ? when the URL has none', () => {
    // Constructed, not observed: all 104 real URLs carry Shopify's `?v=`.
    // Pinned because getting the separator wrong produces a URL that 404s
    // rather than one that merely fails to upgrade.
    expect(upgradeImageResolution('https://www.justmylook.com/cdn/shop/files/plain_x100.jpg')).toBe(
      'https://www.justmylook.com/cdn/shop/files/plain.jpg?width=3000',
    );
  });

  it('replaces rather than duplicates a width parameter if a URL somehow carries both', () => {
    // No URL in this project's data has both — the 104 `_x100` URLs and the
    // 1,870 `width=` ones are disjoint, counted 2026-09-09. Pinned anyway
    // because a URL asking for the small rendition in its filename and a
    // large one in its query would be served the small one.
    expect(upgradeImageResolution('https://cdn.shopify.com/s/files/1/1/x_x100.jpg?v=1&width=100')).toBe(
      'https://cdn.shopify.com/s/files/1/1/x.jpg?v=1&width=3000',
    );
  });

  it('leaves a non-Shopify URL with the same-shaped filename completely alone', () => {
    // The suffix only means "resize me" on a host running Shopify's image
    // service. Anywhere else it may simply be part of the real filename, and
    // rewriting it would break a working photo.
    const url = 'https://example.test/photo_x100.jpg';
    expect(upgradeImageResolution(url)).toBe(url);
  });

  it('leaves perfume-click alone — its host has no resize service at all', () => {
    // Recorded in THUMBNAIL_IMAGE_RETAILERS' own header: bgstatic.net is a
    // plain GCS bucket, and 240 requests for eight suffix variants across 30
    // real URLs returned 240 misses.
    const url = 'https://bgstatic.net/photos/169259_ml.jpg';
    expect(upgradeImageResolution(url)).toBe(url);
  });

  it('does not touch a Shopify URL whose filename has no size suffix', () => {
    const url = 'https://cdn.shopify.com/s/files/1/0621/6541/8121/files/613cHTxqsgL.jpg?v=1709545694';
    expect(upgradeImageResolution(url)).toBe(url);
  });
});

/**
 * The interaction the whole `_x100` upgrade turns on, and the reason it was
 * left undone until 2026-09-09.
 *
 * Sizes in data/image-box-verdicts.json are keyed on the URL as STORED and
 * measure the file that URL returns. justmylook's `_x100` URLs really are
 * 100x100 — a quarter of MIN_SWAPPABLE_LONG_EDGE — so once those sizes are
 * backfilled, a naive size rule would refuse to swap to a photo that in fact
 * renders at 1000x1000.
 *
 * Measured consequence on the live catalogue (2026-09-09, replaying pickImage
 * over demo/catalogue.generated.ts's own CRAWLED offers): with the backfilled
 * sizes but WITHOUT the upgrade, 15 products lose their justmylook photo, 9 of
 * them onto a perfume-click thumbnail. With both landed together, none of those
 * 15 moves; they keep the same photograph at ten times the resolution.
 */
describe('a measured size describes the photo as DISPLAYED, not as stored', () => {
  function verdicts(entries: Record<string, ImageBoxVerdict>): Map<string, ImageBoxVerdict> {
    return new Map(Object.entries(entries));
  }
  function sizes(entries: Record<string, [number, number]>): Map<string, ImageDimensions> {
    return new Map(Object.entries(entries).map(([u, [width, height]]) => [u, { width, height }]));
  }

  // ── Calvin Klein Obsession For Men 75ml (ean-088300606504), a real case ──
  // One of the 15 products the backfill would otherwise have moved. Its
  // justmylook photo is stored at `_x100` and measures 100x100; beautybase
  // has a boxed photo of the same bottle.
  const JML_X100 =
    'https://www.justmylook.com/cdn/shop/files/calvin-klein-obsession-for-men-eau-de-toilette-75ml-p30458-96634_image_x100.jpg?v=1721322164';
  const JML_UPGRADED =
    'https://www.justmylook.com/cdn/shop/files/calvin-klein-obsession-for-men-eau-de-toilette-75ml-p30458-96634_image.jpg?v=1721322164&width=3000';
  const BEAUTYBASE_BOXED = 'https://www.beautybase.com/cdn/shop/files/1757425502-63166900.jpg?v=1763398899';

  const obsessionOffers = [
    offer({ retailerId: 'beautybase', imageUrl: BEAUTYBASE_BOXED, fetchedAt: hoursAgo(5) }),
    offer({ retailerId: 'justmylook', imageUrl: JML_X100, fetchedAt: hoursAgo(1) }),
  ];
  const obsessionVerdicts = verdicts({ [BEAUTYBASE_BOXED]: 'boxed' });

  it('does not let a 100x100 measurement block a photo that is displayed at 1000x1000', () => {
    // The stored URL measures 100x100 (measured; it is one of the 104). The
    // URL actually requested measures 1000x1000 (measured). The 100 must not
    // be the number that decides.
    const d = sizes({ [JML_X100]: [100, 100], [BEAUTYBASE_BOXED]: [2000, 2000] });
    expect(pickImage(obsessionOffers, NOW, obsessionVerdicts, d)).toBe(JML_UPGRADED);
  });

  it('picks the same photo whether or not the sizes have been backfilled', () => {
    // The backfill must be inert for these products, not merely survivable.
    expect(pickImage(obsessionOffers, NOW, obsessionVerdicts)).toBe(JML_UPGRADED);
  });

  it('still trusts a measurement exactly when the stored URL is the one requested', () => {
    // The other half of the rule, and the half that must not be weakened: for
    // a URL this file does not rewrite, the measurement is exact and a small
    // photo is still refused as a replacement. Same shop, same shapes, no
    // upgradeable suffix.
    const flat = 'https://www.justmylook.com/cdn/shop/files/no-suffix.jpg?v=1&width=1920';
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: BEAUTYBASE_BOXED, fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/small.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ [BEAUTYBASE_BOXED]: 'boxed' });
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/small.jpg': [100, 100] }))).toBe(
      upgradeImageResolution(BEAUTYBASE_BOXED),
    );
    // And the same URL made upgradeable is no longer conclusively too small.
    expect(upgradeImageResolution(flat)).not.toBe(flat);
  });

  it('a measurement above the floor still decides, upgradeable or not', () => {
    // First branch of isTooSmallToSwapTo: an upgrade only ever asks for MORE
    // pixels, so a stored size that already clears 400 proves the displayed
    // photo clears it too. No need to fall back to the retailer list there.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: BEAUTYBASE_BOXED, fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/hypothetical.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ [BEAUTYBASE_BOXED]: 'boxed' });
    // perfume-click is on the retailer list, so only a real measurement can
    // let this through — and it does, because 1200x1600 is not ambiguous.
    expect(pickImage(offers, NOW, v, sizes({ 'https://bgstatic.example/hypothetical.jpg': [1200, 1600] }))).toBe(
      'https://bgstatic.example/hypothetical.jpg',
    );
  });

  it('falls back to the retailer list, not to "big enough", for an under-floor upgradeable photo', () => {
    // The third branch: measurement below the floor AND the URL will be
    // rewritten, so the number describes a request no longer made. That is
    // "unknown", which is the pre-2026-09-09 fallback — and for a shop ON the
    // thumbnail list the fallback still says no. Constructed: perfume-click's
    // host has no resize service (see the test above), so this shape does not
    // occur. It pins that the unknown branch defers to the list rather than
    // waving the photo through.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: BEAUTYBASE_BOXED, fetchedAt: hoursAgo(5) }),
      offer({
        retailerId: 'perfume-click',
        imageUrl: 'https://perfumeclick.example/cdn/shop/files/thumb_x100.jpg?v=1',
        fetchedAt: hoursAgo(1),
      }),
    ];
    const v = verdicts({ [BEAUTYBASE_BOXED]: 'boxed' });
    const d = sizes({ 'https://perfumeclick.example/cdn/shop/files/thumb_x100.jpg?v=1': [100, 100] });
    expect(pickImage(offers, NOW, v, d)).toBe(upgradeImageResolution(BEAUTYBASE_BOXED));
  });

  it('leaves the Shopify width= path exactly where it was', () => {
    // beautybase's stored `width=1920` URLs are also rewritten, so they take
    // the same branches. Their real files are 2000x2000 (measured 2026-09-03
    // on four listings), which clears the floor on the FIRST branch — nothing
    // about that shop's behaviour depends on the new fallback.
    const url = 'https://www.beautybase.com/cdn/shop/files/Coach_Cherry_30ml_1.jpg?v=1778147740&width=1920';
    const offers = [
      offer({ retailerId: 'emirates-oud', imageUrl: 'https://emirates-oud.example/boxed.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'beautybase', imageUrl: url, fetchedAt: hoursAgo(5) }),
    ];
    const v = verdicts({ 'https://emirates-oud.example/boxed.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v, sizes({ [url]: [2000, 2000] }))).toBe(
      'https://www.beautybase.com/cdn/shop/files/Coach_Cherry_30ml_1.jpg?v=1778147740&width=3000',
    );
  });

  it('verdicts are still looked up on the stored URL, never on the upgraded one', () => {
    // The half of the keying that must NOT change. A `boxed` verdict is
    // recorded against the URL the sweep downloaded; if the demotion started
    // asking about the rewritten URL it would find nothing and every boxed
    // photo would quietly walk back in.
    const boxedX100 = 'https://www.justmylook.com/cdn/shop/files/boxed_x100.jpg?v=1';
    const offers = [
      offer({ retailerId: 'justmylook', imageUrl: boxedX100, fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'emirates-oud', imageUrl: 'https://emirates-oud.example/bottle.jpg', fetchedAt: hoursAgo(5) }),
    ];
    const v = verdicts({ [boxedX100]: 'boxed', 'https://emirates-oud.example/bottle.jpg': 'bottle-only' });
    expect(pickImage(offers, NOW, v, sizes({ [boxedX100]: [100, 100] }))).toBe(
      'https://emirates-oud.example/bottle.jpg',
    );
  });
});

describe('pickImage with imageBoxVerdicts (scripts/image-box-check.ts findings)', () => {
  /** A fixture verdict map, built the way build-demo-catalogue.ts builds a real one. */
  function verdicts(entries: Record<string, ImageBoxVerdict>): Map<string, ImageBoxVerdict> {
    return new Map(Object.entries(entries));
  }

  it('demotes a boxed photo from the top-ranked preferred retailer below a bottle-only one from a lower-ranked preferred retailer', () => {
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(1) }),
      offer({
        retailerId: 'mybeauty-boutique',
        imageUrl: 'https://mybeauty-boutique.example/clean.jpg',
        fetchedAt: hoursAgo(2),
      }),
    ];
    const v = verdicts({ 'https://beautybase.example/boxed.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v)).toBe('https://mybeauty-boutique.example/clean.jpg');
  });

  it('leaves ranking untouched when the top-ranked preferred retailer\'s photo is not verified boxed', () => {
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/clean.jpg', fetchedAt: hoursAgo(1) }),
      offer({
        retailerId: 'mybeauty-boutique',
        imageUrl: 'https://mybeauty-boutique.example/clean.jpg',
        fetchedAt: hoursAgo(2),
      }),
    ];
    const v = verdicts({ 'https://beautybase.example/clean.jpg': 'bottle-only' });
    expect(pickImage(offers, NOW, v)).toBe('https://beautybase.example/clean.jpg');
  });

  it('does not demote an "unsure" verdict for an alternative nobody has looked at', () => {
    // The distinction the rule below turns on: an unchecked photo is not
    // evidence of anything, so it cannot displace one that has at least been
    // looked at, however inconclusively.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/maybe.jpg', fetchedAt: hoursAgo(1) }),
      offer({
        retailerId: 'mybeauty-boutique',
        imageUrl: 'https://mybeauty-boutique.example/clean.jpg',
        fetchedAt: hoursAgo(2),
      }),
    ];
    const v = verdicts({ 'https://beautybase.example/maybe.jpg': 'unsure' });
    expect(pickImage(offers, NOW, v)).toBe('https://beautybase.example/maybe.jpg');
  });

  // The reported photo, as its offers actually stand in the live catalogue:
  // Emirates Oud's Azzure Aoud shot scored 0.5 -- dead on the boundary -- and
  // held the top-ranked slot while three other shops had a photo the checker
  // had confirmed shows the bottle alone.
  it('demotes an "unsure" photo when a confirmed bottle-only one is available', () => {
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/maybe.jpg', fetchedAt: hoursAgo(1) }),
      offer({
        retailerId: 'mybeauty-boutique',
        imageUrl: 'https://mybeauty-boutique.example/clean.jpg',
        fetchedAt: hoursAgo(2),
      }),
    ];
    const v = verdicts({
      'https://beautybase.example/maybe.jpg': 'unsure',
      'https://mybeauty-boutique.example/clean.jpg': 'bottle-only',
    });
    expect(pickImage(offers, NOW, v)).toBe('https://mybeauty-boutique.example/clean.jpg');
  });

  it('keeps an "unsure" photo when the only confirmed bottle-only one is a thumbnail', () => {
    // Same measured trade-off as the boxed demotion: perfume-click's files
    // top out at 195x130 (30 sampled 2026-09-09), and a blurred confirmed
    // bottle is not an improvement on a sharp photo that merely could not be
    // read.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/maybe.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'perfume-click', imageUrl: 'https://perfume-click.example/tiny.jpg', fetchedAt: hoursAgo(2) }),
    ];
    const v = verdicts({
      'https://beautybase.example/maybe.jpg': 'unsure',
      'https://perfume-click.example/tiny.jpg': 'bottle-only',
    });
    expect(pickImage(offers, NOW, v)).toBe('https://beautybase.example/maybe.jpg');
  });

  it('demotes an unsure photo in the freshness fallback too, not just at the ranked tier', () => {
    // Neither shop is a preferred retailer, so the ranked loop never runs and
    // the fallback is the whole decision. Without the same rule there, the
    // fresher unsure photo would simply win on its timestamp.
    const offers = [
      offer({ retailerId: 'manchester-ouds', imageUrl: 'https://manchester-ouds.example/maybe.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'emirates-oud', imageUrl: 'https://emirates-oud.example/clean.jpg', fetchedAt: hoursAgo(9) }),
    ];
    const v = verdicts({
      'https://manchester-ouds.example/maybe.jpg': 'unsure',
      'https://emirates-oud.example/clean.jpg': 'bottle-only',
    });
    expect(pickImage(offers, NOW, v)).toBe('https://emirates-oud.example/clean.jpg');
  });

  it('treats an offer with no verdict at all exactly like before -- the map is additive, never a new requirement', () => {
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/unchecked.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://some-other-shop.example/photo.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v)).toBe('https://beautybase.example/unchecked.jpg');
  });

  it('falls through every preferred retailer to the freshness fallback when all of them are boxed', () => {
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({
        retailerId: 'mybeauty-boutique',
        imageUrl: 'https://mybeauty-boutique.example/boxed.jpg',
        fetchedAt: hoursAgo(2),
      }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/clean.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({
      'https://beautybase.example/boxed.jpg': 'boxed',
      'https://mybeauty-boutique.example/boxed.jpg': 'boxed',
    });
    // Neither preferred retailer's photo is usable at its tier, so the
    // freshest *licensed* offer overall wins -- exactly the existing
    // no-preferred-retailer-available fallback, just reached for a
    // different reason.
    expect(pickImage(offers, NOW, v)).toBe('https://justmylook.example/clean.jpg');
  });

  it('keeps a boxed photo rather than replacing it with a perfume-click thumbnail', () => {
    // 204 of the first run's 331 swaps went to perfume-click's files, which
    // never exceed 195x130 (30 sampled 2026-09-09). A sharp bottle-with-box
    // beats a blurred bottle, so the thumbnail is not an acceptable
    // replacement -- the boxed photo stays.
    const offers = [
      offer({ retailerId: 'mybeauty-boutique', imageUrl: 'https://mybeauty-boutique.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/thumb_ml.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://mybeauty-boutique.example/boxed.jpg': 'boxed', 'https://bgstatic.example/thumb_ml.jpg': 'bottle-only' });
    expect(pickImage(offers, NOW, v)).toBe('https://mybeauty-boutique.example/boxed.jpg');
  });

  it('when every candidate is boxed, a full-sized boxed photo beats a boxed thumbnail regardless of order or freshness', () => {
    const offers = [
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/thumb_ml.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'mybeauty-boutique', imageUrl: 'https://mybeauty-boutique.example/boxed.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://mybeauty-boutique.example/boxed.jpg': 'boxed', 'https://bgstatic.example/thumb_ml.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v)).toBe('https://mybeauty-boutique.example/boxed.jpg');
  });

  it('replaces a boxed photo with a bottle-only one from a full-sized, non-preferred retailer', () => {
    const offers = [
      offer({ retailerId: 'mybeauty-boutique', imageUrl: 'https://mybeauty-boutique.example/boxed.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/thumb_ml.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/clean.png', fetchedAt: hoursAgo(9) }),
    ];
    const v = verdicts({ 'https://mybeauty-boutique.example/boxed.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v)).toBe('https://justmylook.example/clean.png');
  });

  it('with no boxed verdict in play, the freshness fallback is unchanged even when the freshest is a thumbnail', () => {
    const offers = [
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/thumb_ml.jpg', fetchedAt: hoursAgo(1) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/clean.png', fetchedAt: hoursAgo(9) }),
    ];
    expect(pickImage(offers, NOW, verdicts({}))).toBe('https://bgstatic.example/thumb_ml.jpg');
  });

  it('never removes a product\'s only image, even when that image is a confirmed boxed photo', () => {
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/only-photo.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://beautybase.example/only-photo.jpg': 'boxed' });
    // No other offer exists to fall through to -- the boxed photo it has is
    // still better than no photo, so pickImage must still return it.
    expect(pickImage(offers, NOW, v)).toBe('https://beautybase.example/only-photo.jpg');
  });

  it('still applies the resolution upgrade to a photo that survives the boxed check', () => {
    const offers = [
      offer({
        retailerId: 'beautybase',
        imageUrl: 'https://www.beautybase.com/cdn/shop/files/x.jpg?v=1&width=1920',
        fetchedAt: hoursAgo(1),
      }),
    ];
    const v = verdicts({ 'https://www.beautybase.com/cdn/shop/files/x.jpg?v=1&width=1920': 'bottle-only' });
    expect(pickImage(offers, NOW, v)).toBe('https://www.beautybase.com/cdn/shop/files/x.jpg?v=1&width=3000');
  });

  it('falls through a boxed top preference to a stale-but-not-boxed second preference rather than jumping straight to freshness', () => {
    const offers = [
      offer({ retailerId: 'fragrance-click', imageUrl: 'https://fragrance-click.example/boxed.jpg', fetchedAt: hoursAgo(1) }),
      offer({
        retailerId: 'beautybase',
        imageUrl: 'https://beautybase.example/clean-but-stale.jpg',
        fetchedAt: hoursAgo(PREFERRED_IMAGE_MAX_AGE_HOURS + 1),
      }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/clean.jpg', fetchedAt: hoursAgo(2) }),
    ];
    const v = verdicts({ 'https://fragrance-click.example/boxed.jpg': 'boxed' });
    // fragrance-click is demoted for being boxed, and beautybase -- next in
    // rank -- is itself stale, so this must land on the same freshness
    // fallback a stale-without-boxed run would reach, not on beautybase's
    // stale photo just because it beat justmylook's rank. (A perfume-click
    // thumbnail would not qualify as the replacement; see the test above.)
    expect(pickImage(offers, NOW, v)).toBe('https://justmylook.example/clean.jpg');
  });
});

describe('"too small to swap to" measured per photo rather than per retailer', () => {
  function verdicts(entries: Record<string, ImageBoxVerdict>): Map<string, ImageBoxVerdict> {
    return new Map(Object.entries(entries));
  }
  function sizes(entries: Record<string, [number, number]>): Map<string, ImageDimensions> {
    return new Map(Object.entries(entries).map(([u, [width, height]]) => [u, { width, height }]));
  }

  // ── Lattafa Al Nashama 100ml (ean-6290360591544), the reported product ────
  // Its three licensed photos as they actually stand in the live catalogue,
  // all three downloaded and viewed on 2026-09-09:
  //
  //   perfume-click       81x130     verdict bottle-only (score 0.788) -- and
  //                                  the verdict is WRONG. The photo is the
  //                                  retail carton alone, no bottle in frame.
  //                                  It scored bottle-only only because
  //                                  81/130 = 0.62 is under BOTTLE_ASPECT,
  //                                  and the file is cropped flush to the
  //                                  product so that ratio describes the crop
  //                                  rather than its contents.
  //   emirates-oud        1600x1600  verdict boxed -- correct, box beside
  //                                  bottle. This is what the site shows.
  //   mybeauty-boutique   1200x1200  verdict boxed -- correct, box beside
  //                                  bottle.
  //
  // There is no bottle-only photograph of this product anywhere in the
  // licensed offers, so no selection rule can produce one. The most this layer
  // can do is refuse to trade a sharp 1600x1600 box-and-bottle shot for an
  // 81x130 picture of the box on its own, and that is what these two pin.
  const AL_NASHAMA_PERFUME_CLICK = 'https://bgstatic.net/photos/169259_ml.jpg';
  const AL_NASHAMA_EMIRATES_OUD =
    'https://cdn.shopify.com/s/files/1/0798/6898/5693/files/Al-Nashama-Perfume-100ml-EDP-Lattafa-138612696.jpg?v=1720734974';
  const AL_NASHAMA_MYBEAUTY = 'https://cdn.shopify.com/s/files/1/0621/6541/8121/files/61AlRv4q1vL.jpg?v=1763144219';

  const alNashamaOffers = [
    offer({ retailerId: 'perfume-click', imageUrl: AL_NASHAMA_PERFUME_CLICK, fetchedAt: hoursAgo(18) }),
    offer({ retailerId: 'emirates-oud', imageUrl: AL_NASHAMA_EMIRATES_OUD, fetchedAt: hoursAgo(1) }),
    offer({ retailerId: 'mybeauty-boutique', imageUrl: AL_NASHAMA_MYBEAUTY, fetchedAt: hoursAgo(4) }),
  ];
  const alNashamaVerdicts = verdicts({
    [AL_NASHAMA_PERFUME_CLICK]: 'bottle-only',
    [AL_NASHAMA_EMIRATES_OUD]: 'boxed',
    [AL_NASHAMA_MYBEAUTY]: 'boxed',
  });

  it('keeps Al Nashama on the full-sized boxed photo when no size has been measured', () => {
    // Today's data: no verdict entry carries width/height yet, so the
    // retailer-list fallback decides and the answer is the one the site
    // already shows.
    expect(pickImage(alNashamaOffers, NOW, alNashamaVerdicts)).toBe(AL_NASHAMA_EMIRATES_OUD);
  });

  it('keeps Al Nashama on the same photo once the sizes are measured, now for the measured reason', () => {
    // The point of the change: the same outcome stops depending on
    // perfume-click being named in a list and starts depending on the photo
    // being 81x130. If perfume-click ever served a full-sized photo, this
    // product would follow the pixels rather than the shop name.
    const d = sizes({
      [AL_NASHAMA_PERFUME_CLICK]: [81, 130],
      [AL_NASHAMA_EMIRATES_OUD]: [1600, 1600],
      [AL_NASHAMA_MYBEAUTY]: [1200, 1200],
    });
    expect(pickImage(alNashamaOffers, NOW, alNashamaVerdicts, d)).toBe(AL_NASHAMA_EMIRATES_OUD);
  });

  it('blocks a measurably small photo from a shop that is not on the thumbnail list', () => {
    // The generalisation the retailer list could not express: thumbnails are
    // not a perfume-click speciality. 104 of justmylook's photos are stored at
    // exactly 100x100 and sit indistinguishably beside that shop's 2000x2000
    // ones -- the retailer list has no way to tell those two apart, and a
    // measurement does.
    //
    // 100x100 rather than the 350x350 mybeauty-boutique file this test first
    // used, and the difference is the whole point of where the floor now sits:
    // a 350px photograph is small, not a thumbnail, and disqualifying it is
    // what cost Issey Miyake A Drop d'Issey Essentielle its bottle-only shot
    // (pinned two tests below). Only the sub-200px cluster is genuinely not a
    // photograph.
    //
    // The shops here are justmylook and emirates-oud because neither is in
    // PREFERRED_IMAGE_RETAILERS: a ranked shop wins its own tier before the
    // replacement logic below is ever consulted, so the rule under test would
    // never be reached.
    const offers = [
      offer({ retailerId: 'emirates-oud', imageUrl: 'https://emirates-oud.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/small.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://emirates-oud.example/boxed.jpg': 'boxed' });
    const d = sizes({ 'https://justmylook.example/small.jpg': [100, 100] });
    // Without the measurement the small photo replaces the boxed one, since
    // its shop is not on the thumbnail list.
    expect(pickImage(offers, NOW, v)).toBe('https://justmylook.example/small.jpg');
    // With it, the sharp boxed photo is kept -- the same trade-off already
    // made for perfume-click, now made on evidence rather than on a name.
    expect(pickImage(offers, NOW, v, d)).toBe('https://emirates-oud.example/boxed.jpg');
  });

  it('lets a measurement override the retailer list in the other direction too', () => {
    // No perfume-click photo like this exists -- 30 sampled on 2026-09-09 all
    // fit inside 195x130, and the bucket serves no larger variant (see
    // THUMBNAIL_IMAGE_RETAILERS). This pins the precedence, not a real photo:
    // a measured size is the better evidence, so it wins over the shop's name
    // if the shop's photography ever changes.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/hypothetical.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://beautybase.example/boxed.jpg': 'boxed' });
    const d = sizes({ 'https://bgstatic.example/hypothetical.jpg': [1200, 1600] });
    expect(pickImage(offers, NOW, v, d)).toBe('https://bgstatic.example/hypothetical.jpg');
  });

  it('treats a photo with no measurement by its retailer, never as big enough', () => {
    // The correctness condition for shipping this before a re-sweep: all
    // 29,711 verdict entries written before 2026-09-09 carry no size, so a
    // dimensions map that simply does not mention a URL must leave that
    // photo's handling exactly as it was. Here the map knows only about the
    // beautybase photo; perfume-click's is unmeasured and must still be
    // refused as a replacement.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'perfume-click', imageUrl: 'https://bgstatic.example/unmeasured.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://beautybase.example/boxed.jpg': 'boxed' });
    const d = sizes({ 'https://beautybase.example/boxed.jpg': [2000, 2000] });
    expect(pickImage(offers, NOW, v, d)).toBe('https://beautybase.example/boxed.jpg');
  });

  it('measures the long edge, so a wide-but-short photo is judged on its width', () => {
    // perfume-click's widest sampled files are 195x105 and 195x119 -- short,
    // but it is the 195 that decides, not the 105.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/wide.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://beautybase.example/boxed.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/wide.jpg': [900, 120] }))).toBe(
      'https://justmylook.example/wide.jpg',
    );
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/wide.jpg': [195, 105] }))).toBe(
      'https://beautybase.example/boxed.jpg',
    );
  });

  it('treats a photo exactly at the 200px floor as big enough to swap to', () => {
    // The floor sits in a real gap in the catalogue's own photo sizes, not at
    // a rendering threshold -- see MIN_SWAPPABLE_LONG_EDGE. Inclusive on
    // purpose: 200 is the first size that is a photograph rather than a
    // thumbnail, so it must qualify.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/exact.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://beautybase.example/boxed.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/exact.jpg': [200, 200] }))).toBe(
      'https://justmylook.example/exact.jpg',
    );
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/exact.jpg': [199, 199] }))).toBe(
      'https://beautybase.example/boxed.jpg',
    );
  });

  it('keeps a 370x370 photo of the bottle over a 1920x1920 one with the box', () => {
    // Issey Miyake A Drop d'Issey Essentielle (ean-3423222090937), with the
    // real sizes of its two real photos. Both are verdicted `boxed` -- the
    // 370x370 wrongly, because the bottle is a wide glass disc and the aspect
    // test misreads it -- so neither can be a `replacement` and the pick falls
    // to the full-sized-boxed pool, where freshness decides. Both were
    // downloaded and viewed: the 370 shows the bottle alone, the 1920 has the
    // carton beside it.
    //
    // What the floor decides here is not the winner but the *pool*: at 400 the
    // 370x370 was not full-sized, so it dropped out and the boxed photo won by
    // being the only candidate left. At 200 both are eligible and the existing
    // freshness tie-break reaches the right one, exactly as it did before any
    // of this existed. This is the case that moved the floor, so it is pinned
    // rather than left to the constant's comment.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/box-and-bottle.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'mybeauty-boutique', imageUrl: 'https://mybeauty-boutique.example/bottle.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({
      'https://beautybase.example/box-and-bottle.jpg': 'boxed',
      'https://mybeauty-boutique.example/bottle.jpg': 'boxed',
    });
    const d = sizes({
      'https://beautybase.example/box-and-bottle.jpg': [1920, 1920],
      'https://mybeauty-boutique.example/bottle.jpg': [370, 370],
    });
    expect(pickImage(offers, NOW, v, d)).toBe('https://mybeauty-boutique.example/bottle.jpg');
    // And the shape of the regression it replaced: had the 370 been treated as
    // a thumbnail, the only thing left in the pool is the box-and-bottle shot.
    expect(pickImage(offers, NOW, v, sizes({
      'https://beautybase.example/box-and-bottle.jpg': [1920, 1920],
      'https://mybeauty-boutique.example/bottle.jpg': [150, 150],
    }))).toBe('https://beautybase.example/box-and-bottle.jpg');
  });

  it('perfume-click is still the only retailer the unmeasured fallback condemns', () => {
    // Not a style assertion: the whole point of the fallback is that it stays
    // exactly as coarse as it was until real measurements replace it. Growing
    // this list would be a way of guessing at photos nobody has looked at.
    expect([...THUMBNAIL_IMAGE_RETAILERS]).toEqual(['perfume-click']);
  });
});
