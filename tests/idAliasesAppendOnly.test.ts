import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertAppendOnly, resolveAlias, settleIdAliases, type IdAliases } from '../src/catalogue/idAliases.js';
import { assertSlugsAppendOnly, assignSlugs } from '../src/catalogue/productSlug.js';
import { DORMANT_PRODUCTS, ID_ALIASES } from '../demo/dormant.generated.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';

/**
 * data/id-aliases.json is a memory: a key is never dropped or rewritten, so an
 * address that was ever redirected keeps answering (CLAUDE.md, docs/PRODUCT-URLS.md).
 * Over 60 commits the build lost 50 keys and rewrote about 950. These tests use a
 * stored list of the keys the file held at a reference point, not live data.
 */
const root = resolve(import.meta.dirname, '..');
const reference = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/id-aliases-reference.json'), 'utf8')) as {
  keys: string[];
  unresolved: string[];
};
const record = (JSON.parse(readFileSync(resolve(root, 'data/id-aliases.json'), 'utf8')) as { aliases: IdAliases }).aliases;
const pages = new Set<string>([...CATALOGUE.map((c) => c.id), ...Object.keys(DORMANT_PRODUCTS)]);
const NONE: ReadonlySet<string> = new Set();

describe('data/id-aliases.json against the reference keys', () => {
  it('holds every key the reference held', () => {
    const missing = reference.keys.filter((k) => !Object.prototype.hasOwnProperty.call(record, k));
    expect(missing).toEqual([]);
    expect(reference.keys.length).toBeGreaterThan(11000);
  });

  it('resolves every reference key to a page (it is a page itself, or is served), except the ones whose product is gone everywhere', () => {
    const unresolved = reference.keys.filter((k) => !pages.has(k) && !(k in ID_ALIASES));
    expect(unresolved.sort()).toEqual([...reference.unresolved].sort());
  });

  it('serves a recorded id to a page and never to another alias', () => {
    for (const [from, to] of Object.entries(ID_ALIASES)) {
      expect(pages.has(to), `${from} -> ${to}`).toBe(true);
      expect(pages.has(from), `${from} is a page and must not be redirected`).toBe(false);
    }
  });

  it('the flat serving map agrees with following the record', () => {
    for (const [from, to] of Object.entries(ID_ALIASES).slice(0, 3000)) {
      expect(resolveAlias(from, record, (id) => pages.has(id)), from).toBe(to);
    }
  });
});

describe('a rebuild may add keys and never lose or change one', () => {
  const previous: IdAliases = { a: 'b', b: 'c', gone: 'vanished', back: 'c' };

  it('keeps every previous key whatever happens to its target', () => {
    const r = settleIdAliases({ previous, wasPage: NONE, successors: new Map(), live: new Set(['c']), dormant: NONE });
    for (const [k, v] of Object.entries(previous)) expect(r.aliases[k], k).toBe(v);
    expect(r.published).toEqual({ a: 'c', b: 'c', back: 'c' });
    expect(r.unresolved).toBe(1);
  });

  it('keeps the key of an id that is a page again, serves the page, and serves the alias again when the page leaves', () => {
    const back = settleIdAliases({ previous, wasPage: NONE, successors: new Map(), live: new Set(['c', 'back']), dormant: NONE });
    expect(back.aliases.back).toBe('c');
    expect(back.published.back).toBeUndefined();
    const gone = settleIdAliases({ previous: back.aliases, wasPage: NONE, successors: new Map(), live: new Set(['c']), dormant: NONE });
    expect(gone.published.back).toBe('c');
  });

  it('is never smaller, on a build with no merges at all and no live products', () => {
    const r = settleIdAliases({ previous, wasPage: NONE, successors: new Map(), live: NONE, dormant: NONE });
    expect(Object.keys(r.aliases).sort()).toEqual(Object.keys(previous).sort());
  });

  it('refuses a smaller or rewritten set', () => {
    expect(() => assertAppendOnly(previous, { a: 'b', b: 'c', gone: 'vanished' })).toThrow(/1 keys would be lost/);
    expect(() => assertAppendOnly(previous, { ...previous, a: 'c' })).toThrow(/1 changed/);
    expect(() => assertAppendOnly(previous, { ...previous, extra: 'c' })).not.toThrow();
  });
});

describe('data/product-slugs.json is append only too', () => {
  const previous = { 'id-1': 'brand_name_100ml', 'id-2': 'brand_other_50ml' };
  const product = (id: string) => ({ id, brand: 'Brand', name: 'Name', concentration: 'Eau de Parfum', sizeMl: 100, giftSet: false });

  it('keeps a slug of a product that left, and never hands it to another product', () => {
    const r = assignSlugs(previous, [product('id-3')]);
    expect(r.slugs['id-1']).toBe('brand_name_100ml');
    expect(r.slugs['id-2']).toBe('brand_other_50ml');
    expect(r.slugs['id-3']).not.toBe('brand_name_100ml');
  });

  it('refuses a lost, changed or doubled slug', () => {
    expect(() => assertSlugsAppendOnly(previous, { 'id-1': 'brand_name_100ml' })).toThrow(/id-2 lost/);
    expect(() => assertSlugsAppendOnly(previous, { ...previous, 'id-1': 'x_y_1ml' })).toThrow(/id-1/);
    expect(() => assertSlugsAppendOnly(previous, { ...previous, 'id-3': 'brand_name_100ml' })).toThrow(/given to/);
  });

  it('the committed file has one id per slug', () => {
    const slugs = (JSON.parse(readFileSync(resolve(root, 'data/product-slugs.json'), 'utf8')) as { slugs: Record<string, string> }).slugs;
    const values = Object.values(slugs);
    expect(new Set(values).size).toBe(values.length);
    for (const c of CATALOGUE.slice(0, 500)) expect(slugs[c.id], c.id).toBeTruthy();
  });
});
