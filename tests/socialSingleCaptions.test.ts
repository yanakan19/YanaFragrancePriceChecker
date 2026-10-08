import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner request, 8 October 2026: the four videos made that day each have ONE
// caption (caption.txt) that works unchanged on every platform: a body under
// 300 characters (Instagram, Facebook, Threads, TikTok, Pinterest and YouTube take
// it; a free X account stops at 280 including the tags, so X needs a trim), 3 to 6 hashtags, the address written out as
// pricesniffs.space, no "link in bio" and no hyphens or dashes.
const POSTS = new URL('../social/posts/', import.meta.url).pathname;
const FOLDERS = [
  '2026-10-08-deal-video-escentric-molecules-molecule-05-100ml',
  '2026-10-08-deal-video-french-avenue-nectare-extradose-100ml',
  '2026-10-08-explainer-video-perfume-strengths',
  '2026-10-08-explainer-video-perfume-notes',
];
const DASHES = /[-‐-―−]/;
const noUrls = (s: string) => s.replace(/https?:\/\/\S+/g, '').replace(/pricesniffs\.space\/\S+/g, '');

for (const f of FOLDERS) {
  describe(f, () => {
    const text = readFileSync(join(POSTS, f, 'caption.txt'), 'utf8').trim();
    const body = text.split(/\s#/)[0]!;
    const tags = text.match(/#[\p{L}\p{N}_]+/gu) ?? [];

    it('has exactly one caption file', () => {
      expect(readdirSync(join(POSTS, f)).filter((n) => /caption/i.test(n))).toEqual(['caption.txt']);
    });
    it('has a body under 300 characters and 3 to 6 hashtags', () => {
      expect(body.length).toBeLessThan(300);
      expect(text.length).toBeLessThanOrEqual(350);
      expect(tags.length).toBeGreaterThanOrEqual(3);
      expect(tags.length).toBeLessThanOrEqual(6);
    });
    it('names pricesniffs.space, with no link in bio, no dashes and no platform names', () => {
      expect(body).toContain('pricesniffs.space');
      expect(DASHES.test(noUrls(text))).toBe(false);
      expect(text).not.toMatch(/\bbio\b|\b(tiktok|instagram|facebook|threads|pinterest|youtube|twitter)\b/i);
    });
  });
}

describe("the deal captions carry the deal's own figures from check.json", () => {
  for (const f of FOLDERS.slice(0, 2)) {
    it(f, () => {
      const check = JSON.parse(readFileSync(join(POSTS, f, 'check.json'), 'utf8'));
      const text = readFileSync(join(POSTS, f, 'caption.txt'), 'utf8');
      const gbp = (n: number) => `£${n.toFixed(2)}`;
      for (const piece of [gbp(check.delivered), gbp(check.msrp), `${check.percent}%`, check.shop, check.name, check.brand]) expect(text).toContain(piece);
      expect(text).toMatch(/prices change/i);
      expect(text).toContain('Affiliate links');
    });
  }
});
