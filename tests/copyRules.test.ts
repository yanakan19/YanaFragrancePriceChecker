import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { GUIDES, GUIDES_INDEX, HOW_WE_CHECK } from '../demo/guideList.js';

/**
 * The copy rules of the UX polish pass (docs/UX-POLISH-PLAN.md section 6),
 * held across every source of words a visitor reads:
 *
 *   - none of the stock phrases that make a page read as machine written;
 *   - no em or en dashes, and no hyphen used as a dash;
 *   - no exclamation marks;
 *   - the legal and affiliate statements docs/LEGAL.md requires are still
 *     in their places, word for word where the plan keeps them so.
 *
 * The words are read from the code itself: every string and template literal
 * in the page's modules (TypeScript's own parser finds them, so comments,
 * which are not shown, are left out), with HTML comments and tags taken
 * away, and the visible text of demo/template.html. Console messages, thrown
 * errors and inline style sheets are not shown to a visitor and are skipped.
 * The words owned by the region code (demo/regionSwitch.ts,
 * demo/regionWelcome.ts, src/services/regionText.ts) and the owner's private
 * dashboard (demo/developer.ts) are not in the list.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COPY_MODULES = [
  'app', 'contentPages', 'tabPanels', 'notesPage', 'setPage', 'filterUi', 'priceHistoryChart', 'guideList',
  'content/guideBodies', 'content/methodBody', 'legal', 'legalRegion', 'marquee', 'footerLinks', 'changelog',
  'stockLabels', 'listSort', 'wrongPrice', 'share', 'priceAlerts', 'wishlist', 'auth', 'itemSummary',
  'deliveryFacts', 'offerGroups', 'searchIntent', 'head', 'listFilters', 'tabFacets', 'ageConfirm', 'ads',
  'profilePhoto', 'msrpComparison', 'referencePrice', 'gender', 'volumeBands', 'mostStocked',
];

/** Every piece of text a module could put on the page. */
function shownStrings(path: string): string[] {
  const src = ts.createSourceFile(path, readFileSync(resolve(root, path), 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isCallExpression(n) && /^console\./.test(n.expression.getText(src))) return;
    if (ts.isNewExpression(n) && /Error$/.test(n.expression.getText(src))) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const isKey = ts.isPropertyAssignment(n.parent) && n.parent.name === n;
      if (!isKey) out.push(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return out
    .map((t) => t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, ' '))
    // An inline style sheet or a style attribute's value: not words.
    .filter((t) => !(t.includes('{') && t.includes(';')));
}

const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
/** The template's visible text: the body, without scripts, styles and comments. */
const templateText = template
  .slice(template.indexOf('</style>'))
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]*>/g, ' ');

const SOURCES: { name: string; texts: string[] }[] = [
  ...COPY_MODULES.map((m) => ({ name: `demo/${m}.ts`, texts: shownStrings(`demo/${m}.ts`) })),
  { name: 'demo/template.html', texts: [templateText] },
];

const BANNED: [string, RegExp][] = [
  ['Discover', /\bdiscover(?:s|ed|ing)?\b/i],
  ['Elevate', /\belevat(?:e|es|ed|ing)\b/i],
  ['Explore our curated', /\bexplore our curated\b/i],
  ['Seamless', /\bseamless(?:ly)?\b/i],
  ['Unlock', /\bunlock(?:s|ed|ing)?\b/i],
  ['Whether you are', /\bwhether you(?:'|’)?re\b|\bwhether you are\b/i],
  ["In today's", /\bin today(?:'|’)s\b/i],
];

function findings(test: (text: string) => boolean): string[] {
  const out: string[] = [];
  for (const s of SOURCES) {
    for (const t of s.texts) if (test(t)) out.push(`${s.name}: ${t.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
  }
  return out;
}

describe('the words on the page', () => {
  it('reads the copy sources (a broken reader would pass everything)', () => {
    const total = SOURCES.reduce((n, s) => n + s.texts.length, 0);
    expect(total).toBeGreaterThan(3000);
    expect(findings((t) => t.includes('Most Stocked')).length).toBeGreaterThan(0);
  });

  for (const [phrase, re] of BANNED) {
    it(`never says "${phrase}"`, () => {
      expect(findings((t) => re.test(t))).toEqual([]);
    });
  }

  it('uses no em or en dashes, and no hyphen as a dash', () => {
    expect(findings((t) => /[–—]/.test(t) || /\s-\s/.test(t))).toEqual([]);
  });

  it('uses no exclamation marks', () => {
    expect(findings((t) => /[A-Za-z)]!(?=\s|$)/.test(t))).toEqual([]);
  });

  it('keeps the search descriptions and the short lines the plan gave the guides', () => {
    for (const g of GUIDES) {
      expect(g.summary.split(/\s+/).length, g.slug).toBeLessThanOrEqual(14);
      expect(g.summary.endsWith('.'), g.slug).toBe(true);
      expect(g.description.length, g.slug).toBeGreaterThan(g.summary.length);
    }
    expect(GUIDES_INDEX.lead.length).toBeLessThan(GUIDES_INDEX.description.length);
    expect(HOW_WE_CHECK.lead.length).toBeLessThan(HOW_WE_CHECK.description.length);
  });
});

describe('the legal and affiliate statements stay where docs/LEGAL.md puts them', () => {
  const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');

  it('states the affiliate terms in the footer of every page, word for word', () => {
    expect(template).toContain(
      '<p class="footer-note">Some links earn us a commission. It never changes the order.</p>',
    );
  });

  it('marks a paying shop\'s row before the click, and tells search engines', () => {
    expect(app).toContain("if (commissioned) facts.push('Affiliate link');");
    expect(app).toMatch(/rel="nofollow noopener\$\{commissioned \? ' sponsored' : ''\}"/);
  });

  it('says how old each price is on its row', () => {
    expect(app).toContain('const checked = offerAge(row.ageSeconds);');
  });

  // demo/legal.ts is read as text: importing it loads the whole catalogue.
  const legal = readFileSync(resolve(root, 'demo/legal.ts'), 'utf8');

  it('keeps the affiliate card on About, and the disclosure link for a reader without the script', () => {
    expect(legal).toContain(
      "title: 'Affiliate Links',\n      body: 'Some shop links are affiliate links, marked on the page. We may earn commission if you buy, at no cost to you. It never changes the order of results.',",
    );
    expect(template).toContain('Read the <a href="/about/legal#affiliate">affiliate disclosure</a>.');
  });

  it('keeps all six sections of the Legal Notice', () => {
    expect(legal).toContain("export const LEGAL_NOTICE_IDS = ['terms', 'privacy', 'affiliate', 'cookies', 'refunds', 'contact'] as const;");
    for (const id of ['how-it-works', 'affiliate', 'privacy', 'cookies', 'refunds', 'terms', 'contact']) {
      expect(legal, id).toContain(`    id: '${id}',`);
    }
  });

  it('says what happens to what a visitor sends, at the point they send it', () => {
    expect(app).toContain('An account stores your email address');
    expect(app).toContain('We keep what you send only for as long as it takes to reply.');
    expect(app).toContain('Nothing goes to a server of ours.');
  });
});
