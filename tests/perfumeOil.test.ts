import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { decodeSnapshot } from '../src/catalogue/store.js';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';
import { DEMO_FRAGRANCES } from '../demo/data.js';
import { isOil, isSet } from '../demo/productKind.js';
import { isCatalogueListing, isFragrance, sizeMl } from '../src/catalogue/fragranceId.js';
import { concentrationOfStoredListing } from '../src/catalogue/productName.js';
import {
  OILS_LEFT_OUT,
  isOilStrength,
  oilFactsOfListing,
  oilFactsOfOffers,
} from '../src/catalogue/perfumeOil.js';
import type { StoredListing } from '../src/catalogue/types.js';

/**
 * Oils, phase 2 of docs/GIFT-SETS-AND-OILS-PLAN.md, with the owner's answers of
 * 2026-10-05. The named titles are read from the shops' own stored listings
 * (data/catalogue), delisted ones included, so a title that has left a shop's
 * page still holds its place here.
 */
const root = resolve(import.meta.dirname, '..');

function stored(): StoredListing[] {
  const dir = resolve(root, 'data/catalogue');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => (decodeSnapshot(JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { listings: StoredListing[] })).listings);
}
const ALL = stored();
const CATALOGUE_SHOPS = (id: string): string[] => (CRAWLED[id] ?? []).map((o) => o.retailerId);
const find = (retailerId: string, title: string | RegExp): StoredListing[] =>
  ALL.filter((l) => l.retailerId === retailerId && (typeof title === 'string' ? l.rawTitle === title : title.test(l.rawTitle)));
const priced = (l: StoredListing): StoredListing => ({ ...l, priceGbp: l.priceGbp ?? 10 });
const strength = (l: StoredListing) => concentrationOfStoredListing(priced(l));
const kept = (l: StoredListing) => isCatalogueListing(priced(l));

describe('which listings are oils', () => {
  it('recovers the oils whose title names one in words and states a size', () => {
    const groups: [string, RegExp, number][] = [
      ['beautybase', /^Al Haramain .* Perfumed Oil \d+ml (?:Roll-On|Bottle)$/, 8],
      ['debenhams', /\b6ml Roll-On Oil\b/, 4],
      ['mybeauty-boutique', /^Armaf Club De Nuit Intense Concentrated Perfumed Oil 18ml$/, 1],
      ['perfume-click', /^Armaf Club De Nuit Intense Concentrated Perfumed Oil 18ml$/, 1],
    ];
    for (const [shop, re, atLeast] of groups) {
      const found = find(shop, re);
      expect(found.length, `${shop} ${re}`).toBeGreaterThanOrEqual(atLeast);
      for (const l of found) {
        expect(kept(l), l.rawTitle).toBe(true);
        expect(strength(l), l.rawTitle).toBe('Perfume Oil');
        expect(sizeMl(l.rawTitle, l.description), l.rawTitle).not.toBeNull();
      }
    }
  });

  it('files the three oils the plan found under another strength as oils: Al Rehab Roll On, Khadlaj, Blood Concept', () => {
    for (const [shop, re] of [
      ['debenhams', /^Oud & Rose 6ml Roll-On Oil$/],
      ['mybeauty-boutique', /^Khadlaj Perfumes Hareem Al Sultan Gold Concentrated Oil Perfume 35ml$/],
      ['mybeauty-boutique', /^Blood Concept Red\+MA Parfum Oil 40ml Dropper$/],
      ['perfume-click', /^Blood Concept \+MA Parfum Oil 40ml Dropper$/],
    ] as const) {
      const found = find(shop, re);
      expect(found.length, `${shop} ${re}`).toBeGreaterThan(0);
      expect(strength(found[0]!), found[0]!.rawTitle).toBe('Perfume Oil');
    }
  });

  it('counts the owner\'s reviewed oils: Ortigia\'s ten 10ml roll ons and Tauer\'s attar, and nothing else Nicchia files as body oil', () => {
    const ortigia10 = ALL.filter((l) => l.retailerId === 'nicchia-luxury-uk' && l.rawBrand === 'Ortigia' && /Perfume Oil roll-on 10 ml/.test(l.rawTitle));
    expect(ortigia10.length).toBeGreaterThanOrEqual(10);
    for (const l of ortigia10) {
      expect(kept(l), l.rawTitle).toBe(true);
      expect(strength(l)).toBe('Perfume Oil');
      expect(sizeMl(l.rawTitle, l.description)).toBe(10);
    }
    const tauer = find('nicchia-luxury-uk', 'Attar Perfume Oil 5 ml');
    expect(tauer.length).toBe(1);
    expect(kept(tauer[0]!)).toBe(true);
    // The 100ml Ortigia and Casa Amalfi's "Scented Oil Roll On" stay body oils, and out.
    for (const l of ALL.filter((x) => x.retailerId === 'nicchia-luxury-uk' && x.rawBrand === 'Ortigia' && / 100 ml$/.test(x.rawTitle) && /Perfume Oil/.test(x.rawTitle))) {
      expect(kept(l), l.rawTitle).toBe(false);
    }
    const casa = ALL.filter((l) => l.retailerId === 'nicchia-luxury-uk' && l.rawBrand === 'Casa Amalfi' && /Scented Oil Roll On/.test(l.rawTitle));
    expect(casa.length).toBeGreaterThanOrEqual(6);
    for (const l of casa) expect(kept(l), l.rawTitle).toBe(false);
  });

  it('leaves out, by name and with a reason, the oils whose size cannot be read', () => {
    expect(OILS_LEFT_OUT.length).toBeGreaterThan(0);
    for (const o of OILS_LEFT_OUT) {
      expect(o.reason.length, o.title).toBeGreaterThan(10);
      const found = find(o.retailerId, o.title);
      expect(found.length, `${o.retailerId}: ${o.title}`).toBeGreaterThan(0);
      for (const l of found) expect(kept(l), l.rawTitle).toBe(false);
    }
  });

  it('keeps out the bare word oil: body, hair, face, lip, home and incense', () => {
    for (const title of [
      'Nuxe Huile Prodigieuse Dry Oil Roll-On 60ml',
      'Elemis Pro-Collagen Marine Oil 15ml',
      'Percy & Reed Wonder Oil Elixir Drops 50ml',
      'L\'Oréal Professionnel Série Expert Metal Detox Concentrated Oil 50ml',
      'Fir Tree Fragrance Oil 10ml',
      'Al Haramain Oudh Ma\'Al Attar Bukhoor Incense 50g',
      'Sol de Janeiro Body Oil 100ml',
    ]) {
      const l = priced({ retailerId: 'beautybase', retailerSku: 'x', url: 'u', rawTitle: title, rawBrand: null, ean: null, imageUrl: null, priceGbp: 10, wasPriceGbp: null, promoEndsAt: null, inStock: true, sectionId: 's', firstSeenAt: '', lastSeenAt: '', status: 'active', delistedAt: null, relistedAt: null, eligibleForNewBadge: false, variantId: null } as StoredListing);
      expect(isFragrance(l), title).toBe(false);
    }
  });

  it('takes the scented body oil out of the bottle list', () => {
    const l = find('justmylook', /Satin Mood Scented Body Oil/);
    if (l.length === 0) return; // gone from the shop altogether
    for (const x of l) expect(kept(x), x.rawTitle).toBe(false);
    expect(CATALOGUE.find((c) => /Scented Body Oil/i.test(c.name) && !c.giftSet)).toBeUndefined();
  });

  it('never makes a rollerball spray an oil', () => {
    const sprays = ALL.filter((l) => /\b(roll[- ]?on|roller|rollerball)\b/i.test(l.rawTitle) && /\b(eau de (parfum|toilette)|edp|edt)\b/i.test(l.rawTitle) && !/\boil\b/i.test(l.rawTitle));
    expect(sprays.length).toBeGreaterThan(5);
    for (const l of sprays) expect(isOilStrength(strength(l)), l.rawTitle).toBe(false);
    // And in the catalogue itself: no bottle that names a rollerball is an oil.
    for (const f of DEMO_FRAGRANCES) {
      if (/roll[- ]?on|roller/i.test(f.name) && /eau de/i.test(f.concentration)) expect(isOil(f), f.name).toBe(false);
    }
  });
});

describe('what a shop states about an oil', () => {
  it('reads a roll on or a dropper from the title, then the description, and a title naming both is no statement', () => {
    expect(oilFactsOfListing('Musk Concentrated Perfume Oil 12ml Roll-On', null).format).toBe('roll-on');
    expect(oilFactsOfListing('Blood Concept +MA Parfum Oil 40ml Dropper', null).format).toBe('dropper');
    expect(oilFactsOfListing('Soft Al Rehab Perfume Oil 6ml', 'A sweet powdery roll on perfume oil').format).toBe('roll-on');
    expect(oilFactsOfListing('Oil 6ml Roll-On Dropper', 'a dropper').format).toBeNull();
    expect(oilFactsOfListing('Plain Perfume Oil 12ml', 'A rich blend of oud.').format).toBeNull();
  });

  it('does not take a rollerball or a roller pearl for a roll on', () => {
    expect(oilFactsOfListing('Eau de Parfum Rollerball 10ml', null).format).toBeNull();
    expect(oilFactsOfListing('Miss Dior Roller-Pearl 20ml', null).format).toBeNull();
    expect(oilFactsOfListing('Gold Perfume Oil Roller 10ml', null).format).toBe('roll-on');
  });

  it('reads alcohol free only where it is stated, in the title or the description, and never says false', () => {
    expect(oilFactsOfListing('Alcohol Free Perfume Oil 12ml', null).alcoholFree).toBe(true);
    expect(oilFactsOfListing('Perfume Oil 12ml', 'This oil is non alcoholic and long lasting.').alcoholFree).toBe(true);
    expect(oilFactsOfListing('Perfume Oil 12ml', 'Contains no water.').alcoholFree).toBe(false);
    const facts = oilFactsOfOffers([{ retailerId: 'a', rawTitle: 'Perfume Oil 12ml', description: 'Rich.' }]);
    expect(facts).toEqual({});
    expect('alcoholFree' in facts).toBe(false);
  });

  it('names the shop that said it, and drops a format two shops disagree on', () => {
    const roll = { retailerId: 'a', rawTitle: 'X Perfume Oil 6ml Roll-On', description: null };
    const drop = { retailerId: 'b', rawTitle: 'X Perfume Oil 6ml Dropper', description: 'alcohol free' };
    expect(oilFactsOfOffers([roll])).toEqual({ format: 'roll-on', formatBy: 'a' });
    expect(oilFactsOfOffers([roll, drop])).toEqual({ alcoholFree: true, alcoholFreeBy: 'b' });
  });
});

describe('the oils in the catalogue', () => {
  const oils = CATALOGUE.filter((c) => !c.giftSet && isOilStrength(c.concentration));

  it('are a few hundred, with the owner\'s fifteen Nicchia attars among them', () => {
    expect(oils.length).toBeGreaterThan(300);
    expect(oils.filter((c) => c.concentration === 'Attar').length).toBeGreaterThanOrEqual(15);
    expect(DEMO_FRAGRANCES.filter(isOil).length).toBe(oils.length);
  });

  it('carry an oil record, and nothing else does', () => {
    for (const c of CATALOGUE) {
      const oil = !c.giftSet && isOilStrength(c.concentration);
      expect(c.oil !== undefined, `${c.id} (${c.concentration})`).toBe(oil);
    }
  });

  it('state a format or alcohol free only with the shop that said so, a shop that has an offer', () => {
    let formats = 0;
    let free = 0;
    for (const c of oils) {
      const o = c.oil!;
      const shops = new Set(CATALOGUE_SHOPS(c.id));
      if (o.format) {
        formats += 1;
        expect(['roll-on', 'dropper']).toContain(o.format);
        expect(o.formatBy, c.id).toBeTruthy();
        expect(shops.has(o.formatBy!), `${c.id} ${o.formatBy}`).toBe(true);
      } else {
        expect(o.formatBy, c.id).toBeUndefined();
      }
      if (o.alcoholFree !== undefined) {
        free += 1;
        expect(o.alcoholFree).toBe(true);
        expect(shops.has(o.alcoholFreeBy!), `${c.id} ${o.alcoholFreeBy}`).toBe(true);
      }
    }
    expect(formats).toBeGreaterThan(30);
    expect(free).toBeGreaterThan(10);
  });

  it('are no set, and no bottle is an oil', () => {
    expect(DEMO_FRAGRANCES.filter((f) => isSet(f) && isOil(f))).toEqual([]);
    expect(DEMO_FRAGRANCES.filter((f) => !isOil(f) && !isSet(f) && isOilStrength(f.concentration))).toEqual([]);
  });
});
