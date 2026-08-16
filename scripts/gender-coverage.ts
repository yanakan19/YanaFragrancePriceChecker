/**
 * How much of the catalogue says who it is for.
 *
 * The gender filter in the demo reads a product's title and nothing else,
 * because there is no gender field anywhere in this project to read instead —
 * see demo/gender.ts for why, and for what does and does not count as a shop
 * naming an audience.
 *
 * The answer that matters is not the classified share but the unclassified
 * one: the overwhelming majority of titles say nothing, the filter says so on
 * screen, and this script is what that on-screen claim is checked against.
 * Every figure in demo/gender.ts's header came out of a run of this file, and
 * running it again is how you find out whether they still hold.
 *
 *   npx tsx scripts/gender-coverage.ts
 *
 * Two populations are reported because they answer different questions.
 * Products are what a reader filters, one row per bottle after duplicate
 * offers have been folded together. Raw listings are what the shops actually
 * published, one row per shop per bottle, and read lower: a product several
 * shops stock only needs one of them to have written "Pour Homme".
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { GENDER_LABEL, GENDER_ORDER, readGenderEvidence, type GenderReading } from '../demo/gender.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const pct = (n: number, total: number): string => `${((n / total) * 100).toFixed(2)}%`;

function tally(titles: string[]): Record<GenderReading, number> {
  const counts: Record<GenderReading, number> = { mens: 0, womens: 0, unisex: 0, notStated: 0 };
  for (const title of titles) counts[readGenderEvidence(title).reading]++;
  return counts;
}

function report(label: string, titles: string[]): void {
  const counts = tally(titles);
  const total = titles.length;
  console.log(`\n${label}: ${total.toLocaleString('en-GB')}`);
  for (const reading of GENDER_ORDER) {
    console.log(
      `  ${GENDER_LABEL[reading].padEnd(11)} ${String(counts[reading]).padStart(6)}  ${pct(counts[reading], total).padStart(7)}`,
    );
  }
  console.log(`  ${'classified'.padEnd(11)} ${String(total - counts.notStated).padStart(6)}  ${pct(total - counts.notStated, total).padStart(7)}`);
}

// Exactly the string the app reads: the brand, name and concentration a
// reader can see on the card, so a classification can always be checked
// against what is on screen.
report(
  'Products',
  CATALOGUE.map((e) => `${e.brand} ${e.name} ${e.concentration}`),
);

interface StoredFile {
  listings?: { rawTitle?: string; status?: string }[];
}
const rawTitles: string[] = [];
const dir = resolve(root, 'data/catalogue');
for (const file of readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const parsed = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as StoredFile;
  for (const listing of parsed.listings ?? []) {
    if (listing.status === 'delisted') continue;
    if (listing.rawTitle) rawTitles.push(listing.rawTitle);
  }
}
report('Raw listings, undelisted', rawTitles);

// The one place upstream that could have carried an audience and does not:
// of every product whose retailer spelled its notes out, how many mention one.
const AUDIENCE_IN_NOTES = /\b(?:men|women|masculine|feminine|unisex|homme|femme)\b/i;
const withNotes = CATALOGUE.filter((e) => e.notes !== null);
const notesNamingAudience = withNotes.filter((e) => {
  const notes = e.notes!;
  return AUDIENCE_IN_NOTES.test([...notes.top, ...notes.middle, ...notes.base].join(' '));
});
console.log(
  `\nProducts with retailer stated notes: ${withNotes.length.toLocaleString('en-GB')}` +
    `\n  of those, notes naming an audience: ${notesNamingAudience.length}` +
    notesNamingAudience.map((e) => `\n    ${e.brand} ${e.name}`).join(''),
);
