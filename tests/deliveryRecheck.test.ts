import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RETAILERS } from '../src/config/retailers.js';
import type { Retailer } from '../src/types/retailer.js';
import { readShippingTerms } from '../src/catalogue/shippingTerms.js';
import { urlLooksLikeDeliveryPage } from '../src/catalogue/shippingPageFinder.js';
import {
  recheckTargets,
  recheckUrl,
  recheckShop,
  compareDelivery,
  blockReason,
  buildRecheckReport,
  renderRecheckMarkdown,
  renderIssueBody,
  issueTitle,
  monthLabel,
  ageInDays,
  VERIFIED_STALE_DAYS,
  UNQUOTED_DELIVERY_PAGES,
  type PageFetch,
  type RecheckTarget,
  type RecordedDelivery,
} from '../scripts/deliveryRecheck.js';

/**
 * The monthly delivery re-check compares a shop's own delivery page with the
 * registry and reports same / changed / blocked / unreadable. None of this
 * touches the network: pages are small HTML strings fed through the same
 * extractor (readShippingTerms) the live run uses.
 */

const TODAY = '2026-10-01';
const URL_ = 'https://shop.example/policies/shipping-policy';
const read = (html: string, url: string) => readShippingTerms(html, { deliveryPage: urlLooksLikeDeliveryPage(url) });

function recorded(over: Partial<RecordedDelivery> = {}): RecordedDelivery {
  return {
    standardGbp: 3.95,
    freeOverGbp: 25,
    standardRateNotPublished: false,
    verifiedAt: TODAY,
    confidence: 'confirmed',
    ...over,
  };
}

function target(over: Partial<RecordedDelivery> = {}, url: string | null = URL_): RecheckTarget {
  return { retailerId: 'shop', name: 'Shop', url, recorded: recorded(over) };
}

const page = (...paragraphs: string[]) =>
  `<html><body><h1>Delivery information</h1>${paragraphs.map((p) => `<p>${p}</p>`).join('')}</body></html>`;

const ok = (body: string, status = 200): PageFetch => ({ kind: 'response', status, ok: status < 300, body });

function compare(html: string, over: Partial<RecordedDelivery> = {}) {
  return compareDelivery(recorded(over), read(html, URL_));
}

describe('compareDelivery', () => {
  it('is "same" when the page still names the recorded charge and threshold', () => {
    const v = compare(page('Standard delivery costs £3.95.', 'Free UK delivery on orders over £25.'));
    expect(v.status).toBe('same');
    expect(v.found.standardGbp).toBe(3.95);
    expect(v.found.freeOverGbp).toBe(25);
  });

  it('is "changed" when the standard charge moved', () => {
    const v = compare(page('Standard delivery costs £4.50.', 'Free UK delivery on orders over £25.'));
    expect(v.status).toBe('changed');
    expect(v.found.standardGbp).toBe(4.5);
    expect(v.reason).toContain('recorded £3.95');
    expect(v.reason).toContain('£4.50');
  });

  it('is "changed" when the free-delivery threshold moved', () => {
    const v = compare(page('Standard delivery costs £3.95.', 'Free UK delivery on orders over £30.'));
    expect(v.status).toBe('changed');
    expect(v.found.freeOverGbp).toBe(30);
    expect(v.reason).toContain('free over');
  });

  it('stays "same" on a page that lists other regions beside the recorded UK rate', () => {
    const v = compare(
      page('UK Standard delivery £3.95, free UK delivery over £25.', 'Europe standard delivery £9.95.'),
    );
    expect(v.status).toBe('same');
    expect(v.found.standardGbp).toBe(3.95);
  });

  it('does not call a change when the recorded charge is still in the sentence the extractor misread', () => {
    // Escentric Molecules' own wording, 2026-10-01: the extractor reads £80 as
    // the charge, but £7.50 is right there.
    const v = compare(
      page('Enjoy complimentary delivery on orders of £80 or more, and £7.50 on orders under £80.'),
      { standardGbp: 7.5, freeOverGbp: 80 },
    );
    expect(v.status).toBe('same');
  });

  it('ignores a spend condition that is not a free-delivery threshold', () => {
    // Morrisons' delivery-pass page, 2026-10-01.
    const v = compare(page('£5 off your first 3 fast orders with code: 5firstnow *min spend £30'), {
      standardGbp: null,
      freeOverGbp: null,
      standardRateNotPublished: true,
    });
    expect(v.status).not.toBe('changed');
  });

  it('treats an always-free shop whose page still says free as "same"', () => {
    const v = compare(page('Free delivery on all UK orders.'), { standardGbp: 0, freeOverGbp: 0 });
    expect(v.status).toBe('same');
    expect(v.found.standardGbp).toBe(0);
  });

  it('flags a shop recorded as publishing no rate whose page now names one', () => {
    const v = compare(page('Standard delivery costs £4.99.', 'Free delivery on orders over £50.'), {
      standardGbp: null,
      freeOverGbp: 50,
      standardRateNotPublished: true,
    });
    expect(v.status).toBe('changed');
    expect(v.found.standardGbp).toBe(4.99);
  });

  it('keeps a no-rate shop "same" while the page still names only the threshold', () => {
    const v = compare(page('Free UK delivery on orders over £50.'), {
      standardGbp: null,
      freeOverGbp: 50,
      standardRateNotPublished: true,
    });
    expect(v.status).toBe('same');
  });

  it('is "unreadable", not "changed", when the page names no charge at all', () => {
    const v = compare(page('Free UK delivery on orders over £25.'));
    expect(v.status).toBe('unreadable');
    expect(v.reason).toContain('£3.95');
  });

  it('is "unreadable" when the page carries no delivery terms', () => {
    const v = compare('<html><body><div id="app"></div><script>render()</script></body></html>');
    expect(v.status).toBe('unreadable');
  });
});

describe('recheckShop — what came back from the shop', () => {
  const run = (f: PageFetch, t: RecheckTarget = target()) => recheckShop(t, f, read, TODAY);

  it('reads a normal page', () => {
    const row = run(ok(page('Standard delivery costs £3.95.', 'Free UK delivery on orders over £25.')));
    expect(row.status).toBe('same');
    expect(row.httpStatus).toBe(200);
    expect(row.evidence.length).toBeGreaterThan(0);
  });

  it.each([
    ['403', ok('Forbidden', 403)],
    ['429', ok('Too many requests', 429)],
    ['503', ok('Service unavailable', 503)],
    ['a timeout', { kind: 'response', status: 0, ok: false, body: '', error: 'AbortError' } as PageFetch],
    ['a SiteGround captcha on 202', ok('<html><script src="/.well-known/sgcaptcha/?r=x"></script></html>', 202)],
    [
      'an Incapsula interstitial on 200',
      ok('<iframe src="/_Incapsula_Resource?x=1">Request unsuccessful. Incapsula incident ID: 1</iframe>'),
    ],
    ['a Cloudflare challenge on 200', ok('<title>Just a moment...</title><div id="cf-chl-widget"></div>')],
    ['robots.txt disallowing the page', { kind: 'robots-disallowed' } as PageFetch],
    ['robots.txt unreachable', { kind: 'robots-unreachable' } as PageFetch],
  ])('records %s as "blocked", never a failure', (_label, fetched) => {
    expect(run(fetched).status).toBe('blocked');
  });

  it('records a 404 as "unreadable" — the page moved', () => {
    const row = run(ok('<h1>Not found</h1> please verify you are human', 404));
    expect(row.status).toBe('unreadable');
    expect(row.reason).toContain('404');
  });

  it('does not mistake a contact-form captcha on a readable page for a block', () => {
    const row = run(
      ok(page('Standard delivery costs £3.95.', 'Free UK delivery on orders over £25.') + '<div class="g-recaptcha"></div>'),
    );
    expect(row.status).toBe('same');
  });

  it('records a shop with no delivery page as "unreadable"', () => {
    const row = run({ kind: 'no-url' }, target({}, null));
    expect(row.status).toBe('unreadable');
    expect(row.reason).toContain('no delivery page recorded');
  });
});

describe('blockReason', () => {
  it('leaves an ordinary page alone', () => {
    expect(blockReason(200, page('Standard delivery £3.95'))).toBeNull();
  });
});

describe('verifiedAt staleness', () => {
  it(`flags a figure verified more than ${VERIFIED_STALE_DAYS} days ago, and not one verified exactly that long ago`, () => {
    const at = (verifiedAt: string) =>
      recheckShop(target({ verifiedAt }), { kind: 'robots-disallowed' }, read, TODAY);
    expect(ageInDays('2026-08-01', TODAY)).toBe(61);
    expect(at('2026-08-01').stale).toBe(true);
    expect(at('2026-08-02').stale).toBe(false);
    expect(at(TODAY).stale).toBe(false);
  });

  it('is a flag only — it never changes the status', () => {
    const row = recheckShop(
      target({ verifiedAt: '2026-01-01' }),
      ok(page('Standard delivery costs £3.95.', 'Free UK delivery on orders over £25.')),
      read,
      TODAY,
    );
    expect(row.stale).toBe(true);
    expect(row.status).toBe('same');
  });

  it('never flags an unparseable date', () => {
    expect(ageInDays('not a date', TODAY)).toBeNull();
  });
});

describe('targets', () => {
  const base = RETAILERS[0]!;
  const { source: _ignored, ...unsourced } = base.shipping;
  const shop = (id: string, enabled: boolean, shipping: Partial<Retailer['shipping']>): Retailer => ({
    ...base,
    id,
    name: id,
    enabled,
    shipping: { ...unsourced, ...shipping },
  });

  it('covers only enabled shops with listings', () => {
    const retailers = [shop('a', true, {}), shop('b', false, {}), shop('c', true, {})];
    const ids = recheckTargets(retailers, (id) => (id === 'c' ? 0 : 5)).map((t) => t.retailerId);
    expect(ids).toEqual(['a']);
  });

  it('never asks an owner-import shop (Notino UK) for its delivery page', () => {
    const notino = { ...shop('n', true, {}), adapter: 'owner-import' as const };
    expect(recheckTargets([notino, shop('a', true, {})], () => 5).map((t) => t.retailerId)).toEqual(['a']);
    expect(recheckTargets(RETAILERS, () => 5).map((t) => t.retailerId)).not.toContain('notino-uk');
  });

  it('reads the quoted source first, then the unquoted-page list, else nothing', () => {
    const source = { url: 'https://a.example/delivery', quote: 'q', readAt: TODAY };
    const pages = { a: 'https://a.example/other' };
    expect(recheckUrl(shop('a', true, { source }), pages)).toBe('https://a.example/delivery');
    expect(recheckUrl(shop('a', true, {}), pages)).toBe('https://a.example/other');
    expect(recheckUrl(shop('a', true, {}), {})).toBeNull();
  });

  it('lists an unquoted page only for a real shop that has no quoted source', () => {
    for (const id of Object.keys(UNQUOTED_DELIVERY_PAGES)) {
      const r = RETAILERS.find((x) => x.id === id);
      expect(r, `${id} is not a retailer id`).toBeDefined();
      expect(r!.shipping.source, `${id} now has shipping.source — drop it from UNQUOTED_DELIVERY_PAGES`).toBeUndefined();
    }
  });

  it('has a delivery page to read for every enabled shop with listings in the real registry', () => {
    const count = (id: string) => {
      const path = resolve(__dirname, '..', 'data/catalogue', `${id}.json`);
      if (!existsSync(path)) return 0;
      return (JSON.parse(readFileSync(path, 'utf8')) as { listings?: unknown[] }).listings?.length ?? 0;
    };
    const targets = recheckTargets(RETAILERS, count);
    expect(targets.length).toBeGreaterThan(0);
    // The rule: a shop with a recorded delivery figure has a page to compare it
    // with. A shop that has no figure yet (nothing read, confidence 'unverified',
    // e.g. one just added whose policy page robots.txt disallows) has nothing to
    // re-check, and the recheck reports it as unreadable rather than failing.
    const noPage = targets.filter((t) => t.url === null);
    const withFigure = noPage.filter(
      (t) =>
        t.recorded.standardGbp !== null ||
        t.recorded.freeOverGbp !== null ||
        t.recorded.standardRateNotPublished ||
        t.recorded.confidence === 'confirmed',
    );
    expect(withFigure.map((t) => t.retailerId)).toEqual([]);
    for (const t of targets.filter((t) => t.url !== null)) expect(new URL(t.url!).protocol).toBe('https:');
  });
});

describe('report, markdown and issue', () => {
  const changed = recheckShop(
    { ...target(), retailerId: 'pipe-shop', name: 'Pipe | Shop' },
    ok(page('Standard delivery costs £4.50.', 'Free UK delivery on orders over £25.')),
    read,
    TODAY,
  );
  const same = recheckShop(
    target(),
    ok(page('Standard delivery costs £3.95.', 'Free UK delivery on orders over £25.')),
    read,
    TODAY,
  );
  const blocked = recheckShop(target({ verifiedAt: '2026-07-01' }), ok('', 403), read, TODAY);

  it('counts every status and the stale flag', () => {
    const report = buildRecheckReport([changed, same, blocked], '2026-10-01T04:47:00.000Z');
    expect(report.month).toBe('2026-10');
    expect(report.summary).toEqual({ shops: 3, same: 1, changed: 1, blocked: 1, unreadable: 0, stale: 1 });
  });

  it('titles the issue by month', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(issueTitle({ month: '2026-10' })).toBe('Delivery prices changed: October 2026');
  });

  it('opens no issue when nothing changed', () => {
    expect(renderIssueBody(buildRecheckReport([same, blocked], '2026-10-01T04:47:00.000Z'))).toBeNull();
  });

  it('lists each difference with its source link and a month marker for de-duplication', () => {
    const body = renderIssueBody(buildRecheckReport([changed, same], '2026-10-01T04:47:00.000Z'))!;
    expect(body).toContain('<!-- delivery-recheck:2026-10 -->');
    expect(body).toContain(`(${URL_})`);
    expect(body).toContain('£4.50');
    expect(body).toContain('Pipe \\| Shop');
    expect(body).not.toContain('| Shop (`shop`)'); // the unchanged shop is not listed
  });

  it('renders a table row per shop, with the stale section', () => {
    const md = renderRecheckMarkdown(buildRecheckReport([changed, same, blocked], '2026-10-01T04:47:00.000Z'));
    expect(md).toContain('| Shop | Recorded | Found | Status | Note | Source |');
    expect(md).toContain('**changed**');
    expect(md).toContain('| blocked |');
    expect(md).toContain('£3.95, free over £25.00');
    expect(md).toMatch(/verifiedAt 2026-07-01 \(92 days\)/);
  });
});
