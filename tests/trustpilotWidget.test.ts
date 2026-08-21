import { describe, expect, it } from 'vitest';
import { trustpilotStateFor } from '../demo/trustpilotWidget.js';

/**
 * Zero of the 79 retailers in src/config/retailers.ts set
 * `trustpilotBusinessId` today (grep -c 'trustpilotBusinessId:' returns 0
 * matches with a non-null value), so `unavailable` is the state almost
 * every retailer page renders right now. The point of this fallback is that
 * it says so plainly rather than rendering nothing, which is what
 * `trustpilotWidget()` in demo/app.ts did before.
 */

describe('trustpilotStateFor: no businessId configured', () => {
  it('reports unavailable, naming the retailer, when trustpilotBusinessId is unset', () => {
    const state = trustpilotStateFor({ name: 'Boots', domain: 'boots.com' });
    expect(state).toEqual({ kind: 'unavailable', message: 'No Trustpilot reviews available for Boots yet.' });
  });

  it('treats an explicit null the same as unset', () => {
    const state = trustpilotStateFor({ name: 'Superdrug', domain: 'superdrug.com', trustpilotBusinessId: null });
    expect(state.kind).toBe('unavailable');
  });

  it('treats an empty string the same as unset — not a real id', () => {
    const state = trustpilotStateFor({ name: 'Zara', domain: 'zara.com', trustpilotBusinessId: '' });
    expect(state.kind).toBe('unavailable');
  });
});

describe('trustpilotStateFor: businessId configured', () => {
  it('builds the widget state and a review-page link from the retailer domain', () => {
    const state = trustpilotStateFor({
      name: 'Example Shop',
      domain: 'example.co.uk',
      trustpilotBusinessId: '5f1a2b3c4d5e6f7081920a1b',
    });
    expect(state).toEqual({
      kind: 'widget',
      businessId: '5f1a2b3c4d5e6f7081920a1b',
      reviewUrl: 'https://uk.trustpilot.com/review/example.co.uk',
    });
  });
});
