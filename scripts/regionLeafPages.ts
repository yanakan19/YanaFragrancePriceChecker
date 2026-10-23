/**
 * Brand and shop pages of the US, Indian and Canadian sites that answer HTTP
 * 200 (23 Oct 2026; the review in docs/SITE-REVIEW-2026-10-23.md, "Not done
 * here", item 1). The UK has had its own since 13 Oct (scripts/leafPages.ts).
 *
 * A region's products stay unrendered: its 64,000 products at the UK's 12 kB a
 * page would not fit the deploy budget. Its brands (about 2,600) and shops (41)
 * do, at a few kB each, because every page is the region's own home page
 * (demo/<r>/index.html) with the address's own head tags and plain content, and
 * the inline boot scripts moved into the one shared file the UK pages use
 * (splitBoot). The content lists the brand's or the shop's bottles with the
 * cheapest price in the region's money, and names no link to a product, since
 * a region product has no page of its own to link to.
 *
 * Pure functions here; scripts/build-region-leaf-pages.ts reads the region's
 * modules and writes the files, and scripts/build-sitemap.ts lists the ones it
 * wrote (dist-demo/regions/<r>/leaf-pages.json) and nothing else.
 */
import { headFor, SITE_URL, type HeadTags } from '../demo/head.js';
import { matchRoute, slugify } from '../demo/router.js';
import { regionPath, type RegionConfig } from '../src/config/regions.js';
import { formatMoney } from '../src/services/money.js';
import { esc, LIST_CAP } from './staticContent.js';

const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;

export interface RegionProduct {
  id: string;
  slug: string;
  brand: string;
  name: string;
  sizeMl?: number | null;
  shops?: number;
}
export interface RegionOffer {
  retailerId: string;
  price: number;
  inStock?: boolean;
}
export interface RegionShop {
  id: string;
  name: string;
  homepage: string;
  domain: string;
  enabled: boolean;
}
export interface RegionLeaf {
  kind: 'brand' | 'shop';
  /** The address as the browser has it: /us/brands/creed. */
  path: string;
  /** The file under demo/: us/brands/creed.html. */
  file: string;
  tags: HeadTags;
  main: string;
}
export interface RegionLeafManifest {
  bytes: number;
  pages: { kind: 'brand' | 'shop'; path: string; file: string }[];
  /** The shared boot file the region's pages load (assets/boot.<hash>.js). */
  boot: string;
  /** Left out for the budget. */
  skipped: number;
  candidates: number;
}

const name = (p: RegionProduct): string => `${p.brand} ${p.name}${p.sizeMl ? ` ${p.sizeMl}ml` : ''}`;
const SECTION_OPEN = '<section class="static-intro" aria-labelledby="static-intro-title">';

function crumbs(region: RegionConfig, label: string, list: string): string {
  return `<p class="t-caption"><a href="${esc(regionPath(region, '/'))}">Home</a> › <a href="${esc(regionPath(region, list))}">${label}</a></p>`;
}

function moreLinks(region: RegionConfig): string {
  const links = [['/deals', 'Today’s Deals'], ['/brands', 'All Brands'], ['/retailers', 'All Shops'], ['/about', 'About PriceSniffs']] as const;
  return `<ul class="static-links">${links.map(([p, t]) => `<li><a href="${esc(regionPath(region, p))}">${esc(t)}</a></li>`).join('')}</ul>`;
}

function listItem(p: RegionProduct, price: number | null, suffix: string): string {
  return `<li>${esc(name(p))}${price !== null ? `: ${formatMoney(price)}${suffix}` : ''}</li>`;
}

/** The cheapest in stock price of each product id at the shops (or one shop when `only` is set). */
export function cheapest(offers: Readonly<Record<string, readonly RegionOffer[]>>, id: string, only?: string): number | null {
  let best: number | null = null;
  for (const o of offers[id] ?? []) {
    if (o.inStock === false || (only !== undefined && o.retailerId !== only)) continue;
    if (best === null || o.price < best) best = o.price;
  }
  return best;
}

export function brandMain(region: RegionConfig, brand: string, products: readonly RegionProduct[], offers: Readonly<Record<string, readonly RegionOffer[]>>): string {
  const shown = products.slice(0, LIST_CAP);
  return `${SECTION_OPEN}
${crumbs(region, 'Brands', '/brands')}
<h1 class="t-page" id="static-intro-title">${esc(brand)}</h1>
<p class="t-body">${products.length.toLocaleString(region.locale)} ${esc(brand)} ${products.length === 1 ? 'fragrance is' : 'fragrances are'} stocked by the ${region.shopsAdjective} shops we track, with the cheapest price at any of them.</p>
<h2 class="t-section">${esc(brand)} Fragrances</h2>
<ul class="static-links">${shown.map((p) => listItem(p, cheapest(offers, p.id), '')).join('')}</ul>
${products.length > shown.length ? `<p class="t-body">And ${(products.length - shown.length).toLocaleString(region.locale)} more: the full list opens with JavaScript on.</p>` : ''}
${moreLinks(region)}
</section>`;
}

export function shopMain(
  region: RegionConfig, shop: RegionShop, products: readonly RegionProduct[], offers: Readonly<Record<string, readonly RegionOffer[]>>,
): string {
  const shown = products.slice(0, LIST_CAP);
  return `${SECTION_OPEN}
${crumbs(region, 'Shops', '/retailers')}
<h1 class="t-page" id="static-intro-title">${esc(shop.name)}</h1>
<p class="t-body">${products.length.toLocaleString(region.locale)} fragrances listed at ${esc(shop.name)} (<a href="${esc(shop.homepage)}" rel="nofollow noopener" target="_blank">${esc(shop.domain)}</a>), each shown next to every other ${region.shopsAdjective} shop we track.</p>
<h2 class="t-section">Fragrances at ${esc(shop.name)}</h2>
<ul class="static-links">${shown.map((p) => listItem(p, cheapest(offers, p.id, shop.id), ' before delivery')).join('')}</ul>
${products.length > shown.length ? `<p class="t-body">And ${(products.length - shown.length).toLocaleString(region.locale)} more: the full list opens with JavaScript on.</p>` : ''}
${moreLinks(region)}
</section>`;
}

/** Head tags of an address inside the region, or null when its canonical would not be that address. Call with the build's active region set. */
function tagsFor(region: RegionConfig, path: string, input: { leafName: string; leafDetail?: string; leafEmpty?: boolean }): HeadTags | null {
  const tags = headFor({ route: matchRoute(path), ...input });
  return tags.canonical === `${SITE_URL}${regionPath(region, path)}` && !tags.noindex ? tags : null;
}

/**
 * Every brand and shop page the region could have, shops first and then brands
 * by how many bottles they hold (the order they are cut at when the budget is
 * short). The caller has set the active region for the build.
 */
export function regionLeaves(
  region: RegionConfig,
  catalogue: readonly RegionProduct[],
  offers: Readonly<Record<string, readonly RegionOffer[]>>,
  shops: readonly RegionShop[],
): RegionLeaf[] {
  const folder = `${region.pathPrefix}/`;
  const out: RegionLeaf[] = [];
  const byId = new Map(catalogue.map((p) => [p.id, p] as const));
  const stocked = new Map<string, Set<string>>();
  for (const [id, list] of Object.entries(offers)) {
    for (const o of list) {
      if (!byId.has(id)) continue;
      const set = stocked.get(o.retailerId) ?? new Set<string>();
      set.add(id);
      stocked.set(o.retailerId, set);
    }
  }
  const byPopularity = (a: RegionProduct, b: RegionProduct): number => (b.shops ?? 0) - (a.shops ?? 0) || (a.slug < b.slug ? -1 : 1);

  for (const shop of shops) {
    const ids = stocked.get(shop.id);
    if (!shop.enabled || !ids || ids.size === 0 || !SAFE_SEGMENT.test(shop.id)) continue;
    const path = `/retailers/${shop.id}`;
    const tags = tagsFor(region, path, { leafName: shop.name, leafDetail: `${ids.size.toLocaleString('en-GB')} bottles`, leafEmpty: false });
    if (!tags) continue;
    const products = [...ids].map((id) => byId.get(id)!).sort(byPopularity);
    out.push({ kind: 'shop', path: regionPath(region, path), file: `${folder}retailers/${shop.id}.html`, tags, main: shopMain(region, shop, products, offers) });
  }

  const brands = new Map<string, { name: string; products: RegionProduct[] }>();
  for (const p of catalogue) {
    const slug = slugify(p.brand);
    if (!slug) continue;
    const b = brands.get(slug) ?? { name: p.brand, products: [] };
    b.products.push(p);
    brands.set(slug, b);
  }
  for (const [slug, b] of [...brands].sort((x, y) => y[1].products.length - x[1].products.length || (x[0] < y[0] ? -1 : 1))) {
    if (!SAFE_SEGMENT.test(slug)) continue;
    const path = `/brands/${encodeURIComponent(slug)}`;
    const tags = tagsFor(region, path, { leafName: b.name, leafDetail: `${b.products.length} in the catalogue` });
    if (!tags) continue;
    out.push({ kind: 'brand', path: regionPath(region, path), file: `${folder}brands/${slug}.html`, tags, main: brandMain(region, b.name, b.products.sort(byPopularity), offers) });
  }
  return out;
}
