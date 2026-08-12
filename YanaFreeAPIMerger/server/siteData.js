import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

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
 * ── Why every import below is cache-busted ───────────────────────────────
 * Node's ES module loader caches a module the first time it is imported and
 * never re-reads it, which is exactly wrong here: the hourly harvest commits
 * a freshly rebuilt `demo/catalogue.generated.ts` to this same checkout, and
 * a long-running server process that imported it once at boot would keep
 * answering from whatever prices existed the moment it started, silently
 * drifting further from the live site with every hour that passes. Appending
 * a changing query string (`?t=...`) to the specifier makes Node treat each
 * call as a distinct module and actually re-read the file from disk, at the
 * cost of re-parsing it every time — accepted deliberately, because a chat
 * backend answering a few dozen questions an hour has room to spend a
 * fraction of a second on that where a page served to every visitor would
 * not.
 *
 * ── Why this file has to run under tsx, not plain node ───────────────────
 * `demo/data.ts` and friends are TypeScript, and this app's own `npm start`
 * points at `tsx server/index.js` for exactly that reason: tsx installs a
 * loader hook that resolves the `.js` specifiers below to their real `.ts`
 * files and transpiles on the fly, the same way every script in the parent
 * repo already runs. Plain `node` would fail to resolve these imports at all.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

async function freshImport(relPathFromRepoRoot) {
  const fileUrl = pathToFileURL(path.join(repoRoot, relPathFromRepoRoot)).href;
  return import(`${fileUrl}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

/** One fresh snapshot of every site module this backend reads from. */
export async function loadSite() {
  const [data, catalogue, priceService, index, brandSites, legal, retailers] = await Promise.all([
    freshImport('demo/data.js'),
    freshImport('demo/catalogue.generated.js'),
    freshImport('src/services/priceService.js'),
    freshImport('src/index.js'),
    freshImport('demo/brandSites.js'),
    freshImport('demo/legal.js'),
    freshImport('src/config/retailers.js'),
  ]);
  return { data, catalogue, priceService, index, brandSites, legal, retailers };
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

/**
 * Real note-matched candidates, from whichever fragrances this site's own
 * feeds actually published notes for — never a guessed or generic note list.
 */
async function suggestContextFor(question) {
  const { data } = await loadSite();
  const { wanted, unwanted } = parseNoteRequest(question);
  if (wanted.length === 0) {
    return 'NOTE MATCHED CANDIDATES: none requested. The question did not name any notes to match against.';
  }

  const candidatesByFragrance = new Map();
  for (const note of wanted) {
    for (const frag of data.fragrancesWithNote(note, 'any')) {
      if (!candidatesByFragrance.has(frag.id)) candidatesByFragrance.set(frag.id, frag);
    }
  }

  let candidates = [...candidatesByFragrance.values()];
  if (unwanted.length > 0) {
    candidates = candidates.filter((frag) => {
      const noteWords = [...(frag.notes?.top ?? []), ...(frag.notes?.middle ?? []), ...(frag.notes?.base ?? [])]
        .map((n) => n.toLowerCase());
      return !unwanted.some((u) => noteWords.some((n) => n.includes(u) || u.includes(n)));
    });
  }
  candidates = candidates.slice(0, 5);

  if (candidates.length === 0) {
    return `NOTE MATCHED CANDIDATES: none. No fragrance in the current catalogue has a published note match for [${wanted.join(', ')}].`;
  }

  const lines = candidates.map((frag) => {
    const notes = [...(frag.notes?.top ?? []), ...(frag.notes?.middle ?? []), ...(frag.notes?.base ?? [])];
    return `${frag.brand} ${frag.name} (${frag.concentration}) — notes on file: ${notes.join(', ') || 'none published'}`;
  });
  return `NOTE MATCHED CANDIDATES (requested: ${wanted.join(', ')}${unwanted.length ? `; excluding: ${unwanted.join(', ')}` : ''}):\n${lines.join('\n')}`;
}

/** Simple keyword overlap against the site's own policy/FAQ pages — the only
 *  source for anything about how the site works, delivery methodology,
 *  affiliate disclosure, privacy or contact details. */
async function policyContextFor(question) {
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
