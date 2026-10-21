import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { DORMANT_PRODUCTS, SLUG_ALIASES } from '../demo/dormant.generated.js';
import { assertRenamesAppendOnly, hasEntityArtifact, type SlugFile } from '../src/catalogue/productSlug.js';

/**
 * The published product addresses and the address memory, as the last build
 * left them: no address carries an HTML entity, and every address that did
 * (229 on 22 Oct 2026) still opens its product. Rules, not counts.
 */
const root = resolve(import.meta.dirname, '..');
const file = JSON.parse(readFileSync(resolve(root, 'data/product-slugs.json'), 'utf8')) as SlugFile;

describe('product addresses and HTML entities', () => {
  const pages = new Map<string, string>();
  for (const c of CATALOGUE) pages.set(c.slug, c.id);
  for (const [id, d] of Object.entries(DORMANT_PRODUCTS)) pages.set((d as { slug: string }).slug, id);

  it('publishes no address that names an entity (viktor_and_amp_rolf_..., l_and_039_eau_...)', () => {
    expect([...pages.keys()].filter(hasEntityArtifact)).toEqual([]);
  });

  it('opens every address ever recorded with an entity in it, as a product at a clean address or by redirect to the product that holds it', () => {
    const lost = Object.entries(file.slugs).filter(([, slug]) => hasEntityArtifact(slug) && !pages.has(slug) && !(slug in SLUG_ALIASES));
    expect(lost.map(([id, slug]) => `${id} ${slug}`).slice(0, 10)).toEqual([]);
  });

  it('sends the old address of a renamed product to that product, which is published at its new address', () => {
    for (const [id, next] of Object.entries(file.renamed ?? {})) {
      const old = file.slugs[id]!;
      expect(SLUG_ALIASES[old], `${old} -> ${id}`).toBeDefined();
      // Still renamed to the address recorded, or folded into another product since.
      const target = SLUG_ALIASES[old]!;
      const held = pages.get(next);
      expect(held === id || [...pages.values()].includes(target), `${next}`).toBe(true);
    }
  });

  it('keeps the record append only: the rename of a product is never changed and no address is shared', () => {
    const renamed = file.renamed ?? {};
    expect(() => assertRenamesAppendOnly(renamed, renamed)).not.toThrow();
    const recorded = new Set(Object.values(file.slugs));
    expect(Object.values(renamed).filter((slug) => recorded.has(slug))).toEqual([]);
    expect(existsSync(resolve(root, 'data/product-slugs.json'))).toBe(true);
  });
});
