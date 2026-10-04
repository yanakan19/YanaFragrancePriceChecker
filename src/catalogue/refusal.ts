/**
 * Whether a shop said no to the bot.
 *
 * Every shop is read as PriceSniffsBot (src/catalogue/botIdentity.ts), and a
 * shop that refuses the bot is handled honestly: recorded as refused, left
 * alone, and its stored prices go stale and drop off the site after
 * HIDE_OFFER_AFTER_DAYS days. It is never retried through a proxy, a rendered
 * browser or a second ask in a browser's clothes (owner's decision,
 * 2026-10-04: never work around a refusal).
 *
 * What counts is what the shop said, not how long it took: an HTTP 401, 403, 407
 * or 429 is a refusal, whatever the body. A timeout, a 404 or a 5xx is not
 * judged here (a shop may be slow, or have a bad minute, and the harvest already
 * retries a slow shop once), and neither is a robots.txt that disallows a path,
 * which stops that path before anything is asked.
 */

/** The statuses that are a refusal whatever the body says. Same set as renderRefusal.ts. */
const REFUSING_STATUS = /\bHTTP (401|403|407|429)\b/;

/**
 * The first line of a shop's errors that is a refusal, or null when none is.
 * A harvest error reads "https://www.notino.co.uk/sitemap.xml: HTTP 403".
 */
export function refusalIn(errors: readonly string[]): string | null {
  return errors.find((e) => REFUSING_STATUS.test(e)) ?? null;
}
