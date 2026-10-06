/**
 * The pixel size of an image, read from its first bytes.
 *
 * scripts/better-photos.ts asks a shop for the head of an image (a Range
 * request for the first 64 KB) and needs only the width and height, so this
 * reads the header of the four formats product photos come in (JPEG, PNG, GIF,
 * WebP) and nothing else. It decodes no pixels and needs no library. Null means
 * "not an image this reads", which the caller treats as no photo.
 */
export interface ImageSize {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const b = bytes;
  if (b.length < 12) return null;

  // PNG: signature, then the IHDR chunk holds width and height.
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') {
    if (b.length < 24) return null;
    return positive(u32be(b, 16), u32be(b, 20));
  }

  // GIF: the logical screen size follows the six byte signature.
  if (ascii(b, 0, 3) === 'GIF') return positive(u16le(b, 6), u16le(b, 8));

  // WebP: RIFF container with a VP8 (lossy), VP8L (lossless) or VP8X (extended) chunk.
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const kind = ascii(b, 12, 4);
    if (kind === 'VP8X' && b.length >= 30) {
      const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
      return positive(w, h);
    }
    if (kind === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return positive(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    }
    if (kind === 'VP8L' && b.length >= 25 && b[20] === 0x2f) {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return positive((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    return null;
  }

  // JPEG: walk the marker segments to the first start-of-frame marker.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker === 0xff) {
        i++;
        continue;
      }
      // Markers without a length: padding, restart markers, SOI, EOI, TEM.
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isStartOfFrame) return positive(u16be(b, i + 7), u16be(b, i + 5));
      i += 2 + u16be(b, i + 2);
    }
    return null;
  }

  return null;
}

function positive(width: number, height: number): ImageSize | null {
  return width > 0 && height > 0 ? { width, height } : null;
}
