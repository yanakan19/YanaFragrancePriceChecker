import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRAND_LOGOS, logoFor } from '../demo/brandLogos.js';
import { BRAND_SITES } from '../demo/brandSites.js';
import { RETAILERS } from '../src/config/retailers.js';
import type { LogoRef, LogoBasis } from '../src/types/retailer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The registrable domain of a host — the brand-owned part, with any subdomain
 * dropped. `www.lattafa.com` and `uk.lattafa.com` both reduce to `lattafa.com`,
 * so a brand serving its logo from a regional or `www` subdomain of its own
 * site still counts as its own. The two-label default is widened to three for
 * the second-level suffixes that actually appear in the data (`.co.uk` and its
 * siblings), so two different `.co.uk` brands can never be read as one.
 */
function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.');
  const sld = new Set(['co.uk', 'org.uk', 'me.uk', 'com.au', 'co.nz', 'co.za']);
  const lastTwo = labels.slice(-2).join('.');
  return sld.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * Hosts that are NOT a brand's own domain but ARE where that brand's own site
 * serves its declared logo asset, each confirmed against the entry that needs
 * it (2026-09-10). This is the whole allowance for an off-domain `src`: an
 * `own-site-declared` logo host must be the brand's own registrable domain or
 * one of these, and nothing else — which is what stops a logo being hot-linked
 * from an arbitrary third party whose terms we have not read (docs/LOGOS-PLAN.md,
 * "must not be done"). Add a host here only after confirming the brand's own
 * site is what serves the asset from it.
 */
const DECLARED_ASSET_HOSTS = new Set([
  'cdn.shopify.com', // Shopify stores (e.g. Ariana Grande)
  'cdn.prod.website-files.com', // Webflow (Davidoff)
  'scdn.speedsize.com', // SpeedSize image CDN (Escentric Molecules)
  'cdn.files.salla.network', // Salla storefronts (Le Bonheur)
  'www.lattafa-usa.com', // Lattafa's own US site; brand site is lattafa.com
]);

/**
 * The invariants docs/LOGOS-PLAN.md §4e and §5 step 4 require of every
 * `LogoRef` that ships, retailer or brand, mirroring the discipline
 * `imageBasis` already runs on product photography: nothing is shown without
 * a recorded reason, and the reason has to be one this repo actually has a
 * basis for (§2c).
 */
function allLogoRefs(): { where: string; logo: LogoRef }[] {
  const out: { where: string; logo: LogoRef }[] = [];
  for (const r of RETAILERS) if (r.logo) out.push({ where: `retailer:${r.id}`, logo: r.logo });
  for (const [key, logo] of Object.entries(BRAND_LOGOS)) out.push({ where: `brand:${key}`, logo });
  return out;
}

const VALID_BASES: LogoBasis[] = ['own-site-declared', 'commons-public-domain', 'affiliate-creative'];

describe('every LogoRef carries a recorded reason', () => {
  const refs = allLogoRefs();

  it('has at least the entries this pass actually added', () => {
    // Not a fixed count — the brand pass adds entries one at a time — just a
    // floor so this suite cannot silently pass against an empty registry.
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))('%s has a non-empty source and readAt', (_where, logo) => {
    expect(logo.source, `${_where}: source is required — see docs/LOGOS-PLAN.md §4e`).toBeTruthy();
    expect(logo.readAt, `${_where}: readAt is required`).toBeTruthy();
    expect(logo.readAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))('%s has one of the three basis values', (_where, logo) => {
    expect(VALID_BASES).toContain(logo.basis);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))('%s has a shape and an ink', (_where, logo) => {
    expect(['square', 'wordmark']).toContain(logo.shape);
    expect(['dark', 'light', 'own']).toContain(logo.ink);
  });

  it.each(refs.map((r): [string, LogoRef] => [r.where, r.logo]))(
    '%s: commons-public-domain points under /logos/, an own-site logo sits on the brand’s own domain',
    (where, logo) => {
      if (logo.basis === 'commons-public-domain') {
        expect(logo.src.startsWith('/logos/'), `${where}: commons-public-domain must be a repo path under /logos/, got ${logo.src}`).toBe(true);
        return;
      }

      expect(logo.src.startsWith('https://'), `${where}: ${logo.basis} must be an absolute https URL, got ${logo.src}`).toBe(true);

      // The load-bearing half, and the one a bare https check missed: an
      // own-site-declared logo has to be traceable to the brand itself, or the
      // referential-use basis (docs/LOGOS-PLAN.md §2c) does not hold. The host
      // must be the brand's own registrable domain, or a documented asset host
      // its own site serves from. A brand entry with no BRAND_SITES entry has
      // no "own domain" to check against, so it cannot carry this basis.
      if (logo.basis === 'own-site-declared' && where.startsWith('brand:')) {
        const key = where.slice('brand:'.length);
        const site = BRAND_SITES[key];
        const host = new URL(logo.src).host;
        const onOwnDomain =
          site !== undefined && registrableDomain(host) === registrableDomain(new URL(site).host);
        expect(
          onOwnDomain || DECLARED_ASSET_HOSTS.has(host),
          `${where}: own-site-declared logo host ${host} is neither the brand's own domain (${site ?? 'no BRAND_SITES entry'}) nor a documented asset host`,
        ).toBe(true);
      }
    },
  );
});

describe('logoFor keys exactly as BRAND_SITES does', () => {
  it('resolves an entry back through the same normalisation used to add it', () => {
    // Every key already in BRAND_LOGOS must itself be reachable by name —
    // i.e. logoFor of some real-looking brand string normalizes onto it.
    // Cheapest real check: the key itself, title-cased, resolves to itself.
    for (const key of Object.keys(BRAND_LOGOS)) {
      const titled = key.replace(/\b\w/g, (c) => c.toUpperCase());
      expect(logoFor(titled)).toBe(BRAND_LOGOS[key]);
    }
  });

  it('returns null for a brand with no entry, never a guess', () => {
    expect(logoFor('Some Brand Nobody Has Ever Heard Of')).toBeNull();
  });
});

describe('demo/logos/ stays inside the committed-SVG budget', () => {
  const logosDir = resolve(root, 'demo/logos');
  const exists = (() => {
    try {
      return statSync(logosDir).isDirectory();
    } catch {
      return false;
    }
  })();

  it('no committed file exceeds 8 KB, and the directory totals under 400 KB', () => {
    if (!exists) return; // nothing committed yet is a pass, not a failure
    const files = readdirSync(logosDir).filter((f) => f.endsWith('.svg'));
    let total = 0;
    for (const f of files) {
      const size = statSync(resolve(logosDir, f)).size;
      expect(size, `demo/logos/${f} is ${size} bytes, over the 8 KB per-file budget`).toBeLessThanOrEqual(8 * 1024);
      total += size;
    }
    expect(total, `demo/logos/ totals ${total} bytes, over the 400 KB budget`).toBeLessThanOrEqual(400 * 1024);
  });

  it('every commons-public-domain LogoRef points at a file that actually exists', () => {
    for (const { where, logo } of allLogoRefs()) {
      if (logo.basis !== 'commons-public-domain') continue;
      const path = resolve(root, 'demo', logo.src.replace(/^\//, ''));
      expect(() => statSync(path), `${where}: ${logo.src} does not exist on disk`).not.toThrow();
    }
  });
});

describe('the logo paragraph appears in the Terms once any logo is set', () => {
  it('demo/legal.ts mentions logos when the registry is non-empty', () => {
    if (allLogoRefs().length === 0) return;
    const legal = readFileSync(resolve(root, 'demo/legal.ts'), 'utf8');
    expect(legal.toLowerCase()).toContain('logo');
  });
});
