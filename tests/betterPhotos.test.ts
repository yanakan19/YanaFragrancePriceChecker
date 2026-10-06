import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { betterPhotoFor, betterPhotoKey, type BetterPhoto } from '../src/catalogue/betterPhotos.js';
import { PHOTO_SOURCES, isPhotoSourceId } from '../src/config/photoSources.js';
import { RETAILERS } from '../src/config/retailers.js';

const rec = (over: Partial<BetterPhoto> = {}): BetterPhoto => ({
  url: 'https://bgstatic.net/photos/169946_xl_1.jpg',
  width: 263,
  height: 322,
  source: 'perfume-click-page',
  page: 'https://www.perfume-click.co.uk/x-s151478/',
  feedImage: 'https://bgstatic.net/photos/169946_ml.jpg',
  checkedAt: '2026-10-05T12:00:00.000Z',
  ...over,
});
const photos = { [betterPhotoKey('perfume-click', '151478')]: rec() };
const yes = () => true;

describe('betterPhotoFor', () => {
  it('returns the record for the listing it was made for', () => {
    expect(betterPhotoFor(photos, 'perfume-click', '151478', 'https://bgstatic.net/photos/169946_ml.jpg', yes)?.url).toBe(
      'https://bgstatic.net/photos/169946_xl_1.jpg',
    );
  });

  it('returns null for a listing with no record', () => {
    expect(betterPhotoFor(photos, 'perfume-click', '1', 'https://bgstatic.net/photos/169946_ml.jpg', yes)).toBeNull();
  });

  it("stops applying once the feed's image is another one: the shop has published a new picture", () => {
    expect(betterPhotoFor(photos, 'perfume-click', '151478', 'https://bgstatic.net/photos/999_ml.jpg', yes)).toBeNull();
    expect(betterPhotoFor(photos, 'perfume-click', '151478', null, yes)).toBeNull();
  });

  it('applies a record made for a listing the feed gave no image', () => {
    const p = { [betterPhotoKey('perfume-click', '5')]: rec({ feedImage: null }) };
    expect(betterPhotoFor(p, 'perfume-click', '5', null, yes)).not.toBeNull();
    expect(betterPhotoFor(p, 'perfume-click', '5', undefined as unknown as null, yes)).not.toBeNull();
  });

  it('is ignored when its source is not one we know, or belongs to another shop', () => {
    const odd = { [betterPhotoKey('perfume-click', '1')]: rec({ source: 'a-search-engine', feedImage: null }) };
    expect(betterPhotoFor(odd, 'perfume-click', '1', null, yes)).toBeNull();
    const other = { [betterPhotoKey('beautybase', '1')]: rec({ feedImage: null }) };
    expect(betterPhotoFor(other, 'beautybase', '1', null, yes)).toBeNull();
  });

  it("is ignored when the shop has no image basis", () => {
    expect(betterPhotoFor(photos, 'perfume-click', '151478', 'https://bgstatic.net/photos/169946_ml.jpg', () => false)).toBeNull();
  });
});

describe('photo sources', () => {
  it('each source names a shop in the registry that may show its photos', () => {
    for (const [id, s] of Object.entries(PHOTO_SOURCES)) {
      expect(isPhotoSourceId(id)).toBe(true);
      const shop = RETAILERS.find((r) => r.id === s.retailerId);
      expect(shop, id).toBeDefined();
      expect(shop!.affiliate.imageBasis, id).toBeDefined();
    }
  });

  it('data/better-photos.json holds only records of known sources, on the shop photo host, from the shop of the source', () => {
    const file = resolve(__dirname, '../data/better-photos.json');
    if (!existsSync(file)) return;
    const data = JSON.parse(readFileSync(file, 'utf8')) as { photos: Record<string, BetterPhoto> };
    for (const [key, r] of Object.entries(data.photos)) {
      expect(isPhotoSourceId(r.source), key).toBe(true);
      if (!isPhotoSourceId(r.source)) continue;
      expect(key.startsWith(`${PHOTO_SOURCES[r.source].retailerId}:`), key).toBe(true);
      expect(r.url, key).toMatch(/^https:\/\/bgstatic\.net\/photos\/\d+_[a-z0-9_]+\.(jpe?g|png|webp)$/);
      expect(Math.max(r.width, r.height), key).toBeGreaterThanOrEqual(250);
      expect(r.page, key).toMatch(/^https:\/\/www\.perfume-click\.co\.uk\//);
    }
  });
});
