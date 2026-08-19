import { gunzipSync } from 'node:zlib';
import type { Http } from './attempt.js';

/**
 * The HTTP implementation the harvesters share.
 *
 * Both harvest scripts had grown their own near-identical copy of this, and
 * both had the same hole in it.
 *
 * ── Why a gzipped sitemap needs handling here ────────────────────────────────
 * `sitemapCrawl.ts` recognises `.xml.gz` URLs and happily queues them, because
 * a compressed sitemap is completely ordinary — it is what the sitemap protocol
 * recommends for large ones, and big retailers use it. But nothing then
 * decompressed the response.
 *
 * The trap is that `fetch` looks like it already handles this. It does, for
 * *transport* compression: a server that sends `Content-Encoding: gzip` is
 * decoded transparently by undici before `res.text()` ever sees it. A
 * `.xml.gz` file is a different thing — the gzip bytes are the resource
 * itself, usually served as `Content-Type: application/gzip`, and nothing
 * unwraps those. `res.text()` therefore returns the raw deflate stream decoded
 * as UTF-8, i.e. mojibake, in which the `<loc>` regex naturally matches
 * nothing.
 *
 * The failure is silent and reads as innocent: HTTP 200, no error, zero URLs
 * found. That is exactly the symptom Boots has been reporting on every run —
 * `0 urls  0 fetched  0 priced listings` with no error line — while looking
 * for all the world like a shop that simply has no fragrance sitemap.
 *
 * Confirmed locally against a server serving a real gzipped sitemap: `.text()`
 * yielded binary, and gunzipping the same bytes yielded the XML. Whether it is
 * *Boots's* cause is still unproven and needs a CI run against the live site.
 *
 * Detection is by the gzip magic number rather than by URL suffix or
 * content-type, because a shop can serve compressed bytes from a URL that does
 * not end in `.gz`, and can mislabel the content type. The first two bytes of
 * a gzip member are always 0x1f 0x8b, so the payload answers the question
 * itself.
 */

/** The two bytes every gzip member starts with. */
function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * Decode a response body, transparently unwrapping a gzip payload.
 *
 * Exported for tests: this is the part worth pinning, and it needs no network.
 */
export function decodeBody(bytes: Uint8Array): string {
  if (!isGzip(bytes)) return new TextDecoder().decode(bytes);
  try {
    return gunzipSync(Buffer.from(bytes)).toString('utf8');
  } catch {
    // Truncated or corrupt gzip. Returning the raw decode keeps the caller on
    // the "found nothing" path rather than throwing mid-crawl, which is the
    // same outcome as before this existed and no worse.
    return new TextDecoder().decode(bytes);
  }
}

export interface HttpOptions {
  /** Abort a request that has not answered within this many milliseconds. */
  timeoutMs?: number;
}

/** Build an `Http` that decompresses gzip payloads and never throws. */
export function createHttp(options: HttpOptions = {}): Http {
  const timeoutMs = options.timeoutMs ?? 25_000;

  return async (url, headers) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
      const bytes = new Uint8Array(await res.arrayBuffer());
      // res.url is the address after redirects were followed, which is a
      // different fact from the one requested and the only one that can
      // answer "where does this link actually land". See HttpResponse.finalUrl.
      return { status: res.status, body: decodeBody(bytes), ok: res.ok, finalUrl: res.url };
    } catch (err) {
      // `TypeError: fetch failed` on its own says nothing about why. undici
      // carries the real reason on `cause`, and a crawl report that cannot
      // tell a dead domain from a dropped socket is not much of a report.
      const cause = (err as { cause?: unknown }).cause;
      const detail = cause ? ` (${String(cause).slice(0, 80)})` : '';
      return { status: 0, body: '', ok: false, error: `${String(err).slice(0, 120)}${detail}` };
    } finally {
      clearTimeout(timer);
    }
  };
}
