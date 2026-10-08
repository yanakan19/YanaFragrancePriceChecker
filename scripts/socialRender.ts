/**
 * Shared rendering for social posts (render-social.ts, social-deal-of-day.ts).
 * The pictures it writes are not committed: socialPictures.ts and
 * docs/DECISIONS.md D28.
 *
 * Smooth edges: every picture is drawn at twice its size and scaled down with
 * high quality smoothing, which gives the soft, natural letter edges of a
 * design tool instead of the hard pixel edges of a 1x screenshot.
 *
 * Fit to space: FIT_SCRIPT runs inside each HTML post before the screenshot.
 * Any element marked data-fit="<lines>,<min px>" shrinks until it fits that
 * many lines inside its width (ellipsis only as a last resort), and if the
 * page as a whole still overflows, the --k scale shrinks photos, chips and
 * gaps step by step. Long names, brands, shop names and notes can never run
 * off the picture or over the margins.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Browser } from 'playwright';
import { assertPicturePath } from './socialPictures.js';

const ROOT = resolve(import.meta.dirname, '..');

const fontFace = (file: string, weight: number) =>
  `@font-face{font-family:'Liberation Sans';font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(
    join(ROOT, 'social', 'fonts', file),
  ).toString('base64')}) format('truetype');}`;

/** The brand font, embedded, plus smoothing hints. */
export const BRAND_FONT_CSS =
  fontFace('LiberationSans-Regular.ttf', 400) +
  fontFace('LiberationSans-Bold.ttf', 700) +
  'html{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;}';

export const FIT_SCRIPT = `<script>
(() => {
  const lineH = (el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    return Number.isNaN(lh) ? parseFloat(cs.fontSize) * 1.2 : lh;
  };
  for (const el of document.querySelectorAll('[data-fit]')) {
    const [lines, min] = el.dataset.fit.split(',').map(Number);
    let size = parseFloat(getComputedStyle(el).fontSize);
    const over = () => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > lines * lineH(el) + 2;
    while (over() && size > min) { size -= 1; el.style.fontSize = size + 'px'; }
    if (over()) {
      el.dataset.clamped = 'true';
      el.style.overflow = 'hidden';
      if (lines > 1) { el.style.display = '-webkit-box'; el.style.webkitBoxOrient = 'vertical'; el.style.webkitLineClamp = String(lines); }
      else { el.style.textOverflow = 'ellipsis'; el.style.whiteSpace = 'nowrap'; }
    }
  }
  const main = document.querySelector('main');
  let k = 1;
  while (main && main.scrollHeight > main.clientHeight + 1 && k > 0.6) {
    k = Math.round((k - 0.04) * 100) / 100;
    document.documentElement.style.setProperty('--k', String(k));
  }
  document.body.dataset.fitScale = String(k);
})();
</script>`;

/** Renders HTML at 2x, then scales it down smoothly to w x h and writes a PNG. */
export async function renderSmooth(browser: Browser, html: string, w: number, h: number, out: string): Promise<void> {
  // A picture under social/ is never committed (docs/DECISIONS.md D28): its type must be "social" in the manifest.
  assertPicturePath(out);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(html.replace('<head>', `<head><style>${BRAND_FONT_CSS}</style>`));
  await page.evaluate('document.fonts.ready');
  const big = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();

  const scaler = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const dataUrl = (await scaler.evaluate(
    `(async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,${big.toString('base64')}';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = ${w}; c.height = ${h};
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, ${w}, ${h});
      return c.toDataURL('image/png');
    })()`,
  )) as string;
  await scaler.close();
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

const GENERIC_TAGS = new Set(['#perfume', '#fragrance', '#perfumedeals', '#pricesniffs', '#ukdeals']);

/**
 * The TikTok version of a feed caption (social/DESIGN-SYSTEM.md section 5):
 * the web address instead of "link in bio" (a new TikTok account cannot put
 * a link in its bio), and TikTok's own tags, still 5 at most. A brand tag in
 * the original is kept.
 */
export function tiktokCaption(caption: string): string {
  const text = caption
    .replace(/The link is in our bio, or go to\n/g, 'See it at\n')
    .replace(/so check the link in our bio before you buy, or go to\n/g, 'so check before you buy at\n')
    .replace(/The link is in our bio, or go to /g, 'See it at ')
    .replace(/check the link in our bio before you buy, or go to /g, 'check before you buy at ')
    .replace(/check the link in our bio before you buy\./g, 'check before you buy at pricesniffs.space.')
    // Any other wording: the bio has no link on TikTok yet, so name the site.
    .replace(/the link in (?:our )?bio/gi, 'pricesniffs.space');
  return text.replace(/^#.*$/m, (line) => {
    const brand = (line.match(/#\w+/g) ?? []).find((t) => !GENERIC_TAGS.has(t));
    return ['#perfumetok', '#fragrancetok', brand ?? '#perfume', '#perfumedeals', '#pricesniffs'].join(' ');
  });
}
