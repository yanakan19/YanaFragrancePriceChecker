import { describe, expect, it } from 'vitest';
import {
  pickImage,
  upgradeImageResolution,
  PREFERRED_IMAGE_RETAILERS,
  PREFERRED_IMAGE_MAX_AGE_HOURS,
  type ImageCandidate,
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
