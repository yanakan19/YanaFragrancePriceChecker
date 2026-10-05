import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { matchRoute, routeToPath } from '../demo/router.js';
import { headFor } from '../demo/head.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * "Got an Idea?" became Suggestions in the account menu (owner's decision,
 * 2026-10-04): out of the home page, in the menu directly under Settings for
 * every reader, signed in or not, opening the same form on a page of its own.
 * The signed in menu is held by tests/accountMenu.test.ts and by
 * tests/accountPagesBrowser.test.ts (a stored session, stubbed answers).
 */
describe('the Suggestions route', () => {
  it('is /suggestions, a noindex page with its own title', () => {
    const route = matchRoute('/suggestions');
    expect(route.name).toBe('suggestions');
    expect(routeToPath(route)).toBe('/suggestions');
    const tags = headFor({ route });
    expect(tags.title).toBe('PriceSniffs: Suggestions');
    expect(tags.noindex).toBe(true);
    expect(tags.canonical).toMatch(/\/suggestions$/);
  });
});

describe.skipIf(!built)('Suggestions on the built site', () => {
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

  const labels = (page: Page): Promise<string[]> =>
    page.$$eval('#account-menu [role=menuitem]', (els) => els.map((e) => (e.textContent ?? '').trim()));

  for (const width of [390, 1280]) {
    it(`is directly under Settings in the signed out menu at ${width} wide, and opens the form`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`http://localhost:${port}/`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.click('#account-btn');
      const items = await labels(page);
      expect(items).toEqual(['Sign In', 'Create an Account', 'Settings', 'Suggestions']);
      expect(items.indexOf('Suggestions')).toBe(items.indexOf('Settings') + 1);

      await page.click('#account-menu [role=menuitem]:text-is("Suggestions")');
      await page.waitForFunction(() => location.pathname === '/suggestions');
      expect(await page.title()).toBe('PriceSniffs: Suggestions');
      expect((await page.textContent('#view h1'))?.trim()).toBe('Suggestions');
      expect(await page.getAttribute('meta[name=robots]', 'content')).toContain('noindex');

      // The same form the home page had: suggestion, optional name and email, Send.
      expect(await page.$('#suggest-body')).not.toBeNull();
      expect(await page.$('#suggest-name')).not.toBeNull();
      expect(await page.$('#suggest-email')).not.toBeNull();
      expect((await page.textContent('#suggest-form .contact-send'))?.trim()).toBe('Send');
      // The privacy line is kept, with its link to the notice.
      const privacy = (await page.textContent('#view .form-privacy'))?.replace(/\s+/g, ' ').trim();
      expect(privacy).toBe('We keep what you send only for as long as it takes to reply. Privacy Notice');
      expect(await page.$('#view .form-privacy [data-page="privacy"]')).not.toBeNull();
      // And the note that Send hands the message to the reader's own email app.
      expect(await page.textContent('#view')).toContain('Send opens your own email app');

      // Send does not reach a server: it says the email app should now be open.
      await page.fill('#suggest-body', 'Please add a size filter for travel sprays.');
      await page.click('#suggest-form .contact-send');
      await page.waitForSelector('#suggest-confirm:not([hidden])');
      expect(await page.textContent('#suggest-confirm')).toContain('Your email app should now be open');
      await page.close();
    }, 90_000);
  }

  it('is also in the menu when accounts are not set up or still loading, and the page opens by address', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.goto(`http://localhost:${port}/suggestions`, { waitUntil: 'load' });
    await waitForApp(page);
    expect((await page.textContent('#view h1'))?.trim()).toBe('Suggestions');
    await page.click('#account-btn');
    expect(await page.getAttribute('#account-menu [aria-current="page"]', 'data-acct-action')).toBe('suggestions');
    await page.close();
  }, 90_000);

  for (const theme of ['dark', 'light'] as const) {
    for (const width of [375, 390, 1280]) {
      it(`has no sideways scroll and no axe violations at ${width} wide in the ${theme} theme`, async () => {
        const ctx = await browser.newContext({ viewport: { width, height: 900 } });
        await ctx.addInitScript(`try { localStorage.setItem('pricesniffs.display', '${theme}'); } catch (e) {}`);
        const page = await ctx.newPage();
        for (const route of ['/suggestions', '/']) {
          await page.goto(`http://localhost:${port}${route}`, { waitUntil: 'load' });
          await waitForApp(page);
          await page.waitForTimeout(300);
          const overflow = (await page.evaluate('document.documentElement.scrollWidth - window.innerWidth')) as number;
          expect(overflow, `${route} page sideways scroll`).toBeLessThanOrEqual(0);
          const result = await new AxeBuilder({ page }).analyze();
          expect(
            result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
            `${route} axe`,
          ).toEqual([]);
        }
        await ctx.close();
      }, 120_000);
    }
  }
});
