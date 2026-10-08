// A social post's pictures and videos are not committed (docs/DECISIONS.md
// D28, from 2026-10-08). Each post folder commits pictures.json instead, which
// lists its pictures, what each is drawn from and the facts of the file as
// first made; `npm run social:render` draws them again from the committed text
// (scripts/render-social.ts, scripts/socialPictures.ts). These tests hold every
// folder to a record the renderer can follow, and the videos' recorded lengths
// to the template's rules (the committed files those rules used to read are gone).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { policyOf, REPO_ROOT } from '../scripts/generatedFiles.js';
import {
  PICTURE_EXTENSIONS,
  assertPicturePath,
  inlinePhotos,
  isPicture,
  mp4Seconds,
  pngSize,
  readPictures,
  sourceOf,
  type Picture,
} from '../scripts/socialPictures.js';
import { EXPLAINER_VIDEOS } from '../scripts/social-video-explainers.js';
import { VIDEO_TEMPLATE as T, dealScenes, dealVideoFromRecord, type DealVideoRecord } from '../scripts/social-video-template.js';

const SOCIAL = join(REPO_ROOT, 'social');
const POSTS = join(SOCIAL, 'posts');
const folders = [
  ...readdirSync(POSTS).map((n) => join(POSTS, n)).filter((p) => statSync(p).isDirectory()),
  join(SOCIAL, 'highlights'),
];
const name = (dir: string) => dir.slice(SOCIAL.length + 1);
const MAKES = ['svg', 'html', 'deal-video', 'explainer-video', 'history'];

describe('pictures.json in every post folder', () => {
  for (const dir of folders) {
    it(`${name(dir)} lists its pictures and what each is drawn from`, () => {
      const record = readPictures(dir);
      expect(record, `${name(dir)} has no pictures.json: run the post's script again, or npm run social:render -- social/${name(dir)}`).not.toBeNull();
      expect(record!.about).toContain(`npm run social:render -- social/${name(dir)}`);
      expect(record!.pictures.length).toBeGreaterThan(0);
      const inside = new Set(readdirSync(dir));
      for (const p of record!.pictures) {
        expect(isPicture(p.file), p.file).toBe(true);
        expect(MAKES, p.file).toContain(p.make);
        expect(p.bytes, `${p.file} has no facts of the file as first made`).toBeGreaterThan(0);
        expect(p.sha256, p.file).toMatch(/^[0-9a-f]{64}$/);
        if (p.make === 'svg' || p.make === 'html') {
          expect(inside.has(p.from!), `${p.file} is drawn from ${p.from}, which is not in the folder`).toBe(true);
          expect(p.width && p.height, `${p.file} has no size`).toBeTruthy();
        }
        if (p.tiktok) {
          expect(p.file, p.file).toMatch(/-9x16\.png$/);
          expect(p.from, p.file).toMatch(/-3x4\.html$/);
          expect([p.width, p.height]).toEqual([1080, 1920]);
        }
        if (p.make === 'deal-video') {
          const check = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')) as DealVideoRecord & { video: { file: string } };
          expect(check.video.file).toBe(p.file);
          for (const k of ['name', 'brand', 'shop', 'delivered', 'msrp', 'percent', 'pricesCheckedAt', 'photo'] as const) expect(check[k], `check.json ${k}`).toBeDefined();
        }
        if (p.make === 'explainer-video') {
          const v = EXPLAINER_VIDEOS[p.video as keyof typeof EXPLAINER_VIDEOS];
          expect(v, `${p.file}: no informative video "${p.video}"`).toBeDefined();
          expect(v.file).toBe(p.file);
        }
      }
    });
  }
});

describe('the videos, as first made, keep the template rules', () => {
  const videos = folders.flatMap((dir) => (readPictures(dir)?.pictures ?? []).filter((p) => p.make.endsWith('-video')).map((p) => ({ dir, p })));

  it('finds the videos', () => {
    expect(videos.length).toBeGreaterThanOrEqual(4);
  });

  for (const { dir, p } of videos) {
    it(`${name(dir)}/${p.file}: ${p.make === 'deal-video' ? 'exactly 10 seconds' : '20 to 30 seconds'}, under ${T.encode.maxMegabytes} MB`, () => {
      if (p.make === 'deal-video') expect(p.seconds).toBeCloseTo(T.deal.totalSeconds, 2);
      else {
        expect(p.seconds).toBeGreaterThanOrEqual(T.informative.minSeconds);
        expect(p.seconds).toBeLessThanOrEqual(T.informative.maxSeconds);
      }
      expect(p.bytes!).toBeLessThan(T.encode.maxMegabytes * 1024 * 1024);
    });
  }
});

describe('no picture is committed', () => {
  it('git tracks no picture under social/', () => {
    const tracked = execFileSync('git', ['ls-files', '--', 'social'], { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter((f) => isPicture(f));
    expect(tracked).toEqual([]);
  });

  it('every picture type the renderers know is "social" in the manifest and gitignored', () => {
    for (const ext of PICTURE_EXTENSIONS) {
      const probe = `social/posts/2026-10-08-deal-of-the-day/post-3x4${ext}`;
      expect(policyOf(probe), probe).toBe('social');
      expect(() => execFileSync('git', ['check-ignore', '-q', '--no-index', probe], { cwd: REPO_ROOT }), `${probe} is not gitignored`).not.toThrow();
    }
  });

  it('a renderer refuses to write a picture under social/ the manifest does not list, and allows one elsewhere', () => {
    expect(() => assertPicturePath(join(SOCIAL, 'posts/x/post-3x4.png'))).not.toThrow();
    expect(() => assertPicturePath(join(SOCIAL, 'posts/x/deal-video-9x16.mp4'))).not.toThrow();
    expect(() => assertPicturePath(join(SOCIAL, 'posts/x/post-3x4.bmp'))).toThrow(/scripts\/generated-files\.txt/);
    expect(() => assertPicturePath('/tmp/social-pictures/posts/x/post-3x4.bmp')).not.toThrow();
  });
});

describe('drawing again from the committed text', () => {
  it('reads what a picture is drawn from off the files beside it', () => {
    const names = new Set(['post-9x16.svg', 'post-3x4.html', 'slide-1-3x4.html', 'notes-3x4.html']);
    expect(sourceOf('post-9x16.png', names)).toEqual({ make: 'svg', from: 'post-9x16.svg' });
    expect(sourceOf('post-3x4.png', names)).toEqual({ make: 'html', from: 'post-3x4.html' });
    expect(sourceOf('slide-1-9x16.png', names)).toEqual({ make: 'html', from: 'slide-1-3x4.html', tiktok: true });
    expect(sourceOf('notes-9x16.png', names)).toEqual({ make: 'html', from: 'notes-3x4.html', tiktok: true });
    expect(sourceOf('other.png', names)).toEqual({ make: 'history' });
    expect(sourceOf('deal-video-9x16.mp4', names)).toEqual({ make: 'history' });
  });

  it('swaps each product photo address in the HTML back for the downloaded photo, once per address', () => {
    const seen: string[] = [];
    const html = '<div><img src="https://shop.example/a.jpg?v=1&width=3000" alt=""><img src="https://shop.example/a.jpg?v=1&width=3000" alt=""><img src="data:image/png;base64,AA" alt=""></div>';
    const out = inlinePhotos(html, (url) => {
      seen.push(url);
      return 'data:image/jpeg;base64,QUJD';
    });
    expect(seen).toEqual(['https://shop.example/a.jpg?v=1&width=3000']);
    expect(out).toBe('<div><img src="data:image/jpeg;base64,QUJD" alt=""><img src="data:image/jpeg;base64,QUJD" alt=""><img src="data:image/png;base64,AA" alt=""></div>');
  });

  it('rebuilds a deal video\'s words from check.json alone, as the video first showed them', () => {
    const dir = folders.find((d) => /deal-video-escentric-molecules/.test(d));
    expect(dir, 'the Molecule 05 deal video post').toBeDefined();
    const check = JSON.parse(readFileSync(join(dir!, 'check.json'), 'utf8')) as DealVideoRecord;
    const html = dealScenes(dealVideoFromRecord(check, '2026-10-08', 'data:image/jpeg;base64,QUJD')).map((s) => s.html).join('\n');
    expect(html).toContain('Thursday, 8 October 2026');
    expect(html).toContain('Molecule 05 100ml');
    expect(html).toContain('Escentric Molecules');
    expect(html).toContain('£125.00');
    expect(html).toContain('£75.00');
    expect(html).toContain('from John Lewis');
    expect(html).toContain('SAVE</span><b>40%');
    // 2026-10-08T01:23:01.700Z is 02:23 in the UK (summer time).
    expect(html).toContain('checked 02:23 UK, 8 Oct 2026');
  });

  it('reads a PNG\'s size and an MP4\'s length from their headers', () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(1080, 16);
    png.writeUInt32BE(1920, 20);
    expect(pngSize(png)).toEqual({ width: 1080, height: 1920 });
    expect(pngSize(Buffer.from('not a png at all, not at all'))).toBeNull();
    const mvhd = Buffer.alloc(32);
    mvhd.write('mvhd', 0);
    mvhd.writeUInt8(0, 4);
    mvhd.writeUInt32BE(1000, 16);
    mvhd.writeUInt32BE(26500, 20);
    expect(mp4Seconds(mvhd)).toBe(26.5);
  });

  it('every folder\'s record names files that the renderer can make or restore', () => {
    const history = folders.flatMap((d) => (readPictures(d)?.pictures ?? []).filter((p: Picture) => p.make === 'history').map((p) => `${name(d)}/${p.file}`));
    // Only the 5 October hurry video was drawn from a live page; its original is in git history.
    // A new picture nothing can draw again would reach nobody: it is not committed either.
    expect(history).toEqual(['posts/2026-10-05-hurry-deal-video/hurry-deal-9x16.mp4']);
    expect(existsSync(join(POSTS, '2026-10-05-hurry-deal-video', 'source.md'))).toBe(true);
  });
});
