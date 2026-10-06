/**
 * Who PriceSniffs says it is, to every shop, everywhere.
 *
 * One identity, one place. Until 2026-10-04 most shops were read with browser
 * style request headers (a desktop Chrome user agent), and only a shop with a
 * pinned sitemap route or `botIdentityOnly` (a registry field, now removed) was asked as the crawler. The owner
 * decided on 2026-10-04 that every shop is read as PriceSniffsBot, with this
 * user agent and honest headers: the harvest, the probe, the feed reads, the
 * logo probe, the price and delivery checks, the image checks and anything else
 * that asks a shop for something.
 *
 * A shop that answers the bot is read. A shop that refuses it (a 403, a wall, a
 * robots.txt that disallows it) is handled by the refusal rules that already
 * exist: nothing new is fetched, its prices go stale and drop off the site after
 * HIDE_OFFER_AFTER_DAYS days. A refusal is never worked around: not by a browser
 * user agent, not by a second ask for robots.txt in a browser's clothes, not by
 * a residential proxy, not by a rendered browser presenting as a visitor.
 *
 * ── What honest means here ───────────────────────────────────────────────────
 * The user agent names the crawler and a page that says what it is
 * (/about/bot, the crawler's own page since 2026-10-06), and nothing in a request pretends to be a browser. So these are
 * refused by `assertBotIdentity`, which every shared HTTP client runs before it
 * sends anything:
 *   - a `user-agent` that is not ours (above all one that starts "Mozilla");
 *   - headers only a browser sends: `sec-ch-ua*`, `sec-fetch-*`,
 *     `upgrade-insecure-requests`.
 * Headers that state a preference or a choice stay allowed, because a bot may
 * honestly send them: `accept`, `accept-language`, `cookie` (the market a
 * storefront was asked to price in), `referer` (the address a request is about,
 * as the image checks send), `authorization` and the like for a shop's own feed.
 *
 * Tests hold this: tests/botIdentity.test.ts checks that no source file in src/
 * or scripts/ carries a browser user agent, and that every client refuses one.
 */

/** The crawler's name, as the user agent and its page spell it. */
export const BOT_NAME = 'PriceSniffsBot';

/**
 * The crawler's name and the page that explains it. The one string every
 * request carries. The page, /about/bot (demo/app.ts, botPageView), says what
 * the bot is, how often it visits, that it obeys robots.txt and how to stop it.
 */
export const BOT_USER_AGENT =
  'PriceSniffsBot/0.2 (UK fragrance price comparison; +https://pricesniffs.space/about/bot)';

/**
 * The lowercase token a robots.txt group is matched on. The user agent above
 * starts with this name; parseRobots in robots.ts reads the same word.
 */
export const BOT_ROBOTS_TOKEN = 'pricesniffsbot';

/**
 * Whether Apify's residential proxy and paid browser actor may be used at all.
 *
 * Off since 2026-10-04, on the owner's decision that every shop is read as
 * PriceSniffsBot and a refusal is never worked around. A residential address
 * exists to get past an IP refusal and a browser actor rendering as a visitor
 * exists to get past a bot wall, and the actor's requests cannot be shown to
 * carry the bot's user agent (it builds its own browser fingerprint). The code
 * stays, so turning them back on is an owner's decision and not a rewrite; the
 * harvest and the probe are the only callers and both read this.
 */
export const METERED_TIERS_ENABLED = false;

/** The headers of an ordinary request to a shop's page or feed. Never mutated. */
export const BOT_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'user-agent': BOT_USER_AGENT,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
});

/**
 * Headers for one kind of file, still as the bot: an image check asks for
 * images, a feed asks for the feed's own type. The user agent is not a
 * parameter, on purpose.
 */
export function botHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const merged: Record<string, string> = { ...BOT_HEADERS };
  for (const [name, value] of Object.entries(extra)) merged[name.toLowerCase()] = value;
  assertBotIdentity(merged);
  return merged;
}

/** A header that only a browser sends, and a bot has no business sending. */
const BROWSER_ONLY_HEADER = /^(sec-ch-ua|sec-fetch-|upgrade-insecure-requests$)/i;

/**
 * Why these headers are not the bot's, or null when they are.
 *
 * Pure, so it is tested without a network and run by every client before a
 * request leaves.
 */
export function dishonestHeaders(headers: Readonly<Record<string, string>> | undefined): string | null {
  if (!headers) return null;
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (name === 'user-agent') {
      if (!value.startsWith('PriceSniffsBot/')) return `user-agent "${value.slice(0, 60)}" is not PriceSniffsBot`;
    } else if (BROWSER_ONLY_HEADER.test(name)) {
      return `header ${name} is one only a browser sends`;
    }
  }
  return null;
}

/** Throws unless the headers are the bot's. */
export function assertBotIdentity(headers: Readonly<Record<string, string>> | undefined): void {
  const why = dishonestHeaders(headers);
  if (why) throw new Error(`Refusing to send a request that does not identify as PriceSniffsBot: ${why}`);
}

/**
 * The headers a client actually sends: these, with our user agent added where
 * the caller gave none (a node `fetch` left alone sends "node", which is no
 * better). Throws, via `assertBotIdentity`, on anything that would disguise the
 * bot.
 */
export function withBotIdentity(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
  assertBotIdentity(headers);
  const out: Record<string, string> = { ...(headers ?? {}) };
  if (!Object.keys(out).some((n) => n.toLowerCase() === 'user-agent')) out['user-agent'] = BOT_USER_AGENT;
  return out;
}
