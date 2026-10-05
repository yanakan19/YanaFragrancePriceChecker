import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { NOTE_INDEX } from '../demo/data.js';
import { NOTE_SORT_OPTIONS, sortNotes } from '../demo/listSort.js';
import { launchChromium, startDemoServer, waitForApp } from '../scripts/a11y-audit.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const built = existsSync(resolve(root, 'demo/index.html'));

/**
 * The Notes tab revamp (owner request, 2026-10-04): the "Note Groups" and
 * "Browse Alphabetically" texts are gone, and the list can be sorted Z to A.
 */
const REMOVED = [/Notes? Groups?/i, /Browse Alphabetically/i];

describe('Explore Notes sort', () => {
  it('offers Most to Least Used, A to Z and Z to A, in that order', () => {
    expect(NOTE_SORT_OPTIONS).toEqual([
      { value: 'common', label: 'Most to Least Used' },
      { value: 'az', label: 'A to Z' },
      { value: 'za', label: 'Z to A' },
    ]);
  });

  it('puts the last note of A to Z first in Z to A, and reverses the whole list', () => {
    const az = sortNotes(NOTE_INDEX, 'az').map((n) => n.name);
    const za = sortNotes(NOTE_INDEX, 'za').map((n) => n.name);
    expect(az.length).toBe(NOTE_INDEX.length);
    expect(az.length).toBeGreaterThan(100);
    expect(za[0]).toBe(az[az.length - 1]);
    expect(za[za.length - 1]).toBe(az[0]);
    expect(za).toEqual([...az].reverse());
  });

  it('keeps every note, whatever the order', () => {
    const names = (s: 'common' | 'az' | 'za') => sortNotes(NOTE_INDEX, s).map((n) => n.name).sort();
    expect(names('az')).toEqual(names('common'));
    expect(names('za')).toEqual(names('common'));
  });

  it('does not change the list it is given', () => {
    const list = [{ name: 'b', count: 1 }, { name: 'a', count: 2 }, { name: 'c', count: 3 }];
    sortNotes(list, 'za');
    expect(list.map((n) => n.name)).toEqual(['b', 'a', 'c']);
  });

  it('ranks Most to Least Used by count, then name', () => {
    const list = [{ name: 'b', count: 2 }, { name: 'a', count: 2 }, { name: 'c', count: 5 }];
    expect(sortNotes(list, 'common').map((n) => n.name)).toEqual(['c', 'a', 'b']);
  });
});

describe('the removed Notes texts', () => {
  const sources = ['demo/app.ts', 'demo/template.html'].map((f) => [f, readFileSync(resolve(root, f), 'utf8')] as const);

  for (const [file, text] of sources) {
    it(`${file} does not contain them`, () => {
      for (const re of REMOVED) expect(text, `${file} ${re}`).not.toMatch(re);
    });
  }

  it('the layer chips replace the old cards and carry no heading class', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    expect(app).not.toContain('note-group-card');
    expect(app).not.toContain('notes-groups');
    expect(app).not.toContain('section-label');
  });

  it.skipIf(!built)('the built page does not contain them', () => {
    for (const f of ['demo/index.html', 'demo/404.html']) {
      const text = readFileSync(resolve(root, f), 'utf8');
      for (const re of REMOVED) expect(text, `${f} ${re}`).not.toMatch(re);
    }
  });
});

describe.skipIf(!built)('the Notes tab on the built page', () => {
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

  it('shows neither text, sorts Z to A, keeps the choice on Back, and opens a note page', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`http://127.0.0.1:${port}/notes`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForSelector('#note-sort', { timeout: 120_000 });

      const rows = async (): Promise<string[]> =>
        (await page.evaluate(`[...document.querySelectorAll('#view .note-row')].map((b) => b.getAttribute('data-note'))`)) as string[];
      const shown = async (): Promise<string> => (await page.evaluate(`document.querySelector('#view').innerText`)) as string;

      for (const re of REMOVED) expect(await shown()).not.toMatch(re);
      expect(await page.textContent('.control-lead')).toBe('Sort By:');
      const options = (await page.evaluate(`[...document.querySelector('#note-sort').options].map((o) => o.textContent)`)) as string[];
      expect(options).toEqual(['Most to Least Used', 'A to Z', 'Z to A']);

      await page.selectOption('#note-sort', 'az');
      const az = await rows();
      await page.selectOption('#note-sort', 'za');
      const za = await rows();
      for (const re of REMOVED) expect(await shown()).not.toMatch(re);
      expect(za.length).toBe(az.length);
      expect(za[0]).toBe(az[az.length - 1]);
      expect(za[za.length - 1]).toBe(az[0]);
      // No scrubber strip under Z to A: its letters run the other way.
      expect(await page.locator('.alpha-scrubber').count()).toBe(0);

      // Open the first note, then Back: the list is still Z to A.
      const first = za[0]!;
      await page.click(`#view .note-row[data-note="${first.replace(/"/g, '\\"')}"]`);
      await page.waitForSelector('[data-back-explore]', { timeout: 30_000 });
      expect(await page.locator('#view h1').count()).toBe(1);
      expect(await page.locator('#view [data-frag]').count()).toBeGreaterThan(0);
      await page.goBack();
      await page.waitForSelector('#note-sort');
      expect(await page.inputValue('#note-sort')).toBe('za');
    } finally {
      await page.close();
    }
  }, 240_000);
});
