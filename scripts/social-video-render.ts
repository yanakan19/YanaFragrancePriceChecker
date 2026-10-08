/**
 * Draws a social video from a spec made with scripts/social-video-template.ts:
 * for every frame it asks the template what each scene is doing at that time,
 * places the scenes in a headless Chromium page (1080 x 1920, the brand font
 * embedded) and takes a screenshot; ffmpeg then encodes the frames as H.264.
 *
 * Before the first frame is drawn it checks, and refuses to go on if a check
 * fails:
 *   - the timeline obeys the template's rules (timelineProblems);
 *   - every piece of text and every picture is inside the safe box even at the
 *     end of its zoom, and no text was cut short to fit.
 * After encoding it reads the file back and checks its size, frame count and
 * length.
 *
 * Frames already drawn are kept (in `_frames/` beside the video, which git
 * ignores), so a run killed for lack of memory can simply be repeated and
 * only draws what is missing. A changed spec or page starts again by itself.
 *
 * Not run directly: social-video-deal.ts and social-video-explainers.ts use it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'playwright';
import { launchChromium } from './a11y-audit.js';
import { BRAND_FONT_CSS, FIT_SCRIPT } from './socialRender.js';
import {
  VIDEO_TEMPLATE,
  buildTimeline,
  frameState,
  timelineProblems,
  videoDocument,
  type Timeline,
  type VideoSpec,
} from './social-video-template.js';

export function ffmpegPath(): string {
  const candidates = [process.env.FFMPEG ?? '', 'ffmpeg'];
  try {
    candidates.push(execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim());
  } catch {
    /* no imageio-ffmpeg */
  }
  for (const c of candidates) {
    if (!c) continue;
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* try the next */
    }
  }
  throw new Error('No ffmpeg found. Install one (pip install imageio-ffmpeg) or set FFMPEG.');
}

export interface VideoFacts {
  seconds: number;
  frames: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bytes: number;
}

/**
 * What the file really holds, found by decoding all of it (there is no ffprobe
 * on the machines this runs on, and the container's own length can disagree
 * with the frames inside it).
 */
export function probeVideo(file: string): VideoFacts {
  const run = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file, '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const log = `${run.stderr}`;
  const stream = /Video: (\w+)[^\n]*?, (\d+)x(\d+)[^\n]*?, ([\d.]+) fps/.exec(log);
  const frames = [...log.matchAll(/frame=\s*(\d+)/g)].pop();
  const time = [...log.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  if (!stream || !frames || !time) throw new Error(`Could not read ${file}:\n${log.slice(-600)}`);
  return {
    codec: stream[1]!,
    width: Number(stream[2]),
    height: Number(stream[3]),
    fps: Number(stream[4]),
    frames: Number(frames[1]),
    seconds: Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]),
    bytes: statSync(file).size,
  };
}

export interface RenderJob {
  spec: VideoSpec;
  scenes: { id: string; html: string }[];
  /** The post folder; frames go in `_frames/` inside it. */
  outDir: string;
  /** The video's file name inside outDir. */
  file: string;
  extraCss?: string;
  /** Keep the drawn frames (default: they are deleted once the video is encoded). */
  keepFrames?: boolean;
  log?: (line: string) => void;
}

export interface RenderReport {
  timeline: Timeline;
  facts: VideoFacts;
  path: string;
}

/** Everything the safe check needs, run inside the page. */
const SAFE_CHECK = `(args) => {
  const { safe, scenes, tol } = args;
  const bad = [];
  for (const sc of scenes) {
    const root = document.getElementById('scene-' + sc.id);
    const found = [];
    for (const el of root.querySelectorAll('.stage *')) {
      if (el.closest('[data-bleed]')) continue;
      const tag = el.tagName.toLowerCase();
      if (el.closest('svg') && tag !== 'svg') continue;
      if (tag === 'img' || tag === 'svg' || el.hasAttribute('data-box')) {
        const b = el.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) found.push({ what: tag + (el.className && typeof el.className === 'string' ? '.' + el.className : ''), l: b.left, r: b.right, t: b.top, b: b.bottom });
      }
      if (el.dataset && el.dataset.clamped) bad.push(sc.id + ': text was cut short: "' + el.textContent.trim().slice(0, 40) + '"');
      for (const n of el.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const b of range.getClientRects()) found.push({ what: 'text "' + n.textContent.trim().slice(0, 32) + '"', l: b.left, r: b.right, t: b.top, b: b.bottom });
      }
    }
    for (const f of found) {
      const l = sc.ox + (f.l - sc.ox) * sc.zoom, r = sc.ox + (f.r - sc.ox) * sc.zoom;
      const t = sc.oy + (f.t - sc.oy) * sc.zoom, b = sc.oy + (f.b - sc.oy) * sc.zoom;
      if (l < safe.left - tol || r > safe.right + tol || t < safe.top - tol || b > safe.bottom + tol) {
        bad.push(sc.id + ': ' + f.what + ' ends up at x ' + Math.round(l) + ' to ' + Math.round(r) + ', y ' + Math.round(t) + ' to ' + Math.round(b) + ' after the zoom, outside the safe box');
      }
    }
  }
  return bad;
}`;

const pad = (n: number) => String(n).padStart(5, '0');

/** The page the frames are taken from: the template's document with the brand font and the fit script. */
export function pageHtml(spec: VideoSpec, scenes: { id: string; html: string }[], extraCss = ''): string {
  return videoDocument(spec.theme, scenes, extraCss, VIDEO_TEMPLATE)
    .replace('<head>', `<head><style>${BRAND_FONT_CSS}</style>`)
    .replace('</body>', `${FIT_SCRIPT}</body>`);
}

/** Loads the page and waits until the font and every picture are ready. */
async function loadPage(browser: Browser, html: string) {
  const page = await browser.newPage({ viewport: { width: VIDEO_TEMPLATE.width, height: VIDEO_TEMPLATE.height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate('document.fonts.ready');
  await page.evaluate(`Promise.all([...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : null)))`);
  return page;
}

/**
 * Text or pictures outside the safe box once each scene has finished its zoom,
 * and text that had to be cut short to fit. Empty when the layout is fine.
 */
export async function layoutProblems(browser: Browser, spec: VideoSpec, scenes: { id: string; html: string }[], extraCss = ''): Promise<string[]> {
  const tpl = VIDEO_TEMPLATE;
  const tl = buildTimeline(spec, tpl);
  const page = await loadPage(browser, pageHtml(spec, scenes, extraCss));
  try {
    return (await page.evaluate(`(${SAFE_CHECK})(${JSON.stringify({
      safe: tpl.safe,
      tol: 0.5,
      scenes: tl.scenes.map((s) => ({ id: s.id, ox: s.focus.x, oy: s.focus.y, zoom: tpl.zoom.to })),
    })})`)) as string[];
  } finally {
    await page.close();
  }
}

export async function renderVideo(job: RenderJob): Promise<RenderReport> {
  const tpl = VIDEO_TEMPLATE;
  const log = job.log ?? ((l: string) => console.log(l));
  const tl = buildTimeline(job.spec, tpl);
  const problems = timelineProblems(tl, tpl);
  if (problems.length) throw new Error(`${job.spec.id}: the timeline breaks the template rules:\n  ${problems.join('\n  ')}`);

  const html = pageHtml(job.spec, job.scenes, job.extraCss ?? '');

  mkdirSync(job.outDir, { recursive: true });
  const framesDir = join(job.outDir, '_frames');
  const stamp = createHash('sha1').update(html).update(JSON.stringify(tl)).update(JSON.stringify(tpl)).digest('hex');
  const stampFile = join(framesDir, '.stamp');
  if (existsSync(framesDir) && (!existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== stamp)) rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  writeFileSync(stampFile, stamp);

  const browser = await launchChromium();
  try {
    const bad = await layoutProblems(browser, job.spec, job.scenes, job.extraCss ?? '');
    if (bad.length) throw new Error(`${job.spec.id}: layout problems (safe box x ${tpl.safe.left} to ${tpl.safe.right}, y ${tpl.safe.top} to ${tpl.safe.bottom}):\n  ${bad.join('\n  ')}`);
    const page = await loadPage(browser, html);

    let prevKey = '';
    let prevFile = '';
    for (let f = 0; f < tl.frames; f++) {
      const file = join(framesDir, `${pad(f)}.png`);
      const st = frameState(tl, f / tpl.fps, tpl);
      const key = JSON.stringify({ l: st.layers, v: st.veil });
      if (existsSync(file)) {
        prevKey = key;
        prevFile = file;
        continue;
      }
      if (key === prevKey && prevFile) {
        copyFileSync(prevFile, file); // nothing changed since the last frame (the opening still)
      } else {
        await page.evaluate(`window.__apply(${JSON.stringify(st)})`);
        await page.screenshot({ path: file, type: 'png' });
      }
      prevKey = key;
      prevFile = file;
      if (f % 60 === 0) log(`${job.spec.id}: frame ${f}/${tl.frames}`);
    }
    await page.close();
  } finally {
    await browser.close();
  }

  const out = join(job.outDir, job.file);
  execFileSync(
    ffmpegPath(),
    [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(tpl.fps), '-i', join(framesDir, '%05d.png'),
      '-frames:v', String(tl.frames),
      // The colour matrix phones expect for HD video, tagged so they use it.
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos,format=yuv420p',
      '-c:v', 'libx264', '-preset', tpl.encode.preset, '-crf', String(tpl.encode.crf), '-tune', 'animation',
      '-profile:v', 'high', '-level', '4.0',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-r', String(tpl.fps), '-an', '-movflags', '+faststart',
      out,
    ],
    { stdio: 'inherit' },
  );

  const facts = probeVideo(out);
  const wrong: string[] = [];
  if (facts.frames !== tl.frames) wrong.push(`${facts.frames} frames, expected ${tl.frames}`);
  if (Math.abs(facts.seconds - tl.total) > 0.02) wrong.push(`${facts.seconds}s long, expected ${tl.total}s`);
  if (facts.width !== tpl.width || facts.height !== tpl.height) wrong.push(`${facts.width}x${facts.height}, expected ${tpl.width}x${tpl.height}`);
  if (facts.bytes > tpl.encode.maxMegabytes * 1024 * 1024) wrong.push(`${(facts.bytes / 1048576).toFixed(1)} MB, over the ${tpl.encode.maxMegabytes} MB cap`);
  if (wrong.length) throw new Error(`${out} is not what the template promises:\n  ${wrong.join('\n  ')}`);

  if (!job.keepFrames) rmSync(framesDir, { recursive: true, force: true });
  log(`${job.spec.id}: ${out} ${facts.seconds.toFixed(2)}s, ${facts.frames} frames, ${(facts.bytes / 1048576).toFixed(2)} MB`);
  return { timeline: tl, facts, path: out };
}
