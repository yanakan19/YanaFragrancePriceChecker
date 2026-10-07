import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { FOOTER_LINKS } from '../demo/footerLinks.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The footer on every page, and the page without JavaScript, in a browser
 * (docs/ADVERTISING-PLAN.md Phase 1, risks 3 and 4). What the links are is held
 * by tests/footerLinks.test.ts; this file is how they look, behave and read.
 */
describe.skipIf(!built)('the footer and the page without JavaScript, on the built site', () => {
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

  const url = (path: string): string => `http://127.0.0.1:${port}${path}`;
  const overflow = (page: Page): Promise<number> =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  async function open(path: string, width = 1280): Promise<Page> {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(url(path), { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    return page;
  }

  const here = (page: Page): Promise<string> => page.evaluate(() => location.pathname + location.hash);
  const inView = (page: Page, selector: string): Promise<boolean> =>
    page.evaluate((sel) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return r.top >= 0 && r.top < window.innerHeight;
    }, selector);

  // The same links on every kind of page, none of them pushing the page sideways.
  for (const width of [320, 390, 1280]) {
    it(`shows every footer link on each kind of page at ${width} wide, with no sideways scroll`, async () => {
      for (const path of ['/', '/deals', '/about', '/about/legal', '/about/bot', '/brands', '/no-such-page']) {
        const page = await open(path, width);
        const links = await page.$$eval('.site-footer .footer-nav a', (as) =>
          as.map((a) => ({ href: a.getAttribute('href'), text: a.textContent!.trim(), h: Math.round(a.getBoundingClientRect().height), w: Math.round(a.getBoundingClientRect().width) })),
        );
        expect(links.map((l) => l.href), path).toEqual(FOOTER_LINKS.map((l) => l.href));
        expect(links.map((l) => l.text), path).toEqual(FOOTER_LINKS.map((l) => l.label));
        // Each is a target of at least 24 by 24 CSS pixels (WCAG 2.2, 2.5.8).
        for (const l of links) expect(Math.min(l.h, l.w), `${l.href} on ${path} at ${width}`).toBeGreaterThanOrEqual(24);
        expect(await overflow(page), `${path} at ${width}`).toBeLessThanOrEqual(0);
        // The footer lies inside the page's column.
        const box = await page.$eval('.site-footer', (f) => {
          const r = f.getBoundingClientRect();
          return { left: r.left, right: r.right, vw: document.documentElement.clientWidth };
        });
        expect(box.left, path).toBeGreaterThanOrEqual(0);
        expect(box.right, path).toBeLessThanOrEqual(box.vw + 0.5);
        await page.context().close();
      }
    }, 120_000);
  }

  it('opens Contact on the About page, at the Contact Us section, from any page', async () => {
    const page = await open('/deals', 390);
    await page.click('.site-footer a[href="/about#contact"]');
    await page.waitForFunction(() => location.pathname === '/about' && location.hash === '#contact');
    await page.waitForFunction(() => document.activeElement?.id === 'contact');
    expect(await page.locator('#contact').textContent()).toBe('Contact Us');
    await page.waitForFunction(() => {
      const r = document.getElementById('contact')!.getBoundingClientRect();
      return r.top >= 0 && r.top < 200;
    });
    expect(await page.$('#contact-form')).not.toBeNull();
    // Clicking it again, on the page itself, still lands there without a new history entry.
    const before = await page.evaluate(() => history.length);
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await page.click('.site-footer a[href="/about#contact"]');
    await page.waitForFunction(() => document.getElementById('contact')!.getBoundingClientRect().top < 200);
    expect(await page.evaluate(() => history.length)).toBe(before);
    await page.context().close();
  }, 60_000);

  it('opens a page at /about#contact (a shared link or a reload) at the Contact Us section', async () => {
    const page = await open('/about#contact', 390);
    await page.waitForFunction(() => {
      const el = document.getElementById('contact');
      return !!el && el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < 200;
    });
    expect(await here(page)).toBe('/about#contact');
    await page.context().close();
  }, 60_000);

  it('opens Privacy at its section of the Legal Notice, and Legal Notice at the top', async () => {
    const page = await open('/brands', 1280);
    await page.click('.site-footer a[href="/about/legal#privacy"]');
    await page.waitForFunction(() => location.pathname === '/about/legal' && location.hash === '#privacy');
    await page.waitForFunction(() => document.activeElement?.id === 'notice-privacy');
    expect(await inView(page, '#notice-privacy')).toBe(true);
    await page.click('.site-footer a[href="/about/legal"]');
    await page.waitForFunction(() => location.pathname === '/about/legal' && scrollY === 0);
    await page.context().close();
  }, 60_000);

  it('opens About and the bot page in place, and the design system as before', async () => {
    const page = await open('/deals', 1280);
    await page.click('.site-footer a[href="/about/bot"]');
    await page.waitForFunction(() => location.pathname === '/about/bot');
    expect(await page.evaluate(() => document.querySelector('#view h1')?.textContent?.length ?? 0)).toBeGreaterThan(0);
    await page.click('.site-footer a[href="/about"]');
    await page.waitForFunction(() => location.pathname === '/about');
    expect((await page.textContent('#view h1'))?.trim()).toBe('About PriceSniffs');
    await page.click('.site-footer a[href="/design"]');
    await page.waitForFunction(() => location.pathname === '/design');
    await page.context().close();
  }, 60_000);

  it('a link whose page is not drawn in place still works as an ordinary link', async () => {
    const page = await open('/', 390);
    const guides = page.locator('.site-footer a[href="/guides"]');
    expect(await guides.getAttribute('data-goto')).toBeNull();
    // Not intercepted: the app's handler leaves the click to the browser. The window
    // listener runs after it, records whether it prevented the default, then stops the
    // navigation itself so the test stays on the page.
    const prevented = await page.evaluate(
      () =>
        new Promise<boolean>((done) => {
          window.addEventListener('click', (e) => { done(e.defaultPrevented); e.preventDefault(); }, { once: true });
          (document.querySelector('.site-footer a[href="/guides"]') as HTMLAnchorElement).click();
        }),
    );
    expect(prevented).toBe(false);
    await page.context().close();
  }, 60_000);

  it('is axe clean in both palettes at 320, 390 and 1280', async () => {
    for (const mode of ['dark', 'light'] as const) {
      for (const width of [320, 390, 1280]) {
        for (const path of ['/', '/about']) {
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          await context.addInitScript(([k, v]) => {
            try { localStorage.setItem(k as string, v as string); } catch { /* storage may be unavailable */ }
          }, ['pricesniffs.display', mode]);
          const page = await context.newPage();
          await page.goto(url(path), { waitUntil: 'load' });
          await waitForApp(page);
          await page.waitForTimeout(400);
          await page.evaluate(`Promise.all(document.getAnimations().filter((a) => a.effect.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)))`);
          const results = await new AxeBuilder({ page }).include('.site-footer').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
          const summary = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`).join('\n');
          expect(results.violations, `${path} ${mode} ${width}\n${summary}`).toEqual([]);
          await context.close();
        }
      }
    }
  }, 180_000);

  describe('without JavaScript', () => {
    async function noScript(width: number): Promise<{ page: Page; context: BrowserContext }> {
      const context = await browser.newContext({ viewport: { width, height: 900 }, javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(url('/'), { waitUntil: 'load' });
      return { page, context };
    }

    for (const width of [320, 390, 1280]) {
      it(`shows the notice, the intro and the footer at ${width} wide, with no sideways scroll`, async () => {
        const { page, context } = await noScript(width);
        expect(await page.locator('.ns-note').isVisible()).toBe(true);
        expect(await page.locator('.ns-note').textContent()).toContain('JavaScript is switched off');
        expect(await page.locator('.static-intro').isVisible()).toBe(true);
        expect((await page.locator('main h1').textContent())?.trim()).toBe('Compare Fragrance Prices at UK Shops');
        const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
        for (const word of ['price comparison site for perfume', 'affiliate links', 'commission', 'Deals', 'Brands', 'About', 'Contact', 'Legal Notice', 'Privacy']) {
          expect(text, word).toContain(word);
        }
        // Real links, each with an address.
        const hrefs = await page.$$eval('main a', (as) => as.map((a) => a.getAttribute('href')));
        expect(hrefs).toEqual(expect.arrayContaining(['/about', '/about#contact', '/about/legal', '/about/legal#privacy', '/deals', '/brands']));
        expect(await page.locator('.site-footer .footer-nav a').count()).toBe(FOOTER_LINKS.length);
        expect(await page.locator('.site-footer .footer-nav a').first().isVisible()).toBe(true);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await context.close();
      }, 60_000);
    }

    it('is axe clean in both palettes when the script never runs (the scripts removed from the page)', async () => {
      for (const mode of ['dark', 'light'] as const) {
        for (const width of [320, 390, 1280]) {
          const context = await browser.newContext({ viewport: { width, height: 900 } });
          const page = await context.newPage();
          // The page as a visitor sees it when the bundle fails or is blocked: every script gone.
          await page.route(url('/'), async (route) => {
            const res = await route.fetch();
            const html = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, '');
            await route.fulfill({ response: res, body: html });
          });
          await page.goto(url('/'), { waitUntil: 'load' });
          await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
          // The page eases its colours between palettes; let that finish before axe reads them.
          await page.waitForTimeout(800);
          expect(await page.locator('.static-intro').isVisible()).toBe(true);
          const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
          const summary = results.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`).join('\n');
          expect(results.violations, `${mode} ${width}\n${summary}`).toEqual([]);
          await context.close();
        }
      }
    }, 180_000);
  });

  it('does not paint or reserve room for the intro when JavaScript is on', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // Record every layout shift from the first byte on, and what moved.
    await context.addInitScript(() => {
      const w = window as unknown as { __shifts: { value: number; nodes: string[] }[] };
      w.__shifts = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { value: number; sources: { node?: Element }[] }[]) {
            w.__shifts.push({ value: e.value, nodes: e.sources.map((s) => `${s.node?.nodeName}.${s.node?.className}#${s.node?.id}`) });
          }
        }).observe({ type: 'layout-shift', buffered: true });
      } catch { /* unsupported */ }
    });
    const page = await context.newPage();
    await page.goto(url('/'), { waitUntil: 'load' });
    await waitForApp(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains('js'))).toBe(true);
    // Replaced by the app, never shown.
    expect(await page.locator('.static-intro').count()).toBe(0);
    expect(await page.locator('.ns-note').count()).toBe(0);
    // Hidden even if it were still there: a copy put back takes no room.
    const hidden = await page.evaluate(() => {
      const probe = document.createElement('section');
      probe.className = 'static-intro';
      probe.textContent = 'probe';
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const out = { display: cs.display, height: probe.getBoundingClientRect().height };
      probe.remove();
      return out;
    });
    expect(hidden).toEqual({ display: 'none', height: 0 });
    // Nothing about the intro moves. (The footer sliding down as the page fills in is the
    // app drawing its first view, as it always did, and is not the intro's doing.)
    await page.waitForTimeout(1500);
    const shifts = await page.evaluate(() => (window as unknown as { __shifts: { value: number; nodes: string[] }[] }).__shifts);
    const moved = shifts.flatMap((s) => s.nodes);
    expect(moved.filter((n) => /static-intro|ns-note|MAIN|#view/.test(n)), `moved: ${moved.join(', ')}`).toEqual([]);
    await context.close();
  }, 60_000);
});
