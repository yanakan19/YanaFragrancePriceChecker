/**
 * Offline audit of every Fragrantica link the built site shows.
 *
 *   npx tsx scripts/audit-fragrantica-links.ts              # print the summary
 *   npx tsx scripts/audit-fragrantica-links.ts --write      # also write data/fragrantica-link-audit.json
 *   npx tsx scripts/audit-fragrantica-links.ts --write --out=/tmp/x.json   # write somewhere else (to compare runs)
 *
 * For every product on the page it asks `fragranceLinksFor` (the exact call the
 * page makes) what the "Fragrantica" pill points at, then classifies the URL by
 * shape and, for a direct page, checks that the designer and perfume name in the
 * URL are the product's. No network: nothing here asks Fragrantica anything.
 * See docs/FRAGRANTICA-LINK-AUDIT-2026-10-05.md for what it found.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { fragranceLinksFor } from '../demo/fragranceLinks.js';
import { fragranceBaseKey, fragranceLinkKey } from '../src/catalogue/fragranceLinkMatch.js';
import type { LinksFile } from '../src/catalogue/fragranceLinkStore.js';
import { auditFragranticaLink, classifyFragranticaUrl, type LinkClass } from '../src/catalogue/fragranticaAudit.js';
import { indexReview, NO_REVIEW_INDEX, parseReview } from '../src/catalogue/fragranticaReview.js';
import { writeGenerated } from './generatedFiles.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_PATH = resolve(ROOT, 'data/fragrantica-link-review.json');
const REVIEW = existsSync(REVIEW_PATH) ? indexReview(parseReview(readFileSync(REVIEW_PATH, 'utf8'))) : NO_REVIEW_INDEX;
const LINKS = JSON.parse(readFileSync(resolve(ROOT, 'data/fragrance-links.json'), 'utf8')) as LinksFile;

/** The links-file entry a product's Fragrantica link came from: its own key, else the brand|name "base" entry. */
function sourceEntry(brand: string, name: string, concentration: string, fragrantica: string) {
  const own = LINKS.entries[fragranceLinkKey(brand, name, concentration)];
  if (own?.fragrantica && own.fragrantica.includes(fragrantica.replace(/^https:\/\/www\.fragrantica\.com/, ''))) {
    return { key: fragranceLinkKey(brand, name, concentration), entry: own };
  }
  const bk = fragranceBaseKey(brand, name);
  for (const key of Object.keys(LINKS.entries).sort()) {
    if (!key.startsWith(`${bk}|`)) continue;
    const e = LINKS.entries[key]!;
    if (e.fragrantica === fragrantica && e.fragranticaMatch === 'base') return { key, entry: e };
  }
  return null;
}

export interface AuditRow {
  id: string;
  brand: string;
  name: string;
  size: string;
  concentration: string;
  gender: string;
  class: LinkClass;
  url: string;
  found: string;
  verdict: string;
}

const rows: AuditRow[] = [];
for (const f of DEMO_FRAGRANCES) {
  const links = fragranceLinksFor(f.brand, f.name, f.concentration);
  const cls = classifyFragranticaUrl(links.fragranticaUrl);
  let found = 'fallback-search';
  let verdict = 'n/a (search link)';
  if (links.fragranticaDirect) {
    const src = sourceEntry(f.brand, f.name, f.concentration, links.fragranticaUrl);
    found = src ? `${src.entry.method.fragrantica ?? 'unknown'} (${src.entry.fragranticaMatch ?? '?'})` : 'unknown (no entry)';
    const a = auditFragranticaLink(links.fragranticaUrl, { brand: f.brand, name: f.name, concentration: f.concentration, gender: f.gender }, REVIEW);
    verdict = a.verdict + (a.reasons.length ? `: ${a.reasons.join('; ')}` : '');
  } else if (cls !== 'search') {
    verdict = `WRONG: fallback is ${cls}`;
  }
  rows.push({
    id: f.id,
    brand: f.brand,
    name: f.name,
    size: f.sizeMl === null ? '' : `${f.sizeMl}ml`,
    concentration: f.concentration,
    gender: f.gender ?? '',
    class: cls,
    url: links.fragranticaUrl,
    found,
    verdict,
  });
}

const count = (key: (r: AuditRow) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
console.log(`products: ${rows.length}`);
console.log('by class', count((r) => r.class));
console.log('direct by how found', count((r) => (r.class === 'direct' ? r.found : '')).filter(([k]) => k));
console.log('direct by verdict', count((r) => (r.class === 'direct' ? r.verdict.split(':')[0]! : '')).filter(([k]) => k));

if (process.argv.includes('--write')) {
  // One product per line so a rerun's diff shows the products that changed.
  const body = rows.map((r) => JSON.stringify(r)).join(',\n');
  const out = `{"generatedAt":${JSON.stringify(LINKS.generatedAt)},"products":${rows.length},"rows":[\n${body}\n]}\n`;
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  if (outArg) {
    writeFileSync(resolve(outArg.slice('--out='.length)), out);
    console.log(`wrote ${outArg.slice('--out='.length)}`);
  } else {
    writeGenerated(ROOT, 'data/fragrantica-link-audit.json', out);
    console.log('wrote data/fragrantica-link-audit.json');
  }
}
