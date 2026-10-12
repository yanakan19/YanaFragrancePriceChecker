import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities, decodeListingNames, entityEncodedForms, hasHtmlEntity,
} from '../src/catalogue/htmlEntities.js';
import { parseListings } from '../src/catalogue/jsonld.js';
import { reconcile } from '../src/catalogue/reconcile.js';
import { displayName } from '../src/catalogue/productName.js';
import { giftSetId } from '../src/catalogue/giftSet.js';
import { listingIdForms } from '../src/catalogue/idAliases.js';
import type { RawListing } from '../src/catalogue/types.js';

/**
 * The strings below are the ones the live catalogue carried on 2026-10-11:
 * brand and title text that a shop's markup or feed handed over with its HTML
 * entities still in it (beauty-flash, gorgeous-shop, scentstore, perfume-closet,
 * superdrug, notino-uk, perfumeo, and Paris Corner's own site).
 */
describe('decodeHtmlEntities', () => {
  it('decodes the ampersand a brand name carries', () => {
    expect(decodeHtmlEntities('Dolce &amp; Gabbana')).toBe('Dolce & Gabbana');
    expect(decodeHtmlEntities('Viktor &amp; Rolf')).toBe('Viktor & Rolf');
    expect(decodeHtmlEntities('Abercrombie &amp; Fitch')).toBe('Abercrombie & Fitch');
    expect(decodeHtmlEntities('Tiffany &amp; Co')).toBe('Tiffany & Co');
    expect(decodeHtmlEntities('Zadig &amp; Voltaire')).toBe('Zadig & Voltaire');
    expect(decodeHtmlEntities('Roger &amp; Gallet Rose Wellbeing Fragrant Water 100ml')).toBe('Roger & Gallet Rose Wellbeing Fragrant Water 100ml');
  });

  it('decodes every way an apostrophe is written', () => {
    expect(decodeHtmlEntities('L&#039;Occitane')).toBe("L'Occitane");
    expect(decodeHtmlEntities('L&#39;Occitane')).toBe("L'Occitane");
    expect(decodeHtmlEntities('L&#x27;Occitane')).toBe("L'Occitane");
    expect(decodeHtmlEntities('L&apos;Occitane')).toBe("L'Occitane");
    expect(decodeHtmlEntities('Men&#039;s Happy For Men')).toBe("Men's Happy For Men");
    expect(decodeHtmlEntities('Afnan Supremacy Collector&apos;s Edition')).toBe("Afnan Supremacy Collector's Edition");
    expect(decodeHtmlEntities('J&#039;Adore Roller Pearl')).toBe("J'Adore Roller Pearl");
  });

  it('decodes a text its shop encoded twice, to a limit of three passes', () => {
    expect(decodeHtmlEntities('IDENTITY ROSE &amp;amp; LEATHER 100ML')).toBe('IDENTITY ROSE & LEATHER 100ML');
    expect(decodeHtmlEntities('Men&amp;#039;s')).toBe("Men's");
    expect(decodeHtmlEntities('&amp;amp;amp;amp;')).toBe('&amp;');
  });

  it('decodes named letters and the typographic marks of a title', () => {
    expect(decodeHtmlEntities('Caf&eacute;')).toBe('Café');
    expect(decodeHtmlEntities('Herm&egrave;s')).toBe('Hermès');
    expect(decodeHtmlEntities('Chlo&eacute;')).toBe('Chloé');
    expect(decodeHtmlEntities('Lanc&ocirc;me')).toBe('Lancôme');
    expect(decodeHtmlEntities('M&auml;urer &amp; Wirtz')).toBe('Mäurer & Wirtz');
    expect(decodeHtmlEntities('Notes &amp; Review | Perfumeo')).toBe('Notes & Review | Perfumeo');
    expect(decodeHtmlEntities('Oud &ndash; Rose')).toBe('Oud – Rose');
    expect(decodeHtmlEntities('D&rsquo;Orsay')).toBe('D’Orsay');
    expect(decodeHtmlEntities('Chanel&reg; N&deg;5')).toBe('Chanel® N°5');
  });

  it('reads a non breaking space as a plain one', () => {
    expect(decodeHtmlEntities('Top notes:&nbsp;geranium')).toBe('Top notes: geranium');
    expect(decodeHtmlEntities('a&#160;b')).toBe('a b');
  });

  it('reads a numeric reference the way a browser does', () => {
    expect(decodeHtmlEntities('Oud &#8211; Rose')).toBe('Oud – Rose');
    expect(decodeHtmlEntities('D&#8217;Orsay')).toBe('D’Orsay');
    expect(decodeHtmlEntities('a&#150;b')).toBe('a–b');
    expect(decodeHtmlEntities('&#x1F339;')).toBe('🌹');
  });

  it('accepts the markup entities in capitals, as HTML does', () => {
    expect(decodeHtmlEntities('A &AMP; B')).toBe('A & B');
    expect(decodeHtmlEntities('&QUOT;x&QUOT;')).toBe('"x"');
  });

  it('leaves what it does not know exactly as it was', () => {
    expect(decodeHtmlEntities('Dolce & Gabbana')).toBe('Dolce & Gabbana');
    expect(decodeHtmlEntities('A&B')).toBe('A&B');
    expect(decodeHtmlEntities('AT&T; &unknownname; &#0; &#xD800; &#99999999;')).toBe('AT&T; &unknownname; &#0; &#xD800; &#99999999;');
    expect(decodeHtmlEntities('Hampton &amp Ampersand')).toBe('Hampton &amp Ampersand');
    // Not a mixed case name: "Eacute" is an entity, "eACUTE" is not.
    expect(decodeHtmlEntities('&eACUTE;')).toBe('&eACUTE;');
  });

  it('does not touch a string with no ampersand', () => {
    for (const text of ['', 'Hermès', "L'Occitane", 'Chloé Eau de Parfum 50ml']) expect(decodeHtmlEntities(text)).toBe(text);
  });

  it('is its own fixed point: decoding twice changes nothing more', () => {
    for (const text of ['Dolce &amp; Gabbana', 'IDENTITY ROSE &amp;amp; LEATHER', 'L&#039;Occitane', 'A &amp; B &amp; C']) {
      const once = decodeHtmlEntities(text);
      expect(decodeHtmlEntities(once)).toBe(once);
    }
  });
});

describe('hasHtmlEntity', () => {
  it('says whether decoding would change the text', () => {
    expect(hasHtmlEntity('Dolce &amp; Gabbana')).toBe(true);
    expect(hasHtmlEntity('L&#039;Occitane')).toBe(true);
    expect(hasHtmlEntity('Dolce & Gabbana')).toBe(false);
    expect(hasHtmlEntity('&unknown;')).toBe(false);
    expect(hasHtmlEntity('Hermès')).toBe(false);
  });
});

describe('decodeListingNames', () => {
  it('decodes the title and the vendor name and nothing else', () => {
    const listing = { rawTitle: 'Dolce &amp; Gabbana Light Blue 100ml', rawBrand: 'Dolce &amp; Gabbana', retailerSku: 'a&amp;b', description: 'Top &amp; base' };
    expect(decodeListingNames(listing)).toEqual({
      rawTitle: 'Dolce & Gabbana Light Blue 100ml',
      rawBrand: 'Dolce & Gabbana',
      retailerSku: 'a&amp;b',
      description: 'Top &amp; base',
    });
  });

  it('keeps a missing vendor name missing', () => {
    expect(decodeListingNames({ rawTitle: 'J&#039;Adore 50ml', rawBrand: null }).rawBrand).toBeNull();
  });

  it('returns the very same object when there is nothing to decode', () => {
    const listing = { rawTitle: 'Dolce & Gabbana Light Blue 100ml', rawBrand: 'Dolce & Gabbana' };
    expect(decodeListingNames(listing)).toBe(listing);
  });
});

describe('entityEncodedForms', () => {
  it('gives the spellings a shop would have written before the text was decoded', () => {
    expect(entityEncodedForms('Roger & Gallet Eau de Cologne')).toEqual(['Roger &amp; Gallet Eau de Cologne']);
    expect(entityEncodedForms("Men's Gift Set")).toEqual(['Men&#039;s Gift Set', "Men&#39;s Gift Set", 'Men&apos;s Gift Set']);
  });

  it('combines them for a text that has both', () => {
    const forms = entityEncodedForms("Dolce & Gabbana Men's Set");
    expect(forms).toContain("Dolce &amp; Gabbana Men's Set");
    expect(forms).toContain('Dolce &amp; Gabbana Men&#039;s Set');
    expect(forms).toContain("Dolce & Gabbana Men&#039;s Set");
    expect(forms).not.toContain("Dolce & Gabbana Men's Set");
  });

  it('gives nothing for a text with none of the characters', () => {
    expect(entityEncodedForms('Light Blue Eau de Toilette 100ml')).toEqual([]);
  });

  it('round trips: every form decodes back to the text', () => {
    for (const text of ["Dolce & Gabbana Men's Set", 'Roger & Gallet 100ml', 'Say "Hello" & goodbye']) {
      for (const form of entityEncodedForms(text)) expect(decodeHtmlEntities(form)).toBe(text);
    }
  });
});

const raw = (sku: string, over: Partial<RawListing> = {}): RawListing => ({
  retailerSku: sku,
  url: `https://shop.example/p/${sku}`,
  rawTitle: `Product ${sku}`,
  rawBrand: 'Brand',
  ean: null,
  imageUrl: null,
  priceGbp: 10,
  wasPriceGbp: null,
  promoEndsAt: null,
  inStock: true,
  sectionId: 'fragrance',
  ...over,
});

describe('where a shop\'s text is read', () => {
  it('reconcile stores a title and a vendor name decoded, for a new listing and for one seen again', () => {
    const dirty = raw('a', { rawTitle: 'Dolce &amp; Gabbana Light Blue 100ml', rawBrand: 'Dolce &amp; Gabbana' });
    const first = reconcile({ existing: [], crawled: [dirty], retailerId: 'beauty-flash', now: '2026-10-10T06:00:00Z', complete: true });
    expect(first.listings[0]).toMatchObject({ rawTitle: 'Dolce & Gabbana Light Blue 100ml', rawBrand: 'Dolce & Gabbana' });
    const again = reconcile({ existing: first.listings, crawled: [dirty], retailerId: 'beauty-flash', now: '2026-10-11T06:00:00Z', complete: true });
    expect(again.listings[0]).toMatchObject({ rawTitle: 'Dolce & Gabbana Light Blue 100ml', rawBrand: 'Dolce & Gabbana', firstSeenAt: '2026-10-10T06:00:00Z' });
  });

  it('reconcile leaves a sku, a url and a description as the shop gave them', () => {
    const dirty = raw('a&amp;b', { url: 'https://shop.example/p?a=1&amp;b=2', description: 'Top &amp; base' });
    const r = reconcile({ existing: [], crawled: [dirty], retailerId: 'x', now: '2026-10-10T06:00:00Z', complete: true });
    expect(r.listings[0]).toMatchObject({ retailerSku: 'a&amp;b', url: 'https://shop.example/p?a=1&amp;b=2', description: 'Top &amp; base' });
  });

  it('a JSON-LD name and brand arrive decoded (the way beauty-flash and gorgeous-shop write them)', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product',
      name: 'L&#039;Occitane Shea Butter Hand Cream 150ml',
      sku: 'LOC1',
      brand: { '@type': 'Brand', name: 'L&#039;Occitane' },
      offers: { '@type': 'Offer', price: '12.50', priceCurrency: 'GBP', availability: 'https://schema.org/InStock' },
    })}</script>`;
    const [listing] = parseListings(html, { sectionId: 'fragrance', pageUrl: 'https://shop.example/p/loc1' });
    expect(listing?.rawTitle).toBe("L'Occitane Shea Butter Hand Cream 150ml");
    expect(listing?.rawBrand).toBe("L'Occitane");
  });

  it('a name is never made with an entity in it, even from a title that was not decoded', () => {
    expect(displayName('Dior J&#039;Adore Body Mist 100ml', 'Dior', 'Dior')).not.toMatch(/&#/);
    expect(displayName('Clinique Men&#039;s Happy For Men 100ml', 'Clinique', 'Clinique')).toContain("Men's Happy");
  });

  it('a gift set keeps answering at the id its title made before the title was decoded', () => {
    const encoded = { retailerId: 'scentstore', retailerSku: 's1', ean: null, rawTitle: 'Roger &amp; Gallet Jean Marie Farina Eau de Cologne 100ml Gift Set' };
    const decoded = { ...encoded, rawTitle: 'Roger & Gallet Jean Marie Farina Eau de Cologne 100ml Gift Set' };
    const before = giftSetId(encoded);
    const after = giftSetId(decoded);
    expect(before).toBe('set-roger-amp-gallet-jean-marie-farina-eau-de-cologne-100ml-gift-set');
    expect(after).toBe('set-roger-gallet-jean-marie-farina-eau-de-cologne-100ml-gift-set');
    expect(listingIdForms(decoded, new Set())).toContain(before);
    expect(listingIdForms(decoded, new Set())).toContain(after);
  });
});
