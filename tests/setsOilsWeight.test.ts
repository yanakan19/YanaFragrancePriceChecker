import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';

/**
 * The weight limit of docs/GIFT-SETS-AND-OILS-PLAN.md, section 4.3: what the Sets and Oils
 * work puts into the catalogue and offers JSON, which every first visit downloads, may not
 * exceed 300 KB across the whole plan (1.1% of the 26.3 MB it was measured against).
 *
 * The fields the plan added, all on sets and oils only and all omitted where they say
 * nothing: on a set, `mainMl`, `bundle`, `from`, `box`, `multi`, `mini`, `items`,
 * `bottleId` and `scent`; on an oil, its `oil` record; on an offer of a set sold by two
 * shops or more, the shop's own `title`. Each is counted as it is written in the file, key
 * included. The title, contents and `giftSet` record itself existed before the plan.
 */
const PLAN_SET_FIELDS = ['mainMl', 'bundle', 'from', 'box', 'multi', 'mini', 'items', 'bottleId', 'scent'];
const LIMIT_BYTES = 300 * 1024;

const bytes = (key: string, value: unknown): number => Buffer.byteLength(`"${key}":${JSON.stringify(value)},`);

describe('what the Sets and Oils work adds to the catalogue file', () => {
  it('stays inside 300 KB, and is only on sets, oils and the offers of sets', () => {
    let total = 0;
    let onBottles = 0;
    for (const e of CATALOGUE as unknown as { id: string; giftSet?: Record<string, unknown>; oil?: unknown }[]) {
      if (e.giftSet) {
        for (const f of PLAN_SET_FIELDS) if (f in e.giftSet) total += bytes(f, e.giftSet[f]);
      } else if (e.oil !== undefined) {
        total += bytes('oil', e.oil);
      }
      if (!e.giftSet && PLAN_SET_FIELDS.some((f) => f in e)) onBottles += 1;
    }
    for (const [id, offers] of Object.entries(CRAWLED as unknown as Record<string, { title?: string }[]>)) {
      const isSet = id.startsWith('set-');
      for (const o of offers) {
        if (o.title === undefined) continue;
        expect(isSet, `${id} has an offer title and is no set`).toBe(true);
        total += bytes('title', o.title);
      }
    }
    expect(onBottles).toBe(0);
    console.log(`Sets and Oils fields in the catalogue file: ${(total / 1024).toFixed(1)} KB of the ${(LIMIT_BYTES / 1024).toFixed(0)} KB allowed`);
    expect(total).toBeLessThan(LIMIT_BYTES);
    expect(total).toBeGreaterThan(50 * 1024);
  });
});
