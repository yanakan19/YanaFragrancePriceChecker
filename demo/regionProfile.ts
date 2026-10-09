import { supabase } from './supabase.js';
import { regionById, type RegionId } from '../src/config/regions.js';

/**
 * The signed in visitor's chosen region on their profile (profiles.region,
 * supabase/migrations/0009_profile_region.sql, run on the live project on
 * 9 October 2026), so the choice follows them to another device. Read and
 * written only for a signed in visitor, and only once a second region is live
 * (demo/regionPreference.ts decides when, and reconciles it with the choice
 * saved in this browser), so while the UK is the only live region the page
 * makes no request for it.
 *
 * Every call degrades quietly, like demo/priceAlerts.ts: should the column
 * ever be missing, the read answers "could not read" and a write answers
 * false. Nothing is shown to the visitor either way, and nothing is logged.
 */

/** What reading the profile found: a region or none, or that it could not be read. */
export type ProfileRegionRead = { ok: true; region: RegionId | null } | { ok: false };

/**
 * The region on the signed in visitor's profile. `ok: false` when signed out
 * or the read failed, so a caller never mistakes a failed read for "none
 * saved" and overwrites a choice it could not see.
 */
export async function readProfileRegion(): Promise<ProfileRegionRead> {
  const client = supabase();
  if (!client) return { ok: false };
  try {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { ok: false };
    const { data, error } = await client.from('profiles').select('region').eq('id', user.id).maybeSingle();
    if (error) return { ok: false };
    return { ok: true, region: regionById((data as { region?: unknown } | null)?.region as string | null)?.id ?? null };
  } catch {
    return { ok: false };
  }
}

/** The region on the signed in visitor's profile, or null (signed out, none saved, or it could not be read). */
export async function fetchProfileRegion(): Promise<RegionId | null> {
  const read = await readProfileRegion();
  return read.ok ? read.region : null;
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
