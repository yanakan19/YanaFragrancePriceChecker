/**
 * Generates the PWA home-screen icons: a magnifying glass mark for
 * PriceSniffs, mirroring the shape hand-authored in demo/favicon.svg so the
 * icon on a phone's home screen is recognisably the same mark as the app
 * itself, not a separate logo invented for this purpose.
 *
 * No image library is available in this project, and pulling one in just for
 * a handful of static PNGs generated once is not worth the dependency. This
 * writes raw PNG bytes directly: a rounded-rect rasteriser with 4x
 * supersampling for smooth edges, zlib (built into Node) for the DEFLATE
 * stream, and a hand-rolled CRC32 for the chunk checksums.
 *
 * The glyph itself is still built from that one rounded-rect primitive:
 * a circle is a square rounded-rect with its corner radius equal to half its
 * side, and the handle is the same primitive tested in coordinates rotated
 * about a pivot before the lookup. No new shape types, no letterforms.
 *
 * Output is static — icons do not depend on catalogue data — so this is run
 * once by hand (`npm run icons`) and the PNGs are committed, unlike
 * demo/index.html which is rebuilt by every crawl.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'demo/icons');
mkdirSync(outDir, { recursive: true });

// Same palette as demo/template.html's dark mode — the icon should read as
// "this app", so it uses the app's own colours, not a fresh set.
const BG = [0x13, 0x10, 0x13] as const;
const GLASS_TOP = [0xf0, 0x55, 0x5d] as const;
const GLASS_BOTTOM = [0xb7, 0x2e, 0x37] as const;

function insideRoundedRect(
  px: number, py: number, x: number, y: number, w: number, h: number, r: number,
): boolean {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** A circle is just a square rounded-rect whose radius is half its side. */
function insideCircle(px: number, py: number, cx: number, cy: number, radius: number): boolean {
  return insideRoundedRect(px, py, cx - radius, cy - radius, radius * 2, radius * 2, radius);
}

/**
 * A capsule (the glass's handle): the same rounded-rect primitive, tested
 * against coordinates rotated back into the rect's own frame first, so the
 * rect itself never has to know it is drawn at an angle. `ox,oy` is the
 * pivot the capsule extends from, along `angle` radians, for `length`, at
 * `width` with fully rounded ends (r = width / 2).
 */
function insideCapsule(
  px: number, py: number, ox: number, oy: number, angle: number, length: number, width: number,
): boolean {
  const dx = px - ox;
  const dy = py - oy;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return insideRoundedRect(lx, ly, 0, -width / 2, length, width, width / 2);
}

// Magnifying glass geometry, in a 120x120 space: a ring (ring width =
// outerR - innerR) with a capsule handle trailing off at an angle, like it
// just swept across a price and stopped on the cheapest one. Numbers are
// picked so the whole mark sits centred with a comfortable margin, inside
// the ~80% safe zone Android's maskable-icon spec wants.
const GLYPH_BOX = 120;
const RING_CX = 50;
const RING_CY = 52;
const RING_OUTER_R = 30;
const RING_INNER_R = 19;
const HANDLE_ANGLE = (42 * Math.PI) / 180;
const HANDLE_START_R = RING_OUTER_R - 4; // overlaps the ring so there is no seam
const HANDLE_LENGTH = 34;
const HANDLE_WIDTH = 13;
const HANDLE_OX = RING_CX + Math.cos(HANDLE_ANGLE) * HANDLE_START_R;
const HANDLE_OY = RING_CY + Math.sin(HANDLE_ANGLE) * HANDLE_START_R;
// A small glass highlight, upper left of the ring, only visible where it
// overlaps the ring band.
const SHINE_CX = RING_CX - 9;
const SHINE_CY = RING_CY - 11;
const SHINE_R = 10;

/**
 * Renders the magnifying glass mark into an RGBA buffer at `size`x`size`,
 * supersampled `ss`x for anti-aliasing then box-filtered down.
 */
function renderIcon(size: number, ss = 4): Buffer {
  const big = size * ss;
  const scale = big / GLYPH_BOX;
  const tx = (x: number) => x * scale;
  const ty = (y: number) => y * scale;

  const cx = tx(RING_CX);
  const cy = ty(RING_CY);
  const outerR = tx(RING_OUTER_R);
  const innerR = tx(RING_INNER_R);
  const hOx = tx(HANDLE_OX);
  const hOy = ty(HANDLE_OY);
  const hLen = tx(HANDLE_LENGTH);
  const hWidth = tx(HANDLE_WIDTH);
  const shineCx = tx(SHINE_CX);
  const shineCy = ty(SHINE_CY);
  const shineR = tx(SHINE_R);

  const px = Buffer.alloc(big * big * 4);
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const i = (y * big + x) * 4;
      let r: number = BG[0];
      let g: number = BG[1];
      let b: number = BG[2];
      const a = 255;

      const inRing = insideCircle(x, y, cx, cy, outerR) && !insideCircle(x, y, cx, cy, innerR);
      const inHandle = insideCapsule(x, y, hOx, hOy, HANDLE_ANGLE, hLen, hWidth);

      if (inRing || inHandle) {
        // Gradient runs top to bottom of the whole mark, so the ring and the
        // handle read as one continuous piece of glass.
        const t = Math.min(1, Math.max(0, (y - (cy - outerR)) / (outerR * 2)));
        r = Math.round(GLASS_TOP[0] + (GLASS_BOTTOM[0] - GLASS_TOP[0]) * t);
        g = Math.round(GLASS_TOP[1] + (GLASS_BOTTOM[1] - GLASS_TOP[1]) * t);
        b = Math.round(GLASS_TOP[2] + (GLASS_BOTTOM[2] - GLASS_TOP[2]) * t);
        if (inRing && insideCircle(x, y, shineCx, shineCy, shineR)) {
          const mix = 0.18;
          r = Math.round(r + (255 - r) * mix);
          g = Math.round(g + (255 - g) * mix);
          b = Math.round(b + (255 - b) * mix);
        }
      }

      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    }
  }

  // Box-filter downsample from big x big to size x size.
  const out = Buffer.alloc(size * size * 4);
  const norm = ss * ss;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const si = ((y * ss + sy) * big + (x * ss + sx)) * 4;
          r += px[si]!; g += px[si + 1]!; b += px[si + 2]!; a += px[si + 3]!;
        }
      }
      const oi = (y * size + x) * 4;
      out[oi] = Math.round(r / norm);
      out[oi + 1] = Math.round(g / norm);
      out[oi + 2] = Math.round(b / norm);
      out[oi + 3] = Math.round(a / norm);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Encodes a raw RGBA pixel buffer as a PNG file (8-bit, no interlace, filter 0 per row). */
function encodePng(rgba: Buffer, size: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sizes: Array<{ name: string; size: number }> = [
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
];

for (const { name, size } of sizes) {
  const png = encodePng(renderIcon(size), size);
  writeFileSync(resolve(outDir, name), png);
  console.log(`${name.padEnd(22)} ${(png.length / 1024).toFixed(1)} kB`);
}
