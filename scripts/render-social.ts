/**
 * Renders every social post SVG to a PNG beside it, with the brand font
 * embedded and smooth edges (see socialRender.ts), so a post looks the same
 * on any machine. See social/README.md.
 *
 *   npm run social:render                 every post under social/posts/
 *   npm run social:render -- <folder>     one post folder
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';

const ROOT = resolve(import.meta.dirname, '..');

function svgFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return svgFiles(p);
    return name.endsWith('.svg') ? [p] : [];
  });
}

const target = resolve(process.argv[2] ?? join(ROOT, 'social', 'posts'));
const files = svgFiles(target);
const browser = await launchChromium();
for (const file of files) {
  const svg = readFileSync(file, 'utf8');
  const w = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1080);
  const h = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 1080);
  const out = file.replace(/\.svg$/, '.png');
  await renderSmooth(browser, `<!doctype html><html><head><style>html,body{margin:0;background:#0A0A0B}</style></head><body>${svg}</body></html>`, w, h, out);
  console.log(`${out.slice(ROOT.length + 1)}  ${w}x${h}`);
}
await browser.close();
