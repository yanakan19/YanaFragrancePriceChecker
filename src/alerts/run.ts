/**
 * The daily price alert run: who gets an email today, what it says, and what
 * the sender remembers afterwards. Called by scripts/price-alerts.ts, which
 * supplies the real database, the real email provider and today's prices.
 * Everything it touches comes in as an argument, so tests run it with fakes
 * and no network.
 *
 * Logging rule: counts only. No email address, token, user id or key is ever
 * passed to `log`.
 */
import { evaluateItem } from './rules.js';
import { renderAlertEmail, type AlertLine } from './email.js';
import { accountUrl, unsubscribeUrl } from './unsubscribe.js';
import type { EmailProvider } from './provider.js';

export interface Recipient {
  userId: string;
  email: string;
  token: string;
  /** UK calendar day (YYYY-MM-DD) of the last email, or null. */
  lastSentOn: string | null;
}

export interface WishlistItem {
  wishlistId: string;
  userId: string;
  fragranceId: string;
  targetPriceGbp: number | null;
}

export interface HistoryRow {
  wishlistId: string;
  lastPriceGbp: number;
}

export interface HistoryWrite {
  wishlistId: string;
  userId: string;
  price: number;
  /** ISO time when this price went out in an email; null when only recorded. */
  emailedAt: string | null;
}

/** Where the sender reads and writes. scripts/price-alerts.ts backs it with Supabase. */
export interface AlertStore {
  recipients(): Promise<Recipient[]>;
  wishlistItems(userIds: readonly string[]): Promise<WishlistItem[]>;
  history(wishlistIds: readonly string[]): Promise<HistoryRow[]>;
  writeHistory(rows: readonly HistoryWrite[]): Promise<void>;
  markSent(userId: string, day: string): Promise<void>;
}

/** Today's figure for one fragrance, as the product page would headline it. */
export interface PriceToday {
  /** Cheapest delivered price, or null when there is no comparable one. */
  price: number | null;
  shop: string;
  /** Display name, "Brand Name Concentration Size". */
  name: string;
  /**
   * The product's own address segment (src/catalogue/productSlug.ts): the email
   * links to /<slug>. Left out for a product that has none, which links to the
   * old /fragrance/<id> address, which still opens it.
   */
  slug?: string | null;
}

/** Null when the fragrance is no longer in the catalogue at all. */
export type PriceLookup = (fragranceId: string) => PriceToday | null;

export interface UserPlan {
  recipient: Recipient;
  lines: AlertLine[];
  /** Baselines to store once this reader's email has gone. */
  onSend: HistoryWrite[];
}

export interface RunPlan {
  emails: UserPlan[];
  /** First sightings: stored whether or not anything is sent. */
  recordNow: HistoryWrite[];
  itemsChecked: number;
  itemsWithoutPrice: number;
  /** Readers with something to say who were already emailed today. */
  alreadySentToday: number;
}

/** The UK calendar day for `now`, as YYYY-MM-DD. */
export function ukDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * The link an email gives for a product: its own address, /BRAND_NAME_VOLUME,
 * when its slug is known, and the old /fragrance/<id> address (which redirects
 * to it) when it is not. The wishlist keeps ids; only the link is an address.
 */
export function productUrl(siteUrl: string, fragranceId: string, slug?: string | null): string {
  const base = siteUrl.replace(/\/$/, '');
  return slug ? `${base}/${slug}` : `${base}/fragrance/${encodeURIComponent(fragranceId)}`;
}

export interface PlanInput {
  recipients: readonly Recipient[];
  items: readonly WishlistItem[];
  history: readonly HistoryRow[];
  priceFor: PriceLookup;
  siteUrl: string;
  today: string;
}

export function planRun({ recipients, items, history, priceFor, siteUrl, today }: PlanInput): RunPlan {
  const baselineOf = new Map(history.map((h) => [h.wishlistId, h.lastPriceGbp]));
  const itemsOf = new Map<string, WishlistItem[]>();
  for (const it of items) {
    const list = itemsOf.get(it.userId) ?? [];
    list.push(it);
    itemsOf.set(it.userId, list);
  }

  const plan: RunPlan = { emails: [], recordNow: [], itemsChecked: 0, itemsWithoutPrice: 0, alreadySentToday: 0 };
  // One email per reader: recipients are deduplicated by user id first, so a
  // store that ever returned the same reader twice still yields one email.
  const seen = new Set<string>();

  for (const recipient of recipients) {
    if (seen.has(recipient.userId)) continue;
    seen.add(recipient.userId);

    const lines: AlertLine[] = [];
    const onSend: HistoryWrite[] = [];
    for (const item of itemsOf.get(recipient.userId) ?? []) {
      plan.itemsChecked++;
      const found = priceFor(item.fragranceId);
      if (!found || found.price === null) {
        plan.itemsWithoutPrice++;
        continue;
      }
      const baseline = baselineOf.get(item.wishlistId) ?? null;
      const verdict = evaluateItem({ current: found.price, baseline, target: item.targetPriceGbp });
      if (verdict.write?.when === 'now') {
        plan.recordNow.push({ wishlistId: item.wishlistId, userId: item.userId, price: verdict.write.price, emailedAt: null });
      }
      if (verdict.alert && verdict.write) {
        lines.push({
          name: found.name,
          url: productUrl(siteUrl, item.fragranceId, found.slug),
          price: verdict.write.price,
          shop: found.shop,
          from: baseline,
          target: item.targetPriceGbp,
          reason: verdict.alert,
        });
        onSend.push({ wishlistId: item.wishlistId, userId: item.userId, price: verdict.write.price, emailedAt: null });
      }
    }

    if (lines.length === 0) continue;
    if (recipient.lastSentOn === today) {
      plan.alreadySentToday++;
      continue;
    }
    // Biggest saving first, so the line that made the email worth sending
    // is the one at the top.
    const order = lines.map((l, i) => ({ l, w: onSend[i]! })).sort(
      (a, b) => (b.l.from ?? b.l.price) - b.l.price - ((a.l.from ?? a.l.price) - a.l.price),
    );
    plan.emails.push({ recipient, lines: order.map((o) => o.l), onSend: order.map((o) => o.w) });
  }
  return plan;
}

export interface RunOptions {
  store: AlertStore;
  provider: EmailProvider;
  priceFor: PriceLookup;
  siteUrl: string;
  now: Date;
  dryRun: boolean;
  log: (line: string) => void;
  /** Stay inside the provider's daily allowance; the rest go tomorrow. */
  maxEmails?: number;
  /** Gap between sends, to stay inside the provider's rate limit. */
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunSummary {
  recipients: number;
  itemsChecked: number;
  emailsPlanned: number;
  emailsSent: number;
  emailsFailed: number;
  emailsDeferred: number;
  baselinesRecorded: number;
  dryRun: boolean;
}

export async function runPriceAlerts(opts: RunOptions): Promise<RunSummary> {
  const { store, provider, priceFor, siteUrl, now, dryRun, log } = opts;
  const maxEmails = opts.maxEmails ?? 90;
  const pauseMs = opts.pauseMs ?? 600;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const today = ukDay(now);

  const recipients = await store.recipients();
  const summary: RunSummary = {
    recipients: recipients.length,
    itemsChecked: 0,
    emailsPlanned: 0,
    emailsSent: 0,
    emailsFailed: 0,
    emailsDeferred: 0,
    baselinesRecorded: 0,
    dryRun,
  };
  if (recipients.length === 0) {
    log('No readers have price alerts switched on. Nothing to do.');
    return summary;
  }

  const items = await store.wishlistItems(recipients.map((r) => r.userId));
  const history = await store.history(items.map((i) => i.wishlistId));
  const plan = planRun({ recipients, items, history, priceFor, siteUrl, today });
  summary.itemsChecked = plan.itemsChecked;
  summary.emailsPlanned = plan.emails.length;

  log(
    `${recipients.length} reader(s) opted in, ${plan.itemsChecked} saved item(s) checked, ` +
      `${plan.itemsWithoutPrice} without a comparable price today, ${plan.recordNow.length} seen for the first time, ` +
      `${plan.emails.length} email(s) due, ${plan.alreadySentToday} already emailed today.`,
  );

  if (dryRun) {
    for (const [i, e] of plan.emails.entries()) {
      log(`Dry run: email ${i + 1} would list ${e.lines.length} item(s): ${e.lines.map((l) => `${l.reason} to ${l.price.toFixed(2)}`).join(', ')}.`);
    }
    log('Dry run: nothing sent and nothing written.');
    return summary;
  }

  if (plan.recordNow.length > 0) {
    await store.writeHistory(plan.recordNow);
    summary.baselinesRecorded = plan.recordNow.length;
  }

  for (const [i, e] of plan.emails.entries()) {
    if (i >= maxEmails) {
      summary.emailsDeferred = plan.emails.length - maxEmails;
      log(`Reached the cap of ${maxEmails} emails for one run; ${summary.emailsDeferred} left for tomorrow.`);
      break;
    }
    if (i > 0) await sleep(pauseMs);
    const rendered = renderAlertEmail({
      lines: e.lines,
      unsubscribeUrl: unsubscribeUrl(siteUrl, e.recipient.token),
      accountUrl: accountUrl(siteUrl),
    });
    const result = await provider.send({
      to: e.recipient.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      unsubscribeUrl: unsubscribeUrl(siteUrl, e.recipient.token),
      idempotencyKey: `price-alert/${e.recipient.userId}/${today}`,
    });
    if (!result.ok) {
      summary.emailsFailed++;
      log(`Email ${i + 1} not sent (${result.reason}). Its drops stay pending for the next run.`);
      continue;
    }
    summary.emailsSent++;
    const sentAt = now.toISOString();
    await store.writeHistory(e.onSend.map((w) => ({ ...w, emailedAt: sentAt })));
    await store.markSent(e.recipient.userId, today);
  }

  log(`Sent ${summary.emailsSent} email(s) through ${provider.name}, ${summary.emailsFailed} failed.`);
  return summary;
}
