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
    out += src.slice(last, start) + `__psData(${blobs.length})`;
    blobs.push(value);
    moved.push(m[1]!);
    last = end + 1;
    decl.lastIndex = last;
  }
  return { code: out + src.slice(last), moved };
}
