/**
 * What the Fragrance Type facet is actually offering, and on what evidence.
 *
 * The facet is derived, not curated: `concentration` in
 * src/catalogue/productName.ts reads a phrase out of each shop's own title,
 * so the list of values on screen is whatever the shops happened to write.
 * That is how it accumulated a "Cologne" beside an "Eau de Cologne", a
 * "Perfume" that says nothing about strength, and an "Oud" that is a
 * material. Every decision recorded in that file's CONCENTRATION_DISPLAY
 * comment came out of a run of this script, and it is what to re-run before
 * changing any of them.
 *
 *   npx tsx scripts/concentration-report.ts
 *
 * It reports the published values with their counts, then the two things a
 * count alone hides: which shops each value comes from, and which titles are
 * behind it. A value coming from one shop is that shop's house style; a value
 * coming from twelve is the market's.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = Number(process.env['SAMPLES'] ?? 4);

const counts = new Map<string, number>();
const shops = new Map<string, Map<string, number>>();
const samples = new Map<string, string[]>();
for (const entry of CATALOGUE) {
  const value = entry.concentration;
  counts.set(value, (counts.get(value) ?? 0) + 1);
  const perShop = shops.get(value) ?? new Map<string, number>();
  for (const offer of CRAWLED[entry.id] ?? []) {
    perShop.set(offer.retailerId, (perShop.get(offer.retailerId) ?? 0) + 1);
  }
  shops.set(value, perShop);
  const seen = samples.get(value) ?? [];
  if (seen.length < SAMPLES) seen.push(`${entry.brand} ${entry.name} ${entry.sizeMl}ml`);
  samples.set(value, seen);
}

console.log(`Published values, ${CATALOGUE.length.toLocaleString('en-GB')} products\n`);
for (const [value, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  const top = [...(shops.get(value) ?? new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, c]) => `${id} ${c}`)
    .join(', ');
  console.log(`${String(n).padStart(6)}  ${value}`);
  console.log(`        shops: ${top || 'none'}`);
  for (const s of samples.get(value) ?? []) console.log(`        ${s}`);
}

/**
 * The same question asked of the raw harvest rather than the published
 * catalogue, for the phrases the derivation has to decide between. A phrase
 * that never appears is not a gap in the rules; a phrase that appears often
 * and produces no value on screen is.
 */
interface StoredFile {
  listings?: { rawTitle?: string; retailerId?: string; status?: string }[];
}
const raw: { retailerId: string; rawTitle: string }[] = [];
const dir = resolve(root, 'data/catalogue');
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const parsed = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as StoredFile;
  for (const l of parsed.listings ?? []) {
    if (l.status === 'delisted' || !l.rawTitle) continue;
    raw.push({ retailerId: l.retailerId ?? file.replace(/\.json$/, ''), rawTitle: l.rawTitle });
  }
}

const PHRASES: [string, RegExp][] = [
  ['an explicit perfume oil', /\b(concentrated perfume oil|perfume oil|perfumed oil|fragrance oil)\b/i],
  ['a bare "oil", any kind', /\boil\b/i],
  ['attar', /\battar\b/i],
  ['bare cologne, no eau de X', /(?=.*\bcologne\b)(?!.*\beau de (parfum|toilette|cologne)\b)/i],
  ['eau fraiche AND an eau de X', /(?=.*\beau fraiche\b)(?=.*\beau de (parfum|toilette)\b)/i],
];
console.log(`\nRaw harvest, ${raw.length.toLocaleString('en-GB')} undelisted listings\n`);
for (const [label, re] of PHRASES) {
  const hits = raw.filter((l) => re.test(l.rawTitle));
  const perShop = new Map<string, number>();
  for (const h of hits) perShop.set(h.retailerId, (perShop.get(h.retailerId) ?? 0) + 1);
  console.log(`${String(hits.length).padStart(6)}  ${label}`);
  console.log(
    `        shops: ${[...perShop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, c]) => `${id} ${c}`).join(', ') || 'none'}`,
  );
  for (const h of hits.slice(0, SAMPLES)) console.log(`        ${h.rawTitle}`);
}
