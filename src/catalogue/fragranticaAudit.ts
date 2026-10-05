import { brandMatchesFolder, fold, parseFragranticaUrl } from './fragranceLinkMatch.js';
import { matchFragranticaChecked, NO_REVIEW_INDEX, reviewRefusal, type ReviewIndex } from './fragranticaReview.js';

/**
 * The audit of a stored or rendered Fragrantica link, with no network: is the
 * URL's shape a perfume page, and does the designer and perfume name in it
 * belong to the product it is shown on? Used by scripts/audit-fragrantica-links.ts
 * (the report), by scripts/resolve-fragrance-links.ts (an entry that fails is
 * dropped on load and never written) and by tests/fragranticaLinkData.test.ts
 * (every stored link, every run).
 *
 * It is deliberately a second opinion on top of matchFragranticaUrl, the rule
 * the resolver accepts a candidate by: that rule says "the folder is this
 * brand, within two words" and "the names are the same string"; this one adds
 * the checks that matter for a wrong page: the designer folder must be the
 * brand and not a sub-line of it, the gender the page names must not
 * contradict the product's, and a leftover word on either side is raised for a
 * person rather than waved through.
 */

export type LinkClass = 'direct' | 'search' | 'malformed';

const FRAGRANTICA_ANY_HOST = /^(?:www\.|m\.)?fragrantica\.[a-z.]+$/i;
const DIRECT_PATH = /^\/perfume\/[^/]+\/[^/]+-\d{1,9}\.html$/i;
const SEARCH_PATH = /^\/(?:search|busca|buscar|cautare|parfemi|suche|szukaj|zoeken|recherche|ricerca|designers?)(?:\/|\.html|$)/i;

/** Direct perfume page, a search or designer index page, or anything else. */
export function classifyFragranticaUrl(raw: string): LinkClass {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'malformed';
  }
  if (u.protocol !== 'https:' || !FRAGRANTICA_ANY_HOST.test(u.hostname)) return 'malformed';
  if (u.search !== '' || SEARCH_PATH.test(u.pathname)) return 'search';
  if (DIRECT_PATH.test(u.pathname) && u.hash === '') return 'direct';
  return 'malformed';
}

export interface AuditWanted {
  brand: string;
  name: string;
  concentration?: string;
  gender?: 'mens' | 'womens' | 'unisex' | null;
}

export interface LinkAudit {
  verdict: 'match' | 'review' | 'mismatch';
  reasons: string[];
}

// Words that say nothing about which perfume it is.
const DROP = new Set([
  'the', 'and', 'for', 'by', 'of', 'de', 'la', 'le', 'les', 'du', 'des', 'et', 'pour', 'a', 'in', 'unisex', 'spray', 'fragrance', 'edition',
  'limited', 'new', 'ml', 'cl', 'oz',
]);
const MALE = new Set(['men', 'man', 'homme', 'him', 'male', 'uomo', 'hombre', 'mens', 'masculine']);
const FEMALE = new Set(['women', 'woman', 'femme', 'her', 'female', 'donna', 'mujer', 'womens', 'feminine', 'lady']);

function wordsOf(text: string): string[] {
  return fold(text.replace(/-/g, ' '))
    .split(' ')
    .filter((t) => t && !DROP.has(t) && !/^\d+(?:ml|cl|oz|g)$/.test(t));
}

function genderWords(words: string[]): 'male' | 'female' | 'both' | null {
  const m = words.some((w) => MALE.has(w));
  const f = words.some((w) => FEMALE.has(w));
  return m && f ? 'both' : m ? 'male' : f ? 'female' : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// Folder spellings that are the brand under another name.
const FOLDER_TOKEN_FILLER = new Set(['perfumes', 'perfume', 'parfums', 'parfum', 'fragrances', 'fragrance', 'the', 'and', 'of']);

function folderTokens(text: string): string[] {
  return wordsOf(safeDecode(text)).filter((t) => !FOLDER_TOKEN_FILLER.has(t));
}

export function auditFragranticaLink(url: string, wanted: AuditWanted, reviewIndex: ReviewIndex = NO_REVIEW_INDEX): LinkAudit {
  const reasons: string[] = [];
  if (classifyFragranticaUrl(url) !== 'direct') return { verdict: 'mismatch', reasons: ['not a perfume page'] };
  const parts = parseFragranticaUrl(url);
  if (!parts) return { verdict: 'mismatch', reasons: ['unparseable perfume URL'] };

  // 1. the rule the resolver uses: same brand folder, same name, no concentration contradiction
  if (!brandMatchesFolder(wanted.brand, parts.folder)) reasons.push(`designer "${safeDecode(parts.folder)}" is not "${wanted.brand}"`);
  const checked = { brand: wanted.brand, name: wanted.name, concentration: wanted.concentration ?? '', gender: wanted.gender ?? null };
  const refused = reviewRefusal(url, checked, reviewIndex);
  if (refused) return { verdict: 'mismatch', reasons: [refused] };
  const match = matchFragranticaChecked(url, checked, reviewIndex);
  if (!match && reasons.length === 0) {
    reasons.push(`name "${safeDecode(parts.slug).replace(/-/g, ' ')}" is not "${wanted.name}", its concentration contradicts, or a page that names no strength cannot stand for a ${wanted.concentration || 'stronger'} product`);
  }
  if (reasons.length) return { verdict: 'mismatch', reasons };

  // 2. gender the page names against the product's
  const slugWords = wordsOf(safeDecode(parts.slug));
  const nameWords = wordsOf(wanted.name);
  const pageGender = genderWords(slugWords);
  const nameGender = genderWords(nameWords);
  if (pageGender && nameGender && pageGender !== nameGender) {
    return { verdict: 'mismatch', reasons: [`page is for ${pageGender}, product name says ${nameGender}`] };
  }
  const productGender = wanted.gender ?? null;
  if (pageGender && productGender) {
    const clash = (pageGender === 'male' && productGender === 'womens') || (pageGender === 'female' && productGender === 'mens');
    if (clash) return { verdict: 'mismatch', reasons: [`page is for ${pageGender}, product is ${productGender}`] };
  }

  // 3. things the rule lets through that a person should look at
  const review: string[] = [];
  const brandCompact = folderTokens(wanted.brand).join('');
  const folderCompact = folderTokens(parts.folder).join('');
  if (brandCompact !== folderCompact) {
    review.push(`designer folder "${safeDecode(parts.folder)}" is not spelled like brand "${wanted.brand}"`);
  }
  // "Eau Fraiche" is its own product on Fragrantica as often as not, and a page that does not say so is probably the original.
  if (/\beau fraiche\b/.test(fold(wanted.name)) && !/\bfraiche\b/.test(fold(safeDecode(parts.slug).replace(/-/g, ' ')))) {
    review.push('product is an Eau Fraiche, the page names no Eau Fraiche');
  }
  // A year in the page name tells two releases of one name apart; the rule ignores it.
  const year = /(?:^|-)((?:19|20)\d{2})(?:-|$)/.exec(parts.slug);
  if (year && !fold(wanted.name).split(' ').includes(year[1]!)) review.push(`page name carries the year ${year[1]}`);
  return review.length ? { verdict: 'review', reasons: review } : { verdict: 'match', reasons: [] };
}
