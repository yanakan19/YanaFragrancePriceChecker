import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dormantIdsIn,
  lineageKey,
  listingIdForms,
  productIdsIn,
  settleIdAliases,
  type IdAliases,
} from '../src/catalogue/idAliases.js';
import { createDormant, movedTo, prepareDormant, type DormantData } from '../demo/dormantStore.js';
import { matchRoute } from '../demo/router.js';
import { DORMANT_PRODUCTS, ID_ALIASES, SLUG_ALIASES } from '../demo/dormant.generated.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { LAZY_DATA_MODULES } from '../scripts/dataFiles.js';
import { readManifest, policyOf } from '../scripts/generatedFiles.js';

const root = resolve(import.meta.dirname, '..');
const NONE: ReadonlySet<string> = new Set();

function settle(over: Partial<Parameters<typeof settleIdAliases>[0]>) {
  return settleIdAliases({
    previous: {},
    wasPage: NONE,
    successors: new Map(),
    live: NONE,
    dormant: NONE,
    ...over,
  });
}

describe('which old ids open which product', () => {
  it('sends an id this build folded into a live product to that product, when the id was a page', () => {
    const r = settle({
      wasPage: new Set(['old-a']),
      successors: new Map([['old-a', 'ean-1']]),
      live: new Set(['ean-1']),
    });
    expect(r.aliases).toEqual({ 'old-a': 'ean-1' });
    expect(r.fresh).toBe(1);
  });

  it('publishes nothing for an id that was never a page, so the file stays the size of the real problem', () => {
    const r = settle({ successors: new Map([['never-seen', 'ean-1']]), live: new Set(['ean-1']) });
    expect(r.aliases).toEqual({});
    expect(r.neverAPage).toBe(1);
  });

  it('never redirects a page that exists: a live product or a page with no current prices', () => {
    const r = settle({
      wasPage: new Set(['live-one', 'dormant-one']),
      successors: new Map([['live-one', 'ean-1'], ['dormant-one', 'ean-1']]),
      live: new Set(['ean-1', 'live-one']),
      dormant: new Set(['dormant-one']),
    });
    expect(r.aliases).toEqual({});
  });

  it('keeps an earlier alias after the product it named is folded again, and points it at the last holder', () => {
    // Last build: a -> b. This build: b is folded into c. a must now open c.
    const r = settle({
      previous: { a: 'b' },
      wasPage: new Set(['b']),
      successors: new Map([['b', 'c']]),
      live: new Set(['c']),
    });
    expect(r.aliases).toEqual({ a: 'c', b: 'c' });
    expect(r.carried).toBe(1);
  });

  it('keeps an earlier alias whose product has no current prices, and drops one whose product is gone', () => {
    const r = settle({ previous: { a: 'sleeping', b: 'vanished' }, dormant: new Set(['sleeping']) });
    expect(r.aliases).toEqual({ a: 'sleeping' });
    expect(r.dropped).toBe(1);
  });

  it('lets an id that is a page again open its own page', () => {
    const r = settle({ previous: { a: 'b' }, live: new Set(['a', 'b']) });
    expect(r.aliases).toEqual({});
  });

  it('ends a loop instead of following it', () => {
    const r = settle({ previous: { a: 'b', b: 'a' }, live: new Set(['z']) });
    expect(r.aliases).toEqual({});
  });

  it('is the same on a second run over its own output', () => {
    const input = {
      wasPage: new Set(['old-a', 'old-b']),
      successors: new Map([['old-a', 'ean-1'], ['old-b', 'ean-2']]),
      live: new Set(['ean-1', 'ean-2']),
    };
    const first = settle(input);
    const second = settle({ ...input, previous: first.aliases });
    expect(second.aliases).toEqual(first.aliases);
  });
});

describe('the ids a listing has answered to', () => {
  const l = { retailerId: 'the-beauty-store-uk', retailerSku: 'TBSUKDK2-36645', ean: '7640177366467' };

  it('are its SKU form and its barcode form', () => {
    expect(listingIdForms(l, NONE).sort()).toEqual(['ean-7640177366467', 'the-beauty-store-uk-tbsukdk2-36645']);
  });

  it('leave out a barcode the shop has printed on two products', () => {
    const untrusted = new Set(['the-beauty-store-uk:7640177366467']);
    // eanKey's shape is pinned by productMatch.test; the SKU form always stays.
    expect(listingIdForms(l, untrusted)).toContain('the-beauty-store-uk-tbsukdk2-36645');
  });

  it('are the SKU form only for a listing with no barcode', () => {
    expect(listingIdForms({ ...l, ean: null }, NONE)).toEqual(['the-beauty-store-uk-tbsukdk2-36645']);
  });
});

describe('the identity of a Shopify variant across SKU renames', () => {
  const sku = (s: string) => lineageKey({ retailerId: 'emirates-oud', retailerSku: s });

  it('is the shop and the leading variant id, whatever the option title became', () => {
    const key = 'emirates-oud:16475975680349';
    expect(sku('16475975680349-Default Title')).toBe(key);
    expect(sku('16475975680349-PRE-ORDER: Estimated dispatch: 9th October')).toBe(key);
    expect(sku('16475975680349-PRE-ORDER: Estimated dispatch: 7th October')).toBe(key);
  });

  it('is nothing for a SKU that is not Shopify style', () => {
    expect(sku('BYO-8')).toBeNull();
    expect(sku('12-ML')).toBeNull();
    expect(sku('313767')).toBeNull();
  });
});

describe('reading the last build', () => {
  it('reads exactly the catalogue pages from the generated file, so the build and the file agree on the format', () => {
    const text = readFileSync(resolve(root, 'demo/catalogue.generated.ts'), 'utf8');
    const ids = productIdsIn(text);
    expect(ids.size).toBe(CATALOGUE.length);
    for (const c of CATALOGUE.slice(0, 200)) expect(ids.has(c.id), c.id).toBe(true);
  });

  it('reads exactly the dormant pages from their generated file', () => {
    const text = readFileSync(resolve(root, 'demo/dormant.generated.ts'), 'utf8');
    expect([...dormantIdsIn(text)].sort()).toEqual(Object.keys(DORMANT_PRODUCTS).sort());
  });
});

describe('the data file', () => {
  it('carries the aliases with the products with no current prices, so the first load does not grow', () => {
    expect(LAZY_DATA_MODULES.dormant).toEqual(['DORMANT_PRODUCTS', 'ID_ALIASES', 'SLUG_ALIASES']);
  });

  it('is listed as a generated file, so a push conflict on it rebuilds it and the crawl commits it', () => {
    expect(policyOf('data/id-aliases.json', readManifest())).toBe('rebuild');
  });

  it('is refused when either half is missing', () => {
    expect(() => prepareDormant({ DORMANT_PRODUCTS: {} })).toThrow();
    expect(() => prepareDormant({ ID_ALIASES: {}, SLUG_ALIASES: {} })).toThrow();
    expect(() => prepareDormant({ DORMANT_PRODUCTS: {}, ID_ALIASES: [], SLUG_ALIASES: {} })).toThrow();
    expect(prepareDormant({ DORMANT_PRODUCTS: {}, ID_ALIASES: { a: 'b' }, SLUG_ALIASES: {} }).aliases).toEqual({ a: 'b' });
  });
});

describe('an absorbed address lands on its survivor', () => {
  const live = new Set(CATALOGUE.map((c) => c.id));
  const isLive = (id: string) => live.has(id);
  const data: DormantData = { products: DORMANT_PRODUCTS, aliases: ID_ALIASES, slugAliases: SLUG_ALIASES };

  it('has aliases at all', () => {
    expect(Object.keys(ID_ALIASES).length).toBeGreaterThan(1000);
  });

  it('opens the survivor for every alias, and every survivor is a page', () => {
    for (const [from, to] of Object.entries(ID_ALIASES)) {
      expect(movedTo(data, from, isLive), from).toBe(to);
      expect(isLive(to) || to in DORMANT_PRODUCTS, `${from} -> ${to}`).toBe(true);
    }
  });

  it('is never an alias of a page that exists, nor of itself', () => {
    for (const [from, to] of Object.entries(ID_ALIASES)) {
      expect(isLive(from), from).toBe(false);
      expect(from in DORMANT_PRODUCTS, from).toBe(false);
      expect(to, from).not.toBe(from);
    }
  });

  it('ends in one step: no survivor is itself an alias', () => {
    for (const to of new Set(Object.values(ID_ALIASES))) expect(to in ID_ALIASES, to).toBe(false);
  });

  it('is empty-handed for an id nothing absorbed, a prototype name, or before the file is in', () => {
    expect(movedTo(data, 'ean-0000000000000', isLive)).toBeNull();
    expect(movedTo(data, 'constructor', isLive)).toBeNull();
    expect(movedTo(data, '__proto__', isLive)).toBeNull();
    expect(movedTo(null, Object.keys(ID_ALIASES)[0]!, isLive)).toBeNull();
  });

  it('does not send an alias to a survivor that is no longer a page', () => {
    expect(movedTo({ products: {}, aliases: { a: 'gone' }, slugAliases: {} }, 'a', () => false)).toBeNull();
    expect(movedTo({ products: { sleeping: DORMANT_PRODUCTS[Object.keys(DORMANT_PRODUCTS)[0]!]! }, aliases: { a: 'sleeping' }, slugAliases: {} }, 'a', () => false)).toBe('sleeping');
  });

  it('reads the file the page fetches, by the route the address matches', async () => {
    const store = createDormant(() => Promise.resolve({ DORMANT_PRODUCTS, ID_ALIASES, SLUG_ALIASES }));
    const loaded = await store.load();
    const route = matchRoute('/fragrance/escentric-molecules-m01-30c-unit');
    expect(route).toMatchObject({ name: 'fragrance', param: 'escentric-molecules-m01-30c-unit' });
    expect(movedTo(loaded, route.param, isLive)).toBe('cult-beauty-global-10547300');
  });

  describe('the cases the owner named', () => {
    it('Escentric Molecule 01 Portable 30ml is Cult Beauty Global 10547300', () => {
      expect(movedTo(data, 'escentric-molecules-m01-30c-unit', isLive)).toBe('cult-beauty-global-10547300');
      expect(isLive('cult-beauty-global-10547300')).toBe(true);
    });

    it('the four Beauty Store UK minis that folded into barcode ids in the Kayali work', () => {
      const folded: Record<string, string> = {
        'the-beauty-store-uk-tbsukdk2-36645': 'ean-7640177366467', // Chopard Brilliant Wish 5ml
        'the-beauty-store-uk-tbsukdk2-36643': 'ean-7640177366276', // Chopard Wish 5ml
        'the-beauty-store-uk-tbsukdk2-36886': 'ean-3386460119290', // Jimmy Choo I Want Choo 4.5ml
        'the-beauty-store-uk-tbsukdk2-36887': 'ean-3386460133340', // Jimmy Choo I Want Choo Forever 4.5ml
      };
      for (const [from, to] of Object.entries(folded)) {
        expect(movedTo(data, from, isLive), from).toBe(to);
        expect(isLive(to), to).toBe(true);
      }
    });

    it('every address Emirates Oud gave the Hawas Boa, whatever the pre-order notice said, opens one product', () => {
      const ids = [
        'emirates-oud-16475975680349-default-title',
        'emirates-oud-16475975680349-pre-order--estimated-dispatch--9th-october',
        'emirates-oud-16475975680349-pre-order--estimated-dispatch--7th-october',
      ];
      const landings = ids.map((id) => movedTo(data, id, isLive));
      expect(new Set(landings).size).toBe(1);
      expect(landings[0]).not.toBeNull();
      expect(isLive(landings[0]!)).toBe(true);
      const name = CATALOGUE.find((c) => c.id === landings[0])!.name;
      expect(name).toMatch(/hawas/i);
    });
  });

  it('keeps every old address out of the sitemap, so search engines are offered one page, never two', () => {
    const sitemap = readFileSync(resolve(root, 'demo/sitemap.xml'), 'utf8');
    const listed = new Set([...sitemap.matchAll(/<loc>[^<]*\/([^/<]+)<\/loc>/g)].map((m) => m[1]!));
    expect(listed.size).toBeGreaterThan(1000);
    // The sitemap lists products by their own address now (docs/PRODUCT-URLS.md):
    // no absorbed id, as an old address, is in it, and neither is the slug of a
    // product a merge folded away.
    expect(sitemap).not.toContain('/fragrance/');
    for (const from of Object.keys(ID_ALIASES)) expect(listed.has(from), from).toBe(false);
    for (const slug of Object.keys(SLUG_ALIASES)) expect(listed.has(slug), slug).toBe(false);
  });
});

describe('the persisted file', () => {
  it('is the same map the page is given', () => {
    const file = JSON.parse(readFileSync(resolve(root, 'data/id-aliases.json'), 'utf8')) as { aliases: IdAliases };
    expect(file.aliases).toEqual(ID_ALIASES);
  });
});

describe('the page', () => {
  const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');

  it('opens an absorbed address on its survivor and replaces the address, both for a first load and once the file arrives', () => {
    // Both addresses of a product (the old /fragrance/<id> and the new
    // /BRAND_NAME_VOLUME) open it through openProduct.
    const from = app.indexOf('function applyRoute');
    const cases = app.slice(app.indexOf("case 'product': {", from), app.indexOf("case 'retailer': {", from));
    expect(cases).toContain('openProduct(');
    expect(cases).toContain("case 'fragrance': return openProduct(route.param)");
    const route = app.slice(app.indexOf('function openProduct'), app.indexOf('function handleUnsubscribeLink'));
    expect(route).toContain('absorbedLanding(param)');
    expect(route).toContain("syncUrl('replace')");
    const settle = app.slice(app.indexOf('function settleDormantRoute'), app.indexOf('function detailView'));
    expect(settle).toContain('absorbedLanding(id)');
    expect(settle).toContain("syncUrl('replace')");
    expect(settle).not.toContain("syncUrl('push')");
  });

  it('asks only the lazy file, never the catalogue, so the first load does not grow', () => {
    expect(app).toContain("import { dormant, dormantEntry, idForSlug, movedTo } from './dormantStore.js';");
    expect(app).not.toMatch(/ID_ALIASES/);
    expect(app).not.toMatch(/from '\.\/dormant\.generated/);
  });
});
