/**
 * The home page's first screen (scripts/firstScreen.ts): the rules, on made up
 * input. tests/firstScreenBrowser.test.ts checks the built pages in a browser.
 */
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { firstScreenFrom, firstScreenScript, hasFirstScreen, withFirstScreen, withoutFirstScreen } from '../scripts/firstScreen.js';
import { renderRoutePage } from '../scripts/routePages.js';

const hrefs = {
  productHref: (id: string) => `/p_${id}`,
  brandHref: (brand: string) => `/brands/${brand.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  browseHref: () => '/search',
};

const HOME = `
  <section class="intro ps-drift">
    <!-- a note for whoever reads the source -->
    <h1 class="hero-wordmark">Price<em>Sniffs</em></h1>
  </section>
  <section class="marquee"><span>Words</span></section>
  <section class="pop-section">
    <button class="link-btn see-top" data-browse>See All</button>
    <ul class="pop-rail"><li class="pop-item"><div class="tile">
      <button type="button" class="phead-brand" data-brand="Dolce &amp; Gabbana">Dolce &amp; Gabbana</button>
      <button class="tile-body" data-frag="abc123"><span class="amt">from £10.00</span></button>
    </div></li></ul>
  </section><div class="ps-ad ps-ad-home"><ins class="adsbygoogle"></ins></div>
  <div class="bottom-split"><section class="updates-section">History</section></div>`;

const DOC = `<!doctype html>
<html lang="en-GB"><head><title>Home</title></head><body>
<main id="view" tabindex="-1">
    <div class="boot" aria-hidden="true"><i class="boot-t"></i><span class="boot-g"><i></i></span></div>
    <section class="static-intro"><h1>Static</h1></section>
</main></body></html>`;

describe('the first screen taken from the home view', () => {
  const screen = firstScreenFrom(HOME, hrefs);

  it('ends with the Most Stocked section: the ad slot and everything under it stay the app’s', () => {
    expect(screen).toContain('class="pop-rail"');
    expect(screen).not.toContain('adsbygoogle');
    expect(screen).not.toContain('updates-section');
    expect(screen.endsWith('</section></div>')).toBe(true);
  });

  it('is wrapped as the app wraps the home view, marked as the first screen', () => {
    expect(screen.startsWith('<div class="ps-stagger" data-first-screen>')).toBe(true);
  });

  it('carries no comment and no run of white space', () => {
    expect(screen).not.toContain('<!--');
    expect(screen).not.toMatch(/\s{2,}/);
  });

  it('gives every button that opens something the address it opens', () => {
    expect(screen).toContain('data-frag="abc123" data-href="/p_abc123"');
    // The brand is read unescaped and written back escaped.
    expect(screen).toContain('data-brand="Dolce &amp; Gabbana" data-href="/brands/dolce-gabbana"');
    expect(screen).toContain('data-browse data-href="/search"');
  });

  it('refuses a home view without a Most Stocked section', () => {
    expect(() => firstScreenFrom('<section class="intro"></section>', hrefs)).toThrow(/Most Stocked/);
  });
});

describe('the first screen in the home document', () => {
  const screen = firstScreenFrom(HOME, hrefs);
  const home = withFirstScreen(DOC, screen, '/');

  it('goes in a template right after the loading outline, which stays for every other address', () => {
    expect(hasFirstScreen(home)).toBe(true);
    expect(home.indexOf('class="boot"')).toBeLessThan(home.indexOf('<template id="ps-first">'));
    expect(home).toContain(`<template id="ps-first">${screen}</template>`);
    expect(home.indexOf('</template>')).toBeLessThan(home.indexOf('class="static-intro"'));
  });

  it('comes off again byte for byte, for 404.html and every copy of the home document', () => {
    expect(withoutFirstScreen(home)).toBe(DOC);
    expect(hasFirstScreen(withoutFirstScreen(home))).toBe(false);
  });

  it('is never in a route page or a prerendered page made from the home document', () => {
    const tags = { title: 'Deals', description: 'd', canonical: 'https://pricesniffs.space/deals' };
    const shell = home
      .replace('<head>', '<head><meta name="description" content="x" /><link rel="canonical" href="https://pricesniffs.space/" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:url" content="x" /><meta name="twitter:title" content="x" /><meta name="twitter:description" content="x" />');
    const page = renderRoutePage(shell, tags as never);
    expect(hasFirstScreen(page)).toBe(false);
    expect(page).toContain('class="boot"');
  });

  it('refuses a document without exactly one loading outline', () => {
    expect(() => withFirstScreen(DOC.replace(/<div class="boot"[\s\S]*?<\/div>/, ''), screen, '/')).toThrow(/loading outline/);
  });
});

describe('the script that shows the first screen', () => {
  /** Runs the script against a stand in page at `path`; true when it put the screen in the outline's place. */
  function shows(home: string, path: string, search = ''): boolean {
    let replaced = false;
    const clone = { addEventListener: () => undefined };
    const context = vm.createContext({
      location: { pathname: path, search },
      document: {
        getElementById: () => ({ content: { firstElementChild: { cloneNode: () => clone } } }),
        querySelector: () => ({ parentNode: { replaceChild: () => { replaced = true; } } }),
      },
    });
    vm.runInContext(firstScreenScript(home), context);
    return replaced;
  }

  it('shows it on the home address of its own country only', () => {
    expect(shows('/', '/')).toBe(true);
    expect(shows('/', '/index.html')).toBe(true);
    expect(shows('/us/', '/us/')).toBe(true);
    for (const path of ['/deals', '/search', '/brands/dior', '/creed_aventus_100ml', '/us/deals', '/about']) {
      expect(shows('/', path), path).toBe(false);
    }
    expect(shows('/us/', '/')).toBe(false);
    expect(shows('/us/', '/us/deals')).toBe(false);
  });

  it('does not show it while a region page is handed a deep link (?ps_path=)', () => {
    expect(shows('/us/', '/us/', '?ps_path=%2Fus%2Fdeals')).toBe(false);
  });
});
