/**
 * Recognising one bottle sold by several shops when only some publish an EAN.
 *
 * ── The bug this fixes ───────────────────────────────────────────────────────
 * Products were keyed on EAN where a shop published one and on the shop's own
 * SKU where it did not. Two shops selling the identical bottle therefore became
 * two products whenever only one of them carried the barcode — Afnan Supremacy
 * In Extrait De Parfum, Oud, 100ml appeared twice, at £38.99 from Justmylook
 * and £50.00 from Beauty Base, side by side in the same list. That is the exact
 * failure a price comparison exists to prevent: the reader is shown two
 * products and no comparison, and the cheaper one looks like a different item.
 *
 * ── When two listings are the same bottle ────────────────────────────────────
 * Same house, same size, same concentration, and the same words in the name.
 * All four, or no merge.
 *
 * Word *set* rather than word order, because shops genuinely disagree about it
 * — "Supremacy Pour Homme Silver" and "Supremacy Silver Pour Homme" are one
 * bottle written two ways. Two different fragrances from one house sharing a
 * size, a concentration and an identical bag of words is not a thing that
 * happens; a house reordering its own modifiers is routine.
 *
 * ── Where it refuses ─────────────────────────────────────────────────────────
 * Two products that both carry an EAN and disagree about it are left alone,
 * however alike they look. A barcode is the manufacturer stating these are
 * different articles, and that outranks our own name comparison. Silently
 * merging them would fold a 2024 reformulation into its predecessor and show
 * one price for two things.
 */
import { brandKey } from './brandName.js';

export interface MatchableProduct {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  ean: string | null;
}

/**
 * The identity two listings must share to be the same bottle.
 *
 * Name words are lowercased, stripped of punctuation and sorted, so ordering
 * and hyphenation differences between feeds collapse while genuinely different
 * words never do.
 */
export function matchKey(p: MatchableProduct): string {
  const words = p.name
    .toLowerCase()
    // Apostrophes vanish rather than splitting the word around them: one feed
    // writes "Bade'e Al Oud" and another "Badee Al Oud", and treating the
    // apostrophe as a separator turns one word into two and the match fails.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
  return [brandKey(p.brand), p.sizeMl, p.concentration.toLowerCase().trim(), words].join('|');
}

export interface MergeGroup<T extends MatchableProduct> {
  /** The record the merged product keeps — the EAN-bearing one where there is one. */
  canonical: T;
  /** Everything folded into it, canonical excluded. */
  absorbed: T[];
}

/**
 * Group products that are the same bottle.
 *
 * Returns only groups where something actually merges, so a caller can both
 * apply the merges and report exactly what was folded together — this changes
 * what the reader sees, so it should never happen invisibly.
 */
export function findDuplicateGroups<T extends MatchableProduct>(products: readonly T[]): MergeGroup<T>[] {
  const byKey = new Map<string, T[]>();
  for (const p of products) {
    const key = matchKey(p);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(p);
    else byKey.set(key, [p]);
  }

  const groups: MergeGroup<T>[] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;

    // A disagreement between two published barcodes is the manufacturer
    // telling us these are different articles. Leave the whole group alone
    // rather than guessing which of them the EAN-less listings belong to.
    const eans = new Set(bucket.filter((p) => p.ean).map((p) => p.ean!));
    if (eans.size > 1) continue;

    // Prefer the record that carries the barcode; it is the better-identified
    // one and keeping its id means existing links stay valid.
    const canonical = bucket.find((p) => p.ean) ?? bucket[0]!;
    groups.push({ canonical, absorbed: bucket.filter((p) => p !== canonical) });
  }
  return groups;
}
