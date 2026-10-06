import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { LEGAL_NOTICE_IDS } from '../demo/legal.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The About revamp (owner's request, 2026-10-06): a short page that says why
 * the site was built and how it works, the full width of the page on the
 * desktop layout, and the legal documents moved to a Legal Notice page under
 * it, /about/legal, with the old /legal/<id> addresses still opening the right
 * section. What the words say is held by tests/legalPages.test.ts; the routes
 * and head tags by tests/head.test.ts; axe by tests/accessibility.test.ts.
 * This file is the page itself, in a browser.
 */
describe.skipIf(!built)('About and the Legal Notice on the built site', () => {
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

  async function open(path: string, width = 1280): Promise<Page> {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    // The layout is chosen by the reader; seed it the way a desktop reader has it.
    await context.addInitScript((desktop: boolean) => {
      try {
        if (desktop) localStorage.setItem('pricesniffs.layout', 'desktop');
      } catch {
        /* storage may be unavailable */
      }
    }, width >= 1000);
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}${path}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForTimeout(300);
    return page;
  }

  const here = (page: Page): Promise<string> => page.evaluate(() => location.pathname + location.hash);
  const overflow = (page: Page): Promise<number> =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  for (const width of [320, 390, 1280]) {
    it(`About is short, neat and has no sideways scroll at ${width} wide`, async () => {
      const page = await open('/about', width);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect((await page.textContent('#view h1'))?.trim()).toBe('About PriceSniffs');
      const headings = await page.$$eval('#view h2', (els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(headings).toEqual(['Why I Built This', 'How It Works', 'Who Runs It', 'Contact Us']);
      const cards = await page.$$eval('#view .about-card-title', (els) => els.map((e) => (e.textContent ?? '').trim()));
      expect(cards).toEqual(['Prices', 'Shops', 'Cheapest', 'Affiliate Links']);
      // It was 472 words; what is on screen now is well under half of that.
      const words = await page.evaluate(() => (document.querySelector('#view') as HTMLElement).innerText.split(/\s+/).filter(Boolean).length);
      expect(words).toBeLessThan(260);
      // The reason comes first and in the owner's voice, and the old story is gone.
      expect(await page.textContent('#view .about-why')).toContain('I was tired of buying a fragrance and then seeing it cheaper somewhere else');
      expect(await page.textContent('#view')).not.toContain('Club de Nuit');
      await page.context().close();
    }, 60_000);
  }

  it('uses the whole width on the desktop layout and stacks on a phone', async () => {
    const wide = await open('/about', 1280);
    const doc = await wide.evaluate(() => {
      const el = document.querySelector('#view .about-doc') as HTMLElement;
      const cards = Array.from(document.querySelectorAll('#view .about-card')).map((c) => Math.round(c.getBoundingClientRect().top));
      return { width: Math.round(el.getBoundingClientRect().width), tops: cards };
    });
    // The other documents keep 640px; About takes the page, less its gutters.
    expect(doc.width).toBeGreaterThan(1100);
    expect(new Set(doc.tops).size, 'four cards in one row').toBe(1);
    await wide.context().close();

    const phone = await open('/about', 390);
    const tops = await phone.$$eval('#view .about-card', (els) => els.map((c) => Math.round(c.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'four cards stacked').toBe(4);
    await phone.context().close();

    // The Legal Notice is read top to bottom and keeps its reading width.
    const notice = await open('/about/legal', 1280);
    expect(await notice.evaluate(() => Math.round((document.querySelector('#view .notice-doc') as HTMLElement).getBoundingClientRect().width))).toBe(640);
    await notice.context().close();
  }, 60_000);

  it('links to the Legal Notice from About and from the footer on every page', async () => {
    const page = await open('/about');
    expect(await page.getAttribute('#view .about-legal a', 'href')).toBe('/about/legal');
    expect(await page.getAttribute('.site-footer a[data-goto="legalNotice"]', 'href')).toBe('/about/legal');
    await page.click('#view .about-legal a');
    await page.waitForFunction(() => location.pathname === '/about/legal');
    expect(await page.title()).toBe('PriceSniffs: Legal Notice');
    expect(await page.textContent('#nav-about')).toBe('About');
    expect(await page.$eval('#nav-about', (el) => el.classList.contains('on'))).toBe(true);
    // Back goes up to About.
    await page.click('#view .back');
    await page.waitForFunction(() => location.pathname === '/about');
    // The footer link works from any page.
    await page.click('#nav-deals');
    await page.waitForFunction(() => location.pathname === '/deals');
    await page.click('.site-footer a[data-goto="legalNotice"]');
    await page.waitForFunction(() => location.pathname === '/about/legal');
    expect((await page.textContent('#view h1'))?.trim()).toBe('Legal Notice');
    await page.context().close();
  }, 60_000);

  it('holds every legal document as a section with one level one heading and a contents row', async () => {
    const page = await open('/about/legal');
    expect(await page.$$eval('#view h1', (els) => els.length)).toBe(1);
    const sections = await page.$$eval('#view .notice-section', (els) => els.map((e) => e.id));
    expect(sections).toEqual(LEGAL_NOTICE_IDS.map((id) => `notice-${id}`));
    const titles = await page.$$eval('#view .notice-section > h2', (els) => els.map((e) => (e.textContent ?? '').trim()));
    expect(titles).toEqual(['Terms of Use', 'Privacy Notice', 'Affiliate Disclosure', 'Cookies and Storage', 'Refunds and Returns', 'Contact and Feedback']);
    // The terms carry the logo and photo notices; the affiliate section names the shops.
    const text = (await page.textContent('#view'))!;
    expect(text).toContain('Product Images');
    expect(text).toContain('Which Links Earn Commission');
    expect(await page.$$eval('#view .notice-toc a', (els) => els.length)).toBe(LEGAL_NOTICE_IDS.length);
    expect(await page.getAttribute('link[rel=canonical]', 'href')).toBe('https://pricesniffs.space/about/legal');
    expect(await page.$('meta[name=robots][content*=noindex]')).toBeNull();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.context().close();
  }, 60_000);

  it('opens a section from the contents row and from a link in the text, without leaving the page', async () => {
    const page = await open('/about/legal');
    await page.click('.notice-toc a[data-page="cookies"]');
    await page.waitForFunction(() => location.hash === '#cookies');
    expect(await here(page)).toBe('/about/legal#cookies');
    await page.waitForFunction(() => {
      const top = document.getElementById('notice-cookies')!.getBoundingClientRect().top;
      return top >= 0 && top < 300;
    });
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('notice-cookies');
    // A link inside the privacy section to the cookies page is a jump on this page too.
    const before = await page.evaluate(() => history.length);
    await page.evaluate(() => document.getElementById('notice-privacy')!.scrollIntoView());
    await page.click('#notice-privacy a[data-page="cookies"]');
    await page.waitForFunction(() => {
      const top = document.getElementById('notice-cookies')!.getBoundingClientRect().top;
      return top >= 0 && top < 300;
    });
    expect(await here(page)).toBe('/about/legal#cookies');
    expect(await page.evaluate(() => history.length)).toBe(before);
    await page.context().close();
  }, 60_000);

  it('still opens every old /legal/<id> address at its section, and the address is rewritten', async () => {
    for (const id of LEGAL_NOTICE_IDS) {
      const page = await open(`/legal/${id}`);
      expect(await here(page), id).toBe(`/about/legal#${id}`);
      expect((await page.textContent('#view h1'))?.trim()).toBe('Legal Notice');
      expect(await page.title()).toBe('PriceSniffs: Legal Notice');
      expect(await page.getAttribute('link[rel=canonical]', 'href')).toBe('https://pricesniffs.space/about/legal');
      const top = await page.evaluate((i) => document.getElementById(`notice-${i}`)!.getBoundingClientRect().top, id);
      // On screen. The last section cannot reach the top: the page ends first.
      expect(top, `${id} is in view`).toBeGreaterThanOrEqual(0);
      expect(top, `${id} is in view`).toBeLessThan(id === LEGAL_NOTICE_IDS[LEGAL_NOTICE_IDS.length - 1] ? 700 : 300);
      await page.context().close();
    }
  }, 120_000);

  it('opens /legal/about as About, keeps How it works where it was, and answers a made up address with a not found', async () => {
    const about = await open('/legal/about');
    expect(await here(about)).toBe('/about');
    expect((await about.textContent('#view h1'))?.trim()).toBe('About PriceSniffs');
    await about.context().close();

    const how = await open('/legal/how-it-works');
    expect(await here(how)).toBe('/legal/how-it-works');
    expect((await how.textContent('#view h1'))?.trim()).toBe('How PriceSniffs Works');
    await how.context().close();

    for (const path of ['/legal/nonsense', '/about/nonsense']) {
      const miss = await open(path);
      expect((await miss.textContent('#view h1'))?.trim(), path).toBe('Page Not Found');
      await miss.context().close();
    }
  }, 60_000);

  it('links the contact form note and the About cards to the Legal Notice and How it works', async () => {
    const page = await open('/about');
    await page.click('#view .form-privacy [data-page="privacy"]');
    await page.waitForFunction(() => location.hash === '#privacy');
    expect(await here(page)).toBe('/about/legal#privacy');
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/about');
    await page.click('#view .about-more [data-page="how-it-works"]');
    await page.waitForFunction(() => location.pathname === '/legal/how-it-works');
    await page.context().close();
  }, 60_000);
});
