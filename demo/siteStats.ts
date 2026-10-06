/**
 * The visitor counter's rules and the developer dashboard's sums, with no DOM
 * and no network, so tests/siteStats.test.ts can check every one under Node.
 *
 * ── What the counter sends (demo/siteCounter.ts does the sending) ────────────
 * A page view: the page's path (never its query string or #anchor), whether
 * it opened a visit, and for a visit only the host name of the site that
 * linked here. A shop click: the product, its brand and the shop. Nothing
 * that identifies a visitor, nothing stored on their device. The country is
 * added by the database from Cloudflare's header (migration 0007), not here.
 *
 * ── What the dashboard sums ──────────────────────────────────────────────────
 * The database returns totals per bucket of London time (site_stats in
 * migration 0007). This module decides which buckets a range shows, fills the
 * ones with no visits with zero, and turns the click totals into the three
 * top lists: products, brands and shops.
 */

/* ── the counter's rules ─────────────────────────────────────────────────── */

/** Pages the counter leaves alone: the owner's own dashboard. */
const UNCOUNTED_PAGES = new Set(['/developer']);

/**
 * The path a page view is recorded under, or null for one that is not
 * counted. Query string and anchor are dropped (a search's words are the
 * visitor's own), and anything outside the characters the site's own
 * addresses use is filed as /other, the same rule the database applies.
 */
export function countablePage(path: string): string | null {
  let p = (path.split(/[?#]/)[0] ?? '').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (UNCOUNTED_PAGES.has(p)) return null;
  return /^\/[A-Za-z0-9_./-]{0,199}$/.test(p) ? p : '/other';
}

/**
 * The host of the site that linked here, lower case and without "www.", or
 * '' when there is none or it is this site. Only the host: the rest of the
 * address can carry what someone searched for.
 */
export function referrerHost(referrer: string, ownHost: string): string {
  if (!referrer) return '';
  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return '';
  }
  host = host.replace(/^www\./, '');
  const own = ownHost.toLowerCase().replace(/^www\./, '');
  if (!host || host === own) return '';
  return /^[a-z0-9.-]{1,100}$/.test(host) ? host : '';
}

/**
 * Whether this page load opens a visit: it did not come from another page of
 * this site, and it is not a reload or a step back or forward through history.
 * Worked out from what the browser already knows, so nothing has to be stored
 * on the device to remember anyone.
 */
export function isEntry(referrer: string, ownHost: string, navigationType: string): boolean {
  if (navigationType === 'reload' || navigationType === 'back_forward') return false;
  if (!referrer) return true;
  try {
    return new URL(referrer).hostname.toLowerCase().replace(/^www\./, '') !== ownHost.toLowerCase().replace(/^www\./, '');
  } catch {
    return true;
  }
}

/** Crawlers, previews and automated browsers: not visitors, so never counted. */
export function isAutomatedAgent(userAgent: string): boolean {
  return /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|pingdom|uptime/i.test(userAgent);
}

/* ── ranges and buckets ──────────────────────────────────────────────────── */

export type StatsRange = 'hour' | 'day' | 'week' | 'month' | 'year';

export interface RangeSpec {
  id: StatsRange;
  /** The button. */
  label: string;
  /** What the chart shows, said under the buttons. */
  caption: string;
  /** How many bars. */
  buckets: number;
}

/**
 * Each button is the size of one bar, and the chart shows enough of them to
 * read a trend: the owner asked for hour, day, week, month and year. The
 * database keeps hourly totals, so an hour is the smallest bar there is.
 */
export const STATS_RANGES: readonly RangeSpec[] = [
  { id: 'hour', label: 'Hour', caption: 'Last 24 hours, by hour', buckets: 24 },
  { id: 'day', label: 'Day', caption: 'Last 30 days, by day', buckets: 30 },
  { id: 'week', label: 'Week', caption: 'Last 12 weeks, by week', buckets: 12 },
  { id: 'month', label: 'Month', caption: 'Last 12 months, by month', buckets: 12 },
  { id: 'year', label: 'Year', caption: 'Last 5 years, by year', buckets: 5 },
];

export function rangeSpec(id: StatsRange): RangeSpec {
  return STATS_RANGES.find((r) => r.id === id) ?? STATS_RANGES[1]!;
}

export function isStatsRange(v: string): v is StatsRange {
  return STATS_RANGES.some((r) => r.id === v);
}

/** The owner's clock. The database buckets in the same zone. */
export const STATS_TIME_ZONE = 'Europe/London';

interface WallClock {
  y: number;
  m: number;
  d: number;
  h: number;
  /** Monday 0 to Sunday 6. */
  wd: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
let wallFormat: Intl.DateTimeFormat | null = null;

/** London wall clock time of an instant. */
export function londonClock(t: Date): WallClock {
  wallFormat ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: STATS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of wallFormat.formatToParts(t)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24,
    wd: Math.max(0, WEEKDAYS.indexOf(parts.weekday ?? 'Mon')),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A bucket's key, the shape site_stats returns: `YYYY-MM-DDTHH:MI`. */
export function bucketKey(y: number, m: number, d: number, h = 0): string {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}T${pad(h)}:00`;
}

/** The calendar date `days` after y-m-d, as [y, m, d]. */
function addDays(y: number, m: number, d: number, days: number): [number, number, number] {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

/**
 * The buckets a range shows, oldest first, ending with the one `now` is in.
 * Hours step through real time, so the hour the clocks go back is one bucket
 * (the database folds both into it too) and the hour they go forward is not
 * there at all.
 */
export function bucketKeys(range: StatsRange, now: Date): string[] {
  const n = rangeSpec(range).buckets;
  const c = londonClock(now);
  const keys: string[] = [];
  switch (range) {
    case 'hour': {
      for (let i = n - 1; i >= 0; i--) {
        const w = londonClock(new Date(now.getTime() - i * 3_600_000));
        keys.push(bucketKey(w.y, w.m, w.d, w.h));
      }
      return [...new Set(keys)];
    }
    case 'day':
      for (let i = n - 1; i >= 0; i--) keys.push(bucketKey(...addDays(c.y, c.m, c.d, -i)));
      return keys;
    case 'week': {
      const monday = addDays(c.y, c.m, c.d, -c.wd);
      for (let i = n - 1; i >= 0; i--) keys.push(bucketKey(...addDays(...monday, -7 * i)));
      return keys;
    }
    case 'month':
      for (let i = n - 1; i >= 0; i--) {
        const t = new Date(Date.UTC(c.y, c.m - 1 - i, 1));
        keys.push(bucketKey(t.getUTCFullYear(), t.getUTCMonth() + 1, 1));
      }
      return keys;
    case 'year':
      for (let i = n - 1; i >= 0; i--) keys.push(bucketKey(c.y - i, 1, 1));
      return keys;
  }
}

/**
 * The instant to ask the database from: safely before the first bucket
 * starts (London is never more than an hour ahead of UTC, so a day early is
 * always enough). Totals from before the first bucket come back too and are
 * simply not drawn, since no bar has their key.
 */
export function sinceFor(range: StatsRange, now: Date): Date {
  const first = bucketKeys(range, now)[0]!;
  const [date, time] = first.split('T') as [string, string];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const h = Number(time.slice(0, 2));
  return new Date(Date.UTC(y, m - 1, d - 1, h));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A bucket's label: short for under the chart, long for its tooltip and table. */
export function bucketLabel(range: StatsRange, key: string, long = false): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const h = key.slice(11, 16);
  const mon = MONTHS[m - 1] ?? '';
  switch (range) {
    case 'hour': return long ? `${d} ${mon}, ${h}` : h;
    case 'day': return `${d} ${mon}`;
    case 'week': return long ? `Week from ${d} ${mon}` : `${d} ${mon}`;
    case 'month': return long ? `${MONTHS_LONG[m - 1] ?? ''} ${y}` : mon;
    case 'year': return String(y);
  }
}

/* ── what site_stats returns ─────────────────────────────────────────────── */

export interface StatsPoint {
  key: string;
  views: number;
  visits: number;
}

export interface StatsData {
  series: StatsPoint[];
  /** Every country seen in the range, most visits first. '' is unknown. */
  countries: { code: string; views: number; visits: number }[];
  pages: { page: string; views: number }[];
  sources: { host: string; visits: number }[];
  clicks: { productId: string; brand: string; retailerId: string; clicks: number }[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const rows = (v: unknown): unknown[][] => (Array.isArray(v) ? v.filter((r): r is unknown[] => Array.isArray(r)) : []);

/** site_stats' answer, checked. Anything malformed is dropped rather than drawn. */
export function parseStats(raw: unknown): StatsData {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    series: rows(o.series)
      .map((r) => ({ key: str(r[0]), views: num(r[1]), visits: num(r[2]) }))
      .filter((p) => /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(p.key)),
    countries: rows(o.countries)
      .map((r) => ({ code: str(r[0]), views: num(r[1]), visits: num(r[2]) }))
      .filter((c) => /^([A-Z]{2})?$/.test(c.code)),
    pages: rows(o.pages).map((r) => ({ page: str(r[0]), views: num(r[1]) })).filter((p) => p.page.startsWith('/')),
    sources: rows(o.sources).map((r) => ({ host: str(r[0]), visits: num(r[1]) })).filter((s) => s.host !== ''),
    clicks: rows(o.clicks)
      .map((r) => ({ productId: str(r[0]), brand: str(r[1]), retailerId: str(r[2]), clicks: num(r[3]) }))
      .filter((c) => c.productId !== '' && c.retailerId !== '' && c.clicks > 0),
  };
}

/** One point per bucket, in order, zero where the database had nothing. */
export function fillSeries(keys: readonly string[], series: readonly StatsPoint[]): StatsPoint[] {
  const byKey = new Map(series.map((p) => [p.key, p]));
  return keys.map((key) => {
    const p = byKey.get(key);
    return { key, views: p?.views ?? 0, visits: p?.visits ?? 0 };
  });
}

export interface Ranked {
  key: string;
  count: number;
}

/** Totals by key, largest first, ties in key order, the first `limit`. */
function rank(pairs: Iterable<[string, number]>, limit: number): Ranked[] {
  const sums = new Map<string, number>();
  for (const [k, n] of pairs) if (k) sums.set(k, (sums.get(k) ?? 0) + n);
  return [...sums]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export interface ClickTops {
  total: number;
  products: Ranked[];
  brands: Ranked[];
  shops: Ranked[];
}

/** The Shop Clicks box: the total, then the most clicked products, brands and shops. */
export function clickTops(clicks: StatsData['clicks'], limit = 5): ClickTops {
  return {
    total: clicks.reduce((n, c) => n + c.clicks, 0),
    products: rank(clicks.map((c) => [c.productId, c.clicks]), limit),
    brands: rank(clicks.map((c) => [c.brand, c.clicks]), limit),
    shops: rank(clicks.map((c) => [c.retailerId, c.clicks]), limit),
  };
}

/** Totals over a filled series. */
export function seriesTotals(series: readonly StatsPoint[]): { views: number; visits: number } {
  return series.reduce((t, p) => ({ views: t.views + p.views, visits: t.visits + p.visits }), { views: 0, visits: 0 });
}

/**
 * The top of the chart's scale and its gridlines: the smallest of 1, 2 or 5
 * times a power of ten that holds the tallest bar, in four steps or fewer.
 */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((f) => f * pow).find((s) => s >= rough && Number.isInteger(s)) ?? Math.ceil(rough);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

let regionNames: Intl.DisplayNames | null | undefined;

/** A country's English name, or Unknown for a visit whose country was not known. */
export function countryName(code: string): string {
  if (!code) return 'Unknown';
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}
