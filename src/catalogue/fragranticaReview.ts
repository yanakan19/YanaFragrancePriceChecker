import { brandKey } from './brandName.js';
import {
  matchFragranticaUrl,
  fragranticaPath,
  parseFragranticaUrl,
  type SearchResult,
  type UrlMatch,
  type WantedFragrance,
} from './fragranceLinkMatch.js';

/**
 * What a person established about particular Fragrantica pages, kept in
 * data/fragrantica-link-review.json (the audit of 2026-10-05, see
 * docs/FRAGRANTICA-LINK-AUDIT-2026-10-05.md). Three things the URL and the
 * product's name cannot say by themselves:
 *
 *   wrong       a page that matches by name and is the wrong product (the
 *               women's "Club de Nuit Intense" shown for the men's one). It is
 *               never accepted again for that brand and name.
 *   singlePage  a page confirmed to be the only one Fragrantica has for the
 *               perfume, whatever its strength. A page that states no
 *               concentration may then stand for a Parfum or an Extrait too
 *               (see baseMayStandFor in fragranceLinkMatch.ts).
 *   pageGender  who the page says the perfume is for, read from the page's own
 *               title or address in a search result. A men's perfume is never
 *               sent to a page "for women", or the other way round, where the
 *               catalogue knows the product's gender.
 *
 * Nothing here is written by a script that guesses: every entry was read off a
 * search result for that exact page. A person's entry is never overwritten.
 * Since 2026-10-05 the daily job (scripts/resolve-fragrance-links.ts) adds a
 * page's gender the first time a search result shows the page (see
 * pageGenderOfResult and learnPageGenders below); everything else in the file
 * is still only ever added by review.
 */

export type PageGender = 'men' | 'women' | 'unisex';

export interface FragranticaReview {
  reviewedOn: string;
  how: string;
  singlePage: { brand: string; name: string; url: string }[];
  wrong: { brand: string; name: string; url: string; why: string }[];
  /** "Folder/Slug-id" as in the page address, to who the page says it is for. */
  pageGender: Record<string, PageGender>;
}

export const NO_REVIEW: FragranticaReview = { reviewedOn: '', how: '', singlePage: [], wrong: [], pageGender: {} };

export function parseReview(text: string): FragranticaReview {
  const raw = JSON.parse(text) as Partial<FragranticaReview>;
  return {
    reviewedOn: raw.reviewedOn ?? '',
    how: raw.how ?? '',
    singlePage: raw.singlePage ?? [],
    wrong: raw.wrong ?? [],
    pageGender: raw.pageGender ?? {},
  };
}

export interface ReviewIndex {
  single: ReadonlySet<string>;
  wrong: ReadonlyMap<string, string>;
  /** Mutable on purpose: the job adds a page's gender as soon as a search result shows it (learnPageGenders). */
  gender: Map<string, PageGender>;
}

export function indexReview(review: FragranticaReview): ReviewIndex {
  const single = new Set<string>();
  for (const s of review.singlePage) {
    const p = fragranticaPath(s.url);
    if (p) single.add(p);
  }
  const wrong = new Map<string, string>();
  for (const w of review.wrong) {
    const p = fragranticaPath(w.url);
    if (p) wrong.set(`${brandKey(w.brand)}|${brandKey(w.name)}|${p}`, w.why);
  }
  return { single, wrong, gender: new Map(Object.entries(review.pageGender)) };
}

export const NO_REVIEW_INDEX: ReviewIndex = indexReview(NO_REVIEW);

export interface CheckedWanted extends WantedFragrance {
  /**
   * The catalogue's gender for the product, where it knows one. 'both' is a
   * name two products share, one for men and one for women (the link table is
   * keyed by brand, name and strength, so they share one link): no page for a
   * single gender is right for both.
   */
  gender?: 'mens' | 'womens' | 'unisex' | 'both' | null | undefined;
}

/**
 * The one gender to hold a link to, for every product that shares it: mens and
 * womens together are 'both'; otherwise the single-sex one wins over unisex
 * (a unisex product is content with any page, a men's one is not); null where
 * the catalogue states nothing.
 */
export function sharedGender(genders: Iterable<'mens' | 'womens' | 'unisex' | null | undefined>): CheckedWanted['gender'] {
  const set = new Set(genders);
  if (set.has('mens') && set.has('womens')) return 'both';
  if (set.has('mens')) return 'mens';
  if (set.has('womens')) return 'womens';
  return set.has('unisex') ? 'unisex' : null;
}

/** Why a page is refused for this product by the review, or null. */
export function reviewRefusal(url: string, wanted: CheckedWanted, index: ReviewIndex): string | null {
  const path = fragranticaPath(url);
  if (!path) return null;
  const why = index.wrong.get(`${brandKey(wanted.brand)}|${brandKey(wanted.name)}|${path}`);
  if (why !== undefined) return `reviewed as the wrong page: ${why}`;
  const pg = index.gender.get(path);
  if (pg === 'women' && wanted.gender === 'mens') return 'the page is for women, the product is for men';
  if (pg === 'men' && wanted.gender === 'womens') return 'the page is for men, the product is for women';
  if ((pg === 'women' || pg === 'men') && wanted.gender === 'both') {
    return `the page is for ${pg}, and products for men and for women share this name`;
  }
  return null;
}

/**
 * matchFragranticaUrl plus what the review knows. This is the rule a stored
 * link must pass: the resolver accepts a candidate by it, drops a stored link
 * that fails it, and the data test holds every stored link to it.
 */
export function matchFragranticaChecked(url: string, wanted: CheckedWanted, index: ReviewIndex): UrlMatch | null {
  if (reviewRefusal(url, wanted, index)) return null;
  const path = fragranticaPath(url);
  return matchFragranticaUrl(url, wanted, { singlePage: path !== null && index.single.has(path) });
}

// ── who a page is for, read off a search result ────────────────────────────

/**
 * Fragrantica says who a perfume is for in the title of its page, in one of
 * three phrases: "for women", "for men" and "for women and men" ("Sauvage Dior
 * cologne - a fragrance for men 2015"). The page's address often carries the
 * same words at the end of its name ("Eternity-for-Men-258"). Only the title
 * and the address of a search result are read, never the page, which Fragrantica
 * refuses to the bot (docs/FRAGRANTICA-LINK-AUDIT-2026-10-05.md), and nothing of
 * either is stored beyond the one word.
 */
const TITLE_PHRASE = /\ba (?:new )?fragrance for (women and men|men and women|women|men)\b/i;
const ANY_PHRASE = /\bfor (women and men|men and women|women|men)\b/gi;
const ADDRESS_PHRASE = /-for-(women-and-men|men-and-women|women|men)-\d+$/i;

function genderOfWords(words: string): PageGender {
  const w = words.toLowerCase();
  return w === 'women' ? 'women' : w === 'men' ? 'men' : 'unisex';
}

/**
 * The gender a result's title says, or null: no such phrase, or phrases that
 * disagree. The "a fragrance for ..." phrase is the page's own statement and
 * decides; without it (a title a search engine cut short) a single phrase of
 * the other kind counts, and two different ones do not.
 */
export function genderOfTitle(title: string): PageGender | null {
  const own = TITLE_PHRASE.exec(title);
  if (own) return genderOfWords(own[1]!);
  const found = new Set([...title.matchAll(ANY_PHRASE)].map((m) => genderOfWords(m[1]!)));
  return found.size === 1 ? [...found][0]! : null;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The gender the end of a page's address says ("...-for-women-and-men-12345"), or null. */
export function genderOfAddress(url: string): PageGender | null {
  const parts = parseFragranticaUrl(url);
  if (!parts) return null;
  const m = ADDRESS_PHRASE.exec(`${decodeURIComponentSafe(parts.slug)}-${parts.id}`);
  return m ? genderOfWords(m[1]!.replace(/-/g, ' ')) : null;
}

/**
 * Who a Fragrantica page is for, from one search result: its title and its
 * address. Null when neither says, or when they disagree (nothing is recorded
 * from a contradiction). Null as well for a result that is not a perfume page.
 */
export function pageGenderOfResult(result: SearchResult): { path: string; gender: PageGender } | null {
  const path = fragranticaPath(result.url);
  if (!path) return null;
  const fromTitle = genderOfTitle(result.title);
  const fromAddress = genderOfAddress(result.url);
  if (fromTitle !== null && fromAddress !== null && fromTitle !== fromAddress) return null;
  const gender = fromTitle ?? fromAddress;
  return gender === null ? null : { path, gender };
}

export interface LearnedGenders {
  /** Pages whose gender was not known and is now. */
  added: { path: string; gender: PageGender }[];
  /** Pages the file already had a gender for, where this result says another: left as the file has it. */
  disagreed: { path: string; stored: PageGender; read: PageGender }[];
}

/**
 * The first time a search result shows a Fragrantica page, record who it is
 * for. Adds to the review (and its index, so the very next candidate is held to
 * it) and never overwrites a gender the file already has: a person's reading,
 * or an earlier result's, stands. Results that say nothing add nothing.
 */
export function learnPageGenders(results: readonly SearchResult[], review: FragranticaReview, index: ReviewIndex): LearnedGenders {
  const out: LearnedGenders = { added: [], disagreed: [] };
  for (const r of results) {
    const read = pageGenderOfResult(r);
    if (!read) continue;
    const stored = index.gender.get(read.path);
    if (stored === undefined) {
      index.gender.set(read.path, read.gender);
      review.pageGender[read.path] = read.gender;
      out.added.push(read);
    } else if (stored !== read.gender) {
      out.disagreed.push({ path: read.path, stored, read: read.gender });
    }
  }
  return out;
}

/** Page genders in address order, so a diff shows only what was added. */
export function sortedGenders(pageGender: Readonly<Record<string, PageGender>>): Record<string, PageGender> {
  return Object.fromEntries(Object.entries(pageGender).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * The review as the latest commit has it, plus the page genders this run
 * learned that the latest does not have. Used by the daily workflow, which lays
 * its files on the newest commit: a person's edit made while the job ran (a
 * newly rejected page, a corrected gender) must survive, so everything in
 * `latest` wins and only missing page genders are added.
 */
export function mergePageGenders(latest: FragranticaReview, run: FragranticaReview): FragranticaReview {
  return { ...latest, pageGender: sortedGenders({ ...run.pageGender, ...latest.pageGender }) };
}

/** The file's text: one space indent and no final newline, as it has always been written, page genders in address order. */
export function renderReview(review: FragranticaReview): string {
  return JSON.stringify({ ...review, pageGender: sortedGenders(review.pageGender) }, null, 1);
}
