import { describe, expect, it } from 'vitest';
import { applyNumbering, localMarker, numberGroups } from '../scripts/dataNumbering.js';

describe('data file numbering', () => {
  const sizes: [string, number][] = [['deals', 2], ['catalogue', 5], ['history', 0], ['aliases', 1]];

  it('is by module name, whatever order the modules finished loading in', () => {
    const a = numberGroups(new Map(sizes));
    const b = numberGroups(new Map([...sizes].reverse()));
    expect(b).toEqual(a);
    expect(a).toEqual([
      { name: 'aliases', start: 0, count: 1 },
      { name: 'catalogue', start: 1, count: 5 },
      { name: 'deals', start: 6, count: 2 },
    ]);
  });

  it('gives two builds the same loader list and the same bundle text', () => {
    const build = (order: [string, number][]) => {
      const groups = numberGroups(new Map(order));
      const code = order.map(([n, c]) => Array.from({ length: c }, (_, i) => localMarker(n, i)).join(';')).sort().join('\n');
      return { groups, ...applyNumbering(code, groups) };
    };
    const one = build(sizes);
    const two = build([...sizes].reverse());
    expect(two.groups).toEqual(one.groups);
    expect(two.code).toBe(one.code);
    expect(one.swapped).toBe(8);
    expect(one.code).not.toContain(':');
  });
});
