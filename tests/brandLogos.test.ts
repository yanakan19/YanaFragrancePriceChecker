import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRAND_LOGOS, logoFor } from '../demo/brandLogos.js';
import { BRAND_SITES } from '../demo/brandSites.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { LogoRef, LogoBasis } from '../src/types/retailer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The registrable domain of a host — the brand-owned part, with any subdomain
 * dropped. `www.lattafa.com` and `uk.lattafa.com` both reduce to `lattafa.com`,
 * so a brand serving its logo from a regional or `www` subdomain of its own
 * site still counts as its own. The two-label default is widened to three for
 * the second-level suffixes that actually appear in the data (`.co.uk` and its
 * siblings), so two different `.co.uk` brands can never be read as one.
 */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.');
  const sld = new Set(['co.uk', 'org.uk', 'me.uk', 'com.au', 'co.nz', 'co.za']);
  const lastTwo = labels.slice(-2).join('.');
  return sld.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * Hosts that are NOT a brand's own domain but ARE where that brand's own site
 * serves its declared logo asset, each confirmed against the entry that needs
 * it (2026-09-10). This is the whole allowance for an off-domain `src`: an
 * `own-site-declared` logo host must be the brand's own registrable domain or
 * one of these, and nothing else — which is what stops a logo being hot-linked
 * from an arbitrary third party whose terms we have not read (docs/LOGOS-PLAN.md,
 * "must not be done"). Add a host here only after confirming the brand's own
 * site is what serves the asset from it.
 */
const DECLARED_ASSET_HOSTS = new Set([
  'cdn.shopify.com', // Shopify stores (e.g. Ariana Grande)
  'cdn.prod.website-files.com', // Webflow (Davidoff)
  'scdn.speedsize.com', // SpeedSize image CDN (Escentric Molecules)
  'cdn.files.salla.network', // Salla storefronts (Le Bonheur)
  'www.lattafa-usa.com', // Lattafa's own US site; brand site is lattafa.com
  'www.bgstatic.net', // Perfume Click's own asset host: perfume-click.co.uk declares its favicon there (2026-10-03)
  'us.thebeautystore.com', // The Beauty Store's own US storefront, declared by thebeautystore.com
]);

/**
 * The invariants docs/LOGOS-PLAN.md §4e and §5 step 4 require of every
 * `LogoRef` that ships, retailer or brand, mirroring the discipline
 * `imageBasis` already runs on product photography: nothing is shown without
 * a recorded reason, and the reason has to be one this repo actually has a
 * basis for (§2c).
 */
function allLogoRefs(): { where: string; logo: LogoRef }[] {
  const out: { where: string; logo: LogoRef }[] = [];
  for (const r of RETAILERS) if (r.logo) out.push({ where: `retailer:${r.id}`, logo: r.logo });
  for (const r of RETAILERS) if (r.squareLogo) out.push({ where: `retailer:${r.id}:square`, logo: r.squareLogo });
  for (const [key, logo] of Object.entries(BRAND_LOGOS)) out.push({ where: `brand:${key}`, logo });
  return out;
}

const VALID_BASES: LogoBasis[] = ['own-site-declared', 'commons-public-domain', 'affiliate-creative', 'owner-supplied'];

describe('every LogoRef carries a recorded reason', () => {
  const refs = allLogoRefs();

  it('has at least the entries this pass actually added', () => {
    // Not a fixed count — the brand pass adds entries one at a time — just a
    // floor so this suite cannot silently pass against an empty registry.
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))('%s has a non-empty source and readAt', (_where, logo) => {
    expect(logo.source, `${_where}: source is required — see docs/LOGOS-PLAN.md §4e`).toBeTruthy();
    expect(logo.readAt, `${_where}: readAt is required`).toBeTruthy();
    expect(logo.readAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))('%s has one of the recorded basis values', (_where, logo) => {
    expect(VALID_BASES).toContain(logo.basis);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))('%s has a shape and an ink', (_where, logo) => {
    expect(['square', 'wordmark']).toContain(logo.shape);
    expect(['dark', 'light', 'own']).toContain(logo.ink);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))(
    '%s: commons-public-domain points under /logos/, an own-site logo sits on the brand’s own domain',
    (where, logo) => {
      if (logo.basis === 'commons-public-domain') {
        expect(logo.src.startsWith('/logos/'), `${where}: commons-public-domain must be a repo path under /logos/, got ${logo.src}`).toBe(true);
        return;
      }
      if (logo.basis === 'owner-supplied') {
        expect(logo.src.startsWith('/logos/shops/'), `${where}: owner-supplied must be a repo path under /logos/shops/, got ${logo.src}`).toBe(true);
        return;
      }

      expect(logo.src.startsWith('https://'), `${where}: ${logo.basis} must be an absolute https URL, got ${logo.src}`).toBe(true);

      // The load-bearing half, and the one a bare https check missed: an
      // own-site-declared logo has to be traceable to the brand itself, or the
      // referential-use basis (docs/LOGOS-PLAN.md §2c) does not hold. The host
      // must be the brand's own registrable domain, or a documented asset host
      // its own site serves from. A brand entry with no BRAND_SITES entry has
      // no "own domain" to check against, so it cannot carry this basis.
      // The same rule for a shop's own logo (added 2026-10-03 with the retailer
      // pass): it must sit on the shop's own registrable domain, or a host
      // that shop's own homepage declares it from.
      if (logo.basis === 'own-site-declared' && where.startsWith('retailer:')) {
        const id = where.slice('retailer:'.length).replace(/:square$/, '');
        const shop = RETAILERS.find((r) => r.id === id)!;
        const host = new URL(logo.src).host;
        expect(
          registrableDomain(host) === registrableDomain(shop.domain) || DECLARED_ASSET_HOSTS.has(host),
          `${where}: own-site-declared logo host ${host} is neither the shop's own domain (${shop.domain}) nor a documented asset host`,
        ).toBe(true);
      }
      if (logo.basis === 'own-site-declared' && where.startsWith('brand:')) {
        const key = where.slice('brand:'.length);
        const site = BRAND_SITES[key];
        const host = new URL(logo.src).host;
        const onOwnDomain =
          site !== undefined && registrableDomain(host) === registrableDomain(new URL(site).host);
        expect(
          onOwnDomain || DECLARED_ASSET_HOSTS.has(host),
          `${where}: own-site-declared logo host ${host} is neither the brand's own domain (${site ?? 'no BRAND_SITES entry'}) nor a documented asset host`,
        ).toBe(true);
      }
    },
  );
});

describe('a squareLogo is square, and only sits beside a wordmark', () => {
  it.each(RETAILERS.filter((r) => r.squareLogo).map((r) => [r.id, r] as const))('%s', (_id, r) => {
    expect(r.squareLogo!.shape).toBe('square');
    // A shop whose main logo is already square needs no second one.
    expect(r.logo?.shape).not.toBe('square');
  });
});

describe('logoFor keys exactly as BRAND_SITES does', () => {
  it('resolves an entry back through the same normalisation used to add it', () => {
    // Every key already in BRAND_LOGOS must itself be reachable by name —
    // i.e. logoFor of some real-looking brand string normalizes onto it.
    // Cheapest real check: the key itself, title-cased, resolves to itself.
    for (const key of Object.keys(BRAND_LOGOS)) {
      const titled = key.replace(/\b\w/g, (c) => c.toUpperCase());
      expect(logoFor(titled)).toBe(BRAND_LOGOS[key]);
    }
  });

  it('returns null for a brand with no entry, never a guess', () => {
    expect(logoFor('Some Brand Nobody Has Ever Heard Of')).toBeNull();
  });
});

describe('demo/logos/ stays inside the committed-SVG budget', () => {
  const logosDir = resolve(root, 'demo/logos');
  const exists = (() => {
    try {
      return statSync(logosDir).isDirectory();
    } catch {
      return false;
    }
  })();

  it('no committed file exceeds 8 KB, and the directory totals under 400 KB', () => {
    if (!exists) return; // nothing committed yet is a pass, not a failure
    const files = readdirSync(logosDir).filter((f) => f.endsWith('.svg'));
    let total = 0;
    for (const f of files) {
      const size = statSync(resolve(logosDir, f)).size;
      expect(size, `demo/logos/${f} is ${size} bytes, over the 8 KB per-file budget`).toBeLessThanOrEqual(8 * 1024);
      total += size;
    }
    expect(total, `demo/logos/ totals ${total} bytes, over the 400 KB budget`).toBeLessThanOrEqual(400 * 1024);
  });

  it('every commons-public-domain LogoRef points at a file that actually exists', () => {
    for (const { where, logo } of allLogoRefs()) {
      if (logo.basis !== 'commons-public-domain') continue;
      const path = resolve(root, 'demo', logo.src.replace(/^\//, ''));
      expect(() => statSync(path), `${where}: ${logo.src} does not exist on disk`).not.toThrow();
    }
  });
});

describe('the logo paragraph appears in the Terms once any logo is set', () => {
  it('demo/legal.ts mentions logos when the registry is non-empty', () => {
    if (allLogoRefs().length === 0) return;
    const legal = readFileSync(resolve(root, 'demo/legal.ts'), 'utf8');
    expect(legal.toLowerCase()).toContain('logo');
  });
});

/**
 * Owner supplied logos (docs/LOGOS-PLAN.md §7): shop files we host under
 * demo/logos/shops/, flattened on solid white by the owner's rule. These read
 * the PNG itself (node:zlib, no image library) so "no transparency, white on
 * every side" is checked on the bytes, not taken from the file name.
 */
interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  hasTransparencyChunk: boolean;
  /** RGB of the pixel at (x, y). */
  pixel(x: number, y: number): [number, number, number];
}

function decodePng(file: Buffer): DecodedPng {
  expect(file.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let palette: Buffer | null = null;
  let hasTransparencyChunk = false;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.subarray(offset + 4, offset + 8).toString('ascii');
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') hasTransparencyChunk = true;
    else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  // Only the two shapes the optimiser writes: palette (3) and RGB (2), 8 bits or fewer.
  expect([2, 3], 'PNG colour type must be palette or RGB, never grey with alpha or RGBA').toContain(colorType);
  const channels = colorType === 2 ? 3 : 1;
  const bitsPerPixel = channels * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, bitsPerPixel / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp]! : 0;
      const up = prev[i]!;
      const upLeft = i >= bpp ? prev[i - bpp]! : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      row[i] = (row[i]! + add) & 0xff;
    }
    rows.push(row);
    prev = row;
  }
  return {
    width,
    height,
    colorType,
    hasTransparencyChunk,
    pixel(x, y) {
      const row = rows[y]!;
      if (colorType === 2) return [row[x * 3]!, row[x * 3 + 1]!, row[x * 3 + 2]!];
      const bitOffset = x * bitDepth;
      const index = (row[bitOffset >> 3]! >> (8 - bitDepth - (bitOffset & 7))) & ((1 << bitDepth) - 1);
      return [palette![index * 3]!, palette![index * 3 + 1]!, palette![index * 3 + 2]!];
    },
  };
}

describe('owner supplied shop logos are hosted PNGs on solid white', () => {
  const owned = RETAILERS.flatMap((r) =>
    ([['logo', r.logo], ['squareLogo', r.squareLogo]] as const)
      .filter(([, l]) => l?.basis === 'owner-supplied')
      .map(([field, l]) => ({ id: r.id, field, logo: l! })),
  );
  const shopsDir = resolve(root, 'demo/logos/shops');

  it('covers the eight shops the owner sent files for', () => {
    expect(owned.map((o) => o.id).sort()).toEqual([
      'bellavita-luxury',
      'john-lewis',
      'manchester-ouds',
      'niche-beauty-uk',
      'oud-arabian',
      'space-nk',
      'the-fragrance-counter',
      'zimaya',
    ]);
  });

  it.each(owned.map((o) => [o.id, o] as const))('%s points at its own file under /logos/shops/ and records who and when', (id, o) => {
    expect(o.logo.src).toBe(`/logos/shops/${id}.png`);
    expect(o.logo.source).toMatch(/site owner/);
    expect(o.logo.source).not.toMatch(/[-‐-―−]/); // no hyphens or dashes in what a reader may see
    expect(o.logo.readAt).toBe('2026-10-04');
  });

  it.each(owned.map((o) => [o.id, o] as const))('%s: a PNG with no transparency and pure white on all four corners', (id, o) => {
    const file = readFileSync(resolve(root, 'demo', o.logo.src.replace(/^\//, '')));
    const png = decodePng(file);
    expect(png.hasTransparencyChunk, `${id} must carry no tRNS chunk`).toBe(false);
    for (const [x, y] of [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]] as const) {
      expect(png.pixel(x, y), `${id} corner ${x},${y}`).toEqual([255, 255, 255]);
    }
    // A square slot gets a square file; a wide mark never exceeds the wide slot's 2x size.
    if (o.logo.shape === 'square') expect(png.width, id).toBe(png.height);
    else expect(png.width / png.height, `${id} is a wordmark, so it is wide`).toBeGreaterThan(2);
    expect(Math.max(png.width, png.height), id).toBeLessThanOrEqual(360);
  });

  it('keeps demo/logos/shops/ to 8 KB a file, 100 KB in all, with nothing the registry does not name', () => {
    const files = readdirSync(shopsDir);
    let total = 0;
    for (const f of files) {
      const size = statSync(resolve(shopsDir, f)).size;
      expect(size, `demo/logos/shops/${f} is ${size} bytes`).toBeLessThanOrEqual(8 * 1024);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(100 * 1024);
    expect(files.sort()).toEqual(owned.map((o) => `${o.id}.png`).sort());
  });
});

describe('brand entries that reuse an owner supplied shop file', () => {
  const owned = Object.entries(BRAND_LOGOS).filter(([, l]) => l.basis === 'owner-supplied');

  it('exist for the two houses that have a shop of their own', () => {
    expect(owned.map(([k]) => k).sort()).toEqual(['bellavita', 'bellavita luxury uk', 'bellavita uk', 'zimaya']);
  });

  it.each(owned)('%s points at a file that exists and matches its shop entry', (key, logo) => {
    expect(() => statSync(resolve(root, 'demo', logo.src.replace(/^\//, ''))), `${key}: ${logo.src}`).not.toThrow();
    const shop = RETAILERS.find((r) => r.logo?.src === logo.src);
    expect(shop, `${key}: no shop carries ${logo.src}`).toBeDefined();
    expect(shop!.logo!.shape).toBe(logo.shape);
  });
});

/**
 * The brand pass of 2026-10-05 (docs/LOGOS-PLAN.md §5 step 6, the next 200
 * brands down the ranking). Its rules, held here so the next pass keeps them:
 * a logo is only ever the one the brand's own site declares, never from
 * Wikipedia, Wikidata, Commons or any search or logo service; it sits on a host
 * of the brand's own domain (or a documented asset host, above); the artwork
 * must work on the white tile the owner asked for in both themes, so no
 * light-ink mark; and the key is a brand the catalogue really carries.
 */
describe('brand logos added from 2026-10-05', () => {
  const entries = Object.entries(BRAND_LOGOS).filter(([, l]) => l.readAt >= '2026-10-05');
  const brandsInCatalogue = new Set(
    DEMO_FRAGRANCES.map((f) => f.brand.toLowerCase().replace(/[^a-z]+/g, ' ').trim()),
  );

  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)('%s: a brand the catalogue carries, with a site on record', (key, logo) => {
    expect(brandsInCatalogue.has(key), `${key} is not a brand in the catalogue`).toBe(true);
    expect(BRAND_SITES[key], `${key} has no BRAND_SITES entry`).toBeDefined();
    expect(logo.source, `${key}: source is the page the declaration was read off`).toBe(BRAND_SITES[key]);
    expect(logo.basis).toBe('own-site-declared');
    expect(logo.src.startsWith('https://')).toBe(true);
  });

  it.each(entries)('%s: never a third party reference source, never light ink', (key, logo) => {
    const host = new URL(logo.src).host;
    expect(host, `${key}: ${host}`).not.toMatch(/wikipedia|wikimedia|wikidata|google|bing|duckduckgo|clearbit|brandfetch|logo\.dev/i);
    expect(logo.ink, `${key}: a light mark would vanish on the white tile`).not.toBe('light');
  });
});
