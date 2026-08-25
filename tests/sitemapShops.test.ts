import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CRAWLED } from '../demo/catalogue.generated.js';
import { enabledRetailers } from '../src/config/retailers.js';

/**
 * The sitemap must not advertise a shop page with nothing on it.
 *
 * scripts/build-sitemap.ts always carried the reasoning — "asking a crawler to
 * index an empty page wastes its visit and ours" — but tested `enabled`, which
 * is intent rather than outcome. On 2026-08-25, 8 of the 39 enabled shops had
 * no live offer and every one of them was listed: a fifth of the shop pages
 * this site pointed a crawler at were blank.
 *
 * This reads the built sitemap rather than re-deriving the rule, so it fails if
 * the file on disk drifts from the catalogue for any reason — a regression in
 * the builder, or a stale sitemap committed after a catalogue change.
 */

const SITEMAP = resolve(__dirname, '../demo/sitemap.xml');

function listedShopIds(xml: string): Set<string> {
  const ids = new Set<string>();
  for (const m of xml.matchAll(/<loc>[^<]*\/retailers\/([a-z0-9-]+)<\/loc>/g)) {
    ids.add(decodeURIComponent(m[1]!));
  }
  return ids;
}

function shopsWithListings(): Set<string> {
  const ids = new Set<string>();
  for (const offers of Object.values(CRAWLED)) {
    for (const o of offers) ids.add(o.retailerId);
  }
  return ids;
}

describe('sitemap: shop pages', () => {
  it('has a sitemap to check', () => {
    expect(existsSync(SITEMAP)).toBe(true);
  });

  it('lists no shop that carries zero live offers', () => {
    const listed = listedShopIds(readFileSync(SITEMAP, 'utf8'));
    const withListings = shopsWithListings();

    const empty = [...listed].filter((id) => !withListings.has(id));
    expect(empty).toEqual([]);
  });

  it('lists every enabled shop that does carry offers', () => {
    const listed = listedShopIds(readFileSync(SITEMAP, 'utf8'));
    const withListings = shopsWithListings();

    // The other direction: dropping empty shops must not drop live ones with
    // them. A shop earns its page by having something on it and being enabled.
    const missing = enabledRetailers()
      .filter((r) => withListings.has(r.id))
      .map((r) => r.id)
      .filter((id) => !listed.has(id));

    expect(missing).toEqual([]);
  });

  it('never lists a disabled shop, however many offers it still holds', () => {
    const listed = listedShopIds(readFileSync(SITEMAP, 'utf8'));
    const enabled = new Set(enabledRetailers().map((r) => r.id));

    // A shop switched off mid-month keeps its harvested offers in the
    // catalogue for a while. Being switched off is a decision that the site
    // should stop pointing at it, and it outranks having data.
    expect([...listed].filter((id) => !enabled.has(id))).toEqual([]);
  });
});
