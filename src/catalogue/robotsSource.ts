import type { Http } from './attempt.js';
import {
  parseRobots, NO_RESTRICTIONS, UNREACHABLE_ROBOTS, type RobotsRules,
} from './robots.js';

/**
 * Where a shop's robots.txt actually lives, for a registry whose `domain` is
 * not always a bare apex.
 *
 * ── The bug this exists to fix, measured ─────────────────────────────────────
 * `loadRobots` in attempt.ts asks exactly one address: `https://www.{domain}/
 * robots.txt`. That is right for `boots.com` and wrong for every entry whose
 * domain already carries a subdomain, and this registry has several —
 * `uk.shopfrenchavenue.com`, `uk.zimayaperfumes.com`. For those it asks
 * `https://www.uk.shopfrenchavenue.com/robots.txt`, a hostname that need not
 * resolve at all.
 *
 * A DNS failure is not a 4xx, so it does not take `loadRobots`'s "no file
 * published, therefore nothing forbidden" branch. It takes the other one and
 * returns `UNREACHABLE_ROBOTS`, which `isAllowed` treats as *everything
 * disallowed* — correctly, because a shop that might be refusing must not be
 * crawled on the assumption that it is not.
 *
 * The consequence is silent, and that is what made it survive so long.
 * `crawlViaSitemap`'s discovery loop skips a disallowed URL with `continue`
 * and pushes no error, so a shop in this state reports the single most
 * uninformative line this pipeline can produce:
 *
 *     French Avenue            0 urls    0 fetched    0 priced listings
 *     IBRAQ                    0 urls    0 fetched    0 priced listings
 *
 * — no error, no HTTP status, nothing to read. Both lines are from run 261
 * (job 96314578076, 2026-08-20T04:29Z), and both shops had been sitting on
 * exactly that output since they were enabled, looking for all the world like
 * retailers that had been asked and had nothing.
 *
 * ── What this asks instead ──────────────────────────────────────────────────
 * The registry already records the shop's own origin in `homepage`, which is
 * the address a human checked. That goes first. `www.{domain}` stays, second,
 * because it is what has always worked for an apex domain and a shop can
 * serve robots.txt there and nowhere else. The bare `{domain}` is third, for
 * an apex that does not answer on `www` at all.
 *
 * Kept pure and separate from the fetching below so the ordering can be
 * asserted without a network — see tests/robotsSource.test.ts.
 */
export function robotsCandidateUrls(
  retailer: { domain: string; homepage?: string },
): string[] {
  const urls: string[] = [];
  const add = (u: string) => {
    if (!urls.includes(u)) urls.push(u);
  };

  if (retailer.homepage) {
    try {
      add(`${new URL(retailer.homepage).origin}/robots.txt`);
    } catch {
      // A malformed homepage is not a reason to skip the domain candidates.
    }
  }
  add(`https://www.${retailer.domain}/robots.txt`);
  add(`https://${retailer.domain}/robots.txt`);
  return urls;
}

/**
 * What one robots.txt response means, before any other candidate is consulted.
 *
 *   - `rules`      — the shop published a file and it parsed. Stop asking.
 *   - `absent`     — a 4xx. This *host* publishes no restrictions, but another
 *                    host might publish real ones, so keep asking and only
 *                    fall back to "no restrictions" if nothing better turns up.
 *   - `unreachable`— 5xx, a network failure, a hostname that does not resolve.
 *                    Tells us nothing at all.
 */
export type RobotsReading =
  | { kind: 'rules'; rules: RobotsRules }
  | { kind: 'absent' }
  | { kind: 'unreachable' };

/** Exported for tests: classifying a response needs no network. */
export function readRobotsResponse(
  res: { ok: boolean; status: number; body: string },
): RobotsReading {
  if (res.ok && res.body) return { kind: 'rules', rules: parseRobots(res.body, 'pricesniffsbot') };
  if (res.status >= 400 && res.status < 500) return { kind: 'absent' };
  return { kind: 'unreachable' };
}

/**
 * Resolve a reading over several candidate addresses.
 *
 * A published file wins outright wherever it is found. Failing that, a 4xx
 * from any candidate is a real answer — "there is no such file" — and beats
 * silence. Only when every candidate was unreachable do we hold off, which is
 * the one case where refusing to crawl is the right call.
 *
 * Pure, and separated from the loop that does the fetching, so the precedence
 * is testable on its own.
 */
export function resolveRobotsReadings(readings: readonly RobotsReading[]): RobotsRules {
  for (const r of readings) if (r.kind === 'rules') return r.rules;
  if (readings.some((r) => r.kind === 'absent')) return NO_RESTRICTIONS;
  return UNREACHABLE_ROBOTS;
}

/** What one candidate address actually did, for a run report. */
export interface RobotsAttempt {
  url: string;
  status: number;
  error: string | null;
}

export interface RobotsProbe {
  rules: RobotsRules;
  /** Every address asked, in order, with what it answered. */
  attempts: RobotsAttempt[];
}

/**
 * Fetch robots.txt from the first candidate address that answers with one,
 * keeping a record of what each address did.
 *
 * The record is the point. "robots.txt unreachable" is a conclusion this
 * pipeline is obliged to act on — it stops the crawl, and correctly, since a
 * shop that might be refusing must not be crawled on the assumption that it is
 * not. But it is also the single least actionable line a run can print, and
 * until now it was all a run could print: the underlying HTTP status and error
 * were discarded inside this function. A connection reset from the shop's edge,
 * a 503 from an origin having a bad minute, and a 407 from a mistyped proxy
 * password are three completely different problems, and one of them is ours.
 *
 * Short-circuits on the first published file, so the ordinary apex-domain shop
 * still costs exactly one request, the same as `loadRobots` always did.
 */
export async function probeRobots(
  retailer: { domain: string; homepage?: string },
  http: Http,
  headers: Record<string, string>,
  /**
   * Header sets to try after `headers` on a candidate that did not hand over
   * the file. Empty by default, so a caller that passes nothing behaves
   * exactly as before — see `robotsHeaderVariants` for the one caller that
   * does pass something and why.
   */
  fallbackHeaders: readonly Record<string, string>[] = [],
): Promise<RobotsProbe> {
  const readings: RobotsReading[] = [];
  const attempts: RobotsAttempt[] = [];

  for (const url of robotsCandidateUrls(retailer)) {
    for (const variant of [headers, ...fallbackHeaders]) {
      let reading: RobotsReading;
      try {
        const res = await http(url, variant);
        attempts.push({ url, status: res.status, error: res.error ?? null });
        reading = readRobotsResponse(res);
      } catch (err) {
        attempts.push({ url, status: 0, error: String(err).slice(0, 160) });
        reading = { kind: 'unreachable' };
      }
      readings.push(reading);
      // The file itself, or a straight "there is no file". Either settles this
      // address and there is nothing a different header set could add.
      if (reading.kind !== 'unreachable') break;
    }
    if (readings[readings.length - 1]?.kind === 'rules') break;
  }

  return { rules: resolveRobotsReadings(readings), attempts };
}

/**
 * ── Asking a second way for the file, and only for the file ─────────────────
 *
 * Measured, Harvest probe run 2 (job 96342150229, 2026-08-20T06:57Z):
 *
 *     https://www.harveynichols.com/robots.txt: HTTP 503
 *     https://harveynichols.com/robots.txt:     HTTP 503
 *
 * Both addresses, both answering instantly, to a request identifying itself as
 * `pricesniffsbot`. A 503 that arrives in under a second from a CDN edge is
 * not an origin having a bad minute; it is a bot wall's fixed answer. This
 * shop was reachable from a GitHub runner as recently as 2026-08-10, when the
 * probe recorded HTTP 200 on four separate strategies against it
 * (data/strategy-memory.json), so what changed is who it will answer, not
 * whether it is up.
 *
 * `loadRobots` has always treated a 4xx as "no file published, therefore
 * nothing forbidden" — its own comment says "or the bot wall answered instead
 * of the file". A 503 is the same event wearing a different number, but it
 * must not be given the same treatment, because a genuine 503 from a genuinely
 * struggling server is exactly when a crawler should back off. So the response
 * to it here is not to assume permission. It is to ask again for the same
 * public file the way a browser would.
 *
 * That distinction is the whole justification and it is worth being precise
 * about. This changes how the *file* is requested; it changes nothing about
 * how the file is *obeyed*. `parseRobots` still reads the rules for
 * `pricesniffsbot`, still falls back to the `*` group, and `isAllowed` still
 * refuses every path either forbids. If Harvey Nichols' robots.txt turns out
 * to say `Disallow: /`, this code will have fetched it only to stop. Reading a
 * site's published crawl policy is the opposite of evading it — and a wall
 * that hides robots.txt from a crawler while serving the pages beneath it is
 * one that makes compliance impossible, which cannot be the outcome a
 * compliance mechanism is supposed to produce.
 *
 * Only ever tried when the first ask came back with nothing usable, so a shop
 * that answers its bot normally still costs exactly one request.
 */
export function robotsHeaderVariants(
  browserHeaders: Record<string, string>,
): readonly Record<string, string>[] {
  return [browserHeaders];
}

/**
 * The robots.txt a browser was shown, recovered from the HTML it painted.
 *
 * ── The one shop this is for, and why it is not a loophole ──────────────────
 * Harvey Nichols answers HTTP 503 to every direct request for its robots.txt
 * from a GitHub runner — bot user-agent and browser user-agent alike, on both
 * `www.harveynichols.com` and `harveynichols.com`, four attempts, all inside
 * one second (Harvest probe run 7, job 96343392189). It is not a header
 * problem; the network we are asking from is refused. The Apify proxy, which
 * would ask from somewhere else, has never completed a request in this
 * project (see apifyAccount.ts). So there is exactly one route left that can
 * see this file at all: the Apify actor, which is a real browser on a
 * residential IP.
 *
 * Spending a rendered page on robots.txt is worth stating plainly, because it
 * costs money and because it looks, at a glance, like getting round a block.
 * It is the opposite. The page being rendered is the shop's own published
 * statement of what may be crawled, and the only thing done with it is to
 * obey it: it is parsed by the same `parseRobots`, for the same
 * `pricesniffsbot` user-agent, and if it says `Disallow: /` the actor stops
 * there and no section page is ever requested. The alternative is not
 * "crawl politely instead" — the alternative is that a shop's crawl policy is
 * unreadable from here, and an unreadable policy means this pipeline treats
 * everything as forbidden and the shop stays dark forever. One page to read
 * the rules, then the rules decide, is the only version of this that is both
 * honest and capable of an answer.
 *
 * Chrome renders `text/plain` inside a single `<pre>`, so that is where the
 * file is. Falls back to the whole body when no `<pre>` is present, since a
 * server mislabelling robots.txt as HTML would still have painted the text.
 */
export function robotsTextFromRenderedHtml(html: string): string | null {
  if (!html) return null;
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  const raw = pre ? pre[1]! : html.replace(/^[\s\S]*?<body[^>]*>|<\/body>[\s\S]*$/gi, '');
  const text = raw
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

  // A rendered error page is HTML that strips to prose, not to directives.
  // Requiring a real robots.txt token is what stops "Access Denied" being
  // parsed as an empty rule set, which would read as "nothing forbidden".
  if (!/^\s*(user-agent|allow|disallow|sitemap|crawl-delay)\s*:/im.test(text)) return null;
  return text;
}

/** `probeRobots` for a caller that only wants the decision. */
export async function loadRobotsResilient(
  retailer: { domain: string; homepage?: string },
  http: Http,
  headers: Record<string, string>,
): Promise<RobotsRules> {
  return (await probeRobots(retailer, http, headers)).rules;
}
