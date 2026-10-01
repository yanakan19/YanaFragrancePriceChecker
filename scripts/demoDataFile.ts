/**
 * demo/data.json: the catalogue the page loads, kept in a file of its own.
 *
 * ── Why a separate file ──────────────────────────────────────────────────────
 * scripts/bundle-demo.ts moved the ~23MB of catalogue, price history and deals
 * out of the JavaScript and into JSON. Written into the page as an inline
 * <script type="application/json">, that JSON still had to pass through the
 * browser's HTML parser, which scans every byte of it before the page can
 * run: about 2.6s of a 4.5s load on a phone-speed CPU (2026-10-01). Fetched
 * as a file, the same bytes skip the HTML parser entirely and go straight to
 * JSON.parse. demo/index.html and demo/404.html drop from 24MB to under 1MB,
 * which matters most for 404.html: GitHub Pages serves it for every deep link.
 *
 * ── Why the page and the data carry a version ────────────────────────────────
 * The page reads entry n of the data by position (see bundle-demo.ts), and
 * which literal is entry n is decided at build time. A page from one build
 * reading data from another can therefore read the wrong thing entirely, not
 * just older prices. So the two are paired by a version: a hash of the data,
 * written into data.json and into the page's request for it
 * (`data.json?v=<version>`). The query string gives each build's data its own
 * URL in every cache on the way, and the page refuses data whose version is
 * not its own. tests/demoBuildFreshness.test.ts and
 * scripts/check-demo-freshness.ts hold the committed pair to the same rule, so
 * a commit can never carry one half of a build.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The data file, root-relative, beside demo/index.html and demo/404.html. */
export const DATA_FILE = 'demo/data.json';

/** What every copy of the file starts with, up to the version itself. */
const HEAD = '{"v":"';
const VERSION_PATTERN = /^[0-9a-f]{16}$/;

/** The version of a set of data: the first 16 hex digits of its sha256. */
export function dataVersion(blobsJson: string): string {
  return createHash('sha256').update(blobsJson).digest('hex').slice(0, 16);
}

/** The contents of demo/data.json for `blobsJson`, the array bundle-demo.ts wrote. */
export function dataFileContents(blobsJson: string): string {
  return `${HEAD}${dataVersion(blobsJson)}","d":${blobsJson}}`;
}

/**
 * The version a data file claims, and whether its contents actually hash to
 * it. Read as text rather than parsed: the file is 23MB and every byte of it
 * is already covered by the hash.
 */
export function readDataFile(text: string): { version: string; intact: boolean } | null {
  if (!text.startsWith(HEAD)) return null;
  const version = text.slice(HEAD.length, HEAD.length + 16);
  const bodyStart = HEAD.length + 16 + '","d":'.length;
  if (!VERSION_PATTERN.test(version) || text.slice(HEAD.length + 16, bodyStart) !== '","d":' || !text.endsWith('}')) {
    return null;
  }
  return { version, intact: dataVersion(text.slice(bodyStart, -1)) === version };
}

/** The data version a built page asks for, or null if it loads none. */
export function readPageDataVersion(html: string): string | null {
  const match = /data\.json\?v=([0-9a-f]{16})/.exec(html);
  return match ? match[1]! : null;
}

/**
 * Whether demo/index.html and demo/data.json under `root` are two halves of
 * the same build. Returns null when they are, or a sentence saying what is
 * wrong. A page that loads no data file (one built before this change) is
 * not checked: there is nothing for it to disagree with.
 */
export function checkDataPairing(root: string): string | null {
  const html = readFileSync(join(root, 'demo/index.html'), 'utf8');
  const wanted = readPageDataVersion(html);
  if (wanted === null) return null;
  const file = join(root, DATA_FILE);
  if (!existsSync(file)) return `demo/index.html loads ${DATA_FILE}?v=${wanted}, and there is no ${DATA_FILE}.`;
  const data = readDataFile(readFileSync(file, 'utf8'));
  if (data === null) return `${DATA_FILE} is not in the shape scripts/build-demo.ts writes.`;
  if (!data.intact) return `${DATA_FILE} says it is version ${data.version}, but its contents hash to something else.`;
  if (data.version !== wanted) {
    return `demo/index.html loads data version ${wanted}, but ${DATA_FILE} is version ${data.version}: the two are from different builds.`;
  }
  return null;
}
