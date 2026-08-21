import type { Retailer } from '../src/types/retailer.js';

/**
 * What `trustpilotWidget()` in demo/app.ts needs to render, decided
 * independently of any markup so it can be unit tested directly — app.ts
 * pulls in the whole DOM-touching harness at import time (it calls `init()`
 * at the bottom of the file the moment it loads), so nothing in it can be
 * imported from a plain Node test, the same reason demo/volumeBands.ts and
 * demo/listSort.ts already live in their own modules.
 *
 * `unavailable` is the owner's explicit addition: previously a retailer with
 * no `trustpilotBusinessId` set rendered nothing at all — silent, easy to
 * mistake for "this page has no delivery facts either" rather than "we
 * don't have this shop's Trustpilot id yet". Every one of the 79 retailers
 * in src/config/retailers.ts is in that state today (none set the field),
 * and that count changes only as ids are found and filled in by hand — see
 * the field's own doc comment in src/types/retailer.ts. This does not
 * depend on, or wait for, the Trustpilot Business Units API key the owner
 * declined to pursue: it is an honest label for an absent fact, not a
 * fetch.
 */
export type TrustpilotState =
  | { kind: 'widget'; businessId: string; reviewUrl: string }
  | { kind: 'unavailable'; message: string };

export function trustpilotStateFor(
  r: Pick<Retailer, 'name' | 'domain' | 'trustpilotBusinessId'>,
): TrustpilotState {
  if (!r.trustpilotBusinessId) {
    return { kind: 'unavailable', message: `No Trustpilot reviews available for ${r.name} yet.` };
  }
  return {
    kind: 'widget',
    businessId: r.trustpilotBusinessId,
    reviewUrl: `https://uk.trustpilot.com/review/${r.domain}`,
  };
}
