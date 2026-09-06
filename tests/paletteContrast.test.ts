import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');

/**
 * WCAG 2.1 relative luminance and contrast ratio, from the definitions in
 * the spec, so this file has no dependency to drift.
 */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The `--name: #hex;` tokens in one CSS block, keyed by name. */
function tokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!;
  return out;
}

/**
 * The two palettes as demo/template.html declares them: the dark set is the
 * first `:root {` block, the light set is the first `[data-mode="light"]`
 * override. Read from the stylesheet rather than copied here, so a token
 * edit is what gets tested, not a remembered value.
 */
function palettes(): { name: string; tokens: Record<string, string> }[] {
  // The dark set is the default and opens `:root, :root[data-mode="dark"] {`;
  // the light set is the `:root[data-mode="light"] {` override. Neither block
  // contains a closing brace before its own end (checked 2026-09-06), so the
  // non-greedy `[^}]*` reads exactly one block.
  const dark = /:root,\s*:root\[data-mode="dark"\]\s*\{([^}]*)\}/.exec(template)?.[1] ?? '';
  const light = /:root\[data-mode="light"\]\s*\{([^}]*)\}/.exec(template)?.[1] ?? '';
  return [
    { name: 'dark', tokens: tokensIn(dark) },
    { name: 'light', tokens: tokensIn(light) },
  ];
}

/**
 * Text-on-background pairs the stylesheet actually composes. Each is a
 * foreground token drawn on a background token somewhere in the app; the
 * bar is WCAG AA for normal text, 4.5:1, applied to all of them rather than
 * only the ones that happen to be small today.
 */
const TEXT_PAIRS: [string, string][] = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'],
  ['ink-2', 'bg'], ['ink-2', 'surface'], ['ink-2', 'surface-2'],
  ['faint', 'bg'], ['faint', 'surface'], ['faint', 'surface-2'],
  ['accent', 'bg'], ['accent', 'surface'],
  ['accent-ink', 'bg'], ['accent-ink', 'accent-sf'],
  ['accent-on', 'accent'],
  ['ok', 'bg'], ['ok', 'surface'], ['ok', 'ok-sf'],
  ['warn', 'bg'], ['warn', 'surface'],
];

describe('both palettes meet WCAG AA contrast for every text pair the app draws', () => {
  for (const { name, tokens } of palettes()) {
    it(`${name}: every pair is at least 4.5:1`, () => {
      // Measured on 2026-09-06: the lowest pair in either palette was 4.72:1
      // (faint on surface-2, light). Pinned so a token tweak that dips below
      // AA fails here rather than in a reader's eyes.
      expect(Object.keys(tokens).length, `${name} palette tokens not found in template.html`).toBeGreaterThan(10);
      for (const [fg, bg] of TEXT_PAIRS) {
        const f = tokens[fg];
        const b = tokens[bg];
        expect(f, `${name} palette has no --${fg}`).toBeDefined();
        expect(b, `${name} palette has no --${bg}`).toBeDefined();
        const ratio = contrast(f!, b!);
        expect(ratio, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, below 4.5`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
