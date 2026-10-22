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
  IN:
    '<rect width="30" height="20" fill="#fff"/>' +
    '<rect width="30" height="6.67" fill="#FF9933"/>' +
    '<rect y="13.33" width="30" height="6.67" fill="#138808"/>' +
    '<circle cx="15" cy="10" r="2.4" fill="none" stroke="#000080" stroke-width=".7"/>' +
    '<circle cx="15" cy="10" r=".6" fill="#000080"/>',
  CA:
    '<rect width="30" height="20" fill="#fff"/>' +
    '<rect width="7.5" height="20" fill="#D52B1E"/><rect x="22.5" width="7.5" height="20" fill="#D52B1E"/>' +
    '<path d="M15 3.2 16.4 6.2 18.4 5.4 17.8 9.2 20.2 7.6 19.6 10.4 21 10.9 18.2 13.1 18.5 14.3 15.5 13.8V17h-1v-3.2l-3 .5.3-1.2L9 10.9l1.4-.5-.6-2.8 2.4 1.6-.6-3.8 2 .8z" fill="#D52B1E"/>',
};

/** The flag for a region, 20px wide, hidden from assistive technology. */
export function flagSvg(id: RegionId): string {
  return `<svg class="flag" viewBox="0 0 30 20" width="20" height="13.33" aria-hidden="true" focusable="false">${PANELS[id]}</svg>`;
}
