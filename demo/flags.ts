import type { RegionId } from '../src/services/regions.js';

/**
 * Small inline SVG flags for the region selector, drawn here rather than set
 * as emoji because Windows does not draw emoji flags. Each is a 3 by 2 tile
 * on a 30 by 20 grid, kept to plain shapes so it still reads at 20px wide.
 * Simplified on purpose (seven stripes for the USA, no offset in the UK's
 * diagonals), and decoration only: the words beside each one name the region.
 * The tile's thin ring comes from .flag in demo/template.html, so a flag with
 * white in it still reads against the dark theme.
 */

const PANELS: Record<RegionId, string> = {
  GB:
    '<rect width="30" height="20" fill="#012169"/>' +
    '<path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/>' +
    '<path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" stroke-width="1.5"/>' +
    '<path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/>' +
    '<path d="M15 0v20M0 10h30" stroke="#C8102E" stroke-width="3.4"/>',
  US:
    '<rect width="30" height="20" fill="#fff"/>' +
    [0, 2, 4, 6].map((i) => `<rect y="${(i * 20) / 7}" width="30" height="${20 / 7}" fill="#B22234"/>`).join('') +
    '<rect width="13" height="11.43" fill="#3C3B6E"/>' +
    '<g fill="#fff"><circle cx="3" cy="3" r=".8"/><circle cx="6.5" cy="3" r=".8"/><circle cx="10" cy="3" r=".8"/>' +
    '<circle cx="4.7" cy="5.7" r=".8"/><circle cx="8.2" cy="5.7" r=".8"/>' +
    '<circle cx="3" cy="8.4" r=".8"/><circle cx="6.5" cy="8.4" r=".8"/><circle cx="10" cy="8.4" r=".8"/></g>',
  DE:
    '<rect width="30" height="20" fill="#DD0000"/>' +
    '<rect width="30" height="6.67" fill="#000"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#FFCE00"/>',
  IN:
    '<rect width="30" height="20" fill="#fff"/>' +
    '<rect width="30" height="6.67" fill="#FF9933"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#138808"/>' +
    '<circle cx="15" cy="10" r="2.4" fill="none" stroke="#000080" stroke-width=".7"/>' +
    '<circle cx="15" cy="10" r=".6" fill="#000080"/>',
  FR:
    '<rect width="30" height="20" fill="#fff"/>' +
    '<rect width="10" height="20" fill="#0055A4"/>' +
    '<rect x="20" width="10" height="20" fill="#EF4135"/>',
  IT:
    '<rect width="30" height="20" fill="#fff"/>' +
    '<rect width="10" height="20" fill="#009246"/>' +
    '<rect x="20" width="10" height="20" fill="#CE2B37"/>',
};

/** The flag for a region, 20px wide, hidden from assistive technology. */
export function flagSvg(id: RegionId): string {
  return `<svg class="flag" viewBox="0 0 30 20" width="20" height="13.33" aria-hidden="true" focusable="false">${PANELS[id]}</svg>`;
}
