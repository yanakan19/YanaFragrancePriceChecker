import { describe, expect, it } from 'vitest';
import { BETA, COMING_SOON, CURRENT_REGION, REGIONS, regionButtonLabel } from '../src/services/regions.js';
import { flagSvg } from '../demo/flags.js';

/**
 * The country and currency selector's data (owner's request, 2026-10-05; the
 * list trimmed to three on 9 October 2026, owner decision 3 in
 * docs/INTERNATIONAL-PLAN.md): the order of the list, each region's currency,
 * and which of them can be chosen (all three since the public beta of
 * 9 October 2026, the US and India marked Beta). The list comes from
 * src/config/regions.ts.
 * The browser half, the menu itself, is tests/regionSelectorBrowser.test.ts.
 */

describe('the region list', () => {
  it('is United Kingdom, United States (Beta), India (Beta), in that order', () => {
    expect(REGIONS.map((r) => r.name)).toEqual(['United Kingdom', 'United States (Beta)', 'India (Beta)']);
    expect(BETA).toBe('Beta');
    expect(REGIONS.map((r) => r.id)).toEqual(['GB', 'US', 'IN']);
  });

  it('pairs each with its currency', () => {
    expect(REGIONS.map((r) => `${r.name} ${r.currency}`)).toEqual(['United Kingdom GBP', 'United States (Beta) USD', 'India (Beta) INR']);
  });

  it('makes all three regions choosable, the UK first and current on a UK address', () => {
    expect(REGIONS.filter((r) => r.available).map((r) => r.id)).toEqual(['GB', 'US', 'IN']);
    expect(REGIONS.filter((r) => !r.available).map((r) => r.id)).toEqual([]);
    expect(CURRENT_REGION).toBe(REGIONS[0]);
    expect(CURRENT_REGION.currency).toBe('GBP');
  });

  it('describes every other region as Coming Soon, with no date and no promise', () => {
    expect(COMING_SOON).toBe('Coming Soon');
    for (const r of REGIONS) {
      if (r.available) expect(r.note, r.name).toBeNull();
      else expect(r.note, r.name).toBe('Coming Soon');
    }
  });

  it('uses Title Case words with no hyphens or dashes in what a reader sees', () => {
    for (const r of REGIONS) {
      for (const text of [r.name, r.currency, r.note ?? '']) {
        expect(text, text).not.toMatch(/[-‐-―−]/);
      }
    }
    expect(regionButtonLabel()).not.toMatch(/[-‐-―−]/);
  });

  it('names the region and its currency for a screen reader', () => {
    expect(regionButtonLabel()).toBe('Region and currency: United Kingdom, GBP');
    expect(regionButtonLabel(REGIONS[1])).toBe('Region and currency: United States (Beta), USD');
  });
});

describe('the flags', () => {
  it('draws one inline SVG per region, 20px wide, hidden from assistive technology', () => {
    for (const r of REGIONS) {
      const svg = flagSvg(r.id);
      expect(svg, r.id).toMatch(/^<svg class="flag" viewBox="0 0 30 20" width="20" /);
      expect(svg, r.id).toContain('aria-hidden="true"');
      expect(svg, r.id).toContain('focusable="false"');
      expect(svg, r.id).toMatch(/<\/svg>$/);
      // Drawn shapes, never an emoji flag (Windows does not draw those).
      expect(svg, r.id).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
    }
  });

  it('gives every region a flag of its own', () => {
    expect(new Set(REGIONS.map((r) => flagSvg(r.id))).size).toBe(REGIONS.length);
  });
});
