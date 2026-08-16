import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastBetween, contrastRatio, parseColour } from '../demo/contrast.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');

/**
 * Reads a token straight out of the stylesheet, from a named palette block.
 *
 * The point of going to the file rather than hardcoding a hex here is that a
 * retint has to break this test. A copy of the value in the test would agree
 * with a copy of the value in a comment forever, whatever the stylesheet
 * actually said.
 */
function tokenIn(block: RegExp, name: string): string {
  const start = template.search(block);
  expect(start, `palette block not found for ${name}`).toBeGreaterThan(-1);
  const body = template.slice(start, template.indexOf('\n  }', start));
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body);
  expect(match, `${name} not declared in that block`).not.toBeNull();
  return match![1]!.trim();
}

const DARK = /:root, :root\[data-mode="dark"\] \{/;
const LIGHT = /:root\[data-mode="light"\] \{/;

describe('parseColour', () => {
  it('reads the forms a stylesheet and a browser actually produce', () => {
    expect(parseColour('#FF8FB3')).toEqual([255, 143, 179, 1]);
    expect(parseColour('#fff')).toEqual([255, 255, 255, 1]);
    expect(parseColour('rgb(255, 143, 179)')).toEqual([255, 143, 179, 1]);
    expect(parseColour('rgba(255, 143, 179, 0.5)')).toEqual([255, 143, 179, 0.5]);
    expect(parseColour('rgb(255 143 179 / 0.5)')).toEqual([255, 143, 179, 0.5]);
  });

  it('returns null rather than a guess for anything else', () => {
    expect(parseColour('hotpink')).toBeNull();
    expect(parseColour('rgb(50%, 50%, 50%)')).toBeNull();
    expect(parseColour('')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('agrees with the two ratios everybody knows', () => {
    expect(contrastRatio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255, 1], [255, 255, 255, 1])).toBeCloseTo(1, 5);
  });

  it('does not care which colour is given first', () => {
    const a = contrastBetween('#FF8FB3', '#1A1A1D');
    const b = contrastBetween('#1A1A1D', '#FF8FB3');
    expect(a).toBeCloseTo(b!, 10);
  });
});

/**
 * The gender mark tokens carry a table of eight measured ratios in their own
 * comment in demo/template.html. This is what stops that table being a claim
 * about colours the file no longer holds — every figure below is recomputed
 * from the tokens as the stylesheet declares them today.
 *
 * The marks are graphics, which WCAG asks 3:1 of. They are held to the 4.5:1
 * text bar instead, matching the standard the monogram lightness tokens above
 * them were tuned to.
 */
describe('the gender marks clear AA on every ground they are painted on', () => {
  // An unselected pill is --surface-2. A selected one inverts to --ink, which
  // is why each mark has a second value: no single colour reads on both a
  // near-black and a near-white.
  const cases: [string, RegExp, string, string, number][] = [
    ['dark, unselected pill', DARK, '--gender-women', '--surface-2', 8.13],
    ['dark, unselected pill', DARK, '--gender-men', '--surface-2', 8.64],
    ['dark, selected pill', DARK, '--gender-women-on', '--ink', 6.57],
    ['dark, selected pill', DARK, '--gender-men-on', '--ink', 6.86],
    ['light, unselected pill', LIGHT, '--gender-women', '--surface-2', 6.30],
    ['light, unselected pill', LIGHT, '--gender-men', '--surface-2', 6.56],
    ['light, selected pill', LIGHT, '--gender-women-on', '--ink', 9.09],
    ['light, selected pill', LIGHT, '--gender-men-on', '--ink', 9.67],
  ];

  it.each(cases)('%s: %s on %s', (_label, block, fg, bg, documented) => {
    const ratio = contrastBetween(tokenIn(block, fg), tokenIn(block, bg));
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeGreaterThanOrEqual(AA_TEXT);
    // Two decimal places, the precision the comment quotes them to.
    expect(Number(ratio!.toFixed(2))).toBe(documented);
  });
});

/**
 * The same guard on the palette's own load-bearing pairs. These are not
 * quoted in a comment, so the assertion is the floor itself: text on a ground
 * has to clear AA in both themes, and a retint that breaks it should not be
 * able to ship quietly.
 */
describe('body text clears AA in both themes', () => {
  const pairs: [string, string][] = [
    ['--ink', '--bg'],
    ['--ink-2', '--bg'],
    ['--faint', '--bg'],
    ['--ink', '--surface'],
    ['--accent-ink', '--bg'],
    ['--accent-on', '--accent'],
  ];

  it.each(pairs)('dark: %s on %s', (fg, bg) => {
    expect(contrastBetween(tokenIn(DARK, fg), tokenIn(DARK, bg))!).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(pairs)('light: %s on %s', (fg, bg) => {
    expect(contrastBetween(tokenIn(LIGHT, fg), tokenIn(LIGHT, bg))!).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

/**
 * The five palette blocks have to agree with each other. "Match my device" is
 * the default, and it resolves through three of them, so a token added to the
 * dark block and forgotten in the system-light one is a colour that silently
 * falls back to whatever it inherited.
 */
describe('every palette block declares the same tokens', () => {
  const blocks: [string, RegExp][] = [
    ['dark default', DARK],
    ['light', LIGHT],
    ['system, device prefers light', /@media \(prefers-color-scheme: light\) \{\n\s*:root\[data-mode="system"\] \{/],
    ['host stamped light', /:root\[data-mode="system"\]\[data-theme="light"\] \{/],
    ['host stamped dark', /:root\[data-mode="system"\]\[data-theme="dark"\] \{/],
  ];

  const namesIn = (block: RegExp): string[] => {
    const start = template.search(block);
    expect(start, 'palette block not found').toBeGreaterThan(-1);
    const body = template.slice(start, template.indexOf('\n  }', start));
    return [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!).sort();
  };

  const baseline = namesIn(DARK);

  it('the dark block is the one every other is checked against', () => {
    expect(baseline).toContain('--gender-women');
    expect(baseline).toContain('--gender-men-on');
  });

  it.each(blocks)('%s declares them all', (_label, block) => {
    expect(namesIn(block)).toEqual(baseline);
  });
});
