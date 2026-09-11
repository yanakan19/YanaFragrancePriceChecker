import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productArt } from '../demo/photo.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * productArt's fourth argument — docs/IMAGE-SCALE-PLAN.md's per-photo CSS
 * transform, computed at build time and carried on CatalogueEntry.imageTransform
 * (see scripts/build-demo-catalogue.ts and src/catalogue/bottleScale.ts).
 *
 * These tests pin the one property the whole plan's safety case rests on: a
 * photo with no transform renders EXACTLY as it did before this feature
 * existed — no `style` attribute at all, not an empty one — and a photo with
 * one gets it applied to the `<img>` itself, never to the `.art` container
 * that already clips and colours the tile.
 */
describe('productArt with an image transform', () => {
  it('omits the style attribute entirely when no transform is given', () => {
    const html = productArt('https://example.test/bottle.jpg', 'md', 'Some Brand Some Name');
    expect(html).not.toContain('style=');
  });

  it('omits the style attribute when the transform is explicitly null', () => {
    // What demo/data.ts actually passes for the overwhelming majority of
    // products (see DemoFragrance.imageTransform's own doc): boxed, unsure,
    // unswept, or a bottle-only photo with no persisted box yet.
    const html = productArt('https://example.test/bottle.jpg', 'md', 'Some Brand Some Name', null);
    expect(html).not.toContain('style=');
  });

  it('never emits a style attribute on the no-photo placeholder, transform or not', () => {
    const html = productArt(null, 'md', 'Some Brand Some Name', 'translate(0%,0%) scale(1.6);transform-origin:50% 50%');
    expect(html).not.toContain('style=');
    expect(html).toContain('art-empty');
  });

  it('applies a given transform as an inline style on the <img>, not the container', () => {
    const transform = 'translate(-0.2%,0.3%) scale(1.115);transform-origin:50.2% 49.8%';
    const html = productArt('https://example.test/bottle.jpg', 'md', 'Some Brand Some Name', transform);
    const img = (html.match(/<img[\s\S]*?\/>/) ?? [])[0];
    expect(img).toBeDefined();
    expect(img).toContain(`style="${transform}"`);
    // The span (.art container) itself carries no style attribute of its own.
    const spanOpenTag = (html.match(/<span class="art[^>]*>/) ?? [])[0];
    expect(spanOpenTag).toBeDefined();
    expect(spanOpenTag).not.toContain('style=');
  });

  it('escapes the transform string like every other attribute here', () => {
    // Not a realistic transform value, but proves the same escapeAttr() path
    // productArt already runs `src`/`alt` through is also applied to `style`.
    const html = productArt('https://example.test/bottle.jpg', 'md', 'x', 'scale(1) /* " */');
    expect(html).toContain('&quot;');
    expect(html).not.toContain('scale(1) /* " */');
  });

  it('still carries its onerror fallback when a transform is present', () => {
    // Guards against the transform branch accidentally replacing rather than
    // extending the <img> tag imageFallback.test.ts already pins.
    const html = productArt('https://example.test/bottle.jpg', 'md', 'x', 'scale(1.2)');
    expect(html).toContain('onerror=');
    expect(html).toContain("classList.add('art-failed')");
  });

  it('the .art tile still clips whatever the transform draws outside it', () => {
    const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
    expect(template).toMatch(/\.art\s*\{[^}]*overflow:\s*hidden/);
  });
});
