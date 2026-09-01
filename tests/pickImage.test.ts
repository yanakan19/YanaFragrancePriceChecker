import { describe, expect, it } from 'vitest';
import {
  pickImage,
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
      offer({ retailerId: 'mybeauty-boutique', fetchedAt: hoursAgo(2) }),
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

  it('is the sole entry in PREFERRED_IMAGE_RETAILERS, matching what was actually verified', () => {
    // See this constant's own doc comment: the-beauty-store-uk's photos were
    // sampled and found majority box-and-bottle, not bottle-only, so it does
    // not belong here regardless of the owner's original premise about it.
    expect(PREFERRED_IMAGE_RETAILERS).toEqual(['beautybase']);
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
