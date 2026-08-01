/**
 * robots.txt parsing.
 *
 * We respect it, for two reasons that point the same way. It is the right thing
 * to do, and a crawler that ignores it gets its address permanently blocked,
 * which loses the data for good. Being welcome somewhere is worth more than one
 * extra page today.
 *
 * A disallowed path is not a dead end either. It is a strong signal to take the
 * affiliate feed instead, which is better data anyway.
 */

export interface RobotsRules {
  /** Paths disallowed for our agent, longest first so the specific rule wins. */
  disallow: string[];
  allow: string[];
  /** Sitemaps declared in the file. The intended way to discover a site. */
  sitemaps: string[];
  /** Seconds the site asks us to wait between requests, when stated. */
  crawlDelaySeconds: number | null;
  /**
   * True only when the server failed in a way that means we must hold off:
   * a 5xx or a network error. RFC 9309 is explicit that these are different
   * cases from a missing file.
   */
  unavailable: boolean;
}

/**
 * No robots.txt could be reached because the server errored.
 *
 * RFC 9309 §2.3.1.4: an unreachable status means assume complete disallow. A
 * struggling server is not an invitation.
 */
export const UNREACHABLE_ROBOTS: RobotsRules = {
  disallow: [],
  allow: [],
  sitemaps: [],
  crawlDelaySeconds: null,
  unavailable: true,
};

/**
 * The file is absent, 404 or 403.
 *
 * RFC 9309 §2.3.1.3: an unavailable status (4xx) means the crawler may access
 * any resource. A shop with no robots.txt has stated no restrictions, and
 * treating that as a refusal is our mistake rather than their instruction.
 * Getting this backwards silently disabled five shops.
 */
export const NO_RESTRICTIONS: RobotsRules = {
  disallow: [],
  allow: [],
  sitemaps: [],
  crawlDelaySeconds: null,
  unavailable: false,
};

/** Kept for callers that predate the distinction. */
export const EMPTY_ROBOTS = UNREACHABLE_ROBOTS;

/**
 * Parse robots.txt, keeping the groups that apply to us.
 *
 * A named group for our agent wins outright over the wildcard group, which is
 * what the standard says and what most sites assume.
 */
export function parseRobots(text: string, userAgent = 'scentdaybot'): RobotsRules {
  const lines = text.split(/\r?\n/);
  const groups = new Map<string, { disallow: string[]; allow: string[]; delay: number | null }>();
  const sitemaps: string[] = [];

  let current: string[] = [];
  let lastWasAgent = false;

  for (const raw of lines) {
    const line = raw.split('#')[0]!.trim();
    if (!line) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }

    if (field === 'user-agent') {
      // Consecutive user-agent lines share one group of rules.
      if (!lastWasAgent) current = [];
      current.push(value.toLowerCase());
      for (const a of current) {
        if (!groups.has(a)) groups.set(a, { disallow: [], allow: [], delay: null });
      }
      lastWasAgent = true;
      continue;
    }

    lastWasAgent = false;
    for (const agent of current) {
      const g = groups.get(agent);
      if (!g) continue;
      if (field === 'disallow' && value) g.disallow.push(value);
      else if (field === 'allow' && value) g.allow.push(value);
      else if (field === 'crawl-delay') {
        const n = Number.parseFloat(value);
        if (Number.isFinite(n)) g.delay = n;
      }
    }
  }

  const ours = groups.get(userAgent.toLowerCase());
  const wildcard = groups.get('*');
  const chosen = ours ?? wildcard;

  if (!chosen) {
    return { disallow: [], allow: [], sitemaps, crawlDelaySeconds: null, unavailable: false };
  }

  const bySpecificity = (a: string, b: string) => b.length - a.length;
  return {
    disallow: [...chosen.disallow].sort(bySpecificity),
    allow: [...chosen.allow].sort(bySpecificity),
    sitemaps,
    crawlDelaySeconds: chosen.delay,
    unavailable: false,
  };
}

/** Does a rule pattern match this path? Supports `*` and a trailing `$`. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`).test(path);
}

/**
 * May we fetch this path?
 *
 * The longest matching rule wins, and Allow beats Disallow at equal length,
 * which is how the major crawlers resolve it. When robots.txt could not be read
 * we return false: silence is not consent, and guessing wrong is how a crawler
 * ends up unwelcome.
 */
export function isAllowed(rules: RobotsRules, url: string): boolean {
  if (rules.unavailable) return false;

  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return false;
  }

  const deny = rules.disallow.find((p) => matches(p, path));
  const permit = rules.allow.find((p) => matches(p, path));

  if (!deny) return true;
  if (permit && permit.length >= deny.length) return true;
  return false;
}
