import { describe, expect, it } from 'vitest';
import { settleBarcodeSizes, trustworthyEan, type BarcodeSizeListing } from '../src/catalogue/productMatch.js';
import { CATALOGUE, CRAWLED } from '../demo/catalogue.generated.js';

/**
 * A barcode whose shops state different sizes (settleBarcodeSizes). The rows
 * below are the four such barcodes in the stored catalogue on 2026-10-06.
 */
const row = (retailerId: string, retailerSku: string, ean: string, sizeMl: number): BarcodeSizeListing => ({ retailerId, retailerSku, ean, sizeMl });

describe('the size a barcode is sold at', () => {
  it('leaves a barcode every shop sizes alike alone', () => {
    const s = settleBarcodeSizes([row('a', '1', '111', 50), row('b', '2', '111', 50), row('c', '3', '222', 100)]);
    expect([...s.revoked]).toEqual([]);
    expect([...s.outvoted]).toEqual([]);
    expect(s.disagreements).toEqual([]);
  });

  it('reads a shop alone in its size, against two that agree, at theirs', () => {
    // Givenchy Irresistible EDT: Perfume Direct's variant says 100ml, the barcode is the 80ml.
    const s = settleBarcodeSizes([
      row('perfume-direct', '18667PD', '3274872419315', 100),
      row('fragrance-click', '3274872419315', '3274872419315', 80),
      row('perfume-click', 'pc-1', '3274872419315', 80),
    ]);
    expect([...s.outvoted]).toEqual([['perfume-direct|18667PD', 80]]);
    expect([...s.revoked]).toEqual([]);
  });

  it('does not let the shop read first decide the size', () => {
    const order1 = settleBarcodeSizes([row('x', '1', '4011700912124', 100), row('y', '2', '4011700912124', 80), row('z', '3', '4011700912124', 80)]);
    const order2 = settleBarcodeSizes([row('y', '2', '4011700912124', 80), row('z', '3', '4011700912124', 80), row('x', '1', '4011700912124', 100)]);
    expect([...order1.outvoted]).toEqual([['x|1', 80]]);
    expect([...order2.outvoted]).toEqual([['x|1', 80]]);
  });

  it('keeps a shop at its own size when one shop stands against one', () => {
    // Baldessarini Uomo Mare: Perfume Click's 30ml at £25.80 on the barcode Parfumdreams sells as the 50ml.
    const listings = [row('parfumdreams-uk', 'p1', '4011700912124', 50), row('perfume-click', '171372', '4011700912124', 30)];
    const s = settleBarcodeSizes(listings);
    expect([...s.outvoted]).toEqual([]);
    // The code stays the identity of the size read first, so that product keeps its address.
    expect(trustworthyEan({ retailerId: 'parfumdreams-uk', ean: '4011700912124', rawTitle: '' }, s.revoked)).toBe('4011700912124');
    expect(trustworthyEan({ retailerId: 'perfume-click', ean: '4011700912124', rawTitle: '' }, s.revoked)).toBeNull();
  });

  it('keeps two shops that agree on a second size at it', () => {
    const s = settleBarcodeSizes([row('a', '1', '4011700912124', 50), row('b', '2', '4011700912124', 50), row('c', '3', '4011700912124', 50), row('d', '4', '4011700912124', 30), row('e', '5', '4011700912124', 30)]);
    expect([...s.outvoted]).toEqual([]);
    expect(trustworthyEan({ retailerId: 'd', ean: '4011700912124', rawTitle: '' }, s.revoked)).toBeNull();
    expect(trustworthyEan({ retailerId: 'e', ean: '4011700912124', rawTitle: '' }, s.revoked)).toBeNull();
    expect(trustworthyEan({ retailerId: 'a', ean: '4011700912124', rawTitle: '' }, s.revoked)).toBe('4011700912124');
  });

  it('counts a shop once however many of its rows state a size', () => {
    const s = settleBarcodeSizes([row('a', '1', '4011700912124', 50), row('a', '2', '4011700912124', 50), row('b', '3', '4011700912124', 30)]);
    expect([...s.outvoted]).toEqual([]);
    expect(trustworthyEan({ retailerId: 'b', ean: '4011700912124', rawTitle: '' }, s.revoked)).toBeNull();
  });
});

describe('the built catalogue', () => {
  const byId = new Map(CATALOGUE.map((c) => [c.id, c]));
  const holding = (retailerId: string, price: number) =>
    Object.entries(CRAWLED).flatMap(([pid, offers]) => (offers.some((o) => o.retailerId === retailerId && o.price === price) ? [byId.get(pid)!] : []));

  it('shows Perfume Click\'s 30ml Baldessarini Uomo Mare price as a 30ml price', () => {
    const held = holding('perfume-click', 25.8).filter((p) => p.brand === 'Baldessarini' && p.name === 'Uomo Mare');
    if (held.length === 0) return; // the shop no longer lists it at this price
    expect(held.map((p) => p.sizeMl)).toEqual([30]);
  });
});
