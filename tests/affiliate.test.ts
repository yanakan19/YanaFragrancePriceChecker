import { describe, expect, it } from 'vitest';
import { buildOutboundLink, pendingAffiliateSetup, hasAffiliateGaps } from '../src/services/affiliate.js';
import { getRetailer, RETAILERS } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';

const boots = getRetailer('boots')!;
const fragranceClick = getRetailer('fragrance-click')!;

function withAffiliate(over: Partial<Retailer['affiliate']>): Retailer {
  return { ...boots, affiliate: { ...boots.affiliate, ...over } };
}

const LIVE = withAffiliate({
  network: 'awin',
  verified: true,
  status: 'active',
  publisherId: '123456',
  deeplinkTemplate: 'https://www.awin1.com/cread.php?awinmid=2041&awinaffid={{publisherId}}&ued={{url}}',
});

describe('buildOutboundLink', () => {
  it('returns the plain product URL while the programme is not live', () => {
    const link = buildOutboundLink(boots, 'https://www.boots.com/p/1');
    expect(link.url).toBe('https://www.boots.com/p/1');
    expect(link.isAffiliateLink).toBe(false);
  });

  it('builds a tracked link once the programme is active', () => {
    const link = buildOutboundLink(LIVE, 'https://www.boots.com/p/1?size=100ml');
    expect(link.isAffiliateLink).toBe(true);
    expect(link.url).toContain('awinaffid=123456');
    expect(link.url).toContain(encodeURIComponent('https://www.boots.com/p/1?size=100ml'));
  });

  it('URL-encodes the target so query strings survive the redirect', () => {
    const link = buildOutboundLink(LIVE, 'https://www.boots.com/p?a=1&b=2');
    expect(link.url).not.toContain('&b=2');
    expect(link.url).toContain('%26b%3D2');
  });

  it('fails open to the direct URL when the config is half-finished', () => {
    // A broken tracking link loses the sale; an untracked one only loses the fee.
    expect(buildOutboundLink(withAffiliate({ ...LIVE.affiliate, publisherId: null }), 'https://x/p').isAffiliateLink).toBe(false);
    expect(buildOutboundLink(withAffiliate({ ...LIVE.affiliate, deeplinkTemplate: null }), 'https://x/p').isAffiliateLink).toBe(false);
  });

  it('fails open when the template has no placeholders to substitute', () => {
    const broken = withAffiliate({ ...LIVE.affiliate, deeplinkTemplate: 'https://tracker.example/go' });
    expect(buildOutboundLink(broken, 'https://x/p').isAffiliateLink).toBe(false);
  });

  it('passes an affiliate-feed URL through unwrapped, since it is already the tracked link', () => {
    // aw_deep_link from the datafeed is a complete pclick.php redirect. Running
    // it through deeplinkTemplate too would nest it inside a second Awin
    // redirect (cread.php?...&ued=<the pclick.php URL>) instead of leaving it
    // as the one link Awin actually expects to receive a click on.
    const feedUrl = 'https://www.awin1.com/pclick.php?p=44089041632&a=3017443&m=124166';
    const link = buildOutboundLink(fragranceClick, feedUrl);
    expect(link.url).toBe(feedUrl);
    expect(link.isAffiliateLink).toBe(true);
  });
});

describe('pendingAffiliateSetup', () => {
  it('reports every retailer without a live programme as outstanding', () => {
    const expectedPending = RETAILERS.filter((r) => r.affiliate.status !== 'active').length;
    expect(pendingAffiliateSetup()).toHaveLength(expectedPending);
    expect(hasAffiliateGaps()).toBe(true);
  });

  it('gives each gap a concrete next action', () => {
    for (const gap of pendingAffiliateSetup()) {
      expect(gap.action.length, `${gap.retailerName} has no action`).toBeGreaterThan(10);
    }
  });

  it('points confirmed Awin merchants at their signup page', () => {
    const gap = pendingAffiliateSetup().find((g) => g.retailerId === 'boots')!;
    expect(gap.network).toBe('awin');
    expect(gap.networkVerified).toBe(true);
    expect(gap.action).toContain('awin.com');
  });

  it('excludes live programmes', () => {
    expect(pendingAffiliateSetup([LIVE])).toHaveLength(0);
    expect(hasAffiliateGaps([LIVE])).toBe(false);
  });
});
