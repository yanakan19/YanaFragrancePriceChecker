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
/**
 * The account photo is the owner's own upload, not a hot-linked shop photo, but
 * it can still fail to show (a damaged file, a blob address that has gone). It
 * falls back through one delegated listener rather than an inline onerror,
 * because the fallback is a change of state (state.photoBroken, then a
 * re-render that draws the initial instead), not an edit of the one tag. An
 * image's error event does not bubble, so the listener has to be a capturing
 * one on the document.
 */
const ACCOUNT_PHOTO_FALLBACK =
  /document\.addEventListener\('error',\s*\(e\) => \{[^}]*hasAttribute\('data-acct-photo'\)[^}]*state\.photoBroken = true;\s*renderInPlace\(\);\s*\}\s*\}, true\);/;

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
    const accountSrc = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    for (const file of readdirSync(resolve(root, 'demo'))) {
      if (!file.endsWith('.ts') || file.endsWith('.generated.ts')) continue;
      const src = readFileSync(resolve(root, 'demo', file), 'utf8');
      // Each `<img` up to its closing `/>` — the tags here are template
      // literals spanning several lines, so this is deliberately greedy over
      // newlines and lazy up to the first close.
      for (const tag of src.match(/<img[\s\S]*?\/>/g) ?? []) {
        examined++;
        // The account photo (data-acct-photo) is the one image whose fallback
        // is not inline: a delegated, capturing error listener in app.ts
        // swaps it for the initial. That exemption is only honoured while the
        // listener is really there, which the next test pins.
        if (tag.includes('data-acct-photo') && ACCOUNT_PHOTO_FALLBACK.test(accountSrc)) continue;
        if (!tag.includes('onerror=')) offenders.push(`${file}: ${(tag.split('\n')[0] ?? tag).trim()}`);
      }
    }
    // Or the sweep above found nothing and proved nothing. Two today:
    // demo/photo.ts's productArt and demo/app.ts's houseCard.
    expect(examined).toBeGreaterThanOrEqual(2);
    expect(offenders).toEqual([]);
  });

  it('replaces a failed account photo with the initial, and stops offering the failed photo', () => {
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    // The capturing listener that the sweep above relies on.
    expect(app).toMatch(ACCOUNT_PHOTO_FALLBACK);
    // A broken photo is no longer the one shown: the account button and the
    // profile both ask shownPhotoUrl, which returns null once photoBroken is
    // set, and each then draws the initial (or the person icon) instead.
    const shown = (app.match(/function shownPhotoUrl\([\s\S]*?\n}/) ?? [])[0];
    expect(shown).toBeDefined();
    expect(shown).toContain('!state.photoBroken');
    const profile = (app.match(/function profilePhotoHtml\([\s\S]*?\n}/) ?? [])[0];
    expect(profile).toContain('shownPhotoUrl()');
    expect(profile).toContain('profile-photo-letter');
    const button = (app.match(/function syncAccountButton\([\s\S]*?\n}/) ?? [])[0];
    expect(button).toContain('shownPhotoUrl()');
    expect(button).toContain('acct-letter');
  });

  it('gives orgMark\'s logo <img> the same onerror fallback, reverting to the monogram', () => {
    /* orgMark is not exported (demo/app.ts runs init() at import time), so
       this reads the source the same way the houseCard assertion below does.
       docs/LOGOS-PLAN.md §4d: remove the image, mark the container, let CSS
       draw the monogram from the data already sitting on it. */
    const app = readFileSync(resolve(root, 'demo/app.ts'), 'utf8');
    const fn = (app.match(/function orgMark\([\s\S]*?\n}/) ?? [])[0];
    expect(fn).toBeDefined();
    expect(fn).toContain('<img');
    expect(fn).toContain('onerror=');
    expect(fn).toContain("classList.add('org-mark-failed')");
    expect(fn).toContain('this.remove()');
    // The fallback data has to already be on the container before the image
    // can fail — data-fallback (initials) and --mh (hue), the same two
    // things monogram() itself draws from.
    expect(fn).toContain('data-fallback=');
    expect(fn).toContain('--mh:');
  });

  it('draws the failed org-mark with the same monogram tokens, not a blank box', () => {
    const template = readFileSync(resolve(root, 'demo/template.html'), 'utf8');
    expect(template).toMatch(/\.org-mark\.org-mark-failed\s*\{/);
    expect(template).toMatch(/\.org-mark\.org-mark-failed::after\s*\{/);
    expect(template).toContain('content: attr(data-fallback)');
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
