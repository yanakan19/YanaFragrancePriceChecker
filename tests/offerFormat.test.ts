import { describe, expect, it } from 'vitest';
import { formatLabels } from '../src/catalogue/offerFormat.js';

// Stored examples only: the titles are Kayali's own, read off its Shopify
// products.json on 2026-10-04 (data/catalogue/kayali.json), never live values.
const kayali10 = [
  { rawTitle: 'Déjà Vu White Flower | 57 Eau de Parfum 10ml Miniature', sizeMl: 10 },
  { rawTitle: 'Déjà Vu White Flower | 57 Eau de Parfum 10ml Travel Spray', sizeMl: 10 },
];

describe('formatLabels', () => {
  it('labels two same size rows with the shop\'s own format words, in Title Case', () => {
    expect(formatLabels(kayali10)).toEqual(['Miniature', 'Travel Spray']);
  });

  it('follows the order the rows are given in', () => {
    expect(formatLabels([...kayali10].reverse())).toEqual(['Travel Spray', 'Miniature']);
  });

  it('is not about any one shop or any one word', () => {
    expect(
      formatLabels([
        { rawTitle: 'Chanel No 5 Eau de Parfum 20ml ROLLERBALL', sizeMl: 20 },
        { rawTitle: 'Chanel No 5 Eau de Parfum 20ml purse spray', sizeMl: 20 },
      ]),
    ).toEqual(['Rollerball', 'Purse Spray']);
  });

  it('puts no hyphen in a label', () => {
    const labels = formatLabels([
      { rawTitle: 'Example Scent Eau de Parfum 10ml Roll-On', sizeMl: 10 },
      { rawTitle: 'Example Scent Eau de Parfum 10ml Miniature', sizeMl: 10 },
    ]);
    expect(labels).toEqual(['Roll On', 'Miniature']);
    for (const l of labels) expect(l).not.toMatch(/[-‐-―]/);
  });

  it('labels nothing for a single row', () => {
    expect(formatLabels([kayali10[0]!])).toEqual([null]);
  });

  it('never compares rows of different sizes', () => {
    expect(
      formatLabels([
        { rawTitle: 'Déjà Vu White Flower | 57 Eau de Parfum 10ml Miniature', sizeMl: 10 },
        { rawTitle: 'Déjà Vu White Flower | 57 Eau de Parfum 100ml', sizeMl: 100 },
      ]),
    ).toEqual([null, null]);
  });

  it('leaves two rows that differ only by a size alone, such as a shop pooling 50ml and 100ml', () => {
    expect(
      formatLabels([
        { rawTitle: 'Tom Ford Black Orchid Unisex Parfum Spray (50ml, 100ml) 50ml', sizeMl: 50 },
        { rawTitle: 'Tom Ford Black Orchid Unisex Parfum Spray (50ml, 100ml) 100ml', sizeMl: 100 },
      ]),
    ).toEqual([null, null]);
  });

  it('labels both rows when each says its own format, Splash against Spray', () => {
    expect(
      formatLabels([
        { rawTitle: '4711 Original Eau de Cologne Splash 100ml', sizeMl: 100 },
        { rawTitle: '4711 Original Eau De Cologne Spray 100ml', sizeMl: 100 },
      ]),
    ).toEqual(['Splash', 'Spray']);
  });

  it('does not call a strength a format, Extrait against Eau de Parfum', () => {
    expect(
      formatLabels([
        { rawTitle: 'Obsidian by French Avenue 100ml Extrait', sizeMl: 100 },
        { rawTitle: 'Obsidian by French Avenue 100ml Eau De Parfum', sizeMl: 100 },
      ]),
    ).toEqual([null, null]);
  });

  it('does not label a row of a pooled size list that merely repeats a size', () => {
    // Perfume Direct lists 10, 30 and 100ml on one page, and a title parse
    // that reads the first size gives every row 10ml. A row differing in size
    // is not a format.
    expect(
      formatLabels([
        { rawTitle: "Penhaligon's Empressa Eau de Parfum Spray (10ml, 30ml, 100ml) 10ml Splash", sizeMl: 10 },
        { rawTitle: "Penhaligon's Empressa Eau de Parfum Spray (10ml, 30ml, 100ml) 30ml", sizeMl: 10 },
      ]),
    ).toEqual([null, null]);
  });

  it('leaves unlabelled rows whose difference is only a generic word', () => {
    expect(
      formatLabels([
        { rawTitle: 'Example Scent Eau de Parfum Spray 50ml', sizeMl: 50 },
        { rawTitle: 'Example Scent Eau de Parfum 50ml', sizeMl: 50 },
      ]),
    ).toEqual([null, null]);
  });

  it('leaves unlabelled rows that differ by a number or a long phrase', () => {
    expect(
      formatLabels([
        { rawTitle: 'Example Scent Eau de Parfum 10ml Gift Box 2', sizeMl: 10 },
        { rawTitle: 'Example Scent Eau de Parfum 10ml Gift Box 3', sizeMl: 10 },
      ]),
    ).toEqual([null, null]);
    expect(
      formatLabels([
        { rawTitle: 'Example Scent Eau de Parfum 10ml Limited Edition Holiday Collector Bottle', sizeMl: 10 },
        { rawTitle: 'Example Scent Eau de Parfum 10ml Miniature', sizeMl: 10 },
      ]),
    ).toEqual([null, null]);
  });

  it('does not give two rows the same label', () => {
    expect(
      formatLabels([
        { rawTitle: 'Example Scent Eau de Parfum 10ml Miniature', sizeMl: 10 },
        { rawTitle: 'Example Scent Eau de Parfum 10ml MINIATURE', sizeMl: 10 },
      ]),
    ).toEqual([null, null]);
  });

  it('leaves rows with no stated size alone', () => {
    expect(
      formatLabels([
        { rawTitle: 'Example Scent Miniature', sizeMl: null },
        { rawTitle: 'Example Scent Travel Spray', sizeMl: null },
      ]),
    ).toEqual([null, null]);
  });
});
