/**
 * One perfume, one page: the matcher rules added for the double listings the
 * owner reported (Rabanne Invictus Victory Elixir first).
 *
 * Every example is a real product as the built catalogue carried it on
 * 2026-10-04, with the shops that sold it. The negative tests matter as much as
 * the positive ones: a flanker, a strength, a size, a tester or a gender pair
 * must stay its own page.
 */
import { describe, expect, it } from 'vitest';
import { buildBrandCanon } from '../src/catalogue/brandName.js';
import { findDuplicateGroups, matchKey, type MatchableProduct } from '../src/catalogue/productMatch.js';

interface P extends MatchableProduct {
  shops: string[];
}

let n = 0;
const p = (o: Partial<P> & Pick<P, 'brand' | 'name' | 'concentration' | 'sizeMl'>): P => ({
  id: `p${++n}`,
  ean: null,
  shops: [],
  ...o,
});
const shopsOf = (x: P) => x.shops;
const merged = (products: P[], withShops = false) =>
  findDuplicateGroups(products, withShops ? { shopsOf } : {}).map((g) => ({
    keeps: g.canonical.id,
    absorbs: g.absorbed.map((a) => a.id).sort(),
  }));
/** True when every product ends on one page. */
function oneBottle(products: P[], withShops = false): boolean {
  const groups = findDuplicateGroups(products, withShops ? { shopsOf } : {});
  const gone = new Set(groups.flatMap((g) => g.absorbed.map((a) => a.id)));
  return products.length - gone.size === 1;
}
/** True when nothing at all is folded. */
const allApart = (products: P[], withShops = false) => merged(products, withShops).length === 0;

describe('Rabanne Invictus Victory Elixir (the owner report)', () => {
  // beautybase and perfume click say Parfum Intense, the shops writing no barcode
  // say "Elixir" with or without "Intense", and mybeauty boutique and the beauty
  // store repeat the Eau de Parfum that the manufacturer's word overruled.
  const barcoded = p({ brand: 'Rabanne', name: 'Invictus Victory Elixir Intense', concentration: 'Parfum', sizeMl: 50, ean: '3349668614516', shops: ['beautybase', 'perfume-click'] });
  const escentual = p({ brand: 'Rabanne', name: 'Invictus Victory Elixir Intense', concentration: 'Parfum', sizeMl: 50, shops: ['escentual'] });
  const bare = p({ brand: 'Rabanne', name: 'Invictus Victory Elixir', concentration: 'Parfum', sizeMl: 50, shops: ['justmylook'] });

  it('treats the Intense of Parfum Intense as the strength, not a different perfume', () => {
    expect(matchKey(escentual)).toBe(matchKey(bare));
    expect(oneBottle([barcoded, escentual, bare])).toBe(true);
  });

  it('keeps the barcoded page as the survivor', () => {
    const [group] = merged([escentual, barcoded, bare]);
    expect(group!.keeps).toBe(barcoded.id);
    expect(group!.absorbs).toEqual([escentual.id, bare.id].sort());
  });

  it('keeps the flankers apart: Invictus, Invictus Victory, Invictus Victory Elixir, Absolu', () => {
    const invictus = p({ brand: 'Rabanne', name: 'Invictus', concentration: 'Eau de Toilette', sizeMl: 50, ean: '3349668515653' });
    const victory = p({ brand: 'Rabanne', name: 'Invictus Victory', concentration: 'Eau de Parfum', sizeMl: 50, ean: '3349668588749' });
    const extreme = p({ brand: 'Rabanne', name: 'Invictus Victory Extreme', concentration: 'Eau de Parfum', sizeMl: 50, ean: '3349668683055' });
    const absolu = p({ brand: 'Rabanne', name: 'Invictus Victory Absolu Intense', concentration: 'Parfum', sizeMl: 50, shops: ['escentual'] });
    expect(allApart([invictus, victory, extreme, absolu, barcoded])).toBe(true);
    // Not even a barcode-less listing of the Elixir may fall into one of them.
    expect(allApart([invictus, victory, extreme, absolu, bare])).toBe(true);
  });

  it('keeps a different size apart', () => {
    const ten = p({ brand: 'Rabanne', name: 'Invictus Victory Elixir', concentration: 'Parfum', sizeMl: 10 });
    expect(allApart([barcoded, ten])).toBe(true);
  });

  it('is not the brand rename: the build already folds Paco Rabanne into Rabanne before any matching', () => {
    const canon = buildBrandCanon(['Paco Rabanne', 'Rabanne', 'Paco Rabanne']);
    expect(canon.get('Paco Rabanne')).toBe('Rabanne');
    expect(canon.get('Rabanne')).toBe('Rabanne');
  });
});

describe('Parfum Intense is only the strength where the strength is Parfum', () => {
  it('merges Hero and Hero Intense when both are Parfum', () => {
    const a = p({ brand: 'Burberry', name: 'Hero', concentration: 'Parfum', sizeMl: 50, shops: ['escentual'] });
    const b = p({ brand: 'Burberry', name: 'Hero Intense', concentration: 'Parfum', sizeMl: 50, ean: '3616304966866', shops: ['perfume-click'] });
    expect(oneBottle([a, b])).toBe(true);
  });

  it('keeps Intense as a flanker on an Eau de Parfum: K and K Intense, Alien Goddess and Alien Goddess Intense', () => {
    const k = p({ brand: 'Dolce & Gabbana', name: 'K', concentration: 'Eau de Parfum', sizeMl: 100, ean: '8057971183661' });
    const kIntense = p({ brand: 'Dolce & Gabbana', name: 'K Intense', concentration: 'Eau de Parfum', sizeMl: 100 });
    expect(allApart([k, kIntense])).toBe(true);
    const goddess = p({ brand: 'Mugler', name: 'Alien Goddess', concentration: 'Eau de Parfum', sizeMl: 60 });
    const goddessIntense = p({ brand: 'Mugler', name: 'Alien Goddess Intense', concentration: 'Eau de Parfum', sizeMl: 60 });
    expect(allApart([goddess, goddessIntense])).toBe(true);
  });

  it('keeps Phantom Intense (Eau de Parfum) apart from Phantom Parfum', () => {
    const intense = p({ brand: 'Rabanne', name: 'Phantom Intense', concentration: 'Eau de Parfum', sizeMl: 100, ean: '3349668630035' });
    const parfum = p({ brand: 'Rabanne', name: 'Phantom', concentration: 'Parfum', sizeMl: 100, ean: '3349668614592' });
    expect(allApart([intense, parfum])).toBe(true);
  });

  it('keeps Club De Nuit Intense apart from Club De Nuit on an Eau de Toilette', () => {
    const a = p({ brand: 'Armaf', name: 'Club De Nuit Intense', concentration: 'Eau de Toilette', sizeMl: 105 });
    const b = p({ brand: 'Armaf', name: 'Club De Nuit', concentration: 'Eau de Toilette', sizeMl: 105, ean: '6294015151596' });
    expect(allApart([a, b])).toBe(true);
  });
});

describe('the same words, written the way each shop writes them', () => {
  it('reads accents as the same letters: Olympéa and Olympea, Idôle and Idole, Hermès H24', () => {
    expect(oneBottle([
      p({ brand: 'Rabanne', name: 'Olympea', concentration: 'Eau de Parfum', sizeMl: 30, shops: ['escentual'] }),
      p({ brand: 'Rabanne', name: 'Olympéa', concentration: 'Eau de Parfum', sizeMl: 30, ean: '3349668679263', shops: ['beautybase'] }),
    ])).toBe(true);
    expect(oneBottle([
      p({ brand: 'Lancôme', name: 'Idôle', concentration: 'Eau de Parfum', sizeMl: 100, ean: '3614273069175' }),
      p({ brand: 'Lancôme', name: 'Idole', concentration: 'Eau de Parfum', sizeMl: 100 }),
    ])).toBe(true);
  });

  it('reads a backtick or acute accent as the apostrophe it stands for', () => {
    expect(oneBottle([
      p({ brand: "Etat Libre d'Orange", name: 'Divin`Enfant', concentration: 'Eau de Parfum', sizeMl: 50, ean: '3760168590016' }),
      p({ brand: "Etat Libre d'Orange", name: 'Divin’Enfant', concentration: 'Eau de Parfum', sizeMl: 50 }),
    ])).toBe(true);
  });

  it('drops "perfume", "and" and "the": Alien Perfume, Diamonds & Rubies, The Dreamer', () => {
    expect(oneBottle([
      p({ brand: 'Mugler', name: 'Alien', concentration: 'Eau de Parfum', sizeMl: 60, ean: '3439600056921' }),
      p({ brand: 'Mugler', name: 'Alien Perfume', concentration: 'Eau de Parfum', sizeMl: 60 }),
    ])).toBe(true);
    expect(oneBottle([
      p({ brand: 'Elizabeth Taylor', name: 'Diamonds & Rubies', concentration: 'Eau de Toilette', sizeMl: 100 }),
      p({ brand: 'Elizabeth Taylor', name: 'Diamonds And Rubies', concentration: 'Eau de Toilette', sizeMl: 100 }),
    ])).toBe(true);
    expect(oneBottle([
      p({ brand: 'Versace', name: 'Dreamer', concentration: 'Eau de Toilette', sizeMl: 100 }),
      p({ brand: 'Versace', name: 'The Dreamer', concentration: 'Eau de Toilette', sizeMl: 100 }),
    ])).toBe(true);
  });

  it('drops the house name a title repeats: Boss Bottled, HUGO Man, Mugler Alien, Thierry Mugler Alien, Armani Code', () => {
    expect(oneBottle([
      p({ brand: 'Hugo Boss', name: 'Boss Bottled Night', concentration: 'Eau de Toilette', sizeMl: 100, ean: '0737052352060' }),
      p({ brand: 'Hugo Boss', name: 'Bottled Night', concentration: 'Eau de Toilette', sizeMl: 100 }),
    ])).toBe(true);
    expect(oneBottle([
      p({ brand: 'Hugo Boss', name: 'HUGO Man', concentration: 'Eau de Toilette', sizeMl: 75 }),
      p({ brand: 'Hugo Boss', name: 'Man', concentration: 'Eau de Toilette', sizeMl: 75, ean: '3614229823790' }),
    ])).toBe(true);
    expect(oneBottle([
      p({ brand: 'Mugler', name: 'Alien', concentration: 'Eau de Parfum', sizeMl: 90, ean: '3439600056969' }),
      p({ brand: 'Mugler', name: 'MUGLER Alien', concentration: 'Eau de Parfum', sizeMl: 90 }),
      p({ brand: 'Mugler', name: 'Thierry Mugler Alien', concentration: 'Eau de Parfum', sizeMl: 90 }),
    ])).toBe(true);
    expect(oneBottle([
      p({ brand: 'Giorgio Armani', name: 'Code', concentration: 'Eau de Parfum', sizeMl: 75, ean: '3614273636414' }),
      p({ brand: 'Giorgio Armani', name: 'Armani Code', concentration: 'Eau de Parfum', sizeMl: 75 }),
    ])).toBe(true);
  });

  it('drops a strength written into the name only when it is the product\'s own strength', () => {
    expect(oneBottle([
      p({ brand: 'Gucci', name: 'Guilty', concentration: 'Eau de Toilette', sizeMl: 90 }),
      p({ brand: 'Gucci', name: 'Gucci Guilty Eau de Toilette', concentration: 'Eau de Toilette', sizeMl: 90, ean: '3616301976141' }),
    ])).toBe(true);
    // Eau Fraiche on an Eau de Toilette is a different bottle, not its strength.
    expect(allApart([
      p({ brand: 'Revlon', name: 'Charlie Blue', concentration: 'Eau de Toilette', sizeMl: 100, ean: '5000386004628' }),
      p({ brand: 'Revlon', name: 'Charlie Blue Eau Fraiche', concentration: 'Eau de Toilette', sizeMl: 100 }),
    ])).toBe(true);
  });

  it('never reduces a name to nothing: Juicy Couture is not Couture Couture', () => {
    const juicy = p({ brand: 'Juicy Couture', name: 'Juicy Couture', concentration: 'Eau de Parfum', sizeMl: 100 });
    const couture = p({ brand: 'Juicy Couture', name: 'Couture Couture', concentration: 'Eau de Parfum', sizeMl: 100 });
    expect(allApart([juicy, couture])).toBe(true);
  });
});

describe('names that look alike and are different perfumes stay apart', () => {
  const same = { concentration: 'Eau de Parfum', sizeMl: 100 };
  it.each([
    ['Creed', 'Aventus', 'Aventus Cologne'],
    ['Marc Jacobs', 'Daisy So Intense', 'Daisy Eau So Intense'],
    ['Versace', 'Pour Homme', 'Pour Homme Eau Fraiche'],
    ['Gucci', 'Guilty', 'Guilty Absolute'],
    ['Rabanne', 'Invictus Victory', 'Invictus Victory Extreme'],
    ['Rabanne', 'Fame', 'Fame Intense'],
    ['Rabanne', '1 Million', '1 Million Elixir'],
    ['Mugler', 'Alien', 'Alien Flora Futura'],
    ['Dior', 'Sauvage', 'Sauvage Elixir'],
    ['Creed', 'Aventus', 'Aventus Tester'],
    ['Creed', 'Aventus', 'Aventus Refill'],
    ['Creed', 'Aventus', 'Aventus Travel Set'],
  ])('%s: %s is not %s', (brand, a, b) => {
    expect(allApart([p({ brand, name: a, ...same }), p({ brand, name: b, ...same })])).toBe(true);
  });

  it('never merges across strengths or sizes', () => {
    const base = { brand: 'Mugler', name: 'Alien' };
    expect(allApart([
      p({ ...base, concentration: 'Eau de Parfum', sizeMl: 60 }),
      p({ ...base, concentration: 'Eau de Toilette', sizeMl: 60 }),
      p({ ...base, concentration: 'Eau de Parfum', sizeMl: 90 }),
      p({ ...base, concentration: 'Parfum', sizeMl: 60 }),
    ])).toBe(true);
  });
});

describe('barcodes', () => {
  it('folds the listings with no barcode together when two barcodes split a bottle (Mugler Alien 30ml)', () => {
    const a = p({ brand: 'Mugler', name: 'Alien', concentration: 'Eau de Parfum', sizeMl: 30, ean: '3439600056914', shops: ['beautybase', 'perfume-click'] });
    const b = p({ brand: 'Mugler', name: 'Alien', concentration: 'Eau de Parfum', sizeMl: 30, ean: '3439602800218', shops: ['fragrance-click'] });
    const bare = ['escentual', 'justmylook', 'lookfantastic', 'mybeauty-boutique', 'perfume-market-uk', 'scentstore', 'the-beauty-store-uk'].map((s) =>
      p({ brand: 'Mugler', name: 'Alien', concentration: 'Eau de Parfum', sizeMl: 30, shops: [s] }),
    );
    const groups = findDuplicateGroups([a, ...bare, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.absorbed.every((x) => x.ean === null)).toBe(true);
    expect(groups[0]!.absorbed).toHaveLength(bare.length - 1);
    // Neither barcoded page was touched.
    const touched = new Set([groups[0]!.canonical, ...groups[0]!.absorbed]);
    expect(touched.has(a) || touched.has(b)).toBe(false);
  });

  it('reads a UPC and the same UPC with its check digit stuck on as one code (Tom Ford Black Orchid 50ml)', () => {
    const base = { brand: 'Tom Ford', name: 'Black Orchid', concentration: 'Eau de Parfum', sizeMl: 50 };
    const upc = p({ ...base, ean: '888066000062', shops: ['allbeauty', 'fragrance-click'] });
    const padded = p({ ...base, ean: '0888066000062', shops: ['perfume-click'] });
    const stuck = p({ ...base, ean: '8880660000624', shops: ['space-nk'] });
    const bare = p({ ...base, shops: ['cult-beauty-global'] });
    expect(oneBottle([upc, padded, stuck, bare])).toBe(true);
  });

  it('does not read two unrelated thirteen digit codes as one', () => {
    const base = { brand: 'Tom Ford', name: 'Black Orchid', concentration: 'Eau de Parfum', sizeMl: 50 };
    expect(allApart([p({ ...base, ean: '888066000062' }), p({ ...base, ean: '3349668515653' })])).toBe(true);
  });

  describe('two barcodes on one bottle, read with the shops that sell them', () => {
    const base = { brand: 'Rabanne', name: 'Invictus Victory Elixir Intense', concentration: 'Parfum', sizeMl: 50 };

    it('stay apart without shop information, exactly as before', () => {
      const a = p({ ...base, ean: '3349668614516', shops: ['beautybase'] });
      const b = p({ ...base, ean: '3349668681020', shops: ['parfumdreams-uk'] });
      expect(allApart([a, b])).toBe(true);
    });

    it('are editions of one bottle when no shop sells two of them', () => {
      const a = p({ ...base, ean: '3349668614516', shops: ['beautybase', 'perfume-click'] });
      const b = p({ ...base, ean: '3349668681020', shops: ['parfumdreams-uk'] });
      const bare = p({ ...base, shops: ['escentual'] });
      const [group] = merged([b, bare, a], true);
      expect(group!.keeps).toBe(a.id); // the barcoded page with the most shops survives
      expect(group!.absorbs).toEqual([b.id, bare.id].sort());
    });

    it('are two articles when one shop sells both: Calvin Klein IN2U for Him and for Her at Perfume Click', () => {
      const him = p({ brand: 'Calvin Klein', name: 'IN2U', concentration: 'Eau de Toilette', sizeMl: 100, ean: '0088300196890', shops: ['perfume-click'] });
      const her = p({ brand: 'Calvin Klein', name: 'IN2U', concentration: 'Eau de Toilette', sizeMl: 100, ean: '0088300196814', shops: ['perfume-click'] });
      expect(allApart([him, her], true)).toBe(true);
    });

    it('are two articles when the codes neighbour each other in the maker\'s numbering: Truth, Euphoria, One Man Show', () => {
      const truth = (ean: string, shop: string) => p({ brand: 'Calvin Klein', name: 'Truth', concentration: 'Eau de Parfum', sizeMl: 100, ean, shops: [shop] });
      expect(allApart([truth('088300049479', 'beautybase'), truth('088300049493', 'paco-perfumerias-uk')], true)).toBe(true);
      const show = (ean: string, shop: string) => p({ brand: 'Jacques Bogart', name: 'One Man Show', concentration: 'Eau de Toilette', sizeMl: 100, ean, shops: [shop] });
      expect(allApart([show('3355991000223', 'beautybase'), show('3355991000230', 'perfume-click')], true)).toBe(true);
    });

    it('still keeps a different strength apart whatever the barcodes say', () => {
      const edt = p({ brand: 'Rabanne', name: 'Invictus', concentration: 'Eau de Toilette', sizeMl: 50, ean: '3349668515653', shops: ['perfume-click'] });
      const edp = p({ brand: 'Rabanne', name: 'Invictus', concentration: 'Eau de Parfum', sizeMl: 50, ean: '3349668680993', shops: ['beautybase'] });
      expect(allApart([edt, edp], true)).toBe(true);
    });
  });
});
