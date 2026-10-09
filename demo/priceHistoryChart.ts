/**
 * The product page's price history graph, drawn as an HTML string.
 *
 * Moved out of demo/app.ts (2026-10-03) so it can be rendered in a test
 * without the rest of the app: tests/priceHistoryChart.test.ts draws it for a
 * product with one observation and for one with many.
 *
 * ── What is on the graph (owner's decisions, 2026-10-03) ───────────────────
 *   1. The line: the cheapest recorded price over time, from the replayed
 *      harvest history (scripts/build-price-history.ts), merged across every
 *      id the catalogue folded into this product (mergeCheapestSeries).
 *   2. Older prices: every offer for this product last checked more than
 *      HIDE_OFFER_AFTER_DAYS (7) ago, cheaper or dearer, as a hollow point on
 *      the day it was checked. They are too old to list at all, so they no
 *      longer appear in any price list, but are still real observations. The
 *      owner's view: an older price belongs in the product's history, not
 *      above today's Cheapest row.
 *   3. Every product page gets a graph. One observation draws one clear point
 *      (and, while it is still on sale, a flat line on to today, which the
 *      tooltip and the caption both call "no change recorded", never a new
 *      reading). A product the history has not reached yet is drawn from the
 *      prices on its own page, and says so. One whose only prices are at shops
 *      that were sold out shows those as grey points labelled sold out, never
 *      as a price that could be paid.
 *
 * ── Delivered prices (owner's decision, 2026-10-03) ────────────────────────
 * Every figure plotted is what the shopper would have paid with delivery, the
 * same kind of figure the offer list above shows: each recorded bottle price
 * plus that shop's delivery, from resolveDelivery (src/services/shipping.ts)
 * against the registry's shipping rule, free over a threshold included.
 *
 *   - The registry holds today's delivery rules only, and shops change them,
 *     so the caption says the delivery is worked out at today's rates. A past
 *     point is "that bottle price, delivered under today's rule", never a
 *     claim about what delivery cost on that day.
 *   - A shop that does not state its delivery cost (resolveDelivery's null)
 *     has its item price plotted, as a square point whose tooltip and
 *     aria label say "delivery not stated", and the caption says what the
 *     squares are. It is never drawn or labelled as a delivered price.
 *   - The recorded line is the cheapest bottle price at each moment (that is
 *     what the history replay keeps: one cheapest offer per reading, not one
 *     series per shop), so each point is that offer delivered. It is not a
 *     recomputed "cheapest delivered" across every shop, which the history
 *     cannot give without a per shop record; the caption's wording ("a bottle
 *     price plus that shop's delivery") says exactly this.
 *
 * Nothing else reads the history series: price drop alerts
 * (src/alerts/rules.ts) already compare the cheapest delivered price against
 * their own stored baseline, and the site prints no "lowest in N days" text,
 * so the graph and the alerts now both speak in delivered prices.
 */
import { formatMoney } from '../src/services/money.js';
import { getRetailer } from '../src/config/retailers.js';
import { resolveDelivery } from '../src/services/shipping.js';
import { roundPence } from '../src/services/money.js';
import type { Retailer } from '../src/types/retailer.js';
import { dayKey, dailyHistory, type DailyHistoryPoint, type RawHistoryPoint } from '../src/services/priceHistoryDaily.js';
import { HIDE_OFFER_AFTER_DAYS } from '../src/services/offerAge.js';

export type RetailerLookup = (id: string) => Retailer | undefined;

/** One real observation of one shop's price. */
export interface ChartObservation {
  at: string;
  priceGbp: number;
  retailerId: string;
}

export interface PriceHistoryChartInput {
  /** The cheapest price line; may be empty. Null prices are gap markers. */
  line: readonly RawHistoryPoint[];
  /**
   * Where the line came from: the recorded history, or (for a product the
   * history has not reached yet) the cheapest current price on the page.
   */
  lineSource: 'history' | 'page';
  /**
   * False when the line is a lone reading whose end is not on record (the
   * history file's 'not-enough' summary keeps the price but not the moment
   * it stopped being buyable), so it is drawn as one point and never carried
   * on to today as though it still held.
   */
  carryForward?: boolean;
  /** Offers last checked more than HIDE_OFFER_AFTER_DAYS ago, drawn hollow. */
  older: readonly ChartObservation[];
  /** Only for a product with nothing buyable on record: its sold out prices, drawn grey. */
  soldOut: readonly ChartObservation[];
  /** The last day the site recorded any price for anything (the shared right edge). */
  siteLastDay: string | null;
  isCurrentlyPurchasable: boolean;
  /** A gift set's graph says "a set price" where a bottle's says "a bottle price". */
  isGiftSet?: boolean;
  /**
   * Where each shop's name and delivery rule come from. The registry
   * (getRetailer) unless a test passes its own, so a test's expected
   * delivered figures do not move when a shop's real delivery rule does.
   */
  retailers?: RetailerLookup;
}

/**
 * The ranges offered above the chart, shortest window first. Days, not
 * calendar months: a "this month" that meant "since the 1st" would be one day
 * long on the 2nd. 'all' only appears once a product's own record is longer
 * than the longest fixed window, so nothing it has ever recorded falls off
 * the graph with age.
 */
export const HISTORY_SCOPES = [
  { id: 'week', label: 'This Week', days: 7 },
  { id: 'month', label: 'This Month', days: 30 },
  { id: 'year', label: 'This Year', days: 365 },
] as const;
const ALL_SCOPE = { id: 'all', label: 'All', days: Number.POSITIVE_INFINITY } as const;
type Scope = (typeof HISTORY_SCOPES)[number] | typeof ALL_SCOPE;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "6 Aug": enough to place a point in time without crowding a small chart. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function retailerName(id: string, lookup: RetailerLookup): string {
  return lookup(id)?.name ?? id;
}

/** Shift a YYYY-MM-DD key by a whole number of days. */
export function shiftDayKey(key: string, days: number): string {
  return dayKey(new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86_400_000).toISOString());
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

interface Marker extends ChartObservation {
  kind: 'older' | 'soldout';
  /** False where the shop states no delivery cost, so priceGbp is the item price alone. */
  deliveryStated: boolean;
}

/** What one recorded price is plotted as. */
export interface PlottedPrice {
  /** The price with delivery when `deliveryStated`, else the item price alone. */
  priceGbp: number;
  deliveryStated: boolean;
}

/**
 * One recorded bottle price as the graph plots it: plus that shop's delivery
 * under today's rule, or, where the shop states no delivery cost (or is not
 * in the registry at all), the item price, flagged so it is never presented
 * as delivered.
 */
export function plottedPrice(retailerId: string, itemPriceGbp: number, lookup: RetailerLookup = getRetailer): PlottedPrice {
  const retailer = lookup(retailerId);
  if (!retailer) return { priceGbp: itemPriceGbp, deliveryStated: false };
  const { costGbp } = resolveDelivery(retailer, itemPriceGbp);
  return costGbp === null
    ? { priceGbp: itemPriceGbp, deliveryStated: false }
    : { priceGbp: roundPence(itemPriceGbp + costGbp), deliveryStated: true };
}

/**
 * Whether an already plotted price (as plottedPrice returned it) includes
 * delivery. Needed for the line's days, which dailyHistory rebuilds from the
 * converted series and carries forward, so the flag is not carried with them.
 * Exact: resolveDelivery only returns a null cost for a shop with no standard
 * rate, below its free threshold if it has one, and there the plotted figure
 * is the item price itself, so asking again with it gives the same answer;
 * every other case states a cost at any basket value.
 */
export function plottedIncludesDelivery(retailerId: string, plottedGbp: number, lookup: RetailerLookup = getRetailer): boolean {
  const retailer = lookup(retailerId);
  return retailer !== undefined && resolveDelivery(retailer, plottedGbp).costGbp !== null;
}

/** The tooltip's price line: says which kind of figure it is. */
function priceLabel(priceGbp: number, deliveryStated: boolean): string {
  return deliveryStated ? `${formatMoney(priceGbp)} with delivery` : `${formatMoney(priceGbp)}, delivery not stated`;
}

/**
 * The price range the y axis spans, padded so no plotted point sits on the
 * axis or against the top (owner's request, 2026-10-03: a cheapest line that
 * looked like it lay on the x axis read as a price near zero).
 *
 * The padding is Y_PAD_FRACTION of the plotted range above the highest point
 * and below the lowest. When every point is the same price, or nearly so,
 * that would be no room at all, so it is never less than MIN_Y_PAD_FRACTION
 * of the highest price, and never less than MIN_Y_PAD_GBP. The bottom is
 * never below £0. The axis does not start at zero, so the chart labels its
 * own top and bottom prices (see priceHistoryBody), never leaving the reader
 * to assume the floor is £0.
 */
export const Y_PAD_FRACTION = 0.1;
export const MIN_Y_PAD_FRACTION = 0.02;
export const MIN_Y_PAD_GBP = 0.5;
export function priceDomain(prices: readonly number[]): { lo: number; hi: number } {
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const pad = Math.max((maxP - minP) * Y_PAD_FRACTION, maxP * MIN_Y_PAD_FRACTION, MIN_Y_PAD_GBP);
  return { lo: Math.max(0, minP - pad), hi: maxP + pad };
}

/** The block with a heading and one sentence, for the one case with nothing at all to draw. */
export function priceHistoryMessageBlock(message: string): string {
  return `<div class="history-block" data-history-block>
    <p class="gone-head t-eyebrow">Price History</p>
    <p class="history-empty t-caption">${esc(message)}</p>
  </div>`;
}

export function priceHistoryChart(input: PriceHistoryChartInput): string {
  const lookup = input.retailers ?? getRetailer;
  // Every recorded price becomes the price with that shop's delivery (see the
  // header), before anything is bucketed into days, so the day's cheapest and
  // the carried price are both delivered figures.
  const line: RawHistoryPoint[] = input.line.map((p) =>
    p.priceGbp === null || p.retailerId === null ? p : { ...p, priceGbp: plottedPrice(p.retailerId, p.priceGbp, lookup).priceGbp },
  );
  const realLine = line.filter((p) => p.priceGbp !== null);
  const asMarker = (o: ChartObservation, kind: Marker['kind']): Marker => {
    const plotted = plottedPrice(o.retailerId, o.priceGbp, lookup);
    return { ...o, priceGbp: plotted.priceGbp, deliveryStated: plotted.deliveryStated, kind };
  };
  const markers: Marker[] = [
    ...input.older.map((o) => asMarker(o, 'older')),
    ...input.soldOut.map((o) => asMarker(o, 'soldout')),
  ];
  const days = [...realLine.map((p) => dayKey(p.at)), ...markers.map((m) => dayKey(m.at))].sort();
  if (days.length === 0) return priceHistoryMessageBlock('No price has been recorded for this fragrance yet.');

  // This product's own record starts where its first observation does, not
  // where the site's does: a product first seen last week does not open on a
  // fortnight of empty floor. Every range ends on the site's latest day (or
  // this product's, if that is later), so the right edge is today's price
  // for anything still on sale.
  const ownFirstDay = days[0]!;
  const latestOwnDay = days.at(-1)!;
  const to = input.siteLastDay !== null && input.siteLastDay > latestOwnDay ? input.siteLastDay : latestOwnDay;

  const scopes: Scope[] = [...HISTORY_SCOPES];
  if (daysBetween(ownFirstDay, to) >= 365) scopes.push(ALL_SCOPE);

  // Built once across the product's whole record and then cut to each range,
  // so a range that opens after the last change still starts on the price
  // held at that moment rather than on empty floor.
  const carry = input.isCurrentlyPurchasable && input.carryForward !== false;
  const allDays = dailyHistory(line, ownFirstDay, to, carry);

  const panels = scopes.map((scope) => {
    const windowStart = Number.isFinite(scope.days) ? shiftDayKey(to, -(scope.days - 1)) : ownFirstDay;
    const from = windowStart > ownFirstDay ? windowStart : ownFirstDay;
    const points = allDays.filter((p) => p.dateKey >= from);
    const inWindow = markers.filter((m) => dayKey(m.at) >= from && dayKey(m.at) <= to);
    const real = points.filter((p) => p.priceGbp !== null && !p.isCarried).length;
    const priced = points.some((p) => p.priceGbp !== null) || inWindow.length > 0;
    return { scope, from, points, inWindow, real, body: priced ? priceHistoryBody(points, inWindow, from, input.isCurrentlyPurchasable, lookup) : null };
  });

  // Default to the shortest range with a real trend in it (two readings),
  // else the shortest holding a real reading, so a single observation opens
  // on the range that shows its dot, else the shortest with any point in it.
  const usable = panels.filter((p) => p.body !== null);
  const active =
    usable.find((p) => p.real >= 2) ??
    usable.find((p) => p.real >= 1) ??
    usable.find((p) => p.inWindow.length > 0) ??
    usable[0]!;

  const tabs = panels
    .map((p) => {
      const on = p.scope.id === active.scope.id;
      const dead = p.body === null;
      return `<button
        type="button"
        class="history-scope${on ? ' is-on' : ''}"
        data-history-scope="${p.scope.id}"
        aria-pressed="${on}"
        ${dead ? 'disabled aria-disabled="true" title="No recorded prices in this range"' : ''}
      >${esc(p.scope.label)}</button>`;
    })
    .join('');

  const bodies = usable
    .map((p) => `<div class="history-panel" data-history-panel="${p.scope.id}"${p.scope.id === active.scope.id ? '' : ' hidden'}>${p.body}</div>`)
    .join('');

  return `<div class="history-block" data-history-block data-history-points="${realLine.length + markers.length}">
    <div class="history-head">
      <p class="gone-head t-eyebrow">Price History</p>
      <div class="history-scopes" role="group" aria-label="Price history range">${tabs}</div>
    </div>
    ${bodies}
    <p class="history-note t-caption">${esc(chartCaption(input, realLine, markers, lookup))}</p>
  </div>`;
}

/**
 * The one line under the graph that says what is on it. Always says what the
 * figures are (with delivery at today's rates, or item prices where a shop
 * states no delivery cost); adds whichever of the honest qualifiers applies.
 */
function chartCaption(input: PriceHistoryChartInput, realLine: readonly RawHistoryPoint[], markers: readonly Marker[], lookup: RetailerLookup): string {
  const realReadings = realLine.length;
  const parts: string[] = [];
  if (realReadings === 0 && input.soldOut.length > 0 && input.older.length === 0) {
    parts.push('No price that could be paid has been recorded for this yet. The grey points are the last prices at shops that were sold out when checked.');
  } else if (input.lineSource === 'page' && realReadings > 0) {
    parts.push('No earlier price is on record for this yet, so the point is the cheapest price on this page, from when it was checked.');
  } else if (realReadings === 1) {
    parts.push(
      input.isCurrentlyPurchasable && input.carryForward !== false
        ? 'One price recorded so far, so this is a single reading rather than a trend. A flat line after it means no change has been recorded since.'
        : 'One price recorded so far, so this is a single reading rather than a trend.',
    );
  } else if (realReadings === 0) {
    parts.push('No current price is on record for this, only older ones.');
  }
  const stated = [
    ...realLine.map((p) => plottedIncludesDelivery(p.retailerId!, p.priceGbp!, lookup)),
    ...markers.map((m) => m.deliveryStated),
  ];
  const what = input.isGiftSet ? 'set' : 'bottle';
  if (stated.length > 0 && stated.every((s) => !s)) {
    parts.push(`No shop here states its delivery cost, so these are ${what} prices before delivery.`);
  } else {
    parts.push(`Each point is a ${what} price plus that shop's delivery, worked out at today's delivery rates.`);
    if (stated.some((s) => !s)) parts.push('Square points are item prices only, as that shop does not state its delivery cost.');
  }
  if (markers.some((m) => m.kind === 'older')) {
    parts.push(`Hollow points are older prices, not checked in the last ${HIDE_OFFER_AFTER_DAYS} days.`);
  }
  return parts.join(' ');
}

/**
 * One chart, for one already windowed run of days. Dots are HTML buttons laid
 * over the svg rather than svg circles: the svg stretches non uniformly to
 * fill the card (`preserveAspectRatio="none"`), which would warp a circle into
 * an ellipse, while a fixed pixel sized button stays round at any width.
 */
function priceHistoryBody(
  points: readonly DailyHistoryPoint[],
  markers: readonly Marker[],
  fromDay: string,
  isCurrentlyPurchasable: boolean,
  lookup: RetailerLookup,
): string {
  const W = 600;
  const H = 160;
  const PAD_X_PCT = 1.3;
  // Room for a dot's own radius at the very top and bottom of the box; the
  // price padding itself is priceDomain's.
  const INSET_Y_PCT = 4;

  // Scaled off real prices only (the line's and the points'), never the empty
  // days: letting those in would drag every floor to zero and squash the
  // movement the chart exists to show. priceDomain pads the range, so the
  // lowest point always sits clear above the floor and the highest clear
  // below the top, and a flat line sits in the middle.
  const prices = [...points.filter((p) => p.priceGbp !== null).map((p) => p.priceGbp!), ...markers.map((m) => m.priceGbp)];
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const domain = priceDomain(prices);
  const lastIndex = points.length - 1;
  const lastPricedIndex = points.reduce((acc, p, i) => (p.priceGbp !== null ? i : acc), -1);

  // A one day range has nowhere to go left to right, so its only day sits in
  // the middle rather than pinned to the left edge.
  const xPct = (i: number): number => (lastIndex === 0 ? 50 : PAD_X_PCT + (i / lastIndex) * (100 - PAD_X_PCT * 2));
  const yPct = (p: number): number =>
    INSET_Y_PCT + (1 - (p - domain.lo) / (domain.hi - domain.lo)) * (100 - INSET_Y_PCT * 2);
  // Where a day with no price sits: the chart's own floor, the bottom of the
  // padded range, below every real price. A position, not a price of zero.
  const yFloorPct = 100 - INSET_Y_PCT;

  // The line is drawn in runs of consecutive priced days and breaks across
  // the blank ones; joining across a gap would draw a crash that never was.
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  points.forEach((p, i) => {
    if (p.priceGbp === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      return;
    }
    run.push([(xPct(i) / 100) * W, (yPct(p.priceGbp) / 100) * H]);
  });
  if (run.length > 0) runs.push(run);

  const asPath = (seg: [number, number][]): string =>
    seg.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const linePath = runs.filter((seg) => seg.length >= 2).map(asPath).join(' ');
  const baseY = (yFloorPct / 100) * H;
  const areaPath = runs
    .filter((seg) => seg.length >= 2)
    .map((seg) => `${asPath(seg)} L${seg.at(-1)![0].toFixed(1)},${baseY.toFixed(1)} L${seg[0]![0].toFixed(1)},${baseY.toFixed(1)} Z`)
    .join(' ');

  // A day without a price gets a grey floor dot only where it breaks a line:
  // after the line's first day, on a range with more than one priced day. A
  // lone reading, or the days before a line begins, get empty space, which
  // says the same thing without a row of dots implying a series.
  const pricedDays = points.filter((p) => p.priceGbp !== null).length;
  const firstPricedIndex = points.findIndex((p) => p.priceGbp !== null);
  const lineDots = points
    .map((p, i) => {
      if (p.priceGbp === null) {
        if (pricedDays < 2 || firstPricedIndex < 0 || i < firstPricedIndex) return '';
        const date = shortDate(`${p.dateKey}T00:00:00Z`);
        return `<button
        type="button"
        class="history-dot history-dot-nodata"
        style="left:${xPct(i).toFixed(2)}%;top:${yFloorPct.toFixed(2)}%"
        data-price="No price recorded"
        data-retailer=""
        data-date="${esc(date)}"
        aria-label="${esc(`No price recorded, ${date}`)}"
      ></button>`;
      }
      const isLast = i === lastPricedIndex;
      // The pulse means "a live price right now", so only on the final point
      // and only while the product is buyable this moment.
      const isLive = isLast && isCurrentlyPurchasable && i === lastIndex;
      const shop = retailerName(p.retailerId!, lookup);
      const stated = plottedIncludesDelivery(p.retailerId!, p.priceGbp, lookup);
      const price = priceLabel(p.priceGbp, stated);
      const dateLabel = p.isCarried ? `no change recorded since ${shortDate(p.recordedAt!)}` : shortDate(p.recordedAt!);
      return `<button
        type="button"
        class="history-dot${isLast ? ' history-dot-last' : ''}${isLive ? ' history-dot-live' : ''}${stated ? '' : ' history-dot-itemonly'}"
        style="left:${xPct(i).toFixed(2)}%;top:${yPct(p.priceGbp).toFixed(2)}%"
        data-price="${esc(price)}"
        data-retailer="${esc(shop)}"
        data-date="${esc(dateLabel)}"
        aria-label="${esc(`${price} at ${shop}, ${dateLabel}`)}"
      ></button>`;
    })
    .join('');

  const markerDots = markers
    .map((m) => {
      const i = daysBetween(fromDay, dayKey(m.at));
      const shop = retailerName(m.retailerId, lookup);
      const dateLabel =
        m.kind === 'older' ? `older price, checked ${shortDate(m.at)}` : `sold out when checked ${shortDate(m.at)}`;
      const prefix = m.kind === 'older' ? 'Older price' : 'Last price, sold out';
      const price = priceLabel(m.priceGbp, m.deliveryStated);
      return `<button
        type="button"
        class="history-dot history-dot-${m.kind}${m.deliveryStated ? '' : ' history-dot-itemonly'}"
        style="left:${xPct(i).toFixed(2)}%;top:${yPct(m.priceGbp).toFixed(2)}%"
        data-price="${esc(price)}"
        data-retailer="${esc(shop)}"
        data-date="${esc(dateLabel)}"
        aria-label="${esc(`${prefix}: ${price} at ${shop}, checked ${shortDate(m.at)}`)}"
      ></button>`;
    })
    .join('');

  // An even sample of day labels, always the first and last.
  // Five, not six, since the plot gave up a gutter to the y axis labels: six
  // ran into each other at phone width. A sampled label closer than most of
  // a step to the last one is dropped rather than printed over it.
  const MAX_LABELS = 5;
  const labelStep = Math.max(1, Math.ceil(lastIndex / (MAX_LABELS - 1)));
  const labelIndices = new Set<number>();
  for (let i = 0; i <= lastIndex; i += labelStep) {
    if (i === 0 || lastIndex - i >= labelStep * 0.6) labelIndices.add(i);
  }
  labelIndices.add(lastIndex);
  const xAxis = [...labelIndices]
    .sort((a, b) => a - b)
    .map((i) => `<span class="history-xlabel${lastIndex === 0 ? ' history-xlabel-solo' : ''}" style="left:${xPct(i).toFixed(2)}%">${esc(shortDate(points[i]!.dateKey))}</span>`)
    .join('');

  // The y axis does not start at zero (see priceDomain), so it says what it
  // spans: the highest and lowest prices plotted, each beside a faint guide
  // line at its own height. One label when every point is the same price.
  const yTicks = maxP === minP ? [maxP] : [maxP, minP];
  const yGuides = yTicks
    .map((p) => `<line x1="0" x2="${W}" y1="${((yPct(p) / 100) * H).toFixed(1)}" y2="${((yPct(p) / 100) * H).toFixed(1)}" class="history-guide" />`)
    .join('');
  const yLabels = yTicks
    .map((p) => `<span class="history-ylabel" style="top:${yPct(p).toFixed(2)}%">${esc(formatMoney(p))}</span>`)
    .join('');

  return `<div class="history-chart" data-history-chart data-y-lo="${domain.lo.toFixed(2)}" data-y-hi="${domain.hi.toFixed(2)}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="history-svg" aria-hidden="true" focusable="false">
        ${yGuides}
        <path d="${areaPath}" class="history-area" />
        <path d="${linePath}" class="history-line" />
      </svg>
      <div class="history-yaxis" aria-hidden="true">${yLabels}</div>
      ${lineDots}${markerDots}
      <div class="history-tip" data-history-tip hidden></div>
    </div>
    <div class="history-xaxis">${xAxis}</div>`;
}
