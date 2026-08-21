/**
 * Diagnostic: render ONE page for a named shop through the Apify actor and
 * report the *structure* of whatever machine-readable state it carries —
 * deep enough that a parser can be written from the log alone, without a
 * second render.
 *
 *   npm run apify:state-probe -- --shop=john-lewis
 *   npm run apify:state-probe -- --shop=superdrug --url=https://...
 *
 * ── Why this exists next to scripts/apify-blob-probe.ts ────────────────────
 * That script answered the only question anyone had at the time: is there a
 * hydration blob on these pages at all. It answers it with a yes/no per known
 * marker plus a 220-byte redacted sample, and for John Lewis it returned
 * "__NEXT_DATA__: FOUND, 215,243 bytes — price-shaped keys: false" (probe run
 * 32367872684, job 96421371936, re-read from the Actions API and quoted in
 * this shop's entry in src/config/retailers.ts).
 *
 * That is a heuristic key-name scan, and its price test is
 * /"(price|gbp|amount|salePrice|listPrice|currentPrice)"\s*:/ — an exact
 * quoted key. A payload keyed `priceIncVat`, `displayPrice` or `price` nested
 * under a differently-named parent reads as "no price" to it. So "false" there
 * is evidence of absence only for that exact list of names, which is not the
 * same claim as "this blob carries no price", and 220 redacted bytes of a
 * 215 kB payload cannot settle the difference. Deciding whether a parser is
 * possible needs the real key paths, and writing one needs a real record to
 * write it against.
 *
 * ── What it prints, and why that is not the same as committing a page ──────
 * Key paths (array indices collapsed to `[]`), value types, counts, and short
 * truncated sample values for the fields a listing needs. Plus one candidate
 * product record in full, capped, so a fixture can be cut from the log without
 * paying for a second render.
 *
 * Sample values are truncated but NOT redacted, unlike apify-blob-probe.ts.
 * The rule that script was written to keep is that a scraped page never gets
 * committed to this repo, and that rule is untouched: nothing here writes a
 * file. A public shop's own shelf price in a run log is the same class of fact
 * scripts/price-verify.ts already prints by the hundred, and without it the
 * output cannot answer the question it is being paid to ask.
 *
 * ── Cost ──────────────────────────────────────────────────────────────────
 * Exactly one rendered page per invocation — one URL, deliberately, where a
 * `npm run harvest` probe of the same shop renders every section it has
 * configured (four, for John Lewis). See src/catalogue/apifyActor.ts's header
 * for the per-page estimate and MAX_ACTOR_PAGES_PER_RUN for the ceiling this
 * still sits under. It also asks Apify what the account has spent this month,
 * which is a free REST read and costs no compute unit.
 *
 * Writes nothing and commits nothing.
 */
import { readFileSync } from 'node:fs';
import { RETAILERS } from '../src/config/retailers.js';
import { apifyActorConfigFromEnv, apifyActorRenderer } from '../src/catalogue/apifyActor.js';
import { apifyProxyConfigFromEnv } from '../src/catalogue/apifyProxy.js';
import { checkApifyAccount } from '../src/catalogue/apifyAccount.js';
import { extractJsonLdBlocks, parseListings } from '../src/catalogue/jsonld.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const shopId = arg('shop');
if (!shopId) {
  console.error('usage: npm run apify:state-probe -- --shop=<retailer id> [--url=<override>]');
  process.exit(1);
}

const retailer = RETAILERS.find((r) => r.id === shopId);
if (!retailer) {
  console.error(`no retailer with id "${shopId}"`);
  process.exit(1);
}

const sectionId = arg('section');
const sections = retailer.catalogue?.sections ?? [];
const section = sectionId ? sections.find((s) => s.id === sectionId) : sections[0];
const url =
  arg('url') ??
  (section && retailer.catalogue
    ? section.urlTemplate.replace('{page}', String(retailer.catalogue.firstPage))
    : null);

if (!url) {
  console.error(`${retailer.name} has no catalogue.sections entry and no --url override was given.`);
  process.exit(1);
}

/**
 * Read a page off disk instead of rendering one.
 *
 * Not a convenience: the analysis below is the whole value of this script, it
 * runs *after* the money is spent, and a crash in it loses the render it was
 * paid to explain. `--file=` runs exactly that code against a local page, for
 * free, so it can be exercised before any dispatch. It is also how a saved
 * fixture gets re-read when a parser written from one of these logs later
 * needs checking against the page it came from.
 */
const localFile = arg('file');

const actorConfig = apifyActorConfigFromEnv();
if (!actorConfig && !localFile) {
  console.error('APIFY_TOKEN is not set. Nothing can be rendered. (Use --file=<path> to analyse a saved page.)');
  process.exit(1);
}

const proxyConfig = apifyProxyConfigFromEnv();
if (actorConfig && !localFile) {
  for (const line of (await checkApifyAccount(actorConfig.token, proxyConfig?.password ?? null)).lines) {
    console.log(line);
  }
}

/**
 * What this account has spent against its plan this month.
 *
 * The plan behind APIFY_TOKEN is the free tier with a $5 monthly credit that
 * does not roll over, so "how much is left" is a real operational constraint
 * on every dispatch, not trivia — and once the credit is gone, runs fail
 * outright rather than degrading. `GET /v2/users/me/limits` is documented,
 * free, and uses no compute unit. Printed rather than enforced: this is a
 * diagnostic, and a preflight that could refuse to run would be one more
 * thing to debug at the moment the budget question actually matters.
 */
async function printMonthlySpend(token: string): Promise<void> {
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me/limits?token=${encodeURIComponent(token)}`);
    if (!res.ok) {
      console.log(`Apify usage check failed: HTTP ${res.status}`);
      return;
    }
    const payload = (await res.json()) as {
      data?: { current?: Record<string, unknown>; limits?: Record<string, unknown> };
    };
    const used = payload.data?.current?.['monthlyUsageUsd'];
    const cap = payload.data?.limits?.['maxMonthlyUsageUsd'];
    if (typeof used === 'number') {
      console.log(
        `Apify usage this month: $${used.toFixed(4)}` +
          (typeof cap === 'number' ? ` of $${cap.toFixed(2)}` : ' (no cap reported)'),
      );
    } else {
      console.log('Apify usage this month: not reported by /users/me/limits');
    }
  } catch (err) {
    console.log(`Apify usage check failed: ${String(err).slice(0, 120)}`);
  }
}

if (actorConfig && !localFile) await printMonthlySpend(actorConfig.token);
console.log('');

let html: string;
let renderer: { render: (urls: string[]) => Promise<unknown>; used: () => number } | null = null;

if (localFile) {
  html = readFileSync(localFile, 'utf8');
  console.log(`read ${localFile}: ${html.length.toLocaleString()} bytes (no render, no cost)\n`);
} else {
  console.log(`Rendering ${retailer.name}: ${url}`);
  const live = apifyActorRenderer(actorConfig!);
  renderer = live;
  const results = await live.render([url]);
  const res = results.get(url);

  if (!res || !res.ok) {
    console.log(`render failed: HTTP ${res?.status ?? 0}${res?.error ? ` — ${res.error}` : ''}`);
    console.log(`\nApify actor pages rendered this run: ${live.used()}`);
    process.exit(0);
  }

  html = res.body;
  console.log(`rendered ${html.length.toLocaleString()} bytes\n`);
}

/**
 * Run one section of the analysis without letting it take the others with it.
 *
 * The render is already paid for by the time any of this executes, and a
 * TypeError in the fifth section would otherwise throw away the four that had
 * already found something — at the price of another dispatch to get it back.
 */
function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.log(`\n### ${label}: analysis threw — ${String(err).slice(0, 200)}`);
  }
}

// ── 1. What the current parser makes of it ────────────────────────────────
// The baseline every one of these shops already fails, restated per run so a
// change in it is visible without re-reading a retailer entry.
const jsonLd = extractJsonLdBlocks(html);
const parsed = parseListings(html, { sectionId: section?.id ?? 'probe', pageUrl: url });
console.log(`JSON-LD blocks: ${jsonLd.length}; parseListings(): ${parsed.length} listing(s)`);

// ── 2. Is priced text even present in the painted markup? ─────────────────
// Independent of any state blob: if a real browser painted a grid, the prices
// are somewhere in this string. Absence here means the render itself is the
// problem (a challenge page, an empty shell) and no parser can help.
const poundMatches = [...html.matchAll(/£\s?\d[\d,]*(?:\.\d{2})?/g)].map((m) => m[0]);
const distinctPounds = [...new Set(poundMatches)];
console.log(
  `"£" price-shaped strings in the rendered markup: ${poundMatches.length} (${distinctPounds.length} distinct)` +
    (distinctPounds.length ? ` — first few: ${distinctPounds.slice(0, 8).join(', ')}` : ''),
);

// ── 3. Every script block, by id and type ─────────────────────────────────
const scriptTags = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
const named: Array<{ id: string; type: string; body: string }> = [];
for (const tag of scriptTags) {
  const attrs = tag[1] ?? '';
  const id = /id="([^"]+)"/.exec(attrs)?.[1];
  if (!id) continue;
  named.push({ id, type: /type="([^"]+)"/.exec(attrs)?.[1] ?? '(none)', body: tag[2] ?? '' });
}
console.log(`\nScript blocks carrying an id: ${named.length}`);
for (const s of named) {
  console.log(`  #${s.id} type=${s.type} ${s.body.length.toLocaleString()} bytes`);
}

// ── 4. Structural walk of each parseable JSON block ───────────────────────

/**
 * Fields a RawListing needs. Broad on purpose — this is discovery, not
 * extraction, and the failure mode being corrected here is the narrow key list
 * in apify-blob-probe.ts reading a real price as absent.
 */
const INTERESTING =
  /(price|amount|value|currenc|cost|rrp|was|sale|offer|name|title|brand|stock|availab|sku|code|ean|gtin|upc|image|url|link|promo|discount|reduc|display|formatted|variant|size|volume)/i;

/** Short keys a substring test would either miss or drown in false matches. */
const INTERESTING_EXACT = /^(id|now|then|from|min|max)$/i;

function keyIsInteresting(key: string): boolean {
  const bare = key.replace(/\[\]$/, '');
  return INTERESTING.test(bare) || INTERESTING_EXACT.test(bare) || /Id$/.test(bare);
}

interface PathStat {
  types: Set<string>;
  count: number;
  samples: string[];
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function sample(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const flat = String(s ?? '').replace(/\s+/g, ' ');
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

/**
 * Walk a parsed blob and collect every leaf path whose final key looks like it
 * could carry a listing field. Array indices collapse to `[]` so a 60-product
 * grid reports one path with count 60 rather than 60 near-identical paths.
 */
function walk(node: unknown, path: string, out: Map<string, PathStat>, depth: number): void {
  if (depth > 14) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 200)) walk(item, `${path}[]`, out, depth + 1);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, out, depth + 1);
    }
    return;
  }
  const key = path.split('.').pop() ?? '';
  if (!keyIsInteresting(key)) return;
  const stat = out.get(path) ?? { types: new Set<string>(), count: 0, samples: [] };
  stat.types.add(typeOf(node));
  stat.count++;
  if (stat.samples.length < 3 && node !== null && node !== '') stat.samples.push(sample(node));
  out.set(path, stat);
}

/**
 * The most product-shaped array in a blob: the longest array whose elements
 * are objects carrying both a name-ish and a price-ish key. This is the record
 * a parser would iterate, and printing one element of it in full is what lets
 * a fixture be cut from the log.
 */
function findProductArray(
  node: unknown,
  path: string,
  best: { path: string; items: unknown[] } | null,
  depth: number,
): { path: string; items: unknown[] } | null {
  if (depth > 14) return best;
  if (Array.isArray(node)) {
    const objects = node.filter((n) => n && typeof n === 'object' && !Array.isArray(n)) as Array<
      Record<string, unknown>
    >;
    if (objects.length >= 2) {
      const keys = new Set(objects.flatMap((o) => Object.keys(o)));
      const hasName = [...keys].some((k) => /name|title|productName|displayName/i.test(k));
      const hasPrice = [...keys].some((k) => /price|amount|cost|value/i.test(k));
      if (hasName && hasPrice && (!best || objects.length > best.items.length)) {
        best = { path: `${path}[]`, items: objects };
      }
    }
    for (const [i, item] of node.slice(0, 20).entries()) {
      best = findProductArray(item, `${path}[${i === 0 ? '' : i}]`, best, depth + 1);
    }
    return best;
  }
  if (node && typeof node === 'object') {
    // A Hybris/NgRx entity map is an object keyed by product code, not an
    // array, and would otherwise be invisible to the array test above — which
    // is exactly the shape Superdrug's SAP Commerce state is expected to use.
    const values = Object.values(node as Record<string, unknown>).filter(
      (v) => v && typeof v === 'object' && !Array.isArray(v),
    ) as Array<Record<string, unknown>>;
    if (values.length >= 2) {
      const keys = new Set(values.flatMap((o) => Object.keys(o)));
      const hasName = [...keys].some((k) => /name|title|productName|displayName/i.test(k));
      const hasPrice = [...keys].some((k) => /price|amount|cost|value/i.test(k));
      if (hasName && hasPrice && (!best || values.length > best.items.length)) {
        best = { path: `${path}{}`, items: values };
      }
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      best = findProductArray(v, path ? `${path}.${k}` : k, best, depth + 1);
    }
  }
  return best;
}

function report(label: string, raw: string): void {
  let parsedBlob: unknown;
  try {
    parsedBlob = JSON.parse(raw);
  } catch (err) {
    console.log(`\n### ${label}: ${raw.length.toLocaleString()} bytes, not parseable as JSON (${String(err).slice(0, 90)})`);
    return;
  }
  console.log(`\n### ${label}: ${raw.length.toLocaleString()} bytes, parsed`);

  const paths = new Map<string, PathStat>();
  walk(parsedBlob, '', paths, 0);
  const ranked = [...paths.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 90);
  console.log(`  listing-shaped leaf paths (top ${ranked.length} of ${paths.size} by count):`);
  for (const [p, stat] of ranked) {
    console.log(`    ${p}  ×${stat.count}  [${[...stat.types].join('|')}]  e.g. ${stat.samples[0] ?? '—'}`);
  }

  const found = findProductArray(parsedBlob, '', null, 0);
  if (!found) {
    console.log('  no name+price-shaped object array found in this blob');
    return;
  }
  console.log(`  candidate product array: ${found.path} — ${found.items.length} object(s)`);

  // Per-key presence across the whole collection, not just the sampled few.
  // "Every product in this grid carries a price" is the claim a parser is
  // built on, and one printed record cannot support it while a count over all
  // 74 of them can.
  const presence = new Map<string, number>();
  for (const item of found.items) {
    for (const k of Object.keys(item as Record<string, unknown>)) {
      presence.set(k, (presence.get(k) ?? 0) + 1);
    }
  }
  console.log(
    `  key presence across all ${found.items.length}: ` +
      [...presence.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}=${n}`)
        .join(', '),
  );

  // Three records rather than one, because a parser needs a fixture and a
  // fixture of a single row proves only that the row parses. Three costs
  // nothing extra — the render is already paid for — and catches the shape
  // differences (a reduction, an out-of-stock, a single-variant price) that a
  // first row picked at random usually does not have.
  for (const [i, item] of found.items.slice(0, 3).entries()) {
    const one = JSON.stringify(item, null, 1) ?? '';
    console.log(`  element ${i} (capped at 4000 chars):\n${one.slice(0, 4000)}`);
  }
}

safely('JSON script blocks', () => {
  for (const s of named) {
    if (s.type.includes('json') || s.id === '__NEXT_DATA__' || /^\s*[{[]/.test(s.body)) {
      report(`#${s.id}`, s.body.trim());
    }
  }

  // A named state block that is assigned rather than served as application/json.
  for (const m of html.matchAll(
    /(?:window|self)\.(__[A-Z_0-9]+__|__NUXT__)\s*=\s*(\{[\s\S]{0,4000000}?\})\s*;?\s*<\/script>/g,
  )) {
    report(`window.${m[1] ?? '?'}`, m[2] ?? '');
  }
});

// ── 5. React Server Components flight stream ──────────────────────────────
// Next.js App Router pushes its payload as many `self.__next_f.push([1,"…"])`
// string chunks that concatenate into one stream. Nothing in this repo reads
// that shape, so the only useful question is whether the product data is in
// there at all before anyone builds a reader for it.
safely('RSC flight stream', () => {
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g)];
  if (flight.length) {
    let stream = '';
    for (const m of flight) {
      try {
        stream += JSON.parse(`"${m[1]}"`) as string;
      } catch {
        /* a chunk that will not unescape tells us nothing; the rest still might */
      }
    }
    console.log(`\n### RSC flight stream: ${flight.length} chunk(s), ${stream.length.toLocaleString()} chars assembled`);
    for (const probe of ['"price"', 'price', 'GBP', '"@type"', 'Product', 'sku', 'currency', 'inStock', 'availab']) {
      const at = stream.indexOf(probe);
      console.log(`  ${JSON.stringify(probe)}: ${at < 0 ? 'absent' : `first at ${at}`}`);
    }
    // ── One window per anchor, not one window per "price-shaped" guess ──────
    // The Selfridges run (32504714179, job 96842167898) is why. Its stream
    // reported `"price"` first at 398,417 and `sku` at 398,478 — a product
    // record, clearly — and then printed a window of the top-level navigation
    // menu, because the loose /"(price|amount|value)"\s*:/ this replaces
    // matched `"value":{"hex":"#b60218"}` in a link colour at 14,848 and never
    // looked further. A single window on a 460,000-character stream has to
    // land on the right anchor first time or the whole render is wasted, so
    // there are now several, each on an exact key, deduplicated where two
    // land close enough to share one.
    const anchors: Array<[string, RegExp]> = [
      ['"price" as a key', /"price"\s*:/],
      ['"sku" as a key', /"sku"\s*:/],
      ['a GBP currency value', /"[A-Za-z]*[Cc]urrency[A-Za-z]*"\s*:\s*"GBP"/],
      ['a sterling amount', /"[^"]*"\s*:\s*"£/],
    ];
    const shown: number[] = [];
    for (const [label, pattern] of anchors) {
      const at = stream.search(pattern);
      if (at < 0) {
        console.log(`  no window for ${label}: not present`);
        continue;
      }
      if (shown.some((prev) => Math.abs(prev - at) < 2_000)) {
        console.log(`  window for ${label} at ${at} overlaps one already shown`);
        continue;
      }
      shown.push(at);
      console.log(
        `  window around ${label}, at ${at}:\n${stream.slice(Math.max(0, at - 1200), at + 2200)}`,
      );
    }
  } else {
    console.log('\n### RSC flight stream: no self.__next_f.push chunks');
  }
});

// ── 6. API addresses the page itself names ────────────────────────────────
// If the state blob carries no price, the page had to get one from somewhere,
// and an endpoint it names in its own markup is the cheapest possible next
// lead — a JSON URL may answer to a plain fetch or the proxy tier, neither of
// which costs a browser render.
safely('API-shaped addresses', () => {
  const apiUrls = new Set<string>();
  for (const m of html.matchAll(/"((?:https?:)?\/\/[^"']{0,200}?\/(?:api|graphql|occ|rest|v\d)\/[^"']{0,200}?)"/gi)) {
    if (m[1]) apiUrls.add(m[1]);
  }
  for (const m of html.matchAll(/"(\/(?:api|graphql|occ|rest)\/[^"']{0,200}?)"/gi)) {
    if (m[1]) apiUrls.add(m[1]);
  }
  const apiList = [...apiUrls].slice(0, 40);
  console.log(`\n### API-shaped addresses named in the markup: ${apiUrls.size} distinct (showing ${apiList.length})`);
  for (const a of apiList) console.log(`  ${a}`);
});

console.log(`\nApify actor pages rendered this run: ${renderer ? renderer.used() : 0}`);
if (actorConfig && !localFile) await printMonthlySpend(actorConfig.token);
