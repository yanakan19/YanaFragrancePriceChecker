import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { ID_ALIASES } from '../demo/dormant.generated.js';
import { concentration, concentrationMatch } from '../src/catalogue/productName.js';
import { HOUSE_STRENGTH_EVIDENCE } from '../src/catalogue/houseStrengthEvidence.js';
import { nameCarriedKey, nameCore, strengthBlindKey, strengthDifference } from '../src/catalogue/duplicateKey.js';
import { concentrationBlindKey, findDuplicateGroups, settleHouseConcentrations, type MatchableProduct } from '../src/catalogue/productMatch.js';

// The same bottle splits into two pages when two shops name its strength two ways.
// Orto Parisi Cuoium 50ml, stored titles, 2026-10-04:
//   bloom-perfumery     "Cuoium 50 ml Extrait de Parfum"  155 pounds, no barcode
//   nicchia-luxury-uk   "Cuoium Parfum 50 ml"             135 pounds, no barcode
// Orto Parisi's own page (data/houses/orto-parisi.json) ends "Parfum 50 ml/1.7 fl.oz".

const product = (o: Partial<MatchableProduct> & { id: string }): MatchableProduct => ({
  brand: 'Orto Parisi',
  name: 'Cuoium',
  concentration: 'Parfum',
  sizeMl: 50,
  ean: null,
  ...o,
});

describe('the spellings of Extrait de Parfum', () => {
  it.each([
    ['Cuoium 50 ml Extrait de Parfum', 'Extrait de Parfum'],
    ['Eclix Extract De Parfum 100ml', 'Extrait de Parfum'],
    ['Vague 100ml Extrait Parfum Elements Collection', 'Extrait de Parfum'],
    ['Angel Dust Parfum Extrait 100 ml', 'Extrait de Parfum'],
    ['Aromatix Frostbite ExDP 100ml', 'Extrait de Parfum'],
    ['Aromatix Frostbite Extrait 100ml', 'Extrait de Parfum'],
  ])('reads %s as %s', (title, expected) => {
    expect(concentration(title)).toBe(expected);
  });

  it('takes the whole phrase out of the name, not half of it', () => {
    expect(concentrationMatch('Eclix Extract De Parfum 100ml')?.toLowerCase()).toBe('extract de parfum');
    expect(concentrationMatch('Angel Dust Parfum Extrait 100 ml')?.toLowerCase()).toBe('parfum extrait');
  });

  it('leaves the neighbouring tiers alone', () => {
    // Pure Parfum is a Parfum (Armaf, Hermes), and an Eau de Parfum with the word
    // Extrait after it is the Eau de Parfum the shop says it is.
    expect(concentration('Terre d Hermes Pure Parfum 75ml')).toBe('Parfum');
    expect(concentration('Lattafa Fakhar Extrait Eau de Parfum 100ml Spray')).toBe('Eau de Parfum');
    expect(concentration('Alien Eau de Parfum Spray 60ml')).toBe('Eau de Parfum');
    expect(concentration('Alien EDP 60ml')).toBe('Eau de Parfum');
    expect(concentration('4711 Cologne 300ml')).toBe('Eau de Cologne');
    expect(concentration('4711 Original Eau de Cologne 200ml')).toBe('Eau de Cologne');
  });
});

describe('a name that restates the strength', () => {
  const extrait = (o: Partial<MatchableProduct> & { id: string }) =>
    product({ brand: 'Perris Monte Carlo', name: 'Cacao Azteque', concentration: 'Extrait de Parfum', ...o });

  it('does not split an Extrait de Parfum from the same bottle with the word Extrait in its name', () => {
    // bloom-perfumery "Cacao Azteque Extrait 50 ml", nicchia-luxury-uk "Cacao Aztèque Extrait de Parfum 50 ml"
    const groups = findDuplicateGroups([
      extrait({ id: 'bloom-perfumery-cacao-azteque-extrait-50-ml-extrait-de-parfum', name: 'Cacao Azteque Extrait' }),
      extrait({ id: 'nicchia-luxury-uk-n02418-01', name: 'Cacao Aztèque' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.absorbed).toHaveLength(1);
  });

  it('keeps the Eau de Parfum and the Extrait apart, whatever the name says', () => {
    // Perris Monte Carlo sells both at 50ml, and so does Bloom Perfumery.
    const groups = findDuplicateGroups([
      extrait({ id: 'bloom-perfumery-cacao-azteque-50-ml-edp', concentration: 'Eau de Parfum' }),
      extrait({ id: 'bloom-perfumery-cacao-azteque-extrait-50-ml-extrait-de-parfum', name: 'Cacao Azteque Extrait' }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it('never reduces a name to nothing', () => {
    const groups = findDuplicateGroups([
      extrait({ id: 'a', name: 'Extrait' }),
      extrait({ id: 'b', name: 'Extrait' }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('is the same rule in the yardstick scripts/find-duplicates.ts measures with', () => {
    expect(nameCore('Cacao Azteque Extrait', 'Perris Monte Carlo', 'Extrait de Parfum')).toBe(nameCore('Cacao Aztèque', 'Perris Monte Carlo', 'Extrait de Parfum'));
    expect(nameCore('Baccarat Rouge 540 Extrait', 'Maison Francis Kurkdjian', 'Eau de Parfum')).not.toBe(nameCore('Baccarat Rouge 540', 'Maison Francis Kurkdjian', 'Eau de Parfum'));
    expect(strengthBlindKey({ brand: 'Tauer', name: 'Au Coeur Du Désert Extrait', concentration: 'Extrait de Parfum', sizeMl: 50 })).toBe(
      strengthBlindKey({ brand: 'Tauer', name: 'Au Coeur du Désert', concentration: 'Eau de Parfum', sizeMl: 50 }),
    );
  });

  it('keeps Cologne, Parfum and Pure as part of a name for the matcher, and folds them only in the review key', () => {
    const a = { brand: 'Creed', name: 'Aventus Cologne', concentration: 'Eau de Parfum', sizeMl: 100 };
    const b = { brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', sizeMl: 100 };
    expect(strengthBlindKey(a)).not.toBe(strengthBlindKey(b));
    expect(nameCarriedKey(a)).toBe(nameCarriedKey(b));
  });
});

describe('the house evidence table', () => {
  const entry = HOUSE_STRENGTH_EVIDENCE.find((e) => e.name === 'Cuoium')!;

  it('records Orto Parisi Cuoium 50ml as the house states it, with the page and the day', () => {
    expect(entry.brand).toBe('Orto Parisi');
    expect(entry.concentration).toBe('Parfum');
    expect(entry.sizesMl).toEqual([50]);
    expect(entry.source).toBe('https://ortoparisi.com/products/cuoium');
    expect(entry.readAt).toBe('2026-10-04');
  });

  it('cites an https page, a quote and a date for every entry, and one entry per bottle', () => {
    const seen = new Set<string>();
    for (const e of HOUSE_STRENGTH_EVIDENCE) {
      expect(e.source).toMatch(/^https:\/\//);
      expect(e.quote.length).toBeGreaterThan(10);
      expect(e.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.sizesMl.length).toBeGreaterThan(0);
      const id = `${e.brand}|${e.name}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('settles the Bloom Extrait and the Nicchia Parfum on the house word, and they become one product', () => {
    const bloom = product({ id: 'bloom-perfumery-cuoium-50-ml-extrait-de-parfum', concentration: 'Extrait de Parfum' });
    const nicchia = product({ id: 'nicchia-luxury-uk-n02264-01', concentration: 'Parfum' });
    expect(findDuplicateGroups([bloom, nicchia])).toHaveLength(0);

    const settled = settleHouseConcentrations(
      HOUSE_STRENGTH_EVIDENCE.flatMap((e) =>
        e.sizesMl.map((size) => ({
          key: concentrationBlindKey(product({ id: 'evidence', brand: e.brand, name: e.name, sizeMl: size, concentration: '' })),
          stated: e.concentration,
        })),
      ),
    );
    const truth = settled.get(concentrationBlindKey(bloom));
    expect(truth).toBe('Parfum');
    const merged = findDuplicateGroups([{ ...bloom, concentration: truth! }, { ...nicchia, concentration: settled.get(concentrationBlindKey(nicchia))! }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.canonical.id).toBe(bloom.id);
    expect(merged[0]!.absorbed.map((a) => a.id)).toEqual([nicchia.id]);
  });

  it('does not settle a house that sells both strengths of one name and size', () => {
    // Tom Ford sells "Soleil Blanc Eau de Parfum" and "Soleil Blanc Parfum", each
    // 50ml, as two products (tomfordbeauty.com/products/soleil-blanc-eau-de-parfum and
    // /soleil-blanc-parfum, read 2026-10-04).
    const key = concentrationBlindKey(product({ id: 'k', brand: 'Tom Ford', name: 'Soleil Blanc' }));
    expect(
      settleHouseConcentrations([
        { key, stated: 'Eau de Parfum' },
        { key, stated: 'Parfum' },
      ]).size,
    ).toBe(0);
    const edp = product({ id: 'ean-0888066048958', brand: 'Tom Ford', name: 'Soleil Blanc', concentration: 'Eau de Parfum', ean: '0888066048958' });
    const parfum = product({ id: 'john-lewis-p115129341', brand: 'Tom Ford', name: 'Soleil Blanc', concentration: 'Parfum' });
    expect(findDuplicateGroups([edp, parfum])).toHaveLength(0);
  });
});

describe('strengthDifference, the finder in scripts/find-duplicates.ts', () => {
  it('names Extrait de Parfum against Parfum as the synonym candidate and no other pair', () => {
    expect(strengthDifference(['Parfum', 'Extrait de Parfum'])).toEqual({ pair: 'Parfum / Extrait de Parfum', synonymCandidate: true });
    expect(strengthDifference(['Eau de Parfum', 'Parfum']).synonymCandidate).toBe(false);
    expect(strengthDifference(['Eau de Parfum', 'Extrait de Parfum']).synonymCandidate).toBe(false);
    expect(strengthDifference(['Eau de Toilette', 'Eau de Parfum']).pair).toBe('Eau de Toilette / Eau de Parfum');
    expect(strengthDifference(['Parfum', 'Extrait de Parfum', 'Eau de Parfum']).synonymCandidate).toBe(false);
  });

  it('does not count Not stated or Disputed as a strength', () => {
    expect(strengthDifference(['Parfum', 'Not stated', 'Disputed']).pair).toBe('Parfum');
  });
});

describe('the built catalogue', () => {
  const at = (brand: string, name: string, size: number) => CATALOGUE.filter((p) => p.brand === brand && p.name.toLowerCase().startsWith(name.toLowerCase()) && p.sizeMl === size);

  it('shows Orto Parisi Cuoium 50ml once, as a Parfum, and the absorbed page still opens it', () => {
    const cuoium = at('Orto Parisi', 'Cuoium', 50);
    if (cuoium.length === 0) return; // the shops stopped listing it: nothing to hold
    expect(cuoium).toHaveLength(1);
    expect(cuoium[0]!.concentration).toBe('Parfum');
    expect(ID_ALIASES['nicchia-luxury-uk-n02264-01']).toBe(cuoium[0]!.id);
  });

  it('has no Orto Parisi, Farmacia SS. Annunziata or Laboratorio Olfattivo bottle split by Extrait de Parfum against Parfum', () => {
    const houses = new Set(HOUSE_STRENGTH_EVIDENCE.map((e) => e.brand));
    const bottles = new Map<string, Set<string>>();
    for (const p of CATALOGUE) {
      if (!houses.has(p.brand) || p.sizeMl === null) continue;
      const key = strengthBlindKey(p);
      if (!key) continue;
      bottles.set(key, new Set([...(bottles.get(key) ?? []), p.concentration]));
    }
    const split = [...bottles].filter(([, set]) => set.has('Parfum') && set.has('Extrait de Parfum'));
    expect(split).toEqual([]);
  });

  it('keeps the bottles a house sells in two strengths as two products', () => {
    // Tom Ford Soleil Blanc 50ml: an Eau de Parfum and a Parfum, each its own page.
    const soleil = at('Tom Ford', 'Soleil Blanc', 50).filter((p) => p.name === 'Soleil Blanc');
    const strengths = new Set(soleil.map((p) => p.concentration));
    if (strengths.has('Eau de Parfum') && strengths.has('Parfum')) {
      expect(soleil.filter((p) => p.concentration === 'Eau de Parfum')).toHaveLength(1);
      expect(soleil.filter((p) => p.concentration === 'Parfum')).toHaveLength(1);
    }
    // Black Orchid 50ml: the Eau de Parfum and the Parfum carry their own barcodes.
    const orchid = at('Tom Ford', 'Black Orchid', 50).filter((p) => p.ean && p.name === 'Black Orchid');
    const kinds = new Set(orchid.map((p) => p.concentration));
    if (kinds.has('Eau de Parfum') && kinds.has('Parfum')) expect(new Set(orchid.map((p) => p.ean)).size).toBe(orchid.length);
  });

  it('has one French Avenue Atlantis 100ml, which the house sells as an Extrait de Parfum', () => {
    const atlantis = at('French Avenue', 'Atlantis', 100).filter((p) => p.name.toLowerCase().replace(/\s*extrait$/, '') === 'atlantis');
    if (atlantis.length === 0) return;
    expect(atlantis).toHaveLength(1);
    expect(atlantis[0]!.concentration).toBe('Extrait de Parfum');
  });
});
