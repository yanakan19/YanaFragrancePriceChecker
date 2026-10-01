/**
 * Renders every social post SVG to a PNG beside it, with the brand font
 * embedded, so a post looks the same on any machine. See social/README.md.
 *
 *   npm run social:render                 every post under social/posts/
 *   npm run social:render -- <folder>     one post folder
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium } from './a11y-audit.js';

const ROOT = resolve(import.meta.dirname, '..');
const FONTS = join(ROOT, 'social', 'fonts');

function svgFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return svgFiles(p);
    return name.endsWith('.svg') ? [p] : [];
  });
}

const fontFace = (file: string, weight: number) =>
  `@font-face{font-family:'Liberation Sans';font-weight:${weight};src:url(data:font/ttf;base64,${readFileSync(
    join(FONTS, file),
  ).toString('base64')}) format('truetype');}`;
const css = fontFace('LiberationSans-Regular.ttf', 400) + fontFace('LiberationSans-Bold.ttf', 700);

const target = resolve(process.argv[2] ?? join(ROOT, 'social', 'posts'));
const files = svgFiles(target);
const browser = await launchChromium();
for (const file of files) {
  const svg = readFileSync(file, 'utf8');
  const w = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1080);
  const h = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 1080);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>${css} html,body{margin:0;background:#0A0A0B}</style></head><body>${svg}</body></html>`);
  await page.evaluate('document.fonts.ready');
  const out = file.replace(/\.svg$/, '.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  console.log(`${out.slice(ROOT.length + 1)}  ${w}x${h}`);
}
await browser.close();
