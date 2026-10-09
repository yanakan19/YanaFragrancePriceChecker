import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/us/index.html')) && existsSync(resolve(root, 'demo/in/index.html'));

/**
 * The Deals tab of the US (/us/deals) and India (/in/deals) beta sites on the
 * built page (docs/INTERNATIONAL-PLAN.md, "Deals on the US and India sites"):
 * the Beta line stays, and with fewer than six real deals the tab says "Not many
 * deals yet in the beta." instead of an empty page or padded results. The UK's
 * Deals page never carries that line. How many deals stand depends on the
 * shops' reference prices in the committed snapshots, so the page is checked
 * against its own list: a tile is either absent (the line stands alone) or
 * shows the region's symbol, and the line shows exactly when fewer than six.
 */
describe.skipIf(!built)('the Deals tab on the region sites', () => {
  let browser: Browser;
  let port = 0;
  let close: () => void = () => {};

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium({ countryChosen: 'GB' });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    close();
  });

  async function dealsPage(path: string) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await stubSupabase(context, null, null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    const read = async () => ({
      beta: (await page.evaluate(`document.querySelector('#beta-line')?.textContent ?? ''`)) as string,
      line: (await page.evaluate(`[...document.querySelectorAll('.empty-note')].map((e) => e.textContent).join('|')`)) as string,
      tiles: (await page.evaluate(`document.querySelectorAll('.tile-grid li').length`)) as number,
      prices: (await page.evaluate(`[...document.querySelectorAll('.tile-grid .amt, .tile-grid .was')].map((e) => e.textContent).join(' ')`)) as string,
    });
    const out = await read();
    await context.close();
    return out;
  }

  for (const [path, word, symbol, badSymbol] of [['/us/deals', 'MSRP', '$', '£'], ['/in/deals', 'MRP', '₹', '£']] as const) {
    it(`${path}: the Beta line stays; fewer than six deals say so; any tile uses ${symbol} and ${word}`, async () => {
      const r = await dealsPage(path);
      expect(r.beta).toContain('in beta');
      if (r.tiles < 6) expect(r.line).toContain('Not many deals yet in the beta.');
      else expect(r.line).not.toContain('Not many deals yet');
      if (r.tiles > 0) {
        expect(r.prices).toContain(symbol);
        expect(r.prices).not.toContain(badSymbol);
        expect(r.prices).toContain(`${word} `);
        expect(r.prices).not.toMatch(/\bRRP\b/);
      }
    }, 60_000);
  }

  it('the UK Deals page never carries the beta line', async () => {
    const r = await dealsPage('/deals');
    expect(r.line).not.toContain('Not many deals yet');
    expect(r.beta).toBe('');
  }, 60_000);
});
