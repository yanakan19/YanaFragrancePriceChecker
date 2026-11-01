/**
 * Three launch videos for the full US, India and Canada sites (owner request,
 * 1 November 2026: "we've now got US, India and Canada sites"). Each is exactly
 * 10 seconds (the owner wrote "(1s long0"; the earlier launch videos were 10
 * seconds, so 10 is assumed), black theme, made from the shared video template
 * (scripts/social-video-template.ts, rules in docs/SOCIAL-MEDIA-PLAN.md
 * section 9) and drawn by scripts/social-video-launch.ts (`--video us2|in2|ca`).
 *
 * They are three different videos, not one with the country swapped: their own
 * opening, picture idea, accent colour (inside the black theme), products, shops,
 * scene order and wording.
 *
 *   US      a price drop story: the same bottle in two US shops, in dollars. Blue.
 *   India   a rupee story: MRP against the cheapest price, with local shops. Saffron.
 *   Canada  a reveal: the Canadian flag, then a price ladder in Canadian dollars. Red.
 *
 * Each opens on a big, punchy hook that fills the frame (owner request, 1 November 2026,
 * "much more catchy"): the first frame is a finished still (it is the thumbnail), the template's opening
 * still lasts 0.8 s, then a 0.5 s punch (a flash, a pop, a shudder or a sweep, different per country)
 * lands the hook. The punch is drawn through the renderer's `extra` hook, so it is exact frame by frame.
 *
 *   US      "WE'RE NOW IN THE US": blue flash and a pop.
 *   India   "NOW IN INDIA": tricolour bars, a crossed out MRP stamp that slams, a shudder.
 *   Canada  "HELLO, CANADA": a red sweep across the frame and a lift.
 *
 * Every claim on screen is a constant here, rounded in the visitor's favour
 * (counts rounded down, "over" and "under" prices rounded away from the real
 * price, savings rounded down), so it stays true as shops reprice.
 * tests/socialLaunchVideosSites.test.ts and tests/socialLaunchVideosSitesData.test.ts
 * hold each one to the region's own report, catalogue and deals.
 */
import { flagSvg } from '../demo/flags.js';
import { OUTRO_SCENE, VIDEO_TEMPLATE, esc, type VideoSpec } from './social-video-template.js';
import { MARK } from './socialSlides.js';

/** One bottle, one dear shop and one cheap shop, as the site's catalogue lists them. */
export interface PriceExample {
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  /** Shop ids as in the region's report and src/config/retailers.<region>.ts. */
  highShop: string;
  lowShop: string;
  /** The dear shop's price is at least this (the screen says "Over"). */
  highOver: number;
  /** The cheap shop's price is at most this (the screen says "Under"). */
  lowUnder: number;
  /** The gap is at least this (the screen says "Save $N+"). */
  saveOver: number;
  /** The display names of the two shops, as the config spells them. */
  highName: string;
  lowName: string;
}

export const TAG_LINE = 'Tag your friends who’d love to use our site';

/* ── US: the price drop story (blue) ─────────────────────────────────── */

export const SITES_US = {
  address: 'pricesniffs.space/us',
  accent: '#4DA3FF',
  shopsClaim: '20+',
  minShops: 20,
  productsClaim: '20,000+',
  minProducts: 20000,
  examples: [
    {
      brand: 'Tom Ford', name: 'Black Orchid', concentration: 'Parfum', sizeMl: 100,
      highShop: 'dillards', highName: "Dillard's", highOver: 250,
      lowShop: 'fragrance-market', lowName: 'Fragrance Market', lowUnder: 200, saveOver: 100,
    },
    {
      brand: 'Gucci', name: 'Guilty Pour Homme', concentration: 'Parfum', sizeMl: 90,
      highShop: 'ulta', highName: 'Ulta Beauty', highOver: 150,
      lowShop: 'the-perfume-spot', lowName: 'The Perfume Spot', lowUnder: 100, saveOver: 100,
    },
  ] as PriceExample[],
} as const;

/* ── India: the rupee story (saffron) ────────────────────────────────── */

export interface MrpExample {
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  /** The shop that sells it cheapest. */
  shop: string;
  shopName: string;
  /** The shop's stated MRP is at least this (the screen says "MRP over"). */
  mrpOver: number;
  /** Its price is at most this (the screen says "Under"). */
  priceUnder: number;
  /** The saving against MRP is at least this many per cent. */
  saveOverPercent: number;
}

export const SITES_IN = {
  address: 'pricesniffs.space/in',
  accent: '#FF9933',
  shopsClaim: '12+',
  minShops: 12,
  productsClaim: '18,000+',
  minProducts: 18000,
  shops: [
    { id: 'perfume-network', name: 'Perfume Network' },
    { id: 'fridaycharm', name: 'FridayCharm' },
    { id: 'perfume-palace', name: 'Perfume Palace' },
    { id: 'nykaa', name: 'Nykaa' },
    { id: 'scentira', name: 'Scentira' },
    { id: 'aar-fragrances', name: 'AAR Fragrances' },
  ],
  examples: [
    { brand: 'Azzaro', name: 'Chrome For Him', concentration: 'Eau de Toilette', sizeMl: 100, shop: 'perfume-network', shopName: 'Perfume Network', mrpOver: 6500, priceUnder: 4000, saveOverPercent: 45 },
    { brand: 'Montblanc', name: 'Legend For Men', concentration: 'Eau de Parfum', sizeMl: 100, shop: 'perfume-network', shopName: 'Perfume Network', mrpOver: 10000, priceUnder: 6500, saveOverPercent: 40 },
  ] as MrpExample[],
} as const;

/* ── Canada: the reveal (red) ────────────────────────────────────────── */

export interface LadderExample {
  brand: string;
  name: string;
  concentration: string;
  sizeMl: number;
  /** Cheapest first: a shop, its display name, and "under" (at most) or "over" (at least) this price. */
  rungs: { shop: string; shopName: string; bound: 'under' | 'over'; price: number }[];
  /** At least this many shops list the bottle in stock. */
  shopsCompared: number;
}

export const SITES_CA = {
  address: 'pricesniffs.space/ca',
  accent: '#FF3B41',
  shopsClaim: '10',
  minShops: 10,
  productsClaim: '25,000+',
  minProducts: 25000,
  ladder: {
    brand: 'Gucci', name: 'Rush', concentration: 'Eau de Toilette', sizeMl: 75, shopsCompared: 5,
    rungs: [
      { shop: 'discount-fragrances-ca', shopName: 'Discount Fragrances', bound: 'under', price: 60 },
      { shop: 'fragrance-online-co', shopName: 'Fragrance Online Co.', bound: 'under', price: 90 },
      { shop: 'maximum-fragrance', shopName: 'Maximum Fragrance', bound: 'over', price: 130 },
    ],
  } as LadderExample,
} as const;

/** The three site names in the line the owner asked for, in the order on screen. */
export const SITES_LINE = 'We’ve now got US, India and Canada sites';

/* ── pieces ──────────────────────────────────────────────────────────── */

const fmt = (n: number) => n.toLocaleString('en-US');
/** The rupee sign drawn as a shape: Liberation Sans, the brand font, has no ₹. */
const RS = `<svg class="rs" viewBox="0 0 20 26" aria-label="rupees"><path d="M2 3H17M2 9H17M2 3H8Q14 3 14 9T8 15H2L13 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="square" stroke-linejoin="round"/></svg>`;
const inr = (n: number) => `${RS}${fmt(n)}`;
const usd = (n: number) => `$${fmt(n)}`;
const productName = (e: { brand: string; name: string; concentration: string; sizeMl: number }) => `${e.brand} ${e.name} ${e.concentration} ${e.sizeMl}ml`;
const flags = (ids: ('US' | 'IN' | 'CA')[], on: string) =>
  `<div class="flags">${ids.map((id) => `<div class="ft${id === on ? ' on' : ''}" data-box>${flagSvg(id)}</div>`).join('')}</div>`;
const ARROW = `<svg class="arrow" viewBox="0 0 60 70" aria-hidden="true"><path d="M30 4V52M10 34L30 56L50 34" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const tagLine = () => `<p class="tagline" data-fit="3,40">${TAG_LINE}</p>`;
const outro = (address: string) => `<div class="outro">${MARK('outro-mark')}<div class="word">Price<em>Sniffs</em></div><p class="addr" data-box>${address}</p></div>`;

/** Shared by the three videos; each adds its accent on top. */
const SITES_CSS = `
  .stage { gap: 34px; }
  .brandline em, .outro .word em { color: #FF3B41; }
  .h { font-size: 92px; line-height: 1.1; }
  .h.xxl { font-size: 108px; }
  .h.md { font-size: 78px; }
  .rs { display: inline-block; height: 0.74em; width: 0.58em; vertical-align: -0.02em; margin-right: 0.05em; }
  .flag { display: block; width: 100%; height: 100%; border-radius: 18px; }
  .flags { display: flex; gap: 22px; justify-content: center; }
  .ft { width: 240px; height: 160px; border-radius: 20px; box-shadow: 0 0 0 4px var(--card-line); opacity: 0.55; }
  .ft.on { box-shadow: 0 0 0 7px var(--accent); opacity: 1; }
  .ft .flag { border-radius: 20px; }
  .tagline { margin: 0; width: 100%; font-size: 50px; font-weight: 700; line-height: 1.2; }
  .addr { margin: 0; padding: 18px 46px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 50px; font-weight: 700; white-space: nowrap; }
  .pname { margin: 0; width: 100%; font-size: 42px; font-weight: 700; line-height: 1.15; color: var(--ink-2); }
  .fine { font-size: 34px; }
  .at { width: 250px; height: 250px; border-radius: 50%; border: 14px solid var(--accent); display: flex; align-items: center; justify-content: center;
    font-size: 150px; font-weight: 700; line-height: 1; padding-bottom: 14px; color: var(--ink); }
  .stat { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 30px 32px; border-radius: 32px;
    background: var(--card); border: 2px solid var(--card-line); box-shadow: 0 10px 30px rgba(10,10,11,0.25); }
  .stat b { font-size: 132px; line-height: 1; letter-spacing: -3px; color: var(--accent); white-space: nowrap; }
  .stat span { font-size: 48px; line-height: 1.2; color: var(--card-ink); }
  .savepill { padding: 14px 46px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-ink); font-size: 56px; font-weight: 700; white-space: nowrap; }
  /* The openings: a huge hook, a short line under it, and the shapes the punch moves */
  .hook { margin: 0; width: 100%; font-size: 170px; font-weight: 700; line-height: 1; letter-spacing: -4px; }
  .hook span { display: block; }
  .sub { margin: 0; width: 100%; font-size: 52px; font-weight: 700; line-height: 1.2; color: var(--ink-2); }
  .flash { position: absolute; left: -110px; top: -380px; width: 1080px; height: 1920px; background: var(--accent); opacity: 0; pointer-events: none; }
  .sweep { position: absolute; left: -110px; top: -380px; width: 320px; height: 1920px; opacity: 0; pointer-events: none;
    background: linear-gradient(90deg, rgba(255,59,65,0), var(--accent) 50%, rgba(255,59,65,0)); }
  .rule { width: 100%; height: 22px; border-radius: 11px; background: var(--accent); }
  .tri { width: 100%; border-radius: 10px; overflow: hidden; }
  .tri i { display: block; height: 22px; }
  .tri i:nth-child(1) { background: #FF9933; }
  .tri i:nth-child(2) { background: #FFFFFF; }
  .tri i:nth-child(3) { background: #138808; }
  .mrpstamp { padding: 4px 38px 8px; border: 7px solid var(--ink-3); border-radius: 18px; color: var(--ink-3); font-size: 108px; font-weight: 700;
    letter-spacing: 6px; transform: rotate(-6deg); text-decoration: line-through; text-decoration-thickness: 14px; text-decoration-color: var(--accent); }
  .pair { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .pair .pname { font-size: 36px; }
  .pair .barrow p { font-size: 34px; margin-bottom: 6px; }
  .pair .bar { height: 42px; border-radius: 14px; }
  .pair .savepill { font-size: 42px; padding: 8px 34px; }
  /* US: two price tags and a drop between them */
  .tagrow { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 26px 34px; border-radius: 28px;
    background: var(--card); border: 3px solid var(--card-line); }
  .tagrow .shop { font-size: 38px; font-weight: 700; color: var(--ink-2); text-align: left; white-space: nowrap; }
  .tagrow b { font-size: 66px; letter-spacing: -1.5px; white-space: nowrap; }
  .tagrow.was b { color: var(--ink-3); text-decoration: line-through; text-decoration-thickness: 6px; }
  .tagrow.now { border-color: var(--accent); }
  .tagrow.now b { color: var(--accent); }
  .arrow { width: 60px; height: 70px; color: var(--accent); }
  /* India: bars against MRP */
  .bars { width: 100%; display: flex; flex-direction: column; gap: 22px; }
  .barrow { width: 100%; text-align: left; }
  .barrow p { margin: 0 0 10px; font-size: 38px; font-weight: 700; color: var(--ink-2); white-space: nowrap; }
  .barrow p i { font-style: normal; color: var(--ink); }
  .bar { height: 78px; border-radius: 20px; background: var(--bar-rest); }
  .bar.mrp { width: 100%; }
  .bar.low { background: var(--accent); }
  .stamp { padding: 12px 40px; border: 7px solid var(--accent); border-radius: 18px; color: var(--accent); font-size: 96px; font-weight: 700;
    letter-spacing: 6px; transform: rotate(-6deg); }
  .big { margin: 0; font-size: 150px; font-weight: 700; line-height: 1; letter-spacing: -3px; color: var(--accent); white-space: nowrap; }
  .chips { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .chips span { padding: 28px 8px; border-radius: 26px; background: var(--card); border: 2px solid var(--card-line); font-size: 36px; font-weight: 700;
    white-space: nowrap; color: var(--card-ink); }
  .vs { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .vs .old { font-size: 76px; font-weight: 700; color: var(--ink-3); text-decoration: line-through; text-decoration-thickness: 6px; white-space: nowrap; }
  .vs .new { font-size: 110px; font-weight: 700; color: var(--accent); letter-spacing: -2px; white-space: nowrap; }
  .vs small { font-size: 36px; color: var(--ink-2); font-weight: 700; letter-spacing: 3px; text-transform: uppercase; }
  .rows { width: 100%; display: flex; flex-direction: column; gap: 16px; }
  .row { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 22px 30px; border-radius: 26px;
    background: var(--card); border: 2px solid var(--card-line); font-size: 40px; font-weight: 700; color: var(--card-ink); }
  .row.on { border-color: var(--accent); }
  .row.on b { color: var(--accent); }
  .row b { font-size: 52px; letter-spacing: -1px; white-space: nowrap; }
  /* Canada: a ladder, cheapest at the top */
  .ladder { width: 100%; display: flex; flex-direction: column; gap: 18px; }
  .rung { width: 100%; text-align: left; }
  .rung .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .rung .top span { font-size: 38px; font-weight: 700; color: var(--ink-2); white-space: nowrap; }
  .rung .top b { font-size: 58px; letter-spacing: -1px; white-space: nowrap; }
  .rung .bar { height: 54px; }
  .rung.r1 .bar { width: 43%; background: var(--accent); }
  .rung.r1 .top b { color: var(--accent); }
  .rung.r2 .bar { width: 66%; }
  .rung.r3 .bar { width: 100%; }
`;

const accentCss = (hex: string, kicker: string) => `html { --accent: ${hex}; --kicker: ${kicker}; --pill-bg: ${hex}; --dot-on: ${hex}; --row-best: ${hex}; }`;

/* ── the opening punch ───────────────────────────────────────────────── */

/**
 * The template holds the first frame still until `openingStillSeconds` (0.8 s), so the thumbnail is the finished hook.
 * The punch then runs for 0.5 s (the longest any motion may last): `s` goes from 0 to 1, and null means at rest.
 */
export const PUNCH = { start: VIDEO_TEMPLATE.openingStillSeconds, seconds: 0.5 } as const;
export const punchAt = (t: number): { s: number } | null => {
  const s = (t - PUNCH.start) / PUNCH.seconds;
  return s > 0 && s < 1 ? { s: Math.round(s * 1000) / 1000 } : null;
};
/** The scene's own script: `body` sets styles from pulse (0 to 1 to 0), decay (1 to 0), s and on; with no punch every value is at rest. */
const punchScript = (body: string) =>
  `<script>window.__extra=(x)=>{const q=(i)=>document.getElementById(i);const on=!!x;const s=on?x.s:0;const pulse=on?Math.sin(Math.PI*s):0;const decay=on?(1-s)*(1-s):0;${body}};</script>`;

/* ── US video ────────────────────────────────────────────────────────── */

const dropScene = (id: string, kicker: string, headline: string, e: PriceExample) => ({
  id,
  html: `<p class="kicker">${esc(kicker)}</p>
      <h2 class="h" data-fit="2,60">${headline}</h2>
      <p class="pname" data-fit="2,32">${esc(productName(e))}</p>
      <div class="tagrow was" data-box><span class="shop" data-fit="1,24">${esc(e.highName)}</span><b>Over ${usd(e.highOver)}</b></div>
      ${ARROW}
      <div class="tagrow now" data-box><span class="shop" data-fit="1,24">${esc(e.lowName)}</span><b>Under ${usd(e.lowUnder)}</b></div>
      <div class="savepill" data-box>Save ${usd(e.saveOver)}+</div>`,
});

/** The US hook: huge, blue flash and a pop on the beat. Frame 0 is the finished picture. */
const usHook = () => ({
  id: 'now-us',
  html: `<div class="flash" id="us-flash" data-bleed></div>
      <div class="ft on" id="us-flag" style="width:255px;height:170px;opacity:1" data-box>${flagSvg('US')}</div>
      <h1 class="hook" id="us-hook" style="font-size:192px" data-fit="4,110">WE’RE<br>NOW IN<br>THE <em>US</em></h1>
      <div class="rule" data-box></div>
      <p class="sub" data-fit="2,34">${SITES_US.shopsClaim} shops, ${SITES_US.productsClaim} products<br>all in dollars</p>
      ${punchScript(`q('us-flash').style.opacity=String(0.5*decay);q('us-hook').style.transform='scale('+(1+0.07*pulse)+')';q('us-flag').style.transform='scale('+(1+0.16*pulse)+') rotate('+(-7*pulse)+'deg)';`)}`,
});

/** The US video: 10 seconds, 300 frames. The hook, the two drops, then the three sites and the tag. */
export const US_SITES_VIDEO = {
  folder: 'launch-us-2',
  file: 'launch-us-2-9x16.mp4',
  spec: {
    id: 'launch-us-2',
    theme: VIDEO_TEMPLATE.launch.theme,
    scenes: [
      { id: 'now-us', seconds: 2.3 },
      { id: 'drop-a', seconds: 2.3, transition: 'dissolve' },
      { id: 'drop-b', seconds: 2.3, transition: 'swipe' },
      { id: 'sites', seconds: 2.3, transition: 'dissolve' },
      OUTRO_SCENE('swipe', 2.6),
    ],
  } as VideoSpec,
  css: accentCss(SITES_US.accent, '#8CC4FF'),
  extra: punchAt,
  scenes: (): { id: string; html: string }[] => [
    usHook(),
    dropScene('drop-a', 'Same bottle, two prices', 'Over <em>$100</em> less<br>for the same perfume', SITES_US.examples[0]!),
    dropScene('drop-b', 'And another one', 'Same again.<br>Another <em>$100</em> off', SITES_US.examples[1]!),
    {
      id: 'sites',
      html: `<h2 class="h xxl" data-fit="3,64">We’ve now got<br><em>US</em>, India and<br>Canada sites</h2>
      ${flags(['US', 'IN', 'CA'], 'US')}
      ${tagLine()}
      <p class="fine">Prices before sales tax</p>`,
    },
    { id: 'outro', html: outro(SITES_US.address) },
  ],
};

/* ── India video ─────────────────────────────────────────────────────── */

const mrpPair = (e: MrpExample) => `<div class="pair" data-box>
        <p class="pname" data-fit="1,22">${esc(productName(e))}</p>
        <div class="barrow"><p>MRP <i>over ${inr(e.mrpOver)}</i></p><div class="bar mrp"></div></div>
        <div class="barrow"><p>${esc(e.shopName)} <i>under ${inr(e.priceUnder)}</i></p><div class="bar low" style="width:58%"></div></div>
        <div class="savepill" data-box>Save ${e.saveOverPercent}%+</div>
      </div>`;

/** The India hook: tricolour bars, a crossed out MRP stamp that slams down, and a shudder. */
const inHook = () => ({
  id: 'now-in',
  html: `<div class="flash" id="in-flash" data-bleed></div>
      <div class="tri" id="in-top" data-box><i></i><i></i><i></i></div>
      <div class="mrpstamp" id="in-stamp" data-box>MRP</div>
      <h1 class="hook" id="in-hook" style="font-size:218px" data-fit="3,110"><span id="in-l1">NOW IN</span><span id="in-l2"><em>INDIA</em></span></h1>
      <div class="tri" id="in-bottom" data-box><i></i><i></i><i></i></div>
      <p class="sub" style="font-size:70px" data-fit="1,34">Why pay full MRP?</p>
      ${punchScript(`q('in-flash').style.opacity=String(0.35*decay);const w=Math.sin(2*Math.PI*s)*(1-s)*(on?1:0);q('in-l1').style.transform='translateX('+(46*w)+'px)';q('in-l2').style.transform='translateX('+(-46*w)+'px)';q('in-stamp').style.transform='rotate('+(-6-8*pulse)+'deg) scale('+(1+0.4*pulse)+')';q('in-top').style.transform='scaleX('+(1-0.3*pulse)+')';q('in-bottom').style.transform='scaleX('+(1-0.3*pulse)+')';`)}`,
});

/** The India video: 10 seconds. The hook, MRP against the price, local shops, then the tag with the three sites. */
export const IN_SITES_VIDEO = {
  folder: 'launch-india-2',
  file: 'launch-india-2-9x16.mp4',
  spec: {
    id: 'launch-in-2',
    theme: VIDEO_TEMPLATE.launch.theme,
    scenes: [
      { id: 'now-in', seconds: 2.3 },
      { id: 'mrp', seconds: 2.4, transition: 'swipe' },
      { id: 'shops', seconds: 2.3, transition: 'dissolve' },
      { id: 'tag', seconds: 2.1, transition: 'swipe' },
      OUTRO_SCENE('swipe', 2.6),
    ],
  } as VideoSpec,
  css: accentCss(SITES_IN.accent, '#FFB870'),
  extra: punchAt,
  scenes: (): { id: string; html: string }[] => [
    inHook(),
    {
      id: 'mrp',
      html: `<p class="kicker">India, in rupees</p>
      <h2 class="h md" data-fit="1,56">Pay under <em>MRP</em></h2>
      ${SITES_IN.examples.map(mrpPair).join('')}`,
    },
    {
      id: 'shops',
      html: `<p class="kicker">Local shops, one place</p>
      <h2 class="h" data-fit="2,60">Compare <em>${SITES_IN.shopsClaim}</em><br>Indian shops</h2>
      <div class="stat" data-box><b>${SITES_IN.productsClaim}</b><span>products, GST included</span></div>
      <div class="chips">${SITES_IN.shops.map((s) => `<span data-box>${esc(s.name)}</span>`).join('')}</div>`,
    },
    {
      id: 'tag',
      html: `<div class="at" data-box>@</div>
      <h2 class="h md" data-fit="2,48">${esc(SITES_LINE)}</h2>
      ${flags(['US', 'IN', 'CA'], 'IN')}
      ${tagLine()}`,
    },
    { id: 'outro', html: outro(SITES_IN.address) },
  ],
};

/* ── Canada video ────────────────────────────────────────────────────── */

/** The Canada video: 10 seconds. The hook, the three sites, the ladder, then the numbers and the tag. */
export const CA_SITES_VIDEO = {
  folder: 'launch-canada',
  file: 'launch-canada-9x16.mp4',
  spec: {
    id: 'launch-ca',
    theme: VIDEO_TEMPLATE.launch.theme,
    scenes: [
      { id: 'hello-ca', seconds: 2.4 },
      { id: 'sites', seconds: 2.3, transition: 'dissolve' },
      { id: 'ladder', seconds: 2.2, transition: 'swipe' },
      { id: 'tag', seconds: 2.2, transition: 'swipe' },
      OUTRO_SCENE('swipe', 2.6),
    ],
  } as VideoSpec,
  css: accentCss(SITES_CA.accent, '#FF6A6E'),
  extra: punchAt,
  scenes: (): { id: string; html: string }[] => {
    const l = SITES_CA.ladder;
    return [
      {
        id: 'hello-ca',
        html: `<div class="flash" id="ca-flash" data-bleed></div>
      <div class="sweep" id="ca-sweep" data-bleed></div>
      <div class="ft on" id="ca-flag" style="width:450px;height:300px;opacity:1" data-box>${flagSvg('CA')}</div>
      <h1 class="hook" id="ca-hook" style="font-size:188px" data-fit="3,110"><span>HELLO,</span><span><em>CANADA</em></span></h1>
      <p class="sub" style="font-size:62px" data-fit="2,34">PriceSniffs Canada is here</p>
      ${punchScript(`q('ca-flash').style.opacity=String(0.22*decay);const sw=q('ca-sweep');sw.style.opacity=on?'0.9':'0';sw.style.transform='translateX('+(-340+1560*s)+'px) skewX(-16deg)';q('ca-hook').style.transform='translateY('+(-24*pulse)+'px) scale('+(1+0.05*pulse)+')';q('ca-flag').style.transform='scale('+(1+0.12*pulse)+')';`)}`,
      },
      {
        id: 'sites',
        html: `<p class="kicker">Three sites now</p>
      ${flags(['US', 'IN', 'CA'], 'CA')}
      <h2 class="h" data-fit="3,60">We’ve now got<br>US, India and<br><em>Canada</em> sites</h2>`,
      },
      {
        id: 'ladder',
        html: `<p class="kicker">Canadian dollars</p>
      <h2 class="h md" data-fit="2,52">One bottle,<br><em>${l.shopsCompared}</em> shops</h2>
      <p class="pname" data-fit="2,32">${esc(productName(l))}</p>
      <div class="ladder">${l.rungs
        .map((r, i) => `<div class="rung r${i + 1}" data-box><div class="top"><span>${esc(r.shopName)}</span><b>${r.bound === 'under' ? 'Under' : 'Over'} ${usd(r.price)}</b></div><div class="bar"></div></div>`)
        .join('')}</div>`,
      },
      {
        id: 'tag',
        html: `<div class="stat" data-box><b>${SITES_CA.shopsClaim}</b><span>Canadian shops, ${SITES_CA.productsClaim} products</span></div>
      <div class="at" data-box>@</div>
      ${tagLine()}
      <p class="fine">Prices before tax</p>`,
      },
      { id: 'outro', html: outro(SITES_CA.address) },
    ];
  },
};

export const SITES_VIDEOS = { us2: US_SITES_VIDEO, in2: IN_SITES_VIDEO, ca: CA_SITES_VIDEO } as const;
export const SITES_CSS_ALL = SITES_CSS;
export const sitesCss = (key: keyof typeof SITES_VIDEOS) => SITES_CSS + SITES_VIDEOS[key].css;
