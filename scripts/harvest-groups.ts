/**
 * Balances the sweep's groups from the last sweep's report
 * (src/catalogue/harvestGroups.ts says why there are groups).
 *
 *   npx tsx scripts/harvest-groups.ts            show the balance of the table now and of a fresh split
 *   npx tsx scripts/harvest-groups.ts --write    rewrite HARVEST_GROUP_PLAN in src/catalogue/harvestGroups.ts
 *
 * Time per shop comes from data/harvest-report.json: the `seconds` each shop
 * reports, or for an older report the time rebuilt from when shops finished.
 * Moving a shop between groups is safe (the cursor is per shop) but do it
 * rarely: a shop moved while a crawl is running is asked by the old and the new
 * group in that one run, and the merge keeps the owning group's copy.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HARVEST_GROUPS, HARVEST_GROUP_PLAN, balancedPlan, groupSeconds, shopSecondsFromReport, sweepableShops,
} from '../src/catalogue/harvestGroups.js';
import type { HarvestReport } from '../src/catalogue/harvestReport.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'src/catalogue/harvestGroups.ts');
const report = JSON.parse(readFileSync(resolve(root, 'data/harvest-report.json'), 'utf8')) as HarvestReport;
const seconds = shopSecondsFromReport(report);
const plan = balancedPlan(seconds);

const show = (label: string, p: Record<string, readonly [number, number]>): void => {
  const totals = groupSeconds(p);
  const sum = totals.reduce((a, b) => a + b, 0);
  console.log(`${label}: ${totals.map((t, g) => `group ${g} ${(t / 60).toFixed(0)} min`).join(', ')} (${((Math.max(...totals) / sum - 1 / HARVEST_GROUPS) * 100).toFixed(1)} points over an even split)`);
};
show('table now  ', HARVEST_GROUP_PLAN);
show('fresh split', plan);

if (process.argv.includes('--write')) {
  const ids = sweepableShops().map((r) => r.id).sort();
  const lines = ids.map((id) => `  ${/^[a-z_][a-z0-9_]*$/.test(id) ? id : `'${id}'`}: [${plan[id]![0]}, ${plan[id]![1]}],`);
  const src = readFileSync(file, 'utf8');
  const next = src.replace(
    /(export const HARVEST_GROUP_PLAN: Readonly<Record<string, readonly \[group: number, seconds: number\]>> = )\{[\s\S]*?\};/,
    (_m, head: string) => `${head}{\n${lines.join('\n')}\n};`,
  );
  if (next === src && ids.length > 0) console.log('The table already holds this split.');
  writeFileSync(file, next);
  console.log(`wrote ${ids.length} shops to src/catalogue/harvestGroups.ts`);
}
