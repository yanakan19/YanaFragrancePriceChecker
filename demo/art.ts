/**
 * Bottle illustrations.
 *
 * These are drawn, not photographed. Real product photography cannot ship here
 * for two reasons: the artifact CSP blocks every remote image, and brand imagery
 * needs a licence — which arrives with an affiliate product feed, since scraped
 * images carry no usage right at all (see docs/AFFILIATE_SETUP.md §1).
 *
 * So each fragrance gets a silhouette and palette matched to its actual flacon —
 * recognisable at a glance in a scroller, honest about being an illustration.
 * When the feeds land, swap `bottleSvg` for an <img> and nothing else changes.
 */

export type BottleShape =
  /** Broad rounded rectangle — Sauvage, Bleu de Chanel, Eros. */
  | 'classic'
  /** Slim upright rectangle — Libre, Baccarat Rouge. */
  | 'flat'
  /** Tapered bar — 1 Million. */
  | 'ingot'
  /** Rounded river-stone — Acqua di Giò. */
  | 'pebble'
  /** Bulbous shoulders, tall cap — Khamrah. */
  | 'ornate'
  /** Soft column — Jo Malone. */
  | 'column'
  /** Squat rounded square with a crest — Aventus. */
  | 'crest';

export interface BottleArt {
  shape: BottleShape;
  /** Glass gradient, top to bottom. */
  glass: [string, string];
  cap: string;
  /** Optional collar between cap and glass. */
  collar?: string;
  /** Label plate colour. Omit for unlabelled glass. */
  label?: string;
}

interface Geometry {
  body: string;
  cap: string;
  label: { x: number; y: number; w: number; h: number } | null;
  /** Highlight stripe, giving the glass some depth. */
  shine: string;
}

/* Canvas is 120 × 170. The bottle stands on y≈160 so every silhouette shares a
   baseline and the scroller reads as one shelf. */
function geometry(shape: BottleShape): Geometry {
  switch (shape) {
    case 'classic':
      return {
        cap: '<rect x="45" y="14" width="30" height="21" rx="2.5"/><rect x="51" y="33" width="18" height="9"/>',
        body: '<rect x="21" y="41" width="78" height="119" rx="11"/>',
        label: { x: 36, y: 92, w: 48, h: 34 },
        shine: '<rect x="29" y="50" width="12" height="98" rx="6"/>',
      };
    case 'flat':
      return {
        cap: '<rect x="47" y="10" width="26" height="23" rx="2"/><rect x="53" y="31" width="14" height="8"/>',
        body: '<rect x="33" y="38" width="54" height="122" rx="5"/>',
        label: { x: 42, y: 88, w: 36, h: 40 },
        shine: '<rect x="39" y="46" width="9" height="104" rx="4.5"/>',
      };
    case 'ingot':
      return {
        cap: '<rect x="46" y="20" width="28" height="20" rx="2"/>',
        body: '<path d="M25 158 L34 40 H86 L95 158 Z"/>',
        label: { x: 41, y: 92, w: 38, h: 32 },
        shine: '<path d="M39 150 L45 48 H53 L48 150 Z"/>',
      };
    case 'pebble':
      return {
        cap: '<rect x="46" y="22" width="28" height="26" rx="4"/>',
        body: '<rect x="19" y="52" width="82" height="108" rx="40"/>',
        label: { x: 40, y: 92, w: 40, h: 30 },
        shine: '<rect x="30" y="70" width="11" height="70" rx="5.5"/>',
      };
    case 'ornate':
      return {
        cap: '<rect x="44" y="6" width="32" height="30" rx="4"/><rect x="50" y="34" width="20" height="8"/>',
        body: '<path d="M60 42 C40 42 26 58 26 84 L26 140 C26 153 34 160 46 160 L74 160 C86 160 94 153 94 140 L94 84 C94 58 80 42 60 42 Z"/>',
        label: { x: 40, y: 96, w: 40, h: 34 },
        shine: '<rect x="35" y="76" width="10" height="66" rx="5"/>',
      };
    case 'column':
      return {
        cap: '<rect x="42" y="16" width="36" height="26" rx="3"/>',
        body: '<rect x="29" y="44" width="62" height="116" rx="26"/>',
        label: { x: 41, y: 90, w: 38, h: 36 },
        shine: '<rect x="38" y="62" width="10" height="80" rx="5"/>',
      };
    case 'crest':
      return {
        cap: '<rect x="44" y="16" width="32" height="22" rx="2.5"/><rect x="51" y="36" width="18" height="8"/>',
        body: '<rect x="23" y="43" width="74" height="117" rx="16"/>',
        label: { x: 44, y: 84, w: 32, h: 42 },
        shine: '<rect x="31" y="54" width="11" height="92" rx="5.5"/>',
      };
  }
}

let uid = 0;

/**
 * Render one bottle. `size` is the rendered width in CSS pixels; the SVG keeps
 * its 120:170 aspect so baselines line up across a row of different shapes.
 */
export function bottleSvg(art: BottleArt, size: number, label = 'Fragrance bottle'): string {
  const g = geometry(art.shape);
  const id = `b${++uid}`;

  return `<svg class="bottle" width="${size}" height="${Math.round((size * 170) / 120)}"
    viewBox="0 0 120 170" role="img" aria-label="${label}">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="${art.glass[0]}"/>
        <stop offset="1" stop-color="${art.glass[1]}"/>
      </linearGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".38"/>
        <stop offset="1" stop-color="#fff" stop-opacity=".04"/>
      </linearGradient>
    </defs>

    <ellipse cx="60" cy="163" rx="34" ry="4.5" fill="#000" opacity=".13"/>

    <g fill="${art.cap}">${g.cap}</g>
    ${art.collar ? `<rect x="49" y="35" width="22" height="5" rx="1.5" fill="${art.collar}"/>` : ''}

    <g fill="url(#${id}g)">${g.body}</g>
    <g fill="url(#${id}s)">${g.shine}</g>

    ${
      g.label && art.label
        ? `<rect x="${g.label.x}" y="${g.label.y}" width="${g.label.w}" height="${g.label.h}"
             rx="2" fill="${art.label}" opacity=".92"/>`
        : ''
    }
  </svg>`;
}
