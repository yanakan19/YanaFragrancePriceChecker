/**
 * Product imagery.
 *
 * Real product photography only ever comes from a retailer whose programme
 * has actually confirmed we may use it — currently that is Fragrance Click
 * UK alone (see AffiliateConfig.imageUsageConfirmed in src/types/retailer.ts
 * and the Terms clause quoted in src/config/retailers.ts). Every other
 * listing, including the four shops reached by free sitemap scraping, has no
 * usage right over its own product photos: scraped images carry no licence
 * at all, only an approved affiliate feed grants one.
 *
 * So there are exactly two states a product can be in, never a third
 * invented one: a licensed photo, or a plain marker that says "no photo
 * yet" rather than a generated illustration standing in for a real bottle.
 */

const BOX_W = 120;
const BOX_H = 170;

/** Renders either the real photo or a neutral grey placeholder, same box either way. */
export function productArt(photoUrl: string | null, size: number, label: string): string {
  const h = Math.round((size * BOX_H) / BOX_W);
  return photoUrl ? photo(photoUrl, size, h, label) : placeholder(size, h, label);
}

function photo(url: string, w: number, h: number, label: string): string {
  return `<img class="bottle bottle-photo" src="${escapeAttr(url)}" alt="${escapeAttr(label)}"
    width="${w}" height="${h}" loading="lazy" referrerpolicy="no-referrer" />`;
}

function placeholder(w: number, h: number, label: string): string {
  return `<svg class="bottle bottle-placeholder" width="${w}" height="${h}"
    viewBox="0 0 ${BOX_W} ${BOX_H}" role="img" aria-label="${escapeAttr(label)}, photo not available">
    <rect x="4" y="4" width="${BOX_W - 8}" height="${BOX_H - 8}" rx="12" fill="var(--line-firm)" opacity=".55"/>
  </svg>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
