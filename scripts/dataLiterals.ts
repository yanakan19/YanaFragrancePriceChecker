/**
 * The pure half of scripts/bundle-demo.ts: find a compiled module's large
 * JSON literals and swap each for a `__psData(n)` lookup. Kept apart from
 * that script, which runs a build when imported, so it can be unit tested.
 */

/** Literals smaller than this stay as code; moving them buys nothing. */
export const MIN_BYTES = 50_000;

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
    if (end < 0 || end - start < minBytes) continue;
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
