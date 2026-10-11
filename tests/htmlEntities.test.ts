import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../src/catalogue/htmlEntities.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';

describe('decodeHtmlEntities', () => {
  it('decodes the ampersand and apostrophe shops send in vendor fields and titles', () => {
    expect(decodeHtmlEntities('Abercrombie &amp; Fitch')).toBe('Abercrombie & Fitch');
    expect(decodeHtmlEntities('Viktor&amp;Rolf Flowerbomb')).toBe('Viktor&Rolf Flowerbomb');
    expect(decodeHtmlEntities('L&#039;Occitane')).toBe("L'Occitane");
    expect(decodeHtmlEntities('J&#39;Adore')).toBe("J'Adore");
    expect(decodeHtmlEntities('L&apos;Homme')).toBe("L'Homme");
    expect(decodeHtmlEntities('L&#x27;Eau')).toBe("L'Eau");
  });

  it('decodes quotes, dashes, symbols and accented letters', () => {
    expect(decodeHtmlEntities('Kenzo L&rsquo;Eau')).toBe('Kenzo L’Eau');
    expect(decodeHtmlEntities('&ldquo;Oud&rdquo; &ndash; 50ml &mdash; new&hellip;')).toBe('“Oud” – 50ml — new…');
    expect(decodeHtmlEntities('Calming Cr&egrave;me, Ros&eacute;, Bj&ouml;rk, &Eacute;t&eacute;')).toBe('Calming Crème, Rosé, Björk, Été');
    expect(decodeHtmlEntities('Fran&ccedil;ois, Ma&ntilde;ana, &Aring;re')).toBe('François, Mañana, Åre');
    expect(decodeHtmlEntities('Brand&trade; &reg; &copy; 30&deg; &pound;5')).toBe('Brand™ ® © 30° £5');
    expect(decodeHtmlEntities('&#64258;oral &#x2122;')).toBe('ﬂoral ™');
  });

  it('reads a non breaking space as a space and drops a soft hyphen', () => {
    expect(decodeHtmlEntities('Top notes:&nbsp;geranium')).toBe('Top notes: geranium');
    expect(decodeHtmlEntities('&shy;crafted')).toBe('crafted');
  });

  it('decodes text escaped twice', () => {
    expect(decodeHtmlEntities('Rose &amp;amp; Oud')).toBe('Rose & Oud');
    expect(decodeHtmlEntities('L&amp;#039;Homme')).toBe("L'Homme");
  });

  it('leaves a bare ampersand, an unknown name and a control character as written', () => {
    expect(decodeHtmlEntities('Dolce & Gabbana')).toBe('Dolce & Gabbana');
    expect(decodeHtmlEntities('Salt &Sea; &strong; &zgrave;')).toBe('Salt &Sea; &strong; &zgrave;');
    expect(decodeHtmlEntities('a&#0;b &#150; &#xD800;')).toBe('a&#0;b &#150; &#xD800;');
    expect(decodeHtmlEntities('AT&T &amp')).toBe('AT&T &amp');
  });
});

describe('the built catalogue', () => {
  const ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i;

  it('shows no HTML entity in a brand, a product name or a shop title', () => {
    const found: string[] = [];
    for (const p of CATALOGUE) {
      const shopTitles = (CRAWLED[p.id] ?? []).map((o) => o.title ?? '');
      for (const text of [p.brand, p.name, p.giftSet?.title ?? '', ...(p.giftSet?.contents ?? []), ...shopTitles]) {
        if (ENTITY.test(text)) found.push(`${p.id}: ${text}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('holds each house a shop sent escaped as one brand', () => {
    const brands = new Set(CATALOGUE.map((p) => p.brand));
    for (const brand of ['Abercrombie & Fitch', 'Dolce & Gabbana', 'Tiffany & Co', 'Viktor & Rolf', 'Zadig & Voltaire']) {
      expect(brands.has(brand), brand).toBe(true);
      expect(brands.has(brand.replace('&', '&amp;')), brand).toBe(false);
    }
  });
});
