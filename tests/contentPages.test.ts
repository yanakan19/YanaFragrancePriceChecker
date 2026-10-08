import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_PATHS, GUIDES, GUIDES_INDEX, GUIDES_PATH, HOW_WE_CHECK, guideBySlug, guidePath,
} from '../demo/guideList.js';
import {
  GUIDES_FILE, METHOD_FILE, blocksHtml, blocksText, createGuideBodies, createMethodBody, guideHtml, guidesIndexHtml,
  howWeCheckHtml, inlineHtml, inlineText, linksIn, prepareGuides, prepareMethod, type Block,
} from '../demo/contentPages.js';
import { GUIDE_BODIES } from '../demo/content/guideBodies.js';
import { METHOD_BODY } from '../demo/content/methodBody.js';
import { headFor, SITE_URL } from '../demo/head.js';
import { matchRoute, rootWords, routeToPath } from '../demo/router.js';
import { LAZY_CONTENT_MODULES, LAZY_DATA_MODULES } from '../scripts/dataFiles.js';
import { DEMO_FRAGRANCES, fragrancesWithNote, noteForAddress } from '../demo/data.js';
import { slugOf } from '../demo/tabFacets.js';
import { VOLUME_BANDS, volumeBandFor } from '../demo/volumeBands.js';
import { OIL_SORT_OPTIONS, SET_SORT_OPTIONS } from '../demo/listSort.js';
import { isOil, isSet } from '../demo/productKind.js';
import { LEGAL_NOTICE_IDS } from '../demo/legal.js';
import { RETAILERS } from '../src/config/retailers.js';
import { HIDE_OFFER_AFTER_DAYS } from '../src/services/offerAge.js';
import { BOT_NAME, BOT_USER_AGENT } from '../src/catalogue/botIdentity.js';
import { isProductSlug } from '../src/catalogue/productSlug.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/** Hyphen, hyphen variants, en and em dashes, minus and figure dashes (as tests/changelog.test.ts). */
const DASH = /[-‐‑‒–—―−﹘﹣－]/;

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/** Every line of text in a page's blocks, one per paragraph, list item, heading or note. */
const lines = (body: readonly Block[]): string[] => body.flatMap((b) => (b.t === 'ul' ? b.x : [b.x]));

/** Every link a page's blocks carry. */
const linksOf = (body: readonly Block[]): string[] => lines(body).flatMap(linksIn);

/**
 * US spellings and words, so the pages stay plain British English. Whole words
 * where a British word starts the same way ("program" but not "programme").
 */
const AMERICAN: readonly RegExp[] = [
  /\bcolor/i, /\bflavor/i, /\bfavorite/i, /\bodor/i, /\bbehavior/i, /\bhonor/i, /\bneighbor/i,
  /\b(?:organiz|recogniz|realiz|apologiz|customiz|prioritiz|minimiz|maximiz|analyz|summariz|personaliz)/i,
  /\bcenter\b/i, /\bmeter\b/i, /\bliter\b/i, /millilit(?:er|ers)\b/i, /\bfiber\b/i,
  /\bgray\b/i, /\bpercent\b/i, /\bmom\b/i, /\bcatalog\b/i, /\bprogram\b/i, /\bjewelry\b/i,
  /\btraveling\b/i, /\btraveled\b/i, /\bcanceled\b/i, /\bdefense\b/i, /\boffense\b/i,
  /\bgotten\b/i, /\bzip code\b/i, /\bmall\b/i, /\bcheckout\b/i, /\bmailman\b/i,
];

/** Hype and claims a careful guide does not make: no exclamations, no medical or legal promises. */
const NOT_OUR_TONE: readonly RegExp[] = [
  /!/, /\bamazing\b/i, /\bincredible\b/i, /\bunbeatable\b/i, /\bultimate\b/i, /\brevolutionary\b/i,
  /\bmust have\b/i, /\bbest ever\b/i, /\bguarantee(?:d|s)?\b(?! the authenticity)/i, /\b100 per cent\b/i,
  /\btoxic\b/i, /\bharmful\b/i, /\bdangerous\b/i, /\ballerg/i, /\bcures?\b/i, /\bhealth\b/i,
  /\billegal\b/i, /\bunlawful\b/i, /\bsue\b/i, /\blegally\b/i, /\byou are entitled\b/i,
];

/** Words a Title Case heading keeps in lower case, unless one starts the heading. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs']);

/** The words of a heading that break Title Case: a lower case word that is not a small word, or a small word capitalised mid heading. */
function titleCaseSlips(heading: string): string[] {
  return heading
    .split(/\s+/)
    .map((w) => w.replace(/[,.:?]$/, ''))
    .filter((w, i) => {
      if (!/^[a-z]/i.test(w)) return false;
      if (/^[a-z]/.test(w)) return !SMALL_WORDS.has(w);
      return i > 0 && SMALL_WORDS.has(w.toLowerCase());
    });
}

/** Whether a text names this, as a whole name: "Boots" but not "boots" inside a word. */
function names(text: string, name: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(name, from);
    if (at < 0) return false;
    const before = text[at - 1] ?? ' ';
    const after = text[at + name.length] ?? ' ';
    if (!/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after)) return true;
    from = at + 1;
  }
}

/** A paragraph, list item or note longer than this is not a short paragraph. */
const MAX_WORDS_PER_BLOCK = 70;

/**
 * The guides and /about/how-we-check-prices (advertising plan, phase 1, content
 * gaps): each its own address, with its own title, description, canonical and
 * sitemap entry; their words in lazy data files, not the bundle; and the
 * wording rules for what a reader reads.
 */
describe('the addresses', () => {
  it('lists the guides index, five guides and the price checking page', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(3);
    expect(GUIDES.length).toBeLessThanOrEqual(5);
    expect(CONTENT_PATHS).toEqual([GUIDES_PATH, ...GUIDES.map((g) => guidePath(g.slug)), HOW_WE_CHECK.path]);
    expect(new Set(CONTENT_PATHS).size).toBe(CONTENT_PATHS.length);
  });

  it('opens each one, and writes each one back to the same address', () => {
    for (const path of CONTENT_PATHS) {
      const route = matchRoute(path);
      expect(['guides', 'guide', 'howWeCheck'], path).toContain(route.name);
      expect(routeToPath(route), path).toBe(path);
    }
    expect(matchRoute('/guides')).toEqual({ name: 'guides', param: '', query: {} });
    expect(matchRoute('/guides/')).toEqual({ name: 'guides', param: '', query: {} });
    expect(matchRoute('/guides/decants-and-testers')).toEqual({ name: 'guide', param: 'decants-and-testers', query: {} });
    expect(matchRoute('/about/how-we-check-prices')).toEqual({ name: 'howWeCheck', param: '', query: {} });
    expect(matchRoute('/about/how-we-check-prices/')).toEqual({ name: 'howWeCheck', param: '', query: {} });
  });

  it('reads a retyped guide address in lower case, and leaves the other About addresses alone', () => {
    expect(matchRoute('/guides/Decants-And-Testers').param).toBe('decants-and-testers');
    expect(matchRoute('/about/how-we-check').name).toBe('notFound');
    expect(matchRoute('/about/bot').name).toBe('botPage');
    expect(matchRoute('/about/legal').name).toBe('legalNotice');
  });

  it('knows which guides exist, and not a prototype name', () => {
    expect(guideBySlug('decants-and-testers')?.title).toBe('Decants, Testers and Miniatures');
    expect(guideBySlug('constructor')).toBeUndefined();
    expect(guideBySlug('')).toBeUndefined();
  });

  it('cannot collide with a product address', () => {
    expect(rootWords()).toContain('guides');
    for (const word of rootWords()) expect(isProductSlug(word), word).toBe(false);
    for (const path of CONTENT_PATHS) expect(isProductSlug(path.slice(1)), path).toBe(false);
    // And no product is called by a guide's address.
    const slugs = new Set(DEMO_FRAGRANCES.map((f) => `/${f.slug}`));
    for (const path of CONTENT_PATHS) expect(slugs.has(path), path).toBe(false);
  });
});

describe('the head tags', () => {
  const tagsFor = (path: string) => headFor({ route: matchRoute(path) });

  it('gives each page its own title, description and canonical, and lets it be indexed', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const path of CONTENT_PATHS) {
      const t = tagsFor(path);
      expect(t.canonical, path).toBe(`${SITE_URL}${path}`);
      expect(t.noindex, path).toBe(false);
      expect(t.title.startsWith('PriceSniffs: '), t.title).toBe(true);
      expect(t.title.length, t.title).toBeLessThanOrEqual(60);
      expect(t.description.length, `${path}: ${t.description.length} chars`).toBeGreaterThanOrEqual(100);
      expect(t.description.length, `${path}: ${t.description.length} chars`).toBeLessThanOrEqual(155);
      expect(t.description, path).toMatch(/[.!]$/);
      titles.add(t.title);
      descriptions.add(t.description);
    }
    expect(titles.size).toBe(CONTENT_PATHS.length);
    expect(descriptions.size).toBe(CONTENT_PATHS.length);
  });

  it('gives each page a title and description no other fixed page of the site has', () => {
    const others = ['/', '/brands', '/retailers', '/notes', '/fragrances', '/oils', '/sets', '/deals', '/about', '/about/legal', '/about/bot', '/legal/how-it-works'];
    const taken = others.map((path) => tagsFor(path));
    for (const path of CONTENT_PATHS) {
      const t = tagsFor(path);
      for (const o of taken) {
        expect(t.title, path).not.toBe(o.title);
        expect(t.description, path).not.toBe(o.description);
      }
    }
    // The guide's own name, without the prefix, is distinct too: no two guides
    // differ only in case or spacing.
    const names = GUIDES.map((g) => g.title.toLowerCase().replace(/\s+/g, ' '));
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps the words it is given: no title or description is cut short to fit', () => {
    for (const g of GUIDES) {
      expect(`PriceSniffs: ${g.title}`.length, g.title).toBeLessThan(60);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(155);
      expect(tagsFor(guidePath(g.slug)).description, g.slug).toBe(g.description);
    }
    expect(tagsFor(GUIDES_PATH).description).toBe(GUIDES_INDEX.description);
    expect(tagsFor(HOW_WE_CHECK.path).description).toBe(HOW_WE_CHECK.description);
  });

  it('names the page in its title: the guide, the index, the method', () => {
    expect(tagsFor('/guides').title).toBe('PriceSniffs: Perfume Guides');
    expect(tagsFor('/about/how-we-check-prices').title).toBe('PriceSniffs: How We Check Prices');
    for (const g of GUIDES) expect(tagsFor(guidePath(g.slug)).title).toBe(`PriceSniffs: ${g.title}`);
  });

  it('says nothing about a guide that does not exist, and keeps it off search engines', () => {
    const t = headFor({ route: matchRoute('/guides/not-a-guide') });
    expect(t.noindex).toBe(true);
    expect(t.title).toBe('PriceSniffs: Page not found');
  });

  it('writes a title and description that do not use hyphens or dashes', () => {
    for (const path of CONTENT_PATHS) {
      const t = tagsFor(path);
      expect(DASH.test(t.title.replace(/^PriceSniffs: /, '')), t.title).toBe(false);
      expect(DASH.test(t.description), t.description).toBe(false);
    }
  });
});

describe.skipIf(!built)('the sitemap', () => {
  const xml = readFileSync(resolve(root, 'demo/sitemap.xml'), 'utf8');

  it('lists every guide, the index and the price checking page, once, with the canonical address', () => {
    for (const path of CONTENT_PATHS) {
      const loc = `<loc>${SITE_URL}${path}</loc>`;
      expect(xml.split(loc).length - 1, path).toBe(1);
    }
  });

  it('lists nothing under /guides that is not a guide', () => {
    const under = [...xml.matchAll(/<loc>https:\/\/pricesniffs\.space(\/guides[^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(under.sort()).toEqual([GUIDES_PATH, ...GUIDES.map((g) => guidePath(g.slug))].sort());
  });
});

describe('the words of the guides', () => {
  it('has words for exactly the guides that are listed', () => {
    expect(Object.keys(GUIDE_BODIES).sort()).toEqual(GUIDES.map((g) => g.slug).sort());
    expect(Object.keys(LAZY_CONTENT_MODULES).sort()).toEqual([GUIDES_FILE, METHOD_FILE].sort());
    for (const name of Object.keys(LAZY_CONTENT_MODULES)) expect(Object.keys(LAZY_DATA_MODULES)).not.toContain(name);
  });

  for (const guide of GUIDES) {
    describe(guide.title, () => {
      const body = GUIDE_BODIES[guide.slug]!;
      const text = blocksText(body);

      it('is 300 to 500 words with its opening line', () => {
        const n = words(`${guide.description} ${text}`);
        expect(n, `${n} words`).toBeGreaterThanOrEqual(300);
        expect(n, `${n} words`).toBeLessThanOrEqual(500);
      });

      it('has sections, not one block', () => {
        expect(body.filter((b) => b.t === 'h').length).toBeGreaterThanOrEqual(3);
        expect(body[0]!.t).toBe('h');
      });

      it('uses no hyphens or dashes, in the body, the title or the description', () => {
        for (const part of [text, guide.title, guide.description]) {
          const bad = part.split('\n').filter((line) => DASH.test(line));
          expect(bad, bad.join(' | ')).toEqual([]);
        }
      });

      it('is plain British English', () => {
        const all = `${guide.title} ${guide.description} ${text}`;
        for (const american of AMERICAN) expect(all, String(american)).not.toMatch(american);
      });

      it('is warm but factual: no hype, no exclamations, no medical or legal claims', () => {
        const all = `${guide.title} ${guide.description} ${text}`;
        for (const bad of NOT_OUR_TONE) expect(all, String(bad)).not.toMatch(bad);
      });

      it('names no shop, so no shop is praised or run down', () => {
        const all = `${guide.description} ${text}`;
        for (const r of RETAILERS) expect(names(all, r.name), r.name).toBe(false);
      });

      it('has Title Case headings with no colons, like the rest of the site', () => {
        for (const part of [guide.title, ...body.filter((b) => b.t === 'h').map((b) => b.x as string)]) {
          expect(titleCaseSlips(part), part).toEqual([]);
          expect(part, part).not.toContain(':');
        }
      });

      it('keeps to short paragraphs: none over ' + MAX_WORDS_PER_BLOCK + ' words', () => {
        for (const line of lines(body)) {
          expect(words(inlineText(line)), line).toBeLessThanOrEqual(MAX_WORDS_PER_BLOCK);
        }
        expect(words(guide.description)).toBeLessThanOrEqual(35);
      });

      it('has no leftover marks, double spaces or empty text', () => {
        for (const b of body) {
          for (const line of b.t === 'ul' ? b.x : [b.x]) {
            expect(line.trim(), line).toBe(line);
            expect(line, line).not.toMatch(/\s{2,}|TODO|XXX|lorem/i);
            expect(line.length).toBeGreaterThan(8);
          }
        }
      });

      it('links only to places the site has, each with a list that is not empty', () => {
        const links = linksOf(body);
        expect(links.length, 'a guide with no links to the site').toBeGreaterThanOrEqual(2);
        for (const href of links) checkInternalLink(href);
        // Never to itself: the foot of the page already lists the others.
        expect(links, guide.slug).not.toContain(guidePath(guide.slug));
      });
    });
  }

  it('links to the strength filters, the notes and the brands between them', () => {
    const links = Object.values(GUIDE_BODIES).flat().flatMap((b) => (b.t === 'ul' ? b.x : [b.x])).flatMap(linksIn);
    for (const wanted of ['/fragrances?strength=edt', '/fragrances?strength=edp', '/fragrances?strength=parfum', '/notes', '/brands', '/oils', '/sets']) {
      expect(links, wanted).toContain(wanted);
    }
    expect(links.some((l) => l.startsWith('/notes/'))).toBe(true);
    expect(links).toContain(HOW_WE_CHECK.path);
  });

  it('leaves no guide an orphan: each is linked from the index and from another page', () => {
    const everyLink = [...Object.values(GUIDE_BODIES).flat(), ...METHOD_BODY].flatMap((b) => (b.t === 'ul' ? b.x : [b.x])).flatMap(linksIn);
    const index = guidesIndexHtml();
    for (const g of GUIDES) {
      expect(index, g.slug).toContain(`href="${guidePath(g.slug)}"`);
      // Every guide page also lists the others, so the graph is complete; the
      // words of a guide link to at least some of them.
      expect(guideHtml(GUIDES.find((x) => x.slug !== g.slug)!, null, 'loading')).toContain(`href="${guidePath(g.slug)}"`);
    }
    expect(everyLink.some((l) => l.startsWith('/guides/'))).toBe(true);
  });
});

/** The strengths the Concentration filter offers, and the strengths each one holds (CONCENTRATION_GROUPS, demo/app.ts). */
const STRENGTH_FILTER: Record<string, readonly string[]> = {
  edp: ['Eau de Parfum'],
  edt: ['Eau de Toilette'],
  parfum: ['Parfum', 'Extrait de Parfum'],
  edc: ['Eau de Cologne'],
  oil: ['Perfume Oil'],
};

/**
 * An address a written page links to must be one the router and the catalogue
 * answer, and a link to a list must open a list with something in it: a note
 * that some fragrance lists in that layer, a strength and a size some bottle
 * has, a sort the tab offers.
 */
function checkInternalLink(href: string): void {
  expect(href.startsWith('/') && !href.startsWith('//'), href).toBe(true);
  const url = new URL(href, 'https://pricesniffs.space');
  const route = matchRoute(url.pathname, url.search, url.hash);
  expect(route.name, `${href} is not an address of the site`).not.toBe('notFound');
  switch (route.name) {
    case 'guide':
      expect(guideBySlug(route.param), href).toBeDefined();
      break;
    case 'note': {
      const note = noteForAddress(route.param);
      expect(note, `${href}: no such note`).toBeDefined();
      const layer = route.query.layer;
      if (layer !== undefined) expect(['top', 'middle', 'base'], href).toContain(layer);
      const layered = (layer ?? 'any') as 'top' | 'middle' | 'base' | 'any';
      expect(fragrancesWithNote(note!, layered).length, `${href}: no fragrance lists it there`).toBeGreaterThan(0);
      break;
    }
    case 'brand':
      expect(DEMO_FRAGRANCES.some((f) => slugOf(f.brand) === route.param), `${href}: no such brand`).toBe(true);
      break;
    case 'legalNotice':
      expect(route.param === '' || (LEGAL_NOTICE_IDS as readonly string[]).includes(route.param), href).toBe(true);
      break;
    default:
      break;
  }
  // The filters the lists read: ids and values the lists really have, each
  // with at least one bottle behind it.
  const strength = url.searchParams.get('strength');
  if (strength !== null) {
    expect(Object.keys(STRENGTH_FILTER), href).toContain(strength);
    expect(DEMO_FRAGRANCES.some((f) => STRENGTH_FILTER[strength]!.includes(f.concentration)), `${href}: no bottle has that strength`).toBe(true);
  }
  const size = url.searchParams.get('size');
  if (size !== null) {
    expect(VOLUME_BANDS.map((b) => b.id as string), href).toContain(size);
    expect(DEMO_FRAGRANCES.some((f) => !isSet(f) && volumeBandFor(f.sizeMl) === size), `${href}: no bottle in that size`).toBe(true);
  }
  const sort = url.searchParams.get('sort');
  if (sort !== null) {
    const offered = route.name === 'oils' ? OIL_SORT_OPTIONS : route.name === 'sets' ? SET_SORT_OPTIONS : [];
    expect(offered.map((o) => o.value as string), `${href}: that list offers no such sort`).toContain(sort);
  }
  if (route.name === 'oils') expect(DEMO_FRAGRANCES.some((f) => isOil(f)), href).toBe(true);
  if (route.name === 'sets') expect(DEMO_FRAGRANCES.some((f) => isSet(f)), href).toBe(true);
}

describe('the words of /about/how-we-check-prices', () => {
  const text = blocksText(METHOD_BODY);

  it('covers each thing the page was asked to explain', () => {
    const asked: [string, RegExp][] = [
      ['shop sites', /product pages and sitemaps/],
      ['affiliate feeds', /product feed/],
      ['the bot identity', new RegExp(BOT_NAME)],
      ['robots.txt', /robots\.txt/],
      ['how often', /at least once a day/],
      ['hiding old prices', new RegExp(`more than ${HIDE_OFFER_AFTER_DAYS} days`)],
      ['delivery', /Incl\./],
      ['delivery shown apart', /Delivery Not Included/],
      ['barcodes', /barcode/],
      ['names', /words of the name/],
      ['size rules', /50ml bottle and a 100ml bottle/],
      ['affiliate links', /Affiliate Link/],
      ['the price not changing', /does not change the price/],
    ];
    for (const [what, pattern] of asked) expect(text, what).toMatch(pattern);
  });

  it('quotes the crawler exactly as it introduces itself', () => {
    expect(text).toContain(BOT_USER_AGENT);
  });

  it('works its figures out from the records the rest of the site reads', () => {
    const enabled = RETAILERS.filter((r) => r.enabled);
    const paying = enabled.filter((r) => r.affiliate.status === 'active');
    expect(text).toContain(`${paying.length} of the ${enabled.length} shops listed today`);
    expect(paying.length).toBeGreaterThan(0);
  });

  it('says the same about the crawler as the crawler page does', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    expect(app).toContain('never fills a basket');
    expect(text).toContain('never logs in, fills a basket or checks out');
    expect(app).toContain('one request at a time');
    expect(text).toContain('one page at a time');
  });

  it('claims no longer a gap between requests than the slowest shop setting keeps', () => {
    // The harvest waits the shop's minRequestGapMs (1500 where unset) or the
    // robots.txt crawl delay, whichever is longer (scripts/catalogue-harvest.ts).
    // So the page may promise no more than the smallest of those settings.
    const gaps = RETAILERS.filter((r) => r.enabled).map((r) => r.catalogue?.minRequestGapMs ?? 1500);
    const floorSeconds = Math.min(...gaps) / 1000;
    const stated = /at least (a|one|[\d.]+) seconds? apart/.exec(text);
    expect(stated, 'the page says how far apart the requests are').not.toBeNull();
    const seconds = stated![1] === 'a' || stated![1] === 'one' ? 1 : Number(stated![1]);
    expect(seconds, `the page says ${seconds}s, a shop is read every ${floorSeconds}s`).toBeLessThanOrEqual(floorSeconds);
  });

  it('is plain British English, with no hype and Title Case headings', () => {
    const all = `${HOW_WE_CHECK.title} ${HOW_WE_CHECK.description} ${GUIDES_INDEX.title} ${GUIDES_INDEX.description} ${text}`;
    for (const american of AMERICAN) expect(all, String(american)).not.toMatch(american);
    for (const bad of NOT_OUR_TONE) expect(all, String(bad)).not.toMatch(bad);
    for (const h of [HOW_WE_CHECK.title, GUIDES_INDEX.title, ...METHOD_BODY.filter((b) => b.t === 'h').map((b) => b.x as string)]) {
      expect(titleCaseSlips(h), h).toEqual([]);
    }
  });

  it('keeps to short paragraphs', () => {
    for (const line of lines(METHOD_BODY)) expect(words(inlineText(line)), line).toBeLessThanOrEqual(MAX_WORDS_PER_BLOCK);
  });

  it('does not say a percentage saving is the shop’s own figure: the site works it out', () => {
    // rrpSavingFor (demo/msrpComparison.ts) works the percentage from the
    // shop's RRP and the row's own price, so only the previous price is the shop's.
    expect(text).not.toMatch(/percentage saving are the shop/);
    expect(text).toMatch(/previous price[^.]*shop’s own figure/);
  });

  it('does not say a tester stays on the site: a title with Tester in it is left out', () => {
    // NOT_A_FRAGRANCE (src/catalogue/fragranceId.ts) drops it.
    expect(text).not.toMatch(/Tester or Unboxed in its name stays/);
    const decants = blocksText(GUIDE_BODIES['decants-and-testers']!);
    expect(decants).not.toMatch(/Tester or Unboxed in its name stays/);
    expect(decants).toMatch(/title says Tester is left out/);
  });

  it('uses no hyphens or dashes and no leftover marks', () => {
    // The user agent is quoted as the crawler sends it; it has none either.
    const bad = text.split('\n').filter((line) => DASH.test(line));
    expect(bad, bad.join(' | ')).toEqual([]);
    expect(text).not.toMatch(/undefined|NaN|\[object|\$\{/);
  });

  it('links only to places the site has', () => {
    const links = linksOf(METHOD_BODY);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const href of links) checkInternalLink(href);
  });
});

describe('drawing the pages', () => {
  it('draws one level one heading, the opening line at once, and says it is loading', () => {
    for (const html of [
      guidesIndexHtml(),
      guideHtml(GUIDES[0]!, null, 'loading'),
      howWeCheckHtml(null, 'loading'),
    ]) {
      expect(html.match(/<h1\b/g)).toHaveLength(1);
    }
    const loading = guideHtml(GUIDES[0]!, null, 'loading');
    expect(loading).toContain(GUIDES[0]!.title);
    expect(loading).toContain(GUIDES[0]!.description.slice(0, 40));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain('role="alert"');
  });

  it('says plainly when the words could not be loaded', () => {
    const failed = howWeCheckHtml(null, 'failed');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain('could not be loaded');
    expect(failed).not.toContain('aria-busy');
  });

  it('draws the words, with a heading for each section and links the router can open', () => {
    const html = guideHtml(GUIDES[0]!, GUIDE_BODIES[GUIDES[0]!.slug]!, 'ready');
    expect(html).not.toContain('aria-busy');
    expect(html.match(/<h2\b/g)!.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('data-nav');
    // Each other guide is offered at the foot.
    for (const g of GUIDES.slice(1)) expect(html).toContain(`href="${guidePath(g.slug)}"`);
  });

  it('escapes the words and opens only addresses on this site', () => {
    const hostile = inlineHtml('<script>alert(1)</script> [go](//evil.example/x) [ok](/guides) [bad](javascript:alert(1)) "quoted" & more');
    expect(hostile).not.toContain('<script>');
    expect(hostile).toContain('&lt;script&gt;');
    expect(hostile).toContain('<a href="/guides" data-nav>ok</a>');
    expect(hostile).not.toContain('href="//evil');
    expect(hostile).not.toContain('href="javascript');
    expect(hostile).toContain('&amp; more');
    const list = blocksHtml([{ t: 'ul', x: ['<b>one</b>', 'two'] }]);
    expect(list).toBe('<ul class="t-body"><li>&lt;b&gt;one&lt;/b&gt;</li><li>two</li></ul>');
  });
});

describe('the lazy files', () => {
  const guidesFile = { GUIDE_BODIES };
  const methodFile = { METHOD_BODY };

  it('accept the files the build writes, and refuse anything else', () => {
    expect(prepareGuides(JSON.parse(JSON.stringify(guidesFile)))).toEqual(GUIDE_BODIES);
    expect(prepareMethod(JSON.parse(JSON.stringify(methodFile)))).toEqual(METHOD_BODY);
    expect(() => prepareGuides(null)).toThrow();
    expect(() => prepareGuides({ GUIDE_BODIES: {} })).toThrow('no words for');
    const short = { ...GUIDE_BODIES };
    delete short['decants-and-testers'];
    expect(() => prepareGuides({ GUIDE_BODIES: short })).toThrow('decants-and-testers');
    expect(() => prepareGuides({ GUIDE_BODIES: { ...GUIDE_BODIES, 'decants-and-testers': [{ t: 'p', x: 7 }] } })).toThrow();
    expect(() => prepareMethod({ METHOD_BODY: [] })).toThrow();
    expect(() => prepareMethod({ METHOD_BODY: [{ t: 'script', x: 'a' }] })).toThrow();
  });

  it('fetch once, share the fetch, and ask again after a failure', async () => {
    const asked: string[] = [];
    const store = createGuideBodies(async (name) => {
      asked.push(name);
      return guidesFile;
    });
    expect(store.status()).toBe('idle');
    expect(store.current()).toBeNull();
    const [a, b] = await Promise.all([store.load(), store.load()]);
    expect(a).toBe(b);
    await store.load();
    expect(asked).toEqual([GUIDES_FILE]);
    expect(store.status()).toBe('ready');

    let fail = true;
    const flaky = createMethodBody(async (name) => {
      asked.push(name);
      if (fail) throw new Error('offline');
      return methodFile;
    });
    await expect(flaky.load()).rejects.toThrow('offline');
    expect(flaky.status()).toBe('failed');
    fail = false;
    expect((await flaky.load()).length).toBe(METHOD_BODY.length);
    expect(asked).toEqual([GUIDES_FILE, METHOD_FILE, METHOD_FILE]);
  });
});

/**
 * The point of a lazy file: the first load does not carry the words. The page
 * names the two files so the loader can fetch them, and the bundle inside the
 * page holds none of their sentences.
 */
describe.skipIf(!built)('the built page', () => {
  const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
  const lazy = JSON.parse(/var lazy = (\{.*\});/.exec(html)![1]!) as Record<string, string>;
  const eager = JSON.parse(/var files = (\[.*\]);/.exec(html)![1]!) as [string, number][];

  it('names the two files of words as on demand, and does not fetch them at start up', () => {
    for (const name of [GUIDES_FILE, METHOD_FILE]) {
      expect(lazy[name], name).toMatch(new RegExp(`^data/${name}\\.[0-9a-f]{16}\\.json$`));
      expect(eager.some(([p]) => p === lazy[name]), name).toBe(false);
      expect(existsSync(resolve(root, 'demo', lazy[name]!)), name).toBe(true);
    }
  });

  it('carries the heading of each page but none of the sentences of any', () => {
    // A line of the new pages that repeats, in the same words, one the site's
    // older pages (demo/legal.ts, which is in the bundle) already say is skipped:
    // its presence in the page proves nothing about the lazy file.
    const older = readFileSync(resolve(root, 'demo/legal.ts'), 'utf8').replace(/\s+/g, ' ');
    const probes = [...Object.values(GUIDE_BODIES).flat(), ...METHOD_BODY]
      .flatMap((b: Block) => (b.t === 'ul' ? b.x : [b.x]))
      .filter((t) => t.length > 60)
      // A stretch from the middle of the line, with its links reduced to labels.
      .map((t) => t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').slice(10, 50))
      .filter((probe) => !older.includes(probe));
    expect(probes.length, 'too few lines to prove anything').toBeGreaterThan(30);
    for (const probe of probes) expect(html.includes(probe), probe).toBe(false);
    // What every visit does carry: where the pages are and what they are called.
    for (const g of GUIDES) expect(html).toContain(g.title);
  });

  it('ships files that hold the words, unchanged', () => {
    const guides = JSON.parse(readFileSync(resolve(root, 'demo', lazy[GUIDES_FILE]!), 'utf8')) as unknown;
    const method = JSON.parse(readFileSync(resolve(root, 'demo', lazy[METHOD_FILE]!), 'utf8')) as unknown;
    expect(prepareGuides(guides)).toEqual(GUIDE_BODIES);
    expect(prepareMethod(method)).toEqual(METHOD_BODY);
  });
});

describe('the guides index', () => {
  it('has its own heading and description', () => {
    expect(GUIDES_INDEX.title).toBe('Perfume Guides');
    const html = guidesIndexHtml();
    expect(html).toContain(`<h1 class="t-page">${GUIDES_INDEX.title}</h1>`);
    for (const g of GUIDES) expect(html).toContain(g.description);
    expect(html).toContain(`href="${HOW_WE_CHECK.path}"`);
  });
});
