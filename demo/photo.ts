/**
 * Product imagery.
 *
 * A product image is shown only when its retailer records an `imageBasis`
 * saying why it may be — see that type in src/types/retailer.ts. Three bases
 * are in use: Fragrance Click's affiliate creative terms, which were read and
 * permit it; the fragrance houses' own storefronts, which are their photographs
 * of their own products; and a deliberate unlicensed hot-link for the shops
 * crawled directly, taken on the site owner's decision and recorded as exactly
 * that rather than dressed up as a licence.
 *
 * In every case the image is referenced, never copied: the reader's browser
 * fetches it from the retailer's own server, and nothing is downloaded or
 * rehosted here. A retailer that objects or blocks hot-linking is honoured by
 * unsetting its basis, at which point its products fall back to the marker.
 *
 * So a product is in exactly one of two states, never a third invented one: a
 * real photo, or a plain marker saying "no photo yet".
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

/**
 * Renders either the product photo or the no photo mark, same box either way.
 *
 * ── Why the photo carries an onerror ─────────────────────────────────────────
 * This mattered less when the only photography came from a feed. Most images
 * are now hot-linked from a retailer's own CDN, so a shop reshuffling its paths
 * or turning on hot-link protection would leave a broken-image glyph in the
 * tile. On failure the image removes itself and marks its container, and CSS
 * draws the same empty box the no-photo case already uses.
 *
 * Deliberately not done by rendering a hidden fallback behind every photo: that
 * would double the DOM for a case that almost never fires, on a page where
 * cutting DOM size is exactly what made long lists fast.
 *
 * ── `transform`: evening the bottle's own apparent size (docs/IMAGE-SCALE-PLAN.md) ──
 * A build-time-only CSS transform, computed per photo in
 * scripts/build-demo-catalogue.ts from the silhouette bounding box
 * src/catalogue/bottleScale.ts turns into a `translate()/scale()`, and
 * carried on `CatalogueEntry.imageTransform`. Applied as an inline `style` on
 * the `<img>` itself, never on the `.art` container: `.art` still does
 * nothing but clip (`overflow: hidden`) and hold the white ground, exactly as
 * before, and the transform is invisible outside that clip. Optional and
 * additive — most photos carry none (no verdict, a boxed or unsure one, or a
 * bottle-only one with no persisted box yet), and for every one of those this
 * renders byte-identical to before this existed: no `style` attribute at
 * all, not an empty one.
 */
export function productArt(
  photoUrl: string | null,
  size: ArtSize,
  label: string,
  transform?: string | null,
  opts?: { eager?: boolean },
): string {
  if (!photoUrl) {
    return `<span class="art art-${size} art-empty" role="img"
      aria-label="${escapeAttr(label)}, no image available">${noImageMark(size)}</span>`;
  }
  const style = transform ? ` style="${escapeAttr(transform)}"` : '';
  // The detail hero is the page's main picture and its largest paint, so it
  // is fetched at once and ahead of everything else. A tile in the first row
  // of a list is on screen when the list appears and is fetched at once too;
  // every other tile waits until it is scrolled near.
  const loading =
    size === 'lg'
      ? 'loading="eager" fetchpriority="high"'
      : opts?.eager
        ? 'loading="eager"'
        : 'loading="lazy"';
  const box = ART_BOX_PX[size];
  return `<span class="art art-${size}">
    <img class="art-img"${photoSrcAttrs(photoUrl, ART_SIZES[size], scaleOf(transform))} alt="${escapeAttr(label)}"
      width="${box}" height="${box}" ${loading} decoding="async" referrerpolicy="no-referrer"${style}
      onerror="${RETRY_ORIGINAL}this.closest('.art').classList.add('art-failed');this.remove()" />
  </span>`;
}

/* ── Smaller photos, from the retailer's own image server ──────────────────────
 * Most photos are hot-linked at far more pixels than any tile draws: the build
 * deliberately asks Shopify for `width=3000` (src/catalogue/pickImage.ts,
 * upgradeImageResolution) so that the stored URL is the best copy there is,
 * and a 150px phone tile was downloading all of it. Where the host's own
 * image service resizes on request, the page now asks it for the width the
 * picture is actually drawn at, offering a handful of widths in `srcset` and
 * letting the browser pick by its screen density. Nothing is resized,
 * re-encoded or stored here: it is the same image server serving the same
 * photo at a size it already offers every other visitor to that shop.
 *
 * Only two families qualify, and each was checked against real catalogue
 * URLs on 2026-10-01 (status, dimensions and bytes of the original against
 * the resized request, with a browser's Accept header and with a JPEG-only
 * one):
 *
 *   - Shopify, on `cdn.shopify.com/s/files/…` and on a shop's own domain under
 *     `/cdn/shop/…`. `width=` is Shopify's documented image parameter; 50 of
 *     50 sampled URLs across seven hosts came back at the asked width, same
 *     photo, same proportions. The handful of URLs (13, one shop) that carry
 *     the legacy `_1024x` filename suffix ignore `width=` because the
 *     filename wins, so for those the suffix itself is rewritten (`_400x`):
 *     6 of 6 checked. Shopify also picks WebP or AVIF for a browser that
 *     accepts them, on both hosts, and only when it comes out smaller; so no
 *     `format=` is forced (forcing it made some photos bigger).
 *   - THG's image service (`main.thgimages.com/?url=…&width=&height=`), whose
 *     stored URLs already ask it for 1500x1500. 6 of 6 came back at the asked
 *     size. It already serves WebP (the stored URL says `format=webp`).
 *
 * Everything else is left exactly as it is. Fragrance Click's Magento host
 * ignores `width=` (checked: 800x800 either way), perfume-click's bgstatic
 * photos are already 130px thumbnails, and the WordPress houses
 * (pariscorner.ae, lattafa.com, maisonalhambra.co, reef-parfum.com) have no
 * resize parameter at all: WordPress's pre-cut `-300x300` copies exist only
 * for some images (3 of 4 pariscorner ones 404'd) and are crops, not resizes.
 *
 * And the stored URL stays the fallback: if a resized request fails, the
 * image retries the original once before giving up to the placeholder.
 */

/** The widths offered in `srcset`, smallest first. */
export const PHOTO_WIDTHS = [160, 240, 320, 480, 640, 800, 1000, 1200] as const;

/** The width put in `src`, for a browser that ignores `srcset`. */
const FALLBACK_WIDTH = 640;

/**
 * How wide each art size is drawn, as a `sizes` value. Taken off the CSS in
 * demo/template.html, measured in the page at a 412px phone viewport:
 *   md  `.art-md { width: min(90%, 300px) }` of a tile. Two tiles a row on a
 *       phone, 143px each (35vw), 131px in the home rail; capped at 300px.
 *   lg  `.art-lg { width: 96%; max-width: 340px }` of the detail hero.
 *   sm  not drawn anywhere today; a guess kept small.
 * Over-stating a little only costs a slightly larger file; under-stating
 * costs sharpness, so these round up.
 */
const ART_SIZES: Record<ArtSize, string> = {
  sm: 'min(20vw, 120px)',
  md: 'min(36vw, 300px)',
  lg: 'min(92vw, 340px)',
};

/** The box each size can grow to, as width/height attributes (CSS sizes it). */
const ART_BOX_PX: Record<ArtSize, number> = { sm: 120, md: 300, lg: 340 };

/** `sizes` for the house cards' photos (`.house-img`, two a row on a phone). */
export const HOUSE_IMG_SIZES = 'min(40vw, 240px)';

/**
 * The start of every photo's onerror: once, swap a failed resized request
 * for the stored URL itself (kept in data-orig) and stop there. Only when the
 * original fails too does the rest of the handler run. Single-quoted only,
 * since it sits inside a double-quoted attribute.
 */
export const RETRY_ORIGINAL =
  "if(this.dataset.orig){const o=this.dataset.orig;delete this.dataset.orig;this.removeAttribute('srcset');this.src=o;return}";

/**
 * The same photo at `width` pixels wide from the host's own image service, or
 * null when the host is not one known to resize on request (see above).
 */
export function resizedPhotoUrl(url: string, width: number): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const w = Math.round(width);

  const shopify =
    (parsed.hostname === 'cdn.shopify.com' && parsed.pathname.startsWith('/s/files/')) ||
    parsed.pathname.startsWith('/cdn/shop/');
  if (shopify) {
    // A crop or a height would make `width=` mean something other than "the
    // same picture, narrower". None in the data today; left alone if one
    // ever arrives.
    if (/[?&](height|crop)=/i.test(parsed.search)) return null;
    const [base, query = ''] = splitQuery(url);
    const suffix = base.match(/^(.*_)(\d+)x(\.(?:jpe?g|png|webp|gif))$/i);
    if (suffix) return `${suffix[1]}${w}x${suffix[3]}${query}`;
    // Any other filename size suffix (`_x100`, `_200x300`) is unverified as a
    // resize target, and the filename would win over `width=` anyway.
    if (/_\d*x\d*(@\dx)?\.[a-z]+$/i.test(base)) return null;
    return /[?&]width=\d+/.test(query)
      ? `${base}${query.replace(/([?&]width=)\d+/, `$1${w}`)}`
      : `${base}${query ? `${query}&` : '?'}width=${w}`;
  }

  if (parsed.hostname === 'main.thgimages.com') {
    const width0 = Number(parsed.searchParams.get('width'));
    const height0 = Number(parsed.searchParams.get('height'));
    if (!(width0 > 0 && height0 > 0)) return null;
    const h = Math.round((w * height0) / width0);
    return url.replace(/([?&]width=)\d+/, `$1${w}`).replace(/([?&]height=)\d+/, `$1${h}`);
  }

  return null;
}

/**
 * `src` (and, where the host resizes, `srcset`, `sizes` and `data-orig`) for
 * one photo, as attribute markup with a leading space. `sizes` is how wide the
 * picture is drawn; `scale` is any zoom the build's per-photo transform puts
 * on it (docs/IMAGE-SCALE-PLAN.md), which shows the photo that much larger
 * inside the same box and so needs that many more pixels to stay sharp.
 */
export function photoSrcAttrs(url: string, sizes: string, scale = 1): string {
  const fallback = resizedPhotoUrl(url, FALLBACK_WIDTH);
  const candidates = PHOTO_WIDTHS.map((w) => resizedPhotoUrl(url, w));
  // A comma or space inside a URL would split a srcset candidate in two.
  if (fallback === null || candidates.some((c) => c === null || /[\s,]/.test(c))) {
    return ` src="${escapeAttr(url)}"`;
  }
  const srcset = candidates.map((c, i) => `${c} ${PHOTO_WIDTHS[i]}w`).join(', ');
  const drawn = scale > 1.01 ? `calc(${sizes} * ${Math.min(scale, 2.5).toFixed(2)})` : sizes;
  return (
    ` src="${escapeAttr(fallback)}" srcset="${escapeAttr(srcset)}" sizes="${escapeAttr(drawn)}"` +
    ` data-orig="${escapeAttr(url)}"`
  );
}

/** The `scale(n)` factor in a build-time image transform, or 1. */
function scaleOf(transform: string | null | undefined): number {
  const m = transform?.match(/scale\(\s*([\d.]+)\s*\)/);
  const n = m ? Number(m[1]) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function splitQuery(url: string): [string, string] {
  const i = url.indexOf('?');
  return i < 0 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
