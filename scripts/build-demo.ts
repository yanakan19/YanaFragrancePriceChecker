/**
 * Builds the demo page.
 *
 * The point of this pipeline is that the demo runs the *real* modules: `src/`
 * is compiled and bundled unchanged, then inlined. There is no second
 * implementation of the pricing rules to fall out of sync.
 *
 *   tsc -p tsconfig.demo.json   →  dist-demo/**.js
 *   esbuild dist-demo/demo/app.js --bundle  →  dist-demo/bundle.js
 *   this script                 →  demo/index.html + dist-demo/artifact.html
 *
 * Two outputs, same body:
 *   - `demo/index.html`      a standalone document you can open from disk
 *   - `dist-demo/artifact.html`  body only, for the hosted artifact wrapper
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const bundle = readFileSync(resolve(root, 'dist-demo/bundle.js'), 'utf8');

if (!template.includes('/*__BUNDLE__*/')) {
  throw new Error('demo/template.html has no /*__BUNDLE__*/ placeholder to inject into');
}

// `</script>` inside the bundle would close the inline tag early.
const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>');
const body = template.replace('/*__BUNDLE__*/', safeBundle);

mkdirSync(resolve(root, 'dist-demo'), { recursive: true });
writeFileSync(resolve(root, 'dist-demo/artifact.html'), body);

const standalone = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${body}
</html>
`;
writeFileSync(resolve(root, 'demo/index.html'), standalone);

console.log(`demo/index.html          ${(standalone.length / 1024).toFixed(1)} kB`);
console.log(`dist-demo/artifact.html  ${(body.length / 1024).toFixed(1)} kB`);
