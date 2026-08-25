import { describe, expect, it } from 'vitest';
import { buildHarvestReport, type ShopHarvestOutcome } from '../src/catalogue/harvestReport.js';

/**
 * The two facts this report exists to preserve are both about what a log
 * cannot say after a killed run: which shops were never asked, and whether the
 * run finished at all. Run #328 lost both — the harvest hit its 60-minute step
 * cap, so the end-of-run summary never printed and the unreached shops left no
 * trace, while the run itself still reported success.
 */

function shop(id: string, over: Partial<ShopHarvestOutcome> = {}): ShopHarvestOutcome {
  return {
    retailerId: id,
    name: id,
    urlsDiscovered: 10,
    pagesFetched: 5,
    priced: 5,
    tier: 'free',
    renderer: null,
    errorCount: 0,
    errors: [],
    finishedAt: '2026-08-25T12:00:00.000Z',
    ...over,
  };
}

describe('buildHarvestReport — silence made visible', () => {
  it('names the shops that were planned but never reported', () => {
    const r = buildHarvestReport('T0', ['a', 'b', 'c'], [shop('a')], null);
    expect(r.notReached).toEqual(['b', 'c']);
  });

  it('reports nothing unreached when every planned shop answered', () => {
    const r = buildHarvestReport('T0', ['a', 'b'], [shop('a'), shop('b')], 'T1');
    expect(r.notReached).toEqual([]);
  });

  it('keeps the planned order, so the truncation point is readable', () => {
    // Shops are ordered never-live-first by the harvest, so *where* the run
    // stopped is itself information.
    const r = buildHarvestReport('T0', ['a', 'b', 'c', 'd'], [shop('a'), shop('b')], null);
    expect(r.notReached).toEqual(['c', 'd']);
  });
});

describe('buildHarvestReport — a truncated run says so', () => {
  it('is incomplete until finished', () => {
    const r = buildHarvestReport('T0', ['a'], [shop('a')], null);
    expect(r.complete).toBe(false);
    expect(r.finishedAt).toBeNull();
  });

  it('is complete once a finish time is recorded', () => {
    const r = buildHarvestReport('T0', ['a'], [shop('a')], 'T1');
    expect(r.complete).toBe(true);
  });

  it('does not infer completeness from having reached every shop', () => {
    // A run can be killed after its last shop and before its final write. That
    // is still a truncated run, and `complete` is the only thing that says so.
    const r = buildHarvestReport('T0', ['a'], [shop('a')], null);
    expect(r.notReached).toEqual([]);
    expect(r.complete).toBe(false);
  });
});

describe('buildHarvestReport — which tier produced the listings', () => {
  it('records the renderer by name when a render produced them', () => {
    // "The render tier worked" means something different on a free local
    // Chromium (datacenter IP) than on a paid Apify actor (residential), and
    // that difference is the open question the tier was built to answer.
    const r = buildHarvestReport(
      'T0', ['a'],
      [shop('a', { tier: 'render', renderer: 'local browser', priced: 42 })],
      'T1',
    );
    expect(r.shops[0]?.tier).toBe('render');
    expect(r.shops[0]?.renderer).toBe('local browser');
  });

  it('leaves the renderer null for a shop the free route handled', () => {
    const r = buildHarvestReport('T0', ['a'], [shop('a')], 'T1');
    expect(r.shops[0]?.tier).toBe('free');
    expect(r.shops[0]?.renderer).toBeNull();
  });

  it('distinguishes a shop that yielded nothing from one never asked', () => {
    // Both look like absence on the site; only one is the shop's own answer.
    const r = buildHarvestReport(
      'T0', ['asked', 'never'],
      [shop('asked', { tier: 'none', priced: 0, errorCount: 3, errors: ['HTTP 403'] })],
      null,
    );
    expect(r.shops[0]?.tier).toBe('none');
    expect(r.shops[0]?.priced).toBe(0);
    expect(r.notReached).toEqual(['never']);
  });

  it('distinguishes a shop that refused us from one that was simply empty', () => {
    // The third case, and the one run #330 could not report. Boots and a shop
    // with an empty aisle both came out as "0 priced, 0 listings parsed";
    // only one of them is a decision for a human.
    const r = buildHarvestReport(
      'T0', ['boots', 'empty'],
      [
        shop('boots', {
          tier: 'none', priced: 0,
          refusals: [{
            url: 'https://www.boots.com/fragrance/shop-all-fragrance?pageNo=1',
            status: 200, bytes: 1199,
            reason: 'HTTP 200 but only 1199 bytes — a bot wall, not an empty shop',
          }],
        }),
        shop('empty', { tier: 'none', priced: 0 }),
      ],
      'T1',
    );

    expect(r.shops[0]?.refusals?.[0]?.bytes).toBe(1199);
    expect(r.shops[1]?.refusals).toBeUndefined();
  });
});
