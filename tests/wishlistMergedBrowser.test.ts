import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase, type FakeAccount } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * /account/wishlist for a reader whose saved ids have since merged into other
 * products (data/id-aliases.json), on the built page with the fake account of
 * tests/support/fakeAccount.ts. The stored rows keep the ids as saved; the
 * page reads them through the merge map.
 */

const SHADES = 'ean-6085010092058'; // Armaf Shades, which absorbed the next two ids
const SHADES_SKU = 'armaf-arf32101043';
const SHADES_VARIANT = 'mybeauty-boutique-shopify-gb-8416634667145-45146964885641';
const AVENTURE_OLD = 'al-haramain-ahp1908'; // L'Aventure Femme (ean-6291100137565)
const GONE = 'fu-no-such-product-ever-listed';

function reader(): FakeAccount {
  return {
    email: 'reader@example.com',
    createdAt: '2026-09-20T10:00:00Z',
    wishlist: [
      { fragrance_id: SHADES_SKU, target_price_gbp: null, added_at: '2026-09-01T09:00:00Z', saved_price_gbp: 999 },
      { fragrance_id: SHADES_VARIANT, target_price_gbp: null, added_at: '2026-10-01T09:00:00Z', saved_price_gbp: 998 },
      { fragrance_id: AVENTURE_OLD, target_price_gbp: 20, added_at: '2026-09-10T09:00:00Z', saved_price_gbp: 997 },
      { fragrance_id: GONE, target_price_gbp: null, added_at: '2026-10-03T09:00:00Z' },
    ],
    priceAlerts: true,
    writes: [],
  };
}

describe.skipIf(!built)('the wishlist for products that merged', () => {
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

  async function open(route: string, account: FakeAccount): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await stubSupabase(context, account, null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('.wishlist-row', { timeout: 20_000 });
    return { context, page };
  }

  const lines = (page: Page) =>
    page.evaluate(`Array.from(document.querySelectorAll('.wishlist-row')).map((r) => ({
      name: r.querySelector('.shop-row-name').textContent.trim(),
      text: r.textContent.replace(/\\s+/g, ' ').trim(),
      price: r.querySelector('.wishlist-price').textContent.trim(),
      frag: r.querySelector('[data-frag]')?.getAttribute('data-frag') ?? null,
      remove: r.querySelector('[data-wishlist-remove]').getAttribute('data-wishlist-remove'),
      target: r.querySelector('[data-wishlist-target]')?.getAttribute('data-wishlist-target') ?? null,
    }))`) as Promise<
      { name: string; text: string; price: string; frag: string | null; remove: string; target: string | null }[]
    >;

  it('merged ids find their price, a gone product says so, two ids that merged show once', async () => {
    const account = reader();
    const { context, page } = await open('/account/wishlist', account);
    try {
      const all = await lines(page);
      // Four rows saved, three lines: the two Shades ids are one.
      expect(all).toHaveLength(3);

      const shades = all.find((l) => l.frag === SHADES)!;
      expect(shades.name).toContain('Shades');
      expect(shades.price).toMatch(/£\d+\.\d{2} (delivered at|at) \S|Sold out everywhere today|Preorder only/);
      // The oldest save's price (999) is the baseline, recorded against the old id.
      expect(shades.text).toMatch(/saved at £999\.00/i);
      expect(shades.text).toContain('Saved 1 Sept 2026');
      expect(shades.text).toContain('merged');
      // The row is acted on by the ids as saved, both of them.
      expect(shades.remove.split(' ').sort()).toEqual([SHADES_SKU, SHADES_VARIANT].sort());

      const aventure = all.find((l) => l.name.includes('Aventure'))!;
      expect(aventure.frag).toBe('ean-6291100137565');
      expect(aventure.price).toMatch(/£\d+\.\d{2}|Sold out everywhere today|Preorder only/);
      expect(aventure.text).toMatch(/saved at £997\.00/i);
      // The target typed against the old id is shown, and saves against that same stored row.
      expect(aventure.target).toBe(AVENTURE_OLD);
      expect(await page.inputValue(`[data-wishlist-target="${AVENTURE_OLD}"]`)).toBe('20.00');

      const gone = all.find((l) => l.price === 'No longer listed')!;
      expect(gone.frag, 'not a link to a page that does not exist').toBeNull();
      expect(gone.remove).toBe(GONE);
      expect(gone.target).toBeNull();
      expect(gone.text).not.toMatch(/undefined|null|NaN|error/i);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('Remove on a merged line removes every row it stands for', async () => {
    const account = reader();
    const { context, page } = await open('/account/wishlist', account);
    try {
      await page.click(`[data-wishlist-remove="${SHADES_SKU} ${SHADES_VARIANT}"], [data-wishlist-remove="${SHADES_VARIANT} ${SHADES_SKU}"]`);
      await page.waitForFunction(`document.querySelectorAll('.wishlist-row').length === 2`, null, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const deletes = account.writes!.filter((w) => w.startsWith('wishlists DELETE'));
      expect(deletes).toHaveLength(2);
      expect(deletes.some((d) => d.includes(`fragrance_id=eq.${SHADES_SKU}`))).toBe(true);
      expect(deletes.some((d) => d.includes(`fragrance_id=eq.${SHADES_VARIANT}`))).toBe(true);
      expect(deletes.every((d) => !d.includes(GONE) && !d.includes(AVENTURE_OLD))).toBe(true);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('Remove on a product that is no longer listed removes that row only', async () => {
    const account = reader();
    const { context, page } = await open('/account/wishlist', account);
    try {
      await page.click(`.wishlist-gone [data-wishlist-remove="${GONE}"]`);
      await page.waitForFunction(`document.querySelectorAll('.wishlist-row').length === 2`, null, { timeout: 10_000 });
      await page.waitForTimeout(300);
      const deletes = account.writes!.filter((w) => w.startsWith('wishlists DELETE'));
      expect(deletes).toHaveLength(1);
      expect(deletes[0]).toContain(`fragrance_id=eq.${GONE}`);
      expect((await lines(page)).some((l) => l.price === 'No longer listed')).toBe(false);
    } finally {
      await context.close();
    }
  }, 90_000);

  it('the target saved on a merged line goes to the row as stored', async () => {
    const account = reader();
    const { context, page } = await open('/account/wishlist', account);
    try {
      const input = `[data-wishlist-target="${AVENTURE_OLD}"]`;
      await page.fill(input, '18.50');
      await page.press(input, 'Tab');
      await page.waitForTimeout(500);
      const patches = account.writes!.filter((w) => w.startsWith('wishlists PATCH'));
      expect(patches).toHaveLength(1);
      expect(patches[0]).toContain(`fragrance_id=eq.${AVENTURE_OLD}`);
    } finally {
      await context.close();
    }
  }, 90_000);
});
