import { describe, expect, it } from 'vitest';
import {
  classifyImageAttempt,
  classifyRefererSensitivity,
  isRetryableFailure,
  type ImageAttempt,
} from '../src/catalogue/imageLinkCheck.js';

/** A clean 200 image response, so each test only states what it varies. */
const attempt = (over: Partial<ImageAttempt> = {}): ImageAttempt => ({
  status: 200,
  contentType: 'image/jpeg',
  error: null,
  ...over,
});

describe('classifyImageAttempt', () => {
  it('is ok for a real image response', () => {
    expect(classifyImageAttempt(attempt()).verdict).toBe('ok');
  });

  it('is broken for a 404 — the shop confirms the image is gone', () => {
    const result = classifyImageAttempt(attempt({ status: 404, contentType: 'text/html' }));
    expect(result.verdict).toBe('broken');
    expect(result.reason).toMatch(/404/);
  });

  it('is broken for a 403 — the shop refused it', () => {
    expect(classifyImageAttempt(attempt({ status: 403, contentType: 'text/html' })).verdict).toBe('broken');
  });

  it('is broken for a 200 that is not actually an image', () => {
    const result = classifyImageAttempt(attempt({ contentType: 'text/html' }));
    expect(result.verdict).toBe('broken');
    expect(result.reason).toMatch(/not an image/);
  });

  it('is broken for a 200 with no content-type at all', () => {
    expect(classifyImageAttempt(attempt({ contentType: null })).verdict).toBe('broken');
  });

  // This is the whole point of the rewrite: the checker's own connection
  // failures (`status: null`) must never read as the shop's fault.
  it('is unverified — never broken — when the request never reached the shop', () => {
    const result = classifyImageAttempt({
      status: null,
      contentType: null,
      error: 'TypeError: fetch failed (AggregateError)',
    });
    expect(result.verdict).toBe('unverified');
    expect(result.verdict).not.toBe('broken');
    expect(result.reason).toMatch(/never reached the shop/);
  });

  it('carries the network error text into the unverified reason', () => {
    const result = classifyImageAttempt({ status: null, contentType: null, error: 'ECONNRESET' });
    expect(result.reason).toContain('ECONNRESET');
  });

  it('does not blame the shop when no error detail survived', () => {
    const result = classifyImageAttempt({ status: null, contentType: null, error: null });
    expect(result.verdict).toBe('unverified');
    expect(result.reason).toMatch(/no further detail/);
  });
});

describe('isRetryableFailure', () => {
  it('retries a null status — a connection failure that might succeed next time', () => {
    expect(isRetryableFailure({ status: null, contentType: null, error: 'boom' })).toBe(true);
  });

  it('never retries a real HTTP status, even a bad one', () => {
    expect(isRetryableFailure(attempt({ status: 404, contentType: 'text/html' }))).toBe(false);
    expect(isRetryableFailure(attempt({ status: 500, contentType: 'text/html' }))).toBe(false);
    expect(isRetryableFailure(attempt())).toBe(false);
  });
});

describe('classifyRefererSensitivity', () => {
  it('is ok when the image is served regardless of referer', () => {
    const result = classifyRefererSensitivity({ withReferer: attempt(), withoutReferer: attempt() });
    expect(result.verdict).toBe('ok');
  });

  // The finding that actually matters for this site: demo/photo.ts renders
  // every product <img> with referrerpolicy="no-referrer", so a real reader's
  // browser sends no referer at all. A host that only serves the
  // pricesniffs-referer'd request will show that reader a broken tile.
  it('flags blocks-no-referer when the refererless request — what a reader actually sends — fails', () => {
    const result = classifyRefererSensitivity({
      withReferer: attempt(),
      withoutReferer: attempt({ status: 403, contentType: 'text/html' }),
    });
    expect(result.verdict).toBe('blocks-no-referer');
    expect(result.reason).toMatch(/referrerpolicy="no-referrer"/);
  });

  it('flags blocks-pricesniffs-referer the other way around, and notes it does not affect readers today', () => {
    const result = classifyRefererSensitivity({
      withReferer: attempt({ status: 403, contentType: 'text/html' }),
      withoutReferer: attempt(),
    });
    expect(result.verdict).toBe('blocks-pricesniffs-referer');
    expect(result.reason).toMatch(/referrerpolicy="no-referrer"/);
  });

  it('is blocks-both when neither request is served — not a referer signal', () => {
    const result = classifyRefererSensitivity({
      withReferer: attempt({ status: 404, contentType: 'text/html' }),
      withoutReferer: attempt({ status: 404, contentType: 'text/html' }),
    });
    expect(result.verdict).toBe('blocks-both');
  });

  it('is inconclusive when either side is our own connection failure, not the shop answering', () => {
    const networkFailure: ImageAttempt = { status: null, contentType: null, error: 'timeout' };
    expect(
      classifyRefererSensitivity({ withReferer: networkFailure, withoutReferer: attempt() }).verdict,
    ).toBe('inconclusive');
    expect(
      classifyRefererSensitivity({ withReferer: attempt(), withoutReferer: networkFailure }).verdict,
    ).toBe('inconclusive');
  });

  it('never lets an inconclusive pair read as ok or as a block', () => {
    const networkFailure: ImageAttempt = { status: null, contentType: null, error: 'timeout' };
    const result = classifyRefererSensitivity({ withReferer: networkFailure, withoutReferer: networkFailure });
    expect(result.verdict).toBe('inconclusive');
  });
});
