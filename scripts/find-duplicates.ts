/**
 * Find the same perfume listed as two or more product pages.
 *
 * Reads the built catalogue (demo/catalogue.generated.ts, from
 * `npm run catalogue:demo`), so it needs no crawling and no network. Groups
 * products by an independent normalised key (src/catalogue/duplicateKey.ts:
 * brand alias, name core, size in ml, strength) and lists every group that
 * still has more than one product id, ranked by how many shops are split.
 *
 *   npm run duplicates                 top 40 groups, then the summary
 *   npm run duplicates -- --top 100
 *   npm run duplicates -- --all        every group
 *   npm run duplicates -- --json out.json   also write the groups as JSON
 *   npm run duplicates -- --strength   also list groups that differ only in
 *                                      strength (a review list, not duplicates)
 *   npm run duplicates -- --catalogue path/to/catalogue.generated.ts
 *                                      measure another build, such as a saved copy
 *
 * A group listed here is a candidate, not a verdict: the key is looser than the
 * matcher on purpose, and a flanker, tester, set or refill that the catalogue
 * names differently stays out of it because those words are part of the name
 * core. Read each group before merging anything.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CatalogueEntry, CrawledOffer } from '../demo/catalogue.generated.js';
import { duplicateKey, strengthBlindKey, UNKNOWN_STRENGTHS, strengthKey } from '../src/catalogue/duplicateKey.js';

interface Member {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
  ean: string | null;
  shops: string[];
}

interface Group {
  key: string;
  members: Member[];
  shops: number;
  /** Shops that sell this perfume under two or more of the ids. */
  splitShops: number;
  /** Why the build still keeps these apart, or "no barcode conflict" where nothing explains it. */
  why: string;
}

/** The leading zeros of a barcode removed, so a UPC and its padded form compare equal. */
const stripZeros = (e: string) => e.replace(/^0+(?=\d)/, '');

/**
 * What explains a group still being several products. The matcher refuses to
 * merge two real barcodes that disagree, unless no shop sells two of them and
 * they are not neighbours in the maker's numbering (src/catalogue/productMatch.ts,
 * barcodeEditionsNeverMeet). Anything left over is a gap worth reading.
 */
function whyApart(ms: Member[]): string {
  const codes = [...new Set(ms.filter((m) => m.ean).map((m) => stripZeros(m.ean!)))];
  if (codes.length < 2) return 'no barcode conflict';
  const byCode = new Map<string, Set<string>>();
  for (const m of ms) if (m.ean) byCode.set(stripZeros(m.ean), new Set([...(byCode.get(stripZeros(m.ean)) ?? []), ...m.shops]));
  const lists = [...byCode.values()];
  for (let i = 0; i < lists.length; i++) for (let j = i + 1; j < lists.length; j++) for (const s of lists[i]!) if (lists[j]!.has(s)) return 'barcodes differ and a shop sells two of them';
  const item = (c: string) => Number(c.padStart(13, '0').slice(0, 12));
  for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) if (Math.abs(item(codes[i]!) - item(codes[j]!)) <= 30) return 'barcodes differ and are neighbouring item numbers';
  return 'barcodes differ';
}

function args(): { top: number; all: boolean; json: string | null; strength: boolean; catalogue: string | null } {
  const a = process.argv.slice(2);
  const at = (flag: string) => a.indexOf(flag);
  const top = at('--top') >= 0 ? Number(a[at('--top') + 1]) : 40;
  return {
    top: Number.isFinite(top) && top > 0 ? top : 40,
    all: a.includes('--all'),
    json: at('--json') >= 0 ? (a[at('--json') + 1] ?? null) : null,
    strength: a.includes('--strength'),
    catalogue: at('--catalogue') >= 0 ? (a[at('--catalogue') + 1] ?? null) : null,
  };
}

function groupBy(members: Member[], keyOf: (m: Member) => string | null): Group[] {
  const buckets = new Map<string, Member[]>();
  for (const m of members) {
    const key = keyOf(m);
    if (key === null) continue;
    const b = buckets.get(key);
    if (b) b.push(m);
    else buckets.set(key, [m]);
  }
  const groups: Group[] = [];
  for (const [key, ms] of buckets) {
    if (ms.length < 2) continue;
    const all = new Set(ms.flatMap((m) => m.shops));
    // A shop counts as split when two of the group's ids both carry its offer.
    const seen = new Map<string, number>();
    for (const m of ms) for (const s of new Set(m.shops)) seen.set(s, (seen.get(s) ?? 0) + 1);
    groups.push({ key, members: ms, shops: all.size, splitShops: [...seen.values()].filter((n) => n > 1).length, why: whyApart(ms) });
  }
  // Most shops first: that is where a reader loses the most comparison.
  groups.sort((x, y) => y.shops - x.shops || y.members.length - x.members.length || x.key.localeCompare(y.key));
  return groups;
}

function line(m: Member): string {
  const size = m.sizeMl === null ? 'no size' : `${m.sizeMl}ml`;
  return `    ${m.id}\n      ${m.brand} | ${m.name} | ${m.concentration} | ${size} | ean ${m.ean ?? 'none'} | ${m.shops.join(', ')}`;
}

function show(label: string, groups: Group[], limit: number): void {
  console.log(`\n${label}: ${groups.length} groups`);
  for (const [i, g] of groups.slice(0, limit).entries()) {
    console.log(`\n#${i + 1}  ${g.members.length} ids, ${g.shops} shops (${g.splitShops} sell it under two ids)\n  key ${g.key}\n  why apart: ${g.why}`);
    for (const m of g.members) console.log(line(m));
  }
}

const opts = args();
const built = (await import(
  opts.catalogue ? pathToFileURL(resolve(opts.catalogue)).href : '../demo/catalogue.generated.js'
)) as { CATALOGUE: CatalogueEntry[]; CRAWLED: Record<string, CrawledOffer[]> };
const { CATALOGUE, CRAWLED } = built;
const members: Member[] = CATALOGUE.map((p) => ({
  id: p.id,
  brand: p.brand,
  name: p.name,
  concentration: p.concentration,
  sizeMl: p.sizeMl,
  ean: p.ean,
  shops: [...new Set((CRAWLED[p.id] ?? []).map((o) => o.retailerId))].sort(),
}));

const groups = groupBy(members, duplicateKey);
show('Duplicate groups (same brand, name, size and strength)', groups, opts.all ? groups.length : opts.top);

// Strength only splits: same everything but the strength, where one side is
// "Not stated" or "Disputed". Never auto merges; a person decides.
const weak = groupBy(members, strengthBlindKey).filter((g) => {
  const strengths = new Set(g.members.map((m) => strengthKey(m.concentration)));
  const stated = [...strengths].filter((s) => !UNKNOWN_STRENGTHS.has(s));
  return strengths.size > 1 && stated.length <= 1 && strengths.size > stated.length;
});

const splitIds = groups.reduce((n, g) => n + g.members.length, 0);
console.log('\nSummary');
console.log(`  products in the catalogue:        ${CATALOGUE.length}`);
console.log(`  duplicate groups:                 ${groups.length}`);
console.log(`  product ids inside those groups:  ${splitIds} (${splitIds - groups.length} too many)`);
console.log(`  groups splitting 2+ shops:        ${groups.filter((g) => g.splitShops >= 2).length}`);
console.log(`  strength only groups (review):    ${weak.length}`);
const byWhy = new Map<string, number>();
for (const g of groups) byWhy.set(g.why, (byWhy.get(g.why) ?? 0) + 1);
for (const [why, count] of [...byWhy].sort((a, b) => b[1] - a[1])) console.log(`    ${String(count).padStart(4)}  ${why}`);

if (opts.strength) show('Strength only groups (one side says Not stated or Disputed)', weak, opts.all ? weak.length : opts.top);

if (opts.json) {
  writeFileSync(opts.json, JSON.stringify({ products: CATALOGUE.length, groups, strengthOnly: weak }, null, 1));
  console.log(`\nWrote ${opts.json}`);
}
