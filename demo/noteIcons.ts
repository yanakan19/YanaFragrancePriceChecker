/**
 * The product page's note icons (docs/NOTES-PAGE-PLAN.md, section F, and the
 * owner's layout of 9 Oct 2026): each note pill of a product's Top, Middle and
 * Base rows shows a small icon on the left of its name. The lookup is a lazy
 * data file (`noteIcons`, built by scripts/noteData.ts, read by
 * src/catalogue/noteIconLookup.ts), fetched the first time a product page with
 * notes opens, so the home page's first load carries none of it. The icons are
 * the hashed copies the Notes tab uses (`note-icons/h/`), which demo/sw.js
 * keeps cache first in its own cache.
 *
 * Until the lookup arrives each pill holds an empty box the icon's size, so the
 * pills do not move when the icons go in. The icon is decorative: `alt=""`, no
 * title, no label; the button's name is the note's name, as before. No DOM here
 * beyond strings: tests/noteIconsBlock.test.ts reads it under Node.
 */
import { NOTE_ICON_FILE, prepareNoteIcons, type NoteIcon, type NoteIconLookup } from '../src/catalogue/noteIconLookup.js';
import { fetchLazyFile, lazyData, type LazyData } from './priceHistoryStore.js';

export { NOTE_ICON_FILE };

export function createNoteIcons(fetchFile: (name: string) => Promise<unknown> = fetchLazyFile): LazyData<NoteIconLookup> {
  return lazyData(() => fetchFile(NOTE_ICON_FILE).then(prepareNoteIcons));
}

/** The app's one copy. */
export const noteIcons = createNoteIcons();

/** The class a pill carries while it shows (or waits for) an icon. */
export const NOTE_PILL_ICON_CLASS = 'note-chip-ico';

/** The empty box a pill holds until the lookup arrives: the icon's size, so nothing moves. */
export const NOTE_ICON_SLOT = '<span class="note-ico" data-note-ico-slot aria-hidden="true"></span>';

/**
 * The icon of a pill. 20 x 20 in the markup (the CSS draws it 18px below 390px
 * wide); a group's icon at 70% opacity. If the file fails, the image is hidden
 * and keeps its box, so the pill keeps its size.
 */
export function noteIconImg(icon: NoteIcon, base: string, esc: (s: string) => string): string {
  return `<img class="note-ico${icon.group ? ' is-group' : ''}" src="${esc(base + icon.src)}" alt="" width="20" height="20" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
}

export interface NotePillEnv {
  esc: (s: string) => string;
  titleCase: (s: string) => string;
  base: string;
  /** The lookup once loaded; null while it is on its way (the pill then holds an empty box). */
  icons: NoteIconLookup | null;
}

/** One note of a product: one button, the icon on the left, the name as its only text. */
export function notePill(name: string, env: NotePillEnv): string {
  const text = env.esc(env.titleCase(name));
  const attr = `data-note="${env.esc(name)}"`;
  if (!env.icons) return `<button class="note-chip ${NOTE_PILL_ICON_CLASS}" ${attr}>${NOTE_ICON_SLOT}${text}</button>`;
  const icon = env.icons.iconFor(name);
  return icon
    ? `<button class="note-chip ${NOTE_PILL_ICON_CLASS}" ${attr}>${noteIconImg(icon, env.base, env.esc)}${text}</button>`
    : `<button class="note-chip" ${attr}>${text}</button>`;
}
