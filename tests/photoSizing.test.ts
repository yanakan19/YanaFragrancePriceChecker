import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTO_WIDTHS, photoSrcAttrs, productArt, resizedPhotoUrl, RETRY_ORIGINAL } from '../demo/photo.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Smaller photos from the retailer's own image server (demo/photo.ts,
 * "Smaller photos"). Every URL below is a real catalogue URL of its shape;
 * each host's rewrite was checked against the live server on 2026-10-01.
 */
describe('resizedPhotoUrl, per host', () => {
  it('adds width= to a bare cdn.shopify.com URL, keeping the cache-buster', () => {
    expect(
      resizedPhotoUrl('https://cdn.shopify.com/s/files/1/0665/3919/2408/files/1_20257a28.jpg?v=1756995930', 480),
    ).toBe('https://cdn.shopify.com/s/files/1/0665/3919/2408/files/1_20257a28.jpg?v=1756995930&width=480');
  });

  it('adds ?width= when there is no query string at all', () => {
    expect(resizedPhotoUrl('https://cdn.shopify.com/s/files/1/x/files/a.png', 240)).toBe(
      'https://cdn.shopify.com/s/files/1/x/files/a.png?width=240',
    );
  });

  it("replaces the build's width=3000 on a shop's own /cdn/shop/ domain", () => {
    for (const host of ['www.beautybase.com', 'www.justmylook.com', 'allbeauty.com', 'oudarabian.co.uk', 'manchesterouds.com']) {
      expect(resizedPhotoUrl(`https://${host}/cdn/shop/files/p.jpg?v=1772624925&width=3000`, 320)).toBe(
        `https://${host}/cdn/shop/files/p.jpg?v=1772624925&width=320`,
      );
    }
  });

  it('adds width= to a /cdn/shop/ URL that has none', () => {
    expect(resizedPhotoUrl('https://bellavitaluxury.uk/cdn/shop/files/CEOMAN1.jpg?v=1761808763', 640)).toBe(
      'https://bellavitaluxury.uk/cdn/shop/files/CEOMAN1.jpg?v=1761808763&width=640',
    );
  });

  it('rewrites the legacy _1024x filename suffix, which would otherwise win over width=', () => {
    expect(
      resizedPhotoUrl('https://gloriousbeauty.co.uk/cdn/shop/files/8425402313411Bottle_1024x.jpg?v=1704815280', 480),
    ).toBe('https://gloriousbeauty.co.uk/cdn/shop/files/8425402313411Bottle_480x.jpg?v=1704815280');
  });

  it('leaves other, unverified Shopify filename suffixes alone', () => {
    expect(resizedPhotoUrl('https://www.justmylook.com/cdn/shop/files/a_x100.jpg?v=1', 480)).toBeNull();
    expect(resizedPhotoUrl('https://cdn.shopify.com/s/files/1/x/a_200x300.jpg', 480)).toBeNull();
  });

  it('does not mistake a size-like filename without the underscore for a suffix', () => {
    // A real cdn.shopify.com filename in the catalogue.
    expect(resizedPhotoUrl('https://cdn.shopify.com/s/files/1/0621/6541/8121/files/375x500.78611.jpg?v=1', 480)).toBe(
      'https://cdn.shopify.com/s/files/1/0621/6541/8121/files/375x500.78611.jpg?v=1&width=480',
    );
  });

  it('leaves a Shopify URL that already crops or sets a height alone', () => {
    expect(resizedPhotoUrl('https://cdn.shopify.com/s/files/1/x/a.jpg?height=300', 480)).toBeNull();
    expect(resizedPhotoUrl('https://x.com/cdn/shop/files/a.jpg?width=300&crop=center', 480)).toBeNull();
  });

  it("does not treat a cdn.shopify.com path outside /s/files/ as Shopify's image service", () => {
    expect(resizedPhotoUrl('https://cdn.shopify.com/shopifycloud/x.png', 480)).toBeNull();
  });

  it("scales THG's width and height together, keeping the stored proportions", () => {
    const thg =
      'https://main.thgimages.com/?url=https://static.thcdn.com/productimg/original/11079299-1664947466818765.jpg&format=webp&width=1500&height=1500&fit=cover';
    expect(resizedPhotoUrl(thg, 480)).toBe(
      'https://main.thgimages.com/?url=https://static.thcdn.com/productimg/original/11079299-1664947466818765.jpg&format=webp&width=480&height=480&fit=cover',
    );
    expect(resizedPhotoUrl(thg.replace('height=1500', 'height=2000'), 300)).toContain('&width=300&height=400&');
  });

  it('leaves every host without a resize service exactly as stored', () => {
    for (const url of [
      // Magento: ignores width= (checked, 800x800 either way)
      'https://www.fragranceclick.co.uk/media/catalog/product/1/0/104.jpg',
      // perfume-click: already 130px thumbnails
      'https://bgstatic.net/photos/194085_ml.jpg',
      // WordPress houses: no resize parameter
      'https://pariscorner.ae/wp-content/uploads/2024/12/a-walk-on-dirt-01-1-scaled.jpg',
      'https://lattafa.com/wp-content/uploads/2024/02/2-1.jpg',
      'https://maisonalhambra.co/wp-content/uploads/2025/06/1-2.jpg',
      'https://www.reef-parfum.com/wp-content/uploads/2026/06/parfum-reef-42.jpg',
      'https://www.thefragrancecounter.co.uk/user/products/large/image_336.jpg',
      // THG without both dimensions to scale
      'https://main.thgimages.com/?url=https://static.thcdn.com/a.jpg&format=webp',
      'not a url',
    ]) {
      expect(resizedPhotoUrl(url, 480), url).toBeNull();
    }
  });
});

describe('photoSrcAttrs', () => {
  const stored = 'https://www.beautybase.com/cdn/shop/files/p.jpg?v=1&width=3000';

  it('offers every width in srcset, a mid-size src, and the stored URL as fallback', () => {
    const attrs = photoSrcAttrs(stored, 'min(36vw, 300px)');
    for (const w of PHOTO_WIDTHS) {
      expect(attrs).toContain(`https://www.beautybase.com/cdn/shop/files/p.jpg?v=1&amp;width=${w} ${w}w`);
    }
    expect(attrs).toContain(' src="https://www.beautybase.com/cdn/shop/files/p.jpg?v=1&amp;width=640"');
    expect(attrs).toContain(' sizes="min(36vw, 300px)"');
    expect(attrs).toContain(` data-orig="${stored.replace(/&/g, '&amp;')}"`);
  });

  it('asks for proportionally more pixels when the build zooms the photo', () => {
    expect(photoSrcAttrs(stored, 'min(36vw, 300px)', 1.5)).toContain(' sizes="calc(min(36vw, 300px) * 1.50)"');
    // A transform that shrinks the bottle never asks for fewer pixels than the box.
    expect(photoSrcAttrs(stored, 'min(36vw, 300px)', 0.9)).toContain(' sizes="min(36vw, 300px)"');
  });

  it('is a plain src, with no srcset or data-orig, for a host that does not resize', () => {
    const url = 'https://www.fragranceclick.co.uk/media/catalog/product/1/0/104.jpg';
    expect(photoSrcAttrs(url, '300px')).toBe(` src="${url}"`);
  });
});

describe('productArt loading attributes', () => {
  const url = 'https://cdn.shopify.com/s/files/1/x/files/a.jpg?v=1';
  const imgOf = (html: string): string => (html.match(/<img[\s\S]*?\/>/) ?? [''])[0];

  it('loads a tile lazily and decodes off the main thread, in a box of known size', () => {
    const img = imgOf(productArt(url, 'md', 'Brand Name'));
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
    expect(img).toContain('width="300" height="300"');
    expect(img).not.toContain('fetchpriority');
    expect(img).toContain('srcset="');
  });

  it('loads a first-row tile at once, without jumping the queue', () => {
    const img = imgOf(productArt(url, 'md', 'Brand Name', null, { eager: true }));
    expect(img).toContain('loading="eager"');
    expect(img).not.toContain('loading="lazy"');
    expect(img).not.toContain('fetchpriority');
  });

  it('fetches the product hero at once and first', () => {
    const img = imgOf(productArt(url, 'lg', 'Brand Name'));
    expect(img).toContain('loading="eager"');
    expect(img).toContain('fetchpriority="high"');
    expect(img).toContain('width="340" height="340"');
  });

  it('retries the stored URL once before falling back to the placeholder', () => {
    const img = imgOf(productArt(url, 'md', 'Brand Name'));
    expect(img).toContain(`onerror="${RETRY_ORIGINAL}this.closest('.art')`);
    // The handler sits in a double-quoted attribute.
    expect(RETRY_ORIGINAL).not.toContain('"');
  });

  it('reserves a square box in CSS whatever the photo turns out to be', () => {
    const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
    expect(template).toMatch(/\.art\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
    expect(template).toMatch(/\.house-img\s*\{[^}]*height:\s*auto;[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  });
});

describe('every image surface', () => {
  it('decodes asynchronously and states how it loads', () => {
    let examined = 0;
    const offenders: string[] = [];
    for (const file of readdirSync(resolve(root, 'demo'))) {
      if (!file.endsWith('.ts') || file.endsWith('.generated.ts')) continue;
      const src = readFileSync(resolve(root, 'demo', file), 'utf8');
      for (const tag of src.match(/<img[\s\S]*?\/>/g) ?? []) {
        examined++;
        // "States how it loads": lazy, the caller's own ${loading}, or an
        // explicit eager for an image that is on screen from the first paint
        // (the account photo in the page's top corner and at the head of the
        // profile), where lazy would only add a delay.
        const ok = tag.includes('decoding="async"') && /loading="(?:lazy|eager)"|\$\{loading\}/.test(tag);
        if (!ok) offenders.push(`${file}: ${(tag.split('\n')[0] ?? tag).trim()}`);
      }
    }
    expect(examined).toBeGreaterThanOrEqual(3);
    expect(offenders).toEqual([]);
  });

  it('sizes the house photos the same way and retries their stored URL', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    const tag = (app.match(/<img class="house-img"[\s\S]*?\/>/) ?? [])[0];
    expect(tag).toContain('photoSrcAttrs(p.image, HOUSE_IMG_SIZES)');
    expect(tag).toContain('width="240" height="240"');
    expect(tag).toContain('onerror="${RETRY_ORIGINAL}');
  });

  it('marks only the first chunk of a list as having a position (and so a first row)', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    expect(app).toContain('first.map((item, i) => renderItem(item, i))');
    expect(app).toContain('next.map((item) => held.render(item))');
  });
});
