import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { fragranceLinksFor, fragranticaLabel } from '../demo/fragranceLinks.js';
import { fragranceLinkKey, fragranticaPath, parseFragranticaUrl } from '../src/catalogue/fragranceLinkMatch.js';
import type { LinksFile } from '../src/catalogue/fragranceLinkStore.js';
import { auditFragranticaLink, classifyFragranticaUrl } from '../src/catalogue/fragranticaAudit.js';
import { indexReview, matchFragranticaChecked, parseReview, reviewRefusal } from '../src/catalogue/fragranticaReview.js';

/**
 * The stored data, held to the rule: every Fragrantica link the site can show is
 * a perfume page, is the product's own page by name, designer and strength, and
 * is not a search page in disguise (owner request of 2026-10-05; the report is
 * docs/FRAGRANTICA-LINK-AUDIT-2026-10-05.md). If one of these fails, a link the
 * page shows as "Fragrantica" would not open that perfume's page.
 */

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const LINKS = JSON.parse(read('data/fragrance-links.json')) as LinksFile;
const REVIEW_FILE = parseReview(read('data/fragrantica-link-review.json'));
const REVIEW = indexReview(REVIEW_FILE);

describe('data/fragrance-links.json: every Fragrantica link is a direct perfume page', () => {
  const withLink = Object.entries(LINKS.entries).filter(([, e]) => e.fragrantica);

  it('has some, so the checks below are not vacuous', () => {
    expect(withLink.length).toBeGreaterThan(100);
  });

  it('has the direct shape on www.fragrantica.com, never a search, an index page or a query', () => {
    for (const [key, e] of withLink) {
      const url = e.fragrantica!;
      expect(classifyFragranticaUrl(url), `${key} -> ${url}`).toBe('direct');
      expect(url, key).toMatch(/^https:\/\/www\.fragrantica\.com\/perfume\/[^/?#]+\/[^/?#]+-\d+\.html$/);
      expect(parseFragranticaUrl(url)?.url, `${key} is stored in canonical form`).toBe(url);
    }
  });

  it('says how it was found and how well it matched, and was not also refused', () => {
    for (const [key, e] of withLink) {
      expect(['bing-search', 'bing-seen'], key).toContain(e.method.fragrantica);
      expect(['exact', 'base', 'loose'], key).toContain(e.fragranticaMatch);
      expect(e.fragranticaRefused, `${key} has a page and is marked refused`).toBeUndefined();
    }
  });

  it('keeps a page and its search stamp apart: no entry has a link that is not a string', () => {
    for (const [key, e] of Object.entries(LINKS.entries)) {
      if (e.fragrantica !== undefined) expect(typeof e.fragrantica, key).toBe('string');
    }
  });
});

describe('the page: every product\'s Fragrantica link is its own page or an honest search', () => {
  const rows = CATALOGUE.map((e) => ({ e, links: fragranceLinksFor(e.brand, e.name, e.concentration) }));

  it('a direct link names the same designer and perfume, without a contradicting strength or gender', () => {
    let direct = 0;
    const bad: string[] = [];
    for (const { e, links } of rows) {
      if (!links.fragranticaDirect) continue;
      direct++;
      const a = auditFragranticaLink(
        links.fragranticaUrl,
        { brand: e.brand, name: e.name, concentration: e.concentration, gender: e.gender ?? null },
        REVIEW,
      );
      if (a.verdict === 'mismatch') bad.push(`${e.brand} | ${e.name} | ${e.concentration}: ${links.fragranticaUrl} (${a.reasons.join('; ')})`);
    }
    expect(direct).toBeGreaterThan(100);
    expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
  });

  it('a direct link is the same perfume under the full rule, review included', () => {
    const bad: string[] = [];
    for (const { e, links } of rows) {
      if (!links.fragranticaDirect) continue;
      const m = matchFragranticaChecked(
        links.fragranticaUrl,
        { brand: e.brand, name: e.name, concentration: e.concentration, gender: e.gender ?? null },
        REVIEW,
      );
      if (!m) bad.push(`${e.brand} | ${e.name} | ${e.concentration}: ${links.fragranticaUrl}`);
    }
    expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
  });

  it('every other link is a Fragrantica search for that product, and says so', () => {
    for (const { e, links } of rows) {
      if (links.fragranticaDirect) {
        expect(classifyFragranticaUrl(links.fragranticaUrl)).toBe('direct');
        expect(fragranticaLabel(links)).toBe('Fragrantica');
        continue;
      }
      expect(classifyFragranticaUrl(links.fragranticaUrl), `${e.brand} ${e.name}`).toBe('search');
      expect(links.fragranticaUrl.startsWith('https://www.fragrantica.com/search/?query=')).toBe(true);
      expect(fragranticaLabel(links)).toBe('Search Fragrantica');
    }
  });

  it('is never a page the review rejected for that product', () => {
    for (const { e, links } of rows) {
      if (!links.fragranticaDirect) continue;
      expect(
        reviewRefusal(links.fragranticaUrl, { brand: e.brand, name: e.name, concentration: e.concentration, gender: e.gender ?? null }, REVIEW),
        `${e.brand} ${e.name}`,
      ).toBeNull();
    }
  });
});

describe('data/fragrantica-link-review.json', () => {
  it('lists only perfume pages, and a reason for each page it rejects', () => {
    for (const s of REVIEW_FILE.singlePage) expect(classifyFragranticaUrl(s.url), s.url).toBe('direct');
    for (const w of REVIEW_FILE.wrong) {
      expect(classifyFragranticaUrl(w.url), w.url).toBe('direct');
      expect(w.why.length, w.url).toBeGreaterThan(10);
    }
    expect(Object.keys(REVIEW_FILE.pageGender).length).toBeGreaterThan(50);
    for (const [path, g] of Object.entries(REVIEW_FILE.pageGender)) {
      expect(['men', 'women', 'unisex'], path).toContain(g);
      expect(fragranticaPath(`https://www.fragrantica.com/perfume/${path}.html`), path).toBe(path);
    }
  });

  it('does not leave a rejected page stored for the perfume it was rejected for', () => {
    for (const e of CATALOGUE) {
      const k = fragranceLinkKey(e.brand, e.name, e.concentration);
      const stored = LINKS.entries[k]?.fragrantica;
      if (!stored) continue;
      expect(reviewRefusal(stored, { brand: e.brand, name: e.name, concentration: e.concentration, gender: e.gender ?? null }, REVIEW), k).toBeNull();
    }
  });
});
