import { describe, expect, it } from 'vitest';
import {
  isTrustpilotReviewUrl,
  trustpilotLinkMarkup,
  trustpilotStateFor,
  TRUSTPILOT_LINK_TEXT,
} from '../demo/trustpilotWidget.js';
import { enabledRetailers, RETAILERS } from '../src/config/retailers.js';

/**
 * A shop's page links to its own Trustpilot review page only where the
 * registry holds an address that was fetched and checked. Nothing is derived
 * from the shop's domain, nothing is guessed, and nothing is copied from
 * Trustpilot: no score, star rating or review count.
 */

const WITH_URL = {
  name: 'Example Shop',
  trustpilotUrl: 'https://uk.trustpilot.com/review/www.example.co.uk',
};

describe('trustpilotStateFor: no verified address', () => {
  it('shows nothing when trustpilotUrl is unset', () => {
    expect(trustpilotStateFor({ name: 'Boots' })).toEqual({ kind: 'none' });
  });

  it('treats null and an empty string the same as unset', () => {
    expect(trustpilotStateFor({ name: 'Boots', trustpilotUrl: null }).kind).toBe('none');
    expect(trustpilotStateFor({ name: 'Boots', trustpilotUrl: '' }).kind).toBe('none');
  });

  it('shows nothing for an address of the wrong shape, rather than linking it', () => {
    for (const bad of [
      'http://uk.trustpilot.com/review/example.co.uk',
      'https://www.trustpilot.com/review/example.co.uk',
      'https://uk.trustpilot.com/review/',
      'https://uk.trustpilot.com/review/example.co.uk?utm_source=x',
      'https://uk.trustpilot.com/review/example.co.uk/extra',
      'https://example.co.uk/uk.trustpilot.com/review/x',
    ]) {
      expect(trustpilotStateFor({ name: 'Example Shop', trustpilotUrl: bad }).kind, bad).toBe('none');
    }
  });

  it('does not build an address from the shop domain, even when a business id is set', () => {
    const state = trustpilotStateFor({
      name: 'Example Shop',
      domain: 'example.co.uk',
      trustpilotBusinessId: '5f1a2b3c4d5e6f7081920a1b',
    } as Parameters<typeof trustpilotStateFor>[0]);
    expect(state).toEqual({ kind: 'none' });
  });
});

describe('trustpilotStateFor: verified address', () => {
  it('links to the stored address as is, which need not match the shop domain', () => {
    const state = trustpilotStateFor(WITH_URL);
    expect(state).toMatchObject({ kind: 'link', reviewUrl: 'https://uk.trustpilot.com/review/www.example.co.uk' });
  });

  it('adds the widget only when a business id is also on file', () => {
    const state = trustpilotStateFor({ ...WITH_URL, trustpilotBusinessId: '5f1a2b3c4d5e6f7081920a1b' });
    expect(state).toMatchObject({ kind: 'widget', businessId: '5f1a2b3c4d5e6f7081920a1b' });
  });

  it('uses Title Case link text and an accessible name that includes the shop', () => {
    const state = trustpilotStateFor(WITH_URL);
    if (state.kind !== 'link') throw new Error('expected a link');
    expect(state.linkText).toBe('Reviews on Trustpilot');
    expect(state.ariaLabel).toContain('Example Shop');
    // The spoken name starts with the words that are seen.
    expect(state.ariaLabel.startsWith(TRUSTPILOT_LINK_TEXT)).toBe(true);
  });
});

describe('isTrustpilotReviewUrl', () => {
  it('accepts https://uk.trustpilot.com/review/<name> only', () => {
    expect(isTrustpilotReviewUrl('https://uk.trustpilot.com/review/example.co.uk')).toBe(true);
    expect(isTrustpilotReviewUrl('https://uk.trustpilot.com/review/www.example.com')).toBe(true);
    expect(isTrustpilotReviewUrl('https://uk.trustpilot.com/search?query=x')).toBe(false);
    expect(isTrustpilotReviewUrl(undefined)).toBe(false);
  });
});

describe('trustpilotLinkMarkup', () => {
  const state = trustpilotStateFor({
    name: 'Fragrance Click & Co',
    trustpilotUrl: 'https://uk.trustpilot.com/review/fragranceclick.co.uk',
  });
  if (state.kind !== 'link') throw new Error('expected a link');
  const html = trustpilotLinkMarkup(state, '<svg></svg>');

  it('opens in a new tab with rel noopener and the shop in its accessible name', () => {
    expect(html).toContain('href="https://uk.trustpilot.com/review/fragranceclick.co.uk"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('aria-label="Reviews on Trustpilot for Fragrance Click &amp; Co, opens in a new tab"');
    expect(html).toContain('<span>Reviews on Trustpilot</span>');
  });

  it('is not an affiliate link and carries no tracking', () => {
    expect(html).not.toMatch(/sponsored|nofollow|utm_|affiliate|\?/i);
  });

  it('prints no rating, score or review count', () => {
    const text = html.replace(/<[^>]*>/g, ' ');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/star|score|rated|excellent|trustscore|out of/i);
  });

  it('has no hyphen or dash in what is shown', () => {
    expect(state.linkText).not.toMatch(/[-‐-―]/);
  });
});

describe('the registry', () => {
  const withUrl = RETAILERS.filter((r) => r.trustpilotUrl);

  it('only stores addresses of the shape https://uk.trustpilot.com/review/<name>, each with the date it was checked', () => {
    for (const r of withUrl) {
      expect(isTrustpilotReviewUrl(r.trustpilotUrl), r.id).toBe(true);
      expect(r.trustpilotCheckedOn, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('stores no check date for a shop without an address', () => {
    for (const r of RETAILERS.filter((x) => !x.trustpilotUrl)) {
      expect(r.trustpilotCheckedOn ?? null, r.id).toBeNull();
    }
  });

  it('renders the link for every enabled shop that has an address, and nothing for the rest', () => {
    for (const r of enabledRetailers()) {
      const s = trustpilotStateFor(r);
      if (r.trustpilotUrl) {
        if (s.kind === 'none') throw new Error(`${r.id} has an address but renders nothing`);
        const html = trustpilotLinkMarkup(s, '');
        expect(html, r.id).toContain(`href="${r.trustpilotUrl}"`);
        expect(html, r.id).toContain(r.name.replace(/&/g, '&amp;').replace(/'/g, '&#39;'));
      } else {
        expect(s, r.id).toEqual({ kind: 'none' });
      }
    }
  });
});
