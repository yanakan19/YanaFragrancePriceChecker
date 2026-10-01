import { describe, expect, it } from 'vitest';
import {
  compactTable,
  lookupLinks,
  renderGeneratedModule,
  renderLinksFile,
  type LinkEntry,
} from '../src/catalogue/fragranceLinkStore.js';

const at = '2026-10-01T00:00:00.000Z';
const entry = (e: Partial<LinkEntry>): LinkEntry => ({ checkedAt: at, method: {}, ...e });

describe('compactTable', () => {
  const entries: Record<string, LinkEntry> = {
    'dior|sauvage|edt': entry({
      fragrantica: 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html',
      fragranticaMatch: 'base',
      official: 'https://www.dior.com/en_gb/beauty/fragrance/mens-fragrance/sauvage',
      officialMatch: 'base',
    }),
    'dior|sauvage|edp': entry({
      fragrantica: 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html',
      fragranticaMatch: 'exact',
    }),
    'dior|diorhomme|edt': entry({ tried: { fragrantica: at } }),
  };

  it('keeps only perfumes that have a link, and stores Fragrantica as a compact path', () => {
    const t = compactTable(entries);
    expect(t['dior|sauvage|edt']).toEqual(['Dior/Sauvage-31861', 'https://www.dior.com/en_gb/beauty/fragrance/mens-fragrance/sauvage']);
    expect(t['dior|sauvage|edp']).toEqual(['Dior/Sauvage-Eau-de-Parfum-43763', '']);
    expect(t['dior|diorhomme|edt']).toBeUndefined();
  });

  it('adds a brand|name key from base pages only, never from a concentration-specific one', () => {
    const t = compactTable(entries);
    expect(t['dior|sauvage']).toEqual(['Dior/Sauvage-31861', 'https://www.dior.com/en_gb/beauty/fragrance/mens-fragrance/sauvage']);
    const onlyExact = compactTable({
      'dior|sauvage|edp': entry({
        fragrantica: 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html',
        fragranticaMatch: 'exact',
      }),
    });
    expect(onlyExact['dior|sauvage']).toBeUndefined();
  });
});

describe('lookupLinks', () => {
  const table = compactTable({
    'dior|sauvage|edt': entry({ fragrantica: 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html', fragranticaMatch: 'base' }),
    'dior|sauvage|edp': entry({
      fragrantica: 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html',
      fragranticaMatch: 'exact',
      official: 'https://www.dior.com/en_gb/products/sauvage-edp',
      officialMatch: 'exact',
    }),
  });

  it('uses the page stored for the exact concentration', () => {
    expect(lookupLinks(table, 'Dior', 'Sauvage', 'Eau de Parfum')).toEqual({
      fragrantica: 'https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-43763.html',
      official: 'https://www.dior.com/en_gb/products/sauvage-edp',
    });
  });

  it('falls back to the perfume\'s concentration-free page for a concentration with no entry', () => {
    expect(lookupLinks(table, 'Dior', 'Sauvage', 'Parfum').fragrantica).toBe('https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html');
  });

  it('is null for what is not stored, and for a perfume that is not there', () => {
    expect(lookupLinks(table, 'Dior', 'Sauvage', 'Eau de Toilette').official).toBeNull();
    expect(lookupLinks(table, 'Nobody', 'Nothing', 'Eau de Parfum')).toEqual({ fragrantica: null, official: null });
  });

  it('finds the entry whatever case, accents or punctuation the product carries', () => {
    expect(lookupLinks(table, 'DIOR', 'sauvage', 'Eau de Parfum').fragrantica).toContain('43763');
  });
});

describe('rendering', () => {
  it('writes a generated module the bundler can move into JSON', () => {
    const src = renderGeneratedModule({ 'a|b|edp': ['A/B-1', ''], 'c|d|edt': ['', 'https://c.com/d'] }, at);
    expect(src).toContain('export const FRAGRANCE_LINKS: Record<string, readonly [string, string]> = {');
    const body = src.slice(src.indexOf('= {') + 2, src.lastIndexOf('};') + 1);
    expect(JSON.parse(body)).toEqual({ 'a|b|edp': ['A/B-1', ''], 'c|d|edt': ['', 'https://c.com/d'] });
  });

  it('writes the links file one entry per line, sorted, and it parses back', () => {
    const entries = { 'b|x|edp': entry({}), 'a|x|edp': entry({ official: 'https://a.com/x', officialMatch: 'exact' }) };
    const text = renderLinksFile({ version: 1, generatedAt: at, entries });
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]!.startsWith('"a|x|edp"')).toBe(true);
    expect(JSON.parse(text).entries).toEqual(entries);
  });
});
