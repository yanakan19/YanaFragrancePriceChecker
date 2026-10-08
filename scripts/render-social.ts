/**
 * Draws a social post's pictures and videos from its committed text. They are
 * not committed (docs/DECISIONS.md D28, from 8 October 2026): `pictures.json`
 * in each post folder lists them, says what each is drawn from, and keeps the
 * facts of the file as first made (scripts/socialPictures.ts). See
 * social/README.md.
 *
 *   npm run social:render -- social/posts/<folder> [<folder>...]   beside the post's text
 *   npm run social:render -- <folder> --from-history               the files as first made
 *   npm run social:render                                          every post and highlight (slow)
 *
 *   --out <dir>       write into <dir>/posts/<folder>/ (or highlights/), with the
 *                     captions, an index.html to look through and summary.md, instead
 *                     of beside the text. The Social pictures workflow uses this.
 *   --from-history    restore each file as it was last committed (posts made before
 *                     8 October 2026); a file git never had is drawn instead
 *   --no-videos       leave the videos out (40 to 90 seconds each to draw)
 *
 * How each is drawn ("make" in pictures.json):
 *   svg              the SVG beside it, at its own size, brand font embedded
 *   html             the HTML beside it, at 2x and scaled down smoothly (socialRender.ts); a
 *                    "tiktok" picture is the 9:16 version of a 3:4 slide (tiktokSlide). The
 *                    product photo is downloaded again from the address in the HTML, the way
 *                    the post scripts first downloaded it
 *   deal-video       the Deal of the Day video, from check.json's figures (dealVideoFromRecord)
 *   explainer-video  an informative video, from scripts/social-video-explainers.ts
 *   history          drawn from a live page once and never again: only the file as first
 *                    made, from git history (the 5 October hurry video)
 *
 * Each result is compared with pictures.json. A picture with another size in
 * pixels, or a video with another length, fails the run; other bytes are
 * reported, not failed (a newer Chromium or encoder, or a product photo the
 * shop has changed since). A folder made by hand with no pictures.json (an SVG
 * post from social/templates) gets one, written from what was drawn.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import type { Browser } from 'playwright';
import { launchChromium } from './a11y-audit.js';
import { renderSmooth } from './socialRender.js';
import { H_TIKTOK, W, tiktokSlide } from './socialSlides.js';
import {
  PICTURES_FILE,
  assertPicturePath,
  expectedPictures,
  inlinePhotos,
  isVideo,
  originalFromHistory,
  photoDataUri,
  pictureFacts,
  readPictures,
  recordPictures,
  type Picture,
} from './socialPictures.js';
import { renderVideo } from './social-video-render.js';
import { DEAL_VIDEO, dealScenes, dealVideoFromRecord, esc, type DealVideoRecord } from './social-video-template.js';
import { EXPLAINER_CSS, EXPLAINER_VIDEOS } from './social-video-explainers.js';

const ROOT = resolve(import.meta.dirname, '..');
const SOCIAL = join(ROOT, 'social');

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const OUT = opt('--out') ? resolve(opt('--out')!) : null;
const FROM_HISTORY = flag('--from-history');
const NO_VIDEOS = flag('--no-videos');
const targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

/** A folder argument: a path, or a bare post folder name under social/posts. */
function folderOf(arg: string): string {
  for (const p of [resolve(arg), join(SOCIAL, 'posts', arg)]) if (existsSync(p) && statSync(p).isDirectory()) return p;
  throw new Error(`No such post folder: ${arg}`);
}

function everyFolder(): string[] {
  const posts = join(SOCIAL, 'posts');
  return [
    ...readdirSync(posts).map((n) => join(posts, n)).filter((p) => statSync(p).isDirectory()).sort(),
    join(SOCIAL, 'highlights'),
  ];
}

const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
const kb = (n: number) => `${(n / 1024).toFixed(0)} kB`;

interface Result {
  folder: string;
  file: string;
  out: string | null;
  how: string;
  verdict: string;
  failed: boolean;
}

/** The day a deal video shows: check.json's date, else the --date of the command in source.md, else the folder's. */
function dealDay(dir: string, check: DealVideoRecord): string {
  if (check.date) return check.date;
  const source = existsSync(join(dir, 'source.md')) ? readFileSync(join(dir, 'source.md'), 'utf8') : '';
  return /--date (\d{4}-\d{2}-\d{2})/.exec(source)?.[1] ?? basename(dir).slice(0, 10);
}

/**
 * Chromium can crash part way through a long video on a machine short of
 * memory. The frames drawn so far are kept (social-video-render.ts), so trying
 * again goes on from there; on 8 October the 795 frame notes video took six
 * tries beside other agents' work, and came out byte for byte the same.
 */
async function withRetries<T>(what: string, run: () => Promise<T>, tries = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0]! : String(e);
      if (i >= tries || !/Target crashed|has been closed|Browser closed|crashed/i.test(msg)) throw e;
      console.log(`${what}: Chromium crashed (${msg}); going on from the frames drawn so far (try ${i + 1} of ${tries})`);
    }
  }
}

async function draw(browser: () => Promise<Browser>, dir: string, outDir: string, p: Picture): Promise<string> {
  const out = join(outDir, p.file);
  if (p.make === 'svg' || p.make === 'html') {
    const src = readFileSync(join(dir, p.from!), 'utf8');
    if (p.make === 'svg') {
      const w = p.width ?? Number(/width="(\d+)"/.exec(src)?.[1] ?? 1080);
      const h = p.height ?? Number(/height="(\d+)"/.exec(src)?.[1] ?? 1080);
      await renderSmooth(await browser(), `<!doctype html><html><head><style>html,body{margin:0;background:#0A0A0B}</style></head><body>${src}</body></html>`, w, h, out);
      return `drawn from ${p.from}`;
    }
    const w = p.width ?? W;
    const h = p.height ?? (p.tiktok || /-9x16\.png$/.test(p.file) ? H_TIKTOK : 1440);
    const html = inlinePhotos(p.tiktok ? tiktokSlide(src) : src);
    await renderSmooth(await browser(), html, w, h, out);
    return `drawn from ${p.from}${p.tiktok ? ' (9:16 TikTok version)' : ''}`;
  }
  if (p.make === 'deal-video') {
    const check = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')) as DealVideoRecord;
    const data = dealVideoFromRecord(check, dealDay(dir, check), photoDataUri(check.photo));
    await withRetries(p.file, () => renderVideo({ spec: DEAL_VIDEO, scenes: dealScenes(data), outDir, file: p.file, log: () => {} }));
    return 'drawn from check.json (scripts/social-video-deal.ts template)';
  }
  if (p.make === 'explainer-video') {
    const v = EXPLAINER_VIDEOS[p.video as keyof typeof EXPLAINER_VIDEOS];
    if (!v) throw new Error(`${p.file}: no informative video "${p.video}" in scripts/social-video-explainers.ts`);
    await withRetries(p.file, () => renderVideo({ spec: v.spec, scenes: v.scenes(), outDir, file: p.file, extraCss: EXPLAINER_CSS, log: () => {} }));
    return `drawn from scripts/social-video-explainers.ts (${p.video})`;
  }
  throw new Error(`${p.file} cannot be drawn again (it was drawn from a live page); only the original in git history`);
}

/** Puts back the file as it was last committed. */
function restore(dir: string, outDir: string, p: Picture): string | null {
  const original = originalFromHistory(rel(join(dir, p.file)));
  if (!original) return null;
  const out = join(outDir, p.file);
  assertPicturePath(out);
  writeFileSync(out, original);
  return 'restored from git history';
}

/** How the file on disk compares with the facts in pictures.json; `bad` when the size or length differs. */
function compare(out: string, p: Picture): { text: string; bad: boolean } {
  const now = pictureFacts(out);
  const parts: string[] = [];
  let bad = false;
  if (now.width) parts.push(`${now.width}x${now.height}`);
  if (now.seconds !== undefined) parts.push(`${now.seconds.toFixed(2)} s`);
  parts.push(kb(now.bytes!));
  if (p.sha256 === undefined) return { text: `${parts.join(', ')} (no record to compare)`, bad };
  if (p.width && (now.width !== p.width || now.height !== p.height)) {
    bad = true;
    parts.push(`SIZE DIFFERS: first made ${p.width}x${p.height}`);
  }
  if (p.seconds !== undefined && (now.seconds === undefined || Math.abs(now.seconds - p.seconds) > 0.02)) {
    bad = true;
    parts.push(`LENGTH DIFFERS: first made ${p.seconds.toFixed(2)} s`);
  }
  if (now.sha256 === p.sha256) parts.push('identical to the first');
  else parts.push(`first made ${kb(p.bytes!)} (${(((now.bytes! - p.bytes!) / p.bytes!) * 100).toFixed(1)}% bytes)`);
  return { text: parts.join(', '), bad };
}

function indexHtml(results: Result[], folders: string[]): string {
  const sections = folders.map((dir) => {
    const name = rel(dir).replace(/^social\//, '');
    const mine = results.filter((r) => r.folder === dir);
    const media = mine
      .filter((r) => r.out)
      .map((r) => {
        const src = esc(`${name}/${r.file}`);
        const view = isVideo(r.file) ? `<video src="${src}" controls playsinline preload="metadata"></video>` : `<img src="${src}" alt="" loading="lazy">`;
        return `<figure>${view}<figcaption><a href="${src}" download>${esc(r.file)}</a></figcaption></figure>`;
      })
      .join('\n');
    const failures = mine.filter((r) => r.failed).map((r) => `<p class="bad">${esc(r.file)}: ${esc(r.verdict)}</p>`).join('\n');
    const captions = ['caption.txt', 'tiktok-caption.txt']
      .filter((c) => existsSync(join(dir, c)))
      .map((c) => `<h3>${c === 'caption.txt' ? 'Caption' : 'TikTok caption'}</h3><pre>${esc(readFileSync(join(dir, c), 'utf8'))}</pre>`)
      .join('\n');
    return `<section><h2>${esc(name)}</h2>${failures}<div class="grid">${media}</div>${captions}</section>`;
  });
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Social pictures</title><style>
body{margin:0;padding:16px;background:#0A0A0B;color:#F7F7F8;font:16px/1.5 system-ui,sans-serif}
h1{font-size:22px}h2{font-size:18px;border-top:1px solid #3A3A40;padding-top:16px}h3{font-size:15px;color:#B9B9C0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
figure{margin:0}img,video{width:100%;border-radius:8px;background:#18181B}figcaption a{color:#FF6A6E;font-size:13px}
pre{white-space:pre-wrap;background:#18181B;padding:12px;border-radius:8px}.bad{color:#FF6A6E}
</style></head><body><h1>Social pictures</h1>
<p>Drawn from the posts' committed text (docs/DECISIONS.md D28). Tap a file name to save it.</p>
${sections.join('\n')}
</body></html>
`;
}

function summaryMd(results: Result[]): string {
  const rows = results.map((r) => `| ${rel(r.folder).replace(/^social\//, '')} | ${r.file} | ${r.how} | ${r.failed ? `**${r.verdict}**` : r.verdict} |`);
  return `| Post | File | How | Result |\n|---|---|---|---|\n${rows.join('\n')}\n`;
}

async function main() {
  const folders = (targets.length ? targets.map(folderOf) : everyFolder()).filter((d, i, all) => all.indexOf(d) === i);
  let open: Browser | null = null;
  const browser = async () => (open ??= await launchChromium());
  const results: Result[] = [];

  for (const dir of folders) {
    const hadRecord = readPictures(dir) !== null;
    const outDir = OUT ? join(OUT, relative(SOCIAL, dir)) : dir;
    mkdirSync(outDir, { recursive: true });
    const pictures = expectedPictures(dir).filter((p) => !(NO_VIDEOS && isVideo(p.file)));
    if (!pictures.length) console.log(`${rel(dir)}: no pictures to draw`);
    for (const p of pictures) {
      const out = join(outDir, p.file);
      let how = '';
      try {
        if (FROM_HISTORY || p.make === 'history') how = restore(dir, outDir, p) ?? '';
        if (!how) how = await draw(browser, dir, outDir, p);
        const { text, bad } = compare(out, p);
        results.push({ folder: dir, file: p.file, out, how, verdict: text, failed: bad });
        console.log(`${bad ? 'FAIL' : 'ok  '} ${rel(dir)}/${p.file}: ${how}; ${text}`);
      } catch (e) {
        const reason = e instanceof Error ? e.message.split('\n')[0]! : String(e);
        results.push({ folder: dir, file: p.file, out: existsSync(out) ? out : null, how: how || p.make, verdict: reason, failed: true });
        console.log(`FAIL ${rel(dir)}/${p.file}: ${reason}`);
      }
    }
    if (OUT) {
      for (const c of ['caption.txt', 'tiktok-caption.txt']) if (existsSync(join(dir, c))) copyFileSync(join(dir, c), join(outDir, c));
    } else if (!hadRecord && results.some((r) => r.folder === dir && !r.failed)) {
      recordPictures(dir);
      console.log(`${rel(dir)}/${PICTURES_FILE} written (a folder made by hand)`);
    }
  }
  if (open) await (open as Browser).close();

  if (OUT) {
    writeFileSync(join(OUT, 'index.html'), indexHtml(results, folders));
    writeFileSync(join(OUT, 'summary.md'), summaryMd(results));
  }
  const failed = results.filter((r) => r.failed);
  const drawn = results.filter((r) => !r.failed).length;
  console.log(`${drawn} of ${results.length} pictures made${OUT ? ` in ${OUT}` : ''}${failed.length ? `; ${failed.length} failed` : ''}.`);
  if (failed.length) process.exitCode = 1;
}

await main();
