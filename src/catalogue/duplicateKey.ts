/**
 * A deliberately independent second opinion on "is this the same bottle?".
 *
 * The matcher in productMatch.ts decides what the site merges. This file does
 * not: it is the yardstick scripts/find-duplicates.ts measures the built
 * catalogue with, written separately so that a gap in the matcher cannot also
 * be a gap in the check that looks for it. It reads only what a built product
 * carries (brand, name, concentration, size) and builds one key from it:
 *
 *   brand alias | name core | size in ml | strength
 *
 * The name core is the name with everything that is not the fragrance's own
 * name taken out: case, accents, punctuation, "by Brand", the house's own name
 * where a shop repeated it, filler such as "spray", the strength words (the
 * strength is a key part of its own, so it is not allowed to differ through
 * the name), and the order of the remaining words.
 *
 * What it must never do is fold two different bottles together. So it keeps
 * every flanker word (Elixir, Intense, Absolu, Extreme, Sport, Noir, Pour
 * Homme ...), every edition word (Tester, Limited, Refill, Travel, Set) and
 * the size, and it does not treat a stated strength and a missing one as equal.
 */
import { brandKey, brandPrefixKeys, KNOWN_ALIASES } from './brandName.js';

export interface KeyableProduct {
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
}

/** The brand reduced to one alias key, so "Paco Rabanne" and "Rabanne" meet. */
export function brandAliasKey(brand: string): string {
  const k = brandKey(brand);
  const alias = KNOWN_ALIASES[k];
  return alias ? brandKey(alias) : k;
}

/** Lowercase, accent free, punctuation free words. Apostrophes vanish. */
export function plainWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Words that say nothing about which perfume this is. */
const FILLER_WORDS: ReadonlySet<string> = new Set(['spray', 'vaporisateur', 'natural', 'naturel', 'the', 'and', 'perfume', 'perfumes']);

/** A strength written as an abbreviation. */
const STRENGTH_ABBREVIATIONS: ReadonlySet<string> = new Set(['edp', 'edt', 'edc']);

/**
 * Strength written out as a phrase: "eau de parfum", "eau de toilette", "eau
 * de cologne", "extrait de parfum". Removed as a whole phrase, never word by
 * word, because the parts are also words of names: "Daisy Eau So Fresh" keeps
 * its "eau", "Aventus Cologne" keeps its "cologne" (a different perfume from
 * Aventus). "Eau Fraiche" is deliberately not a strength here: "Pour Homme Eau
 * Fraiche" and "Charlie Blue Eau Fraiche" are their own bottles, beside "Pour
 * Homme" and "Charlie Blue".
 */
function dropStrengthPhrases(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const w1 = words[i + 1];
    const w2 = words[i + 2];
    if (w === 'eau' && (w1 === 'de' || w1 === 'du') && w2 && ['parfum', 'toilette', 'cologne', 'perfume'].includes(w2)) {
      i += 2;
      continue;
    }
    if (w === 'extrait' && w1 === 'de' && w2 === 'parfum') {
      i += 2;
      continue;
    }
    out.push(w);
  }
  return out;
}

/**
 * The fragrance's own name, as a sorted bag of words, with the brand's own
 * words, "by Brand", strength phrases and filler removed. Flanker words
 * (Elixir, Intense, Absolu, Extreme, Cologne, Parfum ...), edition words
 * (Tester, Limited, Refill, Travel, Set) and gender words all stay.
 */
export function nameCore(name: string, brand: string): string {
  let words = dropStrengthPhrases(plainWords(name));
  const prefixes = brandPrefixKeys(brand);
  for (let k = 1; k <= 4 && k < words.length; k++) {
    if (prefixes.has(words.slice(0, k).join(''))) {
      words = words.slice(k);
      break;
    }
  }
  const byAt = words.indexOf('by');
  if (byAt >= 0) {
    for (let k = 1; byAt + k < words.length && k <= 4; k++) {
      if (prefixes.has(words.slice(byAt + 1, byAt + 1 + k).join(''))) {
        words = [...words.slice(0, byAt), ...words.slice(byAt + 1 + k)];
        break;
      }
    }
  }
  const out = words.filter((w) => !FILLER_WORDS.has(w) && !STRENGTH_ABBREVIATIONS.has(w));
  while (out.length > 1 && ['de', 'by', 'of', 'new'].includes(out[out.length - 1]!)) out.pop();
  return (out.length > 0 ? out : words).sort().join(' ');
}

/**
 * The strength as a comparable string. Display forms from productName.ts
 * ("Eau de Parfum", "Parfum", "Disputed", "Not stated") are lowercased and
 * nothing else: this check does not know better than the catalogue which
 * strength a bottle is, it only insists two keys agree on whatever it is.
 */
export function strengthKey(concentration: string): string {
  return concentration.toLowerCase().trim();
}

export const UNKNOWN_STRENGTHS: ReadonlySet<string> = new Set(['not stated', 'disputed']);

/** The whole key. A null size never equals anything, so it is not a key at all. */
export function duplicateKey(p: KeyableProduct): string | null {
  if (p.sizeMl === null) return null;
  const core = nameCore(p.name, p.brand);
  if (!core) return null;
  return [brandAliasKey(p.brand), core, p.sizeMl, strengthKey(p.concentration)].join('|');
}

/** The same key with the strength left out, for finding strength only splits. */
export function strengthBlindKey(p: KeyableProduct): string | null {
  if (p.sizeMl === null) return null;
  const core = nameCore(p.name, p.brand);
  if (!core) return null;
  return [brandAliasKey(p.brand), core, p.sizeMl].join('|');
}
