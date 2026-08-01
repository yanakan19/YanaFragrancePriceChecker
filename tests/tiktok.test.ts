import { describe, expect, it } from 'vitest';
import { TIKTOK_BETA_CONFIG, visibleTikTokSellers } from '../src/config/tiktokSellers.js';
import { RETAILERS } from '../src/config/retailers.js';

describe('TikTok Shop beta', () => {
  it('is off by default', () => {
    expect(TIKTOK_BETA_CONFIG.enabled).toBe(false);
    expect(visibleTikTokSellers()).toEqual([]);
  });

  it('excludes untrusted sellers rather than badging them', () => {
    expect(TIKTOK_BETA_CONFIG.showUntrustedSellers).toBe(false);
  });

  it('carries a mandatory authenticity disclaimer', () => {
    expect(TIKTOK_BETA_CONFIG.authenticityDisclaimer.length).toBeGreaterThan(40);
  });

  it('stays out of the retailer registry entirely', () => {
    // Isolation is the point: when TikTok breaks, core comparison must not.
    expect(RETAILERS.some((r) => r.domain.includes('tiktok'))).toBe(false);
  });
});
