import { supabase } from './supabase.js';

export interface WishlistResult {
  ok: boolean;
  message?: string;
}

export interface WishlistEntry {
  fragranceId: string;
  /** What a reader typed in when saving it. Null means they never set one. */
  targetPriceGbp: number | null;
  addedAt: string;
}

/**
 * Every wishlist row belongs to whoever is signed in right now — there is no
 * server here to enforce that beyond Supabase's own row level security (see
 * supabase/migrations/0002_wishlists.sql), so every query below still scopes
 * explicitly to auth.getUser()'s own id rather than trusting the policy
 * alone to save a round trip. Belt and suspenders, not paranoia: a bug that
 * queried without the filter would still only ever get back what RLS allows,
 * but "the client code and the database policy both say the same thing" is
 * worth more than "the database policy alone is the only thing preventing
 * a leak."
 */

/** The signed-in reader's whole wishlist, newest first. Empty for anyone
 *  signed out, or if accounts are not configured on this deployment. */
export async function fetchWishlist(): Promise<WishlistEntry[]> {
  const client = supabase();
  if (!client) return [];
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return [];

  const { data, error } = await client
    .from('wishlists')
    .select('fragrance_id, target_price_gbp, added_at')
    .eq('user_id', user.id)
    .order('added_at', { ascending: false });
  if (error || !data) return [];

  return data.map((row) => ({
    fragranceId: row.fragrance_id as string,
    targetPriceGbp: (row.target_price_gbp as number | null) ?? null,
    addedAt: row.added_at as string,
  }));
}

/** Adds a fragrance, or updates its target price if it is already saved —
 *  one call either way, since the reader-facing action is the same button. */
export async function addToWishlist(fragranceId: string, targetPriceGbp: number | null = null): Promise<WishlistResult> {
  const client = supabase();
  if (!client) return { ok: false, message: 'Accounts are not set up on this deployment yet.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in to save fragrances to your wishlist.' };

  const { error } = await client
    .from('wishlists')
    .upsert(
      { user_id: user.id, fragrance_id: fragranceId, target_price_gbp: targetPriceGbp },
      { onConflict: 'user_id,fragrance_id' },
    );
  if (error) return { ok: false, message: 'Could not save this fragrance. Please try again.' };
  return { ok: true };
}

export async function removeFromWishlist(fragranceId: string): Promise<WishlistResult> {
  const client = supabase();
  if (!client) return { ok: false, message: 'Accounts are not set up on this deployment yet.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in to manage your wishlist.' };

  const { error } = await client.from('wishlists').delete().eq('user_id', user.id).eq('fragrance_id', fragranceId);
  if (error) return { ok: false, message: 'Could not remove this fragrance. Please try again.' };
  return { ok: true };
}
