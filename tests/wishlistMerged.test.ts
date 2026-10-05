import { describe, expect, it } from 'vitest';
import { groupWishlist, resolveFragranceId, type ResolvableWishlistRow } from '../src/services/wishlistResolve.js';
import { planRun, type PriceLookup, type Recipient, type WishlistItem } from '../src/alerts/run.js';
import { ID_ALIASES } from '../demo/dormant.generated.js';
import { fragranceById } from '../demo/data.js';

/**
 * Saved perfumes whose product id was later merged into another
 * (data/id-aliases.json, ID_ALIASES in demo/dormant.generated.ts). The
 * examples are the stored ones: real absorbed ids and the real survivors the
 * catalogue holds today. The browser half is tests/wishlistMergedBrowser.test.ts.
 */

const isLive = (id: string) => fragranceById(id) !== undefined;

// Armaf Shades 100ml absorbed two ids: a shop's own SKU and a Shopify variant.
const SURVIVOR = 'ean-6085010092058';
const ABSORBED_A = 'armaf-arf32101043';
const ABSORBED_B = 'mybeauty-boutique-shopify-gb-8416634667145-45146964885641';
// Another product, so grouping is shown to keep different products apart.
const OTHER_SURVIVOR = 'ean-6291100137565';
const OTHER_ABSORBED = 'al-haramain-ahp1908';
const GONE = 'fu-no-such-product-ever-listed';

const row = (fragranceId: string, addedAt: string, saved: number | null = null, target: number | null = null): ResolvableWishlistRow => ({
  fragranceId,
  addedAt,
  savedPriceGbp: saved,
  targetPriceGbp: target,
});

describe('the stored examples are what the test says they are', () => {
  it('the absorbed ids are aliases and their survivors are live products', () => {
    expect(ID_ALIASES[ABSORBED_A]).toBe(SURVIVOR);
    expect(ID_ALIASES[ABSORBED_B]).toBe(SURVIVOR);
    expect(ID_ALIASES[OTHER_ABSORBED]).toBe(OTHER_SURVIVOR);
    expect(isLive(SURVIVOR)).toBe(true);
    expect(isLive(OTHER_SURVIVOR)).toBe(true);
    expect(isLive(ABSORBED_A)).toBe(false);
    expect(isLive(GONE)).toBe(false);
    expect(GONE in ID_ALIASES).toBe(false);
  });
});

describe('resolveFragranceId', () => {
  it('an absorbed id resolves to the product that holds it now', () => {
    expect(resolveFragranceId(ABSORBED_A, ID_ALIASES, isLive)).toBe(SURVIVOR);
    expect(resolveFragranceId(ABSORBED_B, ID_ALIASES, isLive)).toBe(SURVIVOR);
    expect(resolveFragranceId(OTHER_ABSORBED, ID_ALIASES, isLive)).toBe(OTHER_SURVIVOR);
  });

  it('a live id is its own answer', () => {
    expect(resolveFragranceId(SURVIVOR, ID_ALIASES, isLive)).toBe(SURVIVOR);
  });

  it('a chain of two merges resolves to the final survivor', () => {
    // An older id that was folded into ABSORBED_A, which was then folded into SURVIVOR.
    const chained: Record<string, string> = { ...ID_ALIASES, 'fu-older-id': ABSORBED_A };
    expect(chained['fu-older-id']).toBe(ABSORBED_A);
    expect(chained[ABSORBED_A]).toBe(SURVIVOR);
    expect(resolveFragranceId('fu-older-id', chained, isLive)).toBe(SURVIVOR);
  });

  it('an unknown id resolves to nothing, and so does one whose merges lead nowhere', () => {
    expect(resolveFragranceId(GONE, ID_ALIASES, isLive)).toBeNull();
    expect(resolveFragranceId('fu-a', { 'fu-a': 'fu-b', 'fu-b': 'fu-c' }, isLive)).toBeNull();
  });

  it('a loop in a bad file ends instead of hanging', () => {
    expect(resolveFragranceId('fu-a', { 'fu-a': 'fu-b', 'fu-b': 'fu-a' }, isLive)).toBeNull();
    expect(resolveFragranceId('fu-a', { 'fu-a': 'fu-a' }, isLive)).toBeNull();
  });

  it('with no merge map only an id that exists resolves', () => {
    expect(resolveFragranceId(ABSORBED_A, null, isLive)).toBeNull();
    expect(resolveFragranceId(SURVIVOR, null, isLive)).toBe(SURVIVOR);
  });

  it('an id is never read as a prototype name', () => {
    expect(resolveFragranceId('constructor', ID_ALIASES, isLive)).toBeNull();
    expect(resolveFragranceId('__proto__', ID_ALIASES, isLive)).toBeNull();
  });
});

describe('groupWishlist', () => {
  it('a merged id is one line, read as the survivor, with the row left as saved', () => {
    const rows = [row(ABSORBED_A, '2026-09-01T09:00:00Z', 60, 40)];
    const lines = groupWishlist(rows, ID_ALIASES, isLive);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.id).toBe(SURVIVOR);
    expect(lines[0]!.merged).toBe(true);
    expect(lines[0]!.combined).toBe(false);
    expect(lines[0]!.primary.fragranceId).toBe(ABSORBED_A); // the stored id is not rewritten
    expect(rows[0]!.fragranceId).toBe(ABSORBED_A);
  });

  it('the saved price recorded against the old id stays the baseline', () => {
    const lines = groupWishlist([row(ABSORBED_A, '2026-09-01T09:00:00Z', 61.5)], ID_ALIASES, isLive);
    expect(lines[0]!.savedPriceGbp).toBe(61.5);
  });

  it('a product that no longer exists is its own line with no id, one per row', () => {
    const lines = groupWishlist([row(GONE, '2026-09-01T09:00:00Z', 20), row('fu-also-gone', '2026-09-02T09:00:00Z')], ID_ALIASES, isLive);
    expect(lines.map((l) => l.id)).toEqual([null, null]);
    expect(lines[0]!.primary.fragranceId).toBe(GONE);
    expect(lines[0]!.merged).toBe(false);
  });

  it('two saved ids that merged into one product show once, and no row is dropped', () => {
    const rows = [
      row(ABSORBED_B, '2026-10-01T09:00:00Z', 55, null),
      row(ABSORBED_A, '2026-09-01T09:00:00Z', null, 45),
      row(OTHER_ABSORBED, '2026-09-15T09:00:00Z'),
    ];
    const lines = groupWishlist(rows, ID_ALIASES, isLive);
    expect(lines.map((l) => l.id)).toEqual([SURVIVOR, OTHER_SURVIVOR]);
    const shades = lines[0]!;
    expect(shades.combined).toBe(true);
    expect(shades.merged).toBe(true);
    expect(shades.rows.map((r) => r.fragranceId).sort()).toEqual([ABSORBED_A, ABSORBED_B].sort());
    // The oldest save leads; its price was never recorded, so the earliest one that was is the baseline.
    expect(shades.primary.fragranceId).toBe(ABSORBED_A);
    expect(shades.savedPriceGbp).toBe(55);
    expect(shades.targetPriceGbp).toBe(45);
    expect(rows).toHaveLength(3);
  });

  it('a saved id and an absorbed id of the same product are one line, not marked merged when only the live id was saved twice', () => {
    const lines = groupWishlist([row(SURVIVOR, '2026-09-01T09:00:00Z'), row(ABSORBED_A, '2026-09-02T09:00:00Z')], ID_ALIASES, isLive);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.merged).toBe(true);
    const plain = groupWishlist([row(SURVIVOR, '2026-09-01T09:00:00Z')], ID_ALIASES, isLive);
    expect(plain[0]!.merged).toBe(false);
  });

  it('with no merge map a merged id is a line with no id, and nothing is thrown', () => {
    const lines = groupWishlist([row(ABSORBED_A, '2026-09-01T09:00:00Z')], null, isLive);
    expect(lines.map((l) => l.id)).toEqual([null]);
  });
});

describe('the price alert sender reads a merged id as its survivor', () => {
  const recipient: Recipient = { userId: 'u1', email: 'reader@example.com', token: 't', lastSentOn: null };
  const SITE = 'https://pricesniffs.space';

  // The same wiring as scripts/price-alerts.ts: resolve the saved id, then price the product it is now.
  const priceTable: Record<string, number> = { [SURVIVOR]: 30, [OTHER_SURVIVOR]: 70 };
  const priceFor: PriceLookup = (savedId) => {
    const id = resolveFragranceId(savedId, ID_ALIASES, isLive);
    if (id === null) return null;
    const frag = fragranceById(id)!;
    return { price: priceTable[id] ?? null, shop: 'Shop', name: `${frag.brand} ${frag.name}`, slug: frag.slug, id };
  };
  const item = (wishlistId: string, fragranceId: string, target: number | null = null): WishlistItem => ({
    wishlistId,
    userId: 'u1',
    fragranceId,
    targetPriceGbp: target,
  });

  it('a merged id is priced, drops against its own baseline, and links to the survivor', () => {
    const plan = planRun({
      recipients: [recipient],
      items: [item('w1', ABSORBED_A)],
      history: [{ wishlistId: 'w1', lastPriceGbp: 50 }],
      priceFor,
      siteUrl: SITE,
      today: '2026-10-05',
    });
    expect(plan.itemsWithoutPrice).toBe(0);
    expect(plan.emails).toHaveLength(1);
    const line = plan.emails[0]!.lines[0]!;
    expect(line.price).toBe(30);
    expect(line.from).toBe(50);
    expect(line.url).toBe(`${SITE}/${fragranceById(SURVIVOR)!.slug}`);
    expect(plan.emails[0]!.onSend[0]!.wishlistId).toBe('w1'); // the baseline is kept against the row that was saved
  });

  it('a merged id reaches its target price', () => {
    const plan = planRun({
      recipients: [recipient],
      items: [item('w1', ABSORBED_B, 35)],
      history: [],
      priceFor,
      siteUrl: SITE,
      today: '2026-10-05',
    });
    expect(plan.emails[0]!.lines[0]!.reason).toBe('target');
  });

  it('without the merge the same row is skipped, which is what this fixes', () => {
    const unresolved: PriceLookup = (id) => (isLive(id) ? priceFor(id) : null);
    const plan = planRun({
      recipients: [recipient],
      items: [item('w1', ABSORBED_A)],
      history: [{ wishlistId: 'w1', lastPriceGbp: 50 }],
      priceFor: unresolved,
      siteUrl: SITE,
      today: '2026-10-05',
    });
    expect(plan.itemsWithoutPrice).toBe(1);
    expect(plan.emails).toHaveLength(0);
  });

  it('two saved ids that merged into one product make one line, not two', () => {
    const plan = planRun({
      recipients: [recipient],
      items: [item('w1', ABSORBED_A), item('w2', ABSORBED_B), item('w3', OTHER_ABSORBED)],
      history: [
        { wishlistId: 'w1', lastPriceGbp: 50 },
        { wishlistId: 'w2', lastPriceGbp: 50 },
        { wishlistId: 'w3', lastPriceGbp: 100 },
      ],
      priceFor,
      siteUrl: SITE,
      today: '2026-10-05',
    });
    expect(plan.emails).toHaveLength(1);
    expect(plan.emails[0]!.lines).toHaveLength(2);
    expect(plan.emails[0]!.lines.map((l) => l.url).sort()).toEqual(
      [fragranceById(SURVIVOR)!.slug, fragranceById(OTHER_SURVIVOR)!.slug].map((s) => `${SITE}/${s}`).sort(),
    );
  });

  it('an id that resolves to nothing is counted as without a price, never an error', () => {
    const plan = planRun({
      recipients: [recipient],
      items: [item('w1', GONE)],
      history: [],
      priceFor,
      siteUrl: SITE,
      today: '2026-10-05',
    });
    expect(plan.itemsWithoutPrice).toBe(1);
    expect(plan.emails).toHaveLength(0);
  });
});
