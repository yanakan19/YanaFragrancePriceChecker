/**
 * Apify residential proxy client.
 *
 * ── Why this, and not an Apify actor ────────────────────────────────────────
 * docs/INGESTION.md compared five Apify options. Most of them run their own
 * extraction and hand back a schema we would have to adapt to. Apify Proxy is
 * different: it is a plain HTTP proxy, so our own tested, unit tested JSON-LD
 * parser (src/catalogue/jsonld.ts) stays the only place parsing happens. We
 * outsource retrieval, not understanding. That keeps one thing true across
 * every retailer: if a listing exists here, it came from real markup we
 * actually parsed, never from a third party's summary of it.
 *
 * ── What this costs ──────────────────────────────────────────────────────────
 * Residential proxy traffic runs roughly $8/GB (see docs/INGESTION.md for the
 * sourcing). We only ever fetch category/listing pages, never one request per
 * product, which is the difference between roughly £20 to £25 a month and over
 * £1,000. `MAX_PROXIED_REQUESTS_PER_RUN` is the hard backstop in code: even a
 * bug that loops cannot spend past it in one run.
 *
 * ── What has and has not been verified ──────────────────────────────────────
 * This is built against Apify's publicly documented proxy protocol: a standard
 * HTTP CONNECT proxy at proxy.apify.com:8000, authenticated with a username
 * that encodes proxy group and country, and your Apify Proxy password. That
 * password is on the Apify Proxy page in the console — NOT the same as an
 * Apify API token, and the two must not be confused.
 *
 * I do not have an Apify account and cannot create one on your behalf. Nothing
 * here has been run against Apify's real infrastructure. The request building
 * and gating logic is unit tested with a fake transport; the actual proxy
 * handshake can only be proven by running it with a real password, which is a
 * secret only you can supply. Treat the first real run as the verification
 * step, and read its output before trusting it.
 */
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import type { Http, HttpResponse } from './attempt.js';

/** Hard ceiling per run, independent of any caller's own budget. */
export const MAX_PROXIED_REQUESTS_PER_RUN = 40;

export interface ApifyProxyConfig {
  /** The Apify Proxy password from the console. Not an API token. */
  password: string;
  /** ISO country code to exit from. GB, since every shop here is UK facing. */
  country: string;
  /** A stable id so repeated requests reuse one session, which is cheaper. */
  sessionId: string;
}

export function apifyProxyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApifyProxyConfig | null {
  const password = env.APIFY_PROXY_PASSWORD;
  if (!password) return null;
  return {
    password,
    country: env.APIFY_PROXY_COUNTRY ?? 'GB',
    sessionId: env.APIFY_PROXY_SESSION ?? 'scentday1',
  };
}

function proxyUri(config: ApifyProxyConfig): string {
  const username = `groups-RESIDENTIAL,country-${config.country},session-${config.sessionId}`;
  return `http://${encodeURIComponent(username)}:${encodeURIComponent(config.password)}@proxy.apify.com:8000`;
}

/**
 * Build an `Http` that routes through Apify's residential proxy.
 *
 * Enforces the request budget itself, so a caller cannot accidentally exceed
 * it by forgetting to check. Once the budget is spent, every further call
 * fails closed with a clear reason rather than silently falling back to a
 * direct, unproxied request — which would defeat the entire point of using it.
 */
export function apifyProxyHttp(config: ApifyProxyConfig, maxRequests = MAX_PROXIED_REQUESTS_PER_RUN): Http {
  const agent = new ProxyAgent(proxyUri(config));
  let used = 0;

  return async (url: string, headers: Record<string, string>): Promise<HttpResponse> => {
    if (used >= maxRequests) {
      return {
        status: 0,
        body: '',
        ok: false,
        error: `proxy budget of ${maxRequests} requests exhausted for this run`,
      };
    }
    used++;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await undiciFetch(url, {
        headers,
        dispatcher: agent,
        signal: controller.signal,
      });
      const body = await res.text();
      return { status: res.status, body, ok: res.ok };
    } catch (err) {
      return { status: 0, body: '', ok: false, error: String(err).slice(0, 160) };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** How many of the budget this instance has spent. For run reports. */
export function withUsageTracking(
  http: Http,
  maxRequests: number,
): { http: Http; used: () => number } {
  let used = 0;
  const wrapped: Http = async (url, headers) => {
    const res = await http(url, headers);
    used++;
    return res;
  };
  return { http: wrapped, used: () => used };
}
