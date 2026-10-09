/**
 * Guess the Fragrance (docs/GUESS-THE-FRAGRANCE-PLAN.md): a puzzle post that
 * hides a perfume's house and name as a word puzzle (first letter of each
 * word, one blank per other letter) and gives the notes and the strength as
 * clues, and the reveal post that answers it with today's cheapest price.
 *
 *   npm run social:guess                        today's puzzle: picks, writes the folder and the history
 *   npm run social:guess -- --dry-run           the pick, the hidden text, the notes and the caption; writes nothing
 *   npm run social:guess -- --id <id>           a chosen product (still answers to the rules)
 *   npm run social:guess -- --reveal            the reveal of the latest puzzle not yet revealed
 *   npm run social:guess -- --reveal --no-price | --no-photo | --skip-live-check | --name "Short Name"
 *   --date YYYY-MM-DD     the post's date (default: today, UK)
 *   --out-root <dir>      write the folders here instead of social/posts (samples, tests)
 *   --history <file>      the history file (default social/guess-fragrance-history.json)
 *   --allow-repeat        let a chosen product break the no repeat / brand rest rules (recorded)
 *
 * Output, two folders per round, neither named after the answer:
 *   social/posts/YYYY-MM-DD-guess-fragrance-NN/         guess-3x4 and guess-9x16 (.html/.png), caption.txt,
 *                                                       alt.txt, check.json (THE ANSWER), pictures.json, source.md
 *   social/posts/YYYY-MM-DD-guess-fragrance-NN-reveal/  reveal-3x4 and reveal-9x16, caption.txt, check.json, pictures.json
 *
 * check.json holds the answer and the repository is public: commit and push a
 * puzzle folder only when posting, with a commit message that names no
 * fragrance. Pictures are never committed (docs/DECISIONS.md D28).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEMO_FRAGRANCES, NOTE_INDEX, type DemoFragrance } from '../demo/data.js';
import { eligibleForBottlePosts } from '../demo/productKind.js';
import { offersFor, CRAWLED_AT } from '../demo/catalogue.generated.js';
import { readGender } from '../demo/gender.js';
import { buildComparison, bestOffer } from '../src/services/priceService.js';
import { cheapestVerdict } from '../src/services/deliveryConfidence.js';
import { getRetailer } from '../src/config/retailers.js';
import { noteMergeKey } from '../src/catalogue/noteName.js';
import type { PresentedOffer } from '../src/types/offer.js';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';
import { photoDataUri, recordPictures } from './socialPictures.js';
import { cleanNotes, liveCheck } from './social-deal-of-day.js';
import { FORMATS, TIER_LABEL, altText, layoutOf, puzzleHtml, revealHtml, type PuzzleView, type RevealView, type Tier } from './social-guess-html.js';
import { CAPTION_LIMIT, FIXED_COPY, PUZZLE_CAPTION, revealCaption } from './social-guess-captions.js';
import { grouperFor, ownIconOf, readNoteGroupInputs } from './noteData.js';
import {
  STRENGTHS, hiddenAnswerWords, phraseText, planPuzzleText, tidyName,
  type PuzzleText,
} from './social-guess-mask.js';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = 'https://pricesniffs.space';
const DEFAULT_HISTORY = join(ROOT, 'social', 'guess-fragrance-history.json');
const FAMOUS_FILE = join(ROOT, 'social', 'guess-fragrance-famous.json');
const DEAL_HISTORY = join(ROOT, 'social', 'deal-of-the-day-history.json');

/* ── constants (plan section 2) ──────────────────────────────────────────── */

export const MAX_NOTES = 12;
export const MAX_PER_TIER = 4;
export const MIN_NOTES = 5;
export const MIN_POPULARITY = 6;
export const BRAND_REST_DAYS = 14;
export const FRESH_HOURS = 24;

const TIERS: Tier[] = ['top', 'middle', 'base'];

/* ── small helpers ───────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const gbp = (n: number) => `£${n.toFixed(2)}`;
/** Post copy never shows a hyphen or dash (social/DESIGN-SYSTEM.md 5.1). */
const undash = (s: string) => s.replace(/\s*[-‐-―−]\s*/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const brandKey = (b: string) => norm(b).replace(/ /g, '');
export const productKey = (f: Pick<DemoFragrance, 'brand' | 'name' | 'concentration'>) => norm(`${f.brand} ${f.name} ${f.concentration}`).replace(/ /g, '');
const sizeLabel = (ml: number | null) => (ml ? `${ml}ml` : '');

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/* ── history (plan 2.3) ──────────────────────────────────────────────────── */

export type Bucket = 'mens' | 'womens' | 'unisex' | 'notStated';
export type Band = 'under40' | 'from40to100' | 'over100';
export interface HistoryEntry {
  date: string;
  no: number;
  id: string;
  key: string;
  brand: string;
  gender: Bucket;
  tier: string;
  band: Band;
  revealed: string | null;
}

export function readHistory(file: string): HistoryEntry[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as HistoryEntry[]) : [];
}

export const bandOf = (price: number): Band => (price < 40 ? 'under40' : price <= 100 ? 'from40to100' : 'over100');

/* ── notes: which twelve, and their icons ────────────────────────────────── */

let inputsCache: ReturnType<typeof readNoteGroupInputs> | null = null;
const noteInputs = () => (inputsCache ??= readNoteGroupInputs(ROOT));

export interface NoteIcon { file: string; group: boolean }

/** The note's own icon (demo/note-icons/), else its group's, as the product page does. */
export function iconOfNote(name: string): NoteIcon {
  const inputs = noteInputs();
  const own = (iconLookup ??= ownIconOf(inputs))(name);
  if (own >= 0) return { file: inputs.icons[own]!.file, group: false };
  const group = (grouper ??= grouperFor(inputs)).classify(name).group;
  const g = inputs.groupIcons.find((x) => x.id === group) ?? inputs.groupIcons.find((x) => x.id === 'more')!;
  return { file: g.file, group: true };
}
let iconLookup: ((n: string) => number) | null = null;
let grouper: ReturnType<typeof grouperFor> | null = null;

let counts: Map<string, number> | null = null;
/** How many products list a note: the measure of "recognisable". */
const noteCount = (name: string) => (counts ??= new Map(NOTE_INDEX.map((n) => [noteMergeKey(n.name), n.count] as const))).get(noteMergeKey(name)) ?? 0;

export interface ShownNote { name: string; tier: Tier; icon: NoteIcon }

/** At most MAX_PER_TIER a tier and MAX_NOTES in all, the most recognisable first chosen, shown in the shop's own order. */
export function chooseNotes(tiers: Record<Tier, string[]>): ShownNote[] {
  const score = (n: string) => Math.log(1 + noteCount(n)) + (iconOfNote(n).group ? 0 : 3);
  const out: ShownNote[] = [];
  for (const tier of TIERS) {
    const keep = new Set(
      [...tiers[tier]].sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, MAX_PER_TIER),
    );
    for (const name of tiers[tier]) if (keep.has(name)) out.push({ name, tier, icon: iconOfNote(name) });
  }
  return out.slice(0, MAX_NOTES);
}

/* ── the pick (plan 2.1 and 2.2) ─────────────────────────────────────────── */

export interface RevealPrice {
  frag: DemoFragrance;
  best: PresentedOffer;
  delivered: number;
}

/** The size with a decided, purchasable, delivery stated cheapest offer fetched within FRESH_HOURS; most stocked first. */
export function pricedSize(sizes: readonly DemoFragrance[], now: Date, freshHours: number | null = FRESH_HOURS): RevealPrice | null {
  const ranked = [...sizes].sort((a, b) => b.popularity - a.popularity || (b.sizeMl ?? 0) - (a.sizeMl ?? 0) || a.id.localeCompare(b.id));
  for (const frag of ranked) {
    if (!frag.photoUrl && freshHours !== null) continue;
    const rows = buildComparison(offersFor(frag.id), { sortBy: 'delivered' });
    const best = bestOffer(rows);
    if (!best || best.deliveredPriceGbp === null || !best.isPurchasable) continue;
    if (!cheapestVerdict(rows).decided) continue;
    if (freshHours !== null && now.getTime() - Date.parse(best.fetchedAt) > freshHours * 3_600_000) continue;
    return { frag, best, delivered: best.deliveredPriceGbp };
  }
  return null;
}

export interface RuleResult { rule: string; pass: boolean; detail: string }

export interface Candidate {
  key: string;
  rep: DemoFragrance;
  sizes: DemoFragrance[];
  text: PuzzleText;
  tiers: Record<Tier, string[]>;
  shown: ShownNote[];
  notesSource: string | null;
  popularity: number;
  gender: Bucket;
  tierName: string;
  price: RevealPrice;
  band: Band;
  rules: RuleResult[];
}

const FIXED_WORDS = new Set(norm(FIXED_COPY).split(' '));

export interface Context {
  now: Date;
  history: readonly HistoryEntry[];
  today: string;
  famous: readonly string[];
  /** Brand name (lower case key) to the number of distinct products it has. */
  brandSize: ReadonlyMap<string, number>;
  dealBrands: readonly { date: string; brand: string }[];
  allowRepeat?: boolean;
}

export function buildContext(now: Date, today: string, history: readonly HistoryEntry[]): Context {
  const perBrand = new Map<string, Set<string>>();
  for (const f of DEMO_FRAGRANCES) {
    const b = brandKey(f.brand);
    if (!perBrand.has(b)) perBrand.set(b, new Set());
    perBrand.get(b)!.add(productKey(f));
  }
  return {
    now,
    history,
    today,
    famous: existsSync(FAMOUS_FILE) ? (JSON.parse(readFileSync(FAMOUS_FILE, 'utf8')) as string[]) : [],
    brandSize: new Map([...perBrand].map(([k, v]) => [k, v.size] as const)),
    dealBrands: existsSync(DEAL_HISTORY) ? (JSON.parse(readFileSync(DEAL_HISTORY, 'utf8')) as { date: string; brand: string }[]) : [],
  };
}

const bucketOf = (f: DemoFragrance): Bucket => (f.gender ?? readGender(`${f.brand} ${f.name} ${f.concentration}`)) as Bucket;

/** Overlap of two note sets, over the smaller: sizes of one product must agree. */
function agree(a: Record<Tier, string[]>, b: Record<Tier, string[]>): number {
  const set = (t: Record<Tier, string[]>) => new Set(TIERS.flatMap((k) => t[k].map((n) => noteMergeKey(n))));
  const x = set(a);
  const y = set(b);
  const shared = [...x].filter((k) => y.has(k)).length;
  return shared / Math.max(1, Math.min(x.size, y.size));
}

/** All rules of plan 2.1 for one product (all its sizes). `rules` lists each result; `candidate` is set only when every one passes. */
export function evaluate(sizes: readonly DemoFragrance[], ctx: Context): { rules: RuleResult[]; candidate: Candidate | null } {
  const rules: RuleResult[] = [];
  const add = (rule: string, pass: boolean, detail: string) => {
    rules.push({ rule, pass, detail });
    return pass;
  };
  const bottles = sizes.filter((f) => eligibleForBottlePosts(f));
  const first = bottles[0] ?? sizes[0]!;
  const key = productKey(first);
  if (!add('single bottle', bottles.length > 0, `${bottles.length} bottle size(s)`)) return { rules, candidate: null };
  if (!add('strength', (STRENGTHS as readonly string[]).includes(first.concentration), first.concentration)) return { rules, candidate: null };
  const text = planPuzzleText(first.brand, first.name);
  if (!add('name can be masked', text.ok, text.ok ? phraseText(text.nameWords) : text.reason)) return { rules, candidate: null };
  if (!text.ok) return { rules, candidate: null };
  const hidden = hiddenAnswerWords(first.brand, first.name);
  const clash = hidden.filter((w) => FIXED_WORDS.has(w));
  if (!add('answer words not in the picture copy', clash.length === 0, clash.join(', ') || 'none')) return { rules, candidate: null };
  const popularity = Math.max(...bottles.map((f) => f.popularity));
  const famous = ctx.famous.includes(key);
  if (!add('popular', popularity >= MIN_POPULARITY || famous, `${popularity} shops${famous ? ' (famous list)' : ''}`)) return { rules, candidate: null };
  const brandProducts = ctx.brandSize.get(brandKey(first.brand)) ?? 0;
  if (!add('real brand', brandKey(first.brand) !== 'commodity' && brandProducts >= 5, `${brandProducts} products`)) return { rules, candidate: null };

  // Notes: the first size (most stocked first) whose own notes pass; sizes that both carry notes must agree.
  const byPopularity = [...bottles].sort((a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id));
  let chosen: { frag: DemoFragrance; tiers: Record<Tier, string[]> } | null = null;
  const withNotes: Record<Tier, string[]>[] = [];
  for (const f of byPopularity) {
    const c = cleanNotes(f.notes, f);
    if (!c.notes) continue;
    const tiers = c.notes as Record<Tier, string[]>;
    withNotes.push(tiers);
    chosen ??= { frag: f, tiers };
  }
  if (!add('clean notes', chosen !== null, chosen ? 'ok' : 'no size has notes that pass the checks')) return { rules, candidate: null };
  const worst = Math.min(1, ...withNotes.map((t) => agree(chosen!.tiers, t)));
  if (!add('sizes agree on notes', worst >= 0.6, `${Math.round(worst * 100)}% shared`)) return { rules, candidate: null };

  // A note that holds a word of the answer is left out of the clues, never shown.
  const answerWords = new Set(hidden.filter((w) => w.length >= 3));
  const safe = (n: string) => !norm(n).split(' ').some((w) => answerWords.has(w));
  const tiers = { top: chosen!.tiers.top.filter(safe), middle: chosen!.tiers.middle.filter(safe), base: chosen!.tiers.base.filter(safe) };
  const shown = chooseNotes(tiers);
  const filled = TIERS.filter((t) => shown.some((n) => n.tier === t)).length;
  if (!add('five or more notes in two or more tiers', shown.length >= MIN_NOTES && filled >= 2, `${shown.length} notes shown, ${filled} tiers`)) return { rules, candidate: null };

  const price = pricedSize(bottles, ctx.now);
  if (!add('photo and a fresh cheapest price', price !== null, price ? `${gbp(price.delivered)} at ${price.best.retailer.name}` : 'none') || !price) return { rules, candidate: null };

  // Never repeat; the brand rests.
  const past = ctx.history.filter((h) => h.date !== ctx.today);
  const repeat = past.find((h) => h.key === key);
  const rest = past.find((h) => brandKey(h.brand) === brandKey(first.brand) && daysBetween(h.date, ctx.today) < BRAND_REST_DAYS);
  const deal = ctx.dealBrands.find((d) => brandKey(d.brand) === brandKey(first.brand) && Math.abs(daysBetween(d.date, ctx.today)) <= 1);
  const free = ctx.allowRepeat === true;
  if (!add('never posted before', !repeat || free, repeat ? `posted on ${repeat.date}${free ? ' (allowed)' : ''}` : 'new')) return { rules, candidate: null };
  if (!add(`brand rests ${BRAND_REST_DAYS} days`, !rest || free, rest ? `${rest.brand} on ${rest.date}${free ? ' (allowed)' : ''}` : 'rested')) return { rules, candidate: null };
  if (!add('not the Deal of the Day brand', !deal || free, deal ? `${deal.brand} on ${deal.date}` : 'clear')) return { rules, candidate: null };

  const rep = chosen!.frag;
  return {
    rules,
    candidate: {
      key, rep, sizes: bottles, text, tiers, shown,
      notesSource: rep.notes?.source ? getRetailer(rep.notes.source.retailerId)?.name ?? null : null,
      popularity, gender: bucketOf(rep), tierName: first.tier, price, band: bandOf(price.delivered), rules,
    },
  };
}

/** Plan 2.2: variety against the last puzzles, then well known names, then the id so a rerun picks the same one. */
export function score(c: Candidate, history: readonly HistoryEntry[], today: string): number {
  const past = history.filter((h) => h.date !== today).sort((a, b) => b.date.localeCompare(a.date));
  const lastTwo = past.slice(0, 2);
  const last = past[0];
  let s = Math.log(c.popularity);
  if (!lastTwo.some((h) => h.gender === c.gender)) s += 3;
  if (!last || last.tier !== c.tierName) s += 2;
  if (!last || last.band !== c.band) s += 2;
  return s;
}

/** Groups the catalogue into products (brand, name, strength) and keeps those that could be a puzzle at all. */
export function productsOf(frags: readonly DemoFragrance[]): Map<string, DemoFragrance[]> {
  const map = new Map<string, DemoFragrance[]>();
  for (const f of frags) {
    if (!(STRENGTHS as readonly string[]).includes(f.concentration) || !f.notes || !eligibleForBottlePosts(f)) continue;
    const k = productKey(f);
    (map.get(k) ?? map.set(k, []).get(k)!).push(f);
  }
  return map;
}

export function rank(candidates: readonly Candidate[], history: readonly HistoryEntry[], today: string): Candidate[] {
  return candidates
    .map((c) => ({ c, s: score(c, history, today) }))
    .sort((a, b) => b.s - a.s || a.c.rep.id.localeCompare(b.c.rep.id))
    .map((x) => x.c);
}

export type Choice = { pick: Candidate; scored: number } | { pick: null; reason: string };

/** The pick: the best scoring candidate, or none (which writes nothing and exits 3). */
export function choose(products: ReadonlyMap<string, DemoFragrance[]>, ctx: Context): Choice {
  const found: Candidate[] = [];
  for (const sizes of products.values()) {
    const { candidate } = evaluate(sizes, ctx);
    if (candidate) found.push(candidate);
  }
  if (!found.length) return { pick: null, reason: 'No product passes every rule today (popular, 5+ clean notes, a fresh price, not used before, brand rested)' };
  const ranked = rank(found, ctx.history, ctx.today);
  return { pick: ranked[0]!, scored: score(ranked[0]!, ctx.history, ctx.today) };
}

export { CAPTION_LIMIT, FIXED_COPY, PUZZLE_CAPTION, revealCaption, FORMATS, TIER_LABEL, altText, layoutOf, puzzleHtml, revealHtml };
export type { PuzzleView, RevealView, Tier };
export type { RevealFacts } from './social-guess-captions.js';

/* ── the run ─────────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const ukDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const checkedDate = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
const checkedClock = (d: Date) => `${d.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })} UK, ${checkedDate(d)}`;

const svgUri = (file: string) =>
  `data:image/svg+xml;base64,${readFileSync(join(ROOT, 'demo', 'note-icons', file)).toString('base64')}`;

export function viewOf(c: Candidate): PuzzleView {
  return {
    house: c.text.houseWords,
    name: c.text.nameWords,
    concentration: c.rep.concentration,
    notes: c.shown.map((n) => ({ tier: n.tier, name: n.name, src: svgUri(n.icon.file), group: n.icon.group })),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

async function runPuzzle(outRoot: string, historyFile: string, today: string) {
  const history = readHistory(historyFile);
  const now = new Date();
  const ctx: Context = { ...buildContext(now, today, history), allowRepeat: flag('--allow-repeat') };
  const products = productsOf(DEMO_FRAGRANCES);
  let pick: Candidate | null;
  let scored = 0;
  const forced = opt('--id');
  if (forced) {
    const frag = DEMO_FRAGRANCES.find((f) => f.id === forced);
    if (!frag) throw new Error(`${forced} is not in the catalogue`);
    const { rules, candidate } = evaluate(products.get(productKey(frag)) ?? [frag], ctx);
    if (!candidate) throw new Error(`${forced} does not qualify: ${rules.filter((r) => !r.pass).map((r) => `${r.rule} (${r.detail})`).join('; ')}`);
    pick = candidate;
    scored = score(candidate, history, today);
  } else {
    const choice = choose(products, ctx);
    if (choice.pick === null) {
      console.log(`${today}: no puzzle. ${choice.reason}. Nothing was written.`);
      process.exitCode = 3;
      return;
    }
    pick = choice.pick;
    scored = choice.scored;
  }
  const layout = layoutOf(pick.text);
  if (!layout) {
    throw new Error(`${pick.rep.brand} ${pick.rep.name} does not fit the blank layout at 48px or more; choose another with --id`);
  }
  const view = viewOf(pick);
  const existing = history.find((h) => h.date === today);
  const no = existing?.no ?? Math.max(0, ...history.map((h) => h.no)) + 1;
  const dir = join(outRoot, `${today}-guess-fragrance-${pad(no)}`);

  console.log(`${today}: puzzle ${no}`);
  console.log(`  House:     ${phraseText(pick.text.houseWords)}  (size ${layout.house.size}px, ${layout.house.lines.length} line(s))`);
  console.log(`  Fragrance: ${phraseText(pick.text.nameWords)}  (size ${layout.name.size}px, ${layout.name.lines.length} line(s))`);
  console.log(`  Strength:  ${pick.rep.concentration}`);
  for (const t of TIERS) console.log(`  ${TIER_LABEL[t].padEnd(6)}${pick.shown.filter((n) => n.tier === t).map((n) => `${n.name}${n.icon.group ? ' (group icon)' : ''}`).join(', ')}`);
  console.log(`  Notes from ${pick.notesSource ?? 'the shops'}; ${pick.shown.length} shown. Check them by eye against the shop's page before posting.`);
  console.log(`  Answer (private): ${pick.rep.brand} ${pick.text.answerName} ${pick.rep.concentration}; ${pick.popularity} shops; ${pick.gender}, ${pick.tierName}, ${pick.band}`);
  console.log(`  Caption (${PUZZLE_CAPTION.length} characters): ${PUZZLE_CAPTION}`);
  if (flag('--dry-run')) {
    console.log('Dry run: nothing written.');
    return;
  }

  mkdirSync(dir, { recursive: true });
  const browser = await launchChromium();
  for (const f of FORMATS) {
    const html = puzzleHtml(view, layout, f);
    writeFileSync(join(dir, `guess-${f.file}.html`), html);
    await renderSmooth(browser, html, f.w, f.h, join(dir, `guess-${f.file}.png`));
  }
  await browser.close();
  writeFileSync(join(dir, 'caption.txt'), `${PUZZLE_CAPTION}\n`);
  writeFileSync(join(dir, 'alt.txt'), altText(view));
  writeFileSync(
    join(dir, 'check.json'),
    JSON.stringify(
      {
        about: 'THE ANSWER. The repository is public: commit and push this folder only when posting, with a message that names no fragrance.',
        no, date: today, id: pick.rep.id, key: pick.key, slug: pick.rep.slug,
        answer: { brand: pick.rep.brand, name: pick.text.answerName, catalogueName: pick.rep.name, concentration: pick.rep.concentration },
        shown: { house: phraseText(pick.text.houseWords), name: phraseText(pick.text.nameWords), houseSize: layout.house.size, nameSize: layout.name.size },
        notes: { source: pick.notesSource, from: pick.rep.id, top: pick.tiers.top, middle: pick.tiers.middle, base: pick.tiers.base, shown: pick.shown.map((n) => ({ tier: n.tier, name: n.name, icon: n.icon.file, groupIcon: n.icon.group })) },
        scores: { total: Number(scored.toFixed(3)), popularity: pick.popularity, gender: pick.gender, tier: pick.tierName, band: pick.band },
        rules: pick.rules,
        allowRepeat: ctx.allowRepeat === true,
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(dir, 'source.md'),
    `# Guess the Fragrance, puzzle ${no}\n\nMade by \`npm run social:guess\` (scripts/social-guess-fragrance.ts) on ${today}. The pictures are drawn from guess-3x4.html and guess-9x16.html; the answer is in check.json and is private until the reveal.\n`,
  );
  recordPictures(dir);
  const entry: HistoryEntry = { date: today, no, id: pick.rep.id, key: pick.key, brand: pick.rep.brand, gender: pick.gender, tier: pick.tierName, band: pick.band, revealed: null };
  writeFileSync(historyFile, JSON.stringify([...history.filter((h) => h.date !== today), entry], null, 2) + '\n');
  console.log(`${dir} written`);
}

async function runReveal(outRoot: string, historyFile: string, today: string) {
  const history = readHistory(historyFile);
  const entry = [...history].sort((a, b) => b.date.localeCompare(a.date)).find((h) => h.revealed === null);
  if (!entry) {
    console.log('No puzzle is waiting for its reveal.');
    process.exitCode = 3;
    return;
  }
  const now = new Date();
  const products = productsOf(DEMO_FRAGRANCES);
  const frag = DEMO_FRAGRANCES.find((f) => f.id === entry.id);
  if (!frag) throw new Error(`${entry.id} (puzzle ${entry.no}) is no longer in the catalogue`);
  const sizes = (products.get(entry.key) ?? [frag]).filter((f) => eligibleForBottlePosts(f));
  const noPrice = flag('--no-price');
  const priced = noPrice ? null : pricedSize(sizes, now);
  if (!noPrice && !priced) {
    throw new Error(`No fresh price (a purchasable, delivery stated cheapest offer fetched in the last ${FRESH_HOURS} hours) for puzzle ${entry.no}. Run again after the next crawl, or pass --no-price for a reveal without the price.`);
  }
  const shownFrag = priced?.frag ?? frag;
  const plan = planPuzzleText(shownFrag.brand, shownFrag.name);
  const name = opt('--name') ?? (plan.ok ? plan.answerName : tidyName(shownFrag.name));
  const url = `${SITE}/${shownFrag.slug}`;
  const check = flag('--skip-live-check') || noPrice ? null : liveCheck(shownFrag.id, url);
  if (check && !check.ok) throw new Error(`Live link check failed for ${url}: ${JSON.stringify(check)}`);
  const fetched = priced ? new Date(priced.best.fetchedAt) : null;
  const size = sizeLabel(shownFrag.sizeMl);
  const photoUrl = flag('--no-photo') ? null : shownFrag.photoUrl;
  const photo = photoUrl ? photoDataUri(photoUrl) : null;
  const view: RevealView = {
    brand: shownFrag.brand, name, concentration: shownFrag.concentration, size, photo,
    price: priced && fetched ? { amount: gbp(priced.delivered), shop: priced.best.retailer.name, checked: checkedClock(fetched) } : null,
  };
  const caption = priced && fetched
    ? revealCaption({ brand: shownFrag.brand, name, concentration: shownFrag.concentration, size, delivered: priced.delivered, shop: priced.best.retailer.name, checkedDate: checkedDate(fetched), slug: shownFrag.slug })
    : undash(`The answer: ${shownFrag.brand} ${name} ${shownFrag.concentration} ${size}. See today's price at pricesniffs.space/${shownFrag.slug} #guessthefragrance #perfume #pricesniffs`).trim();
  const dir = join(outRoot, `${today}-guess-fragrance-${pad(entry.no)}-reveal`);
  console.log(`${today}: reveal of puzzle ${entry.no}: ${shownFrag.brand} ${name} ${shownFrag.concentration} ${size}${priced ? `, ${gbp(priced.delivered)} at ${priced.best.retailer.name}` : ', no price'}`);
  console.log(`  Caption (${caption.length} characters): ${caption}`);
  if (flag('--dry-run')) {
    console.log('Dry run: nothing written.');
    return;
  }
  mkdirSync(dir, { recursive: true });
  const browser = await launchChromium();
  for (const f of FORMATS) {
    const html = revealHtml(view, f);
    // The committed HTML keeps the photo's address rather than a 1 MB inline copy.
    writeFileSync(join(dir, `reveal-${f.file}.html`), photo && photoUrl ? html.replace(esc(photo), esc(photoUrl)) : html);
    await renderSmooth(browser, html, f.w, f.h, join(dir, `reveal-${f.file}.png`));
  }
  await browser.close();
  writeFileSync(join(dir, 'caption.txt'), `${caption}\n`);
  writeFileSync(
    join(dir, 'check.json'),
    JSON.stringify(
      {
        puzzle: entry.no, id: shownFrag.id, url, brand: shownFrag.brand, name, concentration: shownFrag.concentration, size,
        delivered: priced?.delivered ?? null, shop: priced?.best.retailer.name ?? null,
        pricesCheckedAt: fetched?.toISOString() ?? null, freshHours: FRESH_HOURS, catalogueBuiltAt: CRAWLED_AT,
        priceShown: priced !== null, photoShown: photo !== null, photo: photoUrl, liveCheck: check,
      },
      null,
      2,
    ) + '\n',
  );
  recordPictures(dir);
  writeFileSync(historyFile, JSON.stringify(history.map((h) => (h.date === entry.date ? { ...h, revealed: today } : h)), null, 2) + '\n');
  console.log(`${dir} written; live check: ${check ? 'link opens the product on the live site' : 'skipped'}`);
}

async function main() {
  const today = opt('--date') ?? ukDate(new Date());
  const outRoot = resolve(opt('--out-root') ?? join(ROOT, 'social', 'posts'));
  const historyFile = resolve(opt('--history') ?? DEFAULT_HISTORY);
  if (flag('--reveal')) await runReveal(outRoot, historyFile, today);
  else await runPuzzle(outRoot, historyFile, today);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

