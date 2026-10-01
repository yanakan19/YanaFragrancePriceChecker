import { supabase } from './supabase.js';
import { unsubscribeWithToken, type UnsubscribeOutcome } from '../src/alerts/unsubscribe.js';

/**
 * The reader's side of price drop emails (queue item 4.1): the opt in on the
 * account page, and the one click unsubscribe link from the email. The
 * sending happens elsewhere, once a day, in .github/workflows/price-alerts.yml.
 *
 * Every call degrades quietly. Until supabase/migrations/0004_price_alerts.sql
 * is run, the `price_alerts` column does not exist, the read below fails, and
 * fetchPriceAlerts answers null, which the account page takes as "not
 * available here yet" and simply does not show the checkbox.
 */

/** True or false for the signed in reader's choice; null when unknown or unavailable. */
export async function fetchPriceAlerts(): Promise<boolean | null> {
  const client = supabase();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client.from('profiles').select('price_alerts').eq('id', user.id).maybeSingle();
  if (error || !data) return null;
  return (data as { price_alerts?: unknown }).price_alerts === true;
}

export async function setPriceAlerts(on: boolean): Promise<{ ok: boolean; message?: string }> {
  const client = supabase();
  if (!client) return { ok: false, message: 'Accounts are not set up on this deployment yet.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in to change price alerts.' };
  const { error } = await client.from('profiles').update({ price_alerts: on }).eq('id', user.id);
  if (error) return { ok: false, message: 'Could not save that. Please try again.' };
  return { ok: true };
}

/** Called by the account route when the address carries ?unsubscribe=<token>. */
export function unsubscribe(token: string): Promise<UnsubscribeOutcome> {
  return unsubscribeWithToken(supabase(), token);
}
