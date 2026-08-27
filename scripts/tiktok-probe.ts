/**
 * TikTok Shop Affiliate API probe — dispatch-only, single-seller, bounded.
 *
 * The first *live* step of the TikTok Shop plan (docs/TIKTOK-SHOP-PLAN.md),
 * runnable only from CI on an explicit workflow_dispatch — never on schedule,
 * matching D8's default-off stance. This sandbox cannot reach TikTok at all;
 * CI can, once the owner has credentials.
 *
 * What it does, in full:
 *
 *   1. refuses to run, with a precise message, unless TIKTOK_APP_KEY,
 *      TIKTOK_APP_SECRET and TIKTOK_REFRESH_TOKEN are all set — these are the
 *      GitHub Actions secrets the owner creates after Partner Center signup
 *      (the Awin pattern: authorised API, owner-held credentials);
 *   2. refreshes the access token at auth.tiktok-shops.com;
 *   3. makes exactly two signed, read-only calls against the Affiliate
 *      Creator API: the creator's own profile, and the creator's showcase
 *      products;
 *   4. writes what came back — status, code, message, and the raw payloads
 *      with token-like fields redacted — to data/tiktok/probe-report.json.
 *
 * It deliberately parses nothing into listings. The API's response schemas
 * are documented behind JavaScript this project cannot cite, so the honest
 * order of work is: capture a real response first, then write the
 * response→TikTokCaptureRow translation from what the capture actually
 * contains (src/catalogue/tiktokShop.ts explains the same rule from the
 * other side). A probe that guessed at the schema and "parsed" it would
 * manufacture exactly the fabricated data this repo refuses to hold.
 *
 * Endpoint paths and the signature algorithm follow the EcomPHP/tiktokshop-php
 * SDK (src/Client.php, src/Auth.php, src/Resources/AffiliateCreator.php),
 * which mirrors the official Partner Center documentation and cites its
 * signing spec (partner.tiktokshop.com/doc/page/274638):
 *
 *   - base:      https://open-api.tiktokglobalshop.com
 *   - refresh:   GET https://auth.tiktok-shops.com/api/v2/token/refresh
 *                    ?app_key&app_secret&refresh_token&grant_type=refresh_token
 *   - profile:   GET /affiliate_creator/202405/profiles
 *   - showcase:  GET /affiliate_creator/202405/showcases/products
 *   - sign:      HMAC-SHA256 hex over
 *                secret + path + concat(sorted "{key}{value}" of query params
 *                except sign/access_token) + body-if-not-GET + secret,
 *                keyed with the secret; sent as `sign`, with `timestamp`
 *                (unix seconds) and `app_key` in the query and the access
 *                token in the `x-tts-access-token` header.
 *
 * If TikTok rotates the refresh token on use, the new one is in the refresh
 * response — it is NOT written to the report (it is a credential), but its
 * presence is flagged so the owner knows to update the repo secret. Whether
 * rotation actually happens is one of the plan's "cannot know until
 * credentials" items.
 */

import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = join(ROOT, 'data', 'tiktok', 'probe-report.json');

const AUTH_HOST = 'https://auth.tiktok-shops.com';
const API_HOST = 'https://open-api.tiktokglobalshop.com';
const API_VERSION = '202405';

interface ProbeCall {
  label: string;
  path: string;
  httpStatus: number | null;
  /** TikTok's own response envelope code/message, when the body was JSON. */
  code: number | null;
  message: string | null;
  /** Raw payload with token-like fields redacted. */
  data: unknown;
  error: string | null;
}

/** Recursively strip anything that smells like a credential before writing. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/token|secret|cipher|password/i.test(k)) {
        out[k] = '[redacted]';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function sign(path: string, query: Record<string, string>, appSecret: string, body = ''): string {
  const keys = Object.keys(query)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort();
  const concat = keys.map((k) => `${k}${query[k]}`).join('');
  const toSign = appSecret + path + concat + body + appSecret;
  return createHmac('sha256', appSecret).update(toSign).digest('hex');
}

async function signedGet(
  label: string,
  path: string,
  appKey: string,
  appSecret: string,
  accessToken: string,
): Promise<ProbeCall> {
  const query: Record<string, string> = {
    app_key: appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  query['sign'] = sign(path, query, appSecret);
  const url = `${API_HOST}${path}?${new URLSearchParams(query).toString()}`;

  const call: ProbeCall = {
    label,
    path,
    httpStatus: null,
    code: null,
    message: null,
    data: null,
    error: null,
  };

  try {
    const res = await fetch(url, {
      headers: { 'x-tts-access-token': accessToken, 'content-type': 'application/json' },
    });
    call.httpStatus = res.status;
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { code?: number; message?: string; data?: unknown };
      call.code = typeof json.code === 'number' ? json.code : null;
      call.message = typeof json.message === 'string' ? json.message : null;
      call.data = redact(json.data ?? null);
    } catch {
      call.error = `response was not JSON (first 200 chars): ${text.slice(0, 200)}`;
    }
  } catch (e) {
    call.error = e instanceof Error ? e.message : String(e);
  }
  return call;
}

async function main(): Promise<void> {
  const appKey = process.env['TIKTOK_APP_KEY'];
  const appSecret = process.env['TIKTOK_APP_SECRET'];
  const refreshToken = process.env['TIKTOK_REFRESH_TOKEN'];

  if (!appKey || !appSecret || !refreshToken) {
    const missing = [
      !appKey && 'TIKTOK_APP_KEY',
      !appSecret && 'TIKTOK_APP_SECRET',
      !refreshToken && 'TIKTOK_REFRESH_TOKEN',
    ]
      .filter(Boolean)
      .join(', ');
    console.log(
      `TikTok probe: not running — missing secret(s): ${missing}.\n` +
        'These come from the owner\'s TikTok Shop Partner Center signup: ' +
        'see docs/TIKTOK-SHOP-PLAN.md §6 for the exact steps. ' +
        'Nothing was fetched and nothing was written.',
    );
    return;
  }

  const startedAt = new Date().toISOString();

  // 1. Refresh the access token. GET with credentials in the query, per the
  //    documented flow; the envelope is { code, message, data: { ... } }.
  const refreshUrl =
    `${AUTH_HOST}/api/v2/token/refresh?` +
    new URLSearchParams({
      app_key: appKey,
      app_secret: appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

  let accessToken: string | null = null;
  let refreshOutcome = 'not attempted';
  let refreshTokenRotated = false;
  try {
    const res = await fetch(refreshUrl);
    const json = (await res.json()) as {
      code?: number;
      message?: string;
      data?: { access_token?: string; refresh_token?: string };
    };
    if (json.code === 0 && json.data?.access_token) {
      accessToken = json.data.access_token;
      refreshOutcome = 'ok';
      refreshTokenRotated =
        typeof json.data.refresh_token === 'string' && json.data.refresh_token !== refreshToken;
    } else {
      refreshOutcome = `refused: code=${json.code ?? 'none'} message=${json.message ?? 'none'}`;
    }
  } catch (e) {
    refreshOutcome = `failed: ${e instanceof Error ? e.message : String(e)}`;
  }

  const calls: ProbeCall[] = [];
  if (accessToken) {
    // 2. Exactly two read-only calls, both against the owner's own creator
    //    account. Bounded by construction — there is no loop here.
    calls.push(
      await signedGet(
        'creator profile',
        `/affiliate_creator/${API_VERSION}/profiles`,
        appKey,
        appSecret,
        accessToken,
      ),
    );
    calls.push(
      await signedGet(
        'showcase products',
        `/affiliate_creator/${API_VERSION}/showcases/products`,
        appKey,
        appSecret,
        accessToken,
      ),
    );
  }

  const report = {
    startedAt,
    finishedAt: new Date().toISOString(),
    refreshOutcome,
    // The rotated token itself is a credential and is never written anywhere.
    // True here means: update the TIKTOK_REFRESH_TOKEN repo secret before the
    // old one expires — see the plan's credential-lifetime open question.
    refreshTokenRotated,
    calls,
    nextStep:
      'Read the raw payloads above. If the showcase call returned products, ' +
      'transcribe one real response into the response→TikTokCaptureRow ' +
      'translation in src/catalogue/tiktokShop.ts and commit the capture as ' +
      'a fixture. See docs/TIKTOK-SHOP-PLAN.md §7.',
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TikTok probe: refresh ${refreshOutcome}; ${calls.length} call(s) made.`);
  for (const c of calls) {
    console.log(
      `  ${c.label}: http=${c.httpStatus ?? 'n/a'} code=${c.code ?? 'n/a'} ` +
        `message=${c.message ?? 'n/a'}${c.error ? ` error=${c.error}` : ''}`,
    );
  }
  console.log(`Report written to ${REPORT_PATH}.`);
}

main().catch((e) => {
  console.error(`TikTok probe: unexpected failure: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
