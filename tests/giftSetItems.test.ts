import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { giftSetContents, isGiftSet } from '../src/catalogue/giftSet.js';
import { isCatalogueListing } from '../src/catalogue/fragranceId.js';
import {
  boxKinds,
  itemString,
  itemsFromDescription,
  itemsFromTitle,
  mainMl,
  mergeSame,
  parseContents,
  readGiftSet,
} from '../src/catalogue/giftSetItems.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * What is in a set: docs/GIFT-SETS-AND-OILS-PLAN.md, section 3.2, phase 3. Every
 * title below is a real one from a shop's stored listings (data/catalogue), read
 * on 2026-10-05.
 */
const TITLES: [title: string, contents: string[] | null, mainMl: number | null, bundle: boolean][] = [
    ["Lancome La Vie Est Belle L’Elixir EDP Spray 50ml & Miracle EDP Spray 100ml Luxury Perfume Bundle for Her", ["50ml Eau de Parfum","100ml Eau de Parfum"], 100, true],
    ["Escentric 05 ATOM.iser. Set 3 x 8.5ml, 1 x ATOM.iser", ["3 x 8.5ml"], null, false],
    ["Missoni Missoni Wave Gift Set 100ml EDT + 100ml Shower Gel + 100ml Aftershave Balm", ["100ml Eau de Toilette","100ml Shower Gel","100ml Aftershave Balm"], 100, false],
    ["Jimmy Choo I Want Choo Eau de Parfum Spray 60ml Gift Set 60ml", null, 60, false],
    ["Sarah Jessica Parker Lovely You Gift Set 100ml EDP + 10ml EDP + Bag", ["100ml Eau de Parfum","10ml Eau de Parfum","Bag"], 100, false],
    ["Ariana Grande Mod Blush Eau De Parfum 30ml & Body Mist 236ml Bundle", ["30ml Eau de Parfum","236ml Body Mist"], 30, true],
    ["Colour Me Green Gift Set 50ml EDT Spray + 10ml Roll-on Perfume", ["50ml Eau de Toilette","10ml Perfume"], 50, false],
    ["Ysl Libre 2 Pcs Set For Women: 3 Oz Eau De Parfum Spray + 0.34 Eau De Parfum Spray", ["90ml Eau de Parfum","2 pieces"], 90, false],
    ["Al Haramain Majmuath Al Arab Eau de Parfum for Men 3 x 55ml", ["3 x 55ml Eau de Parfum"], 55, false],
    ["Gucci Guilty Pour Femme Women's Perfume Gift Set (90ml EDP + 10ml EDP)", ["90ml Eau de Parfum","10ml Eau de Parfum"], 90, false],
    ["Valentino Born in Roma Donna Eau De Parfum 50ml & Travel Spray 10ml Gift Set", ["50ml Eau de Parfum","10ml Travel Spray"], 50, false],
    ["Summer Bundle - RiFFS Freeze Extrait De Parfum 100ml Spray & Rayhaan Aquatica Eau De Parfum 100ml Spray & Lattafa Opulent Dubai Eau De Parfum 100ml Spray", ["100ml Extrait de Parfum","2 x 100ml Eau de Parfum"], 100, true],
    ["Paco Rabanne Invictus Gift Set 100ml EDT + 10ml EDT", ["100ml Eau de Toilette","10ml Eau de Toilette"], 100, false],
    ["Thameen Britologne Collection Discovery Set Eau de Cologne 3x10ml", ["3 x 10ml Eau de Cologne"], 10, false],
    ["Pink Sugar 2 Pcs Set For Women: 3.4 Eau De Toilette Spray + 3.4 Shower Gel", ["Shower Gel","2 pieces"], null, false],
    ["Carolina Herrera Confidential Giftset - 4x4ml Orange Affair EDT Splash - Bergamot Bloom EDT Splash - Vetiver Paradise EDT Splash - Rose Cruise EDT Splash", ["4 x 4ml Eau de Toilette"], 4, false],
    ["Michael Kors Gorgeous Gift Set EDP 100ml +  B/Lotion 100ml + S/Gel 100ml + EDP 5ml", ["100ml Eau de Parfum","100ml Body Lotion","100ml Shower Gel","5ml Eau de Parfum"], 100, false],
    ["KAYALI Tutti Fruity Cotton Candy 50ml (Eden Sparkling Lychee | 39 + Vanilla Candy Rock Sugar | 42)", ["2 x 50ml"], 50, false],
    ["Creed Women's Gift Set 10ml Aventus for Her EDP + 10ml Wind Flowers EDP + 10ml Royal Princess Oud EDP + 10ml Spring Flower EDP + 10ml Carmina EDP", ["5 x 10ml Eau de Parfum"], 10, false],
    ["Hermes Terre d'Hermes Eau de Toilette Gift Set 100ml", null, 100, false],
    ["Lattafa Art Of Universe Eau De Parfum 100ml & Eau De Parfume 20ml, Body Spray 200ml Gift Set", ["100ml Eau de Parfum","20ml Eau de Parfum","200ml Body Spray"], 100, false],
    ["Thierry Mugler Eau de Parfum Women's Miniatures Gift Set (2 x 6ml)", ["2 x 6ml Eau de Parfum"], 6, false],
    ["Guess Seductive Gift Set 75ml EDT + 15ml EDT + 100ml Body Lotion + Toiletry Bag", ["75ml Eau de Toilette","15ml Eau de Toilette","100ml Body Lotion","Toiletry Bag"], 75, false],
    ["Hugo Boss The Scent for Him Eau de Toilette Men's Aftershave Gift Set Spray (100ml) with Shower Gel and 10ml EDT", ["100ml Eau de Toilette","Shower Gel","10ml Eau de Toilette"], 100, false],
    ["Dolce&Gabbana Light Blue Pour Homme Eau de Toilette Trio Gift Set", ["3 pieces"], null, true],
    ["Maison Francis Kurkdjian Baccarat Rouge 540 Travel Refills 3 Piece Gift Set: Extrait de Parfum 3 x 11ml", ["3 x 11ml Extrait de Parfum"], 11, false],
    ["Cochine Discovery Collection 5 x 1.8ml EDP", ["5 x 1.8ml Eau de Parfum"], 1.8, false],
    ["Mäurer & Wirtz 4711 Gift Set 10 x 3ml EDC", ["10 x 3ml Eau de Cologne"], 3, false],
    ["Terre d`Hermès Eau de Toilette Gift Set 2 x 50ml EDT", ["2 x 50ml Eau de Toilette"], 50, false],
    ["Elizabeth Arden 3 * 0.33 Eau De Toilette Spray Set For Women: Red Door + White Tea + Green Tea", ["3 x Eau de Toilette"], null, false],
    ["Coty Gravity 2 Piece Gift Set: Dark Gravity Cologne 100ml - Defy Gravity Cologne 30ml", ["100ml Cologne","30ml Cologne"], 100, true],
    ["Calvin Klein CK One Gift Set 200ml EDT + 50ml EDT", ["200ml Eau de Toilette","50ml Eau de Toilette"], 200, false],
    ["Far Away Glamour Perfume Duo", ["2 pieces"], null, true],
    ["Club De Nuit Parfum Three Piece Giftset For Men", ["3 pieces"], null, false],
    ["Escentric 02 Gift Set 100ml", null, null, false],
    ["Firetrap Oura Eau De Toilette 50ml & Bodywash 150ml", ["50ml Eau de Toilette","150ml Body Wash"], 50, false],
    ["Pride No.1 Gift Set by Lattafa 5X20ml Eau De Parfum", ["5 x 20ml Eau de Parfum"], 20, false],
    ["Azzaro Forever Wanted Elixir 100ml Parfum + 2x 10ml Set", ["100ml Parfum","2 x 10ml Parfum"], 100, false],
    ["Musamam White Intense Perfume 3pcs Unisex Gift Set", ["3 pieces"], null, false],
    ["Guerlain Shalimar 50ml Eau de Parfum Set", null, 50, false],
    ["Ard Al Zaafaran Turab Al Dhahab 3 Piece Gift Set: Eau De Parfum 100ml - Perfume Mist 250ml - Air Freshner 300ml", ["100ml Eau de Parfum","250ml Perfume Mist","300ml Air Freshener"], 100, false],
    ["Al Haramain Amber Oud Gold Edition Unisex Perfume Gift Set 75ml + 30ml + 250ml", ["75ml Perfume","30ml Perfume","250ml"], 75, false],
    ["Floris Jermyn Street Discovery Collection Gift Set 5 Pieces (1x 2ml JF EDT 1x 2ml Santal EDT 1x 2ml Jermyn Street EDT 1x 2ml Elite EDT 1x 2ml No. 89 EDT)", ["5 x 2ml Eau de Toilette"], 2, false],
    ["Dolce & Gabbana K 100ml Eau de Parfum Intense + 10ml Set", ["100ml Eau de Parfum Intense","10ml Eau de Parfum Intense"], 100, false],
    ["Bvlgari Man In Black 100ml + 15ml Eau de Parfum Gift Set", ["100ml Eau de Parfum","15ml Eau de Parfum"], 100, false],
    ["Mugler Angel Eau De Parfum 50ml & Travel Size 10ml & Body Lotion 50ml Gift Set", ["50ml Eau de Parfum","10ml Travel Size","50ml Body Lotion"], 50, false],
    ["Acqua Di Parma Mediterraneo Discovery Eau de Toilette Unisex Gift Set (3 x 12ml)", ["3 x 12ml Eau de Toilette"], 12, false],
];

describe('what a set title says is in the box', () => {
  it('reads each of forty five real titles to its items, its main bottle and whether it is a bundle', () => {
    expect(TITLES.length).toBeGreaterThanOrEqual(40);
    for (const [title, contents, main, bundle] of TITLES) {
      const got = readGiftSet({ rawTitle: title });
      expect(got.contents, title).toEqual(contents);
      expect(got.mainMl, title).toBe(main);
      expect(got.bundle, title).toBe(bundle);
      // The list the page shows is the one giftSetContents has always been.
      expect(giftSetContents(title), title).toEqual(contents);
    }
  });

  it('states a count only where the text states it', () => {
    // "Duo", "Trio" and "Three Piece" state two and three things; nothing says what they are.
    expect(itemsFromTitle('Far Away Glamour Perfume Duo')).toMatchObject([{ count: 2, pieces: true }]);
    expect(itemsFromTitle('Dolce&Gabbana Light Blue Pour Homme Eau de Toilette Trio Gift Set')).toMatchObject([{ count: 3, pieces: true }]);
    expect(itemsFromTitle('Club De Nuit Parfum Three Piece Giftset For Men')).toMatchObject([{ count: 3, pieces: true }]);
    // One bottle and a "Gift Set" says nothing of the rest of the box: no count, no list.
    expect(giftSetContents('Guerlain Shalimar 50ml Eau de Parfum Set')).toBeNull();
    // Names joined by "and" are not turned into a count the title does not state.
    expect(readGiftSet({ rawTitle: 'Liquid Brun and Amber Empire EDP 100ml Bundle' }).contents).toBeNull();
  });

  it('never turns a size with no unit into millilitres, and converts an ounce size only where the unit is there', () => {
    expect(itemsFromTitle('Pink Sugar 2 Pcs Set For Women: 3.4 Eau De Toilette Spray + 3.4 Shower Gel').map(itemString)).toEqual(['Shower Gel', '2 pieces']);
    expect(itemsFromTitle('Ysl Libre 2 Pcs Set For Women: 3 Oz Eau De Parfum Spray + 0.34 Eau De Parfum Spray').map(itemString)[0]).toBe('90ml Eau de Parfum');
  });

  it('gives a bare size the item word nearest it, from the bottle before it, and leaves the one it cannot place bare', () => {
    expect(giftSetContents('Dolce & Gabbana K 100ml Eau de Parfum Intense + 10ml Set')).toEqual(['100ml Eau de Parfum Intense', '10ml Eau de Parfum Intense']);
    expect(giftSetContents('Bvlgari Man In Black 100ml + 15ml Eau de Parfum Gift Set')).toEqual(['100ml Eau de Parfum', '15ml Eau de Parfum']);
    // The 250ml is bigger than the perfume before it and is not said to be perfume.
    expect(giftSetContents('Al Haramain Amber Oud Gold Edition Unisex Perfume Gift Set 75ml + 30ml + 250ml')).toEqual(['75ml Perfume', '30ml Perfume', '250ml']);
  });

  it('puts a perfume mist and an air freshener among the items, and reads the Turab Al Dhahab set as what it holds', () => {
    expect(giftSetContents('Ard Al Zaafaran Turab Al Dhahab 3 Piece Gift Set: Eau De Parfum 100ml - Perfume Mist 250ml - Air Freshner 300ml')).toEqual([
      '100ml Eau de Parfum', '250ml Perfume Mist', '300ml Air Freshener',
    ]);
  });
});

describe('items and the strings that show them', () => {
  it('read back from the strings to the same items, so the page and the filters need nothing else stored', () => {
    for (const [title, contents] of TITLES) {
      if (!contents) continue;
      const items = itemsFromTitle(title);
      expect(parseContents(contents).map(itemString), title).toEqual(contents);
      // The kinds survive the round trip for every labelled item.
      for (const [k, parsed] of parseContents(contents).entries()) {
        if (items[k]?.label && !items[k]!.pieces) expect(parsed.kind, `${title}: ${contents[k]}`).toBe(items[k]!.kind);
      }
    }
  });

  it('tells a lotion from a shower gel from a deodorant, and finds the main bottle among them', () => {
    const items = parseContents(['100ml Eau de Toilette', '10ml Travel Spray', '150ml Body Wash', '75ml Body Lotion', '150ml Deodorant']);
    expect(items.map((i) => i.kind)).toEqual(['fragrance', 'travel', 'wash', 'body', 'deo']);
    expect(mainMl(items)).toBe(100);
    expect(boxKinds(items).sort()).toEqual(['body', 'deo', 'fragrance', 'travel', 'wash']);
  });

  it('puts identical items in a row together with a count, only where they say what they are', () => {
    const one = { count: null, ml: 9, kind: 'fragrance' as const, label: 'Cologne' };
    expect(mergeSame([one, one, one]).map(itemString)).toEqual(['3 x 9ml Cologne']);
    const bare = { count: null, ml: 9, kind: null, label: null };
    expect(mergeSame([bare, bare]).map(itemString)).toEqual(['9ml', '9ml']);
  });
});

describe('what a shop\'s own description lists', () => {
  const find = (shop: string, re: RegExp): StoredListing | undefined => {
    const dir = resolve(import.meta.dirname, '../data/catalogue');
    const file = resolve(dir, `${shop}.json`);
    if (!existsSync(file)) return undefined;
    const snap = JSON.parse(readFileSync(file, 'utf8')) as { listings: StoredListing[] };
    return snap.listings.find((l) => re.test(l.rawTitle) && l.description);
  };

  it('reads John Lewis\'s "Set contains" list', () => {
    // The shop's text as it stood on 5 Oct 2026, pinned: the live listing is rewritten by the crawl.
    const description =
      'Versace Crystal Noir is a sumptuous fragrance. Set contains: Crystal Noir Eau de Parfum, 90ml Crystal Noir Body Lotion, 100ml Crystal Noir Shower Gel, 100ml Crystal Noir Eau de Parfum, Mini, 5ml';
    expect(readGiftSet({ rawTitle: 'Versace Crystal Noir Eau de Parfum 90ml Fragrance Gift Set', description })).toMatchObject({
      contents: ['90ml Eau de Parfum', '100ml Body Lotion', '100ml Shower Gel', '5ml Miniature'],
      from: 'description',
      mainMl: 90,
    });
  });

  it('reads Kayali\'s bulleted list, with the balm in grams and no size of its own', () => {
    const l = find('kayali', /^Yummy Gelato Kiss Set$/);
    if (!l) return;
    expect(readGiftSet({ rawTitle: l.rawTitle, description: l.description ?? null, productType: l.productType ?? null })).toMatchObject({
      contents: ['10ml Eau de Parfum', 'Lip Balm'],
      from: 'description',
    });
  });

  it('reads a list in the form "1 x Name (100ml)" and "Name, 90ml Name, 100ml"', () => {
    expect(itemsFromDescription('Collection Contains: 1 x Fierce Eau De Cologne (100ml) - a woody aromatic. 1 x Fierce Travel Spray (10ml) - for on the go.').map(itemString)).toEqual([
      '100ml Eau de Cologne', '10ml Travel Spray',
    ]);
    expect(itemsFromDescription('Set contains: Crystal Noir Eau de Parfum, 90ml Crystal Noir Bath & Shower Gel, 100ml').map(itemString)).toEqual([
      '90ml Eau de Parfum', '100ml Bath and Shower Gel',
    ]);
  });

  it('says nothing for a description that lists nothing', () => {
    expect(itemsFromDescription('A fresh, uplifting scent for every day. Contains notes of bergamot.')).toEqual([]);
    expect(itemsFromDescription(null)).toEqual([]);
  });

  it('is used only where it names more things than the title does', () => {
    const d = 'Set contains: Crystal Noir Eau de Parfum, 90ml Crystal Noir Bath & Shower Gel, 100ml';
    expect(readGiftSet({ rawTitle: 'X Gift Set 100ml EDP + 10ml EDP + 50ml Body Lotion', description: d }).from).toBe('title');
    expect(readGiftSet({ rawTitle: 'X Eau de Parfum 90ml Fragrance Gift Set', description: d }).from).toBe('description');
  });
});

describe('bundles', () => {
  it('are sets the shop\'s category, the title or two different full size bottles call a bundle', () => {
    expect(readGiftSet({ rawTitle: 'Fruit Crush 100ml', productType: 'Bundles' }).bundle).toBe(true);
    expect(readGiftSet({ rawTitle: 'Fruit Crush 100ml', productType: 'Bundle' }).bundle).toBe(true);
    expect(readGiftSet({ rawTitle: 'Dusk Till Dawn Set EDP 2x100ml' }).bundle).toBe(false);
    expect(readGiftSet({ rawTitle: 'Liquid Brun and Vulcan Feu Bundle - Dusk Till Dawn Set EDP 100ml' }).bundle).toBe(true);
    // Two sizes of one scent are a gift set, two scents at full size a bundle.
    expect(readGiftSet({ rawTitle: 'Calvin Klein CK One Gift Set 200ml EDT + 50ml EDT' }).bundle).toBe(false);
    expect(readGiftSet({ rawTitle: 'Coty Gravity 2 Piece Gift Set: Dark Gravity Cologne 100ml - Defy Gravity Cologne 30ml' }).bundle).toBe(true);
    expect(readGiftSet({ rawTitle: 'Creed Women\'s Gift Set 10ml Aventus for Her EDP + 10ml Wind Flowers EDP' }).bundle).toBe(false);
  });
});

describe('the sets in the catalogue', () => {
  const sets = CATALOGUE.filter((c) => c.giftSet);
  const quality = (c: string[] | null | undefined): string => {
    if (!c || c.length === 0) return 'none';
    const bare = c.some((i) => /^[\d.]+ ?ml$/i.test(i.trim()));
    if (c.length === 1) return 'one';
    return bare ? 'bare' : 'good';
  };

  it('have far fewer nameless items than the 326 they had, and more that say what each item is than the 1,221 they had', () => {
    const bare = sets.filter((c) => quality(c.giftSet!.contents) === 'bare').length;
    const good = sets.filter((c) => quality(c.giftSet!.contents) === 'good').length;
    expect(bare).toBeLessThan(120);
    expect(good).toBeGreaterThan(1400);
  });

  it('keep every list a title gave them, and carry a main bottle where one is stated', () => {
    for (const c of sets) {
      const old = giftSetContents(c.giftSet!.title);
      if (old) expect(c.giftSet!.contents, c.giftSet!.title).not.toBeNull();
      if (c.giftSet!.contents) expect(c.giftSet!.contents.length).toBeGreaterThan(0);
      const m = c.giftSet!.mainMl;
      if (m !== undefined) expect(m).toBeGreaterThan(0);
    }
    expect(sets.filter((c) => c.giftSet!.mainMl !== undefined).length).toBeGreaterThan(sets.length * 0.7);
  });

  it('mark every set whose name says bundle as one, and every other flag as true or absent', () => {
    for (const c of sets) {
      if (/\bbundles?\b/i.test(c.giftSet!.title)) expect(c.giftSet!.bundle, c.giftSet!.title).toBe(true);
      expect([undefined, true]).toContain(c.giftSet!.bundle);
      expect([undefined, 'description']).toContain(c.giftSet!.from);
    }
    expect(sets.filter((c) => c.giftSet!.bundle).length).toBeGreaterThan(60);
  });

  it('mark every Kayali, Escentric and other listing the shop files under Bundle or Bundles as a bundle', () => {
    const dir = resolve(import.meta.dirname, '../data/catalogue');
    if (!existsSync(dir)) return;
    let seen = 0;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const snap = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { listings: StoredListing[] };
      for (const l of snap.listings) {
        if (l.status !== 'active' || !l.productType || !/^\s*bundles?\s*$/i.test(l.productType)) continue;
        if (!isCatalogueListing({ ...l, priceGbp: l.priceGbp ?? 1 }) || !isGiftSet(l)) continue;
        seen += 1;
        expect(readGiftSet(l).bundle, `${f}: ${l.rawTitle}`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });
});
