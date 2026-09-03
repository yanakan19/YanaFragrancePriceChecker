/**
 * Find near-miss product pairs the catalogue merge did not catch, and report
 * them for a human to look at.
 *
 *   npm run match:report
 *   npm run match:report -- --min-jaccard=0.4
 *   npm run match:report -- --limit=30
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * findDuplicateGroups (src/catalogue/productMatch.ts) merges two listings
 * into one product only when they agree on brand, size, concentration AND
 * the exact word-set of the name. That is deliberately strict — see that
 * file's own header for why a false merge is worse than a missed one — which
 * means genuine duplicates slip through whenever two shops write the same
 * bottle's name even slightly differently: an abbreviation, a dropped or
 * added word, a "For Men" one shop includes and another drops.
 *
 * This script looks for exactly that shape of miss: products that already
 * agree on brand + size + concentration (the merge key, minus the name) but
 * disagree on the name's word-set, so the real matcher left them apart. It
 * reports the candidate pairs, ranked so the ones that look most like the
 * same bottle sit at the top.
 *
 * ── What this deliberately does not do ───────────────────────────────────
 * It does not merge anything. It does not touch the catalogue, the registry,
 * or any file under data/. It never writes anything at all — only stdout.
 * findDuplicateGroups is the one place merges actually happen, and it stays
 * that way; this is evidence for a human, not a second matcher.
 */
import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogueStore } from '../src/catalogue/store.js';
import type { StoredListing } from '../src/catalogue/types.js';
import { RETAILERS } from '../src/config/retailers.js';
import { isFragrance, sizeMl, fragranceId } from '../src/catalogue/fragranceId.js';
import { brandKey, buildBrandCanon } from '../src/catalogue/brandName.js';
import { findDuplicateGroups, type MatchableProduct } from '../src/catalogue/productMatch.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// Jaccard similarity of the two name word-sets. Below this, two names read as
// genuinely different products, not a duplicate written two ways, so they are
// left out of the report entirely rather than padding it with noise.
const minJaccard = Number.parseFloat(arg('min-jaccard', '0.3'));
const limit = Number.parseInt(arg('limit', '60'), 10);

/* ── concentration, extracted the same way build-demo-catalogue.ts does ──────
   Kept as its own small copy rather than imported: the production copy lives
   inside that script's own module scope, not exported, and this tool has no
   business reaching into a build script's internals for a value it only
   needs for grouping, not for anything that reaches a reader. */
const CONCENTRATION_SPECIFIC = /\b(eau de parfum|eau de toilette|eau de cologne|eau fraiche)\b/i;
const CONCENTRATION_GENERIC = /\b(parfum|perfume|edp|edt|edc|aftershave|cologne|extrait|attar|oud)\b/i;

function concentration(title: string): string {
  const raw = title.match(CONCENTRATION_SPECIFIC)?.[0] ?? title.match(CONCENTRATION_GENERIC)?.[0] ?? null;
  return raw ? raw.toLowerCase().trim() : 'fragrance';
}

/**
 * The same word normalisation matchKey (productMatch.ts) uses. Despite the
 * name matchKey itself uses ("word *set*"), the actual comparison there is a
 * sorted word *list* — repeats are kept, not collapsed, so "Boss Boss Woman"
 * and "Boss Woman" produce different keys and do not merge. Deduping here
 * with a real Set would call that pair a 100% match when production would
 * not have merged it even if the rest of the identity lined up, which is
 * exactly the kind of false confidence this report exists to avoid.
 */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort();
}

/** Multiset jaccard: each occurrence of a repeated word counts on its own. */
function jaccard(a: string[], b: string[]): number {
  const bCounts = new Map<string, number>();
  for (const w of b) bCounts.set(w, (bCounts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of a) {
    const remaining = bCounts.get(w) ?? 0;
    if (remaining > 0) {
      shared++;
      bCounts.set(w, remaining - 1);
    }
  }
  const union = a.length + b.length - shared;
  return union === 0 ? 0 : shared / union;
}

/** Words in `a` with one occurrence removed per matching occurrence in `b`. */
function multisetDiff(a: string[], b: string[]): string[] {
  const bCounts = new Map<string, number>();
  for (const w of b) bCounts.set(w, (bCounts.get(w) ?? 0) + 1);
  const out: string[] = [];
  for (const w of a) {
    const remaining = bCounts.get(w) ?? 0;
    if (remaining > 0) bCounts.set(w, remaining - 1);
    else out.push(w);
  }
  return out;
}

interface Candidate extends MatchableProduct {
  retailerIds: string[];
  prices: number[];
  urls: string[];
}

/* ── gather listings, exactly as build-demo-catalogue.ts filters them ────── */
const dir = resolve(root, 'data/catalogue');
const products = new Map<string, Candidate>();
let liveShops = 0;
let listingsConsidered = 0;

const allBrandStrings: string[] = [];
const rawByListing = new Map<string, StoredListing>();

if (existsSync(dir)) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const store = new CatalogueStore(dir);
    const snapshot = store.read(file.replace(/\.json$/, ''));
    if (snapshot.source !== 'live') continue;

    const retailer = RETAILERS.find((r) => r.id === snapshot.retailerId);
    if (!retailer || !retailer.enabled || retailer.shipping.standardGbp === null) continue;

    const active = snapshot.listings.filter((l) => l.status === 'active');
    if (active.length > 0) liveShops++;

    for (const l of active) {
      if (l.rawBrand) allBrandStrings.push(l.rawBrand);
      if (!isFragrance(l)) continue;
      listingsConsidered++;
      rawByListing.set(fragranceId(l), l);
    }
  }
}

const brandCanon = buildBrandCanon(allBrandStrings);
function canonBrand(raw: string | null | undefined): string {
  if (!raw) return 'Unbranded';
  return brandCanon.get(raw.trim()) ?? raw.trim();
}

for (const [id, l] of rawByListing) {
  const size = sizeMl(l.rawTitle, l.description);
  if (size === null) continue;
  const existing = products.get(id);
  if (existing) {
    existing.retailerIds.push(l.retailerId);
    existing.prices.push(l.priceGbp!);
    existing.urls.push(l.url);
    continue;
  }
  products.set(id, {
    id,
    brand: canonBrand(l.rawBrand),
    name: l.rawTitle,
    concentration: concentration(l.rawTitle),
    sizeMl: size,
    ean: l.ean,
    retailerIds: [l.retailerId],
    prices: [l.priceGbp!],
    urls: [l.url],
  });
}

/* ── apply the real merge first, so the report only ever shows what the
   production matcher actually left apart, not raw per-listing duplicates
   that findDuplicateGroups would already have folded together. */
const allProducts = [...products.values()];
const groups = findDuplicateGroups(allProducts);
const absorbedIds = new Set(groups.flatMap((g) => g.absorbed.map((p) => p.id)));
const merged = allProducts.filter((p) => !absorbedIds.has(p.id));

console.log('\nNear-miss product match report');
console.log(`shops                ${liveShops} live`);
console.log(`listings considered  ${listingsConsidered}`);
console.log(`products after the real merge   ${merged.length} (${groups.length} groups folded, ${absorbedIds.size} listings absorbed)`);
console.log(`min word-set overlap ${minJaccard} jaccard\n`);

/* ── group the survivors by everything the merge key checks except the
   name, then look inside each group for pairs the name check split apart. */
const byIdentity = new Map<string, Candidate[]>();
for (const p of merged) {
  const key = [brandKey(p.brand), p.sizeMl, p.concentration].join('|');
  const bucket = byIdentity.get(key);
  if (bucket) bucket.push(p);
  else byIdentity.set(key, [p]);
}

interface Pair {
  a: Candidate;
  b: Candidate;
  score: number;
  onlyA: string[];
  onlyB: string[];
  shared: string[];
}

const pairs: Pair[] = [];
for (const bucket of byIdentity.values()) {
  if (bucket.length < 2) continue;
  for (let i = 0; i < bucket.length; i++) {
    for (let j = i + 1; j < bucket.length; j++) {
      const a = bucket[i]!;
      const b = bucket[j]!;
      // Both carrying a barcode and disagreeing about it is the same signal
      // findDuplicateGroups itself defers to: the manufacturer's word beats
      // a name-text guess, so these are left out of the report entirely.
      if (a.ean && b.ean && a.ean !== b.ean) continue;

      const wordsA = nameWords(a.name);
      const wordsB = nameWords(b.name);
      const score = jaccard(wordsA, wordsB);
      // score 1 here means matchKey's own word list is identical, i.e. this
      // pair would already have been merged — nothing left to report.
      if (score < minJaccard || score >= 1) continue;

      const onlyA = multisetDiff(wordsA, wordsB);
      // Words in A, minus the ones onlyA already claimed as A-exclusive —
      // whatever is left is what A and B have in common.
      const onlyACounts = new Map<string, number>();
      for (const w of onlyA) onlyACounts.set(w, (onlyACounts.get(w) ?? 0) + 1);
      const shared: string[] = [];
      for (const w of wordsA) {
        const remaining = onlyACounts.get(w) ?? 0;
        if (remaining > 0) onlyACounts.set(w, remaining - 1);
        else shared.push(w);
      }

      pairs.push({
        a,
        b,
        score,
        onlyA,
        onlyB: multisetDiff(wordsB, wordsA),
        shared,
      });
    }
  }
}

// Most likely true duplicates first: higher word overlap, then fewer total
// differing words, so a one-word difference always outranks a two-word one
// at the same overlap score.
pairs.sort((x, y) => {
  if (y.score !== x.score) return y.score - x.score;
  const diffX = x.onlyA.length + x.onlyB.length;
  const diffY = y.onlyA.length + y.onlyB.length;
  return diffX - diffY;
});

function fmtPrice(prices: number[]): string {
  return prices.map((p) => `£${p.toFixed(2)}`).join(', ');
}

function fmtProduct(label: string, p: Candidate): string {
  return (
    `  ${label} "${p.name}"\n` +
    `      retailer(s)  ${p.retailerIds.join(', ')}\n` +
    `      price(s)     ${fmtPrice(p.prices)}\n` +
    `      ean          ${p.ean ?? '(none)'}\n` +
    `      url          ${p.urls[0]}`
  );
}

if (pairs.length === 0) {
  console.log('No near-miss pairs found at this threshold.\n');
  console.log('Nothing was merged, changed, or written. This is a report only.\n');
  process.exit(0);
}

console.log(`${pairs.length} candidate pair(s) found, showing top ${Math.min(limit, pairs.length)}:\n`);

for (const pair of pairs.slice(0, limit)) {
  console.log(`── ${pair.a.brand} · ${pair.a.sizeMl}ml · ${pair.a.concentration} · overlap ${(pair.score * 100).toFixed(0)}%`);
  console.log(fmtProduct('A', pair.a));
  console.log(fmtProduct('B', pair.b));
  console.log(`      shared words   ${pair.shared.join(' ') || '(none)'}`);
  console.log(`      only in A      ${pair.onlyA.join(' ') || '(none)'}`);
  console.log(`      only in B      ${pair.onlyB.join(' ') || '(none)'}`);
  console.log('');
}

if (pairs.length > limit) {
  console.log(`… ${pairs.length - limit} more below the shown limit (raise --limit to see them).\n`);
}

console.log('Nothing was merged, changed, or written. Read the pairs above and decide by hand —');
console.log('a real duplicate is folded in by fixing the two listings\' names or EANs at source,');
console.log('never by editing the catalogue directly.\n');
