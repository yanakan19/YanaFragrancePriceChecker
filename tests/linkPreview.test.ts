/**
 * What a shared link to the site shows (WhatsApp, iMessage, Facebook, X,
 * Slack, Discord): the owner's title and description, and a picture of the
 * top of the homepage. The tags are read from the built page, the picture is
 * read from the file the tags point at.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SITE_URL, SHARE_TITLE, SHARE_DESCRIPTION, OG_IMAGE_URL, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, OG_IMAGE_ALT, headFor,
} from '../demo/head.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_TEXT = 'PriceSniffs: Fragrance Comparison Site';

function metaContent(html: string, attr: 'name' | 'property', key: string): string | null {
  const re = new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`);
  return re.exec(html)?.[1] ?? null;
}

describe('the words a shared link shows', () => {
  it('are the owner\'s exact words', () => {
    expect(SHARE_TITLE).toBe(OWNER_TEXT);
    expect(SHARE_DESCRIPTION).toBe(OWNER_TEXT);
  });

  it('are the home page\'s meta description and preview title', () => {
    const home = headFor({ route: { name: 'home', param: '', query: {} } as never });
    expect(home.description).toBe(OWNER_TEXT);
    expect(home.shareTitle).toBe(OWNER_TEXT);
  });

  it('leave other pages their own title and description', () => {
    const product = headFor({ route: { name: 'product', param: 'x', query: {} } as never, leafName: 'Dior Sauvage' });
    expect(product.title).toContain('Dior Sauvage');
    expect(product.description).not.toBe(OWNER_TEXT);
    expect(product.shareTitle).toBeUndefined();
    const brand = headFor({ route: { name: 'brand', param: 'dior', query: {} } as never, leafName: 'Dior' });
    expect(brand.description).toContain('Dior');
  });
});

describe('the built page', () => {
  const built = resolve(root, 'demo/index.html');
  const html = existsSync(built) ? readFileSync(built, 'utf8') : '';

  it.skipIf(!html)('carries the owner\'s text in every title and description tag', () => {
    for (const [attr, key] of [
      ['property', 'og:title'], ['property', 'og:description'],
      ['name', 'twitter:title'], ['name', 'twitter:description'], ['name', 'description'],
    ] as const) {
      expect(metaContent(html, attr, key), key).toBe(OWNER_TEXT);
    }
  });

  it.skipIf(!html)('points the picture at an absolute https address with a version', () => {
    expect(OG_IMAGE_URL).toMatch(/^https:\/\/pricesniffs\.space\/og-preview\.png\?v=\d+$/);
    expect(OG_IMAGE_URL.startsWith(SITE_URL)).toBe(true);
    expect(metaContent(html, 'property', 'og:image')).toBe(OG_IMAGE_URL);
    expect(metaContent(html, 'name', 'twitter:image')).toBe(OG_IMAGE_URL);
    expect(metaContent(html, 'property', 'og:image:width')).toBe(String(OG_IMAGE_WIDTH));
    expect(metaContent(html, 'property', 'og:image:height')).toBe(String(OG_IMAGE_HEIGHT));
    expect(metaContent(html, 'property', 'og:image:alt')).toBe(OG_IMAGE_ALT);
    expect(metaContent(html, 'name', 'twitter:card')).toBe('summary_large_image');
  });

  it.skipIf(!html)('uses an absolute https address for every other address in the preview tags', () => {
    for (const key of ['og:url']) expect(metaContent(html, 'property', key)).toMatch(/^https:\/\/pricesniffs\.space\//);
    expect(/rel="canonical" href="(https:\/\/pricesniffs\.space\/)"/.test(html)).toBe(true);
  });

  it('is not hidden by the service worker cache', () => {
    const sw = readFileSync(resolve(root, 'demo/sw.js'), 'utf8');
    expect(sw).not.toMatch(/og-preview/);
  });
});

describe('the preview picture', () => {
  const file = resolve(root, 'demo/og-preview.png');
  const png = readFileSync(file);

  it('is a PNG of exactly 1200 by 630', () => {
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(OG_IMAGE_WIDTH).toBe(1200);
    expect(OG_IMAGE_HEIGHT).toBe(630);
  });

  it('is under 300 kB, so every app fetches it', () => {
    expect(statSync(file).size).toBeLessThan(300 * 1024);
    expect(statSync(file).size).toBeGreaterThan(10 * 1024);
  });

  it('has a description for people who cannot see it', () => {
    expect(OG_IMAGE_ALT.length).toBeGreaterThan(20);
  });
});
