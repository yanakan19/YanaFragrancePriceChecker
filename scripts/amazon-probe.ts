/**
 * Amazon UK, measured honestly, once, and no further.
 *
 * The owner has asked four times for Amazon to be attempted. This treats
 * amazon.co.uk exactly like any other shop in this registry, under the
 * project's own rules: read robots.txt FIRST and obey it literally, ask only
 * the paths it permits, and record exactly what comes back. No challenge
 * bypassing, no headless render, no proxy — the same free, plain-fetch tier
 * every shop in src/config/retailers.ts gets before anything metered is even
 * considered. If Amazon refuses, the refusal is the answer, and this script's
 * whole output is a report of that, never an invented price.
 *
 *   npm run amazon:probe
 *
 * Two paths only, both Amazon's own standard, publicly documented URL
 * shapes — not an internal category id guessed at, which this project's own
 * "never invent a URL" rule forbids:
 *   - /s?k=perfume  — the ordinary keyword-search results page every visitor
 *     to amazon.co.uk uses, run twice (perfume, fragrance) for the category
 *     the task named.
 *   - one product URL, ONLY if a search page both (a) was permitted and
 *     fetched, and (b) named one via a JSON-LD Product node or a plain
 *     /dp/<ASIN> link on the page itself — never a fabricated ASIN.
 *
 * Writes nothing. Commits nothing. Stores no price. This is measurement only.
 */
import { RETAILERS } from '../src/config/retailers.js';
import { BROWSER_HEADERS } from '../src/catalogue/attempt.js';
import { createHttp } from '../src/catalogue/httpFetch.js';
import { probeRobots } from '../src/catalogue/robotsSource.js';
import { isAllowed } from '../src/catalogue/robots.js';
import { parseListings } from '../src/catalogue/jsonld.js';

const retailer = RETAILERS.find((r) => r.id === 'amazon-uk');
if (!retailer) {
  console.error('amazon-uk is not in the registry.');
  process.exit(1);
}

const http = createHttp();

console.log('Amazon UK probe — robots.txt first, and obeyed literally.\n');

const robotsProbe = await probeRobots(retailer, http, BROWSER_HEADERS);
console.log('robots.txt candidates asked:');
for (const a of robotsProbe.attempts) {
  console.log(`  ${a.url}: HTTP ${a.status}${a.error ? ` — ${a.error}` : ''}`);
}
console.log('');

if (robotsProbe.rules.unavailable) {
  console.log('robots.txt UNREACHABLE — per RFC 9309 §2.3.1.4 that means assume complete');
  console.log('disallow, the same rule this project applies to every other shop. Nothing');
  console.log('further is fetched.');
  process.exit(0);
}

console.log(`robots.txt read: ${robotsProbe.rules.disallow.length} disallow rule(s), `
  + `${robotsProbe.rules.allow.length} allow rule(s), `
  + `${robotsProbe.rules.sitemaps.length} sitemap(s) declared.`);
if (robotsProbe.rules.crawlDelaySeconds !== null) {
  console.log(`Crawl-delay: ${robotsProbe.rules.crawlDelaySeconds}s.`);
}
console.log('Disallow rules (verbatim, from the file this run actually read):');
for (const d of robotsProbe.rules.disallow) console.log(`  Disallow: ${d}`);
console.log('');

const origin = new URL(retailer.homepage ?? `https://www.${retailer.domain}`).origin;
const searchPaths = ['/s?k=perfume', '/s?k=fragrance'];

let firstPermittedBody: string | null = null;
let firstPermittedUrl: string | null = null;

for (const path of searchPaths) {
  const url = `${origin}${path}`;
  const permitted = isAllowed(robotsProbe.rules, url);
  console.log(`${url}`);
  console.log(`  robots.txt: ${permitted ? 'PERMITTED' : 'DISALLOWED'}`);
  if (!permitted) {
    console.log('  not fetched — robots.txt disallows this path.\n');
    continue;
  }
  const res = await http(url, BROWSER_HEADERS);
  console.log(`  HTTP ${res.status}${res.error ? ` — ${res.error}` : ''}, ${res.body.length.toLocaleString()} bytes`);
  if (res.ok && res.body) {
    const listings = parseListings(res.body, { sectionId: 'amazon-probe', pageUrl: url });
    console.log(`  schema.org JSON-LD Product nodes parsed: ${listings.length}`);
    const hasAnyJsonLd = /<script[^>]+type="application\/ld\+json"/i.test(res.body);
    console.log(`  any application/ld+json script present: ${hasAnyJsonLd}`);
    if (!firstPermittedBody) {
      firstPermittedBody = res.body;
      firstPermittedUrl = url;
    }
  }
  console.log('');
}

if (!firstPermittedBody) {
  console.log('No search page was both permitted and fetched, so no product page can be');
  console.log('named without guessing one — which this script refuses to do. Nothing more');
  console.log('to report.');
  process.exit(0);
}

// A product URL is only ever the one the search page itself named — a plain
// /<slug>/dp/<ASIN> link, Amazon's own standard product-page shape. Never
// constructed from a guessed ASIN.
const dpMatch = firstPermittedBody.match(/href="(\/[^"?#]*\/dp\/[A-Z0-9]{10})[^"]*"/);
if (!dpMatch) {
  console.log(`No /dp/ product link found in ${firstPermittedUrl}'s own markup. Nothing more`);
  console.log('to report — no product URL to try that this run actually found on the page.');
  process.exit(0);
}

const productUrl = `${origin}${dpMatch[1]}`;
console.log(`Product URL named by the search page itself: ${productUrl}`);
const productPermitted = isAllowed(robotsProbe.rules, productUrl);
console.log(`  robots.txt: ${productPermitted ? 'PERMITTED' : 'DISALLOWED'}`);
if (!productPermitted) {
  console.log('  not fetched — robots.txt disallows this path.');
  process.exit(0);
}

const productRes = await http(productUrl, BROWSER_HEADERS);
console.log(`  HTTP ${productRes.status}${productRes.error ? ` — ${productRes.error}` : ''}, ${productRes.body.length.toLocaleString()} bytes`);
if (productRes.ok && productRes.body) {
  const listings = parseListings(productRes.body, { sectionId: 'amazon-probe', pageUrl: productUrl });
  console.log(`  schema.org JSON-LD Product nodes parsed: ${listings.length}`);
  const hasAnyJsonLd = /<script[^>]+type="application\/ld\+json"/i.test(productRes.body);
  console.log(`  any application/ld+json script present: ${hasAnyJsonLd}`);
}
