import { describe, expect, it } from 'vitest';
import { applyReviewedStrengths, type RegionProduct } from '../src/catalogue/regionCatalogue.js';
import { HOUSE_STRENGTH_EVIDENCE } from '../src/catalogue/houseStrengthEvidence.js';
import { CONCENTRATION_RESOLUTIONS } from '../src/catalogue/productName.js';

const product = (brand: string, name: string, concentration: string, sizeMl: number | null, ean: string | null = null): RegionProduct => ({
  id: `${brand}-${name}-${sizeMl}-${concentration}`, kind: 'bottle', brand, name, concentration, sizeMl, ean, offers: [],
});

describe('the reviewed strengths apply to the US and India catalogues (owner request, 20 Oct 2026)', () => {
  it('corrects a region shop\'s label from the brand\'s own page, "Eau de Cologne" included', () => {
    const edc = product('Parfums de Marly', 'Pegasus', 'Eau de Cologne', 125);
    const unstated = product('Clinique', 'Happy', 'Not stated', 50);
    const orto = product('Orto Parisi', 'Cuoium', 'Eau de Parfum', 50);
    const out = applyReviewedStrengths([edc, unstated, orto]);
    expect(edc.concentration).toBe('Eau de Parfum');
    expect(unstated.concentration).toBe('Eau de Parfum');
    expect(orto.concentration).toBe('Parfum');
    expect(out).toEqual({ changed: 3, fromCologne: 1 });
  });

  it('keeps Eau de Cologne a strength of its own: nothing folds it, and a barcode resolution never replaces it', () => {
    const [ean, resolution] = Object.entries(CONCENTRATION_RESOLUTIONS)[0]!;
    const cologne = product('Somebody', 'Unreviewed Cologne', 'Eau de Cologne', 100, ean);
    const parfum = product('Somebody', 'Unreviewed Name', 'Not stated', 100, ean);
    applyReviewedStrengths([cologne, parfum]);
    expect(cologne.concentration).toBe('Eau de Cologne');
    expect(parfum.concentration).toBe(resolution.concentration);
    const alone = product('Nobody', 'Aventus Cologne', 'Eau de Cologne', 50);
    applyReviewedStrengths([alone]);
    expect(alone.concentration).toBe('Eau de Cologne');
  });

  it('does not read a men\'s or women\'s line as the other sex\'s bottle', () => {
    // Clinique Happy is the women's Eau de Parfum; Happy For Men is its own bottle.
    const men = product('Clinique', 'Happy For Men', 'Eau de Cologne', 100);
    applyReviewedStrengths([men]);
    expect(men.concentration).toBe('Eau de Cologne');
    const unisex = product('Afnan', '9PM Night Out For Men And Women', 'Eau de Parfum', 100);
    applyReviewedStrengths([unisex]);
    expect(unisex.concentration).toBe('Extrait de Parfum');
  });

  it('reads a shop\'s "For Men" after the name as a shelf label, except where it is another bottle', () => {
    const zimaya = product('Zimaya', 'Sharaf The Club For Men', 'Extrait de Parfum', 100);
    const happy = product('Clinique', 'Happy For Women', 'Not stated', 30);
    applyReviewedStrengths([zimaya, happy]);
    expect(zimaya.concentration).toBe('Eau de Parfum');
    expect(happy.concentration).toBe('Not stated');
  });

  it('leaves a size the brand\'s page does not show alone', () => {
    const other = product('Parfums de Marly', 'Pegasus', 'Eau de Cologne', 30);
    applyReviewedStrengths([other]);
    expect(other.concentration).toBe('Eau de Cologne');
  });

  it('records the brand\'s page, a quote and a day for each region entry', () => {
    for (const e of HOUSE_STRENGTH_EVIDENCE.filter((x) => x.readAt === '2026-10-20')) {
      expect(e.source).toMatch(/^https:\/\//);
      expect(e.quote.length).toBeGreaterThan(20);
    }
  });
});
