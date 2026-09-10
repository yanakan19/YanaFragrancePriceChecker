/**
 * What a retailer's or a brand's own homepage declares as its logo.
 *
 *   npm run logo:probe                              # all 38 enabled retailers + top 100 brands
 *   npm run logo:probe -- --retailer=justmylook     # one retailer
 *   npm run logo:probe -- --brand=armaf             # one brand (BRAND_SITES key or display name)
 *   npm run logo:probe -- --top=30                  # top N brands by product count with a BRAND_SITES entry
 *   npm run logo:probe -- --limit=5                 # first N targets, for a quick look
 *   npm run logo:probe -- --require-all-ok          # exit 1 if any target 4xx/5xx'd outright
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * docs/LOGOS-PLAN.md §5 step 2. Reports, never edits — exactly the shape
 * scripts/brand-site-probe.ts already established for this repo: name the
 * request behind every line, decide nothing on the registry's behalf. Nobody
 * reading this script's output should have to re-fetch anything to check a
 * claim it makes; every candidate line carries the exact URL requested and
 * the ISO date it was read, because docs/LOGOS-PLAN.md §4e requires both on
 * every `LogoRef` that ships and a report that cannot supply them is not
 * useful evidence for one.
 *
 * ── What it looks for ─────────────────────────────────────────────────────────
 * Fetches the homepage, reads `<link rel="icon">`, `<link rel="apple-touch-
 * icon">`, `<link rel="mask-icon">` and any `Organization.logo` inside a
 * `<script type="application/ld+json">` block (including one nested in a
 * `@graph` array, which several storefronts use), resolves each against the
 * page's own URL, dedupes, and fetches every surviving candidate — because a
 * house that lists both a small favicon and a real apple-touch-icon needs
 * both measured, not just the first one found.
 *
 * ── Ink, measured, not eyeballed ──────────────────────────────────────────────
 * A raster (PNG/JPEG/GIF/WEBP) or `.ico` candidate is measured directly by
 * scripts/logo-ink.py (Pillow: opaque-pixel share failing 3:1 against each of
 * the two grounds this app ships, #0A0A0B and #FCFCFD — see that script's own
 * header). An SVG cannot be opened by Pillow, so it is rasterised first with
 * the same pinned Chromium scripts/a11y-audit.ts already launches, at a fixed
 * 512×512 canvas with a transparent page background (`omitBackground`), then
 * measured the same way. This is the one place this script writes a file to
 * disk, and it is a throwaway PNG under the OS temp dir, never committed and
 * never the artefact a `commons-public-domain` entry would cite — that SVG,
 * when one is used, is fetched again by hand and committed as-is (§4a).
 *
 * ── Reporting every candidate, not just the first ─────────────────────────────
 * §5's correction: some shops publish both a dark-ink and a light-ink
 * variant — French Avenue's own CDN serves `logo_1.png` (dark ink, 100%
 * failing on the dark ground) and `Heading_logo.png` (white ink, 100% failing
 * on light) side by side. Every candidate this script finds is measured and
 * printed with its own `ink`; nothing here picks a winner.
 *
 * ── What it does not do ───────────────────────────────────────────────────────
 * It never writes to src/config/retailers.ts or demo/brandLogos.ts, and it
 * never resolves a Wikidata entity — §3's own finding is that name-matching
 * there is dangerous (four wrong QIDs in thirty-eight tried) and must stay a
 * by-hand step with the result eyeballed before it ships (§5 step 6).
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RETAILERS } from '../src/config/retailers.js';
import { BROWSER_HEADERS } from '../src/catalogue/attempt.js';
import { CATALOGUE } from '../demo/catalogue.generated.js';
import { BRAND_SITES } from '../demo/brandSites.js';

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const onlyRetailer = arg('retailer');
const onlyBrand = arg('brand');
const topN = Number.parseInt(arg('top') ?? '0', 10);
const limitArg = Number.parseInt(arg('limit') ?? '0', 10);
const requireAllOk = process.argv.includes('--require-all-ok');

/** Duplicated from demo/brandSites.ts's own private normalizeBrand — see
 *  demo/brandLogos.ts's header for why this is a duplicate, not an import. */
function normalizeBrand(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

interface Target {
  id: string;
  kind: 'retailer' | 'brand';
  homepage: string;
}

function retailerTargets(): Target[] {
  const enabled = RETAILERS.filter((r) => r.enabled);
  const chosen = onlyRetailer ? enabled.filter((r) => r.id === onlyRetailer) : enabled;
  return chosen.map((r) => ({ id: r.id, kind: 'retailer', homepage: r.homepage }));
}

/** Brands ranked by product count in the live catalogue, restricted to the
 *  ones BRAND_SITES already resolves — the only ones this probe has a
 *  homepage to ask. Mirrors §2b's own measurement exactly. */
function brandTargets(): Target[] {
  const counts = new Map<string, number>();
  for (const e of CATALOGUE) counts.set(e.brand, (counts.get(e.brand) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  if (onlyBrand) {
    const key = normalizeBrand(onlyBrand);
    const url = BRAND_SITES[key];
    if (!url) return [];
    const display = ranked.find(([b]) => normalizeBrand(b) === key)?.[0] ?? onlyBrand;
    return [{ id: display, kind: 'brand', homepage: url }];
  }

  const withSite = ranked
    .map(([brand]) => ({ brand, url: BRAND_SITES[normalizeBrand(brand)] }))
    .filter((x): x is { brand: string; url: string } => !!x.url);
  const n = topN > 0 ? topN : 100;
  return withSite.slice(0, n).map((x) => ({ id: x.brand, kind: 'brand', homepage: x.url }));
}

let targets: Target[] = onlyRetailer
  ? retailerTargets()
  : onlyBrand
    ? brandTargets()
    : [...retailerTargets(), ...brandTargets()];

if (limitArg > 0) targets = targets.slice(0, limitArg);

if (targets.length === 0) {
  console.error('No targets matched — check --retailer=/--brand= against the registries.');
  process.exit(2);
}

interface Candidate {
  url: string;
  relation: string; // icon / apple-touch-icon / mask-icon / Organization.logo
}

interface Measured extends Candidate {
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  transparentPct: number | null;
  failDarkPct: number | null;
  failLightPct: number | null;
  ink: 'dark' | 'light' | 'own' | null;
  shape: 'square' | 'wordmark' | null;
  error: string | null;
}

interface TargetReport {
  target: Target;
  homepageStatus: number;
  homepageError: string | null;
  candidates: Measured[];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const lastRequestAtHost = new Map<string, number>();

/** One request per host per 2s — an unthrottled sweep in the research behind
 *  docs/LOGOS-PLAN.md produced eight false 429s that a throttled retry
 *  cleared (§5 step 2). */
async function politeFetch(url: string): Promise<{ status: number; body: ArrayBuffer; ok: boolean; contentType: string; error: string | null }> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { status: 0, body: new ArrayBuffer(0), ok: false, contentType: '', error: 'unparseable URL' };
  }
  const last = lastRequestAtHost.get(host);
  if (last !== undefined) {
    const wait = 2000 - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }
  lastRequestAtHost.set(host, Date.now());
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    const body = await res.arrayBuffer();
    return { status: res.status, body, ok: res.ok, contentType: res.headers.get('content-type') ?? '', error: null };
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    return {
      status: 0,
      body: new ArrayBuffer(0),
      ok: false,
      contentType: '',
      error: `${String(err).slice(0, 100)}${cause ? ` (${String(cause).slice(0, 80)})` : ''}`,
    };
  }
}

/** `<link rel="...">` icon-shaped tags, href resolved against `base`. */
function iconLinks(html: string, base: string): Candidate[] {
  const out: Candidate[] = [];
  const linkTagRe = /<link\b[^>]*>/gi;
  for (const tag of html.match(linkTagRe) ?? []) {
    // Quoted value first — "shortcut icon" is two words and a bare
    // [^"'\s>]+ capture chops it at the space, silently losing every shop
    // that writes rel="shortcut icon" rather than rel="icon" (found live on
    // ajmal.com: rel="shortcut icon" was being read back as just "shortcut").
    // Falls back to the old unquoted-token match for a link tag with no
    // quotes around rel at all.
    const relMatch = /\brel=(?:"([^"]*)"|'([^']*)'|([^"'\s>]+))/i.exec(tag);
    const rel = (relMatch?.[1] ?? relMatch?.[2] ?? relMatch?.[3] ?? '').toLowerCase();
    if (!['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon', 'shortcut icon'].includes(rel)) continue;
    const hrefMatch = /\bhref=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch) continue;
    try {
      out.push({ url: new URL(hrefMatch[1]!, base).toString(), relation: rel });
    } catch {
      /* unresolvable href, skip */
    }
  }
  return out;
}

/** `Organization.logo` from any JSON-LD block, including one nested in a `@graph` array. */
function jsonLdLogo(html: string, base: string): Candidate[] {
  const out: Candidate[] = [];
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(scriptRe)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!.trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : typeof data === 'object' && data && '@graph' in (data as Record<string, unknown>)
      ? (data as { '@graph': unknown[] })['@graph']
      : [data];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const rec = node as Record<string, unknown>;
      const type = rec['@type'];
      const isOrg = type === 'Organization' || (Array.isArray(type) && type.includes('Organization'));
      if (!isOrg) continue;
      const logo = rec.logo;
      const logoUrl = typeof logo === 'string' ? logo : logo && typeof logo === 'object' ? (logo as Record<string, unknown>).url : undefined;
      if (typeof logoUrl === 'string') {
        try {
          out.push({ url: new URL(logoUrl, base).toString(), relation: 'Organization.logo' });
        } catch {
          /* unresolvable, skip */
        }
      }
    }
  }
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), 'logo-probe-'));
let chromiumPromise: ReturnType<typeof launchChromiumLazy> | null = null;

// Lazily imported: most runs (retailer-only, small --limit) never touch an
// SVG candidate, and spinning up a browser for a sweep that never needs one
// would be a slow no-op every time.
async function launchChromiumLazy() {
  const { launchChromium } = await import('./a11y-audit.js');
  return launchChromium();
}

/**
 * Reads the shape the SVG itself declares — `width`/`height` on the root
 * element, falling back to `viewBox` — before anything is rendered.
 *
 * This matters because a rasteriser needs *some* canvas size to draw into,
 * and a fixed square canvas (512×512, say) with `object-fit: contain` would
 * letterbox a wordmark correctly on screen while reporting back a 512×512
 * PNG — silently turning Justmylook's real 236×37 wordmark into something
 * `shapeOf` reads as square. Reading the source SVG's own declared
 * proportions first and sizing the render canvas to match is what keeps the
 * measured dimensions the same shape as the artwork.
 */
function intrinsicSvgSize(svgText: string): { w: number; h: number } | null {
  const svgTag = /<svg\b[^>]*>/i.exec(svgText)?.[0] ?? '';
  const wAttr = /\bwidth=["']?([\d.]+)/i.exec(svgTag)?.[1];
  const hAttr = /\bheight=["']?([\d.]+)/i.exec(svgTag)?.[1];
  if (wAttr && hAttr && Number(wAttr) > 0 && Number(hAttr) > 0) {
    return { w: Number(wAttr), h: Number(hAttr) };
  }
  const vb = /\bviewBox=["']?\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)\s+([\d.\-]+)/i.exec(svgTag);
  if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return { w: Number(vb[1]), h: Number(vb[2]) };
  return null;
}

async function rasteriseSvg(svgText: string): Promise<string> {
  if (!chromiumPromise) chromiumPromise = launchChromiumLazy();
  const browser = await chromiumPromise;
  const intrinsic = intrinsicSvgSize(svgText) ?? { w: 300, h: 300 };
  const scale = 400 / Math.max(intrinsic.w, intrinsic.h);
  const w = Math.max(1, Math.round(intrinsic.w * scale));
  const h = Math.max(1, Math.round(intrinsic.h * scale));
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  try {
    const encoded = Buffer.from(svgText, 'utf8').toString('base64');
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}img{display:block;width:${w}px;height:${h}px}</style>` +
        `<img src="data:image/svg+xml;base64,${encoded}">`,
    );
    await page.waitForTimeout(50);
    const out = join(tmp, `svg-${Math.random().toString(36).slice(2)}.png`);
    await page.screenshot({ path: out, omitBackground: true });
    return out;
  } finally {
    await page.close();
  }
}

function measureRasterFile(path: string): {
  width: number | null;
  height: number | null;
  transparentPct: number | null;
  failDarkPct: number | null;
  failLightPct: number | null;
  ink: 'dark' | 'light' | 'own' | null;
  error: string | null;
} {
  try {
    const out = execFileSync('python3', [join(import.meta.dirname, 'logo-ink.py'), path], { encoding: 'utf8' });
    const parsed = JSON.parse(out) as {
      error?: string;
      width?: number;
      height?: number;
      transparentPct?: number;
      failDarkPct?: number;
      failLightPct?: number;
      ink?: 'dark' | 'light' | 'own';
    };
    if (parsed.error) return { width: null, height: null, transparentPct: null, failDarkPct: null, failLightPct: null, ink: null, error: parsed.error };
    return {
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      transparentPct: parsed.transparentPct ?? null,
      failDarkPct: parsed.failDarkPct ?? null,
      failLightPct: parsed.failLightPct ?? null,
      ink: parsed.ink ?? null,
      error: null,
    };
  } catch (err) {
    return { width: null, height: null, transparentPct: null, failDarkPct: null, failLightPct: null, ink: null, error: String(err).slice(0, 160) };
  }
}

function shapeOf(width: number | null, height: number | null): 'square' | 'wordmark' | null {
  if (!width || !height) return null;
  const ratio = width / height;
  // Within 15% of 1:1 counts as square — an icon that is 32x30 through a
  // resize artefact should not be classified a wordmark.
  return ratio >= 0.85 && ratio <= 1.18 ? 'square' : 'wordmark';
}

async function measureCandidate(c: Candidate): Promise<Measured> {
  const res = await politeFetch(c.url);
  const base: Measured = {
    ...c,
    contentType: res.contentType,
    bytes: res.body.byteLength,
    width: null,
    height: null,
    transparentPct: null,
    failDarkPct: null,
    failLightPct: null,
    ink: null,
    shape: null,
    error: res.error,
  };
  if (!res.ok || res.body.byteLength === 0) {
    return { ...base, error: base.error ?? `HTTP ${res.status}` };
  }
  const bytes = Buffer.from(res.body);
  const isSvg = c.url.toLowerCase().endsWith('.svg') || res.contentType.includes('svg') || bytes.subarray(0, 200).toString('utf8').includes('<svg');
  try {
    let filePath: string;
    if (isSvg) {
      filePath = await rasteriseSvg(bytes.toString('utf8'));
    } else {
      filePath = join(tmp, `raster-${Math.random().toString(36).slice(2)}`);
      writeFileSync(filePath, bytes);
    }
    const measured = measureRasterFile(filePath);
    return { ...base, ...measured, shape: shapeOf(measured.width, measured.height) };
  } catch (err) {
    return { ...base, error: String(err).slice(0, 160) };
  }
}

async function probeTarget(target: Target): Promise<TargetReport> {
  const res = await politeFetch(target.homepage);
  if (!res.ok || res.body.byteLength === 0) {
    return { target, homepageStatus: res.status, homepageError: res.error, candidates: [] };
  }
  const html = Buffer.from(res.body).toString('utf8');
  const base = target.homepage;
  const candidates = [...iconLinks(html, base), ...jsonLdLogo(html, base)];
  // Dedupe by resolved URL, keeping the first relation seen.
  const seen = new Map<string, Candidate>();
  for (const c of candidates) if (!seen.has(c.url)) seen.set(c.url, c);

  const measured: Measured[] = [];
  for (const c of seen.values()) measured.push(await measureCandidate(c));
  return { target, homepageStatus: res.status, homepageError: null, candidates: measured };
}

async function main(): Promise<void> {
  const readAt = new Date().toISOString().slice(0, 10);
  console.log('# Logo probe report\n');
  console.log(`Run ${new Date().toISOString()} — ${targets.length} target(s), one request per host per 2s.\n`);
  console.log(
    'Reports only — nothing here writes to src/config/retailers.ts or ' +
      'demo/brandLogos.ts. Every asset found is measured against both theme ' +
      'grounds (#0A0A0B dark, #FCFCFD light); ink is picked by ' +
      'scripts/logo-ink.py from that measurement, never eyeballed.\n',
  );

  const reports: TargetReport[] = [];
  for (const t of targets) {
    reports.push(await probeTarget(t));
  }

  console.log('| id | kind | homepage status | candidate URL | relation | type | size | dims | transparent % | fail-on-dark % | fail-on-light % | ink | shape | basis | readAt |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of reports) {
    if (r.candidates.length === 0) {
      console.log(
        `| ${r.target.id} | ${r.target.kind} | ${r.homepageStatus || 'ERR'} | — | — | — | — | — | — | — | — | — | — | — | ${readAt} |` +
          (r.homepageError ? ` <!-- ${r.homepageError.replace(/\|/g, '/')} -->` : ''),
      );
      continue;
    }
    for (const c of r.candidates) {
      const dims = c.width && c.height ? `${c.width}×${c.height}` : '—';
      const sizeKb = c.bytes > 0 ? `${(c.bytes / 1024).toFixed(1)} KB` : '—';
      const type = c.contentType || (c.url.endsWith('.svg') ? 'image/svg+xml' : '—');
      const basis = c.error ? '—' : 'own-site-declared';
      console.log(
        `| ${r.target.id} | ${r.target.kind} | ${r.homepageStatus} | ${c.url} | ${c.relation} | ${type} | ${sizeKb} | ${dims} | ` +
          `${c.transparentPct ?? '—'} | ${c.failDarkPct ?? '—'} | ${c.failLightPct ?? '—'} | ${c.ink ?? '—'} | ${c.shape ?? '—'} | ${basis} | ${readAt} |` +
          (c.error ? ` <!-- ${c.error.replace(/\|/g, '/')} -->` : ''),
      );
    }
  }

  console.log('\n## Summary\n');
  const withAsset = reports.filter((r) => r.candidates.some((c) => !c.error));
  const noHomepage = reports.filter((r) => r.candidates.length === 0);
  console.log(`- ${reports.length} target(s) probed`);
  console.log(`- ${withAsset.length} returned at least one measurable candidate`);
  console.log(`- ${noHomepage.length} target(s) never got past the homepage request`);
  for (const r of noHomepage) {
    console.log(`  - ${r.target.id} (${r.target.kind}): HTTP ${r.homepageStatus || 'ERR'}${r.homepageError ? ` — ${r.homepageError}` : ''}`);
  }

  if (chromiumPromise) {
    const browser = await chromiumPromise;
    await browser.close();
  }
  rmSync(tmp, { recursive: true, force: true });

  if (requireAllOk) {
    const broken = reports.filter((r) => r.candidates.length === 0 || r.candidates.every((c) => c.error));
    if (broken.length > 0) {
      console.error(`FAIL: --require-all-ok was set and ${broken.length} target(s) had nothing usable.`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
