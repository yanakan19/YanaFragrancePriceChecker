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
  /**
   * The cheapest delivered price on the day it was saved, or null: a row saved
   * before supabase/migrations/0005_wishlist_saved_price.sql was run, or one
   * with no delivered price that day. Null means "not recorded" and nothing is
   * ever worked out to stand in for it.
   */
  savedPriceGbp: number | null;
}

/**
 * Whether the database has the saved price column yet. Unknown until the first
 * read or write says; then remembered for the visit. Until the owner runs
 * migration 0005 every call below carries on as it did before the column
 * existed, the same quiet degrade as price alerts (demo/priceAlerts.ts).
 */
let savedPriceColumn: 'unknown' | 'yes' | 'no' = 'unknown';

/** Whether change since saved can be offered at all: false only once the column is known to be missing. */
export function savedPriceAvailable(): boolean {
  return savedPriceColumn !== 'no';
}

/** True for the two ways Supabase says a column is not there: Postgres 42703 on a read, PostgREST PGRST204 on a write. */
export function isMissingSavedPriceColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /saved_price_gbp/.test(error.message ?? '');
}

/** A real, non negative price to two places, or null. Anything else is not recorded. */
export function cleanSavedPrice(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

/** For tests: forget what has been learned about the column. */
export function resetSavedPriceColumn(): void {
  savedPriceColumn = 'unknown';
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

  const read = (columns: string) =>
    client.from('wishlists').select(columns).eq('user_id', user.id).order('added_at', { ascending: false });
  let result = savedPriceColumn === 'no'
    ? await read('fragrance_id, target_price_gbp, added_at')
    : await read('fragrance_id, target_price_gbp, added_at, saved_price_gbp');
  if (result.error && savedPriceColumn !== 'no' && isMissingSavedPriceColumn(result.error)) {
    // Migration 0005 has not been run: read the list as it always was.
    savedPriceColumn = 'no';
    result = await read('fragrance_id, target_price_gbp, added_at');
  } else if (!result.error && savedPriceColumn === 'unknown') {
    savedPriceColumn = 'yes';
  }
  const { data, error } = result;
  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[]).map((row) => ({
    fragranceId: row.fragrance_id as string,
    targetPriceGbp: (row.target_price_gbp as number | null) ?? null,
    addedAt: row.added_at as string,
    savedPriceGbp: cleanSavedPrice(row.saved_price_gbp as number | null | undefined),
  }));
}

/** Adds a fragrance, or updates its target price if it is already saved —
 *  one call either way, since the reader-facing action is the same button.
 *
 *  `savedPriceGbp` is the cheapest delivered price today, written only when
 *  this call creates the row: saving again never moves the price a row was
 *  first saved at, and a row saved before the column existed stays null. Until
 *  migration 0005 is run it is not sent at all. */
export async function addToWishlist(
  fragranceId: string,
  targetPriceGbp: number | null = null,
  savedPriceGbp: number | null = null,
): Promise<WishlistResult> {
  const client = supabase();
  if (!client) return { ok: false, message: 'Accounts are not set up on this deployment yet.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in to save fragrances to your wishlist.' };

  const saved = cleanSavedPrice(savedPriceGbp);
  if (saved !== null && savedPriceColumn !== 'no') {
    // A plain insert, so the price lands only on a row that is new.
    const { error: insertError } = await client.from('wishlists').insert({
      user_id: user.id,
      fragrance_id: fragranceId,
      target_price_gbp: targetPriceGbp,
      saved_price_gbp: saved,
    });
    if (!insertError) {
      if (savedPriceColumn === 'unknown') savedPriceColumn = 'yes';
      return { ok: true };
    }
    // Already saved (a unique violation): fall through to the update below,
    // which leaves the price it was first saved at alone. Column missing:
    // remember it and carry on without the price. Anything else: fall through
    // too, and let the ordinary save report it.
    if (isMissingSavedPriceColumn(insertError)) savedPriceColumn = 'no';
  }

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

/** Sets or clears (null) a saved fragrance's target price, used by price
 *  alerts: an email goes out when the cheapest delivered price reaches it. */
export async function setTargetPrice(fragranceId: string, targetPriceGbp: number | null): Promise<WishlistResult> {
  const client = supabase();
  if (!client) return { ok: false, message: 'Accounts are not set up on this deployment yet.' };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in to manage your wishlist.' };

  const { error } = await client
    .from('wishlists')
    .update({ target_price_gbp: targetPriceGbp })
    .eq('user_id', user.id)
    .eq('fragrance_id', fragranceId);
  if (error) return { ok: false, message: 'Could not save your target price. Please try again.' };
  return { ok: true };
}
