/**
 * Shared building blocks for social carousels (3:4 feed slides, 1080 x 1440):
 * the logo mark and tick icons, the two themes (standard and inverted, see
 * social/DESIGN-SYSTEM.md section 1), the slide CSS and the slide frame
 * (wordmark at the top, progress dots and a swipe hint at the bottom).
 */
import { FIT_SCRIPT } from './socialRender.js';

export const W = 1080;
export const H = 1440;

/** The logo mark in the theme's colours: --mark-ring for the glass, --mark-bottle for the bottle. */
export const MARK = (cls: string) =>
  `<svg class="${cls}" viewBox="240 240 610 610" aria-hidden="true"><circle cx="478" cy="478" r="196" fill="none" stroke="var(--mark-ring)" stroke-width="58"/><line x1="636" y1="636" x2="796" y2="796" stroke="var(--mark-ring)" stroke-width="72" stroke-linecap="round"/><g fill="var(--mark-bottle)"><rect x="452" y="366" width="52" height="42" rx="9"/><rect x="463" y="402" width="30" height="26"/><rect x="398" y="422" width="160" height="164" rx="34"/></g></svg>`;

/** A red ring with a white tick: the bullet used on every slide. */
export const TICK = `<svg class="tick" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--icon)" stroke-width="7"/><path d="M20 33 l8 8 l16 -17" fill="none" stroke="var(--icon-inner)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * The two social themes (social/DESIGN-SYSTEM.md section 1). STANDARD is the
 * site's own look and is used by Deal of the Day; INVERTED is for one off
 * posts so they stand out in the grid: red background, black icons and type.
 * Black on this red is about 6:1 contrast, so body text stays black; white is
 * kept for large type only ("Sniffs").
 */
export const THEMES = {
  standard: `--bg:#0A0A0B; --ink:#F7F7F8; --ink-2:#B9B9C0; --ink-3:#8A8A93; --accent:#FF3B41; --kicker:#FF6A6E;
    --card:#121214; --card-line:#26262B; --icon:#FF3B41; --icon-inner:#F7F7F8; --mark-ring:#FF3B41; --mark-bottle:#F7F7F8;
    --bar:#3A3A40; --bar-best:#4FB47B; --tag-bg:#1E0709; --tag-ink:#FF6A6E; --pill-bg:#FF3B41; --pill-ink:#0A0A0B; --dot:#3A3A40; --dot-on:#FF3B41;
    --card-ink:#F7F7F8; --card-ink-2:#B9B9C0; --card-ink-3:#8A8A93; --row-line:#1E1E22; --row-best:#FF3B41; --bar-rest:#5A5A62;`,
  // Cards are near black so they pop off the red; inside them the standard
  // theme's light type and red ticks come back so they stay readable.
  inverted: `--bg:#FF3B41; --ink:#0A0A0B; --ink-2:rgba(10,10,11,0.78); --ink-3:rgba(10,10,11,0.6); --accent:#FFFFFF; --kicker:#0A0A0B;
    --card:#141416; --card-line:#0A0A0B; --icon:#FF3B41; --icon-inner:#F7F7F8; --mark-ring:#0A0A0B; --mark-bottle:#0A0A0B;
    --bar:#3A3A40; --bar-best:#FF3B41; --tag-bg:#FF3B41; --tag-ink:#0A0A0B; --pill-bg:#0A0A0B; --pill-ink:#FF3B41; --dot:rgba(10,10,11,0.3); --dot-on:#0A0A0B;
    --card-ink:#F7F7F8; --card-ink-2:#B9B9C0; --card-ink-3:#8A8A93; --row-line:#26262B; --row-best:#FF3B41; --bar-rest:#5A5A62;`,
};

export const slideCss = (theme: keyof typeof THEMES) => `
  * { box-sizing: border-box; }
  html { ${THEMES[theme]} }
  html, body { margin: 0; width: ${W}px; height: ${H}px; background: var(--bg); color: var(--ink);
    font-family: 'Liberation Sans', Arial, Helvetica, sans-serif; }
  main { height: 100%; padding: 80px 90px 70px; display: flex; flex-direction: column; align-items: center;
    justify-content: space-between; text-align: center; }
  .brandline { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 44px; letter-spacing: -0.5px; }
  .brandline .mark { width: 58px; height: 58px; flex: none; }
  em { font-style: normal; color: var(--accent); }
  .body { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 34px; }
  .kicker { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: var(--kicker); }
  h1 { margin: 0; width: 100%; font-size: 84px; line-height: 1.1; letter-spacing: -1px; }
  .sub { margin: 0; font-size: 40px; line-height: 1.35; color: var(--ink-2); }
  .list { width: 100%; max-width: 860px; display: flex; flex-direction: column; gap: 30px; text-align: left; }
  .item { display: flex; align-items: center; gap: 28px; padding: 26px 30px; border-radius: 28px;
    background: var(--card); border: 2px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .tick { flex: none; width: 64px; height: 64px; }
  .item p { margin: 0; font-size: 38px; line-height: 1.3; color: var(--card-ink); }
  .item b { display: block; font-size: 42px; margin-bottom: 4px; }
  .item span { color: var(--card-ink-2); font-size: 32px; }
  .big-mark { width: 380px; height: 380px; }
  .foot { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .dots { display: flex; gap: 12px; }
  .dots i { width: 14px; height: 14px; border-radius: 50%; background: var(--dot); }
  .dots i.on { background: var(--dot-on); }
  .swipe { font-size: 30px; font-weight: 700; color: var(--ink-2); }
  .pill { padding: 22px 52px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 46px; font-weight: 700; }
  .rows { width: 100%; max-width: 820px; border-radius: 28px; background: var(--card); border: 2px solid var(--card-line); padding: 10px 0; box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .row { display: flex; align-items: center; justify-content: space-between; padding: 22px 30px; border-bottom: 2px solid var(--row-line); }
  .row:last-child { border-bottom: 0; }
  .row.best { border-left: 6px solid var(--row-best); }
  .shop { display: flex; align-items: center; gap: 16px; }
  .bar { height: 22px; border-radius: 11px; background: var(--bar); }
  .tag { font-size: 20px; font-weight: 700; letter-spacing: 2px; color: var(--tag-ink); background: var(--tag-bg); border-radius: 8px; padding: 6px 10px; }
  .price { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .price .bar { background: var(--bar-best); }
  .row:not(.best) .price .bar { background: var(--bar-rest); }
  .note { font-size: 20px; color: var(--card-ink-3); letter-spacing: 1px; text-transform: uppercase; }
`;

/**
 * Reel safe box (social/DESIGN-SYSTEM.md section 4): the part of a 3:4 slide
 * that survives every crop Instagram applies if the slides are turned into a
 * reel. Edits fills a 9:16 frame with the slide, keeping the middle 810px of
 * its width (x 135 to 945); the feed then shows the reel at 4:5 (y 214 to
 * 1226) and the profile grid at 3:4 (y 180 to 1260). The box sits 15px
 * inside all of those.
 */
export const SAFE = { x: 150, y: 230, w: 780, h: 980 };
/** How much the slide's layout is scaled down to sit in the safe box. */
const SAFE_SCALE = 0.78;
// The padding keeps text clear of the crop edge; small print is set larger
// so it stays readable after the scale down.
const safeCss = `main { position: absolute; left: ${SAFE.x}px; top: ${SAFE.y}px; padding: 24px 56px;
    width: ${Math.round(SAFE.w / SAFE_SCALE)}px; height: ${Math.round(SAFE.h / SAFE_SCALE)}px;
    transform: scale(${SAFE_SCALE}); transform-origin: 0 0; }
  main .fine, main .note2 { font-size: 26px; }`;

export function slide(n: number, total: number, inner: string, footRight: string, theme: keyof typeof THEMES = 'inverted', extraCss = '', reelSafe = false): string {
  const dots = Array.from({ length: total }, (_, i) => `<i class="${i + 1 === n ? 'on' : ''}"></i>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="social-size" content="${W}x${H}"><style>${slideCss(theme)}${reelSafe ? safeCss : ''}${extraCss}</style></head><body><main>
  <div class="brandline">${MARK('mark')}<span>Price<em>Sniffs</em></span></div>
  <div class="body">${inner}</div>
  <div class="foot"><div class="dots">${dots}</div><span class="swipe">${footRight}</span></div>
</main>${FIT_SCRIPT}</body></html>`;
}

/** TikTok photo posts and reels are 9:16. */
export const H_TIKTOK = 1920;

/**
 * The 9:16 (1080 x 1920) TikTok version of a reel safe 3:4 slide: the same
 * slide content on a taller canvas of the same background, a little larger
 * than on the 3:4 (TikTok crops nothing, so the box can use more width).
 * The box lands at x 110 to 970 and y 380 to 1460: clear of TikTok's tabs at
 * the top, its caption and buttons at the bottom and its icons down the
 * right. social/DESIGN-SYSTEM.md section 4.
 */
export function tiktokSlide(html: string): string {
  const scale = 0.86;
  const w = Math.round((SAFE.w / SAFE_SCALE) * scale);
  const h = Math.round((SAFE.h / SAFE_SCALE) * scale);
  const left = Math.round((W - w) / 2);
  const top = Math.round((H_TIKTOK - h) / 2) - 40;
  return html.replace(
    '</head>',
    `<style>html, body { height: ${H_TIKTOK}px; } main { left: ${left}px; top: ${top}px; transform: scale(${scale}); }</style></head>`,
  );
}
