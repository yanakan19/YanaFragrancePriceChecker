import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { RETAILERS } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';
import { launchChromium } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');

/**
 * The owner, 2026-10-03: "I hate the fact that on a perfume listing some
 * retailers have logos and some don't." Every offer row now carries a 20px
 * mark: the shop's square logo, or an initials tile in the same slot, and a
 * logo that fails to load turns into that initials tile instead of leaving a
 * gap. demo/app.ts runs init() at import time and cannot be imported here, so
 * the handful of pure functions offerMark depends on are lifted out of its
 * source, compiled, and run for real.
 */
function lift(re: RegExp, what: string): string {
  const hit = app.match(re)?.[0];
  if (!hit) throw new Error(`could not find ${what} in demo/app.ts`);
  return hit;
}
const source = [
  lift(/const esc = \(s: string\) =>[\s\S]*?\n  \);\n/, 'esc'),
  lift(/function monogramHue\([\s\S]*?\n}\n/, 'monogramHue'),
  lift(/function initialsOf\([\s\S]*?\n}\n/, 'initialsOf'),
  lift(/function orgMarkInkClass\([\s\S]*?\n}\n/, 'orgMarkInkClass'),
  lift(/function squareLogoOf\([\s\S]*?\n}\n/, 'squareLogoOf'),
  lift(/const OFFER_MARK_ONERROR =[\s\S]*?;\n/, 'OFFER_MARK_ONERROR'),
  lift(/function offerMark\([\s\S]*?\n}\n/, 'offerMark'),
  'return { offerMark, initialsOf, OFFER_MARK_ONERROR };',
].join('\n');
const js = transformSync(source, { loader: 'ts' }).code;
const lifted = new Function(js)() as {
  offerMark: (r: Pick<Retailer, 'name' | 'logo' | 'squareLogo'>) => string;
  initialsOf: (name: string) => string;
  OFFER_MARK_ONERROR: string;
};
const { offerMark, initialsOf, OFFER_MARK_ONERROR } = lifted;

const enabled = RETAILERS.filter((r) => r.enabled);

describe('every offer row gets a shop mark', () => {
  it('is wired into the offer row', () => {
    expect(app).toContain('${offerMark(row.retailer)}');
  });

  it.each(enabled.map((r) => [r.id, r] as const))('%s gets an image or an initials tile', (_id, r) => {
    const html = offerMark(r);
    expect(html).toMatch(/class="[^"]*offer-mark/);
    if (html.includes('<img')) {
      // A logo: square only, and carrying its own fallback.
      const logo = r.logo?.shape === 'square' ? r.logo : r.squareLogo;
      expect(logo?.shape).toBe('square');
      expect(html).toContain(`src="${logo!.src.replace(/&/g, '&amp;')}"`);
      expect(html).toContain('onerror=');
      expect(html).toContain(`data-fallback="${initialsOf(r.name) || '?'}"`);
    } else {
      expect(html).toContain('offer-mark--initials');
      expect(html).toContain(`>${initialsOf(r.name) || '?'}</span>`);
    }
    expect(html).toMatch(/--mh:\d+/);
  });
});

describe('the initials fallback', () => {
  const plain = (name: string): Pick<Retailer, 'name' | 'logo' | 'squareLogo'> => ({ name });

  it('renders the shop initials on the name hue', () => {
    expect(offerMark(plain('John Lewis'))).toMatch(/^<span class="offer-mark offer-mark--initials" style="--mh:\d+" aria-hidden="true">JL<\/span>$/);
    expect(offerMark(plain('Boots'))).toContain('>B</span>');
  });

  it('is what a wordmark-only shop gets: a wide wordmark is never squeezed into the square', () => {
    const html = offerMark({
      name: 'Wide Shop',
      logo: { src: 'https://wide.example/logo.svg', shape: 'wordmark', ink: 'dark', basis: 'own-site-declared', source: 'https://wide.example', readAt: '2026-10-03' },
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('>WS</span>');
  });

  it('uses the square companion beside a wordmark when one is recorded', () => {
    const html = offerMark({
      name: 'Wide Shop',
      logo: { src: 'https://wide.example/logo.svg', shape: 'wordmark', ink: 'dark', basis: 'own-site-declared', source: 'https://wide.example', readAt: '2026-10-03' },
      squareLogo: { src: 'https://wide.example/icon.png', shape: 'square', ink: 'own', basis: 'own-site-declared', source: 'https://wide.example', readAt: '2026-10-03' },
    });
    expect(html).toContain('src="https://wide.example/icon.png"');
  });

  it('is styled from the monogram tokens, which are contrast tested in both themes', () => {
    const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
    const rule = template.match(/\.offer-mark--initials \{[\s\S]*?\}/)?.[0] ?? '';
    expect(rule).toContain('var(--mono-bg-l)');
    expect(rule).toContain('var(--mono-fg-l)');
    expect(rule).toContain('var(--mh');
  });
});

describe('a logo that fails to load becomes the initials tile', () => {
  const shop = { name: 'Fail Shop', logo: { src: 'https://fail.example/icon.png', shape: 'square' as const, ink: 'own' as const, basis: 'own-site-declared' as const, source: 'https://fail.example', readAt: '2026-10-03' } };

  it('runs the handler against the tile and leaves initials, not an empty box', () => {
    const parent = { className: 'org-mark offer-mark org-mark--own', textContent: '', dataset: { fallback: 'FS' } };
    new Function(OFFER_MARK_ONERROR).call({ parentElement: parent });
    expect(parent.className).toBe('offer-mark offer-mark--initials');
    expect(parent.textContent).toBe('FS');
  });

  describe('in Chromium', () => {
    let browser: Browser | null = null;
    beforeAll(async () => {
      try {
        browser = await launchChromium();
      } catch {
        browser = null;
      }
    }, 60_000);
    afterAll(async () => {
      await browser?.close();
    });

    it('swaps a blocked image for the initials in place', async () => {
      if (!browser) return;
      const page = await browser.newPage();
      await page.route('**/*', (route) => route.abort());
      await page.setContent(`<p class="shop">${offerMark(shop)}Fail Shop</p>`);
      // Strings rather than functions: this suite compiles without the DOM lib.
      await page.waitForFunction("!document.querySelector('.offer-mark img')", null, { timeout: 10_000 });
      const mark = (await page.evaluate(
        "(() => { const el = document.querySelector('.offer-mark'); return { cls: el.className, text: el.textContent, hue: el.style.getPropertyValue('--mh') }; })()",
      )) as { cls: string; text: string; hue: string };
      expect(mark.cls).toBe('offer-mark offer-mark--initials');
      expect(mark.text).toBe('FS');
      expect(mark.hue).toMatch(/^\d+$/);
      await page.close();
    }, 30_000);
  });
});
