import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import AxeBuilder from '@axe-core/playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';
import { stubSupabase, type FakeAccount } from './support/fakeAccount.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The owner's sort rule (2026-10-04) on the built page: every sort control
 * shows "Sort By:" in the box in the closed state, every option names both
 * ends of its order, the control's accessible name has "Sort By" once, and
 * the longest option fits at 320, 390 and 1280px wide, in both palettes.
 *
 * "Fits" is measured, not assumed: sideways overflow is clipped at the page
 * root (see the `overflow-x: clip` note in demo/template.html), so a page
 * scrollWidth check alone cannot see a label cut off inside its box. The
 * widest option is measured in the select's own font against the room the
 * select has.
 */
const READER: FakeAccount = {
  email: 'reader@example.com',
  createdAt: '2026-09-20T10:00:00Z',
  wishlist: [
    // saved_price_gbp is what makes the third wishlist sort, Biggest to Smallest Drop, appear.
    { fragrance_id: 'ean-6290360375687', target_price_gbp: 30, added_at: '2026-10-01T09:00:00Z', saved_price_gbp: 80 },
    { fragrance_id: 'ean-3349668508587', target_price_gbp: null, added_at: '2026-10-03T09:00:00Z', saved_price_gbp: 60 },
  ],
  priceAlerts: true,
};

/** Every page that has a sort, and the control ids that must be on it. */
const PAGES: { route: string; ids: string[]; account?: boolean }[] = [
  { route: '/search', ids: ['browse-sort'] },
  { route: '/sets', ids: ['tab-sort'] },
  { route: '/oils', ids: ['tab-sort'] },
  { route: '/deals', ids: ['deal-sort'] },
  { route: '/brands', ids: ['brand-sort'] },
  { route: '/notes', ids: ['note-sort'] },
  { route: '/brands/sol-de-janeiro', ids: ['brand-detail-sort'] },
  { route: '/notes/vanilla', ids: ['note-detail-sort'] },
  { route: '/retailers/fragrance-click', ids: ['retailer-detail-sort'] },
  { route: '/account/wishlist', ids: ['wishlist-sort'], account: true },
];

type Mode = 'light' | 'dark';

interface Seen {
  id: string;
  lead: string;
  selected: string;
  options: string[];
  widest: number;
  room: number;
  right: number;
  name: string;
}

describe.skipIf(!built)('every sort control on the built page', () => {
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

  async function open(route: string, width: number, mode: Mode, account: boolean): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript((m: string) => {
      try { localStorage.setItem('pricesniffs.display', m); } catch { /* fine */ }
    }, mode);
    if (account) await stubSupabase(context, READER, null);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load' });
    await waitForApp(page);
    await page.waitForSelector('select[id$="-sort"]', { timeout: 20_000 });
    await page.waitForTimeout(300);
    return { context, page };
  }

  async function seen(page: Page): Promise<{ doc: number; vw: number; sorts: Seen[] }> {
    const base = (await page.evaluate(`(() => {
      const out = [];
      for (const sel of document.querySelectorAll('select[id$="-sort"]')) {
        const label = sel.closest('label');
        const cs = getComputedStyle(sel);
        const ctx = document.createElement('canvas').getContext('2d');
        ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        out.push({
          id: sel.id,
          lead: label.querySelector('.control-lead')?.textContent ?? '',
          selected: sel.options[sel.selectedIndex].textContent,
          options: Array.from(sel.options).map((o) => o.textContent),
          widest: Math.max(...Array.from(sel.options).map((o) => ctx.measureText(o.textContent).width)),
          room: sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
          right: label.getBoundingClientRect().right,
        });
      }
      return { doc: document.documentElement.scrollWidth, vw: innerWidth, sorts: out };
    })()`)) as { doc: number; vw: number; sorts: Omit<Seen, 'name'>[] };
    const sorts: Seen[] = [];
    for (const s of base.sorts) {
      // The accessible name, as Chromium computes it: `combobox "Sort By: Fragrances"`.
      const snap = await page.locator(`#${s.id}`).ariaSnapshot();
      sorts.push({ ...s, name: /combobox "([^"]*)"/.exec(snap)?.[1] ?? snap });
    }
    return { ...base, sorts };
  }

  function check(route: string, ids: string[], got: { doc: number; vw: number; sorts: Seen[] }): void {
    expect(got.sorts.map((s) => s.id), `${route}: sort controls`).toEqual(ids);
    expect(got.doc, `${route}: no sideways scroll`).toBeLessThanOrEqual(got.vw);
    for (const s of got.sorts) {
      const where = `${route} #${s.id}`;
      // Closed state: the box reads "Sort By: <the chosen order>".
      expect(s.lead, where).toBe('Sort By:');
      expect(`${s.lead} ${s.selected}`, where).toMatch(/^Sort By: \S.* to \S/);
      // Every option names both ends and none repeats the prefix.
      for (const o of s.options) {
        expect(o, `${where}: ${o}`).toMatch(/^[A-Z]\S*( [A-Za-z]\S*)* to [A-Z]\S*( [A-Z]\S*)*$/);
        expect(o).not.toMatch(/[-‐-―−]|^Sort/);
      }
      // "Sort By" is read once, and the name starts with the visible words.
      expect(s.name, where).toMatch(/^Sort By: \S/);
      expect(s.name.match(/sort/gi) ?? [], `${where}: "${s.name}" says sort once`).toHaveLength(1);
      // Not cut off: the widest option fits the room the select has.
      expect(s.widest, `${where}: widest option ${Math.round(s.widest)}px in ${Math.round(s.room)}px`).toBeLessThanOrEqual(s.room);
      expect(s.right, `${where}: inside the screen`).toBeLessThanOrEqual(got.vw);
    }
  }

  for (const width of [320, 390, 1280]) {
    // The Notes directory takes over a minute to draw, so it is checked once, on a phone.
    for (const { route, ids, account } of PAGES.filter((p) => p.route !== '/notes' || width === 390)) {
      it(`${route} at ${width}px: Sort By on every sort, both ends named, nothing cut off`, async () => {
        const { context, page } = await open(route, width, 'light', !!account);
        try {
          check(route, ids, await seen(page));
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }

  // Colour contrast differs between the palettes, so axe runs in both, on the
  // three widths, for a page of each kind of control: the browse sort, the
  // deals sort with its own icon, and the wishlist's with all three options.
  for (const mode of ['light', 'dark'] as const) {
    for (const width of [320, 390, 1280]) {
      for (const { route, ids, account } of PAGES.filter((p) => ['/search', '/deals', '/account/wishlist', '/sets', '/oils'].includes(p.route))) {
        it(`${route} at ${width}px (${mode}): axe passes, no sideways scroll`, async () => {
          const { context, page } = await open(route, width, mode, !!account);
          try {
            check(route, ids, await seen(page));
            const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze();
            const summary = r.violations.map((v) => `[${v.impact}] ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
            expect(summary).toEqual([]);
          } finally {
            await context.close();
          }
        }, 90_000);
      }
    }
  }

  it('the wishlist offers all three orders once a row has a change to rank, with the drop last', async () => {
    const { context, page } = await open('/account/wishlist', 1280, 'light', true);
    try {
      const got = await seen(page);
      expect(got.sorts[0]!.options).toEqual(['Newest to Oldest Saved', 'Lowest to Highest Price', 'Biggest to Smallest Drop']);
    } finally {
      await context.close();
    }
  }, 90_000);
});
