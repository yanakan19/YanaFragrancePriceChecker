/**
 * What rubbish is sitting inside product *names* in the live catalogue, and
 * how much duplication it causes.
 *
 *   npx tsx scripts/name-noise-report.ts
 *
 * Three separate kinds, counted separately because they have three separate
 * causes and three separate fixes (see displayName in
 * src/catalogue/productName.ts):
 *
 *   1. a trailing pipe-delimited segment — scent families, "| UK", years;
 *   2. the product's own brand sitting mid-name, before a separator;
 *   3. free marketing copy.
 *
 * The number that actually matters is the last section: pairs of products
 * sharing brand + size + concentration where one name's word set is a strict
 * superset of the other's. That is one bottle showing as two rows, which is
 * the precise failure a price comparison exists to prevent.
 */
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { brandKey } from '../src/catalogue/brandName.js';

const names = CATALOGUE.map((p) => ({ id: p.id, brand: p.brand, name: p.name, size: p.sizeMl, conc: p.concentration }));

const piped = names.filter((p) => p.name.includes('|'));
console.log(`products: ${names.length}`);
console.log(`names containing "|": ${piped.length}`);

const tails = new Map<string, number>();
for (const p of piped) {
  const tail = p.name.slice(p.name.lastIndexOf('|') + 1).trim();
  tails.set(tail, (tails.get(tail) ?? 0) + 1);
}
console.log('\n-- distinct trailing segments after the last "|" --');
for (const [tail, n] of [...tails].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${JSON.stringify(tail)}`);
}

// Brand mid-name: brand appears as a run of tokens that is neither a leading
// nor a trailing run of the name.
const midBrand: typeof names = [];
for (const p of names) {
  const want = brandKey(p.brand);
  if (!want) continue;
  const toks = [...p.name.matchAll(/[A-Za-z0-9]+/g)];
  for (let i = 0; i < toks.length; i++) {
    let acc = '';
    for (let j = i; j < toks.length; j++) {
      acc += brandKey(toks[j]![0]);
      if (acc.length > want.length) break;
      if (acc !== want) continue;
      const startsAt = toks[i]!.index!;
      const endsAt = toks[j]!.index! + toks[j]![0].length;
      const leading = /^\s*$/.test(p.name.slice(0, startsAt));
      const trailing = /^\s*$/.test(p.name.slice(endsAt));
      if (!leading && !trailing) midBrand.push(p);
      break;
    }
    if (midBrand[midBrand.length - 1]?.id === p.id) break;
  }
}
console.log(`\nnames with own brand mid-name: ${midBrand.length}`);
for (const p of midBrand.slice(0, 60)) console.log(`  ${p.brand} :: ${p.name}`);

// Duplicate rows: same brand+size+concentration, one word set a strict
// superset of the other.
const wordsOf = (s: string) =>
  new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
const groups = new Map<string, typeof names>();
for (const p of names) {
  const k = `${brandKey(p.brand)}|${p.size}|${p.conc}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
}
let dupes = 0;
const examples: string[] = [];
for (const g of groups.values()) {
  for (let i = 0; i < g.length; i++) {
    for (let j = 0; j < g.length; j++) {
      if (i === j) continue;
      const a = wordsOf(g[i]!.name);
      const b = wordsOf(g[j]!.name);
      if (a.size >= b.size) continue;
      let subset = true;
      for (const w of a) if (!b.has(w)) { subset = false; break; }
      if (!subset) continue;
      dupes++;
      if (examples.length < 40) examples.push(`${g[i]!.brand}: ${JSON.stringify(g[i]!.name)}  <  ${JSON.stringify(g[j]!.name)}`);
    }
  }
}
console.log(`\nduplicate rows (strict word-set superset within brand+size+concentration): ${dupes}`);
for (const e of examples) console.log(`  ${e}`);

// The honest subset of the above: pairs where EVERY extra word the longer
// name carries comes from the noise this fix targets — the pipe tail, or the
// product's own brand. "Club De Nuit" vs "Club De Nuit Intense" is a real
// flanker pair and is deliberately not counted; "Abraaj Brackish" vs "Abraaj
// Brackish French Avenue | Aromatic Woody" is.
let noiseDupes = 0;
const noiseExamples: string[] = [];
for (const g of groups.values()) {
  for (let i = 0; i < g.length; i++) {
    for (let j = 0; j < g.length; j++) {
      if (i === j) continue;
      const a = wordsOf(g[i]!.name);
      const b = wordsOf(g[j]!.name);
      if (a.size >= b.size) continue;
      let subset = true;
      for (const w of a) if (!b.has(w)) { subset = false; break; }
      if (!subset) continue;
      const brandWords = new Set((brandKey(g[j]!.brand).match(/[a-z0-9]+/g) ?? []));
      const brandToks = new Set(g[j]!.brand.toLowerCase().match(/[a-z0-9]+/g) ?? []);
      const pipeIdx = g[j]!.name.indexOf('|');
      const tailWords = pipeIdx < 0 ? new Set<string>() : wordsOf(g[j]!.name.slice(pipeIdx));
      let allNoise = true;
      for (const w of b) {
        if (a.has(w)) continue;
        if (brandToks.has(w) || brandWords.has(w) || tailWords.has(w)) continue;
        allNoise = false;
        break;
      }
      if (!allNoise) continue;
      noiseDupes++;
      if (noiseExamples.length < 60) noiseExamples.push(`${g[j]!.brand}: ${JSON.stringify(g[i]!.name)}  <  ${JSON.stringify(g[j]!.name)}`);
    }
  }
}
console.log(`\nduplicate rows explained ENTIRELY by pipe-tail and/or own-brand noise: ${noiseDupes}`);
for (const e of noiseExamples) console.log(`  ${e}`);

// The narrow shape the mid-name brand fix targets: brand run immediately
// followed by a separator.
let brandBeforeSep = 0;
const bbs: string[] = [];
for (const p of names) {
  const want = brandKey(p.brand);
  if (!want) continue;
  const toks = [...p.name.matchAll(/[A-Za-z0-9]+/g)];
  for (let i = 0; i < toks.length; i++) {
    let acc = '';
    for (let j = i; j < toks.length; j++) {
      acc += brandKey(toks[j]![0]);
      if (acc.length > want.length) break;
      if (acc !== want) continue;
      const endsAt = toks[j]!.index! + toks[j]![0].length;
      if (i > 0 && /^\s*\|/.test(p.name.slice(endsAt))) {
        brandBeforeSep++;
        bbs.push(`${p.brand} :: ${p.name}`);
      }
      break;
    }
  }
}
console.log(`\nnames with own brand immediately before a "|": ${brandBeforeSep}`);
for (const e of bbs) console.log(`  ${e}`);
