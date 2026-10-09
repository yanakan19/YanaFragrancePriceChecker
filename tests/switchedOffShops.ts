import { afterAll } from 'vitest';
import { getRetailer } from '../src/config/retailers.js';

/**
 * The shops the owner switched off on 2026-10-04 (`enabled: false` in
 * src/config/retailers.ts). Their entries, delivery terms and notes are kept so
 * they can come back, and several engine tests were written against exactly
 * those figures (Boots' £25 threshold, Selfridges' £6.95, Superdrug's £25).
 * The comparison engine skips a shop that is not enabled, so a test file that
 * wants one of them as a fixture calls this once at the top: it switches them
 * on for that file only and puts them back afterwards. Vitest gives every test
 * file its own copy of the registry, so nothing leaks into another file, and
 * the registry itself, and every test of what is on the site, still sees them
 * switched off (tests/registry.test.ts). Notino UK, switched off the same day,
 * came back on on 2026-10-07 and is no longer listed here.
 */
export const SWITCHED_OFF_ON_2026_10_04 = [
  'selfridges',
  'boots',
  'superdrug',
  'the-perfume-shop',
  'the-fragrance-shop',
  'zara',
  'harvey-nichols',
  'riiffs',
] as const;

export function switchOnTheSwitchedOffShopsForThisFile(): void {
  // At once, not in a beforeAll: some describe blocks build their rows while
  // the file is still being collected, before any beforeAll has run.
  for (const id of SWITCHED_OFF_ON_2026_10_04) getRetailer(id)!.enabled = true;
  afterAll(() => {
    for (const id of SWITCHED_OFF_ON_2026_10_04) getRetailer(id)!.enabled = false;
  });
}
