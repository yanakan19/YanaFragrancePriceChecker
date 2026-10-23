import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { liveCounts, liveShopIds, shopsShowingPrices } from '../demo/data.js';
import { COVERAGE, legalNoticeSections, legalPage } from '../demo/legal.js';
import { shopsPhrase } from '../demo/head.js';
import { RETAILERS } from '../src/config/retailers.js';

/** Reader-facing text of the Legal Notice. */
const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('one shop count on every page', () => {
  it('About, the page descriptions and the home page all count the same set', () => {
    expect(liveCounts().shops).toBe(shopsShowingPrices());
    expect(liveShopIds().size).toBe(shopsShowingPrices());
    expect(COVERAGE).toBe(shopsPhrase(shopsShowingPrices()));
  });

  it('only switched on shops are counted', () => {
    const enabled = new Set(RETAILERS.filter((r) => r.enabled).map((r) => r.id));
    for (const id of liveShopIds()) expect(enabled.has(id), id).toBe(true);
    expect(shopsShowingPrices()).toBeLessThanOrEqual(enabled.size);
  });

  it('the Legal Notice states the same number as About, never the switched on count', () => {
    const n = shopsShowingPrices();
    const notice = text(legalNoticeSections().map((s) => s.body).join(' ') + (legalPage('how-it-works')?.body ?? ''));
    expect(notice).toContain(`Of the ${n} shops showing prices today`);
    expect(notice).toContain(`${n} shops we fetch from`);
    const enabledOnly = RETAILERS.filter((r) => r.enabled).length;
    if (enabledOnly !== n) {
      expect(notice).not.toContain(`Of the ${enabledOnly} shops`);
      expect(notice).not.toContain(`${enabledOnly} shops we fetch from`);
    }
    expect(legalPage('how-it-works')).toBeDefined();
  });

  it('no page source types a shop count in digits', () => {
    for (const file of ['demo/legal.ts', 'demo/app.ts', 'demo/head.ts', 'demo/marquee.ts']) {
      const code = readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
      expect(code, file).not.toMatch(/\b[1-9][0-9] (UK )?shops\b/);
    }
  });
});
