/**
 * The home page's first screen, drawn at build time (docs/SITE-AUDIT-2026-10-12.md,
 * "21 Oct 2026: the home page's first screen").
 *
 * A first visit to a home page (/, /us/, /in/) used to show a grey outline
 * until every eager data file was in: about 5 MB and 31 s for the UK on a
 * slow 4G phone. The home page's top (the hero, the banner and the Most
 * Stocked rail) needs none of that to be drawn, only the twelve products of
 * the rail, so the build draws it once and writes it into the home documents:
 *
 *   - drawn by the shipped bundle itself (dist-demo/bundle.js, or a region's
 *     dist-demo/<r>/bundle.js) with its own data, run here outside a browser
 *     with FIRST_SCREEN_GLOBAL set (demo/app.ts hands it homeView), so the
 *     markup is the app's own to the byte, prices, money and words included;
 *   - cut after the Most Stocked rail (the ad slot and everything under it
 *     are left to the app), with `data-href` on its buttons so a tap before
 *     the app has started opens the product's, the brand's or the list's own
 *     page instead of doing nothing;
 *   - kept in a <template> with a small script after it that puts it in place
 *     of the loading outline only on the home address itself. 404.html, the
 *     prerendered product, brand, shop and note pages and the route pages are
 *     copies of the home document and must not carry it (routePages.ts strips
 *     it, leafPages.ts renders through that); the service worker's offline copy
 *     of the home document answers every address offline, which the script's
 *     address check covers.
 *
 * The app loads its data exactly as before and replaces the screen with its
 * own first render (demo/app.ts render(): no entrance animation over a screen
 * that is already showing). Nothing in the data path changes.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { BLOBS_GLOBAL, type DataManifest } from './dataFiles.js';
import { liveRegions } from '../src/config/regions.js';

/** The global the build sets before running the bundle (demo/app.ts reads it). */
export const FIRST_SCREEN_GLOBAL = '__psFirstScreen';

/** What demo/app.ts hands the build: its home view and its own addresses. */
export interface FirstScreenHook {
  home: () => string;
  productHref: (id: string) => string;
  brandHref: (brand: string) => string;
  browseHref: () => string;
}

const BEGIN = '<!--first-screen-->';
const END = '<!--/first-screen-->';
const BLOCK = /\n[ \t]*<!--first-screen-->[\s\S]*?<!--\/first-screen-->/g;
/** The loading outline the screen takes the place of (demo/template.html .boot). */
const BOOT = /<div class="boot" aria-hidden="true">[\s\S]*?<\/div>/g;
/** The id of the <template> that holds the screen. */
export const FIRST_SCREEN_TEMPLATE_ID = 'ps-first';

const unescapeAttr = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escapeAttr = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The first screen from the app's home view: everything up to the end of the
 * Most Stocked section, without HTML comments, white space runs as one space
 * (which is how the browser draws them anyway), each button that opens
 * something carrying that thing's address in data-href. Wrapped as the app
 * wraps a view, plus data-first-screen.
 */
export function firstScreenFrom(homeHtml: string, hook: Omit<FirstScreenHook, 'home'>): string {
  const start = homeHtml.indexOf('<section class="pop-section">');
  if (start < 0) throw new Error('firstScreen: the home view has no Most Stocked section');
  const end = homeHtml.indexOf('</section>', start);
  if (end < 0) throw new Error('firstScreen: the Most Stocked section is not closed');
  const body = homeHtml
    .slice(0, end + '</section>'.length)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/data-frag="([^"]*)"/g, (_m, id: string) => `data-frag="${id}" data-href="${escapeAttr(hook.productHref(unescapeAttr(id)))}"`)
    .replace(/data-brand="([^"]*)"/g, (_m, brand: string) => `data-brand="${brand}" data-href="${escapeAttr(hook.brandHref(unescapeAttr(brand)))}"`)
    .replace(/data-browse(?=[\s>])/g, `data-browse data-href="${escapeAttr(hook.browseHref())}"`);
  if (/<script|<template|<!--/i.test(body)) throw new Error('firstScreen: the first screen may carry no script, template or comment');
  return `<div class="ps-stagger" data-first-screen>${body}</div>`;
}

/**
 * The script after the template: on the home address only (`home` is '/' or
 * '/us/'), and never on a region's hand off of a deep link (?ps_path=), the
 * screen takes the outline's place. A tap on anything with a data-href opens
 * that address until the app replaces the screen (the listener goes with it).
 */
export function firstScreenScript(home: string): string {
  const h = JSON.stringify(home);
  return `(function () {
  var p = location.pathname;
  if ((p !== ${h} && p !== ${h} + 'index.html') || /[?&]ps_path=/.test(location.search)) return;
  var t = document.getElementById('${FIRST_SCREEN_TEMPLATE_ID}');
  var boot = document.querySelector('#view > .boot');
  if (!t || !t.content || !boot) return;
  var screen = t.content.firstElementChild.cloneNode(true);
  screen.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-href]') : null;
    if (a) location.assign(a.getAttribute('data-href'));
  });
  boot.parentNode.replaceChild(screen, boot);
})();`;
}

/** The home document with its first screen after the loading outline. */
export function withFirstScreen(doc: string, screen: string, home: string): string {
  const boots = doc.match(BOOT);
  if (!boots || boots.length !== 1) throw new Error(`firstScreen: expected one loading outline (.boot) in the home document, found ${boots?.length ?? 0}`);
  const block = `${BEGIN}<template id="${FIRST_SCREEN_TEMPLATE_ID}">${screen}</template><script>${firstScreenScript(home)}</script>${END}`;
  return doc.replace(BOOT, (boot) => `${boot}\n    ${block}`);
}

/** The document without a first screen: what every copy of the home document that is not the home page starts from. */
export function withoutFirstScreen(doc: string): string {
  return doc.replace(BLOCK, '');
}

/** Whether a document carries a first screen. */
export function hasFirstScreen(doc: string): boolean {
  return doc.includes(BEGIN);
}

/**
 * Runs a built bundle outside a browser with its eager data, and returns what
 * it hands FIRST_SCREEN_GLOBAL. `dist` is dist-demo or dist-demo/<r>; `path`
 * the home address the page is drawn for ('/' or '/us/'), which is where the
 * app reads its country from. Only the few browser objects the bundle reads
 * while it loads exist; anything else it touched would throw here, so a new
 * dependency on the browser shows up as a failed build, never as a wrong page.
 */
export function prerenderHome(dist: string, path: string): string {
  const manifest = JSON.parse(readFileSync(resolve(dist, 'data-files.json'), 'utf8')) as DataManifest;
  const blobs: unknown[] = [];
  for (const g of manifest.groups) {
    const part = JSON.parse(readFileSync(resolve(dist, `data/${g.name}.json`), 'utf8')) as unknown[];
    part.forEach((p, j) => {
      blobs[g.start + j] = p;
    });
  }
  let hook: FirstScreenHook | undefined;
  const store = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const origin = 'https://pricesniffs.space';
  const sandbox: Record<string, unknown> = {
    location: { pathname: path, search: '', hash: '', href: `${origin}${path}`, origin, host: 'pricesniffs.space', hostname: 'pricesniffs.space', protocol: 'https:' },
    // Still loading: the app waits for DOMContentLoaded to start, which never comes here.
    document: { readyState: 'loading', addEventListener: () => undefined, removeEventListener: () => undefined, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], cookie: '', referrer: '' },
    localStorage: store,
    sessionStorage: store,
    innerWidth: 390,
    innerHeight: 844,
    navigator: { userAgent: 'PriceSniffs build', language: 'en-GB', languages: ['en-GB'] },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, addListener: () => undefined }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    history: { state: null, replaceState: () => undefined, pushState: () => undefined },
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    console,
    // Web globals the language itself does not have (a vm context has only the language's own).
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    queueMicrotask,
    structuredClone,
    [BLOBS_GLOBAL]: blobs,
    [FIRST_SCREEN_GLOBAL]: (h: FirstScreenHook) => {
      hook = h;
    },
  };
  const context = vm.createContext(sandbox);
  sandbox.window = context;
  sandbox.self = context;
  vm.runInContext(readFileSync(resolve(dist, 'bundle.js'), 'utf8'), context, { filename: resolve(dist, 'bundle.js') });
  if (!hook) throw new Error(`firstScreen: ${dist}/bundle.js did not hand over its home view (demo/app.ts, ${FIRST_SCREEN_GLOBAL})`);
  return firstScreenFrom(hook.home(), hook);
}

/**
 * What is wrong with the built home documents and their deep link copies, one
 * sentence each; empty when all is well. Each home page (demo/index.html,
 * demo/<r>/index.html) carries its first screen, and its 404.html is that page
 * without it, byte for byte (what `cmp demo/index.html demo/404.html` checked
 * before 21 Oct 2026). The deploy runs it: `npx tsx scripts/firstScreen.ts --check`.
 */
export function homeCopyProblems(demoDir: string, folders: readonly string[]): string[] {
  const problems: string[] = [];
  for (const folder of folders) {
    const at = (f: string) => resolve(demoDir, folder, f);
    const name = (f: string) => `demo/${folder ? `${folder}/` : ''}${f}`;
    if (!existsSync(at('index.html')) || !existsSync(at('404.html'))) {
      problems.push(`${name('index.html')} or ${name('404.html')} is not built`);
      continue;
    }
    const home = readFileSync(at('index.html'), 'utf8');
    if (!hasFirstScreen(home)) problems.push(`${name('index.html')} has no first screen`);
    if (readFileSync(at('404.html'), 'utf8') !== withoutFirstScreen(home)) problems.push(`${name('404.html')} is not ${name('index.html')} without its first screen`);
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--check')) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const folders = liveRegions().map((r) => r.pathPrefix);
  const problems = homeCopyProblems(resolve(root, 'demo'), folders);
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    process.exit(1);
  }
  console.log(`home pages: ${folders.length} with their first screen, each 404.html the same page without it`);
}
