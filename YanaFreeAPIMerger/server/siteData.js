import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  NOTE_FAMILY_CANDIDATES,
  descriptorsIn,
  detectAudience,
  detectPerformanceRequest,
  detectOccasionRequest,
  parseBudget,
} from './requestPhrases.js';

/**
 * The only place this app touches pricesniffs.space's actual data.
 *
 * There is no database and no API to call: pricesniffs.space is a static
 * site, and its real "database" is the TypeScript modules the rest of that
 * repo already builds and ships from — `demo/data.ts`, `demo/catalogue.
 * generated.ts`, `src/services/priceService.ts`, `src/index.ts`, `demo/
 * brandSites.ts`, `demo/legal.ts`, `src/config/retailers.ts`. Importing those
 * directly, from this subfolder of the same repo, is the whole integration:
 * no re-scrape, no JSON copy, no second source of truth that can drift from
 * the one the site itself renders from.
 *
 * ── The site modules are imported exactly once per process ───────────────
 * This file used to append a changing query string (`?t=...`) to every
 * specifier, so that Node's module loader — which caches a module the first
 * time it is imported and never re-reads it — would treat each call as a
 * brand new module and re-read the file from disk. The intent was that a
 * long-running server should not keep answering from whatever prices
 * existed the moment it booted. Three measured facts killed that approach:
 *
 *   1. **It leaked, hard.** Every cache-busted specifier is a module Node's
 *      registry pins for the life of the process. `demo/catalogue.
 *      generated.ts` alone is ~15 MB of TypeScript, and `buildSiteDataBlock`
 *      called `loadSite()` three or four times per question. Measured on
 *      this repo's catalogue with `--expose-gc`, forcing a full collection
 *      between samples: heapUsed went 6.6 MB at boot → 209.7 MB after one
 *      question → 6,549 MB after fifty, i.e. ~129 MB of *permanently
 *      retained* heap per question. Nothing about that is reclaimable; the
 *      collector cannot free a live entry in the module registry.
 *
 *   2. **It only ever refreshed half the graph, so the halves disagreed.**
 *      A query string survives on the specifier you pass to `import()`, but
 *      it does not propagate through the relative specifiers *inside* the
 *      module you just loaded: `new URL('./catalogue.generated.js', '.../
 *      data.ts?t=2')` drops the query, so `demo/data.ts`'s own view of the
 *      catalogue resolved to the plain, first-import-wins URL and was pinned
 *      at boot no matter how many times `demo/data.js?t=N` was re-imported.
 *      The net effect was the worst of both: `catalogue.CRAWLED_AT` and
 *      `catalogue.offersFor()` were fresh, while `data.DEMO_FRAGRANCES` —
 *      the number `aboutContext()` states as "currently tracks N
 *      fragrances" — was boot-stale, and the two were quoted side by side in
 *      the same system prompt. Worse, because each `loadSite()` call built
 *      its own set of modules, `aboutContext()` and `priceContextFor()`
 *      within a *single answer* were reading different catalogues.
 *      (`test/siteData.test.js` pins this loader behaviour so the claim is
 *      checked rather than remembered.)
 *
 *   3. **In the container there was nothing to refresh.** The image COPYs
 *      `demo/*.ts` and `src/` at build time and the process never writes to
 *      the filesystem, so the bytes on disk cannot change while the server
 *      runs. Re-reading them per question bought precisely nothing there.
 *
 * So the seven modules below are imported once, plainly, as one coherent
 * graph: `catalogue` and the catalogue `data.ts` sees are now the same
 * module instance rather than two copies that can disagree, and every part
 * of one answer is computed from the same snapshot.
 *
 * ── How freshness is answered instead ────────────────────────────────────
 * By restarting, and honestly rather than silently. The chatbot's data is
 * as fresh as the last deploy — that was already true in production before
 * this change (see fact 3, and the "Data freshness" note in
 * docs/VIRTUAL-YANNY-DEPLOY.md), and re-running the deploy workflow is what
 * closes the gap. For the deployments where the files genuinely can change
 * under a running process — the bare-metal `deploy/` path, where a `git
 * pull` updates the checkout a systemd service is serving from —
 * `siteDataFreshness()` below stats the files this snapshot was built from
 * and reports whether any of them has changed since. `/api/health` surfaces
 * that as `siteData.stale`, so "this process is serving an older catalogue
 * than the disk holds" is a visible, monitorable fact with a one-line fix
 * (restart), instead of a silent drift. It deliberately does not trigger an
 * automatic in-process reload: fact 2 above is a property of Node's
 * resolver, not of this file, so a reload could only ever refresh the seven
 * entry modules and would hand back a snapshot whose halves disagree —
 * trading a clean staleness signal for a quiet correctness bug.
 *
 * ── Why this file has to run under tsx, not plain node ───────────────────
 * `demo/data.ts` and friends are TypeScript, and this app's own `npm start`
 * points at `tsx server/index.js` for exactly that reason: tsx installs a
 * loader hook that resolves the `.js` specifiers below to their real `.ts`
 * files and transpiles on the fly, the same way every script in the parent
 * repo already runs. Plain `node` would fail to resolve these imports at all.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every site module this backend reads from, keyed by the name `loadSite()`
 *  returns it under. Specifiers are `.js`; tsx resolves them to the `.ts`
 *  files that actually exist (see the header). */
const SITE_MODULES = {
  data: 'demo/data.js',
  catalogue: 'demo/catalogue.generated.js',
  priceService: 'src/services/priceService.js',
  index: 'src/index.js',
  brandSites: 'demo/brandSites.js',
  legal: 'demo/legal.js',
  retailers: 'src/config/retailers.js',
  // The site's own reading of who a fragrance is sold to, imported rather
  // than reimplemented. There is no gender field in the catalogue; the
  // filter panel on pricesniffs.space reads it off the product title with
  // `readGender`, and this backend has to give the *same* reading or the
  // chatbot and the panel will disagree about a bottle in front of a
  // reader. A second copy of those regexes here would drift on the first
  // exclusion anyone adds ("Portrait Of A Lady" is not a women's fragrance —
  // see demo/gender.ts), so there is one copy and both consumers import it.
  // Nothing about the demo/ -> YanaFreeAPIMerger/ boundary makes this
  // awkward: this file already imports six other `demo/*.ts` and `src/*.ts`
  // modules through tsx, and the Dockerfile already does `COPY demo/*.ts`,
  // so gender.ts arrives in the image with the rest of them.
  gender: 'demo/gender.js',
};

/**
 * The files whose contents this snapshot's answers depend on, for staleness
 * reporting only — never for cache invalidation (see the header).
 *
 * The seven entry modules, plus every `demo/*.generated.ts`: the generated
 * files are the ones the harvest actually rewrites hour to hour, they reach
 * this snapshot transitively through `demo/data.ts` rather than as entries
 * of their own, and globbing them means a new generated file added by a
 * later harvest is watched without anyone having to remember to list it.
 */
async function watchedFiles() {
  const files = new Set(
    Object.values(SITE_MODULES).map((rel) => path.join(repoRoot, rel.replace(/\.js$/, '.ts'))),
  );
  try {
    const demoDir = path.join(repoRoot, 'demo');
    for (const name of await fs.readdir(demoDir)) {
      if (name.endsWith('.generated.ts')) files.add(path.join(demoDir, name));
    }
  } catch {
    // No demo/ directory to glob (a trimmed image, a test fixture): the seven
    // entries above are still watched, and a missing file is reported as
    // 'missing' by fingerprint() rather than thrown.
  }
  return [...files].sort();
}

/** mtime+size per watched file. Cheap enough to recompute on every health
 *  check, and precise enough that a rewritten catalogue cannot look
 *  unchanged even if it happens to land on the same byte count. */
async function fingerprint() {
  const files = await watchedFiles();
  const stamped = await Promise.all(
    files.map(async (file) => {
      try {
        const st = await fs.stat(file);
        return [path.relative(repoRoot, file), `${st.mtimeMs}:${st.size}`];
      } catch {
        return [path.relative(repoRoot, file), 'missing'];
      }
    }),
  );
  return new Map(stamped);
}

/** Names present in either fingerprint whose stamp differs. Pure, and
 *  exported so the staleness rule is testable without touching the real
 *  catalogue files (which other jobs in this repo are writing to). */
export function changedSince(before, after) {
  const names = new Set([...before.keys(), ...after.keys()]);
  const changed = [];
  for (const name of names) {
    if (before.get(name) !== after.get(name)) changed.push(name);
  }
  return changed.sort();
}

/**
 * The one snapshot, as a promise so that concurrent first questions share a
 * single import rather than each starting their own ~15 MB parse.
 * @type {Promise<{ site: Record<string, object>, fingerprint: Map<string, string>, loadedAt: string }> | null}
 */
let snapshotPromise = null;

async function buildSnapshot() {
  // Fingerprinted *before* the import, deliberately: a file rewritten while
  // the import is in flight then reads as changed afterwards, which is the
  // safe direction to be wrong in.
  const fp = await fingerprint();
  const loadedAt = new Date().toISOString();
  const names = Object.keys(SITE_MODULES);
  const mods = await Promise.all(
    names.map((name) => import(pathToFileURL(path.join(repoRoot, SITE_MODULES[name])).href)),
  );
  const site = {};
  names.forEach((name, i) => {
    site[name] = mods[i];
  });
  return { site, fingerprint: fp, loadedAt };
}

/**
 * Every site module this backend reads from, as one coherent snapshot.
 *
 * Returns the same object on every call for the life of the process — see
 * the header for why that is the correct answer here and not a shortcut.
 * Callers must treat it as read-only.
 */
export async function loadSite() {
  if (!snapshotPromise) {
    snapshotPromise = buildSnapshot().catch((err) => {
      // A failed first import must not poison every later call: the most
      // likely cause is a generated file caught mid-rewrite by a concurrent
      // harvest, which succeeds on the next attempt.
      snapshotPromise = null;
      throw err;
    });
  }
  return (await snapshotPromise).site;
}

/**
 * Whether the data this process is answering from still matches the data on
 * disk. Reported by `/api/health` as `siteData`; see the header's freshness
 * note for why this reports rather than reloads.
 */
export async function siteDataFreshness() {
  // Captured locally: `loadSite()` clears `snapshotPromise` if the import
  // fails, and a health check racing that must report "not loaded", never
  // throw out of a handler whose whole contract is to answer 200 with facts.
  const pending = snapshotPromise;
  const notLoaded = { loaded: false, loadedAt: null, catalogueCrawledAt: null, stale: false, changedFiles: [] };
  if (!pending) return notLoaded;
  const snap = await pending.catch(() => null);
  if (!snap) return notLoaded;
  const changedFiles = changedSince(snap.fingerprint, await fingerprint());
  return {
    loaded: true,
    loadedAt: snap.loadedAt,
    catalogueCrawledAt: snap.site.catalogue?.CRAWLED_AT ?? null,
    stale: changedFiles.length > 0,
    changedFiles,
  };
}

function normalize(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A natural question ("how much is Sauvage EDT") is mostly filler around the
// two or three words that actually identify the fragrance — scoring every
// query word equally, filler included, dilutes a genuine match below the
// threshold on exactly the phrasing a real user types rather than a bare
// brand and name. Filtered out here, the same way scoring.js filters its own
// STOPWORDS before judging keyword overlap.
const QUERY_STOPWORDS = new Set([
  'how', 'much', 'is', 'are', 'the', 'a', 'an', 'do', 'does', 'what', 'whats',
  'price', 'cost', 'costs', 'for', 'of', 'in', 'me', 'my', 'you', 'i', 'to',
  'want', 'looking', 'find', 'get', 'buy', 'cheapest', 'lowest',
]);

const CONCENTRATION_ABBR = { 'eau de parfum': 'edp', 'eau de toilette': 'edt', 'eau de cologne': 'edc' };

/* ── "Not stated" is not a concentration ───────────────────────────────── */

/**
 * A concentration as it may be printed, or null when no shop stated one.
 *
 * `concentration` is a required string on every catalogue entry, so there is
 * no empty slot for "the shop did not say" and the harvest fills it with the
 * literal string "Not stated" instead — 208 of the 12,666 products as
 * measured with a count over DEMO_FRAGRANCES. That value is a statement
 * about the *listing*, not a strength of perfume oil in alcohol, and it used
 * to be interpolated into answers in exactly the slot every real strength
 * occupies:
 *
 *   Sol de Janeiro Cheirosa '59 Mist (Not stated), 240ml. Cheapest right
 *   now: £34.40 delivered from Perfume Click.
 *
 * which reads as a fourth concentration alongside Eau de Parfum and Extrait
 * de Parfum rather than as the absence of one. Every label in this backend
 * goes through here so that absence is spelled out instead.
 */
export function concentrationLabel(concentration) {
  const c = String(concentration ?? '').trim();
  return c && !/^not stated$/i.test(c) ? c : null;
}

/**
 * "Brand Name (Eau de Parfum)", or "Brand Name (concentration not stated)".
 *
 * Deliberately explicit rather than simply dropping the bracket: a reader
 * comparing two lines wants to know which of them the shop actually graded,
 * and a silently missing parenthetical looks like a formatting bug.
 */
export function productLabel(f) {
  const c = concentrationLabel(f.concentration);
  return `${f.brand} ${f.name} (${c ?? 'concentration not stated'})`;
}

/**
 * Extra filler to strip when resolving a *named product* out of a question
 * that is not a price question.
 *
 * QUERY_STOPWORDS above is tuned for "how much is X": it strips price
 * vocabulary and the filler that surrounds it, and it is deliberately left
 * exactly as it was, because the price path's behaviour is pinned by tests
 * against the live catalogue and widening its stopword list would move every
 * one of those match scores.
 *
 * The other intents need a different set, for a mechanical reason. The
 * matcher scores `hits / qWords.length`, so every query word that cannot
 * possibly appear in a brand or product name still sits in the denominator
 * and drags a real match below the 0.34 floor. Measured: "who sells Layton"
 * scores 1/3 = 0.33 under QUERY_STOPWORDS alone and resolves to *no match*
 * at all, for a fragrance the catalogue definitely holds.
 *
 * ── Why this is split per intent rather than one big list ────────────────
 * Common English words really are product names here. Checked against the
 * live catalogue: "Blue Note" (Bujairami), "Real Deal" (Bujairami), "Rumour
 * Has It" (Bujairami), "Where's The Party?" (Mr. Wonderful), "Girl of Now"
 * (Elie Saab), "Pleats Please" (Issey Miyake), "Under The Lemon Trees"
 * (Maison Margiela), "More Than Words" (Xerjoff) — a single flat stopword
 * list containing note/deal/size/stock vocabulary would strip the only
 * distinguishing word out of a genuine query for one of them.
 *
 * So each intent strips only its own trigger vocabulary, which by
 * construction is the vocabulary that is *about the question* rather than
 * about the product: an availability question strips "stock", a notes
 * question strips "notes", and neither strips the other's. "is Blue Note in
 * stock" keeps both "blue" and "note"; "what are the notes in Blue Note"
 * strips the plural "notes" and keeps the singular that names the bottle.
 */
const GENERIC_LOOKUP_STOPWORDS = [
  'it', 'its', 'they', 'them', 'their', 'there', 'here', 'this', 'that', 'these', 'those',
  'any', 'some', 'can', 'could', 'would', 'should', 'will', 'have', 'has', 'had', 'got',
  'tell', 'show', 'know', 'please', 'right', 'now', 'today', 'still', 'currently',
  'which', 'who', 'whos', 'where', 'wheres', 'when', 'why', 'be', 'been', 'was', 'were',
  'your', 'yours', 'all', 'about', 'more', 'most', 'many', 'much', 'also', 'just',
  'really', 'ever', 'then', 'so', 'if', 'but', 'not', 'im', 'ive', 'am',
  // Texting shorthand. "best deals rn" left "rn" as the only product word
  // once the deals vocabulary was stripped, and `haystack.includes('rn')`
  // scored 1.0 against Inferno, Eternia and every other title containing
  // the letter pair — turning a browse of the deals list into a clarifying
  // question about eight unrelated perfumes. Measured; pinned in
  // test/corpus.test.js.
  'rn', 'atm', 'pls', 'plz', 'thx', 'asap', 'lol', 'tbh', 'btw',
  // Bare prepositions and conjunctions. These do appear inside real product
  // names ("Game On", "Diamonds And Rubies", "Stronger With You"), which is
  // why they are only ever *removed from the query* and never from the
  // haystack — a query still matches those products on their distinctive
  // words. Left in, they are actively harmful: "what's on sale" reduces to
  // the single word "on" once the deals vocabulary is stripped, and that
  // scores 1.0 against every product with "on" anywhere in its title,
  // turning a question about the deals list into a clarifying question about
  // eight unrelated perfumes. Measured, before this line existed.
  'on', 'at', 'in', 'into', 'onto', 'with', 'and', 'or', 'as', 'per', 'via',
];

const INTENT_LOOKUP_STOPWORDS = {
  availability: [
    'stock', 'stocks', 'stocked', 'stocking', 'stockist', 'stockists', 'sold', 'sell',
    'sells', 'selling', 'available', 'availability', 'anywhere', 'everywhere', 'carry',
    'carries', 'order', 'out', 'in',
  ],
  delivery: [
    'delivery', 'deliveries', 'deliver', 'delivers', 'delivered', 'shipping', 'ship',
    'ships', 'shipped', 'postage', 'post', 'posted', 'free', 'from', 'including',
  ],
  notes: [
    'smell', 'smells', 'smelling', 'smelt', 'note', 'notes', 'accord', 'accords',
    'profile', 'top', 'base', 'middle', 'heart', 'kind', 'sort', 'contain', 'contains',
    'like', 'of',
  ],
  size: [
    'size', 'sizes', 'bottle', 'bottles', 'ml', 'come', 'comes', 'other', 'another',
    'bigger', 'smaller', 'larger', 'travel', 'mini',
  ],
  deals: [
    'sale', 'sales', 'deal', 'deals', 'discount', 'discounts', 'discounted', 'reduced',
    'reduction', 'offer', 'offers', 'off', 'percent', 'bargain', 'bargains', 'clearance',
    'saving', 'savings', 'biggest', 'best', 'drop', 'drops',
  ],
  // "one" is deliberately absent, despite "which one is better" being the
  // phrasing that suggested it: stripping it turned "One Million Elixir" into
  // "Million Elixir", which ties every Rabanne Elixir in the catalogue and
  // made a perfectly clear comparison unanswerable. "which" is already
  // generic filler, which is enough.
  compare: [
    'vs', 'versus', 'compare', 'compared', 'comparison', 'better', 'value', 'worth',
    'than', 'less', 'expensive', 'dearer', 'cheaper', 'cheap',
  ],
  brand: ['list', 'lists', 'listed', 'stock', 'carry', 'sell', 'sells', 'do', 'by'],
  budget: [
    'under', 'below', 'less', 'than', 'more', 'max', 'maximum', 'up', 'around', 'budget',
    'spend', 'quid', 'pounds', 'pound', 'anything', 'something', 'fragrance', 'fragrances',
    'perfume', 'perfumes',
  ],
};

/** The stopword set to strip for a given intent. 'price' keeps exactly the
 *  list it always had, so nothing about the pinned price path moves. */
function stopwordsFor(intent) {
  if (intent === 'price' || !intent) return QUERY_STOPWORDS;
  return new Set([
    ...QUERY_STOPWORDS,
    ...GENERIC_LOOKUP_STOPWORDS,
    ...(INTENT_LOOKUP_STOPWORDS[intent] ?? []),
  ]);
}

/** A bare bottle size written as one token, e.g. "100ml". Survives
 *  `normalize` intact because that keeps digits and letters. */
const SIZE_TOKEN_RE = /^\d+(?:\.\d+)?ml$/;

/** The words of a question that could plausibly name a product, for a given
 *  intent. Exported for tests, which is the only way to check the claims in
 *  the comment above rather than trust them. */
export function productWords(question, intent) {
  const stop = stopwordsFor(intent);
  return normalize(question)
    .split(' ')
    .filter((w) => {
      if (!w || stop.has(w)) return false;
      // A lone letter is apostrophe debris, not a product word: `normalize`
      // turns "what's on sale" into "what s on sale", and that stray "s"
      // survived every stopword list and then matched 1.0 against any
      // product whose title contains an s — which is most of them. Measured:
      // it turned "what's on sale" into a clarifying question about eight
      // unrelated perfumes. Single *digits* are kept, because "1 Million" is
      // a real product name.
      if (/^[a-z]$/.test(w)) return false;
      // A bare size is part of the question, never part of a product's name:
      // "is there a 30ml of Aventus" is about Aventus, and leaving "30ml" in
      // the word list drags a perfect match down to 0.5 (it appears in no
      // brand or product name) and turns an answerable question into a
      // clarifying one. The size itself is not discarded — every caller that
      // cares reads it back off the raw question with its own regex.
      //
      // Not applied to 'price', whose word list is pinned by tests against
      // the live catalogue: there "how much is Dior Sauvage 100ml" scores
      // 2/3 today, and removing the size would take it to 3/3, tying the
      // EDT, EDP and Parfum and turning a working answer into a question.
      if (intent !== 'price' && SIZE_TOKEN_RE.test(w)) return false;
      return true;
    });
}

/**
 * Same shape of fuzzy match the mock version used (fraction of query words
 * found in brand+name), now run against every real fragrance the site
 * currently carries rather than a 6 row fixture, with two fixes a natural
 * question needs that a bare "Brand Name" query did not: filler words
 * filtered out (see QUERY_STOPWORDS above), and both "Eau de Toilette" and
 * "EDT" recognised as the same concentration in either direction.
 */
export function findFragranceMatch(query, fragrances) {
  const qWords = normalize(query).split(' ').filter((w) => w && !QUERY_STOPWORDS.has(w));
  if (qWords.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const frag of fragrances) {
    const concentrationLower = (frag.concentration ?? '').toLowerCase();
    const abbr = CONCENTRATION_ABBR[concentrationLower] ?? '';
    const haystack = normalize(`${frag.brand} ${frag.name} ${frag.concentration} ${abbr}`);
    const hits = qWords.filter((w) => haystack.includes(w)).length;
    const score = hits / qWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = frag;
    }
  }
  return bestScore >= 0.34 ? { fragrance: best, matchConfidence: Math.round(bestScore * 100) } : null;
}

/** Where a "no <this>" exclusion starts, and what it excludes. Free text on
 *  the exclusion side deliberately: an exclusion is matched by substring
 *  against candidates' own notes below, so "no florals" usefully rules out
 *  "Floral Notes" and "White Floral" without either being a catalogue note
 *  name in its own right. */
const NOTE_EXCLUSION_RE = /no\s+([a-z, ]+)/;

function splitOnExclusion(lower) {
  const m = lower.match(NOTE_EXCLUSION_RE);
  return m
    ? { wantedText: lower.slice(0, m.index), unwanted: m[1].split(/[, ]+/).filter(Boolean) }
    : { wantedText: lower, unwanted: [] };
}

// (The original `parseNoteRequest` — split the sentence on commas and " and "
// and call each fragment a note — lived here until it had no production
// callers left: the wanted side moved to `extractNotes` below, the exclusion
// side to `splitOnExclusion` above. Removed as dead code from the
// pre-classifier era.)

/**
 * The note names this catalogue actually uses, for reading notes out of a
 * sentence.
 *
 * The original parser split the question on commas and " and " and
 * treated every fragment as a note name, which `fragrancesWithNote` then
 * matched *exactly*. That works for "vanilla, amber" and fails for every
 * sentence a person actually types: "suggest something with vanilla and
 * amber, no florals" yields the fragment "suggest something with vanilla",
 * which matches no note at all, so half the request is silently dropped
 * before the council ever sees it. The council then gets a SITE DATA block
 * saying nothing matched, for a request the catalogue could have answered —
 * and a model given nothing to work from is exactly the situation that
 * produced this project's original invented-answer bug.
 *
 * So the wanted side is read against the catalogue's own note vocabulary
 * (`NOTE_INDEX`, 1,576 distinct names) rather than guessed from punctuation.
 *
 * Two filters on the vocabulary, both because the index is harvested text
 * and not a curated list: names shorter than three characters and names used
 * by fewer than three fragrances are dropped. Without them the index's own
 * junk entries — measured, in the live catalogue: "An" (1 fragrance), "Mr"
 * (1), "Min" (1), "Tob" (1), "Deepening the experience" (1) — would match
 * ordinary English words in the question and invent a note request nobody
 * made.
 */
/**
 * Vocabulary entries that are listing metadata, not notes.
 *
 * `Notes` is populated from whatever a retailer labelled as notes, and some
 * feeds put a season or an audience in that field. Measured in the live
 * catalogue: Versace Pour Homme Dylan Blue's note list reads "Summer,
 * Autumn, Summer, Autumn, Summer, Autumn". Left in the query vocabulary,
 * "recommend me a summer fragrance" reads "summer" as a note request and
 * grounds the council with four products that share a season tag — a
 * confident-looking answer to a question about weather, built on metadata.
 *
 * Only the fragrances' stored notes are left untouched; this list governs
 * what may be read *out of a question* as a request.
 */
const NON_NOTE_VOCABULARY = new Set([
  'summer', 'autumn', 'winter', 'spring', 'fall',
  'women', 'men', 'unisex', 'ladies', 'gents', 'him', 'her',
]);

let noteVocabulary = null;
async function noteVocab() {
  if (noteVocabulary) return noteVocabulary;
  const { data } = await loadSite();
  noteVocabulary = data.NOTE_INDEX
    .filter((n) => n.count >= 3 && !NON_NOTE_VOCABULARY.has(normalize(n.name)))
    .map((n) => ({ name: n.name, needle: normalize(n.name) }))
    .filter((n) => n.needle.length >= 3)
    // Longest first, so "Dark Chocolate" is read as one note rather than
    // consumed as "Chocolate" with a stray "dark" left over.
    .sort((a, b) => b.needle.length - a.needle.length);
  return noteVocabulary;
}

/** Every catalogue note named in a piece of text, longest match first, each
 *  consumed so it cannot also match as part of a shorter one. Exported so
 *  the vocabulary claims above are testable. */
export async function extractNotes(text) {
  const vocab = await noteVocab();
  let haystack = ` ${normalize(text)} `;
  const found = [];
  for (const note of vocab) {
    const padded = ` ${note.needle} `;
    if (!haystack.includes(padded)) continue;
    found.push(note.name);
    haystack = haystack.split(padded).join('  ');
  }
  return found;
}

/**
 * The descriptor families, with every candidate note checked against the
 * live catalogue before it is allowed to be part of one.
 *
 * `requestPhrases.js` proposes the note names for "sweet", "fresh", "woody"
 * and the rest; this is where a proposal becomes usable, and the check is
 * the entire safety argument for the feature. A name is kept only if
 * NOTE_INDEX carries it with the same `count >= 3` floor `noteVocab` uses
 * (harvested text, so a name used once is as likely to be junk as a real
 * note). Anything else is dropped silently and the family is simply
 * smaller. That means this code cannot name a note the catalogue does not
 * use even if the table over there goes stale — measured today, "Marine
 * Notes", "Sea Notes", "Green Notes" and "Woody Notes" all resolve to 0 in
 * the live index, which is why they are not in the table at all.
 *
 * A family with nothing left is dropped entirely rather than answered as an
 * empty match, so a descriptor whose notes have all fallen out of the index
 * degrades to "I can't match that" instead of quietly matching everything.
 */
let noteFamilyCache = null;
export async function noteFamilies() {
  if (noteFamilyCache) return noteFamilyCache;
  const { data } = await loadSite();
  const counts = new Map(data.NOTE_INDEX.map((n) => [n.name.toLowerCase(), n]));
  const families = new Map();
  for (const [family, { notes }] of Object.entries(NOTE_FAMILY_CANDIDATES)) {
    const kept = notes
      .map((name) => counts.get(name.toLowerCase()))
      .filter((entry) => entry && entry.count >= 3)
      .map((entry) => entry.name);
    if (kept.length > 0) families.set(family, kept);
  }
  noteFamilyCache = families;
  return families;
}

/**
 * Everything a question asks for on the scent side: the notes it names
 * outright, plus the notes each descriptor word is read as.
 *
 * One function, because the two used to be one call and the gap was
 * invisible to a reader. "Something sweet under £30" named the literal
 * catalogue note "Sweet" — used by 8 fragrances out of 10,379 — and nothing
 * else, so the answer looked like the catalogue held almost nothing sweet.
 * Expanding the descriptor puts the request where the data actually is
 * (Vanilla 1,213, Tonka Bean 379, Caramel 206, …) without any answer ever
 * claiming a note a bottle does not list.
 *
 * `families` comes back beside the flat note list precisely so callers can
 * *show their working*: an answer built on a descriptor names the notes it
 * read the word as, which is the difference between a reading a reader can
 * disagree with and a fact this site invented.
 *
 * @returns {Promise<{ notes: string[], literal: string[], families: {family: string, word: string, notes: string[]}[], unmatchedDescriptors: string[] }>}
 */
export async function requestedNotes(text) {
  const literal = await extractNotes(text);
  const available = await noteFamilies();
  const families = [];
  const unmatchedDescriptors = [];
  for (const { word, family } of descriptorsIn(text)) {
    const notes = available.get(family);
    if (notes) families.push({ family, word, notes });
    else unmatchedDescriptors.push(word);
  }
  // Literal first: a note the reader typed by name outranks one this code
  // inferred from an adjective, and the candidate ranking below is by how
  // many requested notes a product carries.
  const notes = [...new Set([...literal, ...families.flatMap((f) => f.notes)])];
  return { notes, literal, families, unmatchedDescriptors };
}

/** "what smells like Aventus", "any dupes for Baccarat Rouge" — the phrases
 *  that name a *reference fragrance* rather than a note. Deliberately
 *  specific: a bare "like" is far too common in ordinary phrasing to treat
 *  as a product reference. */
const SIMILAR_TO_RE = /\b(?:similar to|smells? like|smelling like|dupes? (?:for|of)|alternatives? to|clones? of|something like|reminds me of|in the style of)\s+(.{2,60})$/i;

/**
 * The real, delivery-inclusive price for a fragrance — built from the exact
 * same `buildComparison`/`bestOffer` pipeline the site itself renders the
 * detail page from (see demo/app.ts's own rowsFor), so a number this backend
 * states can never disagree with what a reader sees on the page for the same
 * fragrance.
 */
async function priceContextFor(question) {
  const { data, catalogue, priceService } = await loadSite();
  const match = findFragranceMatch(question, data.DEMO_FRAGRANCES);
  if (!match) {
    return 'PRICE MATCH: none. No fragrance in the current catalogue matched this query closely enough to quote a price.';
  }

  const { fragrance, matchConfidence } = match;
  const offers = catalogue.offersFor(fragrance.id);
  const rows = priceService.buildComparison(offers, { sortBy: 'delivered', tier: fragrance.tier });
  const best = priceService.bestOffer(rows);

  if (!best) {
    return (
      `PRICE MATCH (${matchConfidence}% confidence): ${fragrance.brand} ${fragrance.name}, ` +
      `${concentrationLabel(fragrance.concentration) ?? 'concentration not stated'}, ` +
      `${fragrance.sizeMl}ml. Currently out of stock everywhere this site tracks.`
    );
  }

  const gbp = (pence) => `£${(pence).toFixed(2)}`;

  // Some purchasable rows for this exact fragrance can still have no delivered
  // price: `buildComparison`'s own sort already keeps `bestOffer` from ever
  // picking one of these as cheapest (see priceService.ts's own comment on
  // that), but a reader can still reasonably ask "what about <that shop>?", so
  // naming them here — rather than only enforcing the rule silently upstream
  // — gives Virtual Yanny the words to answer honestly instead of guessing.
  const unstatedDelivery = rows.filter((r) => r.isPurchasable && r.deliveredPriceGbp === null);
  const unstatedNote = unstatedDelivery.length
    ? ` Also stocked (item price only, delivery not stated, never the cheapest option) by: ${unstatedDelivery
        .map((r) => `${r.retailer.name} (${gbp(r.itemPriceGbp)} item price)`)
        .join(', ')}.`
    : '';

  return (
    `PRICE MATCH (${matchConfidence}% confidence): ${fragrance.brand} ${fragrance.name}, ` +
    `${concentrationLabel(fragrance.concentration) ?? 'concentration not stated'}, ` +
    `${fragrance.sizeMl}ml. Cheapest right now: ${gbp(best.deliveredPriceGbp)} ` +
    `delivered, from ${best.retailer.name}. Stocked by ${rows.filter((r) => r.isPurchasable).length} shop(s) ` +
    `this site tracks in total.${unstatedNote}`
  );
}

/* ── who a fragrance is sold to ────────────────────────────────────────── */

/**
 * The site's own reading of who each bottle is for, and how much of the
 * catalogue that reading actually covers.
 *
 * ── Why this exists now, having been a refusal before ────────────────────
 * Virtual Yanny used to answer every gender question with "I can't filter by
 * who it is for — the catalogue doesn't record that." That was correct when
 * it was written and it is now half wrong. There is still no gender field
 * anywhere in this project, and there never will be one upstream; what
 * changed is that `demo/gender.ts` now exists, reads an audience off the
 * words a shop printed in its own title, and the site's filter panel offers
 * it. Refusing a question the site itself answers in a sidebar is no longer
 * honesty, it is a stale answer.
 *
 * ── What is read, and what is emphatically not ───────────────────────────
 * `readGenderEvidence` is imported, never reimplemented. Two readings of the
 * same titles would drift on the first exclusion anyone adds — "Portrait Of
 * A Lady" is not a women's fragrance, "Rose Of No Man's Land" is not a
 * men's, "Donna Karan" is a person — and then the chatbot and the filter
 * would classify the same bottle differently in front of the same reader.
 *
 * The rule that governs every answer built on this: **not stated never
 * becomes unisex**. They are different claims and only one of them is ours.
 * Measured on this snapshot (`npx tsx scripts/gender-coverage.ts`, 12,666
 * products):
 *
 *   Women's       657    5.19%
 *   Men's       1,040    8.21%
 *   Unisex         18    0.14%
 *   Not stated 10,951   86.46%
 *
 * 1,715 classified, 13.54%. Eighteen titles say unisex. Ten thousand nine
 * hundred and fifty-one say nothing, and folding those into unisex would
 * attach a marketing claim nobody made to the largest group in the
 * catalogue. So a gender answer filters to exactly the reading asked for
 * and discloses the split, the same way the filter panel does on screen.
 * `genderCoverage()` computes those numbers rather than quoting them, so the
 * disclosure is arithmetic a reader can check and not a comment that rots.
 */
let genderIndexPromise = null;

async function buildGenderIndex() {
  const { data, gender } = await loadSite();
  const byId = new Map();
  const counts = { mens: 0, womens: 0, unisex: 0, notStated: 0 };
  for (const f of data.DEMO_FRAGRANCES) {
    // Exactly the string demo/app.ts reads, so a classification the chatbot
    // states can be checked against the card the reader is looking at.
    const evidence = gender.readGenderEvidence(`${f.brand} ${f.name} ${f.concentration}`);
    byId.set(f.id, evidence);
    counts[evidence.reading] += 1;
  }
  const total = data.DEMO_FRAGRANCES.length;
  return {
    byId,
    counts,
    total,
    stated: total - counts.notStated,
    label: gender.GENDER_LABEL,
  };
}

/** The reading for every product, plus the coverage split. Computed once per
 *  process, like every other index here — the snapshot cannot change under
 *  it (see this file's header). */
export async function genderCoverage() {
  if (!genderIndexPromise) {
    genderIndexPromise = buildGenderIndex().catch((err) => {
      genderIndexPromise = null;
      throw err;
    });
  }
  return genderIndexPromise;
}

/**
 * The disclosure, in one sentence, written once and used by both the
 * deterministic answer and the council's SITE DATA block.
 *
 * It says three things and none of them is optional: where the reading comes
 * from, how much of the catalogue it covers, and that silence is not unisex.
 * Drop any one of them and the answer starts implying the other 86% were
 * considered and rejected.
 */
export async function genderDisclosure() {
  const g = await genderCoverage();
  const n = (x) => x.toLocaleString('en-GB');
  return (
    'Read from wording in the title, such as "Pour Homme" or "For Her" — ' +
    `${n(g.stated)} of the ${n(g.total)} bottles say who they are for and ${n(g.counts.notStated)} do not say. ` +
    `Not stated is not the same as unisex: only ${n(g.counts.unisex)} titles say unisex, and I don't read silence as one.`
  );
}

/** `<brand>|<name>|<concentration>`, lowercased: every size of one perfume
 *  shares this key (mirrors `variantGroup` in demo/data.ts). */
function groupKeyFor(f) {
  return `${f.brand}|${f.name}|${f.concentration}`.toLowerCase();
}

/**
 * Deterministic, LLM-free resolution of a price question against the live
 * catalogue — no model call, so it cannot hallucinate a denial, a price, a
 * size or a retailer the way the reported "One Million Elixir" bug did. See
 * `formatPriceAnswer` below for turning this into the words a reader sees,
 * and `runCouncil` in council.js for why intent `'price'` answers from this
 * alone rather than fanning the question out to the model council at all.
 *
 * Reuses `findFragranceMatch`'s exact scoring (same word-overlap, same 0.34
 * threshold, same stopword filter) — the whole point is that this can never
 * disagree with what the SITE DATA block already told a model, it just also
 * gets to act on the answer directly instead of asking an LLM to relay it.
 *
 * Goes one step further findFragranceMatch does not: `findFragranceMatch`
 * returns a single best-scoring *row*, silently picking whichever happens to
 * sit first in the catalogue when several score identically. That is fine
 * for grounding a prompt (the LLM sees the whole SITE DATA block, sizes
 * included), but wrong for a reply written with no LLM in the loop at all — a
 * bare brand name like "Rabanne" scores 1/1 against every Rabanne fragrance
 * equally, and confidently naming one of them as "the" answer would be a
 * fluent, well-formed, wrong answer, exactly the failure mode this whole fix
 * exists to remove. So this checks for a tie across *distinct products*
 * (different brand+name+concentration, not just different sizes of the same
 * one) at the top score, and reports `ambiguous` rather than guessing.
 */
export async function resolvePriceQuery(question) {
  const { catalogue, priceService } = await loadSite();
  const resolved = await resolveProductQuery(question, 'price');
  if (resolved.status !== 'matched') return resolved;

  const { anchor, group, matchConfidence } = resolved;
  const variants = group.map((f) => {
    const offers = catalogue.offersFor(f.id);
    const rows = priceService.buildComparison(offers, { sortBy: 'delivered', tier: f.tier });
    const best = priceService.bestOffer(rows);
    return {
      sizeMl: f.sizeMl,
      purchasableCount: rows.filter((r) => r.isPurchasable).length,
      best: best ? { deliveredPriceGbp: best.deliveredPriceGbp, retailerName: best.retailer.name } : null,
    };
  });

  return {
    status: 'matched',
    matchConfidence,
    brand: anchor.brand,
    name: anchor.name,
    concentration: anchor.concentration,
    variants,
  };
}

/**
 * Which product a question names, if any — the single identity step every
 * deterministic lookup shares.
 *
 * This is `resolvePriceQuery`'s own matching, lifted out unchanged so that
 * "is X in stock", "what does X smell like", "what sizes of X" and "how much
 * is X" can never disagree about what X is. The only thing parameterised is
 * which stopwords get stripped first (see `stopwordsFor`); with
 * `intent: 'price'` the behaviour is byte-for-byte what it was, which is why
 * the price tests pinned against the live catalogue still pass.
 *
 * Four outcomes, and three of them are refusals:
 *   - `no_match`      nothing in the catalogue scored above the 0.34 floor.
 *   - `ambiguous`     several *distinct products* (not merely several sizes
 *                     of one) tied at the top score. Returns up to 8 of them
 *                     so the caller can ask which was meant rather than
 *                     picking one, which would be a fluent wrong answer.
 *   - `low_confidence` one product, but scoring under 0.5 — loose enough
 *                     that stating facts about it as though it were the
 *                     product asked for would be a guess.
 *   - `matched`       one product, at or above 0.5. `group` is every size of
 *                     it in the catalogue, smallest first.
 *
 * The three refusals are the whole safety argument for every caller: a
 * deterministic answer is only ever written when the identity of the product
 * is settled, and the words for the other three cases say plainly that it is
 * not.
 */
/**
 * Whether an unmatched question reads like a follow-up to an earlier one —
 * "what about the 50ml", "is it in stock", "how much is that one".
 *
 * `/api/chat` keeps no conversation (the README and demo/legal.ts both say
 * so), so there is nothing to resolve "it" against and the lookup rightly
 * finds no product. But the stock refusal — "try the brand and product
 * name" — reads as if the bot forgot something it was just told, which is
 * more confusing than the truth. This flag lets `formatIdentityRefusal` say
 * the truth instead: each message stands alone.
 *
 * Checked only after a lookup has already failed, which is what makes the
 * loose pronoun patterns safe: a question that *did* resolve never gets
 * here, so the only cost of a false positive is one extra true sentence on
 * a refusal.
 */
const FOLLOW_UP_RE = /\b(what|how|and) about\b|\b(it|its|that one|this one|the same one?|the other one)\b|^and\b/i;
export function seemsFollowUp(question) {
  return FOLLOW_UP_RE.test(String(question ?? ''));
}

/**
 * Every fragrance's match haystack and title length, computed once per
 * process instead of once per question.
 *
 * Safe to memoise for the same reason `deliveredPriceIndex` in lookups.js
 * is: the snapshot `loadSite()` returns cannot change while the process
 * runs (see this file's header), so a derivation of it cannot go stale.
 * The strings are byte-for-byte what the per-question loop built before —
 * only *when* they are built moved. Measured with `npm run bench`: every
 * product-anchored lookup (price, availability, notes, size) dropped from
 * ~17-19ms to ~2-3ms, and compare (two lookups) from ~36ms to ~5ms,
 * because the dominant cost was re-running `normalize` over ~10,000
 * brand+name+concentration strings per question.
 */
let productIndexCache = null;
async function productIndex() {
  if (productIndexCache) return productIndexCache;
  const { data } = await loadSite();
  productIndexCache = data.DEMO_FRAGRANCES.map((frag) => {
    const concentrationLower = (frag.concentration ?? '').toLowerCase();
    const abbr = CONCENTRATION_ABBR[concentrationLower] ?? '';
    return {
      frag,
      haystack: normalize(`${frag.brand} ${frag.name} ${frag.concentration} ${abbr}`),
      titleWords: normalize(`${frag.brand} ${frag.name}`).split(' ').length,
    };
  });
  return productIndexCache;
}

export async function resolveProductQuery(question, intent = 'price') {
  const { data } = await loadSite();
  const qWords = productWords(question, intent);
  if (qWords.length === 0) return { status: 'no_match', followUp: seemsFollowUp(question) };

  let bestScore = 0;
  const scored = [];
  for (const { frag, haystack, titleWords } of await productIndex()) {
    const hits = qWords.filter((w) => haystack.includes(w)).length;
    const score = hits / qWords.length;
    if (score > bestScore) bestScore = score;
    if (score > 0) scored.push({ frag, score, titleWords });
  }
  if (bestScore < 0.34) return { status: 'no_match', followUp: seemsFollowUp(question) };

  const top = scored.filter((s) => s.score === bestScore);
  const topGroupKeys = new Set(top.map((s) => groupKeyFor(s.frag)));
  const matchConfidence = Math.round(bestScore * 100);

  let resolvedTop = top;
  if (topGroupKeys.size > 1) {
    /**
     * Tightest fit, and only when the fit is total.
     *
     * Word-overlap scoring gives every product *containing* the query the
     * same 1.0, so "who has Aventus" tied Creed Aventus with Creed Aventus
     * Cologne, Creed Absolu Aventus Limited Edition, Creed Aventus For Her
     * and Assaf Frankel Aventus Assaf, and the only available answer was to
     * ask which was meant. Measured across the shapes in
     * test/lookups.test.js, that was almost every single-word product
     * question — a clarifying question in place of an answer the data
     * plainly has.
     *
     * When every query word is found (bestScore === 1) the products are
     * ordered by how little else is in their title: the query fully
     * describes "Creed Aventus" and only partly describes "Creed Aventus
     * Cologne", so the former is the tighter fit and, if it is uniquely the
     * tightest, it is the answer. This is a containment argument, not a
     * popularity guess: nothing outside the title is consulted.
     *
     * Two guards keep it from ever manufacturing confidence:
     *
     *   - It requires bestScore === 1. Below that the query is only
     *     partially matched and a tie is genuine ignorance — "bleu de
     *     chanel" hits 0.5 against Guy Laroche Drakkar Bleu, Armaf Voyage
     *     Bleu and Chanel Allure Homme Sport alike (the site does not carry
     *     Chanel's Bleu de Chanel), and picking the shortest of those would
     *     be a confident wrong answer of exactly the kind this work exists
     *     to remove.
     *   - It refuses when the query names only a brand. Every word of "how
     *     much is Rabanne" sits inside the brand, which identifies a house
     *     and not a bottle, so no title length can settle which bottle was
     *     meant.
     *
     * If the tightest fit is not unique, nothing is picked and the caller
     * asks. "Dior Sauvage" ties the EDT, EDP and Parfum at two words each
     * and stays a question, which is right — those are three products.
     */
    const brandOnly = top.some((s) => {
      const brand = normalize(s.frag.brand);
      return qWords.every((w) => brand.includes(w));
    });
    if (bestScore === 1 && !brandOnly) {
      const fewest = Math.min(...top.map((s) => s.titleWords));
      const tightest = top.filter((s) => s.titleWords === fewest);
      if (new Set(tightest.map((s) => groupKeyFor(s.frag))).size === 1) resolvedTop = tightest;
    }
  }

  if (new Set(resolvedTop.map((s) => groupKeyFor(s.frag))).size > 1) {
    const seen = new Set();
    const candidates = [];
    // Tightest fit first. The list is capped at 8, so which 8 survive
    // matters: catalogue order put "Creed Neroli Sauvage" and "Privee
    // Couture Collection Sauvage Perfume Privee Couture Collection" ahead of
    // plain "Dior Sauvage" for the query "Sauvage", which makes the
    // clarifying question harder to answer than it needs to be. Ordering by
    // title length puts the products the query describes most completely at
    // the front without dropping any of the others.
    for (const s of [...resolvedTop].sort((a, b) => a.titleWords - b.titleWords)) {
      const key = groupKeyFor(s.frag);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(s.frag);
      if (candidates.length >= 8) break; // Enough to ask a real question, not a wall of names.
    }
    // `exact` tells the caller whether these tied on a *complete* match of
    // the question's words or only a partial one. The words for those two
    // cases are different and must be: "a few products match that" is true
    // of the first and misleading about the second, where the honest line is
    // that nothing matched exactly and these are merely the closest.
    return { status: 'ambiguous', matchConfidence, exact: bestScore === 1, candidates };
  }

  const anchor = resolvedTop[0].frag;

  // A single top-scoring product, but only a weak one: `findFragranceMatch`
  // (and the SITE DATA block it grounds the council with) already accepts
  // anything at or above 0.34, which is deliberately loose so a natural
  // question full of filler still matches. That is fine when an LLM sees
  // the whole picture and can use its own judgement about whether the
  // "closest" thing found is worth mentioning; it is not fine for a reply
  // with no judgement in the loop, which would otherwise state a specific
  // price for what might be entirely the wrong product — measured case: "how
  // cheap is the fragrance you've ever heard of philosophically" scores 40%
  // against Mexx Whenever Wherever For Him on word overlap alone. Below 0.5
  // this hedges on identity instead of asserting a price for a guess.
  if (bestScore < 0.5) {
    return {
      status: 'low_confidence',
      matchConfidence,
      anchor,
      brand: anchor.brand,
      name: anchor.name,
      concentration: anchor.concentration,
    };
  }

  const key = groupKeyFor(anchor);
  const group = data.DEMO_FRAGRANCES
    .filter((f) => groupKeyFor(f) === key)
    .sort((a, b) => a.sizeMl - b.sizeMl);

  return { status: 'matched', matchConfidence, anchor, group };
}

const ANSWER_SIZE_RE = /(\d+(?:\.\d+)?)\s?ml\b/i;
const ANSWER_CHEAPEST_RE = /\b(cheapest|lowest|all sizes|every size|each size|full list)\b/i;

/**
 * The deterministic reply text for a `resolvePriceQuery` result — the only
 * place user-facing words get attached to that data. Every price, size and
 * retailer here is read straight off `result`; nothing is composed from the
 * question or invented to sound complete. Three shapes, per the reported
 * request for what a price answer should actually do: name the product, say
 * which sizes are tracked, and either answer the one the reader asked about
 * or offer the two real next steps (a specific size, or the full cheapest
 * list) rather than dumping every row of a bulleted, hedge-heavy wall of text.
 */
export function formatPriceAnswer(question, result) {
  const gbp = (pence) => `£${pence.toFixed(2)}`;
  const priceLine = (v) =>
    v.best
      ? `${v.sizeMl}ml: ${gbp(v.best.deliveredPriceGbp)} delivered from ${v.best.retailerName}.`
      : `${v.sizeMl}ml: currently out of stock everywhere this site tracks.`;

  if (result.status === 'no_match') {
    // Same follow-up honesty as formatIdentityRefusal in lookups.js: a
    // question that leans on a pronoun failed because no conversation is
    // kept, and the refusal should say that rather than imply the name was
    // wrong.
    const followUpNote = result.followUp
      ? 'Each message here stands alone — I don\'t carry the previous question over, so I can\'t tell what "it" refers to. '
      : '';
    return (
      `${followUpNote}I don't have a fragrance matching that in the current catalogue. Try the brand and product name — ` +
      'for example "Dior Sauvage EDT".'
    );
  }

  if (result.status === 'ambiguous') {
    const names = result.candidates.map((f) => productLabel(f));
    // matchConfidence is deliberately not printed here. It is a matcher
    // score, and on this branch it is a score for the *set* — "100%
    // confidence" beside a list of eight different perfumes reads as a
    // claim about the answer when it is really "all eight matched your
    // words equally well", which is the opposite of confident. The
    // question already says everything the reader needs.
    //
    // `exact` splits two cases that used to share this one sentence. When
    // every word of the question was found, "a few products match that" is
    // literally true. When only some were, it is not: "bleu de chanel" ties
    // Guy Laroche Drakkar Bleu with Armaf Voyage Bleu at half the words
    // each, and calling those a match overstates what happened. The site
    // does not carry Chanel's Bleu de Chanel, and the reader is better
    // served by being told that nothing matched exactly.
    if (result.exact === false) {
      return `Nothing in the catalogue matches that exactly. The closest I have: ${names.join(', ')}. Did you mean one of those?`;
    }
    return `A few products match that: ${names.join(', ')}. Which one did you mean?`;
  }

  if (result.status === 'low_confidence') {
    // Here the number is genuinely load-bearing — it is why this reply
    // hedges instead of stating a price — but a percentage invites the
    // reader to arbitrate a score they cannot see the basis for. Say the
    // uncertainty in words and let them correct it.
    return (
      `The closest I can find is ${productLabel(result)}, ` +
      `though I'm not certain that's the one. ` +
      `Is that what you meant? If not, try the exact brand and product name.`
    );
  }

  const { brand, name, concentration, variants } = result;
  const label = productLabel({ brand, name, concentration });

  // Checked before the single-variant shortcut below, deliberately: a
  // question that names a size this product does NOT carry must say so even
  // when the product only has one tracked size at all — answering with that
  // one size's price regardless of what was asked would silently substitute
  // a different bottle for the one the reader named.
  const sizeMatch = question.match(ANSWER_SIZE_RE);
  if (sizeMatch) {
    const wantedSize = Number(sizeMatch[1]);
    const exact = variants.find((v) => v.sizeMl === wantedSize);
    if (exact) return `${label}, ${exact.sizeMl}ml. ${priceLine(exact).replace(/^\d+ml: /, 'Cheapest right now: ')}`;
    const tracked = variants.map((v) => `${v.sizeMl}ml`).join(', ');
    return `${label} is on file, but not in ${sizeMatch[1]}ml. Sizes tracked: ${tracked}.`;
  }

  if (variants.length === 1) {
    return `${label}, ${variants[0].sizeMl}ml. Cheapest right now: ${
      variants[0].best
        ? `${gbp(variants[0].best.deliveredPriceGbp)} delivered from ${variants[0].best.retailerName}.`
        : 'currently out of stock everywhere this site tracks.'
    }`;
  }

  if (ANSWER_CHEAPEST_RE.test(question)) {
    return `${label} — cheapest per size:\n${variants.map(priceLine).join('\n')}`;
  }

  const tracked = variants.map((v) => `${v.sizeMl}ml`).join(', ');
  return `${label} is tracked in ${variants.length} sizes: ${tracked}. Want the price for one size, or the cheapest across all of them?`;
}

/**
 * Everything one messy sentence asks for, read once.
 *
 * Split out of `suggestContextFor` so the *decision* about whether a
 * question can be answered from the catalogue at all is available before
 * any answer is written — `resolveSuggestQuery` in lookups.js needs exactly
 * this reading in order to refuse deterministically, rather than handing an
 * ungroundable question to a model and trusting the prompt to hold. One
 * parse, two consumers, so the refusal and the grounding cannot disagree
 * about what was asked.
 *
 * Reading four things off the same sentence is the other half of the point.
 * A real question carries several constraints at once — "find a woman a
 * perfume under £30 that smells sweet" is an audience, a price ceiling and
 * a scent — and honouring one while silently dropping the rest is how an
 * answer ends up fluent, confident and off-target. Measured before this
 * existed, that exact question was classified `budget` and answered with
 * the five most widely stocked bottles under £30, none of them selected for
 * sweetness, the second of them Calvin Klein Obsession For Men.
 */
export async function parseSuggestRequest(question) {
  const raw = String(question ?? '');
  const { data } = await loadSite();
  const { wantedText, unwanted } = splitOnExclusion(raw.toLowerCase());

  // "What smells like Aventus" names no note at all, and the honest way to
  // ground it is not to give the council nothing: it is to look the
  // reference fragrance up, take the notes the catalogue holds *for it*, and
  // find real products that share them. The council still writes the answer
  // — whether two perfumes actually smell alike is a judgement no note list
  // settles — but it now writes it from this site's own data rather than
  // from a model's memory of what Aventus smells like.
  let reference = null;
  let referenceUnresolved = null;
  const similar = wantedText.match(SIMILAR_TO_RE);
  if (similar) {
    const resolved = await resolveProductQuery(similar[1], 'suggest');
    let group = resolved.status === 'matched' ? resolved.group : null;
    let anchor = resolved.anchor ?? null;

    // "What smells like Tom Ford Black Orchid" ties the EDP, the EDT and the
    // Parfum, and `resolveProductQuery` is right to refuse to pick one for a
    // price. Here it does not have to: the question is about what something
    // smells like, and the concentrations of one perfume are the one kind of
    // ambiguity that question does not care about. So when the tie is
    // *only* across concentrations of a single brand+name, all of them are
    // taken as the reference and their notes merged. Any wider ambiguity is
    // still refused.
    if (!group && resolved.status === 'ambiguous' && resolved.exact === true) {
      // Tightest fit first, the same containment argument
      // `resolveProductQuery` uses: "Tom Ford Black Orchid" ties its EDP,
      // EDT and Parfum with "Tom Ford Black Orchid Reserve", which is a
      // different perfume with an extra word. Dropping the longer titles
      // leaves only the concentrations, which is the ambiguity this branch
      // is allowed to collapse.
      const words = (c) => normalize(`${c.brand} ${c.name}`).split(' ').length;
      const fewest = Math.min(...resolved.candidates.map(words));
      const tightest = resolved.candidates.filter((c) => words(c) === fewest);
      const names = new Set(tightest.map((c) => `${c.brand}|${c.name}`.toLowerCase()));
      if (names.size === 1) {
        const [brand, name] = [tightest[0].brand, tightest[0].name];
        group = data.DEMO_FRAGRANCES.filter((f) => f.brand === brand && f.name === name);
        anchor = { brand, name, concentration: 'all concentrations' };
      }
    }

    if (!group) referenceUnresolved = similar[1].trim();
    else {
      const notes = new Set();
      for (const frag of group) {
        for (const layer of ['top', 'middle', 'base']) {
          for (const n of frag.notes?.[layer] ?? []) if (n.trim()) notes.add(n.trim());
        }
      }
      reference = {
        label: productLabel(anchor),
        key: groupKeyFor(anchor),
        brandName: `${anchor.brand}|${anchor.name}`.toLowerCase(),
        notes: [...notes],
      };
    }
  }

  // When the question names a reference fragrance, notes are read from that
  // fragrance and never from the rest of the sentence.
  //
  // The fallback that used to sit here read the whole question instead, and
  // the question contains the reference's own *name*: "any dupes for Tom
  // Ford Black Orchid" extracted the note "Orchid" straight out of the
  // product title and grounded the council with five unrelated florals that
  // happen to list orchid. The words the reader typed to identify a bottle
  // are not a description of what they want it to smell like.
  const scent = similar
    ? { notes: reference?.notes ?? [], literal: reference?.notes ?? [], families: [], unmatchedDescriptors: [] }
    : await requestedNotes(wantedText);

  return {
    wantedText,
    unwanted,
    reference,
    referenceUnresolved,
    wanted: scent.notes,
    literal: scent.literal,
    families: scent.families,
    unmatchedDescriptors: scent.unmatchedDescriptors,
    // Read off the raw question rather than `wantedText`: an exclusion
    // clause truncates wantedText, and "for my wife" can sit after it.
    audience: detectAudience(raw),
    performance: detectPerformanceRequest(raw),
    occasion: detectOccasionRequest(raw),
    budget: parseBudget(raw),
  };
}

/**
 * What the model is told when a question names who a fragrance is for.
 *
 * This block replaced a flat "not recorded" refusal, and the wording is
 * doing more work than it looks. There is still no gender field anywhere in
 * this project; what exists is a reading of the product's own title, and it
 * covers 13.54% of the catalogue. A model shown only "the reader asked who
 * it is for" fills that gap from its own training, so the block states the
 * mechanism, the coverage, and the inferences that are forbidden — silence
 * is not unisex, a note list is not an audience, a famous name is not an
 * audience — rather than leaving any of them to be worked out.
 *
 * It is paired with the per-candidate readings `suggestContextFor` prints,
 * so anything a model says about who a listed bottle is for is quoting SITE
 * DATA under rule 1 rather than recalling it.
 */
export async function audienceContextLine(request) {
  if (!request.audience) return '';
  const g = await genderCoverage();
  const n = (x) => x.toLocaleString('en-GB');
  return (
    'Read from title wording only. The catalogue has no gender or audience field — a fragrance record is ' +
    'brand, name, concentration, size, EAN, tier, popularity, photo and notes — so the audience shown on ' +
    `each candidate above comes from words in its own title. ${n(g.stated)} of the ${n(g.total)} bottles ` +
    `say who they are for (${n(g.counts.womens)} women's, ${n(g.counts.mens)} men's, ${n(g.counts.unisex)} ` +
    `unisex) and ${n(g.counts.notStated)} do not say. State that coverage whenever you use the reading. ` +
    'Never treat "not stated" as unisex, never infer an audience from a note list or from your own ' +
    'knowledge of a fragrance, and never say a bottle is for someone when its line above says the ' +
    'audience is not stated.'
  );
}

/**
 * The two constraints this catalogue holds no data for, written out for
 * whoever is going to answer.
 *
 * Both are things people really ask for and neither is in the data (see
 * `detectAudience` and `detectPerformanceRequest` in requestPhrases.js for
 * the measurements). Naming them explicitly in the SITE DATA block matters
 * more than it looks: rule 1 of the council prompt lets a model state only
 * what SITE DATA contains, and a block that is merely *silent* about gender
 * leaves the model free to read "for a woman" out of the question and
 * quietly filter on its own idea of what that means. A block that says the
 * catalogue has no such field turns that into a rule violation.
 */
export function unsupportedConstraintLines(request) {
  const lines = [];
  // Gender used to head this list and no longer appears in it at all. It is
  // no longer a constraint the data cannot meet — it is one the data meets
  // partly, from title wording, and saying "cannot" about it would now be
  // the false statement. It has its own block; see `audienceContextLine`.
  if (request.performance) {
    lines.push(
      'STRENGTH AND LONGEVITY: not recorded. Nothing in the catalogue measures how strong a fragrance ' +
        'is, how long it lasts or how far it projects. Say so plainly rather than ranking anything by ' +
        'it, and do not use concentration as a stand-in for it.',
    );
  }
  if (request.occasion) {
    lines.push(
      'SEASON AND OCCASION: not recorded. The catalogue does not say when or where a fragrance suits ' +
        '— season words inside harvested note lists are listing metadata, not data. Do not match a ' +
        'season or occasion to notes from your own knowledge; say the data does not hold it.',
    );
  }
  return lines;
}

/** The descriptor words this catalogue can genuinely filter on right now,
 *  for offering a reader something real when their question named nothing
 *  matchable. Built from the validated families, so it never offers a word
 *  whose notes have all fallen out of the index. */
export async function offerableDescriptors() {
  return [...(await noteFamilies()).keys()];
}

/**
 * Real note-matched candidates, from whichever fragrances this site's own
 * feeds actually published notes for — never a guessed or generic note list.
 *
 * Exported so the product-level dedup (see the comment inside) is directly
 * testable against a known live-catalogue case, the same reason
 * `policyContextFor` above is exported.
 */
export async function suggestContextFor(question) {
  const { data } = await loadSite();
  const request = await parseSuggestRequest(question);
  const { unwanted, reference, referenceUnresolved, wanted, literal, families } = request;
  const unsupported = unsupportedConstraintLines(request);
  const audience = await audienceContextLine(request);
  const unsupportedBlock =
    (audience ? `\nWHO IT IS FOR:\n${audience}` : '') +
    (unsupported.length ? `\nCONSTRAINTS THIS DATA CANNOT MEET:\n${unsupported.join('\n')}` : '');

  if (wanted.length === 0) {
    let why = ' The question did not name any notes to match against.';
    if (reference) {
      why = ` The reference fragrance ${reference.label} is in the catalogue but has no published notes, so there is nothing to match it against.`;
    } else if (referenceUnresolved) {
      why = ` The question asks for something like "${referenceUnresolved}", which does not resolve to a single product in the catalogue, so there are no notes to match it against.`;
    }
    const offer =
      `\nWHAT CAN BE FILTERED ON INSTEAD: scent words — ${(await offerableDescriptors()).join(', ')} — ` +
      'a delivered price ceiling, or the published notes of a fragrance named by name. Offer those. ' +
      'Do not name a fragrance.';
    return `NOTE MATCHED CANDIDATES: none requested.${why}${unsupportedBlock}${offer}`;
  }

  // Grouped by product (brand+name+concentration), not by row id: the same
  // perfume's different bottle sizes are separate catalogue entries with
  // separate ids, sometimes carrying different note data because they were
  // harvested from different retailers' pages of differing completeness —
  // measured case, Tom Ford Black Orchid EDP: the 30ml row lists 3 notes,
  // the 100ml row lists 7, none of which overlap perfectly. Grouping by id
  // showed the same product name twice with two different, seemingly
  // arbitrary note lists, which reads as a broken duplicate rather than one
  // real recommendation. Grouping by product and merging every size's notes
  // into one set keeps the real information from every size instead of
  // silently dropping whichever variant lost the id race.
  const groups = new Map();
  for (const note of wanted) {
    for (const frag of data.fragrancesWithNote(note, 'any')) {
      const key = groupKeyFor(frag);
      let entry = groups.get(key);
      if (!entry) {
        entry = { frag, matched: new Set(), notes: { top: new Set(), middle: new Set(), base: new Set() } };
        groups.set(key, entry);
      }
      entry.matched.add(note);
      for (const layer of ['top', 'middle', 'base']) {
        for (const n of frag.notes?.[layer] ?? []) entry.notes[layer].add(n);
      }
    }
  }

  // The reference fragrance is never its own recommendation — nor is any
  // other concentration of it, which is why this drops by brand+name rather
  // than by the full group key.
  if (reference) {
    for (const [key, entry] of groups) {
      if (`${entry.frag.brand}|${entry.frag.name}`.toLowerCase() === reference.brandName) groups.delete(key);
    }
  }

  let candidates = [...groups.values()].map((entry) => ({
    frag: entry.frag,
    matchedCount: entry.matched.size,
    matched: [...entry.matched],
    // Deduplicated across layers, not just within them. A note listed in
    // both a fragrance's top and base rendered twice, which reads as broken
    // data rather than as a note appearing in two layers — measured case,
    // Versace Dylan Blue: "Summer, Autumn, Summer, Autumn, Summer, Autumn".
    notes: [...new Set([...entry.notes.top, ...entry.notes.middle, ...entry.notes.base])],
  }));
  if (unwanted.length > 0) {
    candidates = candidates.filter(({ notes }) => {
      const noteWords = notes.map((n) => n.toLowerCase());
      return !unwanted.some((u) => noteWords.some((n) => n.includes(u) || u.includes(n)));
    });
  }
  // Most of the request satisfied first. The previous order was whatever
  // BY_POPULARITY happened to yield for the *first* requested note, so a
  // three-note request could be answered with five products sharing only the
  // first note while products matching all three sat below the cut.
  candidates.sort((a, b) => b.matchedCount - a.matchedCount);
  candidates = candidates.slice(0, 5);

  // What the *reader* asked for, not the expansion of it. Printing all
  // fourteen notes "sweet" resolves to as the request would misreport the
  // question back to the model: it asked for one word.
  // A literal note that *is* the descriptor word is dropped from the label
  // rather than printed beside it: the catalogue really does have a note
  // called "Sweet", so `requested: Sweet, "sweet"` was accurate and read
  // like a bug.
  const descriptorWords = new Set(families.map(({ word }) => word.toLowerCase()));
  const requestedLabel = [
    ...literal.filter((n) => !descriptorWords.has(n.toLowerCase())),
    ...families.map(({ word }) => `"${word}"`),
  ].join(', ') || wanted.join(', ');

  // How each descriptor was read, stated as a reading rather than as a
  // fact. Every note named here exists in the catalogue (noteFamilies drops
  // any that does not) and every candidate above genuinely lists at least
  // one of them — but "sweet means vanilla" is this site's interpretation
  // of an English word, and an answer that hides that is passing off an
  // editorial choice as data.
  const familyLines = families.length
    ? `\nHOW THE SCENT WORDS WERE READ: ${families
        .map(({ word, notes }) => `"${word}" -> catalogue notes ${notes.join(', ')}`)
        .join('; ')}. That is this site's reading of the word, not a claim about any bottle; ` +
      'say which notes the match was made on so the reader can disagree with it.'
    : '';

  const unmatchedLine = request.unmatchedDescriptors.length
    ? `\nSCENT WORDS WITH NO MATCH: ${request.unmatchedDescriptors.join(', ')} — the catalogue has no ` +
      'notes on file for these, so nothing above was chosen for them.'
    : '';

  if (candidates.length === 0) {
    return (
      `NOTE MATCHED CANDIDATES: none. No fragrance in the current catalogue has a published note ` +
      `match for [${requestedLabel}].${familyLines}${unmatchedLine}${unsupportedBlock}`
    );
  }

  // Each candidate's own audience reading is attached only when the reader
  // asked about one. Printing "audience: not stated" on every candidate of
  // every scent question would be noise on 86% of lines; withholding it when
  // the reader did ask would leave a model to supply the answer itself.
  const genderIndex = request.audience ? await genderCoverage() : null;
  const audienceOf = (frag) => {
    if (!genderIndex) return '';
    const e = genderIndex.byId.get(frag.id);
    return e && e.reading !== 'notStated'
      ? ` — audience: ${genderIndex.label[e.reading]}, from "${e.phrase}" in its title`
      : ' — audience: not stated by any shop; do not assign one';
  };
  const lines = candidates.map(({ frag, notes, matched }) =>
    `${productLabel(frag)} — shares: ${matched.join(', ')} — notes on file: ${
      notes.join(', ') || 'none published'
    }${audienceOf(frag)}`,
  );
  // The reference line is appended rather than prepended so that the block
  // still opens with "NOTE MATCHED CANDIDATES", which is what the rest of
  // this file and the council prompt's rule 1b both key off.
  const referenceLine = reference
    ? `\nREFERENCE FRAGRANCE: ${reference.label} — its own notes on file: ${reference.notes.join(', ')}. ` +
      'The candidates above were found by sharing those notes; whether they actually smell alike is not something this data settles.'
    : '';
  return (
    `NOTE MATCHED CANDIDATES (requested: ${requestedLabel}${unwanted.length ? `; excluding: ${unwanted.join(', ')}` : ''}):\n` +
    `${lines.join('\n')}${referenceLine}${familyLines}${unmatchedLine}${unsupportedBlock}`
  );
}

/** Simple keyword overlap against the site's own policy/FAQ pages — the only
 *  source for anything about how the site works, delivery methodology,
 *  affiliate disclosure, privacy or contact details.
 *
 *  Exported (not just used internally by buildSiteDataBlock) so council.js's
 *  price bypass can tell a genuine "no such fragrance" from a question that
 *  merely contains a price-ish word — "how does your price comparison
 *  work" trips classifyIntent's 'price' regex on the word "price" alone,
 *  but it is a policy question, not a lookup, and resolvePriceQuery finding
 *  no fragrance in it should not be read as "the fragrance does not exist". */
/** Interrogative and filler words that appear in every legal page's prose
 *  and carry no topic at all. Before this filter, "guess what zorblax
 *  nebula costs" matched the about page on "what" + "costs" alone, and a
 *  plain no-such-product refusal got re-routed to the council as a policy
 *  question in disguise. (Measured; pinned in test/corpus.test.js.) */
const POLICY_FILLER = new Set([
  'what', 'whats', 'when', 'where', 'which', 'your', 'yours', 'this', 'that',
  'these', 'those', 'does', 'have', 'much', 'many', 'want', 'know', 'tell',
  'just', 'guess', 'please', 'could', 'would', 'should', 'will', 'they',
  'them', 'then', 'than', 'some', 'about', 'really', 'actually',
]);

/** The words people use for a policy topic that the pages themselves do not
 *  use. Query expansion only — the *pages* remain the sole source of any
 *  answer; this only lets "how do you make money" find the affiliate
 *  disclosure, whose own vocabulary is "commission" and "affiliate". */
const POLICY_QUERY_EXPANSIONS = [
  [/\b(make|earn|making|earning) money\b|\bwho pays\b|\bpaid for\b|\bget paid\b/i, ['commission', 'affiliate']],
];

export async function policyContextFor(question) {
  const { legal } = await loadSite();
  const qWords = normalize(question).split(' ').filter((w) => w.length > 3 && !POLICY_FILLER.has(w));
  for (const [re, extra] of POLICY_QUERY_EXPANSIONS) {
    if (re.test(question)) qWords.push(...extra);
  }
  if (qWords.length === 0) return null;

  let best = null;
  let bestHits = 0;
  for (const page of legal.LEGAL_PAGES) {
    const haystack = normalize(`${page.title} ${stripHtml(page.body)}`);
    const hits = qWords.filter((w) => haystack.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = page;
    }
  }
  // Two hits, except for a question whose entire substance is one strong
  // word: "do you get commission" reduces to exactly ['commission'], and a
  // hard floor of 2 made it unmatchable on principle.
  if (!best || bestHits < Math.min(2, qWords.length)) return null;

  const text = stripHtml(best.body);
  return `SITE POLICY (${best.title}): ${text.slice(0, 1200)}${text.length > 1200 ? '…' : ''}`;
}

/**
 * Catalogue-wide facts every answer can lean on, computed fresh from the same
 * imports as everything else in this file rather than typed as a number
 * anywhere — a hardcoded count would start drifting the hour after it was
 * written, since the harvest recommits `demo/catalogue.generated.ts` roughly
 * every hour (see this file's own header comment on cache-busted imports).
 */
async function aboutContext() {
  const { legal, data, catalogue, retailers } = await loadSite();

  const totalFragrances = data.DEMO_FRAGRANCES.length;
  const enabledRetailers = retailers.RETAILERS.filter((r) => r.enabled !== false);
  // Mirrors resolveDelivery's own check in src/services/shipping.ts exactly:
  // `standardGbp === null` is the one signal that means "delivery not stated"
  // there, in buildComparison's sort, and now here.
  const unstatedRetailers = enabledRetailers.filter((r) => r.shipping?.standardGbp === null);
  const unstatedNote = unstatedRetailers.length
    ? ` ${unstatedRetailers.length} of those retailers (${unstatedRetailers.map((r) => r.name).join(', ')}) ` +
      `do not publish a standard delivery cost. They are shown as "delivery not stated", never as the cheapest option.`
    : '';

  return (
    `ABOUT THIS SITE: ${legal.COMPANY.name} is a UK fragrance price comparison site run by ` +
    `${legal.COMPANY.legalName}. Contact: ${legal.COMPANY.email}. Currently tracks ` +
    `${totalFragrances.toLocaleString('en-GB')} fragrances across ${enabledRetailers.length} enabled UK ` +
    `retailers, last refreshed ${catalogue.CRAWLED_AT}.${unstatedNote} No retailer pays for placement: results ` +
    `are ordered by stock and then delivered price only, never by commission ("No Promoted Listings").`
  );
}

/**
 * The single entry point council.js calls: builds the labelled SITE DATA
 * block for a question, using every source relevant to its intent. Always
 * includes the about-site line so a general "what is this" question is
 * groundable even outside the price/suggest intents.
 */
export async function buildSiteDataBlock(question, intent) {
  const parts = [await aboutContext()];

  if (intent === 'price') {
    parts.push(await priceContextFor(question));
  } else if (intent === 'suggest') {
    parts.push(await suggestContextFor(question));
  }

  const policy = await policyContextFor(question);
  if (policy) parts.push(policy);

  return parts.join('\n\n');
}
