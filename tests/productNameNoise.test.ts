import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { brandKey } from '../src/catalogue/brandName.js';
import { displayName } from '../src/catalogue/productName.js';
import { isWithdrawnByShop } from '../src/catalogue/fragranceId.js';

/**
 * Owner report, 2026-09-10: on the French Avenue brand page, four bottles each
 * appeared as two separate cards at the same 100ml EDP —
 *
 *   "Abraaj Brackish"                                   100ml EDP
 *   "Abraaj Brackish French Avenue | Aromatic Woody"    100ml EDP
 *
 * — two prices for one bottle, with no comparison between them, which is the
 * precise failure a price comparison exists to prevent. Three separate kinds
 * of rubbish were sitting in those names: a scent-family descriptor after a
 * pipe, the product's own brand mid-name, and free marketing copy. The owner's
 * words were "ensure it never happens again", and a strip alone cannot do
 * that: it fixes today's harvest and says nothing about the next shop that
 * arrives with the same habit.
 *
 * These tests are the "never again" half. They run over the built CATALOGUE —
 * the actual thing shipped to a reader, not a unit fixture — and fail if a
 * name carries the shape again. See stripTrailingNoiseSegment and
 * NAME_NOISE_SEGMENT_WORDS in src/catalogue/productName.ts for the strips
 * themselves and for the measured evidence behind each.
 *
 * WHEN A NEW SHOP OR BRAND MAKES THE "|" TEST FAIL (it has, each time a shop is
 * added): read each offender against the brand's own storefront first.
 *  - Shop layout rubbish ("Name | Shop Brand", "Name | Eau de Parfum", a scent
 *    family, stock or delivery copy): fix the cleaning in
 *    src/catalogue/productName.ts (or the shop's adapter), add a unit test for
 *    that pattern in tests/productName.test.ts, rebuild the generated files
 *    (CLAUDE.md item 3). Do not touch this list.
 *  - Part of the real name (the brand prints it so on its own page): add a
 *    narrow, brand held entry below with the date and the source, like (1e).
 *  Never loosen the test to a blanket pattern or skip it.
 */
/**
 * (2) A shop's own status, never a name. MyBeauty.Boutique published "Burberry
 * Weekend Edp 50ml Spray | DNL RECALLED" ("do not list", recalled), which read
 * "Weekend | DNL RECALLED" here until 2026-10-06 and was pinned as unfixable.
 * The listing is now kept out of the catalogue (isWithdrawnByShop in
 * src/catalogue/fragranceId.ts: the shop says it is not for sale), and the
 * status words come off any name all the same (NOISE_SEGMENT_STATUS_RE in
 * productName.ts). Nothing is pinned any more.
 */

describe('product names carry no shop descriptor rubbish', () => {
  it('is checking a real catalogue', () => {
    expect(CATALOGUE.length).toBeGreaterThan(1000);
  });

  /**
   * ── The allowlist, and what putting something on it means ─────────────────
   *
   * A "|" in a product name is noise by default, because in every shop
   * measured it is a shop's own layout convention — the scent family, the
   * stock qualifier, the house name repeated — and not part of what the bottle
   * is called. But it is NOT automatically noise, which is why this is an
   * allowlist and not a blanket ban in displayName: KAYALI names its own
   * Oudgasm line with a pipe and a number, on its own storefront.
   *
   * Adding an entry here is a claim that a person looked at the name and at
   * where it came from. Do not add one to make a failing test pass.
   *
   * Two entries, and they are on the list for opposite reasons, which the
   * sections below state plainly rather than blurring together.
   */

  /**
   * (1) VERIFIED REAL. KAYALI's Oudgasm line: "Oudgasm Vanilla Oud | 36",
   * "Oudgasm Café | 19", "Oudgasm Smoky | 07". The number after the pipe is
   * how the house distinguishes seven different fragrances from one another,
   * and the titles come from kayali.json — the brand's own storefront, not a
   * reseller's layout. 21 live products. Written as a pattern rather than 8
   * pinned strings so a new Oudgasm flanker does not fail this test for being
   * new, while anything that is not this exact shape still does.
   *
   * Changed 2026-10-04: the trailing word is "Intense", not "Miniature". A
   * Kayali 10ml bottle used to be named "... | 19 Miniature", the shop's size
   * label leaking into the name (see stripSizeLabel in fragranceId.ts); the
   * label is now read as the size. "Intense" is the shop's own strength,
   * "Eau de Parfum Intense", printed on its page: the catalogue keeps the
   * strength "Eau de Parfum" and leaves "Intense" in the name, as it does for
   * every other house's "Eau de Parfum Intense" (Armani Code Intense).
   */
  const REAL_PIPE_NAMES = /^Oudgasm .+\s\|\s\d{2}(?: Intense)?$/;

  /**
   * (1b) VERIFIED REAL, 2026-10-03. Kayali numbers every scent the same way,
   * not just Oudgasm: "Vanilla | 28", "Eden Sweet Peach | 35", "Musk | 12",
   * "The Wedding Silk Santal | 36". All 54 such names were read against
   * kayali.json (the brand's own storefront) when Kayali's full range was
   * admitted. Held to Kayali's own brand so the shape cannot excuse a
   * reseller's "Name | Note" layout anywhere else.
   */
  const KAYALI_PIPE_NAMES = /^[^|]+\s\|\s\d{2}(?: Intense)?$/;

  /**
   * (1c) VERIFIED REAL, 2026-10-03. Kayali's own sets, kept whole as gift
   * sets since that day (src/catalogue/giftSet.ts keeps a set's title rather
   * than trimming it like a single bottle's): the same scent number, then the
   * set's own name. Read against kayali.json: "Yum Boujee Marshmallow | 81
   * Sweet Fix", "Yum Pistachio Gelato | 33 The Full Serving", "Discovery
   * Layering Set | 04 8 x 1.5ml", "Vanilla Mini Duo (Vanilla | 28, Vanilla
   * Candy) 2 x 5ml". Held to Kayali's own gift sets.
   */
  const KAYALI_SET_PIPE_NAMES = /\s\|\s\d{2}\b/;

  /**
   * (1d) VERIFIED DISTINGUISHING, 2026-10-04. Bloom Perfumery titles its niche
   * houses "<line or name> | <scent, variant or translated name>": Brocard's
   * "Terra Incognita | Siberia" and "Scents of Nature | Tulip and Mimosa",
   * Commodity's "Book | Bold" and "Book | Personal", Comme Des Garcons'
   * "Series 3: Incense | Kyoto", Maison Matine's "Bain de Minuit | Skinny
   * Dipping", Etat Libre d'Orange's "I am Trash | Les Fleurs du Dechet", Ylem's
   * "NGC 6302 | Butterfly Nebula". All 46 were read against
   * data/catalogue/bloom-perfumery.json: each is that shop's own product title,
   * and its vendor is the house.
   *
   * What is verified is not that the pipe is the house's own punctuation (it is
   * a reseller's layout, and nothing here claims otherwise) but that the words
   * after it are what tells the bottles apart. "Terra Incognita | Siberia" and
   * "Terra Incognita | Secret Island" are two perfumes, and so are "Book | Bold"
   * and "Book | Personal"; the noise strips in displayName would, if they took
   * the segment, fold each group into one product and show one price for all of
   * them, which is the same harm this file exists to prevent from the other
   * side. So the pipe stays until a rule can re-punctuate it without losing a
   * word, and the test says so rather than pretending it is clean.
   *
   * Held to these houses and to one pipe with Latin text on both sides, so it
   * cannot excuse a reseller's "Name | Scent family" on any other house, and a
   * translation left in another script (the shop's other habit, which
   * stripTranslatedWords now takes off) still fails.
   */
  const TWO_PART_PIPE_HOUSES = new Set([
    'brocard',
    'commodity',
    'comme des garcons',
    "etat libre d'orange",
    'maison matine',
    'ylem',
  ]);
  /** The house name without accents, so "Comme Des Garçons" is the house listed as 'comme des garcons'. */
  const houseKey = (brand: string): string => brand.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const isTwoPartLatinPipe = (name: string): boolean =>
    /^[^|]*[^|\s]\s*\|\s*[^|\s][^|]*$/.test(name) && !/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(name);


  /**
   * (1e) VERIFIED REAL, 2026-10-09. VALJUES numbers every scent with its number
   * in words, and the brand's own storefront (valjues.com/products.json, read
   * 2026-10-09) titles them "4 | FOUR", "21 | TWENTY-ONE", "2 | TWO", "12 | TWELVE".
   * Parfumdreams' sample kits list them inside the set name: "Eau de Parfum
   * Spray 4 | Four 2 ml + Eau de Parfum Spray 6 | Six 2 ml + ...". The pipe is
   * the brand's own punctuation and the number tells the scents apart, so the
   * set's name keeps it. Held to VALJUES and to the shape "<number> | <that
   * number in letters>" for every pipe in the name, so any other pipe on this
   * brand still fails.
   */
  const VALJUES_NUMBER_WORDS = new Set([
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
    'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty', 'twenty-one', 'twenty-two',
  ]);
  const isValjuesNumberPipe = (brand: string, name: string): boolean => {
    if (brand.toLowerCase() !== 'valjues') return false;
    // Every pipe must sit as "<digits> | <number word>"; the name has at least one.
    const pipes = (name.match(/\|/g) ?? []).length;
    const ok = [...name.matchAll(/\b(\d{1,2})\s\|\s([A-Za-z]+(?:-[A-Za-z]+)?)\b/g)].filter((m) =>
      VALJUES_NUMBER_WORDS.has(m[2]!.toLowerCase()),
    );
    return pipes > 0 && ok.length === pipes;
  };

  it('has no "|" in a name outside the verified allowlist', () => {
    const offenders = CATALOGUE.filter(
      (p) =>
        p.name.includes('|') &&
        !REAL_PIPE_NAMES.test(p.name) &&
        !(p.brand.toLowerCase() === 'kayali' && KAYALI_PIPE_NAMES.test(p.name)) &&
        !(p.brand.toLowerCase() === 'kayali' && p.giftSet && KAYALI_SET_PIPE_NAMES.test(p.name)) &&
        !isValjuesNumberPipe(p.brand, p.name) &&
        !(TWO_PART_PIPE_HOUSES.has(houseKey(p.brand)) && isTwoPartLatinPipe(p.name)),
    ).map((p) => `${p.brand}: ${p.name}`);
    expect([...new Set(offenders)]).toEqual([]);
  });

  /**
   * The brand mid-name, in the one narrow shape that is reliably rubbish: the
   * product's own house sitting in the middle of its own name and immediately
   * followed by a separator — "Abraaj Brackish French Avenue | Aromatic
   * Woody", "Yara Lattafa | Sweet Vanilla". 78 live names before the fix.
   *
   * Deliberately NOT "the brand appears mid-name", which would be wrong 487
   * times over: "My Burberry Blush", "Mon Guerlain Intense", "Flower by Kenzo
   * Légère", "Terre d'Hermes Pure", "Miss Armaf Dazzling" and "Chloe by Chloe
   * Rollerball" all carry their own house's word in the middle of a name that
   * is genuinely spelled that way. The separator is what separates a shop's
   * layout from a house's naming, and it is the only thing this asserts on.
   *
   * Compared through brandKey, the same normalisation brandTitleEnds uses, so
   * a shop spelling the house "SwissArabian" in one title and "Swiss Arabian"
   * in the next cannot slip past on spacing.
   */
  it('has no name carrying its own brand immediately before a separator', () => {
    const offenders: string[] = [];
    for (const p of CATALOGUE) {
      const want = brandKey(p.brand);
      if (!want) continue;
      const tokens = [...p.name.matchAll(/[A-Za-z0-9]+/g)];
      for (let i = 1; i < tokens.length; i++) {
        let acc = '';
        for (let j = i; j < tokens.length; j++) {
          acc += brandKey(tokens[j]![0]);
          if (acc.length > want.length) break;
          if (acc !== want) continue;
          const after = p.name.slice(tokens[j]!.index! + tokens[j]![0].length);
          if (/^\s*\|/.test(after)) offenders.push(`${p.brand}: ${p.name}`);
          break;
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});

/**
 * The harm itself, stated as the owner sees it: one bottle, two rows.
 *
 * A plain "one name's words are a superset of another's" rule cannot be the
 * assertion — 6,132 pairs in the live catalogue are that shape and almost all
 * are real: "Club De Nuit" and "Club De Nuit Intense" are two different
 * Armaf fragrances, not one listed twice. So this narrows to the pairs this
 * class of bug actually creates: same brand, same size, same concentration,
 * one name a strict word-superset of the other, the longer name carrying a
 * pipe, AND every extra word coming either from that pipe segment or from the
 * product's own brand. That is "the same bottle, plus a shop's descriptor and
 * the house it already names" and nothing else — both halves are needed,
 * because the owner's own example carries both at once ("Abraaj Brackish"
 * beside "Abraaj Brackish French Avenue | Aromatic Woody", where "French
 * Avenue" is the brand and "Aromatic Woody" the segment).
 *
 * 63 such pairs before the fix — every one of the French Avenue Abraaj pairs
 * in the owner's report among them — and 0 after. What it would catch: a new
 * shop arriving with the same "| <scent family>" habit on a bottle another
 * shop already lists plainly, which is exactly how this bug got here.
 *
 * What it deliberately does not claim to cover: 216 further superset pairs
 * remain, caused by a different defect — a title opening with a spelling of
 * the brand the vendor field does not carry, so brandTitleOpens declines to
 * strip it ("Armani Code" beside "Code", "Boss Bottled" beside "Bottled").
 * That is the prefix case brandTitleOpens' own comment refuses on measured
 * evidence, and it is not this fix's to settle; pretending this test covers
 * it would be worse than saying so.
 */
describe('no bottle appears twice because a shop added a descriptor', () => {
  it('has no pair differing only by a pipe segment', () => {
    const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const groups = new Map<string, typeof CATALOGUE>();
    for (const p of CATALOGUE) {
      const key = `${brandKey(p.brand)}|${p.sizeMl}|${p.concentration}`;
      const g = groups.get(key) ?? [];
      g.push(p);
      groups.set(key, g);
    }

    const offenders: string[] = [];
    for (const group of groups.values()) {
      for (const longer of group) {
        const at = longer.name.indexOf('|');
        if (at < 0) continue;
        const extra = words(longer.name);
        const segment = words(longer.name.slice(at));
        for (const w of words(longer.brand)) segment.add(w);
        for (const shorter of group) {
          if (shorter === longer) continue;
          const base = words(shorter.name);
          if (base.size >= extra.size) continue;
          if ([...base].some((w) => !extra.has(w))) continue;
          if ([...extra].some((w) => !base.has(w) && !segment.has(w))) continue;
          offenders.push(`${longer.brand}: ${JSON.stringify(shorter.name)} vs ${JSON.stringify(longer.name)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('a shop\'s marketing or status after a pipe', () => {
  it('takes "| Unisex Fragrance" off a name', () => {
    // Debenhams' own title, data/catalogue/debenhams.json, 2026-10-06.
    expect(displayName('Farwah Oriental Eau De Parfum | Unisex Fragrance 100 ml', 'Maryaj', 'Maryaj')).toBe('Farwah Oriental');
  });

  it('never leaves a recall status in a name', () => {
    expect(displayName('Burberry Weekend Edp 50ml Spray | DNL RECALLED', 'Burberry', 'Burberry')).toBe('Weekend');
    for (const p of CATALOGUE) expect(p.name, p.name).not.toMatch(/\brecalled\b|\|\s*dnl\b/i);
  });

  it('keeps a listing its shop marks recalled or not to be listed out of the catalogue', () => {
    expect(isWithdrawnByShop('Burberry Weekend Edp 50ml Spray | DNL RECALLED')).toBe(true);
    expect(isWithdrawnByShop("Mane 'n Tail Original Conditioner 355 ml | DNL RECALLED")).toBe(true);
    expect(isWithdrawnByShop('Example Scent Eau de Parfum 50ml | Do Not List')).toBe(true);
    // Words that only look like it.
    expect(isWithdrawnByShop('Burberry Weekend Eau de Parfum 50ml')).toBe(false);
    expect(isWithdrawnByShop('Dnl Example Eau de Parfum 50ml')).toBe(false);
  });
});
