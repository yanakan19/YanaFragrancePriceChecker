/**
 * Measures how long a filter change takes on the biggest lists, on a slow
 * phone: the time from a tap on an option in the Filters panel to the list,
 * the address and the open panel all being drawn again, layout included.
 *
 *   npm run demo                  # must run first
 *   npm run perf:filters          # median of 12 changes per list
 *
 * Pixel 7 viewport, CPU slowed 4x through CDP, the setting every load figure in
 * scripts/measure-load.ts is taken at. Each change is timed inside the page:
 * the click (whose change event draws everything synchronously) and a forced
 * layout, so the figure is the whole of the work the tap costs.
 *
 * The revamp of 6 Oct 2026, measured both ways in turn on one machine (median
 * of 12 changes, two runs each). Before: one value per filter in native
 * dropdowns drawn inside the list. After: several values, the panel open and
 * drawn again on every change, the address written each time, and Brand and
 * Shop added to the shared lists. Faster all the same, from asking each filter
 * once per item, a cheaper per minute cache, and keeping the lists that do not
 * change while filtering (Most Stocked, a search, Deals) instead of making them
 * again on every change:
 *
 *                                    before        after
 *   /search (Most Stocked, 16,400)   153, 164 ms   100, 109 ms
 *   /search?q=e (26,403)             167, 178 ms   103, 129 ms
 *   /deals                            79,  85 ms    61,  69 ms
 *   /sets (2,463)                    124, 129 ms    82,  83 ms
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices } from 'playwright';
import { launchChromium, startDemoServer, waitForApp } from './a11y-audit.js';
import { optionInputId } from '../demo/filterUi.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Each list, and the options ticked and unticked in turn: two filters on, then both off again. */
const SCENARIOS: { path: string; steps: [string, string][] }[] = [
  { path: '/search', steps: [['size', '70-120'], ['price', '25-50'], ['size', '70-120'], ['price', '25-50']] },
  { path: '/search?q=e', steps: [['size', '70-120'], ['price', '25-50'], ['size', '70-120'], ['price', '25-50']] },
  { path: '/deals', steps: [['size', '70-120'], ['price', '25-50'], ['size', '70-120'], ['price', '25-50']] },
  { path: '/sets', steps: [['type', 'designer'], ['price', '25-50'], ['type', 'designer'], ['price', '25-50']] },
];

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function main(): Promise<void> {
  if (!existsSync(resolve(root, 'demo/index.html'))) throw new Error('demo/index.html does not exist — run `npm run demo` first.');
  const { port, close } = await startDemoServer();
  const browser = await launchChromium();
  try {
    console.log('Pixel 7 viewport, CPU 4x slower, median and slowest of 12 changes');
    for (const s of SCENARIOS) {
      const ctx = await browser.newContext({ ...devices['Pixel 7'] });
      await ctx.route((u) => u.hostname !== '127.0.0.1', (r) => r.abort());
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}${s.path}`, { waitUntil: 'load' });
      await waitForApp(page);
      await page.waitForTimeout(500);
      await page.click('#view [data-facets-toggle]');
      await page.waitForSelector('#ps-filters[open]');
      // Every group open, so each option can be reached without a step that is not a change.
      for (const facet of new Set(s.steps.map(([f]) => f))) {
        if (!(await page.$(`[data-fs-facet="${facet}"]`))) await page.click(`#fs-sum-${facet}`);
      }
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const times: number[] = [];
      for (let round = 0; round < 3; round++) {
        for (const [facet, value] of s.steps) {
          const ms = (await page.evaluate(`(() => {
            const el = document.getElementById(${JSON.stringify(optionInputId(facet, value))});
            if (!el) return -1;
            const t0 = performance.now();
            el.click();
            document.body.getBoundingClientRect();
            return performance.now() - t0;
          })()`)) as number;
          if (ms >= 0) times.push(ms);
          await page.waitForTimeout(150);
        }
      }
      console.log(`${s.path.padEnd(14)} median ${median(times).toFixed(0)} ms   slowest ${Math.max(...times).toFixed(0)} ms   (${times.length} changes)`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
