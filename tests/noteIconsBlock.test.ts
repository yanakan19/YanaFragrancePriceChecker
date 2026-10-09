import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOTE_ICON_SLOT, noteIconImg, notePill, NOTE_PILL_ICON_CLASS, type NotePillEnv } from '../demo/noteIcons.js';
import type { NoteIconLookup } from '../src/catalogue/noteIconLookup.js';

/**
 * The product page's note pills as drawn (docs/NOTES-PAGE-PLAN.md, section F,
 * and the owner's layout of 9 Oct 2026): one button per note, a small
 * decorative icon on the left of the name, the name the button's only text.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const titleCase = (s: string) => s.replace(/\S+/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
const lookup: NoteIconLookup = {
  iconFor: (name) =>
    name === 'Bergamot'
      ? { src: 'note-icons/h/bergamot.0123456789.svg', group: false }
      : name === 'Setting the stage'
        ? null
        : { src: 'note-icons/h/group-woods.abcdef0123.svg', group: true },
};
const env = (over: Partial<NotePillEnv> = {}): NotePillEnv => ({ esc, titleCase, base: '/', icons: lookup, ...over });
/** What a screen reader reads as the button's name: its text, the decorative image adding nothing. */
const accessibleName = (html: string): string => html.replace(/<img[^>]*alt=""[^>]*>/g, '').replace(/<[^>]+>/g, '');

describe('a note pill on the product page', () => {
  it('is one button with the icon on the left and the name as its text', () => {
    const html = notePill('Bergamot', env());
    expect(html).toBe(
      `<button class="note-chip ${NOTE_PILL_ICON_CLASS}" data-note="Bergamot"><img class="note-ico" src="/note-icons/h/bergamot.0123456789.svg" alt="" width="20" height="20" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">Bergamot</button>`,
    );
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html.match(/<img/g)).toHaveLength(1);
    expect(accessibleName(html)).toBe('Bergamot');
  });

  it('keeps the icon decorative: empty alt, no title, no label', () => {
    const html = notePill('Bergamot', env());
    expect(html).toContain('alt=""');
    expect(html).not.toMatch(/title=|aria-label/);
  });

  it("shows a group's icon marked for 70% opacity", () => {
    expect(notePill('Smoked Birch', env())).toContain('<img class="note-ico is-group" src="/note-icons/h/group-woods.abcdef0123.svg"');
  });

  it('gives prose no icon: the plain pill it always was', () => {
    expect(notePill('Setting the stage', env())).toBe('<button class="note-chip" data-note="Setting the stage">Setting The Stage</button>');
  });

  it('holds an empty box the icon size while the lookup is on its way, hidden from screen readers', () => {
    const html = notePill('Bergamot', env({ icons: null }));
    expect(html).toBe(`<button class="note-chip ${NOTE_PILL_ICON_CLASS}" data-note="Bergamot">${NOTE_ICON_SLOT}Bergamot</button>`);
    expect(NOTE_ICON_SLOT).toContain('aria-hidden="true"');
    expect(accessibleName(html)).toBe('Bergamot');
  });

  it('escapes the name and keeps the raw name as the lookup key', () => {
    const html = notePill('Rose & "Oud"', env());
    expect(html).toContain('data-note="Rose &amp; &quot;Oud&quot;"');
    expect(html).toContain('>Rose &amp; &quot;oud&quot;</button>');
  });

  it('resolves the icon against the site base', () => {
    expect(noteIconImg({ src: 'note-icons/h/x.0123456789.svg', group: false }, '/app/', esc)).toContain('src="/app/note-icons/h/x.0123456789.svg"');
  });
});

describe('the notes block of a product page (demo/app.ts)', () => {
  const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
  const start = app.indexOf('function notesBlock(');
  const body = app.slice(start, app.indexOf('\n}\n', start));
  const unavailable = body.slice(0, body.indexOf('Notes unavailable for this fragrance.') + 200);

  it('draws every note of every tier as a pill, the tiers Top, Middle, Base in that order', () => {
    expect(body).toContain('list.map((n) => notePill(n, pillEnv))');
    const order = ["layer('Top', 'top'", "layer('Middle', 'middle'", "layer('Base', 'base'"].map((s) => body.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('asks for the lookup only for a product with notes, and draws no icon for "Notes unavailable"', () => {
    expect(unavailable).not.toMatch(/notePill|noteIcons/);
    expect(body.indexOf('noteIcons.load()')).toBeGreaterThan(body.indexOf('Notes unavailable for this fragrance.'));
  });

  it('styles the pill small: 18px icon, 20px from 390 wide and never more, 6px gap, the text size as before', () => {
    const css = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
    expect(css).toMatch(/\.note-chip-ico \{ display: inline-flex; align-items: center; gap: 6px; padding-left: 5px; \}/);
    expect(css).toMatch(/\.note-ico \{ flex: none; width: 18px; height: 18px; \}/);
    expect(css).toMatch(/@media \(min-width: 390px\) \{ \.note-ico \{ width: 20px; height: 20px; margin: -1px 0; \} \}/);
    expect(css).toMatch(/\.note-ico\.is-group \{ opacity: \.7; \}/);
    expect(css).toMatch(/\.note-chip \{\n\s+background: var\(--surface-2\);[^}]*font-size: 12\.5px;/);
    for (const m of css.matchAll(/\.note-ico[^{]*\{[^}]*width: (\d+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(22);
  });
});
