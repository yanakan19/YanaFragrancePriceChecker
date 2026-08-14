import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

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
  compare: [
    'vs', 'versus', 'compare', 'compared', 'comparison', 'better', 'value', 'worth',
    'than', 'one', 'less', 'expensive', 'dearer', 'cheaper', 'cheap', 'or',
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

/** Mirrors YanaFreeAPIMerger's original note-request parser exactly — pure
 *  text parsing, nothing about where the notes data itself comes from, so
 *  swapping the data source underneath it did not need to touch this. */
export function parseNoteRequest(text) {
  const lower = text.toLowerCase();
  const unwantedMatch = lower.match(/no\s+([a-z, ]+)/);
  const unwanted = new Set(unwantedMatch ? unwantedMatch[1].split(/[, ]+/).filter(Boolean) : []);
  const wantedText = unwantedMatch ? lower.slice(0, unwantedMatch.index) : lower;
  const wanted = new Set(
    wantedText
      .split(/[,;]| and /)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !unwanted.has(s)),
  );
  return { wanted: [...wanted], unwanted: [...unwanted] };
}

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
      `${fragrance.concentration}, ${fragrance.sizeMl}ml. Currently out of stock everywhere this site tracks.`
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
    `${fragrance.concentration}, ${fragrance.sizeMl}ml. Cheapest right now: ${gbp(best.deliveredPriceGbp)} ` +
    `delivered, from ${best.retailer.name}. Stocked by ${rows.filter((r) => r.isPurchasable).length} shop(s) ` +
    `this site tracks in total.${unstatedNote}`
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
export async function resolveProductQuery(question, intent = 'price') {
  const { data } = await loadSite();
  const qWords = productWords(question, intent);
  if (qWords.length === 0) return { status: 'no_match' };

  let bestScore = 0;
  const scored = [];
  for (const frag of data.DEMO_FRAGRANCES) {
    const concentrationLower = (frag.concentration ?? '').toLowerCase();
    const abbr = CONCENTRATION_ABBR[concentrationLower] ?? '';
    const haystack = normalize(`${frag.brand} ${frag.name} ${frag.concentration} ${abbr}`);
    const hits = qWords.filter((w) => haystack.includes(w)).length;
    const score = hits / qWords.length;
    if (score > bestScore) bestScore = score;
    if (score > 0) scored.push({ frag, score, titleWords: normalize(`${frag.brand} ${frag.name}`).split(' ').length });
  }
  if (bestScore < 0.34) return { status: 'no_match' };

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
    return (
      "I don't have a fragrance matching that in the current catalogue. Try the brand and product name — " +
      'for example "Dior Sauvage EDT".'
    );
  }

  if (result.status === 'ambiguous') {
    const names = result.candidates.map((f) => `${f.brand} ${f.name} (${f.concentration})`);
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
      `The closest I can find is ${result.brand} ${result.name} ` +
      `(${result.concentration}), though I'm not certain that's the one. ` +
      `Is that what you meant? If not, try the exact brand and product name.`
    );
  }

  const { brand, name, concentration, variants } = result;
  const label = `${brand} ${name} (${concentration})`;

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
 * Real note-matched candidates, from whichever fragrances this site's own
 * feeds actually published notes for — never a guessed or generic note list.
 *
 * Exported so the product-level dedup (see the comment inside) is directly
 * testable against a known live-catalogue case, the same reason
 * `policyContextFor` above is exported.
 */
export async function suggestContextFor(question) {
  const { data } = await loadSite();
  const { wanted, unwanted } = parseNoteRequest(question);
  if (wanted.length === 0) {
    return 'NOTE MATCHED CANDIDATES: none requested. The question did not name any notes to match against.';
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
        entry = { frag, notes: { top: new Set(), middle: new Set(), base: new Set() } };
        groups.set(key, entry);
      }
      for (const layer of ['top', 'middle', 'base']) {
        for (const n of frag.notes?.[layer] ?? []) entry.notes[layer].add(n);
      }
    }
  }

  let candidates = [...groups.values()].map((entry) => ({
    frag: entry.frag,
    notes: [...entry.notes.top, ...entry.notes.middle, ...entry.notes.base],
  }));
  if (unwanted.length > 0) {
    candidates = candidates.filter(({ notes }) => {
      const noteWords = notes.map((n) => n.toLowerCase());
      return !unwanted.some((u) => noteWords.some((n) => n.includes(u) || u.includes(n)));
    });
  }
  candidates = candidates.slice(0, 5);

  if (candidates.length === 0) {
    return `NOTE MATCHED CANDIDATES: none. No fragrance in the current catalogue has a published note match for [${wanted.join(', ')}].`;
  }

  const lines = candidates.map(({ frag, notes }) =>
    `${frag.brand} ${frag.name} (${frag.concentration}) — notes on file: ${notes.join(', ') || 'none published'}`,
  );
  return `NOTE MATCHED CANDIDATES (requested: ${wanted.join(', ')}${unwanted.length ? `; excluding: ${unwanted.join(', ')}` : ''}):\n${lines.join('\n')}`;
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
export async function policyContextFor(question) {
  const { legal } = await loadSite();
  const qWords = normalize(question).split(' ').filter((w) => w.length > 3);
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
  if (!best || bestHits < 2) return null;

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
