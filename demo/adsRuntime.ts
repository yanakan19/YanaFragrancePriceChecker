/// <reference lib="dom" />
/**
 * The browser half of display advertising: adding the ad styles, loading
 * Google's ad script, and asking it to fill each slot. Everything it decides
 * is in demo/ads.ts; this only carries it out.
 *
 * With ads off (demo/ads.ts ADS_ON false) and no preview, every function here
 * returns before it touches the document, so nothing is added, loaded or
 * requested.
 *
 * With the layout preview on (`?adpreview=1`, see demo/ads.ts) the slots are
 * drawn as labelled frames with no `<ins>` in them: the styles are added and
 * each frame's measured size is written into it, and that is all. There is
 * nothing for the ad script to fill, so it is never added and nothing is
 * requested.
 *
 * ── Order of events once ads are on ─────────────────────────────────────────
 *   1. installAds(), at start up, adds the ad styles: slots then reserve their
 *      space the moment they are drawn.
 *   2. mountAds(), after every render and every appended chunk of a grid,
 *      looks for slots not yet seen and watches them.
 *   3. The ad script is added only once a slot exists, and only after the
 *      page has finished loading and the browser is idle, async, so it never
 *      competes with the prices for the first paint.
 *   4. Consent: Google's own consent message (the "Privacy & messaging" GDPR
 *      message in AdSense, a Google certified CMP) is served by that script
 *      once the owner switches it on, and reports through the IAB TCF API.
 *      Slots wait up to CONSENT_WAIT_MS for its answer. Without an answer they
 *      are requested non personalised (nonPersonalisedFlag in demo/ads.ts),
 *      never personalised. There is no consent banner of this site's own.
 *   5. A slot is filled only when it comes within 400px of the screen, so a
 *      long grid never asks for ads nobody scrolls to.
 */
import { ADS_ON, AD_STYLES, adPreviewOn, adScriptUrl, nonPersonalisedFlag, type TcData } from './ads.js';

/** How long slots wait for the consent message's answer before asking non personalised. */
const CONSENT_WAIT_MS = 2000;

type AdsQueue = { push: (x: object) => void; requestNonPersonalizedAds?: 0 | 1 };
type TcfApi = (cmd: string, version: number, cb: (tc: TcData, ok: boolean) => void) => void;
type AdWindow = Window & { adsbygoogle?: AdsQueue | object[]; __tcfapi?: TcfApi };

let installed = false;
let scriptRequested = false;
let consentKnown = false;
let npa: 0 | 1 = 1;
let observer: IntersectionObserver | null = null;
const waiting = new Set<HTMLElement>();

/** Adds the ad styles once. A no op with ads off and no preview. */
export function installAds(): void {
  if (!(ADS_ON || adPreviewOn()) || installed) return;
  installed = true;
  const style = document.createElement('style');
  style.id = 'ps-ad-styles';
  style.textContent = AD_STYLES;
  document.head.appendChild(style);
}

/** Watches every slot on the page not yet asked for. A no op with ads off and no preview. */
export function mountAds(): void {
  if (adPreviewOn()) {
    mountPreview();
    return;
  }
  if (!ADS_ON) return;
  const fresh = Array.from(document.querySelectorAll<HTMLElement>('ins.ps-ad-ins:not([data-ps-seen])'));
  if (fresh.length === 0) return;
  installAds();
  requestScript();
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer?.unobserve(e.target);
        waiting.add(e.target as HTMLElement);
      }
      fill();
    },
    { rootMargin: '400px 0px' },
  );
  for (const ins of fresh) {
    ins.dataset.psSeen = '1';
    observer.observe(ins);
  }
}

let sizeObserver: ResizeObserver | null = null;

/** Preview only: writes each frame's measured size into it, and keeps it true as the window changes. */
function mountPreview(): void {
  const fresh = Array.from(document.querySelectorAll<HTMLElement>('.ps-ad-live:not([data-ps-seen])'));
  if (fresh.length === 0) return;
  installAds();
  sizeObserver ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const text = e.target.querySelector<HTMLElement>('.ps-ad-live');
      if (!e.target.isConnected || !text) {
        sizeObserver?.unobserve(e.target);
        continue;
      }
      const box = e.target.getBoundingClientRect();
      text.textContent = `Slot ${Math.round(box.width)} × ${Math.round(box.height)} px`;
    }
  });
  for (const live of fresh) {
    live.dataset.psSeen = '1';
    const well = live.closest('.ps-ad-well');
    if (well) sizeObserver.observe(well);
  }
}

/** Asks Google to fill each slot that is near the screen, once consent is settled. */
function fill(): void {
  if (!consentKnown) return;
  const w = window as AdWindow;
  for (const ins of waiting) {
    waiting.delete(ins);
    if (!ins.isConnected || ins.dataset.psPushed) continue;
    ins.dataset.psPushed = '1';
    const q = (w.adsbygoogle ??= []) as AdsQueue;
    q.requestNonPersonalizedAds = npa;
    try {
      q.push({});
    } catch {
      // A slot Google cannot fill (no size yet, ad blocker) stays an empty
      // frame of the size it reserved. Nothing else on the page depends on it.
    }
  }
}

/** Adds the ad script after the page has loaded and the browser is idle. */
function requestScript(): void {
  if (scriptRequested) return;
  scriptRequested = true;
  const add = () => {
    const s = document.createElement('script');
    s.async = true;
    s.src = adScriptUrl();
    s.crossOrigin = 'anonymous';
    s.addEventListener('load', waitForConsent);
    s.addEventListener('error', () => settle(1));
    document.head.appendChild(s);
  };
  const whenIdle = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
      .requestIdleCallback;
    if (ric) ric(add, { timeout: 3000 });
    else window.setTimeout(add, 1500);
  };
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}

/** Settles npa from the consent message, or non personalised if it does not answer in time. */
function waitForConsent(): void {
  const w = window as AdWindow;
  const started = Date.now();
  const timer = window.setTimeout(() => settle(1), CONSENT_WAIT_MS);
  const listen = () => {
    if (!w.__tcfapi) {
      if (Date.now() - started < CONSENT_WAIT_MS) window.setTimeout(listen, 100);
      return;
    }
    w.__tcfapi('addEventListener', 2, (tc, ok) => {
      if (!ok) return;
      // Kept up to date for slots asked for later, if the visitor changes
      // their choice through the message's own settings link.
      if (tc.gdprApplies === false || tc.eventStatus === 'tcloaded' || tc.eventStatus === 'useractioncomplete') {
        window.clearTimeout(timer);
        settle(nonPersonalisedFlag(tc));
      }
    });
  };
  listen();
}

function settle(value: 0 | 1): void {
  npa = value;
  consentKnown = true;
  fill();
}
