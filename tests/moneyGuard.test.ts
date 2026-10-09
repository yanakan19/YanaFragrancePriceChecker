import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * No new hard coded pound sign in what the site prints (docs/INTERNATIONAL-PLAN.md,
 * Phase 0). Every price goes through the one money formatter
 * (src/services/money.ts: formatMoney, formatMoneyShort, currencySymbol),
 * which takes the symbol from the region config (src/config/regions.ts), so a
 * US or Indian page prints its own currency without a line of page code
 * changing.
 *
 * What is scanned: the page code (demo/, not the generated data) and the
 * services and alert emails it prints through (src/services/, src/alerts/).
 * Only what the code would print counts: string and template literals, read
 * with the TypeScript scanner, so a comment that mentions £3.99 is fine. In
 * demo/template.html, the markup and styles outside comments.
 *
 * Allowed: the copy below, which is UK text by nature (the legal pages and
 * the guides are written for UK readers and get a region variant of their
 * own, docs/INTERNATIONAL-PLAN.md section 5). The counts are a ceiling: a
 * file may go down, never up. A new price belongs in formatMoney, not here.
 *
 * Not scanned: demo/changelog.ts (the update history, never rewritten),
 * src/config/retailers.ts (each UK shop's own delivery terms, as
 * the shop states them) and src/catalogue/ and scripts/ (reading prices off
 * UK shops' pages, where "£" is input to recognise, not output).
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED: Record<string, { max: number; why: string }> = {
  'demo/legal.ts': { max: 5, why: 'UK legal and How it works copy (worked delivery examples, the price filter range)' },
  'demo/content/guideBodies.ts': { max: 12, why: 'UK guide copy (worked price per ml examples)' },
  'demo/content/methodBody.ts': { max: 1, why: 'How we check prices copy (an example delivery row)' },
};

/** The update history: what was said on the day, never rewritten, and written by every change. */
const NOT_SCANNED = new Set(['demo/changelog.ts']);

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.generated.ts')) out.push(p);
  }
  return out;
}

/** The pound signs inside string and template literals, with their line numbers. */
function poundsInLiterals(file: string): number[] {
  const text = readFileSync(resolve(root, file), 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      const raw = node.getText(sf);
      for (let i = raw.indexOf('£'); i >= 0; i = raw.indexOf('£', i + 1)) {
        lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf) + i).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return lines;
}

/** demo/template.html without its HTML and CSS comments. */
function templateOutsideComments(): string {
  return readFileSync(resolve(root, 'demo/template.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the money guard', () => {
  const files = [...filesUnder('demo'), ...filesUnder('src/services'), ...filesUnder('src/alerts')]
    .map((f) => relative(root, resolve(root, f)))
    .filter((f) => !NOT_SCANNED.has(f));

  it('finds the files it guards', () => {
    expect(files).toContain('demo/app.ts');
    expect(files).toContain('src/services/money.ts');
    expect(files.some((f) => f.endsWith('.generated.ts'))).toBe(false);
  });

  it('finds no hard coded £ in printed text outside the formatter and the allowed copy', () => {
    const found: string[] = [];
    for (const f of files) {
      const lines = poundsInLiterals(f);
      const allowed = ALLOWED[f]?.max ?? 0;
      if (lines.length > allowed) found.push(`${f}: ${lines.length} (allowed ${allowed}) at line ${lines.join(', ')}`);
    }
    expect(found, 'print prices with formatMoney / formatMoneyShort / currencySymbol from src/services/money.ts').toEqual([]);
  });

  it('keeps the allowed copy counts exact, so a removal lowers the ceiling', () => {
    for (const [f, { max }] of Object.entries(ALLOWED)) expect(poundsInLiterals(f).length, f).toBe(max);
  });

  it('finds no £ in the page template outside comments', () => {
    expect(templateOutsideComments()).not.toContain('£');
    expect(templateOutsideComments()).not.toContain('&pound;');
  });

  it('keeps the money formatter itself free of a typed £: the symbol comes from the region config', () => {
    expect(poundsInLiterals('src/services/money.ts')).toEqual([]);
    expect(readFileSync(resolve(root, 'src/config/regions.ts'), 'utf8')).toContain("currencySymbol: '£'");
  });

  it('sees a £ in a literal and ignores one in a comment', () => {
    const lines = poundsInLiterals('tests/fixtures/money-guard-sample.ts');
    expect(lines).toEqual([4, 5]);
  });
});
