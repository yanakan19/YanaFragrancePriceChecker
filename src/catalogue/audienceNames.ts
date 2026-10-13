/**
 * The same fragrance listed twice because a name says who it is for.
 *
 * "Vulcan Feu" and "Vulcan Feu for Unisex", "Hawas" and "Hawas For Him",
 * "Black XS Her" and "Black XS For Her" are one bottle each. The words are a
 * shop's marketing, and the name every other shop writes has none, so the
 * bottle was listed twice with two prices and no comparison (12 Oct 2026: 3,167
 * such groups in the UK catalogue, 2,302 in the US, 1,248 in India; 1,420 of the
 * UK ones were a single shop's closing label, which stripShopTitleLabel now
 * takes off at the source).
 *
 * The words cannot simply be dropped from every name, because a house also
 * sells two different bottles under one name and the words are what tell them
 * apart: Gucci Guilty and Gucci Guilty Pour Homme, Hugo Boss The Scent and
 * The Scent For Her, Rabanne Black XS For Him and Black XS For Her, Calvin
 * Klein IN2U For Him and For Her (two barcodes). So this is a pass over the
 * products that already exist, not a change to the name, and it merges only on
 * evidence, in the order of how strong it is:
 *
 *   1. The same barcode. Two names for one GTIN are one article, whatever the
 *      words say ("Hawas" and "Hawas For Him", both 6145143310260).
 *   2. The same audience, written two ways: "Black XS Her", "Black XS For Her",
 *      "Black XS Pour Femme" are three spellings of one claim, and a house does
 *      not sell three bottles that differ only in how the same claim is worded.
 *   3. "Unisex" beside the plain name, where nothing in the family says the
 *      plain name is for one sex. A house that sells a scent to both sexes under
 *      one name has no reason to print "Unisex" on a different bottle.
 *   4. The shops say so. The plain name's own listings state who it is for
 *      (a shop's closing label, "Spray for Her", which the name no longer carries;
 *      Perfume Direct's "Women's Perfume"), and the other name says the same.
 *      Plain Libre, labelled "for Her" by the shops that stock it, is "Libre For Her".
 *      Silence is not evidence: a plain name no shop labels is left alone.
 *   5. A reviewed entry (SAME_FRAGRANCE_AUDIENCE): the house's plain name IS its
 *      men's or its women's bottle, which only a person who has checked the house
 *      can say. Hawas for Him is Rasasi's original Hawas.
 *
 * What it never does: merge a plain name with a "for Him" or "Pour Femme" name
 * on the words alone. That is the Gucci Guilty trap (the plain name is the
 * women's bottle, "Pour Homme" is the men's), and the D&G The One trap. Two
 * different barcodes always keep a pair apart, as they do everywhere else
 * (findDuplicateGroups), and concentration and size are part of the key, so an
 * Eau de Toilette and an Eau de Parfum, or a 50ml and a 100ml, are never joined.
 */

import { brandKey } from './brandName.js';
import { KEEP_APART_REVIEWED, SAME_FRAGRANCE_REVIEWED } from './audienceReviewed.js';
import {
  barcodeEditionsNeverMeet,
  findDuplicateGroups,
  isBarcode,
  matchKey,
  normalizedEan,
  type FindDuplicateOptions,
  type MatchableProduct,
  type MergeGroup,
} from './productMatch.js';

export type Audience = 'm' | 'f' | 'u';

export interface AudienceReading {
  /** The name with the audience words cut out, for the key. */
  rest: string;
  /** Audience claims written as a phrase: "for Him", "for Women", "Unisex". */
  labelled: ReadonlySet<Audience>;
  /** Audience words that sit in the name itself: "Men", "Homme", "Pour Femme", "Her". */
  named: ReadonlySet<Audience>;
}

const MAN = String.raw`(?:men|man|him|gents?|gentlemen|boys?)`;
const WOMAN = String.raw`(?:women|woman|her|ladies|girls?)`;
/** One alternation per phrase kind, tried in this order so the longest reading wins. */
const PHRASES: readonly { re: RegExp; audience: Audience; kind: 'labelled' | 'named' }[] = [
  { re: new RegExp(String.raw`\bfor\s+${MAN}\s*(?:&|and|n|/)\s*${WOMAN}\b`, 'gi'), audience: 'u', kind: 'labelled' },
  { re: new RegExp(String.raw`\bfor\s+${WOMAN}\s*(?:&|and|n|/)\s*${MAN}\b`, 'gi'), audience: 'u', kind: 'labelled' },
  { re: new RegExp(String.raw`\b${MAN}\s*(?:&|and|/)\s*${WOMAN}\b`, 'gi'), audience: 'u', kind: 'named' },
  { re: new RegExp(String.raw`\b${WOMAN}\s*(?:&|and|/)\s*${MAN}\b`, 'gi'), audience: 'u', kind: 'named' },
  { re: /\(?\s*\b(?:for\s+)?unisex\b\s*\)?/gi, audience: 'u', kind: 'labelled' },
  { re: new RegExp(String.raw`\bfor\s*${MAN}\b|\bformen\b`, 'gi'), audience: 'm', kind: 'labelled' },
  { re: new RegExp(String.raw`\bfor\s*${WOMAN}\b|\bforwomen\b`, 'gi'), audience: 'f', kind: 'labelled' },
  { re: /\bpour\s+(?:homme|lui)\b/gi, audience: 'm', kind: 'named' },
  { re: /\bpour\s+(?:femme|elle)\b/gi, audience: 'f', kind: 'named' },
  { re: /\b(?:homme|uomo|lui|mens?|men['’]?s|man(?!['’]s)|him|gents?)\b/gi, audience: 'm', kind: 'named' },
  { re: /\b(?:femme|donna(?!\s+karan)|women['’]?s|womens|women|woman|her|ladies)\b/gi, audience: 'f', kind: 'named' },
];

/** Reads who a name says it is for, and what is left of the name without it. */
export function readAudienceName(name: string): AudienceReading {
  // The accents and the apostrophe are folded for the reading only; what is left
  // is returned from the folded text, which matchKey folds the same way.
  let rest = name.normalize('NFKD').replace(/\p{Mn}/gu, '');
  const labelled = new Set<Audience>();
  const named = new Set<Audience>();
  for (const { re, audience, kind } of PHRASES) {
    rest = rest.replace(re, () => {
      (kind === 'labelled' ? labelled : named).add(audience);
      return ' ';
    });
  }
  rest = rest.replace(/\s{2,}/g, ' ').replace(/^[\s\-&|,()]+|[\s\-&|,(]+$/g, '').trim();
  return { rest, labelled, named };
}

/** The audiences a reading claims, labelled and named together. */
export function audiencesOf(reading: AudienceReading): Audience[] {
  return [...new Set([...reading.labelled, ...reading.named])];
}

/**
 * The key a product has once its audience words are cut out: the match key of
 * the rest of the name. "Vulcan Feu for Unisex" and "Vulcan Feu" share one,
 * "Hawas For Him" and "Hawas" share one, and so do "Black XS Her" and "Black XS
 * For Her" (and "Black XS", which is why a key alone merges nothing).
 */
export function audienceFreeKey(p: MatchableProduct): string | null {
  const { rest } = readAudienceName(p.name);
  if (!/[a-z0-9]/i.test(rest)) return null;
  return matchKey({ ...p, name: rest });
}

/** The same key across every size and strength: the family of one name in one house. */
export function audienceFamilyKey(p: MatchableProduct): string | null {
  const { rest } = readAudienceName(p.name);
  if (!/[a-z0-9]/i.test(rest)) return null;
  return matchKey({ ...p, name: rest, sizeMl: 0, concentration: '', ean: null });
}

/**
 * Reviewed entries: in these families the plain name is the house's bottle for
 * one sex, so the plain name and that sex's "for Him" / "for Her" name are the
 * same fragrance. Each is checked against the house or a barcode before it is
 * added, and the evidence is written beside it. Only ever added to.
 *
 * `name` is the plain name as the catalogue shows it; the entry covers every
 * size and strength of it. `is` is who the plain name is for.
 */
export interface SameFragranceEntry {
  brand: string;
  name: string;
  is: Audience;
  evidence: string;
}

const RASASI_HAWAS_LINE =
  "Rasasi's Hawas line is the men's line: its own storefront and the shops list the bottle as \"Hawas X\" and as \"Hawas X for Him\" (the owner confirmed Hawas and Hawas for Him are one scent, 12 Oct 2026; barcode 614514331026 is both), and the women's bottles carry their own name (\"Hawas For Her\", 614514331019).";

export const SAME_FRAGRANCE_AUDIENCE: readonly SameFragranceEntry[] = [
  // The 13 Oct 2026 review of the name pairs the rules left open (audienceReviewed.ts).
  ...SAME_FRAGRANCE_REVIEWED,
  { brand: 'Rasasi', name: 'Hawas', is: 'm', evidence: RASASI_HAWAS_LINE },
  { brand: 'Rasasi', name: 'Hawas Ice', is: 'm', evidence: `${RASASI_HAWAS_LINE} Rasasi's own store sells "Hawas Ice"; other shops call it "Hawas Ice for Men".` },
  { brand: 'Rasasi', name: 'Hawas Fire', is: 'm', evidence: `${RASASI_HAWAS_LINE} "Hawas Fire For Him" is barcode 614514178065.` },
  { brand: 'Rasasi', name: 'Hawas Atlantis', is: 'm', evidence: `${RASASI_HAWAS_LINE} "Hawas For Him Atlantis" is barcode 614514555125.` },
  { brand: 'Rasasi', name: 'Hawas Viper', is: 'm', evidence: `${RASASI_HAWAS_LINE} "Hawas For Him Viper" is barcode 614514555132.` },
  { brand: 'Rasasi', name: 'Hawas Black', is: 'm', evidence: `${RASASI_HAWAS_LINE} Scent Warehouse and Emirates Oud list "Hawas Black For Him".` },
  { brand: 'Rasasi', name: 'Hawas Elixir', is: 'm', evidence: RASASI_HAWAS_LINE },
  { brand: 'Rasasi', name: 'Hawas Malibu', is: 'm', evidence: `${RASASI_HAWAS_LINE} Scent Warehouse lists "Hawas Malibu for Him".` },
  { brand: 'Rasasi', name: 'Hawas Tropical', is: 'm', evidence: RASASI_HAWAS_LINE },
  { brand: 'Rasasi', name: 'Hawas Kobra', is: 'm', evidence: RASASI_HAWAS_LINE },
  {
    brand: 'Rasasi',
    name: 'Hawas Éclat',
    is: 'f',
    evidence: 'Hawas Éclat is the women\'s bottle: barcode 614514339206 is "Hawas For Her Éclat" at four shops and "Hawas Women Eclat" at Scentsational.',
  },
];

/**
 * Families where the weaker rules above (same audience written two ways, Unisex, the shops say
 * so, reviewed entry) must not apply. Reviewed, with the reason, only ever added to. A shared
 * barcode still joins a pair: it is the one proof that outweighs the words.
 */
export const KEEP_APART_AUDIENCE: readonly { brand: string; name: string; reason: string }[] = KEEP_APART_REVIEWED;

const entryKey = (brand: string, name: string): string =>
  `${brandKey(brand)}|${audienceFamilyKey({ id: 'entry', brand, name, concentration: '', sizeMl: 0, ean: null })}`;
const TABLE = new Map(SAME_FRAGRANCE_AUDIENCE.map((e) => [entryKey(e.brand, e.name), e.is] as const));
const APART = new Set(KEEP_APART_AUDIENCE.map((e) => entryKey(e.brand, e.name)));

export interface AudienceGroup<T> {
  canonical: T;
  absorbed: T[];
  /** The name the merged product shows: the plain one where there is one. */
  name: string;
  /** Why they are one: the strongest evidence among the pairs joined. */
  evidence: 'barcode' | 'same audience' | 'unisex' | 'shops say so' | 'reviewed';
}

interface Member<T> {
  p: T;
  reading: AudienceReading;
  audiences: Audience[];
  family: string;
}

/**
 * The merges this module finds among products no other rule has merged. `shopsOf`
 * ranks which record stays (the one with the barcode, then the one most shops
 * stock, then the plain name); the caller applies the groups.
 */
export function findAudienceDuplicates<T extends MatchableProduct>(
  products: readonly T[],
  options: {
    shopsOf?: (product: T) => Iterable<string>;
    /** Who the shops' own titles for this product say it is for (one audience, or null where they say none or disagree). */
    statedAudience?: (product: T) => Audience | null;
  } = {},
): AudienceGroup<T>[] {
  const members: Member<T>[] = [];
  const familyAudiences = new Map<string, Set<Audience>>();
  const byCluster = new Map<string, Member<T>[]>();
  for (const p of products) {
    const family = audienceFamilyKey(p);
    const cluster = audienceFreeKey(p);
    if (family === null || cluster === null) continue;
    const reading = readAudienceName(p.name);
    const m: Member<T> = { p, reading, audiences: audiencesOf(reading), family: `${brandKey(p.brand)}|${family}` };
    members.push(m);
    const seen = familyAudiences.get(m.family) ?? new Set<Audience>();
    for (const a of m.audiences) seen.add(a);
    familyAudiences.set(m.family, seen);
    const list = byCluster.get(cluster);
    if (list) list.push(m);
    else byCluster.set(cluster, [m]);
  }

  const groups: AudienceGroup<T>[] = [];
  const shopCount = (p: T): number => (options.shopsOf ? new Set(options.shopsOf(p)).size : 0);
  for (const cluster of byCluster.values()) {
    if (cluster.length < 2) continue;
    const apart = APART.has(cluster[0]!.family);
    const RANKS = ['barcode', 'same audience', 'unisex', 'shops say so', 'reviewed'] as const;
    const code = (m: Member<T>): string | null => (isBarcode(m.p.ean) ? normalizedEan(m.p.ean) : null);
    // Two different barcodes keep a pair apart, unless no shop sells both: then they are
    // the house's old and new code for one pack (Prada Amber Pour Homme), the same test
    // findDuplicateGroups applies.
    const disagree = (a: Member<T>, b: Member<T>): boolean => {
      const ca = code(a);
      const cb = code(b);
      if (ca === null || cb === null || ca === cb) return false;
      return !(options.shopsOf && barcodeEditionsNeverMeet([a.p, b.p], options.shopsOf));
    };
    const claims = (m: Member<T>): Audience | null => (m.audiences.length === 1 ? m.audiences[0]! : null);
    const family = familyAudiences.get(cluster[0]!.family) ?? new Set<Audience>();
    const reviewed = TABLE.get(cluster[0]!.family);

    // Every pair the evidence joins, with how strong that evidence is (0 barcode ... 4 reviewed).
    const edges: { i: number; j: number; rank: number }[] = [];
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i]!;
        const b = cluster[j]!;
        if (matchKey(a.p) === matchKey(b.p)) continue; // already one product by the exact rule
        if (disagree(a, b)) continue;
        const ca = code(a);
        if (ca !== null && ca === code(b)) {
          edges.push({ i, j, rank: 0 });
          continue;
        }
        if (apart) continue;
        const xa = claims(a);
        const xb = claims(b);
        if (xa !== null && xa === xb) {
          edges.push({ i, j, rank: 1 });
          continue;
        }
        const plain = a.audiences.length === 0 ? a : b.audiences.length === 0 ? b : null;
        if (plain === null) continue;
        const other = plain === a ? b : a;
        const x = claims(other);
        if (x === null) continue;
        if (x === 'u' && [...family].every((f) => f === 'u')) edges.push({ i, j, rank: 2 });
        else if (options.statedAudience?.(plain.p) === x) edges.push({ i, j, rank: 3 });
        else if (reviewed === x) edges.push({ i, j, rank: 4 });
      }
    }
    if (edges.length === 0) continue;

    // Joined strongest evidence first, so a weaker claim can never undo a stronger one and
    // the result does not depend on what else is known about a product. A join is refused
    // when it would put two barcodes on one product, or a men's and a women's claim (only
    // a shared barcode outweighs that), and a record with no barcode that two different
    // barcoded products both claim is not given to either.
    const parent = cluster.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    const heardOf = cluster.map((m) => {
      const heard = new Set<Audience>(m.audiences);
      const stated = options.statedAudience?.(m.p);
      if (stated) heard.add(stated);
      return heard;
    });
    const weakest = new Map<number, number>();
    const membersOf = (root: number): Member<T>[] => cluster.filter((_, k) => find(k) === root);
    for (let rank = 0; rank <= 4; rank++) {
      const level = edges.filter((e) => e.rank === rank);
      if (level.length === 0) continue;
      const claimedBy = new Map<number, Set<number>>(); // a record with no barcode -> the barcoded products it could join
      for (const { i, j } of level) {
        for (const [free, other] of [[i, j], [j, i]] as const) {
          if (code(cluster[free]!) !== null || membersOf(find(free)).some((m) => code(m) !== null)) continue;
          if (!membersOf(find(other)).some((m) => code(m) !== null)) continue;
          const set = claimedBy.get(free) ?? new Set<number>();
          set.add(find(other));
          claimedBy.set(free, set);
        }
      }
      for (const { i, j } of level) {
        const ri = find(i);
        const rj = find(j);
        if (ri === rj) continue;
        if ([i, j].some((n) => (claimedBy.get(n)?.size ?? 0) > 1)) continue;
        const union = [...membersOf(ri), ...membersOf(rj)];
        const coded = union.filter((m) => code(m) !== null);
        if (new Set(coded.map(code)).size > 1 && !(options.shopsOf && barcodeEditionsNeverMeet(coded.map((m) => m.p), options.shopsOf))) continue;
        if (rank > 0) {
          const heard = new Set<Audience>();
          for (const m of union) for (const a of heardOf[cluster.indexOf(m)]!) heard.add(a);
          if (heard.has('m') && heard.has('f')) continue;
        }
        parent[rj] = ri;
        weakest.set(ri, Math.max(weakest.get(ri) ?? 0, weakest.get(rj) ?? 0, rank));
      }
    }

    const components = new Map<number, number[]>();
    cluster.forEach((_, i) => {
      const r = find(i);
      components.set(r, [...(components.get(r) ?? []), i]);
    });
    for (const [root, indexes] of components) {
      if (indexes.length < 2) continue;
      const set = indexes.map((i) => cluster[i]!);
      const ranked = [...set].sort(
        (a, b) =>
          Number(code(b) !== null) - Number(code(a) !== null) || shopCount(b.p) - shopCount(a.p) || a.p.id.localeCompare(b.p.id),
      );
      const keeper = ranked[0]!;
      const plainOnes = ranked.filter((m) => m.audiences.length === 0);
      const shown = plainOnes[0] ?? keeper;
      groups.push({
        canonical: keeper.p,
        absorbed: ranked.slice(1).map((m) => m.p),
        name: shown.p.name,
        evidence: RANKS[weakest.get(root) ?? 0]!,
      });
    }
  }
  return groups;
}

export interface AudienceDuplicateOptions<T> extends FindDuplicateOptions<T> {
  /** Who the shops' own titles for this product say it is for: see findAudienceDuplicates. */
  statedAudience?: (product: T) => Audience | null;
}

/**
 * findDuplicateGroups, then the audience pass over whatever it left standing:
 * the one call both catalogues (the UK build and the region build) make to find
 * what is one bottle. The groups of the first come first, so a caller applying
 * them in order folds the exact matches before the audience ones.
 */
export function findSameBottleGroups<T extends MatchableProduct>(
  products: readonly T[],
  options: AudienceDuplicateOptions<T> = {},
): MergeGroup<T>[] {
  const groups = findDuplicateGroups(products, options);
  const gone = new Set<T>();
  for (const g of groups) for (const a of g.absorbed) gone.add(a);
  const standing = products.filter((p) => !gone.has(p));
  const found = findAudienceDuplicates(standing, options);
  return [...groups, ...found.map((g): MergeGroup<T> => ({ canonical: g.canonical, absorbed: g.absorbed, name: g.name }))];
}
