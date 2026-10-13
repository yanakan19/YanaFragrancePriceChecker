/**
 * Compiles the page's TypeScript to JavaScript in dist-demo/, the step `npm run demo`
 * used to do with `tsc -p tsconfig.demo.json` (audit, 13 Oct 2026: tsc compiling the
 * large generated modules was the build's memory peak, 4.1 GB and 73 seconds).
 *
 * esbuild, which the build already uses to bundle, strips the types file by file without
 * a type checker: 1.7 s and about 0.1 GB for the same 219 files. It is only the compile.
 * The type check is `npx tsc --noEmit -p tsconfig.json` (tests.yml, job `typecheck`, and
 * before every push), which still covers every file this one reads, so safety is kept.
 *
 * Same files and same layout as tsc gave: the `include` and `exclude` of
 * tsconfig.demo.json, written to dist-demo/<same path>.js as ES2022 modules with their
 * `.js` import specifiers untouched. The final site is byte identical to the tsc build
 * (tests/compileDemo.test.ts holds the rule; the 13 Oct measurement is in
 * docs/SITE-AUDIT-2026-10-12.md).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A generated data module compiled the way tsc did it: types stripped, every other character kept.
 * Its big literals are lifted out before TypeScript sees the file and put back after, because
 * parsing a 50 MB array literal is what costs a transpile its gigabytes; a literal is a top level
 * `const NAME... = [` or `{` whose closing line is `];` or `};` in column 0, as the generators
 * write them (writeGenerated, scripts/dataLiterals.ts). What is left is a few hundred lines.
 */
export function compileGenerated(file: string, source: string): string {
  const literals: string[] = [];
  const skeleton = source.replace(/^((?:export )?const \w+(?:: [^=\n]+)? = )([[{])\n([\s\S]*?)\n([\]}]);$/gm, (_m, head: string, open: string, body: string, close: string) => {
    literals.push(`${open}\n${body}\n${close}`);
    return `${head}__LITERAL_${literals.length - 1}__;`;
  });
  const out = ts.transpileModule(skeleton, {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, verbatimModuleSyntax: true, isolatedModules: true, removeComments: false },
  }).outputText;
  return out.replace(/__LITERAL_(\d+)__/g, (_m, i: string) => literals[Number(i)]!);
}

/** The files tsconfig.demo.json compiles, root relative. */
export function demoSourceFiles(rootDir: string = root): string[] {
  const raw = readFileSync(join(rootDir, 'tsconfig.demo.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const config = JSON.parse(raw) as { include: string[]; exclude?: string[] };
  const excluded = new Set(config.exclude ?? []);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(rootDir, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && rel.endsWith('.ts') && !rel.endsWith('.d.ts') && !excluded.has(rel)) found.push(rel);
    }
  };
  for (const pattern of config.include) {
    const m = /^([\w./-]+?)\/\*\*\/\*\.ts$/.exec(pattern);
    if (!m) throw new Error(`compile-demo: tsconfig.demo.json include "${pattern}" is not a "<dir>/**/*.ts" pattern`);
    walk(m[1]!);
  }
  return found.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = Date.now();
  const files = demoSourceFiles();
  // The generated data modules keep the literal text they were written with: scripts/bundle-demo.ts
  // moves a literal into a JSON file only where the compiled text is valid JSON, and esbuild
  // reprints strings (single quotes, a raw tab), which is not. TypeScript's per file transpile
  // (no program, no checker, so none of tsc's memory) only strips the types, as tsc's emit did.
  const generated = files.filter((f) => /\.generated\.ts$/.test(f));
  for (const f of generated) {
    const dest = join(root, 'dist-demo', f.replace(/\.ts$/, '.js'));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, compileGenerated(f, readFileSync(join(root, f), 'utf8')));
  }
  const others = files.filter((f) => !generated.includes(f));
  await build({
    entryPoints: others.map((f) => join(root, f)),
    outdir: join(root, 'dist-demo'),
    outbase: root,
    format: 'esm',
    target: 'es2022',
    // Keep non-ASCII text as it is rather than escaped.
    charset: 'utf8',
    bundle: false,
    logLevel: 'error',
    tsconfig: join(root, 'tsconfig.demo.json'),
  });
  console.log(`compile-demo: ${files.length} files to dist-demo/ in ${((Date.now() - started) / 1000).toFixed(1)} s (types are checked by tsc --noEmit, not here)`);
}
