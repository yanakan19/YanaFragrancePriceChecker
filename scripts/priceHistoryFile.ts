/**
 * How demo/priceHistory.generated.ts writes PRICE_HISTORY down, separate from
 * what the series are (scripts/priceHistoryReplay.ts's render()).
 *
 * ── Why (2026-10-06) ─────────────────────────────────────────────────────────
 * render() writes every point in full, `{"at":"2026-10-05T12:46:13+00:00",
 * "priceGbp":56.1,"retailerId":"perfume-click"}`: 16.2 MB for 137,000 points,
 * rewritten by every rebuild, and 1.42 MB of the repository's growth on
 * 5 October (13 versions, packed the way git packs them). Most of each point is
 * the same few dozen commit times and shop ids over and over. The file now
 * keeps them once, in PRICE_TIMES and PRICE_SHOPS, and each point as
 * `[time, price, shop]` (indexes into the two) or `[time]` for a gap marker;
 * the module rebuilds PRICE_HISTORY from them (expandPriceHistory, written into
 * it), so everything that imports it, the page's lazily loaded data file
 * included (scripts/bundle-demo.ts writes it from the module's value), sees
 * exactly the series it always did. The same day's versions in this form:
 * 7.2 MB, and 0.79 MB of growth (docs/TRACKING-AND-STORAGE-STRATEGY.md).
 *
 * The times are sorted, so a new commit's time joins the end and the indexes
 * already written do not move.
 *
 * This file is outside the replay's rules fingerprint (RULE_MODULE_ROOTS in
 * priceHistoryReplay.ts): how the series are written down cannot change a
 * point, and editing it must not force a full replay. render() is untouched;
 * build-price-history.ts passes its output through compactHistoryBody.
 *
 * Undo: write render()'s body as it is; historyFromGenerated reads both forms.
 */
import type { PricePoint } from './priceHistoryReplay.js';

const FULL_DECL = 'export const PRICE_HISTORY: Record<string, PriceHistoryPoint[]> = ';
const FULL_END = ';\n\nexport const PRICE_HISTORY_GAP';
const TIMES_DECL = 'const PRICE_TIMES: string[] = ';
const SHOPS_DECL = 'const PRICE_SHOPS: string[] = ';
const STORED_DECL = 'const PRICE_HISTORY_STORED: Record<string, StoredPoint[]> = ';
const BUILT_LINE = 'export const PRICE_HISTORY: Record<string, PriceHistoryPoint[]> = expandPriceHistory(PRICE_HISTORY_STORED, PRICE_TIMES, PRICE_SHOPS);';

export type StoredPoint = [number] | [number, number, number];

/** The series from the stored form: the generated module carries the same function. */
export function expandPriceHistory(
  stored: Record<string, StoredPoint[]>,
  times: readonly string[],
  shops: readonly string[],
): Record<string, PricePoint[]> {
  const out: Record<string, PricePoint[]> = {};
  for (const id of Object.keys(stored)) {
    out[id] = stored[id]!.map((p) =>
      p.length === 1
        ? { at: times[p[0]]!, priceGbp: null, retailerId: null }
        : { at: times[p[0]]!, priceGbp: p[1], retailerId: shops[p[2]]! },
    );
  }
  return out;
}

/** The stored form of these series, or null when a point is neither a price nor a gap marker as render() writes them. */
export function storeHistory(
  history: Record<string, PricePoint[]>,
): { times: string[]; shops: string[]; stored: Record<string, StoredPoint[]> } | null {
  const timeSet = new Set<string>();
  const shopSet = new Set<string>();
  for (const series of Object.values(history)) {
    for (const p of series) {
      if (JSON.stringify(Object.keys(p)) !== '["at","priceGbp","retailerId"]') return null;
      if ((p.priceGbp === null) !== (p.retailerId === null)) return null;
      timeSet.add(p.at);
      if (p.retailerId !== null) shopSet.add(p.retailerId);
    }
  }
  const times = [...timeSet].sort();
  const shops = [...shopSet].sort();
  const timeAt = new Map(times.map((t, i) => [t, i]));
  const shopAt = new Map(shops.map((s, i) => [s, i]));
  const stored: Record<string, StoredPoint[]> = {};
  for (const [id, series] of Object.entries(history)) {
    stored[id] = series.map((p) =>
      p.priceGbp === null ? [timeAt.get(p.at)!] : [timeAt.get(p.at)!, p.priceGbp, shopAt.get(p.retailerId!)!],
    );
  }
  return { times, shops, stored };
}

const EXPAND_SOURCE = `type StoredPoint = [number] | [number, number, number];

/** PRICE_HISTORY from the stored form (scripts/priceHistoryFile.ts). */
function expandPriceHistory(stored: Record<string, StoredPoint[]>, times: string[], shops: string[]): Record<string, PriceHistoryPoint[]> {
  const out: Record<string, PriceHistoryPoint[]> = {};
  for (const id of Object.keys(stored)) {
    out[id] = stored[id]!.map((p) =>
      p.length === 1
        ? { at: times[p[0]]!, priceGbp: null, retailerId: null }
        : { at: times[p[0]]!, priceGbp: p[1], retailerId: shops[p[2]]! },
    );
  }
  return out;
}`;

/**
 * render()'s body with PRICE_HISTORY in the stored form, or the body as it is
 * when it does not have render()'s shape or a point does not fit. Checked:
 * the stored form must expand to exactly the series it came from.
 */
export function compactHistoryBody(body: string): string {
  const start = body.indexOf(FULL_DECL);
  if (start < 0) return body;
  const from = start + FULL_DECL.length;
  const end = body.indexOf(FULL_END, from);
  if (end < 0) return body;
  const literal = body.slice(from, end);
  const history = JSON.parse(literal) as Record<string, PricePoint[]>;
  const parts = storeHistory(history);
  if (parts === null) return body;
  if (JSON.stringify(expandPriceHistory(parts.stored, parts.times, parts.shops)) !== literal) return body;
  const lines = Object.entries(parts.stored).map(([id, points]) => `${JSON.stringify(id)}:${JSON.stringify(points)}`);
  const block = [
    '// Each commit time and shop once, each point as [time, price, shop] or',
    '// [time] for a gap marker (scripts/priceHistoryFile.ts).',
    `${TIMES_DECL}${JSON.stringify(parts.times)};`,
    '',
    `${SHOPS_DECL}${JSON.stringify(parts.shops)};`,
    '',
    `${STORED_DECL}${lines.length === 0 ? '{}' : `{\n${lines.join(',\n')}\n}`};`,
    '',
    EXPAND_SOURCE,
    '',
    BUILT_LINE,
  ].join('\n');
  return body.slice(0, start) + block + body.slice(end);
}

/** The text after `decl` up to its closing bracket, string aware. */
function literalAfter(text: string, decl: string): string | null {
  const at = text.indexOf(decl);
  if (at < 0) return null;
  const open = at + decl.length;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * PRICE_HISTORY as the file holds it, from the text of
 * demo/priceHistory.generated.ts in either form; null when it has neither.
 * Read as text, not imported, so a checkpoint can be checked against it.
 */
export function historyFromGenerated(text: string): Record<string, PricePoint[]> | null {
  try {
    if (text.includes(BUILT_LINE)) {
      const times = literalAfter(text, TIMES_DECL);
      const shops = literalAfter(text, SHOPS_DECL);
      const stored = literalAfter(text, STORED_DECL);
      if (times === null || shops === null || stored === null) return null;
      return expandPriceHistory(JSON.parse(stored), JSON.parse(times), JSON.parse(shops));
    }
    const start = text.indexOf(FULL_DECL);
    if (start < 0) return null;
    const end = text.indexOf(FULL_END, start + FULL_DECL.length);
    return end < 0 ? null : (JSON.parse(text.slice(start + FULL_DECL.length, end)) as Record<string, PricePoint[]>);
  } catch {
    return null;
  }
}
