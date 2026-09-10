import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { brandKey } from '../src/catalogue/brandName.js';

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
   */
  const REAL_PIPE_NAMES = /^Oudgasm .+\s\|\s\d{2}(?: Miniature)?$/;

  /**
   * (2) VERIFIED NOISE, no safe rule. mybeauty-boutique publishes "Weekend |
   * DNL RECALLED" for Burberry Weekend — a shop's internal status code that
   * reached its public title. It is rubbish, it is one product, and nothing
   * about it generalises: there is no vocabulary to put "DNL" in and no shape
   * to match that would not also match a real name. Pinned by its exact
   * string, so if that shop's habit spreads to a second product this test
   * fails and someone has to look, which is the point.
   */
  const KNOWN_UNFIXED_PIPE_NAMES = new Set(['Weekend | DNL RECALLED']);

  it('has no "|" in a name outside the verified allowlist', () => {
    const offenders = CATALOGUE.filter(
      (p) =>
        p.name.includes('|') &&
        !REAL_PIPE_NAMES.test(p.name) &&
        !KNOWN_UNFIXED_PIPE_NAMES.has(p.name),
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
