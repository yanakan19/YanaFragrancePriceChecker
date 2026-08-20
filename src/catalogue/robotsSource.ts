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
): Promise<RobotsProbe> {
  const readings: RobotsReading[] = [];
  const attempts: RobotsAttempt[] = [];

  for (const url of robotsCandidateUrls(retailer)) {
    let reading: RobotsReading;
    try {
      const res = await http(url, headers);
      attempts.push({ url, status: res.status, error: res.error ?? null });
      reading = readRobotsResponse(res);
    } catch (err) {
      attempts.push({ url, status: 0, error: String(err).slice(0, 160) });
      reading = { kind: 'unreachable' };
    }
    readings.push(reading);
    if (reading.kind === 'rules') break;
  }

  return { rules: resolveRobotsReadings(readings), attempts };
}

/** `probeRobots` for a caller that only wants the decision. */
export async function loadRobotsResilient(
  retailer: { domain: string; homepage?: string },
  http: Http,
  headers: Record<string, string>,
): Promise<RobotsRules> {
  return (await probeRobots(retailer, http, headers)).rules;
}
