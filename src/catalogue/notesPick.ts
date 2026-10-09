/**
 * Which shop's note pyramid a product shows.
 *
 * A product is sold by several shops and each may publish its notes. They do
 * not agree on how much: one writes "Top: Sambac Jasmine, Middle: Cashmere"
 * and another "Top: Jasmine Sambac, Middle: Cashmere Wood, Base: White
 * Amber". Showing whichever offer was fetched last, as this used to, meant a
 * thin pyramid could hide a full one.
 *
 * The rule (docs/NOTES-PLAN.md), in order, first difference wins:
 *   1. more tiers filled (top, middle, base);
 *   2. more notes in all;
 *   3. the source order below: a fragrance house's own storefront first, then
 *      the shops whose note lists have measured cleanest, then any other shop
 *      by its id.
 * One shop's whole pyramid is shown, never a mix of shops, so "As published
 * by" is true of every note on the page. Pure and deterministic: the same
 * offers always give the same answer, whatever order they arrive in.
 */
import type { ParsedNotes } from './notesParse.js';
import { noteMergeKey } from './noteName.js';

/** data/note-not-a-note.json: the reviewed prose, of which the picker reads the exact names. */
export interface NotANoteFile {
  notes: readonly { note: string }[];
}

/**
 * The reviewed prose as a test (decision 7, docs/NOTES-PAGE-PLAN.md): a name is
 * prose when its merge key is a listed name. The marker words in the same file
 * are not read here: they hide a name only when the group rules cannot place
 * it, which is the Notes tab's question, and a name they do place is kept.
 */
export function proseTest(file: NotANoteFile): (name: string) => boolean {
  const names = new Set(file.notes.map((n) => noteMergeKey(n.note)));
  return (name) => names.has(noteMergeKey(name));
}

/**
 * A shop's pyramid without its prose, or null when nothing is left. Done
 * before the shops are compared, so a sentence never counts as a note when the
 * fuller pyramid is chosen.
 */
export function withoutProse(notes: ParsedNotes, isProse: (name: string) => boolean): ParsedNotes | null {
  const out = {
    top: notes.top.filter((n) => !isProse(n)),
    middle: notes.middle.filter((n) => !isProse(n)),
    base: notes.base.filter((n) => !isProse(n)),
  };
  return out.top.length + out.middle.length + out.base.length > 0 ? out : null;
}

export interface NoteCandidate {
  retailerId: string;
  url: string;
  /** True when this offer is the product's own fragrance house selling it. */
  brandDirect: boolean;
  notes: ParsedNotes;
}

/**
 * Shops in the order their notes win a tie, best first. Ranked by how cleanly
 * their labelled lists parsed in the 6 Oct 2026 measurement (share of the
 * descriptions carrying a "Top notes:" style label that gave a usable pyramid),
 * ties in that measure broken by how many products the shop gave notes for.
 * A shop not listed ranks after every listed one, by id.
 */
export const NOTE_SOURCE_ORDER: readonly string[] = [
  'perfume-direct',
  'emirates-oud',
  'justmylook',
  'beautybase',
  'les-senteurs',
  'al-haramain',
  'perfume-market-uk',
  'avon',
  'ibraq',
  'manchester-ouds',
  'beauty-bay',
  'fragrancehub',
  'niche-beauty-uk',
  'escentual',
  'fragrance-click',
  'lookfantastic',
  'john-lewis',
];

const tiers = (n: ParsedNotes): number => Number(n.top.length > 0) + Number(n.middle.length > 0) + Number(n.base.length > 0);
const count = (n: ParsedNotes): number => n.top.length + n.middle.length + n.base.length;

function sourceRank(c: NoteCandidate): number {
  if (c.brandDirect) return -1;
  const i = NOTE_SOURCE_ORDER.indexOf(c.retailerId);
  return i === -1 ? NOTE_SOURCE_ORDER.length : i;
}

/** Negative when `a` should be shown in preference to `b`. */
export function compareNoteCandidates(a: NoteCandidate, b: NoteCandidate): number {
  return (
    tiers(b.notes) - tiers(a.notes) ||
    count(b.notes) - count(a.notes) ||
    sourceRank(a) - sourceRank(b) ||
    (a.retailerId < b.retailerId ? -1 : a.retailerId > b.retailerId ? 1 : 0) ||
    (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)
  );
}

/** The candidate to show, or null when no shop published notes. */
export function pickBestNotes(candidates: readonly NoteCandidate[]): NoteCandidate | null {
  let best: NoteCandidate | null = null;
  for (const c of candidates) if (best === null || compareNoteCandidates(c, best) < 0) best = c;
  return best;
}
