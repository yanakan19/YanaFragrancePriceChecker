/**
 * What a brand's "official site" link actually does when you follow it.
 *
 *   npm run brand:probe                      # every entry in demo/brandSites.ts
 *   npm run brand:probe -- --brand=armaf     # one brand
 *   npm run brand:probe -- --limit=20        # first 20, for a quick look
 *   npm run brand:probe -- --require-all-ok  # exit 1 if anything is broken
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * demo/brandSites.ts maps brand names to their own websites, and its own
 * header and inline comments are unusually candid about where most of those
 * URLs came from: web-search snippets, gathered in sessions whose network was
 * blocked at the gateway, "stronger than a guessed pattern, weaker than
 * actually opening the page". Three separate comment blocks in that file say
 * some version of "treat these as the starting point for the next
 * confirmation pass, not page-verified facts". This is that pass.
 *
 * It matters because a wrong entry here is not invisible. Each one renders as
 * an "official site" link on a brand's profile page, so a reader who clicks it
 * is being told, in the site's own voice, that this is the brand's home. The
 * known-bad case is real and was caught by eye rather than by anything
 * automated: Ahmed Al Maghribi's entry pointed at ae.ahmedalmaghribi.com — the
 * house's UAE storefront, offered to a UK shopper as though it were theirs.
 *
 * ── Why it must run in CI ────────────────────────────────────────────────────
 * The environment this was written in has no outbound network; every request
 * 403s at its proxy before it leaves (docs/INGESTION.md). That is the same
 * constraint that produced the unverified entries in the first place, so
 * "check them from here" is not available — a verdict guessed from this
 * machine would just be a second layer of the original mistake. It is built to
 * be run by .github/workflows/price-verify.yml on a runner that does have
 * network, exactly as scripts/currency-probe.ts already is.
 *
 * ── What it does and does not decide ─────────────────────────────────────────
 * It reports; it does not edit demo/brandSites.ts, and it never proposes a
 * replacement URL. Every line names the request that produced it and the
 * address it ended on, so a person can judge. In particular it does NOT treat
 * "not a .co.uk" as an error: plenty of houses run one global site and that is
 * genuinely their own home. What it flags is narrower and evidence-based — a
 * link that fails, or one that lands on a *different market's* address than
 * the one we published.
 *
 * A GitHub runner is not in the UK, which cuts both ways here and is why the
 * distinction above is drawn where it is. A site doing geographic redirection
 * will send this runner to its US storefront regardless of what a UK visitor
 * would see, so `redirected-region` is a prompt to look, never a proven fault.
 * The classifier says so in its own reason text rather than leaving the reader
 * to remember it.
 */
import { BRAND_SITES } from '../demo/brandSites.js';
import { BROWSER_HEADERS, type Http } from '../src/catalogue/attempt.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import {
  parseRobots,
  isAllowed,
  NO_RESTRICTIONS,
  UNREACHABLE_ROBOTS,
  type RobotsRules,
} from '../src/catalogue/robots.js';
import {
  classifyLanding,
  registrableDomain,
  type BrandSiteFinding,
} from '../src/catalogue/brandSiteCheck.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const only = arg('brand');
const limitArg = Number.parseInt(arg('limit') ?? '0', 10);
const requireAllOk = process.argv.includes('--require-all-ok');

const http: Http = createHttp({ timeoutMs: 20_000 });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One request per distinct URL, not per brand.
 *
 * BRAND_SITES holds aliases — "paco rabanne" and "rabanne" are two keys
 * pointing at one site — so probing per key would ask the same server the same
 * question twice for no new information. Findings are reported per brand
 * afterwards, so nothing is hidden by the deduplication.
 */
const entries = Object.entries(BRAND_SITES)
  .filter(([brand]) => (only ? brand === only.toLowerCase() : true))
  .sort(([a], [b]) => a.localeCompare(b));

if (entries.length === 0) {
  console.error(
    only
      ? `no brand keyed "${only.toLowerCase()}" in demo/brandSites.ts`
      : 'demo/brandSites.ts is empty',
  );
  process.exit(2);
}

const byUrl = new Map<string, string[]>();
for (const [brand, url] of entries) {
  const bucket = byUrl.get(url);
  if (bucket) bucket.push(brand);
  else byUrl.set(url, [brand]);
}

const urls = [...byUrl.keys()].slice(0, limitArg > 0 ? limitArg : undefined);

console.log('');
console.log('Brand site probe');
console.log(`entries   ${entries.length} brand keys`);
console.log(`requests  ${urls.length} distinct URLs${limitArg > 0 ? ` (limited to ${limitArg})` : ''}`);
console.log('');

/** robots.txt per origin, fetched once and reused across that origin's URLs. */
const robotsByOrigin = new Map<string, RobotsRules>();

async function robotsFor(origin: string): Promise<RobotsRules> {
  const cached = robotsByOrigin.get(origin);
  if (cached) return cached;
  const res = await http(`${origin}/robots.txt`, BROWSER_HEADERS);
  // A 404 means the site published no restrictions, which is permission. Any
  // other failure means we could not ask, and "could not ask" is not "yes" —
  // see UNREACHABLE_ROBOTS, whose whole purpose is to keep those apart.
  const rules = res.ok ? parseRobots(res.body) : res.status === 404 ? NO_RESTRICTIONS : UNREACHABLE_ROBOTS;
  robotsByOrigin.set(origin, rules);
  return rules;
}

const findings: BrandSiteFinding[] = [];

for (const url of urls) {
  const brands = byUrl.get(url)!;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    findings.push({
      brands,
      declared: url,
      landed: null,
      status: 0,
      verdict: 'unusable',
      reason: 'not a parseable URL — this entry cannot be a link at all',
    });
    continue;
  }

  const robots = await robotsFor(origin);
  if (robots.unavailable) {
    findings.push({
      brands,
      declared: url,
      landed: null,
      status: 0,
      verdict: 'could-not-ask',
      reason: `robots.txt did not answer at ${origin}, so nothing was requested — this is not a result about the link`,
    });
    continue;
  }
  if (!isAllowed(robots, url)) {
    findings.push({
      brands,
      declared: url,
      landed: null,
      status: 0,
      verdict: 'could-not-ask',
      reason: 'robots.txt disallows this path, so it was not fetched',
    });
    continue;
  }

  const res = await http(url, BROWSER_HEADERS);
  // A courtesy gap between requests. Each URL here is a different host, so
  // this is not rate limiting any one server — it keeps a 141-request sweep
  // from reading as a burst to anything sitting in front of several of them.
  await sleep(300);

  findings.push(
    classifyLanding({
      brands,
      declared: url,
      landed: res.finalUrl ?? null,
      status: res.status,
      ...(res.error !== undefined ? { error: res.error } : {}),
    }),
  );
}

const order: Record<BrandSiteFinding['verdict'], number> = {
  unusable: 0,
  dead: 1,
  'redirected-domain': 2,
  'redirected-region': 3,
  'could-not-ask': 4,
  ok: 5,
};
findings.sort((a, b) => order[a.verdict] - order[b.verdict] || a.brands[0]!.localeCompare(b.brands[0]!));

console.log('──────── what each brand link did ────────');
for (const f of findings) {
  const who = f.brands.join(', ');
  console.log(`  ${f.verdict.padEnd(18)} ${who}`);
  console.log(`      declared  ${f.declared}`);
  if (f.landed && f.landed !== f.declared) console.log(`      landed    ${f.landed}`);
  console.log(`      ${f.status ? `HTTP ${f.status} — ` : ''}${f.reason}`);
}
console.log('');

const tally = new Map<string, number>();
for (const f of findings) tally.set(f.verdict, (tally.get(f.verdict) ?? 0) + 1);

console.log('──────── summary ────────');
for (const verdict of Object.keys(order) as BrandSiteFinding['verdict'][]) {
  const n = tally.get(verdict) ?? 0;
  if (n > 0) console.log(`  ${verdict.padEnd(18)} ${n}`);
}
console.log('');

const broken = findings.filter((f) => f.verdict === 'dead' || f.verdict === 'unusable');
const suspect = findings.filter(
  (f) => f.verdict === 'redirected-domain' || f.verdict === 'redirected-region',
);

if (broken.length === 0 && suspect.length === 0) {
  console.log('Every link that could be asked resolved on the address this repo publishes.');
} else {
  console.log(
    `${broken.length} link(s) are broken and ${suspect.length} landed somewhere other than the ` +
      'published address. Nothing has been changed: fixing an entry means finding the ' +
      "brand's real home and editing demo/brandSites.ts by hand, which is a judgement " +
      'this script deliberately does not make.',
  );
}

if (requireAllOk && (broken.length > 0 || suspect.length > 0)) {
  console.error('FAIL: --require-all-ok was set and the sweep found links that need a human.');
  process.exit(1);
}
