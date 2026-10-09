import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchUkNotes, matchUkPhotos, type UkPhotoSource } from '../src/catalogue/regionUkPhotos.js';
import { buildRegionSite, type RegionInputs } from '../scripts/regionSite.js';
import { REGION_RETAILERS } from '../src/config/regionRetailers.js';
import type { RegionSnapshot } from '../src/catalogue/regionHarvest.js';
import { referencedDataFiles } from '../scripts/dataFiles.js';
import { REPO_ROOT } from '../scripts/generatedFiles.js';
import { noteMergeKey } from '../src/catalogue/noteName.js';
import { matchRoute } from '../demo/router.js';
import { prepareNoteIcons } from '../src/catalogue/noteIconLookup.js';
import { prepareNotesData } from '../demo/notesData.js';

/**
 * UK notes on matching US and India products (owner instruction, 9 Oct 2026;
 * docs/INTERNATIONAL-PLAN.md "UK notes on matching region products"): the same
 * match as the UK picture, the notes as the UK page shows them (alias folded)
 * with the UK shop credited, nothing for a product with no UK match, and no UK
 * file touched. The last block reads the built site (`npm run demo` first).
 */

const NOTES = {
  top: ['Bergamot'], middle: ['Rose'], base: ['Musk'],
  source: { retailerId: 'escentual', url: 'https://escentual.example/aventus' },
};
const uk = (over: Partial<UkPhotoSource> & { id: string }): UkPhotoSource => ({
  brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', sizeMl: 100, ean: null,
  image: 'https://uk-shop.example/aventus.jpg', notes: NOTES, ...over,
});
const region = (over: Record<string, unknown> & { id: string }) => ({
  kind: 'bottle' as const, brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', sizeMl: 100, ean: null as string | null, ...over,
});

describe('which region products take UK notes', () => {
  it('gives a barcode matched and a name matched bottle the UK notes and where they were read', () => {
    const byCode = matchUkNotes([region({ id: 'ean-111' })], [uk({ id: 'ean-111' })]);
    expect(byCode.get('ean-111')).toEqual({ ukId: 'ean-111', by: 'barcode', top: ['Bergamot'], middle: ['Rose'], base: ['Musk'], source: NOTES.source });
    const byName = matchUkNotes([region({ id: 'in-1', brand: 'CREED' })], [uk({ id: 'ean-5' })]);
    expect(byName.get('in-1')).toMatchObject({ ukId: 'ean-5', by: 'name' });
  });

  it('gives an unmatched product, and a match whose UK product has no notes, nothing', () => {
    expect(matchUkNotes([region({ id: 'ean-222', name: 'Other' }), region({ id: 'x-9', name: 'Other' })], [uk({ id: 'ean-111' })]).size).toBe(0);
    expect(matchUkNotes([region({ id: 'ean-111' })], [uk({ id: 'ean-111', notes: null })]).size).toBe(0);
    expect(matchUkNotes([region({ id: 'ean-111' })], [uk({ id: 'ean-111', notes: { top: [], middle: [], base: [], source: null } })]).size).toBe(0);
  });

  it('uses exactly the rules of the UK picture: the same bottle, never a set, oil, other size or strength, or an ambiguous name', () => {
    const cases: [string, ReturnType<typeof region>[], UkPhotoSource[]][] = [
      ['set', [region({ id: 'ean-1', kind: 'set' })], [uk({ id: 'ean-1' })]],
      ['UK set', [region({ id: 'ean-1' })], [uk({ id: 'ean-1', giftSet: {} })]],
      ['UK oil', [region({ id: 'ean-1' })], [uk({ id: 'ean-1', oil: {} })]],
      ['size', [region({ id: 'ean-1', sizeMl: 50 })], [uk({ id: 'ean-1' }), uk({ id: 'ean-2', sizeMl: 50 })]],
      ['strength', [region({ id: 'ean-1', concentration: 'Eau de Toilette' })], [uk({ id: 'ean-1' })]],
      ['ambiguous', [region({ id: 'a' })], [uk({ id: 'ean-5' }), uk({ id: 'ean-6' })]],
      ['barcodes disagree', [region({ id: 'a', ean: '0885000000001' })], [uk({ id: 'ean-5', ean: '3000000000002' })]],
      ['not stated', [region({ id: 'a', concentration: null })], [uk({ id: 'ean-5', concentration: 'Not stated' })]],
      ['lender', [region({ id: 'a' })], [uk({ id: 'ean-5' })]],
      ['barcode', [region({ id: 'ean-1' })], [uk({ id: 'ean-1' })]],
    ];
    for (const [label, products, ukList] of cases) {
      expect([...matchUkNotes(products, ukList).keys()], label).toEqual([...matchUkPhotos(products, ukList).keys()]);
    }
  });

  it('matches a bottle by notes even when the UK listing has no picture, and by picture even with no notes', () => {
    expect(matchUkNotes([region({ id: 'ean-1' })], [uk({ id: 'ean-1', image: null })]).size).toBe(1);
    expect(matchUkPhotos([region({ id: 'ean-1' })], [uk({ id: 'ean-1', notes: null })]).size).toBe(1);
  });
});

describe('the region page build', () => {
  const now = '2026-10-09T12:00:00.000Z';
  const listing = (sku: string, title: string, brand: string, price: number, ean: string | null = null) => ({
    retailerSku: sku, url: `https://shop.example/products/${sku}`, rawTitle: title, rawBrand: brand, ean, price, wasPrice: null,
    inStock: true, productType: 'Fragrance', sectionId: 's', firstSeenAt: '2026-10-09T04:00:00.000Z', lastSeenAt: '2026-10-09T06:00:00.000Z',
    status: 'active' as const,
  });
  const snapshot = (retailerId: string, listings: ReturnType<typeof listing>[]): RegionSnapshot =>
    ({ retailerId, region: 'US', currency: 'USD', updatedAt: now, complete: true, listings } as unknown as RegionSnapshot);
  const inputs: RegionInputs = {
    region: 'US',
    shops: REGION_RETAILERS.US,
    snapshots: [snapshot('aedes', [
      listing('1', 'Aventus Eau de Parfum 100ml', 'Creed', 395, '8412345678905'),
      listing('3', 'Mystery Eau de Parfum 50ml', 'Nobody', 100),
    ])],
    history: { currency: 'USD', updatedAt: now, points: {} },
    slugMemory: {},
    harvestRanAt: '2026-10-09T06:00:00.000Z',
  };
  const ukList = [uk({ id: 'ean-8412345678905', ean: '8412345678905' })];
  const names = (id: string) => (id === 'escentual' ? 'Escentual' : undefined);

  it('puts the UK notes and the UK shop credit on the matched product only', () => {
    const site = buildRegionSite(inputs, {}, now, ukList, names);
    const matched = site.catalogue.find((c) => c.brand === 'Creed')!;
    expect(matched.notes).toEqual({ top: ['Bergamot'], middle: ['Rose'], base: ['Musk'], source: { ...NOTES.source, retailerName: 'Escentual' } });
    expect(site.catalogue.find((c) => c.brand === 'Nobody')!.notes).toBeNull();
  });

  it('keeps no name on the credit when the UK shop is unknown, and no notes without a UK catalogue', () => {
    expect(buildRegionSite(inputs, {}, now, ukList).catalogue.find((c) => c.brand === 'Creed')!.notes!.source).toEqual(NOTES.source);
    expect(buildRegionSite(inputs, {}, now).catalogue.every((c) => c.notes === null)).toBe(true);
  });

  it('does not change the UK entries it was given', () => {
    const frozen = JSON.stringify(ukList);
    const site = buildRegionSite(inputs, {}, now, ukList, names);
    site.catalogue.find((c) => c.notes)!.notes!.top.push('Changed');
    expect(JSON.stringify(ukList)).toBe(frozen);
  });
});

const demo = resolve(REPO_ROOT, 'demo');
const built = existsSync(join(demo, 'us/index.html')) && existsSync(join(demo, 'in/index.html'));
const read = (rel: string): string => readFileSync(join(demo, rel), 'utf8');

describe.skipIf(!built)('the built US and India pages', () => {
  const dataOf = (prefix: string, name: string): unknown => {
    const file = referencedDataFiles(read(prefix === '' ? 'index.html' : `${prefix}/index.html`)).find((f) => f.startsWith(`data/${name}.`));
    expect(file, `${prefix} ${name} file`).toBeTruthy();
    return JSON.parse(read(prefix === '' ? file! : `${prefix}/${file!}`));
  };
  const ukNames = (): Set<string> => {
    const names = (prepareNotesData(dataOf('', 'notes')).byName);
    return new Set([...names.keys()].map(noteMergeKey));
  };
  const aliasVariants = (): Set<string> =>
    new Set((JSON.parse(readFileSync(resolve(REPO_ROOT, 'data/note-aliases.json'), 'utf8')) as { aliases: { variant: string }[] }).aliases.map((a) => noteMergeKey(a.variant)));

  for (const prefix of ['us', 'in']) {
    it(`/${prefix}/ shows notes with the UK shop credit on some products, and they are alias folded`, () => {
      const blobs = dataOf(prefix, 'catalogue') as unknown[];
      const entries: { slug: string; notes: null | { top: string[]; middle: string[]; base: string[]; source: { retailerId: string; url: string; retailerName?: string } | null } }[] = [];
      const walk = (x: unknown): void => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === 'object' && 'slug' in x && 'notes' in x) entries.push(x as (typeof entries)[number]);
      };
      walk(blobs);
      const withNotes = entries.filter((e) => e.notes);
      expect(withNotes.length, 'products with notes').toBeGreaterThan(100);
      expect(withNotes.length, 'not every product').toBeLessThan(entries.length);
      expect(withNotes.every((e) => e.notes!.source && e.notes!.source.retailerName && /^https?:\/\//.test(e.notes!.source.url))).toBe(true);
      const variants = aliasVariants();
      const uk = ukNames();
      for (const e of withNotes) {
        for (const n of [...e.notes!.top, ...e.notes!.middle, ...e.notes!.base]) {
          expect(variants.has(noteMergeKey(n)) && !uk.has(noteMergeKey(n)), `${e.slug}: ${n} is a folded away spelling`).toBe(false);
        }
      }
    });

    it(`/${prefix}/ has a Notes tab that is not empty, and its note icons resolve to the shared hashed icons`, () => {
      const notes = prepareNotesData(dataOf(prefix, 'notes'));
      const listed = [...notes.byName.values()].filter((n) => !n.hidden);
      expect(listed.length).toBeGreaterThan(100);
      expect(notes.groups.length).toBeGreaterThan(5);
      const uk = ukNames();
      expect(listed.every((n) => uk.has(noteMergeKey(n.name))), 'every region note is a note the UK tab has').toBe(true);
      const icons = prepareNoteIcons(dataOf(prefix, 'noteIcons'));
      const first = listed[0]!;
      const icon = icons.iconFor(first.name);
      expect(icon, first.name).not.toBeNull();
      // The icon is requested from the shared hashed path under the site root (base "/" on /us/ and /in/), never a region copy.
      expect(icon!.src).toMatch(/^note-icons\/h\/[a-z0-9-]+\.[0-9a-f]{10}\.svg$/);
      for (const n of listed.slice(0, 200)) {
        const i = icons.iconFor(n.name);
        if (i) expect(existsSync(join(demo, i.src)), i.src).toBe(true);
      }
      expect(existsSync(join(demo, prefix, 'note-icons'))).toBe(false);
      for (const g of notes.groups) expect(existsSync(join(demo, g.icon)), g.icon).toBe(true);
    });

    it(`/${prefix}/notes has its page, a canonical in the region and a sitemap line; a note address is a note route`, () => {
      expect(read(`${prefix}/notes.html`)).toContain(`<link rel="canonical" href="https://pricesniffs.space/${prefix}/notes" />`);
      expect(read(`sitemap-${prefix}.xml`)).toContain(`<loc>https://pricesniffs.space/${prefix}/notes</loc>`);
      // The note group pages, as the UK has them: a route page and a sitemap line each, canonical in the region.
      const groups = (JSON.parse(readFileSync(resolve(REPO_ROOT, 'dist-demo/regions', prefix, 'note-groups.json'), 'utf8')) as string[]);
      expect(groups.length).toBeGreaterThan(8);
      for (const id of groups) {
        expect(read(`${prefix}/notes/group/${id}.html`)).toContain(`<link rel="canonical" href="https://pricesniffs.space/${prefix}/notes/group/${id}" />`);
        expect(read(`sitemap-${prefix}.xml`)).toContain(`<loc>https://pricesniffs.space/${prefix}/notes/group/${id}</loc>`);
      }
      expect(matchRoute('/notes/rhubarb').name).toBe('note');
      expect(matchRoute(`/${prefix}/notes/rhubarb`).name).toBe('note');
      const notes = prepareNotesData(dataOf(prefix, 'notes'));
      expect(notes.byName.size).toBeGreaterThan(100);
    });
  }

  it('leaves every UK data file untouched: the committed UK catalogue, slugs and aliases are unchanged', () => {
    const files = ['demo/catalogue.generated.ts', 'demo/deals.generated.ts', 'data/product-slugs.json', 'data/id-aliases.json', 'data/note-aliases.json'];
    expect(execFileSync('git', ['status', '--porcelain', '--', ...files], { cwd: REPO_ROOT, encoding: 'utf8' })).toBe('');
    expect(read('sitemap-gb.xml')).not.toContain('/us/notes');
    expect(read('notes.html')).not.toContain('hreflang="en-US"');
  });
});
