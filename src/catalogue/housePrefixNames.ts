/**
 * The same fragrance listed twice because one shop writes the house, or its
 * initials, in front of the name: "CK Obsession" and "Obsession", "Jpg
 * Classique" and "Classique", "Parfums Atomic Rose" and "Atomic Rose" (Initio),
 * "Eau de Soleil Blanc" and "Soleil Blanc" (owner report 2026-10-14, 104 pairs).
 *
 * A pair is joined only when all of these hold:
 *   - same house, strength and size;
 *   - the longer name is the shorter one with words in front, and every one of
 *     those words is part of the house's name, its initials ("jpg", "sjp",
 *     "cdg", "ck"), or filler ("eau", "de", "le", "la", "the", "l", "d");
 *   - the two do not carry different barcodes (a pair with different barcodes is
 *     two products, the rule findAudienceDuplicates follows too), unless no shop
 *     sells both (the house's old and new code for one pack);
 *   - the longer name is not the bare house name (a fragrance called after its
 *     house, "Salvador Dali", stays);
 *   - the pair is not in KEEP_APART_PREFIX (different fragrances that look alike).
 * The product shows the shorter name. Nothing else about either is changed.
 */
import { brandKey } from './brandName.js';
import { barcodeEditionsNeverMeet, isBarcode, normalizedEan, type MatchableProduct, type MergeGroup } from './productMatch.js';

/** brandKey of the house + '|' + folded shorter name: different fragrances, never joined. */
export const KEEP_APART_PREFIX: ReadonlySet<string> = new Set([
  'dior|sauvage', // Eau Sauvage is the 1966 fragrance, Sauvage the 2015 one
  'tommyhilfiger|girl', // Tommy Girl
  'tommyhilfiger|girlnow',
]);

const FILLER = new Set(['eau', 'de', 'le', 'la', 'the', 'l', 'd', 'du', 'des']);

const words = (s: string): string[] =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

function allowedPrefix(prefix: string[], brand: string): boolean {
  const bt = words(brand);
  const initials = bt.map((w) => w[0]).join('');
  const joined = bt.join('');
  return prefix.length > 0 && prefix.every((w) => FILLER.has(w) || bt.includes(w) || w === initials || w === joined || (w === 'parfums' && bt.includes('parfums')));
}

export function findHousePrefixDuplicates<T extends MatchableProduct>(
  products: readonly T[],
  options: { shopsOf?: (product: T) => Iterable<string> } = {},
): MergeGroup<T>[] {
  const byBucket = new Map<string, T[]>();
  for (const p of products) {
    if (p.sizeMl === null) continue;
    const key = `${brandKey(p.brand)}|${p.concentration}|${p.sizeMl}`;
    const list = byBucket.get(key);
    if (list) list.push(p);
    else byBucket.set(key, [p]);
  }
  const code = (p: T): string | null => (isBarcode(p.ean) ? normalizedEan(p.ean) : null);
  const groups = new Map<T, T[]>();
  const taken = new Set<T>();
  for (const bucket of byBucket.values()) {
    if (bucket.length < 2) continue;
    for (const short of bucket) {
      if (taken.has(short)) continue;
      const sw = words(short.name);
      if (sw.length === 0) continue;
      const apartKey = `${brandKey(short.brand)}|${sw.join('')}`;
      if (KEEP_APART_PREFIX.has(apartKey)) continue;
      for (const long of bucket) {
        if (long === short || taken.has(long) || groups.has(long)) continue;
        const lw = words(long.name);
        if (lw.length <= sw.length || lw.slice(lw.length - sw.length).join(' ') !== sw.join(' ')) continue;
        if (!allowedPrefix(lw.slice(0, lw.length - sw.length), short.brand)) continue;
        if (lw.join('') === words(long.brand).join('')) continue;
        const cl = code(long);
        const cs = code(short);
        if (cl !== null && cs !== null && cl !== cs && !(options.shopsOf && barcodeEditionsNeverMeet([long, short], options.shopsOf))) continue;
        const list = groups.get(short) ?? [];
        list.push(long);
        groups.set(short, list);
        taken.add(long);
      }
    }
  }
  const out: MergeGroup<T>[] = [];
  for (const [short, longs] of groups) {
    if (taken.has(short)) continue;
    const members = [short, ...longs];
    // The barcode-bearing record survives; the name shown is the shorter one.
    const canonical = members.find((m) => code(m) !== null) ?? short;
    out.push({ canonical, absorbed: members.filter((m) => m !== canonical), name: short.name });
  }
  return out;
}
