import { brandKey } from './brandName.js';
import { marketOf } from './brandSiteCheck.js';

/**
 * Deciding whether a URL really is "this perfume's page", on Fragrantica or
 * on the brand's own website. Pure string logic, no network and no DOM, so
 * scripts/resolve-fragrance-links.ts (which finds the candidates) and the
 * demo (which only reads the stored answers) can share one definition and
 * tests/fragranceLinkMatch.test.ts can pin it.
 *
 * ── The rule: a stored link must have been checked, not hoped for ────────────
 * A candidate URL is accepted only when
 *   1. it is on the right site (Fragrantica's /perfume/ tree, or the brand's
 *      own domain — see isOfficialHost),
 *   2. its slug names the same perfume: after concentration words, bottle
 *      sizes, ids and filler are stripped from both sides, the two names are
 *      the same string. Equal, not "contains": "Code" is not "Code Femme" and
 *      "Sauvage" is not "Sauvage Elixir", and a link to the wrong one is worse
 *      than a link to a search page, and
 *   3. the concentration does not contradict it. A page whose slug says
 *      "Eau de Toilette" is never accepted for an Eau de Parfum, and the other
 *      way round.
 *
 * Quality, best first:
 *   exact — the slug states the concentration and it is the one wanted.
 *   base  — the slug states none. Both sites do this for a perfume's main
 *           page ("Sauvage-31861" is the original Sauvage), and it is the page
 *           that covers the product when no concentration-specific one exists.
 *   loose — we do not know the wanted concentration (a retailer never stated
 *           it) and the slug names one.
 */

export interface WantedFragrance {
  brand: string;
  name: string;
  /** The catalogue's concentration label, e.g. "Eau de Parfum"; may be empty. */
  concentration?: string;
}

export type MatchQuality = 'exact' | 'base' | 'loose';

export interface UrlMatch {
  /** Canonical form of the URL: tracking parameters and fragments removed. */
  url: string;
  quality: MatchQuality;
}

export type ConcentrationClass = 'edp' | 'edt' | 'parfum' | 'cologne';

const QUALITY_RANK: Record<MatchQuality, number> = { exact: 3, base: 2, loose: 1 };

/** Best of several matches; the earlier one wins a tie, so search rank breaks it. */
export function bestMatch<T extends { quality: MatchQuality }>(matches: readonly T[]): T | null {
  let best: T | null = null;
  for (const m of matches) {
    if (!best || QUALITY_RANK[m.quality] > QUALITY_RANK[best.quality]) best = m;
  }
  return best;
}

/**
 * How well a brand-site address suits a UK shopper, lower is better: a UK
 * storefront, then a page with no market marker (the brand's one global
 * site), then a US or international English one, then any other country's.
 */
export function marketRank(url: string): number {
  const m = marketOf(url);
  if (m === null) return 1;
  if (m === 'uk' || m === 'gb') return 0;
  if (m === 'us' || m === 'ww' || m === 'int' || m === 'eu') return 2;
  return 3;
}

/**
 * Best of several matches on the brand's own site: the best quality first,
 * then the most UK-appropriate market, then the earlier one. Brands list the
 * same perfume under every country's address; a UK reader should not be sent
 * to the German one.
 */
export function bestOfficialMatch(matches: readonly UrlMatch[]): UrlMatch | null {
  let best: UrlMatch | null = null;
  for (const m of matches) {
    if (!best) best = m;
    else if (QUALITY_RANK[m.quality] > QUALITY_RANK[best.quality]) best = m;
    else if (m.quality === best.quality && marketRank(m.url) < marketRank(best.url)) best = m;
  }
  return best;
}

// ── text folding ───────────────────────────────────────────────────────────

/** Lowercase, accents removed, apostrophes dropped, anything else non-alphanumeric becomes a space. */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Order matters: the long phrases go first so "eau de parfum" is read as one
// concentration rather than as "eau de" plus "parfum".
const EDP_RE = /\b(?:eau de parfum|eau de parfume|edp)\b/g;
const EDT_RE = /\b(?:eau de toilette|edt)\b/g;
const COLOGNE_RE = /\b(?:eau de cologne|edc|cologne)\b/g;
const PARFUM_RE = /\b(?:extrait de parfum|extrait|parfum|pure perfume)\b/g;
const OTHER_CONC_RE = /\b(?:eau fraiche|perfume)\b/g;

/**
 * Which concentration a piece of text states, or null for none, or 'mixed'
 * when it states more than one (so a caller can refuse rather than pick).
 */
export function concentrationClassOf(text: string): ConcentrationClass | 'mixed' | null {
  let t = fold(text);
  const found = new Set<ConcentrationClass>();
  // Each phrase is tested, then removed, so "eau de parfum" is never also
  // counted as a bare "parfum". `has` builds a fresh non-global copy because
  // a global RegExp carries lastIndex between .test() calls.
  const has = (re: RegExp, s: string): boolean => new RegExp(re.source).test(s);
  if (has(EDP_RE, t)) found.add('edp');
  t = t.replace(EDP_RE, ' ');
  if (has(EDT_RE, t)) found.add('edt');
  t = t.replace(EDT_RE, ' ');
  if (has(COLOGNE_RE, t)) found.add('cologne');
  t = t.replace(COLOGNE_RE, ' ');
  if (has(PARFUM_RE, t)) found.add('parfum');
  if (found.size === 0) return null;
  if (found.size > 1) return 'mixed';
  return [...found][0]!;
}

/** The catalogue's own labels. 'Not stated', 'Perfume Oil' and the like say nothing decisive, so null. */
export function wantedConcentration(label: string | undefined): ConcentrationClass | null {
  if (!label) return null;
  const c = concentrationClassOf(label);
  return c === 'mixed' ? null : c;
}

function stripConcentrationWords(folded: string): string {
  return folded
    .replace(EDP_RE, ' ')
    .replace(EDT_RE, ' ')
    .replace(COLOGNE_RE, ' ')
    .replace(PARFUM_RE, ' ')
    .replace(OTHER_CONC_RE, ' ');
}

// Words that carry no identity on either side of a comparison.
const FILLER = new Set(['the', 'and', 'unisex', 'spray', 'fragrance', 'by']);

const SIZE_UNITS = new Set(['ml', 'cl', 'oz', 'floz', 'g', 'gr', 'gm']);

/** A token that looks like a product id rather than a word: "y0998004", "31861". */
function looksLikeId(token: string): boolean {
  return /\d{4,}/.test(token) && /^[a-z0-9]+$/.test(token);
}

/**
 * Brand spellings a slug may lead with besides the catalogue's own. Keyed by
 * brandKey(); values are compacted prefixes that are also stripped.
 */
const BRAND_PREFIX_ALIASES: Record<string, string[]> = {
  rabanne: ['pacorabanne'],
  yvessaintlaurent: ['ysl'],
  giorgioarmani: ['armani'],
  christiandior: ['dior'],
  dior: ['christiandior'],
  jeanpaulgaultier: ['jpg'],
  dolcegabbana: ['dg', 'dolcegabbana'],
  carolinaherrera: ['ch'],
};

/**
 * The compact comparison form of a perfume's name: filler, concentration
 * words, sizes and (when `keepIds` does not contain them) id-looking tokens
 * removed, a leading brand name removed, and the rest joined without spaces so
 * "Bade'e" and "Bade e" meet. Empty means "nothing left to compare" and never
 * matches anything.
 */
export function canonicalName(text: string, brand: string, keepIds: ReadonlySet<string> = new Set()): string {
  const tokens = stripConcentrationWords(fold(text)).split(' ').filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (FILLER.has(t)) continue;
    // "100 ml", "3 4 oz", "100ml": a size, however the slug spaced it.
    if (/^\d+(?:ml|cl|oz|g)$/.test(t)) continue;
    if (SIZE_UNITS.has(t) && kept.length > 0 && /^\d+$/.test(kept[kept.length - 1]!)) {
      kept.pop();
      continue;
    }
    if (looksLikeId(t) && !keepIds.has(t)) continue;
    kept.push(t);
  }
  let compact = kept.join('');
  const bk = brandKey(brand);
  for (const prefix of [bk, ...(BRAND_PREFIX_ALIASES[bk] ?? [])]) {
    if (prefix && compact.startsWith(prefix) && compact.length > prefix.length) {
      compact = compact.slice(prefix.length);
      break;
    }
  }
  return compact;
}

function idTokensOf(text: string): Set<string> {
  return new Set(fold(text).split(' ').filter((t) => looksLikeId(t)));
}

// ── keys ───────────────────────────────────────────────────────────────────

const CONC_KEY: Record<string, string> = {
  eaudeparfum: 'edp',
  eaudetoilette: 'edt',
  extraitdeparfum: 'extrait',
  parfum: 'parfum',
  eaudecologne: 'edc',
  perfumeoil: 'oil',
  aftershave: 'aftershave',
  notstated: 'unstated',
  disputed: 'disputed',
  eaufraiche: 'fraiche',
};

/** brand|name — one perfume, whatever its concentration. */
export function fragranceBaseKey(brand: string, name: string): string {
  return `${brandKey(brand)}|${brandKey(name)}`;
}

/** brand|name|concentration — the unit the links file is keyed on. */
export function fragranceLinkKey(brand: string, name: string, concentration: string): string {
  const ck = brandKey(concentration);
  return `${fragranceBaseKey(brand, name)}|${CONC_KEY[ck] ?? (ck || 'unstated')}`;
}

// ── URL helpers ────────────────────────────────────────────────────────────

const TRACKING_PARAM = /^(?:utm_.*|msockid|gclid|fbclid|variant|ref|srsltid|cmpid|mc_.*)$/i;

/** http(s) only; tracking parameters and fragment removed. Null when unparseable. */
export function cleanUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  return u;
}

// ── Fragrantica ────────────────────────────────────────────────────────────

const FRAGRANTICA_HOST = /^(?:www\.)?fragrantica\.(?:com|es|fr|de|it|ru|pl|nl|ro|br|com\.br|asia|cz|gr|jp|co\.il|net)$/i;
const FRAGRANTICA_PATH = /^\/perfume\/([^/]+)\/([^/]+?)-(\d{1,9})\.html$/i;

export interface FragranticaUrlParts {
  folder: string;
  slug: string;
  id: string;
  /** https://www.fragrantica.com/perfume/<Folder>/<Slug>-<id>.html */
  url: string;
}

/** Split a Fragrantica perfume URL, or null when it is any other kind of page. */
export function parseFragranticaUrl(raw: string): FragranticaUrlParts | null {
  const u = cleanUrl(raw);
  if (!u || !FRAGRANTICA_HOST.test(u.hostname)) return null;
  const m = FRAGRANTICA_PATH.exec(u.pathname);
  if (!m) return null;
  const [, folder, slug, id] = m as unknown as [string, string, string, string];
  return { folder, slug, id, url: `https://www.fragrantica.com/perfume/${folder}/${slug}-${id}.html` };
}

/** Compact "Folder/Slug-id" form the demo stores, and its inverse. */
export function fragranticaPath(url: string): string | null {
  const p = parseFragranticaUrl(url);
  return p ? `${p.folder}/${p.slug}-${p.id}` : null;
}

export function fragranticaUrlFromPath(path: string): string {
  return `https://www.fragrantica.com/perfume/${path}.html`;
}

// Words in a brand name that Fragrantica's folder may add or drop.
const BRAND_FILLER = new Set([
  'the', 'and', 'of', 'de', 'la', 'le', 'perfumes', 'perfume', 'parfums', 'parfum', 'fragrances', 'fragrance',
  'house', 'maison', 'london', 'paris', 'cosmetics', 'beauty', 'co', 'ltd', 'uk', 'usa', 'italia', 'france',
]);

function brandTokens(text: string): string[] {
  const all = fold(decodeSafe(text).replace(/-/g, ' ')).split(' ').filter(Boolean);
  const kept = all.filter((t) => !BRAND_FILLER.has(t));
  return kept.length ? kept : all;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Is a Fragrantica brand folder ("Lattafa-Perfumes", "Paco-Rabanne") the
 * catalogue's brand ("Lattafa", "Rabanne")? Equal token sets, or one a subset
 * of the other by at most two extra words. "Emporio Armani" is not "Giorgio
 * Armani": neither contains the other.
 */
export function brandMatchesFolder(brand: string, folder: string): boolean {
  const a = brandTokens(brand);
  const b = brandTokens(folder);
  if (a.length === 0 || b.length === 0) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!short.every((t) => long.includes(t))) {
    // "Hermès" against "Hermes", "Estée Lauder" against "Estee-Lauder" are
    // already equal after folding. What is left is a spelling that differs
    // only by spacing: "Al Haramain" against "Alharamain".
    return a.join('') === b.join('');
  }
  return long.length - short.length <= 2;
}

const FRAICHE_RE = /\beau fraiche\b/;

/**
 * A page that states no concentration ("Sauvage-31861") is the perfume's main
 * page, and may stand for the other strengths of the same name only where
 * Fragrantica has no page of its own for them. It cannot stand for a variant
 * Fragrantica always lists separately: a Parfum, an Extrait, a Cologne, an Eau
 * Fraiche. "Black Orchid Parfum" is not on the "Black Orchid" page, nor "Eros
 * Parfum" on "Eros-16657", and a link that lands on the wrong strength's page
 * is worse than a link to a search (audit of 2026-10-05).
 */
export function baseMayStandFor(wanted: WantedFragrance): boolean {
  const named = concentrationClassOf(wanted.name);
  if (named !== null) return false; // the name itself says Parfum / Cologne / ... ("mixed" included)
  const c = wantedConcentration(wanted.concentration);
  return c === null || c === 'edp' || c === 'edt';
}

export interface FragranticaMatchOptions {
  /**
   * The page is known (a person confirmed it, see data/fragrantica-link-review.json) to be the
   * only Fragrantica page for this perfume whatever its strength, so a page that states no
   * concentration may stand for a Parfum or an Extrait too. Never set from a guess.
   */
  singlePage?: boolean;
}

/** Does this Fragrantica URL belong to the wanted perfume? */
export function matchFragranticaUrl(rawUrl: string, wanted: WantedFragrance, opts: FragranticaMatchOptions = {}): UrlMatch | null {
  const parts = parseFragranticaUrl(rawUrl);
  if (!parts) return null;
  if (!brandMatchesFolder(wanted.brand, parts.folder)) return null;
  const slugText = decodeSafe(parts.slug).replace(/-/g, ' ');
  const keep = idTokensOf(wanted.name);
  const want = canonicalName(wanted.name, wanted.brand, keep);
  const have = canonicalName(slugText, wanted.brand, keep);
  if (!want || want !== have) return null;
  // "Eau Fraiche" is stripped from both names above as a concentration word, so it is compared here:
  // both sides state it, or neither does.
  if (FRAICHE_RE.test(fold(wanted.name)) !== FRAICHE_RE.test(fold(slugText))) return null;
  const named = concentrationClassOf(wanted.name);
  const wantedConc = named !== null && named !== 'mixed' ? named : wantedConcentration(wanted.concentration);
  const pageConc = concentrationClassOf(slugText);
  const quality = concentrationQuality(pageConc, wantedConc);
  if (quality === 'base' && !opts.singlePage && !baseMayStandFor(wanted)) return null;
  // Strength not known, page says Parfum / Extrait / Cologne and the name does not: that page is a
  // different, stronger product, not the one a shop listed without saying (Escentric 02, not stated,
  // is not "Escentric 02 Extrait").
  if (quality === 'loose' && (pageConc === 'parfum' || pageConc === 'cologne') && named === null) return null;
  return quality ? { url: parts.url, quality } : null;
}

function concentrationQuality(
  pageConc: ConcentrationClass | 'mixed' | null,
  wantedConc: ConcentrationClass | null,
): MatchQuality | null {
  if (pageConc === 'mixed') return null;
  if (pageConc === null) return 'base';
  if (wantedConc === null) return 'loose';
  return pageConc === wantedConc ? 'exact' : null;
}

// ── The brand's own website ────────────────────────────────────────────────

const SECOND_LEVEL = new Set(['co.uk', 'org.uk', 'com.au', 'co.za', 'com.br', 'co.in', 'com.tr', 'co.nz', 'com.sg', 'co.jp', 'com.mx', 'com.hk', 'com.cn']);

// A brand's own site often exists on several country domains
// (yslbeauty.co.uk, yslbeauty.com, yslbeauty.fr). Same name on one of these
// is the same site; the same name on anything else is not assumed to be.
const COUNTRY_TLDS = new Set([
  'com', 'co.uk', 'uk', 'eu', 'fr', 'de', 'it', 'es', 'nl', 'be', 'ch', 'at', 'ie', 'se', 'dk', 'no', 'fi', 'pt', 'pl', 'ae', 'sa',
  'us', 'ca', 'com.au', 'au', 'in', 'co.in', 'jp', 'co.jp', 'cn', 'hk', 'com.hk', 'sg', 'com.sg', 'ru', 'tr', 'com.tr', 'br', 'com.br', 'mx', 'com.mx', 'za', 'co.za', 'nz', 'co.nz', 'net', 'org', 'global', 'shop', 'store', 'co',
]);

function domainOf(host: string): { label: string; tld: string } | null {
  const labels = host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '').split('.');
  if (labels.length < 2) return null;
  const last2 = labels.slice(-2).join('.');
  if (labels.length >= 3 && SECOND_LEVEL.has(last2)) return { label: labels[labels.length - 3]!, tld: last2 };
  return { label: labels[labels.length - 2]!, tld: labels[labels.length - 1]! };
}

/**
 * Is `host` the brand's own site, given the brand's registered website? The
 * registrable domain must be the same, or the same name on another common
 * country domain. A subdomain ("uk.afnan.com" for afnan.com) is the same
 * site; a different name never is, whatever the page claims to be.
 */
export function isOfficialHost(host: string, siteUrl: string): boolean {
  let siteHost: string;
  try {
    siteHost = new URL(siteUrl).hostname;
  } catch {
    return false;
  }
  const a = domainOf(host);
  const b = domainOf(siteHost);
  if (!a || !b) return false;
  if (a.label !== b.label) return false;
  return a.tld === b.tld || (COUNTRY_TLDS.has(a.tld) && COUNTRY_TLDS.has(b.tld));
}

// Pages on a brand's site that list or describe things rather than being one.
const NOT_A_PRODUCT_PAGE =
  /^(?:collections?|categor(?:y|ies)|search|blogs?|news|tags?|brands?|stores?|store-locator|account|cart|checkout|wishlist|gift-?cards?|pages?|journal|stories|sale|offers|discover|help|customer-service|login|register|sitemap)$/i;

const LOCALE_SEGMENT = /^(?:[a-z]{2,3}[-_][a-z]{2}|[a-z]{2})$/i;

/**
 * Does this look like a specific perfume's page on the brand's site, and does
 * its slug name the wanted perfume? `site` is the brand's registered website
 * (demo/brandSites.ts); the host must be that site, never another shop's.
 */
export function matchOfficialUrl(rawUrl: string, wanted: WantedFragrance, siteUrl: string): UrlMatch | null {
  const u = cleanUrl(rawUrl);
  if (!u || !isOfficialHost(u.hostname, siteUrl)) return null;
  const segments = u.pathname.split('/').filter(Boolean).map(decodeSafe);
  const meaningful = segments.filter((s, i) => !(i === 0 && LOCALE_SEGMENT.test(s)));
  if (meaningful.length === 0) return null;
  if (meaningful.some((s) => NOT_A_PRODUCT_PAGE.test(s))) return null;

  const keep = idTokensOf(wanted.name);
  const want = canonicalName(wanted.name, wanted.brand, keep);
  if (!want) return null;
  const wantedConc = wantedConcentration(wanted.concentration);

  // The product slug is the last segment; some sites end in an id segment
  // ("/p/sauvage/12345"), so fall back to the one before it.
  for (let i = meaningful.length - 1; i >= Math.max(0, meaningful.length - 2); i--) {
    const slug = meaningful[i]!.replace(/\.(?:html?|php|aspx?|jsp)$/i, '').replace(/[-_]+/g, ' ');
    const have = canonicalName(slug, wanted.brand, keep);
    if (!have) continue;
    if (have !== want) return null;
    const quality = concentrationQuality(concentrationClassOf(slug), wantedConc);
    if (!quality) return null;
    return { url: u.toString(), quality };
  }
  return null;
}

// ── search result and sitemap parsing ──────────────────────────────────────

export interface SearchResult {
  url: string;
  title: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Bing wraps each result link in bing.com/ck/a?...&u=a1<base64url of the real
 * address>. Unwrap it; a link that is not wrapped is returned as it is.
 */
export function unwrapBingLink(href: string): string | null {
  const link = decodeEntities(href);
  let u: URL;
  try {
    u = new URL(link, 'https://www.bing.com');
  } catch {
    return null;
  }
  if (!/(^|\.)bing\.com$/i.test(u.hostname)) return link;
  const packed = u.searchParams.get('u');
  if (!packed || !/^a1/.test(packed)) return null;
  try {
    const decoded = Buffer.from(packed.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return /^https?:\/\//.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** The organic results on a Bing results page, in rank order. */
export function parseBingResults(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const block of html.split('<li class="b_algo').slice(1)) {
    const a = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!a) continue;
    const url = unwrapBingLink(a[1]!);
    if (!url) continue;
    out.push({ url, title: decodeEntities(a[2]!.replace(/<[^>]+>/g, '')).trim() });
  }
  return out;
}

/** True when Bing answered with a challenge or an error page instead of results. */
export function looksBlocked(html: string): boolean {
  return /captcha|unusual traffic|are you a robot|verify you are a human/i.test(html) && !/b_algo/.test(html);
}

export interface Sitemap {
  kind: 'index' | 'urlset';
  locs: string[];
}

/** The `<loc>` entries of a sitemap or sitemap index. */
export function parseSitemap(xml: string): Sitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? 'index' : 'urlset';
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
  for (let m = re.exec(xml); m; m = re.exec(xml)) locs.push(decodeEntities(m[1]!));
  return { kind, locs };
}
