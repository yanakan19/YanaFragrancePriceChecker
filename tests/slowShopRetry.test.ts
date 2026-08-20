import { describe, it, expect } from 'vitest';
import { looksLikeTimeouts, SLOW_SHOP_TIMEOUT_MS } from '../src/catalogue/strategy.js';

/**
 * The distinction this makes is what decides whether a shop costs money.
 * A timeout is answered for free by waiting longer; a refusal is not answered
 * by waiting at all, and escalating it to a metered tier is the correct — and
 * expensive — next step. Getting the two the wrong way round either burns
 * budget on a slow server or gives up on one.
 */
describe('looksLikeTimeouts', () => {
  it('recognises John Lewis, which never refused us — it just had not answered', () => {
    // Verbatim from run 261, job 96314578076.
    expect(
      looksLikeTimeouts([
        'https://www.johnlewis.com/sitemap.xml: HTTP 0',
        'https://www.johnlewis.com/browse/beauty/womens-fragrance/_/N-a63: HTTP 0',
      ]),
    ).toBe(true);
  });

  it('does not recognise a clean refusal, which waiting cannot fix', () => {
    // Verbatim from the same run: Notino, Superdrug, Selfridges.
    expect(looksLikeTimeouts(['https://www.notino.co.uk/sitemap.xml: HTTP 403'])).toBe(false);
    expect(looksLikeTimeouts(['https://www.superdrug.com/sitemap.xml: HTTP 403'])).toBe(false);
  });

  it('does not recognise a shop that both refuses and stalls', () => {
    expect(
      looksLikeTimeouts([
        'https://x.test/sitemap.xml: HTTP 0',
        'https://x.test/fragrance: HTTP 403',
      ]),
    ).toBe(false);
  });

  it('does not recognise a shop that simply found nothing', () => {
    expect(looksLikeTimeouts([])).toBe(false);
    expect(looksLikeTimeouts(["stopped early: exceeded this shop's time budget"])).toBe(false);
  });

  it('recognises an aborted request described in words rather than a status', () => {
    expect(looksLikeTimeouts(['https://x.test/a: AbortError: This operation was aborted'])).toBe(true);
  });

  it('waits meaningfully longer than the 25s default that produced the timeouts', () => {
    expect(SLOW_SHOP_TIMEOUT_MS).toBeGreaterThan(25_000);
  });
});
