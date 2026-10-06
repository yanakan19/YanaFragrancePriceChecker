import type { Page } from 'playwright';
import { SHEET_ID, optionInputId } from '../../demo/filterUi.js';

/**
 * Driving a list's Filters panel (demo/filterUi.ts, demo/app.ts) from a browser
 * test the way a reader does: the Filters button, a group heading to open a
 * shut group, a tap on an option's checkbox, Escape to close.
 */

export const isSheetOpen = (page: Page): Promise<boolean> =>
  page.evaluate(`!!(document.getElementById(${JSON.stringify(SHEET_ID)}) || {}).open`) as Promise<boolean>;

export async function openFilters(page: Page): Promise<void> {
  if (await isSheetOpen(page)) return;
  await page.click('#view [data-facets-toggle]');
  await page.waitForSelector(`#${SHEET_ID}[open]`);
}

/** Ticks or unticks one option, opening its group first if it is shut. Leaves the panel open. */
export async function tick(page: Page, facet: string, value = '1'): Promise<void> {
  await openFilters(page);
  const id = optionInputId(facet, value);
  if (!(await page.$(`#${id}`))) await page.click(`#fs-sum-${facet}`);
  await page.waitForSelector(`#${id}`);
  await page.click(`#${id}`);
}

export async function closeFilters(page: Page): Promise<void> {
  if (!(await isSheetOpen(page))) return;
  await page.keyboard.press('Escape');
  await page.waitForFunction(`!document.getElementById(${JSON.stringify(SHEET_ID)}).open`);
}

/** The chips under the controls row, as "filter=value". */
export const chips = (page: Page): Promise<string[]> =>
  page.evaluate(`[...document.querySelectorAll('#view [data-filter-remove]')].map((b) => b.dataset.filterRemove + '=' + b.dataset.value)`) as Promise<string[]>;

/** One filter's options in the open panel: value, whether ticked, and the count beside it. */
export async function panelOptions(page: Page, facet: string): Promise<{ value: string; checked: boolean; count: number }[]> {
  await openFilters(page);
  if (!(await page.$(`#${SHEET_ID} input[data-fs-facet="${facet}"]`)) && (await page.$(`#fs-sum-${facet}`))) await page.click(`#fs-sum-${facet}`);
  return (await page.evaluate(`[...document.querySelectorAll('#${SHEET_ID} input[data-fs-facet="${facet}"]')].map((i) => ({
    value: i.value,
    checked: i.checked,
    count: Number(i.closest('.fs-opt').querySelector('.fs-opt-count').textContent.replace(/\\D/g, '')),
  }))`)) as { value: string; checked: boolean; count: number }[];
}
