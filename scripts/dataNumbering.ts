import type { DataGroup } from './dataFiles.js';

/**
 * Numbers each module's moved literals globally, in module name order.
 *
 * esbuild loads modules concurrently, so the order they finish in can differ
 * between builds. Numbering by that order made the built page (its loader list
 * and the blob indexes in the bundle) vary from build to build. Sorting by
 * name, a stable and total order, makes it a function of the modules alone.
 */
export function numberGroups(counts: ReadonlyMap<string, number>): DataGroup[] {
  let start = 0;
  return [...counts.keys()]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .filter((name) => counts.get(name)! > 0)
    .map((name) => {
      const count = counts.get(name)!;
      const group = { name, start, count };
      start += count;
      return group;
    });
}

/** The marker a module's literal carries until the numbering is known. */
export const localMarker = (name: string, i: number): string => `__psData("${name}:${i}")`;

/** Swaps every marker in `code` for its global index; returns how many it swapped. */
export function applyNumbering(code: string, groups: readonly DataGroup[]): { code: string; swapped: number } {
  const start = new Map(groups.map((g) => [g.name, g.start]));
  let swapped = 0;
  const out = code.replace(/__psData\((["'`])([\w-]+):(\d+)\1\)/g, (all, _q, name: string, i: string) => {
    const s = start.get(name);
    if (s === undefined) return all;
    swapped++;
    return `__psData(${s + Number(i)})`;
  });
  return { code: out, swapped };
}
