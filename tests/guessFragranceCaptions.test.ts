import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPTION_LIMIT, FIXED_COPY, PUZZLE_CAPTION, revealCaption, type RevealFacts } from '../scripts/social-guess-captions.js';
import { hiddenAnswerWords } from '../scripts/social-guess-mask.js';

// docs/GUESS-THE-FRAGRANCE-PLAN.md 3.3 and 3.4. Every folder named
// *-guess-fragrance-* under social/posts is held to the caption rules, found by
// name (a puzzle folder is committed only when posting, so there may be none).
const POSTS = new URL('../social/posts/', import.meta.url).pathname;
const DASHES = /[-‐-―−]/;
const noUrls = (s: string) => s.replace(/https?:\/\/\S+/g, '').replace(/pricesniffs\.space\/\S+/g, '');
const folders = readdirSync(POSTS).filter((n) => /-guess-fragrance-/.test(n) && statSync(join(POSTS, n)).isDirectory());
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const wholeWord = (text: string, word: string) => ` ${norm(text)} `.includes(` ${word} `);

/** The words a viewer reads in an HTML post plus every attribute value (so an alt or aria label cannot leak either). */
function htmlText(html: string): string {
  const attrs = [...html.matchAll(/\s(?:alt|title|aria-label|content)="([^"]*)"/g)].map((m) => m[1]!);
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').split(/<[^>]+>/).join(' ');
  return `${text} ${attrs.join(' ')}`;
}

const BAD = /\bbio\b|\b(tiktok|instagram|facebook|threads|pinterest|youtube|twitter)\b|answer tomorrow|answer in 24/i;

describe('the fixed puzzle caption', () => {
  it('is the owner approved text, at most 280 characters, 4 tags, the address and no dashes', () => {
    expect(PUZZLE_CAPTION).toBe(
      'Guess the Fragrance! Can you name this perfume? The house and the name are hidden, so the notes and the strength are your clues. Drop your guess in the comments. pricesniffs.space #guessthefragrance #perfume #fragrance #pricesniffs',
    );
    expect(PUZZLE_CAPTION.length).toBeLessThanOrEqual(CAPTION_LIMIT);
    expect(PUZZLE_CAPTION).toContain('pricesniffs.space');
    expect(DASHES.test(PUZZLE_CAPTION)).toBe(false);
    expect(PUZZLE_CAPTION.match(/#\w+/g)).toHaveLength(4);
    expect(PUZZLE_CAPTION).not.toMatch(BAD);
  });
  it('is covered by the fixed copy a hidden answer word may not appear in', () => {
    for (const w of norm(PUZZLE_CAPTION.replace(/#\w+/g, '')).split(' ')) expect(norm(FIXED_COPY).split(' '), w).toContain(w);
  });
});

describe('the reveal caption ladder', () => {
  const facts: RevealFacts = { brand: 'Creed', name: 'Aventus', concentration: 'Eau de Parfum', size: '100ml', delivered: 259, shop: 'Perfumoi', checkedDate: '9 Oct 2026', slug: 'creed_aventus_100ml' };
  it('carries the answer, price, shop, checked date, the two notices and the product address', () => {
    const c = revealCaption(facts);
    for (const piece of ['Creed Aventus Eau de Parfum 100ml', '£259.00', 'Perfumoi', '9 Oct 2026', 'Prices change, so check before you buy.', 'Affiliate links.', 'pricesniffs.space/creed_aventus_100ml']) expect(c).toContain(piece);
    expect(c.length).toBeLessThan(CAPTION_LIMIT);
    expect(DASHES.test(noUrls(c))).toBe(false);
    expect(c).not.toMatch(BAD);
  });
  it('shortens in order: drops the question, then the product address, then refuses', () => {
    const long = { ...facts, brand: 'Maison Francis Kurkdjian', name: 'Baccarat Rouge 540 Extrait', slug: 'maison_francis_kurkdjian_baccarat_rouge_540_extrait_70ml' };
    const c = revealCaption(long);
    expect(c.length).toBeLessThan(CAPTION_LIMIT);
    const huge = { ...facts, name: 'A'.repeat(120) };
    expect(() => revealCaption(huge)).toThrow(/--name/);
  });
  it('never shows a hyphen in a name', () => {
    expect(noUrls(revealCaption({ ...facts, name: 'Never-ending Summer' }))).toContain('Never ending Summer');
  });
});

describe('guess fragrance folders under social/posts', () => {
  it('finds folders by name only (none may exist: they are committed only when posting)', () => {
    for (const f of folders) expect(f).toMatch(/^\d{4}-\d{2}-\d{2}-guess-fragrance-\d{2}(-reveal)?$/);
  });
  for (const f of folders) {
    const dir = join(POSTS, f);
    const reveal = f.endsWith('-reveal');
    const check = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8'));
    const caption = readFileSync(join(dir, 'caption.txt'), 'utf8').trim();
    describe(f, () => {
      it('has exactly one caption file, at most 280 characters, 5 tags at most, the address, no dashes, bio or platform names', () => {
        expect(readdirSync(dir).filter((n) => /caption/i.test(n))).toEqual(['caption.txt']);
        expect(caption.length).toBeLessThanOrEqual(CAPTION_LIMIT);
        expect(caption.match(/#[\p{L}\p{N}_]+/gu)!.length).toBeLessThanOrEqual(5);
        expect(caption).toContain('pricesniffs.space');
        expect(DASHES.test(noUrls(caption))).toBe(false);
        expect(caption).not.toMatch(BAD);
      });
      if (!reveal) {
        it('is the fixed puzzle caption', () => expect(caption).toBe(PUZZLE_CAPTION));
        it('lets no word of the answer into the caption, alt text or HTML', () => {
          const words = hiddenAnswerWords(check.answer.brand, check.answer.catalogueName);
          expect(words.length).toBeGreaterThan(0);
          const alt = readFileSync(join(dir, 'alt.txt'), 'utf8');
          const pages = readdirSync(dir).filter((n) => n.endsWith('.html')).map((n) => htmlText(readFileSync(join(dir, n), 'utf8')));
          expect(pages.length).toBeGreaterThan(0);
          for (const w of words) for (const [what, text] of [['caption', caption], ['alt text', alt], ...pages.map((p) => ['html', p] as const)]) expect(wholeWord(text, w), `${what} contains "${w}"`).toBe(false);
        });
        it('writes no picture text with a dash or "answer tomorrow"', () => {
          for (const n of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
            const t = htmlText(readFileSync(join(dir, n), 'utf8'));
            expect(DASHES.test(noUrls(t)), n).toBe(false);
            expect(t, n).not.toMatch(/answer tomorrow|answer in 24/i);
          }
        });
      } else {
        it('carries the price, shop, notices and address from check.json', () => {
          if (check.priceShown) {
            expect(caption).toContain(`£${check.delivered.toFixed(2)}`);
            expect(caption).toContain(check.shop);
          }
          expect(caption).toMatch(/prices change|See today's price/i);
          if (check.priceShown) expect(caption).toContain('Affiliate links');
          // The product address, or the bare site address when the ladder had to shorten it.
          expect(caption.includes(new URL(check.url).pathname.slice(1)) || caption.includes('pricesniffs.space')).toBe(true);
        });
      }
      it('lists its pictures in pictures.json', () => {
        expect(existsSync(join(dir, 'pictures.json'))).toBe(true);
      });
    });
  }
});
