import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { RESERVED_WORDS, isProductSlug, PRODUCT_SLUG_RE } from '../src/catalogue/productSlug.js';
import { headFor, SITE_URL } from '../demo/head.js';
import { matchRoute, productPath, rootWords, routeToPath, setProductSlugLookup } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

afterEach(() => setProductSlugLookup(() => null));

describe('a product address is a route', () => {
  it('matches /BRAND_NAME_VOLUME as a product route carrying the slug', () => {
    expect(matchRoute('/creed_aventus_100ml')).toMatchObject({ name: 'product', param: 'creed_aventus_100ml' });
    expect(matchRoute('/maison_francis_kurkdjian_baccarat_rouge_540_35ml')).toMatchObject({
      name: 'product',
      param: 'maison_francis_kurkdjian_baccarat_rouge_540_35ml',
    });
    expect(matchRoute('/rabanne_phantom_parfum_set')).toMatchObject({ name: 'product' });
    expect(matchRoute('/creed_aventus_edp_v2_100ml')).toMatchObject({ name: 'product' });
  });

  it('ignores a trailing slash and keeps the query', () => {
    expect(matchRoute('/creed_aventus_100ml/', '?utm=x')).toMatchObject({
      name: 'product',
      param: 'creed_aventus_100ml',
      query: { utm: 'x' },
    });
  });

  it('accepts capitals and answers with the lower case slug', () => {
    expect(matchRoute('/Creed_Aventus_100ML')).toMatchObject({ name: 'product', param: 'creed_aventus_100ml' });
  });

  it('is Page Not Found for a single segment that is not a product address', () => {
    for (const path of ['/aventus', '/creed_aventus', '/creed_aventus_edp', '/creed-aventus-100ml', '/creed__aventus_100ml', '/nonsense']) {
      expect(matchRoute(path).name, path).toBe('notFound');
    }
  });

  it('does not throw on a segment that is not valid percent encoding', () => {
    expect(matchRoute('/%E0%A4%A').name).toBe('notFound');
    expect(matchRoute('/creed_aventus_%zz').name).toBe('notFound');
  });

  it('still matches the old address, with the id as the param', () => {
    expect(matchRoute('/fragrance/ean-6290171075189')).toMatchObject({ name: 'fragrance', param: 'ean-6290171075189' });
  });
});

describe('routeToPath builds the new address', () => {
  it('uses the registered slug for a product id', () => {
    setProductSlugLookup((id) => (id === 'ean-3348901486183' ? 'creed_aventus_100ml' : null));
    expect(routeToPath({ name: 'fragrance', param: 'ean-3348901486183', query: {} })).toBe('/creed_aventus_100ml');
    expect(productPath('ean-3348901486183')).toBe('/creed_aventus_100ml');
  });

  it('falls back to the old address, which redirects, for an id it has no slug for', () => {
    setProductSlugLookup(() => null);
    expect(routeToPath({ name: 'fragrance', param: 'ean-1', query: {} })).toBe('/fragrance/ean-1');
    expect(routeToPath({ name: 'fragrance', param: 'a b/c', query: {} })).toBe('/fragrance/a%20b%2Fc');
  });

  it('writes a product route as its slug', () => {
    expect(routeToPath({ name: 'product', param: 'creed_aventus_100ml', query: {} })).toBe('/creed_aventus_100ml');
  });

  it('is the inverse of matchRoute for a slug', () => {
    const route = matchRoute('/dior_sauvage_edp_100ml');
    expect(routeToPath(route)).toBe('/dior_sauvage_edp_100ml');
  });
});

describe('a product address cannot clash with the site\'s own routes', () => {
  it('has no route word of the router that has the shape of a product address', () => {
    const words = rootWords();
    expect(words.length).toBeGreaterThan(10);
    for (const word of words) {
      expect(PRODUCT_SLUG_RE.test(word), word).toBe(false);
      expect(isProductSlug(word), word).toBe(false);
      expect(word, word).not.toContain('_');
    }
  });

  it('keeps every route word of the router in the reserved list', () => {
    for (const word of rootWords()) expect(RESERVED_WORDS, word).toContain(word);
  });

  it('reserves the words the owner named, and the ones the site may add', () => {
    for (const word of [
      'search', 'deals', 'explore', 'about', 'brands', 'retailers', 'notes', 'settings', 'account',
      'suggestions', 'design', 'legal', 'oils', 'sets', 'fragrance',
    ]) {
      expect(RESERVED_WORDS, word).toContain(word);
    }
  });

  it('resolves every route word to its own route, never to a product', () => {
    for (const word of rootWords()) {
      const route = matchRoute(`/${word}`);
      if (word === 'fragrance' || word === 'legal') continue; // leaves: they have a second segment
      expect(route.name, word).not.toBe('product');
    }
    expect(matchRoute('/search').name).toBe('search');
    expect(matchRoute('/deals').name).toBe('deals');
    expect(matchRoute('/gift-sets').name).toBe('sets');
    expect(matchRoute('/oils').name).toBe('oils');
    expect(matchRoute('/sets').name).toBe('sets');
  });

  it('has no file or folder at the top of the published site with the shape of a product address', () => {
    const entries = readdirSync(resolve(root, 'demo'));
    expect(entries).toContain('sw.js');
    for (const entry of entries) {
      const name = entry.replace(/\.[a-z0-9]+$/i, '');
      expect(isProductSlug(entry.toLowerCase()), entry).toBe(false);
      expect(isProductSlug(name.toLowerCase()), entry).toBe(false);
    }
  });

  it('cannot be forced by the folding: no text folds to a one word route', () => {
    // A slug is brand, name and volume: three parts and two underscores at least.
    for (const text of ['search', 'deals', 'brands', 'notes']) {
      expect(isProductSlug(text)).toBe(false);
      expect(isProductSlug(`${text}_${text}_50ml`)).toBe(true);
      expect(RESERVED_WORDS).not.toContain(`${text}_${text}_50ml`);
    }
  });
});

describe('the head of a product page', () => {
  it('points the canonical at the new address, and is the same for the old address', () => {
    setProductSlugLookup((id) => (id === 'ean-123' ? 'creed_aventus_100ml' : null));
    const viaId = headFor({ route: { name: 'fragrance', param: 'ean-123', query: {} }, leafName: 'Creed Aventus 100ml' });
    const viaSlug = headFor({ route: { name: 'product', param: 'creed_aventus_100ml', query: {} }, leafName: 'Creed Aventus 100ml' });
    expect(viaId.canonical).toBe(`${SITE_URL}/creed_aventus_100ml`);
    expect(viaSlug.canonical).toBe(`${SITE_URL}/creed_aventus_100ml`);
    expect(viaId.noindex).toBe(false);
    expect(viaSlug.noindex).toBe(false);
  });

  it('asks for noindex while the old address is in the bar, and not after', () => {
    setProductSlugLookup(() => 'creed_aventus_100ml');
    const route = { name: 'fragrance' as const, param: 'ean-123', query: {} };
    expect(headFor({ route, leafName: 'x', legacyAddress: true }).noindex).toBe(true);
    expect(headFor({ route, leafName: 'x', legacyAddress: true }).canonical).toBe(`${SITE_URL}/creed_aventus_100ml`);
    expect(headFor({ route, leafName: 'x', legacyAddress: false }).noindex).toBe(false);
  });

  it('still keeps a product with no current prices off search engines', () => {
    const route = { name: 'product' as const, param: 'creed_aventus_100ml', query: {} };
    expect(headFor({ route, leafEmpty: true }).noindex).toBe(true);
  });
});
