import { describe, expect, it } from 'vitest';
import { distinctSizePhotos, fragranceKey, pictureKey, sizeNamedInFile, type SizePhotoProduct } from '../src/catalogue/sizePhotos.js';
import type { ImageCandidate } from '../src/catalogue/pickImage.js';

/**
 * Sizes of one fragrance that show one picture take another shop's photo of
 * their own size, when there is a different one (src/catalogue/sizePhotos.ts).
 * Made up products and addresses only.
 */
const offer = (retailerId: string, imageUrl: string | null): ImageCandidate => ({ retailerId, imageUrl, fetchedAt: '2026-10-21T10:00:00.000Z' });
const product = (id: string, sizeMl: number | null, offers: ImageCandidate[] = [], over: Partial<SizePhotoProduct> = {}): SizePhotoProduct => ({
  id, brand: 'Rabanne', name: '1 Million Night Elixir', concentration: 'Parfum', sizeMl, offers, ...over,
});
const LF = 'https://static.lookfantastic.com/images/rabanne-1-million.jpg';
const options = { pick: (o: readonly ImageCandidate[]) => o[0]!.imageUrl, eligible: (o: ImageCandidate) => o.retailerId !== 'perfume-click' };
const run = (products: SizePhotoProduct[]) => {
  const picked = new Map(products.map((p) => [p.id, p.offers[0]?.imageUrl ?? null] as const));
  return distinctSizePhotos(products, picked, options);
};

describe('the same picture', () => {
  it('is the same address, or the same address with only a size, quality or version parameter different', () => {
    const a = pictureKey('https://www.cdn.test/files/a.jpg?v=1&width=600');
    expect(pictureKey('https://cdn.test/files/a.jpg?width=3000&v=2')).toBe(a);
    expect(pictureKey('https://cdn.test/files/a.jpg?w=100&h=100&quality=60')).toBe(a);
    expect(pictureKey('https://cdn.test/files/a_100x.jpg')).toBe(a);
    expect(pictureKey('https://cdn.test/files/a_600x600.jpg?v=3')).toBe(a);
    expect(pictureKey('https://cdn.test/files/a_large.jpg')).toBe(a);
  });

  it('is a different picture for another file, another host, or another non size parameter', () => {
    const a = pictureKey('https://cdn.test/files/a.jpg');
    for (const other of ['https://cdn.test/files/b.jpg', 'https://other.test/files/a.jpg', 'https://cdn.test/files/a.jpg?variant=2', 'https://cdn.test/files/a.png']) {
      expect(pictureKey(other), other).not.toBe(a);
    }
  });

  it('reads the size a file name gives its picture', () => {
    expect(sizeNamedInFile('https://x.test/p/rabanne-1-million-50ml.jpg?v=1')).toBe(50);
    expect(sizeNamedInFile('https://x.test/p/Rabanne1MillionNightElixirParfumSpray100ml.png')).toBe(100);
    expect(sizeNamedInFile('https://x.test/p/bottle_7.5_ml.jpg')).toBe(7.5);
    expect(sizeNamedInFile('https://x.test/p/1-million-sample.jpg')).toBeNull();
    expect(sizeNamedInFile('https://x.test/p/a1000ml')).toBe(1000);
  });
});

describe('sizes of one fragrance', () => {
  it('are found by brand, name and strength, and a gift set or a product with no size has none', () => {
    expect(fragranceKey(product('a', 50))).toBe(fragranceKey(product('b', 100, [], { brand: 'RABANNE', name: '1 Million  Night Elixir' })));
    expect(fragranceKey(product('a', 50))).not.toBe(fragranceKey(product('b', 100, [], { concentration: 'Eau de Parfum' })));
    expect(fragranceKey(product('a', null))).toBeNull();
    expect(fragranceKey(product('a', 50, [], { giftSet: {} }))).toBeNull();
  });
});

describe('one picture for every size', () => {
  it('gives a size another shop\'s photo when the sizes share one and the other shop\'s differs (the Lookfantastic pair)', () => {
    const r = run([
      product('p50', 50, [offer('lookfantastic', LF), offer('boots', 'https://boots.test/rabanne-night-elixir-50.jpg')]),
      product('p100', 100, [offer('lookfantastic', `${LF}?width=3000`), offer('boots', 'https://boots.test/rabanne-night-elixir-100.jpg')]),
    ]);
    expect(r.picks.get('p50')).toBe('https://boots.test/rabanne-night-elixir-50.jpg');
    expect(r.picks.get('p100')).toBe('https://boots.test/rabanne-night-elixir-100.jpg');
    // Both sizes showed the one picture and both have a photo of their own size from the other shop.
    expect(r.changed).toEqual(['p50', 'p100']);
  });

  it('switches every size that has a different photo of its own', () => {
    const r = run([
      product('p50', 50, [offer('lookfantastic', LF), offer('boots', 'https://boots.test/50.jpg')]),
      product('p100', 100, [offer('lookfantastic', LF), offer('boots', 'https://boots.test/100.jpg')]),
      product('p30', 30, [offer('lookfantastic', LF), offer('boots', 'https://boots.test/30.jpg')]),
    ]);
    expect(r.picks.get('p30')).toBe('https://boots.test/30.jpg');
    expect(r.picks.get('p50')).toBe('https://boots.test/50.jpg');
    expect(r.picks.get('p100')).toBe('https://boots.test/100.jpg');
    expect(new Set([...r.picks.values()].map((u) => pictureKey(u!))).size).toBe(3);
  });

  it('keeps the picture when no other shop has a different one of that size', () => {
    const r = run([
      product('p50', 50, [offer('lookfantastic', LF)]),
      product('p100', 100, [offer('lookfantastic', LF), offer('boots', `${LF}?width=800`)]),
    ]);
    expect(r.changed).toEqual([]);
    expect(r.picks.get('p50')).toBe(LF);
  });

  it('does not make two sizes the same again: a photo another size already shows is not taken', () => {
    const shared = 'https://boots.test/one-shot.jpg';
    const r = run([
      product('p50', 50, [offer('lookfantastic', LF), offer('boots', shared)]),
      product('p100', 100, [offer('lookfantastic', LF), offer('boots', shared)]),
    ]);
    // One of them may take the other shop's single picture; both doing so would be the same fault again.
    expect(r.changed.length).toBeLessThanOrEqual(1);
    const urls = [...r.picks.values()].map((u) => pictureKey(u!));
    expect(new Set(urls).size).toBe(2);
  });

  it('leaves a picture with its size when the file name gives it that size', () => {
    const r = run([
      product('p50', 50, [offer('shop', 'https://s.test/rabanne-50ml.jpg'), offer('boots', 'https://boots.test/50.jpg')]),
      product('p100', 100, [offer('shop', 'https://s.test/rabanne-50ml.jpg?v=2'), offer('boots', 'https://boots.test/100.jpg')]),
    ]);
    expect(r.picks.get('p50')).toBe('https://s.test/rabanne-50ml.jpg');
    expect(r.picks.get('p100')).toBe('https://boots.test/100.jpg');
  });

  it('never takes a photo the caller refuses (a thumbnail shop, a box beside the bottle)', () => {
    const r = run([
      product('p50', 50, [offer('lookfantastic', LF), offer('perfume-click', 'https://pc.test/50.jpg')]),
      product('p100', 100, [offer('lookfantastic', LF), offer('perfume-click', 'https://pc.test/100.jpg')]),
    ]);
    expect(r.changed).toEqual([]);
  });

  it('touches nothing when sizes show different pictures, when only one size exists, or when a product has no photo', () => {
    expect(run([product('a', 50, [offer('s', 'https://s.test/a.jpg')]), product('b', 100, [offer('s', 'https://s.test/b.jpg')])]).changed).toEqual([]);
    expect(run([product('a', 50, [offer('s', LF), offer('b', 'https://b.test/x.jpg')])]).changed).toEqual([]);
    expect(run([product('a', 50, [offer('s', null)]), product('b', 100, [offer('s', null)])]).picks.get('a')).toBeNull();
  });

  it('does not mix fragrances or strengths', () => {
    const r = run([
      product('a', 50, [offer('s', LF), offer('b', 'https://b.test/a.jpg')]),
      product('b', 100, [offer('s', LF), offer('b', 'https://b.test/b.jpg')], { concentration: 'Eau de Parfum' }),
    ]);
    expect(r.changed).toEqual([]);
  });

  it('gives the same answer whatever order the products come in', () => {
    const list = [
      product('p50', 50, [offer('lookfantastic', LF), offer('boots', 'https://boots.test/50.jpg')]),
      product('p100', 100, [offer('lookfantastic', LF), offer('boots', 'https://boots.test/100.jpg')]),
    ];
    expect([...run(list).picks]).toEqual([...run([...list].reverse()).picks].sort((a, b) => list.findIndex((p) => p.id === a[0]) - list.findIndex((p) => p.id === b[0])));
  });
});
