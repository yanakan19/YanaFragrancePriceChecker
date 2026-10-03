import { describe, expect, it } from 'vitest';
import { ADS_ON } from '../demo/ads.js';
import { COMPANY, LEGAL_PAGES, adsPolicy } from '../demo/legal.js';
import { headFor } from '../demo/head.js';

/**
 * The privacy, cookie and affiliate pages describe advertising from the same
 * switch that shows the ads (ADS_ON in demo/ads.ts), so they never claim ads
 * that do not run, nor leave out ads that do.
 */
const page = (id: string) => LEGAL_PAGES.find((p) => p.id === id)!.body;
const text = (o: Record<string, string>) => Object.values(o).join('\n');

describe('advertising in the legal pages', () => {
  it('the pages carry the wording for the switch as it stands', () => {
    const now = adsPolicy(ADS_ON);
    expect(page('privacy')).toContain(now.summary);
    expect(page('privacy')).toContain(now.privacyCookies);
    expect(page('cookies')).toContain(now.cookiesConsent);
    expect(page('affiliate')).toContain(now.affiliate);
  });

  it.skipIf(ADS_ON)('with ads off, as committed, the pages say there is no advertising and name no ad network', () => {
    expect(page('privacy')).toContain('no advertising');
    expect(page('cookies')).toContain('Why There Is No Cookie Banner');
    for (const id of ['privacy', 'cookies', 'affiliate']) expect(page(id)).not.toMatch(/AdSense|Google/);
    expect(COMPANY.updated).toBe('2 October 2026');
  });

  it('with ads on, every page that touches it says so, and none still claims there is no advertising', () => {
    const on = text(adsPolicy(true));
    expect(on).toContain('Google AdSense');
    expect(on).toContain('labelled Advertisement');
    expect(on).toContain('not personalised');
    expect(on).toContain('Advertising and Your Consent');
    expect(on).not.toMatch(/no advertising|Why There Is No Cookie Banner|shows you advertising/);
    // Every slot the off wording fills has an on wording.
    for (const [k, v] of Object.entries(adsPolicy(true))) expect(v, k).not.toBe('');
  });

  it('the advertising wording follows the house style: no hyphens or dashes', () => {
    const visible = text(adsPolicy(true)).replace(/<[^>]+>/g, ' ');
    expect(visible).not.toMatch(/[‐-―-]/);
  });

  it('the privacy page description in the head follows the same switch', () => {
    const privacy = headFor({ route: { name: 'legal', param: 'privacy', query: {} }, leafName: 'Privacy' });
    expect(privacy.description).toContain(ADS_ON ? 'ads Google shows' : 'no analytics');
  });
});
