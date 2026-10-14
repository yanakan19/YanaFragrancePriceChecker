import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIZE_CORRECTIONS_REVIEWED, SIZE_REVIEW_PENDING, correctionKey, findHouseSizeContradictions } from '../src/catalogue/sizeReview.js';
import type { StoredListing } from '../src/catalogue/types.js';

// The rule, not a figure: no shop may state a size alone that a house's own
// reviewed list lacks, unless a person has settled it (a correction) or parked
// it (pending, with a line in docs/SIZE-REVIEW-2026-10-14.md).
describe('shops against the houses own size lists', () => {
  const dir = new URL('../data/catalogue/', import.meta.url);
  const all: StoredListing[] = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => (JSON.parse(readFileSync(new URL(f, dir), 'utf8')).listings ?? []) as StoredListing[]);
  it('every contradiction is settled or pending review', () => {
    const settled = new Set([...SIZE_CORRECTIONS_REVIEWED.map((c) => correctionKey(c.retailerId, c.retailerSku)), ...SIZE_REVIEW_PENDING]);
    const open = findHouseSizeContradictions(all).filter((f) => !settled.has(f.key));
    expect(open.map((f) => `${f.key} states ${f.stated}ml, ${f.house} makes ${f.allowed.join('/')}ml`)).toEqual([]);
  });
});
