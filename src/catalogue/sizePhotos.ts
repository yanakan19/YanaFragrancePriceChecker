/**
 * One picture for every size (owner request, 21 Oct 2026).
 *
 * Some shops show the identical picture for every size of a fragrance:
 * Lookfantastic's Rabanne 1 Million Night Elixir 50ml and 100ml. A product here
 * is one size of a fragrance, and its photo is chosen on its own
 * (src/catalogue/pickImage.ts), so sizes that take their photo from the same
 * shop end up with the same picture. Many brands genuinely use one bottle shot
 * for every size, so the same picture is not an error by itself. The rule:
 *
 *   when several sizes of one fragrance (same brand, name and strength) show
 *   the same picture, AND another shop has a photo of that exact size that
 *   differs from the picture the other sizes show, that size takes the other
 *   shop's photo; otherwise it keeps the one it has.
 *
 * "The same picture" is the same address, or the same address with only a size
 * or width parameter different (`?width=600` against `?width=3000`, a Shopify
 * `_100x` suffix). A picture whose file name names one of the sizes
 * (`...-50ml.jpg`) stays with that size. A candidate must pass the caller's
 * test (never a thumbnail, never a box beside the bottle), and must differ
 * from every picture the other sizes show, so a switch never makes two sizes
 * the same again.
 */
import type { ImageCandidate } from './pickImage.js';

/** Query parameters that only change how big or how fresh the same file is. */
const SIZE_PARAMS = new Set([
  'w', 'h', 'width', 'height', 'size', 'sz', 'quality', 'q', 'fit', 'fmt', 'format', 'crop', 'dpr', 'resize', 'scale', 'v', 'version',
]);

/** A Shopify rendition suffix before the extension: `_100x`, `_600x600`, `_large`, `_grande`. */
const SHOPIFY_RENDITION = /_(?:\d+x\d*|x\d+|pico|icon|thumb|small|compact|medium|large|grande|master)(?=\.[a-z0-9]+$)/i;

/**
 * The picture an address names, without the parts that only choose its size:
 * the host, the path with a Shopify rendition suffix removed, and the query
 * without size, quality and version parameters.
 */
export function pictureKey(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim().toLowerCase();
  }
  const path = u.pathname.replace(SHOPIFY_RENDITION, '').toLowerCase();
  const query = [...u.searchParams.entries()]
    .filter(([k]) => !SIZE_PARAMS.has(k.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .sort()
    .join('&');
  return `${u.hostname.toLowerCase().replace(/^www\./, '')}${path}${query ? `?${query}` : ''}`;
}

/** The size in millilitres a picture's file name names (`...-50ml.jpg`, `_100_ml`), or null. */
export function sizeNamedInFile(url: string): number | null {
  let name = url;
  try {
    name = new URL(url).pathname;
  } catch {
    // Not an absolute address: read it as it is.
  }
  const last = name.slice(name.lastIndexOf('/') + 1).toLowerCase();
  const m = /(?:^|[^0-9])(\d{1,4}(?:[.,]\d)?)[-_ ]?ml(?![a-z])/.exec(last);
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

export interface SizePhotoProduct {
  id: string;
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number | null;
  giftSet?: unknown;
  offers: readonly ImageCandidate[];
}

const fold = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The key sizes of one fragrance share, or null for a product that has no size or is a gift set. */
export function fragranceKey(p: Pick<SizePhotoProduct, 'brand' | 'name' | 'concentration' | 'sizeMl' | 'giftSet'>): string | null {
  if (p.giftSet || p.sizeMl === null || !(p.sizeMl > 0)) return null;
  return `${fold(p.brand)}|${fold(p.name)}|${fold(p.concentration)}`;
}

export interface SizePhotoOptions {
  /** The photo the caller's rules choose among these offers (pickImage), or null. */
  pick: (offers: readonly ImageCandidate[]) => string | null;
  /** Whether an offer's photo may replace one: not a thumbnail, not a box beside the bottle. */
  eligible: (offer: ImageCandidate) => boolean;
}

export interface SizePhotoResult {
  /** Every product's photo after the rule. */
  picks: Map<string, string | null>;
  /** The ids that took another shop's photo. */
  changed: string[];
}

/** Applies the rule above to the photos already chosen, one product at a time. Pure. */
export function distinctSizePhotos(
  products: readonly SizePhotoProduct[],
  picked: ReadonlyMap<string, string | null>,
  options: SizePhotoOptions,
): SizePhotoResult {
  const picks = new Map(picked);
  const changed: string[] = [];
  const groups = new Map<string, SizePhotoProduct[]>();
  for (const p of products) {
    const key = fragranceKey(p);
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    if (new Set(group.map((p) => p.sizeMl)).size < 2) continue;
    const ordered = [...group].sort((a, b) => a.sizeMl! - b.sizeMl! || (a.id < b.id ? -1 : 1));
    const byPicture = new Map<string, SizePhotoProduct[]>();
    for (const p of ordered) {
      const url = picks.get(p.id);
      if (!url) continue;
      const key = pictureKey(url);
      byPicture.set(key, [...(byPicture.get(key) ?? []), p]);
    }
    for (const [shared, sharing] of byPicture) {
      if (new Set(sharing.map((p) => p.sizeMl)).size < 2) continue;
      for (const p of sharing) {
        // The picture the file name gives to this size stays with it.
        if (sizeNamedInFile(picks.get(p.id)!) === p.sizeMl) continue;
        const inUse = new Set<string>();
        for (const q of group) {
          const url = picks.get(q.id);
          if (q.id !== p.id && url) inUse.add(pictureKey(url));
        }
        const candidates = p.offers.filter((o) => {
          if (o.imageUrl === null || !options.eligible(o)) return false;
          const key = pictureKey(o.imageUrl);
          return key !== shared && !inUse.has(key);
        });
        if (candidates.length === 0) continue;
        const alt = options.pick(candidates);
        if (alt === null || pictureKey(alt) === shared || inUse.has(pictureKey(alt))) continue;
        picks.set(p.id, alt);
        changed.push(p.id);
      }
    }
  }
  return { picks, changed };
}
