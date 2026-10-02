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

/** Web addresses keep their own hyphens (product ids); everything else may not. */
const noUrls = (s: string) => s.replace(/https?:\/\/\S+/g, '').replace(/pricesniffs\.space\/\S+/g, '');

/** The words a viewer reads in an HTML post: text between tags, outside <style>/<script>/<svg>. */
function htmlWords(html: string): string[] {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .split(/<[^>]+>/)
    .map((t) => t.trim())
    .filter(Boolean);
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
      expect(inside.some((n) => n.endsWith('.svg') || n.endsWith('.html')), `${f} has no .svg or .html`).toBe(true);
    }
  });

  for (const file of all.filter((p) => p.endsWith('caption.txt'))) {
    it(`${file.slice(POSTS.length)} has no hyphens or dashes`, () => {
      const lines = readFileSync(file, 'utf8').split('\n').filter((l) => DASHES.test(noUrls(l)));
      expect(lines).toEqual([]);
    });
    // The owner's rule (2026-10-02): at most 5 hashtags on any caption.
    it(`${file.slice(POSTS.length)} has at most 5 hashtags`, () => {
      const tags = noUrls(readFileSync(file, 'utf8')).match(/#[\p{L}\p{N}_]+/gu) ?? [];
      expect(tags.length, tags.join(' ')).toBeLessThanOrEqual(5);
    });
  }

  for (const file of all.filter((p) => p.endsWith('.html'))) {
    it(`${file.slice(POSTS.length)} visible text has no hyphens or dashes`, () => {
      expect(htmlWords(readFileSync(file, 'utf8')).filter((t) => DASHES.test(noUrls(t)))).toEqual([]);
    });
  }

  for (const file of all.filter((p) => p.endsWith('.svg'))) {
    it(`${file.slice(POSTS.length)} image text has no hyphens or dashes`, () => {
      expect(svgWords(readFileSync(file, 'utf8')).filter((t) => DASHES.test(t))).toEqual([]);
    });
  }
});
