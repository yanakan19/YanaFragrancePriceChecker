import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The motion system's rules (docs/UX-POLISH-PLAN.md section 4), read from the
 * stylesheet in demo/template.html and the markup in demo/*.ts:
 *
 *   - the four motion tokens exist with their values;
 *   - every @keyframes step and every transition moves only transform and
 *     opacity, or fades a colour or a border colour (never width, height,
 *     top, left or a shadow, which make the browser lay out or repaint);
 *   - reduced motion ends every animation at once, and stops every looping
 *     one outright, by name;
 *   - the moving gradient (ps-drift) is on the three tiles the owner allowed
 *     and nowhere else: the home title tile, the top deal, the primary button
 *     on hover.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
const css = template
  .slice(template.indexOf('<style>') + '<style>'.length, template.indexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The text between a `{` at `open` and its matching `}`. */
function block(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`unclosed block at ${open}`);
}

/** Commas at the top level only: `cubic-bezier(.2,0,0,1)` and `var(a, b)` stay whole. */
function topLevelSplit(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    else if (value[i] === ')') depth--;
    else if (value[i] === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Every @keyframes rule: its name and the properties its steps set. */
function keyframes(): { name: string; props: string[] }[] {
  const out: { name: string; props: string[] }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const body = block(css, m.index + m[0].length - 1);
    const props = [...body.matchAll(/([\w-]+)\s*:/g)].map((p) => p[1]!);
    out.push({ name: m[1]!, props });
  }
  return out;
}

/** Plain rules (selector and declarations), with the @media they sit in. */
function rules(): { media: string; selector: string; decls: string }[] {
  const out: { media: string; selector: string; decls: string }[] = [];
  const walk = (text: string, media: string): void => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const head = text.slice(i, open).trim();
      const body = block(text, open);
      if (head.startsWith('@media') || head.startsWith('@supports')) walk(body, head);
      else if (!head.startsWith('@keyframes')) out.push({ media, selector: head, decls: body });
      i = open + body.length + 2;
    }
  };
  walk(css, '');
  return out;
}

const MOVES = new Set(['transform', 'opacity']);
const FADES = new Set(['color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke']);
const REDUCE = '@media (prefers-reduced-motion: reduce)';

describe('the motion tokens', () => {
  it('declares --ease-out, --dur-fast 150ms, --dur 220ms and --dur-slow 400ms once, outside any theme', () => {
    for (const [name, value] of [['--dur-fast', '150ms'], ['--dur', '220ms'], ['--dur-slow', '400ms']] as const) {
      const found = [...css.matchAll(new RegExp(`${name}:\\s*([^;]+);`, 'g'))].map((m) => m[1]!.trim());
      expect(found, name).toEqual([value]);
    }
    expect(css).toMatch(/--ease-out:\s*cubic-bezier\([^)]*\);/);
  });

  it('keeps the older duration names on the same scale', () => {
    expect(css).toMatch(/--dur-2:\s*var\(--dur-fast\)/);
    expect(css).toMatch(/--dur-3:\s*var\(--dur\)/);
  });
});

describe('what moves', () => {
  it('has keyframes, and every step of every one sets only transform or opacity', () => {
    const all = keyframes();
    expect(all.length).toBeGreaterThanOrEqual(8);
    const bad = all.flatMap((k) => k.props.filter((p) => !MOVES.has(p)).map((p) => `${k.name}: ${p}`));
    expect(bad).toEqual([]);
  });

  it('transitions only transform and opacity, or fades a colour or a border colour', () => {
    const bad: string[] = [];
    for (const m of css.matchAll(/(?<![\w-])transition(?:-property)?\s*:\s*([^;}]+)/g)) {
      const value = m[1]!.replace(/!important/, '').trim();
      if (value === 'none') continue;
      for (const part of topLevelSplit(value)) {
        const prop = part.split(/\s+/)[0]!;
        // A part that starts with a time or a var() names no property, which
        // means "all": the shape that makes every hover lag.
        if (!MOVES.has(prop) && !FADES.has(prop)) bad.push(`${prop} in "${value.slice(0, 80)}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('never transitions everything', () => {
    expect(css).not.toMatch(/transition\s*:\s*all\b/);
  });
});

describe('reduced motion', () => {
  const reduceBlocks = rules().filter((r) => r.media.startsWith(REDUCE));

  it('ends every animation and transition at once, pseudo elements included', () => {
    const universal = reduceBlocks.find((r) => r.selector.replace(/\s+/g, ' ') === '*, *::before, *::after');
    expect(universal, 'the universal reduced motion rule').toBeDefined();
    expect(universal!.decls).toMatch(/animation-duration:\s*1ms !important/);
    expect(universal!.decls).toMatch(/animation-iteration-count:\s*1 !important/);
    expect(universal!.decls).toMatch(/transition-duration:\s*1ms !important/);
  });

  it('stops every looping animation by name, so nothing moves at all', () => {
    // The last compound of a selector, without states: what the rule styles.
    const subject = (selector: string): string =>
      selector
        .replace(/:(?:has|not|is|where)\([^()]*\)/g, '')
        .trim()
        .split(/\s+/)
        .pop()!
        .replace(/:(?:hover|active|focus-visible)/g, '');
    const stopped = new Set(
      reduceBlocks
        .filter((r) => /animation:\s*none/.test(r.decls))
        .flatMap((r) => r.selector.split(',').map(subject)),
    );
    const loops = rules().filter((r) => !r.media.startsWith(REDUCE) && /animation[^;]*\binfinite\b/.test(r.decls));
    expect(loops.length).toBeGreaterThanOrEqual(4);
    const missed = loops.flatMap((r) => r.selector.split(',').map(subject)).filter((s) => !stopped.has(s));
    expect(missed).toEqual([]);
  });
});

describe('the moving gradient', () => {
  const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');

  it('drifts slowly: 12 to 20 seconds a pass', () => {
    const uses = [...css.matchAll(/animation(?:-duration)?\s*:\s*(?:ps-drift\s+)?(\d+(?:\.\d+)?)s[^;]*;/g)]
      .filter((m) => /ps-drift|animation-duration/.test(m[0]))
      .map((m) => Number(m[1]));
    expect(uses.length).toBeGreaterThanOrEqual(3);
    for (const s of uses) expect(s, `${s}s`).toBeGreaterThanOrEqual(12);
    for (const s of uses) expect(s, `${s}s`).toBeLessThanOrEqual(20);
  });

  it('runs only on the three allowed tiles', () => {
    const drifting = rules()
      .filter((r) => /animation(?:-name)?\s*:\s*ps-drift\b/.test(r.decls))
      .map((r) => r.selector);
    expect(drifting.sort()).toEqual(['.contact-send:hover:not(:active)::before', '.ps-drift::before']);
    // The class itself: the home title tile, and the top deal.
    const inApp = [...app.matchAll(/ps-drift/g)].length;
    expect(inApp).toBe(2);
    expect(app).toMatch(/<section class="intro ps-drift">/);
    expect(app).toMatch(/opts\?\.top \? ' tile-top ps-drift' : ''/);
    expect(app).toMatch(/top: i === 0 && state\.dealSort === 'discount'/);
    // Nowhere else in the page's markup or code.
    const body = template.slice(template.indexOf('</style>'));
    expect(body).not.toMatch(/ps-drift/);
    for (const f of readdirSync(resolve(root, 'demo')).filter((n) => n.endsWith('.ts') && n !== 'app.ts' && !n.includes('.generated'))) {
      expect(readFileSync(resolve(root, 'demo', f), 'utf8'), f).not.toMatch(/ps-drift|tile-top/);
    }
  });

  it('never sits behind the title tile\'s words: each line carries the plain page ground', () => {
    const ground = rules().find((r) => r.selector.replace(/\s+/g, ' ') === '.intro .hero-wordmark, .intro .hero-mission, .intro .hero-fresh');
    expect(ground?.decls).toMatch(/background:\s*var\(--bg\)/);
    expect(ground?.decls).toMatch(/box-shadow:[^;]*var\(--bg\)/);
    expect(ground?.decls).not.toMatch(/animation|transition/);
  });
});
