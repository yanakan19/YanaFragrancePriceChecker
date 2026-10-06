import { describe, expect, it } from 'vitest';
import {
  MIN_BETTER_LONG_EDGE,
  acceptPagePhoto,
  parsePageTitle,
  parseProductPageImage,
  photoId,
  titleOverlap,
} from '../src/catalogue/perfumeClickPage.js';

/** The shape of the shop's own page, kept from the 4711 Acqua Colonia listing read on 2026-10-05. */
const PAGE = `<html><head><title>4711 Acqua Colonia Coconut Water &amp; Yuzu Eau De Cologne 50ml Spray</title></head><body>
<div id="prodGridLeft">
 <div id="prodImg" class="prodGridLeftContainer" style="position: relative;">
  <img itemprop="image" alt="4711 Acqua Colonia" src="https://bgstatic.net/photos/169946_xl_1.jpg" width="263" height="322" />
 </div>
</div>
<h2>You may also like</h2>
<img itemprop="image" src="https://bgstatic.net/photos/79176_ml.jpg" width="119" height="130" />
</body></html>`;

describe('parseProductPageImage', () => {
  it("takes the picture in the page's own image box, not a 'you may also like' one", () => {
    expect(parseProductPageImage(PAGE)).toBe('https://bgstatic.net/photos/169946_xl_1.jpg');
  });

  it('returns null when the box is missing or the picture is not on the shop photo host', () => {
    expect(parseProductPageImage('<html><img itemprop="image" src="https://bgstatic.net/photos/1_ml.jpg"></html>')).toBeNull();
    expect(parseProductPageImage('<div id="prodImg"><img src="https://example.com/a.jpg"></div>')).toBeNull();
    expect(parseProductPageImage('<div id="prodImg"><img src="https://bgstatic.net/pc/img/logo.gif"></div>')).toBeNull();
  });

  it('decodes an address written with entities', () => {
    expect(parseProductPageImage('<div id="prodImg"><img src="https://bgstatic.net/photos/5_xl_1.jpg"></div>')).toBe(
      'https://bgstatic.net/photos/5_xl_1.jpg',
    );
  });
});

describe('page title and photo number', () => {
  it('reads the title with entities decoded', () => {
    expect(parsePageTitle(PAGE)).toBe('4711 Acqua Colonia Coconut Water & Yuzu Eau De Cologne 50ml Spray');
    expect(parsePageTitle('<html></html>')).toBeNull();
  });

  it('reads the photo number out of a shop photo address', () => {
    expect(photoId('https://bgstatic.net/photos/169946_ml.jpg')).toBe('169946');
    expect(photoId('https://bgstatic.net/photos/169946_xl_1.jpg')).toBe('169946');
    expect(photoId('https://example.com/a.jpg')).toBeNull();
    expect(photoId(null)).toBeNull();
  });

  it('scores how much of the feed title the page title carries', () => {
    expect(titleOverlap('4711 Acqua Colonia Coconut Water & Yuzu Eau De Cologne 50ml Spray', 'Acqua Colonia Coconut Water and Yuzu Eau De Cologne 50ml Spray 4711')).toBe(1);
    expect(titleOverlap('Armaf Club De Nuit Intense Man Eau De Toilette 10ml Spray', 'Dolce & Gabbana The One For Men')).toBeLessThan(0.3);
    expect(titleOverlap('', 'anything')).toBe(0);
  });
});

describe('acceptPagePhoto', () => {
  const ok = {
    feedImage: 'https://bgstatic.net/photos/169946_ml.jpg',
    feedTitle: '4711 Acqua Colonia Coconut Water & Yuzu Eau De Cologne 50ml Spray',
    pageImage: 'https://bgstatic.net/photos/169946_xl_1.jpg',
    pageTitle: '4711 Acqua Colonia Coconut Water & Yuzu Eau De Cologne 50ml Spray',
    size: { width: 263, height: 322 },
  };

  it('accepts the same photo number, the same title and a real gain in size', () => {
    expect(acceptPagePhoto(ok)).toEqual({ ok: true });
  });

  it('refuses a picture with another photo number than the feed gave', () => {
    expect(acceptPagePhoto({ ...ok, pageImage: 'https://bgstatic.net/photos/79176_xl_1.jpg' })).toEqual({ ok: false, reason: 'other-photo-number' });
  });

  it('takes any number when the feed gave no image', () => {
    expect(acceptPagePhoto({ ...ok, feedImage: null, pageImage: 'https://bgstatic.net/photos/1_xl_1.jpg' })).toEqual({ ok: true });
  });

  it('refuses a page whose title is another product', () => {
    expect(acceptPagePhoto({ ...ok, pageTitle: 'Home' })).toEqual({ ok: false, reason: 'title-mismatch' });
    expect(acceptPagePhoto({ ...ok, pageTitle: null })).toEqual({ ok: false, reason: 'title-mismatch' });
  });

  it('refuses a picture that is no bigger than a thumbnail', () => {
    expect(acceptPagePhoto({ ...ok, size: { width: 119, height: 130 } })).toEqual({ ok: false, reason: 'too-small' });
    expect(acceptPagePhoto({ ...ok, size: { width: MIN_BETTER_LONG_EDGE, height: 100 } })).toEqual({ ok: true });
    expect(acceptPagePhoto({ ...ok, size: { width: MIN_BETTER_LONG_EDGE - 1, height: 100 } })).toEqual({ ok: false, reason: 'too-small' });
  });
});
