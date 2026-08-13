import { describe, expect, it } from 'vitest';
import { verificationTarget } from '../src/catalogue/verificationTarget.js';

/**
 * These guard the one rule in the price verification path that costs real
 * money to get wrong in either direction: fetching an affiliate deeplink
 * reports a click nobody made, and swapping the two URLs anywhere else would
 * send readers to an unmonetised link.
 *
 * Every URL below is synthetic. The `awin1.com/pclick` shapes mirror the form
 * this repo actually stores (see data/catalogue/fragrance-click.json) so the
 * refusal is tested against the real shape, but the ids are invented.
 */

const FEED_LISTING = {
  url: 'https://www.awin1.com/pclick.php?p=44089041632&a=3026001&m=124166',
  merchantUrl: 'https://www.fragranceclick.co.uk/products/test-fragrance-100ml',
};

describe('verificationTarget — the tracking link is never returned', () => {
  it('returns the merchant URL for a feed listing, not the deeplink', () => {
    expect(verificationTarget(FEED_LISTING, 'fragranceclick.co.uk')).toBe(
      'https://www.fragranceclick.co.uk/products/test-fragrance-100ml',
    );
  });

  it('returns null rather than the deeplink when no merchant URL was carried', () => {
    // This is exactly the state every Fragrance Click listing was in before
    // merchant_deep_link was mapped: the retailer is unverifiable, and that
    // must be reported as such rather than resolved by following the link.
    expect(verificationTarget({ url: FEED_LISTING.url, merchantUrl: null }, 'fragranceclick.co.uk'))
      .toBeNull();
  });

  it('returns null when merchantUrl is absent entirely', () => {
    expect(verificationTarget({ url: FEED_LISTING.url }, 'fragranceclick.co.uk')).toBeNull();
  });

  it('refuses a deeplink even if it is stored in merchantUrl by mistake', () => {
    // The fields being populated the wrong way round is the realistic failure,
    // and the domain whitelist is what makes it harmless.
    expect(
      verificationTarget({ url: FEED_LISTING.url, merchantUrl: FEED_LISTING.url }, 'fragranceclick.co.uk'),
    ).toBeNull();
  });

  it('refuses a tracking link from a network nobody has whitelisted against', () => {
    // A blacklist would have to know this host. A whitelist does not.
    expect(
      verificationTarget(
        { url: 'https://click.some-other-network.example/r?id=9', merchantUrl: null },
        'fragranceclick.co.uk',
      ),
    ).toBeNull();
  });
});

describe('verificationTarget — domain matching', () => {
  it('accepts the retailer domain with and without www', () => {
    expect(
      verificationTarget({ url: 'https://fragranceclick.co.uk/p/1', merchantUrl: null }, 'fragranceclick.co.uk'),
    ).toBe('https://fragranceclick.co.uk/p/1');
    expect(
      verificationTarget({ url: 'https://www.fragranceclick.co.uk/p/1', merchantUrl: null }, 'www.fragranceclick.co.uk'),
    ).toBe('https://www.fragranceclick.co.uk/p/1');
  });

  it('accepts a subdomain of the registered domain', () => {
    expect(
      verificationTarget({ url: 'https://uk.shopfrenchavenue.com/p/1', merchantUrl: null }, 'shopfrenchavenue.com'),
    ).toBe('https://uk.shopfrenchavenue.com/p/1');
  });

  it('refuses a lookalike domain that merely ends with the same letters', () => {
    expect(
      verificationTarget({ url: 'https://notfragranceclick.co.uk/p/1', merchantUrl: null }, 'fragranceclick.co.uk'),
    ).toBeNull();
  });

  it('refuses an unrelated domain', () => {
    expect(
      verificationTarget({ url: 'https://example.test/p/1', merchantUrl: null }, 'fragranceclick.co.uk'),
    ).toBeNull();
  });

  it('is case insensitive about the host', () => {
    expect(
      verificationTarget({ url: 'https://WWW.FragranceClick.CO.UK/p/1', merchantUrl: null }, 'fragranceclick.co.uk'),
    ).toBe('https://www.fragranceclick.co.uk/p/1');
  });
});

describe('verificationTarget — malformed and unsafe addresses', () => {
  it('refuses a relative URL rather than guessing an origin for it', () => {
    expect(
      verificationTarget({ url: '/products/relative', merchantUrl: null }, 'fragranceclick.co.uk'),
    ).toBeNull();
  });

  it('refuses a non-http scheme', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
      expect(
        verificationTarget({ url: bad, merchantUrl: bad }, 'fragranceclick.co.uk'),
      ).toBeNull();
    }
  });

  it('refuses an empty or unparseable address', () => {
    expect(verificationTarget({ url: '', merchantUrl: null }, 'fragranceclick.co.uk')).toBeNull();
    expect(verificationTarget({ url: 'not a url', merchantUrl: null }, 'fragranceclick.co.uk')).toBeNull();
  });

  it('falls back to url when merchantUrl is unusable', () => {
    expect(
      verificationTarget(
        { url: 'https://www.fragranceclick.co.uk/p/1', merchantUrl: '/relative' },
        'fragranceclick.co.uk',
      ),
    ).toBe('https://www.fragranceclick.co.uk/p/1');
  });

  it('returns null when the retailer domain itself is blank', () => {
    expect(verificationTarget({ url: 'https://anything.test/p', merchantUrl: null }, '')).toBeNull();
  });
});

describe('verificationTarget — scraped retailers are unaffected', () => {
  it('returns the stored product URL for a listing that has only one', () => {
    expect(
      verificationTarget({ url: 'https://www.beautybase.com/products/x', merchantUrl: null }, 'beautybase.com'),
    ).toBe('https://www.beautybase.com/products/x');
  });
});
