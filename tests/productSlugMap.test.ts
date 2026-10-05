import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { DORMANT_PRODUCTS, ID_ALIASES, SLUG_ALIASES } from '../demo/dormant.generated.js';
import {
  RESERVED_WORDS,
  assignSlugs,
  isProductSlug,
  type SlugFile,
  type SlugProduct,
} from '../src/catalogue/productSlug.js';
import { readManifest, policyOf } from '../scripts/generatedFiles.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = JSON.parse(readFileSync(resolve(root, 'data/product-slugs.json'), 'utf8')) as SlugFile;

const products: SlugProduct[] = [
  ...CATALOGUE.map((p) => ({
    id: p.id,
    brand: p.brand,
    name: p.name,
    concentration: p.concentration,
    sizeMl: p.sizeMl,
    giftSet: p.giftSet !== undefined,
  })),
  ...Object.entries(DORMANT_PRODUCTS).map(([id, d]) => ({
    id,
    brand: d.brand,
    name: d.name,
    concentration: d.concentration,
    sizeMl: d.sizeMl,
    giftSet: d.giftSet !== undefined,
  })),
];

describe('data/product-slugs.json, the committed slug map', () => {
  it('is a rebuild file, committed like data/id-aliases.json', () => {
    expect(policyOf('data/product-slugs.json', readManifest())).toBe('rebuild');
  });

  it('gives every page of the site a slug, and the page carries it', () => {
    expect(CATALOGUE.length).toBeGreaterThan(1000);
    for (const p of CATALOGUE) expect(file.slugs[p.id], p.id).toBe(p.slug);
    for (const [id, d] of Object.entries(DORMANT_PRODUCTS)) expect(file.slugs[id], id).toBe(d.slug);
  });

  it('holds only addresses of the right shape, none of them a reserved word, none given twice', () => {
    const slugs = Object.values(file.slugs);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [id, slug] of Object.entries(file.slugs)) {
      expect(isProductSlug(slug), `${id}: ${slug}`).toBe(true);
      expect(RESERVED_WORDS, slug).not.toContain(slug);
    }
  });

  it('is sorted by id, so a rebuild writes the same bytes', () => {
    const ids = Object.keys(file.slugs);
    expect(ids).toEqual([...ids].sort());
  });

  it('is the same after a rebuild from the same catalogue: nothing is reassigned', () => {
    const again = assignSlugs(file.slugs, products);
    expect(again.stats.fresh).toBe(0);
    expect(JSON.stringify(again.slugs)).toBe(JSON.stringify(file.slugs));
  });

  it('keeps every slug when the catalogue changes: products leave, arrive and are renamed', () => {
    const kept = products.slice(10);
    const renamed = kept.map((p, i) => (i % 7 === 0 ? { ...p, name: `${p.name} Renamed`, sizeMl: 1234 } : p));
    const arrivals: SlugProduct[] = [
      { id: 'zz-new-1', brand: 'Brand New', name: 'Fresh', concentration: 'Eau de Parfum', sizeMl: 50, giftSet: false },
    ];
    const next = assignSlugs(file.slugs, [...renamed, ...arrivals]);
    for (const [id, slug] of Object.entries(file.slugs)) expect(next.slugs[id], id).toBe(slug);
    expect(next.slugs['zz-new-1']).toBe('brand_new_fresh_50ml');
  });
});

describe('slugs of merged products', () => {
  const pages = new Set(products.map((p) => p.id));

  it('point at a page, are not the slug of any page, and are the slug of a product that left', () => {
    const pageSlugs = new Set(products.map((p) => file.slugs[p.id]));
    const holders = new Map(Object.entries(file.slugs).map(([id, slug]) => [slug, id] as const));
    for (const [slug, to] of Object.entries(SLUG_ALIASES)) {
      expect(pages.has(to), `${slug} -> ${to}`).toBe(true);
      expect(pageSlugs.has(slug), slug).toBe(false);
      const holder = holders.get(slug);
      expect(holder, slug).toBeDefined();
      expect(ID_ALIASES[holder!] === to || holder === to, `${slug}: ${holder} -> ${to}`).toBe(true);
    }
  });
});
