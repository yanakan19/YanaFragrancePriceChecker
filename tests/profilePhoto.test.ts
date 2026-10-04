import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  avatarObjectPath, checkPhotoFile, encodeUnderLimit, photoFileType, squareCrop,
  PHOTO_ACCEPT_ATTR, PHOTO_MAX_INPUT_BYTES, PHOTO_MAX_SIDE, PHOTO_TARGET_BYTES, type Encoded,
} from '../src/services/profilePhoto.js';
import { buildDataExport } from '../src/services/accountMenu.js';

/**
 * The profile photo (owner request, 4 October 2026), the parts that need no
 * browser: which files are accepted, the square crop, the encoder loop that
 * keeps the file under about 100 KB, the Download My Data fields, and the
 * guard rails in the migration. The browser half (the control, the button,
 * the fallback) is in tests/accountPagesBrowser.test.ts.
 */

const MB = 1024 * 1024;

describe('which files are accepted', () => {
  it('takes JPEG, PNG and WebP only', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(checkPhotoFile({ type, name: 'x', size: 2 * MB }).ok, type).toBe(true);
    }
    for (const type of ['image/heic', 'image/gif', 'image/svg+xml', 'image/avif', 'application/pdf', 'text/plain']) {
      const r = checkPhotoFile({ type, name: 'x', size: 1000 });
      expect(r.ok, type).toBe(false);
      if (!r.ok) expect(r.title).toBe('Choose a JPEG, PNG or WebP');
    }
    expect(PHOTO_ACCEPT_ATTR).toBe('image/jpeg,image/png,image/webp');
  });

  it('falls back to the extension only when the browser reports no type', () => {
    expect(photoFileType({ type: '', name: 'Me.JPG' })).toBe('image/jpeg');
    expect(photoFileType({ type: '', name: 'me.webp' })).toBe('image/webp');
    expect(photoFileType({ type: '', name: 'me.heic' })).toBe('');
    expect(photoFileType({ type: '', name: 'no extension' })).toBe('');
    // A reported type wins over a misleading name.
    expect(checkPhotoFile({ type: 'image/heic', name: 'me.jpg', size: 1000 }).ok).toBe(false);
  });

  it('refuses an empty file and anything over the limit, with words for the pop up', () => {
    expect(checkPhotoFile({ type: 'image/png', name: 'x.png', size: 0 }).ok).toBe(false);
    expect(checkPhotoFile({ type: 'image/png', name: 'x.png', size: PHOTO_MAX_INPUT_BYTES }).ok).toBe(true);
    const big = checkPhotoFile({ type: 'image/jpeg', name: 'x.jpg', size: PHOTO_MAX_INPUT_BYTES + 1 });
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.title).toBe('That Photo Is Too Large');
      expect(big.message).toContain('15 MB');
    }
  });

  it('says nothing with a hyphen or dash to the reader', () => {
    const texts = [
      checkPhotoFile({ type: 'image/gif', name: 'x', size: 1 }),
      checkPhotoFile({ type: 'image/png', name: 'x', size: 0 }),
      checkPhotoFile({ type: 'image/png', name: 'x', size: PHOTO_MAX_INPUT_BYTES + 1 }),
    ].flatMap((r) => (r.ok ? [] : [r.title, r.message]));
    expect(texts).toHaveLength(6);
    for (const t of texts) expect(t).not.toMatch(/[-\u2010-\u2015]/);
  });
});

describe('the square crop', () => {
  it('takes the centred square of a landscape or portrait picture', () => {
    expect(squareCrop(4000, 3000)).toEqual({ sx: 500, sy: 0, sSize: 3000, size: PHOTO_MAX_SIDE });
    expect(squareCrop(3000, 4000)).toEqual({ sx: 0, sy: 500, sSize: 3000, size: 256 });
    expect(squareCrop(1001, 600)).toEqual({ sx: 200, sy: 0, sSize: 600, size: 256 });
  });

  it('never enlarges a small picture and never exceeds 256px', () => {
    expect(squareCrop(120, 80)).toEqual({ sx: 20, sy: 0, sSize: 80, size: 80 });
    expect(squareCrop(256, 256)!.size).toBe(256);
    expect(squareCrop(257, 9000)!.size).toBe(256);
    expect(squareCrop(1, 1)).toEqual({ sx: 0, sy: 0, sSize: 1, size: 1 });
  });

  it('refuses a picture with no pixels', () => {
    expect(squareCrop(0, 100)).toBeNull();
    expect(squareCrop(100, 0)).toBeNull();
    expect(squareCrop(Number.NaN, 100)).toBeNull();
    expect(squareCrop(0.4, 0.4)).toBeNull();
  });
});

describe('the encoder loop', () => {
  /** An encoder whose output shrinks with quality, recording every call. */
  function fakeEncoder(opts: { webp: boolean; bytesAt: (q: number) => number }) {
    const calls: [string, number][] = [];
    const encode = async (type: 'image/webp' | 'image/jpeg', quality: number): Promise<Encoded> => {
      calls.push([type, quality]);
      // A browser that cannot write WebP hands back a PNG instead.
      const outType = type === 'image/webp' && !opts.webp ? 'image/png' : type;
      return { type: outType, size: opts.bytesAt(quality) };
    };
    return { encode, calls };
  }

  it('keeps the first WebP when it is already small enough', async () => {
    const { encode, calls } = fakeEncoder({ webp: true, bytesAt: () => 40_000 });
    const out = await encodeUnderLimit(encode);
    expect(out).toEqual({ type: 'image/webp', size: 40_000 });
    expect(calls).toEqual([['image/webp', 0.86]]);
  });

  it('steps the quality down until the file is under about 100 KB', async () => {
    const { encode, calls } = fakeEncoder({ webp: true, bytesAt: (q) => Math.round(q * 160_000) });
    const out = await encodeUnderLimit(encode);
    expect(out!.type).toBe('image/webp');
    expect(out!.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
    expect(calls.map((c) => c[1])).toEqual([0.86, 0.78, 0.7, 0.6]);
  });

  it('writes JPEG when the browser cannot write WebP', async () => {
    const { encode, calls } = fakeEncoder({ webp: false, bytesAt: (q) => Math.round(q * 120_000) });
    const out = await encodeUnderLimit(encode);
    expect(out!.type).toBe('image/jpeg');
    expect(out!.size).toBeLessThanOrEqual(PHOTO_TARGET_BYTES);
    expect(calls[0]).toEqual(['image/webp', 0.86]);
    expect(calls.slice(1).every(([t]) => t === 'image/jpeg')).toBe(true);
  });

  it('hands back the smallest it managed when nothing fits, and null when nothing encodes', async () => {
    const { encode } = fakeEncoder({ webp: true, bytesAt: (q) => 150_000 + Math.round(q * 10_000) });
    expect((await encodeUnderLimit(encode))!.size).toBe(154_000);
    expect(await encodeUnderLimit(async () => null)).toBeNull();
  });
});

describe('the stored object and Download My Data', () => {
  it('keeps one object per reader, keyed by the user id', () => {
    expect(avatarObjectPath('00000000-0000-4000-8000-000000000001')).toBe('00000000-0000-4000-8000-000000000001/avatar');
  });

  const base = {
    email: 'reader@example.com',
    accountCreatedAt: '2026-09-20T10:00:00Z',
    emailConfirmedAt: '2026-09-20T10:05:00Z',
    wishlist: [],
    fragranceName: () => null,
    priceAlerts: false,
    exportedAt: new Date('2026-10-04T12:00:00Z'),
  };

  it('says whether a photo is stored, and carries the file itself', () => {
    const file = buildDataExport({ ...base, photo: { stored: true, contentType: 'image/webp', dataUrl: 'data:image/webp;base64,AAAA' } });
    expect(file.profilePhoto).toEqual({ stored: true, contentType: 'image/webp', file: 'data:image/webp;base64,AAAA' });
    const none = buildDataExport({ ...base, photo: { stored: false, contentType: null, dataUrl: null } });
    expect(none.profilePhoto).toEqual({ stored: false, contentType: null, file: null });
  });

  it('says null, not no, when photos are not switched on or were not read', () => {
    expect(buildDataExport(base).profilePhoto).toEqual({ stored: null, contentType: null, file: null });
  });
});

describe('the migration', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0006_profile_photo.sql', import.meta.url), 'utf8');
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('adds the path column and keeps it to the reader\'s own object', () => {
    expect(code).toMatch(/add column if not exists avatar_path text;/);
    expect(code).toMatch(/check \(avatar_path is null or avatar_path = id::text \|\| '\/avatar'\)/);
  });

  it('makes a private bucket for small WebP and JPEG files only', () => {
    expect(code).toMatch(/values \('avatars', 'avatars', false, 204800, array\['image\/webp', 'image\/jpeg'\]\)/);
    expect(code).toMatch(/on conflict \(id\) do update/);
    expect(code).not.toMatch(/true, \d+, array/);
  });

  it('lets a signed in reader read, upload, replace and delete only their own file', () => {
    const own = "bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar'";
    for (const verb of ['select', 'insert', 'update', 'delete']) {
      const re = new RegExp(`on storage\\.objects for ${verb}\\s+to authenticated\\s+(using|with check) \\(${own.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`);
      expect(code, verb).toMatch(re);
    }
    expect(code).not.toMatch(/to (anon|public)\b/);
    // Idempotent, like every migration before it.
    expect((code.match(/create policy/g) ?? []).length).toBe((code.match(/drop policy if exists/g) ?? []).length);
  });

  it('creates the switch the site looks for last, callable only when signed in', () => {
    const last = code.lastIndexOf('create or replace function public.profile_photos_enabled()');
    expect(last).toBeGreaterThan(code.lastIndexOf('create policy'));
    expect(last).toBeGreaterThan(code.indexOf('insert into storage.buckets'));
    expect(code).toMatch(/revoke all on function public\.profile_photos_enabled\(\) from public, anon;/);
    expect(code).toMatch(/grant execute on function public\.profile_photos_enabled\(\) to authenticated;/);
  });
});
