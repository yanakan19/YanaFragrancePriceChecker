/**
 * Product addresses: pricesniffs.space/BRAND_NAME_VOLUME.
 *
 * The rule, the collision handling and the reasons are written down in
 * docs/PRODUCT-URLS.md; this module is the code that doc describes, with no
 * catalogue and no DOM in it, so the build, the page, the scripts and the tests
 * all use the one copy.
 *
 * Two halves:
 *
 *   - `assignSlugs` gives every product a slug, once. The slugs already given
 *     (data/product-slugs.json, read back by the build) are kept whatever the
 *     product is called now: an address that has been published, shared or
 *     indexed never moves. Only a product with no slug yet is given one.
 *
 *   - `isProductSlug` is the shape test the router uses to tell a product
 *     address from the site's own single word routes. A slug has at least two
 *     underscores and ends in a volume, and no route has an underscore at all,
 *     so the two can never be confused (tests/productSlug.test.ts proves it
 *     against the router's own tables).
 */

/** The facts of a product a slug is built from. */
export interface SlugProduct {
  id: string;
  brand: string;
  name: string;
  /** The product's strength as the catalogue words it ("Eau de Parfum"). */
  concentration: string;
  /** Null for a gift set and for a product whose shops disagree about the size. */
  sizeMl: number | null;
  giftSet: boolean;
}

/** Id to slug: what data/product-slugs.json holds. */
export interface SlugFile {
  slugs: Record<string, string>;
}

/** The last part of every product slug: 100ml, 7p5ml, set or nosize. */
export const VOLUME_PART_RE = /^(?:\d+(?:p\d+)?ml|set|nosize)$/;

/** The shape of a product slug: three or more parts of a to z and 0 to 9, joined by single underscores. */
export const PRODUCT_SLUG_RE = /^[a-z0-9]+(?:_[a-z0-9]+){2,}$/;

/**
 * Words that are a route of the site, or a file at the root of the published
 * folder. A slug is never one of them. Not needed for the proof (none of them
 * has an underscore, a slug has two or more) but kept so assignSlugs refuses
 * one outright, and so the test can read the router's own tables against it.
 */
export const RESERVED_WORDS: readonly string[] = [
  'search', 'deals', 'explore', 'about', 'brands', 'retailers', 'notes', 'settings', 'account',
  'suggestions', 'design', 'developer', 'legal', 'oils', 'sets', 'fragrance', 'fragrances', 'gift-sets', 'index', '404',
  'sw', 'robots', 'sitemap', 'ads', 'manifest', 'favicon', 'cname', 'icons', 'data', 'logos', 'guides',
  // Region prefixes (src/config/regions.ts): /us/ and /in/, and /uk/ kept free.
  'us', 'in', 'uk',
];

/** True for a string that has the shape of a product address, whatever it names. */
export function isProductSlug(text: string): boolean {
  if (!PRODUCT_SLUG_RE.test(text)) return false;
  const last = text.slice(text.lastIndexOf('_') + 1);
  return VOLUME_PART_RE.test(last);
}

/** Letters the Unicode decomposition leaves whole, folded by hand. */
const HAND_FOLDED: Record<string, string> = {
  ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l', ð: 'd', þ: 'th', ı: 'i',
};

/**
 * Text as underscore joined lower case words: accents folded, apostrophes
 * dropped, "&" as "and", every other run of characters outside a to z and 0 to
 * 9 a single underscore. May be empty (a name with no Latin letter in it).
 */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ßæœøđłðþı]/g, (c) => HAND_FOLDED[c] ?? c)
    .replace(/['‘’ʼ`´]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The brand and name together are cut at a part boundary to this many characters. */
export const BRAND_NAME_MAX = 80;

/** The volume part: 100ml, 7p5ml, set or nosize. */
export function volumePart(p: Pick<SlugProduct, 'sizeMl' | 'giftSet'>): string {
  if (p.giftSet) return 'set';
  const ml = p.sizeMl;
  if (ml === null || !Number.isFinite(ml) || ml <= 0) return 'nosize';
  // 7.5 is 7p5. Trailing zeros of a fraction carry no meaning.
  const text = String(Math.round(ml * 1000) / 1000);
  return `${text.replace('.', 'p')}ml`;
}

/** The strength token a collision adds: edp, edt, extrait and so on. */
export function strengthToken(concentration: string): string {
  switch (concentration) {
    case 'Eau de Parfum': return 'edp';
    case 'Eau de Toilette': return 'edt';
    case 'Extrait de Parfum': return 'extrait';
    case 'Parfum': return 'parfum';
    case 'Eau de Cologne': return 'cologne';
    case 'Perfume Oil': return 'oil';
    case 'Aftershave': return 'aftershave';
    case 'Eau Fraiche': return 'fraiche';
    case 'Attar': return 'attar';
    case 'Not stated': return 'unstated';
    case 'Disputed': return 'disputed';
    default: return foldText(concentration) || 'unstated';
  }
}

/** The brand part, the name part and the volume part of a product's first choice of slug. */
export function slugParts(p: SlugProduct): { brand: string; name: string; volume: string } {
  const brand = foldText(p.brand) || 'brand';
  let nameTokens = foldText(p.name).split('_').filter(Boolean);

  // "Lacoste | Lacoste Red" reads lacoste_red, not lacoste_lacoste_red.
  const brandTokens = brand.split('_');
  if (
    nameTokens.length > brandTokens.length &&
    brandTokens.every((t, i) => nameTokens[i] === t)
  ) {
    nameTokens = nameTokens.slice(brandTokens.length);
  }

  // The volume part of a gift set says "set", so a name ending "gift set" or
  // "set" does not end set_set.
  if (p.giftSet) {
    if (nameTokens.at(-1) === 'set') nameTokens.pop();
    if (nameTokens.at(-1) === 'gift') nameTokens.pop();
    if (nameTokens.length === 0) nameTokens = ['gift'];
  }
  if (nameTokens.length === 0) nameTokens = ['product'];

  // Cut at a part boundary; the first part of the name is always kept.
  const room = Math.max(1, BRAND_NAME_MAX - brand.length - 1);
  const kept: string[] = [];
  let used = 0;
  for (const t of nameTokens) {
    const next = used + (kept.length ? 1 : 0) + t.length;
    if (kept.length > 0 && next > room) break;
    kept.push(t);
    used = next;
  }
  // A cut should not leave "and" hanging on the end.
  while (kept.length > 1 && kept.at(-1) === 'and') kept.pop();
  // A single part longer than the room is cut hard, not left to run on.
  if (kept.length === 1 && kept[0]!.length > room) kept[0] = kept[0]!.slice(0, room);

  return { brand, name: kept.join('_'), volume: volumePart(p) };
}

function join(parts: { brand: string; name: string; volume: string }, middle: string[] = []): string {
  return [parts.brand, parts.name, ...middle, parts.volume].join('_');
}

/** A product's first choice of slug: brand, name and volume. */
export function baseSlug(p: SlugProduct): string {
  return join(slugParts(p));
}

/** The same with the strength in front of the volume. */
export function strengthSlug(p: SlugProduct): string {
  return join(slugParts(p), [strengthToken(p.concentration)]);
}

/** The same with a version in front of the volume, `n` being 2 or more. */
export function versionSlug(p: SlugProduct, n: number): string {
  return join(slugParts(p), [strengthToken(p.concentration), `v${n}`]);
}

const RESERVED = new Set(RESERVED_WORDS);

/** Throws for a slug that is not a product address or is one of the site's own words. */
export function assertUsableSlug(slug: string, id: string): void {
  if (!isProductSlug(slug) || RESERVED.has(slug)) {
    throw new Error(`product slug "${slug}" for ${id} is not a usable product address`);
  }
}

export interface AssignStats {
  /** Products that kept the slug an earlier build gave them. */
  kept: number;
  /** Products given a slug by this build. */
  fresh: number;
  /** Of those, how many took their plain brand, name and volume. */
  plain: number;
  /** Of those, how many needed the strength (a collision). */
  withStrength: number;
  /** Of those, how many needed a version as well (a collision the strength did not settle). */
  withVersion: number;
}

export interface AssignResult {
  /** Every slug ever given, including the slugs of products no longer in `products`. Sorted by id. */
  slugs: Record<string, string>;
  stats: AssignStats;
}

/**
 * The slug of every product, never changing one already given.
 *
 * `previous` is what the last build recorded. Every entry stays, including the
 * ones for products that are not in `products` now (merged away, delisted):
 * their slugs stay reserved, so a later product can never take an address that
 * an old link may still carry.
 *
 * For a product with no slug yet, in order of id (so the same inputs always
 * give the same answer):
 *   1. its plain slug, when it is the only product wanting it and it is free;
 *   2. otherwise the strength form, for every product that wanted the plain one;
 *   3. otherwise, for those still sharing one, the first by id keeps the strength
 *      form and the others take v2, v3 and so on.
 * Plain slugs are settled for the whole batch before any strength form, so a
 * strength form can never take an address that another product's plain slug
 * wanted.
 */
export function assignSlugs(previous: Readonly<Record<string, string>>, products: readonly SlugProduct[]): AssignResult {
  const slugs: Record<string, string> = { ...previous };
  const taken = new Set<string>(Object.values(previous));
  const stats: AssignStats = { kept: 0, fresh: 0, plain: 0, withStrength: 0, withVersion: 0 };

  const wanting = new Map<string, SlugProduct[]>();
  const seen = new Set<string>();
  for (const p of [...products].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (Object.prototype.hasOwnProperty.call(previous, p.id)) {
      stats.kept++;
      continue;
    }
    const base = baseSlug(p);
    const group = wanting.get(base);
    if (group) group.push(p);
    else wanting.set(base, [p]);
  }

  const give = (p: SlugProduct, slug: string): void => {
    assertUsableSlug(slug, p.id);
    slugs[p.id] = slug;
    taken.add(slug);
    stats.fresh++;
  };

  const bases = [...wanting.keys()].sort();
  const collided: SlugProduct[][] = [];
  for (const base of bases) {
    const group = wanting.get(base)!;
    if (group.length === 1 && !taken.has(base)) {
      give(group[0]!, base);
      stats.plain++;
    } else {
      collided.push(group);
    }
  }

  for (const group of collided) {
    const byStrength = new Map<string, SlugProduct[]>();
    for (const p of group) {
      const s = strengthSlug(p);
      const list = byStrength.get(s);
      if (list) list.push(p);
      else byStrength.set(s, [p]);
    }
    for (const s of [...byStrength.keys()].sort()) {
      let version = 1;
      for (const p of byStrength.get(s)!) {
        let candidate = version === 1 ? s : versionSlug(p, version);
        while (taken.has(candidate)) {
          version++;
          candidate = versionSlug(p, version);
        }
        give(p, candidate);
        if (version === 1) stats.withStrength++;
        else stats.withVersion++;
        version++;
      }
    }
  }

  const sorted: Record<string, string> = {};
  for (const id of Object.keys(slugs).sort()) sorted[id] = slugs[id]!;
  assertSlugsAppendOnly(previous, sorted);
  return { slugs: sorted, stats };
}

/**
 * Throws if `next` lost a slug of `previous`, gave an id another slug, or gave
 * one slug to two ids. A published address is never removed or reassigned
 * (docs/PRODUCT-URLS.md section 3); assignSlugs calls this before it returns.
 */
export function assertSlugsAppendOnly(previous: Readonly<Record<string, string>>, next: Readonly<Record<string, string>>): void {
  const bad: string[] = [];
  for (const [id, slug] of Object.entries(previous)) {
    if (!Object.prototype.hasOwnProperty.call(next, id)) bad.push(`${id} lost`);
    else if (next[id] !== slug) bad.push(`${id} ${slug} -> ${next[id]}`);
  }
  const owner = new Map<string, string>();
  for (const [id, slug] of Object.entries(next)) {
    const other = owner.get(slug);
    if (other !== undefined) bad.push(`${slug} given to ${other} and ${id}`);
    else owner.set(slug, id);
  }
  if (bad.length) throw new Error(`data/product-slugs.json is append only, one id to one slug: ${bad.slice(0, 5).join('; ')} (${bad.length} in all)`);
}

/**
 * The slugs that were given to products now folded into another: each slug and
 * the id of the product that holds it now, so the old address opens it.
 *
 * `idAliases` is the build's id aliases (absorbed id to the id that holds it),
 * and `isPage` says whether an id is a page (in the catalogue, or a page with no
 * current prices). A slug of an id that is a page is that page's own, never an
 * alias; a slug whose id is gone with no alias answers Page Not Found.
 */
export function slugAliases(
  slugs: Readonly<Record<string, string>>,
  idAliases: Readonly<Record<string, string>>,
  isPage: (id: string) => boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(slugs).sort()) {
    if (isPage(id)) continue;
    let target = idAliases[id];
    // Aliases are settled to a page by the build, but follow a short chain anyway.
    for (let hop = 0; target !== undefined && !isPage(target) && hop < 12; hop++) target = idAliases[target];
    if (target !== undefined && isPage(target)) out[slugs[id]!] = target;
  }
  return out;
}
