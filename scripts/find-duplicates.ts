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
 *   npm run duplicates -- --synonyms   the strength label splits: groups with the
 *                                      same brand, name and size that differ only in
 *                                      what the shops call the strength (Extrait de
 *                                      Parfum / Parfum, Eau de Parfum / Parfum ...),
 *                                      ranked by shops, each with the evidence a
 *                                      merge needs and the reason it is kept apart
 *   npm run duplicates -- --spellings  every way the shops' titles write a strength
 *                                      and the one value each folds to (reads
 *                                      data/catalogue, not the built page)
 *   npm run duplicates -- --catalogue path/to/catalogue.generated.ts
 *                                      measure another build, such as a saved copy
 *
 * A group listed here is a candidate, not a verdict: the key is looser than the
 * matcher on purpose, and a flanker, tester, set or refill that the catalogue
 * names differently stays out of it because those words are part of the name
 * core. Read each group before merging anything.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodeSnapshot } from '../src/catalogue/store.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CatalogueEntry, CrawledOffer } from '../demo/catalogue.generated.js';
import { duplicateKey, nameCarriedKey, strengthBlindKey, strengthDifference, UNKNOWN_STRENGTHS, strengthKey } from '../src/catalogue/duplicateKey.js';
import { concentration, concentrationMatch } from '../src/catalogue/productName.js';
import { HOUSE_STRENGTH_EVIDENCE } from '../src/catalogue/houseStrengthEvidence.js';
import { brandAliasKey, nameCore } from '../src/catalogue/duplicateKey.js';

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

function args(): { top: number; all: boolean; json: string | null; strength: boolean; synonyms: boolean; spellings: boolean; catalogue: string | null } {
  const a = process.argv.slice(2);
  const at = (flag: string) => a.indexOf(flag);
  const top = at('--top') >= 0 ? Number(a[at('--top') + 1]) : 40;
  return {
    top: Number.isFinite(top) && top > 0 ? top : 40,
    all: a.includes('--all'),
    json: at('--json') >= 0 ? (a[at('--json') + 1] ?? null) : null,
    strength: a.includes('--strength'),
    synonyms: a.includes('--synonyms'),
    spellings: a.includes('--spellings'),
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
    const split = g as Partial<StrengthSplit>;
    console.log(`\n#${i + 1}  ${g.members.length} ids, ${g.shops} shops (${g.splitShops} sell it under two ids)\n  key ${g.key}\n  why apart: ${g.why}`);
    if (split.verdict) console.log(`  strengths: ${split.pair}${split.kind === 'name' ? ' (the name carries a strength word)' : ''}\n  verdict: ${split.verdict}`);
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

/**
 * A group that matches on brand, name and size and differs in the strength
 * label, with what decides whether it is one bottle.
 *
 * "label" groups share the name core outright. "name" groups differ only by a
 * strength word the name carries ("Atlantis Extrait" beside "Atlantis"), which
 * the strength blind key above already folds for the word Extrait; the wider key
 * here also takes Parfum, Pure and Cologne out, so it is a review list only.
 */
interface StrengthSplit extends Group {
  kind: 'label' | 'name';
  /** The stated strengths, weakest first. */
  pair: string;
  /** Extrait de Parfum against Parfum: the pair shops and houses write both ways. */
  synonymCandidate: boolean;
  /** Shops that sell two of the strengths in this group. */
  shopsSellingBoth: string[];
  verdict: string;
}

function strengthSplit(g: Group, kind: 'label' | 'name'): StrengthSplit | null {
  const stated = g.members.filter((m) => !UNKNOWN_STRENGTHS.has(strengthKey(m.concentration)));
  const diff = strengthDifference(stated.map((m) => m.concentration));
  if (new Set(stated.map((m) => strengthKey(m.concentration))).size < 2) return null;
  // A shop that lists two of the strengths of one bottle is a shop saying they differ.
  const byShop = new Map<string, Set<string>>();
  for (const m of stated) for (const s of m.shops) byShop.set(s, new Set([...(byShop.get(s) ?? []), strengthKey(m.concentration)]));
  const shopsSellingBoth = [...byShop].filter(([, set]) => set.size > 1).map(([s]) => s).sort();
  // Every strength carrying a real barcode of its own, and the codes all different.
  const codes = new Map<string, Set<string>>();
  for (const m of stated) if (m.ean) codes.set(strengthKey(m.concentration), new Set([...(codes.get(strengthKey(m.concentration)) ?? []), stripZeros(m.ean)]));
  const everyStrengthHasItsOwnCode =
    codes.size === new Set(stated.map((m) => strengthKey(m.concentration))).size && new Set([...codes.values()].flatMap((c) => [...c])).size >= codes.size;
  const house = HOUSE_STRENGTH_EVIDENCE.some((e) => brandAliasKey(e.brand) === brandAliasKey(g.members[0]!.brand) && e.sizesMl.includes(g.members[0]!.sizeMl ?? -1));
  let verdict: string;
  if (shopsSellingBoth.length > 0) verdict = `keep apart: ${shopsSellingBoth.join(', ')} sell${shopsSellingBoth.length === 1 ? 's' : ''} both strengths`;
  else if (everyStrengthHasItsOwnCode) verdict = 'keep apart: each strength has its own barcode';
  else if (house) verdict = 'a house page is recorded for this brand and size (houseStrengthEvidence.ts); check the name';
  else if (diff.synonymCandidate) verdict = 'synonym candidate: needs the house page';
  else verdict = 'two tiers: needs a source before any merge';
  return { ...g, kind, pair: diff.pair, synonymCandidate: diff.synonymCandidate, shopsSellingBoth, verdict };
}

const strengthSplits: StrengthSplit[] = [];
if (opts.synonyms) {
  const seen = new Set<string>();
  for (const g of groupBy(members, strengthBlindKey)) {
    const s = strengthSplit(g, 'label');
    if (!s) continue;
    strengthSplits.push(s);
    for (const m of g.members) seen.add(m.id);
  }
  // Name carried: a different name core, folded only by the wider key.
  for (const g of groupBy(members, nameCarriedKey)) {
    if (new Set(g.members.map((m) => nameCore(m.name, m.brand, null))).size < 2) continue;
    if (g.members.every((m) => seen.has(m.id))) continue;
    const s = strengthSplit(g, 'name');
    if (s) strengthSplits.push(s);
  }
  strengthSplits.sort((x, y) => y.shops - x.shops || y.members.length - x.members.length || x.key.localeCompare(y.key));

  const label = strengthSplits.filter((s) => s.kind === 'label');
  console.log(`\nStrength label splits: ${label.length} groups with one name, one size and different strengths; ${strengthSplits.length - label.length} more where the name carries a strength word`);
  const byPair = new Map<string, { groups: number; shops: number; open: number }>();
  for (const s of strengthSplits) {
    const row = byPair.get(s.pair) ?? { groups: 0, shops: 0, open: 0 };
    row.groups++;
    row.shops += s.shops;
    if (!s.verdict.startsWith('keep apart')) row.open++;
    byPair.set(s.pair, row);
  }
  console.log('\n  strengths                                   groups  not yet kept apart by a shop or a barcode');
  for (const [pair, row] of [...byPair].sort((a, b) => b[1].groups - a[1].groups)) console.log(`  ${pair.padEnd(42)} ${String(row.groups).padStart(7)}  ${String(row.open).padStart(5)}`);
  const synonyms = strengthSplits.filter((s) => s.synonymCandidate);
  console.log(`\n  Extrait de Parfum / Parfum, the synonym candidates: ${synonyms.length} groups, ${new Set(synonyms.flatMap((s) => s.members.map((m) => m.brand))).size} brands`);
  const open = strengthSplits.filter((s) => !s.verdict.startsWith('keep apart'));
  show('Strength splits no shop and no barcode explains, most shops first (a review list)', open, opts.all ? open.length : opts.top);
  if (opts.all || opts.top >= 1) {
    console.log('\nVerdict per group shown above is the catalogue alone: it never merges anything.');
    const apart = strengthSplits.filter((s) => s.verdict.startsWith('keep apart'));
    console.log(`  kept apart by the catalogue itself: ${apart.length} groups (${apart.filter((s) => s.shopsSellingBoth.length > 0).length} where a shop sells both strengths)`);
  }
}

if (opts.spellings) {
  // Every phrase a strength is written with in the shops' own titles, and what it folds to.
  const dir = resolve(import.meta.dirname, '../data/catalogue');
  const table = new Map<string, Map<string, number>>();
  const watch: [string, RegExp][] = [
    ['pure perfume', /\bpure perfume\b/i],
    ['perfume extract', /\bperfume extract\b/i],
    ['parfum concentre', /\bparfum concentr[eé]e?\b/i],
    ['parfum de toilette', /\bparfum de toilette\b/i],
    ['eau de parfum intense', /\beau de parfum intense\b/i],
    ['absolute / absolue', /\babsolu[et]?\b/i],
  ];
  const watched = new Map<string, Map<string, number>>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const snap = decodeSnapshot(JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { listings?: { rawTitle: string; status?: string }[] });
      for (const l of snap.listings ?? []) {
        if (l.status && l.status !== 'active') continue;
        const phrase = concentrationMatch(l.rawTitle);
        if (phrase) {
          const to = concentration(l.rawTitle);
          const row = table.get(to) ?? new Map<string, number>();
          row.set(phrase.toLowerCase(), (row.get(phrase.toLowerCase()) ?? 0) + 1);
          table.set(to, row);
        }
        for (const [name, re] of watch) {
          if (!re.test(l.rawTitle)) continue;
          const row = watched.get(name) ?? new Map<string, number>();
          const to = concentration(l.rawTitle);
          row.set(to, (row.get(to) ?? 0) + 1);
          watched.set(name, row);
        }
      }
    }
  }
  console.log('\nSpellings of a strength in the shops\' own titles, and the value each folds to');
  for (const [to, row] of [...table].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0))) {
    console.log(`  ${to.padEnd(18)} ${[...row].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} (${n})`).join(', ')}`);
  }
  console.log('\nPhrases watched that are not strengths of their own (what they fold to in this build)');
  for (const [name, row] of watched) console.log(`  ${name.padEnd(24)} ${[...row].map(([to, n]) => `${to} (${n})`).join(', ')}`);
}

if (opts.json) {
  writeFileSync(opts.json, JSON.stringify({ products: CATALOGUE.length, groups, strengthOnly: weak, ...(opts.synonyms ? { strengthSplits } : {}) }, null, 1));
  console.log(`\nWrote ${opts.json}`);
}
