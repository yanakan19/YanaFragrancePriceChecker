import { brandKey } from './brandName.js';
import {
  matchFragranticaUrl,
  fragranticaPath,
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
 *               title in a search result. A men's perfume is never sent to a
 *               page "for women", or the other way round, where the catalogue
 *               knows the product's gender.
 *
 * Nothing here is written by a script that guesses: every entry was read off a
 * search result for that exact page. The file only ever grows by review.
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
  gender: ReadonlyMap<string, PageGender>;
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
  /** The catalogue's gender for the product, where it knows one. */
  gender?: 'mens' | 'womens' | 'unisex' | null | undefined;
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
