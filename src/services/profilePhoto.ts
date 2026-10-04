/**
 * The profile photo's pure half: which files are accepted, how a picture of
 * any shape becomes a small square, and how the encoder is driven until the
 * file is small enough. No DOM and no Supabase here, so every rule can be
 * pinned by tests/profilePhoto.test.ts; demo/profilePhoto.ts does the canvas
 * work and the storage calls.
 *
 * Why the browser does the shrinking, not a server: there is no server of
 * ours, and a phone photo is several megabytes of pixels plus metadata
 * (often the place it was taken). Drawing it onto a canvas and encoding the
 * canvas afresh keeps only pixels: EXIF, GPS, camera details and colour
 * profiles do not survive the trip, because a canvas never holds them. So
 * what leaves the browser is a small square image and nothing else.
 */

/** The three formats a reader may pick. HEIC, GIF, SVG and the rest are refused. */
export const PHOTO_ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** The file input's accept attribute. */
export const PHOTO_ACCEPT_ATTR = PHOTO_ACCEPT_TYPES.join(',');

/**
 * The largest file accepted before shrinking. A modern phone photo is 2 to 8
 * MB; 15 MB leaves room for a large camera JPEG while refusing anything that
 * would make a phone's browser struggle to decode it.
 */
export const PHOTO_MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** The square's side in pixels. The button is 38px and the profile shows 96px. */
export const PHOTO_MAX_SIDE = 256;

/** The target for the stored file. The bucket itself refuses anything over 200 KB. */
export const PHOTO_TARGET_BYTES = 100 * 1024;

/** The one object a reader may hold in the avatars bucket: `<user id>/avatar`. */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar`;
}

export type PhotoCheck = { ok: true } | { ok: false; title: string; message: string };

const EXTENSION_TYPES: Record<string, (typeof PHOTO_ACCEPT_TYPES)[number]> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * The type a picked file really claims. Most browsers report it; a few leave
 * it blank for some files, and then the extension decides. A reported type
 * always wins over the name, so `photo.jpg` reported as HEIC is refused.
 */
export function photoFileType(file: { type: string; name: string }): string {
  if (file.type) return file.type.toLowerCase();
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return EXTENSION_TYPES[ext] ?? '';
}

/** Whether a picked file may go on to be shrunk, with the pop up's words if not. */
export function checkPhotoFile(file: { type: string; name: string; size: number }): PhotoCheck {
  const type = photoFileType(file);
  if (!(PHOTO_ACCEPT_TYPES as readonly string[]).includes(type)) {
    return {
      ok: false,
      title: 'Choose a JPEG, PNG or WebP',
      message: 'Your photo needs to be a JPEG, PNG or WebP image. Other kinds of file, such as HEIC or GIF, cannot be used.',
    };
  }
  if (file.size <= 0) {
    return { ok: false, title: 'That File Is Empty', message: 'The file you chose has nothing in it. Please choose another photo.' };
  }
  if (file.size > PHOTO_MAX_INPUT_BYTES) {
    return {
      ok: false,
      title: 'That Photo Is Too Large',
      message: `Choose a photo under ${Math.round(PHOTO_MAX_INPUT_BYTES / (1024 * 1024))} MB. It is made smaller before it is saved, but very large files can stop your browser.`,
    };
  }
  return { ok: true };
}

export interface SquareCrop {
  /** Where the square starts in the source, and how big it is there. */
  sx: number;
  sy: number;
  sSize: number;
  /** The output square's side. */
  size: number;
}

/**
 * The centred square cut from a picture of any shape, and the side it is
 * drawn at: the shorter edge, never enlarged, never more than `max`.
 * Null for a picture with no pixels, which cannot be used.
 */
export function squareCrop(width: number, height: number, max = PHOTO_MAX_SIDE): SquareCrop | null {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const sSize = Math.floor(Math.min(width, height));
  if (sSize < 1) return null;
  return {
    sx: Math.floor((width - sSize) / 2),
    sy: Math.floor((height - sSize) / 2),
    sSize,
    size: Math.max(1, Math.min(sSize, max)),
  };
}

/** What an encoder hands back: anything with a size and a type, such as a Blob. */
export interface Encoded {
  size: number;
  type: string;
}

export type Encoder<T extends Encoded> = (type: 'image/webp' | 'image/jpeg', quality: number) => Promise<T | null>;

/** The qualities tried in turn, best first. */
export const PHOTO_QUALITIES = [0.86, 0.78, 0.7, 0.6, 0.5, 0.4] as const;

/**
 * Drives an encoder until the file is under `limit`.
 *
 * WebP first, because it is smaller at the same quality. A browser that
 * cannot write WebP from a canvas quietly hands back a PNG instead (older
 * Safari does), so the answer's own type is checked, and JPEG is used when it
 * is not WebP. Quality steps down until the file fits; if even the lowest
 * quality does not fit, the smallest result is returned and the caller
 * decides (the bucket's own ceiling is double the target, so a 256px square
 * always fits in practice).
 */
export async function encodeUnderLimit<T extends Encoded>(encode: Encoder<T>, limit = PHOTO_TARGET_BYTES): Promise<T | null> {
  let type: 'image/webp' | 'image/jpeg' = 'image/webp';
  const probe = await encode('image/webp', PHOTO_QUALITIES[0]);
  if (!probe || probe.type !== 'image/webp') type = 'image/jpeg';
  let smallest: T | null = type === 'image/webp' ? probe : null;
  if (smallest && smallest.size <= limit) return smallest;
  for (const q of PHOTO_QUALITIES) {
    if (type === 'image/webp' && q === PHOTO_QUALITIES[0]) continue;
    const out = await encode(type, q);
    if (!out || out.type !== type) continue;
    if (!smallest || out.size < smallest.size) smallest = out;
    if (out.size <= limit) return out;
  }
  return smallest;
}
