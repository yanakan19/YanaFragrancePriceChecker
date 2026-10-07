/**
 * Import product or listing pages saved by hand into a shop's catalogue.
 *
 *   npm run catalogue:import-pages -- --shop=notino-uk
 *   npm run catalogue:import-pages -- --shop=notino-uk --dir=some/folder
 *   npm run catalogue:import-pages -- --shop=notino-uk --dry-run
 *
 * For a shop whose site refuses our crawler. The owner opens a page in their
 * own browser, saves its source into data/manual-pages/<shopId>/, and this
 * reads the files and adds or refreshes that shop's listings in
 * data/catalogue/<shopId>.json, as a crawl would. It reads files on disk and
 * makes no network request of any kind. A saved file that is a bot challenge
 * page is refused. See src/catalogue/importPages.ts for the rules, and
 * docs/OWNER-STEPS.md for how to save a page.
 *
 * Exit code 1 when nothing could be imported, so a mistake is not silent.
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETAILERS } from '../src/config/retailers.js';
import { importPages, type FileReport } from '../src/catalogue/importPages.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function describe(r: FileReport): string[] {
  const lines: string[] = [];
  if (r.status === 'refused') return [`  REFUSED  ${r.file}: ${r.reason}`];
  const when = r.capturedAt ? `captured ${r.capturedAt} (from ${r.capturedFrom === 'header' ? 'its saved comment' : 'the file time'})` : '';
  lines.push(`  ${r.status === 'imported' ? 'ok     ' : 'NOTHING'}  ${r.file}: ${r.listingsFound} listing(s), ${when}`);
  if (r.reason) lines.push(`           ${r.reason}`);
  if (r.canonicalUrl) lines.push(`           page address ${r.canonicalUrl}`);
  if (r.stats) {
    const s = r.stats;
    lines.push(
      `           ${s.added} new, ${s.refreshed} refreshed, ${s.olderThanStored} older than what is stored, ${s.unpriced} unpriced left out`,
    );
  }
  if (r.missing && r.listingsFound > 0) {
    const gaps = Object.entries(r.missing).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`);
    lines.push(`           missing on some: ${gaps.length ? gaps.join(', ') : 'nothing'}`);
  }
  for (const n of r.notes) lines.push(`           note: ${n}`);
  return lines;
}

function main(): number {
  const shopId = arg('shop');
  if (!shopId) {
    console.error('usage: npm run catalogue:import-pages -- --shop=<id> [--dir=<folder>] [--dry-run]');
    return 2;
  }
  const shop = RETAILERS.find((r) => r.id === shopId);
  if (!shop) {
    console.error(`No shop with id "${shopId}" in src/config/retailers.ts.`);
    return 2;
  }
  const dir = resolve(arg('dir') ?? resolve(root, 'data/manual-pages', shop.id));
  if (!existsSync(dir)) {
    console.error(`No folder at ${dir}. Save the pages there first (docs/OWNER-STEPS.md).`);
    return 2;
  }
  const dryRun = process.argv.includes('--dry-run');

  const result = importPages({ shop, dir, catalogueDir: resolve(root, 'data/catalogue'), dryRun });
  console.log(`${shop.name}: ${result.files.length} saved file(s) in ${dir}${dryRun ? ' (dry run, nothing written)' : ''}`);
  for (const r of result.files) for (const line of describe(r)) console.log(line);

  const imported = result.files.filter((f) => f.status === 'imported').length;
  const refused = result.files.filter((f) => f.status === 'refused').length;
  if (refused > 0) console.log(`::warning::${refused} file(s) refused; see above. Nothing was fetched to replace them.`);
  console.log(
    result.written
      ? `Wrote data/catalogue/${shop.id}.json. Run npm run rebuild to refresh the generated files.`
      : `data/catalogue/${shop.id}.json left unchanged.`,
  );
  return imported > 0 ? 0 : 1;
}

process.exit(main());
