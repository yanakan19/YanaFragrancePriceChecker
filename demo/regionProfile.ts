import { supabase } from './supabase.js';
import { regionById, type RegionId } from '../src/config/regions.js';

/**
 * The signed in visitor's chosen region on their profile (profiles.region,
 * supabase/migrations/0009_profile_region.sql), so the choice follows them to
 * another device. Read and written only for a signed in visitor, and only
 * while the welcome pop-up is switched on (demo/regionWelcome.ts), so today
 * the page makes no request for it.
 *
 * Every call degrades quietly, like demo/priceAlerts.ts: until the migration
 * is run the column does not exist, the read fails and answers null, and a
 * write answers false. Nothing is shown to the visitor either way.
 */

/** The region on the signed in visitor's profile, or null (signed out, none saved, or not set up). */
export async function fetchProfileRegion(): Promise<RegionId | null> {
  const client = supabase();
  if (!client) return null;
  try {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return null;
    const { data, error } = await client.from('profiles').select('region').eq('id', user.id).maybeSingle();
    if (error || !data) return null;
    return regionById((data as { region?: unknown }).region as string | null)?.id ?? null;
  } catch {
    return null;
  }
}

/** Saves the region on the signed in visitor's profile. False when signed out or it could not be saved. */
export async function saveProfileRegion(id: RegionId): Promise<boolean> {
  if (!regionById(id)) return false;
  const client = supabase();
  if (!client) return false;
  try {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return false;
    const { error } = await client.from('profiles').update({ region: id }).eq('id', user.id);
    return !error;
  } catch {
    return false;
  }
}
