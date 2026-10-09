import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase } from './support/fakeAccount.js';
import { ageConfirmHtml, needsAgeConfirmation } from '../demo/ageConfirm.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * "I am 18 or over" at sign up for Indian visitors (owner decision, 9 October
 * 2026; DPDP, docs/INTERNATIONAL-PLAN.md section 5). Nothing is stored: it is
 * a required step in the form. UK and US forms are unchanged.
 */

describe('who is asked', () => {
  it('only the Indian site, or a visitor whose chosen region is India', () => {
    expect(needsAgeConfirmation('IN', null)).toBe(true);
    expect(needsAgeConfirmation('GB', 'IN')).toBe(true);
    expect(needsAgeConfirmation('GB', null)).toBe(false);
    expect(needsAgeConfirmation('US', null)).toBe(false);
    expect(needsAgeConfirmation('US', 'GB')).toBe(false);
  });
  it('the checkbox is labelled', () => {
    const html = ageConfirmHtml();
    expect(html).toContain('<input type="checkbox" id="auth-age"');
    expect(html).toContain('I am 18 or over');
  });
});

describe.skipIf(!built)('the create account form on the built page', () => {
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

  async function open(route: string, opts: { width?: number; mode?: 'dark' | 'light'; chosen?: string } = {}): Promise<{ context: BrowserContext; page: Page; signups: string[] }> {
    const context = await browser.newContext({ viewport: { width: opts.width ?? 390, height: 844 } });
    await context.addInitScript(([m, c]: [string, string]) => {
      try {
        localStorage.setItem('pricesniffs.display', m);
        if (c) localStorage.setItem('pricesniffs.region', c);
      } catch { /* fine */ }
    }, [opts.mode ?? 'light', opts.chosen ?? ''] as [string, string]);
    await stubSupabase(context, null, null);
    const page = await context.newPage();
    const signups: string[] = [];
    page.on('request', (r) => { if (/\/auth\/v1\/signup/.test(r.url())) signups.push(r.url()); });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('[data-auth-tab="signUp"]', { timeout: 15_000 });
    await page.click('[data-auth-tab="signUp"]');
    await page.waitForSelector('#auth-signup-form');
    return { context, page, signups };
  }

  for (const [route, label] of [['/account', 'UK'], ['/us/account', 'US']] as const) {
    it(`${label}: no checkbox, and sign up goes ahead`, async () => {
      const { context, page, signups } = await open(route);
      try {
        expect(await page.$('#auth-age') === null).toBe(true);
        await page.fill('#auth-email', 'new@example.com');
        await page.fill('#auth-password', 'correct horse battery');
        await page.click('#auth-signup-form button[type=submit]');
        await page.waitForTimeout(1000);
        expect(signups.length).toBeGreaterThan(0);
        expect(await page.evaluate(`document.querySelector('#ps-dialog-title')?.textContent ?? ''`)).not.toContain('Confirm Your Age');
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  for (const width of [320, 1280]) {
    for (const mode of ['light', 'dark'] as const) {
      it(`India at ${width}px (${mode}): labelled checkbox, blocked until ticked, axe clean`, async () => {
        const { context, page, signups } = await open('/in/account', { width, mode });
        try {
          const box = page.getByLabel('I am 18 or over');
          expect(await box.count()).toBe(1);
          expect(await box.getAttribute('aria-required')).toBe('true');
          expect(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
          const hit = await page.evaluate(`document.querySelector('.age-check').getBoundingClientRect().height`) as number;
          expect(hit).toBeGreaterThanOrEqual(44);
          const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
          expect(r.violations.map((v) => v.id)).toEqual([]);

          await page.fill('#auth-email', 'new@example.com');
          await page.fill('#auth-password', 'correct horse battery');
          await page.click('#auth-signup-form button[type=submit]');
          await page.waitForSelector('#ps-dialog[open]');
          expect((await page.textContent('#ps-dialog-title'))?.trim()).toBe('Please Confirm Your Age');
          expect(signups).toEqual([]);
          await page.keyboard.press('Escape');

          await box.focus();
          await page.keyboard.press('Space');
          expect(await box.isChecked()).toBe(true);
          await page.click('#auth-signup-form button[type=submit]');
          await page.waitForTimeout(1000);
          expect(signups.length).toBeGreaterThan(0);
        } finally {
          await context.close();
        }
      }, 60_000);
    }
  }

  it('a UK address with India chosen also asks; the sign in form never does', async () => {
    const { context, page } = await open('/account', { chosen: 'IN' });
    try {
      expect(await page.$('#auth-age') !== null).toBe(true);
      await page.click('[data-auth-tab="signIn"]');
      await page.waitForSelector('#auth-signin-form');
      expect(await page.$('#auth-age') === null).toBe(true);
    } finally {
      await context.close();
    }
  }, 60_000);
});
