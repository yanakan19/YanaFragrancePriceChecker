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
    // The generalisation the retailer list could not express: under-floor
    // photos are not a perfume-click speciality. PREFERRED_IMAGE_RETAILERS'
    // own header records one at 350x350 among the 26 mybeauty-boutique files
    // it downloaded, sitting indistinguishably beside that shop's 2312x2560
    // ones -- the retailer list has no way to tell those two apart, and a
    // measurement does.
    //
    // The shops here are justmylook and emirates-oud rather than that real
    // pair because neither is in PREFERRED_IMAGE_RETAILERS: a ranked shop
    // wins its own tier before the replacement logic below is ever consulted,
    // so the rule under test would never be reached (see the note in the
    // report on this being unchanged, pre-existing behaviour).
    const offers = [
      offer({ retailerId: 'emirates-oud', imageUrl: 'https://emirates-oud.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/small.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://emirates-oud.example/boxed.jpg': 'boxed' });
    const d = sizes({ 'https://justmylook.example/small.jpg': [350, 350] });
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

  it('treats a photo exactly at the 400px floor as big enough to swap to', () => {
    // The floor is what this site actually draws a photo at -- .art-lg caps
    // the detail hero at 340 CSS px (demo/template.html) -- so 400 is a photo
    // that renders cleanly, not a marginal one. Inclusive on purpose.
    const offers = [
      offer({ retailerId: 'beautybase', imageUrl: 'https://beautybase.example/boxed.jpg', fetchedAt: hoursAgo(5) }),
      offer({ retailerId: 'justmylook', imageUrl: 'https://justmylook.example/exact.jpg', fetchedAt: hoursAgo(1) }),
    ];
    const v = verdicts({ 'https://beautybase.example/boxed.jpg': 'boxed' });
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/exact.jpg': [400, 400] }))).toBe(
      'https://justmylook.example/exact.jpg',
    );
    expect(pickImage(offers, NOW, v, sizes({ 'https://justmylook.example/exact.jpg': [399, 399] }))).toBe(
      'https://beautybase.example/boxed.jpg',
    );
  });

  it('perfume-click is still the only retailer the unmeasured fallback condemns', () => {
    // Not a style assertion: the whole point of the fallback is that it stays
    // exactly as coarse as it was until real measurements replace it. Growing
    // this list would be a way of guessing at photos nobody has looked at.
    expect([...THUMBNAIL_IMAGE_RETAILERS]).toEqual(['perfume-click']);
  });
});
