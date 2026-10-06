import { describe, expect, it } from 'vitest';
import {
  ABOUT, COMPANY, LEGAL_NOTICE_IDS, LEGAL_PAGES, STORAGE_KEYS, demoteHeadings, isLegalNoticeId, legalNoticeSections, legalPage,
} from '../demo/legal.js';
import { RETAILERS } from '../src/config/retailers.js';
import { BRAND_LOGOS } from '../demo/brandLogos.js';

/** Reader-facing text only: tags, attributes and code spans stripped. */
function proseOf(html: string): string {
  return html
    .replace(/<code>[^<]*<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ');
}

describe('the legal pages a UK site needs are all present', () => {
  it('carries every page the compliance checklist asks for, under a stable id', () => {
    // Privacy, terms, cookies and refunds are what the 2026-09-06 review
    // asked for; the affiliate disclosure is what the CAP Code asks for; the
    // contact page is where a reader is told how to reach us. An id here is
    // also an anchor on the Legal Notice (/about/legal#<id>) and the old public
    // URL (/legal/<id>), so renaming one is a broken link, not a refactor.
    // About is not on the list: it has its own page, /about (aboutView).
    for (const id of ['how-it-works', 'affiliate', 'privacy', 'cookies', 'refunds', 'terms', 'contact']) {
      expect(legalPage(id), `missing legal page: ${id}`).toBeDefined();
    }
    expect(legalPage('about')).toBeUndefined();
  });

  it('every policy page says when it was last updated', () => {
    for (const page of LEGAL_PAGES) {
      if (page.id === 'how-it-works' || page.id === 'contact') continue;
      expect(page.body, `${page.id} has no Last updated line`).toContain('Last updated');
    }
  });

  it('never states a business detail it does not have, and never leaves one silently blank', () => {
    // The e-commerce rules ask for a name, a geographic address and an email.
    // The email is real. The other two are null until the operator supplies
    // them, and the pages must then say so in words rather than render an
    // empty cell or an invented value.
    const terms = legalPage('terms')!.body;
    expect(terms).toContain(COMPANY.email);
    if (COMPANY.postalAddress === null) expect(terms).toContain('not yet published');
    else expect(terms).toContain(COMPANY.postalAddress);
    if (COMPANY.operator === null) expect(terms).toContain(`trading as ${COMPANY.legalName}`);
    else expect(terms).toContain(COMPANY.operator);
  });
});

describe('the legal pages describe the site as it actually is', () => {
  it('the affiliate disclosure names exactly the shops whose programmes are live', () => {
    // This page said "no affiliate programme is running yet" for weeks after
    // six had gone live. It is now computed from the registry, and this pins
    // that: every live programme is named, and no dead one is.
    const live = RETAILERS.filter((r) => r.affiliate.status === 'active');
    const body = legalPage('affiliate')!.body;
    expect(live.length).toBeGreaterThan(0);
    for (const r of live) expect(body, `${r.name} earns commission but is not named`).toContain(r.name);
    expect(body).not.toContain('No affiliate programme is running');
    expect(body).not.toMatch(/all twelve shops/i);
  });

  it('the privacy notice names who processes data, and no chat (removed 2026-10-02)', () => {
    const body = legalPage('privacy')!.body;
    expect(body).toContain(COMPANY.accountsProvider);
    expect(body).not.toMatch(/chat|Virtual Yanny/i);
    // The sentence that stopped being true on 2026-08-13 must not come back.
    expect(body).not.toMatch(/nothing you do inside the app[^.]*is sent anywhere/i);
  });

  it('the cookies page lists every key the app writes, by its real name', () => {
    const body = legalPage('cookies')!.body;
    for (const s of STORAGE_KEYS) expect(body).toContain(s.key);
    // The three preference keys are the ones demo/app.ts actually uses.
    for (const key of ['pricesniffs.display', 'pricesniffs.layout', 'pricesniffs.perrow']) {
      expect(STORAGE_KEYS.map((s) => s.key)).toContain(key);
    }
  });

  it('the Terms carry the logo paragraph, and it counts what the registry actually holds — docs/LOGOS-PLAN.md §4f', () => {
    const body = legalPage('terms')!.body;
    // Collapsed whitespace: the source template literal wraps these sentences
    // across lines for readability, which a plain toContain would otherwise
    // have to match a literal newline and indentation for.
    const flat = proseOf(body).replace(/\s+/g, ' ');
    expect(flat).toContain('not affiliated with, endorsed by or sponsored by');
    expect(body).toMatch(/<h2[^>]*>Logos<\/h2>/);
    const total = RETAILERS.filter((r) => r.logo != null).length + Object.keys(BRAND_LOGOS).length;
    expect(flat).toContain(`Today ${total} shops and houses carry a logo we show`);
  });

  it('no page quotes a retailer count by hand', () => {
    // "twelve" and "thirty" were both typed in once and both drifted.
    for (const page of LEGAL_PAGES) {
      expect(proseOf(page.body), `${page.id} hand-types a shop count`).not.toMatch(/\b(twelve|thirty) (UK )?shops\b/i);
    }
  });
});

describe('house style: no dashes and no hyphenated words in reader-facing text', () => {
  it('holds on every page', () => {
    for (const page of LEGAL_PAGES) {
      const prose = proseOf(page.body);
      expect(prose, `${page.id} contains an en or em dash`).not.toMatch(/[–—]/);
      // A hyphen between two letters is a hyphenated word; digits either side
      // (a date range, a postcode) are not what the rule is about.
      const hyphenated = prose.match(/[A-Za-z]-[A-Za-z]+/g) ?? [];
      expect(hyphenated, `${page.id} has hyphenated words: ${hyphenated.join(', ')}`).toEqual([]);
    }
  });
});

describe('the Legal Notice holds every legal page, and each keeps its own words', () => {
  it('is the terms, privacy, affiliate disclosure, cookies, refunds and contact pages, in that order', () => {
    expect([...LEGAL_NOTICE_IDS]).toEqual(['terms', 'privacy', 'affiliate', 'cookies', 'refunds', 'contact']);
    expect(legalNoticeSections().map((x) => x.id)).toEqual([...LEGAL_NOTICE_IDS]);
    for (const id of LEGAL_NOTICE_IDS) expect(isLegalNoticeId(id)).toBe(true);
    // How it works is not a legal document and keeps its own page.
    expect(isLegalNoticeId('how-it-works')).toBe(false);
    expect(isLegalNoticeId('about')).toBe(false);
    expect(isLegalNoticeId('nonsense')).toBe(false);
  });

  it('carries every word of each page, with only its headings moved down one level', () => {
    for (const section of legalNoticeSections()) {
      const page = legalPage(section.id)!;
      expect(section.title).toBe(page.title);
      expect(section.body, `${section.id} has a level two heading left`).not.toMatch(/<h2[\s>]/);
      // Undoing the change gives back the page exactly: nothing was added or cut.
      expect(section.body.replace(/<h3(\s[^>]*)?>/g, '<h2$1>').replace(/<\/h3>/g, '</h2>')).toBe(page.body);
    }
  });

  it('keeps the logo and photo notices, the business details and the live affiliate shops', () => {
    const all = legalNoticeSections().map((x) => proseOf(x.body)).join(' ').replace(/\s+/g, ' ');
    expect(all).toContain('Product Images');
    expect(all).toContain('Logos');
    expect(all).toContain('Who Runs This Site');
    expect(all).toContain(COMPANY.email);
    for (const r of RETAILERS.filter((x) => x.affiliate.status === 'active')) expect(all).toContain(r.name);
    expect(all).toContain('Which Links Earn Commission');
    expect(all).toContain('In Short');
  });

  it('shows the business details once, not twice', () => {
    const sections = legalNoticeSections();
    expect(sections.filter((x) => x.body.includes('class="biz-details"') && x.body.includes('Company Number')).length).toBe(1);
  });

  it('demoteHeadings changes the tag and nothing else', () => {
    expect(demoteHeadings('<h2 class="t-section" id="x">A</h2><p>b</p>')).toBe('<h3 class="t-section" id="x">A</h3><p>b</p>');
    expect(demoteHeadings('<h2>A</h2>')).toBe('<h3>A</h3>');
    expect(demoteHeadings('<p>no heading</p>')).toBe('<p>no heading</p>');
  });

  it('never says a note sits at the bottom of every screen, which is no longer true', () => {
    expect(legalPage('affiliate')!.body).not.toMatch(/bottom of every screen/);
  });
});

describe('the About page copy: short, plain and true to the code', () => {
  const copy = [ABOUT.why, ...ABOUT.how.map((c) => `${c.title} ${c.body}`), ABOUT.whoRuns].join(' ');

  it('is the owner\'s reason, four cards and who runs it, and nothing long', () => {
    expect(proseOf(ABOUT.why)).toContain('I was tired of buying a fragrance and then seeing it cheaper somewhere else');
    expect(ABOUT.how.map((c) => c.title)).toEqual(['Prices', 'Shops', 'Cheapest', 'Affiliate Links']);
    for (const c of ABOUT.how) expect(c.body.split(/\s+/).length, `${c.title} is long`).toBeLessThanOrEqual(30);
    // Cut from 472 words: the whole copy now fits well inside this.
    expect(proseOf(copy).split(/\s+/).length).toBeLessThanOrEqual(190);
  });

  it('does not tell the old story, and does not name or describe the crawler', () => {
    expect(copy).not.toMatch(/Club de Nuit|twelve pounds|nine tabs/i);
    expect(copy).not.toMatch(/\bbots?\b|crawl|scrap|spider|PriceSniffsBot/i);
  });

  it('says prices are checked regularly from the shops\' own listings and feeds, delivery where stated', () => {
    const prices = ABOUT.how.find((c) => c.title === 'Prices')!.body;
    expect(prices).toContain('Checked regularly');
    expect(prices).toContain('own public listings and feeds');
    expect(prices).toContain('where the shop states it');
  });

  it('keeps the YannySniffs lines as they were: who runs it, TikTok and Instagram', () => {
    expect(ABOUT.whoRuns).toContain(`${COMPANY.operator} runs PriceSniffs, trading as ${COMPANY.legalName}.`);
    expect(ABOUT.whoRuns).toContain('I also post about fragrance on');
    expect(ABOUT.whoRuns).toContain('https://www.tiktok.com/@yannysniffs');
    expect(ABOUT.whoRuns).toContain('https://www.instagram.com/yannysniffs');
  });

  it('follows the house style: no dashes and no hyphenated words', () => {
    const prose = proseOf(copy);
    expect(prose).not.toMatch(/[–—]/);
    expect(prose.match(/[A-Za-z]-[A-Za-z]+/g) ?? []).toEqual([]);
  });
});
