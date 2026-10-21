/**
 * The UK catalogue as the weekly health summary reads it (scripts/weekly-health.ts):
 * every product with a shop listing it now, in the site's most stocked order, with
 * the shops that list it, whether it has a photo, and whether its Fragrantica link
 * is its own page. Kept apart from weekly-health.ts, which stays pure and light for
 * its tests: this needs the built catalogue module (scripts/ensure-catalogue-built.ts,
 * the step before it in .github/workflows/weekly-health.yml).
 */
import type { ProductLite } from './weekly-health.js';

export async function readCatalogueProducts(): Promise<ProductLite[]> {
  const { BY_POPULARITY, shopIdsOf } = await import('../demo/data.js');
  const { fragranceLinksFor } = await import('../demo/fragranceLinks.js');
  const out: ProductLite[] = [];
  for (const f of BY_POPULARITY) {
    const shops = shopIdsOf(f.id);
    if (shops.length === 0) continue;
    out.push({
      brand: f.brand,
      name: f.name,
      shops,
      hasPhoto: Boolean(f.photoUrl),
      fragranticaDirect: fragranceLinksFor(f.brand, f.name, f.concentration).fragranticaDirect,
    });
  }
  return out;
}
