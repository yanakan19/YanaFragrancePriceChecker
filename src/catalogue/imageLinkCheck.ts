/**
 * Deciding what one image request actually proved.
 *
 * Split out of scripts/image-link-check.ts for the same reason
 * src/catalogue/brandSiteCheck.ts was split out of scripts/brand-site-probe.ts:
 * this environment has no outbound network (docs/INGESTION.md), so the half
 * that fetches cannot be exercised here at all, but the half that *judges* a
 * completed fetch can — and should be, because a checker that cannot tell its
 * own failure apart from the shop's is worse than no checker.
 *
 * ── The distinction this file exists to draw ─────────────────────────────────
 * A HEAD/GET request against an image URL can fail two structurally different
 * ways, and the first run of the old checker conflated them completely: every
 * one of its 20,317 "broken" entries carried `status: null` and the identical
 * message `TypeError: fetch failed (AggregateError)` — not one had a real HTTP
 * status like 404. That is not evidence a shop deleted 20,317 photos; it is
 * the checker's own connections failing before a shop ever answered. `undici`
 * wraps a failed connect (both address families refused or timed out — Node's
 * `autoSelectFamily` dual-stack race) in exactly that shape: `TypeError: fetch
 * failed` with an `AggregateError` cause whose own message is empty, which
 * stringifies to the literal word "AggregateError" and nothing more. A server
 * that is actually gone answers with a real status or a DNS failure with its
 * own distinct message (`ENOTFOUND`) — this was neither, uniformly, across
 * every failure, which is the signature of the requester failing to connect,
 * not the resource being absent.
 *
 *   - The shop answered (any HTTP status, even a bad one, even a redirect that
 *     landed somewhere odd): that is real signal about the image and belongs
 *     in `broken` when it isn't a usable photo.
 *   - The request never reached the shop at all (timeout, connection refused,
 *     DNS failure, socket reset): that is a fact about *this run*, not about
 *     the shop's photo, and must never be reported as broken.
 */

export interface ImageAttempt {
  /** A real HTTP status from the shop, or null if the request never completed. */
  status: number | null;
  contentType: string | null;
  /** Present only when `status` is null — the reason the request never landed. */
  error: string | null;
}

export type ImageVerdict = 'ok' | 'broken' | 'unverified';

export interface ImageClassification {
  verdict: ImageVerdict;
  reason: string;
}

/**
 * Judge one completed (or failed) image request.
 *
 * `unverified` is deliberately never folded into `broken` — see the file
 * header. A caller that retried a `null`-status attempt and still got one
 * should report `unverified`, not silently upgrade repeated bad luck into a
 * finding about the shop.
 */
export function classifyImageAttempt(a: ImageAttempt): ImageClassification {
  if (a.status === null) {
    return {
      verdict: 'unverified',
      reason:
        `the request never reached the shop — ${a.error ?? 'no further detail'} — this is a ` +
        'fact about our connection, not about the image, and is never counted as broken',
    };
  }
  if (a.status >= 400) {
    return {
      verdict: 'broken',
      reason:
        a.status === 404
          ? 'HTTP 404 — the shop confirms this image is gone'
          : `HTTP ${a.status} — the shop itself refused or failed to serve this image`,
    };
  }
  if (!a.contentType || !a.contentType.startsWith('image/')) {
    return {
      verdict: 'broken',
      reason:
        `HTTP ${a.status} but content-type is ${a.contentType ?? 'missing'}, not an image — ` +
        'likely an error page or placeholder served with a 200',
    };
  }
  return { verdict: 'ok', reason: `HTTP ${a.status} ${a.contentType}` };
}

/**
 * Whether a completed attempt is worth retrying.
 *
 * Only a `null` status (our own connection failure) is retryable — a real
 * HTTP response, even a bad one, is the shop's actual answer and asking again
 * cannot change what already happened. Retrying a genuine 404 would just be
 * hammering a shop for free.
 */
export function isRetryableFailure(a: ImageAttempt): boolean {
  return a.status === null;
}

/* ── Bug 2: does this host serve an image differently depending on Referer? ── */

export interface RefererProbe {
  withReferer: ImageAttempt;
  withoutReferer: ImageAttempt;
}

export type RefererVerdict =
  | 'ok'
  | 'blocks-no-referer'
  | 'blocks-pricesniffs-referer'
  | 'blocks-both'
  | 'inconclusive';

export interface RefererClassification {
  verdict: RefererVerdict;
  reason: string;
}

/**
 * Compare the same image fetched two ways: once with
 * `Referer: https://pricesniffs.space/`, once with none at all.
 *
 * ── Why "no referer" is the case that actually matters here ──────────────────
 * The task that motivated this assumed a reader's browser sends
 * `Referer: https://pricesniffs.space/` when it loads a hot-linked image,
 * because that is what an ordinary `<img>` tag does. This site's does not:
 * demo/photo.ts renders every product photo with `referrerpolicy="no-referrer"`
 * (confirmed in demo/photo.ts, demo/app.ts and the built demo/index.html and
 * demo/404.html), so a real reader's browser sends no Referer header at all,
 * ever, to any retailer's CDN. That makes `blocks-no-referer` — a host that
 * serves the pricesniffs-referer request but refuses the identical refererless
 * one — the finding that actually predicts a broken tile for a real reader,
 * and `blocks-pricesniffs-referer` the one that currently doesn't matter
 * (unless `referrerpolicy` is ever removed). Both are reported; only the first
 * is the live risk today.
 */
export function classifyRefererSensitivity(probe: RefererProbe): RefererClassification {
  const withReferer = classifyImageAttempt(probe.withReferer);
  const withoutReferer = classifyImageAttempt(probe.withoutReferer);

  if (withReferer.verdict === 'unverified' || withoutReferer.verdict === 'unverified') {
    return {
      verdict: 'inconclusive',
      reason:
        'one of the paired requests never reached the shop — a network failure on our end, ' +
        'not a fact about referer handling — so this pair proves nothing',
    };
  }

  const servedWithReferer = withReferer.verdict === 'ok';
  const servedWithoutReferer = withoutReferer.verdict === 'ok';

  if (servedWithReferer && servedWithoutReferer) {
    return { verdict: 'ok', reason: 'served the image regardless of referer' };
  }
  if (!servedWithReferer && !servedWithoutReferer) {
    return {
      verdict: 'blocks-both',
      reason: 'refused the image either way — not referer-specific; check the URL itself, not referer handling',
    };
  }
  if (servedWithReferer && !servedWithoutReferer) {
    return {
      verdict: 'blocks-no-referer',
      reason:
        'served the image with a pricesniffs.space referer but refused the identical request ' +
        'with no referer at all — that refererless request is exactly what a real reader\'s ' +
        'browser sends (this site\'s <img> tags carry referrerpolicy="no-referrer"), so this ' +
        "retailer's images will show broken to readers today",
    };
  }
  return {
    verdict: 'blocks-pricesniffs-referer',
    reason:
      'served the image with no referer but refused it when the referer was pricesniffs.space — ' +
      "a reader is unaffected only because this site's <img> tags send no referer " +
      '(referrerpolicy="no-referrer"); if that policy is ever removed this retailer would start ' +
      'showing broken tiles',
  };
}
