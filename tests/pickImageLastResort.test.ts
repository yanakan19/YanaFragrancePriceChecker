import { describe, expect, it } from 'vitest';
import {
  LAST_RESORT_IMAGE_RETAILERS,
  SMALL_PHOTO_LONG_EDGE,
  pickImage,
  type ImageBoxVerdict,
  type ImageCandidate,
  type ImageDimensions,
} from '../src/catalogue/pickImage.js';
import { RETAILERS } from '../src/config/retailers.js';

/**
 * Owner decision 2026-10-05: Perfume Click's photos (about 130px wide) are used
 * only when no other shop has a photo for the product, and a photo measured
 * under 300px gives way to one that has not been measured that small.
 */
const NOW = new Date('2026-10-05T00:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function offer(retailerId: string, imageUrl: string | null, hours = 1): ImageCandidate {
  return { retailerId, imageUrl, fetchedAt: hoursAgo(hours) };
}
const sizes = (e: Record<string, [number, number]>) =>
  new Map<string, ImageDimensions>(Object.entries(e).map(([u, [width, height]]) => [u, { width, height }]));
const verdicts = (e: Record<string, ImageBoxVerdict>) => new Map(Object.entries(e));

const PC = 'https://bgstatic.example/pc_ml.jpg';

describe('Perfume Click is the last resort', () => {
  it('names Perfume Click, and a shop that is in the registry', () => {
    expect([...LAST_RESORT_IMAGE_RETAILERS]).toEqual(['perfume-click']);
    for (const id of LAST_RESORT_IMAGE_RETAILERS) expect(RETAILERS.some((r) => r.id === id)).toBe(true);
  });

  it('is used when it is the only shop with a photo', () => {
    expect(pickImage([offer('perfume-click', PC), offer('beautybase', null)], NOW)).toBe(PC);
  });

  it('loses to a shop that is not ranked, however much fresher it is', () => {
    const offers = [offer('perfume-click', PC, 1), offer('the-fragrance-counter', 'https://tfc.example/a.jpg', 300)];
    expect(pickImage(offers, NOW)).toBe('https://tfc.example/a.jpg');
  });

  it('loses to a ranked shop whose photo is stale', () => {
    const offers = [offer('perfume-click', PC, 1), offer('beautybase', 'https://bb.example/a.jpg', 1000)];
    expect(pickImage(offers, NOW)).toBe('https://bb.example/a.jpg');
  });

  it('loses to a photo that is verified boxed, or unsure, from another shop', () => {
    const offers = [offer('perfume-click', PC), offer('justmylook', 'https://jml.example/a.jpg')];
    expect(pickImage(offers, NOW, verdicts({ 'https://jml.example/a.jpg': 'boxed' }))).toBe('https://jml.example/a.jpg');
    expect(pickImage(offers, NOW, verdicts({ 'https://jml.example/a.jpg': 'unsure' }))).toBe('https://jml.example/a.jpg');
  });

  it('loses to a photo measured small from another shop (a tiny photo beats a tinier one)', () => {
    const offers = [offer('perfume-click', PC), offer('oud-arabian', 'https://oa.example/a.jpg')];
    expect(pickImage(offers, NOW, undefined, sizes({ 'https://oa.example/a.jpg': [180, 180] }))).toBe(
      'https://oa.example/a.jpg',
    );
  });

  it('is chosen when the other offers have no image', () => {
    const offers = [offer('beautybase', null), offer('perfume-click', PC), offer('justmylook', null)];
    expect(pickImage(offers, NOW)).toBe(PC);
  });

  it('leaves a product with no Perfume Click offer exactly as it was', () => {
    const offers = [offer('beautybase', 'https://bb.example/a.jpg', 100), offer('justmylook', 'https://jml.example/a.jpg', 1)];
    expect(pickImage(offers, NOW)).toBe('https://bb.example/a.jpg');
  });
});

describe('a photo measured under 300px gives way to a larger or unmeasured one', () => {
  const SMALL = 'https://frag-counter.example/small.jpg';
  const BIG = 'https://bb.example/big.jpg';

  it('the line is 300 pixels on the long edge', () => {
    expect(SMALL_PHOTO_LONG_EDGE).toBe(300);
  });

  it('a ranked shop with a measured small photo yields to a lower ranked shop with a bigger one', () => {
    const offers = [offer('fragrance-click', SMALL), offer('mybeauty-boutique', BIG)];
    expect(pickImage(offers, NOW, undefined, sizes({ [SMALL]: [250, 250], [BIG]: [1000, 1000] }))).toBe(BIG);
  });

  it('yields to an unmeasured photo as well: unknown is not small', () => {
    const offers = [offer('fragrance-click', SMALL), offer('justmylook', BIG)];
    expect(pickImage(offers, NOW, undefined, sizes({ [SMALL]: [250, 250] }))).toBe(BIG);
  });

  it('a photo of exactly 300px is not small', () => {
    const offers = [offer('fragrance-click', SMALL), offer('justmylook', BIG)];
    expect(pickImage(offers, NOW, undefined, sizes({ [SMALL]: [300, 300] }))).toBe(SMALL);
  });

  it('keeps the small photo when every candidate is small, ranked order and freshness unchanged', () => {
    const offers = [offer('beautybase', SMALL, 5), offer('justmylook', BIG, 1)];
    expect(pickImage(offers, NOW, undefined, sizes({ [SMALL]: [250, 250], [BIG]: [260, 260] }))).toBe(SMALL);
  });

  it('applies in the freshness fallback too', () => {
    const offers = [offer('justmylook', SMALL, 1), offer('scentstore', BIG, 50)];
    expect(pickImage(offers, NOW, undefined, sizes({ [SMALL]: [200, 200], [BIG]: [900, 900] }))).toBe(BIG);
  });

  it('never makes a product lose its only photo', () => {
    expect(pickImage([offer('justmylook', SMALL)], NOW, undefined, sizes({ [SMALL]: [100, 100] }))).toBe(SMALL);
  });

  it('does nothing without measurements', () => {
    const offers = [offer('fragrance-click', SMALL), offer('justmylook', BIG)];
    expect(pickImage(offers, NOW)).toBe(SMALL);
  });
});
