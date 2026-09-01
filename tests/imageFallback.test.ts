import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productArt } from '../demo/photo.js';
import { RETAILERS } from '../src/config/retailers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every product photo on this site is hot-linked from someone else's server —
 * nothing is downloaded or rehosted (demo/photo.ts's own header). For ~1,500
 * products that server is Beauty Base's, on `imageBasis: 'hotlink-unlicensed'`
 * (src/config/retailers.ts), which is explicitly not a licence: the registry
 * entry's own comment says to unset it the moment they object or block
 * hot-linking.
 *
 * The reliance is a deliberate choice and not what these tests are about. What
 * they are about is the failure mode. A shop that blocks hot-linking does not
 * warn anyone first — 403s simply start arriving — and the difference between
 * that being invisible and it being a defaced site is entirely whether every
 * `<img>` the page emits degrades to the placeholder instead of a browser's
 * broken-image glyph.
 *
 * Checked 2026-09-01: demo/photo.ts's productArt had carried that fallback
 * since photography went hot-linked, and the house-product grid in
 * demo/app.ts (houseCard) had not — the one surface still without it. The
 * invariant is pinned here rather than the one call site, so the next image
 * surface added has to carry it too.
 */
describe('a hot-linked image that fails degrades to the placeholder', () => {
  it('is a real reliance: Beauty Base photos are shown on an explicit non-licence', () => {
    const beautybase = RETAILERS.find((r) => r.id === 'beautybase');
    expect(beautybase?.affiliate.imageBasis).toBe('hotlink-unlicensed');
  });

  it('is covered by the link checker, which sweeps every retailer whose photos are shown', () => {
    /* scripts/image-link-check.ts scopes its sweep to retailers with an
       imageBasis set, so the assertion above is also what puts Beauty Base in
       the checker's scope. Pinned together because unsetting imageBasis is
       what the registry comment says to do if Beauty Base objects, and that
       single change has to take the photos off the site and the URLs out of
       the sweep at the same time. */
    const script = readFileSync(resolve(root, 'scripts/image-link-check.ts'), 'utf8');
    expect(script).toContain('RETAILERS.filter((r) => r.affiliate.imageBasis != null)');
  });

  it('marks the container and removes the img, so CSS can draw the empty box', () => {
    const html = productArt('https://example.test/bottle.jpg', 'md', 'Some Brand Some Name');
    expect(html).toContain('onerror=');
    expect(html).toContain("classList.add('art-failed')");
    expect(html).toContain('this.remove()');
  });

  it('draws that failed box deliberately rather than leaving a hole', () => {
    /* The class the onerror above sets has to be styled, or "degrades
       gracefully" is only true in the source. */
    const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
    expect(template).toMatch(/\.art\.art-failed\s*\{/);
  });

  it('leaves no image tag on any surface without a fallback', () => {
    /* Source-level, over every module that renders markup: a new <img>
       anywhere on the site has to bring its own onerror. Reading the sources
       rather than the built bundle so the failure names the file to fix. */
    const offenders: string[] = [];
    let examined = 0;
    for (const file of readdirSync(resolve(root, 'demo'))) {
      if (!file.endsWith('.ts') || file.endsWith('.generated.ts')) continue;
      const src = readFileSync(resolve(root, 'demo', file), 'utf8');
      // Each `<img` up to its closing `/>` — the tags here are template
      // literals spanning several lines, so this is deliberately greedy over
      // newlines and lazy up to the first close.
      for (const tag of src.match(/<img[\s\S]*?\/>/g) ?? []) {
        examined++;
        if (!tag.includes('onerror=')) offenders.push(`${file}: ${(tag.split('\n')[0] ?? tag).trim()}`);
      }
    }
    // Or the sweep above found nothing and proved nothing. Two today:
    // demo/photo.ts's productArt and demo/app.ts's houseCard.
    expect(examined).toBeGreaterThanOrEqual(2);
    expect(offenders).toEqual([]);
  });

  it('replaces a failed house photo with exactly the no-photo placeholder', () => {
    /* houseCard is not exported — demo/app.ts runs init() at import time — so
       this reads the source. What matters is that the fallback produces the
       same two classes the no-image branch renders, not something that merely
       looks similar. */
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    const tag = (app.match(/<img class="house-img"[\s\S]*?\/>/) ?? [])[0];
    expect(tag).toBeDefined();
    expect(tag).toContain('onerror=');
    expect(tag).toContain("s.className='house-img house-img-none'");
    expect(tag).toContain('this.replaceWith(s)');
    expect(app).toContain('<span class="house-img house-img-none" aria-hidden="true"></span>');
  });
});
