import { describe, expect, it } from 'vitest';
import { COMPANY, LEGAL_PAGES, STORAGE_KEYS, legalPage } from '../demo/legal.js';
import { RETAILERS } from '../src/config/retailers.js';

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
    // contact page is where the business details live. An id here is also a
    // public URL (/legal/<id>) and a footer entry, so renaming one is a
    // broken link, not a refactor.
    for (const id of ['about', 'how-it-works', 'affiliate', 'privacy', 'cookies', 'refunds', 'terms', 'contact']) {
      expect(legalPage(id), `missing legal page: ${id}`).toBeDefined();
    }
  });

  it('every policy page says when it was last updated', () => {
    for (const page of LEGAL_PAGES) {
      if (page.id === 'about' || page.id === 'how-it-works' || page.id === 'contact') continue;
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

  it('the privacy notice says where chat messages go, since they do leave the browser', () => {
    const body = legalPage('privacy')!.body;
    expect(body).toContain(COMPANY.chatHost);
    expect(body).toContain(COMPANY.chatProvider);
    expect(body).toContain(COMPANY.accountsProvider);
    // The sentence that stopped being true on 2026-08-13 must not come back.
    expect(body).not.toMatch(/nothing you do inside the app[^.]*is sent anywhere/i);
  });

  it('the cookies page lists every key the app writes, by its real name', () => {
    const body = legalPage('cookies')!.body;
    for (const s of STORAGE_KEYS) expect(body).toContain(s.key);
    // The three preference keys are the ones demo/app.ts actually uses.
    for (const key of ['pricesniffs.display', 'pricesniffs.layout', 'pricesniffs.perrow', 'pricesniffs.yanny.thread']) {
      expect(STORAGE_KEYS.map((s) => s.key)).toContain(key);
    }
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
