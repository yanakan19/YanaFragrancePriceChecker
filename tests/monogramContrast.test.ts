import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastBetween } from '../demo/contrast.js';
import { RETAILERS } from '../src/config/retailers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');

/**
 * The initials tile (.monogram, .org-mark-failed, .offer-mark--initials)
 * paints text and ground from the same hue, so a hue whose pair fails AA fails
 * only on the shops that hash to it. axe saw that as a flaky failure; this
 * checks the rule directly: every shop, every palette block, and every hue.
 */
const hash = app.match(/function monogramHue\([\s\S]*?\n}\n/)?.[0];
if (!hash) throw new Error('could not find monogramHue in demo/app.ts');
const monogramHue = new Function(`${transformSync(hash, { loader: 'ts' }).code}\nreturn monogramHue;`)() as (n: string) => number;

function hsl(h: number, s: number, l: number): string {
  const sa = s / 100;
  const li = l / 100;
  const a = sa * Math.min(li, 1 - li);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (li - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}

const pct = (block: string, name: string): number => {
  const m = new RegExp(`${name}:\\s*(\\d+)%`).exec(block);
  if (!m) throw new Error(`${name} missing in ${block.slice(0, 40)}`);
  return Number(m[1]);
};
const sat = Number(/--mono-sat:\s*(\d+)%/.exec(template)?.[1]);

const blocks: [string, RegExp][] = [
  ['dark', /:root, :root\[data-mode="dark"\] \{/],
  ['light', /:root\[data-mode="light"\] \{/],
  ['system light', /@media \(prefers-color-scheme: light\) \{\n\s*:root\[data-mode="system"\] \{/],
  ['host light', /:root\[data-mode="system"\]\[data-theme="light"\] \{/],
  ['host dark', /:root\[data-mode="system"\]\[data-theme="dark"\] \{/],
];

describe('initials tile colour pair', () => {
  it('has a saturation token', () => expect(sat).toBeGreaterThan(0));

  it.each(blocks)('%s: text passes AA on its ground at every hue', (_label, re) => {
    const start = template.search(re);
    expect(start).toBeGreaterThan(-1);
    const body = template.slice(start, template.indexOf('\n  }', start));
    const bg = pct(body, '--mono-bg-l');
    const fg = pct(body, '--mono-fg-l');
    for (let h = 0; h < 360; h++) {
      const ratio = contrastBetween(hsl(h, sat, fg), hsl(h, sat, bg))!;
      expect(ratio, `hue ${h}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('every shop (and BB) lands on a whole hue in 0..359', () => {
    for (const name of [...RETAILERS.map((r) => r.name), 'BB']) {
      const h = monogramHue(name);
      expect(Number.isInteger(h) && h >= 0 && h < 360, name).toBe(true);
    }
  });
});
