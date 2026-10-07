import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FOOTER_GROUPS, FOOTER_LINKS, FOOTER_TAG, footerNavHtml, withFooterLinks } from '../demo/footerLinks.js';
import { isLegalNoticeId } from '../demo/legal.js';
import { matchRoute } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');

/**
 * Pages other agents are adding to the router in parallel (the Phase 1 plan in
 * docs/ADVERTISING-PLAN.md): the footer and the static intro already link to
 * them, so until their routes land the router answers "not found" for these
 * and nothing else is allowed to. Delete an address from this list the moment
 * the router knows it; the test below fails on an entry that has no link, so
 * the list cannot outlive the links.
 */
const LANDING_IN_PARALLEL = ['/about/how-we-check-prices', '/guides'];

/** An address as written in an href, split the way the page splits it. */
function resolveHref(href: string) {
  const [beforeHash, hash = ''] = href.split('#');
  const [path, search = ''] = beforeHash!.split('?');
  return { path: path!, route: matchRoute(path!, search ? `?${search}` : '', hash ? `#${hash}` : '') };
}

/** Every href inside a piece of markup. */
const hrefsIn = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

const MAIN_START = template.indexOf('<main id="view" tabindex="-1">');

/** The template's <main>, which holds the static intro and the noscript block. */
const mainBlock = (): string => template.slice(MAIN_START, template.indexOf('</main>', MAIN_START));

describe('footer links: one list, all known to the router', () => {
  it('has the links the plan asks for', () => {
    const hrefs = FOOTER_LINKS.map((l) => l.href);
    for (const want of ['/about', '/about#contact', '/about/legal', '/about/legal#privacy', '/about/bot', '/about/how-we-check-prices', '/guides']) {
      expect(hrefs, `the footer lacks ${want}`).toContain(want);
    }
  });

  it('lists no address twice and gives every link a label', () => {
    const hrefs = FOOTER_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const l of FOOTER_LINKS) expect(l.label.trim(), l.href).not.toBe('');
  });

  it('points every link at an address the router knows', () => {
    for (const l of FOOTER_LINKS) {
      const { path, route } = resolveHref(l.href);
      if (LANDING_IN_PARALLEL.includes(path)) continue;
      expect(route.name, `${l.href} ("${l.label}") is not a route: the router answers not found`).not.toBe('notFound');
    }
  });

  it('keeps the in-app page and the anchor in step with the address', () => {
    const viewOfRoute: Record<string, string> = { about: 'about', legalNotice: 'legalNotice', botPage: 'botPage', design: 'design' };
    for (const l of FOOTER_LINKS) {
      const { route } = resolveHref(l.href);
      const hashPart = l.href.split('#')[1];
      expect(l.anchor, `${l.href}: anchor must be the text after the #`).toBe(hashPart);
      if (l.view) expect(viewOfRoute[route.name], `${l.href} opens ${l.view} but the router says ${route.name}`).toBe(l.view);
      // A section of the Legal Notice must be one the notice has.
      if (route.name === 'legalNotice' && l.anchor) expect(isLegalNoticeId(l.anchor), `${l.href} names no section`).toBe(true);
    }
  });

  it('lists only landing-in-parallel addresses that the footer or the intro still link to', () => {
    const linked = [...FOOTER_LINKS.map((l) => l.href), ...hrefsIn(mainBlock())].map((h) => h.split('#')[0]);
    for (const path of LANDING_IN_PARALLEL) expect(linked, `${path} is no longer linked: remove it from LANDING_IN_PARALLEL`).toContain(path);
  });
});

describe('footer markup', () => {
  const html = footerNavHtml();

  it('is one named navigation landmark with a named list per group', () => {
    expect(html.match(/<nav /g)).toHaveLength(1);
    expect(html).toContain('aria-label="Footer"');
    for (const g of FOOTER_GROUPS) expect(html).toContain(`<ul class="footer-list" aria-label="${g.label}">`);
  });

  it('carries every link as a real href, with data-goto and data-anchor where the app can open it in place', () => {
    expect(hrefsIn(html)).toEqual(FOOTER_LINKS.map((l) => l.href));
    for (const l of FOOTER_LINKS) {
      const a = html.match(new RegExp(`<a class="footer-link" href="${l.href.replace(/[/#]/g, '\\$&')}"([^>]*)>`));
      expect(a, l.href).not.toBeNull();
      if (l.view) expect(a![1]).toContain(`data-goto="${l.view}"`);
      else expect(a![1]).not.toContain('data-goto');
      if (l.anchor) expect(a![1]).toContain(`data-anchor="${l.anchor}"`);
    }
  });

  it('keeps the link the About tests and visitors already know: Legal Notice first of its kind', () => {
    expect(html).toContain('<a class="footer-link" href="/about/legal" data-goto="legalNotice">Legal Notice</a>');
  });

  it('is written into the template at one placeholder, inside the footer and outside <main>', () => {
    expect(template.split(FOOTER_TAG)).toHaveLength(2);
    const footer = template.slice(template.indexOf('<footer class="site-footer">'), template.indexOf('</footer>'));
    expect(footer).toContain(FOOTER_TAG);
    expect(template.indexOf('</main>', MAIN_START)).toBeLessThan(template.indexOf(FOOTER_TAG));
    const built = withFooterLinks(template);
    expect(built).not.toContain(FOOTER_TAG);
    expect(built).toContain(html);
  });

  it('refuses a template with no placeholder', () => {
    expect(() => withFooterLinks('<footer></footer>')).toThrow(/placeholder/);
  });
});

describe('the page without JavaScript', () => {
  const main = mainBlock();

  it('has a noscript notice and a static intro inside <main>', () => {
    expect(main).toMatch(/<noscript>[\s\S]*JavaScript is switched off[\s\S]*<\/noscript>/);
    expect(main).toContain('class="static-intro"');
    expect(main.match(/<h1[ >]/g)).toHaveLength(1);
  });

  it('says what the site is, what it compares and how it earns money', () => {
    const text = main.replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ');
    expect(text).toMatch(/price comparison site for perfume/);
    expect(text).toMatch(/UK shops/);
    expect(text).toMatch(/delivery included where the shop states it/);
    expect(text).toMatch(/affiliate links/);
    expect(text).toMatch(/commission, at no extra cost to you/);
    expect(text).toMatch(/never changes the order of results/);
  });

  it('claims nothing the site cannot back', () => {
    const text = main.toLowerCase();
    for (const claim of ['cheapest price guaranteed', 'best price guarantee', 'every shop', 'real time', 'real-time', 'hourly', 'genuine', 'authentic', 'free delivery', 'trusted by', 'award']) {
      expect(text, claim).not.toContain(claim);
    }
    expect(text).not.toMatch(/\d{2,}[\d,]*\s+(shops|fragrances|products|offers)/);
  });

  it('links to About, Contact, Legal and the main sections with real hrefs the router knows', () => {
    const hrefs = hrefsIn(main);
    for (const want of ['/about', '/about#contact', '/about/legal', '/about/legal#privacy', '/deals', '/fragrances', '/sets', '/oils', '/brands', '/retailers', '/notes']) {
      expect(hrefs, want).toContain(want);
    }
    for (const href of hrefs) {
      const { path, route } = resolveHref(href);
      if (LANDING_IN_PARALLEL.includes(path)) continue;
      expect(route.name, `${href} in the static intro is not a route`).not.toBe('notFound');
    }
  });

  it('uses British English and no dashes in its words', () => {
    const text = main.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\b(color|favorite|center|organize|license)\b/i);
    expect(text).not.toMatch(/[–—]|\s-\s/);
  });

  it('is never painted for a visitor with JavaScript, so nothing shifts', () => {
    // The class goes on <html> by a script that runs before the body is parsed...
    const flag = template.indexOf("document.documentElement.classList.add('js')");
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(template.indexOf('<style>'));
    expect(flag).toBeLessThan(MAIN_START);
    // ...and with it the intro takes no room.
    expect(template).toMatch(/html\.js \.static-intro \{ display: none; \}/);
  });

  it('adds well under 5 kB to the page', () => {
    const baseline = 203364; // demo/template.html on 2026-10-07, before this change
    const grown = withFooterLinks(template).length - baseline;
    expect(grown, `the template grew by ${grown} bytes`).toBeLessThan(5000);
  });
});
