import { describe, expect, it } from 'vitest';
import { readImageSize } from '../src/catalogue/imageHeader.js';

const bytes = (...parts: (number | string | number[])[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : Array.isArray(p) ? p : [p])));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

describe('readImageSize', () => {
  it('reads a PNG from its IHDR chunk', () => {
    const png = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, be32(13), 'IHDR', be32(900), be32(1200), 8, 6, 0, 0, 0);
    expect(readImageSize(png)).toEqual({ width: 900, height: 1200 });
  });

  it('reads a GIF from its logical screen', () => {
    expect(readImageSize(bytes('GIF89a', le16(70), le16(70), 0, 0, 0, 0))).toEqual({ width: 70, height: 70 });
  });

  it('reads a JPEG past a comment segment, to its first start of frame', () => {
    const jpeg = bytes(
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10, 'JFIF', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, // APP0, length 16
      0xff, 0xfe, 0x00, 0x05, 'abc', // comment, length 5
      0xff, 0xc4, 0x00, 0x04, 0, 0, // a Huffman table is not a frame
      0xff, 0xc0, 0x00, 0x11, 8, [0x01, 0x42], [0x01, 0x07], 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    );
    expect(readImageSize(jpeg)).toEqual({ width: 263, height: 322 });
  });

  it('reads a progressive JPEG (SOF2) the same way', () => {
    const jpeg = bytes(0xff, 0xd8, 0xff, 0xc2, 0x00, 0x0b, 8, [0x00, 0x80], [0x00, 0xc8], 1, 1, 0x11, 0, 0, 0, 0);
    expect(readImageSize(jpeg)).toEqual({ width: 200, height: 128 });
  });

  it('reads a lossy WebP (VP8)', () => {
    const webp = bytes('RIFF', be32(0), 'WEBP', 'VP8 ', 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, le16(900), le16(1100), 0, 0);
    expect(readImageSize(webp)).toEqual({ width: 900, height: 1100 });
  });

  it('reads an extended WebP (VP8X), whose sizes are stored minus one', () => {
    const webp = bytes('RIFF', be32(0), 'WEBP', 'VP8X', 10, 0, 0, 0, 0, 0, 0, 0, le24(1499), le24(1999), 0, 0);
    expect(readImageSize(webp)).toEqual({ width: 1500, height: 2000 });
  });

  it('reads a lossless WebP (VP8L)', () => {
    const w = 640 - 1;
    const h = 480 - 1;
    const packed = (w | (h << 14)) >>> 0;
    const webp = bytes('RIFF', be32(0), 'WEBP', 'VP8L', 5, 0, 0, 0, 0x2f, le16(packed & 0xffff), le16(packed >>> 16), 0, 0);
    expect(readImageSize(webp)).toEqual({ width: 640, height: 480 });
  });

  it('returns null for anything else, and for a truncated file', () => {
    expect(readImageSize(bytes('<!DOCTYPE html><html>'))).toBeNull();
    expect(readImageSize(bytes(0x89, 'PNG'))).toBeNull();
    expect(readImageSize(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'JFIF', 0, 1, 1))).toBeNull();
    expect(readImageSize(new Uint8Array(0))).toBeNull();
  });

  it('refuses a zero size', () => {
    expect(readImageSize(bytes('GIF89a', le16(0), le16(5), 0, 0, 0, 0))).toBeNull();
  });
});
