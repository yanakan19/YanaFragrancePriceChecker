/**
 * A single, free question asked of Apify before any metered work starts:
 * what does this account actually have?
 *
 * ── Why this earns its place ────────────────────────────────────────────────
 * This project holds three separate Apify-shaped secrets and two of them do
 * different jobs with different values — `APIFY_TOKEN` authenticates the REST
 * API (apifyActor.ts), `APIFY_PROXY_PASSWORD` authenticates a CONNECT tunnel
 * (apifyProxy.ts), and both of those modules' headers already warn that
 * confusing them fails silently in its own way. That warning turned out to be
 * describing the present.
 *
 * Measured, Harvest probe run 7, job 96343392189, 2026-08-20T07:03Z — the
 * first runs in this project's history with either credential live:
 *
 *     [proxied] https://www.harveynichols.com/robots.txt: HTTP 0 —
 *         TypeError: fetch failed (Error: Request was cancelled.)
 *
 * Every proxied request, at every shop, in every run. The proxy tier has
 * never once completed a request. From inside the harvest that is
 * indistinguishable from a shop that will not answer, and it is not the same
 * thing at all: one is the shop's decision and the other is our
 * configuration.
 *
 * `GET /v2/users/me` answers both halves of the question at once, costs
 * nothing, uses no proxy traffic and no compute units:
 *
 *   - `proxy.password` is the account's real proxy password. Comparing it to
 *     `APIFY_PROXY_PASSWORD` settles "is our secret the right secret" without
 *     printing either. Neither value is ever logged — only whether they match.
 *   - `proxy.groups` is what the plan actually includes. apifyProxy.ts and
 *     apifyActor.ts both ask for `RESIDENTIAL` unconditionally; an account
 *     without it gets a rejection whose cause the harvest would otherwise
 *     report as the shop's fault.
 *
 * Nothing here changes behaviour. It only means a run that is about to fail
 * expensively says why first.
 */

/** What the account preflight found, in a shape safe to print. */
export interface ApifyAccountReport {
  ok: boolean;
  /** Human-readable lines for the run log. Never contains a secret. */
  lines: string[];
}

interface UsersMePayload {
  data?: {
    username?: string;
    plan?: { id?: string; description?: string };
    proxy?: { password?: string; groups?: Array<{ name?: string; availableCount?: number }> };
  };
}

/**
 * Turn a `/v2/users/me` payload into log lines, given the proxy password this
 * run is configured with.
 *
 * Pure and exported so the comparison logic — the part that must never leak a
 * secret — is testable without a network. `configuredProxyPassword` is null
 * when the run has no proxy password set at all, which is a different fact
 * from having the wrong one.
 */
export function describeApifyAccount(
  payload: UsersMePayload,
  configuredProxyPassword: string | null,
): ApifyAccountReport {
  const data = payload.data;
  if (!data) return { ok: false, lines: ['Apify account check: response carried no account data'] };

  const lines: string[] = [];
  const plan = data.plan?.id ?? data.plan?.description ?? 'unnamed plan';
  lines.push(`Apify account: ${data.username ?? 'unknown user'}, plan ${plan}`);

  const groups = (data.proxy?.groups ?? [])
    .map((g) => g.name)
    .filter((n): n is string => Boolean(n));
  lines.push(
    groups.length
      ? `Apify proxy groups available: ${groups.join(', ')}`
      : 'Apify proxy groups available: none — the proxy tier cannot work on this plan',
  );
  if (groups.length && !groups.includes('RESIDENTIAL')) {
    lines.push(
      'RESIDENTIAL is NOT among them, and both the proxy tier and the actor tier ask for it by name.',
    );
  }

  const accountPassword = data.proxy?.password ?? null;
  if (configuredProxyPassword === null) {
    lines.push('APIFY_PROXY_PASSWORD is not set for this run, so the proxy tier is simply off.');
  } else if (!accountPassword) {
    lines.push('Apify did not report a proxy password for this account, so the configured one cannot be checked.');
  } else if (accountPassword === configuredProxyPassword) {
    lines.push('APIFY_PROXY_PASSWORD matches this account\'s proxy password.');
  } else {
    // The whole point of the check, and the reason neither value is printed.
    lines.push(
      'APIFY_PROXY_PASSWORD does NOT match this account\'s proxy password. ' +
        'The proxy tier will fail every request until it is corrected — it is on the ' +
        'Apify console\'s Proxy page, and is not the API token.',
    );
  }

  return { ok: true, lines };
}

/**
 * Ask Apify what this account has. Never throws; a failure is a report, since
 * this is a diagnostic and must not be able to stop a harvest.
 */
export async function checkApifyAccount(
  token: string,
  configuredProxyPassword: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<ApifyAccountReport> {
  try {
    const res = await fetchImpl(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      return {
        ok: false,
        lines: [`Apify account check failed: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`],
      };
    }
    return describeApifyAccount((await res.json()) as UsersMePayload, configuredProxyPassword);
  } catch (err) {
    return { ok: false, lines: [`Apify account check failed: ${String(err).slice(0, 160)}`] };
  }
}
