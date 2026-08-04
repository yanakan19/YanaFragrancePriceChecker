/**
 * Product imagery.
 *
 * Real product photography only ever comes from a retailer whose programme has
 * actually confirmed we may use it — currently Fragrance Click UK alone (see
 * AffiliateConfig.imageUsageConfirmed in src/types/retailer.ts and the Terms
 * clause quoted in src/config/retailers.ts). Every other listing has no usage
 * right over its own product photos: scraped images carry no licence at all,
 * only an approved affiliate feed grants one.
 *
 * So a product is in exactly one of two states, never a third invented one: a
 * licensed photo, or a plain marker saying "no photo yet".
 *
 * ── On the white tile ────────────────────────────────────────────────────────
 * Feed photography is shot on white and supplied as JPEG, so it carries no
 * transparency and drops a hard white rectangle onto this app's dark ground.
 * The fix is a white tile *behind* the image rather than any edit to the image
 * itself: the same programme terms that let us show these photos also say
 * "publishers may not alter any of the creative", and keying out the white
 * pixels to fake a cutout would be exactly that kind of alteration. Styling our
 * own container is not.
 *
 * Every tile is a square regardless of the source image's own proportions, and
 * `object-fit: contain` letterboxes whatever arrives inside it. That is what
 * keeps a 400x400 photo, a 600x800 photo and an empty placeholder all occupying
 * an identical box, so a future retailer's feed cannot change the layout.
 */

export type ArtSize = 'sm' | 'md' | 'lg';

/**
 * The "no photo" mark: a blocked sign over the caption.
 *
 * Drawn inline rather than shipped as a transparent PNG. It is the same image
 * either way, but an SVG stays sharp at every size instead of needing one
 * export per tile size, takes its colour from the current theme so it works on
 * both the dark and light grounds, costs no extra request, and has no
 * background to be transparent in the first place.
 *
 * The caption is dropped on the smallest tile, where it would render at about
 * four pixels tall and read as noise. The accessible label still carries it.
 */
function noImageMark(size: ArtSize): string {
  // Two lines rather than one: "NO IMAGE AVAILABLE" set across a 120 unit box
  // has to shrink so far to fit on a single line that it stops being readable.
  const caption =
    size === 'sm'
      ? ''
      : `<text text-anchor="middle" font-size="11" font-weight="700" letter-spacing=".6"
           fill="currentColor" font-family="inherit">
           <tspan x="60" y="94">NO IMAGE</tspan>
           <tspan x="60" y="107">AVAILABLE</tspan>
         </text>`;
  return `<svg class="art-none" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
    <circle cx="60" cy="47" r="20" fill="none" stroke="currentColor" stroke-width="5.5"/>
    <line x1="45.9" y1="32.9" x2="74.1" y2="61.1" stroke="currentColor" stroke-width="5.5"
      stroke-linecap="round"/>
    ${caption}
  </svg>`;
}

/** Renders either the licensed photo or the no photo mark, same box either way. */
export function productArt(photoUrl: string | null, size: ArtSize, label: string): string {
  if (!photoUrl) {
    return `<span class="art art-${size} art-empty" role="img"
      aria-label="${escapeAttr(label)}, no image available">${noImageMark(size)}</span>`;
  }
  return `<span class="art art-${size}">
    <img class="art-img" src="${escapeAttr(photoUrl)}" alt="${escapeAttr(label)}"
      loading="lazy" decoding="async" referrerpolicy="no-referrer" />
  </span>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
