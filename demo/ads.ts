/**
 * Display advertising: every setting in one place, and everything that can be
 * decided without a browser.
 *
 * ── The switch ───────────────────────────────────────────────────────────────
 * Ads ship switched off. They turn on when ADSENSE_CLIENT holds a publisher id
 * and at least one of AD_SLOTS holds the ad unit id Google gives for that
 * place. Until then:
 *   - no ad markup is rendered (adSlotHtml returns '', interleaveAds returns
 *     the list untouched),
 *   - no ad style is added to the page (adStyles is only installed when on),
 *   - no ad script is loaded and no request goes to Google (demo/adsRuntime.ts
 *     returns before touching the document),
 *   - the legal pages say there is no advertising (legal.ts reads ADS_ON),
 * so the site looks and behaves exactly as it did before this file existed.
 * tests/ads.test.ts holds each of those true.
 *
 * The publisher id is already set, deliberately: Google's site review needs
 * the verification meta tag in every page head and /ads.txt naming the
 * account (both generated from ADSENSE_CLIENT by scripts/build-demo.ts), and
 * neither loads anything or shows anything. A publisher id is public by
 * design, printed in the page source of every site that shows AdSense. The
 * slot ids stay blank until Google approves the site and the owner creates
 * the ad units: see "Switching on ads" in docs/OWNER-STEPS.md.
 *
 * ── Where ads may go, and where they never go ────────────────────────────────
 *   - 'home':    one wide banner directly under the home page's Most Stocked
 *                section, as wide as its grid (six 168px tiles and their gaps,
 *                1068px, on a wide desktop; the full content width on a phone,
 *                under the swipe row). A horizontal responsive ad unit: the
 *                shape of a 970x90 or 728x90 leaderboard on desktop and of a
 *                320x100 banner on a phone. 90px high on desktop, 100px on a
 *                phone, reserved only when the slot is going to show.
 *   - 'grid':    one tile in a browse grid roughly every ten product tiles
 *                (a random gap of 8 to 12, see adPositions), never in the
 *                first row. A square responsive ad unit, sized by the tile.
 *   - 'product': one block under a perfume's whole price list, below every
 *                offer section, never above the prices or the price boxes.
 *                A horizontal responsive ad unit, 280px high.
 * There is no sidebar slot: the only side column on the site is the product
 * page's price rail, which holds the price boxes, and ads never go there.
 * Never in the top navigation, the hero, a price box, an offer row, an email
 * or a social post. Ads are never part of a ranking: they are added to a list
 * after it has been sorted, and take no part in the sort.
 *
 * Every ad carries the word "Advertisement" in small text above it, in a
 * plain frame unlike a product tile or an offer row: no price styling, no
 * Cheapest tag, no shop mark.
 *
 * ── Preview ──────────────────────────────────────────────────────────────────
 * `?adpreview=1` on any address draws every slot (all three, whether or not
 * its slot id is filled in) as the same labelled dashed frame with its size
 * written in it, and nothing else: no `<ins>`, no Google script, no request.
 * It exists so the owner can see the layout before ads are switched on. It is
 * held in memory for that page view only (never in storage), the page marks
 * itself noindex while it is on (head.ts withPreviewNoindex), and the
 * canonical address never carries it.
 */

/** The AdSense publisher id, `ca-pub-` and sixteen digits. '' switches every ad off. */
export const ADSENSE_CLIENT: string = 'ca-pub-6298711915135064';

/** Where an ad can appear. See the header for why there is no sidebar. */
export type AdPlacement = 'home' | 'grid' | 'product';

/**
 * The ad unit id for each placement, the digits AdSense shows as
 * `data-ad-slot` when an ad unit is created. A blank one keeps that placement
 * empty; all blank keeps ads off altogether.
 */
export const AD_SLOTS: Readonly<Record<AdPlacement, string>> = {
  home: '',
  grid: '',
  product: '',
};

/**
 * The date the slot ids above were filled in, written as the legal pages
 * write dates ("3 October 2026"). The privacy and cookie pages gain an
 * advertising section the day ads switch on, so their "Last updated" line
 * moves to this date then, and not before.
 */
export const ADS_SWITCHED_ON: string = '';

/**
 * The gap between grid ads, in product tiles: each one is drawn from
 * GRID_AD_MIN_GAP to GRID_AD_MAX_GAP inclusive, so they average about ten.
 */
export const GRID_AD_MIN_GAP = 8;
export const GRID_AD_MAX_GAP = 12;

/**
 * The first grid ad comes after at least this many product tiles: two full
 * rows at six across, and past the first row at every column count (the widest
 * is WIDEST_ROW). It is drawn from GRID_AD_FIRST_MIN to GRID_AD_FIRST_MIN + 4.
 */
export const GRID_AD_FIRST_MIN = 16;

/**
 * The widest row a grid can have: the largest tiles per row choice in
 * demo/tileDensity.ts. The first grid ad comes after more tiles than this, so
 * it is never in the first row at any width or column count, including after
 * the reader changes the count without a fresh render.
 */
export const WIDEST_ROW = 10;

/** Everything the switch reads, so tests can try a configuration without editing this file. */
export interface AdConfig {
  client: string;
  slots: Readonly<Record<AdPlacement, string>>;
  /** Overrides the page's preview state, for tests. Absent: follow `adPreviewOn()`. */
  preview?: boolean;
}

export const AD_CONFIG: AdConfig = { client: ADSENSE_CLIENT, slots: AD_SLOTS };

/** The address parameter that turns the layout preview on. */
export const AD_PREVIEW_PARAM = 'adpreview';

let previewState = false;

/** Whether a query string (`?adpreview=1&…`) asks for the preview. Only the exact value 1 does. */
export function adPreviewRequested(search: string): boolean {
  return new URLSearchParams(search).get(AD_PREVIEW_PARAM) === '1';
}

/**
 * Turns the preview on or off for this page view. Held in memory only: a
 * reload without the parameter in the address is a page without a preview,
 * and nothing is written to storage or a cookie.
 */
export function setAdPreview(on: boolean): void {
  previewState = on;
}

/** True while the preview is on. */
export function adPreviewOn(): boolean {
  return previewState;
}

function previewing(cfg: AdConfig): boolean {
  return cfg.preview ?? previewState;
}

/**
 * The path with the preview parameter kept on it while the preview is on, so
 * the address the app writes as the reader moves about still opens the
 * preview if it is reloaded. The path is returned as it came when the
 * preview is off.
 */
export function withAdPreview(path: string, on: boolean = previewState): string {
  if (!on) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${AD_PREVIEW_PARAM}=1`;
}

const CLIENT_RE = /^ca-pub-\d{16}$/;
const SLOT_RE = /^\d{6,20}$/;

/** True when the publisher id is a well formed one. */
export function hasPublisherId(cfg: AdConfig = AD_CONFIG): boolean {
  return CLIENT_RE.test(cfg.client);
}

/** True when this placement would show an ad: a publisher id and its own slot id. */
export function placementOn(placement: AdPlacement, cfg: AdConfig = AD_CONFIG): boolean {
  return hasPublisherId(cfg) && SLOT_RE.test(cfg.slots[placement]);
}

/**
 * True when a placement is drawn at all: it would show an ad, or the preview
 * is on and it shows its frame. Everything that reserves space or adds a
 * marker asks this, so with ads off and no preview nothing is ever added.
 */
export function placementShown(placement: AdPlacement, cfg: AdConfig = AD_CONFIG): boolean {
  return placementOn(placement, cfg) || previewing(cfg);
}

/** True when any ad at all can appear on the site. */
export function adsOn(cfg: AdConfig = AD_CONFIG): boolean {
  return (Object.keys(cfg.slots) as AdPlacement[]).some((p) => placementOn(p, cfg));
}

/** The one flag the rest of the site reads: legal pages, styles, runtime. */
export const ADS_ON = adsOn();

/** `pub-…`, the form ads.txt uses, or null without a publisher id. */
export function publisherId(cfg: AdConfig = AD_CONFIG): string | null {
  return hasPublisherId(cfg) ? cfg.client.slice('ca-'.length) : null;
}

/**
 * The contents of /ads.txt, or null when there is no publisher id and the
 * file should not exist. f08c47fec0942fa0 is Google's own certification
 * authority id, the same for every AdSense publisher.
 */
export function adsTxt(cfg: AdConfig = AD_CONFIG): string | null {
  const pub = publisherId(cfg);
  return pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : null;
}

/** Google's site verification tag for every page head, or '' without a publisher id. */
export function verificationMeta(cfg: AdConfig = AD_CONFIG): string {
  return hasPublisherId(cfg) ? `<meta name="google-adsense-account" content="${cfg.client}" />` : '';
}

/** The ad script's address, loaded only once a slot is on the page. */
export function adScriptUrl(cfg: AdConfig = AD_CONFIG): string {
  return `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.client)}`;
}

/**
 * Google's consent message loader (Funding Choices, the tool behind AdSense
 * "Privacy & messaging"), for the publisher id. Added to the page only when
 * ads are on (demo/adsRuntime.ts installConsent), before the ad script, and
 * never otherwise: with ads off nothing on this site contacts that host.
 * It serves the message the owner publishes in AdSense and the IAB TCF API
 * the ad requests wait for. Null without a well formed publisher id.
 */
export function consentLoaderUrl(cfg: AdConfig = AD_CONFIG): string | null {
  const pub = publisherId(cfg);
  return pub ? `https://fundingchoicesmessages.google.com/i/${encodeURIComponent(pub)}?ers=1` : null;
}

/** The footer link that opens the consent choices again. Shown only with ads on. */
export const CONSENT_LINK_LABEL = 'Privacy and Cookie Choices';

/**
 * The footer list item for that link, or '' with ads off. It is a real link to
 * the privacy section, so it still works if Google's message is not there
 * (not published yet, blocked): the click handler in demo/app.ts calls
 * openConsentChoices (demo/adsRuntime.ts) first and only lets the link
 * navigate when that finds no message to open.
 */
export function consentLinkHtml(cfg: AdConfig = AD_CONFIG): string {
  if (!adsOn(cfg)) return '';
  return `<li><a class="footer-link" href="/about/legal#privacy" data-goto="legalNotice" data-anchor="privacy" data-ps-consent>${CONSENT_LINK_LABEL}</a></li>`;
}

/** What each placement is called and the ad unit it implies, as the preview prints it. */
const PLACEMENT_SPEC: Readonly<Record<AdPlacement, string>> = {
  home: 'Home banner · horizontal, 970 × 90 or 728 × 90, 320 × 100 on phones',
  grid: 'Grid tile · square, sized to one product tile',
  product: 'Product page · horizontal, 280 px tall',
};

/**
 * One ad's markup, or '' when that placement is not drawn. The `<ins>` is
 * what Google fills; demo/adsRuntime.ts asks for it only when it nears the
 * screen. It is sized by its frame (see AD_STYLES), not by Google's
 * responsive sizing, so the space is reserved before anything arrives and
 * nothing moves when it does. aria-hidden is not used: the label must be read
 * out, and the ad itself is Google's to make accessible.
 *
 * With the preview on, the frame is drawn in place of the ad, with no `<ins>`:
 * nothing for Google's script to find and nothing to request.
 */
export function adSlotHtml(placement: AdPlacement, cfg: AdConfig = AD_CONFIG): string {
  const preview = previewing(cfg);
  if (!preview && !placementOn(placement, cfg)) return '';
  const label = '<p class="ps-ad-label">Advertisement</p>';
  const format = placement === 'grid' ? '' : ' data-ad-format="horizontal"';
  const inner = preview
    ? `<p class="ps-ad-spec">${PLACEMENT_SPEC[placement]}</p><p class="ps-ad-live" data-ps-live></p>`
    : `<ins class="adsbygoogle ps-ad-ins" data-ad-client="${cfg.client}" data-ad-slot="${cfg.slots[placement]}"${format}></ins>`;
  const well = `<div class="ps-ad-well">${inner}</div>`;
  const mod = preview ? ' ps-ad-preview' : '';
  if (placement === 'grid') {
    return `<li class="ps-ad ps-ad-tile${mod}"><div class="ps-ad-frame">${label}${well}</div></li>`;
  }
  return `<div class="ps-ad ps-ad-${placement === 'home' ? 'home' : 'block'}${mod}">${label}${well}</div>`;
}

/** The marker interleaveAds puts where a grid ad goes. */
export interface GridAd {
  readonly psGridAd: true;
}
const GRID_AD: GridAd = Object.freeze({ psGridAd: true as const });

export function isGridAd(x: unknown): x is GridAd {
  return x === GRID_AD;
}

/** A 32 bit hash of a string (FNV-1a, then a murmur style finish so near seeds differ). */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * How many product tiles come between grid ad number `slot` (1, 2, 3, ...) and
 * the one before it, for the list with this seed. The first is drawn from 16
 * to 20 (GRID_AD_FIRST_MIN), every later one from 8 to 12. Nothing here reads
 * the list, only its seed and the slot number, so a slot never moves when the
 * list is scrolled, drawn again, windowed, or got back to with Back.
 */
export function adGap(seed: string, slot: number): number {
  const draw = hash32(`${seed}#${slot}`) % (GRID_AD_MAX_GAP - GRID_AD_MIN_GAP + 1);
  return (slot === 1 ? GRID_AD_FIRST_MIN : GRID_AD_MIN_GAP) + draw;
}

/**
 * Where the grid ads go in a list of `total` product tiles: each number is how
 * many product tiles come before that ad. Ascending, every one below `total`
 * (so an ad is never last and always sits between tiles), and a prefix of what
 * a longer list with the same seed gets, so growing the list never moves one.
 */
export function adPositions(total: number, seed: string): number[] {
  const out: number[] = [];
  let at = 0;
  for (let slot = 1; ; slot++) {
    at += adGap(seed, slot);
    if (at >= total) return out;
    out.push(at);
  }
}

/**
 * The list with a grid ad marker in the places adPositions picks for `seed`,
 * or the same array untouched when the grid placement is not drawn.
 *
 * The seed names the list (its route and query, see adListSeed in
 * demo/app.ts). The items keep their order: the ads are added to an already
 * sorted list and change nothing about it.
 */
export function interleaveAds<T>(items: readonly T[], seed = '', cfg: AdConfig = AD_CONFIG): readonly (T | GridAd)[] {
  if (!placementShown('grid', cfg)) return items;
  const at = new Set(adPositions(items.length, seed));
  if (at.size === 0) return items;
  const out: (T | GridAd)[] = [];
  items.forEach((item, i) => {
    if (at.has(i)) out.push(GRID_AD);
    out.push(item);
  });
  return out;
}

/**
 * The value for AdSense's `requestNonPersonalizedAds`, from what the consent
 * message reports through the IAB TCF v2 API (`__tcfapi`).
 *
 * 1, non personalised, unless there is a clear signal otherwise: no signal at
 * all (Google's consent message not switched on, blocked, or not answered
 * yet) is treated as no consent. 0 only when the visitor is outside the UK and
 * EEA (`gdprApplies` false), or has consented to storing information on the
 * device (TCF purpose 1) and to personalised ads (purposes 3 and 4). Even at
 * 0, Google's tag still reads the consent string itself and stays within it.
 */
export interface TcData {
  gdprApplies?: boolean;
  eventStatus?: string;
  purpose?: { consents?: Record<string | number, boolean> };
}

export function nonPersonalisedFlag(tc: TcData | null | undefined): 0 | 1 {
  if (!tc) return 1;
  if (tc.gdprApplies === false) return 0;
  const c = tc.purpose?.consents ?? {};
  return c[1] === true && c[3] === true && c[4] === true ? 0 : 1;
}

/**
 * The ads' own styles, added to the page only when ads are on or the preview
 * is, so otherwise the stylesheet is exactly what it was.
 *
 * The grid tile is the size of a product tile because the grid gives every
 * row one shared height (grid-auto-rows: 1fr in template.html) and the ad
 * takes no part in deciding it: the `<ins>` is absolutely positioned inside
 * its well, so its content can never make a row taller. The product page
 * block reserves a fixed 280px for the same reason, and the home banner a
 * fixed 100px (90px on a wide desktop, where its frame is as wide as the Most
 * Stocked grid above it: --pop-cols and the 168px tile come from the
 * .pop-section rules in template.html). The frame is dashed and sits on the
 * page colour rather than the card colour, so it reads as something other
 * than a product or an offer. The preview frame is the same frame with its
 * spec and measured size written in it.
 */
export const AD_STYLES = `
.ps-ad-frame, .ps-ad-block, .ps-ad-home {
  display: flex; flex-direction: column; gap: 6px;
  border: 1px dashed var(--line-firm); border-radius: 12px;
  background: var(--bg); padding: 8px 10px 10px;
}
.ps-ad-tile { min-width: 0; }
.ps-ad-tile > .ps-ad-frame { height: 100%; min-height: 0; }
.ps-ad-label {
  margin: 0; font: 400 11px/1.2 var(--font-sans); letter-spacing: .02em; color: var(--faint);
}
.ps-ad-well { position: relative; flex: 1; min-height: 0; overflow: hidden; }
.ps-ad-tile .ps-ad-ins { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.ps-ad-block { margin: 28px 0 0; }
.ps-ad-block .ps-ad-well { flex: none; height: 280px; }
.ps-ad-block .ps-ad-ins { display: block; width: 100%; height: 280px; }
.ps-ad-home { margin: 12px 0 0; }
.ps-ad-home .ps-ad-well { flex: none; height: 100px; }
.ps-ad-home .ps-ad-ins { display: block; width: 100%; height: 100px; }
@media (min-width: 900px) {
  :root[data-layout="desktop"] .ps-ad-home {
    --pop-cols: 4; max-width: calc(var(--pop-cols) * 168px + (var(--pop-cols) - 1) * 12px); margin-inline: auto;
  }
  :root[data-layout="desktop"] .ps-ad-home .ps-ad-well { height: 90px; }
  :root[data-layout="desktop"] .ps-ad-home .ps-ad-ins { height: 90px; }
}
@media (min-width: 1160px) {
  :root[data-layout="desktop"] .ps-ad-home { --pop-cols: 6; }
}
.ps-ad-preview .ps-ad-well {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-align: center;
}
.ps-ad-spec, .ps-ad-live { margin: 0; font: 400 11px/1.3 var(--font-sans); color: var(--faint); overflow-wrap: anywhere; }
.ps-ad-live { min-height: 1.3em; }
@media print { .ps-ad { display: none !important; } }
`;
