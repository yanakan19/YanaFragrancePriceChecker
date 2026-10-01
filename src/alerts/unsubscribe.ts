/**
 * The one click unsubscribe link, both ends of it.
 *
 * The email carries `${SITE_URL}/account?unsubscribe=<token>`. The site's
 * account route reads the token (demo/app.ts applyRoute), calls the
 * `unsubscribe_price_alerts` RPC with the public anon key and the token alone
 * (supabase/migrations/0004_price_alerts.sql), says what happened in a pop up,
 * and drops the token from the address bar. No sign in is needed: the reader
 * may be opening the email on a device that has never signed in.
 *
 * Shared by the browser and the sender so the link format is defined once.
 */

/** The query parameter the account route reads. */
export const UNSUBSCRIBE_PARAM = 'unsubscribe';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tokens are uuids (gen_random_uuid()). Anything else is not worth a request. */
export function isAlertToken(value: string): boolean {
  return UUID.test(value);
}

export function unsubscribeUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/account?${UNSUBSCRIBE_PARAM}=${encodeURIComponent(token)}`;
}

export function accountUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/account`;
}

/** The slice of a Supabase client this needs, so tests can fake it. */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type UnsubscribeOutcome = 'done' | 'unknown' | 'error';

/**
 * 'done' when the token was recognised (alerts are now off, or already were),
 * 'unknown' for a malformed or unrecognised token, 'error' when the request
 * itself failed (offline, or migration 0004 not run yet).
 */
export async function unsubscribeWithToken(client: RpcClient | null, token: string): Promise<UnsubscribeOutcome> {
  if (!isAlertToken(token)) return 'unknown';
  if (!client) return 'error';
  try {
    const { data, error } = await client.rpc('unsubscribe_price_alerts', { p_token: token });
    if (error) return 'error';
    return data === true ? 'done' : 'unknown';
  } catch {
    return 'error';
  }
}

/** What the pop up says for each outcome. No dashes, plain English. */
export function unsubscribeMessage(outcome: UnsubscribeOutcome): { title: string; message: string; ok: boolean } {
  switch (outcome) {
    case 'done':
      return {
        title: 'Price alerts are off',
        message: 'We will not email you about price drops again. You can turn them back on from your account at any time.',
        ok: true,
      };
    case 'unknown':
      return {
        title: 'This link did not work',
        message: 'We could not match this link to any price alerts. Sign in and untick the price alerts box on your account page instead.',
        ok: false,
      };
    case 'error':
      return {
        title: 'Could not turn off price alerts',
        message: 'Something went wrong on our side. Please try the link again later, or untick the box on your account page.',
        ok: false,
      };
  }
}
