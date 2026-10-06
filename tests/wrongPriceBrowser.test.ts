import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { COMPANY } from '../demo/legal.js';
import { fragranceById } from '../demo/data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * "Spotted a wrong price? Tell us" on the built page (queue item 3.3): the
 * link is on product pages and nowhere else, and the report dialog behaves
 * like a dialog for a keyboard and a screen reader. What the email says is
 * covered in tests/wrongPrice.test.ts.
 */
describe.skipIf(!built)('wrong price report (built page, Chromium)', () => {
  let browser: Browser;
  let ctx: BrowserContext;
  let port = 0;
  let close: () => void = () => {};
  let productPath = '';
  /** The product's own address, which is what the report's email names. */
  let ownAddress = '';

  beforeAll(async () => {
    ({ port, close } = await startDemoServer());
    browser = await launchChromium();
    ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    // The most stocked fragrance on the home rail: as many shops as a page gets.
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`);
    await waitForApp(page);
    const id = await page.getAttribute('.pop-rail [data-frag]', 'data-frag');
    // Opened by the old address, which still works and is rewritten; the
    // email names the address the product has now (docs/PRODUCT-URLS.md).
    productPath = `/fragrance/${encodeURIComponent(id!)}`;
    ownAddress = `/${fragranceById(id!)!.slug}`;
    await page.close();
  }, 90_000);

  afterAll(async () => {
    await ctx?.close();
    await browser?.close();
    close();
  });

  async function open(path: string): Promise<Page> {
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}${path}`);
    await waitForApp(page);
    return page;
  }

  it('shows one link under the offers on a product page, and none elsewhere', async () => {
    const page = await open(productPath);
    const links = page.locator('[data-report-price]');
    await expect.poll(() => links.count()).toBe(1);
    expect((await links.textContent())?.trim()).toBe('Spotted a Wrong Price? Tell Us');
    // Under the list, not inside a row.
    expect(await page.locator('.offers [data-report-price]').count()).toBe(0);
    expect(await page.locator('.detail-offers > .report-wrong [data-report-price]').count()).toBe(1);
    await page.close();

    for (const path of ['/', '/deals', '/search', '/retailers/fragrance-click', '/about/legal']) {
      const other = await open(path);
      expect(await other.locator('[data-report-price]').count(), path).toBe(0);
      await other.close();
    }
  }, 120_000);

  it('opens a labelled modal, moves focus into it, lists this page\'s shops, and closes on Esc', async () => {
    const page = await open(productPath);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const shopsOnPage = (await page.locator('.detail-offers .offers .shop').evaluateAll(
      // The shop's name is the row's own text node: a logo (.offer-mark) may
      // come before it and a Cheapest tag after it, both elements.
      (els) => els.map((el) => (Array.from(el.childNodes).find((n) => n.nodeType === 3 && (n.textContent ?? '').trim())?.textContent ?? '').trim()),
    ));
    expect(shopsOnPage.length).toBeGreaterThan(0);

    const link = page.locator('[data-report-price]');
    await link.focus();
    await page.keyboard.press('Enter');
    const dlg = page.locator('dialog#ps-report');
    await expect.poll(() => dlg.evaluate((d) => (d as HTMLDialogElement).open)).toBe(true);

    const a11y = await dlg.evaluate((d) => ({
      modal: d.matches(':modal'),
      labelledBy: document.getElementById(d.getAttribute('aria-labelledby') ?? '')?.textContent ?? null,
      focusInside: d.contains(document.activeElement),
      focusName: (document.activeElement as HTMLSelectElement | null)?.name ?? null,
      unlabelled: Array.from(d.querySelectorAll('select, textarea, input')).filter((f) => !f.closest('label')).length,
      fontSizes: Array.from(d.querySelectorAll('select, textarea, input')).map((f) => getComputedStyle(f).fontSize),
      options: Array.from(d.querySelectorAll('select[name="shop"] option')).map((o) => o.textContent ?? ''),
      problems: Array.from(d.querySelectorAll('select[name="problem"] option')).map((o) => o.textContent ?? ''),
    }));
    expect(a11y.modal).toBe(true);
    expect(a11y.labelledBy).toBe('Report a Wrong Price');
    expect(a11y.focusInside).toBe(true);
    expect(a11y.focusName).toBe('shop');
    expect(a11y.unlabelled).toBe(0);
    // 16px or more, or iOS zooms the page on focus.
    for (const size of a11y.fontSizes) expect(parseFloat(size)).toBeGreaterThanOrEqual(16);
    for (const shop of shopsOnPage) expect(a11y.options.some((o) => o.startsWith(`${shop}, £`))).toBe(true);
    expect(a11y.options.at(-1)).toBe('Other');
    expect(a11y.problems).toEqual([
      'The price is different', 'The delivery cost is different', 'It is out of stock',
      'Wrong product or size', 'The link is broken',
    ]);

    await page.keyboard.press('Escape');
    await expect.poll(() => dlg.evaluate((d) => (d as HTMLDialogElement).open)).toBe(false);
    // Focus goes back to the link that opened it.
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-report-price'))).toBe(true);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('asks for a shop before sending, then confirms the email app has the report', async () => {
    const page = await open(productPath);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // The mailto: is handed to the system, not loaded, so it is read off
    // Chromium's own navigation request rather than any page request.
    const mailtos: string[] = [];
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Page.enable');
    cdp.on('Page.frameRequestedNavigation', (e: { url: string }) => {
      if (e.url.startsWith('mailto:')) mailtos.push(e.url);
    });
    // The row's own text node, as above: a logo (.offer-mark) may come first.
    const firstShop = (await page.locator('.detail-offers .offers .shop').first().evaluate(
      (el) => (Array.from(el.childNodes).find((n) => n.nodeType === 3 && (n.textContent ?? '').trim())?.textContent ?? '').trim(),
    ));
    await page.click('[data-report-price]');
    const dlg = page.locator('dialog#ps-report');
    await dlg.locator('button[value="send"]').click();
    // Native validation keeps it open until a shop is chosen.
    expect(await dlg.evaluate((d) => (d as HTMLDialogElement).open)).toBe(true);

    await dlg.locator('select[name="shop"]').selectOption({ index: 1 });
    await dlg.locator('select[name="problem"]').selectOption('stock');
    await dlg.locator('textarea[name="note"]').fill('Says sold out & 50% off?');
    await dlg.locator('button[value="send"]').click();

    const confirm = page.locator('dialog#ps-dialog');
    await expect.poll(() => confirm.evaluate((d) => (d as HTMLDialogElement).open)).toBe(true);
    expect(await confirm.locator('#ps-dialog-msg').textContent()).toContain('Your email app should now be open');
    expect(await dlg.evaluate((d) => (d as HTMLDialogElement).open)).toBe(false);

    expect(mailtos).toHaveLength(1);
    const url = new URL(mailtos[0]!);
    expect(url.pathname).toBe(COMPANY.feedbackEmail);
    const subject = url.searchParams.get('subject')!;
    const body = url.searchParams.get('body')!;
    expect(subject).toMatch(new RegExp(`^Wrong price: .+ at ${firstShop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(body).toContain(`Page: http`);
    expect(body).toContain(ownAddress);
    expect(body).not.toContain('/fragrance/');
    expect(body).toContain(`Shop: ${firstShop}`);
    expect(body).toMatch(/Price shown: £\d+\.\d\d/);
    expect(body).toMatch(/Checked: \d{1,2} \w+ \d{4}, \d\d:\d\d UK time/);
    expect(body).toContain('Problem: It is out of stock');
    expect(body).toContain('Says sold out & 50% off?');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);
});
