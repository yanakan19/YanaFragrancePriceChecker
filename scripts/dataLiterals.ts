/**
 * The pure half of scripts/bundle-demo.ts: find a compiled module's large
 * JSON literals and swap each for a `__psData(n)` lookup. Kept apart from
 * that script, which runs a build when imported, so it can be unit tested.
 */

/**
 * A large array or record as the JSON literal a generated module writes: one
 * entry per line, each entry compact. Still valid JSON, so moveLiteralsToJson
 * below moves it exactly as it moved the indented form, and the parsed value
 * is the same as JSON.stringify(value) gives.
 *
 * Why not indented (JSON.stringify(value, null, 2)): on 2026-10-06 that made
 * demo/catalogue.generated.ts 43.1 MB, a fifth of it spaces and line breaks,
 * on its way to GitHub's 50 MiB warning and scripts/commit-and-push.sh's
 * 95 MiB refusal. Why not one line: a crawl that moves one price would then
 * rewrite one 30 MB line, and git's line diffs and merges would see the whole
 * file change. One entry per line keeps a change to one product to one line.
 *
 * Readers of the file's TEXT (productIdsIn in src/catalogue/idAliases.ts,
 * scripts/id-alias-seed.sh) read both this and the older indented form, since
 * a build first reads the file the last build wrote, and the seed reads every
 * version in the branch's history.
 */
export function oneEntryPerLine(value: readonly unknown[] | Record<string, unknown>): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // JSON.stringify writes an undefined array entry as null; so does this.
    return `[\n${value.map((v) => JSON.stringify(v) ?? 'null').join(',\n')}\n]`;
  }
  // JSON.stringify leaves out a key whose value is undefined (or a function); so does this.
  const lines = Object.entries(value).flatMap(([k, v]) => {
    const json = JSON.stringify(v) as string | undefined;
    return json === undefined ? [] : [`${JSON.stringify(k)}:${json}`];
  });
  return lines.length === 0 ? '{}' : `{\n${lines.join(',\n')}\n}`;
}

// ── Each shop's "fetched at" once, not once per offer (2026-10-06) ─────────────
//
// An offer's fetchedAt is its listing's lastSeenAt, so a harvest moved it on
// almost every offer, and with one product's offers on one line almost every
// line of CRAWLED changed with every rebuild: 140 kB of git delta for one Awin
// sync rebuild, 28 kB without it (docs/TRACKING-AND-STORAGE-STRATEGY.md,
// item 6). The generated module now writes the time most of a shop's offers
// share once, in CRAWLED_SHOP_TIMES, and `"fetchedAt":0` on each offer that
// has it; CRAWLED is built from the two (withShopTimes, written into the
// module), so every script and test that imports CRAWLED sees exactly the
// offers it always did. The page must too, byte for byte: bundle-demo.ts runs
// inlineShopTimes below on the compiled module before moving its literals, so
// the page's data file holds CRAWLED as it always has, and the helper and the
// times, then unused, are left out of the bundle.

/** The marker an offer carries in place of its shop's common time. */
export const SHOP_TIME = 0;

type Timed = { retailerId: string; fetchedAt: string | typeof SHOP_TIME };

/** Each shop's commonest fetchedAt over these offers; the later one on a tie. */
export function shopTimes(crawled: Record<string, readonly { retailerId: string; fetchedAt: string }[]>): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const offers of Object.values(crawled)) {
    for (const o of offers) {
      const byTime = counts.get(o.retailerId) ?? new Map<string, number>();
      byTime.set(o.fetchedAt, (byTime.get(o.fetchedAt) ?? 0) + 1);
      counts.set(o.retailerId, byTime);
    }
  }
  const out: Record<string, string> = {};
  for (const shop of [...counts.keys()].sort()) {
    let best = '';
    let bestCount = 0;
    for (const [at, n] of counts.get(shop)!) {
      if (n > bestCount || (n === bestCount && at > best)) {
        best = at;
        bestCount = n;
      }
    }
    out[shop] = best;
  }
  return out;
}

/** CRAWLED as the module stores it: SHOP_TIME where an offer has its shop's common time. Key order kept. */
export function withoutShopTimes<T extends { retailerId: string; fetchedAt: string }>(
  crawled: Record<string, readonly T[]>,
  times: Record<string, string>,
): Record<string, Array<Omit<T, 'fetchedAt'> & { fetchedAt: string | typeof SHOP_TIME }>> {
  const out: Record<string, Array<Omit<T, 'fetchedAt'> & { fetchedAt: string | typeof SHOP_TIME }>> = {};
  for (const [id, offers] of Object.entries(crawled)) {
    out[id] = offers.map((o) => (o.fetchedAt === times[o.retailerId] ? { ...o, fetchedAt: SHOP_TIME } : o));
  }
  return out;
}

/**
 * The body of `withShopTimes`, the function the generated module carries to
 * rebuild CRAWLED (it imports nothing at run time). Kept here so the build,
 * the bundle pre-pass and the tests share one copy.
 */
export function withShopTimes<T extends Timed>(stored: Record<string, readonly T[]>, times: Record<string, string>): Record<string, Array<T & { fetchedAt: string }>> {
  const out: Record<string, Array<T & { fetchedAt: string }>> = {};
  for (const id of Object.keys(stored)) {
    out[id] = stored[id]!.map((o) => (o.fetchedAt === 0 ? { ...o, fetchedAt: times[o.retailerId]! } : o) as T & { fetchedAt: string });
  }
  return out;
}

const STORED_DECL = /^const CRAWLED_STORED = (?=\{)/m;
const TIMES_DECL = /^export const CRAWLED_SHOP_TIMES = (?=\{)/m;
const BUILT_DECL = /^export const CRAWLED = withShopTimes\(CRAWLED_STORED, CRAWLED_SHOP_TIMES\);$/m;
const HELPER_DECL = /^function withShopTimes\([^)]*\) (?=\{)/m;

/**
 * The compiled catalogue module with CRAWLED written out as one literal again,
 * exactly the value withShopTimes builds, and the stored offers, the times and
 * the helper gone, so the module the bundler sees is the one it saw before
 * (esbuild merges neighbouring declarations, so even unused ones in between
 * would change the bundle's text). A module without the declarations (an
 * older build) comes back unchanged.
 */
export function inlineShopTimes(src: string): string {
  const stored = STORED_DECL.exec(src);
  const times = TIMES_DECL.exec(src);
  const built = BUILT_DECL.exec(src);
  if (!stored || !times || !built) return src;
  const storedStart = stored.index + stored[0].length;
  const storedEnd = closingBracket(src, storedStart);
  const timesStart = times.index + times[0].length;
  const timesEnd = closingBracket(src, timesStart);
  if (storedEnd < 0 || timesEnd < 0) return src;
  const value = withShopTimes(
    JSON.parse(src.slice(storedStart, storedEnd + 1)) as Record<string, Timed[]>,
    JSON.parse(src.slice(timesStart, timesEnd + 1)) as Record<string, string>,
  );
  const literal = `export const CRAWLED = ${oneEntryPerLine(value)};`;
  // The stored declaration ends at its closing brace and the semicolon after it.
  const stop = (end: number): number => (src[end + 1] === ';' ? end + 2 : end + 1);
  const parts = [
    { from: stored.index, to: stop(storedEnd), text: '' },
    { from: times.index, to: stop(timesEnd), text: '' },
    { from: built.index, to: built.index + built[0].length, text: literal },
  ];
  const helper = HELPER_DECL.exec(src);
  if (helper) {
    const bodyEnd = closingBracket(src, helper.index + helper[0].length);
    if (bodyEnd < 0) return src;
    parts.push({ from: helper.index, to: bodyEnd + 1, text: '' });
  }
  parts.sort((a, b) => b.from - a.from);
  let out = src;
  for (const part of parts) out = out.slice(0, part.from) + part.text + out.slice(part.to);
  return out;
}

/** Literals smaller than this stay as code; moving them buys nothing. */
export const MIN_BYTES = 50_000;

/** One part of a chunked literal (chunkedArrayLiteral in scripts/build-demo-catalogue.ts). */
const CHUNK_NAME = /_CHUNK_\d+$/;

/** Index of the bracket that closes the one at `open`, or -1. JSON strings only. */
function closingBracket(src: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Replace each large JSON literal with a __psData lookup, appending its value to `blobs`. */
export function moveLiteralsToJson(
  src: string,
  blobs: unknown[],
  minBytes = MIN_BYTES,
  /** The expression that reads blob `n` of `blobs`; scripts/bundle-demo.ts passes a placeholder it numbers later. */
  lookup: (n: number) => string = (n) => `__psData(${n})`,
): { code: string; moved: string[] } {
  const decl = /^(?:export )?const ([A-Za-z_$][\w$]*) = (?=[[{])/gm;
  let out = '';
  let last = 0;
  const moved: string[] = [];
  for (let m = decl.exec(src); m; m = decl.exec(src)) {
    const start = m.index + m[0].length;
    if (start < last) continue;
    const end = closingBracket(src, start);
    // A chunk (`<NAME>_CHUNK_<n>`) is one part of a large data set, so it
    // moves whatever its own size: the last chunk of the catalogue is often
    // small, and left as code it would ship in the page instead of the data
    // file and escape the brand and shop removals scripts/siteBuild.ts
    // applies to moved literals.
    if (end < 0 || (end - start < minBytes && !CHUNK_NAME.test(m[1]!))) continue;
    let value: unknown;
    try {
      value = JSON.parse(src.slice(start, end + 1));
    } catch {
      continue;
    }
    out += src.slice(last, start) + lookup(blobs.length);
    blobs.push(value);
    moved.push(m[1]!);
    last = end + 1;
    decl.lastIndex = last;
  }
  return { code: out + src.slice(last), moved };
}

/** One data module as esbuild loaded it: its literals numbered from 0, and the names they replaced. */
export interface LoadedModule {
  name: string;
  blobs: unknown[];
  moved: string[];
}

/** The placeholder a module's k-th literal becomes while esbuild loads modules in no fixed order. */
export const placeholder = (name: string, k: number): string => `__psData(__PSD_${Buffer.from(name).toString('hex')}_${k})`;

/**
 * Final blob numbering, independent of the order the modules were loaded in:
 * modules in name order, each one's literals contiguous, and every placeholder
 * in `bundle` rewritten to its final index. `afterAppend` runs for each module
 * once its blobs are in `blobs` (the build prunes removed brands and shops
 * there; it may change blobs in place, never their count).
 */
export function numberBlobs(
  loaded: readonly LoadedModule[],
  bundle: string,
  afterAppend?: (m: LoadedModule, start: number, blobs: unknown[]) => void,
): { modules: LoadedModule[]; starts: Map<string, number>; groups: { name: string; start: number; count: number }[]; blobs: unknown[]; bundle: string } {
  const modules = [...loaded].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  const blobs: unknown[] = [];
  const groups: { name: string; start: number; count: number }[] = [];
  const starts = new Map<string, number>();
  for (const m of modules) {
    const start = blobs.length;
    starts.set(m.name, start);
    blobs.push(...m.blobs);
    afterAppend?.(m, start, blobs);
    groups.push({ name: m.name, start, count: m.moved.length });
  }
  let placeholders = 0;
  const numbered = bundle.replace(/__psData\(__PSD_([0-9a-f]+)_(\d+)\)/g, (_all, hex: string, k: string) => {
    placeholders++;
    const start = starts.get(Buffer.from(hex, 'hex').toString());
    if (start === undefined) throw new Error(`bundle refers to unknown data module ${hex}`);
    return `__psData(${start + Number(k)})`;
  });
  if (placeholders !== blobs.length || /__PSD_/.test(numbered)) {
    throw new Error(`bundle has ${placeholders} blob lookups for ${blobs.length} blobs (a literal was dropped or duplicated)`);
  }
  return { modules, starts, groups, blobs, bundle: numbered };
}
