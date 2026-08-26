import { describe, expect, it } from 'vitest';
import {
  renderRefusal,
  renderRefusals,
  knownRenderRefusal,
  REFUSAL_MAX_BYTES,
} from '../src/catalogue/renderRefusal.js';

/**
 * Every figure in this file is a real measurement — from run #330's committed
 * harvest report, from harvest probe run 19, or from a Chromium render against
 * a local server in this sandbox. See src/catalogue/renderRefusal.ts for where
 * each one came from.
 */
describe('renderRefusal — the case it was built for', () => {
  it('calls the Boots page what it is', () => {
    // data/harvest-report.json, run #330:
    //   https://www.boots.com/fragrance/shop-all-fragrance?pageNo=1: HTTP 200, 1199 bytes
    const r = renderRefusal({
      url: 'https://www.boots.com/fragrance/shop-all-fragrance?pageNo=1',
      status: 200,
      bytes: 1199,
      listingsParsed: 0,
    });

    expect(r).not.toBeNull();
    expect(r!.reason).toContain('1199 bytes');
    expect(r!.reason).toContain('bot wall');
  });

  it('does not call a real catalogue page a refusal', () => {
    // Notino's own /fragrance/?page=1 on the same run: HTTP 200, 699,656 bytes.
    // Nothing parsed out of it either, which is a parser question, not a
    // blocking question, and the two must not be conflated.
    expect(
      renderRefusal({
        url: 'https://www.notino.co.uk/fragrance/?page=1',
        status: 200,
        bytes: 699_656,
        listingsParsed: 0,
      }),
    ).toBeNull();

    // John Lewis through Apify's actor, harvest probe run 19.
    expect(
      renderRefusal({ url: 'https://www.johnlewis.com/x', status: 200, bytes: 1_067_905, listingsParsed: 0 }),
    ).toBeNull();
  });
});

describe('renderRefusal — an HTTP refusal is a refusal at any size', () => {
  it('reads a 403 as this address being refused', () => {
    // Notino, run #330: HTTP 403 at 27,520 bytes — a challenge page big
    // enough to clear any byte threshold, which is why the status is checked
    // in its own right.
    const r = renderRefusal({
      url: 'https://www.notino.co.uk/perfumes-for-women/?f=page-1',
      status: 403,
      bytes: 27_520,
      listingsParsed: 0,
    });
    expect(r).not.toBeNull();
    expect(r!.reason).toContain('403');
    expect(r!.reason).toContain('refused');
  });

  it('leaves a 5xx alone, because a bad minute and a wall look the same', () => {
    // Harvey Nichols, run #330: HTTP 503, 9,288 bytes. "HTTP 503" already says
    // everything that is known, and guessing past it would be inventing.
    expect(
      renderRefusal({ url: 'https://www.harveynichols.com/x', status: 503, bytes: 9_288, listingsParsed: 0 }),
    ).toBeNull();
  });
});

describe('renderRefusal — products are the disproof', () => {
  it('never calls a page a refusal when listings came out of it', () => {
    // A small shop's short category page is small and legitimate. The products
    // settle it, so no threshold can misjudge one.
    expect(
      renderRefusal({ url: 'https://small.example/cat', status: 200, bytes: 3_000, listingsParsed: 12 }),
    ).toBeNull();
    expect(
      renderRefusal({ url: 'https://small.example/cat', status: 403, bytes: 900, listingsParsed: 4 }),
    ).toBeNull();
  });

  it('does not judge an empty body — nothing rendered is a different failure', () => {
    // status 0, 0 bytes is the shape localBrowser returns for a page it never
    // reached. That is a budget or a timeout, already reported as one.
    expect(
      renderRefusal({ url: 'https://x.example/a', status: 0, bytes: 0, listingsParsed: 0 }),
    ).toBeNull();
  });
});

describe('REFUSAL_MAX_BYTES', () => {
  it('sits between the measured refusals and the measured catalogue floor', () => {
    // Above every 2xx refusal measured: a 1,070-byte rendered interstitial and
    // Boots' 1,199 bytes.
    expect(REFUSAL_MAX_BYTES).toBeGreaterThan(1_199);
    // Below what 24 real Beauty Base listings cost as bare schema.org JSON-LD
    // with no page around them at all: 9,526 bytes, measured over
    // data/catalogue/beautybase.json.
    expect(REFUSAL_MAX_BYTES).toBeLessThan(9_526);
  });
});

describe('knownRenderRefusal — sparing the render tier a question already answered', () => {
  it('says nothing about a shop the flag has not been set on', () => {
    // Undefined must read the same as false — this file's usual convention
    // for "not yet measured", not "known to be fine". See the field's own
    // doc comment on Retailer in src/types/retailer.ts.
    expect(knownRenderRefusal({ name: 'Some Shop' })).toBeNull();
    expect(knownRenderRefusal({ name: 'Some Shop', renderRefused: false })).toBeNull();
  });

  it('names the shop and points at its registry entry once flagged', () => {
    // Superdrug, data/harvest-report.json commits 7b47962 and b9a4c1a: two
    // real render attempts, both HTTP 403 at 317 and 341 bytes.
    const reason = knownRenderRefusal({ name: 'Superdrug', renderRefused: true });
    expect(reason).not.toBeNull();
    expect(reason).toContain('Superdrug');
    expect(reason).toContain('registry entry');
  });
});

describe('renderRefusals', () => {
  it('reports every refused page of a shop that served a mix', () => {
    const out = renderRefusals([
      { url: 'https://s.example/a', status: 200, bytes: 800_000, listingsParsed: 60 },
      { url: 'https://s.example/b', status: 403, bytes: 27_500, listingsParsed: 0 },
      { url: 'https://s.example/c', status: 200, bytes: 1_100, listingsParsed: 0 },
    ]);

    expect(out.map((r) => r.url)).toEqual(['https://s.example/b', 'https://s.example/c']);
    expect(out.map((r) => r.bytes)).toEqual([27_500, 1_100]);
  });
});
