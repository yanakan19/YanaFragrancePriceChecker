import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// social/DESIGN-SYSTEM.md section 5: post copy (image text and caption) never
// uses a hyphen or any kind of dash.
const POSTS = new URL('../social/posts/', import.meta.url).pathname;
const DASHES = /[-‐-―−]/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

/** The words a viewer reads in an SVG: the contents of its <text> elements. */
function svgWords(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''));
}

const all = files(POSTS);

describe('social posts', () => {
  it('every post folder has a caption and an image source', () => {
    const folders = readdirSync(POSTS).filter((n) => statSync(join(POSTS, n)).isDirectory());
    expect(folders.length).toBeGreaterThan(0);
    for (const f of folders) {
      expect(f, `${f} is not named YYYY-MM-DD-name`).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
      const inside = readdirSync(join(POSTS, f));
      expect(inside, `${f} has no caption.txt`).toContain('caption.txt');
      expect(inside.some((n) => n.endsWith('.svg')), `${f} has no .svg`).toBe(true);
    }
  });

  for (const file of all.filter((p) => p.endsWith('caption.txt'))) {
    it(`${file.slice(POSTS.length)} has no hyphens or dashes`, () => {
      const lines = readFileSync(file, 'utf8').split('\n').filter((l) => DASHES.test(l));
      expect(lines).toEqual([]);
    });
  }

  for (const file of all.filter((p) => p.endsWith('.svg'))) {
    it(`${file.slice(POSTS.length)} image text has no hyphens or dashes`, () => {
      expect(svgWords(readFileSync(file, 'utf8')).filter((t) => DASHES.test(t))).toEqual([]);
    });
  }
});
