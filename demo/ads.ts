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
 *   - 'grid':    one tile in a browse grid after every GRID_AD_INTERVAL
 *                product tiles, never in the first row (see interleaveAds).
 *   - 'product': one block under a perfume's whole price list, below every
 *                offer section, never above the prices or the price boxes.
 * There is no sidebar slot: the only side column on the site is the product
 * page's price rail, which holds the price boxes, and ads never go there.
 * Never in the top navigation, the hero, a price box, an offer row, an email
 * or a social post. Ads are never part of a ranking: they are added to a list
 * after it has been sorted, and take no part in the sort.
 *
 * Every ad carries the word "Advertisement" in small text above it, in a
 * plain frame unlike a product tile or an offer row: no price styling, no
 * Cheapest tag, no shop mark.
 */

/** The AdSense publisher id, `ca-pub-` and sixteen digits. '' switches every ad off. */
export const ADSENSE_CLIENT: string = 'ca-pub-6298711915135064';

/** Where an ad can appear. See the header for why there is no sidebar. */
export type AdPlacement = 'grid' | 'product';

/**
 * The ad unit id for each placement, the digits AdSense shows as
 * `data-ad-slot` when an ad unit is created. A blank one keeps that placement
 * empty; all blank keeps ads off altogether.
 */
export const AD_SLOTS: Readonly<Record<AdPlacement, string>> = {
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

/** One ad tile after this many product tiles in a browse grid. */
export const GRID_AD_INTERVAL = 8;

/**
 * The widest row a grid can have: the largest tiles per row choice in
 * demo/tileDensity.ts. The first grid ad comes after at least this many
 * tiles, so it is never in the first row at any width or column count,
 * including after the reader changes the count without a fresh render.
 */
export const WIDEST_ROW = 10;

/** Everything the switch reads, so tests can try a configuration without editing this file. */
export interface AdConfig {
  client: string;
  slots: Readonly<Record<AdPlacement, string>>;
}

export const AD_CONFIG: AdConfig = { client: ADSENSE_CLIENT, slots: AD_SLOTS };

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
 * One ad's markup, or '' when that placement is off. The `<ins>` is what
 * Google fills; demo/adsRuntime.ts asks for it only when it nears the screen.
 * It is sized by its frame (see adStyles), not by Google's responsive sizing,
 * so the space is reserved before anything arrives and nothing moves when it
 * does. aria-hidden is not used: the label must be read out, and the ad
 * itself is Google's to make accessible.
 */
export function adSlotHtml(placement: AdPlacement, cfg: AdConfig = AD_CONFIG): string {
  if (!placementOn(placement, cfg)) return '';
  const ins = `<ins class="adsbygoogle ps-ad-ins" data-ad-client="${cfg.client}" data-ad-slot="${cfg.slots[placement]}"></ins>`;
  if (placement === 'grid') {
    return `<li class="ps-ad ps-ad-tile"><div class="ps-ad-frame"><p class="ps-ad-label">Advertisement</p><div class="ps-ad-well">${ins}</div></div></li>`;
  }
  return `<div class="ps-ad ps-ad-block"><p class="ps-ad-label">Advertisement</p><div class="ps-ad-well">${ins}</div></div>`;
}

/** The marker interleaveAds puts where a grid ad goes. */
export interface GridAd {
  readonly psGridAd: true;
}
const GRID_AD: GridAd = Object.freeze({ psGridAd: true as const });

export function isGridAd(x: unknown): x is GridAd {
  return x === GRID_AD;
}

/**
 * The list with an ad marker after every GRID_AD_INTERVAL items, or the same
 * array untouched when the grid placement is off.
 *
 * The first marker comes after the first multiple of the interval that is at
 * least WIDEST_ROW, so an ad is never in the first row; none is added at the
 * very end, so an ad always sits between product tiles. The items keep their
 * order: the ads are added to an already sorted list and change nothing about
 * it.
 */
export function interleaveAds<T>(items: readonly T[], cfg: AdConfig = AD_CONFIG): readonly (T | GridAd)[] {
  if (!placementOn('grid', cfg)) return items;
  const first = Math.ceil(WIDEST_ROW / GRID_AD_INTERVAL) * GRID_AD_INTERVAL;
  const out: (T | GridAd)[] = [];
  items.forEach((item, i) => {
    out.push(item);
    const seen = i + 1;
    if (seen >= first && seen % GRID_AD_INTERVAL === 0 && seen < items.length) out.push(GRID_AD);
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
 * The ads' own styles, added to the page only when ads are on, so with ads
 * off the stylesheet is exactly what it was.
 *
 * The grid tile is the size of a product tile because the grid gives every
 * row one shared height (grid-auto-rows: 1fr in template.html) and the ad
 * takes no part in deciding it: the `<ins>` is absolutely positioned inside
 * its well, so its content can never make a row taller. The product page
 * block reserves a fixed 280px for the same reason. The frame is dashed and
 * sits on the page colour rather than the card colour, so it reads as
 * something other than a product or an offer.
 */
export const AD_STYLES = `
.ps-ad-frame, .ps-ad-block {
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
@media print { .ps-ad { display: none !important; } }
`;
