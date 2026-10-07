/**
 * Prints the "Save for PriceSniffs" bookmark as the one line address a
 * browser bookmark takes:
 *
 *   npm run -s catalogue:bookmarklet
 *
 * The readable source is docs/save-page-bookmarklet.js; see its header and
 * docs/OWNER-STEPS.md section 9 for what it saves and how to install it.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

/** The bookmark address for a bookmarklet source: minified, so it is short enough to paste, then URL encoded. */
export function bookmarkletUrl(source: string): string {
  const code = transformSync(source, { minify: true, legalComments: 'none', target: 'es2015' }).code.trim();
  return `javascript:${encodeURIComponent(code)}`;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(bookmarkletUrl(readFileSync(resolve(root, 'docs/save-page-bookmarklet.js'), 'utf8')));
}
