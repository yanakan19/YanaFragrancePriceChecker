/**
 * The PriceSniffs social video template: ONE config, used by every Deal of the
 * Day video and by the informative videos, so they all move the same way.
 * Rules and how to make a video: docs/SOCIAL-MEDIA-PLAN.md section 9.
 *
 * What this file holds (and nothing else, so a test can import it cheaply):
 *   VIDEO_TEMPLATE   the numbers: size, frame rate, safe box, zoom, transition
 *                    lengths, the closing fade, the length of a deal video.
 *   buildTimeline    turns a list of scenes into start and end times.
 *   frameState       what every scene is doing at time t (position, zoom, fade).
 *   timelineProblems the rules, as checks (tests/socialVideoTemplate.test.ts and
 *                    the renderer both run them before a frame is drawn).
 *   videoDocument    the page the renderer draws, scene by scene.
 *   DEAL_VIDEO, dealScenes   the Deal of the Day video (10 seconds, black theme).
 *
 * The look of the motion, in one place:
 *   - The video OPENS ON A STILL: nothing moves for `openingStillSeconds`. The
 *     first frame is a finished picture (it is also what TikTok may use as the
 *     cover), and only then does the first slow zoom begin.
 *   - Every scene zooms in slowly (Ken Burns), a few per cent over its whole
 *     length, easing in and out so it never starts or stops with a jolt.
 *   - Scenes are joined by a dissolve or a swipe left. No transition is longer
 *     than `transitions.maxSeconds` (half a second).
 *   - The last scene is the PriceSniffs wordmark. It stays on screen, then the
 *     whole frame fades out to the background over `outro.fadeOutSeconds` (one
 *     second), so the video ends on a clean background.
 *   - Text stays inside `safe` even at the end of a zoom: clear of the TikTok
 *     and Instagram bars, caption and buttons (social/DESIGN-SYSTEM.md section 4,
 *     "TikTok versions"). The renderer measures it and refuses to draw if not.
 */
import { MARK, THEMES } from './socialSlides.js';

export const VIDEO_TEMPLATE = {
  /** TikTok, Reels and Shorts: vertical 9:16, as every other post (DESIGN-SYSTEM.md section 2). */
  width: 1080,
  height: 1920,
  fps: 30,
  /**
   * Where text and pictures may be, in pixels, after the zoom has finished.
   * The same box the TikTok photo versions use (DESIGN-SYSTEM.md section 4):
   * clear of TikTok's tabs at the top, its caption and buttons at the bottom
   * and its icons down the right.
   */
  safe: { left: 110, right: 970, top: 380, bottom: 1460 },
  /** Nothing moves for this long at the very start. */
  openingStillSeconds: 0.8,
  /** How far each scene zooms in over its length (1.05 is 5 per cent). */
  zoom: { to: 1.05 },
  transitions: {
    dissolveSeconds: 0.5,
    swipeSeconds: 0.4,
    /** The ceiling for any transition. The owner's rule: a swipe is never longer than half a second. */
    maxSeconds: 0.5,
  },
  outro: {
    /** The whole frame fades out to the background over this long, at the very end. */
    fadeOutSeconds: 1,
    /** The wordmark sits fully on screen for at least this long before the fade begins. */
    minHoldSeconds: 1.2,
  },
  /** Deal of the Day videos: exactly this long, black theme. */
  deal: { totalSeconds: 10, theme: 'standard' as const },
  /** Informative videos: as long as the content needs, within this. Red theme, as every explainer. */
  informative: { minSeconds: 20, maxSeconds: 30, theme: 'inverted' as const },
  /** H.264 for TikTok and Instagram. Flat graphics compress well; a post stays far below the cap. */
  encode: { crf: 20, preset: 'slow', maxMegabytes: 8 },
} as const;

export type Template = typeof VIDEO_TEMPLATE;
export type ThemeName = keyof typeof THEMES;
export type TransitionKind = 'dissolve' | 'swipe';

export interface SceneSpec {
  id: string;
  /** How long the scene is on screen, counting the transition into it and the one out of it. */
  seconds: number;
  /** How this scene arrives (every scene but the first). */
  transition?: TransitionKind;
  /** Where the zoom is aimed, in pixels. Default: the middle of the safe box. */
  focus?: { x: number; y: number };
}

export interface VideoSpec {
  id: string;
  theme: ThemeName;
  /** The last scene is the PriceSniffs wordmark. */
  scenes: SceneSpec[];
}

export interface SceneTiming {
  id: string;
  index: number;
  start: number;
  end: number;
  /** When this scene's zoom begins: its start, or the end of the opening still for the first scene. */
  zoomStart: number;
  /** Seconds taken to arrive (0 for the first scene). */
  arrives: number;
  transition: TransitionKind | null;
  focus: { x: number; y: number };
}

export interface TransitionTiming {
  kind: TransitionKind;
  from: string;
  to: string;
  start: number;
  end: number;
  seconds: number;
}

export interface Timeline {
  spec: VideoSpec;
  scenes: SceneTiming[];
  transitions: TransitionTiming[];
  total: number;
  frames: number;
  /** When the closing fade begins. */
  fadeStart: number;
}

const ms = (x: number) => Math.round(x * 1000) / 1000;

export function transitionSeconds(kind: TransitionKind, tpl: Template = VIDEO_TEMPLATE): number {
  return kind === 'dissolve' ? tpl.transitions.dissolveSeconds : tpl.transitions.swipeSeconds;
}

export function safeCentre(tpl: Template = VIDEO_TEMPLATE): { x: number; y: number } {
  return { x: (tpl.safe.left + tpl.safe.right) / 2, y: (tpl.safe.top + tpl.safe.bottom) / 2 };
}

/** Scenes in order, each arriving by its transition, which overlaps the end of the one before. */
export function buildTimeline(spec: VideoSpec, tpl: Template = VIDEO_TEMPLATE): Timeline {
  const scenes: SceneTiming[] = [];
  const transitions: TransitionTiming[] = [];
  let cursor = 0;
  spec.scenes.forEach((s, index) => {
    const kind = index === 0 ? null : (s.transition ?? null);
    if (index > 0 && !kind) throw new Error(`${spec.id}: scene ${s.id} needs a transition`);
    const arrives = kind ? transitionSeconds(kind, tpl) : 0;
    const start = index === 0 ? 0 : ms(cursor - arrives);
    const end = ms(start + s.seconds);
    scenes.push({
      id: s.id,
      index,
      start,
      end,
      zoomStart: index === 0 ? tpl.openingStillSeconds : start,
      arrives,
      transition: kind,
      focus: s.focus ?? safeCentre(tpl),
    });
    if (kind) transitions.push({ kind, from: spec.scenes[index - 1]!.id, to: s.id, start, end: ms(start + arrives), seconds: arrives });
    cursor = end;
  });
  const total = scenes[scenes.length - 1]!.end;
  return {
    spec,
    scenes,
    transitions,
    total,
    frames: Math.round(total * tpl.fps),
    fadeStart: ms(total - tpl.outro.fadeOutSeconds),
  };
}

/** The rules, as a list of what is wrong (empty when the timeline obeys all of them). */
export function timelineProblems(tl: Timeline, tpl: Template = VIDEO_TEMPLATE): string[] {
  const out: string[] = [];
  const fpsFrames = tl.total * tpl.fps;
  if (Math.abs(fpsFrames - Math.round(fpsFrames)) > 1e-6) out.push(`total ${tl.total}s is not a whole number of frames at ${tpl.fps} fps`);
  for (const t of tl.transitions) {
    if (t.seconds > tpl.transitions.maxSeconds + 1e-9) out.push(`${t.kind} into ${t.to} lasts ${t.seconds}s, more than ${tpl.transitions.maxSeconds}s`);
  }
  const first = tl.scenes[0]!;
  const last = tl.scenes[tl.scenes.length - 1]!;
  if (tl.scenes.length < 2) out.push('a video needs at least a scene and the closing wordmark');
  // Each scene must be fully on screen for a moment between its transitions.
  tl.scenes.forEach((s, i) => {
    const leaves = tl.scenes[i + 1]?.arrives ?? 0;
    const clear = ms(s.end - leaves - (s.start + s.arrives));
    if (i === tl.scenes.length - 1) return;
    if (clear < 0.5) out.push(`scene ${s.id} is fully on screen for only ${clear}s`);
  });
  const hold = ms(last.end - tpl.outro.fadeOutSeconds - (last.start + last.arrives));
  if (hold < tpl.outro.minHoldSeconds - 1e-9) out.push(`the closing wordmark holds for ${hold}s before the fade, less than ${tpl.outro.minHoldSeconds}s`);
  if (first.zoomStart < tpl.openingStillSeconds - 1e-9) out.push('the first zoom starts before the opening still has finished');
  if (tpl.openingStillSeconds <= 0) out.push('the video must open on a still');
  if (tpl.openingStillSeconds >= first.end - first.arrives) out.push('the opening still outlasts the first scene');
  return out;
}

/* ── what every scene is doing at time t ───────────────────────────────── */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeInOutSine = (x: number) => (1 - Math.cos(Math.PI * clamp01(x))) / 2;
export const easeInOutCubic = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

export interface LayerState {
  id: string;
  visible: boolean;
  opacity: number;
  /** Horizontal shift in pixels (a swipe). */
  x: number;
  scale: number;
  /** Stacking order: later scenes sit on top of earlier ones. */
  z: number;
  ox: number;
  oy: number;
}
export interface FrameState {
  t: number;
  layers: LayerState[];
  /** 0 = nothing, 1 = the whole frame is the background colour. */
  veil: number;
}

export function frameState(tl: Timeline, t: number, tpl: Template = VIDEO_TEMPLATE): FrameState {
  const layers: LayerState[] = tl.scenes.map((s, i) => {
    const visible = t >= s.start - 1e-9 && (t < s.end - 1e-9 || (i === tl.scenes.length - 1 && t <= s.end + 1e-9));
    let opacity = 1;
    let x = 0;
    if (s.transition && t < s.start + s.arrives) {
      const p = clamp01((t - s.start) / s.arrives);
      if (s.transition === 'dissolve') opacity = easeInOutSine(p);
      else x = Math.round(tpl.width * (1 - easeInOutCubic(p)) * 100) / 100;
    }
    const next = tl.scenes[i + 1];
    if (next?.transition === 'swipe' && t >= next.start) {
      x = -Math.round(tpl.width * easeInOutCubic((t - next.start) / next.arrives) * 100) / 100;
    }
    const zoomed = clamp01((t - s.zoomStart) / (s.end - s.zoomStart));
    const scale = 1 + (tpl.zoom.to - 1) * easeInOutSine(zoomed);
    return { id: s.id, visible, opacity, x, scale: Math.round(scale * 1e6) / 1e6, z: i, ox: s.focus.x, oy: s.focus.y };
  });
  const veil = t <= tl.fadeStart ? 0 : easeInOutSine((t - tl.fadeStart) / tpl.outro.fadeOutSeconds);
  return { t, layers, veil: Math.round(veil * 1e6) / 1e6 };
}

/* ── the page the renderer draws ───────────────────────────────────────── */

/** Dashes and hyphens never appear in post copy (social/DESIGN-SYSTEM.md section 5). */
export const undash = (s: string) => s.replace(/\s*[-‐-―−]\s*/g, ' ').replace(/\s+/g, ' ').trim();
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const gbp = (n: number) => `£${n.toFixed(2)}`;

export const brandline = () => `<div class="brandline">${MARK('mark')}<span>Price<em>Sniffs</em></span></div>`;
/** The closing scene: the mark and the wordmark, nothing else. */
export const outroHtml = () => `<div class="outro">${MARK('outro-mark')}<div class="word">Price<em>Sniffs</em></div></div>`;
export const OUTRO_SCENE = (transition: TransitionKind, seconds: number): SceneSpec => ({ id: 'outro', seconds, transition });

const UNION_JACK = `<svg class="flag" viewBox="0 0 60 30" aria-label="UK flag"><clipPath id="ukS"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="ukT"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#ukS)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#ukT)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>`;

/** The shared look: tokens from the social themes, the stage (the safe box) and the building blocks. */
export function videoCss(theme: ThemeName, tpl: Template = VIDEO_TEMPLATE): string {
  const s = tpl.safe;
  return `
  * { box-sizing: border-box; }
  html { ${THEMES[theme]} --fine: ${theme === 'inverted' ? 'var(--ink-2)' : 'var(--ink-3)'}; }
  html, body { margin: 0; width: ${tpl.width}px; height: ${tpl.height}px; overflow: hidden; background: var(--bg); color: var(--ink);
    font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; }
  em { font-style: normal; color: var(--accent); }
  .scene { position: absolute; left: 0; top: 0; width: ${tpl.width}px; height: ${tpl.height}px; background: var(--bg); overflow: hidden; }
  /* The stage is exactly the safe box, so a layout that fits it is inside the safe box. */
  .stage { position: absolute; left: ${s.left}px; top: ${s.top}px; width: ${s.right - s.left}px; height: ${s.bottom - s.top}px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; text-align: center;
    /* Side padding is the room the zoom needs: 100% of the stage is 5 per cent narrower than the safe box. */
    padding: 0 ${Math.ceil((s.right - s.left) * (1 - 1 / tpl.zoom.to) / 2) + 1}px; }
  #veil { position: absolute; left: 0; top: 0; width: ${tpl.width}px; height: ${tpl.height}px; background: var(--bg); opacity: 0; z-index: 1000; pointer-events: none; }
  .brandline { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 50px; letter-spacing: -0.5px; }
  .brandline .mark { width: 62px; height: 62px; flex: none; }
  .kicker { margin: 0; width: 100%; font-size: 34px; font-weight: 700; letter-spacing: 5px; text-transform: uppercase; color: var(--kicker); }
  .kicker.grey { color: var(--ink-2); overflow-wrap: anywhere; }
  .h { margin: 0; width: 100%; font-size: 88px; font-weight: 700; line-height: 1.05; letter-spacing: -2px; }
  .h.xl { font-size: 104px; }
  .p { margin: 0; width: 100%; font-size: 46px; line-height: 1.3; color: var(--ink-2); }
  .fine { margin: 0; width: 100%; font-size: 30px; line-height: 1.3; color: var(--fine); }
  .date { margin: 0; padding: 10px 26px; border: 2px solid var(--bar); border-radius: 999px; font-size: 30px; font-weight: 700;
    letter-spacing: 2px; text-transform: uppercase; color: var(--ink-2); }
  .card { width: 100%; border-radius: 32px; background: var(--card); border: 2px solid var(--card-line); padding: 30px 36px;
    box-shadow: 0 10px 30px rgba(10,10,11,0.25); color: var(--card-ink); }
  .outro { display: flex; flex-direction: column; align-items: center; gap: 36px; }
  .outro-mark { width: 330px; height: 330px; }
  .outro .word { font-size: 132px; font-weight: 700; letter-spacing: -4px; line-height: 1; }
  ${dealCss()}`;
}

/** The scenes in one page: all stacked, all laid out, ready for window.__apply(state) to place them. */
export function videoDocument(theme: ThemeName, scenes: { id: string; html: string }[], extraCss = '', tpl: Template = VIDEO_TEMPLATE): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="social-size" content="${tpl.width}x${tpl.height}"><style>${videoCss(theme, tpl)}${extraCss}</style></head><body>
${scenes.map((s) => `<div class="scene" id="scene-${s.id}"><div class="stage">${s.html}</div></div>`).join('\n')}
<div id="veil"></div>
<script>
window.__apply = (st) => {
  for (const l of st.layers) {
    const el = document.getElementById('scene-' + l.id);
    el.style.display = l.visible ? 'block' : 'none';
    el.style.opacity = String(l.opacity);
    el.style.zIndex = String(l.z);
    el.style.transformOrigin = l.ox + 'px ' + l.oy + 'px';
    el.style.transform = 'translate(' + l.x + 'px, 0px) scale(' + l.scale + ')';
  }
  document.getElementById('veil').style.opacity = String(st.veil);
};
</script></body></html>`;
}

/* ── Deal of the Day video: 10 seconds, black theme ────────────────────── */

/**
 * Four scenes and 10.000 seconds exactly:
 *   0.0   the opening still (date, headline, bottle, name, saving), motionless to 0.8
 *   2.6   swipe: the two price boxes
 *   5.1   dissolve: "Prices move during the day"
 *   7.4   swipe: PriceSniffs, held to 9.0, then a one second fade to the background
 */
export const DEAL_VIDEO: VideoSpec = {
  id: 'deal-of-the-day',
  theme: VIDEO_TEMPLATE.deal.theme,
  scenes: [
    { id: 'bottle', seconds: 3.0 },
    { id: 'prices', seconds: 3.0, transition: 'swipe' },
    { id: 'note', seconds: 2.7, transition: 'dissolve' },
    OUTRO_SCENE('swipe', 2.6),
  ],
};

export interface DealVideoData {
  name: string;
  sizeMl: number | null;
  brand: string;
  /** The product photo as a data: address (the renderer needs it loaded before the first frame). */
  photo: string;
  shop: string;
  delivered: number;
  msrp: number;
  percent: number;
  /** "Thursday, 8 October 2026" */
  dateLabel: string;
  /** "02:23 UK, 8 Oct 2026" */
  checked: string;
}

function dealCss(): string {
  return `
  .flag { display: inline-block; vertical-align: -0.06em; width: 96px; height: 48px; border-radius: 6px; }
  .photo { position: relative; width: 430px; height: 430px; flex: none; border-radius: 36px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; margin-top: 18px; }
  .photo img { width: 86%; height: 86%; object-fit: contain; border-radius: 12px; }
  .badge { position: absolute; top: -26px; right: -58px; width: 150px; height: 150px; border-radius: 50%; background: #FF3B41; color: #FFFFFF;
    display: flex; flex-direction: column; align-items: center; justify-content: center; box-shadow: 0 0 0 8px var(--bg); transform: rotate(8deg); }
  .badge b { font-size: 51px; line-height: 1; letter-spacing: -1px; }
  .badge span { font-size: 23px; font-weight: 700; letter-spacing: 2px; margin-top: 4px; }
  .who { display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .who .name { margin: 0; font-size: 60px; font-weight: 700; line-height: 1.1; letter-spacing: -0.5px; overflow-wrap: anywhere; }
  .who .brand { margin: 0; font-size: 32px; color: var(--ink-2); letter-spacing: 3px; text-transform: uppercase; overflow-wrap: anywhere; }
  .box { width: 100%; padding: 30px 20px 28px; border-radius: 32px; border: 2px solid #FF3B41; background: #1E0709; }
  .box.best { border-color: #4FB47B; background: #14221B; }
  .box .label { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #FF6A6E; }
  .box .amount { margin: 6px 0 0; white-space: nowrap; font-size: 130px; font-weight: 700; letter-spacing: -3px; line-height: 1.05; color: #FF6A6E; }
  .box .from { margin: 6px 0 0; font-size: 36px; color: var(--ink-2); white-space: nowrap; }
  .box.best .label, .box.best .amount { color: #4FB47B; }
  .savepill { padding: 14px 44px; border-radius: 999px; background: #FF3B41; color: #FFFFFF; font-size: 56px; font-weight: 700; letter-spacing: 1px; }`;
}

/** The scenes of a Deal of the Day video. Every figure comes from the caller, never from here. */
export function dealScenes(d: DealVideoData): { id: string; html: string }[] {
  const name = undash(`${d.name}${d.sizeMl ? ` ${d.sizeMl}ml` : ''}`);
  const brand = undash(d.brand);
  return [
    {
      id: 'bottle',
      html: `${brandline()}
      <p class="date">${esc(d.dateLabel)}</p>
      <h1 class="h" data-fit="1,56">Deal of the Day ${UNION_JACK}</h1>
      <div class="photo" data-box><img src="${d.photo}" alt=""><div class="badge" data-box><span>SAVE</span><b>${d.percent}%</b></div></div>
      <div class="who"><p class="name" data-fit="2,36">${esc(name)}</p><p class="brand" data-fit="2,22">${esc(brand)}</p></div>`,
    },
    {
      id: 'prices',
      html: `<p class="kicker grey" data-fit="2,24">${esc(name)}</p>
      <div class="box" data-box><p class="label">MSRP</p><p class="amount" data-fit="1,60">${gbp(d.msrp)}</p><p class="from">Brand's Current Price</p></div>
      <div class="savepill" data-box>Save ${d.percent}%</div>
      <div class="box best" data-box><p class="label">Cheapest price</p><p class="amount" data-fit="1,60">${gbp(d.delivered)}</p><p class="from" data-fit="1,22">from ${esc(undash(d.shop))}</p></div>
      <p class="fine">Price includes delivery</p>`,
    },
    {
      id: 'note',
      html: `<p class="kicker">Before you buy</p>
      <h2 class="h">Prices move during the day</h2>
      <p class="p">So check before you buy.</p>
      <p class="fine">Price incl. delivery, checked ${esc(d.checked)}</p>`,
    },
    { id: 'outro', html: outroHtml() },
  ];
}
