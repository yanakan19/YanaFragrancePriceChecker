/**
 * The name shown for a product the shops write differently (owner request, 19 Oct 2026).
 *
 * A product keeps the name its first listing produced, which is an accident of file order: a
 * reseller that writes "Jimmy Choo Rose Passion" wins over four that write "Rose Passion". When
 * the shops on one product (same barcode, or merged into one product) disagree, a strict
 * majority of them decides, among the names the shops themselves produce. Never a new name.
 *
 * What a majority may NOT do (owner decisions, 19 Oct): lose a series prefix ("Club De Nuit",
 * "Emporio Armani", "Miss Dior", "My Burberry", "Flower by Kenzo"), a strength word ("Intense",
 * "Elixir", "Sport") or an audience word ("For Men", "Pour Femme"). So the winning name must
 * still hold every word of the current name, except the house at the very start or the very end
 * (with the "by" that introduced a trailing house) and the shop noise words in NOISE_WORDS. A
 * winner may add words. A family in nameReviewed.ts (verified, kept or unresolved) is never
 * reopened.
 */
import { NAME_KEPT, NAME_UNRESOLVED, NAME_VERIFIED } from './nameReviewed.js';

export interface NameVote {
  /** The shop. One shop is one vote, whatever number of its rows are on the product. */
  shop: string;
  name: string;
}

/**
 * The shop whose titles repeat the house ("Head Head Attitude Homme ... Head"). Owner decision,
 * 19 Oct 2026: a name that only this shop gives is not evidence, and one shop's noisy title never
 * decides a name. The count already makes that so (a winner needs a strict majority of three
 * shops at least, which always holds a second shop); the check below keeps it so if the count
 * ever changes.
 */
export const NOISY_TITLE_SHOP = 'direct-cosmetics';

const NOISE_WORDS = new Set(['perfume', 'perfumes', 'fragrance', 'fragrances', 'spray']);
/** A majority never adds who the fragrance is for: the audience pass decided that name (audienceNames.ts). */
const AUDIENCE_WORDS = new Set([
  'for', 'pour', 'men', 'mens', 'women', 'womens', 'man', 'woman', 'him', 'her', 'homme', 'femme', 'unisex', 'lui', 'elle', 'ladies', 'boys', 'girls', 'kids',
]);
/** A word that makes a house at the end of a name part of it: "Mon Guerlain", "Terre d'Hermes". */
const NEEDS_THE_HOUSE = new Set(['mon', 'ma', 'mes', 'my', 'la', 'le', 'les', 'l', 'de', 'du', 'des', 'di', 'del', 'd', 'the', 'of', 'for', 'pour', 'and', 'tonino']);
/** A name made only of these says nothing without the house. */
const GENERIC_WORDS = new Set([
  ...AUDIENCE_WORDS, 'le', 'la', 'parfum', 'eau', 'de', 'toilette', 'cologne', 'classic', 'original', 'sport', 'intense', 'absolute', 'absolu', 'gold', 'silver',
  'black', 'white', 'blue', 'red', 'noir', 'night', 'elixir', 'extrait', 'edp', 'edt', 'm', 'd',
]);

const fold = (s: string): string[] =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function isSubsequence(small: readonly string[], big: readonly string[]): boolean {
  let i = 0;
  for (const w of big) if (i < small.length && small[i] === w) i++;
  return i === small.length;
}

/** The current name less what a majority may drop: the house at either end and shop noise words. */
function withoutDroppable(name: string, house: readonly string[]): string[] {
  let t = fold(name);
  const run = (at: number): boolean => house.length > 0 && at >= 0 && house.every((w, i) => t[at + i] === w);
  if (run(0) && t.length > house.length) t = t.slice(house.length);
  if (t.length > house.length && run(t.length - house.length) && !NEEDS_THE_HOUSE.has(t[t.length - house.length - 1]!)) {
    t = t.slice(0, t.length - house.length);
    if (t.length > 1 && t[t.length - 1] === 'by') t = t.slice(0, -1);
  }
  return t.filter((w) => !NOISE_WORDS.has(w));
}

let reviewed: Set<string> | null = null;
function reviewedKey(brand: string, name: string): string {
  return `${fold(brand).join(' ')}|${fold(name).join(' ')}`;
}
/** A family checked against the web (nameReviewed.ts) is final, in any of its three lists. */
export function isReviewedFamily(brand: string, name: string): boolean {
  if (!reviewed) {
    reviewed = new Set();
    for (const e of NAME_VERIFIED) reviewed.add(reviewedKey(e.brand, e.to));
    for (const e of NAME_KEPT) reviewed.add(reviewedKey(e.brand, e.name));
    for (const e of NAME_UNRESOLVED) reviewed.add(reviewedKey(e.brand, e.name));
  }
  return reviewed.has(reviewedKey(brand, name));
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The name the shops agree on, or null when the current name stays. `votes` are the names the
 * shops' own titles produce for this product. Three shops at least are needed, and more than half
 * of them must give the same name (one vote per shop).
 */
export function consensusName(current: string, brand: string, votes: readonly NameVote[]): string | null {
  if (isReviewedFamily(brand, current)) return null;
  // One vote per shop: the name most of that shop's rows give (ties: the smaller string).
  const perShop = new Map<string, Map<string, number>>();
  for (const v of votes) {
    const m = perShop.get(v.shop) ?? new Map<string, number>();
    m.set(v.name, (m.get(v.name) ?? 0) + 1);
    perShop.set(v.shop, m);
  }
  const ballots: string[] = [];
  const voters = new Map<string, Set<string>>();
  for (const [shop, m] of perShop) {
    const name = [...m.entries()].sort((a, b) => b[1] - a[1] || byCodeUnit(a[0], b[0]))[0]![0];
    ballots.push(name);
    const key = fold(name).join(' ');
    voters.set(key, (voters.get(key) ?? new Set<string>()).add(shop));
  }
  if (ballots.length < 3) return null;
  const byKey = new Map<string, string[]>();
  for (const name of ballots) {
    const key = fold(name).join(' ');
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), name]);
  }
  let winnerKey: string | null = null;
  for (const [key, names] of byKey) if (names.length * 2 > ballots.length) winnerKey = key;
  if (winnerKey === null) return null;
  // A name only the noisy-title shop gives is not evidence.
  if (![...(voters.get(winnerKey) ?? [])].some((shop) => shop !== NOISY_TITLE_SHOP)) return null;
  const currentKey = fold(current).join(' ');
  if (winnerKey === currentKey) return null;
  const house = fold(brand);
  // Nothing of the current name is lost but the droppable words.
  if (!isSubsequence(withoutDroppable(current, house), winnerKey.split(' '))) return null;
  // A name that is only the house, or only generic words, or one letter, is not a better name.
  const winnerWords = winnerKey.split(' ');
  if (winnerKey === house.join(' ') || winnerWords.every((w) => GENERIC_WORDS.has(w)) || !winnerWords.some((w) => w.length >= 3 || /\d/.test(w))) return null;
  // What the winner adds to the current name: no audience word, and no piece of the house unless
  // the whole house is there ("Guess Seductive", "Flower by Kenzo" but never "Sui Dreams").
  const have = fold(current);
  const extras = [...winnerWords];
  for (const w of have) {
    const at = extras.indexOf(w);
    if (at >= 0) extras.splice(at, 1);
  }
  if (extras.some((w) => AUDIENCE_WORDS.has(w))) return null;
  const wholeHouse = house.length > 0 && winnerWords.some((_, i) => house.every((w, j) => winnerWords[i + j] === w));
  if (extras.some((w) => house.includes(w)) && !wholeHouse) return null;
  // The spelling: the commonest form among the shops that gave it; ties: the current form, then
  // the smaller string.
  const forms = new Map<string, number>();
  for (const n of byKey.get(winnerKey)!) forms.set(n, (forms.get(n) ?? 0) + 1);
  return [...forms.entries()].sort(
    (a, b) => b[1] - a[1] || Number(b[0] === current) - Number(a[0] === current) || byCodeUnit(a[0], b[0]),
  )[0]![0];
}
