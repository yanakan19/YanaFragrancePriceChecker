/**
 * The review queue and coverage of the note groups (docs/NOTES-PAGE-PLAN.md,
 * section B): how many notes and note uses the rules place outside More
 * Notes, which notes are left there, and the keyword guesses for them. A guess
 * is never applied: a reviewer checks it and, if right, adds it to
 * data/note-group-overrides.json with the basis "keyword (reviewed)".
 *
 *   npm run notes:groups            # coverage, the top 40 left, the guesses
 *   npm run notes:groups -- --all   # every note left in More Notes
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTE_INDEX } from '../demo/data.js';
import { NOTE_GROUP_IDS } from '../src/catalogue/noteGroups.js';
import { grouperFor, readNoteGroupInputs } from './noteData.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const grouper = grouperFor(readNoteGroupInputs(root));
const all = process.argv.includes('--all');

const notes = [...NOTE_INDEX].sort((a, b) => b.count - a.count);
const shown = notes.filter((n) => !grouper.hidden(n.name));
const hidden = notes.length - shown.length;
const uses = shown.reduce((s, n) => s + n.count, 0);
const byGroup = new Map<string, number>(NOTE_GROUP_IDS.map((g) => [g, 0]));
const byRule = new Map<string, number>();
const more: typeof shown = [];
for (const n of shown) {
  const a = grouper.classify(n.name);
  byGroup.set(a.group, byGroup.get(a.group)! + 1);
  byRule.set(a.rule, (byRule.get(a.rule) ?? 0) + 1);
  if (a.group === 'more') more.push(n);
}
const moreUses = more.reduce((s, n) => s + n.count, 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`notes on the tab      ${shown.length} (${hidden} hidden as prose)`);
console.log(`placed in a group     ${shown.length - more.length} of ${shown.length} notes (${pct(1 - more.length / shown.length)}), ${pct(1 - moreUses / uses)} of ${uses} note uses`);
console.log(`More Notes            ${more.length} notes, ${moreUses} uses (targets: under 10% of notes, under 1% of uses)`);
console.log(`top 500 in More Notes ${more.filter((n) => notes.indexOf(n) < 500).length} (target 0)`);
console.log(`by rule               ${[...byRule].map(([r, c]) => `${r} ${c}`).join(', ')}`);
console.log(`by group              ${[...byGroup].map(([g, c]) => `${g} ${c}`).join(', ')}`);
console.log('\nLeft in More Notes (products, name, keyword guess for review):');
for (const n of all ? more : more.slice(0, 40)) {
  const s = grouper.suggest(n.name);
  console.log(`  ${String(n.count).padStart(4)}  ${n.name}${s ? `   -> ${s.group} (${s.via})` : ''}`);
}
