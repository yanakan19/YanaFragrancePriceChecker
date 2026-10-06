import { brandKey } from './brandName.js';
import { scentKey } from './setMatch.js';

/**
 * The links a set's page and an oil's page carry to other products
 * (docs/GIFT-SETS-AND-OILS-PLAN.md, 2.5, 3.5): links only, never a merge.
 *
 *   - A set's headline bottle: the one catalogue bottle with the same brand, scent
 *     words, strength and size as the set's main bottle. Exactly one, else nothing
 *     (several would be a guess about which the set holds).
 *   - A set's scent group: the other sets of the same brand and scent words, so a
 *     page can say "More sets of this scent".
 *   - An oil's spray: a non oil bottle of the same brand and name, so the page can
 *     link "The spray version". Several sizes of one spray are all the same scent,
 *     so the first the caller lists (its most widely stocked) is the one.
 *
 * scentKey drops the words that say who a name is for ("for Men"), because a set is
 * "for him" at one shop and not at another. For these links they matter, since "Amber
 * for Men" and "Amber for Women" can be two scents: a link needs the audiences to
 * agree, an unstated one agreeing with any.
 */

export interface LinkBottle {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
}

export interface LinkSet {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  mainMl: number | undefined;
}

export interface LinkOil {
  id: string;
  brand: string;
  name: string;
}

/** Who a name says it is for, as a short code: m, f, u or a mix, '' where it says nothing. */
export function audienceOf(name: string): string {
  const t = name.toLowerCase();
  const out = new Set<string>();
  if (/\b(?:men'?s?|him|homme)\b/.test(t) && !/\bwomen'?s?\b/.test(t)) out.add('m');
  if (/\b(?:women'?s?|womens|her|femme|ladies|lady)\b/.test(t)) out.add('f');
  if (/\bunisex\b/.test(t)) out.add('u');
  return [...out].sort().join('');
}

/** Two audience codes agree when they are the same or either says nothing. */
const compatible = (a: string, b: string): boolean => a === b || a === '' || b === '';

interface Candidate {
  id: string;
  audience: string;
}

const bottleKey = (brand: string, name: string, concentration: string, ml: number): string =>
  `${brandKey(brand)}|${scentKey(name)}|${concentration}|${ml}`;

/** set id to its one headline bottle's id; a set with none or several is absent. */
export function headlineBottles(sets: readonly LinkSet[], bottles: readonly LinkBottle[]): Map<string, string> {
  const byKey = new Map<string, Candidate[]>();
  for (const b of bottles) {
    if (b.sizeMl === null) continue;
    const key = bottleKey(b.brand, b.name, b.concentration, b.sizeMl);
    byKey.set(key, [...(byKey.get(key) ?? []), { id: b.id, audience: audienceOf(b.name) }]);
  }
  const out = new Map<string, string>();
  for (const s of sets) {
    if (s.mainMl === undefined || scentKey(s.name) === '') continue;
    const audience = audienceOf(s.name);
    const found = (byKey.get(bottleKey(s.brand, s.name, s.concentration, s.mainMl)) ?? []).filter((c) => compatible(audience, c.audience));
    if (found.length === 1) out.set(s.id, found[0]!.id);
  }
  return out;
}

/** The scent key of each set that has at least one other set of the same brand and scent; others are absent. */
export function scentGroups(sets: readonly { id: string; brand: string; name: string }[]): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const s of sets) {
    const scent = scentKey(s.name);
    if (scent === '' || /^unbranded$/i.test(s.brand)) continue;
    const key = `${brandKey(s.brand)}|${scent}`;
    groups.set(key, [...(groups.get(key) ?? []), s.id]);
  }
  const out = new Map<string, string>();
  for (const [key, ids] of groups) {
    if (ids.length < 2) continue;
    const scent = key.slice(key.indexOf('|') + 1);
    for (const id of ids) out.set(id, scent);
  }
  return out;
}

const OIL_WORDS = /\b(?:roll[- ]?on|rollerball|attar|perfume oil|parfum oil|perfumed oil|concentrated|oil|cpo|pure|essence)\b/g;

/** An oil's scent words, less the words that say it is an oil. */
export function oilScentKey(name: string): string {
  return scentKey(name.toLowerCase().replace(OIL_WORDS, ' '));
}

/** oil id to a non oil bottle of the same brand and scent; the first listed wins. */
export function sprayVersions(oils: readonly LinkOil[], bottles: readonly LinkBottle[]): Map<string, string> {
  const byKey = new Map<string, Candidate[]>();
  for (const b of bottles) {
    const key = `${brandKey(b.brand)}|${scentKey(b.name)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), { id: b.id, audience: audienceOf(b.name) }]);
  }
  const out = new Map<string, string>();
  for (const o of oils) {
    const scent = oilScentKey(o.name);
    if (scent === '') continue;
    const audience = audienceOf(o.name);
    const found = (byKey.get(`${brandKey(o.brand)}|${scent}`) ?? []).filter((c) => compatible(audience, c.audience));
    if (found.length > 0) out.set(o.id, found[0]!.id);
  }
  return out;
}
