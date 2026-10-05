import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RETAILERS } from '../src/config/retailers.js';

/**
 * Shop level kill switch for product photos (docs/DECISIONS.md D24).
 *
 * On 2026-10-05 the owner decided that every shop that supplies a product
 * photo has it shown by linking to the shop's own image, the basis the first
 * shops already ran on (`hotlink-unlicensed`). That is a decision, not a
 * default: some shops' terms reserve their photographs, and a shop that asks
 * us to stop is honoured by deleting its `imageBasis` line, which hides its
 * photos on the next build.
 *
 * So a shop must never gain the basis by accident. These tests read the
 * registry source and require the decision to be written down, in a comment
 * directly above the line, for every shop that carries an unlicensed hot-link.
 * A new shop that copies the field without the decision fails here.
 */
const DECISION_LINE =
  "// Owner decision 2026-10-05: photos shown by linking to the shop's own image, as for the first four shops.";

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/config/retailers.ts'), 'utf8').split('\n');

/** The comment block directly above the `imageBasis:` line of one registry entry, or null if it has none. */
function commentAboveBasis(retailerId: string): string[] | null {
  const start = source.findIndex((l) => l === `    id: '${retailerId}',`);
  if (start < 0) return null;
  for (let i = start + 1; i < source.length; i++) {
    if (/^    id: '/.test(source[i]!)) return null;
    if (/^\s+imageBasis:/.test(source[i]!)) {
      const comment: string[] = [];
      for (let j = i - 1; j > start && /^\s*\/\//.test(source[j]!); j--) comment.unshift(source[j]!.trim());
      return comment;
    }
  }
  return null;
}

const HOTLINKED = RETAILERS.filter((r) => r.affiliate.imageBasis === 'hotlink-unlicensed');

describe('the owner decision of 2026-10-05 on product photos is recorded for every shop it covers', () => {
  it('covers at least the shops it was taken for, so the loop below is not empty', () => {
    expect(HOTLINKED.filter((r) => r.enabled).length).toBeGreaterThan(30);
  });

  it.each(HOTLINKED.map((r) => [r.id] as const))('%s carries the owner decision comment above its imageBasis', (id) => {
    const comment = commentAboveBasis(id);
    expect(comment, `${id} has no imageBasis line in src/config/retailers.ts`).not.toBeNull();
    expect(
      comment!,
      `${id} has imageBasis 'hotlink-unlicensed' with no owner decision comment directly above it. ` +
        'Photos are shown only on the owner decision of 2026-10-05 (docs/DECISIONS.md D24). ' +
        'Do not switch a shop on without that decision; add the line only if the owner has said so.',
    ).toContain(DECISION_LINE);
  });

  it('only the three known bases exist, so a new one cannot slip in without a decision', () => {
    const bases = new Set(RETAILERS.map((r) => r.affiliate.imageBasis).filter((b) => b != null));
    expect([...bases].sort()).toEqual(['affiliate-terms', 'hotlink-unlicensed']);
  });
});

describe('the kill switch: removing a shop imageBasis is all it takes to hide its photos', () => {
  it('the build admits a shop only through imageBasis (IMAGE_ALLOWED), with no second list', () => {
    const build = readFileSync(resolve(root, 'scripts/build-demo-catalogue.ts'), 'utf8');
    expect(build).toContain('RETAILERS.filter((r) => r.affiliate.imageBasis != null).map((r) => r.id)');
    expect(build).toContain('IMAGE_ALLOWED.has(offer.retailerId)');
  });

  it('D24 records the decision, the limits, the stated risk and the one line switch', () => {
    const decisions = readFileSync(resolve(root, 'docs/DECISIONS.md'), 'utf8');
    const start = decisions.indexOf('## D24');
    expect(start).toBeGreaterThan(-1);
    const next = decisions.indexOf('\n## D', start + 5);
    const d24 = decisions.slice(start, next < 0 ? undefined : next);
    expect(d24).toContain('2026-10-05');
    expect(d24).toMatch(/no copying/i);
    expect(d24).toMatch(/Nicchia/);
    expect(d24).toMatch(/Beauty Store UK/);
    expect(d24).toMatch(/delete the shop's `imageBasis` line/);
  });
});
