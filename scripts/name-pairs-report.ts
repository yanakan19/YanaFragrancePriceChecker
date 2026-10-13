/**
 * Lists the name pairs the same-fragrance pass could not settle: a house's plain
 * name beside the same name labelled "for Men", "Pour Femme", "Women" and so on,
 * at one size and strength, that are still two products (docs/NAME-PAIRS-REVIEW-2026-10-13.md).
 *
 *   npx tsx scripts/name-pairs-report.ts          counts, and the families by brand
 *   npx tsx scripts/name-pairs-report.ts --json   the families as JSON on stdout
 *
 * Reads the catalogue module the build wrote (npm run demo first); writes nothing.
 */
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { audienceFamilyKey, audienceFreeKey, audiencesOf, readAudienceName } from '../src/catalogue/audienceNames.js';
import { brandKey } from '../src/catalogue/brandName.js';

interface Member {
  id: string;
  name: string;
  size: number | null;
  concentration: string;
  ean: string | null;
  audiences: string[];
  shops: string[];
  cluster: string;
}

const families = new Map<string, Member[]>();
for (const c of CATALOGUE) {
  if (c.giftSet) continue;
  const family = audienceFamilyKey(c as never);
  const cluster = audienceFreeKey(c as never);
  if (family === null || cluster === null) continue;
  const key = `${brandKey(c.brand)}|${family}`;
  const member: Member = {
    id: c.id,
    name: c.name,
    size: c.sizeMl ?? null,
    concentration: c.concentration,
    ean: c.ean ?? null,
    audiences: audiencesOf(readAudienceName(c.name)),
    shops: [...new Set((CRAWLED[c.id] ?? []).map((o) => o.retailerId))],
    cluster,
  };
  families.set(key, [...(families.get(key) ?? []), member]);
}

interface Pair {
  brand: string;
  plain: Member[];
  labelled: Member[];
  differentBarcodes: boolean;
}
const open: Pair[] = [];
let pairs = 0;
let barcodePairs = 0;
for (const [key, list] of [...families].sort(([a], [b]) => a.localeCompare(b))) {
  const byCluster = new Map<string, Member[]>();
  for (const m of list) byCluster.set(m.cluster, [...(byCluster.get(m.cluster) ?? []), m]);
  for (const group of byCluster.values()) {
    const plain = group.filter((m) => m.audiences.length === 0);
    const labelled = group.filter((m) => m.audiences.length > 0);
    if (plain.length === 0 || labelled.length === 0) continue;
    pairs++;
    const codes = new Set(group.map((m) => m.ean).filter((e): e is string => e !== null));
    const differentBarcodes = codes.size > 1;
    if (differentBarcodes) barcodePairs++;
    open.push({ brand: key.split('|')[0]!, plain, labelled, differentBarcodes });
  }
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(open, null, 1));
} else {
  const brands = new Map<string, number>();
  for (const p of open) brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
  console.log(`${pairs} plain-against-labelled pairs still two products (${barcodePairs} with different barcodes), ${brands.size} brands`);
  for (const [brand, n] of [...brands].sort(([a], [b]) => a.localeCompare(b))) console.log(`  ${brand}: ${n}`);
}
