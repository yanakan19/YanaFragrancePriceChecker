import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DROP_MIN_GBP, dropThreshold, evaluateItem } from '../src/alerts/rules.js';
import { CAVEAT, INTRO, INTRO_MANY, MANAGE, STOP, WHY, renderAlertEmail, type AlertLine } from '../src/alerts/email.js';
import {
  planRun,
  productUrl,
  runPriceAlerts,
  ukDay,
  type AlertStore,
  type HistoryRow,
  type HistoryWrite,
  type PriceLookup,
  type Recipient,
  type WishlistItem,
} from '../src/alerts/run.js';
import { resendProvider, RESEND_ENDPOINT, type EmailProvider, type OutgoingEmail, type FetchLike } from '../src/alerts/provider.js';
import { notConfiguredMessage, readAlertConfig } from '../src/alerts/config.js';
import {
  isAlertToken,
  unsubscribeMessage,
  unsubscribeUrl,
  unsubscribeWithToken,
  UNSUBSCRIBE_PARAM,
} from '../src/alerts/unsubscribe.js';
import { parseTargetPrice } from '../src/alerts/target.js';
import { matchRoute } from '../demo/router.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://pricesniffs.space';
const TOKEN = '3f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b';
const NOW = new Date('2026-10-01T07:41:00Z');
const TODAY = '2026-10-01';

/** Any hyphen or dash a reader could see: hyphen minus, the Unicode hyphens and dashes, and minus. */
const DASH = /[-‐-―−]/;
const withoutUrls = (s: string) => s.replace(/https?:\/\/\S+/g, ' ');
const visibleText = (html: string) =>
  withoutUrls(
    html
      .replace(/<head>[\s\S]*?<\/head>/, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/g, ' '),
  );

describe('drop detection rules', () => {
  it('needs 5% or £2, whichever is larger', () => {
    expect(dropThreshold(20)).toBe(DROP_MIN_GBP); // 5% would be £1
    expect(dropThreshold(40)).toBe(2); // the two meet
    expect(dropThreshold(100)).toBe(5);
    expect(dropThreshold(250)).toBe(12.5);
  });

  it('a drop exactly at the threshold counts, a penny short does not', () => {
    expect(evaluateItem({ baseline: 100, current: 95, target: null }).alert).toBe('drop');
    expect(evaluateItem({ baseline: 100, current: 95.01, target: null }).alert).toBeNull();
    expect(evaluateItem({ baseline: 30, current: 28, target: null }).alert).toBe('drop');
    expect(evaluateItem({ baseline: 30, current: 28.5, target: null }).alert).toBeNull(); // 5% but under £2
  });

  it('the first sighting is recorded straight away and sends nothing', () => {
    expect(evaluateItem({ baseline: null, current: 42, target: null })).toEqual({
      alert: null,
      write: { price: 42, when: 'now' },
    });
  });

  it('a target already met on first sighting sends once', () => {
    expect(evaluateItem({ baseline: null, current: 40, target: 45 })).toEqual({
      alert: 'target',
      write: { price: 40, when: 'onSend' },
    });
  });

  it('crossing the target sends even when the drop is small', () => {
    const v = evaluateItem({ baseline: 45.5, current: 45, target: 45 });
    expect(v.alert).toBe('target');
  });

  it('staying under a target already emailed does not send again', () => {
    expect(evaluateItem({ baseline: 40, current: 39.5, target: 45 }).alert).toBeNull();
  });

  it('a rise, or no change, leaves the baseline alone', () => {
    expect(evaluateItem({ baseline: 50, current: 55, target: null })).toEqual({ alert: null, write: null });
    expect(evaluateItem({ baseline: 50, current: 50, target: null })).toEqual({ alert: null, write: null });
  });

  it('no comparable price today means no email and no write', () => {
    expect(evaluateItem({ baseline: 50, current: null, target: 60 })).toEqual({ alert: null, write: null });
  });
});

/** An in memory AlertStore, recording every write. */
function memoryStore(recipients: Recipient[], items: WishlistItem[], history: HistoryRow[] = []) {
  const rows = new Map(history.map((h) => [h.wishlistId, h.lastPriceGbp]));
  const writes: HistoryWrite[] = [];
  const sent: { userId: string; day: string }[] = [];
  const store: AlertStore = {
    recipients: async () => recipients.map((r) => ({ ...r, lastSentOn: sent.find((s) => s.userId === r.userId)?.day ?? r.lastSentOn })),
    wishlistItems: async (ids) => items.filter((i) => ids.includes(i.userId)),
    history: async (ids) => [...rows].filter(([id]) => ids.includes(id)).map(([wishlistId, lastPriceGbp]) => ({ wishlistId, lastPriceGbp })),
    writeHistory: async (ws) => {
      for (const w of ws) {
        writes.push(w);
        rows.set(w.wishlistId, w.price);
      }
    },
    markSent: async (userId, day) => {
      sent.push({ userId, day });
    },
  };
  return { store, writes, sent, rows };
}

function fakeProvider(fail = false) {
  const outbox: OutgoingEmail[] = [];
  const provider: EmailProvider = {
    name: 'Fake',
    send: async (e) => {
      if (fail) return { ok: false, reason: 'HTTP 500' };
      outbox.push(e);
      return { ok: true };
    },
  };
  return { provider, outbox };
}

const ann: Recipient = { userId: 'u1', email: 'ann@example.com', token: TOKEN, lastSentOn: null };
const bob: Recipient = { userId: 'u2', email: 'bob@example.com', token: '0f2a9c1e-8b7d-4e6f-9a0b-1c2d3e4f5a6b', lastSentOn: null };

const prices: Record<string, number | null> = { a: 90, b: 40, c: 70, d: 100, gone: null };
const priceFor: PriceLookup = (id) =>
  id in prices
    ? {
        price: prices[id]!,
        shop: 'Boots',
        name: `Fragrance ${id.toUpperCase()}, Eau de Parfum 100ml`,
        // Only product "a" has a slug here; the others fall back to the old address.
        ...(id === 'a' ? { slug: 'fragrance_a_eau_de_parfum_100ml' } : {}),
      }
    : null;

const item = (wishlistId: string, userId: string, fragranceId: string, target: number | null = null): WishlistItem => ({
  wishlistId,
  userId,
  fragranceId,
  targetPriceGbp: target,
});

const quiet = () => {
  const lines: string[] = [];
  return { log: (l: string) => lines.push(l), lines };
};

describe('one email per reader per day, listing every drop', () => {
  it('three drops for one reader make one email with three items, biggest saving first', () => {
    const plan = planRun({
      recipients: [ann],
      items: [item('w1', 'u1', 'a'), item('w2', 'u1', 'b', 45), item('w3', 'u1', 'c')],
      history: [
        { wishlistId: 'w1', lastPriceGbp: 100 }, // £10 off
        { wishlistId: 'w2', lastPriceGbp: 46 }, // crosses the £45 target
        { wishlistId: 'w3', lastPriceGbp: 90 }, // £20 off
      ],
      priceFor,
      siteUrl: SITE,
      today: TODAY,
    });
    expect(plan.emails).toHaveLength(1);
    expect(plan.emails[0]!.lines.map((l) => l.price)).toEqual([70, 90, 40]);
    expect(plan.emails[0]!.lines[2]!.reason).toBe('target');
  });

  it('the same reader listed twice still gets one email', () => {
    const plan = planRun({
      recipients: [ann, { ...ann }],
      items: [item('w1', 'u1', 'a')],
      history: [{ wishlistId: 'w1', lastPriceGbp: 100 }],
      priceFor,
      siteUrl: SITE,
      today: TODAY,
    });
    expect(plan.emails).toHaveLength(1);
  });

  it('a reader already emailed today is not emailed again', () => {
    const plan = planRun({
      recipients: [{ ...ann, lastSentOn: TODAY }],
      items: [item('w1', 'u1', 'a')],
      history: [{ wishlistId: 'w1', lastPriceGbp: 100 }],
      priceFor,
      siteUrl: SITE,
      today: TODAY,
    });
    expect(plan.emails).toHaveLength(0);
    expect(plan.alreadySentToday).toBe(1);
  });

  it('readers are emailed separately, each about only their own list', async () => {
    const { store } = memoryStore(
      [ann, bob],
      [item('w1', 'u1', 'a'), item('w2', 'u2', 'c')],
      [
        { wishlistId: 'w1', lastPriceGbp: 100 },
        { wishlistId: 'w2', lastPriceGbp: 80 },
      ],
    );
    const { provider, outbox } = fakeProvider();
    await runPriceAlerts({ store, provider, priceFor, siteUrl: SITE, now: NOW, dryRun: false, log: quiet().log, sleep: async () => {} });
    expect(outbox.map((e) => e.to).sort()).toEqual(['ann@example.com', 'bob@example.com']);
    const annMail = outbox.find((e) => e.to === 'ann@example.com')!;
    // The email links to the product's own address, not the old one.
    expect(annMail.text).toContain(`${SITE}/fragrance_a_eau_de_parfum_100ml`);
    expect(annMail.text).not.toContain('/fragrance/a');
    expect(annMail.text).not.toContain('fragrance_c');
    const bobMail = outbox.find((e) => e.to === 'bob@example.com')!;
    // A product with no slug still gets a link that works: the old address redirects.
    expect(bobMail.text).toContain(`${SITE}/fragrance/c`);
  });
});

describe('de-duplication', () => {
  it('a drop is emailed once; the next run at the same price sends nothing', async () => {
    const { store, sent } = memoryStore([ann], [item('w1', 'u1', 'a')], [{ wishlistId: 'w1', lastPriceGbp: 100 }]);
    const { provider, outbox } = fakeProvider();
    const opts = { store, provider, priceFor, siteUrl: SITE, dryRun: false, log: quiet().log, sleep: async () => {} };

    await runPriceAlerts({ ...opts, now: NOW });
    expect(outbox).toHaveLength(1);
    expect(sent).toEqual([{ userId: 'u1', day: TODAY }]);

    // Tomorrow, unchanged price: the baseline is now £90.
    await runPriceAlerts({ ...opts, now: new Date('2026-10-02T07:41:00Z') });
    expect(outbox).toHaveLength(1);
  });

  it('a second run on the same day does not send twice, even after a further drop', async () => {
    const { store } = memoryStore([ann], [item('w1', 'u1', 'd')], [{ wishlistId: 'w1', lastPriceGbp: 120 }]);
    const { provider, outbox } = fakeProvider();
    const opts = { store, provider, priceFor, siteUrl: SITE, now: NOW, dryRun: false, log: quiet().log, sleep: async () => {} };
    await runPriceAlerts(opts);
    prices.d = 80;
    try {
      await runPriceAlerts(opts);
    } finally {
      prices.d = 100;
    }
    expect(outbox).toHaveLength(1);
  });

  it('first sightings are recorded without an email', async () => {
    const { store, writes } = memoryStore([ann], [item('w1', 'u1', 'a')]);
    const { provider, outbox } = fakeProvider();
    await runPriceAlerts({ store, provider, priceFor, siteUrl: SITE, now: NOW, dryRun: false, log: quiet().log });
    expect(outbox).toHaveLength(0);
    expect(writes).toEqual([{ wishlistId: 'w1', userId: 'u1', price: 90, emailedAt: null }]);
  });

  it('a failed send keeps the drop pending: no baseline moved, not marked as sent', async () => {
    const { store, writes, sent } = memoryStore([ann], [item('w1', 'u1', 'a')], [{ wishlistId: 'w1', lastPriceGbp: 100 }]);
    const { provider } = fakeProvider(true);
    const q = quiet();
    const s = await runPriceAlerts({ store, provider, priceFor, siteUrl: SITE, now: NOW, dryRun: false, log: q.log });
    expect(s.emailsFailed).toBe(1);
    expect(writes).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('a dry run sends nothing and writes nothing', async () => {
    const { store, writes, sent } = memoryStore([ann], [item('w1', 'u1', 'a'), item('w2', 'u1', 'c')], [{ wishlistId: 'w1', lastPriceGbp: 100 }]);
    const { provider, outbox } = fakeProvider();
    const q = quiet();
    const s = await runPriceAlerts({ store, provider, priceFor, siteUrl: SITE, now: NOW, dryRun: true, log: q.log });
    expect(s.emailsPlanned).toBe(1);
    expect(outbox).toHaveLength(0);
    expect(writes).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(q.lines.join('\n')).toContain('Dry run');
  });

  it('stops at the daily cap and leaves the rest for tomorrow', async () => {
    const { store } = memoryStore(
      [ann, bob],
      [item('w1', 'u1', 'a'), item('w2', 'u2', 'a')],
      [
        { wishlistId: 'w1', lastPriceGbp: 100 },
        { wishlistId: 'w2', lastPriceGbp: 100 },
      ],
    );
    const { provider, outbox } = fakeProvider();
    const s = await runPriceAlerts({ store, provider, priceFor, siteUrl: SITE, now: NOW, dryRun: false, log: quiet().log, maxEmails: 1 });
    expect(outbox).toHaveLength(1);
    expect(s.emailsDeferred).toBe(1);
  });

  it('never logs an address or a token', async () => {
    const { store } = memoryStore([ann], [item('w1', 'u1', 'a')], [{ wishlistId: 'w1', lastPriceGbp: 100 }]);
    for (const dryRun of [true, false]) {
      const q = quiet();
      await runPriceAlerts({ store, provider: fakeProvider(!dryRun).provider, priceFor, siteUrl: SITE, now: NOW, dryRun, log: q.log });
      const all = q.lines.join('\n');
      expect(all).not.toContain('@');
      expect(all).not.toContain(TOKEN);
    }
  });

  it('uses the UK calendar day', () => {
    expect(ukDay(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02'); // BST
    expect(ukDay(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01'); // GMT
  });
});

describe('the product link in an email', () => {
  it('is the product\'s own address when its slug is known', () => {
    expect(productUrl('https://pricesniffs.space', 'ean-1', 'creed_aventus_100ml')).toBe('https://pricesniffs.space/creed_aventus_100ml');
    expect(productUrl('https://pricesniffs.space/', 'ean-1', 'creed_aventus_100ml')).toBe('https://pricesniffs.space/creed_aventus_100ml');
  });

  it('is the old address, which redirects, when it is not', () => {
    expect(productUrl('https://pricesniffs.space', 'ean-1')).toBe('https://pricesniffs.space/fragrance/ean-1');
    expect(productUrl('https://pricesniffs.space', 'a b', null)).toBe('https://pricesniffs.space/fragrance/a%20b');
  });
});

describe('the email', () => {
  const lines: AlertLine[] = [
    { name: 'Dior Sauvage, Eau de Parfum 100ml', url: `${SITE}/fragrance/ean-3348901486392`, price: 72, shop: 'Boots', from: 85, target: null, reason: 'drop' },
    { name: 'Afnan 9am Dive, Eau de Parfum 100ml', url: `${SITE}/fragrance/ean-6290171072836`, price: 24.99, shop: 'Emirates Oud', from: null, target: 25, reason: 'target' },
  ];
  const email = renderAlertEmail({ lines, unsubscribeUrl: unsubscribeUrl(SITE, TOKEN), accountUrl: `${SITE}/account` });

  it('lists every drop with its product page link and the saving', () => {
    expect(email.subject).toBe('Price drop: 2 fragrances on your wishlist are cheaper today');
    expect(email.text).toContain('Now £72.00 delivered at Boots, down from £85.00. You save £13.00.');
    expect(email.text).toContain('Now £24.99 delivered at Emirates Oud. That is at or below your target of £25.00.');
    expect(email.text).toContain(`${SITE}/fragrance/ean-3348901486392`);
    expect(email.html).toContain(`href="${SITE}/fragrance/ean-6290171072836"`);
  });

  it('carries a one click unsubscribe link in both parts', () => {
    const link = `${SITE}/account?unsubscribe=${TOKEN}`;
    expect(email.text).toContain(link);
    expect(email.html).toContain(`href="${link}"`);
  });

  it('a single drop names the fragrance in the subject', () => {
    const one = renderAlertEmail({ lines: [lines[0]!], unsubscribeUrl: 'u', accountUrl: 'a' });
    expect(one.subject).toBe('Price drop: Dior Sauvage, Eau de Parfum 100ml is now £72.00');
  });

  it('has no hyphens or dashes in its copy', () => {
    for (const s of [INTRO, INTRO_MANY, CAVEAT, WHY, STOP, MANAGE, email.subject]) expect(s).not.toMatch(DASH);
    expect(withoutUrls(email.text)).not.toMatch(DASH);
    expect(visibleText(email.html)).not.toMatch(DASH);
    for (const o of ['done', 'unknown', 'error'] as const) {
      const m = unsubscribeMessage(o);
      expect(m.title + m.message).not.toMatch(DASH);
    }
  });

  it('escapes product names in the HTML', () => {
    const e = renderAlertEmail({ lines: [{ ...lines[0]!, name: 'A <b>& B' }], unsubscribeUrl: 'u', accountUrl: 'a' });
    expect(e.html).toContain('A &lt;b&gt;&amp; B');
  });
});

describe('the unsubscribe token flow', () => {
  it('the email link lands on the account route with the token in the query', () => {
    const url = new URL(unsubscribeUrl(SITE, TOKEN));
    const route = matchRoute(url.pathname, url.search);
    expect(route.name).toBe('account');
    expect(route.query[UNSUBSCRIBE_PARAM]).toBe(TOKEN);
  });

  it('only a uuid shaped token is sent anywhere', async () => {
    const calls: unknown[] = [];
    const client = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push([fn, args]), { data: true, error: null }) };
    expect(isAlertToken(TOKEN)).toBe(true);
    expect(isAlertToken('not-a-token')).toBe(false);
    expect(await unsubscribeWithToken(client, "x' or 1=1")).toBe('unknown');
    expect(calls).toHaveLength(0);
  });

  it('calls the RPC with the token alone and reports the outcome', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const reply = (data: unknown, error: unknown = null) => ({
      rpc: async (fn: string, args: Record<string, unknown>) => (calls.push([fn, args]), { data, error }),
    });
    expect(await unsubscribeWithToken(reply(true), TOKEN)).toBe('done');
    expect(calls[0]).toEqual(['unsubscribe_price_alerts', { p_token: TOKEN }]);
    expect(await unsubscribeWithToken(reply(false), TOKEN)).toBe('unknown');
    expect(await unsubscribeWithToken(reply(null, { code: '42883' }), TOKEN)).toBe('error');
    expect(await unsubscribeWithToken(null, TOKEN)).toBe('error');
  });

  it('the migration makes the RPC token only, and the recipient list service role only', () => {
    const sql = readFileSync(resolve(root, 'supabase/migrations/0004_price_alerts.sql'), 'utf8');
    expect(sql).toMatch(/create or replace function public\.unsubscribe_price_alerts\(p_token uuid\)\s+returns boolean\s+language plpgsql\s+security definer\s+set search_path = ''/);
    expect(sql).toMatch(/grant execute on function public\.unsubscribe_price_alerts\(uuid\) to anon, authenticated;/);
    expect(sql).toMatch(/update public\.profiles set price_alerts = false where id = owner_id;/);
    expect(sql).toMatch(/revoke all on function public\.price_alert_recipients\(\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.price_alert_recipients\(\) to service_role;/);
    expect(sql).toMatch(/add column if not exists price_alerts boolean not null default false/);
    // Both server only tables: RLS on, privileges revoked, and no policy at all.
    for (const t of ['price_alert_accounts', 'price_alert_history']) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${t} from public, anon, authenticated;`);
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${t}`));
    }
  });
});

describe('the email provider adapter', () => {
  it('posts to Resend with the key, an idempotency key and an unsubscribe header', async () => {
    const seen: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const fetch: FetchLike = async (url, init) => {
      seen.push({ url, init });
      return { ok: true, status: 200, text: async () => '{"id":"x"}' };
    };
    const p = resendProvider({ apiKey: 're_test', from: 'PriceSniffs <alerts@pricesniffs.space>', replyTo: 'hi@example.com', fetch });
    const r = await p.send({ to: 'ann@example.com', subject: 'S', text: 'T', html: 'H', unsubscribeUrl: 'https://x/u', idempotencyKey: 'k1' });
    expect(r).toEqual({ ok: true });
    expect(seen[0]!.url).toBe(RESEND_ENDPOINT);
    expect(seen[0]!.init.headers.Authorization).toBe('Bearer re_test');
    expect(seen[0]!.init.headers['Idempotency-Key']).toBe('k1');
    const body = JSON.parse(seen[0]!.init.body);
    expect(body.to).toEqual(['ann@example.com']);
    expect(body.reply_to).toBe('hi@example.com');
    expect(body.headers['List-Unsubscribe']).toBe('<https://x/u>');
  });

  it('a failure reason never repeats the address or the key', async () => {
    const fetch: FetchLike = async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ name: 'validation_error', message: 'Invalid `to` field: ann@example.com re_test' }),
    });
    const r = await resendProvider({ apiKey: 're_test', from: 'f', fetch }).send({
      to: 'ann@example.com', subject: 'S', text: 'T', html: 'H', unsubscribeUrl: 'u', idempotencyKey: 'k',
    });
    expect(r).toEqual({ ok: false, reason: 'HTTP 422 validation_error' });
  });
});

describe('not configured', () => {
  it('names the missing secrets and nothing else', () => {
    expect(readAlertConfig({})).toEqual({ configured: false, missing: ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY'] });
    expect(readAlertConfig({ SUPABASE_SERVICE_ROLE_KEY: 'secret', RESEND_API_KEY: ' ' })).toEqual({ configured: false, missing: ['RESEND_API_KEY'] });
    const msg = notConfiguredMessage(['RESEND_API_KEY']);
    expect(msg).toContain('not configured');
    expect(msg).not.toContain('secret');
  });

  it('is a dry run unless told otherwise', () => {
    const base = { SUPABASE_SERVICE_ROLE_KEY: 'a', RESEND_API_KEY: 'b' };
    expect(readAlertConfig(base)).toMatchObject({ configured: true, dryRun: true, from: 'PriceSniffs <alerts@pricesniffs.space>' });
    expect(readAlertConfig({ ...base, DRY_RUN: 'false' })).toMatchObject({ dryRun: false });
    expect(readAlertConfig({ ...base, DRY_RUN: 'flase' })).toMatchObject({ dryRun: true });
  });

  it('the script prints "not configured" and exits 0 with no secrets', () => {
    const env = { ...process.env };
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.RESEND_API_KEY;
    const r = spawnSync(process.execPath, ['--import', 'tsx', resolve(root, 'scripts/price-alerts.ts')], { env, encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Price alerts not configured');
  });

  it('the workflow passes both secrets and defaults manual runs to a dry run', () => {
    const yml = readFileSync(resolve(root, '.github/workflows/price-alerts.yml'), 'utf8');
    expect(yml).toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}');
    expect(yml).toContain('RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}');
    expect(yml).toMatch(/dry_run:\s+description: [^\n]+\n\s+type: boolean\n\s+default: true/);
    expect(yml).toMatch(/cron: '(\d|[1-5]\d) \d+ \* \* \*'/);
    expect(yml).not.toMatch(/cron: '0 /);
  });
});

describe('target price input', () => {
  it('accepts pounds and pence, clears on blank, refuses nonsense', () => {
    expect(parseTargetPrice('45')).toEqual({ ok: true, value: 45 });
    expect(parseTargetPrice(' £45.5 ')).toEqual({ ok: true, value: 45.5 });
    expect(parseTargetPrice('')).toEqual({ ok: true, value: null });
    expect(parseTargetPrice('-3')).toEqual({ ok: false });
    expect(parseTargetPrice('0')).toEqual({ ok: false });
    expect(parseTargetPrice('45.555')).toEqual({ ok: false });
    expect(parseTargetPrice('abc')).toEqual({ ok: false });
    expect(parseTargetPrice('20000')).toEqual({ ok: false });
  });
});
