import { supabase } from './supabase.js';
import {
  avatarObjectPath,
  encodeUnderLimit,
  squareCrop,
  PHOTO_TARGET_BYTES,
} from '../src/services/profilePhoto.js';

/**
 * The profile photo: one small square per account, kept in a private
 * Supabase Storage bucket (`avatars`) at `<user id>/avatar`, with the path
 * recorded in profiles.avatar_path. See supabase/migrations/0006_profile_photo.sql
 * for the bucket and its policies.
 *
 * ── Why private, read through the signed in session ─────────────────────────
 * Only the reader ever sees their own photo (in the round account button and
 * at the top of their profile), so nobody else needs to be able to fetch it.
 * The bucket is private and the read policy lets a signed in reader read
 * their own file and nothing else. The photo is fetched with the reader's
 * own session (storage download, the same call a signed URL would need a
 * session to mint) and shown from a local blob: address. So no link to it
 * exists that would work for anyone else, not even a short lived one, and a
 * user id, which is not a secret, is no use to anyone without that session.
 *
 * ── Degrading quietly ────────────────────────────────────────────────────────
 * Until the owner runs the migration, the bucket does not exist and neither
 * does the profile_photos_enabled() function its last statement creates. The
 * call then fails, fetchPhotoState() answers not available, and the profile
 * page says photos are not available yet instead of offering a control that
 * cannot save (the same pattern as demo/priceAlerts.ts).
 */

const BUCKET = 'avatars';

export interface PhotoState {
  /** False until the bucket exists, or when it could not be reached. */
  available: boolean;
  /** profiles.avatar_path, or null when no photo is stored. */
  path: string | null;
}

async function signedInUserId(): Promise<string | null> {
  const client = supabase();
  if (!client) return null;
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.id ?? null;
}

/** True once the migration has run: its last statement creates this function. */
async function photosEnabled(): Promise<boolean> {
  const client = supabase();
  if (!client) return false;
  const { data, error } = await client.rpc('profile_photos_enabled');
  return !error && data === true;
}

/**
 * Whether photos work on this deployment, and the stored path if there is
 * one. Two small reads: the migration's switch (a missing function until the
 * owner runs it) and the reader's own profile row.
 */
export async function fetchPhotoState(): Promise<PhotoState> {
  const client = supabase();
  const uid = await signedInUserId();
  if (!client || !uid) return { available: false, path: null };
  const [enabled, profile] = await Promise.all([
    photosEnabled(),
    client.from('profiles').select('avatar_path').eq('id', uid).maybeSingle(),
  ]);
  if (!enabled) return { available: false, path: null };
  const raw = (profile.data as { avatar_path?: unknown } | null)?.avatar_path;
  // Only ever this reader's own path: anything else is ignored rather than
  // fetched (the table's own check constraint says the same).
  const path = typeof raw === 'string' && raw === avatarObjectPath(uid) ? raw : null;
  return { available: true, path };
}

/** The stored photo as a blob, or null when it cannot be read. */
export async function downloadPhoto(path: string): Promise<Blob | null> {
  const client = supabase();
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET).download(path);
  if (error || !data || data.size === 0) return null;
  return data;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

/** Decodes a picked file, applying its EXIF rotation so the square is upright. */
async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to an <img>, which some browsers decode more kindly */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The picked file as a square of at most 256px, encoded afresh as WebP (or
 * JPEG where the browser cannot write WebP) under about 100 KB.
 *
 * Re-encoding through the canvas is what strips the metadata: a canvas holds
 * pixels only, so the EXIF block (camera, time, GPS position) and any other
 * metadata in the original never reach the new file. Null when the file
 * cannot be decoded.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  const decoded = await decode(file);
  if (!decoded) return null;
  try {
    const crop = squareCrop(decoded.width, decoded.height);
    if (!crop) return null;
    const canvas = document.createElement('canvas');
    canvas.width = crop.size;
    canvas.height = crop.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // A transparent PNG would otherwise turn black as a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, crop.size, crop.size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, crop.sx, crop.sy, crop.sSize, crop.sSize, 0, 0, crop.size, crop.size);
    const out = await encodeUnderLimit(
      (type, quality) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)),
      PHOTO_TARGET_BYTES,
    );
    return out;
  } finally {
    decoded.close();
  }
}

export type PhotoResult = { ok: true; path: string | null } | { ok: false; message: string };

/** Saves an already shrunk photo as the reader's one file, then records its path. */
export async function savePhoto(blob: Blob): Promise<PhotoResult> {
  const client = supabase();
  const uid = await signedInUserId();
  if (!client || !uid) return { ok: false, message: 'Sign in to add a photo.' };
  const path = avatarObjectPath(uid);
  const up = await client.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type,
    // A replaced photo should show on the reader's other devices on their
    // next visit, not an hour later from a cached copy.
    cacheControl: '0',
  });
  if (up.error) return { ok: false, message: 'Your photo could not be saved. Please try again.' };
  const { error } = await client.from('profiles').update({ avatar_path: path }).eq('id', uid);
  if (error) {
    // Leave nothing behind that the profile does not point at.
    await client.storage.from(BUCKET).remove([path]);
    return { ok: false, message: 'Your photo could not be saved. Please try again.' };
  }
  return { ok: true, path };
}

/**
 * Removes the reader's photo: the file first, then the path. If the file
 * cannot be removed the path is left as it is, so the profile never claims
 * there is no photo while one is still stored.
 */
export async function removePhoto(): Promise<PhotoResult> {
  const client = supabase();
  const uid = await signedInUserId();
  if (!client || !uid) return { ok: false, message: 'Sign in to remove your photo.' };
  const { error } = await client.storage.from(BUCKET).remove([avatarObjectPath(uid)]);
  if (error) return { ok: false, message: 'Your photo could not be removed. Please try again.' };
  const upd = await client.from('profiles').update({ avatar_path: null }).eq('id', uid);
  if (upd.error) return { ok: false, message: 'Your photo was removed, but your profile could not be updated. Please try again.' };
  return { ok: true, path: null };
}

/**
 * Called by Delete Account before the account itself goes. Storage keeps its
 * own records and does not follow the account's deletion, and Supabase does
 * not allow deleting stored files from SQL, so the file is removed here with
 * the reader's own session. True when there is nothing left to remove.
 */
export async function removePhotoForDeletion(): Promise<boolean> {
  const client = supabase();
  const uid = await signedInUserId();
  if (!client || !uid) return true;
  // Photos not switched on here: there cannot be a photo to delete.
  if (!(await photosEnabled())) return true;
  // Removing a file that is not there is not an error, so this is safe for
  // a reader who never added one.
  const { error } = await client.storage.from(BUCKET).remove([avatarObjectPath(uid)]);
  return !error;
}

/** The photo for Download My Data: a data: address, so the file is inside the JSON. */
export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}
