/**
 * Which shown products have no photo, and why, by reason and by shop.
 *
 *   npm run photos:coverage
 *
 * Read only: it reads the built catalogue (demo/catalogue.generated.ts) and
 * the stored listings (data/catalogue/*.json) and prints a report. It writes
 * nothing and fetches nothing. The reasons are in scripts/photoCoverage.ts.
 *
 * A stored listing is found again from a shown offer by shop, address and
 * price, because one shop address can carry several variants.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { RETAILERS } from '../src/config/retailers.js';
import { offerPhotoState, productNoPhotoReason, type OfferPhotoState } from './photoCoverage.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mayShow = new Set(RETAILERS.filter((r) => r.affiliate.imageBasis != null).map((r) => r.id));
const names = new Map(RETAILERS.map((r) => [r.id, r.name]));

const stored = new Map<string, (string | null)[]>();
for (const f of readdirSync(resolve(root, 'data/catalogue'))) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(readFileSync(resolve(root, 'data/catalogue', f), 'utf8'));
  for (const l of Array.isArray(d) ? d : d.listings) {
    const k = `${l.retailerId}|${l.url}|${l.priceGbp}`;
    stored.set(k, [...(stored.get(k) ?? []), l.imageUrl ?? null]);
  }
}

interface ShopRow {
  offers: number;
  withPhoto: number;
  noPhoto: Record<string, number>;
  soleSellerNoPhoto: number;
}
const shops = new Map<string, ShopRow>();
const byReason: Record<string, number> = {};
let withPhoto = 0;

for (const p of CATALOGUE) {
  const offers = CRAWLED[p.id] ?? [];
  const states: OfferPhotoState[] = offers.map((o) => {
    const urls = stored.get(`${o.retailerId}|${o.url}|${o.price}`) ?? [null];
    // A shared address: the best any of its variants offers.
    const each = urls.map((u) => offerPhotoState(u, mayShow.has(o.retailerId)));
    return each.includes('has-photo') ? 'has-photo' : each.includes('shop-not-allowed') ? 'shop-not-allowed' : each[0]!;
  });
  const shown = p.image != null;
  if (shown) withPhoto++;
  const reason = shown ? null : productNoPhotoReason(states);
  if (reason) byReason[reason] = (byReason[reason] ?? 0) + 1;
  offers.forEach((o, i) => {
    const row = shops.get(o.retailerId) ?? { offers: 0, withPhoto: 0, noPhoto: {}, soleSellerNoPhoto: 0 };
    row.offers++;
    if (shown) row.withPhoto++;
    else {
      row.noPhoto[states[i]!] = (row.noPhoto[states[i]!] ?? 0) + 1;
      if (offers.length === 1) row.soleSellerNoPhoto++;
    }
    shops.set(o.retailerId, row);
  });
}

console.log(`${CATALOGUE.length} products shown, ${withPhoto} with a photo, ${CATALOGUE.length - withPhoto} without.`);
console.log('Without a photo, by reason:', JSON.stringify(byReason));
console.log('\nshop | offers | products with a photo | products without (offer state) | sole seller, no photo');
for (const [id, r] of [...shops].sort((a, b) => b[1].offers - a[1].offers)) {
  console.log(`${names.get(id) ?? id} | ${r.offers} | ${r.withPhoto} | ${JSON.stringify(r.noPhoto)} | ${r.soleSellerNoPhoto}`);
}
