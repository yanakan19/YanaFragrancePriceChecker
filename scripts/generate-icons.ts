/**
 * Generates the PWA home-screen icons from the same bottle silhouette
 * `demo/art.ts` draws inline for listings ('classic' shape) — so the icon on
 * a phone's home screen is recognisably the same mark as the app itself,
 * not a separate logo invented for this purpose.
 *
 * No image library is available in this project, and pulling one in just for
 * a handful of static PNGs generated once is not worth the dependency. This
 * writes raw PNG bytes directly: a rounded-rect rasteriser with 4x
 * supersampling for smooth edges, zlib (built into Node) for the DEFLATE
 * stream, and a hand-rolled CRC32 for the chunk checksums.
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
const INK = [0xf5, 0xf1, 0xf4] as const;

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

/**
 * Renders the bottle mark into an RGBA buffer at `size`x`size`, supersampled
 * `ss`x for anti-aliasing then box-filtered down. Geometry mirrors the
 * 'classic' shape in demo/art.ts (120x170 viewBox), scaled and centred so
 * the mark sits inside the ~80% safe zone Android's maskable-icon spec wants.
 */
function renderIcon(size: number, ss = 4): Buffer {
  const big = size * ss;
  const scale = (big * 0.625) / 170; // bottle height ≈ 62.5% of canvas
  const offX = (big - 120 * scale) / 2;
  const offY = (big - 170 * scale) / 2;
  const tx = (x: number) => offX + x * scale;
  const ty = (y: number) => offY + y * scale;
  const ts = (n: number) => n * scale;

  const cap1 = { x: tx(45), y: ty(14), w: ts(30), h: ts(21), r: ts(2.5) };
  const cap2 = { x: tx(51), y: ty(33), w: ts(18), h: ts(9), r: 0 };
  const body = { x: tx(21), y: ty(41), w: ts(78), h: ts(119), r: ts(11) };
  const shine = { x: tx(29), y: ty(50), w: ts(12), h: ts(98), r: ts(6) };

  const px = Buffer.alloc(big * big * 4);
  for (let y = 0; y < big; y++) {
    for (let x = 0; x < big; x++) {
      const i = (y * big + x) * 4;
      let r: number = BG[0];
      let g: number = BG[1];
      let b: number = BG[2];
      const a = 255;

      if (insideRoundedRect(x, y, body.x, body.y, body.w, body.h, body.r)) {
        const t = Math.min(1, Math.max(0, (y - body.y) / body.h));
        r = Math.round(GLASS_TOP[0] + (GLASS_BOTTOM[0] - GLASS_TOP[0]) * t);
        g = Math.round(GLASS_TOP[1] + (GLASS_BOTTOM[1] - GLASS_TOP[1]) * t);
        b = Math.round(GLASS_TOP[2] + (GLASS_BOTTOM[2] - GLASS_TOP[2]) * t);
        if (insideRoundedRect(x, y, shine.x, shine.y, shine.w, shine.h, shine.r)) {
          const mix = 0.16;
          r = Math.round(r + (255 - r) * mix);
          g = Math.round(g + (255 - g) * mix);
          b = Math.round(b + (255 - b) * mix);
        }
      }
      if (
        insideRoundedRect(x, y, cap1.x, cap1.y, cap1.w, cap1.h, cap1.r) ||
        insideRoundedRect(x, y, cap2.x, cap2.y, cap2.w, cap2.h, cap2.r)
      ) {
        [r, g, b] = INK;
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
