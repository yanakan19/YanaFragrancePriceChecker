import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { AA_TEXT, contrastBetween, parseColour, relativeLuminance } from '../demo/contrast.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The brand pill at the top of every product tile (owner, 6 Oct 2026): centred,
 * the shop pill's box without its arrow, one grey lighter than the shop pill,
 * one line with an ellipsis. The palette half reads the stylesheet, so a retint
 * has to break it; the browser half measures the built page.
 */

/** Every palette block that declares the pill's ground, with the tokens beside it. */
function paletteBlocks(): { ground: string; surface2: string; ink2: string }[] {
  const blocks: { ground: string; surface2: string; ink2: string }[] = [];
  for (const m of template.matchAll(/--pill-brand:\s*(#[0-9A-Fa-f]{6})/g)) {
    // The block is the stretch before this declaration back to its opening brace.
    const before = template.slice(0, m.index);
    const open = before.lastIndexOf('{');
    const text = template.slice(open, m.index! + m[0].length + 200);
    const surface2 = /--surface-2:\s*(#[0-9A-Fa-f]{6})/.exec(text)?.[1];
    const ink2 = /--ink-2:\s*(#[0-9A-Fa-f]{6})/.exec(text)?.[1];
    expect(surface2, `--surface-2 in the block of ${m[0]}`).toBeTruthy();
    expect(ink2, `--ink-2 in the block of ${m[0]}`).toBeTruthy();
    blocks.push({ ground: m[1]!, surface2: surface2!, ink2: ink2! });
  }
  return blocks;
}

describe('the brand pill palette', () => {
  const blocks = paletteBlocks();

  it('is declared in all five palette blocks (dark, light, and the three system ones)', () => {
    expect(blocks).toHaveLength(5);
  });

  it.each(blocks.map((b, i) => [i, b] as const))('block %i: lighter than the shop pill, and its text clears AA', (_i, b) => {
    const lum = (hex: string): number => relativeLuminance(parseColour(hex)!);
    expect(lum(b.ground), 'lighter grey than --surface-2').toBeGreaterThan(lum(b.surface2));
    expect(contrastBetween(b.ink2, b.ground)!, `${b.ink2} on ${b.ground}`).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('is applied to the tile pill only, without a border, with 8px corners like .sold-by', () => {
    const rule = /\.tile \.phead-brand \{([^}]*)\}/.exec(template)?.[1] ?? '';
    expect(rule).toContain('background: var(--pill-brand)');
    expect(rule).toContain('border: 0');
    expect(rule).toContain('border-radius: 8px');
    expect(rule).toContain('align-self: center');
    expect(rule).toContain('text-align: center');
  });

  it('is never wider than the outlined label it replaced: 11px type, 8px sides, the tile\'s whole content box and no more', () => {
    const rule = /\.tile \.phead-brand \{([^}]*)\}/.exec(template)?.[1] ?? '';
    // The old label: 11px 600 type, .02em tracking, a 1px border and 10px sides (text plus 22px).
    // Bigger type or wider padding makes more brand names end in an ellipsis than before (6 Oct 2026).
    const font = /font:\s*600\s+(\d+(?:\.\d+)?)px\//.exec(rule)?.[1];
    expect(Number(font), 'font size in px').toBeLessThanOrEqual(11);
    const tracking = /letter-spacing:\s*(-?[\d.]+)em/.exec(rule)?.[1];
    expect(Number(tracking), 'letter spacing in em').toBeLessThanOrEqual(0.02);
    const sides = /padding:\s*\d+px\s+(\d+)px/.exec(rule)?.[1];
    expect(Number(sides) * 2, 'horizontal padding, both sides').toBeLessThanOrEqual(16);
    expect(rule).toContain('border: 0');
    expect(rule).toContain('max-width: 100%');
    expect(rule).toContain('box-sizing: border-box');
    expect(/\.sold-by \{[^}]*border-radius: 8px/.test(template)).toBe(true);
  });
});

describe.skipIf(!built)('the brand pill on a tile, in the built page', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  async function open(route: string, width: number, mode: 'dark' | 'light'): Promise<{ page: Page; done: () => Promise<void> }> {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, mode);
    await context.route((u) => u.hostname !== '127.0.0.1' && u.hostname !== 'localhost', (r) => r.abort());
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('#view .tile');
    return { page, done: () => context.close() };
  }

  for (const width of [320, 390, 1280] as const) {
    for (const mode of ['dark', 'light'] as const) {
      it(`centred, inside the tile, one line, lighter than the shop pill at ${width}px, ${mode}`, async () => {
        const { page, done } = await open('/search?q=black', width, mode);
        try {
          const r = await page.evaluate(() => {
            const out = { tiles: 0, offCentre: [] as string[], outside: [] as string[], wrapped: [] as string[], tall: [] as number[], bg: '', shopBg: '', color: '', hasArrow: false };
            for (const t of Array.from(document.querySelectorAll('#view .tile'))) {
              const b = t.querySelector('.phead-brand') as HTMLElement | null;
              if (!b) continue;
              out.tiles++;
              const tr = t.getBoundingClientRect();
              const br = b.getBoundingClientRect();
              const tcs = getComputedStyle(t);
              const innerL = tr.left + parseFloat(tcs.paddingLeft) + 1;
              const innerR = tr.right - parseFloat(tcs.paddingRight) - 1;
              const name = b.textContent!.trim();
              if (Math.abs((br.left + br.right) / 2 - (tr.left + tr.right) / 2) > 1.5) out.offCentre.push(name);
              if (br.left < innerL - 0.5 || br.right > innerR + 0.5) out.outside.push(name);
              if (b.getClientRects().length !== 1 || br.height > 22) out.wrapped.push(name);
              out.tall.push(Math.round(br.height));
              if (b.querySelector('svg') || /[→>]/.test(b.textContent!)) out.hasArrow = true;
            }
            const b0 = document.querySelector('#view .tile .phead-brand')!;
            const s0 = document.querySelector('#view .tile .sold-by:not([aria-hidden])')!;
            const cs = getComputedStyle(b0);
            out.bg = cs.backgroundColor;
            out.color = cs.color;
            out.shopBg = getComputedStyle(s0).backgroundColor;
            return out;
          });
          expect(r.tiles).toBeGreaterThan(10);
          expect(r.offCentre).toEqual([]);
          expect(r.outside).toEqual([]);
          expect(r.wrapped).toEqual([]);
          expect(r.hasArrow).toBe(false);
          expect(new Set(r.tall).size, 'every brand pill is the same height').toBe(1);
          const lum = (c: string): number => relativeLuminance(parseColour(c)!);
          expect(lum(r.bg), 'lighter than the shop pill').toBeGreaterThan(lum(r.shopBg));
          expect(contrastBetween(r.color, r.bg)!).toBeGreaterThanOrEqual(AA_TEXT);
          expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
        } finally {
          await done();
        }
      });
    }
  }

  for (const width of [320, 390, 1280] as const) {
    for (const mode of ['dark', 'light'] as const) {
      it(`is no wider than the old outlined label, so no name is cut that was not cut before, at ${width}px, ${mode}`, async () => {
        const { page, done } = await open('/search?q=black', width, mode);
        try {
          const r = await page.evaluate(() => {
            const out = { pills: 0, wider: [] as string[], newlyCut: [] as string[], maxWidth: '', fontSize: '' };
            for (const t of Array.from(document.querySelectorAll('#view .tile'))) {
              const b = t.querySelector('.phead-brand') as HTMLElement | null;
              if (!b) continue;
              out.pills++;
              const tcs = getComputedStyle(t);
              const room = t.getBoundingClientRect().width - parseFloat(tcs.paddingLeft) - parseFloat(tcs.paddingRight);
              // Natural width now, and the width the old label (11px, .02em, 1px border, 10px sides) would have had.
              const measure = (old: boolean): number => {
                const c = b.cloneNode(true) as HTMLElement;
                c.style.cssText = 'position:absolute;visibility:hidden;max-width:none;width:max-content;'
                  + (old ? 'border:1px solid transparent;padding:3px 10px;letter-spacing:.02em;font-size:11px;font-weight:600;' : '');
                t.appendChild(c);
                const w = c.getBoundingClientRect().width;
                c.remove();
                return w;
              };
              const now = measure(false);
              const before = measure(true);
              const name = b.textContent!.trim();
              if (now > before - 0.5) out.wider.push(`${name} ${now.toFixed(1)} vs ${before.toFixed(1)}`);
              if (now > room + 0.5 && before <= room + 0.5) out.newlyCut.push(name);
            }
            const cs = getComputedStyle(document.querySelector('#view .tile .phead-brand')!);
            out.maxWidth = cs.maxWidth;
            out.fontSize = cs.fontSize;
            return out;
          });
          expect(r.pills).toBeGreaterThan(10);
          expect(r.wider).toEqual([]);
          expect(r.newlyCut).toEqual([]);
          expect(r.fontSize).toBe('11px');
          expect(r.maxWidth).toBe('100%');
        } finally {
          await done();
        }
      });
    }
  }

  it('truncates a long brand with an ellipsis inside the pill at 320px, the full name in the title', async () => {
    const { page, done } = await open('/search?q=black', 320, 'light');
    try {
      const r = await page.evaluate(() => {
        const b = document.querySelector('#view .tile .phead-brand') as HTMLElement;
        // A name far longer than any tile, set in place: only the pill's own CSS can keep it in.
        b.textContent = 'The Extraordinarily Long House of Perfumery and Fine Fragrance Limited';
        const t = b.closest('.tile')!.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return { within: br.left >= t.left && br.right <= t.right, ellipsis: cs.textOverflow, overflow: cs.overflow, white: cs.whiteSpace, clipped: b.scrollWidth > b.clientWidth, height: br.height };
      });
      expect(r).toMatchObject({ within: true, ellipsis: 'ellipsis', overflow: 'hidden', white: 'nowrap', clipped: true, height: 19 });
    } finally {
      await done();
    }
  });
});
