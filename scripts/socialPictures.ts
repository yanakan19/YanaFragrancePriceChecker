/**
 * A social post's pictures and videos are not committed (docs/DECISIONS.md
 * D28, the owner's go ahead of 8 October 2026). What is committed is the
 * post's text: the HTML or SVG each picture is drawn from, the captions,
 * check.json and `pictures.json`, written here, which lists every picture the
 * post has, what it is drawn from and the facts of the file as first made
 * (bytes, sha256, and its size in pixels or its length).
 *
 * `npm run social:render -- social/posts/<folder>` (scripts/render-social.ts)
 * reads pictures.json and draws the pictures again; the Social pictures
 * workflow (.github/workflows/social-pictures.yml) does the same for every post
 * a push adds and keeps them as a private workflow artifact for 90 days.
 *
 * Every renderer refuses to write a picture under social/ that the manifest of
 * generated files (scripts/generated-files.txt) does not list as "social", so
 * a new picture type cannot reach a commit without its .gitignore line.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { resizedPhotoUrl } from '../demo/photo.js';
import { BOT_USER_AGENT } from '../src/catalogue/botIdentity.js';
import { policyOf, REPO_ROOT } from './generatedFiles.js';

export const PICTURES_FILE = 'pictures.json';
export const PICTURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.webm'] as const;
export const isPicture = (name: string) => PICTURE_EXTENSIONS.some((e) => name.toLowerCase().endsWith(e));
export const isVideo = (name: string) => /\.(mp4|mov|webm)$/i.test(name);

/**
 * How a picture is drawn again:
 *   svg              the SVG of the same name, at its own size
 *   html             `from`, at 2x then scaled down (renderSmooth); `tiktok` is the 9:16
 *                    version of a 3:4 slide (tiktokSlide in socialSlides.ts)
 *   deal-video       scripts/social-video-deal.ts's video, from check.json's figures
 *   explainer-video  scripts/social-video-explainers.ts's video `video`
 *   history          not drawable (drawn from a live page): only the file as first made,
 *                    from git history
 */
export type PictureMake = 'svg' | 'html' | 'deal-video' | 'explainer-video' | 'history';

export interface Picture {
  file: string;
  make: PictureMake;
  from?: string;
  tiktok?: boolean;
  video?: string;
  /** As first made. */
  width?: number;
  height?: number;
  seconds?: number;
  bytes?: number;
  sha256?: string;
}

export interface PicturesRecord {
  about: string;
  pictures: Picture[];
}

const relToRepo = (path: string) => relative(REPO_ROOT, resolve(path)).split(sep).join('/');

/** Throws unless `file` is outside social/ or a "social" path in scripts/generated-files.txt. */
export function assertPicturePath(file: string): void {
  const rel = relToRepo(file);
  if (rel.startsWith('..') || !rel.startsWith('social/')) return;
  if (policyOf(rel) !== 'social') {
    throw new Error(
      `Refusing to write ${rel}: a picture under social/ must be "social" in scripts/generated-files.txt ` +
        '(and in .gitignore), so that it is rendered and never committed (docs/DECISIONS.md D28). Add a line for its type in both.',
    );
  }
}

/** Width and height from a PNG's header, or null for anything else. */
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** A movie's length from its header (there is no ffprobe on the machines this runs on). */
export function mp4Seconds(buf: Buffer): number | null {
  const at = buf.indexOf('mvhd');
  if (at < 0) return null;
  const base = at + 4;
  if (buf[base] === 1) return Number(buf.readBigUInt64BE(base + 24)) / buf.readUInt32BE(base + 20);
  return buf.readUInt32BE(base + 16) / buf.readUInt32BE(base + 12);
}

/** What a picture file is: bytes, sha256, size in pixels or length. */
export function pictureFacts(file: string): Pick<Picture, 'width' | 'height' | 'seconds' | 'bytes' | 'sha256'> {
  const buf = readFileSync(file);
  const facts: Pick<Picture, 'width' | 'height' | 'seconds' | 'bytes' | 'sha256'> = {};
  const size = pngSize(buf);
  if (size) Object.assign(facts, size);
  if (isVideo(file)) {
    const s = mp4Seconds(buf);
    if (s !== null) facts.seconds = Math.round(s * 1000) / 1000;
  }
  facts.bytes = buf.length;
  facts.sha256 = createHash('sha256').update(buf).digest('hex');
  return facts;
}

/** What a picture is drawn from, read off the files beside it. Videos are named by the script that made them. */
export function sourceOf(name: string, names: ReadonlySet<string>): Pick<Picture, 'make' | 'from' | 'tiktok'> {
  if (isVideo(name)) return { make: 'history' };
  const stem = name.replace(/\.[^.]+$/, '');
  if (names.has(`${stem}.svg`)) return { make: 'svg', from: `${stem}.svg` };
  if (names.has(`${stem}.html`)) return { make: 'html', from: `${stem}.html` };
  const tall = /^(.*)-9x16$/.exec(stem);
  if (tall && names.has(`${tall[1]}-3x4.html`)) return { make: 'html', from: `${tall[1]}-3x4.html`, tiktok: true };
  return { make: 'history' };
}

export const aboutText = (dir: string) =>
  `The pictures and videos of this post are not committed (docs/DECISIONS.md D28). Draw them with: npm run social:render -- ${relToRepo(dir)} . ` +
  'Each entry says what the file is drawn from; bytes, sha256 and the size or length are those of the file as first made.';

/**
 * Lists the pictures in a post folder, with what each is drawn from and its
 * facts, in pictures.json. Every script that makes a post calls this last;
 * `hints` names what the script made where the files alone cannot tell (a
 * video). Returns the record written.
 */
export function recordPictures(dir: string, hints: Record<string, Partial<Picture>> = {}): PicturesRecord {
  const names = new Set(readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()));
  const pictures = [...names].filter(isPicture).sort().map((file): Picture => ({
    file,
    ...sourceOf(file, names),
    ...hints[file],
    ...pictureFacts(join(dir, file)),
  }));
  const record: PicturesRecord = { about: aboutText(dir), pictures };
  writeFileSync(join(dir, PICTURES_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export function readPictures(dir: string): PicturesRecord | null {
  const file = join(dir, PICTURES_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PicturesRecord) : null;
}

/**
 * The pictures a folder should have: its pictures.json, or for a folder made
 * by hand without one, a PNG for every SVG and HTML in it.
 */
export function expectedPictures(dir: string): Picture[] {
  const record = readPictures(dir);
  if (record) return record.pictures;
  const names = new Set(readdirSync(dir));
  const pngs = new Set([...names].filter((n) => n.endsWith('.svg') || n.endsWith('.html')).map((n) => n.replace(/\.(svg|html)$/, '.png')));
  return [...pngs].sort().map((file) => ({ file, ...sourceOf(file, names) }));
}

/**
 * A product photo as a data: address, downloaded the way the post scripts do
 * (the site's 800px copy first, then the original), so a picture drawn again
 * from its committed HTML gets the same photo it was first drawn with.
 */
export function photoDataUri(url: string): string {
  const src = resizedPhotoUrl(url, 800) ?? url;
  for (const u of [src, url]) {
    try {
      const out = execFileSync('curl', ['-sSL', '-A', BOT_USER_AGENT, '--max-time', '30', '-w', '\n%{content_type}', u], {
        maxBuffer: 64 * 1024 * 1024,
      });
      const cut = out.lastIndexOf(0x0a);
      const type = out.subarray(cut + 1).toString().trim();
      const body = out.subarray(0, cut);
      if (type.startsWith('image/') && body.length > 1000) return `data:${type};base64,${body.toString('base64')}`;
    } catch {
      /* try the original */
    }
  }
  throw new Error(`Could not download the photo: ${url}`);
}

/**
 * The committed HTML keeps each product photo's web address (the post scripts
 * swap the inline copy out before writing it); this swaps the photo back in.
 */
export function inlinePhotos(html: string, fetchPhoto: (url: string) => string = photoDataUri): string {
  const cache = new Map<string, string>();
  return html.replace(/(<img\b[^>]*?\ssrc=")(https?:\/\/[^"]+)(")/g, (_m, before: string, url: string, after: string) => {
    if (!cache.has(url)) cache.set(url, fetchPhoto(url));
    return `${before}${cache.get(url)}${after}`;
  });
}

/**
 * A picture as it was last committed, for posts made before 8 October 2026,
 * whose pictures were committed: the last commit that added or changed the
 * path, read with `git show`. Null when git never had it.
 */
export function originalFromHistory(relPath: string): Buffer | null {
  const commit = execFileSync('git', ['log', '-1', '--format=%H', '--diff-filter=AM', '--', relPath], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  if (!commit) return null;
  return execFileSync('git', ['show', `${commit}:${relPath}`], { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024 });
}
