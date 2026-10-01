/**
 * The price alert sender's database, backed by Supabase with the service role
 * key (see supabase/migrations/0004_price_alerts.sql for the tables and the
 * one RPC this reads).
 *
 * Errors are rethrown as a short message naming the step, never the
 * response body: PostgREST error details can echo row values back.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertStore, HistoryRow, HistoryWrite, Recipient, WishlistItem } from './run.js';

/** Keeps each `in (...)` filter comfortably inside a URL. */
const CHUNK = 150;

function chunks<T>(list: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

function fail(step: string, error: unknown): never {
  const code = (error as { code?: unknown } | null)?.code;
  throw new Error(`Supabase ${step} failed${typeof code === 'string' ? ` (${code})` : ''}`);
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function supabaseAlertStore(client: SupabaseClient): AlertStore {
  return {
    async recipients(): Promise<Recipient[]> {
      const { data, error } = await client.rpc('price_alert_recipients');
      if (error) fail('price_alert_recipients', error);
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        userId: String(r.r_user_id),
        email: String(r.r_email),
        token: String(r.r_token),
        lastSentOn: r.r_last_sent_on ? String(r.r_last_sent_on) : null,
      }));
    },

    async wishlistItems(userIds): Promise<WishlistItem[]> {
      const out: WishlistItem[] = [];
      for (const ids of chunks(userIds)) {
        const { data, error } = await client
          .from('wishlists')
          .select('id, user_id, fragrance_id, target_price_gbp')
          .in('user_id', ids);
        if (error) fail('wishlists read', error);
        for (const r of (data ?? []) as Record<string, unknown>[]) {
          out.push({
            wishlistId: String(r.id),
            userId: String(r.user_id),
            fragranceId: String(r.fragrance_id),
            targetPriceGbp: num(r.target_price_gbp),
          });
        }
      }
      return out;
    },

    async history(wishlistIds): Promise<HistoryRow[]> {
      const out: HistoryRow[] = [];
      for (const ids of chunks(wishlistIds)) {
        const { data, error } = await client
          .from('price_alert_history')
          .select('wishlist_id, last_price_gbp')
          .in('wishlist_id', ids);
        if (error) fail('price_alert_history read', error);
        for (const r of (data ?? []) as Record<string, unknown>[]) {
          const price = num(r.last_price_gbp);
          if (price !== null) out.push({ wishlistId: String(r.wishlist_id), lastPriceGbp: price });
        }
      }
      return out;
    },

    async writeHistory(rows: readonly HistoryWrite[]): Promise<void> {
      const now = new Date().toISOString();
      for (const part of chunks(rows)) {
        const payload = part.map((w) => {
          const row: Record<string, unknown> = {
            wishlist_id: w.wishlistId,
            user_id: w.userId,
            last_price_gbp: w.price,
            updated_at: now,
          };
          // Only set when an email went out, so recording a baseline never
          // wipes the time of the last email.
          if (w.emailedAt) row.last_emailed_at = w.emailedAt;
          return row;
        });
        const { error } = await client.from('price_alert_history').upsert(payload, { onConflict: 'wishlist_id' });
        if (error) fail('price_alert_history write', error);
      }
    },

    async markSent(userId: string, day: string): Promise<void> {
      const { error } = await client.from('price_alert_accounts').update({ last_sent_on: day }).eq('user_id', userId);
      if (error) fail('price_alert_accounts update', error);
    },
  };
}
